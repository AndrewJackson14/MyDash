-- ============================================================
-- 187_stories_generated_from.sql
--
-- Phase A of editorial-generate-v2-spec.md. Adds source-story
-- tracking on stories created via the editorial_generate "New Draft"
-- mode (Phase B/C of that spec).
--
-- Spec called this migration 181, but 181 was already taken by
-- 181_self_serve_signing_url. Numbered 187 to slot after the most
-- recent migration (186_fix_people_rls_recursion). Same content,
-- same intent.
--
-- ON DELETE SET NULL: if the source story is deleted later, the
-- generated story keeps existing — the lineage just becomes NULL.
-- The activity_log_v2 audit row retains the source ID even after
-- the FK is nulled, so the regen history is recoverable.
-- ============================================================

BEGIN;

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS generated_from_id UUID REFERENCES stories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stories_generated_from
  ON stories(generated_from_id) WHERE generated_from_id IS NOT NULL;

COMMENT ON COLUMN stories.generated_from_id IS
  'When a story was created via editorial_generate New Draft mode, this references the source story used as the regeneration template. NULL for stories not generated from a source.';

NOTIFY pgrst, 'reload schema';

COMMIT;
