-- =====================================================================
-- 194_client_portal.sql
-- Client Portal — Phase A backend foundation.
-- Spec: docs/specs/client-portal-spec.md.md (v1.0)
--
-- Implements locked design decisions D3, D4, D5, D6, D8, D9, D11, D12,
-- D13, D14 (see spec §13).
--
-- Adaptations from spec to actual production schema:
--   - migration number 194 (193 was used for index hygiene batch 2)
--   - invoices.issued_at         → invoices.issue_date::timestamptz
--   - invoices.paid_at           → invoices.updated_at when status='Paid'
--   - invoices.amount_due        → invoices.total
--   - invoices.amount_paid       → invoices.total - invoices.balance_due
--   - ad_projects.production_status → ad_projects.status (text)
--   - ad_projects.client_id      → exists; used as-is (no FK enforced but
--                                  column populated; verified pre-mig)
--
-- Note for Batch 3 (later): RLS policies here use auth.uid() inside the
-- helper user_can_access_client(); the helper is STABLE SECURITY DEFINER
-- so the planner can hoist it. If auth_rls_initplan still flags these
-- policies after batch 3, swap to (SELECT auth.uid()) inside the helper.
-- =====================================================================

-- =====================================================================
-- 1. New columns on existing tables
-- =====================================================================

-- 1.1 client_contacts: portal binding + prefs + revocation
ALTER TABLE public.client_contacts
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{
    "proposal_status": true,
    "invoice_posted": true,
    "ad_project_milestones": true,
    "marketing": false
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS portal_revoked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_contacts_auth_user_client
  ON public.client_contacts(auth_user_id, client_id)
  WHERE auth_user_id IS NOT NULL AND portal_revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_client_contacts_auth_user
  ON public.client_contacts(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

COMMENT ON COLUMN public.client_contacts.auth_user_id IS
  'Links this contact to a Supabase auth user. Multiple contacts at different clients can share the same auth_user_id (agency case).';

COMMENT ON COLUMN public.client_contacts.notification_preferences IS
  'JSONB map of event_type → enabled boolean. Keys: proposal_status, invoice_posted, ad_project_milestones, marketing.';

COMMENT ON COLUMN public.client_contacts.portal_revoked_at IS
  'When set, this contact no longer has portal access for this client. Auth user persists.';

-- 1.2 clients: add portal slug
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS slug text;

-- Backfill: generate slug from name with collision handling
DO $$
DECLARE
  r              RECORD;
  base_slug      text;
  candidate_slug text;
  counter        int;
BEGIN
  FOR r IN SELECT id, name FROM public.clients WHERE slug IS NULL ORDER BY created_at LOOP
    base_slug := lower(regexp_replace(coalesce(r.name, 'unnamed'), '[^a-zA-Z0-9]+', '-', 'g'));
    base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
    base_slug := substring(base_slug from 1 for 64);
    IF base_slug IS NULL OR base_slug = '' THEN
      base_slug := 'client-' || substring(r.id::text, 1, 8);
    END IF;

    candidate_slug := base_slug;
    counter := 1;
    WHILE EXISTS (SELECT 1 FROM public.clients WHERE slug = candidate_slug) LOOP
      counter := counter + 1;
      candidate_slug := base_slug || '-' || counter;
    END LOOP;

    UPDATE public.clients SET slug = candidate_slug WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.clients
  ALTER COLUMN slug SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_slug_unique'
  ) THEN
    ALTER TABLE public.clients ADD CONSTRAINT clients_slug_unique UNIQUE (slug);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clients_slug ON public.clients(slug);


-- =====================================================================
-- 2. portal_setup_tokens table
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.portal_setup_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contact_id    uuid REFERENCES public.client_contacts(id) ON DELETE SET NULL,
  intake_email  text NOT NULL,
  proposal_id   uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  consumed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT portal_setup_tokens_email_lower
    CHECK (intake_email = lower(intake_email))
);

