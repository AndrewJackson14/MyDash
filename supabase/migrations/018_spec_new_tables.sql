-- 018_spec_new_tables.sql
-- New tables from build spec: printer workflow, team notes
-- Required by: Phase 3 (Subscriptions), Chapter 12 (Team dashboards)

-- Printer contacts for mailing list export workflow
CREATE TABLE IF NOT EXISTS printer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  is_default boolean DEFAULT false,
  publication_id text REFERENCES publications(id),
  created_at timestamptz DEFAULT now()
);

-- Mailing export audit log
CREATE TABLE IF NOT EXISTS mailing_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id text REFERENCES publications(id),
  issue_id text REFERENCES issues(id),
  exported_by uuid REFERENCES auth.users(id),
  printer_contact_id uuid REFERENCES printer_contacts(id),
  subscriber_count integer,
  columns_included text[],
  file_format text CHECK (file_format IN ('csv', 'xlsx')),
  exported_at timestamptz DEFAULT now(),
  emailed_at timestamptz
);

-- Team notes (bidirectional publisher <-> team member communication)
CREATE TABLE IF NOT EXISTS team_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid REFERENCES auth.users(id),
  to_user uuid REFERENCES auth.users(id),
  message text NOT NULL,
  is_read boolean DEFAULT false,
  read_at timestamptz,
  context_type text, -- 'general', 'story', 'client', 'task'
  context_id uuid,   -- links to relevant story/client/task
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_team_notes_to ON team_notes(to_user, is_read, created_at DESC);
CREATE INDEX idx_mailing_exports_pub ON mailing_exports(publication_id);

-- RLS
ALTER TABLE printer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mailing_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all" ON printer_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify" ON printer_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read all" ON mailing_exports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify" ON mailing_exports FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read all" ON team_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify" ON team_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
