---
title: Cross-role Workflows
last_updated: 2026-04-29
version: 1.0
---

# Cross-role Workflows

These are the load-bearing processes that span multiple roles. Each role file references the relevant workflow by anchor (e.g., `_shared/workflows.md#ad-lifecycle`).

---

## Ad lifecycle

Lead → cash. The single longest-running cross-role process in the company.

1. **Lead capture** — Inbound via web form, walk-in, referral, or rep prospecting. Lands in `ad_inquiries` (web form) or directly as a Sales pipeline opportunity. *Owner: Sales Rep.*
2. **Qualify + assign rep** — Rep confirms fit, assigns themselves (or routes to a teammate). `clients.rep_id` set. *Owner: Sales Rep / Sales Manager.*
3. **Discovery** — Sale created with `status='Discovery'`. Rep logs calls/emails/meetings via QuickLog or inline buttons; effort events flow to `activity_log`.
4. **Proposal built** — Rep opens the Proposal Wizard. Picks pubs, issues, ad sizes, dates. Rate tier auto-picked from term length. *Owner: Sales Rep.*
5. **Proposal sent** — `proposals.sent_at` stamped. Emits `proposal_sent` event (outcome). *Triggers Hayley's stream.*
6. **Proposal signed** — Public ProposalSign page captures signature + IP + UA. `proposal_signatures` row written.
7. **Convert to contract** — `convert_proposal_to_contract` RPC fires. Mints `contracts` + `contract_lines` + per-issue `sales` rows + `ad_projects` for each line that needs design. Emits `contract_signed` event (outcome). *Owner: Sales Rep (clicks Convert) → system (RPC).*
8. **Brief intake** — Sales Rep fills the brief (headline, style, colors, instructions) on the new ad project. Camera-ready ads skip to step 11.
9. **Design** — Ad Designer (Jen) builds proof v1. `ad_projects.status='proof_sent'`. Emits `proof_sent_for_approval` event (outcome).
10. **Client review + revisions** — Client opens public ProofApproval page (annotated pin-on-image). Approves or requests changes. Revisions accrue; v4+ trigger billable charges (`revision_charges`).
11. **Designer signoff** — Jen marks `designer_signoff_at`. Status flips to `approved`. Emits `proof_approved` (outcome).
12. **Salesperson signoff** — Rep confirms client approval. `salesperson_signoff_at`. Status flips to `signed_off`. Emits `ad_press_ready` (outcome). *Both signoffs gate placement.*
13. **Flatplan placement** — Layout Designer (Anthony) drops the ad onto its page in Flatplan. `sales.page` + `grid_row` + `grid_col` set; `ad_projects.status='placed'`.
14. **Layout console — page complete** — Anthony marks each page complete in Layout Console (`flatplan_page_status.completed_at`). Emits `page_press_ready` event (outcome).
15. **Publisher signoff** — Hayley reviews and signs off issue. `issues.publisher_signoff_at` stamped. Emits `issue_signed_off` (outcome). *Single load-bearing approval.*
16. **Send to press** — Anthony triggers send-to-press. `issues.sent_to_press_at` stamped. Issue is locked.
17. **Invoice mint** — `insertInvoice` runs (per-close, per-run, or monthly per `billing_schedule`). Emits `invoice_issued` (outcome).
18. **Invoice sent** — Email goes out via Gmail or SES. `email_log` row → activity_log mirror via mig 171 trigger.
19. **Payment** — Client pays via Stripe (PayInvoice page) / ACH / check. `payments` row written. Emits `payment_received` (outcome).
20. **Reconcile + QBO sync** — Office Admin verifies the payment; QBO sync runs via `qb-api` EF.
21. **Commission** — `commission_ledger` row materializes per the rep's commission_trigger (sold / paid / both). Surfaced in Sales > Commissions.
22. **Tearsheet** — *Gap.* No auto-generation today.
23. **Renewal** — When `contract_end_date` is within 30 days, the client surfaces in Sales CRM > Renewals tab.

**Decision points where Hayley sees a stream event:** 5 (proposal sent), 7 (contract signed), 9 (proof sent), 11 (proof approved), 12 (ad press ready), 14 (page press ready), 15 (issue signoff), 17 (invoice issued), 19 (payment received).

---

## Editorial flow

Pitch → published. Owner roles in parens at each step.

1. **Pitch / assignment** — Editor-in-Chief or Content Editor adds story with `status='Draft'`, sets `assigned_to`, `due_date`. *Owner: Editor-in-Chief.*
2. **Draft written** — Writer/Reporter or freelancer fills body. Status stays `Draft`.
3. **Submitted for edit** — Writer marks done; status → `Edit`. Emits `story_filed` event (outcome).
4. **Edit pass** — Content Editor (Camille) edits in StoryEditor. Autosave fires; first-edit-of-day emits `story_worked_on` (effort, idempotent per day per story).
5. **Approve for web / print** — `web_approved` and/or `approved_for_print_by/at`. Status → `Ready`.
6. **Schedule or publish to web** — Camille / Editor-in-Chief flips `sent_to_web=true`. Emits `story_published` (outcome). Scheduled flips happen via cron (planned, not yet running).
7. **Cross-publish + newsletter + social** — Story propagates to `cross_published_stories`, gets included in upcoming newsletter, queued for SocialComposer.
8. **Print placement** — Story assigned to a print issue + page via `page_stories`. `print_status='on_page'`.
9. **Print proofread → approved → sent_to_press** — `print_status` advances. Layout Console marks page complete (see ad lifecycle step 14).
10. **Issue ships** — Per ad lifecycle step 15-16. `print_published_at` stamps for each story in the issue.
11. **Post-publish corrections** — `correction_note`, `corrected_after_publish`, `last_correction_at` stamped if anything is updated after press.

