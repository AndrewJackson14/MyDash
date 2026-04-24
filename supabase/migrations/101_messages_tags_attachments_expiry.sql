-- ============================================================
-- Migration 101 — Editorial→Production workflow spec Phase 1b
--
-- Extends the existing message_threads/messages infrastructure instead
-- of forking a new `discussions` schema. Additions:
--   messages.tagged_user_ids uuid[]    — denormalized mentions for fast fan-out
--   message_attachments table          — image/pdf/file attachments on messages
--   message_threads.expires_at         — per-thread 45-day purge anchor
--   set_thread_expiry trigger on issues.sent_to_press_at
-- ============================================================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS tagged_user_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_messages_tagged_gin
  ON messages USING GIN (tagged_user_ids);

CREATE TABLE IF NOT EXISTS message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('image','pdf','file')),
  bunny_path text NOT NULL,
  cdn_url text NOT NULL,
  filename text NOT NULL,
  byte_size integer NOT NULL,
  width integer,
  height integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_attachments_thread ON message_attachments(thread_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_message ON message_attachments(message_id);

ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attachments_select ON message_attachments;
CREATE POLICY attachments_select ON message_attachments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM team_members WHERE auth_id = auth.uid() AND is_active));

DROP POLICY IF EXISTS attachments_insert ON message_attachments;
CREATE POLICY attachments_insert ON message_attachments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM team_members WHERE auth_id = auth.uid() AND is_active));

DROP POLICY IF EXISTS attachments_delete ON message_attachments;
CREATE POLICY attachments_delete ON message_attachments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN team_members tm ON tm.auth_id = auth.uid()
      WHERE m.id = message_attachments.message_id
        AND (m.sender_id = tm.id OR has_permission('admin'))
    )
  );

ALTER TABLE message_threads
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_message_threads_expires
  ON message_threads(expires_at) WHERE expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION set_thread_expiry_on_press()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sent_to_press_at IS NOT NULL AND (OLD.sent_to_press_at IS NULL OR OLD.sent_to_press_at IS DISTINCT FROM NEW.sent_to_press_at) THEN
    UPDATE message_threads
       SET expires_at = NEW.sent_to_press_at + INTERVAL '45 days'
     WHERE ref_type = 'issue' AND ref_id = NEW.id;

    UPDATE message_threads mt
       SET expires_at = NEW.sent_to_press_at + INTERVAL '45 days'
      FROM stories s
     WHERE mt.ref_type = 'story'
       AND mt.ref_id = s.id
       AND s.print_issue_id = NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_thread_expiry_on_press ON issues;
CREATE TRIGGER trg_set_thread_expiry_on_press
  AFTER UPDATE OF sent_to_press_at ON issues
  FOR EACH ROW
  EXECUTE FUNCTION set_thread_expiry_on_press();
