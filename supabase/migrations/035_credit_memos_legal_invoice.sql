-- Credit memos as first-class objects + legal notice → invoice auto-mint.

CREATE TABLE IF NOT EXISTS credit_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  sale_id uuid REFERENCES sales(id),
  invoice_id uuid REFERENCES invoices(id),
  amount numeric NOT NULL,
  reason text NOT NULL,
  reason_code text CHECK (reason_code IN ('make_good', 'credit', 'refund', 'writeoff', 'other')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'void')),
  applied_to_invoice_id uuid REFERENCES invoices(id),
  applied_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE credit_memos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage credit_memos" ON credit_memos
  FOR ALL USING (auth.role() = 'authenticated');

-- Legal notice billed → auto-create invoice
CREATE OR REPLACE FUNCTION mint_legal_notice_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inv_id uuid;
  v_inv_number text;
  v_client clients%ROWTYPE;
BEGIN
  IF NEW.status = 'billed' AND (OLD.status IS NULL OR OLD.status <> 'billed') THEN
    IF NEW.client_id IS NULL OR NEW.total_amount IS NULL OR NEW.total_amount <= 0 THEN
      RETURN NEW;
    END IF;
    SELECT * INTO v_client FROM clients WHERE id = NEW.client_id;
    v_inv_number := COALESCE(v_client.invoice_prefix, 'LN') || '-' || to_char(now(), 'YYYYMMDD') || '-' || substring(gen_random_uuid()::text, 1, 4);
    INSERT INTO invoices (invoice_number, client_id, status, billing_schedule, issue_date, due_date, subtotal, total, balance_due, notes)
    VALUES (v_inv_number, NEW.client_id, 'sent', 'lump_sum', CURRENT_DATE, CURRENT_DATE + 30, NEW.total_amount, NEW.total_amount, NEW.total_amount, 'Legal notice: ' || COALESCE(NEW.title, 'Untitled') || ' (' || NEW.total_runs || ' runs)')
    RETURNING id INTO v_inv_id;
    INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, total, sort_order)
    VALUES (v_inv_id, 'Legal Notice: ' || COALESCE(NEW.title, '') || ' — ' || COALESCE(NEW.type::text, '') || ' (' || NEW.total_runs || ' runs @ $' || NEW.rate_per_run || '/run)', NEW.total_runs, NEW.rate_per_run, NEW.total_amount, 1);
    INSERT INTO notifications (title, type, link) VALUES ('Invoice auto-created for legal notice: ' || COALESCE(NEW.title, ''), 'system', '/billing');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_legal_notice_invoice ON legal_notices;
CREATE TRIGGER trg_legal_notice_invoice AFTER UPDATE OF status ON legal_notices FOR EACH ROW EXECUTE FUNCTION mint_legal_notice_invoice();
