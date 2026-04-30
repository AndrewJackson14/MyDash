---
title: MyDash Glossary
last_updated: 2026-04-29
version: 1.0
---

# Glossary

Terms used across the role knowledge base. When a role file says "see glossary," it means here. Keep entries short — link to deeper docs (`workflows.md`, business-domain doc) when more context is needed.

---

## Domain entities

**Publication** (`publications`) — A brand MyDash supports (Paso Robles Press, Atascadero News, Malibu Times, etc.). Carries its own ad sizes, rate cards, web zones, frequency cadence, color, and abbreviation. ID is a slug like `pub-paso-robles-press`.

**Issue** (`issues`) — One instance of a publication. Carries `date` (publish/press date), `ad_deadline`, `ed_deadline`, `revenue_goal`, `page_count`, and the press-readiness flags (`publisher_signoff_at`, `sent_to_press_at`, `pages_locked_date`). Generated in bulk by EZSchedule from a frequency pattern.

**Sale** (`sales`) — One ad row. Tied to `client_id` + `publication_id` + `issue_id`. Carries `status` (Discovery → Presentation → Proposal → Negotiation → Closed → Follow-up, or Lost), amount, ad type/size/dimensions, `assigned_to` (rep), `proposal_id`, `contract_id`. The atomic unit of revenue.

**Proposal** (`proposals` + `proposal_lines`) — A multi-issue, multi-pub bundle a rep builds and sends to a client for signature. `status` Draft → Sent → Signed & Converted. Signature event mints a `contract` and per-issue `sales` rows via `convert_proposal_to_contract` RPC.

**Contract** (`contracts` + `contract_lines`) — The signed insertion order. Carries `status` (active / completed / cancelled), `total_value`, `total_paid`, `monthly_amount`, `charge_day`, `is_synthetic` (auto-minted for legacy data without a proposal). Links back to `proposal_id`.

**Ad Project** (`ad_projects`) — In-flight display-ad creation tied to one Sale. Auto-created when a sale closes. 8-state enum: `brief → awaiting_art → designing → proof_sent → revising → approved → signed_off → placed`. Lives in Design Studio.

**Ad Proof** (`ad_proofs`) — One version of a designed ad. Multiple per Ad Project as revisions accrue. Carries `proof_url`, version number, designer/salesperson/client notes, annotations, `client_approved` bool, `access_token` for the public approval page.

**Story** (`stories`) — An editorial article. Status enum: `Draft → Edit → Ready → Archived`. Web publish flag: `sent_to_web`. Print state: `print_status` (separate enum: none → ready → on_page → proofread → approved → sent_to_press).

**Page Story** (`page_stories`) — Many-to-many linking a story to a specific issue's page. Used by Flatplan and Layout Console to assemble the print issue.

**Flatplan** — The visual page-by-page layout for an issue. Each page is a 2×4 grid; ads occupy cells (auto-sized by `adToGridSpan` based on dimensions vs trim). Stories and ads share the same page surface.

**Tearsheet** — Proof-of-publication for a client (after press). PDF of the page their ad appeared on. Legal notices have affidavits (compliance requirement); display ads currently rely on physical paper.

**Subscriber** (`subscribers`) — Person paying for a subscription. Type print or digital. Status active / expired / cancelled / pending.

**Subscription** (`subscriptions`) — One pub × one subscriber instance. Carries tier, start/end dates, auto_renew, Stripe IDs, `paused_at`.

**Drop Location** (`drop_locations`) — A rack/cafe/hotel where copies are placed. Linked to publications via `drop_location_pubs` with quantity per pub.

**Driver Route** (`driver_routes` + `route_stops`) — Ordered list of drop locations a driver hits on a frequency.

**Invoice** (`invoices` + `invoice_lines`) — AR document. `status` enum: draft / sent / overdue / partially_paid / paid / void. Provenance: `sale_id` per line, `contract_id` + `proposal_id` on header, `rep_id` snapshot (frozen at insert time per migration 047).

**Payment** (`payments`) — One incoming payment. Tied to `invoice_id`. `applied_to_credit` flag for overpayments that flow into `clients.credit_balance`.

**Bill** (`bills`) — AP entry. Vendor, amount, date, status. Used by BillsTab; flows to QBO via the `quickbooks_id` link.

