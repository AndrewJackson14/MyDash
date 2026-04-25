-- 145_anthony_p1_team_notes_context_index.sql
-- Anthony Phase 1 — the Issue Pings card on the Layout Designer
-- dashboard reads team_notes WHERE context_type='issue' AND
-- context_id IN (active issue ids), filtered by recency. This index
-- keeps that lookup fast as the team_notes table grows.
CREATE INDEX IF NOT EXISTS idx_team_notes_context_issue
  ON team_notes(context_type, context_id)
  WHERE context_type IN ('issue', 'story');
