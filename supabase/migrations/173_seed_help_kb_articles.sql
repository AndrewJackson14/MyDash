-- 173_seed_help_kb_articles.sql
-- Seed 35 user-facing help articles into the Knowledge Base substrate.
-- One article per user-reachable MyDash page, following the 6-section
-- template (Purpose / Who Uses It / How to Use / Common Tasks /
-- Tips & Gotchas / Related). Articles power the /knowledgebase page,
-- ground MyHelper bot answers, and lay the groundwork for future
-- per-page contextual help (?-button slideout — out of scope for
-- this build).
--
-- Build spec: docs/specs/help-knowledge-base-spec.md
-- All 35 inserts run inside one DO block — re-run-safe via the
-- existing-rows guard at the top.

-- ────────────────────────────────────────────────────────────────────
-- 1. page_id column on stories
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE stories ADD COLUMN IF NOT EXISTS page_id text;
CREATE INDEX IF NOT EXISTS idx_stories_page_id
  ON stories (page_id) WHERE audience = 'internal';

COMMENT ON COLUMN stories.page_id IS
  'Route ID from src/data/pageMeta.js. Set on help-page articles (audience=internal, category_slug=help-page) so each article maps to its MyDash page for future contextual-help linking.';

-- ────────────────────────────────────────────────────────────────────
-- 2. Seed 35 articles (idempotent)
-- ────────────────────────────────────────────────────────────────────
DO $seed$
DECLARE
  v_author_id uuid;
BEGIN
  -- Resolve author. Spec: "Use Nic Mattson's team_members.id as
  -- author_id (look up by email or by role='Editor-in-Chief' for now
  -- until Support Admin role exists)." Fall back to any team member
  -- if no EIC is configured so the seed can still run on a fresh DB.
  SELECT id INTO v_author_id
    FROM team_members
   WHERE role = 'Editor-in-Chief'
   ORDER BY created_at ASC
   LIMIT 1;
  IF v_author_id IS NULL THEN
    SELECT id INTO v_author_id FROM team_members ORDER BY created_at ASC LIMIT 1;
  END IF;
  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'No team_members row exists; cannot seed help KB articles.';
  END IF;

  -- Idempotency guard. If any help-page article already exists, skip
  -- the entire seed. Re-running this migration on a database that's
  -- already been seeded is a no-op rather than a duplicate spray.
  IF EXISTS (SELECT 1 FROM stories WHERE category_slug = 'help-page' LIMIT 1) THEN
    RAISE NOTICE 'Help KB articles already seeded; skipping.';
    RETURN;
  END IF;

  -- ── 1. dashboard ───────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'My Dash',
$body$# My Dash

## Purpose
My Dash is your personalized command surface — the answer to "what's most urgent?", "what did I miss?", and "what do I do next?". It's the default page on sign-in and the only one where the layout changes meaningfully based on your role.