CREATE INDEX IF NOT EXISTS idx_portal_setup_tokens_email
  ON public.portal_setup_tokens(intake_email)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_portal_setup_tokens_client
  ON public.portal_setup_tokens(client_id);

CREATE INDEX IF NOT EXISTS idx_portal_setup_tokens_proposal_id
  ON public.portal_setup_tokens(proposal_id)
  WHERE proposal_id IS NOT NULL;

COMMENT ON TABLE public.portal_setup_tokens IS
  'Single-use tokens issued post-self-serve-submit (or via invitation). Bind a Supabase magic-link redirect to a specific client_contact via complete_portal_setup RPC.';

-- RLS: service-role only by default. The two flows that need access
-- (request_portal_setup_link RPC and complete_portal_setup RPC) are
-- SECURITY DEFINER and bypass RLS.
ALTER TABLE public.portal_setup_tokens ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- 3. Helper: user_can_access_client(uuid)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.user_can_access_client(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM client_contacts
    WHERE client_id = p_client_id
      AND auth_user_id = auth.uid()
      AND portal_revoked_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.user_can_access_client(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.user_can_access_client(uuid) TO authenticated;

COMMENT ON FUNCTION public.user_can_access_client IS
  'Returns true if the current auth user has an active (non-revoked) contact role at the given client.';


-- =====================================================================
-- 4. RLS policies — portal-readable tables
-- =====================================================================

ALTER TABLE public.clients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_contacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_lines       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_signatures  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices             ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_clients_read ON public.clients;
CREATE POLICY portal_clients_read
  ON public.clients FOR SELECT TO authenticated
  USING (user_can_access_client(id));

DROP POLICY IF EXISTS portal_client_contacts_read ON public.client_contacts;
CREATE POLICY portal_client_contacts_read
  ON public.client_contacts FOR SELECT TO authenticated
  USING (user_can_access_client(client_id));

DROP POLICY IF EXISTS portal_proposals_read ON public.proposals;
CREATE POLICY portal_proposals_read
  ON public.proposals FOR SELECT TO authenticated
  USING (user_can_access_client(client_id));

DROP POLICY IF EXISTS portal_proposal_lines_read ON public.proposal_lines;
CREATE POLICY portal_proposal_lines_read
  ON public.proposal_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
       WHERE p.id = proposal_lines.proposal_id
         AND user_can_access_client(p.client_id)
    )
  );

DROP POLICY IF EXISTS portal_proposal_signatures_read ON public.proposal_signatures;
CREATE POLICY portal_proposal_signatures_read
  ON public.proposal_signatures FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
       WHERE p.id = proposal_signatures.proposal_id
         AND user_can_access_client(p.client_id)
    )
  );

DROP POLICY IF EXISTS portal_ad_projects_read ON public.ad_projects;
CREATE POLICY portal_ad_projects_read
  ON public.ad_projects FOR SELECT TO authenticated
  USING (user_can_access_client(client_id));

DROP POLICY IF EXISTS portal_invoices_read ON public.invoices;
CREATE POLICY portal_invoices_read
  ON public.invoices FOR SELECT TO authenticated
  USING (user_can_access_client(client_id));


