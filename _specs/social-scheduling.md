# Social Media Scheduling — MyDash spec

> Builds a per-publication, per-network social posting and scheduling
> system for X, Facebook, Instagram, and LinkedIn. Editorial-owned.
> Architecture is per-publication everywhere — never global.

## Honest constraints

### X API (verified April 2026)

X uses pay-per-use pricing as of Feb 6, 2026. There are no monthly tiers
available to new developers. Current rates (as of April 20, 2026):

- Post create (POST /2/tweets): **$0.015 per post**
- Post read: $0.005 per post
- Owned reads (own posts/followers/etc): $0.001 per resource
- User profile read: $0.01 per user
- Hard cap: 2M post reads/month before Enterprise required

**For a publishing-focused workload at 13 Stars Media's scale, this is
cheap.** 8 publications × 5 posts/day × 30 days = ~1,200 posts/month at
$18/month total. That's the all-in X cost for the org.

The architecture: one shared MyDash X developer app. Each publication's
X account OAuths into it. Tokens stored per-publication. App-level rate
limits apply globally; per-publication usage tracking surfaces in the UI.

**Spend cap**: set in X Developer Console at $100/month initially. A
runaway retry loop is the realistic risk, not legitimate volume.
Per-publication usage visibility lets us spot the runaway before it
hits the cap.

### Facebook + Instagram

