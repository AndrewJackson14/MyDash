-- ============================================================
-- Migration 100 — Editorial→Production workflow spec Phase 1a
--
-- Adds three Issue-Planning signals to `stories`:
--   has_images       — manual publisher signal (NOT a mirror of attachment status)
--   jump_to_page     — if the story jumps, the destination page #
--   jump_from_page   — denormalized mirror of page (origin) for flat jump-line queries
--
-- Also a BEFORE-UPDATE trigger that keeps jump_from_page in sync with
-- the origin page so destination-page joins stay flat.
-- ============================================================

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS has_images boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS jump_to_page integer,
  ADD COLUMN IF NOT EXISTS jump_from_page integer;

COMMENT ON COLUMN stories.has_images IS
  'Manual publisher/editor signal that the story should run with images. Independent of attachment status — a planning flag, not a production state.';
COMMENT ON COLUMN stories.jump_to_page IS
  'Destination page when the story jumps. NULL = story fits on its primary page.';
COMMENT ON COLUMN stories.jump_from_page IS
  'Denormalized mirror of page (origin) kept in sync by trigger so jump-line queries don''t need a self-join.';

CREATE INDEX IF NOT EXISTS idx_stories_jump_to_page
  ON stories(print_issue_id, jump_to_page)
  WHERE jump_to_page IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_story_jump_from_page()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.page IS DISTINCT FROM OLD.page THEN
    NEW.jump_from_page := NEW.page;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_story_jump_from_page ON stories;
CREATE TRIGGER trg_sync_story_jump_from_page
  BEFORE UPDATE OF page ON stories
  FOR EACH ROW
  EXECUTE FUNCTION sync_story_jump_from_page();

UPDATE stories SET jump_from_page = page WHERE page IS NOT NULL AND jump_from_page IS NULL;
