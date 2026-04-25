-- 138_jen_p2_publication_branding.sql
--
-- P2.26: per-publication branding on the public ProofApproval page.
-- The page currently hard-codes "13 Stars Media Group" + a single
-- accent color for every proof. publications.logo_url already
-- exists; add primary_color so the proof page can swap accent +
-- button color per pub instead of the navy default.
ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS primary_color text;
