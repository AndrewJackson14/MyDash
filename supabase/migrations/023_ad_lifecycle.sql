-- 023_ad_lifecycle.sql
-- Ad lifecycle: art source, revision billing, sent to press

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS art_source text DEFAULT 'we_design'
  CHECK (art_source IN ('we_design', 'camera_ready'));

ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_art_source text DEFAULT 'we_design';

ALTER TABLE ad_projects ADD COLUMN IF NOT EXISTS art_source text DEFAULT 'we_design'
  CHECK (art_source IN ('we_design', 'camera_ready'));
ALTER TABLE ad_projects ADD COLUMN IF NOT EXISTS source_proposal_id uuid REFERENCES proposals(id);
ALTER TABLE ad_projects ADD COLUMN IF NOT EXISTS source_contract_id uuid REFERENCES contracts(id);
ALTER TABLE ad_projects ADD COLUMN IF NOT EXISTS revision_billable_count integer NOT NULL DEFAULT 0;
ALTER TABLE ad_projects ADD COLUMN IF NOT EXISTS revision_charges numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE issues ADD COLUMN IF NOT EXISTS sent_to_press_at timestamptz;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS sent_to_press_by text;

NOTIFY pgrst, 'reload schema';
