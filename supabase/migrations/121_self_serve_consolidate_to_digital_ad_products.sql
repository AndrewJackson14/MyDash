-- ─────────────────────────────────────────────────────────────
-- Self-serve catalog refactor:
--   * Drop the duplicate ad_products table — digital_ad_products is
--     the canonical per-pub catalog (already in use by SalesCRM,
--     AdProjects, MySites Digital Catalog tab).
--   * Make industries GLOBAL (no site_id) so reps maintain one list
--     under "MyDash Settings".
--   * Repoint ad_booking_line_items.product_id → digital_ad_products.
--   * Self-serve RPCs read digital_ad_products. Pricing model:
--     unit_price_cents = ROUND(rate_monthly × 100); quantity = months.
-- ─────────────────────────────────────────────────────────────

-- 1. Industries → global (drop site-scoped policies first; they reference site_id)
DROP POLICY IF EXISTS industries_site_access ON industries;
DROP POLICY IF EXISTS industries_anon_read ON industries;
ALTER TABLE industries DROP CONSTRAINT IF EXISTS industries_site_slug_unique;
ALTER TABLE industries DROP COLUMN IF EXISTS site_id;
ALTER TABLE industries ADD CONSTRAINT industries_slug_unique UNIQUE (slug);

CREATE POLICY industries_read_all ON industries FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY industries_super_admin_write ON industries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.auth_id = auth.uid() AND tm.global_role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.auth_id = auth.uid() AND tm.global_role = 'super_admin'));

-- 2. Repoint ad_booking_line_items FK from ad_products → digital_ad_products
ALTER TABLE ad_booking_line_items DROP CONSTRAINT IF EXISTS ad_booking_line_items_product_id_fkey;
ALTER TABLE ad_booking_line_items
  ADD CONSTRAINT ad_booking_line_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES digital_ad_products(id) ON DELETE RESTRICT;

-- 3. Drop the redundant ad_products table (CASCADE drops its anon-read policy)
DROP TABLE IF EXISTS ad_products CASCADE;

