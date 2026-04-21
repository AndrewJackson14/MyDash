# Wednesday Agent Station — Five Gemini Agents

**Audience:** Andrew Jackson and Claude Code, building the agent infrastructure for 13 Stars Media.

**Scope:** Five Gemini-powered agents that compound MyDash's value by removing low-judgment work, surfacing patterns the team can't see in real time, and giving the editorial and sales teams quiet AI assistance where it earns its place.

**Agents specified:**

1. Press Release Processor
2. SEO Generator
3. Sales Proposal Drafter
4. Nightly Signal Runner
5. Editorial Assistant

**Foundation already in place:** MyHelper agent at `agent-station/myhelper/` running gemini-2.5-flash + Ollama embeddings, polling `team_notes` and logging to `bot_query_log`. Migration 074 is live. The pattern is proven.

---

## Part 1 — Universal Agent Infrastructure

Every agent in this spec follows the same architectural pattern. Get this right once and each subsequent agent is essentially a fill-in-the-blanks exercise.

### Folder layout

Each agent gets its own folder under `agent-station/` parallel to `myhelper/`:

```
agent-station/
├── myhelper/                       (existing)
│   ├── bot.py
│   ├── README.md
│   ├── station.wednesday.myhelper.plist
│   └── .env
├── press-processor/                (new)
│   ├── bot.py
│   ├── README.md
│   ├── station.wednesday.press.plist
│   └── .env
├── seo-generator/                  (new — special, see note below)
│   └── (Edge Function, not a station agent)
├── proposal-drafter/               (new — special, see note below)
│   └── (Edge Function, not a station agent)
├── signal-runner/                  (new)
│   ├── bot.py
│   ├── README.md
│   ├── station.wednesday.signal.plist
│   └── .env
├── editorial-assistant/            (new — special, see note below)
│   └── (Edge Function + corpus-builder station agent)
└── shared/                         (new)
    ├── gemini.py                   (single Gemini client)
    ├── supabase_client.py          (single Supabase client factory)
    └── README.md
```

**On the "special" agents (SEO, Proposal, Editorial):** these are user-triggered (webhook or button click), not poll-driven. They live as **Supabase Edge Functions** rather than long-running station processes. The agent station only runs polling agents (MyHelper, Press Processor, Signal Runner). Edge Functions are simpler operationally — no LaunchAgent, no machine to babysit, scales to zero, and Supabase already manages secrets and deployment.

The Editorial Assistant has one station-side component: a corpus builder that maintains embeddings of the published story corpus for "Suggest related stories." That runs on the agent station; the toolbar buttons themselves call Edge Functions.

### The shared module

`agent-station/shared/gemini.py` — single source of truth for Gemini calls:

```python
"""Shared Gemini client used by every agent station bot."""
import os
import re
import requests

GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
DEFAULT_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
PRO_MODEL = "gemini-2.5-pro"  # for tasks that need deeper reasoning

def gemini_call(
    *,
    system_prompt: str,
    user_prompt: str,
    model: str = DEFAULT_MODEL,
    temperature: float = 0.2,
    response_format: str = "text",  # "text" or "json"
    max_output_tokens: int = 2048,
    timeout: int = 60,
) -> str:
    """Single Gemini call. Returns response text. Raises on failure."""
    config = {
        "temperature": temperature,
        "maxOutputTokens": max_output_tokens,
    }
    if response_format == "json":
        config["responseMimeType"] = "application/json"

    r = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        params={"key": GEMINI_API_KEY},
        json={
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": config,
        },
        timeout=timeout,
    )
    r.raise_for_status()
    return r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
```

`agent-station/shared/supabase_client.py`:

```python
"""Shared Supabase client. Each agent imports `sb` and uses it directly."""
import os
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
```

Each agent's `bot.py` imports from `shared/`:

```python
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "shared"))
from gemini import gemini_call
from supabase_client import sb
```

This is the only place Gemini API call structure lives. If Google changes the endpoint or we want to swap models, one file changes.

### Output substrate

Per the locked decisions: **`team_notes` for human-visible outputs, plus a per-agent log table** for telemetry.

`team_notes` already has `from_user`, `to_user`, `message`, `context_type`, `context_page`, `is_read` from migration 074. Each agent uses a unique `context_type` value:

- MyHelper: `bot_query`, `bot_reply`, `bot_escalation` (existing)
- Press Processor: `press_release_processed` (new — informational note to Camille)
- SEO Generator: `seo_generated` (new — toast trigger for editor)
- Proposal Drafter: `proposal_drafted` (new — informational note to rep)
- Signal Runner: `briefing_ready` (new — informational note to Hayley)
- Editorial Assistant: no `team_notes` (purely in-editor, no logging)

Per-agent log tables follow the `bot_query_log` pattern. Each is defined in the agent's spec below.

### Bot identity in `team_members`

Each agent that writes to `team_notes` needs its own `team_members` row with `role = 'Bot'`, `is_hidden = true`, and `permissions = ['bot']`. They get visible avatars (emoji prefix in the name) so messages from them are recognizable in the Messages page.

Bot identities to seed:

```sql
-- Press Release Processor
insert into team_members (id, name, role, email, phone, is_active, is_hidden, permissions, module_permissions)
values (gen_random_uuid(), '📰 Press Processor', 'Bot', 'press-bot@mydash.local', '', true, true, array['bot']::text[], array['stories']::text[])
returning id;

-- SEO Generator
insert into team_members (id, name, role, email, phone, is_active, is_hidden, permissions, module_permissions)
values (gen_random_uuid(), '🔍 SEO Generator', 'Bot', 'seo-bot@mydash.local', '', true, true, array['bot']::text[], array['stories']::text[])
returning id;

-- Sales Proposal Drafter
insert into team_members (id, name, role, email, phone, is_active, is_hidden, permissions, module_permissions)
values (gen_random_uuid(), '💼 Proposal Drafter', 'Bot', 'proposal-bot@mydash.local', '', true, true, array['bot']::text[], array['sales']::text[])
returning id;

-- Nightly Signal Runner
insert into team_members (id, name, role, email, phone, is_active, is_hidden, permissions, module_permissions)
values (gen_random_uuid(), '📊 Signal Runner', 'Bot', 'signal-bot@mydash.local', '', true, true, array['bot']::text[], array['analytics']::text[])
returning id;
```

Each returned UUID becomes the bot's `*_BOT_ID` in its `.env`.

### LaunchAgent plist template

Polling agents (Press Processor, Signal Runner) need a LaunchAgent plist, modeled on MyHelper's:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>station.wednesday.{agent}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/nicholasmattson/agent-station/{agent}/venv/bin/python</string>
    <string>/Users/nicholasmattson/agent-station/{agent}/bot.py</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/Users/nicholasmattson/agent-station/{agent}/stdout.log</string>
  <key>StandardErrorPath</key><string>/Users/nicholasmattson/agent-station/{agent}/stderr.log</string>
  <key>WorkingDirectory</key><string>/Users/nicholasmattson/agent-station/{agent}</string>
</dict>
</plist>
```

Loaded with `launchctl load ~/Library/LaunchAgents/station.wednesday.{agent}.plist`.

### Single shared `.env`

Each agent has its own `.env`, but they all share the same `GEMINI_API_KEY` and `SUPABASE_*` values. Standard fields per agent's `.env`:

```
SUPABASE_URL=https://hqywacyhpllapdwccmaw.supabase.co
SUPABASE_SERVICE_KEY=<service role key>
GEMINI_API_KEY=<single shared Gemini key>
GEMINI_MODEL=gemini-2.5-flash
{AGENT}_BOT_ID=<UUID from team_members seed>
```

Plus agent-specific values defined in each spec below.

---

## Part 2 — Migration 075: Agent Foundation

Single migration for everything in this spec set. Apply once before any agent goes live.

```sql
-- ============================================================
-- Migration 075: Wednesday Agent Station foundation
-- Adds tables, columns, and webhook triggers for the five
-- new Gemini-powered agents specified in agent-station-spec.md
-- ============================================================

