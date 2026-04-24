-- ============================================================
-- 105 — messages: edit / delete / pin support + tighter RLS.
--
-- Columns:
--   edited_at  — set client-side on body update so the UI can mark
--                a bubble "edited".
--   is_pinned  — boolean flag, false by default.
--   pinned_at  — sort order for the pinned section (latest pin top).
--   pinned_by  — team_members.id who pinned (informational only).
--
-- RLS: replace the old wide-open messages_all with split policies so
-- only the sender (or an admin) can update/delete a message. SELECT +
-- INSERT stay open to authenticated team members.
-- ============================================================
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by uuid;

CREATE INDEX IF NOT EXISTS idx_messages_pinned_thread
  ON messages(thread_id, pinned_at DESC)
  WHERE is_pinned = true;

DROP POLICY IF EXISTS messages_all ON messages;
DROP POLICY IF EXISTS messages_select ON messages;
DROP POLICY IF EXISTS messages_insert ON messages;
DROP POLICY IF EXISTS messages_update ON messages;
DROP POLICY IF EXISTS messages_delete ON messages;

CREATE POLICY messages_select ON messages
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY messages_insert ON messages
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY messages_update ON messages
  FOR UPDATE TO authenticated
  USING (
    sender_id IN (SELECT id FROM team_members WHERE auth_id = auth.uid())
    OR has_permission('admin')
  );

CREATE POLICY messages_delete ON messages
  FOR DELETE TO authenticated
  USING (
    sender_id IN (SELECT id FROM team_members WHERE auth_id = auth.uid())
    OR has_permission('admin')
  );
