-- ============================================================
-- 184_ad_sizes_zero_rate_cleanup.sql
--
-- Two-layer fix for the rate_X = 0 sentinel pattern in ad_sizes:
--
--   1. Data normalization — NULL out the zero sentinels on rate_6 /
--      rate_12 / rate_18. Audit (2026-05-01):
--        rate_18 = 0:  63 rows (6 pubs that don't offer 18× tier)
--        rate_12 = 0:   6 rows (pub-what-to-do-malibu — 1×-only)
--        rate_6  = 0:   6 rows (same 6 rows)
--        rate (1×) = 0: 0 rows
--      Aligns the data with the spec convention "NULL means tier not
--      offered" so the existing RPC + UI rules work as written.
--
--   2. RPC defense-in-depth — calculate_proposal_totals_for_self_serve
--      tier branches now require BOTH `rate_X IS NOT NULL` AND
--      `rate_X > 0` before picking that tier. Closes a $0 hole that
--      would have allowed a hand-crafted anon RPC call (quantity=18
--      against a row where rate_18=0) to compute a free print ad.
--      The public booking surface is anon-callable, so the server is
--      the auth boundary — UI tier-visibility rules can't be the only
--      defense.
--
-- After this migration:
--   • All 4 RPCs from mig 183 still work correctly for clean data
--   • Defensive `> 0` check is cheap (single comparison) and prevents
--     future regression if a sentinel zero ever sneaks back in
--   • UI tier-visibility rule (rate_X IS NOT NULL && rate_X > 0)
--     works against either NULL or 0 — same outcome
-- ============================================================

BEGIN;

-- 1. Schema alignment. rate_6 + rate_12 had legacy NOT NULL constraints
-- that forced the zero-sentinel pattern. Relax to match rate_18 (already
-- nullable) so "tier not offered" can be expressed as NULL throughout.
ALTER TABLE ad_sizes ALTER COLUMN rate_6  DROP NOT NULL;
ALTER TABLE ad_sizes ALTER COLUMN rate_12 DROP NOT NULL;

-- 2. Data normalization. Zero-as-sentinel becomes NULL.
UPDATE ad_sizes SET rate_18 = NULL WHERE rate_18 = 0;
UPDATE ad_sizes SET rate_12 = NULL WHERE rate_12 = 0;
UPDATE ad_sizes SET rate_6  = NULL WHERE rate_6  = 0;

-- 2. Defensive RPC. Add `rate_X > 0` to each tier branch.
CREATE OR REPLACE FUNCTION public.calculate_proposal_totals_for_self_serve(
  p_site_id      TEXT,
  p_client_id    UUID,
  p_billing_zip  TEXT,
  p_line_items   JSONB
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_subtotal      NUMERIC(12,2) := 0;
  v_markup_pct    NUMERIC(5,2)  := 0;
  v_markup_amt    NUMERIC(12,2) := 0;
  v_discount_pct  NUMERIC(5,2)  := 0;
  v_discount_amt  NUMERIC(12,2) := 0;
  v_total         NUMERIC(12,2) := 0;
  v_lines         JSONB := '[]'::jsonb;
  v_zip_match     BOOLEAN := false;
  v_local_pct CONSTANT NUMERIC(5,2) := 10.00;
BEGIN
  WITH input AS (
    SELECT (item->>'product_id')::uuid AS product_id,
           COALESCE((item->>'quantity')::int, 1) AS quantity,
           COALESCE(item->>'kind', 'digital') AS kind,
           ord::int AS ord
    FROM jsonb_array_elements(p_line_items) WITH ORDINALITY AS t(item, ord)
  ),
  priced AS (
    SELECT i.ord, i.product_id, i.quantity, p.name, 'digital'::text AS kind,
           p.rate_monthly::numeric(12,2)            AS unit_price,
           (p.rate_monthly * i.quantity)::numeric(12,2) AS line_total,
           p.width::numeric                         AS width,
           p.height::numeric                        AS height,
           NULL::uuid                               AS print_size_id
    FROM input i
    JOIN digital_ad_products p
      ON p.id = i.product_id AND p.pub_id = p_site_id AND p.is_active = true
    WHERE i.kind = 'digital'

    UNION ALL

    -- Print: tier picked by quantity. Each branch requires both
    -- `IS NOT NULL` AND `> 0` so a sentinel zero (post-cleanup these
    -- are gone, but defense-in-depth) can't slip a $0 line through.
    SELECT i.ord, i.product_id, i.quantity, s.name, 'print'::text AS kind,
           CASE
             WHEN i.quantity >= 18 AND s.rate_18 IS NOT NULL AND s.rate_18 > 0 THEN s.rate_18::numeric(12,2)
             WHEN i.quantity >= 12 AND s.rate_12 IS NOT NULL AND s.rate_12 > 0 THEN s.rate_12::numeric(12,2)
             WHEN i.quantity >= 6  AND s.rate_6  IS NOT NULL AND s.rate_6  > 0 THEN s.rate_6::numeric(12,2)
             ELSE s.rate::numeric(12,2)
           END AS unit_price,
           CASE
             WHEN i.quantity >= 18 AND s.rate_18 IS NOT NULL AND s.rate_18 > 0 THEN (s.rate_18 * i.quantity)::numeric(12,2)
             WHEN i.quantity >= 12 AND s.rate_12 IS NOT NULL AND s.rate_12 > 0 THEN (s.rate_12 * i.quantity)::numeric(12,2)
             WHEN i.quantity >= 6  AND s.rate_6  IS NOT NULL AND s.rate_6  > 0 THEN (s.rate_6  * i.quantity)::numeric(12,2)
             ELSE (s.rate * i.quantity)::numeric(12,2)
           END AS line_total,
           s.width                                  AS width,
           s.height                                 AS height,
           s.id                                     AS print_size_id
    FROM input i
    JOIN ad_sizes s
      ON s.id = i.product_id AND s.pub_id = p_site_id
    WHERE i.kind = 'print'
  )
  SELECT
    COALESCE(SUM(line_total), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'product_id',     product_id,
      'name',           name,
      'quantity',       quantity,
      'kind',           kind,
      'unit_price',     unit_price,
      'line_total',     line_total,
      'width',          width,
      'height',         height,
      'print_size_id',  print_size_id
    ) ORDER BY ord), '[]'::jsonb)
  INTO v_subtotal, v_lines FROM priced;

  IF p_client_id IS NOT NULL THEN
    SELECT COALESCE(MAX(i.markup_percent), 0) INTO v_markup_pct
    FROM clients c
    LEFT JOIN industries i ON i.name = ANY(c.industries)
    WHERE c.id = p_client_id;
  END IF;

  IF v_markup_pct > 0 THEN
    v_markup_amt := ROUND(v_subtotal * v_markup_pct / 100.0, 2);
  ELSE
    IF p_billing_zip IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM local_zip_codes
        WHERE site_id = p_site_id AND zip_code = p_billing_zip
      ) INTO v_zip_match;
    END IF;
    IF v_zip_match THEN
      v_discount_pct := v_local_pct;
      v_discount_amt := ROUND(v_subtotal * v_local_pct / 100.0, 2);
    END IF;
  END IF;

  v_total := v_subtotal + v_markup_amt - v_discount_amt;

  RETURN jsonb_build_object(
    'line_items',       v_lines,
    'subtotal',         v_subtotal,
    'markup_applied',   v_markup_pct > 0,
    'markup_percent',   v_markup_pct,
    'markup_amount',    v_markup_amt,
    'discount_applied', v_discount_pct > 0,
    'discount_percent', v_discount_pct,
    'discount_amount',  v_discount_amt,
    'total',            v_total,
    'applied_rule',     CASE WHEN v_markup_pct > 0 THEN 'markup'
                             WHEN v_discount_pct > 0 THEN 'local_discount'
                             ELSE 'none' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_proposal_totals_for_self_serve(TEXT, UUID, TEXT, JSONB)
  TO anon, authenticated;

COMMIT;
