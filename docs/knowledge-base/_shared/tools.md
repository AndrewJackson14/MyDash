---
title: MyDash Modules + External Integrations
last_updated: 2026-04-29
version: 1.0
---

# Tools

MyDash modules and the external systems they touch. Role files reference specific entries by anchor.

---

## In-app modules (sidebar nav)

### Dashboard surfaces

- **My Dash** (`/`) — Role-aware home. Publisher sees `PublisherDashboard` (issue cards + activity stream + Month at a Glance + EIC strip). Other roles see `RoleDashboard` with role-specific tiles, plus the shared `RoleActivityStrip` (target progress + activity feed).
- **Calendar** (`/calendar`) — Team calendar with Google Cal sync per user.
- **Messages** (`/messaging`) — In-app DMs between team members. Always visible.
- **Mail** (`/mail`) — Gmail inbox view (per user OAuth). Always visible.

### Revenue

- **Sales** (`/sales`) — CRM. Pipeline, clients, contracts, proposals, outreach, commissions, signals.
- **Contracts** (`/contracts`) — Active contract list with renewal-status filtering.
- **Billing** (`/billing`) — A/R workbench: Invoices, Bills, Payment Plans, Receivables, Reports, Settings.

### Content / production

- **Production** (`/editorial`) — `EditorialDashboard`. Story workflow kanban.
- **Design Studio** (`/adprojects`) — `AdProjects` page. Issue × status grid for ads. Jen's primary surface.
- **Media Library** (`/medialibrary`) — Asset catalog with Bunny CDN URLs.
- **Flatplan** (`/flatplan`) — Per-issue page-by-page grid. Drag-drop ads + stories.
- **Layout Console** (`/layout`) — Per-issue press-readiness. Anthony's primary surface.
- **Tearsheet Center** (`/tearsheets`) — Sent + pending tearsheets. Currently manual upload.
- **Collections** (`/collections`) — A/R queue with aging.
- **Newsletters** (`/newsletters`) — Composer. AI-blurb-assisted; sends via Gmail (small lists) or SES (large).
- **Social Composer** (`/social-composer`) — X (Twitter) immediate post. FB/IG/LinkedIn slots placeholders.
- **MySites** (`/sitesettings`) — Per-pub site settings, redirects, errors, social OAuth.
- **Knowledge Base** (`/knowledgebase`) — In-app help articles. Internal-audience stories.
- **Journal** (`/journal`) — Support Admin private journal. Editor / Editor-in-Chief role only.

### Advertising

- **Booking Queue** (`/bookings-queue`) — Inbound web-form ad inquiries.
- **Classifieds** (`/classifieds`) — Schema present; UI minimal.
- **Merch** (`/merch`) — Merchandise revenue tracker.

### Operations

- **Circulation** (`/circulation`) — Subscribers, drivers, routes, drops.
- **Service Desk** (`/servicedesk`) — Internal + client tickets.
- **Legal Notices** (`/legalnotices`) — Legal pipeline with billing-linked notices.
- **Performance Review** (`/performance`) — Per-team-member rollups (sales / editorial / production / admin).

### Reports & analytics

- **Reports** (`/analytics`) — Revenue, P&L, AR aging, commissions, financial dashboards.

### Systems / admin (Publisher only by default)

- **Team** (`/team`) — Roster, role assignment, permission grant, alert config.
- **Publications** (`/publications`) — Pub roster, ad sizes, rate cards, ad zones, web ad rates.
- **Schedule** (`/schedule`) — Issue generator (`EZSchedule`).
- **Email Templates** (`/emailtemplates`) — Outbound email template library.
- **Integrations** (`/integrations`) — Stripe, QBO, Gmail, Google Cal, BunnyCDN, SES, social OAuth.
- **Data Import** (`/dataimport`) — Bulk subscriber, payment, contract import.
- **Permissions** (`/permissions`) — Per-user module access matrix.
- **Activity Targets** (`/targets`) — Per-role daily/weekly/curve goal tuning.

---

## External integrations

### Stripe

**What:** Card capture (mobile + PayInvoice public page), saved cards, recurring subscriptions.
**Where in MyDash:** `stripe-card`, `stripe-webhook` Edge Functions; client.stripe_customer_id, client.stripe_payment_method_id, invoice.stripe_payment_intent_id.
**OAuth / keys:** STRIPE_SECRET_KEY (server), VITE_STRIPE_PUBLIC_KEY (client). Configured in Integrations → Stripe.

