# Decisions Log

This file tracks significant architectural decisions, assumptions, and tradeoffs made during development. Review async and comment if you disagree with any choices.

---

## [2026-04-17] Snapshot rep + contract attribution onto invoices (migration 047)

- **Context:** Billing › Reports › Rep Collections (and Sales Perf, AR Aging) attributed all rep credit through `clients.rep_id`. When a client was reassigned, every historical sale and invoice silently re-credited to the new rep — there was no record of who actually closed/billed the deal. `sales` and `contracts` already carried `assigned_to`; `invoices` did not.
- **Decision:** Added `invoices.rep_id` and `invoices.contract_id` with backfill cascading: invoice_lines.sale_id → sales.assigned_to (majority by line total), then contracts.assigned_to (via the new contract_id), then clients.rep_id (frozen at backfill time), then invoices.created_by. Updated `convert_proposal_to_contract()` RPC v2 to stamp both columns at insert. Patched all client-side write paths (insertInvoice helper, Flatplan auto-invoice). Reports now attribute via the snapshot fields.
- **Alternatives considered:** (a) Leave Rep Collections on `clients.rep_id` and rely on the user to never reassign — fragile, already burned us. (b) Add only `rep_id` and skip `contract_id` — bundled the contract link in the same migration since the link was already implicit via sale → contract and surfacing it costs nothing. (c) Per-record admin override UI in Billing — deferred; bulk transfer covers the common case (rep deactivation/handoff).
- **Why:** Snapshot is the only model that survives org changes. Closed/paid history must not silently rewrite when staffing changes — that's both an audit and a commission-trust issue.
- **Tradeoff to monitor:** Miscoded deals at creation time can no longer be fixed by editing the client. There is currently no per-record override (we only ship bulk transfer via Transfer Open Work). Add per-record override later if miscoding becomes a real complaint.
- **Inactive reps + unattributed invoices:** Reports filter inactive reps out of the salesperson list. Their historical work surfaces in NULL-rep rows, which group by **publication name** (legal-notice trigger creates invoices with no rep, so this also covers that path). Dominant publication for an invoice = the publicationId most common across its lines.
- **Admin reassign UI:** Lives on TeamMemberProfile › Settings as a "Transfer Open Work" panel (admin-only). Backed by two new RPCs: `preview_team_member_work_transfer(from_rep)` and `transfer_team_member_work(from_rep, to_rep, scope flags)`. Only OPEN records move (sales != Closed, invoices in draft/sent/overdue/partially_paid, contracts.status = active, all clients with that rep_id). Closed/paid stays put.
- **Status:** Shipped (migration 047 + frontend patches in same commit). Needs migration apply on staging before the Billing changes go live, or Rep Collections will throw on missing `repId`/`contractId` columns.

---

## [2026-04-13] Increased border-radius tokens (R, Ri)

- **Context:** UI felt too sharp/editorial; wanted a warmer, more modern aesthetic
- **Decision:** Increased `R` from 5px → 18px (card-level rounding) and `Ri` from 3px → 10px (buttons, badges, inputs)
- **Alternatives considered:** 40% increase (R=7, Ri=4) felt too subtle; 100% increase (R=10, Ri=6) still conservative
- **Why:** 18/10 hits the soft-modern sweet spot — iOS/macOS Big Sur vibe — while maintaining editorial monochrome palette integrity. Badges now approach pill-shape which feels friendlier.
- **Status:** Shipped

---

<!-- 
Template for new entries:

## [YYYY-MM-DD] Brief title

- **Context:** What problem or requirement triggered this
- **Decision:** What you chose to do
- **Alternatives considered:** Other options and why you didn't pick them
- **Why:** Reasoning for the choice
- **Status:** Shipped / Proposed / Needs review
-->
