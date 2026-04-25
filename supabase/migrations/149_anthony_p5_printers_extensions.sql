-- 149_anthony_p5_printers_extensions.sql
-- Anthony Phase 5 — extend the existing printers/print_runs/
-- printer_publications tables (BUSINESS_DOMAINS walk #4 stranded
-- schema) with the delivery + audit fields the Send-to-Press flow
-- writes. All actor FKs reference team_members(id).

ALTER TABLE printers
  ADD COLUMN IF NOT EXISTS delivery_method text DEFAULT 'email'
    CHECK (delivery_method IN ('email','sftp','portal','manual')),
  ADD COLUMN IF NOT EXISTS delivery_config jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cost_per_copy numeric(10, 4),
  ADD COLUMN IF NOT EXISTS sla_hours int;

CREATE INDEX IF NOT EXISTS idx_printers_active ON printers(is_active) WHERE is_active = true;

ALTER TABLE printer_publications
  ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_printer_publications_pub
  ON printer_publications(publication_id, is_default DESC);

ALTER TABLE print_runs
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS pdf_filename text,
  ADD COLUMN IF NOT EXISTS pdf_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS bunny_path text,
  ADD COLUMN IF NOT EXISTS shipped_by uuid REFERENCES team_members(id),
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by_email text,
  ADD COLUMN IF NOT EXISTS press_notes text,
  ADD COLUMN IF NOT EXISTS delivery_method text
    CHECK (delivery_method IN ('email','sftp','portal','manual')),
  ADD COLUMN IF NOT EXISTS gmail_message_id text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'shipped'
    CHECK (status IN ('shipped','confirmed','reprint','cancelled'));

CREATE INDEX IF NOT EXISTS idx_print_runs_issue_status ON print_runs(issue_id, status);
CREATE INDEX IF NOT EXISTS idx_print_runs_unconfirmed ON print_runs(issue_id) WHERE confirmed_at IS NULL;

-- RLS — printers + printer_publications read-open, writes gated to
-- publisher/production. delivery_config can hold credentials so we
-- want write paths locked down even if reads stay broad.
ALTER TABLE printers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team reads printers" ON printers;
CREATE POLICY "team reads printers" ON printers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "publisher writes printers" ON printers;
CREATE POLICY "publisher writes printers" ON printers FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.auth_id = auth.uid()
          AND tm.role IN ('Publisher','Production Manager'))
);
DROP POLICY IF EXISTS "publisher updates printers" ON printers;
CREATE POLICY "publisher updates printers" ON printers FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.auth_id = auth.uid()
          AND tm.role IN ('Publisher','Production Manager'))
);
DROP POLICY IF EXISTS "publisher deletes printers" ON printers;
CREATE POLICY "publisher deletes printers" ON printers FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.auth_id = auth.uid()
          AND tm.role IN ('Publisher','Production Manager'))
);

ALTER TABLE printer_publications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team reads printer_publications" ON printer_publications;
CREATE POLICY "team reads printer_publications" ON printer_publications FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "publisher writes printer_publications" ON printer_publications;
CREATE POLICY "publisher writes printer_publications" ON printer_publications FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.auth_id = auth.uid()
          AND tm.role IN ('Publisher','Production Manager'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.auth_id = auth.uid()
          AND tm.role IN ('Publisher','Production Manager'))
);

ALTER TABLE print_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team reads print_runs" ON print_runs;
CREATE POLICY "team reads print_runs" ON print_runs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "production writes print_runs" ON print_runs;
CREATE POLICY "production writes print_runs" ON print_runs FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.auth_id = auth.uid()
          AND tm.role IN ('Layout Designer','Graphic Designer','Production Manager','Publisher'))
);
DROP POLICY IF EXISTS "production updates print_runs" ON print_runs;
CREATE POLICY "production updates print_runs" ON print_runs FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM team_members tm WHERE tm.auth_id = auth.uid()
          AND tm.role IN ('Layout Designer','Graphic Designer','Production Manager','Publisher'))
);
