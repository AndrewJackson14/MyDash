-- 137_jen_p2_revision_writeoff.sql
--
-- P2.24: Cami needs to "write off" pending revision charges
-- (goodwill, dispute, etc) without billing them. Separate flag
-- from revision_charges_billed so the distinction between
-- "charged the customer" vs "decided not to" stays explicit in
-- the audit trail. The widget on Bills > Overview reads:
--
--   status = 'signed_off'
--   AND revision_charges > 0
--   AND revision_charges_billed = false
--   AND revision_charges_written_off = false
--
-- so a write-off (which sets both flags) drops out of the widget
-- and also won't be re-billed by the next press-send (which
-- already gates on revision_charges_billed).

ALTER TABLE ad_projects
  ADD COLUMN IF NOT EXISTS revision_charges_written_off boolean NOT NULL DEFAULT false;
