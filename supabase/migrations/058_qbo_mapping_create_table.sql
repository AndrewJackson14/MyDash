-- ============================================================================
-- Migration 058: Create QBO Account Mapping table
-- ============================================================================
--
-- Architecture:
--   - MyDash holds operational granularity (which publication, which issue)
--   - QBO holds rolled-up financials only (revenue category, cost bucket)
--   - This table maps MyDash transaction_type → QBO account name + line desc
--
-- Resolver contract:
--   lookup(transaction_type) → { qbo_account_name, line_description_template }
--   Callers fill the template tokens (e.g. {title}, {issue_date}) at send time.
--
-- Live QBO validation (unchanged from existing BillsTab pattern):
--   The mapping table names the canonical QBO account. The push layer then
--   queries QBO for live account Ids and case-insensitive-matches against
--   Account.Name to resolve Id. Belt-and-suspenders: if anyone renames an
--   account in QBO, push fails loudly with the list of live names.
--   This live QBO query is NEVER cached across pushes.
-- ============================================================================

BEGIN;

CREATE TYPE qbo_transaction_category AS ENUM (
  'income',
  'cogs',
  'expense',
  'contra_revenue'
);

CREATE TABLE qbo_account_mapping (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type          text NOT NULL UNIQUE,
  category                  qbo_transaction_category NOT NULL,
  display_name              text NOT NULL,
  qbo_account_name          text NOT NULL,
  line_description_template text NOT NULL,
  required_tokens           text[] NOT NULL DEFAULT ARRAY[]::text[],
  example                   text,
  active                    boolean NOT NULL DEFAULT true,
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE qbo_account_mapping
  ADD CONSTRAINT transaction_type_format_chk
  CHECK (transaction_type ~ '^[a-z][a-z0-9_]*$');

ALTER TABLE qbo_account_mapping
  ADD CONSTRAINT template_non_empty_chk
  CHECK (length(trim(line_description_template)) > 0);

CREATE INDEX qbo_account_mapping_active_lookup_idx
  ON qbo_account_mapping (transaction_type)
  WHERE active = true;

CREATE INDEX qbo_account_mapping_category_idx
  ON qbo_account_mapping (category)
  WHERE active = true;

CREATE OR REPLACE FUNCTION set_qbo_mapping_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER qbo_account_mapping_updated_at
  BEFORE UPDATE ON qbo_account_mapping
  FOR EACH ROW
  EXECUTE FUNCTION set_qbo_mapping_updated_at();

ALTER TABLE qbo_account_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY qbo_account_mapping_read
  ON qbo_account_mapping FOR SELECT TO authenticated USING (true);

CREATE POLICY qbo_account_mapping_write
  ON qbo_account_mapping FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE qbo_account_mapping IS
  'Single source of truth mapping MyDash transaction types to QuickBooks Online accounts. Used by the QBO push layer (React) to route bills and invoices. After CoA consolidation, the line_description_template is the primary audit trail connecting a QBO transaction to its MyDash context.';

COMMENT ON COLUMN qbo_account_mapping.transaction_type IS
  'Stable snake_case identifier used by MyDash code and by invoice_lines.transaction_type / bills.category. Never change an existing value — add a new row and deactivate the old one instead.';

COMMENT ON COLUMN qbo_account_mapping.qbo_account_name IS
  'Canonical QBO account name. The push layer case-insensitively matches this against live Account.Name via the QBO query endpoint to resolve Account.Id. Must match post-Phase-2 consolidated CoA.';

COMMENT ON COLUMN qbo_account_mapping.line_description_template IS
  'Uses {snake_case} tokens. The resolver substitutes tokens at send time. Non-token text passes through literally. After CoA consolidation this is the primary audit trail — QBO accounts will be generic ("Printing"), the line description is how you know which title/issue.';

COMMIT;
