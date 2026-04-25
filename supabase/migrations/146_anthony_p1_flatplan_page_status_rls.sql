-- 146_anthony_p1_flatplan_page_status_rls.sql
-- Anthony Phase 1 — RLS for flatplan_page_status. Reads are open to
-- anyone authenticated (the page-completion state is a team-wide
-- production signal). Writes are restricted to layout/production roles.
ALTER TABLE flatplan_page_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team can read page status" ON flatplan_page_status;
CREATE POLICY "team can read page status" ON flatplan_page_status
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "production can insert page status" ON flatplan_page_status;
CREATE POLICY "production can insert page status" ON flatplan_page_status
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM team_members tm
            WHERE tm.auth_id = auth.uid()
              AND tm.role IN ('Layout Designer','Graphic Designer','Production Manager','Publisher'))
  );

DROP POLICY IF EXISTS "production can update page status" ON flatplan_page_status;
CREATE POLICY "production can update page status" ON flatplan_page_status
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM team_members tm
            WHERE tm.auth_id = auth.uid()
              AND tm.role IN ('Layout Designer','Graphic Designer','Production Manager','Publisher'))
  );
