-- 015_commission_system.sql
-- Commission tracking: rates, goals, ledger, payouts, pub assignments
-- Required by: Commissions.jsx, useAppData.loadCommissions()

-- Salesperson publication assignments (% share of revenue per pub)
CREATE TABLE IF NOT EXISTS salesperson_pub_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesperson_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  publication_id uuid NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  percentage numeric(5,2) DEFAULT 0 CHECK (percentage >= 0 AND percentage <= 100),
  is_active boolean DEFAULT true,
  UNIQUE(salesperson_id, publication_id)
);

-- Commission rate overrides per salesperson/pub/product type
CREATE TABLE IF NOT EXISTS commission_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesperson_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  publication_id uuid REFERENCES publications(id) ON DELETE SET NULL,
  product_type text CHECK (product_type IN ('display_print', 'web', 'sponsored_content')),
  rate numeric(5,2) NOT NULL CHECK (rate >= 0 AND rate <= 100),
  UNIQUE(salesperson_id, publication_id, product_type)
);

-- Per-issue revenue goals
CREATE TABLE IF NOT EXISTS commission_issue_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  publication_id uuid NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  goal numeric(10,2) NOT NULL DEFAULT 0,
  UNIQUE(issue_id)
);

-- Commission payouts (batch payment records)
CREATE TABLE IF NOT EXISTS commission_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salesperson_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  period text NOT NULL, -- YYYY-MM format
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  commission_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
  approved_by uuid REFERENCES team_members(id),
  approved_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Commission ledger (per-sale commission records)
CREATE TABLE IF NOT EXISTS commission_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  salesperson_id uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  publication_id uuid REFERENCES publications(id),
  issue_id uuid REFERENCES issues(id),
  client_id uuid REFERENCES clients(id),
  sale_amount numeric(10,2) NOT NULL DEFAULT 0,
  share_pct numeric(5,2) NOT NULL DEFAULT 100,
  commission_rate numeric(5,2) NOT NULL DEFAULT 0,
  commission_amount numeric(10,2) NOT NULL DEFAULT 0,
  bonus_pct numeric(5,2) DEFAULT 0,
  bonus_amount numeric(10,2) DEFAULT 0,
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'earned', 'paid')),
  issue_published boolean DEFAULT false,
  invoice_paid boolean DEFAULT false,
  earned_at timestamptz,
  payout_id uuid REFERENCES commission_payouts(id),
  paid_at timestamptz,
  period text, -- YYYY-MM format
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_commission_ledger_salesperson ON commission_ledger(salesperson_id, status);
CREATE INDEX idx_commission_ledger_sale ON commission_ledger(sale_id);
CREATE INDEX idx_commission_ledger_period ON commission_ledger(period);
CREATE INDEX idx_commission_payouts_salesperson ON commission_payouts(salesperson_id, status);

-- RLS policies
ALTER TABLE salesperson_pub_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_issue_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all" ON salesperson_pub_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify" ON salesperson_pub_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read all" ON commission_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify" ON commission_rates FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read all" ON commission_issue_goals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify" ON commission_issue_goals FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read all" ON commission_payouts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify" ON commission_payouts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read all" ON commission_ledger FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify" ON commission_ledger FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
