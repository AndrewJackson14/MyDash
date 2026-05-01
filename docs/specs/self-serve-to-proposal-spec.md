# Self-Serve → Proposal Unification — Build Spec

**Version:** 1.0
**Last updated:** 2026-04-30
**Owner:** Nic Mattson (Support Admin)
**Status:** Ready for implementation

---

## Goal

Eliminate the parallel `ad_bookings` intake pipeline. Route StellarPress self-serve submissions directly into the existing `proposals` table as `Awaiting Review` drafts. Talk-to-a-Rep submissions continue to land in `ad_inquiries` (no change). Delete the Booking Queue page and the `ad_bookings`/`ad_booking_line_items` tables.

**Result:** One revenue pipeline. Two intake shapes (self-serve cart, rep-mediated lead). Same downstream flow (proposal → contract → sales → ad project → invoice).

---

## Why

Today there are two parallel inbound channels for advertising revenue:

1. **Booking Queue** (`ad_bookings`) — cart-based self-serve submissions from StellarPress `/advertise/self-serve`
2. **Inquiries tab** (`ad_inquiries`) — open-ended lead form submissions from StellarPress `/advertise`

Both come from the same `/advertise` gate on StellarPress. Both target the same advertisers. Both consume the same `digital_ad_products` catalog. Both ultimately need a sales rep to take action. The only real difference is intake **shape**, not intake **purpose**.

The Booking Queue invented a parallel lifecycle (submitted → approved → scheduled → live → completed, plus a creative_status state machine) that runs alongside the proposals → contracts → sales pipeline. This duplicates infrastructure (status state machines, conflict detection, creative review, advertiser portals) that already exists in the proposal/contract/ad-project flow.

By routing self-serve submissions into `proposals` as Drafts, the rep gets a unified queue, the advertiser gets the same downstream experience as a managed deal, and the codebase loses ~1,500 lines of parallel pipeline logic.

---

## Scope of Changes

### Database

- Add columns to `proposals`:
  - `source` text NOT NULL DEFAULT 'rep_built' — values: `rep_built`, `self_serve`
  - `self_serve_token` text UNIQUE — for advertiser-side resume/edit on StellarPress
  - `intake_email` text — the email the advertiser used at the StellarPress identify step
  - `calculated_pricing` jsonb — server-side pricing breakdown (subtotal, markup, discount, total)
  - `awaiting_review_at` timestamptz — when the self-serve submission landed
- Add `Awaiting Review` to the `proposals.status` enum (or text constraint, depending on current schema).
- Add column to `proposal_lines`:
  - `flight_start_date` date, `flight_end_date` date — already exist on the table per the codebase scan; verify and reuse.
- Migrate existing `ad_bookings` rows → `proposals` (see Migration section).
- **Drop** `ad_bookings`, `ad_booking_line_items` after migration verifies.

### Backend (Supabase Edge Functions / RPCs)

- New RPC: `submit_self_serve_proposal(p_site_id, p_existing_advertiser_id, p_new_advertiser, p_billing_zip, p_intake_email, p_line_items, p_creative_notes)` — replaces `submit_self_serve_booking`. Inserts a proposal in `Awaiting Review` status, creates proposal_lines, returns `{proposal_id, share_token}`.
- New RPC or extension: `assign_proposal_to_default_rep(p_proposal_id)` — looks up default rep for the publication on the proposal's first line, sets `proposals.assigned_to`. Falls back to NULL if no default rep configured.
- Keep: `resolve-advertiser` edge function (no change).
- Keep: `calculate_booking_totals` RPC, but rename → `calculate_proposal_totals_for_self_serve` (same logic, called during the Browse & Book review step before submit).
- Keep: `get_prior_inquiry_products` (no change — preloads cart from prior inquiry).
- Add: `assigned_to` resolution rule on the advertisers/clients side — see "Advertiser → Client Resolution" below.
- Delete: `submit_self_serve_booking` RPC (after migration window).

### StellarPress Frontend

