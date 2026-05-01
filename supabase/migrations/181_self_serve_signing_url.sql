-- ============================================================
-- 181_self_serve_signing_url.sql
--
-- Phase 4 follow-up: extends get_self_serve_proposal to include a
-- signing_url derived from the latest non-signed, non-expired
-- proposal_signatures row. StellarPress's ProposalStatusPage uses
-- this for the "View & Sign" CTA when a self-serve proposal is in
-- Sent status — saves the customer from waiting on the rep's email.
--
-- Companion frontend change in src/pages/SalesCRM.jsx: the "Send
-- as-is" button now creates a proposal_signatures row before the
-- status flip (mirroring what the proposal-wizard already does for
-- manual proposals). Without that row, signing_url stays null and
-- the StellarPress UI shows its existing "Watch your email" copy.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_self_serve_proposal(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_proposal       RECORD;
  v_lines          JSONB;
  v_decline_reason TEXT := NULL;
  v_signing_url    TEXT := NULL;
  v_access_token   TEXT;
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

  -- Signing URL: latest unsigned, unexpired signature row for this
  -- proposal. The base URL is hardcoded to mydash.media; if a
  -- staging environment ever wants a different host, parameterize
  -- via a Postgres setting.
  SELECT access_token INTO v_access_token
  FROM proposal_signatures
  WHERE proposal_id = v_proposal.id
    AND COALESCE(signed, false) = false
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_access_token IS NOT NULL THEN
    v_signing_url := 'https://mydash.media/sign/' || v_access_token;
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
    'signing_url',         v_signing_url,
    'lines',               v_lines
  );
END;
$$;

COMMENT ON FUNCTION public.get_self_serve_proposal(UUID) IS
  'Token-gated read for the StellarPress ProposalStatusPage. Returns advertiser-safe fields including signing_url (null until the rep clicks Send and a proposal_signatures row exists). Decline reason only exposed when status=Declined.';