-- ─── Press Release Processor ────────────────────────────
create table if not exists press_release_log (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('email', 'drive')),
  source_id text,                         -- gmail message id or drive file id
  source_subject text,
  source_sender text,
  raw_body text,
  raw_attachments_text text,              -- extracted text from PDFs/docx
  triaged_action text not null check (triaged_action in
    ('drafted', 'logged_low_score', 'rejected_duplicate', 'rejected_out_of_geo', 'rejected_spam')),
  newsworthiness int check (newsworthiness between 1 and 5),
  publication_assigned uuid references publications(id),
  story_id uuid references stories(id),   -- non-null when triaged_action='drafted' or 'logged_low_score'
  rationale text,
  processed_at timestamptz default now(),
  gemini_model text,
  processing_seconds numeric
);

create index if not exists idx_press_release_log_processed_at on press_release_log(processed_at desc);
create index if not exists idx_press_release_log_action on press_release_log(triaged_action);

alter table stories add column if not exists source_type text;
alter table stories add column if not exists source_external_id text;
alter table stories add column if not exists body_original text;
-- source_type values: 'manual' (default null), 'press_release', 'agent_draft'

-- ─── SEO Generator ──────────────────────────────────────
alter table stories add column if not exists meta_description text;
alter table stories add column if not exists og_alt_text text;
alter table stories add column if not exists social_facebook text;
alter table stories add column if not exists social_linkedin text;
alter table stories add column if not exists seo_keywords text[];
alter table stories add column if not exists summary_2_sentence text;
alter table stories add column if not exists seo_generated_at timestamptz;
-- slug already exists; SEO Generator only fills if currently null

create table if not exists seo_generation_log (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories(id) on delete cascade,
  trigger_event text not null,            -- 'web_status_published'
  fields_generated text[],
  fields_skipped text[],                  -- fields editor had already filled
  gemini_model text,
  processing_seconds numeric,
  error text,
  created_at timestamptz default now()
);

create index if not exists idx_seo_generation_log_story on seo_generation_log(story_id);

-- Database webhook trigger fires when web_status flips to 'published'.
-- Webhook is configured in the Supabase dashboard pointing to the
-- seo-generator Edge Function. This migration only ensures the
-- updated_at column exists for the trigger to use.
alter table stories add column if not exists web_published_at timestamptz;

-- ─── Sales Proposal Drafter ─────────────────────────────
alter table sales add column if not exists ai_drafted_proposal_text text;
alter table sales add column if not exists ai_drafted_at timestamptz;
alter table sales add column if not exists ai_recommended_products jsonb;
-- jsonb shape: [{product_id, ad_size, publication_id, qty, rationale}]

create table if not exists proposal_drafting_log (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  inquiry_id uuid references ad_inquiries(id),
  rep_id uuid references team_members(id),
  similar_sales_used uuid[],
  rep_voice_corpus_size int,              -- how many of rep's prior proposals were used
  voice_fallback boolean default false,   -- true if rep had <3 prior proposals, used house voice
  gemini_model text,
  processing_seconds numeric,
  error text,
  created_at timestamptz default now()
);

create index if not exists idx_proposal_drafting_log_sale on proposal_drafting_log(sale_id);

-- ─── Nightly Signal Runner ──────────────────────────────
create table if not exists daily_briefings (
  id uuid primary key default gen_random_uuid(),
  briefing_type text not null check (briefing_type in ('daily', 'weekly')),
  briefing_date date not null,
  recipient_user_id uuid references team_members(id),
  subject text,
  body_markdown text not null,
  body_html text,                         -- rendered for email
  emailed_at timestamptz,
  email_message_id text,
  source_data_snapshot jsonb,             -- raw signal data the briefing was built from
  gemini_model text,
  processing_seconds numeric,
  error text,
  created_at timestamptz default now()
);

create unique index if not exists idx_daily_briefings_unique
  on daily_briefings(briefing_type, briefing_date, recipient_user_id);
create index if not exists idx_daily_briefings_recipient_date
  on daily_briefings(recipient_user_id, briefing_date desc);

-- ─── Editorial Assistant ────────────────────────────────
-- No log table per locked decision. Story embeddings table for
-- "Suggest related stories" only:

create table if not exists story_embeddings (
  story_id uuid primary key references stories(id) on delete cascade,
  vec real[] not null,                    -- 768-dim from nomic-embed-text
  embedded_text_hash text not null,       -- so we know when to re-embed
  embedded_at timestamptz default now()
);

create index if not exists idx_story_embeddings_embedded_at on story_embeddings(embedded_at desc);

-- ─── RLS ────────────────────────────────────────────────
-- All new tables get RLS on with service_role bypass.
alter table press_release_log enable row level security;
alter table seo_generation_log enable row level security;
alter table proposal_drafting_log enable row level security;
alter table daily_briefings enable row level security;
alter table story_embeddings enable row level security;

-- Authenticated users can read briefings addressed to them
create policy "users read own briefings" on daily_briefings
  for select using (auth.uid() in (
    select auth_id from team_members where id = recipient_user_id
  ));

-- Authenticated users can read SEO log for stories they can access
create policy "users read seo log" on seo_generation_log
  for select using (true);  -- stories table has its own RLS

-- Press log readable by anyone with editorial permission
create policy "editors read press log" on press_release_log
  for select using (auth.uid() in (
    select auth_id from team_members
    where 'editorial' = any(module_permissions) or role in ('Editor-in-Chief', 'Content Editor')
  ));

-- Proposal log readable by reps for their own sales
create policy "reps read own proposal log" on proposal_drafting_log
  for select using (auth.uid() in (
    select auth_id from team_members where id = rep_id
  ));
```

---

## Part 3 — Agent Specifications

### Agent 1: Press Release Processor

#### Purpose

Eliminate the daily bottleneck where press releases pile up in inboxes and Drive folders waiting for an editor to triage, classify, rewrite, and queue them. The agent does all four automatically and drops the result into the editorial queue as a draft story scored for newsworthiness.

#### Trigger

Polling agent. Runs on agent station. Polls every 60 seconds.

#### Inputs

Two channels, both processed by the same pipeline:

1. **Forward-to email address.** Staff forward press releases to `press-intake@13stars.media`. Agent uses Gmail API with OAuth (one-time setup) to read unread mail in that inbox. After processing, agent marks the message read and applies a `processed` Gmail label.

2. **Shared Google Drive folder.** A dedicated folder ("13 Stars Press Releases — Intake"). Staff drop PDFs, docx files, or pasted text. Agent uses Google Drive API to list files modified since the last poll, downloads them, extracts text using `pdfplumber` for PDFs and `python-docx` for docx files, processes the same way as email.

After processing, the file is moved to a sibling "Processed" subfolder so the intake folder stays clean and untouched files are obvious.

#### The Gemini call

Single call, JSON-mode response, gemini-2.5-flash. The prompt sends the full release text plus the canonical publication routing table:

```
You are processing a press release for 13 Stars Media Group, a regional
news company on California's Central Coast and in Malibu.