**Hayley sees:** step 6 (story published), step 11 (corrections — currently transition events, no dedicated alert).

---

## Issue press-readiness

The handoff sequence between Layout Designer (Anthony) and Publisher (Hayley) that gates send-to-press.

1. **Anthony marks all pages complete** — Layout Console → page-by-page checklist. Each completion writes `flatplan_page_status.completed_at` and emits `page_press_ready` (outcome).
2. **Issue surfaces on Hayley's "Awaiting Your Signoff" tile** — Filter: next 14 days, no `sent_to_press_at`, no `publisher_signoff_at`.
3. **Hayley signs off** — Click "Sign off" on the dashboard tile or in Layout Console. Writes `publisher_signoff_at` + `publisher_signoff_by`. Emits `issue_signed_off` (outcome).
4. **Anthony's "Send to Press" button enables** — Gated on `publisher_signoff_at IS NOT NULL`.
5. **Anthony triggers send-to-press** — Edge Function fires; `sent_to_press_at` stamps. Issue locks.
6. **Tearsheet workflow** — *Gap.* No auto-generation today.

**Migration:** `144_anthony_p1_issues_publisher_signoff.sql` introduced the two columns gating this flow.

---

## A/R cycle

Invoice → payment → reconciliation. Office Admin (Cami) is the primary owner.

1. **Invoice minted** — Per ad lifecycle step 17. Status starts at `draft` or jumps straight to `sent` depending on call site.
2. **Invoice sent** — Email via Gmail or SES with PayInvoice link. `email_log` mirrors to `activity_log` via mig 171 trigger.
3. **Payment received** — Client pays via Stripe / ACH / check. Cami records via Billing > Invoice > Add Payment, OR the Stripe webhook auto-records.
4. **Apply payment to invoice** — `payments.invoice_id` set; `invoices.balance_due` decremented. Overpayments flip into `clients.credit_balance` via `applied_to_credit` flag.
5. **Reconcile to QBO** — `qb-api` EF syncs invoice + payment to QuickBooks. `quickbooks_synced_at` stamps.
6. **AR aging** — 4-bucket report (current / 1-30 / 31-60 / 61-90 / 90+) on Billing > Reports + Office Admin dashboard.
7. **Dunning** — *Gap.* No automated reminder cadence today; Cami manually reads the aging report.
8. **Make-good / credit memo** — *Gap.* No credit-memo object today.

**Hayley sees:** A/R aging on her dashboard's stacked bar; click-through to Collections.

---

## Subscription renewal cadence

The 60/30/10-day reminder process for print/digital subscribers approaching expiry.

1. **Identify expiring subs** — `subscribers.expiry_date` within 60 days; status='active'.
2. **60-day notice** — `first_notice_sent` flag flipped after email send. *Currently manual via Circulation > Subscribers > Send Renewal modal.*
3. **30-day notice** — `second_notice_sent`. Manual.
4. **10-day notice** — `third_notice_sent`. Manual.
5. **Auto-renew via Stripe** — If `auto_renew=true` and Stripe subscription active, the Stripe webhook handles `invoice.payment_succeeded` and rolls `end_date` forward. *Verify the loop is closed end-to-end — flagged in BUSINESS_DOMAINS.*
6. **Manual renewal** — Cami records via Circulation > Subscribers > New Subscription (renewed_from links to prior).

**Spec gap:** the cron-driven 60/30/10 cadence is captured in the schema but not yet implemented. *Decision in BUSINESS_DOMAINS Walk #5 #3 — high value when wired.*

---

## Quick-log surfaces

Where manual entries flow through MyDash:

- **Sales rep call** — QuickLogButton (⌘L) → SalesCallForm. Writes `phone_call_logged` event (effort). Surfaces in rep's daily target progress, NOT in Hayley's stream.
- **Sales rep inline buttons** — SalesCRM kanban card has 📞 and ✉️ buttons. Same `phone_call_logged` / `email_sent` shape, also writes to `client.comms`.
- **Office Admin task / help** — QuickLogButton → OfficeAdminForm. Writes `helped_team_member` (if team member tagged) or `manual_task_logged`. Both `manual_log` category — surface in Hayley's stream.
- **Support Admin journal** — SupportAdminJournal page. Writes to `support_admin_journal` (separate table, private RLS), NOT activity_log. Hayley does not see these.
