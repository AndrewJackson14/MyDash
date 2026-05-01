-- ============================================================
-- 176_self_serve_proposal_reader_and_resume.sql
--
-- Two RPCs needed by StellarPress's new ProposalStatusPage:
--
--   1. get_self_serve_proposal(p_token UUID) → token-gated reader.
--      Anon-callable; returns only advertiser-safe fields (status,
--      lines, totals, decline reason if Declined). No anon SELECT
--      policy needed on proposals.
--
--   2. update_self_serve_proposal(p_proposal_id, p_token, p_line_items,
--      p_creative_notes) → resume-edit. Validates token + that status
--      is still 'Awaiting Review'; replaces proposal_lines and
--      recomputes pricing. Same return shape as submit_self_serve_proposal.
--
-- See docs/specs/self-serve-stellarpress-handoff.md for context.
-- ============================================================

-- 1. Token-gated reader
CREATE OR REPLACE FUNCTION public.get_self_serve_proposal(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_proposal RECORD;
  v_lines    JSONB;
  v_decline_reason TEXT := NULL;
BEGIN
  IF p_token IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    p.id, p.status::text AS status, p.name, p.total,
    p.subtotal, p.markup_applied, p.markup_percent, p.markup_amount,
    p.discount_applied, p.discount_percent, p.discount_amount,
    p.intake_email, p.billing_zip, p.awaiting_review_at,
    p.sent_at, p.signed_at, p.converted_at, p.notes,
    p.brief_instructions
  INTO v_proposal
  FROM proposals p
  WHERE p.self_serve_token = p_token AND p.source = 'self_serve';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Decline reason only exposed when status is Declined.
  IF v_proposal.status = 'Declined' THEN
    v_decline_reason := v_proposal.notes;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'pub_name',          l.pub_name,
    'publication_id',    l.publication_id,
    'ad_size',           l.ad_size,
    'price',             l.price,
    'flight_start_date', l.flight_start_date,
    'flight_end_date',   l.flight_end_date,
    'digital_product_id', l.digital_product_id
  ) ORDER BY l.sort_order NULLS LAST), '[]'::jsonb)
  INTO v_lines
  FROM proposal_lines l
  WHERE l.proposal_id = v_proposal.id;

  RETURN jsonb_build_object(
    'proposal_id',         v_proposal.id,
    'status',              v_proposal.status,
    'name',                v_proposal.name,
    'intake_email',        v_proposal.intake_email,
    'billing_zip',         v_proposal.billing_zip,
    'awaiting_review_at',  v_proposal.awaiting_review_at,
    'sent_at',             v_proposal.sent_at,
    'signed_at',           v_proposal.signed_at,
    'converted_at',        v_proposal.converted_at,
    'subtotal',            v_proposal.subtotal,
    'markup_applied',      v_proposal.markup_applied,
    'markup_percent',      v_proposal.markup_percent,
    'markup_amount',       v_proposal.markup_amount,
    'discount_applied',    v_proposal.discount_applied,
    'discount_percent',    v_proposal.discount_percent,
    'discount_amount',     v_proposal.discount_amount,
    'total',               v_proposal.total,
    'creative_notes',      v_proposal.brief_instructions,
    'decline_reason',      v_decline_reason,
    'lines',               v_lines
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_self_serve_proposal(UUID) TO anon, authenticated;

COMMENT ON FUNCTION public.get_self_serve_proposal(UUID) IS
  'Token-gated read for the StellarPress ProposalStatusPage. Returns only advertiser-safe fields. Decline reason only exposed when status=Declined.';

-- ============================================================
-- 2. Resume-edit RPC
--
-- Updates an Awaiting Review self-serve proposal in place. Recomputes
-- pricing and replaces all lines. Locks down to:
--   • token must match the proposal's self_serve_token
--   • status must still be 'Awaiting Review'
--   • source must be 'self_serve'
--
-- This is anon-callable; the token IS the auth.
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_self_serve_proposal(
  p_proposal_id     UUID,
  p_self_serve_token UUID,
  p_line_items      JSONB,
  p_creative_notes  TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id    UUID;
  v_site_id      TEXT;
  v_billing_zip  TEXT;
  v_pub_name     TEXT;
  v_status       TEXT;
  v_token_match  UUID;
  v_totals       JSONB;
BEGIN
  IF p_proposal_id IS NULL OR p_self_serve_token IS NULL
     OR p_line_items IS NULL OR jsonb_array_length(p_line_items) = 0 THEN
    RAISE EXCEPTION 'missing_required_fields';
  END IF;

  -- Validate proposal exists + token matches + still editable.
  SELECT p.client_id, p.billing_zip, p.status::text, p.self_serve_token,
         (SELECT publication_id FROM proposal_lines WHERE proposal_id = p.id ORDER BY sort_order NULLS LAST LIMIT 1)
    INTO v_client_id, v_billing_zip, v_status, v_token_match, v_site_id
  FROM proposals p
  WHERE p.id = p_proposal_id AND p.source = 'self_serve';

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'proposal_not_found';
  END IF;
  IF v_token_match IS DISTINCT FROM p_self_serve_token THEN
    RAISE EXCEPTION 'token_mismatch';
  END IF;
  IF v_status <> 'Awaiting Review' THEN
    RAISE EXCEPTION 'not_editable';  -- once a rep touches it, advertiser can't edit
  END IF;

  -- Recompute pricing.
  v_totals := calculate_proposal_totals_for_self_serve(v_site_id, v_client_id, v_billing_zip, p_line_items);

  SELECT name INTO v_pub_name FROM publications WHERE id = v_site_id;

  -- Replace lines + update proposal row.
  DELETE FROM proposal_lines WHERE proposal_id = p_proposal_id;

  INSERT INTO proposal_lines (
    proposal_id, publication_id, ad_size, price, digital_product_id,
    flight_start_date, flight_end_date, pub_name, sort_order
  )
  SELECT
    p_proposal_id,
    v_site_id,
    COALESCE(p.priced->>'name', 'Digital Ad'),
    (p.priced->>'line_total')::numeric,
    NULLIF(p.priced->>'product_id', '')::uuid,
    NULLIF(o.orig->>'run_start_date', '')::date,
    NULLIF(o.orig->>'run_end_date', '')::date,
    v_pub_name,
    p.ord::int
  FROM jsonb_array_elements(v_totals->'line_items') WITH ORDINALITY AS p(priced, ord)
  JOIN jsonb_array_elements(p_line_items) WITH ORDINALITY AS o(orig, ord) USING (ord);

  UPDATE proposals SET
    total              = (v_totals->>'total')::numeric,
    subtotal           = (v_totals->>'subtotal')::numeric,
    markup_applied     = (v_totals->>'markup_applied')::boolean,
    markup_percent     = NULLIF((v_totals->>'markup_percent')::numeric, 0),
    markup_amount      = (v_totals->>'markup_amount')::numeric,
    discount_applied   = (v_totals->>'discount_applied')::boolean,
    discount_percent   = NULLIF((v_totals->>'discount_percent')::numeric, 0),
    discount_amount    = (v_totals->>'discount_amount')::numeric,
    brief_instructions = NULLIF(trim(p_creative_notes), ''),
    updated_at         = now()
  WHERE id = p_proposal_id;

  RETURN jsonb_build_object(
    'proposal_id',       p_proposal_id,
    'self_serve_token',  p_self_serve_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_self_serve_proposal(UUID, UUID, JSONB, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.update_self_serve_proposal(UUID, UUID, JSONB, TEXT) IS
  'Resume-edit for self-serve proposals. Token is auth; status must be Awaiting Review. Replaces lines + recomputes pricing.';