GEOGRAPHY → PUBLICATION ROUTING (canonical):
  Paso Robles, north SLO County → Paso Robles Press (PRP)
  Atascadero, Templeton → Atascadero News (AN)
  Malibu → Malibu Times (MT)
  Morro Bay, Los Osos, Cayucos → Morro Bay Life (MBL)
  Solvang, Buellton, Los Olivos, Santa Ynez → Santa Ynez Valley Star (SYV)
  Long-form feature on Paso/Atascadero → PRP Magazine (PRM) or AN Magazine (ANM)

If a release covers multiple publication geographies, pick the strongest
signal and note in `cross_pub_suggestion` which other publications might
also want it.

If the geography is OUTSIDE these regions, classify as out_of_geo.

Return ONLY this JSON shape:
{
  "is_press_release": true | false,
  "is_spam": true | false,
  "is_duplicate_likely": true | false,
  "newsworthiness": 1 | 2 | 3 | 4 | 5,
  "newsworthiness_rationale": "one sentence",
  "publication_id_suggested": "PRP" | "AN" | "MT" | "MBL" | "SYV" | "PRM" | "ANM" | "out_of_geo",
  "category": "news" | "business" | "government" | "schools" | "sports" | "arts" | "obituary" | "events" | "other",
  "headline_options": ["headline 1", "headline 2", "headline 3"],
  "rewritten_body": "Full house-voice rewrite, lede first, AP style, attributions preserved.",
  "cross_pub_suggestion": "PRP, AN" | null
}

NEWSWORTHINESS RUBRIC:
  5 — Hard news, public interest, multi-source impact (council vote,
      major business move, school district news, accident, crime)
  4 — Notable local story, single subject, clear community relevance
      (new business opening, award, local figure feature)
  3 — Routine but reportable (event announcement, minor business update,
      community calendar item with substance)
  2 — Borderline; worth logging but not surfacing as a draft
  1 — Promotional fluff, copy-paste from a national source, no local angle

REWRITE RULES:
  - Lede paragraph names the WHO, WHAT, WHEN, WHERE
  - Attribution preserved verbatim from source quotes
  - AP style for dates, numbers, titles
  - 13 Stars house voice: direct, neutral, community-focused
  - No marketing language ("excited to announce", "thrilled to offer")
  - 250-450 words for newsworthiness 4-5; 150-250 words for 3
  - Headline options are 5-9 words each, neutral, scannable
```

#### Routing logic

After Gemini returns:

```
if is_spam or not is_press_release:
    → action = 'rejected_spam', log only, mark source as processed, no story created
if is_duplicate_likely:
    → check stories table for matching headline within last 14 days
    → if match found: action = 'rejected_duplicate', log, no story created
if publication_id_suggested == 'out_of_geo':
    → action = 'rejected_out_of_geo', log, no story created
if newsworthiness >= 3:
    → create stories row with status='Draft', source_type='press_release',
      body=rewritten_body, body_original=raw text, title=headline_options[0],
      publication=resolved_pub_id, category, author='Press Release (auto)'
    → action = 'drafted'
    → write team_note to all Content Editor + EIC role holders:
      "📰 New press release drafted: {title} ({pub_name}, score {n})"
if newsworthiness < 3:
    → create stories row with status='Draft' AND a low_priority flag
      (or a 'Low Priority' editorial queue tag)
    → action = 'logged_low_score'
    → no team_note (silent)
```

#### Files to create

```
agent-station/press-processor/
├── bot.py                          # main loop, poll, process, write
├── README.md                       # setup, OAuth, Drive folder ID config
├── station.wednesday.press.plist
├── .env.example
├── requirements.txt                # supabase, requests, google-api-python-client,
│                                   # google-auth, google-auth-oauthlib, pdfplumber,
│                                   # python-docx, python-dotenv, numpy
├── gmail_client.py                 # Gmail API wrapper
├── drive_client.py                 # Drive API wrapper
└── extractors.py                   # PDF and DOCX text extraction
```

#### .env values (agent-specific)

```
PRESS_BOT_ID=<uuid from team_members seed>
GMAIL_INTAKE_ADDRESS=press-intake@13stars.media
GMAIL_OAUTH_CREDENTIALS_PATH=/Users/nicholasmattson/agent-station/press-processor/credentials.json
GMAIL_OAUTH_TOKEN_PATH=/Users/nicholasmattson/agent-station/press-processor/token.json
DRIVE_INTAKE_FOLDER_ID=<google drive folder id>
DRIVE_PROCESSED_FOLDER_ID=<google drive subfolder id>
POLL_INTERVAL=60
```

#### Build cost

~6 hours. Bulk of the time is OAuth setup for Gmail and Drive APIs and the PDF/docx extractors. Gemini call itself is straightforward.

#### Acceptance criteria

- A press release forwarded to the intake address appears as a Draft story in MyDash within 90 seconds
- A PDF dropped in the intake Drive folder appears as a Draft story within 2 minutes (longer because Drive polling is less aggressive)
- Newsworthiness 1-2 items are logged but don't generate team_notes
- Newsworthiness 3-5 items generate one team_note per Content Editor / EIC
- Out-of-geography items are logged and skipped without creating a story
- Duplicate detection prevents the same release coming through email AND Drive from creating two stories
- `press_release_log` has a row for every processed item, success or skip, including the rationale

---

### Agent 2: SEO Generator

#### Purpose

Eliminate the manual work of writing meta descriptions, social copy, and search-optimization fields for every story published to StellarPress. The fields populate automatically within seconds of publish; the editor reviews and overrides only when needed.

#### Trigger

**Supabase database webhook** on `stories.web_status` transition to `'published'`. Configured in Supabase dashboard, points to the `seo-generator` Edge Function. Webhook payload contains the `record` (the new story row) and the `old_record`.

#### Architecture

This is a Supabase Edge Function, **not** a station agent. Lives at `supabase/functions/seo-generator/index.ts`. Reasons: webhook-triggered, scales to zero, no machine to babysit, Supabase manages secrets (`GEMINI_API_KEY` stored as Edge Function secret).

#### The Gemini call

Single call, JSON-mode response, gemini-2.5-flash. Input is the published article body, headline, and category. Prompt:

```
You are generating SEO and social-share fields for a published news article.
The article is from {publication_name} ({publication_short_code}).

Article headline: {title}
Article category: {category}
Article body (first 2000 words): {body}

Return ONLY this JSON shape:
{
  "meta_description": "155 chars max, summarizes the story for search results without clickbait",
  "og_alt_text": "Descriptive alt text for the social share image, ~120 chars",
  "slug": "url-safe-slug-from-headline-max-60-chars",
  "social_facebook": "Engagement-tuned 1-2 sentence post for Facebook, may include 1 emoji if natural, ends with a clear hook",
  "social_linkedin": "Professional register, 2-3 sentences, no emoji, named subject in the lede",
  "seo_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "summary_2_sentence": "A 2-sentence summary used for category page previews and RSS"
}

RULES:
  - meta_description ≤ 155 characters, no truncation, end on a complete word
  - slug all lowercase, hyphens only, no stop words at start, no trailing -
  - social_facebook may use ONE emoji at start if it fits naturally; otherwise no emoji
  - social_linkedin never uses emoji
  - seo_keywords are concrete nouns and proper nouns from the article, not generic terms
  - summary_2_sentence under 280 characters total