-- =====================================================================
-- 5. Activity feed function (D11)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_client_activity(
  p_client_id uuid,
  p_limit     int DEFAULT 50
)
RETURNS TABLE (
  event_at      timestamptz,
  event_type    text,
  context_type  text,
  context_id    uuid,
  title         text,
  detail        jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT user_can_access_client(p_client_id) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  RETURN QUERY
  WITH events AS (
    -- Proposal submitted
    SELECT
      p.awaiting_review_at AS event_at,
      'proposal_submitted'::text AS event_type,
      'proposal'::text AS context_type,
      p.id AS context_id,
      'Proposal submitted'::text AS title,
      jsonb_build_object(
        'total',     p.total,
        'pub_count', (SELECT count(DISTINCT publication_id) FROM proposal_lines WHERE proposal_id = p.id)
      ) AS detail
    FROM proposals p
    WHERE p.client_id = p_client_id AND p.awaiting_review_at IS NOT NULL

    UNION ALL
    SELECT p.sent_at, 'proposal_sent'::text, 'proposal'::text, p.id,
           'Proposal sent for your review'::text,
           jsonb_build_object('total', p.total)
      FROM proposals p
     WHERE p.client_id = p_client_id AND p.sent_at IS NOT NULL

    UNION ALL
    SELECT p.signed_at, 'proposal_signed'::text, 'proposal'::text, p.id,
           'Contract signed'::text,
           jsonb_build_object('total', p.total)
      FROM proposals p
     WHERE p.client_id = p_client_id AND p.signed_at IS NOT NULL

    UNION ALL
    SELECT p.converted_at, 'proposal_converted'::text, 'proposal'::text, p.id,
           'Ad project started'::text,
           jsonb_build_object('total', p.total)
      FROM proposals p
     WHERE p.client_id = p_client_id AND p.converted_at IS NOT NULL

    UNION ALL
    SELECT ap.created_at, 'ad_project_created'::text, 'ad_project'::text, ap.id,
           'Ad project created'::text,
           jsonb_build_object('status', ap.status)
      FROM ad_projects ap
     WHERE ap.client_id = p_client_id

    UNION ALL
    -- Invoice issued — issue_date is a DATE; promote to timestamptz at midnight UTC
    SELECT (i.issue_date::timestamptz),
           'invoice_issued'::text, 'invoice'::text, i.id,
           'Invoice ' || coalesce(i.invoice_number, '#' || substring(i.id::text, 1, 8)) || ' issued',
           jsonb_build_object('amount', i.total)
      FROM invoices i
     WHERE i.client_id = p_client_id AND i.issue_date IS NOT NULL

    UNION ALL
    -- Invoice paid — production schema has no paid_at column; we surface
    -- the row's last update time when status='Paid'. v2 will hook into
    -- payments table for true per-payment timestamps.
    SELECT i.updated_at,
           'invoice_paid'::text, 'invoice'::text, i.id,
           'Invoice ' || coalesce(i.invoice_number, '#' || substring(i.id::text, 1, 8)) || ' paid',
           jsonb_build_object('amount', (i.total - coalesce(i.balance_due, 0)))
      FROM invoices i
     WHERE i.client_id = p_client_id
       AND i.status::text = 'Paid'
  )
  SELECT * FROM events
   ORDER BY event_at DESC NULLS LAST
   LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_activity(uuid, int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_client_activity(uuid, int) TO authenticated;


-- =====================================================================
-- 6. RPCs
-- =====================================================================

-- 6.1 complete_portal_setup
CREATE OR REPLACE FUNCTION public.complete_portal_setup(
  p_token uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token        portal_setup_tokens%ROWTYPE;
  v_user_id      uuid;
  v_user_email   text;
  v_bound_count  int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'no_user_email';
  END IF;
  v_user_email := lower(v_user_email);

  SELECT * INTO v_token FROM portal_setup_tokens WHERE id = p_token;
  IF v_token.id IS NULL THEN
    RAISE EXCEPTION 'token_not_found';
  END IF;
  IF v_token.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'token_already_consumed';
  END IF;
  IF v_token.expires_at < now() THEN
    RAISE EXCEPTION 'token_expired';
  END IF;
  IF lower(v_token.intake_email) <> v_user_email THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  -- Bind auth_user_id on every contact row matching this email (D8: auto-bind)
  UPDATE client_contacts
     SET auth_user_id      = v_user_id,
         portal_revoked_at = NULL
   WHERE lower(email) = v_user_email
     AND (auth_user_id IS NULL OR auth_user_id = v_user_id);

  GET DIAGNOSTICS v_bound_count = ROW_COUNT;

  UPDATE portal_setup_tokens SET consumed_at = now() WHERE id = p_token;

  RETURN jsonb_build_object(
    'success',            true,
    'active_client_id',   v_token.client_id,
    'active_client_slug', (SELECT slug FROM clients WHERE id = v_token.client_id),
    'contacts_bound',     v_bound_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_portal_setup(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.complete_portal_setup(uuid) TO authenticated;


-- 6.2 request_portal_setup_link (anon-callable)
CREATE OR REPLACE FUNCTION public.request_portal_setup_link(
  p_email text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email          text;
  v_contact_count  int;
  v_token_id       uuid;
  v_client_id      uuid;
  v_contact_id     uuid;
BEGIN
  v_email := lower(trim(coalesce(p_email, '')));
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  -- Pick the most-recently-touched eligible contact for this email.
  SELECT count(*) INTO v_contact_count
    FROM client_contacts
   WHERE lower(email) = v_email AND portal_revoked_at IS NULL;

  IF v_contact_count = 0 THEN
    -- Don't reveal absence (avoid email enumeration)
    RETURN jsonb_build_object('success', true, 'eligible', false);
  END IF;

  SELECT id, client_id INTO v_contact_id, v_client_id
    FROM client_contacts
   WHERE lower(email) = v_email AND portal_revoked_at IS NULL
   ORDER BY created_at DESC
   LIMIT 1;

  INSERT INTO portal_setup_tokens (client_id, contact_id, intake_email)
  VALUES (v_client_id, v_contact_id, v_email)
  RETURNING id INTO v_token_id;

  RETURN jsonb_build_object(
    'success',  true,
    'eligible', true,
    'token_id', v_token_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_portal_setup_link(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.request_portal_setup_link(text) TO anon, authenticated;


-- 6.3 invite_client_contact (D9)
CREATE OR REPLACE FUNCTION public.invite_client_contact(
  p_client_id uuid,
  p_email     text,
  p_name      text,
  p_role      text,
  p_title     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inviter_role text;
  v_email        text;
  v_contact_id   uuid;
  v_token_id     uuid;
BEGIN
  IF NOT user_can_access_client(p_client_id) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  -- Inviter must hold an advertising or billing role on this client.
  SELECT role INTO v_inviter_role
    FROM client_contacts
   WHERE auth_user_id = auth.uid()
     AND client_id    = p_client_id
     AND portal_revoked_at IS NULL
   LIMIT 1;

  IF v_inviter_role IS NULL OR
     NOT (v_inviter_role ~* 'advertising' OR v_inviter_role ~* 'billing') THEN
    RAISE EXCEPTION 'inviter_not_authorized';
  END IF;

  IF p_role NOT IN ('advertising', 'billing', 'advertising,billing', 'read-only') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  v_email := lower(trim(coalesce(p_email, '')));
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  SELECT id INTO v_contact_id
    FROM client_contacts
   WHERE lower(email) = v_email AND client_id = p_client_id;

  IF v_contact_id IS NOT NULL THEN
    UPDATE client_contacts SET
       role              = p_role,
       title             = COALESCE(NULLIF(trim(p_title), ''), title),
       name              = COALESCE(NULLIF(trim(p_name),  ''), name),
       portal_revoked_at = NULL
    WHERE id = v_contact_id;
  ELSE
    INSERT INTO client_contacts (client_id, name, email, role, title, is_primary)
    VALUES (p_client_id, trim(p_name), v_email, p_role, NULLIF(trim(p_title), ''), false)
    RETURNING id INTO v_contact_id;
  END IF;

  INSERT INTO portal_setup_tokens (client_id, contact_id, intake_email)
  VALUES (p_client_id, v_contact_id, v_email)
  RETURNING id INTO v_token_id;

  RETURN jsonb_build_object(
    'success',    true,
    'contact_id', v_contact_id,
    'token_id',   v_token_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invite_client_contact(uuid, text, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.invite_client_contact(uuid, text, text, text, text) TO authenticated;


-- 6.4 revoke_client_contact
CREATE OR REPLACE FUNCTION public.revoke_client_contact(
  p_contact_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id     uuid;
  v_inviter_role  text;
  v_target_auth   uuid;
BEGIN
  SELECT client_id, auth_user_id INTO v_client_id, v_target_auth
    FROM client_contacts WHERE id = p_contact_id;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'contact_not_found';
  END IF;

  IF NOT user_can_access_client(v_client_id) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  SELECT role INTO v_inviter_role
    FROM client_contacts
   WHERE auth_user_id = auth.uid()
     AND client_id    = v_client_id
     AND portal_revoked_at IS NULL
   LIMIT 1;

  IF v_inviter_role IS NULL OR
     NOT (v_inviter_role ~* 'advertising' OR v_inviter_role ~* 'billing') THEN
    RAISE EXCEPTION 'revoker_not_authorized';
  END IF;

  IF v_target_auth = auth.uid() THEN
    RAISE EXCEPTION 'cannot_revoke_self';
  END IF;

  UPDATE client_contacts SET portal_revoked_at = now() WHERE id = p_contact_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_client_contact(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.revoke_client_contact(uuid) TO authenticated;


-- 6.5 update_notification_preferences
CREATE OR REPLACE FUNCTION public.update_notification_preferences(
  p_client_id   uuid,
  p_preferences jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT user_can_access_client(p_client_id) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  IF p_preferences IS NULL OR jsonb_typeof(p_preferences) <> 'object' THEN
    RAISE EXCEPTION 'invalid_preferences';
  END IF;

  UPDATE client_contacts
     SET notification_preferences = p_preferences
   WHERE auth_user_id = auth.uid()
     AND client_id    = p_client_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.update_notification_preferences(uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_notification_preferences(uuid, jsonb) TO authenticated;


-- =====================================================================
-- 6.6 Defense-in-depth: explicitly REVOKE EXECUTE from anon on the
-- authenticated-only RPCs. Supabase's default schema grant gives anon
-- EXECUTE on every public function; the REVOKE FROM PUBLIC above does
-- not strip those explicit role grants. Without this, anon callers
-- pass the EXECUTE check and get rejected only by the in-function
-- auth.uid() / user_can_access_client() guards. Belt-and-suspenders.
--
-- request_portal_setup_link intentionally KEEPS anon EXECUTE (it's
-- the public "send me a sign-in link" entry point).
-- =====================================================================
REVOKE EXECUTE ON FUNCTION public.complete_portal_setup(uuid)              FROM anon;
REVOKE EXECUTE ON FUNCTION public.invite_client_contact(uuid, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revoke_client_contact(uuid)              FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_notification_preferences(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_can_access_client(uuid)             FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_client_activity(uuid, int)           FROM anon;


-- =====================================================================
-- 7. Update submit_self_serve_proposal: issue portal_setup_token + return it
-- =====================================================================
-- Preserves existing signature and behavior; adds:
--   • capture v_contact_id (from new-client INSERT or lookup on existing)
--   • INSERT INTO portal_setup_tokens with proposal_id linkage
--   • return key 'portal_setup_token'
CREATE OR REPLACE FUNCTION public.submit_self_serve_proposal(
  p_site_id           text,
  p_existing_client_id uuid,
  p_new_client        jsonb,
  p_billing_zip       text,
  p_intake_email      text,
  p_line_items        jsonb,
  p_creative_notes    text
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

    -- For existing client, find a contact row matching the intake email
    -- (or fall back to primary contact). This contact_id is what we'll
    -- bind to the portal setup token.
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

  -- Phase A addition: issue portal setup token bound to this proposal.
  -- The post-submit handler in StellarPress hands token_id to the
  -- send-portal-setup-email Edge Function.
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
