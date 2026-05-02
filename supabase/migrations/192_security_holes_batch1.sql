-- =====================================================================
-- 192_security_holes_batch1.sql
-- Foundational security hardening — Batch 1.
--
-- 1. Enable RLS on tables that were exposed unprotected:
--      - story_authors           (read for any authed user; write gated by
--                                 has_permission('admin'|'editorial'|'stories'))
--      - driver_sessions         (no policies = service-role only)
--
-- 2. Replace anon DIRECT TABLE ACCESS on proposal_signatures with three
--    SECURITY DEFINER RPCs so the public proposal-signing flow no longer
--    depends on broad anon SELECT/UPDATE policies on a sensitive table:
--      - get_proposal_signature_by_token(p_token uuid)
--      - record_proposal_signature_view(p_token uuid)
--      - submit_proposal_signature(p_token, p_signer_name, p_signer_title)
--
--    The submit RPC also folds in the proposals.signed_at stamp the
--    client used to write directly. Anon never had a write policy on
--    proposals, so that update was failing silently before — fixing it
--    inside SECURITY DEFINER closes that gap too.
--
--    Drops the old "Public can view by token" / "Public can update
--    signature" anon policies that allowed anyone walking the table by
--    token to read or mutate signatures.
-- =====================================================================

-- ----- 1. story_authors RLS ------------------------------------------
ALTER TABLE public.story_authors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS story_authors_read ON public.story_authors;
CREATE POLICY story_authors_read ON public.story_authors
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS story_authors_write ON public.story_authors;
CREATE POLICY story_authors_write ON public.story_authors
  FOR ALL TO authenticated
  USING (
    has_permission('admin') OR has_permission('editorial') OR has_permission('stories')
  )
  WITH CHECK (
    has_permission('admin') OR has_permission('editorial') OR has_permission('stories')
  );

-- ----- 2. driver_sessions RLS ----------------------------------------
-- No policies = service role only. Holds delivery driver OAuth state;
-- never legitimately accessed from anon or authenticated clients.
ALTER TABLE public.driver_sessions ENABLE ROW LEVEL SECURITY;

-- ----- 3. proposal_signatures: drop anon policies -------------------
DROP POLICY IF EXISTS "Public can view by token" ON public.proposal_signatures;
DROP POLICY IF EXISTS "Public can update signature" ON public.proposal_signatures;

-- ----- 4. RPC: fetch signature by token ------------------------------
-- Returns the signature row as jsonb minus access_token (which IS the
-- auth token; caller already has it in the URL). Used by ProposalSign
-- when a recipient first lands on /sign/:token.
CREATE OR REPLACE FUNCTION public.get_proposal_signature_by_token(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row proposal_signatures;
BEGIN
  IF p_token IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_row FROM proposal_signatures WHERE access_token = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id',                v_row.id,
    'proposal_id',       v_row.proposal_id,
    'signer_name',       v_row.signer_name,
    'signer_title',      v_row.signer_title,
    'signer_email',      v_row.signer_email,
    'signed',            v_row.signed,
    'signed_at',         v_row.signed_at,
    'expires_at',        v_row.expires_at,
    'viewed_at',         v_row.viewed_at,
    'view_count',        v_row.view_count,
    'proposal_snapshot', v_row.proposal_snapshot,
    'created_at',        v_row.created_at
  );
END $$;

REVOKE ALL ON FUNCTION public.get_proposal_signature_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_proposal_signature_by_token(uuid) TO anon, authenticated;

-- ----- 5. RPC: record a view ----------------------------------------
CREATE OR REPLACE FUNCTION public.record_proposal_signature_view(p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL THEN RETURN; END IF;
  UPDATE proposal_signatures
     SET viewed_at  = COALESCE(viewed_at, now()),
         view_count = COALESCE(view_count, 0) + 1
   WHERE access_token = p_token AND signed = false;
END $$;

REVOKE ALL ON FUNCTION public.record_proposal_signature_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_proposal_signature_view(uuid) TO anon, authenticated;

-- ----- 6. RPC: submit signature -------------------------------------
-- Atomically marks the signature signed and stamps proposals.signed_at.
-- Returns { id, proposal_id } as jsonb. Raises typed exceptions:
--   token_required, signer_name_required,
--   signature_not_found, already_signed, expired
CREATE OR REPLACE FUNCTION public.submit_proposal_signature(
  p_token        uuid,
  p_signer_name  text,
  p_signer_title text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id          uuid;
  v_proposal_id uuid;
  v_signed      boolean;
  v_expired     boolean;
BEGIN
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'token_required' USING ERRCODE='P0001';
  END IF;
  IF p_signer_name IS NULL OR length(trim(p_signer_name)) = 0 THEN
    RAISE EXCEPTION 'signer_name_required' USING ERRCODE='P0001';
  END IF;

  SELECT id, proposal_id, signed,
         (expires_at IS NOT NULL AND expires_at < now())
    INTO v_id, v_proposal_id, v_signed, v_expired
    FROM proposal_signatures
   WHERE access_token = p_token;

  IF v_id IS NULL THEN RAISE EXCEPTION 'signature_not_found' USING ERRCODE='P0001'; END IF;
  IF v_signed     THEN RAISE EXCEPTION 'already_signed'      USING ERRCODE='P0001'; END IF;
  IF v_expired    THEN RAISE EXCEPTION 'expired'             USING ERRCODE='P0001'; END IF;

  UPDATE proposal_signatures SET
    signed            = true,
    signed_at         = now(),
    signer_name       = trim(p_signer_name),
    signer_title      = NULLIF(trim(p_signer_title), ''),
    signed_user_agent = COALESCE(
      current_setting('request.headers', true)::jsonb->>'user-agent',
      ''
    )
  WHERE id = v_id;

  -- Folds the proposals.signed_at stamp the client used to write
  -- directly. Anon had no write policy on proposals, so this update
  -- was previously failing silently. Doing it inside SECURITY DEFINER
  -- fixes that too.
  UPDATE proposals SET signed_at = now() WHERE id = v_proposal_id;

  RETURN jsonb_build_object('id', v_id, 'proposal_id', v_proposal_id);
END $$;

REVOKE ALL ON FUNCTION public.submit_proposal_signature(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_proposal_signature(uuid, text, text) TO anon, authenticated;
