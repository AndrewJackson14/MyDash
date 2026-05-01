# Self-Serve → Print Integration — MyDash Handoff

**Audience:** the MyDash repo agent.
**Purpose:** extend the self-serve proposals pipeline to support print line items sourced from `ad_sizes`. StellarPress ships the customer-facing flow once these server changes land.
**Counterpart spec:** [self-serve-stellarpress-handoff.md](self-serve-stellarpress-handoff.md), [self-serve-booking-integration.md](self-serve-booking-integration.md).
**Last verified against MyDash:** 2026-05-01.

---

## Context

Phase 4 cut self-serve over from `ad_bookings` to `proposals`. Phase 2A (StellarPress side) shipped the catalog visuals + an All / Digital / Print segmented control. The Print tab is currently a stub linking to the rep-contact form because the server-side pipeline only knows `digital_ad_products`:

- `calculate_proposal_totals_for_self_serve` JOINs `digital_ad_products` only — print line items get silently dropped from totals.
- `submit_self_serve_proposal` / `update_self_serve_proposal` write `proposal_lines.digital_product_id`, which is FK to `digital_ad_products(id)`. Sending an `ad_sizes.id` here either FK-errors or coerces to NULL.
- `get_self_serve_proposal` hard-codes the line label fallback to "Digital Ad" and only surfaces `digital_product_id`.

`ad_sizes` itself is fine — 105 rows across 12 publications, anon-readable, with 1× / 6× / 12× / 18× frequency rate columns. The only work is wiring it into the four RPCs above and adding one column to `proposal_lines`.

Once these ship, StellarPress is a one-line change: query `ad_sizes WHERE pub_id = $site_id` alongside `digital_ad_products`, merge with `_kind: 'print'`, swap the Print stub for a real catalog grid + frequency picker.

---

## 1. Schema change — `proposal_lines`

Add a print-side column. **Recommended: parallel column, not a generalize-and-rename.** Existing readers (`get_self_serve_proposal`, the proposal-wizard UI, anything joining `digital_product_id` to `digital_ad_products`) keep working untouched.

```sql
ALTER TABLE proposal_lines
  ADD COLUMN print_size_id UUID REFERENCES ad_sizes(id) ON DELETE SET NULL;

-- At most one catalog FK. Self-serve always sets one; rep-built proposals
-- can have neither (free-text lines for non-catalog pubs / paper-contract
-- imports). Both is forbidden.
ALTER TABLE proposal_lines ADD CONSTRAINT proposal_lines_one_catalog_ref
  CHECK ( (digital_product_id IS NOT NULL)::int + (print_size_id IS NOT NULL)::int <= 1 );
```

**Why `<= 1` and not `= 1`:** audit (2026-05-01) found rep-imported paper-contract lines for pubs that aren't in `ad_sizes` (e.g. `pub-opendoor-directories`). Self-serve submissions always set exactly one catalog FK by construction, so the strict invariant holds for the StellarPress flow even though the column-level CHECK is relaxed — the gate is the RPC, not the column.

A note on the integer rate columns: `ad_sizes.rate / rate_6 / rate_12` are stored as `integer` (not `numeric`), and `rate_18` is nullable. The `::numeric(12,2)` casts in §3a are just for arithmetic safety — readers shouldn't infer that the storage type is anything other than int dollars.

---

## 2. Frontend payload contract

The StellarPress booking flow will send `kind` per line item. To stay back-compat, lines without `kind` default to `digital`.

```js
// p_line_items — what StellarPress will POST
[
  // Digital line — unchanged from today
  {
    kind:           'digital',  // default if omitted
    product_id:     '<digital_ad_products.id uuid>',
    quantity:       3,           // months (existing semantics)
    run_start_date: '2026-05-01',
    run_end_date:   '2026-07-31',
  },
  // Print line — new
  {
    kind:       'print',
    product_id: '<ad_sizes.id uuid>',
    quantity:   6,               // also serves as frequency tier — see below
    run_start_date: '2026-05-01',  // first issue date (informational; rep adjusts)
    run_end_date:   '2026-10-31',  // last issue date
  },
]
```

### Frequency / quantity for print

For `kind='print'`, the server picks the rate column by `quantity`:

| `quantity` | rate column | tier label    |
|------------|-------------|---------------|
| 1          | `rate`      | 1× (open)     |
| 6          | `rate_6`    | 6× frequency  |
| 12         | `rate_12`   | 12× frequency |
| 18         | `rate_18`   | 18× frequency |

`line_total = picked_rate × quantity` (rate columns are per-insertion).

**Recommendation:** if `quantity` is something other than {1, 6, 12, 18}, fall back to the next-lower tier (e.g. quantity=8 → `rate_6`). Cleaner than rejecting. UI restricts to the four canonical values; this is just defensive.

