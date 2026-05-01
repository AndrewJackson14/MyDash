# Self-Serve Booking — MyDash Integration Brief

**Audience:** the external agent scoping the self-serve booking flow.
**Purpose:** ground the five open decisions in what MyDash already has, so we don't seed parallel data or duplicate schema.
**Last verified against production:** 2026-04-30.

---

## Q1. Sibling grouping → add `publications.ad_sibling_group`

MyDash has `publications.legal_pub_group` ([migration 106b](../../supabase/migrations/106b_legal_notices_affidavit_workflow.sql)) — but it's scoped to legal-notice affidavit sequencing, not ad cross-sell. Don't reuse it.

### Sibling rule (publisher's definition)

> **Two pubs are ad siblings if they share the same ad-size catalog AND the same publication schedule.**

Both conditions must be true. An ad designed for one runs in the other with no resizing or schedule shift, so the cross-sell is a one-click add.

### Confirmed sibling pairs (rule applied to current data)

| ad_sibling_group | members                                                          | rationale                                |
|------------------|------------------------------------------------------------------|------------------------------------------|
| `prp_atn`        | `pub-paso-robles-press`, `pub-atascadero-news`                   | Both Weekly, 15 sizes each, shared trim  |
| `prm_anm`        | `pub-paso-robles-magazine`, `pub-atascadero-news-maga`           | Both Monthly, 8 / 9 sizes, shared trim   |

**Note:** A newspaper and its city magazine are **not** siblings — PRP runs Weekly on a tabloid trim, PRM runs Monthly on an 8.375 × 10.875 magazine trim. PRP cross-sells to ATN, **not** to PRM.

### Solos (no sibling under the rule)

These pubs do **not** have a same-size + same-schedule partner today:

- `pub-the-malibu-times` (Weekly, 17 sizes, no other Weekly with that trim)
- `pub-santa-ynez-valley-st` (Semi-Monthly, 10 sizes — only Semi-Monthly pub)
- `pub-morro-bay-life` (Monthly, 8 sizes, but different trim from PRM/ANM)
- `pub-malibu-magazine`, `pub-calabasas-style`, `pub-central-coast-living` (all Bi-Monthly, but different trims)

If a future pub launches with a matching size catalog **and** schedule, it joins the existing group. If two solos converge to the same catalog + schedule, that's a new group. The rule is the test, not the table.

### Schema

```sql
ALTER TABLE publications ADD COLUMN ad_sibling_group TEXT;

UPDATE publications SET ad_sibling_group = 'prp_atn'
  WHERE id IN ('pub-paso-robles-press', 'pub-atascadero-news');
UPDATE publications SET ad_sibling_group = 'prm_anm'
  WHERE id IN ('pub-paso-robles-magazine', 'pub-atascadero-news-maga');
```

Other pubs stay `NULL`. Cross-sell UI hides for solo pubs.

### Sibling lookup query

```sql
SELECT id, name FROM publications
WHERE ad_sibling_group = (
  SELECT ad_sibling_group FROM publications WHERE id = $1
)
AND id <> $1
AND ad_sibling_group IS NOT NULL;
```

---

## Q2. Industries seed → use the existing `industries` table

Do **not** seed a 10-item list. MyDash consolidated to a DB-backed taxonomy on 2026-04-30 ([migration 174](../../supabase/migrations/174_industries_seed_and_publisher_rls.sql)). 33 names live, anon-readable.

**Schema:**
```sql
industries (
  id              UUID PRIMARY KEY,
  name            TEXT NOT NULL,        -- 'Wine & Spirits'
  slug            TEXT UNIQUE NOT NULL, -- 'wine-spirits'
  markup_percent  NUMERIC(5,2)          -- 0 by default; >0 surcharges bookings
)
```

**RLS:**
- `SELECT` — `anon` and `authenticated` (read all)
- `INSERT/UPDATE/DELETE` — `authenticated` AND (`global_role='super_admin'` OR `role='Publisher'`)

**Booking-flow query:**
```sql
SELECT id, name, slug FROM industries ORDER BY name;
```

If the booking flow needs a curated short list, **add a `featured BOOLEAN` column** to the existing table. Don't create a parallel list — drift kills the markup pricing engine.

