-- 022_client_code_and_brief.sql
-- Client alphanumeric ID + structured ad brief fields + proof workflow

-- Client alphanumeric code (XNXN-XNXN-XNXN format, no ambiguous chars)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_code text UNIQUE;

-- Structured brief fields on ad_projects
ALTER TABLE ad_projects ADD COLUMN IF NOT EXISTS brief_headline text;
ALTER TABLE ad_projects ADD COLUMN IF NOT EXISTS brief_style text;
ALTER TABLE ad_projects ADD COLUMN IF NOT EXISTS brief_colors text;
ALTER TABLE ad_projects ADD COLUMN IF NOT EXISTS brief_instructions text;
ALTER TABLE ad_projects ADD COLUMN IF NOT EXISTS global_assets text[] DEFAULT '{}';
ALTER TABLE ad_projects ADD COLUMN IF NOT EXISTS project_assets text[] DEFAULT '{}';
ALTER TABLE ad_projects ADD COLUMN IF NOT EXISTS project_assets_expire_at timestamptz;

-- Proof internal status (designer/salesperson review flow)
ALTER TABLE ad_proofs ADD COLUMN IF NOT EXISTS internal_status text DEFAULT 'uploaded'
  CHECK (internal_status IN ('uploaded', 'ready', 'edit', 'approved', 'sent_to_client'));
ALTER TABLE ad_proofs ADD COLUMN IF NOT EXISTS client_approved boolean DEFAULT false;
ALTER TABLE ad_proofs ADD COLUMN IF NOT EXISTS client_approved_at timestamptz;
ALTER TABLE ad_proofs ADD COLUMN IF NOT EXISTS client_feedback text;
ALTER TABLE ad_proofs ADD COLUMN IF NOT EXISTS annotations jsonb;
ALTER TABLE ad_proofs ADD COLUMN IF NOT EXISTS sent_to_client_at timestamptz;
ALTER TABLE ad_proofs ADD COLUMN IF NOT EXISTS sent_to_client_by uuid REFERENCES team_members(id);

-- Auto-generate client code function
CREATE OR REPLACE FUNCTION generate_client_code() RETURNS text AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i integer;
BEGIN
  FOR i IN 1..4 LOOP
    code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  code := code || '-';
  FOR i IN 1..4 LOOP
    code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  code := code || '-';
  FOR i IN 1..4 LOOP
    code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Backfill + trigger
UPDATE clients SET client_code = generate_client_code() WHERE client_code IS NULL;

CREATE OR REPLACE FUNCTION set_client_code() RETURNS trigger AS $$
BEGIN
  IF NEW.client_code IS NULL THEN
    NEW.client_code := generate_client_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_code ON clients;
CREATE TRIGGER trg_client_code BEFORE INSERT ON clients
  FOR EACH ROW EXECUTE FUNCTION set_client_code();

NOTIFY pgrst, 'reload schema';
