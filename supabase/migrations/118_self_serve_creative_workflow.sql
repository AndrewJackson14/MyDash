-- Creative-asset URL column on ad_bookings.
-- The original spec referenced creative_asset_ids → media table, but we
-- store Bunny CDN URLs directly for v1; media-asset rows can be backfilled
-- later when the media library is wired in.
ALTER TABLE ad_bookings ADD COLUMN IF NOT EXISTS creative_asset_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ─────────────────────────────────────────────────────────────
-- attach_creative_to_booking — anon, via share_token
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.attach_creative_to_booking(
  p_share_token UUID,
  p_asset_urls  TEXT[],
  p_notes       TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id UUID;
  v_current ad_creative_status;
BEGIN
  IF p_asset_urls IS NULL OR array_length(p_asset_urls, 1) IS NULL THEN
    RAISE EXCEPTION 'no_assets_provided';
  END IF;

  SELECT id, creative_status INTO v_booking_id, v_current
  FROM ad_bookings WHERE share_token = p_share_token;
  IF v_booking_id IS NULL THEN RAISE EXCEPTION 'booking_not_found'; END IF;
  IF v_current NOT IN ('pending_upload','rejected') THEN
    RAISE EXCEPTION 'cannot_upload_in_state_%', v_current;
  END IF;

  UPDATE ad_bookings SET
    creative_asset_urls = p_asset_urls,
    creative_status = 'uploaded',
    creative_notes = COALESCE(NULLIF(trim(p_notes), ''), creative_notes)
  WHERE id = v_booking_id;

  RETURN jsonb_build_object('booking_id', v_booking_id, 'creative_status', 'uploaded');
END;
$$;
GRANT EXECUTE ON FUNCTION public.attach_creative_to_booking(UUID, TEXT[], TEXT) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- transition_creative_status — rep/designer-side state advance
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transition_creative_status(
  p_booking_id UUID,
  p_new_status ad_creative_status,
  p_note       TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_current ad_creative_status;
  v_booking_status ad_booking_status;
  v_run_start DATE;
  v_new_booking_status ad_booking_status;
BEGIN
  SELECT creative_status, status, run_start_date
    INTO v_current, v_booking_status, v_run_start
  FROM ad_bookings WHERE id = p_booking_id;
  IF v_current IS NULL THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  IF v_current = 'client_approved' AND p_new_status <> 'rejected' THEN
    RAISE EXCEPTION 'cannot_transition_from_client_approved';
  END IF;

  UPDATE ad_bookings SET
    creative_status = p_new_status,
    rep_notes = COALESCE(NULLIF(trim(p_note), ''), rep_notes)
  WHERE id = p_booking_id;

  IF p_new_status = 'client_approved' AND v_booking_status = 'approved'
     AND (v_run_start IS NULL OR v_run_start <= CURRENT_DATE) THEN
    UPDATE ad_bookings SET status = 'live' WHERE id = p_booking_id;
    v_new_booking_status := 'live';
  END IF;

  RETURN jsonb_build_object(
    'booking_id', p_booking_id,
    'creative_status', p_new_status,
    'booking_status', COALESCE(v_new_booking_status, v_booking_status)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.transition_creative_status(UUID, ad_creative_status, TEXT) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- client_approve_creative — anon via share_token
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.client_approve_creative(p_share_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking ad_bookings%ROWTYPE;
  v_new_booking_status ad_booking_status;
BEGIN
  SELECT * INTO v_booking FROM ad_bookings WHERE share_token = p_share_token;
  IF v_booking IS NULL THEN RAISE EXCEPTION 'booking_not_found'; END IF;
  IF v_booking.creative_status <> 'designer_approved' THEN
    RAISE EXCEPTION 'creative_not_ready_for_client_approval_status_%', v_booking.creative_status;
  END IF;

  UPDATE ad_bookings SET creative_status = 'client_approved' WHERE id = v_booking.id;

  IF v_booking.status = 'approved'
     AND (v_booking.run_start_date IS NULL OR v_booking.run_start_date <= CURRENT_DATE) THEN
    UPDATE ad_bookings SET status = 'live' WHERE id = v_booking.id;
    v_new_booking_status := 'live';
  END IF;

  RETURN jsonb_build_object(
    'booking_id', v_booking.id,
    'creative_status', 'client_approved',
    'booking_status', COALESCE(v_new_booking_status, v_booking.status)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.client_approve_creative(UUID) TO anon, authenticated, service_role;

-- Update get_booking_by_share_token to include creative URLs and the
-- show_client_approve / allow_creative_upload booleans the public page
-- renders against.
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
    'creative_asset_urls', b.creative_asset_urls,
    'show_client_approve', b.creative_status = 'designer_approved',
    'allow_creative_upload', b.creative_status IN ('pending_upload','rejected'),
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