## Who Uses It
Everyone, every login. Publisher sees `PublisherDashboard` — press timeline strip, issue cards grid, activity stream, EIC strip, Month at a Glance. Every other role sees `RoleDashboard` (role-specific tiles for Sales Rep, Ad Designer, Layout Designer, Content Editor, Office Admin) plus a `RoleActivityStrip` below it (today's targets + activity feed). Same nav entry, very different surfaces underneath.

## How to Use
- Sign in → you land here automatically.
- Scan the hero stats at the top for today's-numbers context.
- Process the queues that surface for your role (sign-offs, today's actions, edit queue, A/R aging, etc.).
- Scroll past the main content — there's more below.
- Click any tile to drill into the source page.

## Common Tasks

### Sign off an issue (Publisher)
1. The "Awaiting Your Signoff" tile shows issues approaching press in the next 14 days.
2. Click "Open" to review in Layout Console, or click "Sign off" directly on the tile.
3. Sign-off enables the Layout Designer's Send-to-Press button.

### Triage today's actions (Sales Rep)
1. Today's Actions section lists clients with `nextActionDate <= today`.
2. Use the inline 📞 / ✉️ buttons on each card, or hit ⌘L to open QuickLog.
3. Move stages as deals progress.

### Read the activity strip (everyone but Publisher)
1. Below the role dashboard, "Your Day" shows target progress + today's activity feed.
2. Empty state shows what's been logged so far.
3. Click any feed entry to drill into the source record.

## Tips & Gotchas
- The activity strip lives below the fold. Scroll past the main role dashboard — every non-Publisher role has a target-progress panel and today's activity feed there.
- The role-switcher (sidebar pill) only appears with admin permission. Use it to view the dashboard as another team member.
- Pacing-curve tiles calculate against Pacific time, not UTC — "today" matches what you see in your local clock.

## Related
- [Calendar](calendar) — deadlines and meetings beyond the dashboard
- [Production](editorial) — drill from the editorial pacing tile
- [Sales](sales) — drill from the pipeline / top-closers tiles
- [Billing](billing) — drill from the A/R aging stacked bar
- [Layout Console](layout) — drill from "Awaiting Your Signoff"
$body$,
    'My Dash is your personalized command surface — the answer to "what''s most urgent?", "what did I miss?", and "what do I do next?".',
    'internal', 'help-page', 'dashboard', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 2. calendar ────────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Calendar',
$body$# Calendar

## Purpose
The Calendar is the single source of truth for everyone's deadlines and meetings. One view shows Google Calendar events PLUS auto-derived MyDash events (publish dates, ad/ed deadlines, sales actions, story dues) PLUS custom events you create. Defaults to a role-tuned filter set so you see what matters for your seat without picking through everything.

## Who Uses It
Every role, with a different default filter applied. Salespeople land here filtered to ad deadlines + sales actions; editors see ed deadlines + story dues; the Publisher sees everything. The snapshot cards below the calendar grid also adapt per role — sales sees pipeline urgency, editorial sees stuck stories, etc. You can toggle filter chips on top of your default at any time.

## How to Use
- Pick a view: Month, Week, or Day from the top bar.
- Toggle filter chips to add or remove event types from the grid.
- Click a date cell to open the event-creation modal pre-populated with that date.
- Click any event to see its details; from there, follow the link into the source record.
- Connect Google Calendar via Integrations if you haven't — your Google events render in the same grid.

## Common Tasks

### Create a custom event
1. Click "+ New Event" or click the date you want.
2. Fill title, start/end time, optional notes.
3. Save.

### Filter to your role's view
1. Your role's default filter chip set activates on first load.
2. Toggle individual chips to drill in (e.g., turn off Google to see only MyDash deadlines).
3. The pub filter (top right) further scopes everything to one publication.

### Drill into an event
1. Click any event chip in a date cell.
2. The detail modal shows title, time, source link.
3. Click through — sales action opens Sales pipeline, story due opens StoryEditor, etc.

## Tips & Gotchas
- **Custom events sync to Google Calendar.** If you've connected your Google account, custom events created here push to your Google Calendar — they're not local-only.
- Filter defaults are per-role; toggling them is per-session and resets on reload.
- Auto-derived events (publish dates, ad deadlines, story dues) come from `issues` / `sales` / `stories`. They don't sync to Google — only your custom events do.
- Snapshot cards below the grid adapt to your role and click-through to the most relevant page.

## Related
- [Schedule](schedule) — issue cadence + bulk issue generation feed Calendar's auto-derived events
- [Sales](sales) — sales actions appear here; click to open the pipeline
- [Production](editorial) — story due dates appear here
- [Mail](mail) — Google meeting invites you accept in Mail show up here via Google sync
- [Integrations](integrations) — connect or re-auth Google Calendar
$body$,
    'The Calendar is the single source of truth for everyone''s deadlines and meetings.',
    'internal', 'help-page', 'calendar', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 3. messaging ───────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Messages',
$body$# Messages

## Purpose
Messages is both — personal DMs for general team chat AND entity threads for context-specific work discussion. Talk about a story IN that story's thread, talk about an ad project IN its thread, talk about a contract IN its thread. One page, three views over the same underlying tables (`team_notes` for DMs, `message_threads` for entity + issue threads).

## Who Uses It
Everyone. Every team member sees the same three-tab Messages page; only the conversations differ based on what entities you're involved in. Default view is Direct (DMs). Switch to Entity for per-record threads (stories, ad projects, clients, contracts, legal notices, sales). Switch to Issue for issue-wide threads.

## How to Use
- Open Messages from the sidebar (always visible regardless of permissions).
- Pick a tab: Direct / Entity / Issue.
- Left pane lists conversations or threads; click one to load it on the right.
- Type in the composer at the bottom; send fires the message.
- Unread count shows in the sidebar badge.

## Common Tasks

### Send a direct message
1. Direct tab → "+ New" to start a conversation, or pick someone from the existing list.
2. Pick the team member.
3. Type and send.

### Reply on a story / ad project / client thread
1. Switch to the Entity tab.
2. Filter by entity type (story, ad_project, client, contract, legal_notice, sale) using the chip strip.
3. Click the thread; type and send.

### Find an issue-wide discussion
1. Switch to the Issue tab.
2. Threads are grouped by issue.
3. Use these for issue-level coordination, vs per-story chatter on the story's own thread.

## Tips & Gotchas
- **Three tabs, not one.** Most users only use Direct and miss the contextual threads attached to stories, ad projects, clients, contracts, legal notices, and issues. Check Entity and Issue tabs regularly.
- A message you write in StoryEditor's inline chat panel lands in the same thread as its Entity tab here. Two surfaces, one conversation.
- The MyHelper bot (`helper@mydash.local`) appears in your DM list but it's a system identity — talk to the floating bot launcher instead.

## Related
- [Production](editorial) — story threads originate here; click into a story to find its chat panel
- [Design Studio](adprojects) — ad project threads originate here
- [Sales](sales) — client and contract threads live here
- [Legal Notices](legalnotices) — legal notice threads live here
$body$,
    'Messages is both — personal DMs for general team chat AND entity threads for context-specific work discussion.',
    'internal', 'help-page', 'messaging', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 4. mail ────────────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Mail',
$body$# Mail

## Purpose
Mail is your Gmail inbox embedded in MyDash. Read, reply, search, star, archive, and compose without leaving the app. Everything routes through your connected Google account — MyDash never stores mail content, just acts as a UI shell.

## Who Uses It
Everyone with a connected Google account. Each user sees only their own inbox. The connection happens via Integrations → Connect Google. Until that's done, this page is empty.

## How to Use
- Sidebar entry is always visible regardless of permissions.
- Pick a label from the left rail (Inbox, Starred, Sent, Drafts, Trash, plus your Gmail custom labels).
- Browse messages in the middle pane; click one to read on the right.
- Reply, forward, star, archive, or label from the reading-pane action bar.
- Search uses Gmail's native syntax (`from:`, `subject:`, `before:`, etc.) — the proxy passes queries straight through.

## Common Tasks

### Compose a new email
1. Click "Compose" — modal opens with To / Cc / Subject / body.
2. Body editor is Tiptap-based with rich formatting.
3. Send goes through `gmail-api` Edge Function with your OAuth token.

### Reply to a thread
1. Click any message in the list.
2. Reading pane shows the full thread; click Reply (or Reply All / Forward).
3. Same composer opens, prefilled.

### Star or archive
1. Action icons sit in the reading pane header and per-message in the list.
2. Star toggles the `STARRED` label; archive removes the `INBOX` label without deleting.

## Tips & Gotchas
- Custom Gmail labels show up alongside system labels — anything you've made in Gmail proper appears here.
- Sent invoices, proposals, and statements MyDash sent on your behalf land in your Sent folder. Useful for audit trail.
- The unread count in the sidebar (`Mail` badge) reflects realtime push from Gmail's pub/sub webhook, not a poll — usually within seconds.
- Inbound emails matching a client contact's email also land as `email_log` rows tied to that client and surface in the client's timeline. The Mail page itself doesn't filter by client.

## Related
- [Integrations](integrations) — connect / re-auth Google
- [Messages](messaging) — internal team chat (different from Mail; Mail is external)
- [Sales](sales) — see emails sent to clients in their per-client timeline
- [Email Templates](emailtemplates) — manage outbound templates that compose pre-fills with
$body$,
    'Mail is your Gmail inbox embedded in MyDash.',
    'internal', 'help-page', 'mail', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 5. sales ───────────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Sales',
$body$# Sales

## Purpose
Sales is the CRM — every lead, client, opportunity, proposal, contract, renewal, inquiry, and commission row lives here. Eight tabs slice the same underlying data by what you're working on at the moment.

## Who Uses It
Sales Reps (Dana, Christie) primarily — it's their day-job page. Sales Manager and Publisher use it for oversight and pipeline visibility. Reps see only their own jurisdiction (`assigned_pubs`); managers and Publisher see everything. Office Admin generally lives in Billing rather than here.

## How to Use
- Default tab is Pipeline (kanban + list views).
- Switch tabs based on what you're doing: Inquiries to triage inbound, Clients to manage relationships, Proposals to build/send, Closed for post-sale, Renewals for accounts approaching contract end, Outreach for win-back campaigns, Commissions for your earnings.
- Use ⌘L (or the floating button) to log a call without leaving the page.
- Mobile shell at `/mobile` exposes the same data with thumb-reach controls.

## Common Tasks

### Build and send a proposal
1. From a client or pipeline card → "+ Proposal" → Proposal Wizard opens (7 steps).
2. Pick pubs, issues, ad sizes, dates, payment terms, brief.
3. Review → Send. Stamps `sent_at`, emits `proposal_sent`.

### Move a deal through stages
1. On a kanban card, drag to the next column or use the "→ Stage" button.
2. Stage move emits `deal_advanced`; Closed emits `deal_closed`; Lost requires a reason and emits `deal_lost`.
3. The local activity strip updates immediately; Hayley's stream picks up outcomes.

### Triage an inquiry
1. Inquiries tab → review match candidates pre-computed by `match_confidence`.
2. Confirm match (links to existing client) or promote to a new client.
3. Assign rep.

### Renew a client
1. Renewals tab → sorted by urgency (`contract_end_date` ascending).
2. Click client → "Renewal proposal" — pre-populated from prior closed sales.
3. Adjust → Send.

## Tips & Gotchas
- **Jurisdiction scoping is real.** Salespeople see only their assigned pubs' clients and pipeline. If a client is missing, check their `rep_id` and `assigned_pubs`.
- Inquiries load lazily — first click of the Inquiries tab triggers the fetch.
- Auto-tier (1×, 6×, 12×) suggests rate from `term_months`, but you can override per line. Off-rate-card pricing escalates to Publisher.
- Lost requires a reason from the dropdown — no free-text. Keeps win/loss analysis clean.

## Related
- [Contracts](contracts) — drill into the signed-contract view
- [Billing](billing) — Office Admin handles invoicing once deals close
- [Design Studio](adprojects) — closed sales auto-create ad projects
- [Calendar](calendar) — sales actions surface here too
- [Booking Queue](bookings-queue) — inbound web-form inquiries before they hit Sales
$body$,
    'Sales is the CRM — every lead, client, opportunity, proposal, contract, renewal, inquiry, and commission row lives here.',
    'internal', 'help-page', 'sales', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 6. contracts ───────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Contracts',
$body$# Contracts

## Purpose
Contracts is the signed-contract list. Each row is one `contracts` record minted from a signed proposal — total value, total paid, status, renewal date, and a per-line proof-status summary. The page exists so you can find any contract fast and see how its execution is going.

## Who Uses It
Sales Reps see their own contracts (jurisdiction-scoped). Sales Manager and Publisher see all. Office Admin reads here when reconciling payments to contracts during AR work.

## How to Use
- Three tabs: Active / Completed / All.
- Search by client name.
- Sort columns by clicking the header (value, dates, status).
- Filter by rep using the rep dropdown.
- Click any row to open the detail view (lines, proof status per line, related sales).

## Common Tasks

### Find a client's active contract
1. Active tab → search the client name.
2. Click the row → detail modal shows all lines + proof status.
3. From there, jump into Sales → Pipeline for the underlying sales rows.

### Check proof status across a contract's lines
1. Open any contract row.
2. The Proof column on each line maps to its `ad_projects.status` (Brief, Designing, Proof Sent, Approved, Signed Off, Placed) with a color-coded pill.
3. Click a line to drill into Design Studio for that ad project.

### Cancel or delete a contract
1. Open the detail; admin-only delete option.
2. Cascades nullify the FK references on related sales / proposals / ad projects (does not delete those — only the contract row).

## Tips & Gotchas
- Contracts load lazily on first open. The page sits empty for a beat while the fetch runs.
- The Proof column reads from `ad_projects` opportunistically; if ad projects haven't loaded yet, the column shows "—" until the data arrives.
- Synthetic contracts (`is_synthetic=true`) are auto-minted for legacy data with no proposal — they show a different badge in the detail header.
- Total Paid is snapshotted from rolled-up payments; if it looks stale after a recent payment, refresh — the trigger updates on the next page-load cycle.

## Related
- [Sales](sales) — pipeline + proposals that mint these contracts
- [Billing](billing) — invoices + payments tied to contract lines
- [Design Studio](adprojects) — ad projects per contract line
$body$,
    'Contracts is the signed-contract list.',
    'internal', 'help-page', 'contracts', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 7. billing ─────────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Billing',
$body$# Billing

## Purpose
Billing is the AR/AP workbench — every invoice, bill, payment, receivable, and revenue report. Seven tabs slice the same financial data into the views Office Admin needs to do their day job and the views Publisher needs to read the financial pulse.

## Who Uses It
Office Admin (Cami) lives here — invoicing, payment recording, AR follow-up, vendor bills, QBO sync supervision. Publisher reads the Reports tab for revenue trends. Sales Reps occasionally check Receivables to know if a client is past-due before pitching new work.

## How to Use
- Default tab is Overview — A/R + A/P snapshot.
- Invoices tab is most-used: a sub-status filter (Overdue / Sent / Partially Paid / Paid / Draft) further slices the list.
- Bills tab is AP, not AR — vendor invoices, separate workflow.
- Payment Plans tab isolates invoices on monthly auto-charge with `plan_months > 1`.
- Receivables clusters open invoices by client.
- Reports has revenue, AR aging, and rep-level breakdowns.
- Settings holds tax rate + invoice template config.

## Common Tasks

### Mint an invoice from a closed sale
1. Invoices tab → "Needs Invoice" panel surfaces closed sales without invoices.
2. Click Mint → modal previews lines pulled from the sale.
3. Save → invoice created at `sent` status; emits `invoice_issued` event.

### Record a payment
1. Open the invoice → "Add Payment".
2. Modal: amount, method (check / ACH / cash / Stripe), reference, date.
3. Save → `payments` row created, balance recomputes, status auto-flips to paid if zeroed out. Stripe payments record automatically via webhook.

### Run AR aging
1. Reports tab → AR Aging.
2. Four buckets: Current / 1-30 / 31-60 / 61-90 / 90+.
3. Drill any bucket to see clients + invoices behind it.

### Send a statement
1. Receivables tab → click client → "Send Statement".
2. `send-statement` Edge Function batches all open invoices into one email via Gmail.
3. Email logs to `email_log` and mirrors to `activity_log` for the audit trail.

## Tips & Gotchas
- **Paid invoices load lazily.** The boot fetch only pulls open invoices — switching the status filter to Paid triggers a separate query. The first switch has a beat of "loading."
- Bills (vendor) and Invoices (customer) use the same UI primitives but write to different tables. Easy to get confused — the tab breadcrumb helps.
- Rep attribution on invoices is snapshotted (`rep_id` frozen at insert per migration 047). Reassigning a client doesn't re-credit historical invoices.
- Receivables groups by client; an invoice with no rep (legal-notice auto-mint) groups by publication name as a fallback.
- QBO sync errors surface in the Bills tab's status column with the error message — re-auth tokens via Integrations if it's an auth failure.

## Related
- [Sales](sales) — closed sales mint invoices
- [Collections](collections) — A/R queue with dunning workflow
- [Service Desk](servicedesk) — billing disputes land here as tickets
- [Integrations](integrations) — Stripe + QuickBooks connections
$body$,
    'Billing is the AR/AP workbench — every invoice, bill, payment, receivable, and revenue report.',
    'internal', 'help-page', 'billing', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 8. editorial ───────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Production',
$body$# Production

## Purpose
Production is the editorial workflow surface. Five tabs slice the `stories` table and related issue/page data into the views editors actually use — the kanban for daily flow, Issue Planning for "what's in this issue", Flatplan for layout context, Web Queue for "ready but not yet live", and Editions for back-issue archive management.

## Who Uses It
Editor-in-Chief and Content Editor live here — Camille for the edit pass, Nic / Andrew for approvals. Writers see their own queue (assigned stories). Publisher reads here for editorial pacing context. Layout Designer (Anthony) reads from Issue Planning + Flatplan tabs but mostly works in Layout Console.

## How to Use
- Default tab is Workflow — kanban with 5 columns (Pitched, Draft, Edit, Ready, Published).
- Each card is a `stories` row; drag between columns to advance status.
- Click a card to open it in StoryEditor (lazy-loaded — first open has a beat).
- Toggle Active vs Archive scope at the top to see retired stories.
- Switch tabs based on what you're doing: Issue Planning when you want a per-issue view, Flatplan when you need page-layout context, Web Queue when you're publishing.

## Common Tasks

### Approve a story for web
1. Workflow tab → drag from Edit to Ready, OR open the story in StoryEditor.
2. In editor: flip `web_approved=true`. Status moves to Ready.
3. Click Publish to flip `sent_to_web=true` and stamp `published_at`. Emits `story_published` event.

### Move story between stages
1. Drag the kanban card to the target column.
2. Forward-only transitions are validated; backward moves require opening the editor.
3. Each move emits a `story_filed` or transition event for activity logging.

### Cross-publish from sister site
1. Editions tab or Issue Planning tab → find the source issue.
2. Click "Cross-publish" on a story → writes a `cross_published_stories` row.
3. The story now appears on the sister site's StellarPress feed.

### Find a story stuck in Edit
1. Workflow → Edit column → cards sorted by `updated_at` ascending (oldest first).
2. Cards >3 days old surface with a stale indicator.
3. Open and either bounce back to writer or push through.

## Tips & Gotchas
- **Stories show up in multiple tabs simultaneously.** A Ready story appears in Workflow's Ready column AND Issue Planning's per-issue list AND Web Queue if it's not yet `sent_to_web`. Same row, multiple lenses.
- StoryEditor is lazy-loaded; first card open has a 200-300ms delay while Tiptap pulls in.
- Scheduled publish (`scheduled_at` set) doesn't auto-fire today — the cron isn't wired. Check Web Queue manually around the scheduled time and flip `sent_to_web` yourself.
- The Pitched stage is new (added recently); legacy stories that started at Draft don't have it. Don't be alarmed if it's mostly empty.

## Related
- [Schedule](schedule) — issue cadence + bulk issue generation
- [Flatplan](flatplan) — full-screen page-grid editor
- [Layout Console](layout) — per-issue press-readiness checklist
- [Newsletters](newsletters) — published stories surface here for newsletter assembly
- [Media Library](medialibrary) — featured images + photo credits
$body$,
    'Production is the editorial workflow surface.',
    'internal', 'help-page', 'editorial', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 9. adprojects ──────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Design Studio',
$body$# Design Studio

## Purpose
Design Studio is the in-flight ad pipeline. Every ad sold gets an `ad_projects` row auto-created on sale-close; this page is where designers move it through brief → designing → proof sent → revising → approved → signed off → placed. Issue × Status grid is the default view; List is the alternate.

## Who Uses It
Ad Designer (Jen) lives here — her primary surface. Sales Reps drop in to fill the brief on a new project, send proof links to clients, and salesperson-signoff after client approval. Layout Designer (Anthony) reads from here to see what's `signed_off` and ready to drop into Flatplan. Publisher uses it for designer workload visibility (see the dashboard's Designer Workload tile).

## How to Use
- Default tab is Active; switch to Completed for shipped projects, All for everything.
- Two views: Board (kanban grid by status × issue) or List.
- Filter by publication, designer, search by client.
- Click a card to open the project detail (brief, asset panel, proof history, chat thread).
- Drag cards across columns to advance status — forward-only, validated against `NEXT_STAGES`.

## Common Tasks

### Upload a proof
1. Open project → "Upload Proof".
2. File goes to BunnyCDN, `ad_proofs` row created, project status flips to `proof_sent`.
3. v1 emits `proof_sent_for_approval`; v2+ emits `revision_sent` and accrues a `$25` charge from v4 onward.

### Sign off (designer or salesperson)
1. Open project → "Sign off as designer" / "Sign off as salesperson".
2. Designer signoff flips status to `approved` + stamps `approved_at`.
3. Salesperson signoff (after client approval) flips to `signed_off` + emits `ad_press_ready`.

### Bulk signoff
1. Select cards in the Approved column with the checkbox.
2. "Sign off N selected" → flips both signoffs in one round-trip.
3. Useful at the end of the cycle when 10+ projects are stacked awaiting rep signoff.

### Fill the brief
1. Sales Rep opens the project after a sale closes.
2. Brief panel: headline, style direction, brand colors, special instructions, art source (we_design / camera_ready / client_supplied).
3. Save autosaves per field with a saving indicator.

## Tips & Gotchas
- A closed sale shows up under "Needs Brief" until its ad project is created (a few seconds at most). If it lingers, refresh and the brief fields will be ready to fill.
- Camera-ready ads should be marked `art_source='camera_ready'` so the project skips the design column. The status flow doesn't strictly enforce this — be deliberate.
- Revision charges fire automatically from v4. If a v4 was your error and you want to absorb the charge, you'll need an admin to decrement `revision_billable_count` manually.
- Chat thread per project is the right place for designer-rep conversation. It links to the same `message_threads` row that surfaces in the Entity tab of Messages.

## Related
- [Sales](sales) — closed sales auto-create projects here
- [Flatplan](flatplan) — `signed_off` ads drop into Flatplan
- [Media Library](medialibrary) — upload reusable client assets here
- [Messages](messaging) — Entity tab → Ad Projects threads
- [Performance Review](performance) — designer workload + first-proof rate
$body$,
    'Design Studio is the in-flight ad pipeline.',
    'internal', 'help-page', 'adprojects', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 10. medialibrary ───────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Media Library',
$body$# Media Library

## Purpose
Media Library is the asset catalog. Every image in MyDash — featured story photos, ad reference uploads, client logos, layout references — lives in BunnyCDN with metadata in `media_assets`. This page is where you browse, upload, search, and clean up.

## Who Uses It
Content Editor (Camille) for featured-image work. Ad Designer (Jen) for client logos + reference uploads. Layout Designer (Anthony) for layout reference uploads. Publisher for site-wide asset management. Most other roles read from this catalog indirectly — when a story or ad project picks an image, it's pulling from here.

## How to Use
- Filter by publication or category at the top.
- Toggle between grid and list view (top-right).
- Click an asset to open the detail panel — preview, metadata (dimensions, mime type, alt text, caption, tags), cross-links to stories / ad projects / legal notices that use it.
- Upload via drag-drop or the "+ Upload" button; goes to BunnyCDN with the publication's folder routing.
- Run "Unused Images" scanner periodically to find orphaned uploads (see Tasks).

## Common Tasks

### Upload a new image
1. Drag-drop onto the page or click "+ Upload".
2. Pick the publication folder destination.
3. Asset uploads to BunnyCDN; row inserted into `media_assets` with width / height / mime / size auto-detected.

### Add metadata to an asset
1. Click the asset → detail panel.
2. Edit alt text, caption, photo credit, tags.
3. Save autosaves.

### Find unused images
1. Click "Unused Images" — scanner walks every `stories` body, `org_settings`, ad project, and legal notice for CDN URL references.
2. Lists assets with no inbound link.
3. Review + delete to free Bunny storage.

## Tips & Gotchas
- Folder mapping is automatic per pub — uploads route to `/{pub-id}/...` on BunnyCDN. Don't manually route.
- The Unused scanner is opt-in (modal); it's expensive on a large library. Run it once a quarter, not daily.
- Cross-links in the detail panel are read-only — they reflect what's referencing the asset, not a way to relink.
- Photo credits live on `media_assets.metadata.photo_credit` AND on the consuming story's `photo_credit` field. The library version is the canonical source; the story copy is for display.

## Related
- [Production](editorial) — pick featured images for stories
- [Design Studio](adprojects) — client logos + reference ads
- [Layout Console](layout) — layout reference uploads per page
- [MySites](sitesettings) — site-wide hero / about / partner assets
$body$,
    'Media Library is the asset catalog.',
    'internal', 'help-page', 'medialibrary', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 11. flatplan ───────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Flatplan',
$body$# Flatplan

## Purpose
Flatplan is the page-by-page layout grid for an issue. Each page is a 2×4 grid; ads occupy cells (auto-sized from ad dimensions vs page trim), stories overlay on the page they're assigned to. Drag-drop placement, visual conflict detection, page-by-page navigation. The view designers and editors use to assemble what ships.

## Who Uses It
Layout Designer (Anthony) primarily — page placement is his core work. Sales Reps read it to see where their sold ads landed. Editor-in-Chief and Content Editor read it to see story-on-page placement. Publisher reads it for issue health. Ad Designer occasionally checks placement for a project they signed off.

## How to Use
- Pick a publication + issue from the top selector (jurisdiction-scoped).
- Pages render side-by-side; click any to focus.
- Drop sold ads from the right sidebar into available grid cells.
- Drop stories from the editorial sidebar onto pages.
- Toggle filters: Sold (green) / Pending (hatched amber) / Placeholder (gray dashed).

## Common Tasks

### Place an ad on a page
1. Right sidebar lists sold + signed-off ads not yet placed.
2. Drag onto an available grid cell.
3. Writes `sales.page` + `grid_row` + `grid_col`. The ad's `ad_projects.status` advances to `placed`.

### Place a story on a page
1. Editorial sidebar lists stories with `print_status='ready'` or `'on_page'`.
2. Drag to a page → writes `page_stories` row with the page number.
3. The story's `print_status` advances accordingly.

### Hold a page slot before a sale closes
1. Add a `flatplan_placeholders` entry for the cell.
2. Pick label (e.g., "Hold for Templeton renewal"), type, color, optional `sale_id`.
3. The placeholder visually reserves the slot until you place the actual sale in it manually after the deal closes.

## Tips & Gotchas
- The grid has overlap-avoidance: if you drop an ad where it doesn't fit, it auto-shifts to the nearest fit. Silent reflow — watch the visual carefully because it doesn't warn you about conflicts.
- Magazine pages typically need a multiple of 8 (or 16) for signature math. The page-count input accepts any number — don't trust the UI to enforce printer constraints.
- Ad sizing from dimensions vs trim is approximate. A 5×5 ad in a 10×16 trim renders as 1×1 grid cell; double-check that the visual match matches the rate-card-stated size.
- After `pages_locked_date`, drops aren't blocked — the field exists but isn't enforced today. Be deliberate about post-lock changes.

## Related
- [Layout Console](layout) — per-issue press-readiness checklist + send-to-press
- [Design Studio](adprojects) — `signed_off` ads queue up for placement here
- [Production](editorial) — story-page assignments shown alongside Flatplan tab
- [Schedule](schedule) — issue cadence + page count config
$body$,
    'Flatplan is the page-by-page layout grid for an issue.',
    'internal', 'help-page', 'flatplan', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 12. layout ─────────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Layout Console',
$body$# Layout Console

## Purpose
Layout Console is the per-issue press-readiness command surface. Story list on the left, per-page progress in the middle, issue header + Send-to-Press readiness checklist + thread on the right. This is where Anthony marks pages complete, signs off, and triggers the actual press handoff.

## Who Uses It
Layout Designer (Anthony) — primary surface for the day-of-press workflow. Publisher reads here to verify readiness before the signoff button fires. Content Editor and Editor-in-Chief read here for issue-wide story status.

## How to Use
- Open via deep link from the dashboard's "Today's Issues" tile or "Awaiting Your Signoff" tile (Publisher).
- Two tabs: Layout (default) and Proofing.
- Left rail: stories assigned to this issue, with `print_status` indicators.
- Middle: per-page progress checklist with toggles for completion.
- Right rail: readiness checklist + entity thread for issue-level discussion.

## Common Tasks

### Mark a page complete
1. Toggle the page row in the middle pane.
2. Writes `flatplan_page_status` with `completed_at = now()`, `completed_by = currentUser.id`.
3. Emits `page_press_ready` (outcome). Issue progress meter advances.
4. Toggling off un-completes — useful if you flagged early.

### Trigger Send-to-Press
1. Verify all pages marked complete (right-rail checklist all green).
2. Verify Publisher has signed off (`publisher_signoff_at` stamped).
3. Click "Send to Press" → confirmation modal.
4. `sent_to_press_at` + `sent_to_press_by` stamp; issue locks; emits the celebration tile on Hayley's dashboard.

### Flag a story back to editorial
1. Story rail → click "Flag back" on the row.
2. Modal: pick context (page number, fit issue), describe the problem.
3. Writes `team_notes` to EIC + Content Editor with `context_type='page_layout_issue'`. Surfaces in their "From Layout" tile.

### Advance a story's print_status
1. Story rail → status pill button cycles: none → ready → on_page → proofread → approved.
2. Each click is one step forward; backward requires opening the editor.

## Tips & Gotchas
- **Send-to-Press is gated on publisher_signoff_at, NOT on all-pages-complete.** If the button is disabled even though pages look done, ping Hayley — she hasn't signed off yet.
- The `sent_to_press_by` audit field has a known bug: Flatplan.jsx writes the literal string `"publisher"` instead of `currentUser.id`. Engineering ticket; doesn't affect the press flow.
- Realtime listens on `flatplan_page_status` for this issue — toggling on one device updates the other within a beat. Useful when working alongside an editor.
- The Proofing tab is for the print-proof artifact (PDF upload from the printer's proof). Use it pre-press to capture the proof for the audit trail.

## Related
- [Flatplan](flatplan) — full-screen page-grid editor
- [Production](editorial) — story-page assignments
- [Schedule](schedule) — issue cadence + deadlines
- [My Dash](dashboard) — Publisher signoff tile that gates Send-to-Press
$body$,
    'Layout Console is the per-issue press-readiness command surface.',
    'internal', 'help-page', 'layout', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 13. tearsheets ─────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Tearsheet Center',
$body$# Tearsheet Center

## Purpose
Tearsheet Center is the post-press surface for proof-of-publication. After an issue runs, sales-side staff drop a JPG or PDF of each ad against its closed sale so clients can be sent a tearsheet. One grouped view per issue with status filters, instead of opening client profiles one at a time.

## Who Uses It
Office Admin (Cami) for routine post-press tearsheet collection. Sales Reps for their own clients (especially renewal-sensitive accounts). Publisher reads to see overall tearsheet completion as an indicator of customer-facing closure.

## How to Use
- Pick filters: pub, issue, status (Missing / Uploaded / All) — defaults to Missing so you see what still needs doing.
- Each group is one issue × pub; rows are closed sales for that issue.
- Upload inline per row, or use "Send" to email a tearsheet packet to the client.
- The page reuses the `upload-tearsheet` Edge Function (same as ClientProfile's per-client upload).

## Common Tasks

### Upload a tearsheet for a sale
1. Find the row (Missing filter helps).
2. Click "Upload" → file dialog → JPG/PDF.
3. Goes to BunnyCDN; `sales.tearsheet_url` stamped.
4. Status chip flips to Uploaded.

### Send a tearsheet to the client
1. After upload, click "Send" on the row.
2. SendTearsheetModal pre-fills with the client's billing email + standard message.
3. Sends via Gmail; logs to `email_log`.

### Bulk filter by issue + status
1. Set issue filter to the just-shipped issue.
2. Set status filter to Missing.
3. Work the list top-to-bottom.

## Tips & Gotchas
- This page only shows **closed** sales. If you expect to see a tearsheet line for an opportunity, check that the deal is actually Closed in Sales.
- Auto-tearsheet generation isn't wired today — manual upload only. The printer doesn't ship tearsheets to MyDash; you (or the printer's FTP-to-MyDash workflow Anthony runs) put them here.
- Tearsheet URL is stored on `sales.tearsheet_url`. Same field renders in ClientProfile's Tearsheets tab; both surfaces edit the same row.
- Sending replaces a previous upload — there's no version history per sale.

## Related
- [Sales](sales) — closed sales' detail pages also expose per-client tearsheet upload
- [Billing](billing) — invoice-stage clients sometimes need a tearsheet attached when a payment dispute opens
- [Mail](mail) — sent tearsheet emails land in your Sent folder
- [Layout Console](layout) — `sent_to_press_at` stamp triggers the tearsheet workflow window
$body$,
    'Tearsheet Center is the post-press surface for proof-of-publication.',
    'internal', 'help-page', 'tearsheets', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 14. collections ────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Collections',
$body$# Collections

## Purpose
Collections is the focused A/R cleanup surface. It pulls every open invoice into 5 aging buckets (Current / 1–30 / 31–60 / 61–90 / 90+), groups by client, and gives you one-click statement send via the `send-statement` Edge Function. Cuts the friction of opening 30 client profiles to chase 30 overdue balances.

## Who Uses It
Office Admin (Cami) for routine A/R follow-up. Publisher reads it for collections oversight. Sales Reps occasionally check before pitching new work to a past-due client.

## How to Use
- Filter by aging bucket or pub at the top.
- Each row is one client with their total open balance, bucket distribution bar, and last-contact timestamp.
- Click "Send Statement" to fire one consolidated email with all open invoices for that client.
- Drill into a client by clicking their name to open Billing → Receivables for that client.

## Common Tasks

### Send a statement
1. Find the client row (filter by 60+ or 90+ to focus high-priority).
2. Click "Send Statement".
3. `send-statement` Edge Function batches all open invoices into one email via Gmail; logs to `email_log` (which mirrors to `activity_log`).

### Triage by bucket
1. Filter to a single bucket (e.g., 90+).
2. Sort by total open balance to focus the largest exposures.
3. Work the list top-down; mark contact attempts via QuickLog (⌘L).

### Find the worst-aged dollar
1. Default sort is by total open balance descending.
2. The first few rows are typically your "if these don't pay, the AR balance moves" accounts.
3. The bucket distribution bar shows how much of their balance is in each tier — a client with all $10k in the 90+ bucket is more urgent than one with $10k spread.

## Tips & Gotchas
- The "last contact" timestamp comes from the most recent send-statement OR `client.comms` log entry. Manual phone calls only count if you log them via QuickLog or the inline 📞 button on a SalesCRM card.
- Bucket cutoffs are calendar-day inclusive: 31–60 means "31 to 60 days past due-date". The very-current bucket is `due_date >= today`.
- Statement emails go via the client's `billing_email` (or fall back to the primary contact's email). If the wrong inbox gets the statement, fix `clients.billing_email` first.
- This page only shows clients with at least one open invoice. Paid-up clients drop off automatically.

## Related
- [Billing](billing) — full A/R workbench; Receivables tab is the per-client drill-in
- [Sales](sales) — past-due context before new pitches
- [Service Desk](servicedesk) — billing disputes that escalate land here
- [My Dash](dashboard) — Office Admin dashboard's A/R aging tile click-throughs to here
$body$,
    'Collections is the focused A/R cleanup surface.',
    'internal', 'help-page', 'collections', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 15. newsletters ────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Newsletters',
$body$# Newsletters

## Purpose
Newsletters is the per-publication newsletter assembly + send surface. Pull this week's published stories, drag-drop into order, edit AI-generated blurbs, send via Gmail (small lists) or SES (large). Today / eBlast / Templates / History tabs cover the lifecycle from compose to past sends.

## Who Uses It
Content Editor (Camille) drafts; Editor-in-Chief approves and sends. Publisher reads History for engagement context. Other roles don't typically use this.

## How to Use
- Today tab: weekly newsletter draft auto-populates from `sent_to_web=true` stories in the past 7 days.
- Drag stories with the handle to reorder; toggle off any you don't want included.
- Edit AI blurbs per story (one-click regenerate).
- Set subject + preheader.
- Send to self for test, then send to the subscriber list.
- eBlast tab is for ad-hoc one-offs (announcement, special edition).
- Templates tab manages the per-pub layout config.
- History tab is the audit trail with open/click counts.

## Common Tasks

### Send the weekly newsletter
1. Today tab → review auto-populated story list.
2. Reorder, toggle off, edit blurbs.
3. Set subject + preheader.
4. Send to self → review → send to subscribers.

### Compose an eBlast
1. eBlast tab → "+ New eBlast".
2. Title, body, CTA, recipient segment.
3. Schedule or send now.

### Edit a per-pub template
1. Templates tab → pick pub.
2. Subject template, preheader, intro, footer, sections (jsonb).
3. Save → next newsletter draft picks up the new template.

### Review past sends
1. History tab → list of past `newsletter_drafts` rows, status (Draft / Approved / Sent / Failed).
2. Each row shows recipient count, open count, click count.
3. Click a sent row to see the rendered HTML.

## Tips & Gotchas
- **Hardcoded to 3 newspaper pubs today**: `pub-paso-robles-press`, `pub-atascadero-news`, `pub-the-malibu-times`. Magazine newsletters aren't wired — switch to one of the three to see content.
- AI blurbs are a starting point, not a finisher. Edit them to match your voice.
- Open / click counts only populate on SES sends. Gmail sends don't track these — the columns will stay 0.
- Drag-drop ordering is per-draft; reordering once doesn't carry to next week's auto-populated list.
- "Sent" status is final — you can't unsend or edit a Sent row. Compose a follow-up if needed.

## Related
- [Production](editorial) — `sent_to_web=true` stories feed the auto-populated list
- [Mail](mail) — Gmail-sent newsletters land in your Sent folder
- [Email Templates](emailtemplates) — separate; for transactional emails (proposals, invoices)
- [Integrations](integrations) — SES connection for high-volume sends
$body$,
    'Newsletters is the per-publication newsletter assembly + send surface.',
    'internal', 'help-page', 'newsletters', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 16. social-composer ────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Social Composer',
$body$# Social Composer

## Purpose
Social Composer is per-publication social posting from MyDash. Pick a pub, pick destinations, write the post, optionally attach images, post now or schedule. X is live; FB / IG / LinkedIn destination cards render but unlock as those OAuth flows ship.

## Who Uses It
Content Editor drafts; Editor-in-Chief approves. Publisher uses it for organization-level announcements. Sales-side staff don't typically use this.

## How to Use
- Compose / Queue / History tabs.
- Compose tab: pick publication (filtered to `has_social=true`), pick destinations (X live; others coming soon), write the body with a live char counter against the strictest active platform's limit.
- Attach up to 4 images (Bunny CDN via `upload-image`).
- Post Now (immediate) or Schedule (writes a `social_posts` row at status='scheduled' for the `social-cron` Edge Function to pick up).

## Common Tasks

### Post immediately to X
1. Compose tab → pick pub → check the X destination card.
2. Write body (char counter ticks down as you type).
3. Click "Post now" → fires `social-publish` Edge Function. Status flips to `posted`.

### Schedule a post
1. Same flow, but click "Schedule" instead.
2. Pick date + time.
3. Row writes at `status='scheduled'`. The cron picks it up at the requested time.

### Cancel a scheduled post
1. Queue tab → list of scheduled posts.
2. Click "Cancel" on the row → status reverts to `draft`. Won't fire.

### Review past sends
1. History tab → posted + failed rows.
2. Failed rows show the error — usually OAuth expiry or rate-limit hit.

## Tips & Gotchas
- **X limits**: 280 chars, max 4 images, 5MB per image. The composer enforces all three locally before the publish call so you don't hit the API only to be rejected.
- Pubs only appear in the picker if `has_social=true` AND the X account is connected for that pub. Connect via Publications → pick pub → Social Accounts.
- Schedule fires on the requested wall-clock time in the publication's timezone. Currently single timezone (Pacific) for all pubs.
- FB / IG / LinkedIn destination cards render as "coming soon" — they're not failures, they're placeholders.
- Provider usage tracking (`provider_usage` table) caps X spend at $100/month default — composer warns if you're approaching.

## Related
- [Production](editorial) — published stories are good source material; future "share this story" button will pre-fill
- [MySites](sitesettings) — per-pub social account OAuth lives there
- [Publications](publications) — `has_social` toggle + X connection per pub
- [Integrations](integrations) — usage panel + budget visibility
$body$,
    'Social Composer is per-publication social posting from MyDash.',
    'internal', 'help-page', 'social-composer', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 17. sitesettings ───────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'MySites',
$body$# MySites

## Purpose
MySites is the per-publication site config + analytics surface. Three tabs: Site (legacy single-view UI for site-wide settings, ad zones, redirects, errors), Dashboard (per-pub traffic + content performance), Digital Catalog (digital-product rate card management).

## Who Uses It
Publisher (sole owner of site-wide settings). Editor-in-Chief reads Dashboard for content performance. Sales Manager reads Digital Catalog before pitching digital ads.

## How to Use
- Pick a publication from the picker (or "MyDash" for org-wide settings).
- Default tab is Site.
- Dashboard tab loads page_views aggregations for the selected pub.
- Digital Catalog tab manages `web_ad_rates` + ad zones for digital-side selling.

## Common Tasks

### Add a redirect
1. Site tab → Redirects section.
2. Old path → new path → status code (301 typical).
3. Save → StellarPress picks it up on next ISR refresh.

### Create or edit an ad zone
1. Site tab → Ad Zones section.
2. Slug, dimensions, type, fallback house ad.
3. Save → zone is available for placements.

### Resolve a 404 site error
1. Site tab → Errors section.
2. Filter by error type (404 typical).
3. Mark resolved OR (when the one-click feature ships) promote to a redirect.

### Review pub traffic
1. Dashboard tab → time-range picker.
2. Stats: total page views, unique visitors, top stories, referrer breakdown.
3. Click any story to drill into its individual stats.

### Manage digital catalog
1. Digital Catalog tab → per-pub list of digital ad products + rates.
2. Add/edit zone slugs, monthly / 6mo / 12mo tiers.
3. Sales reps' Proposal Wizard pulls from this catalog.

## Tips & Gotchas
- **`MyDash` (the picker entry, not a real pub) is org-wide settings**: branding, default backgrounds, integration tokens. Per-pub settings only show when you've picked a real publication.
- Site Errors are auto-ingested by the `site-errors` Edge Function. They aren't user-input — the StellarPress side reports them.
- Redirects are matched longest-path-first, so `/news/old/` will hit before `/news/`.
- The Dashboard tab queries `page_views` directly with date-range filters; large windows can be slow on busy pubs.
- Social account OAuth (X today, others later) lives here too — Publications → pick pub → Social Accounts section.

## Related
- [Publications](publications) — pub roster + ad-size catalog (separate from this page's ad zones)
- [Reports](analytics) — financial reports; this page covers traffic + site-side
- [Production](editorial) — story performance feeds the Dashboard tab
- [Integrations](integrations) — connect Bunny, social OAuth, etc.
$body$,
    'MySites is the per-publication site config + analytics surface.',
    'internal', 'help-page', 'sitesettings', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 18. knowledgebase ──────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Knowledge Base',
$body$# Knowledge Base

## Purpose
Knowledge Base lists every internal SOP, process doc, onboarding guide, and (after this build) page-help article. It's a search-first surface backed by `stories` rows where `audience='internal'`. Click an article to read; the MyHelper bot reads the same rows to ground its answers, so writing a KB article also teaches the bot.

## Who Uses It
Everyone. New hires use it for onboarding. Anyone who's stuck looking for "how do I do X" lands here. The MyHelper bot reads these articles indirectly — every time you ask the bot a question, it's pulling from KB.

## How to Use
- Search box at top filters articles by title + excerpt.
- Article list shows title, excerpt, last-updated relative time.
- Click any row to open the full article in a modal.
- Articles are written in StoryEditor with `audience='internal'` set in the meta sidebar — same editor as public stories, different audience flag.

## Common Tasks

### Find an article
1. Type a keyword (e.g., "deadline", "proof", "renewal").
2. Results filter live by title + excerpt match.
3. Click the row to read.

### Write a new article
1. Production page → New Story.
2. In the meta sidebar, set Audience to "Internal Knowledge Base".
3. Title, excerpt (used in the KB list), body. Save autosaves.
4. Once published, it surfaces here and feeds MyHelper.

### Update an existing article
1. Find it in the KB list.
2. Click "Edit" (or open Production → find the same story).
3. Edit body in StoryEditor; save → KB list updates within seconds.

## Tips & Gotchas
- The KB and the **Role Docs** page are different — Role Docs serves markdown role files from `docs/knowledge-base/` (one file per role); KB serves database-backed articles. Both feed MyHelper, but their audiences and update workflows differ.
- Help-page articles (one per MyDash page) live here under `category_slug='help-page'`. As of the help-KB seed migration, there are 38 of them auto-generated.
- Excerpt is the first sentence of an article's Purpose section, surfaced in the list. Keep it accurate — it's what users see before clicking.
- The MyHelper bot's confidence score (visible in its responses) reflects how well an article actually answered the question. Low confidence = rewrite the article.

## Related
- [Production](editorial) — write new articles here via StoryEditor with `audience='internal'`
- [Role Docs](rolekb) — markdown role files (different surface, same pattern)
- [Journal](journal) — Support Admin's private journal (separate table, not KB)
$body$,
    'Knowledge Base lists every internal SOP, process doc, onboarding guide, and (after this build) page-help article.',
    'internal', 'help-page', 'knowledgebase', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 19. journal ────────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Journal',
$body$# Journal

## Purpose
Journal is Nic's private daily journal. Four structured prompts (What shipped today / Decisions made / What's blocked / What's next) plus a free-form notes section. Auto-saves as you type. One row per day per user. RLS keeps every entry private — Hayley and admins do NOT have read access. This is your own log, not a team-visible activity stream.

## Who Uses It
Support Admin (Nic) only. Nav entry shows for Editor / Editor-in-Chief role; the underlying RLS is per-user via `support_admin_journal.user_id`.

## How to Use
- Land on today's entry by default.
- Type into any prompt; auto-save fires after a brief debounce.
- Manual save button is available too.
- Sidebar lists past entries (last 60 days) — click any date to view.
- Past entries are read-only; only today's entry is editable.

## Common Tasks

### Log today's work
1. Click into the "What shipped today" prompt.
2. Type — auto-save fires after a beat.
3. Move to the next prompt; rinse and repeat.
4. Notes section is free-form for anything that doesn't fit the structured prompts.

### Read a past entry
1. Sidebar → click any past date.
2. Entry loads read-only.
3. Click "Today" in the sidebar to return to the current entry.

### Start a fresh entry on a new day
1. Sidebar → click "Today".
2. If no entry exists for today yet, all prompts are empty.
3. First save creates the row.

## Tips & Gotchas
- **Private to you.** RLS uses `auth.uid() == team_members.auth_id WHERE id = user_id`. Hayley does NOT see your entries; admins do not have a bypass. Treat it like personal notes.
- One row per day per user (UNIQUE constraint). Re-opening today's entry returns the existing row, not a new one — your earlier text persists.
- Past entries can't be edited. If you need to add something to a past day, write it in today's entry with a date reference.
- The page does NOT write to `activity_log`. Nothing here surfaces in the publisher stream or any team-visible feed.

## Related
- [Knowledge Base](knowledgebase) — for content that should be team-visible (write SOPs there, not here)
- [Messages](messaging) — for collaborative discussion (DMs, entity threads)
$body$,
    'Journal is Nic''s private daily journal.',
    'internal', 'help-page', 'journal', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 20. performance ────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Performance Review',
$body$# Performance Review

## Purpose
Performance Review is the publisher-facing team rollup — Sales / Editorial / Production / Admin metrics across This Week, This Month, or a custom window. Same window applies across tabs so you can switch contexts without re-picking dates. Driven by the `usePerformanceData` hook so every tab stays consistent.

## Who Uses It
Publisher for team-level oversight. Sales Manager for sales-side detail. Editor-in-Chief for editorial throughput. Most other roles don't have access by default — see `module_permissions`.

## How to Use
- Two tab rows: department (Sales / Editorial / Production / Admin) and period (This Week / This Month / Custom).
- Pick department + period; metrics render below.
- Custom period exposes a date range picker.
- Team filter (when present) further scopes to a single rep, designer, or editor.

## Common Tasks

### Read this month's sales performance
1. Department = Sales; Period = This Month.
2. Closed revenue, pipeline, top closers, conversion rate, lost-reason breakdown.
3. Click any rep card to drill into their `team-member` profile.

### Read editorial throughput
1. Department = Editorial; Period = This Week.
2. Stories edited, stories published, first-pass rate, stuck-stories count.
3. Lower-half is per-editor breakdown with the same metrics.

### Compare two periods
1. Set period to Custom.
2. Pick range A; note metrics.
3. Switch to range B; compare.
4. (No side-by-side view today — this is manual until the comparison toggle ships.)

## Tips & Gotchas
- The Production tab loads ad_projects on mount — first open of Performance triggers the fetch even before you click Production. Subsequent clicks read from cache.
- Custom period applies inclusively: Apr 1 → Apr 30 includes all of both endpoints.
- "This Week" is Mon–Sun in the user's local time. "This Month" is calendar-month-to-date.
- Admin tab covers Office Admin metrics (invoicing, A/R follow-ups, subscriptions). It's relatively new; some metrics are still placeholder.
- The page doesn't support exporting today. If a stakeholder asks for a CSV, screenshot or rebuild the query in Reports.

## Related
- [Reports](analytics) — financial-side analytics; complements this team-side view
- [Sales](sales) — drill from a rep card to their pipeline
- [Production](editorial) — drill from the editorial tab
- [Team](team) — manage members + commission settings
- [Activity Targets](targets) — Publisher's per-role goal config that drives target progress
$body$,
    'Performance Review is the publisher-facing team rollup — Sales / Editorial / Production / Admin metrics across This Week, This Month, or a custom window.',
    'internal', 'help-page', 'performance', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 21. bookings-queue ─────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Booking Queue',
$body$# Booking Queue

## Purpose
Booking Queue is the approval surface for the `ad_bookings` table — a parallel ad-sales pipeline separate from Sales CRM. Two sources land here: self-serve bookings (advertisers book ads themselves through a public form on a publication's site) and rep-mediated bookings (reps use the same form on behalf of advertisers). Each is a complete ad order with line items, pricing, and creative status — ready for review, conflict-check, and approval.

## Who Uses It
Sales Reps for jurisdiction-scoped review of inbound bookings. Sales Manager for cross-rep oversight. Publisher for visibility on inbound demand.

## How to Use
- Default status filter is Pending (submitted).
- Click any row to load detail: advertiser, line items, pricing breakdown, conflicts.
- Approve via the Approve button (fires `approve_booking` RPC; status flips submitted → approved → scheduled).
- Reject via Reject button (reason required; sent to advertiser).

## Common Tasks

### Approve a pending booking
1. Click the row → detail panel.
2. Review advertiser, line items, markup/discount, total, conflicts.
3. Click Approve → `approve_booking` RPC fires → status advances.

### Reject with a reason
1. Click Reject → required reason field.
2. Confirm → `reject_booking` RPC fires → status flips to Rejected; reason emails to the advertiser.

### Re-approve a previously approved booking
1. Open an Approved row → click Re-approve (same button, different label).
2. Useful when creative or pricing changed post-approval.

### Filter by status × pub
1. Status pills toggle: Pending / Approved / Scheduled / Live / Completed / Rejected / Cancelled.
2. Pub filter narrows further.

## Tips & Gotchas
- **Bookings ≠ Inquiries ≠ Sales pipeline.** `ad_inquiries` (customer asked a question), `ad_bookings` (complete ad order ready for approval — this page), `sales` (orders that actually run). Different tables, different stages.
- The advertiser here is the `advertisers` table — distinct from the `clients` table Sales CRM uses. Approval mints `clients` + `sales` downstream; the booking record stays as audit source.
- Conflict warnings from `get_booking_conflicts` flag page-slot collisions in Flatplan, double-booked dates, etc. Advisory, not blocking — you can approve over a conflict.
- `booking_source` distinguishes self-serve (public form) from rep-mediated (rep used the form internally).
- Creative status (`designer_approved`, `client_approved`, `rejected`) tracks the proof side separately from the booking status. A booking can be approved while its creative is still rejected.

## Related
- [Sales](sales) — approved bookings land here as Closed sales after the downstream mint
- [Flatplan](flatplan) — resolve placement conflicts flagged at approval
- [Design Studio](adprojects) — creative-status tracking continues here once the booking converts
- [Publications](publications) — public booking form is configured per pub
$body$,
    'Booking Queue is the approval surface for the `ad_bookings` table — a parallel ad-sales pipeline separate from Sales CRM.',
    'internal', 'help-page', 'bookings-queue', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 22. classifieds ────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Classified Ads',
$body$# Classified Ads

## Purpose
Classified Ads is the per-issue classified ad pipeline — small word-count ads (Real Estate, Auto, Services, Garage Sale, Legal, etc.) priced by word count with line / border / photo surcharges. Two tabs: Classifieds (the ad list) and Rate Cards (per-pub pricing).

## Who Uses It
Office Admin or a designated classifieds clerk. Publisher for rate-card decisions. Sales Reps occasionally for a client who wants both a display ad and a classified.

## How to Use
- Default tab is Classifieds.
- Filter by status (draft / active / expired / cancelled), pub, category.
- Click a row to open the ad detail / edit modal.
- Rate Cards tab manages pricing per pub.

## Common Tasks

### Create a new classified ad
1. "+ New Ad".
2. Pick advertiser (from clients) or new contact.
3. Pick category, write body (word counter + price preview update live).
4. Add line / border / photo upgrades.
5. Pick run dates (per-issue).
6. Save → status="draft" until it runs.

### Update rate card
1. Rate Cards tab → pick pub.
2. Edit base price per word, line surcharges, photo surcharges.
3. Save → next ad creation picks up the new pricing.

### Cancel an active ad
1. Find in Classifieds tab.
2. Open → Cancel.
3. Status flips to cancelled; remaining run dates won't print.

## Tips & Gotchas
- The schema is fully built but historically the UI was minimal — recent work has expanded it. Some workflows (refunds, partial-run credits) are still informal.
- Word count is computed from body text after stripping markup. Verify the count if you've used heavy formatting.
- Categories are a fixed list per the constants file; adding a new one requires a code change.
- Photo surcharge applies per ad regardless of how many photos — single flat fee, not per-image.

## Related
- [Billing](billing) — classified-line invoices live here
- [Publications](publications) — per-pub rate cards (separate from the inline Rate Cards tab)
- [Production](editorial) — published classifieds appear in print issues; layout via Flatplan
$body$,
    'Classified Ads is the per-issue classified ad pipeline — small word-count ads (Real Estate, Auto, Services, Garage Sale, Legal, etc.) priced by word count with line / border / photo surcharges.',
    'internal', 'help-page', 'classifieds', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 23. merch ──────────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Merch',
$body$# Merch

## Purpose
Merch is the merchandise revenue tracker — apparel, drinkware, awards, swag, signage. Three tabs: Catalog (the product list), Shop Links (Stripe / external store URLs per item), Orders (per-customer order pipeline). Lighter-touch than ad/subscription revenue but the same client base.

## Who Uses It
Publisher (sole revenue stream owner). Sales Reps occasionally cross-sell to ad clients. Office Admin reconciles paid orders.

## How to Use
- Default tab is Catalog.
- Each catalog item: name, category, price, image, status.
- Shop Links tab captures the public-facing purchase URL (Stripe Checkout, external Shopify, etc.).
- Orders tab tracks per-order status: paid → in_production → shipped → delivered (cancelled is a fork).

## Common Tasks

### Add a catalog item
1. Catalog tab → "+ New Item".
2. Name, category, price, image upload (Bunny CDN), description.
3. Save → item available for orders.

### Record an order
1. Orders tab → "+ New Order".
2. Pick client (from clients) or new contact.
3. Pick item(s), quantities, total.
4. Status starts at paid; advance through in_production / shipped / delivered.

### Track shipped vs delivered
1. Orders tab → status filter = shipped.
2. After tracking shows delivered, flip status manually.
3. (No carrier integration today — manual tracking.)

## Tips & Gotchas
- Orders are tracked by status, not by tracking-number integration. If you ship via UPS / USPS, tracking lives in your shipper, not here.
- Shop Links tab is just URL storage — there's no automated Stripe integration that mints orders here from a Stripe Checkout session. You record orders manually.
- Catalog items can be deactivated via the status toggle without deleting; preserves order history references.
- Categories are a fixed list (apparel, drinkware, awards, swag, signage, other) — request a code change for a new one.

## Related
- [Billing](billing) — merch revenue shows in revenue reports
- [Sales](sales) — clients with both ad sales and merch orders show both in their profile
- [Media Library](medialibrary) — catalog item images
$body$,
    'Merch is the merchandise revenue tracker — apparel, drinkware, awards, swag, signage.',
    'internal', 'help-page', 'merch', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 24. circulation ────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Circulation',
$body$# Circulation

## Purpose
Circulation is the print-distribution + subscriber surface. Seven tabs cover the end-to-end: Overview (snapshot stats), Subscribers (CRUD + renewal tracking), Drop Locations (cafes / racks / hotels carrying copies), Routes (driver routes), Route Instances (per-day route runs), Drivers (driver records), Messages (driver SMS).

## Who Uses It
Office Admin (Cami) for subscriber and renewal work. Distribution Manager for route + drop-location management. Drivers don't use this page — they have their own mobile shell at `/driver`.

## How to Use
- Tabs at the top route to sub-views — each lives in `src/pages/circulation/`.
- Default tab is Overview.
- Subscribers tab has Print / Digital sub-filter and status filter (active / expired / cancelled / pending).
- Drop Locations + Routes + Drivers are management surfaces; Route Instances is the per-run log.

## Common Tasks

### Add a subscriber
1. Subscribers tab → "+ New Subscriber".
2. Type (print / digital), name, address, publication, start/expiry dates, payment.
3. Save → row inserted; subscription record may be linked separately if multi-pub.

### Send a renewal notice
1. Subscribers tab → filter "Expiring (30 days)".
2. Click subscriber → renewal modal.
3. Send via Gmail using `renewalTemplate`.

### Manage a drop location
1. Drop Locations tab → click row.
2. Edit name, address, type (newsstand / cafe / hotel / etc.), contact, per-pub quantities.
3. Save.

### Plan a driver route
1. Routes tab → "+ New Route" or click existing.
2. Pick driver, frequency, day-of-week.
3. Add ordered drop-location stops via `route_stops`.
4. Save → driver sees this on their mobile shell.

### Send a driver a message
1. Messages tab → pick driver.
2. Type message → SMS-style send (channel TBD per integration).

## Tips & Gotchas
- Print vs digital subscribers are stored on the same `subscribers` table with a `type` column. Filter accordingly — they don't separate into different tables.
- Drop Location quantities are per-pub via `drop_location_pubs`. A single cafe can carry 10 copies of pub A and 5 of pub B with different counts.
- Stripe webhook auto-renewal — if the loop isn't reflecting payments, check `stripe-webhook` Edge Function logs.
- Drivers have their own mobile shell at `/driver` (custom JWT, not the team SSO). Driver Messages tab here pushes to that shell.

## Related
- [Billing](billing) — subscription_payments + renewal invoicing
- [Publications](publications) — per-pub circulation goals + frequency
- [Schedule](schedule) — issue cadence drives mailing list generation
- [Data Import](dataimport) — bulk subscriber import from prior systems
$body$,
    'Circulation is the print-distribution + subscriber surface.',
    'internal', 'help-page', 'circulation', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 25. servicedesk ────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Service Desk',
$body$# Service Desk

## Purpose
Service Desk is the inbound-ticket triage surface. Internal team requests, client complaints, billing disputes, delivery problems, ad questions, legal-notice questions — all funnel through tickets here. Three views: Board (kanban by status), List (table with filters), Analytics (volume + resolution trends).

## Who Uses It
Office Admin (Cami) primarily. Publisher for escalation oversight. Other roles assigned to specific tickets log in to respond.

## How to Use
- Default view is Board (kanban by status: open / in_progress / escalated / resolved / closed).
- Switch to List for searchable / sortable table view; List adds a status sub-filter row.
- Click any ticket card to open detail (drawer with full thread + actions).
- Analytics shows volume by category × time and average time-to-resolution.

## Common Tasks

### Triage a new ticket
1. Board view → Open column.
2. Click the ticket → detail drawer opens.
3. Review category (subscription / billing / ad question / complaint / delivery / legal notice / general), channel (phone / email / web form / walk-in / other), and contents.
4. Assign to a teammate, comment, or move to in_progress.

### Resolve a ticket
1. Open the ticket.
2. Comment with the resolution.
3. Move status to resolved → closed once verified.

### Escalate
1. Open ticket → status pill → Escalated.
2. Triggers a Publisher notification on the dashboard.
3. Ticket pops to the top of the kanban with a red border.

### Run weekly analytics
1. Analytics tab → time range.
2. Volume by category, by channel, by assignee.
3. Avg time-to-resolution helps spot bottlenecks.

## Tips & Gotchas
- **Categories drive escalation routing.** A "billing" ticket auto-suggests Cami; "complaint" or "legal_notice" might suggest Publisher. Reassignment is one click.
- The Board view's "Active" filter shows everything except resolved + closed. Most days you only need this filter.
- A ticket marked "escalated" and an "in_progress" ticket older than 7 days both surface on Hayley's dashboard alert banner.
- First-response time tracking starts when the ticket gets its first comment from a non-creator team member (mig 155). Untouched tickets show ↑↑ red.
- Channel = "web_form" comes from the public Contact form on each StellarPress site.

## Related
- [Billing](billing) — billing-category tickets often involve invoice or payment lookup
- [Circulation](circulation) — delivery-category tickets touch routes + drops
- [Legal Notices](legalnotices) — legal-notice tickets often come with affidavit or billing questions
- [My Dash](dashboard) — Office Admin dashboard surfaces open ticket count
$body$,
    'Service Desk is the inbound-ticket triage surface.',
    'internal', 'help-page', 'servicedesk', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 26. legalnotices ───────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Legal Notices',
$body$# Legal Notices

## Purpose
Legal Notices is the per-issue legal-notice pipeline. Notices intake (ad copy, advertiser, run dates, dimensions), publish across qualifying newspapers, generate affidavits for compliance, and bill — all from one surface. Five tabs cover the lifecycle: Active (in-flight notices), All (full history), Schedule (multi-issue planning), This Issue (notices for the active issue), Revenue (legal-notice-side P&L).

## Who Uses It
Office Admin (Cami) for intake, billing, and affidavit collection. Publisher for revenue oversight. Sales rarely touches this — legal notices are usually direct-to-pub bookings, not rep-mediated.

## How to Use
- Default tab is Active with a status sub-filter row.
- Status filter narrows by stage (Submitted / Approved / Scheduled / Published / Affidavit / Paid / etc.).
- Click any notice to open the editor with rich text formatting, run-date scheduling, and per-pub assignments.
- Affidavit Workspace (lazy-loaded) handles the legal compliance PDF generation post-publish.

## Common Tasks

### Intake a new legal notice
1. "+ New Notice" → modal with advertiser, ad copy (Tiptap editor), category, dimensions.
2. Pick run dates per qualifying pub.
3. Save — notice gets a number formatted by pub code (e.g., `PRP26001`, `ATN26001`, `TMT26001`) + insertion year.

### Generate an affidavit
1. Open the notice → Affidavit Workspace (lazy-loaded).
2. Workspace renders the published page snapshot + signature block.
3. Generate PDF; PDF goes to BunnyCDN, link saved to the notice.
4. Optionally email via the Delivery Panel.

### Bill a published notice
1. After publish, mig 154's auto-trigger mints an invoice line tied to the notice.
2. Verify in Billing → Invoices.
3. Send via Gmail; `email_log` mirrors to activity log.

### Plan multi-issue runs
1. Schedule tab shows all notices ordered by next run date.
2. Drag to reschedule; per-pub × per-issue grid shows where each runs.

## Tips & Gotchas
- **Only newspapers of general circulation** can publish legal notices — the constants file maps qualifying pubs (Paso Robles Press, Atascadero News, Malibu Times) to their 3-letter codes. Magazines don't appear here.
- Affidavit Workspace pulls in `html2canvas` + `pdf-lib` lazily — first open has a couple-second beat while those bundles fetch.
- Auto-billing-link (mig 154) means published notices materialize an invoice line. Don't double-mint via Billing.
- The Active tab's status sub-filter is sticky per-session — refresh resets it to "All".
- Notice numbers are generated server-side per (year, pub) — the format is `{PUB_CODE}{YY}{NNN}`. Don't edit them after assignment.

## Related
- [Billing](billing) — auto-minted invoice lines per published notice
- [Production](editorial) — published notice content lands as part of the print issue
- [Service Desk](servicedesk) — legal-notice-category tickets often touch affidavit or billing questions
- [Publications](publications) — qualifying-newspaper config (the legal-notice eligibility flag)
$body$,
    'Legal Notices is the per-issue legal-notice pipeline.',
    'internal', 'help-page', 'legalnotices', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 27. analytics ──────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Reports',
$body$# Reports

## Purpose
Reports is the financial + audience analytics surface. The breadcrumb says "Reports" — historically called "Analytics" in code, but the user-facing label is Reports. Tab list flexes by role: everyone gets Overview, P&L, Sales, Sales by Issue, Editorial, Subscribers, Audience. Publisher additionally gets Year-over-Year and Revenue vs. Goals.

## Who Uses It
Publisher reads here daily. Sales Manager checks Sales / Sales by Issue tabs. Editor-in-Chief checks Editorial + Audience. Office Admin reads Subscribers + the financial parts of Overview / P&L.

## How to Use
- Default tab is Overview — top-line numbers across revenue / pipeline / subscriptions / audience.
- Click any tab to drill into the detail.
- Period pickers per-tab are inclusive date-range.
- Deep-link from elsewhere: `/analytics?tab=Sales by Issue` lands on that tab.

## Common Tasks

### Read this month's revenue vs goal
1. Publisher only — Revenue vs. Goals tab.
2. Per-pub bar showing closed revenue vs the issue × pub revenue goal.
3. Drill into a specific pub or issue.

### Run a year-over-year comparison
1. Publisher only — Year-over-Year tab.
2. Pick metrics + range; chart compares to same range last year.
3. Useful for board reports + budget conversations.

### Find the top-grossing issue
1. Sales by Issue tab.
2. Sort by total revenue descending.
3. Click into an issue to see line items by client.

### Read audience metrics
1. Audience tab → web analytics surface.
2. Top stories by views, traffic by referrer, device breakdown.
3. Pulls from `page_views` / `daily_page_views` aggregations.

### Run editorial throughput
1. Editorial tab.
2. Stories published, edited, by-author breakdowns.
3. Complements Performance Review (which is per-team-member rollups vs this page's aggregated views).

## Tips & Gotchas
- **Tab list changes by role.** Publisher sees Year-over-Year + Revenue vs. Goals; non-Publishers don't. If you don't see those tabs, you're not Publisher.
- The Audience tab is the closest thing to a true web-analytics dashboard — it queries `page_views` directly, can be slow on busy pubs.
- Sales-side rep attribution uses snapshotted `rep_id` on invoices (per mig 047). Reassigning a client doesn't re-credit historical invoices in this view.
- Subscribers tab counts active vs lapsed at the moment of query; for trend, switch to a date range and compare.
- Deep-linking via the URL pattern lands on the named tab — `/analytics?tab=P%26L` works (URL-encode the `&`).

## Related
- [Performance Review](performance) — per-team-member rollups; complements this aggregated view
- [MySites](sitesettings) — per-pub site analytics; this page's Audience tab pulls similar data, aggregated
- [Billing](billing) — invoice + payment data feeds Sales / P&L tabs
- [Production](editorial) — story counts + publish dates feed Editorial tab
$body$,
    'Reports is the financial + audience analytics surface.',
    'internal', 'help-page', 'analytics', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 28. team ───────────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Team',
$body$# Team

## Purpose
Team is the team-member roster — every active and inactive `team_members` row, grouped by department (Leadership / Administration / Sales / Editorial / Design+Production / Other). Add new members, assign roles, set permissions, configure alerts, manage commission settings. Click any member to drill into their profile (a separate page with deeper config).

## Who Uses It
Publisher (sole owner — adds, removes, changes roles + permissions). Editor-in-Chief reads for editorial-side staff context. Most other roles can't access — gated by `module_permissions`.

## How to Use
- Page lists members grouped by department.
- Filter by role / status (active / hidden) at the top.
- Click any row to open the team-member profile page.
- "+ Add Member" opens the new-member modal.
- Per-row pencil opens an inline edit modal for quick fixes.

## Common Tasks

### Add a new team member
1. "+ Add Member".
2. Name, role (from `TEAM_ROLES` enum), email, phone, assigned pubs.
3. Save → row inserted with `module_permissions` defaulted from `ROLE_DEFAULTS` for that role.
4. Email them to sign in via Google SSO (matches by email).

### Change someone's role
1. Open their profile.
2. Edit Role dropdown.
3. Save → audit log emits a `permission_change` activity event.
4. Their dashboard branch may change immediately on next page load.

### Adjust module permissions
1. Open profile → Permissions tab (per-module checkboxes).
2. Toggle modules on/off independent of role defaults.
3. Save — sidebar visibility updates on their next page load.

### Set commission for a salesperson
1. Profile → Commission section.
2. Pick trigger (sold / paid / both), default rate %, payout frequency.
3. Per-pub assignments via `salesperson_pub_assignments` for the rep's jurisdiction.

### Soft-delete a member
1. Profile → Settings → Hide.
2. Sets `isHidden=true`, `isActive=false`. Member can no longer sign in or appear in dropdowns.
3. Hard delete is intentionally not exposed — 48 foreign keys reference team_members; soft delete preserves history.

## Tips & Gotchas
- **Role changes write `permission_change` events to activity_log.** Audit trail is automatic.
- Module permissions toggle is independent of role defaults; turning everything off doesn't hide the user from teammates, just removes their nav entries.
- `assigned_pubs = ["all"]` is special — that array literal grants jurisdiction over every pub, used for Publisher and other no-jurisdiction-limit roles.
- The role-switcher (admin-only sidebar pill) is the way to test what someone else sees without pretending to be them in a fresh session.
- Soft-deleted members still surface in commission ledgers and historical attribution — by design.

## Related
- [Team Member Profile](team-member) — per-member detail page
- [Permissions](permissions) — full per-module × per-user matrix (admin tool)
- [Activity Targets](targets) — Publisher-only target config affecting team progress views
- [Performance Review](performance) — per-member metrics across departments
$body$,
    'Team is the team-member roster — every active and inactive `team_members` row, grouped by department (Leadership / Administration / Sales / Editorial / Design+Production / Other).',
    'internal', 'help-page', 'team', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 29. publications ───────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Publications',
$body$# Publications

## Purpose
Publications is the per-pub configuration roster. Two tabs (Publisher only): Publications (list + add/edit each pub's identity, frequency, ad sizes, rate cards, ad zones, web rates, premium placements, social accounts) and Goals (per-issue and per-rep revenue goals — the financial cascade). It's where the pub-level decisions Hayley owns get configured.

## Who Uses It
Publisher (sole owner). All publications config — frequency, rate cards, ad sizes, zones, goals, social accounts — lives here. Other roles can't access by default.

## How to Use
- Default tab is Publications.
- Click any pub card → rate modal opens with everything for that pub.
- Within the modal: Identity, Frequency / EZSchedule (bulk issue generation), Rate Card, Ad Sizes, Ad Zones, Web Ad Rates, Placements (premium positions), Social Accounts.
- Goals tab is a separate financial-cascade workflow — pub goals → issue goals → rep splits.

## Common Tasks

### Add a publication
1. Publications tab → "+ New Publication".
2. Name, type (Newspaper / Magazine / Special), frequency, color, dimensions, page count.
3. Save → empty rate card; configure ad sizes + zones next.

### Configure ad sizes + rate card
1. Open pub → Ad Sizes section.
2. Add size: name, dims, base rate (1×), 6×, 12×, 18× tier rates.
3. Save → reps' Proposal Wizard auto-suggests rate based on `term_months`.

### Bulk-generate an issue schedule (EZSchedule)
1. Open pub → Frequency / EZSchedule section.
2. Pick frequency pattern (Weekly / Bi-Weekly / Semi-Monthly / Monthly etc.) + day-of-week or dates-of-month.
3. Set ad-close + ed-close offsets.
4. Generate → creates a year of `issues` rows in one batch.

### Set publication revenue goals
1. Goals tab.
2. Per-issue goal entry, per-pub rolling totals.
3. Optional per-rep splits via `commission_issue_goals`.

### Connect social accounts
1. Open pub → Social Accounts section.
2. Toggle X / FB / IG / LinkedIn (X live; others coming soon as auth flows ship).
3. OAuth handshake → token stored.

### Manage premium placements
1. Open pub → Placements section.
2. Named positions (Back Cover, IFC, IBC, etc.) with their own pricing.
3. Categories: cover, page, map, banner, skybox, footer, directory.

## Tips & Gotchas
- **Publisher-only.** RLS on publications doesn't gate writes by role today — the gate is at the nav level. Don't grant `publications` permission casually.
- Frequency pattern + EZSchedule generate a year of issues in one pass; running it again duplicates rows. Use the date range to limit.
- Rate-card changes apply forward — existing proposals captured the rate at build time and don't auto-update.
- `has_social=true` is required for a pub to appear in Social Composer's pub picker.
- The "MyDash" entry in MySites' picker is org-wide, NOT a publication. Don't add a real pub named MyDash.

## Related
- [Schedule](schedule) — read-only at-a-glance view of issues generated here
- [MySites](sitesettings) — per-pub site config (separate from this page's pub config)
- [Sales](sales) — proposals reference rate cards configured here
- [Reports](analytics) — revenue vs goals tab reads from Goals subtab here
$body$,
    'Publications is the per-pub configuration roster.',
    'internal', 'help-page', 'publications', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 30. schedule ───────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Schedule',
$body$# Schedule

## Purpose
Schedule is the publisher-focused at-a-glance view of upcoming issues across all publications. Status chips per issue (Overdue / At Risk / Behind Goal / On Track / Published) computed from ad-percentage, revenue-percentage, editorial-percentage, deadlines, and `sent_to_press_at`. Drill-in only — no executive actions live here. Issue generation lives in Publications → EZSchedule.

## Who Uses It
Publisher reads daily for the issue-by-issue health check. Sales Manager and Editor-in-Chief use it to spot at-risk issues by pub. Layout Designer reads to confirm press dates.

## How to Use
- Page renders a chronological grid of upcoming issues, grouped by pub.
- Each issue shows: label, press date, ad-percent, revenue-percent, ed-percent, status chip.
- Click any issue → IssueDetail page (the deep-dive surface).
- Filters at the top narrow by pub or status.

## Common Tasks

### Spot at-risk issues
1. Filter by status = At Risk or Behind Goal.
2. Sort by press date ascending — most urgent first.
3. Click into the issue to see what's missing (ads, stories, layout-ref).

### Read holiday-shifted deadlines
1. Hover any deadline badge.
2. If a public holiday falls between the deadline and press date, the badge shows the shifted date.
3. Computed via `holidaySetForPub` + `shiftDeadline` helpers.

### Find recently published issues
1. Status filter = Published.
2. Sort by `sent_to_press_at` descending.
3. Click for IssueDetail history.

## Tips & Gotchas
- **No executive actions on this page.** Want to sign off, generate issues, or send to press? Use Publisher Dashboard, EZSchedule (Publications), or Layout Console respectively. Schedule is read-only by design.
- Status chip is computed live, not stored — it derives from current ad% / rev% / ed% / deadlines / `sent_to_press_at`. The same issue might shift from On Track to At Risk between two refreshes.
- "Behind Goal" is a soft warning (revenue tracking below pacing curve). "Overdue" is hard — a deadline passed.
- Published issues drop out of the default filter; switch the filter to see them.
- Deadline shifts respect public holidays per-pub via `public_holidays` table.

## Related
- [Publications](publications) — issue generation (EZSchedule subsection) lives there
- [My Dash](dashboard) — Publisher Dashboard's awaiting-signoff + issue forecast tiles
- [Layout Console](layout) — drill into any issue for press-readiness checklist
- [Issue Detail](issue-detail) — full per-issue drill-down
$body$,
    'Schedule is the publisher-focused at-a-glance view of upcoming issues across all publications.',
    'internal', 'help-page', 'schedule', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 31. emailtemplates ─────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Email Templates',
$body$# Email Templates

## Purpose
Email Templates is the per-category template library for outbound transactional emails. Seven categories: Proposals, Contracts, Renewals, Invoices, Marketing, Notifications, Other. Each category has its own editor mode — proposals/contracts/invoices use config-driven generators with merge fields; marketing and other use a Tiptap rich editor for free-form content.

## Who Uses It
Publisher (sole owner). Templates affect what every rep, Office Admin, and editor sends from MyDash via Gmail. Other roles read by sending — they don't edit.

## How to Use
- Tab strip across the top is the category picker.
- Each category lists existing templates; click to edit or "+ New Template" to create.
- Proposals / Contracts / Invoices use config + merge fields (`{{client_name}}`, `{{client_email}}`, etc.).
- Marketing and Other use a Tiptap editor with formatting toolbar.
- Preview button renders the template with sample data before saving.
- Send-test button sends a populated copy to your own email.

## Common Tasks

### Edit the proposal-send template
1. Proposals tab → click the active template.
2. Adjust subject, body, merge fields.
3. Save → next proposal sent from any rep uses the new copy.

### Insert a merge field
1. In the editor, click the merge-fields panel.
2. Pick a field — `{{client_name}}` for proposals, `{{invoice_number}}` for invoices, etc.
3. The token inserts at cursor; renders with real data on send.

### Create a new marketing template
1. Marketing tab → "+ New".
2. Tiptap editor with full formatting (headings, lists, links, images).
3. Set name, subject, save.

### Test a template
1. Open template → Preview button renders with sample data.
2. Send Test sends a populated copy to your email via Gmail.

## Tips & Gotchas
- **Merge fields are category-specific.** Proposal templates use proposal merge fields; invoice templates use invoice merge fields. Mixing won't error but will leave `{{token}}` literally in the sent email.
- Marketing + Other are free-form Tiptap. Proposals / Contracts / Invoices / Renewals are config-driven — there's a structured layout the editor renders into.
- The `notification` category covers system-style messages (welcome emails, alert digests). Edit cautiously — these fire from triggers.
- Templates are global, not per-pub. If you need pub-specific copy, use merge fields like `{{publication_name}}` to vary the rendered output.
- Sanitization happens via DOMPurify before send — you can't inject script tags even if Tiptap lets you paste them.

## Related
- [Sales](sales) — proposal sends use this category's active template
- [Billing](billing) — invoice sends use the invoice template
- [Newsletters](newsletters) — separate from this; newsletter composition has its own template surface
- [Mail](mail) — sent emails land in Gmail Sent for the audit trail
$body$,
    'Email Templates is the per-category template library for outbound transactional emails.',
    'internal', 'help-page', 'emailtemplates', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 32. integrations ───────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Integrations',
$body$# Integrations

## Purpose
Integrations is the OAuth + service-config console. Six tabs: Overview (status snapshot of every integration), QuickBooks (accounting sync), Google Workspace (Gmail + Calendar OAuth), Social (per-pub X/FB/IG/LinkedIn auth), StellarPress (CMS read-config), Database (Supabase project info). One place to connect, re-auth, and verify health.

## Who Uses It
Publisher (sole owner). Integration tokens are sensitive — non-Publisher roles don't have access.

## How to Use
- Default tab is Overview — status dot per integration (Connected / Not Connected / Configured / Syncing).
- Each detail tab handles its own connection flow: OAuth handshake, token storage, status check.
- Re-auth flows live where the integration's tab is — disconnect + reconnect from there.

## Common Tasks

### Connect QuickBooks
1. QuickBooks tab → Connect.
2. Intuit OAuth flow; grant permissions to MyDash.
3. Token stored in `quickbooks_tokens`.
4. Sync log shows pending/syncing rows; verify a manual sync runs.

### Connect Google Workspace
1. Google Workspace tab → Connect.
2. Google OAuth flow; grant Gmail + Calendar scopes.
3. Token stored in `google_tokens`.
4. Mail page now populates; Calendar sync activates.

### Connect a publication's X account
1. Social tab → pick pub → Connect X.
2. X OAuth handshake; token stored per `social_accounts` row keyed to pub + provider.
3. The pub's social-composer UI now allows X posts.

### Re-auth an expired token
1. Find the integration's tab.
2. Status will show "Disconnected" or an error.
3. Click Reconnect → same OAuth flow refreshes the token.

### Check usage / spend
1. Social tab → X usage panel: $100/month default budget; bar shows current spend, remaining, MTD posts.
2. Drill into per-pub × per-network status matrix at the bottom.

## Tips & Gotchas
- **OAuth tokens expire.** Most refresh automatically via stored refresh tokens; if you see "Disconnected" unexpectedly, re-auth.
- Disconnecting an integration doesn't delete historical data — `email_log`, `quickbooks_tokens` records stay, sync just stops.
- Per-user vs per-org: Gmail and Calendar are per-user (each team member connects their own account). QuickBooks and StellarPress are per-org. Social is per-pub.
- The Social tab's usage panel is X-only today; FB / IG / LinkedIn show as "coming soon" placeholders.
- Database tab is read-only — surfaces project URL, env, region for support purposes. No actions.

## Related
- [MySites](sitesettings) — per-pub Social Account section also exposes social OAuth (same backend, different surface)
- [Mail](mail) — Gmail integration powers this page
- [Calendar](calendar) — Google Calendar integration powers this page
- [Billing](billing) — QBO sync errors surface in the Bills tab
- [Publications](publications) — per-pub social configuration
$body$,
    'Integrations is the OAuth + service-config console.',
    'internal', 'help-page', 'integrations', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 33. dataimport ─────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Data Import',
$body$# Data Import

## Purpose
Data Import is the bulk-load surface for migrating from prior systems — subscribers, subscription payments, historical contracts, etc. Each import is a card with an idempotent runner, progress display, and reset button. Designed for one-time migration or bulk corrections, not for ongoing data flow.

## Who Uses It
Publisher (sole owner). One-off use during onboarding from a prior system or major bulk corrections. After initial migration, this page is rarely opened.

## How to Use
- Each card represents one importer (Subscribers, Subscription Payments, Contracts, etc.).
- Click "Run" → loads the source data file, then inserts in batches.
- Progress: counts per table + a progress bar.
- Reset wipes the import's idempotency markers if you need to re-run.

## Common Tasks

### Run an importer
1. Find the card for the data type.
2. Click Run.
3. Watch progress; counts increment as inserts complete.
4. Status flips to "done" with a summary on completion.

### Re-run after a partial failure
1. Click Reset on the card.
2. Idempotency markers clear.
3. Click Run again — full re-import.

### Verify after import
1. Open the destination page (Subscribers, Subscription Payments, etc.).
2. Counts should match the importer's reported total.
3. Spot-check a few rows for data quality.

## Tips & Gotchas
- **Importers are idempotent by design.** Running the same one twice is safe; rows match by external ID and skip duplicates.
- This page is for **one-time migration**, not ongoing sync. If you need recurring sync from another system, build an integration instead.
- Progress display only updates when an insert batch completes — for large imports, expect long pauses between updates.
- Reset clears idempotency, NOT the imported data itself. Existing rows aren't deleted; the next Run treats them as new and may duplicate.

## Related
- [Circulation](circulation) — destination for Subscribers + Subscription Payments imports
- [Sales](sales) — destination for Contracts import
- [Integrations](integrations) — recurring sync alternative for ongoing data flow
- [Team](team) — manual team member entry; no bulk importer for team data
$body$,
    'Data Import is the bulk-load surface for migrating from prior systems — subscribers, subscription payments, historical contracts, etc.',
    'internal', 'help-page', 'dataimport', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 34. team-member ────────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Team Member Profile',
$body$# Team Member Profile

## Purpose
Team Member Profile is the per-member detail page — three tabs deep into one teammate's data: Dashboard (their role-specific dashboard rendered in your view, useful for Publisher to see what someone else sees), Messages (their direct-message thread with you), Settings (role / permissions / commission / alerts / freelance config). The deeper management surface for everything Team page lists.

## Who Uses It
Publisher and Sales Manager use it to manage members. Anyone can land here from a team-member link in the activity stream or a clickable name. Settings tab is gated by permission — non-admins see read-only.

## How to Use
- Land via Team page → click a row.
- Three tabs: Dashboard / Messages / Settings.
- Default tab is Dashboard.
- Back button returns to Team list.

## Common Tasks

### See what a team member sees
1. Dashboard tab — renders that member's role dashboard against their data + jurisdiction.
2. Useful for Publisher debugging "this rep can't see X" reports without using the role-switcher.
3. (Read-only — buttons there don't fire actions on this page.)

### Send a DM
1. Messages tab.
2. Type in the composer; sends to that team member.
3. Same backend as the Messages page (`team_notes`).

### Edit role + permissions
1. Settings tab → role dropdown, module permission checkboxes.
2. Save → emits `permission_change` activity event.
3. Member's dashboard branch updates on their next page load.

### Configure freelance settings
1. Settings tab → Freelance toggle.
2. If on: specialty, rate type (hourly/per-piece), rate amount, availability, OOO dates.
3. Saves to `team_members.specialty`, `rate_type`, `rate_amount`, `availability`.

### Set commission for a sales rep
1. Settings tab → Commission section (Salesperson / Sales Manager only).
2. Trigger (sold / paid / both), default rate %, payout frequency.
3. Per-pub assignments listed below; each can override the default rate.

### Transfer open work (admin)
1. Settings tab → "Transfer Open Work" panel (admin-only).
2. Pick destination rep.
3. Open sales / proposals / contracts / clients move; closed/paid history stays attributed to the original rep.

## Tips & Gotchas
- Role dashboard rendered on this page reads against the member's `assigned_pubs` and `module_permissions` — it accurately shows what they see.
- Transfer Open Work moves only **open** records: sales not Closed, invoices in `sent`/`overdue`/`partially_paid`/draft, contracts `active`, clients with that rep_id. Closed and paid history is locked.
- Alert preferences live here too (per-event off / in_app / email / both). Defaults seeded by role; tweak per member.
- Per-pub commission rates override the default rate. If a rep gets 15% on Pub A and 12% on default everywhere else, the Pub A row sets that.

## Related
- [Team](team) — list view that links here
- [Activity Targets](targets) — Publisher sets per-role goals visible on member dashboards
- [Performance Review](performance) — aggregated rollups across all members
- [Sales](sales) — per-rep commission ledger drilldown
$body$,
    'Team Member Profile is the per-member detail page — three tabs deep into one teammate''s data: Dashboard (their role-specific dashboard rendered in your view, useful for Publisher to see what someone else sees), Messages (their direct-message thread with you), Settings (role / permissions / commission / alerts / freelance config).',
    'internal', 'help-page', 'team-member', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  -- ── 35. issue-detail ───────────────────────────────────
  INSERT INTO stories (title, body, excerpt, audience, category_slug, page_id, author, author_id, status, created_at, updated_at)
  VALUES (
    'Issue Detail',
$body$# Issue Detail

## Purpose
Issue Detail is the per-issue command center — ad sales, editorial, production status, revenue, page progress for one issue. Drill-down view that aggregates everything tied to an issue's id. Reached by deep link (from Schedule, the Publisher dashboard, Layout Console, or any issue ID hyperlink in the activity stream).

## Who Uses It
Publisher for issue health checks. Sales Manager for revenue + sold/pipeline view per issue. Layout Designer for pre-press status. Editor-in-Chief for editorial completion. Most roles read this; few write here directly.

## How to Use
- Land via deep link (`?issueId=...` from Schedule, dashboard, etc.).
- Header shows pub + issue label + press date + days-to-press countdown.
- Body sections cover ad sales (closed + pipeline), revenue vs. goal, page-fill ratio, editorial completion, production status.
- Most numbers are click-throughs — sales counts open Sales filtered to this issue, etc.

## Common Tasks

### Check ad fill on an issue
1. Open the issue from any deep link.
2. Header section shows ad-pct (closed sales × ad-slot ratio of page count).
3. Closed ads list + pipeline ads list below give the breakdown.
4. Click any client name to drill into their profile.

### Read revenue vs goal
1. Revenue section: closed total vs goal (from `commission_issue_goals` or `issues.revenue_goal`).
2. Pipeline value (open sales not yet closed) shown alongside.
3. Forecast = closed + pipeline-weighted.

### Spot stuck stories
1. Editorial section lists stories with `print_issue_id = thisIssue`.
2. Status flags surface stories not yet `Ready` or not yet placed on a page.
3. Click any story to open StoryEditor.

### Drill into Layout
1. Production section shows page completion via `flatplan_page_status`.
2. Click "Open Layout Console" to drill into Anthony's surface for this issue.

## Tips & Gotchas
- This page is **read-only** — no actions fire from here. To act, drill into the relevant module (Sales, Production, Layout Console).
- ad-pct is approximate: it's based on closed sales vs an estimated ad-slot count for the issue. Doesn't account for premium positions or zero-rate house ads.
- Pipeline ads include all non-Closed sales tied to the issue, including Lost (which still shows historically). Filter mentally.
- The page assumes the issue exists; deep-linking to a deleted issue shows "Issue not found" with a back button.
- For deep-press-readiness work (page-by-page completion, send-to-press), use Layout Console instead — Issue Detail is a high-level snapshot.

## Related
- [Schedule](schedule) — primary entry point with status chips
- [Layout Console](layout) — per-issue press-readiness with actionable controls
- [Sales](sales) — drill into pipeline for this issue
- [Production](editorial) — drill into editorial workflow for this issue
- [Flatplan](flatplan) — visual page-grid editor for this issue
$body$,
    'Issue Detail is the per-issue command center — ad sales, editorial, production status, revenue, page progress for one issue.',
    'internal', 'help-page', 'issue-detail', 'MyDash Help', v_author_id, 'Ready', now(), now()
  );

  RAISE NOTICE 'Seeded 35 help-page articles, attributed to team_member %', v_author_id;
END $seed$;
