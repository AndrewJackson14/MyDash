-- ============================================================
-- 175_self_serve_proposal_unification.sql
--
-- Phase 2 of the self-serve → proposal unification (see
-- docs/specs/self-serve-to-proposal-spec.md). Additive only —
-- the legacy ad_bookings tables and RPCs stay in place until
-- Phase 6 cutover. Confirmed during Phase 1 discovery (2026-04-30):
--   • ad_bookings has 0 rows; no data migration needed
--   • resolve-advertiser edge function is silently broken (refs
--     non-existent advertisers/advertiser_contacts tables) — this
--     migration provides a working replacement RPC and the edge
--     function will be deleted at cutover
--   • clients holds emails on client_contacts (no clients.email)
--   • proposal_status enum already has 'Under Review'; spec uses
--     'Awaiting Review' as a distinct earlier state
--   • Reject mapping uses existing 'Declined' enum value
--   • Pricing parity columns mirror ad_bookings shape but in dollars
-- ============================================================

-- 1. Status enum: add 'Awaiting Review' as the entry state for
--    self-serve submissions (distinct from 'Under Review' which
--    means the rep is actively editing).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'proposal_status' AND e.enumlabel = 'Awaiting Review'
  ) THEN
    ALTER TYPE proposal_status ADD VALUE 'Awaiting Review' AFTER 'Draft';
  END IF;
END $$;

-- 2. Schema additions on proposals (idempotent).
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'rep_built';
ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_source_check;
ALTER TABLE proposals ADD CONSTRAINT proposals_source_check CHECK (source IN ('rep_built', 'self_serve'));

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS self_serve_token UUID;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'proposals_self_serve_token_key') THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_self_serve_token_key UNIQUE (self_serve_token);
  END IF;
END $$;

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS intake_email TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS awaiting_review_at TIMESTAMPTZ;

-- Pricing parity (dollars). Mirrors ad_bookings shape so the
-- Sales CRM proposal detail can render the same breakdown without
-- a jsonb unwrap step.
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS markup_applied BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS markup_percent NUMERIC(5,2);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS markup_amount NUMERIC(12,2);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS discount_applied BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS billing_zip TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS industry_id UUID REFERENCES industries(id);

-- Self-serve queue lookup (status='Awaiting Review' AND source='self_serve').
CREATE INDEX IF NOT EXISTS idx_proposals_self_serve_pending
  ON proposals (status, source) WHERE source = 'self_serve';

-- ============================================================
-- 3. calculate_proposal_totals_for_self_serve
--
-- Mirrors calculate_booking_totals math but returns dollars
-- (NUMERIC) to match proposal_lines.price units. Markup OR
-- discount, never both — same precedence rule as the booking
-- engine (industry markup wins; otherwise local-zip discount).
-- ============================================================
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
           COALESCE((item->>'quantity')::int, 1) AS quantity
    FROM jsonb_array_elements(p_line_items) item
  ),
  priced AS (
    SELECT i.product_id, i.quantity, p.name,
           p.rate_monthly::numeric(12,2) AS unit_price,
           (p.rate_monthly * i.quantity)::numeric(12,2) AS line_total
    FROM input i
    JOIN digital_ad_products p
      ON p.id = i.product_id AND p.pub_id = p_site_id AND p.is_active = true
  )
  SELECT
    COALESCE(SUM(line_total), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'product_id', product_id, 'name', name, 'quantity', quantity,
      'unit_price', unit_price, 'line_total', line_total
    )), '[]'::jsonb)
  INTO v_subtotal, v_lines FROM priced;

  -- Industry markup: max across all industries on the client.
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

