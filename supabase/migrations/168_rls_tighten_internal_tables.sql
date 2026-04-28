-- ============================================================
-- Migration 168: Tighten 3 internal-only tables from {public} to
-- {authenticated} — Day-4 audit follow-up.
--
-- These tables had `for ... using (true)` policies with no role
-- restriction (defaulting to {public}, which includes anon). Inventory
-- before this migration confirmed:
--   • App-side anon pages (ProposalSign, ClientUpload, TearsheetPortal,
--     CampaignPublic, ClientPortfolioPortal) do not touch any of these.
--   • Edge functions writing to these tables all use the service_role
--     client (`admin.from(...)`), bypassing RLS entirely.
--   • No external (WordPress) consumer references found in repo.
--
-- The fourth high-priority table — `notifications` — is intentionally
-- NOT tightened here. ProposalSign.jsx still writes a 'client signed'
-- notification as anon; that flow needs to move behind a SECURITY
-- DEFINER RPC before notifications.INSERT can be locked down.
-- ============================================================

-- ── message_threads: was ALL to {public} with using=true/check=true ──
DROP POLICY IF EXISTS "threads_all" ON message_threads;
CREATE POLICY "threads_authenticated_all" ON message_threads
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── email_log: was SELECT + INSERT to {public} ──
DROP POLICY IF EXISTS "email_log_read" ON email_log;
DROP POLICY IF EXISTS "email_log_write" ON email_log;
CREATE POLICY "email_log_authenticated_read" ON email_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "email_log_authenticated_write" ON email_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- ── calendar_events: was full CRUD to {public} ──
DROP POLICY IF EXISTS "events_read" ON calendar_events;
DROP POLICY IF EXISTS "events_write_ins" ON calendar_events;
DROP POLICY IF EXISTS "events_write_upd" ON calendar_events;
DROP POLICY IF EXISTS "events_write_del" ON calendar_events;
CREATE POLICY "events_authenticated_read"   ON calendar_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "events_authenticated_insert" ON calendar_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "events_authenticated_update" ON calendar_events FOR UPDATE TO authenticated USING (true);
CREATE POLICY "events_authenticated_delete" ON calendar_events FOR DELETE TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';

-- ─── Rollback (manual; do NOT include in normal migration runs) ───
--   DROP POLICY IF EXISTS threads_authenticated_all ON message_threads;
--   CREATE POLICY threads_all ON message_threads FOR ALL TO public USING (true) WITH CHECK (true);
--
--   DROP POLICY IF EXISTS email_log_authenticated_read ON email_log;
--   DROP POLICY IF EXISTS email_log_authenticated_write ON email_log;
--   CREATE POLICY email_log_read ON email_log FOR SELECT TO public USING (true);
--   CREATE POLICY email_log_write ON email_log FOR INSERT TO public WITH CHECK (true);
--
--   DROP POLICY IF EXISTS events_authenticated_read   ON calendar_events;
--   DROP POLICY IF EXISTS events_authenticated_insert ON calendar_events;
--   DROP POLICY IF EXISTS events_authenticated_update ON calendar_events;
--   DROP POLICY IF EXISTS events_authenticated_delete ON calendar_events;
--   CREATE POLICY events_read       ON calendar_events FOR SELECT TO public USING (true);
--   CREATE POLICY events_write_ins  ON calendar_events FOR INSERT TO public WITH CHECK (true);
--   CREATE POLICY events_write_upd  ON calendar_events FOR UPDATE TO public USING (true);
--   CREATE POLICY events_write_del  ON calendar_events FOR DELETE TO public USING (true);