**Activity Log** (`activity_log`) — Per-actor, per-event audit + dashboard feed. Schema in migration 170. Powers Hayley's publisher stream and per-role daily feeds.

---

## Statuses & states

**publisher signoff** — `issues.publisher_signoff_at` timestamp set by Hayley. Required before send-to-press is enabled.

**designer signoff** — `ad_projects.designer_signoff_at` set by the ad designer (Jen). Marks proof complete from the design side.

**salesperson signoff** — `ad_projects.salesperson_signoff_at` set by the rep after client approval. Both signoffs flip the project to `signed_off` status.

**send-to-press** — Edge Function + button on the Layout Console that flips `issues.sent_to_press_at` and locks the issue. Triggered by Layout Designer (Anthony) once Publisher signoff is in place.

**ready for layout** — Story status `Ready` + `print_status='on_page'`. Anthony's queue shows these as inbound.

**flag-back** — Anthony's modal that fires a `team_notes` row to the Content Editor when a page needs editorial attention. Shows in Camille's "From Layout" tile.

---

## Financial / accounting

**A/R** — Accounts Receivable. Open invoices not yet paid. Surfaces in Billing > Receivables tab with 4-bucket aging (current / 1-30 / 31-60 / 61-90 / 90+).

**A/P** — Accounts Payable. Vendor bills not yet paid. Surfaces in Billing > Bills tab.

**DSO** — Days Sales Outstanding. A/R balance ÷ avg daily revenue last 30 days. Rough but useful liquidity indicator on Publisher dashboard.

**MTD** — Month-to-date.

**Pacing** — Comparing actual revenue at a point in the cycle against an expected curve. Issue-level pacing (50 / 70 / 85 / 95% at 7 / 5 / 3 / 1 days out). Curve waypoints in `src/modules/PublisherDashboard/constants.js`.

**Pipeline** — Sum of `sales.amount` where status NOT IN ('Closed', 'Follow-up'). Money that's in motion but not yet won.

**Renewal** — A client whose contract end date is within 30 days (or last_ad_date trending toward Lapsed). Surfaces on the Sales CRM Renewals tab.

**Make-good / Credit memo** — Compensation issued when an ad ran wrong, missed, or the client disputes. Currently informal; no credit-memo object yet (gap in BUSINESS_DOMAINS.md).

---

## Permissions & jurisdiction

**Role** — `team_members.role` enum value (Publisher, Editor-in-Chief, Salesperson, Ad Designer, etc.). Drives dashboard branch + alert defaults.

**Module permissions** — `team_members.module_permissions` text array. Each entry is a nav-id (e.g., `sales`, `billing`). Controls sidebar visibility. Admin permission bypasses.

**Jurisdiction** — `team_members.assigned_pubs` (uuid[]). Either `["all"]` or specific pub ids. Scopes most data fetches via `useJurisdiction`. Reps see only their assigned pubs' data.

**Admin** — `team_members.permissions` array containing `'admin'`. Bypasses all module gates and unlocks the role-switcher (impersonate any team member).

---

## Integrations

**StellarPress** — The public-facing CMS rendering published stories on each pub's website. Reads from MyDash's `stories` table (filtered to `audience='public'` and `sent_to_web=true`). Cross-published stories from sister sites surface via `cross_published_stories`.

**BunnyCDN** — CDN for media assets. URLs in `media_assets.cdn_url`.

**QBO / QuickBooks** — Accounting system of record. Invoices, payments, customers sync via `qb-api` Edge Function. `quickbooks_tokens` stores OAuth credentials.

**Stripe** — Payment processor. Card capture (mobile + public PayInvoice page), saved cards (`stripe_customer_id` on clients), recurring subscriptions (`stripe_subscription_id`).

**Gmail** — OAuth-connected sender. `gmail_tokens` per user. Outbound from MyDash uses `sendGmailEmail` RPC; inbound matched to clients via `gmail-ingest-inbound` Edge Function.

**Google Calendar** — OAuth-connected. Used for team calendar surface and (planned) meeting_held auto-capture.

**Amazon SES** — Bulk email service for newsletters and high-volume sends. Replaces Gmail for >500-subscriber lists.
