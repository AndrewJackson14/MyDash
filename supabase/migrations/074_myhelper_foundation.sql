-- Migration 065: MyHelper bot foundation
--
-- Three pieces, all forward-only:
--   1. Add 'Bot' to the team_role enum so MyHelper can hold a role that
--      doesn't pollute real-person lists (Office Manager, etc.). Frontend
--      team-filtering code that iterates the enum auto-picks this up; code
--      that hard-codes specific roles is unaffected.
--   2. Add team_notes.context_page (text) so the MyHelper launcher can
--      carry the asker's current page route without fighting the uuid type
--      on context_id. This keeps context_id clean for its original
--      purpose (linking a note to a domain entity by id).
--   3. Create bot_query_log for every MyHelper exchange: question, answer,
--      confidence, whether escalated. Feeds week-1 analysis + eventual
--      admin UI.
--
-- Safe to apply before MyHelper rows exist or the Python bot is running.
-- No data migration needed.

ALTER TYPE team_role ADD VALUE IF NOT EXISTS 'Bot';

ALTER TABLE team_notes
  ADD COLUMN IF NOT EXISTS context_page text;

COMMENT ON COLUMN team_notes.context_page IS
  'Optional free-text page context (e.g. "sales/pipeline") for bot queries issued from the floating launcher. Null when the note was sent from the Messages page or has no specific page context.';

CREATE TABLE IF NOT EXISTS bot_query_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  asker_id uuid REFERENCES team_members(id) ON DELETE SET NULL,
  question text NOT NULL,
  answer text,
  confidence numeric(3,2),
  escalated boolean NOT NULL DEFAULT false,
  chunks_used text[],
  page_context text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_query_log_created
  ON bot_query_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bot_query_log_asker
  ON bot_query_log(asker_id, created_at DESC);

ALTER TABLE bot_query_log ENABLE ROW LEVEL SECURITY;

-- Service role (bot writes) bypasses RLS; admins need to be able to read.
CREATE POLICY "bot_query_log_admin_read"
  ON bot_query_log FOR SELECT
  TO authenticated
  USING (has_permission('admin'));

CREATE POLICY "bot_query_log_service_write"
  ON bot_query_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE bot_query_log IS
  'Every MyHelper interaction. Written by the Python bot via service role; read by admins for quality tuning and doc-gap analysis.';
