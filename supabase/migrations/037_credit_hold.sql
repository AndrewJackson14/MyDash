-- Credit hold on clients — blocks production, warns on flatplan placement
ALTER TABLE clients ADD COLUMN IF NOT EXISTS credit_hold boolean DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS credit_hold_reason text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS credit_hold_set_by uuid;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS credit_hold_set_at timestamptz;