```

#### Behavior

```typescript
// Pseudocode
async function handleWebhook(payload) {
  const { record: newRow, old_record: oldRow } = payload;

  // Only fire on web_status transition to 'published'
  if (newRow.web_status !== 'published') return;
  if (oldRow?.web_status === 'published') return;  // already published

  // Skip fields editor has already filled — never overwrite
  const fieldsToGenerate = [];
  const fieldsSkipped = [];
  for (const field of ['meta_description', 'og_alt_text', 'slug',
                       'social_facebook', 'social_linkedin',
                       'seo_keywords', 'summary_2_sentence']) {
    if (newRow[field] && newRow[field].length > 0) {
      fieldsSkipped.push(field);
    } else {
      fieldsToGenerate.push(field);
    }
  }

  if (fieldsToGenerate.length === 0) {
    log({ story_id, fields_generated: [], fields_skipped, error: null });
    return;
  }

  const result = await callGemini(newRow);

  // Build update object with only the fields we needed
  const update = {};
  for (const field of fieldsToGenerate) {
    update[field] = result[field];
  }
  update.seo_generated_at = new Date().toISOString();

  await supabase.from('stories').update(update).eq('id', newRow.id);

  // Toast trigger via team_notes
  await supabase.from('team_notes').insert({
    from_user: SEO_BOT_ID,
    to_user: newRow.last_edited_by || newRow.assigned_to,
    message: `SEO fields generated for "${newRow.title}". Click to review.`,
    context_type: 'seo_generated',
    context_page: `stories?id=${newRow.id}`,
    is_read: false,
  });

  log({ story_id, fields_generated: fieldsToGenerate, fields_skipped, ... });
}
```

#### StellarPress fallback

Because this is post-publish, there's a brief window (1-5 seconds typically) where the article renders without `meta_description`. StellarPress should fall back to a body-derived description in that window:

```jsx
// In ArticlePage.jsx <Helmet> or <Head>:
<meta name="description" content={
  article.meta_description ||
  article.summary_2_sentence ||
  article.body.replace(/<[^>]+>/g, '').slice(0, 155).trim()
} />
```

This means the page never ships meta-empty even if the SEO Generator hasn't completed yet (or fails entirely).

#### Toast in MyDash

`MyHelperLauncher.jsx` already handles `team_notes` polling for the floating launcher. Extend the toast/notification system to listen for `context_type='seo_generated'` and surface a small toast in the bottom-right with a "Review" button that deep-links to the story's SEO panel.

A new `SEOPanel.jsx` component lives inside `StoryEditor.jsx`'s right sidebar (or as a tab) showing all seven fields with edit affordances. Editor reviews and overrides as needed; changes write back to `stories` directly.

#### Files to create

```
supabase/functions/seo-generator/
├── index.ts                        # main Edge Function handler
├── gemini.ts                       # Gemini call (mirrors agent-station/shared/gemini.py)
└── README.md                       # webhook setup, secrets, deployment

src/components/SEOPanel.jsx         # in-MyDash review UI
```

Plus webhook configured in Supabase dashboard pointing to the deployed function URL.

#### Build cost

~5 hours. Edge Function logic is simple; the bulk of time is the SEOPanel component, the toast wiring, and configuring the webhook + Edge Function secrets correctly the first time.

#### Acceptance criteria

- Publishing a story triggers SEO field generation within 5 seconds
- All seven fields populate unless the editor had already filled them
- Editor sees a toast notification in MyDash to review
- StellarPress renders the article with a fallback meta description if SEO fields haven't backfilled yet
- `seo_generation_log` has a row for every publish event with success or error
- Manually re-publishing a story (web_status flips off and back on) re-triggers generation only for fields that are currently null

---

### Agent 3: Sales Proposal Drafter

#### Purpose

When a sales rep converts an `ad_inquiry` to a sale, Gemini drafts the proposal narrative immediately — including a recommended product package — using the inquiry, the client's history, similar past sales, and the rep's own past proposals as context. The rep opens the proposal and finds it pre-populated; refines and sends.

For Dana and Christie onboarding next week, this compresses ramp time by removing the blank-page problem from their first weeks of proposals.

#### Trigger

Fires from the `convert_proposal_to_contract` RPC (or wherever the inquiry-to-sale conversion happens today). Specifically: when a `sales` row is created with a non-null `inquiry_id`, the agent fires.

#### Architecture

Supabase Edge Function at `supabase/functions/proposal-drafter/index.ts`. Triggered by a database webhook on `sales` insert.

#### Context fed to Gemini

1. **The inquiry text** — full body of the `ad_inquiries.message`, plus stated budget, stated goal, requested issue, requested publication
2. **The client record** — name, location, industry, history (last 5 sales: dates, amounts, products), client status
3. **The ad product catalog** — full list of products available for the requested publication and issue
4. **Similar past closed sales** — last 10 closed sales for clients in the same industry / publication, with the products they bought and the deal sizes
5. **The salesperson's own past proposals** — last 10 of THIS rep's closed proposals, full text, for voice mimicry
6. **Voice fallback** — if the rep has fewer than 3 prior proposals (Dana, Christie on day one), use Hayley's and Nicholas's last 10 proposals as the voice corpus and flag `voice_fallback=true` in the log

#### The Gemini call

Single call, **gemini-2.5-pro** (not flash — this is a high-stakes proposal that benefits from deeper reasoning), JSON-mode response:

```
You are drafting a sales proposal for a 13 Stars Media advertising sale.
The proposal should sound like it was written by {rep_name}, in their voice
and with their patterns.

INQUIRY FROM CLIENT:
{inquiry_body}
Stated budget: {budget}
Stated goal: {goal}
Requested publication: {pub_name}
Requested issue: {issue_label}

CLIENT CONTEXT:
{client_name} | {client_location} | {client_industry}
Last 5 sales with us:
{client_sales_history}

AD PRODUCT CATALOG (available for {pub_name} {issue_label}):
{product_catalog_json}

SIMILAR CLOSED SALES (clients like this typically buy):
{similar_sales_json}