-- 4. Pricing RPC — reads digital_ad_products
CREATE OR REPLACE FUNCTION public.calculate_booking_totals(
  p_site_id TEXT, p_advertiser_id UUID, p_billing_zip TEXT, p_line_items JSONB
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_subtotal_cents BIGINT := 0;
  v_markup_percent NUMERIC(5,2) := 0;
  v_markup_amount_cents BIGINT := 0;
  v_discount_percent NUMERIC(5,2) := 0;
  v_discount_amount_cents BIGINT := 0;
  v_total_cents BIGINT := 0;
  v_lines JSONB := '[]'::jsonb;
  v_zip_match BOOLEAN := false;
  v_local_discount_pct CONSTANT NUMERIC(5,2) := 10.00;
BEGIN
  WITH input AS (
    SELECT (item->>'product_id')::uuid AS product_id,
           COALESCE((item->>'quantity')::int, 1) AS quantity
    FROM jsonb_array_elements(p_line_items) item
  ),
  priced AS (
    SELECT i.product_id, i.quantity, p.name,
           ROUND(p.rate_monthly * 100)::bigint AS unit_price_cents,
           ROUND(p.rate_monthly * 100 * i.quantity)::bigint AS line_total_cents
    FROM input i
    JOIN digital_ad_products p ON p.id = i.product_id AND p.pub_id = p_site_id AND p.is_active = true
  )
  SELECT COALESCE(SUM(line_total_cents), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'product_id', product_id, 'name', name, 'quantity', quantity,
      'unit_price_cents', unit_price_cents, 'line_total_cents', line_total_cents
    )), '[]'::jsonb)
  INTO v_subtotal_cents, v_lines FROM priced;

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
      SELECT EXISTS(SELECT 1 FROM local_zip_codes WHERE site_id = p_site_id AND zip_code = p_billing_zip) INTO v_zip_match;
    END IF;
    IF v_zip_match THEN
      v_discount_percent := v_local_discount_pct;
      v_discount_amount_cents := ROUND(v_subtotal_cents * v_local_discount_pct / 100.0);
    END IF;
  END IF;

  v_total_cents := v_subtotal_cents + v_markup_amount_cents - v_discount_amount_cents;

  RETURN jsonb_build_object(
    'line_items', v_lines, 'subtotal_cents', v_subtotal_cents,
    'markup_applied', v_markup_percent > 0, 'markup_percent', v_markup_percent,
    'markup_amount_cents', v_markup_amount_cents,
    'discount_applied', v_discount_percent > 0, 'discount_percent', v_discount_percent,
    'discount_amount_cents', v_discount_amount_cents,
    'total_cents', v_total_cents,
    'applied_rule', CASE WHEN v_markup_percent > 0 THEN 'markup'
                         WHEN v_discount_percent > 0 THEN 'local_discount' ELSE 'none' END
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.calculate_booking_totals(TEXT, UUID, TEXT, JSONB) TO anon, authenticated, service_role;

-- 5. submit_self_serve_booking — same body, relies on the new pricing RPC
CREATE OR REPLACE FUNCTION public.submit_self_serve_booking(
  p_site_id TEXT, p_existing_advertiser_id UUID, p_new_advertiser JSONB,
  p_billing_zip TEXT, p_booked_by_email TEXT, p_line_items JSONB, p_creative_notes TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_advertiser_id UUID; v_assigned_rep UUID; v_totals JSONB;
  v_booking_id UUID; v_share_token UUID; v_run_start DATE; v_run_end DATE;
  v_lower_email TEXT := lower(trim(p_booked_by_email)); v_business_domain TEXT;
BEGIN
  IF p_site_id IS NULL OR v_lower_email IS NULL OR v_lower_email = ''
     OR p_line_items IS NULL OR jsonb_array_length(p_line_items) = 0 THEN
    RAISE EXCEPTION 'missing_required_fields';
  END IF;

  IF p_existing_advertiser_id IS NOT NULL THEN
    SELECT id, assigned_rep_id INTO v_advertiser_id, v_assigned_rep
    FROM advertisers WHERE id = p_existing_advertiser_id AND site_id = p_site_id;
    IF v_advertiser_id IS NULL THEN RAISE EXCEPTION 'advertiser_not_found'; END IF;
  ELSE
    IF p_new_advertiser IS NULL OR p_new_advertiser->>'business_name' IS NULL OR p_new_advertiser->>'primary_email' IS NULL THEN
      RAISE EXCEPTION 'new_advertiser_missing_fields';
    END IF;
    v_business_domain := split_part(lower(p_new_advertiser->>'primary_email'), '@', 2);
    IF EXISTS (SELECT 1 FROM free_email_domains WHERE domain = v_business_domain) THEN
      v_business_domain := NULL;
    END IF;
    INSERT INTO advertisers (
      site_id, business_name, business_domain, primary_email, phone, billing_address, industry_id
    ) VALUES (
      p_site_id, trim(p_new_advertiser->>'business_name'), v_business_domain,
      lower(trim(p_new_advertiser->>'primary_email')),
      NULLIF(trim(p_new_advertiser->>'phone'), ''),
      p_new_advertiser->'billing_address',
      NULLIF(p_new_advertiser->>'industry_id', '')::uuid
    )
    ON CONFLICT (site_id, lower(primary_email)) DO UPDATE SET business_name = EXCLUDED.business_name
    RETURNING id, assigned_rep_id INTO v_advertiser_id, v_assigned_rep;
  END IF;

  v_totals := calculate_booking_totals(p_site_id, v_advertiser_id, p_billing_zip, p_line_items);

  SELECT MIN((item->>'run_start_date')::date), MAX((item->>'run_end_date')::date)
  INTO v_run_start, v_run_end
  FROM jsonb_array_elements(p_line_items) item
  WHERE item->>'run_start_date' IS NOT NULL AND item->>'run_end_date' IS NOT NULL;

  INSERT INTO ad_bookings (
    site_id, advertiser_id, booked_by_email, booking_source, assigned_rep_id,
    status, creative_status, run_start_date, run_end_date,
    subtotal_cents, markup_applied, markup_percent, markup_amount_cents,
    discount_applied, discount_percent, discount_amount_cents, total_cents,
    billing_zip, creative_notes
  ) VALUES (
    p_site_id, v_advertiser_id, v_lower_email, 'self_serve', v_assigned_rep,
    'submitted', 'pending_upload', v_run_start, v_run_end,
    (v_totals->>'subtotal_cents')::int,
    (v_totals->>'markup_applied')::boolean,
    NULLIF((v_totals->>'markup_percent')::numeric, 0),
    (v_totals->>'markup_amount_cents')::int,
    (v_totals->>'discount_applied')::boolean,
    NULLIF((v_totals->>'discount_percent')::numeric, 0),
    (v_totals->>'discount_amount_cents')::int,
    (v_totals->>'total_cents')::int,
    p_billing_zip, NULLIF(trim(p_creative_notes), '')
  ) RETURNING id, share_token INTO v_booking_id, v_share_token;

  INSERT INTO ad_booking_line_items (
    booking_id, product_id, quantity, unit_price_cents, line_total_cents,
    run_start_date, run_end_date
  )
  SELECT v_booking_id, (priced->>'product_id')::uuid,
         (priced->>'quantity')::int, (priced->>'unit_price_cents')::int,
         (priced->>'line_total_cents')::int,
         (orig->>'run_start_date')::date, (orig->>'run_end_date')::date
  FROM jsonb_array_elements(v_totals->'line_items') WITH ORDINALITY AS p(priced, ord)
  JOIN jsonb_array_elements(p_line_items) WITH ORDINALITY AS o(orig, ord) USING (ord);

  RETURN jsonb_build_object('booking_id', v_booking_id, 'share_token', v_share_token, 'totals', v_totals);
END; $$;
GRANT EXECUTE ON FUNCTION public.submit_self_serve_booking(TEXT, UUID, JSONB, TEXT, TEXT, JSONB, TEXT) TO anon, authenticated, service_role;

-- 6. get_booking_by_share_token: join digital_ad_products
CREATE OR REPLACE FUNCTION public.get_booking_by_share_token(p_token UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', b.id, 'status', b.status, 'creative_status', b.creative_status,
    'creative_asset_urls', b.creative_asset_urls,
    'show_client_approve', b.creative_status = 'designer_approved',
    'allow_creative_upload', b.creative_status IN ('pending_upload','rejected'),
    'booked_by_email', b.booked_by_email, 'business_name', a.business_name,
    'run_start_date', b.run_start_date, 'run_end_date', b.run_end_date,
    'subtotal_cents', b.subtotal_cents,
    'markup_applied', b.markup_applied, 'markup_percent', b.markup_percent, 'markup_amount_cents', b.markup_amount_cents,
    'discount_applied', b.discount_applied, 'discount_percent', b.discount_percent, 'discount_amount_cents', b.discount_amount_cents,
    'total_cents', b.total_cents,
    'creative_notes', b.creative_notes, 'rejection_reason', b.rejection_reason,
    'submitted_at', b.created_at, 'approved_at', b.approved_at,
    'line_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'product_name', pr.name, 'product_type', pr.product_type,
        'quantity', li.quantity,
        'unit_price_cents', li.unit_price_cents, 'line_total_cents', li.line_total_cents,
        'run_start_date', li.run_start_date, 'run_end_date', li.run_end_date
      ) ORDER BY li.created_at)
      FROM ad_booking_line_items li
      JOIN digital_ad_products pr ON pr.id = li.product_id
      WHERE li.booking_id = b.id
    ), '[]'::jsonb)
  )
  FROM ad_bookings b
  JOIN advertisers a ON a.id = b.advertiser_id
  WHERE b.share_token = p_token LIMIT 1;
