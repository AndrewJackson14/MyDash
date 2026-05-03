-- ============================================================
-- Migration 204 — resolve_advertiser_tier multi-match support
--
-- Triggered by: StellarPress identify-step UX change. Today the
-- RPC LIMIT 1's the contact lookup, so when an email is wired to
-- two or more clients (chains, agencies that book for multiple
-- brands, household-name owners with multiple LLCs) we silently
-- bind the wrong client. Reps caught this twice in April.
--
-- New shape:
--   { tier, client_id, business_name, requires_confirmation, matches[] }
--   tier = 'exact' | 'multi' | 'domain' | 'none'
--   matches[] = [{ client_id, business_name }] — populated when
--               tier='multi'; also populated (single entry) when
--               tier='exact' so the front end can render either
--               path through the same code.
--
-- Behavior changes vs. mig 175:
--   1. Exact match now returns the client's business_name (was NULL).
--   2. >1 client_contacts row sharing this email → tier='multi'
--      with matches[]. Front end shows a selector. client_id and
--      business_name on the top-level response are the FIRST match
--      so existing single-client callers don't crash, but they
--      should switch to reading matches[].
--   3. Domain tier unchanged.
--
-- Anon-callable. Same SECURITY DEFINER + SET search_path posture
-- as mig 175. Still never errors on unknown email — returns
-- tier='none' so the response can't be used to enumerate.
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
  v_matches JSONB;
  v_count   INT;
BEGIN
  IF v_email IS NULL OR v_email = '' OR position('@' IN v_email) = 0 OR p_site_id IS NULL THEN
    RETURN jsonb_build_object(
      'tier', 'none', 'client_id', NULL, 'business_name', NULL,
      'requires_confirmation', false, 'matches', '[]'::jsonb
    );
  END IF;

  -- Tier 1: collect ALL exact contact-email matches. Distinct on
  -- client_id so a contact wired to the same client twice doesn't
  -- inflate the count. Order by clients.name for a stable selector.
  SELECT
    coalesce(jsonb_agg(jsonb_build_object('client_id', c.id, 'business_name', c.name)
                         ORDER BY c.name), '[]'::jsonb),
    count(*)
  INTO v_matches, v_count
  FROM (
    SELECT DISTINCT cc.client_id
    FROM client_contacts cc
    WHERE lower(cc.email) = v_email
  ) m
  JOIN clients c ON c.id = m.client_id;

  IF v_count = 1 THEN
    SELECT (v_matches->0->>'client_id')::uuid, (v_matches->0->>'business_name')
      INTO v_client, v_name;
    RETURN jsonb_build_object(
      'tier', 'exact', 'client_id', v_client, 'business_name', v_name,
      'requires_confirmation', false, 'matches', v_matches
    );
  ELSIF v_count > 1 THEN
    -- Top-level client_id/business_name reflect the first entry so
    -- legacy single-client callers don't crash. Front end on the
    -- multi-tier path should render the selector and overwrite
    -- these once the user picks one.
    SELECT (v_matches->0->>'client_id')::uuid, (v_matches->0->>'business_name')
      INTO v_client, v_name;
    RETURN jsonb_build_object(
      'tier', 'multi', 'client_id', v_client, 'business_name', v_name,
      'requires_confirmation', false, 'matches', v_matches
    );
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
      RETURN jsonb_build_object(
        'tier', 'domain', 'client_id', v_client, 'business_name', v_name,
        'requires_confirmation', true, 'matches', '[]'::jsonb
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'tier', 'none', 'client_id', NULL, 'business_name', NULL,
    'requires_confirmation', false, 'matches', '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_advertiser_tier(TEXT, TEXT)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
