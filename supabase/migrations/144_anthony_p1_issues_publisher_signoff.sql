-- 144_anthony_p1_issues_publisher_signoff.sql
-- Anthony Phase 1 — publisher sign-off on an issue is a precondition
-- for Send-to-Press (Phase 3 readiness checklist). Phase 1 only
-- reads this in the Today's Issues card if the value's set.
ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS publisher_signoff_at timestamptz,
  ADD COLUMN IF NOT EXISTS publisher_signoff_by uuid REFERENCES team_members(id);
