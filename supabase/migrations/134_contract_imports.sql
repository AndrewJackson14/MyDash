-- 134_contract_imports.sql
--
-- Christie writes paper contracts on OpenDoor Directories receipts;
-- snaps photos with the mobile app; the Mac Mini worker (running
-- on the Wednesday Agent Station) picks up new uploads, runs them
-- through Gemini Vision to extract structured fields, and writes
-- the result back as a proposal draft for review.
--
-- The lifecycle:
--   pending     uploaded, waiting for the worker
--   processing  worker has claimed it, parser running
--   extracted   parser succeeded, draft awaits human review
--   converted   reviewer accepted; proposal_id is populated
--   failed      parser threw or quality too low; error_message set
--
-- The "extracted" → "converted" hop is intentional: handwriting
-- is unreliable enough that auto-converting without a human eye
-- would cause real customer-facing errors. Christie taps "Convert"
-- on the review sheet and the existing convertProposal RPC chain
-- takes over from there.

CREATE TABLE IF NOT EXISTS contract_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by uuid REFERENCES team_members(id),
  storage_paths text[] NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'extracted', 'converted', 'failed')),
  extracted_json jsonb,
  proposal_id uuid,
  client_id uuid,
  error_message text,
  notes text,
  worker_started_at timestamptz,
  worker_finished_at timestamptz,
  reviewed_by uuid REFERENCES team_members(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_imports_status_created
  ON contract_imports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_imports_uploaded_by
  ON contract_imports (uploaded_by, created_at DESC);

-- Touch updated_at on every change so the realtime subscription on
-- the mobile review screen has a stable order column.
CREATE OR REPLACE FUNCTION touch_contract_imports_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_imports_updated_at ON contract_imports;
CREATE TRIGGER trg_contract_imports_updated_at
  BEFORE UPDATE ON contract_imports
  FOR EACH ROW EXECUTE FUNCTION touch_contract_imports_updated_at();

ALTER TABLE contract_imports ENABLE ROW LEVEL SECURITY;

-- Read: uploader sees their own; managers/publisher/admin see all.
CREATE POLICY contract_imports_select ON contract_imports
  FOR SELECT TO authenticated USING (
    uploaded_by IN (SELECT id FROM team_members WHERE auth_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid()
        AND tm.role IN ('Sales Manager', 'Publisher', 'Office Administrator', 'Office Manager', 'Editor-in-Chief')
    )
  );

-- Insert: only the team_member matching the caller can upload.
CREATE POLICY contract_imports_insert ON contract_imports
  FOR INSERT TO authenticated WITH CHECK (
    uploaded_by IN (SELECT id FROM team_members WHERE auth_id = auth.uid())
  );

-- Update: uploader can update their own (e.g. add a note); managers
-- can update any (e.g. mark reviewed). Worker bypass uses service_role.
CREATE POLICY contract_imports_update ON contract_imports
  FOR UPDATE TO authenticated USING (
    uploaded_by IN (SELECT id FROM team_members WHERE auth_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid()
        AND tm.role IN ('Sales Manager', 'Publisher', 'Office Administrator', 'Office Manager', 'Editor-in-Chief')
    )
  );

-- Storage bucket setup. The Mac Mini worker uses service_role to
-- download. Mobile uploaders use authenticated insert with a path
-- prefix matching their uploaded_by.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contract-imports', 'contract-imports', false, 20971520,  -- 20MB max per photo
        ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage RLS: writers can insert under {auth_uid}/* paths;
-- readers can read their own + service_role bypasses everything.
DROP POLICY IF EXISTS contract_imports_storage_insert ON storage.objects;
CREATE POLICY contract_imports_storage_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'contract-imports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS contract_imports_storage_read ON storage.objects;
CREATE POLICY contract_imports_storage_read ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'contract-imports'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.auth_id = auth.uid()
          AND tm.role IN ('Sales Manager', 'Publisher', 'Office Administrator', 'Office Manager', 'Editor-in-Chief')
      )
    )
  );

DROP POLICY IF EXISTS contract_imports_storage_delete ON storage.objects;
CREATE POLICY contract_imports_storage_delete ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'contract-imports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
