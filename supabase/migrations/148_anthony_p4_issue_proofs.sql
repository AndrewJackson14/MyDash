-- 148_anthony_p4_issue_proofs.sql
-- Anthony Phase 4 — print proofing tables. issue_proofs holds one
-- row per uploaded PDF version; issue_proof_annotations holds the
-- click-to-pin comments reviewers leave. All actor FKs reference
-- team_members(id) (the brief's "profiles" doesn't exist — same
-- pattern as Phase 1/2).

CREATE TABLE IF NOT EXISTS issue_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id text NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  version int NOT NULL DEFAULT 1,
  pdf_url text NOT NULL,
  pdf_filename text,
  bunny_path text,
  byte_size bigint,
  page_count int,
  uploaded_by uuid REFERENCES team_members(id),
  uploaded_at timestamptz DEFAULT now(),
  notes text,
  status text DEFAULT 'review' CHECK (status IN ('review','revising','approved','superseded')),
  approved_by uuid REFERENCES team_members(id),
  approved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_issue_proofs_issue_status
  ON issue_proofs(issue_id, status);
CREATE INDEX IF NOT EXISTS idx_issue_proofs_issue_version
  ON issue_proofs(issue_id, version DESC);

CREATE TABLE IF NOT EXISTS issue_proof_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_id uuid NOT NULL REFERENCES issue_proofs(id) ON DELETE CASCADE,
  page_number int NOT NULL,
  x_pct numeric NOT NULL CHECK (x_pct >= 0 AND x_pct <= 100),
  y_pct numeric NOT NULL CHECK (y_pct >= 0 AND y_pct <= 100),
  author_id uuid REFERENCES team_members(id),
  author_name text,
  comment text NOT NULL,
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES team_members(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proof_annotations_proof_page
  ON issue_proof_annotations(proof_id, page_number);
CREATE INDEX IF NOT EXISTS idx_proof_annotations_unresolved
  ON issue_proof_annotations(proof_id) WHERE resolved = false;

-- RLS — read open to authenticated; write/update gated to production
-- roles + publisher + EIC.
ALTER TABLE issue_proofs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team reads proofs" ON issue_proofs;
CREATE POLICY "team reads proofs" ON issue_proofs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "production writes proofs" ON issue_proofs;
CREATE POLICY "production writes proofs" ON issue_proofs
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM team_members tm
            WHERE tm.auth_id = auth.uid()
              AND tm.role IN ('Layout Designer','Graphic Designer','Production Manager','Publisher','Editor-in-Chief'))
  );

DROP POLICY IF EXISTS "production updates proofs" ON issue_proofs;
CREATE POLICY "production updates proofs" ON issue_proofs
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM team_members tm
            WHERE tm.auth_id = auth.uid()
              AND tm.role IN ('Layout Designer','Graphic Designer','Production Manager','Publisher','Editor-in-Chief'))
  );

ALTER TABLE issue_proof_annotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team reads annotations" ON issue_proof_annotations;
CREATE POLICY "team reads annotations" ON issue_proof_annotations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "team writes own annotations" ON issue_proof_annotations;
CREATE POLICY "team writes own annotations" ON issue_proof_annotations
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM team_members tm
            WHERE tm.auth_id = auth.uid() AND tm.id = author_id)
  );

DROP POLICY IF EXISTS "team updates annotations" ON issue_proof_annotations;
CREATE POLICY "team updates annotations" ON issue_proof_annotations
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM team_members tm WHERE tm.auth_id = auth.uid() AND tm.id = author_id)
    OR EXISTS (SELECT 1 FROM team_members tm
               WHERE tm.auth_id = auth.uid()
                 AND tm.role IN ('Layout Designer','Graphic Designer','Production Manager','Publisher','Editor-in-Chief'))
  );

DROP POLICY IF EXISTS "authors delete annotations" ON issue_proof_annotations;
CREATE POLICY "authors delete annotations" ON issue_proof_annotations
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM team_members tm WHERE tm.auth_id = auth.uid() AND tm.id = author_id)
  );
