-- ============================================================
-- 183_self_serve_print_integration.sql
--
-- Extends the self-serve proposal pipeline to support print line
-- items sourced from ad_sizes. Until now the four self-serve RPCs
-- only knew digital_ad_products; print rows would FK-error on insert.
--
-- Design (per docs/specs/self-serve-print-integration.md):
--   • Parallel column proposal_lines.print_size_id (UUID, FK → ad_sizes).
--     Existing readers of digital_product_id keep working untouched.
--   • CHECK ((digital_product_id IS NOT NULL)::int +
--             (print_size_id IS NOT NULL)::int <= 1)
--     — exactly-one is wrong because rep-built proposals can carry
--     free-text lines for non-catalog pubs (e.g. paper-contract imports
--     for pub-opendoor-directories). Self-serve always sets exactly
--     one by construction.
--   • Frontend payload: each line carries kind ∈ {'digital','print'};
--     missing kind defaults to 'digital' so today's StellarPress callers
--     keep working untouched.
--   • Frequency tier for print: quantity ∈ {1,6,12,18} picks
--     rate / rate_6 / rate_12 / rate_18 with next-lower fallback when
--     the row's tier rate is NULL (some pubs don't offer all tiers).
--     UI is responsible for not rendering buttons for NULL tiers; this
--     fallback is defense-in-depth.
--
-- Rewrites all four self-serve RPCs in one transaction. Zero existing
-- self_serve proposals (verified 2026-05-01), so no data migration.
-- ============================================================

BEGIN;

-- 1. Schema additions (idempotent).
ALTER TABLE proposal_lines
  ADD COLUMN IF NOT EXISTS print_size_id UUID REFERENCES ad_sizes(id) ON DELETE SET NULL;

ALTER TABLE proposal_lines DROP CONSTRAINT IF EXISTS proposal_lines_one_catalog_ref;
ALTER TABLE proposal_lines ADD CONSTRAINT proposal_lines_one_catalog_ref
  CHECK ((digital_product_id IS NOT NULL)::int + (print_size_id IS NOT NULL)::int <= 1);

CREATE INDEX IF NOT EXISTS idx_proposal_lines_print_size_id
  ON proposal_lines (print_size_id) WHERE print_size_id IS NOT NULL;

COMMENT ON COLUMN proposal_lines.print_size_id IS
  'FK to ad_sizes(id) for print line items. Mutually exclusive with digital_product_id (CHECK proposal_lines_one_catalog_ref). Both NULL allowed for free-text/imported lines.';

