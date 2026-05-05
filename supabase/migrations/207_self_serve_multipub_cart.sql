-- ============================================================
-- Migration 207 — Self-serve multi-pub cart (Phase 4B)
--
-- Spec: docs/specs/self-serve-multipub-cart-integration.md
--
-- Goal: a single self-serve proposal can carry lines spanning multiple
-- publications inside the same ad_sibling_group. Today everything is
-- pinned to p_site_id, so a sibling-pub line silently disappears from
-- the subtotal (catalog JOIN drops it) and is then persisted with the
-- wrong publication_id.
--
-- Three RPCs change in lockstep:
--
--   1. calculate_proposal_totals_for_self_serve — JOINs the catalog
--      against the LINE's publication_id (default = p_site_id), runs
--      a sibling-validation block first so out-of-group pubs error
--      with 'pub_not_sibling'. Output line_items carry publication_id
--      and pub_name so callers can group by pub for display.
--   2. submit_self_serve_proposal — same validation + writes each
--      proposal_lines row with the line's pub_id and pub_name.
--   3. update_self_serve_proposal — same.
--
-- Backwards-compat: lines without publication_id default to p_site_id.
-- Existing single-pub callers continue to work unchanged.
--
-- Sibling group membership is checked via publications.ad_sibling_group.
-- Pubs not in the same group as p_site_id (or not in any group) cannot
-- accept lines from a different originating pub. This is the bounded-
-- scope guarantee the spec calls out.
-- ============================================================

-- ── 1. calculate_proposal_totals_for_self_serve ───────────
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
  v_my_group      TEXT;
  v_local_pct CONSTANT NUMERIC(5,2) := 10.00;
