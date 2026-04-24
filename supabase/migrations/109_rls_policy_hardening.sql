-- ============================================================
-- 109 — Tighten the loosest of the always-true RLS policies
-- flagged by the Supabase advisor. Focused on:
--   1. genuinely dangerous (anon ALL access, gmail OAuth tokens
--      readable by any authenticated user)
--   2. user-private data leaking across users (notifications,
--      my_priorities, DM team_notes)
--   3. admin / sales / editorial back-office tables that don't
--      need to be writable by every team member
--
-- Intentionally left alone (still always-true, but appropriate):
--   - newsletter_signups, ad_inquiries, page_views,
--     daily_page_views, merch_orders+items, subscribers anon insert
--     paths — these are public form/event ingest by design.
--   - notifications_write INSERT, story_activity insert,
--     activity_log_write INSERT, email_log_write INSERT,
--     comms_write INSERT, ticket_comments_write INSERT,
--     site_errors_write INSERT — auditable system-fire writes.
-- ============================================================

-- ─── 1. CRITICAL — anon access + sensitive tokens ──────────

DROP POLICY IF EXISTS gmail_tokens_all ON public.gmail_tokens;
CREATE POLICY gmail_tokens_service_only ON public.gmail_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS team_notes_anon_all ON public.team_notes;
DROP POLICY IF EXISTS team_notes_select ON public.team_notes;
CREATE POLICY team_notes_select ON public.team_notes
  FOR SELECT TO authenticated
  USING (
    from_user = my_team_member_id()
    OR to_user = my_team_member_id()
    OR has_permission('admin')
  );

-- ─── 2. PRIVATE — user-scoped per-row ─────────────────────

DROP POLICY IF EXISTS notifs_select ON public.notifications;
CREATE POLICY notifs_select ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = my_team_member_id() OR has_permission('admin'));

DROP POLICY IF EXISTS notifs_update ON public.notifications;
CREATE POLICY notifs_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = my_team_member_id() OR has_permission('admin'));

DROP POLICY IF EXISTS notifs_delete ON public.notifications;
CREATE POLICY notifs_delete ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = my_team_member_id() OR has_permission('admin'));

DROP POLICY IF EXISTS "Authenticated users can delete priorities" ON public.my_priorities;
DROP POLICY IF EXISTS "Authenticated users can insert priorities" ON public.my_priorities;
DROP POLICY IF EXISTS "Authenticated users can update priorities" ON public.my_priorities;
CREATE POLICY my_priorities_select ON public.my_priorities
  FOR SELECT TO authenticated
  USING (team_member_id = my_team_member_id() OR has_permission('admin'));
CREATE POLICY my_priorities_insert ON public.my_priorities
  FOR INSERT TO authenticated
  WITH CHECK (team_member_id = my_team_member_id() OR has_permission('admin'));
CREATE POLICY my_priorities_update ON public.my_priorities
  FOR UPDATE TO authenticated
  USING (team_member_id = my_team_member_id() OR has_permission('admin'));
CREATE POLICY my_priorities_delete ON public.my_priorities
  FOR DELETE TO authenticated
  USING (team_member_id = my_team_member_id() OR has_permission('admin'));

DROP POLICY IF EXISTS org_settings_write ON public.org_settings;
CREATE POLICY org_settings_admin_write ON public.org_settings
  FOR UPDATE TO authenticated
  USING (has_permission('admin'))
  WITH CHECK (has_permission('admin'));