REP VOICE CORPUS (sample of {rep_name}'s past proposals):
{rep_proposals_corpus}
{if voice_fallback: "Note: this rep is new. The voice corpus above is from
the firm's senior sellers. Aim for a clear, confident, no-frills register."}

Return ONLY this JSON shape:
{
  "opening_paragraph": "1-2 sentences, addresses {client_name} by name, references what they asked about",
  "recommended_package": [
    {
      "product_id": "uuid from catalog",
      "ad_size": "e.g. quarter_page",
      "publication_id": "uuid",
      "issue_id": "uuid",
      "qty": 1,
      "unit_price": 0,
      "rationale": "1 sentence — why this product fits the inquiry"
    }
  ],
  "package_rationale_paragraph": "2-4 sentences explaining why these products together solve the client's stated need within the stated budget",
  "value_paragraph": "2-3 sentences on the audience reach, the publication's strengths for THIS client's industry, why now (issue timing, seasonality, etc.)",
  "call_to_action_paragraph": "1-2 sentences, soft close, references next step (sign, kickoff call, deadline)"
}

RULES:
  - Total recommended package value must fit within stated budget if budget is given
  - If no budget stated, recommend a moderate package (3-5 ad units total value $1500-4000)
  - Never recommend products not in the provided catalog
  - Voice match the rep — sentence length, formality, use of "we" vs "I", greetings
  - No marketing-speak. Direct, plain, professional. The rep would be embarrassed by adjective-stuffed copy.
```

#### Behavior

```typescript
async function handleSaleInsert(payload) {
  const sale = payload.record;

  // Only fire if this sale was created from an inquiry conversion
  if (!sale.inquiry_id) return;

  // Don't redraft if a draft already exists
  if (sale.ai_drafted_at) return;

  const inquiry = await fetchInquiry(sale.inquiry_id);
  const client = await fetchClient(sale.client_id);
  const clientHistory = await fetchClientHistory(sale.client_id, 5);
  const catalog = await fetchAdProducts({
    publication_id: sale.publication,
    issue_id: sale.issueId,
  });
  const similar = await fetchSimilarSales({
    industry: client.industry,
    publication_id: sale.publication,
    limit: 10,
  });
  const rep = await fetchRep(sale.assignedTo);
  const repProposals = await fetchRepClosedProposals(rep.id, 10);

  let voice_fallback = false;
  let voiceCorpus = repProposals;
  if (repProposals.length < 3) {
    voice_fallback = true;
    voiceCorpus = await fetchHouseProposals(10); // Hayley + Nicholas
  }

  const draft = await callGemini({...});

  // Stitch the four paragraphs into a single proposal_text
  const proposalText = [
    draft.opening_paragraph,
    "",
    draft.package_rationale_paragraph,
    "",
    draft.value_paragraph,
    "",
    draft.call_to_action_paragraph,
  ].join("\n");

  await supabase.from('sales').update({
    ai_drafted_proposal_text: proposalText,
    ai_drafted_at: new Date().toISOString(),
    ai_recommended_products: draft.recommended_package,
  }).eq('id', sale.id);

  await supabase.from('team_notes').insert({
    from_user: PROPOSAL_BOT_ID,
    to_user: sale.assignedTo,
    message: `Drafted proposal for ${client.name}. Open the sale to review and refine.`,
    context_type: 'proposal_drafted',
    context_page: `sales?saleId=${sale.id}`,
    is_read: false,
  });

  await log({...});
}
```

#### UI integration

In `SalesCRM.jsx` (or wherever the proposal editor lives), the proposal text area should:

- Show a subtle "AI-drafted — review and refine" banner at the top when `ai_drafted_at` is set and no human edit has happened yet
- Show recommended products as pre-selected line items the rep can swap, remove, or add to
- Save the rep's edits back to a `proposal_text` field (the human-final version), preserving the `ai_drafted_proposal_text` in the audit trail
- Show "Re-draft with AI" button (uses another Gemini call) — this is implicit in the spec since the rep needs to handle the case where the draft is wrong

#### Files to create

```
supabase/functions/proposal-drafter/
├── index.ts
├── context_builders.ts             # all the fetch/aggregate functions
├── gemini.ts
└── README.md
```

Plus modifications to `SalesCRM.jsx` for the AI-drafted banner and the recommended products UI. Roughly ~150 lines of changes there.

#### Build cost

~6 hours total. Edge Function logic is moderate complexity (six different data fetches before the Gemini call). UI changes in SalesCRM are routine. The voice-mimicry corpus building and the fallback logic add maybe an hour.

#### Acceptance criteria

- Converting an inquiry to a sale results in `ai_drafted_proposal_text` being populated within 10 seconds (Gemini Pro is slower than Flash)
- The rep sees the populated proposal when they open the sale
- The recommended products are pre-selected line items the rep can modify
- Rep voice is recognizable in the draft (subjective; verify with Hayley after first 5 drafts)
- Day-one Dana / Christie drafts use the house voice and are flagged in the log
- The banner clearly communicates this is an AI draft to be reviewed, not a final proposal
- Re-converting the same inquiry doesn't redraft (idempotent on `ai_drafted_at`)

---

### Agent 4: Nightly Signal Runner

#### Purpose

Hayley reads the state of the business in 90 seconds at 6am instead of opening DashboardV2 and triangulating across modules. The agent compiles a human-written briefing every morning that combines what won yesterday, what needs attention, what pattern is emerging, and what's coming today.

The Sunday evening preview previews the week ahead — deadlines, ship dates, revenue pace, and any structural risks visible in the upcoming issues.

#### Trigger

Two cron jobs on the agent station:

- **Daily briefing:** weekdays at 6:00am Pacific
- **Weekly preview:** Sundays at 6:00pm Pacific

Cron managed by LaunchAgent's `StartCalendarInterval` rather than a polling loop. The bot.py runs once per invocation and exits.

#### Architecture

Polling-style station agent at `agent-station/signal-runner/bot.py`, but invoked by LaunchAgent's calendar trigger rather than running continuously. Two LaunchAgent plists:

- `station.wednesday.signal-daily.plist` — fires at 6:00am Mon-Fri
- `station.wednesday.signal-weekly.plist` — fires at 6:00pm Sun

Both invoke the same `bot.py` with different argv:

```bash
python bot.py --type daily
python bot.py --type weekly
```

#### Data sources

Daily briefing needs:

- **Yesterday's closed sales** — count, sum, top 3 by value, top rep
- **Yesterday's lost sales / stalled inquiries** — count, biggest drops in pipeline
- **Yesterday's editorial completions** — stories edited, stories published
- **AR aging changes** — invoices that flipped from current to overdue, biggest collections wins
- **Tickets** — opened, resolved, escalated
- **Ad projects** — proofs sent, approvals, revisions requested
- **Today's deadlines** — issue ad-deadlines today, story due dates today, scheduled meetings
- **Today's known events** — issue ship dates, scheduled team meetings (if calendar integration is live)
- **Pattern detection** — pull the last 5 days of these same metrics to detect a trend ("third day in a row of >5 stories in queue")

Weekly preview needs:

- **Next 7 days of issues** — every issue publishing, ad deadline, edit deadline
- **Revenue pace** — week-over-week, month-to-date vs goal, quarter-to-date
- **Pipeline health** — stalled inquiries (>14 days no contact), large open deals
- **Story queue** — stories slated for the week, gaps in coverage
- **Open AR risk** — invoices likely to age into overdue this week
- **Team capacity** — who's on PTO, who's at risk of overload (if data exists)

#### The Gemini call

Two prompts. Both use gemini-2.5-pro (more reasoning needed than Flash for pattern detection and prose synthesis):

**Daily prompt:**

```
You are writing the morning briefing for Hayley, the publisher of 13 Stars
Media Group. Hayley is busy, decisive, and reads on her phone before coffee.
She wants signal, not noise. She does not need cheerleading.

YESTERDAY'S DATA (Mon-Thu data; Mon briefing covers Fri-Sun combined):
{yesterday_data_json}

PATTERN DATA (last 5 weekdays):
{pattern_data_json}

TODAY'S CALENDAR:
{today_calendar_json}

Write a briefing in this exact structure (markdown, ~250-350 words total):

## Yesterday at a glance
One paragraph. Plain narrative, not bullets. Three sentences max. What
actually happened. Don't list metrics — name the story.

## Wins
- 3-5 bullets, each ONE LINE. Specific dollar amounts and names where they
  matter. Examples: "Dana closed Cottage Health renewal at $14,200" or
  "AN editorial cleared queue completely — first time in 3 weeks."

## Needs your attention
- 3 bullets max, each ONE LINE. Specific. Actionable. No
  vague "monitor X" — these are things only Hayley can move.

## Pattern I'm noticing
ONE paragraph, two-three sentences. A trend visible across the last 5
days that wasn't visible yesterday. Could be positive or negative. Skip
this section if no real pattern is present — don't manufacture one.

## What's coming today
- 3-5 bullets, each ONE LINE. Deadlines, decisions due, meetings.
- End with: "Recommended focus: {one sentence on where Hayley's day will
  most pay off — based on what's coming and what's slipping}"

VOICE RULES:
  - No marketing language. No "exciting opportunity" or "great progress."
  - No emojis except in dollar wins where a single 💰 is acceptable.
  - Refer to people by first name (Dana, Camille, Anthony, Cami, Patrick).
  - Don't repeat data shown elsewhere. Each section earns its place.
  - If a section has nothing to say, say so in one line and move on.
    ("Nothing meaningful to flag for attention today.")
```

**Weekly preview prompt:**

```
You are writing the Sunday evening briefing for Hayley. This previews
the WEEK AHEAD — Monday through the following Sunday. Hayley reads it
at the kitchen table on Sunday evening to set up Monday morning.

WEEK AHEAD DATA:
{week_ahead_json}

REVENUE PACE:
{revenue_pace_json}

OPEN RISKS:
{open_risks_json}

Write a briefing in this exact structure (markdown, ~400-550 words total):

## The week in one paragraph
Open with a single paragraph (4-6 sentences) that names what makes this
specific week distinctive. Is it a heavy publishing week? A light one?
Are major deadlines clustered? Is one publication carrying the load?

## What ships this week
- One bullet per issue publishing this week, each with: pub, issue label,
  ship date, ad deadline (if not already passed), one-line risk note if
  the issue is at risk.

## Where the revenue stands
ONE paragraph. Month-to-date vs goal, quarter-to-date vs goal, and one
sentence on whether this week's pipeline can close the gap. No charts,
no tables — just the number and the implication.

## What needs Hayley specifically
- 3-5 bullets max. Decisions only Hayley can make. Personnel issues,
  client escalations, financial calls. NOT operational items the team
  handles.

## Looking ahead
ONE paragraph. Two-three sentences on what's visible 2-4 weeks out
that should start influencing this week's decisions. (Example: "The
December magazine ad deadline is the 15th — Dana and Christie need
to be heads-down on advertiser outreach starting Monday or we'll be
short.")

VOICE RULES: same as daily briefing.
```

#### Email delivery

Use a transactional email service (SendGrid, Postmark, or Resend — pick whichever has the simplest Python SDK; recommend Resend for simplicity). Single dedicated `from` address: `briefing@13stars.media`. Single recipient: Hayley's email pulled from her `team_members` row.

Email format: HTML rendered from markdown with a clean, minimal style. Subject line dynamic:

- Daily: `"Wednesday morning — {date}"` (where "Wednesday" is the firm name; works any weekday because it's branded, not literal)
- Weekly: `"Week ahead — {start_date} through {end_date}"`

#### MyDash storage

Every briefing also writes to `daily_briefings`. A new MyDash page `/briefings` (sidebar nav: "Briefings") shows a chronological list of past briefings with:

- Date
- Type badge (Daily / Weekly)
- Click to open full briefing rendered as a clean readable page
- Hayley-only access via RLS (already in migration 075)

This is "belt and suspenders" — email pushes, MyDash page pulls, both have the same content.

#### Files to create

```
agent-station/signal-runner/
├── bot.py                          # entry point, --type daily | weekly
├── README.md
├── station.wednesday.signal-daily.plist
├── station.wednesday.signal-weekly.plist
├── .env.example
├── requirements.txt                # supabase, requests, resend, python-dotenv,
│                                   # markdown, jinja2 (for HTML email)
├── data_daily.py                   # all fetch/aggregate for daily briefing
├── data_weekly.py                  # all fetch/aggregate for weekly preview
├── prompts.py                      # the two prompt templates
├── email_render.py                 # markdown → HTML email with template
└── templates/
    └── briefing.html.j2            # simple email template

src/pages/Briefings.jsx              # MyDash page for past briefings
```

Plus sidebar nav entry in MyDash to surface the new page.

#### .env values (agent-specific)

```
SIGNAL_BOT_ID=<uuid from team_members seed>
HAYLEY_EMAIL=hayley@13stars.media
HAYLEY_USER_ID=<her team_members.id>
RESEND_API_KEY=<resend api key>
EMAIL_FROM=briefing@13stars.media
EMAIL_FROM_NAME=Wednesday Briefing
```

#### Build cost

~6 hours. Cron + LaunchAgent setup is straightforward. The data aggregators are the bulk of the work — about 15 different metrics need their own queries. Email rendering and the MyDash Briefings page are ~1 hour each.

#### Acceptance criteria

- Daily briefing email arrives in Hayley's inbox by 6:05am Mon-Fri
- Weekly preview email arrives by 6:05pm Sunday
- Each briefing is also viewable in MyDash at `/briefings` within minutes of generation
- The briefing reads in Hayley's preferred voice (verify with her after the first week — adjust prompt if needed)
- No false patterns — if there's no trend, the agent says so and moves on
- A failure (Gemini timeout, email send failure) writes an error row to `daily_briefings` with the error message; LaunchAgent attempts a single retry 5 minutes later

---

### Agent 5: Editorial Assistant

#### Purpose

Six in-editor tools for Camille and the Editor-in-Chief role. Each is a button in the StoryEditor toolbar; each calls Gemini with a scoped, specific task; each returns a result the editor can accept, ignore, or modify. The editor stays in control. AI is a tool she reaches for, not a co-author.

#### Tools shipping in v1

1. **Tighten** — selected paragraph, returns same content 20-30% shorter, voice preserved
2. **Fact-check flags** — scans the article for checkable claims (numbers, names, quotes, dates) and underlines them with a sidebar listing what to verify
3. **Headline alternatives** — generates 5 headline variations with rationale for each (best for SEO, best for click-through, most accurate, most provocative, most local)
4. **Style check** — flags AP style violations, awkward phrasing, dangling modifiers
5. **Pull quote suggestion** — picks 2-3 sentences from the article that would make the strongest pull-quote
6. **Suggest related stories** — semantic search over the published story corpus to find pieces this article should link to

#### Architecture

Two pieces:

**(a) Toolbar UI in `StoryEditor.jsx`** — six new buttons in the toolbar, each calling its respective Edge Function. Buttons disabled for users without Camille's role or EIC role.

**(b) Six Edge Functions** at `supabase/functions/editorial-{toolname}/index.ts`. Each takes the relevant input (selection text, full article, headline, etc.) and returns the result. No logging per locked decision.

**(c) Story corpus embedder** at `agent-station/editorial-corpus/bot.py` — a polling agent that maintains the `story_embeddings` table. On boot, embeds every published story not yet in the table. Then polls every 5 minutes for newly-published stories and embeds them.

The Edge Function for "Suggest related stories" calls Ollama (running on the agent station, exposed at the local network via tunnel or static IP) for the query embedding, then queries `story_embeddings` for nearest neighbors using a Postgres array similarity function.

Wait — Ollama is on the agent station at 192.168.0.65 and Edge Functions run in Supabase's infrastructure. The Edge Function can't reach Ollama on the local network. Two solutions:

- **Solution A (simpler):** the corpus embedder also exposes a small HTTP embedding endpoint (Flask or FastAPI on agent station) reachable at a public URL via Cloudflare Tunnel or similar. Edge Function calls this URL.
- **Solution B (cleaner long-term):** use Gemini's text embedding model (`text-embedding-004`) for both corpus and queries. Same vendor as the chat API. Slightly higher per-call cost but eliminates the local-network problem entirely.

**Recommended: Solution B.** Gemini embeddings are essentially free at the volumes you'll see, eliminate the network plumbing problem, and keep all the Editorial Assistant infrastructure in Supabase Edge Functions instead of split across two systems. The MyHelper bot stays on Ollama embeddings (its corpus is small and on the same machine as the chat model, so the local-network stays clean for that agent). The Editorial Assistant uses Gemini embeddings.

This means `story_embeddings.vec` will store 768-dim vectors from `text-embedding-004`, not nomic-embed-text. The migration above doesn't need to change since both are real arrays.

#### Per-tool specs

##### Tighten

**Input:** selected text (paragraph or multi-paragraph)
**Output:** rewritten text, same content, 20-30% shorter, voice preserved
**Model:** gemini-2.5-flash
**UX:** modal popup shows the original on the left, the tightened version on the right, with Accept / Reject buttons. Accept replaces the selection.

**Prompt:**

```
You are tightening a passage for a 13 Stars Media news article.

ORIGINAL PASSAGE:
{selection}

Rewrite this passage 20-30% shorter while preserving:
  - All facts, names, numbers, attributions
  - The author's voice and rhythm
  - Direct quotes verbatim (do not modify quoted text)

Cut:
  - Hedging language ("may possibly", "it could be argued that")
  - Redundant adjectives
  - Repeated information from elsewhere in the passage
  - Throat-clearing transitions

Return ONLY the rewritten passage. No commentary, no preamble.
```

##### Fact-check flags

**Input:** full article body
**Output:** list of checkable claims with text snippets and a "what to verify" note
**Model:** gemini-2.5-flash, JSON-mode
**UX:** sidebar appears showing the list. Each claim is highlighted in the editor with a yellow underline; clicking the underline scrolls to the sidebar entry.

**Prompt:**

```
You are scanning a 13 Stars Media news article for claims that should
be fact-checked before publication.

ARTICLE:
{body}

Identify every claim in the article that involves:
  - A specific number, percentage, or dollar amount
  - A named person being attributed an action or statement
  - A date or year being claimed
  - A historical or causal claim ("first time since...", "as a result of...")
  - A quote attributed to a named source
  - A title, role, or affiliation for a named person
  - A geographic or jurisdictional fact

For each claim, return:
{
  "claims": [
    {
      "text": "the exact text of the claim from the article",
      "type": "number | person_action | quote | date | causal | title | geo",
      "verify": "1 sentence on what specifically to verify and how"
    }
  ]
}

Return claims in the order they appear in the article. Be thorough — err
on the side of flagging too much rather than too little. The editor will
ignore items she's confident about.
```

##### Headline alternatives

**Input:** current headline + full article body
**Output:** 5 alternatives, each with a rationale tag
**Model:** gemini-2.5-flash, JSON-mode
**UX:** modal showing all 5 with rationale. One-click to swap the current headline.

**Prompt:**

```
You are generating headline alternatives for a 13 Stars Media news article.

CURRENT HEADLINE:
{title}

ARTICLE:
{body}

Generate 5 alternative headlines. Each should be 5-10 words, AP style,
no clickbait, no questions, no listicle ("5 things..."). Each alternative
serves a different goal:

{
  "alternatives": [
    {"text": "...", "rationale": "best for SEO — front-loads the key search term"},
    {"text": "...", "rationale": "best for click-through — names the conflict or surprise"},
    {"text": "...", "rationale": "most accurate — names the WHO and WHAT precisely"},
    {"text": "...", "rationale": "most provocative — sharpens the angle without sensationalizing"},
    {"text": "...", "rationale": "most local — names the place or local figure first"}
  ]
}
```

##### Style check

**Input:** full article body
**Output:** list of style flags with location and suggested fix
**Model:** gemini-2.5-flash, JSON-mode
**UX:** sidebar like Fact-check flags. Each issue inline-highlighted in the editor.

**Prompt:**

```
You are doing a style check on a 13 Stars Media news article. Apply AP
Style as the primary standard.

ARTICLE:
{body}

Flag every instance of:
  - AP Style violations (numbers, dates, titles, abbreviations, state names, etc.)
  - Dangling modifiers
  - Subject-verb agreement errors
  - Passive voice where active would be stronger (don't flag passive voice
    that's intentional, like "the bill was passed")
  - Cliches and hackneyed phrases ("at the end of the day", "going forward")
  - Awkward sentence structure
  - Inconsistent terminology (the same person/place/thing referred to differently)

For each, return:
{
  "issues": [
    {
      "text": "the exact text from the article",
      "type": "ap_style | dangling | agreement | passive | cliche | awkward | inconsistent",
      "fix": "the suggested rewrite",
      "explanation": "1 sentence on why"
    }
  ]
}

Be honest, not pedantic. Don't flag issues that are stylistic choices the
author clearly made deliberately. Aim for 5-15 flags on a typical 600-word
article.
```

##### Pull quote suggestion

**Input:** full article body
**Output:** 2-3 sentence-or-paragraph candidates ranked by impact
**Model:** gemini-2.5-flash, JSON-mode
**UX:** small modal. Each candidate shown with a "Use this" button that copies it to clipboard formatted as a pull quote (likely just markdown blockquote syntax for now).

**Prompt:**

```
You are picking pull-quote candidates from a 13 Stars Media news article.

ARTICLE:
{body}

Identify 2-3 sentences (or short multi-sentence passages, max 25 words)
that would make the strongest pull quotes for layout. Strong pull quotes:
  - Stand alone — readable without surrounding context
  - Surprise or compress — say something unexpected or distill a key idea
  - Are quoted from a named source when possible (NOT the author's narration)
  - Avoid jargon and proper nouns the average reader won't recognize

Return:
{
  "candidates": [
    {
      "text": "the pull quote, verbatim from the article",
      "attribution": "name and title of the speaker, or null if it's narration",
      "rationale": "1 sentence on why this is a strong choice"
    }
  ]
}

Rank by impact — best candidate first.
```

##### Suggest related stories

**Input:** full article body, current article ID (to exclude from results)
**Output:** 3-5 published articles with relevance scores
**Model:** gemini text-embedding-004 for the query, then Postgres array similarity for the search
**UX:** sidebar listing matched articles with title, publication, date, relevance score, and a "Insert link" button that inserts a markdown link at the cursor.

**Algorithm:**

```typescript
async function suggestRelated(articleBody: string, currentStoryId: string) {
  // Embed the query (full article body, truncated to first 4000 chars
  // for embedding-token efficiency)
  const queryEmbedding = await geminiEmbed(articleBody.slice(0, 4000));

  // Postgres-side cosine similarity. Note: array_cosine_distance is a
  // helper function we'd add as part of migration 075.
  const { data } = await supabase.rpc('search_story_embeddings', {
    query_vec: queryEmbedding,
    exclude_story_id: currentStoryId,
    limit_n: 5,
  });
  return data;
}
```

The RPC is added to migration 075:

```sql
create or replace function search_story_embeddings(
  query_vec real[],
  exclude_story_id uuid,
  limit_n int default 5
) returns table (
  story_id uuid,
  title text,
  publication_id uuid,
  publication_name text,
  published_at timestamptz,
  similarity numeric
) language plpgsql as $$
declare
  query_norm numeric;
begin
  -- Compute query vector norm once
  select sqrt(sum(v * v)) into query_norm
  from unnest(query_vec) as v;

  return query
  select
    s.id,
    s.title,
    s.publication,
    p.name,
    s.published_at,
    -- Cosine similarity = dot(a, b) / (norm(a) * norm(b))
    (
      select sum(a.v * b.v)
      from unnest(se.vec) with ordinality as a(v, idx)
      join unnest(query_vec) with ordinality as b(v, idx) on a.idx = b.idx
    ) / (
      query_norm * (
        select sqrt(sum(v * v)) from unnest(se.vec) as v
      )
    ) as similarity
  from story_embeddings se
  join stories s on s.id = se.story_id
  join publications p on p.id = s.publication
  where se.story_id <> exclude_story_id
    and s.web_status = 'published'
  order by similarity desc
  limit limit_n;
end;
$$;
```

(Note: this naive Postgres cosine-similarity will get slow above ~50,000 embeddings. At that scale, switch to pgvector. For now, with single-digit-thousands of stories, this works.)

#### Files to create

```
supabase/functions/editorial-tighten/index.ts
supabase/functions/editorial-factcheck/index.ts
supabase/functions/editorial-headlines/index.ts
supabase/functions/editorial-style/index.ts
supabase/functions/editorial-pullquote/index.ts
supabase/functions/editorial-related/index.ts
supabase/functions/_shared/gemini.ts        # shared by all six

agent-station/editorial-corpus/
├── bot.py                                  # corpus embedder, polls every 5 min
├── README.md
├── station.wednesday.editorial-corpus.plist
├── .env.example
└── requirements.txt

src/components/StoryEditor/EditorialAssistantToolbar.jsx
src/components/StoryEditor/TightenModal.jsx
src/components/StoryEditor/FactCheckSidebar.jsx
src/components/StoryEditor/HeadlineAlternativesModal.jsx
src/components/StoryEditor/StyleCheckSidebar.jsx
src/components/StoryEditor/PullQuoteModal.jsx
src/components/StoryEditor/RelatedStoriesSidebar.jsx
```

Modifications to `StoryEditor.jsx` to mount the toolbar and the various modals/sidebars; gated by user role check.

#### Build cost

~10 hours total. Six Edge Functions × ~30 min each = 3 hours. Six UI components × ~45 min = 4.5 hours. Corpus embedder agent = 1.5 hours. Role gating, integration testing, and rollout = 1 hour.

This is the biggest agent of the five. It's also the one most likely to compound — every editor session uses it dozens of times once Camille is fluent.

#### Acceptance criteria

- All six toolbar buttons visible to Camille and EIC role users only
- Tighten returns a usable rewrite within 3 seconds for a paragraph-sized selection
- Fact-check returns within 8 seconds for a 600-word article with at least 3 flags identified
- Headline alternatives returns 5 distinct options within 4 seconds
- Style check returns within 8 seconds with 5-15 flags on a typical article
- Pull quote returns 2-3 candidates within 4 seconds
- Suggest related returns 3-5 results within 3 seconds for a corpus of <5,000 stories
- Each tool's failure mode is graceful (clear error toast, no editor data lost)

---

## Part 4 — Build Order and Rollout

Five agents, ~33 hours of total build, broken into a sequence that lets each agent prove itself before the next begins.

### Phase 1 — Foundation (1 session, ~3 hours)

1. Apply Migration 075
2. Seed all four bot identities in `team_members`, capture UUIDs
3. Build `agent-station/shared/gemini.py` and `agent-station/shared/supabase_client.py`
4. Build `agent-station/shared/README.md` with the agent pattern documented for future reference
5. Commit: `feat: agent station shared infrastructure + migration 075`

### Phase 2 — Press Release Processor (1-2 sessions, ~6 hours)

6. Set up Gmail OAuth for `press-intake@13stars.media`
7. Set up Drive folder + processed subfolder; capture folder IDs
8. Build `agent-station/press-processor/`
9. Deploy to agent station, smoke test with a real press release
10. Run for one full day, verify no false drafts created
11. Commit: `feat: press release processor agent`

### Phase 3 — SEO Generator (1 session, ~5 hours)

12. Deploy `supabase/functions/seo-generator/`
13. Configure Supabase database webhook on stories table
14. Build `src/components/SEOPanel.jsx` and wire toast notification handling
15. Add StellarPress fallback meta description in ArticlePage
16. Publish 3 test stories, verify fields populate within 5 seconds
17. Commit: `feat: SEO generator + in-editor review panel`

### Phase 4 — Sales Proposal Drafter (1 session, ~6 hours)

18. Deploy `supabase/functions/proposal-drafter/`
19. Configure database webhook on sales table
20. Add AI-drafted banner and recommended-products UI to SalesCRM
21. Convert 3 test inquiries to sales, verify drafts populate
22. Hayley reviews 5 drafts and confirms voice match (or we adjust the prompt)
23. Commit: `feat: sales proposal drafter for inquiry conversion`

### Phase 5 — Nightly Signal Runner (1 session, ~6 hours)

24. Set up Resend account, verify `briefing@13stars.media` sender
25. Build `agent-station/signal-runner/`
26. Build `src/pages/Briefings.jsx` and add sidebar nav
27. Deploy with both LaunchAgents loaded
28. Run for one full week, Hayley reviews each briefing, prompt adjusted as needed
29. Commit: `feat: nightly signal runner — daily briefing + weekly preview`

### Phase 6 — Editorial Assistant (2 sessions, ~10 hours)

30. Build `agent-station/editorial-corpus/` and run the initial embedding backfill
31. Deploy all six Edge Functions
32. Build all six UI components and wire into StoryEditor
33. Add role gating (Content Editor + Editor-in-Chief only)
34. Camille runs through each tool with a real story, gives feedback
35. Commit: `feat: editorial assistant toolbar — six in-editor AI tools`

### Total

~36 hours across 6-7 sessions. Each phase ships a working agent that can be used in production immediately, even if the rest of the agents aren't built yet. No phase blocks another.

---

## Part 5 — What's NOT in this spec

Naming what's intentionally excluded so it doesn't accidentally creep in:

- **Per-agent budget tracking.** Single shared key, no spend limits. Revisit at month 3 if Gemini costs become non-trivial.
- **An Agents admin panel in MyDash.** Each agent has its own log table queryable by SQL; building an admin UI is a future project.
- **Multi-turn conversation memory** for any agent. All agents are stateless.
- **AI image generation** for editorial photos. Banned for reputational reasons (see prior conversation).
- **Auto-published stories** without human review. Even high-newsworthiness press releases enter as drafts.
- **AI-drafted email replies** for client correspondence. Not in scope.
- **A unified `agent_runs` table.** Per-agent log tables provide better introspection than a single mega-table; revisit if cross-agent reporting becomes a real need.
- **Streaming responses** in any UI. Tools return when they return.
- **Voice or speech interfaces.** Text in, text out, all five.
- **Open-source / local-LLM fallback** for any agent. Gemini is the chat brain; if Gemini's API is down for an extended period, the agents pause and resume when service is restored. No fallback complexity.

---

## Part 6 — Open questions

None blocking. Worth flagging for ongoing decisions:

- **Voice corpus size for the Proposal Drafter.** Spec says last 10 of the rep's closed proposals. If proposals are very short, this might not be enough corpus to capture voice; if they're very long, 10 may exceed Gemini's context window economically. Tune after first-week observations.
- **Newsworthiness threshold tuning** for the Press Processor. Spec sets the auto-draft floor at 3. If Camille reports too many low-value drafts, raise to 4. If she's pulling things from the "low priority" bucket frequently, lower to 2.
- **Daily briefing voice** for the Signal Runner. The first week of briefings will reveal whether Hayley wants more or less detail, more or less narrative. Adjust the prompt; no architectural changes needed.
- **Pull quote vs. quote attribution disambiguation** in the Editorial Assistant. The spec says prefer quotes from named sources; if Camille reports the agent picking author narration too often, tighten the prompt.
- **Embedding model migration path** for Editorial Assistant. If Gemini deprecates `text-embedding-004` or releases a successor, the corpus needs to be re-embedded. The `embedded_text_hash` column makes this incremental.

---

## End of spec
