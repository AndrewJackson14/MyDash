-- ============================================================================
-- Migration 060: Rename bills.category 'other' → 'other_expense'
-- ============================================================================
--
-- CRITICAL: This migration performs a DATA UPDATE on the bills table. It is
-- not just a value-list change. bills.category is plain text (no enum type),
-- so existing rows with category='other' are literal strings that must be
-- updated. BillsTab.jsx CATEGORIES value change alone is NOT sufficient.
--
-- Context:
--   qbo_account_mapping.transaction_type has a UNIQUE constraint. The bill
--   side previously used 'other' (in BillsTab.jsx CATEGORY_QB_ACCOUNT and in
--   bills.category column values). The invoice side also needs a catch-all.
--   To avoid collision, bills' 'other' is renamed to 'other_expense' and the
--   invoice side uses 'other_income'.
--
-- Scope:
--   - Updates existing bills.category rows in place
--   - Includes a sanity check that fails the migration if any stragglers remain
--   - Does NOT modify BillsTab.jsx — that's a code change deployed alongside
--   - Does NOT add a CHECK constraint on bills.category (existing state is
--     free text; adding a constraint is out of scope for this migration)
--
-- Rollback:
--   UPDATE bills SET category = 'other' WHERE category = 'other_expense';
-- ============================================================================

BEGIN;

-- Rename existing data
UPDATE bills
SET category = 'other_expense'
WHERE category = 'other';

-- Sanity check: no stragglers (should be 0)
DO $$
DECLARE
  remaining_count int;
BEGIN
  SELECT COUNT(*) INTO remaining_count FROM bills WHERE category = 'other';
  IF remaining_count > 0 THEN
    RAISE EXCEPTION 'Migration incomplete: % bills still have category=other', remaining_count;
  END IF;
END $$;

COMMIT;
