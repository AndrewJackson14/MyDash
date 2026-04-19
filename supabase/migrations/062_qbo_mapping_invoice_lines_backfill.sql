-- ============================================================================
-- Migration 062: Backfill invoice_lines.transaction_type
-- ============================================================================
--
-- Step 2 of the 3-step safe NOT NULL sequence.
--
-- Derivation rules (from sales.product_type enum):
--   display_print     → display_ad
--   web_ad            → web_ad
--   web_display       → web_ad
--   classified        → newspaper_svc_classified
--   legal_notice      → newspaper_svc_legal_notice
--   sponsored_content → sponsorship
--   newsletter_sponsor → sponsorship
--   eblast            → sponsorship
--   social_sponsor    → sponsorship
--   social_sponsored  → sponsorship
--   creative_service  → other_income (creative jobs are Stripe-prepay, not invoiced;
--                                     but if historical data has this enum, route to other)
--   (any other)       → other_income
--
-- Data expectation (live DB):
--   38,626 invoice_lines rows, 100% with sale_id, 100% of sales are 'display_print'.
--   After this UPDATE every invoice_lines row should have transaction_type='display_ad'.
--
-- The CASE handles every enum value even though only one is actually in use,
-- so future enum expansion is covered before NOT NULL flip.
-- ============================================================================

BEGIN;

UPDATE invoice_lines il
SET transaction_type = CASE s.product_type
  WHEN 'display_print'      THEN 'display_ad'
  WHEN 'web_ad'             THEN 'web_ad'
  WHEN 'web_display'        THEN 'web_ad'
  WHEN 'classified'         THEN 'newspaper_svc_classified'
  WHEN 'legal_notice'       THEN 'newspaper_svc_legal_notice'
  WHEN 'sponsored_content'  THEN 'sponsorship'
  WHEN 'newsletter_sponsor' THEN 'sponsorship'
  WHEN 'eblast'             THEN 'sponsorship'
  WHEN 'social_sponsor'     THEN 'sponsorship'
  WHEN 'social_sponsored'   THEN 'sponsorship'
  WHEN 'creative_service'   THEN 'other_income'
  ELSE 'other_income'
END
FROM sales s
WHERE il.sale_id = s.id AND il.transaction_type IS NULL;

-- Sanity check: zero rows remain null after backfill
DO $$
DECLARE
  unbackfilled int;
BEGIN
  SELECT COUNT(*) INTO unbackfilled FROM invoice_lines WHERE transaction_type IS NULL;
  IF unbackfilled > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % invoice_lines rows still NULL. Likely orphan lines with sale_id pointing to non-existent sales. Investigate before running NOT NULL migration.', unbackfilled;
  END IF;
END $$;

COMMIT;
