-- ============================================================================
-- Migration 063: invoice_lines.transaction_type — SET NOT NULL + FK
-- ============================================================================
--
-- Step 3 of the 3-step safe NOT NULL sequence.
--
-- Deploy timing:
--   Apply AFTER migration 062 (backfill) is confirmed clean (its internal
--   sanity check errors if any NULLs remain). Can be same transaction or
--   deferred — doesn't matter as long as no new NULL rows get inserted.
--
-- WHY FK, NOT CHECK:
--   Earlier draft used a CHECK constraint listing the 7 valid transaction_type
--   values. That duplicated knowledge already held by qbo_account_mapping
--   (the source of truth). Adding a new invoice type would require both a
--   mapping INSERT and a schema migration. A FK eliminates the duplication
--   and keeps validity auto-consistent: add a row to qbo_account_mapping,
--   and invoice_lines can immediately reference it.
--
--   Trade-off: FK writes incur an index lookup per insert/update. At MyDash's
--   scale (hundreds of invoice lines/day) this is negligible.
--
--   BILL SIDE NOTE:
--   bills.category does NOT get an FK in this migration. bills.category is
--   already in use, holds values beyond just QBO-routing semantics (some
--   categories might be used for reporting that doesn't push to QBO), and
--   adding an FK there would be a larger scope change. If we want symmetry
--   later, it's an additive migration.
-- ============================================================================

BEGIN;

-- Step 3a: NOT NULL
ALTER TABLE invoice_lines
  ALTER COLUMN transaction_type SET NOT NULL;

-- Step 3b: FK to the mapping table (single source of truth for valid types)
--
-- ON UPDATE CASCADE so if a transaction_type string is ever corrected
-- (typo fix in the mapping table), referencing rows update automatically.
-- Transaction types are considered stable identifiers — renames should be
-- rare. See DECISIONS.md for guidance on deprecating vs renaming types.
--
-- ON DELETE RESTRICT — NEVER delete a mapping row that's in use. Set active=false
-- to retire a type without breaking historical invoice_lines references.
ALTER TABLE invoice_lines
  ADD CONSTRAINT invoice_lines_transaction_type_fk
  FOREIGN KEY (transaction_type)
  REFERENCES qbo_account_mapping (transaction_type)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

-- Note: the transaction_type index from migration 061 exists and serves as
-- the FK-side index. No additional index needed.

COMMIT;