$$;

-- 7. get_booking_conflicts: join digital_ad_products via zone_id
CREATE OR REPLACE FUNCTION public.get_booking_conflicts(p_booking_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
    'booking_id', other.id, 'business_name', oa.business_name, 'status', other.status,
    'product_name', p_other.name, 'zone_name', z.name,
    'run_start_date', other_li.run_start_date, 'run_end_date', other_li.run_end_date
  )), '[]'::jsonb)
  FROM ad_booking_line_items mine_li
  JOIN digital_ad_products p_mine ON p_mine.id = mine_li.product_id AND p_mine.zone_id IS NOT NULL
  JOIN ad_booking_line_items other_li
    ON other_li.booking_id <> mine_li.booking_id
   AND mine_li.run_start_date IS NOT NULL AND other_li.run_start_date IS NOT NULL
   AND mine_li.run_start_date <= other_li.run_end_date
   AND other_li.run_start_date <= mine_li.run_end_date
  JOIN digital_ad_products p_other ON p_other.id = other_li.product_id
   AND p_other.zone_id = p_mine.zone_id
  JOIN ad_bookings other ON other.id = other_li.booking_id
   AND other.status IN ('approved','scheduled','live')
  JOIN advertisers oa ON oa.id = other.advertiser_id
  JOIN ad_zones z ON z.id = p_mine.zone_id
  WHERE mine_li.booking_id = p_booking_id;
$$;

NOTIFY pgrst, 'reload schema';