`markup_percent` is already wired into `calculate_booking_totals` server-side. The flow just needs to render the chosen industry — don't apply markup client-side.

---

## Q3. Print product seed → don't seed; read `ad_sizes`

Real rate cards already live per pub in `ad_sizes`. 105 rows across 12 publications.

**Schema:**
```sql
ad_sizes (
  id          UUID PRIMARY KEY,
  pub_id      TEXT REFERENCES publications(id),
  name        TEXT,    -- 'Full Page', '1/2 Page V', 'Double Truck'
  dims        TEXT,    -- '11.125 x 20.75'
  width       NUMERIC, -- inches, exact
  height      NUMERIC,
  rate        INTEGER, -- 1× rate, dollars
  rate_6      INTEGER, -- 6× frequency
  rate_12     INTEGER, -- 12× frequency
  rate_18     INTEGER, -- 18× frequency
  sort_order  INTEGER
)
```

**PRP sample (sanity-check the proposed defaults):**

| name        | dims              | 1× rate  |
|-------------|-------------------|----------|
| Double Truck| 22.25 × 20.75     | $5,478   |
| Full Page   | 11.125 × 20.75    | **$1,399** |
| 3/4 Page    | 11.125 × 15.5     | $999     |
| 1/2 Page V/H| various           | $749     |

The proposed placeholder `$800 / $450 / $250 / $140 / $80` is **roughly half** of real PRP rates and unrelated to the actual size ladder. Reading `ad_sizes WHERE pub_id = $1` returns the correct list, real prices, and frequency tiers — no seed needed.

**Booking-flow query:**
```sql
SELECT id, name, dims, width, height, rate, rate_6, rate_12, rate_18
FROM ad_sizes
WHERE pub_id = $1
ORDER BY sort_order, rate DESC;
```

---

## Q4. Visuals → SVG placeholders, generated inline

**Existing Supabase Storage buckets:** `editions`, `media`, `media_assets`. No ad-mockup bucket. No BunnyCDN bucket of mockups exists in MyDash.

**Recommended action:** **(c) — generate stylized SVG placeholders inline** showing `width × height` dims and the size name. Cheap, deterministic, no upload step, scales to any ratio.

When real mockup images become available, add a column to `ad_sizes`:
```sql
ALTER TABLE ad_sizes ADD COLUMN preview_url TEXT;
```
Then have the booking flow prefer `preview_url` and fall back to the SVG. No re-seed, no new table.

---

## Q5. End-of-flow cross-sell scope

Two cleaner options than blanket auto-discount:

### Option A — Show cross-sell at full rate
Pure additive. The customer chose to add; the discount is theirs to negotiate, not the system's to give.

### Option B — Pre-defined "Sibling Bundle" SKU at a tracked discount
Add a row to a `bundles` table (new) that points at sibling pub_ids and carries an explicit `discount_percent`. The cross-sell card surfaces the bundle rather than computing a discount in the UI.

**Recommendation: A first.** Ship the cross-sell with full rates and one-click add. Track add-rate. If conversion is low, layer Option B in a later iteration with discount visible in the UI ("Bundle PRP + ATN — save 10%").

Avoid silent auto-discounts: leaves money on the table, hides pricing logic from sales reps, and makes proposals built outside the self-serve flow look more expensive than the self-serve path.

---

## Cross-cutting integration notes

- **Don't seed**: industries, print sizes, sibling groups, rate cards. All exist in MyDash today.
- **Don't fork**: read MyDash tables directly (or via an edge function if RLS is too tight from the public booking origin).
- **Anon-readable tables that are safe to query from the public booking site**: `industries`, `digital_ad_products` (per [migration 116](../../supabase/migrations/116_industries_anon_read.sql)). `ad_sizes` and `publications` need an explicit anon SELECT policy if the booking flow runs as anon — flag if you need that opened up.
- **Markup engine**: `calculate_booking_totals` (Postgres function) consumes `industries.markup_percent` server-side. Don't reapply it client-side.

## Open items that need a MyDash-side decision

1. **`featured` flag on industries** — only if the booking flow wants a curated short list rather than all 33.
2. **Anon SELECT on `ad_sizes` and `publications`** — needed if the booking flow runs unauthenticated.

Ping when ready and we'll spec the migration.
