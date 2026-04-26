# Decisions Log

This file tracks significant architectural decisions, assumptions, and tradeoffs made during development. Review async and comment if you disagree with any choices.

---

## [2026-04-26] UI Refresh v2 — Steel Office layer (checkpoint 1: tokens only)

- **Context:** Spec at `docs/ui-refresh/01-direction-decisions-v2.md` adds the missing "modern CRM/infrastructure" register to the Press Room v1 work — steel canvas, hover wash, glass on chrome. Three checkpoints, this commit covers checkpoint 1 (tokens + global.css + theme.js only; no component changes yet).
- **Decision:** Implemented every checkbox under "Tokens (src/styles/global.css)" and "src/lib/theme.js" verbatim from the v2 doc. Body background flips from `var(--paper)` to `var(--canvas)` (steel-50 light / steel-900 dark). Paper register opts in via `[data-surface="paper"]`. `--hover-wash` and `--active-wash` replace the `opacity: 0.88` global hover rule. `--md-glass-blur` and `[data-glass]` `@supports`-guarded selector land but no component consumes them yet.
- **Alternatives considered:** None for the bulk — the v2 doc was specific. The two judgment calls noted below.
- **Why:** Stop point 1 is explicit: "Don't touch any components yet. Run the app, take a screenshot of the Today/dashboard page in light and dark mode, and report back." So component-level work (glass on Sidebar/TopBar/MetadataStrip, FloatingPanel primitive, Card inset highlight) explicitly waits for checkpoint 2 approval.
- **Status:** Awaiting Andrew's review of the canvas tone in light + dark before checkpoint 2 begins.

### Branch lineage deviation

- **Spec said:** "Branch: ui-refresh/v2-steel-glass off ui-refresh/main."
- **What I did:** Branched off `main` instead.
- **Why:** `ui-refresh/main` and `main` had diverged because earlier phases were cherry-picked to `main` rather than merge-merged. `ui-refresh/main` was 9 commits behind `main` (missing the Phase-4 primitives, Phase-5 Z proxy, Phase-6 motion, Phase-7 QA report, the action-blue work, the TopBar consolidation, and the single-header collapse). Branching off `ui-refresh/main` would have cut v2 work against an outdated baseline. `main` is the canonical post-v1 state.

### Z.bgChrome — token vs intent

- **Spec said:** Update `Z.bgChrome` to point at the new steel canvas value.
- **What I did:** Set both `Z.bgCanvas` and `Z.bgChrome` to `#f0f4f9` (light) / `#142433` (dark).
- **Caveat:** In v2, chrome surfaces (Sidebar, TopBar, MetadataStrip) will not actually use `Z.bgChrome` — they'll consume the `glass()` mixin instead. So `Z.bgChrome` becomes a fallback / non-glass-render value. Flagging because the literal hex on `Z.bgChrome` is now load-bearing only for components that don't migrate to glass in checkpoint 2.

### `[data-glass]` selector convention

- **Spec said:** "Every glass surface includes a fallback" — gave the recipe but not the hook.
- **What I did:** Used a `[data-glass]` attribute selector inside the `@supports` block. Components opt in by adding `data-glass` to their root element.
- **Alternatives considered:** A `.glass-surface` class (the spec's example), or scoping inside the `glass()` mixin's inline-style return. Picked the data-attribute because (a) it composes cleanly with React inline styles without adding className handling, (b) keeps the fallback in CSS where the cascade can win over inline styles when the browser flag misses, (c) lets us grep for opt-in in Phase 7 QA.

### `tbody tr:hover` updated alongside

- **Spec said:** Hover applies to "table rows" — listed in the global rule selectors.
- **What I did:** Also updated the existing `tbody tr:hover` `!important` rule (was `var(--action-soft)`) to `var(--hover-wash)` so table rows match every other interactive surface.
- **Why:** The selector is too specific to be replaced by the global rule (the existing `!important` would override the global anyway). Flipping it to the same wash keeps the hover language consistent.

### Paper grain opacity values

- **Spec said:** `0.015` light, `0.03` dark.
- **What I did:** Verbatim. Flagging because this is half the previous value (was 0.02 / 0.04). The grain becomes barely-perceptible on cool steel — load-bearing if you remove it but invisible if you're looking for it. Andrew's call on the v2 doc is explicit.

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

## [2026-04-25] May Sim P0.1 web_status backfill — verified, no action needed

- **Context:** May Sim doc P0.1 called for a backfill of 11,421 stories with `web_status='none'`, claiming a stale state from a prior bulk import. Specced as a P0 blocking onboarding (would otherwise produce a flood of false-positive "Republish" badges in EditorialDashboard).
- **Decision:** No backfill executed. Production state was investigated before any mutation: 88,874 stories carry `web_status='published'` correctly; only 9 are `web_status='none'`, of which 7 are draft pieces (status='Draft', no `published_at`, correctly excluded from web) and 2 are obits with admin-set `published_at` but `sent_to_web=false` and `status='Ready'` — intentionally pre-staged, not yet on the web.
- **Alternatives considered:** (a) Run the spec'd mass-backfill (would be no-op for 88,874 + harmful for the 2 obit edge cases by flipping them live before edit). (b) Force-flip the 2 outliers to web_status='published' (rejected — `sent_to_web=false` is the user-visible truth and these stories are intentionally pre-staged).
- **Why:** The doc was written from a stale snapshot. The trigger `sync_story_web_status` (mig 081) has been quietly handling the backfill for any row touched since 2026-04 via the `sent_to_web` lockstep. The 11,421 figure was outdated by months.
- **Status:** Verified clean. No migration. The other 12 May Sim batches (P0.2/P0.3/P0.4/P1.2/P1.3/P1.5/P1.6/P2.1/P2.2/P2.3/P2.13/P2.18) shipped sequentially in this session.

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