- `SelfServePage.jsx` — replace the submit call from `submit_self_serve_booking` to `submit_self_serve_proposal`. Navigate to `/advertise/self-serve/proposal/{share_token}` instead of `/booking/{share_token}`.
- `BookingStatusPage.jsx` — rename to `ProposalStatusPage.jsx`. Replace `ad_bookings` reads with `proposals` reads (using `self_serve_token`). Display:
  - Proposal status (Awaiting Review / In Review / Sent / Signed)
  - Line items + totals (read from proposal_lines)
  - "Resume editing" if status = Awaiting Review (advertiser can revise before rep picks it up)
  - "View & Sign" if status = Sent (links to existing proposal-signing flow)
  - Creative upload happens **after signing**, on the Ad Project portal — remove the pre-conversion creative upload from this page.
- `AdvertisePage.jsx` — no change. Talk-to-a-Rep continues to write to `ad_inquiries`.
- Routing: redirect `/advertise/self-serve/booking/:token` → `/advertise/self-serve/proposal/:token` for the migration window so any in-flight links work.

### MyDash Frontend

- **Delete** `src/pages/BookingsQueue.jsx` and any related components.
- **Delete** `src/data/pageMeta.js` entry for `bookings-queue`.
- **Remove** Booking Queue from sidebar (handled by separate sidebar reorg spec).
- `src/pages/sales/SalesCRM.jsx` (or wherever the proposals tab lives):
  - Add filter chip "Self-serve · Awaiting Review" at the top of the Proposals tab.
  - Add a small `🛒` badge to proposals where `source = 'self_serve'`.
  - Filter chips show count of proposals in `Awaiting Review` status.
- Proposal detail panel (existing component):
  - When `source = 'self_serve'`, show a "Self-serve submission" banner at the top with intake email and submit timestamp.
  - Show `calculated_pricing` breakdown as read-only context (rep can override line prices).
  - Add primary actions: **Send as-is** (transitions to Sent, fires existing send-to-advertiser flow), **Edit & Send** (transitions to Draft for rep editing), **Reject** (transitions to Rejected with reason — same as existing proposal rejection).
- `useAppData.jsx`:
  - Remove `ad_bookings` realtime subscription (the channel `ad_inquiries_realtime` actually subscribes to `ad_inquiries` — keep that). If there's a separate `ad_bookings` realtime channel, remove it.
  - Add realtime subscription for new self-serve proposals: filter on `proposals` INSERT where `source = 'self_serve'` → toast notification + badge update.
  - Update `loadProposals` to include the new columns (`source`, `self_serve_token`, `intake_email`, `calculated_pricing`, `awaiting_review_at`).
- Activity log: add new event type `proposal_received_self_serve` to `event_type` taxonomy. Fires on insert when `source = 'self_serve'`. Surfaces in Hayley's Publisher Dashboard activity stream.

---

## Advertiser → Client Resolution

The `resolve-advertiser` edge function returns one of three tiers. Map each to the proposal's `client_id`:

### Tier 1: Exact email match
`resolve-advertiser` finds an existing client contact with this exact email. The advertiser is bound to that client.
- **Action:** Set `proposals.client_id = matched_client_id`. No new client record.

