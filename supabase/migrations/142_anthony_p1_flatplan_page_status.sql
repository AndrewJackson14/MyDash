-- 142_anthony_p1_flatplan_page_status.sql
-- Anthony Phase 1 — per-page completion state for the Issue Layout
-- Console (Phase 3 will write to it; Phase 1 reads it for the
-- Today's Issues progress bar).
CREATE TABLE IF NOT EXISTS flatplan_page_status (
  issue_id text NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  page_number int NOT NULL,
  completed_by uuid REFERENCES team_members(id),
  completed_at timestamptz,
  notes text,
  PRIMARY KEY (issue_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_flatplan_page_status_completed
  ON flatplan_page_status(issue_id) WHERE completed_at IS NOT NULL;
