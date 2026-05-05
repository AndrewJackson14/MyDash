# Self-Serve → Multi-Pub Cart — MyDash Handoff

**Audience:** the MyDash repo agent.
**Purpose:** extend the self-serve proposals pipeline so a single proposal can carry lines spanning multiple publications. Today it's hard-coded to one pub per proposal, which forces sibling-pub bookings into separate proposals and breaks the "one cart, one signing flow" UX vision.
**Counterpart specs:** [self-serve-booking-integration.md](self-serve-booking-integration.md), [self-serve-print-integration.md](self-serve-print-integration.md), [self-serve-issue-picker-integration.md](self-serve-issue-picker-integration.md), [self-serve-stellarpress-handoff.md](self-serve-stellarpress-handoff.md).
**Last verified against MyDash:** 2026-05-01.

---

## Context

Phase 4A on StellarPress shipped the cross-sell link-out: when a customer is on a pub with an ad sibling (per the new `publications.ad_sibling_group`), they see "Book in {sibling}" buttons that open a fresh self-serve flow on the sibling's domain. Each pub remains its own proposal.

That's a real conversion lever, but it's the smaller of the two Phase 4 asks. The larger one — **mixed-pub cart in a single proposal** — needs server work because:

1. **`submit_self_serve_proposal` hardcodes `publication_id = p_site_id` on every line:**
   ```sql
   INSERT INTO proposal_lines (..., publication_id, ...) SELECT ..., p_site_id, ...
   ```
   So every line ends up tagged with the originating pub regardless of what the line actually is.

2. **`calculate_proposal_totals_for_self_serve` JOINs catalogs with `pub_id = p_site_id`:**
   ```sql
   JOIN digital_ad_products p ON p.id = i.product_id AND p.pub_id = p_site_id ...
   JOIN ad_sizes s ON s.id = i.product_id AND s.pub_id = p_site_id
   ```
   A line whose product lives in the sibling pub's catalog won't match the join and gets silently dropped from the subtotal.

3. **`assigned_to` is picked from the originating pub's salesperson assignments only.** Mixed-pub proposals need to land with one rep — current logic produces a sensible default, but reps may want a multi-pub override.

`publications.ad_sibling_group` is the gate: a line whose pub is in the customer's sibling group is allowed; anything else gets rejected. This stops customers booking arbitrarily across all 12 pubs.

---

## 1. Schema — already done

`publications.ad_sibling_group TEXT` was added in `add_ad_sibling_group_to_publications` (StellarPress migration). Currently:

| group     | members                                                |
|-----------|--------------------------------------------------------|
| `prp_atn` | pub-paso-robles-press, pub-atascadero-news             |
| `prm_anm` | pub-paso-robles-magazine, pub-atascadero-news-maga     |

No further schema work needed for 4B itself.

---

## 2. Frontend payload contract

Each line item gains an optional `publication_id`. Lines without it default to `p_site_id` (the originating pub). Validation: lines whose `publication_id` differs from `p_site_id` must reference a pub in the same `ad_sibling_group`.

```js
// p_line_items — a mixed-pub print + digital cart
[
  // Originating-pub line (publication_id can be omitted; defaults to p_site_id)
  {
    kind:       'digital',
    product_id: '<digital_ad_products.id uuid>',
    quantity:   3,
    run_start_date: '2026-05-01',
    run_end_date:   '2026-07-31',
  },
  // Sibling-pub line (must be in p_site_id's ad_sibling_group)
  {
    kind:           'print',
    publication_id: 'pub-atascadero-news',
    product_id:     '<ad_sizes.id uuid in atascadero-news>',
    quantity:       6,
    run_start_date: '2026-05-07',
    run_end_date:   '2026-06-11',
    issue_ids:      [...],   // when 3B ships; otherwise ignored
  },
]
```

Server-side validation:

- For each line where `publication_id IS NOT NULL AND publication_id <> p_site_id`:
  - The originating pub (`p_site_id`) and the line's pub must share a non-null `ad_sibling_group`. Throw `pub_not_sibling` otherwise.
  - The line's `product_id` must reference a row in the corresponding catalog (`digital_ad_products` for digital, `ad_sizes` for print) with `pub_id = line.publication_id`. Existing per-kind catalog joins already do this — they just need to be parameterized by line, not by `p_site_id`.