If `kind='print'` and `quantity > 1` but the corresponding rate column is NULL on the `ad_sizes` row (some pubs don't offer frequency discounts), fall back to `rate × quantity`.

### Per-row tier visibility (UI contract)

Tier availability is **per `ad_sizes` row**, not per pub. A pub might offer 18× on Full Page but not on Business Card — the audit confirmed both shapes exist (5 of 12 pubs have `rate_18 NULL` everywhere; the rest mix). `ad_sizes` is anon-readable, so the catalog query already returns `rate / rate_6 / rate_12 / rate_18` per row.

**Rule for the UI:** a tier button is rendered iff the corresponding rate column on that specific size is `NOT NULL`. Don't compute tier visibility per pub — that produces wrong results for mixed pubs.

The server-side fallback in §3a still runs as defense-in-depth (and for hand-crafted RPC calls / rep-side proposal building), but it should never fire from a properly-built self-serve UI. If it does, the customer sees an 18× label charged at 12× pricing — a customer-visible bug. Tier visibility belongs at the render layer.

---

## 3. RPC changes

### 3a. `calculate_proposal_totals_for_self_serve`

Change the priced CTE to UNION digital + print branches. Skeleton:

```sql
WITH input AS (
  SELECT (item->>'product_id')::uuid AS product_id,
         COALESCE((item->>'quantity')::int, 1)         AS quantity,
         COALESCE(item->>'kind', 'digital')            AS kind
  FROM jsonb_array_elements(p_line_items) item
),
priced AS (
  -- Digital branch (today's behavior)
  SELECT i.product_id, i.quantity, p.name, 'digital'::text AS kind,
         p.rate_monthly::numeric(12,2)            AS unit_price,
         (p.rate_monthly * i.quantity)::numeric   AS line_total,
         p.width, p.height,
         NULL::uuid AS print_size_id
  FROM input i
  JOIN digital_ad_products p
    ON p.id = i.product_id AND p.pub_id = p_site_id AND p.is_active = true
  WHERE i.kind = 'digital'

  UNION ALL

  -- Print branch
  SELECT i.product_id, i.quantity, s.name, 'print'::text AS kind,
         CASE
           WHEN i.quantity >= 18 AND s.rate_18 IS NOT NULL THEN s.rate_18::numeric(12,2)
           WHEN i.quantity >= 12 AND s.rate_12 IS NOT NULL THEN s.rate_12::numeric(12,2)
           WHEN i.quantity >= 6  AND s.rate_6  IS NOT NULL THEN s.rate_6::numeric(12,2)
           ELSE s.rate::numeric(12,2)
         END AS unit_price,
         CASE
           WHEN i.quantity >= 18 AND s.rate_18 IS NOT NULL THEN (s.rate_18 * i.quantity)::numeric(12,2)
           WHEN i.quantity >= 12 AND s.rate_12 IS NOT NULL THEN (s.rate_12 * i.quantity)::numeric(12,2)
           WHEN i.quantity >= 6  AND s.rate_6  IS NOT NULL THEN (s.rate_6  * i.quantity)::numeric(12,2)
           ELSE (s.rate * i.quantity)::numeric(12,2)
         END AS line_total,
         s.width, s.height,
         s.id AS print_size_id
  FROM input i
  JOIN ad_sizes s
    ON s.id = i.product_id AND s.pub_id = p_site_id
  WHERE i.kind = 'print'
)
```

Each priced row should include `kind`, `width`, `height`, `print_size_id` in the returned `line_items[]` so downstream RPCs and the get-proposal RPC have what they need.

Industry markup + local zip discount logic is unchanged — they apply to the post-UNION subtotal regardless of kind.

### 3b. `submit_self_serve_proposal` / `update_self_serve_proposal`

In the INSERT INTO `proposal_lines` SELECT, branch on `priced.kind`:

```sql
INSERT INTO proposal_lines (
  proposal_id, publication_id, ad_size, price,
  digital_product_id, print_size_id,
  flight_start_date, flight_end_date, pub_name, sort_order
)
SELECT
  v_proposal_id,
  p_site_id,
  COALESCE(p.priced->>'name', 'Ad'),
  (p.priced->>'line_total')::numeric,
  CASE WHEN p.priced->>'kind' = 'digital'
       THEN NULLIF(p.priced->>'product_id','')::uuid END    AS digital_product_id,
  CASE WHEN p.priced->>'kind' = 'print'
       THEN NULLIF(p.priced->>'product_id','')::uuid END    AS print_size_id,
  NULLIF(o.orig->>'run_start_date','')::date,
  NULLIF(o.orig->>'run_end_date','')::date,
  v_pub_name,
  p.ord::int
FROM jsonb_array_elements(v_totals->'line_items') WITH ORDINALITY AS p(priced, ord)
JOIN jsonb_array_elements(p_line_items) WITH ORDINALITY AS o(orig, ord) USING (ord);
```

The CHECK constraint added in §1 enforces exactly-one. No new error codes needed.

### 3c. `get_self_serve_proposal`

Surface enough for the StellarPress status page to render print and digital lines side-by-side. Update the `v_lines` aggregation:

```sql
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'pub_name',          l.pub_name,
  'publication_id',    l.publication_id,
  'ad_size',           l.ad_size,
  'price',             l.price,
  'flight_start_date', l.flight_start_date,
  'flight_end_date',   l.flight_end_date,
  'kind',              CASE
                         WHEN l.print_size_id   IS NOT NULL THEN 'print'
                         WHEN l.digital_product_id IS NOT NULL THEN 'digital'
                         ELSE 'unknown'
                       END,
  'digital_product_id', l.digital_product_id,
  'print_size_id',      l.print_size_id,
  -- Surface dims so the status page can render the same SVG placeholder
  -- the catalog uses.
  'width',  COALESCE(d.width::numeric,  s.width),
  'height', COALESCE(d.height::numeric, s.height)
) ORDER BY l.sort_order NULLS LAST), '[]'::jsonb)
INTO v_lines
FROM proposal_lines l
LEFT JOIN digital_ad_products d ON d.id = l.digital_product_id
LEFT JOIN ad_sizes           s ON s.id = l.print_size_id
WHERE l.proposal_id = v_proposal.id;
```

---

## 4. Acceptance criteria

- [ ] `proposal_lines` accepts both digital and print rows; CHECK constraint forbids both/neither.
- [ ] `calculate_proposal_totals_for_self_serve` returns correct subtotals for a mixed-kind cart (e.g. 1 digital monthly + 1 print 6×); industry markup and local-zip discount apply to the combined subtotal.
- [ ] `submit_self_serve_proposal` writes one proposal_lines row per cart line; print lines have `print_size_id` set + `digital_product_id NULL` (and vice versa).
- [ ] `update_self_serve_proposal` correctly replaces lines on an Awaiting Review proposal across kind transitions (e.g. removing a print line, adding a digital one).
- [ ] `get_self_serve_proposal` returns `kind`, `width`, `height`, `print_size_id`, `digital_product_id` per line so StellarPress can render visuals + frequency badges.
- [ ] Existing digital-only callers continue to work unchanged (omit `kind` → defaulted to `digital`).
- [ ] Sales-CRM proposal view in MyDash renders mixed proposals correctly (out of scope here if that page already reads `proposal_lines.ad_size` + `price` — confirm).

---

## 5. Open questions for MyDash side

1. **Frequency-as-quantity semantics.** Spec assumes `quantity ∈ {1, 6, 12, 18}` for print and the server picks the matching rate column. If the publisher's preference is "let the customer pick any quantity, server picks the next-lower tier," that's what §2 describes. Confirm or specify.
2. **Print line and `flight_*` dates.** Currently `proposal_lines.flight_start_date / flight_end_date` are dates. Print runs are issue-keyed, not date-range-keyed. For now StellarPress will send the first/last issue date and the rep will refine. **Phase 3 of this overall track adds an issue picker tied to `issues.pub_id`.** Decide: continue to use flight dates as a coarse window, or add a separate `issue_ids[]` column on `proposal_lines`? — **Resolved:** flight dates for now. Audit confirmed `proposal_lines.issue_id text` already exists, so Phase 3's single-issue keying lands without a schema change. Multi-issue would still want a `proposal_line_issues` linking table when that picker ships.
3. **Catalog visibility for solo print products.** Some pubs in `ad_sizes` are publications StellarPress doesn't currently host (e.g. `pub-cdt`, `pub-pps`). Should the booking flow's catalog hide rows whose `pub_id` isn't a hosted StellarPress site, or is the Phase-2A pub-scoped query (`WHERE pub_id = $site_id`) enough? StellarPress assumes the latter.
4. **Decline-reason email.** Still flagged in [self-serve-stellarpress-handoff.md](self-serve-stellarpress-handoff.md) — orthogonal to print, just a reminder that it's still on the open list.

---

## 6. Build order

1. Apply schema migration (proposal_lines column + CHECK).
2. Update `calculate_proposal_totals_for_self_serve` in place — back-compat for digital-only payloads, new print branch.
3. Update `submit_self_serve_proposal` + `update_self_serve_proposal` in lockstep so the line-insert SELECT writes the right column.
4. Update `get_self_serve_proposal` to surface `kind`, dims, both id columns.
5. Verify mixed-kind cart pricing matches what a rep would compute by hand against the rate card.
6. Ping StellarPress to ship Phase 2B (catalog merge + frequency picker) and Phase 3 (issue picker for print).

---

## Things NOT to do

- Don't generalize `digital_product_id` → `catalog_id` + `catalog_kind`. Existing readers (proposal wizard, contract templates, etc.) will break in non-obvious places. Parallel column is safer.
- Don't recompute markup or local-zip discount per kind. They apply to the combined subtotal; the existing post-priced math is correct.
- Don't reject quantities that aren't in {1, 6, 12, 18}. Fall back to the next-lower rate tier — robustness.
- Don't render frequency-tier buttons whose rate column is NULL on the specific `ad_sizes` row. Tier visibility is **per row, not per pub** — see §2 "Per-row tier visibility." Rendering an unbacked tier and relying on the server fallback produces a customer-visible bug (18× label, 12× price).
- Don't surface `proposal_signatures` data through `get_self_serve_proposal` for print-only proposals that haven't been Sent yet. The existing `signing_url` rule (latest unsigned, unexpired row) handles this.

Ping when shipped and StellarPress will pick up Phase 2B.
