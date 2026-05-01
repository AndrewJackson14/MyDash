-- ============================================================
-- 178_consolidate_team_role_enum.sql
--
-- Audit item 6: drop the 13 legacy team_role enum values that the
-- consolidated role taxonomy (publisher / salesperson / ad-designer /
-- layout-designer / content-editor / office-administrator / stringer
-- / bot — 8 keepers) replaces.
--
-- Two existing team_members rows on legacy values get backfilled
-- before the swap:
--   • Graphic Designer (1 row) → Layout Designer
--   • Copy Editor      (1 row, Mike Chaldu) → Content Editor
--
-- 14 RLS policies reference team_members.role. Postgres won't allow
-- ALTER TYPE on a column that any policy references (even policies
-- on other tables and in the storage schema), so all 14 are dropped
-- before the swap and recreated after.
--
-- Legacy → canonical mapping inside policies:
--   Production Manager → Layout Designer
--   Graphic Designer   → Layout Designer
--   Sales Manager      → Salesperson
--   Office Manager     → Office Administrator
--   Editor             → Content Editor
--   Managing Editor    → Content Editor
--   Editor-in-Chief    → drop (Publisher already covers elevated
--                       editorial; can be re-added later)
-- ============================================================

-- 1. Backfill the 2 team_members rows.
UPDATE team_members SET role = 'Layout Designer' WHERE role = 'Graphic Designer';
UPDATE team_members SET role = 'Content Editor'  WHERE role = 'Copy Editor';

-- 2. Drop every policy that references team_members.role. 19 in total —
--    listed in alphabetical order by table.
DROP POLICY IF EXISTS activity_targets_publisher_write                 ON public.activity_targets;
DROP POLICY IF EXISTS contract_imports_select                          ON public.contract_imports;
DROP POLICY IF EXISTS contract_imports_update                          ON public.contract_imports;
DROP POLICY IF EXISTS "production can insert page status"              ON public.flatplan_page_status;
DROP POLICY IF EXISTS "production can update page status"              ON public.flatplan_page_status;
DROP POLICY IF EXISTS industries_publisher_write                       ON public.industries;
DROP POLICY IF EXISTS "Admin manages allocations"                      ON public.issue_goal_allocations;
DROP POLICY IF EXISTS "Admin sees all allocations"                     ON public.issue_goal_allocations;
DROP POLICY IF EXISTS "team updates annotations"                       ON public.issue_proof_annotations;
DROP POLICY IF EXISTS "production updates proofs"                      ON public.issue_proofs;
DROP POLICY IF EXISTS "production writes proofs"                       ON public.issue_proofs;
DROP POLICY IF EXISTS press_log_admin_or_editorial_read                ON public.press_release_log;
DROP POLICY IF EXISTS "production updates print_runs"                  ON public.print_runs;
DROP POLICY IF EXISTS "production writes print_runs"                   ON public.print_runs;
DROP POLICY IF EXISTS "publisher writes printer_publications"          ON public.printer_publications;
DROP POLICY IF EXISTS "publisher updates printers"                     ON public.printers;
DROP POLICY IF EXISTS "publisher deletes printers"                     ON public.printers;
DROP POLICY IF EXISTS "publisher writes printers"                      ON public.printers;
DROP POLICY IF EXISTS contract_imports_storage_read                    ON storage.objects;

-- 3. Swap the enum.
CREATE TYPE team_role_v2 AS ENUM (
  'Publisher',
  'Salesperson',
  'Stringer',
  'Ad Designer',
  'Layout Designer',
  'Content Editor',
  'Office Administrator',
  'Bot'
);

ALTER TABLE team_members
  ALTER COLUMN role TYPE team_role_v2 USING role::text::team_role_v2;

DROP TYPE team_role;
ALTER TYPE team_role_v2 RENAME TO team_role;

-- 4. Recreate all policies under the new taxonomy.

-- activity_targets — Publisher kept; semantically unchanged.
CREATE POLICY activity_targets_publisher_write ON public.activity_targets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.auth_id = auth.uid() AND team_members.role = 'Publisher'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.auth_id = auth.uid() AND team_members.role = 'Publisher'
    )
  );

-- contract_imports — drop Sales Manager, Office Manager, Editor-in-Chief.
-- Keep Salesperson (Sales Manager → Salesperson), Office Administrator
-- (Office Manager → Office Administrator), Publisher.
CREATE POLICY contract_imports_select ON public.contract_imports
  FOR SELECT TO authenticated
  USING (
    uploaded_by IN (SELECT id FROM team_members WHERE auth_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid()
        AND tm.role IN ('Salesperson', 'Publisher', 'Office Administrator')
    )
  );

