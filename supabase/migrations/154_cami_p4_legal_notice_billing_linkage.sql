-- 154_cami_p4_legal_notice_billing_linkage.sql
-- Cami P4 — legal-notice billing workflow. Adds the linkage between
-- a legal notice and its invoice (FK on legal_notices.invoice_id +
-- a direct invoice_lines.legal_notice_id column that the intake
-- flow already passes in line metadata but never persisted as a
-- real column). Plus tracks when the initial invoice email and the
-- post-publication affidavit email have been sent so the workflow
-- doesn't double-send.

ALTER TABLE legal_notices
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES invoices(id),
  ADD COLUMN IF NOT EXISTS invoice_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_sent_by uuid REFERENCES team_members(id),
  ADD COLUMN IF NOT EXISTS affidavit_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS affidavit_sent_by uuid REFERENCES team_members(id);

CREATE INDEX IF NOT EXISTS idx_legal_notices_invoice
  ON legal_notices(invoice_id) WHERE invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_legal_notices_unbilled
  ON legal_notices(status) WHERE status = 'published' AND invoice_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_legal_notices_affidavit_pending
  ON legal_notices(status) WHERE affidavit_status = 'delivered' AND affidavit_sent_at IS NULL;

ALTER TABLE invoice_lines
  ADD COLUMN IF NOT EXISTS legal_notice_id uuid REFERENCES legal_notices(id);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_legal_notice
  ON invoice_lines(legal_notice_id) WHERE legal_notice_id IS NOT NULL;
