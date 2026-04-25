-- 143_anthony_p1_stories_placed_by.sql
-- Anthony Phase 1 — track who laid a story on the page and when so
-- the Layout Designer dashboard's "pages laid out this month" stat
-- can stay accurate without inferring from print_status timestamps.
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS placed_by uuid REFERENCES team_members(id),
  ADD COLUMN IF NOT EXISTS laid_out_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_stories_placed_by_month
  ON stories(placed_by, laid_out_at);
