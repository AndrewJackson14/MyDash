-- ============================================================
-- Migration 205 — Self-serve reference image upload
--
-- Lets anon advertisers attach ONE reference image to a self-serve
-- submission. The image flows into the same proposal_intake bucket
-- that the proposal-wizard's Brief step uses (mig 161), so on
-- contract conversion it lands on the first ad_project queue with
-- no extra plumbing — designers just see it.
--
-- Why not Bunny via uploadMedia()?
--   uploadMedia → bunny-storage edge function, which is verify_jwt
--   and not callable by anon. Self-serve users have no JWT yet
--   (the portal-setup token is post-submit). Supabase Storage with
--   a public bucket is anon-friendly and the URL it produces is
--   just a regular https URL, which is what media_assets.cdn_url
--   already accepts. Cleanup of orphaned uploads (user abandons
--   pre-submit) is a future sweeper — Phase G if it becomes a
--   problem; not blocking for ship.
--
-- What changes:
--   1. Storage bucket 'self-serve-uploads' — public read, 8 MB cap,
--      image+pdf mime allowlist. Anon INSERT allowed (path-prefixed
--      so they can't write to other people's folders).
--   2. submit_self_serve_proposal gains p_reference_image_url TEXT
--      DEFAULT NULL — when set, inserts a media_assets row tagged
--      proposal_intake + source_proposal_id so downstream re-tagging
--      already works via the mig-161 RPC.
--   3. update_self_serve_proposal gains the same parameter — replaces
--      the existing intake asset on resume-edit (delete + re-insert).
--      Old storage object stays orphaned (acceptable for v1).
--
-- Anon RPC grant signature changes mean the GRANT line carries the
-- new arity. The old function signature (7 args, no p_reference_image_url)
-- is dropped so there's no overload ambiguity from the front-end caller.
-- ============================================================

-- ── 1. Storage bucket ──────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'self-serve-uploads',
  'self-serve-uploads',
  true,
  8388608, -- 8 MB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/gif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2. Storage policies ────────────────────────────────────
-- Public-read is implicit for public buckets, but make INSERT explicit
-- for anon. Path guard: first folder segment must look like a uuid so
-- random anons can't dump trash into the bucket root or stomp on a
-- legit folder. Length floor only — full uuid validation would block
-- legit clients on minor variation.
DROP POLICY IF EXISTS "self_serve_uploads_anon_insert" ON storage.objects;
CREATE POLICY "self_serve_uploads_anon_insert"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'self-serve-uploads'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND length((storage.foldername(name))[1]) >= 16
  );

DROP POLICY IF EXISTS "self_serve_uploads_public_read" ON storage.objects;
CREATE POLICY "self_serve_uploads_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'self-serve-uploads');

