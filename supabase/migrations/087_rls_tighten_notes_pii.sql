-- ============================================================
-- RLS tightening — team_notes + newsletter/site_errors PII
--
-- Audit findings S-2 and S-4. The previous USING(true) policies let
-- any authenticated user read every other user's DMs, task comments,
-- bot queries, and newsletter-subscriber PII. Tighten to:
--
-- team_notes
--   SELECT: you are the sender, the recipient, or admin
--   INSERT: from_user = your team_members.id (can only send as you)
--           OR admin (MyHelper uses the service role → bypasses RLS)
--   UPDATE: sender OR recipient OR admin (recipients need to mark read)
--   DELETE: sender OR admin
--
-- newsletter_subscribers (PII — emails + addresses)
--   admin-only read + write
--
-- site_errors (operational telemetry, sometimes user-pasted payloads)
--   admin-only read + write
--
-- daily_page_views stays open (authenticated read, anon insert) —
-- non-sensitive aggregate traffic counts.
-- distribution_points stays open (delivery drop addresses, not PII)
-- and will be revisited if driver routes are added later.
--
-- Note: team_notes.from_user / to_user hold team_members.id, not
-- auth.uid(). Use public.my_team_member_id() helper (added in 085).
-- ============================================================

-- ── team_notes ──
DROP POLICY IF EXISTS "Authenticated users can read all" ON team_notes;
DROP POLICY IF EXISTS "Authenticated users can modify"  ON team_notes;

CREATE POLICY "Notes for sender or recipient" ON team_notes
  FOR SELECT TO authenticated
  USING (
    from_user = public.my_team_member_id()
    OR to_user = public.my_team_member_id()
    OR public.is_admin()
  );

-- INSERT: sender must be the authed user so nobody can send AS
-- someone else. Service role (MyHelper bot) bypasses RLS entirely.
CREATE POLICY "Send as self" ON team_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    from_user = public.my_team_member_id()
    OR public.is_admin()
  );

-- UPDATE: either participant can mutate (recipient needs to flip
-- is_read / read_at). Admins too.
CREATE POLICY "Mutate own notes" ON team_notes
  FOR UPDATE TO authenticated
  USING (
    from_user = public.my_team_member_id()
    OR to_user = public.my_team_member_id()
    OR public.is_admin()
  )
  WITH CHECK (
    from_user = public.my_team_member_id()
    OR to_user = public.my_team_member_id()
    OR public.is_admin()
  );

CREATE POLICY "Delete own sent notes" ON team_notes
  FOR DELETE TO authenticated
  USING (
    from_user = public.my_team_member_id()
    OR public.is_admin()
  );

-- ── newsletter_subscribers ──
DROP POLICY IF EXISTS "Authenticated users can read all" ON newsletter_subscribers;
DROP POLICY IF EXISTS "Authenticated users can modify"  ON newsletter_subscribers;

CREATE POLICY "Admin reads subscribers" ON newsletter_subscribers
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Admin writes subscribers" ON newsletter_subscribers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── site_errors ──
DROP POLICY IF EXISTS "Authenticated users can read all" ON site_errors;
DROP POLICY IF EXISTS "Authenticated users can modify"  ON site_errors;

CREATE POLICY "Admin reads site errors" ON site_errors
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Admin writes site errors" ON site_errors
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