No standalone Instagram API exists. Posting to Instagram requires:
- A Facebook Page (publication's existing page)
- Instagram Business or Creator account linked to that Page
- OAuth with `instagram_basic`, `instagram_content_publish`,
  `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`

**One Facebook OAuth per publication unlocks both Facebook Page posting
and Instagram posting** — but only when the IG-to-Page linkage is
already done in Meta Business Suite. The connection flow surfaces this:
"We found your Page. We did/didn't find a linked Instagram Business
account. Here's how to fix that if needed."

**Meta App Review** is required before non-developer Pages can
authorize. 1-3 weeks of waiting. While pending, only the developer
account's own Pages can connect — fine for testing, blocks rollout.

### LinkedIn

Personal-profile posting works with standard OAuth scopes day one
(`r_liteprofile`, `r_emailaddress`, `w_member_social`).

Page posting requires **Marketing Developer Platform (MDP)** approval.
2-6 weeks. Use case to submit: "Newspaper and magazine publishing group
manages multiple LinkedIn Pages for our publications and needs to
schedule posts on their behalf."

**Phase 1** ships personal-profile posting (works now). **Phase 2** adds
Page posting after MDP approval — same UI flow, just unlocks the
"post as Page" option.

## Database schema

Migration: `supabase/migrations/0XX_social_scheduling.sql`

```sql
CREATE TABLE social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pub_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('x', 'facebook', 'linkedin')),
  account_label TEXT NOT NULL,           -- @malibutimes, "Malibu Times Page", "Andrew Mattson"
  external_id TEXT NOT NULL,             -- provider's user/page id
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry TIMESTAMPTZ,              -- null = never expires (FB Page Access Token)
  scopes TEXT[] NOT NULL DEFAULT '{}',
  instagram_account_id TEXT,             -- only set when provider='facebook'
  instagram_account_label TEXT,
  linkedin_can_post_as_page BOOLEAN DEFAULT FALSE,  -- true after MDP approval
  status TEXT NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'expired', 'revoked', 'pending_setup')),
  connected_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pub_id, provider)
);

CREATE TABLE social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pub_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id),
  body_text TEXT NOT NULL DEFAULT '',
  media JSONB NOT NULL DEFAULT '[]',     -- [{ url, type, alt_text, width, height }]
  targets JSONB NOT NULL DEFAULT '[]',   -- [{ destination, enabled }]
  scheduled_for TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed', 'partial')),
  story_id UUID REFERENCES stories(id),  -- optional link to source story
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE TABLE social_post_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  destination TEXT NOT NULL CHECK (destination IN ('x', 'facebook', 'instagram', 'linkedin')),
  external_post_id TEXT,
  external_url TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'success', 'failed', 'skipped')),
  error_message TEXT,
  posted_at TIMESTAMPTZ
);

CREATE TABLE provider_usage (
  provider TEXT NOT NULL,
  pub_id TEXT REFERENCES publications(id) ON DELETE CASCADE,
  period TEXT NOT NULL,                   -- 'YYYY-MM'
  writes_count INTEGER NOT NULL DEFAULT 0,
  reads_count INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (provider, pub_id, period)
);

CREATE INDEX social_accounts_pub_idx ON social_accounts(pub_id);
CREATE INDEX social_posts_pub_status_idx ON social_posts(pub_id, status);
CREATE INDEX social_posts_scheduled_idx ON social_posts(status, scheduled_for)
  WHERE status = 'scheduled';
CREATE INDEX social_post_results_post_idx ON social_post_results(post_id);

-- RLS — token columns NEVER readable by client; Edge Functions use service role
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_usage ENABLE ROW LEVEL SECURITY;

-- Client-facing policies follow the publication-access pattern from existing RLS.
-- Tokens accessed only via service role from Edge Functions.
```

## Edge Functions

All four follow the `gmail-auth` pattern: single function, `start` /
`callback` / `status` / `disconnect` actions, popup window flow with
postMessage + localStorage fallback.

### `social-x-auth`
- `start`: OAuth 2.0 PKCE flow. Scopes: `tweet.read`, `tweet.write`, `users.read`, `offline.access`. State carries `{ userId, pubId }`.
- `callback`: exchanges code for tokens, fetches `/2/users/me`, upserts `social_accounts` keyed by `(pub_id, 'x')`. Stores access_token (2hr) + refresh_token.
- `status`, `disconnect`: standard.

### `social-facebook-auth`
- `start`: Facebook Login URL with FB + IG scopes. State carries `{ userId, pubId }`.
- `callback`:
  1. Exchange code for short-lived user token
  2. Exchange for long-lived (60-day) user token
  3. Fetch user's Pages via `/me/accounts`
  4. **If multiple Pages, render a picker** in the callback HTML. User clicks the Page that belongs to *this publication*.
  5. Save the Page Access Token (long-lived, never expires barring revocation), NOT the user token
  6. Call `/{page-id}?fields=instagram_business_account` to discover linked IG
  7. If IG present: fetch IG handle via `/{ig-id}?fields=username`, store both
- `status`: returns `{ connected, pageName, instagramAvailable, instagramHandle }`

### `social-linkedin-auth`
- `start`: scopes vary by phase
  - Phase 1: `r_liteprofile`, `r_emailaddress`, `w_member_social`
  - Phase 2 (after MDP): adds `r_organization_social`, `w_organization_social`, `rw_organization_admin`
- `callback`: fetches profile, fetches Pages user administers via `/organizationAcls`. If MDP-approved + Pages exist, render picker. Otherwise save personal profile id, set `linkedin_can_post_as_page = false`, mark account_label as user's name.

### `social-publish` (the worker)

Triggered two ways:
1. **Immediate**: composer calls it with a post id when "Post Now" is clicked
2. **Scheduled**: cron job runs every minute, queries
   `social_posts WHERE status='scheduled' AND scheduled_for <= now()`,
   processes each

Per-post flow:
1. Update `social_posts.status = 'publishing'`
2. For each enabled destination, call the relevant network's API:
   - **X**: `POST /2/tweets` with text + media_ids (uploaded separately via `POST /2/media/upload`)
   - **Facebook**: `POST /{page-id}/feed` (text-only) or `/{page-id}/photos` (single image) or `/{page-id}/videos` (video)
   - **Instagram**: two-step container flow
     - `POST /{ig-id}/media` to create container
     - Wait for container status to be `FINISHED` (poll, max 30s)
     - `POST /{ig-id}/media_publish` to publish
   - **LinkedIn**:
     - Personal: `POST /v2/ugcPosts` as the user
     - Organization (phase 2): `POST /v2/posts` as the org
3. Insert `social_post_results` row per destination
4. Aggregate parent status: `published` (all success), `partial` (mixed), `failed` (all fail)
5. Increment `provider_usage` for the period (writes_count + estimated_cost_usd)

**Token refresh**: on 401 from any network, attempt refresh once. If refresh succeeds, retry. If refresh fails, mark account `expired`, mark that destination's result `failed` with clear error, continue with other destinations.

**Concurrency**: posts for different publications process in parallel. Destinations within a single post run sequentially (200ms delay between, to stay polite to rate limits and isolate failures).

**X spend cap enforcement**: before each X publish, check `provider_usage` for the current month. If `estimated_cost_usd >= X_MONTHLY_BUDGET_USD` (env var, default $100), skip with status `failed`, error_message "Monthly X budget reached — see Integrations → Social". This prevents runaway retry loops from generating real bills.

## UI surfaces

Three placements, following existing patterns.

### 1. Per-publication Social Accounts — inside Publications rate modal

Already-established location. Add a new section after "Default Sections":

```jsx
{/* Social Accounts — only visible for publications with hasWebsite=true
    OR an explicit social_enabled flag. Skip for sun-setting/dormant pubs. */}
{(sel.hasWebsite || sel.socialEnabled) && !sel.dormant && (
  <SocialAccountsSection pubId={sel.id} />
)}
```

Renders four cards (X / Facebook / Instagram / LinkedIn) using `GlassCard` + `StatusDot`. Connect/Disconnect buttons follow the `connectGoogle()` / `disconnectGoogle()` pattern from `IntegrationsPage.jsx`. The Instagram card is a derived view of the Facebook row.

### 2. Org-wide Social tab — IntegrationsPage

New tab between "Google Workspace" and "StellarPress". Shows:

- **Publication × Network matrix**: rows = publications (active only), columns = X / FB / IG / LinkedIn, cells = StatusDot. Click any cell → opens that publication's modal at the social section.
- **X usage panel**: month-to-date posts, estimated spend, per-publication breakdown bar, budget remaining
- **Tokens needing reconnection**: list of accounts in `expired` status with one-click reconnect

### 3. Composer — Editorial submodule

Add to Editorial section in sidebar nav. New page route `social-composer` rendered from `src/pages/SocialComposer.jsx`. Three tabs:

**Compose tab**:
- Publication picker (defaults to user's primary; admin can pick any)
- Destination toggles (greyed if unconnected, with "Connect →" link to that publication's modal)
- Body textarea with live char counter — shows the strictest active-target limit (X = 280, IG caption = 2200, FB = 63206, LinkedIn = 3000) plus a warning when over X's limit
- Media upload via existing Bunny pattern; per-image alt text fields (alt text required for Instagram)
- Schedule control: "Post now" radio | "Schedule for [date] [time]" with publication's local timezone
- Live preview pane: shows what the post will look like on each active destination
- "Save Draft" / "Schedule" / "Post Now" buttons

**Queue tab**: table of `status='scheduled'` posts. Inline edit allowed until `publishing`. Cancel button reverts to draft.

**History tab**: table of `status IN ('published', 'partial', 'failed')`. Per-row expansion shows the four destination results with deep-links to live posts. Failed destinations have "Retry" button.

**Permissions** (new role flags):
- `social_compose`: any team member with this can draft + schedule (default: Editorial, Sales, Admin)
- `social_publish_immediate`: subset who can use "Post Now" (default: Editorial managers + Admin)
- `social_connect_account`: connect/disconnect publication accounts (default: Admin only)

Enforced both client-side (button visibility) and server-side (RLS).

## Composer ↔ StoryEditor integration

Editorial-owned means stories often turn into social posts. Add to StoryEditor: a "Compose Social Post" button in the toolbar that opens the SocialComposer with the story's headline + first paragraph pre-filled and the story id linked (`social_posts.story_id`). This isn't required for v1 but is a 30-minute add that makes the feature feel native to Editorial workflow. Recommended: include.

## Build order — continuous build, one production gate

Andrew chose continuous build. The platform-approval gates are real, so the actual sequence is:

### Day 0 (start in parallel with code work)
1. Apply for Meta App Review (1-3 weeks)
2. Apply for LinkedIn MDP (2-6 weeks)
3. Create one MyDash X dev app, generate OAuth credentials, set spend cap to $100/month
4. Confirm each publication's IG account is Business + linked to its Page (5 min per pub, owner does in Meta Business Suite)
5. Store provider client IDs/secrets in Supabase Edge Function secrets

### Milestone 1 — X end-to-end (~5-7 days code)
1. Migration with all four tables
2. `social-x-auth` Edge Function (full lifecycle)
3. SocialAccountsSection component (X card only)
4. `social-publish` Edge Function (X path only, immediate posting only)
5. SocialComposer page with Compose tab (X destination only, no scheduling)
6. Add Social link to sidebar Editorial group
7. provider_usage tracking + IntegrationsPage Social tab (matrix + usage panel)

**STOP. Deploy Milestone 1 to production. Connect one publication's X account. Send 5-10 real posts. Eyeball them. Iterate on the composer/preview/error UX based on real use.**

This is the only mandatory stop point. It exists because real-world feedback from one network is cheaper to incorporate now than to fix in three.

### Milestone 2 — Facebook + Instagram + scheduling (~2-3 weeks code, gated by Meta App Review)
1. `social-facebook-auth` Edge Function with Page picker + IG discovery
2. Facebook + Instagram cards in SocialAccountsSection
3. Extend `social-publish` with FB and IG paths
4. Add scheduled_for to composer, build cron job (Supabase pg_cron or Edge scheduled invocation)
5. Composer Queue tab
6. Lock destination toggles for IG when no IG linkage discovered (with fix-it link)

Code-complete state lives on `feature/social-scheduling-m2` until Meta App Review approves the production scopes. Then merge.

### Milestone 3 — LinkedIn (phase 1) + History + matrix polish (~1-2 weeks code, gated by MDP for phase 2)
1. `social-linkedin-auth` Edge Function (phase 1 scopes only)
2. LinkedIn card in SocialAccountsSection with MDP-pending notice
3. Extend `social-publish` with LinkedIn personal-profile path
4. Composer History tab
5. Polish matrix, usage panel, expired-token reconnect flow

When MDP approves: a small follow-up turns on phase 2 scopes in `social-linkedin-auth`, adds the page picker to the callback HTML, and switches the publish path to `/v2/posts` for org-owned posts. No new UI; the existing card just unlocks Page posting. Estimated 1-2 days of work after approval lands.

## Things to do right now (Andrew, parallel to code)

1. Create MyDash X dev app at developer.x.com. New developers go straight to pay-per-use; no Basic/Pro signup available. Set spend cap at $100/month. Generate Client ID + Secret. Add to Supabase Edge Function secrets as `X_CLIENT_ID` and `X_CLIENT_SECRET`. Set OAuth callback to `{SUPABASE_URL}/functions/v1/social-x-auth?action=callback`.

2. Create or confirm Meta Developer account for 13 Stars Media. Create app, add "Facebook Login" + "Instagram Graph API" products. Submit for App Review with the scopes listed above. Use case: "Internal tool for our newspaper/magazine publishing group to schedule posts to our own publications' Facebook Pages and Instagram Business accounts." Add `META_APP_ID`, `META_APP_SECRET` to Edge secrets.

3. Apply for LinkedIn MDP at developer.linkedin.com. Approval is 2-6 weeks. Add `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` to Edge secrets when LinkedIn app is created.

4. For each active publication, owner confirms: Instagram account is Business or Creator type, linked to the right Facebook Page. Verified in Meta Business Suite → Instagram accounts.

5. Decide whether the existing Wednesday Agent Station's social post drafts should auto-flow into the composer queue. (Recommended: yes, but as a v1.1 follow-up — not v1.)

## Out of scope for v1

- Analytics (impressions, clicks, engagement) — fetch from each network's insights API later
- Comment/reply management — read-only history; respond in native apps
- Instagram carousels, Stories, Reels — feed posts only
- LinkedIn document/article posts — text + media UGC only
- Threads, Bluesky, TikTok, YouTube, Pinterest — separate Edge Functions, defer
- AI-generated copy *in the composer* — Wednesday Agent drafts already exist, treat as input
- Per-network text variants — single body, X char limit warning when X is active
- Approval workflows — author owns draft until scheduled; add later if Editorial asks

## Risks + mitigations

- **X surprise bills**: spend cap in X console + per-publication usage tracking + 80% budget alert
- **FB Page Access Token revocation**: detect 401, mark expired, surface in IntegrationsPage health panel + email connected user
- **IG setup confusion**: clear "linked / not linked" status with fix-it link; never silently drop IG targets
- **Meta App Review rejection**: rare for genuine first-party publishing tools; if rejected, refile with clarification
- **MDP rejection**: phase 1 ships regardless; if rejected, LinkedIn is personal-profile-only and we document
- **Rate limits**: 200ms delay between destination calls; exponential backoff on 429; deferred queue for retry
- **Cron worker missed runs**: idempotency on `social_post_results` (unique on `(post_id, destination)`) so reprocessing a stuck post doesn't double-send
- **Token leakage**: token columns excluded from RLS read policies; Edge Functions use service role; client never sees them