---

## 3. RPC changes

### 3a. `calculate_proposal_totals_for_self_serve`

Today's CTE filters catalog rows by `p_site_id`. Replace with per-line publication scoping. Each line carries its `publication_id` (defaulted to `p_site_id` when missing), and the JOIN uses the line's pub instead of the global one.

Skeleton:

```sql
WITH input AS (
  SELECT
    (item->>'product_id')::uuid                                  AS product_id,
    COALESCE((item->>'quantity')::int, 1)                        AS quantity,
    COALESCE(item->>'kind', 'digital')                           AS kind,
    COALESCE(item->>'publication_id', p_site_id)                 AS publication_id
  FROM jsonb_array_elements(p_line_items) item
),
priced AS (
  -- Digital branch
  SELECT i.product_id, i.quantity, i.publication_id, p.name, 'digital'::text AS kind,
         p.rate_monthly::numeric(12,2)            AS unit_price,
         (p.rate_monthly * i.quantity)::numeric   AS line_total,
         p.width, p.height,
         NULL::uuid AS print_size_id
  FROM input i
  JOIN digital_ad_products p
    ON p.id = i.product_id AND p.pub_id = i.publication_id AND p.is_active = true
  WHERE i.kind = 'digital'

  UNION ALL

  -- Print branch
  SELECT i.product_id, i.quantity, i.publication_id, s.name, 'print'::text AS kind,
         <existing tier-rate CASE>,
         <existing tier-rate × quantity CASE>,
         s.width, s.height,
         s.id AS print_size_id
  FROM input i
  JOIN ad_sizes s
    ON s.id = i.product_id AND s.pub_id = i.publication_id
  WHERE i.kind = 'print'
)
```

Sibling-validation block runs ahead of the CTE:

```sql
-- p_site_id's sibling group (or null if it has none).
SELECT ad_sibling_group INTO v_my_group FROM publications WHERE id = p_site_id;

-- Reject any line whose pub differs from p_site_id and isn't in the same group.
IF EXISTS (
  SELECT 1 FROM jsonb_array_elements(p_line_items) item
  JOIN publications pub
    ON pub.id = COALESCE(item->>'publication_id', p_site_id)
  WHERE COALESCE(item->>'publication_id', p_site_id) <> p_site_id
    AND (v_my_group IS NULL OR pub.ad_sibling_group IS DISTINCT FROM v_my_group)
) THEN
  RAISE EXCEPTION 'pub_not_sibling';
END IF;
```

Subtotal / markup / discount logic unchanged — they apply to the merged subtotal as today. Local-zip discount keys off `p_site_id` only (the customer's billing zip is matched against the originating pub's local zip codes); no change.

### 3b. `submit_self_serve_proposal` / `update_self_serve_proposal`

In the INSERT INTO `proposal_lines` SELECT, swap the hardcoded `p_site_id` for the per-line publication_id:

```sql
INSERT INTO proposal_lines (
  proposal_id, publication_id, ad_size, price,
  digital_product_id, print_size_id,
  flight_start_date, flight_end_date, pub_name, sort_order
)
SELECT
  v_proposal_id,
  COALESCE(o.orig->>'publication_id', p_site_id)            AS publication_id,
  COALESCE(p.priced->>'name', 'Ad'),
  (p.priced->>'line_total')::numeric,
  CASE WHEN p.priced->>'kind' = 'digital' THEN NULLIF(p.priced->>'product_id','')::uuid END,
  CASE WHEN p.priced->>'kind' = 'print'   THEN NULLIF(p.priced->>'product_id','')::uuid END,
  NULLIF(o.orig->>'run_start_date','')::date,
  NULLIF(o.orig->>'run_end_date','')::date,
  -- pub_name is denormalized for read performance; pull it per-line
  -- via a join or a CTE rather than the existing single-pub v_pub_name var.
  (SELECT name FROM publications
     WHERE id = COALESCE(o.orig->>'publication_id', p_site_id)),
  p.ord::int
FROM jsonb_array_elements(v_totals->'line_items') WITH ORDINALITY AS p(priced, ord)
JOIN jsonb_array_elements(p_line_items) WITH ORDINALITY AS o(orig, ord) USING (ord);
```

