-- 016_outreach_system.sql
-- Sales outreach campaigns and entry tracking
-- Required by: Outreach.jsx, useAppData.loadOutreach(), Dashboard.jsx

CREATE TABLE IF NOT EXISTS outreach_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  filters jsonb, -- stored filter criteria used to build campaign
  created_by uuid REFERENCES team_members(id),
  assigned_to uuid REFERENCES team_members(id),
  publication_id uuid REFERENCES publications(id),
  client_count integer DEFAULT 0,
  contacted_count integer DEFAULT 0,
  won_back_count integer DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outreach_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'contacted', 'responded', 'meeting',
    'won_back', 'not_interested', 'skipped',
    'not_contacted', 'meeting_scheduled', 'declined', 'no_response'
  )),
  contacted_at timestamptz,
  contacted_via text CHECK (contacted_via IN ('email', 'phone', 'in_person')),
  response_at timestamptz,
  response_notes text,
  meeting_date date,
  meeting_notes text,
  won_back_at timestamptz,
  won_back_amount numeric(10,2) DEFAULT 0,
  assigned_to uuid REFERENCES team_members(id),
  notes text,
  recovered_revenue numeric(10,2) DEFAULT 0,
  meetings_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_outreach_entries_campaign ON outreach_entries(campaign_id);
CREATE INDEX idx_outreach_entries_client ON outreach_entries(client_id);
CREATE INDEX idx_outreach_campaigns_assigned ON outreach_campaigns(assigned_to);

-- RLS
ALTER TABLE outreach_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all" ON outreach_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify" ON outreach_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read all" ON outreach_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify" ON outreach_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
