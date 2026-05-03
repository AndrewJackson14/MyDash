-- 202_tighten_always_true_authenticated_policies.sql
--
-- Replaces blanket USING(true) on 19 staff-only write policies with a
-- staff-membership check. Pre-portal these were "any authenticated
-- user" because authenticated meant staff. Portal launch broke that
-- assumption — customers now authenticate too. Without this fix any
-- portal customer can POST to calendar_events / team_notes /
-- social_posts / etc.
--
-- Helper: current_user_is_team_member() — true if auth.uid() maps to
-- ANY active people row, regardless of role. Broader than mig 196's
-- current_user_is_staff (which is gated to 4 support-view roles).
--
-- Skipped (intentional public-ingest, not in this migration):
--   - merch_orders / merch_order_items insert (customer cart)
--   - ad_proofs/ad_proofs_public_update (tokenized customer proof
--     approval — needs SECURITY DEFINER RPC refactor like
--     proposal_signatures, separately)

CREATE OR REPLACE FUNCTION public.current_user_is_team_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM people
    WHERE auth_id = (SELECT auth.uid())
      AND status = 'active'
  );
$$;

REVOKE ALL    ON FUNCTION public.current_user_is_team_member() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_is_team_member() FROM anon;
GRANT  EXECUTE ON FUNCTION public.current_user_is_team_member() TO authenticated;

COMMENT ON FUNCTION public.current_user_is_team_member IS
  'True when auth.uid() maps to an active people row. Used to gate staff-only RLS policies that previously used USING(true).';

-- ====================================================================
-- Tightened policies — same shape, USING/WITH CHECK swapped to require
-- staff membership.
-- ====================================================================

DROP POLICY IF EXISTS activity_write ON public.activity_log;
CREATE POLICY activity_write ON public.activity_log
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (current_user_is_team_member());

DROP POLICY IF EXISTS events_authenticated_insert ON public.calendar_events;
CREATE POLICY events_authenticated_insert ON public.calendar_events
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (current_user_is_team_member());

DROP POLICY IF EXISTS events_authenticated_update ON public.calendar_events;
CREATE POLICY events_authenticated_update ON public.calendar_events
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (current_user_is_team_member())
  WITH CHECK (current_user_is_team_member());

DROP POLICY IF EXISTS events_authenticated_delete ON public.calendar_events;
CREATE POLICY events_authenticated_delete ON public.calendar_events
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (current_user_is_team_member());

DROP POLICY IF EXISTS comms_write ON public.communications;
CREATE POLICY comms_write ON public.communications
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (current_user_is_team_member());

DROP POLICY IF EXISTS "Authenticated users can modify" ON public.daily_page_views;
CREATE POLICY "Authenticated users can modify" ON public.daily_page_views
  AS PERMISSIVE FOR ALL TO authenticated
  USING (current_user_is_team_member())
  WITH CHECK (current_user_is_team_member());

DROP POLICY IF EXISTS email_log_authenticated_write ON public.email_log;
CREATE POLICY email_log_authenticated_write ON public.email_log
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (current_user_is_team_member());

DROP POLICY IF EXISTS gmail_links_authenticated ON public.gmail_message_links;
CREATE POLICY gmail_links_authenticated ON public.gmail_message_links
  AS PERMISSIVE FOR ALL TO authenticated
  USING (current_user_is_team_member())
  WITH CHECK (current_user_is_team_member());

DROP POLICY IF EXISTS threads_authenticated_all ON public.message_threads;
CREATE POLICY threads_authenticated_all ON public.message_threads
  AS PERMISSIVE FOR ALL TO authenticated
  USING (current_user_is_team_member())
  WITH CHECK (current_user_is_team_member());

DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert ON public.messages
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (current_user_is_team_member());

DROP POLICY IF EXISTS notifs_write ON public.notifications;
CREATE POLICY notifs_write ON public.notifications
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (current_user_is_team_member());

DROP POLICY IF EXISTS "Authenticated users can modify" ON public.outreach_campaigns;
CREATE POLICY "Authenticated users can modify" ON public.outreach_campaigns
  AS PERMISSIVE FOR ALL TO authenticated
  USING (current_user_is_team_member())
  WITH CHECK (current_user_is_team_member());

DROP POLICY IF EXISTS "Authenticated users can modify" ON public.outreach_entries;
CREATE POLICY "Authenticated users can modify" ON public.outreach_entries
  AS PERMISSIVE FOR ALL TO authenticated
  USING (current_user_is_team_member())
  WITH CHECK (current_user_is_team_member());

DROP POLICY IF EXISTS "Authenticated users can modify" ON public.printer_contacts;
CREATE POLICY "Authenticated users can modify" ON public.printer_contacts
  AS PERMISSIVE FOR ALL TO authenticated
  USING (current_user_is_team_member())
  WITH CHECK (current_user_is_team_member());

DROP POLICY IF EXISTS site_errors_write ON public.site_errors;
CREATE POLICY site_errors_write ON public.site_errors
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (current_user_is_team_member());

DROP POLICY IF EXISTS social_posts_authenticated_write ON public.social_posts;
CREATE POLICY social_posts_authenticated_write ON public.social_posts
  AS PERMISSIVE FOR ALL TO authenticated
  USING (current_user_is_team_member())
  WITH CHECK (current_user_is_team_member());

DROP POLICY IF EXISTS team_notes_authenticated_insert ON public.team_notes;
CREATE POLICY team_notes_authenticated_insert ON public.team_notes
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (current_user_is_team_member());

DROP POLICY IF EXISTS team_notes_authenticated_update ON public.team_notes;
CREATE POLICY team_notes_authenticated_update ON public.team_notes
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (current_user_is_team_member())
  WITH CHECK (current_user_is_team_member());

DROP POLICY IF EXISTS team_notes_authenticated_delete ON public.team_notes;
CREATE POLICY team_notes_authenticated_delete ON public.team_notes
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (current_user_is_team_member());

DROP POLICY IF EXISTS ticket_comments_write ON public.ticket_comments;
CREATE POLICY ticket_comments_write ON public.ticket_comments
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (current_user_is_team_member());