-- ============================================================
-- 2. calculate_proposal_totals_for_self_serve
--
-- Rewritten with a UNION ALL priced CTE: digital branch JOINs
-- digital_ad_products (today's behavior); print branch JOINs ad_sizes
-- and selects rate by quantity tier.
--
-- The line_items output now carries `kind`, `width`, `height`,
-- `print_size_id` so submit/update/get can route correctly without
-- a second pass over the input. ORDER BY ord in jsonb_agg preserves
-- input order — the submit/update insert joins back on ordinality.
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
           COALESCE((item->>'quantity')::int, 1) AS quantity,
           COALESCE(item->>'kind', 'digital') AS kind,
           ord::int AS ord
    FROM jsonb_array_elements(p_line_items) WITH ORDINALITY AS t(item, ord)
  ),
  priced AS (
    -- Digital branch (unchanged behavior; kind defaults to 'digital').
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

    -- Print branch: tier picked by quantity, with next-lower fallback
    -- when the corresponding rate column is NULL on the row.
    SELECT i.ord, i.product_id, i.quantity, s.name, 'print'::text AS kind,
           CASE
             WHEN i.quantity >= 18 AND s.rate_18 IS NOT NULL THEN s.rate_18::numeric(12,2)
             WHEN i.quantity >= 12 AND s.rate_12 IS NOT NULL THEN s.rate_12::numeric(12,2)
             WHEN i.quantity >= 6  AND s.rate_6  IS NOT NULL THEN s.rate_6::numeric(12,2)
             ELSE s.rate::numeric(12,2)
           END AS unit_price,
           CASE
             WHEN i.quantity >= 18 AND s.rate_18 IS NOT NULL THEN (s.rate_18 * i.quantity)::numeric(12,2)
             WHEN i.quantity >= 12 AND s.rate_12 IS NOT NULL THEN (s.rate_12 * i.quantity)::numeric(12,2)
             WHEN i.quantity >= 6  AND s.rate_6  IS NOT NULL THEN (s.rate_6  * i.quantity)::numeric(12,2)
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
-- 3. submit_self_serve_proposal
--
-- Same flow as before; the only material change is the proposal_lines
-- insert, which CASE-branches on priced.kind to populate either
-- digital_product_id or print_size_id (CHECK enforces ≤1).
-- Default ad_size fallback changed from 'Digital Ad' to generic 'Ad'.
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

  -- C. Default rep for the site.
  SELECT salesperson_id INTO v_assigned_to
  FROM salesperson_pub_assignments
  WHERE publication_id = p_site_id AND is_active = true
  ORDER BY percentage DESC, created_at ASC
  LIMIT 1;

  -- D. Industry resolution for existing clients.
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

  -- F. Insert proposal_lines. Branch FK column on priced.kind.
  INSERT INTO proposal_lines (
    proposal_id, publication_id, ad_size, price,
    digital_product_id, print_size_id,
    flight_start_date, flight_end_date, pub_name, sort_order
  )
  SELECT
    v_proposal_id,
    p_site_id,
    COALESCE(p.priced->>'name', 'Ad'),
    (p.priced->>'line_total')::numeric,
    CASE WHEN p.priced->>'kind' = 'digital'
         THEN NULLIF(p.priced->>'product_id', '')::uuid END AS digital_product_id,
    CASE WHEN p.priced->>'kind' = 'print'
         THEN NULLIF(p.priced->>'product_id', '')::uuid END AS print_size_id,
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
-- 4. update_self_serve_proposal — same kind-branching as submit.
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
    RAISE EXCEPTION 'not_editable';
  END IF;

  v_totals := calculate_proposal_totals_for_self_serve(v_site_id, v_client_id, v_billing_zip, p_line_items);

  SELECT name INTO v_pub_name FROM publications WHERE id = v_site_id;

  DELETE FROM proposal_lines WHERE proposal_id = p_proposal_id;

  INSERT INTO proposal_lines (
    proposal_id, publication_id, ad_size, price,
    digital_product_id, print_size_id,
    flight_start_date, flight_end_date, pub_name, sort_order
  )
  SELECT
    p_proposal_id,
    v_site_id,
    COALESCE(p.priced->>'name', 'Ad'),
    (p.priced->>'line_total')::numeric,
    CASE WHEN p.priced->>'kind' = 'digital'
         THEN NULLIF(p.priced->>'product_id', '')::uuid END AS digital_product_id,
    CASE WHEN p.priced->>'kind' = 'print'
         THEN NULLIF(p.priced->>'product_id', '')::uuid END AS print_size_id,
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

-- ============================================================
-- 5. get_self_serve_proposal
--
-- Now surfaces `kind`, `width`, `height`, `print_size_id` per line so
-- StellarPress's status page can render print/digital side-by-side
-- with the same SVG placeholder the catalog uses. signing_url logic
-- (mig 181) preserved.
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

  IF v_proposal.status = 'Declined' THEN
    v_decline_reason := v_proposal.notes;
  END IF;

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

  -- Lines: kind derived from which FK is set; dimensions LEFT JOINed
  -- from whichever catalog table matches. Free-text rows (both FKs null)
  -- get kind='free_text' and NULL dimensions — the StellarPress UI
  -- shouldn't see these from a self-serve flow, but the column is
  -- reachable via rep edits so handle it explicitly.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'pub_name',          l.pub_name,
    'publication_id',    l.publication_id,
    'ad_size',           l.ad_size,
    'price',             l.price,
    'flight_start_date', l.flight_start_date,
    'flight_end_date',   l.flight_end_date,
    'kind', CASE
              WHEN l.print_size_id    IS NOT NULL THEN 'print'
              WHEN l.digital_product_id IS NOT NULL THEN 'digital'
              ELSE 'free_text'
            END,
    'digital_product_id', l.digital_product_id,
    'print_size_id',      l.print_size_id,
    'width',  COALESCE(d.width::numeric, s.width),
    'height', COALESCE(d.height::numeric, s.height)
  ) ORDER BY l.sort_order NULLS LAST), '[]'::jsonb)
  INTO v_lines
  FROM proposal_lines l
  LEFT JOIN digital_ad_products d ON d.id = l.digital_product_id
  LEFT JOIN ad_sizes            s ON s.id = l.print_size_id
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

GRANT EXECUTE ON FUNCTION public.get_self_serve_proposal(UUID) TO anon, authenticated;

COMMENT ON FUNCTION public.get_self_serve_proposal(UUID) IS
  'Token-gated read for the StellarPress ProposalStatusPage. Returns kind/width/height per line (mig 183 print integration), signing_url when an unsigned proposal_signatures row exists, and decline_reason only when status=Declined.';

COMMIT;