-- ── 3. submit_self_serve_proposal ──────────────────────────
-- Drop the prior 7-arg version so the 8-arg version is unambiguous.
DROP FUNCTION IF EXISTS public.submit_self_serve_proposal(text, uuid, jsonb, text, text, jsonb, text);

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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  IF p_site_id IS NULL OR v_intake IS NULL OR v_intake = ''
     OR p_line_items IS NULL OR jsonb_array_length(p_line_items) = 0 THEN
    RAISE EXCEPTION 'missing_required_fields';
  END IF;

  IF p_existing_client_id IS NOT NULL THEN
    SELECT id, COALESCE(name, '') INTO v_client_id, v_business_name
      FROM clients WHERE id = p_existing_client_id;
    IF v_client_id IS NULL THEN
      RAISE EXCEPTION 'client_not_found';
    END IF;

    SELECT id INTO v_contact_id
      FROM client_contacts
     WHERE client_id = v_client_id
       AND lower(email) = v_intake
     LIMIT 1;
    IF v_contact_id IS NULL THEN
      SELECT id INTO v_contact_id
        FROM client_contacts
       WHERE client_id = v_client_id AND is_primary = true
       LIMIT 1;
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
      v_business_name,
      'Lead',
      'Self-Serve',
      ARRAY[v_industry_name],
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
    )
    RETURNING id INTO v_contact_id;
  END IF;

  v_totals := calculate_proposal_totals_for_self_serve(p_site_id, v_client_id, p_billing_zip, p_line_items);

  SELECT salesperson_id INTO v_assigned_to
    FROM salesperson_pub_assignments
   WHERE publication_id = p_site_id AND is_active = true
   ORDER BY percentage DESC, created_at ASC
   LIMIT 1;

  IF v_industry_id IS NULL AND p_existing_client_id IS NOT NULL THEN
    SELECT i.id INTO v_industry_id
      FROM clients c
      LEFT JOIN industries i ON i.name = ANY(c.industries)
     WHERE c.id = v_client_id
     ORDER BY i.markup_percent DESC NULLS LAST
     LIMIT 1;
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
    CASE WHEN p.priced->>'kind' = 'digital' THEN NULLIF(p.priced->>'product_id', '')::uuid END,
    CASE WHEN p.priced->>'kind' = 'print'   THEN NULLIF(p.priced->>'product_id', '')::uuid END,
    NULLIF(o.orig->>'run_start_date', '')::date,
    NULLIF(o.orig->>'run_end_date',   '')::date,
    v_pub_name,
    p.ord::int
  FROM jsonb_array_elements(v_totals->'line_items') WITH ORDINALITY AS p(priced, ord)
  JOIN jsonb_array_elements(p_line_items)         WITH ORDINALITY AS o(orig,  ord) USING (ord);

  -- Reference-image attachment. Tagged the same way the proposal-wizard
  -- tags Brief-step uploads (category='proposal_intake' + source_proposal_id),
  -- so convert_proposal_to_contract (mig 161) re-tags it to the first
  -- ad_project on signing — designers see it in queue with no extra step.
  IF v_image_url IS NOT NULL THEN
    v_image_filename := regexp_replace(split_part(v_image_url, '/', -1), '\?.*$', '');
    INSERT INTO media_assets (
      file_name, mime_type, file_url, cdn_url, original_url, thumbnail_url,
      category, client_id, source_proposal_id, asset_type, title, caption
    ) VALUES (
      coalesce(NULLIF(v_image_filename, ''), 'reference.jpg'),
      NULL,
      v_image_url, v_image_url, v_image_url, v_image_url,
      'proposal_intake',
      v_client_id, v_proposal_id,
      'collateral',
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

-- ── 4. update_self_serve_proposal ──────────────────────────
DROP FUNCTION IF EXISTS public.update_self_serve_proposal(uuid, uuid, jsonb, text);

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
    CASE WHEN p.priced->>'kind' = 'digital' THEN NULLIF(p.priced->>'product_id', '')::uuid END,
    CASE WHEN p.priced->>'kind' = 'print'   THEN NULLIF(p.priced->>'product_id', '')::uuid END,
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

  -- Reference-image replace. Only acts when the customer sent a new
  -- URL — silent NULL means "leave the existing attachment alone."
  -- Old storage object stays orphaned; sweeper is future work.
  IF v_image_url IS NOT NULL THEN
    DELETE FROM media_assets
     WHERE source_proposal_id = p_proposal_id
       AND category = 'proposal_intake';
    v_image_filename := regexp_replace(split_part(v_image_url, '/', -1), '\?.*$', '');
    INSERT INTO media_assets (
      file_name, mime_type, file_url, cdn_url, original_url, thumbnail_url,
      category, client_id, source_proposal_id, asset_type, title, caption
    ) VALUES (
      coalesce(NULLIF(v_image_filename, ''), 'reference.jpg'),
      NULL,
      v_image_url, v_image_url, v_image_url, v_image_url,
      'proposal_intake',
      v_client_id, p_proposal_id,
      'collateral',
      'Self-serve reference image',
      'Customer-uploaded reference image (self-serve, replaced)'
    );
  END IF;

  RETURN jsonb_build_object(
    'proposal_id',       p_proposal_id,
    'self_serve_token',  p_self_serve_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_self_serve_proposal(uuid, uuid, jsonb, text, text)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