The validation block from §3a should be replicated here so persistence enforces the same sibling-group invariant the calculator does.

The proposal-level `industry_id` and `assigned_to` derivation stay scoped to `p_site_id`. Open to revisit if reps want a "split commission across pubs" model, but out of scope for this handoff.

### 3c. `get_self_serve_proposal`

Already exposes per-line `publication_id` (the column was always there — submit just hardcoded it). When 4B ships, lines from different pubs naturally show their own pub_name + publication_id. No change needed unless we want to add a cross-pub summary header.

If grouping by pub on the status page is desired, the caller can `groupBy(line.publication_id)` client-side. Recommend StellarPress group lines under each pub's name when there's more than one pub represented.

---

## 4. Acceptance criteria

- [ ] `calculate_proposal_totals_for_self_serve` correctly prices a mixed-pub cart (e.g. 1 PRP digital + 1 ATN print at 6×); each line joins against its own pub's catalog. Industry markup + local-zip discount apply to the combined subtotal.
- [ ] `submit_self_serve_proposal` writes one proposal_lines row per cart line; each row carries the line's pub_id (not just `p_site_id`).
- [ ] Sibling-validation invariant: a line whose `publication_id` differs from `p_site_id` AND isn't in the same `ad_sibling_group` errors with `pub_not_sibling` from both the calculator and the persistence path.
- [ ] `update_self_serve_proposal` correctly handles transitions (adding a sibling-pub line to an existing proposal, removing one) on Awaiting Review proposals.
- [ ] Existing single-pub callers (no `publication_id` in payload) continue to work unchanged — defaults to `p_site_id` per line.
- [ ] Sales-CRM proposal view in MyDash renders multi-pub proposals correctly (out of scope here if that page already iterates `proposal_lines.publication_id` + `pub_name` — confirm).

---

## 5. Open questions for MyDash side

1. **Salesperson assignment.** Currently picks from `salesperson_pub_assignments WHERE publication_id = p_site_id`. For a mixed-pub proposal (e.g. PRP + ATN), the rep is whoever covers PRP — even if 80% of the cart value is in ATN. OK for now, or split commission?
2. **Industry markup.** Computed once from the client's industry + `industries.markup_percent`, applied to the merged subtotal. Per-pub variation isn't supported and probably shouldn't be.
3. **Local-zip discount.** Keyed off `p_site_id` (the originating pub's `local_zip_codes`). For a mixed-pub cart, this may favor or penalize one pub. Recommend keeping as-is — the originating pub captured the customer first.

---

## 6. Build order

1. Update `calculate_proposal_totals_for_self_serve`: per-line publication scoping, sibling-validation block.
2. Update `submit_self_serve_proposal` + `update_self_serve_proposal` in lockstep — same validation, per-line `publication_id` write.
3. Verify a roundtrip: PRP customer submits a mixed-pub cart with one ATN print line → both lines persist with correct `publication_id` → fetch via `get_self_serve_proposal` → both lines come back grouped by pub.
4. Reject test: a line with `publication_id = pub-the-malibu-times` from a PRP customer errors `pub_not_sibling`.
5. Ping StellarPress to ship Phase 4B (sibling-pub catalog merge in the cart, group-by-pub display in the status page).

---

## Things NOT to do

- Don't allow lines to reference any pub the customer isn't in the sibling group of. The whole point of `ad_sibling_group` is bounded scope.
- Don't widen the salesperson assignment lookup. One rep per proposal — Sales CRM expects this.
- Don't recompute the local-zip discount per pub. It's a single-decision, single-rate gate.
- Don't break the default-to-p_site_id behavior. Existing callers send no `publication_id` and must continue to work.

Ping when shipped and StellarPress will pick up Phase 4B (cart UI for sibling pubs + grouped status page).
