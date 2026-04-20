-- ============================================================
-- Commission RLS tightening
--
-- Per audit finding S-1: commission_* tables had blanket
-- USING (true) WITH CHECK (true) policies from migration 015, so
-- any authenticated user could read every salesperson's earnings
-- and rates, and could write arbitrary ledger rows. Tighten to:
--
--   commission_ledger · commission_payouts · commission_rates
--     SELECT → the row's salesperson_id matches the caller, OR
--              caller is an admin.
--     INSERT / UPDATE / DELETE → admin only.
--
--   commission_issue_goals (per-issue revenue targets)
--     SELECT → authenticated (not sensitive; used across planning UI)
--     INSERT / UPDATE / DELETE → admin only.
--
--   salesperson_pub_assignments (who sells which pub)
--     SELECT → authenticated (used in every client/pub picker)
--     INSERT / UPDATE / DELETE → admin only.
--
-- Admin check: a team_member row whose auth_id matches the caller
-- and whose permissions array contains 'admin'. Matches the existing
-- pattern in src/App.jsx:73.
-- ============================================================

-- Helper: boolean "is_admin" derived from auth.uid() → team_members.
-- SECURITY DEFINER so it can read team_members without colliding with
-- team_members' own RLS. Stable so the planner can cache per query.
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE auth_id = auth.uid()
      AND 'admin' = ANY(permissions)
  );
$$;

-- Helper: returns the team_member.id for the authed user (null if none).
CREATE OR REPLACE FUNCTION public.my_team_member_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM team_members WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- ── commission_ledger ──
DROP POLICY IF EXISTS "Authenticated users can read all" ON commission_ledger;
DROP POLICY IF EXISTS "Authenticated users can modify"  ON commission_ledger;

CREATE POLICY "Own ledger rows or admin" ON commission_ledger
  FOR SELECT TO authenticated
  USING (salesperson_id = public.my_team_member_id() OR public.is_admin());

CREATE POLICY "Admin writes ledger" ON commission_ledger
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── commission_payouts ──
DROP POLICY IF EXISTS "Authenticated users can read all" ON commission_payouts;
DROP POLICY IF EXISTS "Authenticated users can modify"  ON commission_payouts;

CREATE POLICY "Own payouts or admin" ON commission_payouts
  FOR SELECT TO authenticated
  USING (salesperson_id = public.my_team_member_id() OR public.is_admin());

CREATE POLICY "Admin writes payouts" ON commission_payouts
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── commission_rates ──
-- Rates apply per salesperson × publication. A rep should see the rates
-- that apply to them; admins see everything.
DROP POLICY IF EXISTS "Authenticated users can read all" ON commission_rates;
DROP POLICY IF EXISTS "Authenticated users can modify"  ON commission_rates;

CREATE POLICY "Own rates or admin" ON commission_rates
  FOR SELECT TO authenticated
  USING (salesperson_id = public.my_team_member_id() OR public.is_admin());

CREATE POLICY "Admin writes rates" ON commission_rates
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── commission_issue_goals ──
-- Per-issue revenue targets are not per-rep sensitive; keep them
-- readable by any authed user (used across planning UI) but lock writes
-- to admin.
DROP POLICY IF EXISTS "Authenticated users can read all" ON commission_issue_goals;
DROP POLICY IF EXISTS "Authenticated users can modify"  ON commission_issue_goals;

CREATE POLICY "All can read issue goals" ON commission_issue_goals
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin writes issue goals" ON commission_issue_goals
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── salesperson_pub_assignments ──
-- Who sells which publication is surfaced in client pickers for every
-- authed user. Read = authenticated, writes = admin.
DROP POLICY IF EXISTS "Authenticated users can read all" ON salesperson_pub_assignments;
DROP POLICY IF EXISTS "Authenticated users can modify"  ON salesperson_pub_assignments;

CREATE POLICY "All can read pub assignments" ON salesperson_pub_assignments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin writes pub assignments" ON salesperson_pub_assignments
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
