-- 017_priorities_contracts.sql
-- MyPriorities (per-salesperson client lists) and Contracts
-- Required by: SalesCRM MyPriorities, Contracts.jsx, DataImport.jsx

-- MyPriorities: salesperson priority client list (max 13 per person)
CREATE TABLE IF NOT EXISTS my_priorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  signal_type text,
  signal_detail text,
  added_at timestamptz DEFAULT now(),
  added_by uuid REFERENCES team_members(id),
  highlighted boolean DEFAULT false,
  highlighted_by uuid REFERENCES team_members(id),
  highlighted_at timestamptz,
  sort_order integer DEFAULT 0 CHECK (sort_order >= 0 AND sort_order <= 12),
  UNIQUE(team_member_id, client_id)
);

CREATE INDEX idx_my_priorities_member ON my_priorities(team_member_id, sort_order);

-- Contracts
CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  start_date date,
  end_date date,
  total_value numeric(10,2) DEFAULT 0,
  total_paid numeric(10,2) DEFAULT 0,
  discount_pct numeric(5,2) DEFAULT 0,
  payment_terms text,
  assigned_to uuid REFERENCES team_members(id),
  notes text,
  is_synthetic boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Contract line items
CREATE TABLE IF NOT EXISTS contract_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  publication_id uuid REFERENCES publications(id),
  ad_size text,
  rate numeric(10,2) DEFAULT 0,
  quantity integer DEFAULT 1,
  line_total numeric(10,2) DEFAULT 0,
  sort_order integer DEFAULT 0,
  notes text
);

CREATE INDEX idx_contracts_client ON contracts(client_id);
CREATE INDEX idx_contracts_status ON contracts(status);
CREATE INDEX idx_contract_lines_contract ON contract_lines(contract_id);

-- RLS
ALTER TABLE my_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all" ON my_priorities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify" ON my_priorities FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read all" ON contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify" ON contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read all" ON contract_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify" ON contract_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