BEGIN
  -- Originating pub's sibling group (NULL when unpaired).
  SELECT ad_sibling_group INTO v_my_group
    FROM publications WHERE id = p_site_id;

  -- Sibling-validation block. Any line whose effective pub differs
  -- from p_site_id AND isn't in the same ad_sibling_group rejects.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_line_items) item
    JOIN publications pub
      ON pub.id = COALESCE(NULLIF(item->>'publication_id', ''), p_site_id)
    WHERE COALESCE(NULLIF(item->>'publication_id', ''), p_site_id) <> p_site_id
      AND (v_my_group IS NULL OR pub.ad_sibling_group IS DISTINCT FROM v_my_group)
  ) THEN
    RAISE EXCEPTION 'pub_not_sibling';
  END IF;

  WITH input AS (
    SELECT (item->>'product_id')::uuid                                   AS product_id,
           COALESCE((item->>'quantity')::int, 1)                         AS quantity,
           COALESCE(item->>'kind', 'digital')                            AS kind,
           COALESCE(NULLIF(item->>'publication_id', ''), p_site_id)      AS publication_id,
           ord::int                                                      AS ord
    FROM jsonb_array_elements(p_line_items) WITH ORDINALITY AS t(item, ord)
  ),
  priced AS (
    SELECT i.ord, i.product_id, i.quantity, i.publication_id,
           pub.name AS pub_name, p.name AS name, 'digital'::text AS kind,
           p.rate_monthly::numeric(12,2)                AS unit_price,
           (p.rate_monthly * i.quantity)::numeric(12,2) AS line_total,
           p.width::numeric                             AS width,
           p.height::numeric                            AS height,
           NULL::uuid                                   AS print_size_id
    FROM input i
    JOIN digital_ad_products p
      ON p.id = i.product_id AND p.pub_id = i.publication_id AND p.is_active = true
    JOIN publications pub
      ON pub.id = i.publication_id
    WHERE i.kind = 'digital'

    UNION ALL

    SELECT i.ord, i.product_id, i.quantity, i.publication_id,
           pub.name AS pub_name, s.name AS name, 'print'::text AS kind,
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
      ON s.id = i.product_id AND s.pub_id = i.publication_id
    JOIN publications pub
      ON pub.id = i.publication_id
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
      'print_size_id',  print_size_id,
      'publication_id', publication_id,
      'pub_name',       pub_name
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
    -- Local-zip discount keys off the originating pub. Mixed-pub carts
    -- get the originating pub's local-zip rule applied to the whole
    -- subtotal — single decision, not per-pub. (Spec §5.3.)
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

-- ── 2. submit_self_serve_proposal (per-line pub_id + pub_name) ────
CREATE OR REPLACE FUNCTION public.submit_self_serve_proposal(
  p_site_id              text,
  p_existing_client_id   uuid,
  p_new_client           jsonb,
  p_billing_zip          text,
  p_intake_email         text,
  p_line_items           jsonb,
  p_creative_notes       text,
  p_reference_image_url  text DEFAULT NULL
) RETURNS jsonb
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
  v_contact_id       UUID;
  v_setup_token_id   UUID;
  v_image_url        TEXT := NULLIF(trim(p_reference_image_url), '');
  v_image_filename   TEXT;
  v_my_group         TEXT;
BEGIN
  IF p_site_id IS NULL OR v_intake IS NULL OR v_intake = ''
     OR p_line_items IS NULL OR jsonb_array_length(p_line_items) = 0 THEN
    RAISE EXCEPTION 'missing_required_fields';
  END IF;

  -- Mirror the calculator's sibling guard at the persistence layer so
  -- a malicious client can't bypass the calculator + go straight to
  -- submit. Calculator errors reach here too (it's invoked below) but
  -- the explicit early check returns a clean error message.
  SELECT ad_sibling_group INTO v_my_group FROM publications WHERE id = p_site_id;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_line_items) item
    JOIN publications pub
      ON pub.id = COALESCE(NULLIF(item->>'publication_id', ''), p_site_id)
    WHERE COALESCE(NULLIF(item->>'publication_id', ''), p_site_id) <> p_site_id
      AND (v_my_group IS NULL OR pub.ad_sibling_group IS DISTINCT FROM v_my_group)
  ) THEN
    RAISE EXCEPTION 'pub_not_sibling';
  END IF;

  IF p_existing_client_id IS NOT NULL THEN
    SELECT id, COALESCE(name, '') INTO v_client_id, v_business_name
      FROM clients WHERE id = p_existing_client_id;
    IF v_client_id IS NULL THEN
      RAISE EXCEPTION 'client_not_found';
    END IF;

    SELECT id INTO v_contact_id FROM client_contacts
     WHERE client_id = v_client_id AND lower(email) = v_intake LIMIT 1;
    IF v_contact_id IS NULL THEN
      SELECT id INTO v_contact_id FROM client_contacts
       WHERE client_id = v_client_id AND is_primary = true LIMIT 1;
    END IF;
  ELSE
    IF p_new_client IS NULL
       OR NULLIF(trim(p_new_client->>'business_name'), '') IS NULL
       OR NULLIF(trim(p_new_client->>'primary_email'), '') IS NULL
       OR NULLIF(trim(p_new_client->>'industry_id'),   '') IS NULL
       OR NULLIF(trim(p_new_client->>'phone'),         '') IS NULL THEN
      RAISE EXCEPTION 'new_client_missing_fields';
    END IF;

    v_industry_id   := NULLIF(p_new_client->>'industry_id', '')::uuid;
    v_business_name := trim(p_new_client->>'business_name');

    SELECT name INTO v_industry_name FROM industries WHERE id = v_industry_id;
    IF v_industry_name IS NULL THEN
      RAISE EXCEPTION 'invalid_industry_id';
    END IF;

    INSERT INTO clients (name, status, lead_source, industries, billing_email, billing_zip)
    VALUES (
      v_business_name, 'Lead', 'Self-Serve', ARRAY[v_industry_name],
      lower(trim(p_new_client->>'primary_email')),
      NULLIF(p_billing_zip, '')
    )
    RETURNING id INTO v_client_id;

    v_local_part := split_part(lower(trim(p_new_client->>'primary_email')), '@', 1);
    INSERT INTO client_contacts (client_id, name, email, phone, role, is_primary)
    VALUES (
      v_client_id, v_local_part, lower(trim(p_new_client->>'primary_email')),
      NULLIF(trim(p_new_client->>'phone'), ''), 'Self-Serve Submitter', true
    )
    RETURNING id INTO v_contact_id;
  END IF;

  v_totals := calculate_proposal_totals_for_self_serve(p_site_id, v_client_id, p_billing_zip, p_line_items);

  -- Salesperson stays scoped to the originating pub. Spec §5.1 punts
  -- on cross-pub commission split; one rep owns the multi-pub proposal.
  SELECT salesperson_id INTO v_assigned_to FROM salesperson_pub_assignments
   WHERE publication_id = p_site_id AND is_active = true
   ORDER BY percentage DESC, created_at ASC LIMIT 1;

  IF v_industry_id IS NULL AND p_existing_client_id IS NOT NULL THEN
    SELECT i.id INTO v_industry_id FROM clients c
      LEFT JOIN industries i ON i.name = ANY(c.industries)
     WHERE c.id = v_client_id ORDER BY i.markup_percent DESC NULLS LAST LIMIT 1;
  END IF;

  SELECT name INTO v_pub_name FROM publications WHERE id = p_site_id;

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
    'Awaiting Review', (v_totals->>'total')::numeric, 'self_serve',
    v_self_serve_token, v_intake, now(), v_assigned_to,
    NULLIF(trim(p_creative_notes), ''),
    (v_totals->>'subtotal')::numeric, (v_totals->>'markup_applied')::boolean,
    NULLIF((v_totals->>'markup_percent')::numeric, 0),
    (v_totals->>'markup_amount')::numeric,
    (v_totals->>'discount_applied')::boolean,
    NULLIF((v_totals->>'discount_percent')::numeric, 0),
    (v_totals->>'discount_amount')::numeric,
    NULLIF(p_billing_zip, ''), v_industry_id
  ) RETURNING id INTO v_proposal_id;

  -- Per-line publication_id (default to p_site_id when missing) and
  -- pub_name (from the priced output, populated by the calculator's
  -- per-line publications JOIN).
  INSERT INTO proposal_lines (
    proposal_id, publication_id, ad_size, price,
    digital_product_id, print_size_id,
    flight_start_date, flight_end_date, pub_name, sort_order
  )
  SELECT
    v_proposal_id,
    COALESCE(NULLIF(o.orig->>'publication_id', ''), p_site_id),
    COALESCE(p.priced->>'name', 'Ad'),
    (p.priced->>'line_total')::numeric,
    CASE WHEN p.priced->>'kind' = 'digital' THEN NULLIF(p.priced->>'product_id', '')::uuid END,
    CASE WHEN p.priced->>'kind' = 'print'   THEN NULLIF(p.priced->>'product_id', '')::uuid END,
    NULLIF(o.orig->>'run_start_date', '')::date,
    NULLIF(o.orig->>'run_end_date',   '')::date,
    COALESCE(p.priced->>'pub_name', v_pub_name),
    p.ord::int
  FROM jsonb_array_elements(v_totals->'line_items') WITH ORDINALITY AS p(priced, ord)
  JOIN jsonb_array_elements(p_line_items)         WITH ORDINALITY AS o(orig,  ord) USING (ord);

  IF v_image_url IS NOT NULL THEN
    v_image_filename := regexp_replace(split_part(v_image_url, '/', -1), '\?.*$', '');
    INSERT INTO media_assets (
      file_name, mime_type, file_url, cdn_url, original_url, thumbnail_url,
      category, client_id, source_proposal_id, alt_text, caption
    ) VALUES (
      coalesce(NULLIF(v_image_filename, ''), 'reference.jpg'),
      NULL,
      v_image_url, v_image_url, v_image_url, v_image_url,
      'proposal_intake',
      v_client_id, v_proposal_id,
      'Self-serve reference image',
      'Customer-uploaded reference image (self-serve)'
    );
  END IF;

  INSERT INTO portal_setup_tokens (client_id, contact_id, intake_email, proposal_id)
  VALUES (v_client_id, v_contact_id, v_intake, v_proposal_id)
  RETURNING id INTO v_setup_token_id;

  RETURN jsonb_build_object(
    'proposal_id',        v_proposal_id,
    'self_serve_token',   v_self_serve_token,
    'client_id',          v_client_id,
    'portal_setup_token', v_setup_token_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_self_serve_proposal(text, uuid, jsonb, text, text, jsonb, text, text)
  TO anon, authenticated;

-- ── 3. update_self_serve_proposal (per-line pub_id + pub_name) ────
CREATE OR REPLACE FUNCTION public.update_self_serve_proposal(
  p_proposal_id         UUID,
  p_self_serve_token    UUID,
  p_line_items          JSONB,
  p_creative_notes      TEXT,
  p_reference_image_url TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_id      UUID;
  v_site_id        TEXT;
  v_billing_zip    TEXT;
  v_pub_name       TEXT;
  v_status         TEXT;
  v_token_match    UUID;
  v_totals         JSONB;
  v_image_url      TEXT := NULLIF(trim(p_reference_image_url), '');
  v_image_filename TEXT;
  v_my_group       TEXT;
BEGIN
  IF p_proposal_id IS NULL OR p_self_serve_token IS NULL
     OR p_line_items IS NULL OR jsonb_array_length(p_line_items) = 0 THEN
    RAISE EXCEPTION 'missing_required_fields';
  END IF;

  -- Resolve the originating pub via the FIRST proposal_line. For an
  -- already-multi-pub proposal that's still the originating pub (we
  -- inserted them sort_order-first when submit ran), so this stays
  -- stable across edits. If a future invariant breaks that, swap to
  -- a dedicated proposals.origin_publication_id column.
  SELECT p.client_id, p.billing_zip, p.status::text, p.self_serve_token,
         (SELECT publication_id FROM proposal_lines
          WHERE proposal_id = p.id ORDER BY sort_order NULLS LAST LIMIT 1)
    INTO v_client_id, v_billing_zip, v_status, v_token_match, v_site_id
  FROM proposals p WHERE p.id = p_proposal_id AND p.source = 'self_serve';

  IF v_client_id IS NULL THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_token_match IS DISTINCT FROM p_self_serve_token THEN RAISE EXCEPTION 'token_mismatch'; END IF;
  IF v_status <> 'Awaiting Review' THEN RAISE EXCEPTION 'not_editable'; END IF;

  -- Same sibling guard as submit. Customer can add a sibling-pub line
  -- on resume-edit; can't add anything outside the group.
  SELECT ad_sibling_group INTO v_my_group FROM publications WHERE id = v_site_id;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_line_items) item
    JOIN publications pub
      ON pub.id = COALESCE(NULLIF(item->>'publication_id', ''), v_site_id)
    WHERE COALESCE(NULLIF(item->>'publication_id', ''), v_site_id) <> v_site_id
      AND (v_my_group IS NULL OR pub.ad_sibling_group IS DISTINCT FROM v_my_group)
  ) THEN
    RAISE EXCEPTION 'pub_not_sibling';
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
    COALESCE(NULLIF(o.orig->>'publication_id', ''), v_site_id),
    COALESCE(p.priced->>'name', 'Ad'),
    (p.priced->>'line_total')::numeric,
    CASE WHEN p.priced->>'kind' = 'digital' THEN NULLIF(p.priced->>'product_id', '')::uuid END,
    CASE WHEN p.priced->>'kind' = 'print'   THEN NULLIF(p.priced->>'product_id', '')::uuid END,
    NULLIF(o.orig->>'run_start_date', '')::date,
    NULLIF(o.orig->>'run_end_date', '')::date,
    COALESCE(p.priced->>'pub_name', v_pub_name),
    p.ord::int
  FROM jsonb_array_elements(v_totals->'line_items') WITH ORDINALITY AS p(priced, ord)
  JOIN jsonb_array_elements(p_line_items) WITH ORDINALITY AS o(orig, ord) USING (ord);

  UPDATE proposals SET
    total = (v_totals->>'total')::numeric,
    subtotal = (v_totals->>'subtotal')::numeric,
    markup_applied = (v_totals->>'markup_applied')::boolean,
    markup_percent = NULLIF((v_totals->>'markup_percent')::numeric, 0),
    markup_amount = (v_totals->>'markup_amount')::numeric,
    discount_applied = (v_totals->>'discount_applied')::boolean,
    discount_percent = NULLIF((v_totals->>'discount_percent')::numeric, 0),
    discount_amount = (v_totals->>'discount_amount')::numeric,
    brief_instructions = NULLIF(trim(p_creative_notes), ''),
    updated_at = now()
  WHERE id = p_proposal_id;

  IF v_image_url IS NOT NULL THEN
    DELETE FROM media_assets
     WHERE source_proposal_id = p_proposal_id AND category = 'proposal_intake';
    v_image_filename := regexp_replace(split_part(v_image_url, '/', -1), '\?.*$', '');
    INSERT INTO media_assets (
      file_name, mime_type, file_url, cdn_url, original_url, thumbnail_url,
      category, client_id, source_proposal_id, alt_text, caption
    ) VALUES (
      coalesce(NULLIF(v_image_filename, ''), 'reference.jpg'),
      NULL,
      v_image_url, v_image_url, v_image_url, v_image_url,
      'proposal_intake',
      v_client_id, p_proposal_id,
      'Self-serve reference image',
      'Customer-uploaded reference image (self-serve, replaced)'
    );
  END IF;

  RETURN jsonb_build_object(
    'proposal_id', p_proposal_id,
    'self_serve_token', p_self_serve_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_self_serve_proposal(uuid, uuid, jsonb, text, text)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