### QuickBooks Online (QBO)

**What:** Accounting system of record. Invoices, payments, customers sync from MyDash.
**Where:** `qb-api`, `qb-auth` Edge Functions. `quickbooks_tokens` table holds OAuth credentials. `qbo_account_mapping` resolves transaction_type → GL account.
**Sync direction:** MyDash → QBO (one-way). Invoice + payment + customer pushes.

### Gmail

**What:** Per-user OAuth send + inbound match. Outbound sends from contract-email, send-statement, send-proof, send-tearsheet, send-portfolio. Inbound matched to client contacts via `gmail-ingest-inbound` EF.
**Where:** `gmail-api`, `gmail-auth`, `gmail-push-webhook`, `gmail-ingest-inbound`, `gmail-watch-init` Edge Functions. `google_tokens` per user, `gmail_watches` for push subscription state.
**Limitation:** Gmail breaks at ~500-recipient sends; SES takes over for newsletters.

### Google Calendar

**What:** Team calendar surface, per-user event read.
**Where:** `gcal-api` EF (per-request proxy). `google_tokens` shared with Gmail.
**Planned:** `meeting-capture-cron` to auto-log meeting_held events when calendar events with client-contact attendees end.

### Amazon SES

**What:** Bulk email for newsletters and high-volume sends. Replaces Gmail above ~500 subscribers.
**Where:** `send-newsletter` EF. SES API keys in env.

### BunnyCDN

**What:** CDN for media assets (story images, ad proofs, tearsheets, contract PDFs). Storage zone backed by Bunny Storage.
**Where:** `bunny-storage` EF for upload signing. `media_assets.cdn_url` is the public URL.

### StellarPress

**What:** Public-facing CMS rendering published stories on each pub's website.
**Where:** Reads MyDash's `stories` table via Supabase service role. Filters: `audience='public'`, `sent_to_web=true`. Cross-published stories from sister sites surface via `cross_published_stories`.

### X (Twitter)

**What:** Per-pub OAuth for immediate social posts.
**Where:** `social-x-auth`, `social-publish` Edge Functions. `social_accounts` and `social_posts` tables.

### Stripe (recurring) + Stripe Card

**What:** Saved-card auto-charge for recurring contracts (monthly_amount + charge_day).
**Where:** `stripe-webhook` handles `invoice.payment_succeeded` events to advance subscription end_dates.

---

## RPCs (Postgres functions)

Selected high-value RPCs that role files reference:

- **`convert_proposal_to_contract`** — Migrations 029, 075. Mints contract + lines + sales + ad_projects from a signed proposal. Atomic.
- **`log_activity`** — Migration 170. Canonical writer for `activity_log`. SECURITY DEFINER; stamps actor from auth.uid() with TEAM_ROLES → spec-slug mapping baked in.
- **`bump_provider_usage`** — Migration 162. Increments social-posting usage counters per provider per pub per month.
- **`x_spend_this_month`** — Migration 162. Returns current X spend for the budget bar in IntegrationsPage.

---

## Data sources by role

| Role | Primary modules | External integrations they touch directly |
|---|---|---|
| Publisher (Hayley) | All — read mostly | Integrations admin (all OAuth setup) |
| Editor-in-Chief (Nic) | Production, Design Studio (read), Schedule, Team, Newsletters | StellarPress (story sync verification) |
| Content Editor (Camille) | Production, StoryEditor, Media Library, Newsletters, Social Composer | Gmail (story emails), BunnyCDN (assets) |
| Layout Designer (Anthony) | Layout Console, Flatplan, Production (read), Design Studio (read) | BunnyCDN (page references), Send-to-press EF |
| Ad Designer (Jen) | Design Studio, Media Library, Flatplan (read) | BunnyCDN (proofs), Send-proof EF |
| Sales Rep (Dana, Christie) | Sales CRM, Contracts, Billing (read), Design Studio (read) | Stripe (mobile charge), Gmail (proposals) |
| Office Admin (Cami) | Billing, Circulation, Service Desk, Legal Notices | Stripe (refunds), QBO (sync), Gmail (statements) |