### Tier 2: Domain match
`resolve-advertiser` finds an existing client whose domain matches. Advertiser confirmed "Yes, that's me" on StellarPress.
- **Action:** Set `proposals.client_id = matched_client_id`. No new client record. (If the email isn't on the client's contact list, optionally insert it as a new contact — leave for follow-up; don't auto-add in v1.)

### Tier 3: New advertiser
No match. StellarPress collected business_name, industry, phone, billing_zip.
- **Action:** Insert a new row in `clients` with:
  - `name = business_name`
  - `status = 'Lead'`
  - `category` derived from industry_id
  - `billing_zip = billing_zip`
  - `lead_source = 'self_serve_proposal'`
- Insert primary contact in `client_contacts` with the intake email + phone.
- Set `proposals.client_id = new_client_id`.

This logic lives inside `submit_self_serve_proposal` RPC so it's atomic.

**Note on Tier 1 client status:** If the matched client is currently in `Lapsed` status, do NOT silently revive them — leave the status as-is and let the rep decide on review. The rep dashboard already surfaces lapsed-client reactivation as a separate signal.

---

## Rep Assignment

When a self-serve proposal lands, `assigned_to` should be set deterministically:

1. **Look up the publication on the first proposal line.**
2. **Find the default sales rep for that publication.** Source: `salesperson_pub_assignments` table, where `is_active = true` and `percentage = 100` (sole rep) or the highest-percentage rep if multiple are assigned.
3. **If no default rep:** leave `assigned_to = NULL`. Surface in a "Needs Owner" filter on the Sales CRM proposals tab — Hayley assigns manually.
4. **If multiple pubs in the cart:** Use the rep for the publication with the highest line total. Tie-break on first line in the cart.

This logic lives inside `submit_self_serve_proposal` RPC.

**Future enhancement (out of scope for v1):** Round-robin or load-balance among reps for the publication. Add a `salesperson_pub_assignments.intake_priority` column when needed.

---

## Pricing Reconciliation

The Browse & Book flow computes pricing server-side via `calculate_booking_totals`:
- Subtotal (sum of line `base_price_cents × quantity`)
- Industry markup (per-industry % adjustment, applied to subtotal)
- Local-zip discount (10% if billing_zip is in the publication's local service area)
- Total

On self-serve proposal submission:
- Each `proposal_lines.price` = the server-calculated per-line price **with markup/discount baked in proportionally**. This way the rep sees realistic per-line numbers in the proposal builder.
- `proposals.total` = the server-calculated grand total.
- `proposals.calculated_pricing` jsonb stores the unbaked breakdown:
  ```json
  {
    "subtotal_cents": 240000,
    "markup_percent": 5.0,
    "markup_amount_cents": 12000,
    "discount_percent": 10.0,
    "discount_amount_cents": 25200,
    "total_cents": 226800,
    "billing_zip": "93446",
    "industry_id": "<uuid>",
    "computed_at": "2026-04-30T14:23:11Z"
  }
  ```

The rep can edit any line price in the existing proposal editor. Edits do NOT recompute markup/discount — once a rep touches a line, the original server pricing is informational only. Show `calculated_pricing` in a read-only "Original self-serve pricing" panel in the proposal detail.

---

## Status Lifecycle

New status added: `Awaiting Review`. Full self-serve proposal lifecycle:

```
Awaiting Review        ← self-serve submit
       │
       ├─ rep clicks "Send as-is"  → Sent          (fires existing send-to-advertiser flow)
       ├─ rep clicks "Edit & Send" → Draft         (rep modifies, then transitions to Sent normally)
       └─ rep clicks "Reject"      → Rejected      (rejection reason emailed to advertiser via existing template)
       │
       │  Once Sent:
       │
       ▼
     Sent → Signed → Signed & Converted → contract → sales → ad project → invoice → tearsheet
```

This is identical to the rep-built proposal lifecycle from Sent onward. The only addition is the `Awaiting Review` entry state.

**Activity log events:**
- `proposal_received_self_serve` — fires on insert with `source='self_serve'`
- `proposal_sent` — fires on transition to Sent (existing event, no change)
- `proposal_rejected_self_serve` — fires on transition to Rejected from `Awaiting Review` (distinct from a rep rejecting their own draft)
- `contract_signed`, `payment_received`, etc. — all existing, no change

---

## Creative Flow

### Today (in `ad_bookings`)
Self-serve advertiser uploads creative pre-conversion via the booking-status link. `creative_status` state machine: pending_upload → uploaded → in_preflight → preflight_passed → designer_approved → client_approved.

### After this build
Creative upload happens **post-conversion**, on the Ad Project portal — same as every other sale.

Flow:
1. Advertiser submits self-serve proposal with `creative_notes` (free-text description of what they want).
2. Rep sends the proposal. Advertiser signs. Proposal converts to contract.
3. `convert_proposal_to_contract` RPC auto-creates Ad Projects (already happens today).
4. The Ad Project's existing portal link is sent to the advertiser. They upload creative there. Designer Studio handles preflight, designer approval, client approval (existing flow).

**What this changes for the advertiser experience:** Today they upload creative immediately on submit. After this build, they upload after signing the proposal. Slight delay but cleaner — and matches how every managed sale already works.

**Migration of in-flight bookings:** Any existing `ad_bookings` rows with `creative_status` past `pending_upload` need their creative assets migrated to the corresponding Ad Project. See Migration section.

---

## Migration of Existing `ad_bookings` Data

**Pre-migration audit (run first):**
```sql
SELECT status, COUNT(*) FROM ad_bookings GROUP BY status;
SELECT creative_status, COUNT(*) FROM ad_bookings GROUP BY creative_status;
```

**Migration approach by current state:**

| Current `ad_bookings.status` | Migration |
|---|---|
| `submitted` | Create proposal in `Awaiting Review` status. Map line items to proposal_lines. |
| `approved` | Create proposal in `Sent` status (rep already approved; treat as if rep sent). Don't auto-convert to contract — rep needs to confirm advertiser signed off. Surface in a "Migrated bookings — confirm" filter for review. |
| `scheduled` | Create proposal + contract + sales (run the conversion path). Carry creative state forward to a new Ad Project. |
| `live` | Same as `scheduled`. |
| `completed` | Same as `scheduled` but with status `completed`. |
| `rejected` | Create proposal in `Rejected` status with rejection reason. |
| `cancelled` | Create proposal in `Rejected` status with cancellation reason in notes. |

**Creative asset migration:** For any booking with creative uploaded, locate the asset in storage (`ad_bookings.creative_url` or wherever it lives), copy/link to the new Ad Project's creative slot, preserve the creative_status mapping into the Ad Project's existing equivalent fields.

**Migration script:** Single file `supabase/migrations/{NNN}_migrate_bookings_to_proposals.sql`. Wrap in a transaction. Include verification queries at the end (row counts, FK integrity checks). Roll back on any error.

**Cutover order:**
1. Apply schema migration (add columns to `proposals`, add `Awaiting Review` status).
2. Deploy MyDash frontend changes (Booking Queue page hidden, proposal detail handles self-serve).
3. Deploy backend RPC `submit_self_serve_proposal`.
4. Deploy StellarPress frontend changes (`SelfServePage` writes to new RPC).
5. Run migration script (existing bookings → proposals).
6. Verify: no traffic on `submit_self_serve_booking`, no UI references to Booking Queue, all bookings migrated.
7. Drop `ad_bookings` and `ad_booking_line_items` tables.
8. Delete legacy edge function `submit_self_serve_booking`.

---

## File Structure (MyDash)

### Files to delete
```
src/pages/BookingsQueue.jsx
src/data/pageMeta.js (remove the bookings-queue entry)
```

### Files to modify
```
src/pages/sales/SalesCRM.jsx (or proposals component) — add self-serve filter, badge, banner
src/components/proposal-wizard/* — handle source='self_serve' display in detail
src/hooks/useAppData.jsx — add proposals columns, remove ad_bookings refs, add realtime sub
src/AppRouter.jsx — remove BookingQueue route
```

### File structure (StellarPress)
```
src/pages/SelfServePage.jsx — change submit RPC + redirect URL
src/pages/BookingStatusPage.jsx → rename to ProposalStatusPage.jsx — full rewrite to read proposals
src/main.jsx (or router) — update route, add redirect from old URL
```

---

## Permissions / RLS

- `proposals.source` and `proposals.self_serve_token` — readable by service role and the assigned rep. Self-serve token is the auth mechanism for unauthenticated advertisers to view their own proposal on StellarPress (same pattern as existing `proposals.share_token` if one exists, or the `clients.portfolio_token` pattern).
- `submit_self_serve_proposal` RPC — callable by `anon` role (StellarPress submits without auth). Validates input server-side. Rate-limited per IP.
- Status transition `Awaiting Review → Rejected` — only by assigned rep or admin (Publisher). Same as existing reject permissions.

---

## Activity Log Integration

Add to event_type taxonomy (in `daily-activity-log-spec.md` if not already there):

| Event type | Category | Source | Triggers |
|---|---|---|---|
| `proposal_received_self_serve` | `outcome` | `system` | INSERT on proposals where source='self_serve' |
| `proposal_rejected_self_serve` | `outcome` | `mydash` | UPDATE proposals.status to Rejected when previous status was Awaiting Review |

Both events surface in Hayley's Publisher Dashboard activity stream.

`proposal_sent` (existing event) continues to fire when the rep sends a self-serve proposal — no special handling needed.

---

## Acceptance Criteria

### Functional
- [ ] StellarPress `/advertise/self-serve` end-to-end: identify → catalog → review → submit creates a `proposals` row with `source='self_serve'`, `status='Awaiting Review'`, `self_serve_token` populated.
- [ ] Tier 1/2/3 advertiser resolution all map correctly to `client_id` (existing client or new Lead).
- [ ] Rep assignment lands on the correct rep based on first-line publication; falls back to NULL when no default rep exists.
- [ ] StellarPress `/advertise/self-serve/proposal/{token}` shows the submitted proposal with current status; allows resume-editing while in `Awaiting Review`.
- [ ] MyDash Sales CRM proposals tab shows self-serve proposals with `🛒` badge and "Self-serve · Awaiting Review" filter.
- [ ] Proposal detail panel shows self-serve banner, original calculated pricing breakdown, and Send as-is / Edit & Send / Reject actions.
- [ ] "Send as-is" transitions to Sent and fires existing send-to-advertiser flow.
- [ ] "Reject" transitions to Rejected and emails advertiser using existing rejection template.
- [ ] Realtime: new self-serve proposal arriving fires a toast notification on the assigned rep's session.
- [ ] Activity log: `proposal_received_self_serve` event appears in Hayley's stream when a new submission lands.

### Migration
- [ ] All existing `ad_bookings` rows migrated to `proposals` with correct status mapping.
- [ ] All existing `ad_booking_line_items` migrated to `proposal_lines`.
- [ ] Creative assets from in-flight bookings linked to Ad Projects.
- [ ] Pre/post row counts match (modulo any deliberately archived/excluded rows).
- [ ] FK integrity verified: every migrated proposal has valid client_id, every proposal_line has valid proposal_id and publication_id.
- [ ] After migration verifies, `ad_bookings` and `ad_booking_line_items` tables dropped.

### Cleanup
- [ ] `BookingsQueue.jsx` deleted.
- [ ] `pageMeta.js` entry for `bookings-queue` removed.
- [ ] StellarPress `BookingStatusPage.jsx` renamed and rewritten as `ProposalStatusPage.jsx`.
- [ ] Legacy edge function `submit_self_serve_booking` deleted.
- [ ] Sidebar reorg removes Booking Queue (coordinate with sidebar-reorg-spec).
- [ ] No references to `ad_bookings` remain anywhere in MyDash or StellarPress codebases (grep confirms).

---

## Out of Scope (Future)

- Round-robin / load-balanced rep assignment (v1 uses default rep per pub).
- Auto-add advertiser email as a contact on Tier 2 domain match (leave for rep follow-up).
- Pricing recompute when rep edits self-serve line prices (v1 treats rep edits as authoritative; original pricing preserved as informational).
- Proposal Status page on StellarPress showing creative upload UI before signing (v1 defers creative to post-conversion Ad Project portal).
- Lapsed-client auto-revive on Tier 1 match (v1 leaves status as-is).
- Per-publication self-serve enable/disable flag (v1 assumes all pubs with `digital_ad_products` accept self-serve).

---

## Open Questions for Implementer

Before writing the migration script, verify in the codebase:

1. **`advertisers` vs `clients` schema.** Is `ad_bookings.advertiser_id` an FK to `advertisers` (separate table) or to `clients` directly? If separate, the migration needs to map advertisers → clients. If `clients`, the mapping is direct.

2. **`proposals.share_token` existence.** Is there already a token-based advertiser-view-proposal pattern? If yes, reuse it (the `self_serve_token` column may already exist by another name). If no, create the column.

3. **Existing booking volume.** Run `SELECT COUNT(*), status FROM ad_bookings GROUP BY status;` and report counts before writing the migration script — affects whether migration is straightforward or needs careful handling of large `live`/`scheduled` populations.

4. **`creative_status` storage.** Where is the actual creative asset URL stored on `ad_bookings`? Need to know to write the asset-migration logic.

5. **Proposal status enum vs text.** Is `proposals.status` a Postgres enum or a text column with a CHECK constraint? Determines how `Awaiting Review` is added.

6. **Default-rep lookup logic.** Does any existing code already implement "default rep for publication X"? If yes, reuse it. If no, write the rule fresh per the spec above.

Stop and confirm answers with Nic before proceeding past Phase 1.

---

## Build Order

### Phase 1: Discovery (must complete and report back before Phase 2)
1. Answer the 6 Open Questions above by reading the codebase.
2. Run the pre-migration audit queries; report counts.
3. Confirm proposed migration mappings with Nic.

### Phase 2: Schema + RPC
4. Migration: add columns to `proposals`, add `Awaiting Review` status.
5. Write `submit_self_serve_proposal` RPC. Test in dev with a synthetic submission.
6. Update activity log event_type taxonomy.

### Phase 3: MyDash frontend
7. Update `useAppData.jsx` to include new proposals columns + realtime sub for self-serve inserts.
8. Update Sales CRM proposals tab: filter chip, badge, count.
9. Update proposal detail panel: self-serve banner, calculated_pricing display, Send as-is / Edit & Send / Reject actions.
10. Verify `proposal_received_self_serve` activity log events appear in Hayley's stream.

### Phase 4: StellarPress frontend
11. Update `SelfServePage.jsx` submit call.
12. Build `ProposalStatusPage.jsx` (rewrite of BookingStatusPage).
13. Update StellarPress router: new route, redirect from old route.
14. End-to-end test: submit a self-serve proposal, verify it lands in MyDash, rep sends it, advertiser sees the Sent proposal, signs, conversion happens.

### Phase 5: Migration
15. Write and dry-run the `ad_bookings → proposals` migration script in dev.
16. Verify row counts, FK integrity, creative asset linking.
17. Apply to production during a low-traffic window.
18. Verify in production: spot-check 10 migrated bookings of various statuses.

### Phase 6: Cleanup
19. Delete `BookingsQueue.jsx`, remove pageMeta entry, remove sidebar entry.
20. Drop `ad_bookings` and `ad_booking_line_items` tables.
21. Delete `submit_self_serve_booking` edge function.
22. Final grep: no references to `ad_bookings` anywhere.

---

## Notes for Implementer

- **Do not skip Phase 1.** The migration approach depends on answers to the Open Questions. Bad assumptions will cost a rollback.
- **Test the rep-assignment rule with synthetic publications.** A pub with no default rep, a pub with multiple reps at different percentages, a multi-pub cart — verify each lands correctly.
- **The self-serve proposal must be editable by the rep BEFORE it's sent.** The "Edit & Send" path transitions to Draft. Confirm the existing proposal editor works on a proposal that came in via self-serve (no fields should be locked or missing because of the source).
- **Don't auto-fire the send-to-advertiser email on the original submit.** That email fires when the rep clicks "Send as-is" or transitions Draft → Sent. Self-serve submission is internal-facing only.
- **The `calculated_pricing` jsonb is informational.** Do not use it to auto-recompute totals on rep edits. The rep is authoritative once they touch a line.
- **StellarPress redirects:** Make sure both `/advertise/self-serve/booking/:token` (legacy) and `/advertise/self-serve/proposal/:token` (new) work for at least 90 days. Email links sent before the migration may use the old URL.
- **If the rep rejects a self-serve proposal:** The advertiser still sees the proposal on their `/advertise/self-serve/proposal/:token` page, with status "Not Accepted" and the rejection reason. Don't delete the proposal — keep the audit trail.
