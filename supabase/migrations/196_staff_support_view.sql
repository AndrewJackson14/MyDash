-- 196_staff_support_view.sql
-- Phase F: portal staff support view (?staff_view=1).
--
-- Helper that returns true when the calling auth user maps to a
-- people row with a permitted staff role. Used by the portal UI to
-- decide whether to render the read-only support banner.
--
-- Reads on portal-touched tables (clients, proposals, invoices, etc.)
-- already work for staff sessions via the existing has_permission()
-- policies — no additive RLS needed.
--
-- Writes auto-block: invite_client_contact / revoke_client_contact /
-- update_notification_preferences all gate on user_can_access_client(),
-- which checks for a non-revoked client_contacts row keyed to auth.uid().
-- Staff users have no such row, so the existing guards already reject
-- write attempts. UI also disables the buttons for clarity.
CREATE OR REPLACE FUNCTION public.current_user_is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM people
    WHERE auth_id = auth.uid()
      AND role IN ('Publisher', 'Salesperson', 'Office Administrator', 'Support Admin')
  );
$$;

REVOKE ALL    ON FUNCTION public.current_user_is_staff() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_is_staff() FROM anon;
GRANT  EXECUTE ON FUNCTION public.current_user_is_staff() TO authenticated;

COMMENT ON FUNCTION public.current_user_is_staff IS
  'Returns true if the calling auth user maps to a people row with a staff role permitted to use portal.13stars.media in support-view mode.';
