-- ============================================================
-- 186_fix_people_rls_recursion.sql
--
-- Fix: the RLS policies created in mig 179 reference `people` from
-- inside a subquery on `people` itself, which Postgres detects as
-- "infinite recursion detected in policy for relation people" the
-- moment any authenticated user calls SELECT on people.
--
-- Effect of the bug: every signed-in user's first authenticated
-- query against people errors silently in useAuth.fetchTeamMember,
-- teamMember stays null, the sidebar's user pill falls back to
-- "User", and the user appears logged out.
--
-- Fix pattern: move the role check into a SECURITY DEFINER helper
-- function. The function bypasses RLS while doing its own auth.uid()
-- lookup, so the outer policy's reference to "people" no longer
-- recurses back into itself. Standard Supabase recommendation for
-- self-referential policies.
-- ============================================================

BEGIN;

-- Drop the recursive policies created in mig 179.
DROP POLICY IF EXISTS people_authenticated_read ON people;
DROP POLICY IF EXISTS people_admin_write        ON people;

-- Helper: SECURITY DEFINER means RLS is not applied when the
-- function reads `people`, breaking the recursion. STABLE because
-- the result depends only on auth.uid() + the people row, not on
-- side effects.
CREATE OR REPLACE FUNCTION public.is_publisher_or_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM people
    WHERE auth_id = auth.uid()
      AND (
        global_role = 'super_admin'
        OR role IN ('Publisher'::team_role, 'Office Administrator'::team_role)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_publisher_or_admin() TO authenticated;

-- Read: any authenticated user can read active+visible people, plus
-- Publishers/Office Admins/super_admins can read everyone.
CREATE POLICY people_authenticated_read ON people
FOR SELECT
TO authenticated
USING (
  (status = 'active' AND is_hidden = false)
  OR public.is_publisher_or_admin()
);

-- Write: only Publishers / Office Admins / super_admins can mutate.
CREATE POLICY people_admin_write ON people
FOR ALL
TO authenticated
USING (public.is_publisher_or_admin())
WITH CHECK (public.is_publisher_or_admin());

COMMIT;
