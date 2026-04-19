-- ============================================================================
-- Migration 061: Add invoice_lines.transaction_type column (nullable)
-- ============================================================================
--
-- This is step 1 of the safe 3-step sequence for adding a NOT NULL column:
--   4/5 (this file): ADD COLUMN nullable
--   5/5:             UPDATE backfill from sales.product_type
--   6/5:             ALTER COLUMN SET NOT NULL + CHECK constraint
--
-- Between this migration and the NOT NULL flip, existing code that reads
-- invoice_lines continues to work (column is optional). Existing invoice-push
-- code (Billing.jsx:351-399) is not touched until the deploy that adds the
-- resolver wiring — so the nullable state is safe.
-- ============================================================================

BEGIN;

ALTER TABLE invoice_lines
  ADD COLUMN transaction_type text;

COMMENT ON COLUMN invoice_lines.transaction_type IS
  'QBO routing key, set at insert time from origin record (sales.product_type). References qbo_account_mapping.transaction_type. Editable via invoice-line form for overrides. Will be NOT NULL after backfill migration completes.';

CREATE INDEX invoice_lines_transaction_type_idx
  ON invoice_lines (transaction_type)
  WHERE transaction_type IS NOT NULL;

COMMIT;
