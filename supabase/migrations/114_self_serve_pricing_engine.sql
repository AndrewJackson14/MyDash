-- ─────────────────────────────────────────────────────────────
-- Pricing rules engine
--
-- Single source of truth for line-item pricing + markup + discount.
-- Called by the client for display (via RPC) and by the booking-submit
-- path for the authoritative total. Returning the same JSON shape both
-- places means client display and server-stored amounts can be
-- compared exactly during testing.
--
-- Rules (locked):
--   IF advertiser.industry.markup_percent > 0
--     → apply that markup, SKIP discount
--   ELSE IF billing_zip IN local_zip_codes for site_id
--     → apply 10% discount
--   ELSE
--     → no adjustment
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calculate_booking_totals(
  p_site_id      TEXT,
  p_advertiser_id UUID,
  p_billing_zip  TEXT,
  p_line_items   JSONB  -- [{ "product_id": "uuid", "quantity": 1 }, ...]
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal_cents      BIGINT := 0;
  v_markup_percent      NUMERIC(5,2) := 0;
  v_markup_amount_cents BIGINT := 0;
  v_discount_percent    NUMERIC(5,2) := 0;
  v_discount_amount_cents BIGINT := 0;
  v_total_cents         BIGINT := 0;
  v_lines               JSONB := '[]'::jsonb;
  v_zip_match           BOOLEAN := false;
  v_local_discount_pct  CONSTANT NUMERIC(5,2) := 10.00;
BEGIN
  WITH input AS (
    SELECT
      (item->>'product_id')::uuid AS product_id,
      COALESCE((item->>'quantity')::int, 1) AS quantity
    FROM jsonb_array_elements(p_line_items) item
  ),
  priced AS (
    SELECT
      i.product_id,
      i.quantity,
      p.name,
      p.base_price_cents,
      (p.base_price_cents * i.quantity)::bigint AS line_total_cents
    FROM input i
    JOIN ad_products p ON p.id = i.product_id AND p.site_id = p_site_id AND p.is_active = true
  )
  SELECT
    COALESCE(SUM(line_total_cents), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'product_id', product_id,
      'name', name,
      'quantity', quantity,
      'unit_price_cents', base_price_cents,
      'line_total_cents', line_total_cents
    )), '[]'::jsonb)
  INTO v_subtotal_cents, v_lines
  FROM priced;

  IF p_advertiser_id IS NOT NULL THEN
    SELECT COALESCE(i.markup_percent, 0)
    INTO v_markup_percent
    FROM advertisers a
    LEFT JOIN industries i ON i.id = a.industry_id
    WHERE a.id = p_advertiser_id AND a.site_id = p_site_id;
  END IF;

  IF v_markup_percent > 0 THEN
    v_markup_amount_cents := ROUND(v_subtotal_cents * v_markup_percent / 100.0);
  ELSE
    IF p_billing_zip IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM local_zip_codes
        WHERE site_id = p_site_id AND zip_code = p_billing_zip
      ) INTO v_zip_match;
    END IF;
    IF v_zip_match THEN
      v_discount_percent := v_local_discount_pct;
      v_discount_amount_cents := ROUND(v_subtotal_cents * v_local_discount_pct / 100.0);
    END IF;
  END IF;

  v_total_cents := v_subtotal_cents + v_markup_amount_cents - v_discount_amount_cents;

  RETURN jsonb_build_object(
    'line_items',            v_lines,
    'subtotal_cents',        v_subtotal_cents,
    'markup_applied',        v_markup_percent > 0,
    'markup_percent',        v_markup_percent,
    'markup_amount_cents',   v_markup_amount_cents,
    'discount_applied',      v_discount_percent > 0,
    'discount_percent',      v_discount_percent,
    'discount_amount_cents', v_discount_amount_cents,
    'total_cents',           v_total_cents,
    'applied_rule',          CASE
      WHEN v_markup_percent > 0 THEN 'markup'
      WHEN v_discount_percent > 0 THEN 'local_discount'
      ELSE 'none'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_booking_totals(TEXT, UUID, TEXT, JSONB) TO anon, authenticated, service_role;
