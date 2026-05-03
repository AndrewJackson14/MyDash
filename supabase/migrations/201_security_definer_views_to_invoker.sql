-- 201_security_definer_views_to_invoker.sql
-- Batch 4: rebuild the four ERROR-level SECURITY DEFINER views as
-- SECURITY INVOKER so each query runs with the calling user's
-- privileges instead of the view-owner's.
--
-- Three of four are pure aggregation views over tables that already
-- have working has_permission() RLS policies — flipping invoker mode
-- changes nothing visible.
--
-- social_accounts_safe is more delicate: its DEFINER mode bypassed
-- RLS to expose only safe columns to authenticated users. Under
-- INVOKER we preserve the same security model with two complementary
-- pieces:
--   1. Add a permissive SELECT policy on social_accounts so the
--      authenticated user's row read clears RLS at the row level.
--   2. REVOKE table-wide SELECT on social_accounts from authenticated
--      and re-GRANT only the safe columns. The token columns
--      (access_token, refresh_token, token_expiry, scopes) stay
--      ungranted, so direct `SELECT *` against the table fails for
--      authenticated users — only the view (which enumerates safe
--      columns) succeeds. Edge Functions use the service role and
--      are unaffected.

-- 1-3: publisher_* aggregation views
ALTER VIEW public.publisher_alerts                  SET (security_invoker = true);
ALTER VIEW public.publisher_issue_pacing_view       SET (security_invoker = true);
ALTER VIEW public.publisher_month_at_a_glance_view  SET (security_invoker = true);

-- 4: social_accounts_safe — pair INVOKER with column-level access control
ALTER VIEW public.social_accounts_safe SET (security_invoker = true);

DROP POLICY IF EXISTS social_accounts_authed_read ON public.social_accounts;
CREATE POLICY social_accounts_authed_read ON public.social_accounts
  FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.social_accounts FROM authenticated;
GRANT  SELECT (
  id, pub_id, provider, account_label, external_id,
  instagram_account_id, instagram_account_label,
  linkedin_can_post_as_page,
  status, connected_by, created_at, updated_at
) ON public.social_accounts TO authenticated;

-- Tail-fix from mig 198: clients_auto_slug_tg was missing an explicit
-- search_path, surfaced by the function_search_path_mutable advisor.
CREATE OR REPLACE FUNCTION public.clients_auto_slug_tg()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.generate_client_slug(NEW.name);
  END IF;
  RETURN NEW;
END;
$$;