CREATE POLICY contract_imports_update ON public.contract_imports
  FOR UPDATE TO authenticated
  USING (
    uploaded_by IN (SELECT id FROM team_members WHERE auth_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid()
        AND tm.role IN ('Salesperson', 'Publisher', 'Office Administrator')
    )
  );

-- flatplan_page_status — was: Layout Designer, Graphic Designer,
-- Production Manager, Publisher. New: Layout Designer, Publisher.
CREATE POLICY "production can insert page status" ON public.flatplan_page_status
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid()
        AND tm.role IN ('Layout Designer', 'Publisher')
    )
  );

CREATE POLICY "production can update page status" ON public.flatplan_page_status
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid()
        AND tm.role IN ('Layout Designer', 'Publisher')
    )
  );

-- industries — Publisher kept; semantically unchanged.
CREATE POLICY industries_publisher_write ON public.industries
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid()
        AND (tm.global_role = 'super_admin' OR tm.role = 'Publisher')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid()
        AND (tm.global_role = 'super_admin' OR tm.role = 'Publisher')
    )
  );

-- issue_goal_allocations — Publisher kept; semantically unchanged.
CREATE POLICY "Admin sees all allocations" ON public.issue_goal_allocations
  FOR SELECT TO authenticated
  USING (
    has_permission('admin'::text)
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid() AND tm.role = 'Publisher'
    )
  );

CREATE POLICY "Admin manages allocations" ON public.issue_goal_allocations
  FOR ALL TO authenticated
  USING (
    has_permission('admin'::text)
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid() AND tm.role = 'Publisher'
    )
  );

-- issue_proof_annotations — author OR (Layout Designer, Publisher,
-- Content Editor). Replaces Graphic Designer + Production Manager
-- with Layout Designer; replaces EIC with Content Editor.
CREATE POLICY "team updates annotations" ON public.issue_proof_annotations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid() AND tm.id = issue_proof_annotations.author_id
    )
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid()
        AND tm.role IN ('Layout Designer', 'Publisher', 'Content Editor')
    )
  );

-- issue_proofs — same mapping as issue_proof_annotations.
CREATE POLICY "production writes proofs" ON public.issue_proofs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid()
        AND tm.role IN ('Layout Designer', 'Publisher', 'Content Editor')
    )
  );

CREATE POLICY "production updates proofs" ON public.issue_proofs
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid()
        AND tm.role IN ('Layout Designer', 'Publisher', 'Content Editor')
    )
  );

-- press_release_log — was is_admin OR (EIC, Managing Editor, Editor).
-- New: is_admin OR (Publisher, Content Editor).
CREATE POLICY press_log_admin_or_editorial_read ON public.press_release_log
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid()
        AND tm.role IN ('Publisher', 'Content Editor')
    )
  );

-- print_runs — was Layout Designer, Graphic Designer, Production
-- Manager, Publisher. New: Layout Designer, Publisher.
CREATE POLICY "production writes print_runs" ON public.print_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid()
        AND tm.role IN ('Layout Designer', 'Publisher')
    )
  );

CREATE POLICY "production updates print_runs" ON public.print_runs
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid()
        AND tm.role IN ('Layout Designer', 'Publisher')
    )
  );

-- printer_publications — Production Manager → Layout Designer.
CREATE POLICY "publisher writes printer_publications" ON public.printer_publications
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid()
        AND tm.role IN ('Publisher', 'Layout Designer')
    )
  );

-- printers — Production Manager → Layout Designer.
CREATE POLICY "publisher writes printers" ON public.printers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid()
        AND tm.role IN ('Publisher', 'Layout Designer')
    )
  );

CREATE POLICY "publisher updates printers" ON public.printers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid()
        AND tm.role IN ('Publisher', 'Layout Designer')
    )
  );

CREATE POLICY "publisher deletes printers" ON public.printers
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid()
        AND tm.role IN ('Publisher', 'Layout Designer')
    )
  );

-- storage.objects — contract-imports bucket. Same mapping as the
-- contract_imports table policies.
CREATE POLICY contract_imports_storage_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'contract-imports'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.auth_id = auth.uid()
          AND tm.role IN ('Salesperson', 'Publisher', 'Office Administrator')
      )
    )
  );
