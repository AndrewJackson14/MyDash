-- ─────────────────────────────────────────────────────────────
-- get_booking_conflicts(booking_id)
-- Returns any active (approved/scheduled/live) bookings whose
-- line-item date ranges overlap with the given booking on the SAME
-- ad_zone_id (only digital_display has zones, so print/newsletter
-- never trigger this — they're booked on ranges not zones).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_booking_conflicts(p_booking_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
    'booking_id',     other.id,
    'business_name',  oa.business_name,
    'status',         other.status,
    'product_name',   p_other.name,
    'zone_name',      z.name,
    'run_start_date', other_li.run_start_date,
    'run_end_date',   other_li.run_end_date
  )), '[]'::jsonb)
  FROM ad_booking_line_items mine_li
  JOIN ad_products p_mine ON p_mine.id = mine_li.product_id AND p_mine.ad_zone_id IS NOT NULL
  JOIN ad_booking_line_items other_li
    ON other_li.booking_id <> mine_li.booking_id
   AND mine_li.run_start_date IS NOT NULL AND other_li.run_start_date IS NOT NULL
   AND mine_li.run_start_date <= other_li.run_end_date
   AND other_li.run_start_date <= mine_li.run_end_date
  JOIN ad_products p_other ON p_other.id = other_li.product_id
   AND p_other.ad_zone_id = p_mine.ad_zone_id
  JOIN ad_bookings other ON other.id = other_li.booking_id
   AND other.status IN ('approved','scheduled','live')
  JOIN advertisers oa ON oa.id = other.advertiser_id
  JOIN ad_zones z ON z.id = p_mine.ad_zone_id
  WHERE mine_li.booking_id = p_booking_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_booking_conflicts(UUID) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- approve_booking — submitted → approved/scheduled (based on dates)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_booking(
  p_booking_id UUID,
  p_rep_notes  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_booking ad_bookings%ROWTYPE;
  v_team_id UUID;
  v_new_status ad_booking_status;
BEGIN
  SELECT id INTO v_team_id FROM team_members WHERE auth_id = auth.uid() LIMIT 1;

  SELECT * INTO v_booking FROM ad_bookings WHERE id = p_booking_id;
  IF v_booking IS NULL THEN RAISE EXCEPTION 'booking_not_found'; END IF;
  IF v_booking.status NOT IN ('submitted','approved') THEN
    RAISE EXCEPTION 'cannot_approve_status_%', v_booking.status;
  END IF;

  v_new_status := 'approved';
  IF v_booking.run_start_date IS NOT NULL THEN
    IF v_booking.run_start_date > CURRENT_DATE THEN
      v_new_status := 'scheduled';
    ELSIF v_booking.run_start_date <= CURRENT_DATE
          AND (v_booking.run_end_date IS NULL OR v_booking.run_end_date >= CURRENT_DATE)
          AND v_booking.creative_status = 'client_approved' THEN
      v_new_status := 'live';
    END IF;
  END IF;

  UPDATE ad_bookings SET
    status = v_new_status,
    approved_by = v_team_id,
    approved_at = now(),
    rep_notes = COALESCE(NULLIF(trim(p_rep_notes), ''), rep_notes)
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('booking_id', p_booking_id, 'new_status', v_new_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_booking(UUID, TEXT) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- reject_booking — submitted/approved → rejected, with required reason
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_booking(
  p_booking_id     UUID,
  p_rejection_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID;
BEGIN
  IF p_rejection_reason IS NULL OR trim(p_rejection_reason) = '' THEN
    RAISE EXCEPTION 'rejection_reason_required';
  END IF;
  SELECT id INTO v_team_id FROM team_members WHERE auth_id = auth.uid() LIMIT 1;

  UPDATE ad_bookings SET
    status = 'rejected',
    rejection_reason = trim(p_rejection_reason),
    approved_by = v_team_id,
    approved_at = now()
  WHERE id = p_booking_id
    AND status IN ('submitted','approved','scheduled');

  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found_or_already_terminal'; END IF;

  RETURN jsonb_build_object('booking_id', p_booking_id, 'new_status', 'rejected');
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_booking(UUID, TEXT) TO authenticated, service_role;
