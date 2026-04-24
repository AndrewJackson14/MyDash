-- ============================================================
-- Migration 102 — Editorial→Production workflow spec Phase 4
--
-- Reference layout image per (issue, page). Replace-on-upload via
-- the unique constraint; no version history. Insert/update gated to
-- publishers, layout designers, editors-in-chief; everyone authed
-- can read so the production team can preview.
-- ============================================================
CREATE TABLE IF NOT EXISTS flatplan_page_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id text NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  bunny_path text NOT NULL,
  cdn_url text NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  width integer,
  height integer,
  byte_size integer,
  UNIQUE (issue_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_flatplan_layouts_issue ON flatplan_page_layouts(issue_id);

ALTER TABLE flatplan_page_layouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flatplan_layouts_select ON flatplan_page_layouts;
CREATE POLICY flatplan_layouts_select ON flatplan_page_layouts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM team_members WHERE auth_id = auth.uid() AND is_active));

DROP POLICY IF EXISTS flatplan_layouts_insert ON flatplan_page_layouts;
CREATE POLICY flatplan_layouts_insert ON flatplan_page_layouts
  FOR INSERT TO authenticated
  WITH CHECK (
    has_permission('admin') OR has_permission('editorial')
    OR has_permission('flatplan') OR has_permission('production')
    OR has_permission('layout')
  );

DROP POLICY IF EXISTS flatplan_layouts_update ON flatplan_page_layouts;
CREATE POLICY flatplan_layouts_update ON flatplan_page_layouts
  FOR UPDATE TO authenticated
  USING (
    has_permission('admin') OR has_permission('editorial')
    OR has_permission('flatplan') OR has_permission('production')
    OR has_permission('layout')
  );

DROP POLICY IF EXISTS flatplan_layouts_delete ON flatplan_page_layouts;
CREATE POLICY flatplan_layouts_delete ON flatplan_page_layouts
  FOR DELETE TO authenticated
  USING (
    has_permission('admin')
    OR has_permission('flatplan') OR has_permission('layout')
  );
