-- ============================================================
-- Migration 090: stories.also_in_issue_ids — link-not-clone
-- sibling issue placements.
--
-- A story has ONE canonical print_issue_id (its primary placement).
-- also_in_issue_ids holds any additional issue IDs where the same
-- story also appears — used when two sibling publications run the
-- same article on the same date (Paso Robles Press ↔ Atascadero
-- News; Paso Magazine ↔ Atascadero News Magazine). No row
-- duplication — the planner surfaces the single story under each
-- linked issue with a sibling badge, so edits propagate and budget
-- math (word count, page allocations) stays sane.
--
-- Pairs are not hardcoded here; they come from
-- publications.settings.shared_content_with (added in migration
-- 033). The planner UI only offers linkage to same-date issues on
-- a declared sibling pub.
-- ============================================================

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS also_in_issue_ids text[] DEFAULT '{}';

-- GIN index for array-contains lookups — the planner filters
-- stories via `also_in_issue_ids @> ARRAY[selIssue]` when listing
-- stories for a sibling issue.
CREATE INDEX IF NOT EXISTS idx_stories_also_in_issue_ids
  ON stories USING gin (also_in_issue_ids);

COMMENT ON COLUMN stories.also_in_issue_ids IS
  'Linked sibling issue IDs where this same story also appears. One canonical row; planner surfaces under each linked issue via array-contains. Use print_issue_id for the primary placement; this array for secondary placements on sibling publications that share content.';

NOTIFY pgrst, 'reload schema';
