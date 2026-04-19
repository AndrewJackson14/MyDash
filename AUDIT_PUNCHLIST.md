# MyDash Audit Punch List — 2026-04-19

Aggregated from 3 parallel sweeps (Risk, Bloat, Bottlenecks). Findings have been
spot-verified against the codebase; agent claims that didn't hold are dropped or
corrected. Items are grouped into workstreams the user can triage independently.

Severity: 🔴 critical · 🟠 high · 🟡 medium · 🟢 low

---

## WS-1 · Migration numbering cleanup 🔴

**Eight migration files share four numbers**, leaving execution order undefined:
- `026_team_notes_expiration.sql` + `026_stellarpress_stories_integration.sql`
- `031_scheduled_tasks_cron.sql` + `031_social_posts_rls_content_editor.sql`
- 2 files at `032_*`
- 2 files at `033_*`

**Why it matters:** Supabase's runner uses filesystem order (filename sort) — `026_s*` runs before `026_t*` alphabetically, which may not match the dependency intent. The Risk agent flagged: 031_social_posts assumes 026 created the table, but **which 026 runs first?** Fresh deploys could fail or land in a corrupted schema state.

**Fix:** Rename the later-written file in each pair to `026a_*`, `031a_*`, etc. Cheap text rename in git; no data rewrite. **Effort: 15 min.**

**Open question:** these have already been applied to production — so the issue is only "what happens on a fresh seed" (e.g., a new staging environment). If we never reseed, this is theoretical. Confirm before fixing.

---

## WS-2 · RLS tighten 🟠

**`ad_placements_read` is wide open** ([070_ad_placements_live.sql:54](supabase/migrations/070_ad_placements_live.sql#L54)):

```sql
create policy "ad_placements_read" on ad_placements for select using (true);
```

Any authenticated user can read every digital ad placement — competitor creative URLs, flight schedules, CTR (when impression logging lands). I wrote this so StellarPress (anon) could serve ads, but it's broader than needed.

**Fix:** Split into two policies — anon read of `is_active = true` rows only (what serving needs), authed read scoped by `client_id IN (assigned)` or `has_permission('admin')`. **Effort: 20 min.**

**Possible second case:** `social_posts` policies in mig 031 may now orphan-target a renamed table (mig 033 renamed it to `social_posts_archived`). I haven't verified the rename actually happened — needs a 5-min DB check before acting.

---

## WS-3 · OFFSET → keyset pagination 🟠

**Five remaining OFFSET pagination sites in [useAppData.jsx](src/hooks/useAppData.jsx):**

| Line | Table | Page size | Risk |
|---|---|---|---|
| 286 | sales (12mo window) | 1000 | High — sales is 41k rows, query times out past offset 18k |
| 319 | sales (per-client) | 1000 | Medium — usually small, but unbounded |
| 453 | stories | 1000 | Medium — grows over time |
| 733 | media_assets | 1000 | High — unbounded, grows on every upload |
| 1589 | sales (another loader) | 1000 | High — same pattern as 286 |

**Fix:** Same pattern we used for receivables — switch to `WHERE id > cursor ORDER BY id LIMIT 1000`. **Effort: 30-45 min per site, or one batched pass for ~2 hours.**

---

## WS-4 · Boot load reduction 🟡

[useAppData.jsx:1225-1227](src/hooks/useAppData.jsx#L1225-L1227): commission_ledger loads up to **5000 rows** on every boot, capped only by a 2-year cutoff. Bills load 500 rows, ad_inquiries 500 rows — those are fine.

**Fix:** Cap to 1500 rows or 12 months, lazy-load older entries when the user opens the Commissions panel. **Effort: 30 min.**

Also worth: editions loads unbounded (line 961). Defensive `.limit(500)` in case future seeds explode. **5 min.**

---

## WS-5 · Index gaps 🟡

Boot queries that filter on unindexed columns (per the bottleneck sweep):
- `invoices.status` — filtered in `q.in('status', [...])` on boot
- `payments.received_at` — filtered via `.gte()` on boot

Both are sub-second today (smaller tables); will degrade as data grows.

**Fix:** Two index migrations. **Effort: 10 min.**

```sql
create index if not exists idx_invoices_status on invoices(status);
create index if not exists idx_payments_received_at on payments(received_at);
```

---

## WS-6 · Dead code removal 🟢

**Verified findings (spot-checked):**
- 3 debug `console.log('>>> ...')` calls in [useAppData.jsx:260,262,265](src/hooks/useAppData.jsx#L260-L266) — relics from boot debugging.
- 2 unused formatter exports in [src/lib/formatters.js](src/lib/formatters.js): `fmtDateTime`, `fmtTimeHour`. (Bloat agent claimed 5 — but `fmtDateLong` has 5 callers, `fmtAgo` has 4.)
- Unused imports `Bar` in [Billing.jsx](src/pages/Billing.jsx), `Card` in [Analytics.jsx](src/pages/Analytics.jsx).

**Fix:** Mechanical cleanup. **Effort: 15 min total.**

---

## WS-7 · Silent error swallowing 🟢

Two `catch {}` patterns drop diagnostic info:
- [BillsTab.jsx:401](src/pages/BillsTab.jsx#L401) — JSON parse error swallowed; bill upload failures show generic message.
- [Analytics.jsx:1064](src/pages/Analytics.jsx#L1064) — malformed referrer URLs silently dropped from referral aggregation.

**Fix:** Add `console.warn(e)` minimum. Optionally surface a UI toast. **Effort: 10 min.**

---

## WS-8 · Big files — no action recommended 🟢

| File | Lines |
|---|---|
| Billing.jsx | 2226 |
| DashboardV2.jsx | 1748 |
| SalesCRM.jsx | 1657 |
| Analytics.jsx | 1150 |
| AdProjects.jsx | 1143 |

These are large but **coherent** — each is one big page with related concerns. Splitting them would create churn without clear payoff. Revisit only if a specific file becomes a merge-conflict hotspot or needs major feature work.

---

## Findings dropped after verification

- **"5 unused formatters"** (Bloat agent) — actually 2. `fmtDateLong` and `fmtAgo` are used.
- **"Nested useMemo chains in Billing"** — works fine at current scale; profile before refactoring.
- **"Parallel N+1 in MySites/Billing"** — actually parallel `Promise.all`, not sequential. At expected scale (5-50 calls) this is acceptable.
- **"convert_proposal_to_contract doesn't validate digital_product_id"** — the FK constraint prevents orphans; the validation would be redundant.

---

## Recommended sequencing

**Tier 1 (do first, low risk, high value — ~1 hr total):**
1. WS-6 dead code cleanup
2. WS-5 index migration
3. WS-7 error logging

**Tier 2 (medium risk, real-world impact — ~3 hrs):**
4. WS-3 OFFSET → keyset migration (5 sites)
5. WS-4 commission ledger boot cap
6. WS-2 ad_placements RLS tighten

**Tier 3 (housekeeping):**
7. WS-1 migration renumbering — only if we expect a fresh seed

**Tier 4 (skip unless triggered):**
8. WS-8 big-file splits — defer

**Total Tier 1+2+3: ~5 hours of focused work.**