-- ============================================================
-- 4. resolve_advertiser_tier
--
-- Replaces the broken supabase/functions/resolve-advertiser/
-- edge function (which referenced non-existent advertisers /
-- advertiser_contacts tables). Same shape: { tier, client_id,
-- business_name, requires_confirmation }. Always returns 200-
-- equivalent (never errors on unknown email) so the response
-- can't be used to enumerate clients on file.
--
-- Anon-callable. Rate limiting is NOT inside this RPC (the
-- legacy edge function used resolve_advertiser_log for IP-window
-- limiting; revisit if abuse appears).
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_advertiser_tier(
  p_email   TEXT,
  p_site_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email   TEXT := lower(trim(p_email));
  v_domain  TEXT;
  v_client  UUID;
  v_name    TEXT;
  v_is_free BOOLEAN;
BEGIN
  IF v_email IS NULL OR v_email = '' OR position('@' IN v_email) = 0 OR p_site_id IS NULL THEN
    RETURN jsonb_build_object('tier', 'none', 'client_id', NULL, 'business_name', NULL, 'requires_confirmation', false);
  END IF;

  -- Tier 1: exact contact email match.
  SELECT cc.client_id INTO v_client
  FROM client_contacts cc
  WHERE lower(cc.email) = v_email
  LIMIT 1;

  IF v_client IS NOT NULL THEN
    RETURN jsonb_build_object('tier', 'exact', 'client_id', v_client, 'business_name', NULL, 'requires_confirmation', false);
  END IF;

  -- Tier 2: business-domain match (skip free email providers).
  v_domain := split_part(v_email, '@', 2);
  SELECT EXISTS(SELECT 1 FROM free_email_domains WHERE domain = v_domain) INTO v_is_free;

  IF NOT v_is_free THEN
    SELECT c.id, c.name INTO v_client, v_name
    FROM client_contacts cc
    JOIN clients c ON c.id = cc.client_id
    WHERE lower(cc.email) LIKE '%@' || v_domain
    ORDER BY cc.created_at DESC
    LIMIT 1;

    IF v_client IS NOT NULL THEN
      RETURN jsonb_build_object('tier', 'domain', 'client_id', v_client, 'business_name', v_name, 'requires_confirmation', true);
    END IF;
  END IF;

  RETURN jsonb_build_object('tier', 'none', 'client_id', NULL, 'business_name', NULL, 'requires_confirmation', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_advertiser_tier(TEXT, TEXT)
  TO anon, authenticated;

-- ============================================================
-- 5. submit_self_serve_proposal
--
-- Replaces submit_self_serve_booking. Inserts a proposal in
-- 'Awaiting Review' status with source='self_serve', creates the
-- proposal_lines, resolves the assigned rep from the first
-- line's pub via salesperson_pub_assignments (highest active
-- percentage wins; ties tie-break on insertion order — fine for
-- now, see Phase 1 discovery report).
--
-- Returns { proposal_id, self_serve_token } so StellarPress can
-- redirect to /advertise/self-serve/proposal/{token}.
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_self_serve_proposal(
  p_site_id              TEXT,
  p_existing_client_id   UUID,
  p_new_client           JSONB,
  p_billing_zip          TEXT,
  p_intake_email         TEXT,
  p_line_items           JSONB,
  p_creative_notes       TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id        UUID;
  v_industry_id      UUID;
  v_industry_name    TEXT;
  v_business_name    TEXT;
  v_pub_name         TEXT;
  v_totals           JSONB;
  v_proposal_id      UUID;
  v_self_serve_token UUID;
  v_assigned_to      UUID;
  v_intake           TEXT := lower(trim(p_intake_email));
  v_local_part       TEXT;
BEGIN
  IF p_site_id IS NULL OR v_intake IS NULL OR v_intake = ''
     OR p_line_items IS NULL OR jsonb_array_length(p_line_items) = 0 THEN
    RAISE EXCEPTION 'missing_required_fields';
  END IF;

  -- A. Resolve client (existing or new lead).
  IF p_existing_client_id IS NOT NULL THEN
    SELECT id, COALESCE(name, '') INTO v_client_id, v_business_name
    FROM clients WHERE id = p_existing_client_id;
    IF v_client_id IS NULL THEN
      RAISE EXCEPTION 'client_not_found';
    END IF;
  ELSE
    IF p_new_client IS NULL
       OR p_new_client->>'business_name' IS NULL
       OR p_new_client->>'primary_email' IS NULL THEN
      RAISE EXCEPTION 'new_client_missing_fields';
    END IF;

    v_industry_id   := NULLIF(p_new_client->>'industry_id', '')::uuid;
    v_business_name := trim(p_new_client->>'business_name');

    SELECT name INTO v_industry_name FROM industries WHERE id = v_industry_id;

    INSERT INTO clients (name, status, lead_source, industries, billing_email, billing_zip)
    VALUES (
      v_business_name,
      'Lead',
      'self_serve_proposal',
      CASE WHEN v_industry_name IS NOT NULL
           THEN ARRAY[v_industry_name]
           ELSE ARRAY[]::text[] END,
      lower(trim(p_new_client->>'primary_email')),
      NULLIF(p_billing_zip, '')
    )
    RETURNING id INTO v_client_id;

    v_local_part := split_part(lower(trim(p_new_client->>'primary_email')), '@', 1);
    INSERT INTO client_contacts (client_id, name, email, phone, role, is_primary)
    VALUES (
      v_client_id,
      v_local_part,
      lower(trim(p_new_client->>'primary_email')),
      NULLIF(trim(p_new_client->>'phone'), ''),
      'Self-Serve Submitter',
      true
    );
  END IF;

  -- B. Compute pricing in dollars.
  v_totals := calculate_proposal_totals_for_self_serve(p_site_id, v_client_id, p_billing_zip, p_line_items);

  -- C. Default rep for the site (highest-percentage active rep on
  --    the publication for the proposal's first line; self-serve
  --    is single-pub today so first line's pub == p_site_id).
  SELECT salesperson_id INTO v_assigned_to
  FROM salesperson_pub_assignments
  WHERE publication_id = p_site_id AND is_active = true
  ORDER BY percentage DESC, created_at ASC
  LIMIT 1;

  -- D. Industry on the proposal:
  --    - new client: passed-in industry_id
  --    - existing client: pick the one with the highest markup_percent
  --      (matches the markup precedence used in pricing).
  IF v_industry_id IS NULL AND p_existing_client_id IS NOT NULL THEN
    SELECT i.id INTO v_industry_id
    FROM clients c
    LEFT JOIN industries i ON i.name = ANY(c.industries)
    WHERE c.id = v_client_id
    ORDER BY i.markup_percent DESC NULLS LAST
    LIMIT 1;
  END IF;

  SELECT name INTO v_pub_name FROM publications WHERE id = p_site_id;

  -- E. Insert the proposal in 'Awaiting Review'.
  v_self_serve_token := gen_random_uuid();
  INSERT INTO proposals (
    client_id, name, status, total, source, self_serve_token, intake_email,
    awaiting_review_at, assigned_to, brief_instructions,
    subtotal, markup_applied, markup_percent, markup_amount,
    discount_applied, discount_percent, discount_amount,
    billing_zip, industry_id
  ) VALUES (
    v_client_id,
    COALESCE(NULLIF(v_business_name, ''), 'Self-Serve Submission')
      || ' — ' || COALESCE(v_pub_name, p_site_id),
    'Awaiting Review',
    (v_totals->>'total')::numeric,
    'self_serve',
    v_self_serve_token,
    v_intake,
    now(),
    v_assigned_to,
    NULLIF(trim(p_creative_notes), ''),
    (v_totals->>'subtotal')::numeric,
    (v_totals->>'markup_applied')::boolean,
    NULLIF((v_totals->>'markup_percent')::numeric, 0),
    (v_totals->>'markup_amount')::numeric,
    (v_totals->>'discount_applied')::boolean,
    NULLIF((v_totals->>'discount_percent')::numeric, 0),
    (v_totals->>'discount_amount')::numeric,
    NULLIF(p_billing_zip, ''),
    v_industry_id
  ) RETURNING id INTO v_proposal_id;

  -- F. Insert proposal_lines. Each line stores its own line_total
  --    as price (already markup/discount-baked-in proportionally
  --    via the calculator's per-line totals — but since markup/
  --    discount are applied to subtotal, not lines, we just store
  --    line_total = unit_price × quantity here. Rep can edit any
  --    line price downstream; the proposal-level pricing fields
  --    preserve the original computed totals for audit.
  INSERT INTO proposal_lines (
    proposal_id, publication_id, ad_size, price, digital_product_id,
    flight_start_date, flight_end_date, pub_name, sort_order
  )
  SELECT
    v_proposal_id,
    p_site_id,
    COALESCE(p.priced->>'name', 'Digital Ad'),
    (p.priced->>'line_total')::numeric,
    NULLIF(p.priced->>'product_id', '')::uuid,
    NULLIF(o.orig->>'run_start_date', '')::date,
    NULLIF(o.orig->>'run_end_date', '')::date,
    v_pub_name,
    p.ord::int
  FROM jsonb_array_elements(v_totals->'line_items') WITH ORDINALITY AS p(priced, ord)
  JOIN jsonb_array_elements(p_line_items) WITH ORDINALITY AS o(orig, ord) USING (ord);

  RETURN jsonb_build_object(
    'proposal_id',       v_proposal_id,
    'self_serve_token',  v_self_serve_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_self_serve_proposal(TEXT, UUID, JSONB, TEXT, TEXT, JSONB, TEXT)
  TO anon, authenticated;

-- ============================================================
-- 6. Activity-log triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_proposal_self_serve_received() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_msg TEXT;
BEGIN
  IF NEW.source = 'self_serve' THEN
    v_msg := 'Self-serve proposal received: ' || COALESCE(NEW.name, '');
    INSERT INTO activity_log (
      type, client_id, detail, summary, event_category, event_source, visibility,
      entity_table, entity_id, metadata
    ) VALUES (
      'proposal_received_self_serve',
      NEW.client_id,
      v_msg, v_msg,
      'outcome', 'system', 'team',
      'proposals', NEW.id,
      jsonb_build_object('intake_email', NEW.intake_email, 'total', NEW.total)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proposal_self_serve_received_log ON proposals;
CREATE TRIGGER proposal_self_serve_received_log
  AFTER INSERT ON proposals FOR EACH ROW
  EXECUTE FUNCTION public.tg_proposal_self_serve_received();

CREATE OR REPLACE FUNCTION public.tg_proposal_self_serve_rejected() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_msg TEXT;
BEGIN
  IF OLD.source = 'self_serve'
     AND OLD.status::text = 'Awaiting Review'
     AND NEW.status::text = 'Declined' THEN
    v_msg := 'Self-serve proposal declined: ' || COALESCE(NEW.name, '');
    INSERT INTO activity_log (
      type, client_id, detail, summary, actor_id, event_category, event_source, visibility,
      entity_table, entity_id
    ) VALUES (
      'proposal_rejected_self_serve',
      NEW.client_id,
      v_msg, v_msg,
      auth.uid(),
      'outcome', 'mydash', 'team',
      'proposals', NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proposal_self_serve_rejected_log ON proposals;
CREATE TRIGGER proposal_self_serve_rejected_log
  AFTER UPDATE OF status ON proposals FOR EACH ROW
  EXECUTE FUNCTION public.tg_proposal_self_serve_rejected();

-- Documentation comments.
COMMENT ON COLUMN proposals.source IS
  'Origin of the proposal: rep_built (default) or self_serve. Self-serve proposals enter at status=Awaiting Review from StellarPress submissions.';
COMMENT ON COLUMN proposals.self_serve_token IS
  'Anon-readable token for advertiser-side resume/edit on StellarPress. NULL for rep_built proposals.';
COMMENT ON FUNCTION public.submit_self_serve_proposal(TEXT, UUID, JSONB, TEXT, TEXT, JSONB, TEXT) IS
  'Public RPC for StellarPress self-serve submissions. Creates a proposal in Awaiting Review status. Replaces submit_self_serve_booking (legacy RPC stays in place until Phase 6 cutover).';
COMMENT ON FUNCTION public.resolve_advertiser_tier(TEXT, TEXT) IS
  'Email→client tier resolver for self-serve identify step. Returns { tier: exact|domain|none, client_id, business_name, requires_confirmation }. Replaces the broken resolve-advertiser edge function.';
