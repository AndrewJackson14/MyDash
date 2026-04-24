-- ─────────────────────────────────────────────────────────────
-- submit_self_serve_booking
--
-- Atomic submission for the public self-serve flow:
--   1. Resolve or create the advertiser
--   2. Compute totals server-side via calculate_booking_totals (never
--      trust client-supplied amounts)
--   3. Insert ad_booking (status=submitted, creative_status=pending_upload)
--   4. Insert ad_booking_line_items snapshotting unit_price at booking time
--   5. Return { booking_id, share_token } so the client can redirect
--      to the public status page
--
-- Called by the StellarPress self-serve flow (anon role). RLS doesn't
-- apply (SECURITY DEFINER) so anon can write — but the function only
-- ever inserts; never updates or reads anything sensitive.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_self_serve_booking(
  p_site_id              TEXT,
  p_existing_advertiser_id UUID,
  p_new_advertiser       JSONB,
  p_billing_zip          TEXT,
  p_booked_by_email      TEXT,
  p_line_items           JSONB,
  p_creative_notes       TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_advertiser_id UUID;
  v_assigned_rep  UUID;
  v_totals        JSONB;
  v_booking_id    UUID;
  v_share_token   UUID;
  v_run_start     DATE;
  v_run_end       DATE;
  v_lower_email   TEXT := lower(trim(p_booked_by_email));
  v_business_domain TEXT;
BEGIN
  IF p_site_id IS NULL OR v_lower_email IS NULL OR v_lower_email = ''
     OR p_line_items IS NULL OR jsonb_array_length(p_line_items) = 0 THEN
    RAISE EXCEPTION 'missing_required_fields';
  END IF;

  IF p_existing_advertiser_id IS NOT NULL THEN
    SELECT id, assigned_rep_id INTO v_advertiser_id, v_assigned_rep
    FROM advertisers WHERE id = p_existing_advertiser_id AND site_id = p_site_id;
    IF v_advertiser_id IS NULL THEN
      RAISE EXCEPTION 'advertiser_not_found';
    END IF;
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
      p_site_id,
      trim(p_new_advertiser->>'business_name'),
      v_business_domain,
      lower(trim(p_new_advertiser->>'primary_email')),
      NULLIF(trim(p_new_advertiser->>'phone'), ''),
      p_new_advertiser->'billing_address',
      NULLIF(p_new_advertiser->>'industry_id', '')::uuid
    )
    ON CONFLICT (site_id, lower(primary_email)) DO UPDATE
      SET business_name = EXCLUDED.business_name
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
    p_billing_zip,
    NULLIF(trim(p_creative_notes), '')
  ) RETURNING id, share_token INTO v_booking_id, v_share_token;

  INSERT INTO ad_booking_line_items (
    booking_id, product_id, quantity, unit_price_cents, line_total_cents,
    run_start_date, run_end_date
  )
  SELECT
    v_booking_id,
    (priced->>'product_id')::uuid,
    (priced->>'quantity')::int,
    (priced->>'unit_price_cents')::int,
    (priced->>'line_total_cents')::int,
    (orig->>'run_start_date')::date,
    (orig->>'run_end_date')::date
  FROM jsonb_array_elements(v_totals->'line_items') WITH ORDINALITY AS p(priced, ord)
  JOIN jsonb_array_elements(p_line_items) WITH ORDINALITY AS o(orig, ord) USING (ord);

  RETURN jsonb_build_object(
    'booking_id',   v_booking_id,
    'share_token',  v_share_token,
    'totals',       v_totals
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_self_serve_booking(TEXT, UUID, JSONB, TEXT, TEXT, JSONB, TEXT)
  TO anon, authenticated, service_role;

-- Companion: public RPC for the booking-status page (signed-token URL).
-- Returns a safe subset of the booking + line items; nothing sensitive.
CREATE OR REPLACE FUNCTION public.get_booking_by_share_token(p_token UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',                  b.id,
    'status',              b.status,
    'creative_status',     b.creative_status,
    'booked_by_email',     b.booked_by_email,
    'business_name',       a.business_name,
    'run_start_date',      b.run_start_date,
    'run_end_date',        b.run_end_date,
    'subtotal_cents',      b.subtotal_cents,
    'markup_applied',      b.markup_applied,
    'markup_percent',      b.markup_percent,
    'markup_amount_cents', b.markup_amount_cents,
    'discount_applied',    b.discount_applied,
    'discount_percent',    b.discount_percent,
    'discount_amount_cents', b.discount_amount_cents,
    'total_cents',         b.total_cents,
    'creative_notes',      b.creative_notes,
    'rejection_reason',    b.rejection_reason,
    'submitted_at',        b.created_at,
    'approved_at',         b.approved_at,
    'line_items',          COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'product_name',     pr.name,
        'product_type',     pr.product_type,
        'quantity',         li.quantity,
        'unit_price_cents', li.unit_price_cents,
        'line_total_cents', li.line_total_cents,
        'run_start_date',   li.run_start_date,
        'run_end_date',     li.run_end_date
      ) ORDER BY li.created_at)
      FROM ad_booking_line_items li
      JOIN ad_products pr ON pr.id = li.product_id
      WHERE li.booking_id = b.id
    ), '[]'::jsonb)
  )
  FROM ad_bookings b
  JOIN advertisers a ON a.id = b.advertiser_id
  WHERE b.share_token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_booking_by_share_token(UUID) TO anon, authenticated, service_role;
