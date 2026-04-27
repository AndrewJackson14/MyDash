-- ============================================================
-- Migration 164 — publications.has_social toggle
--
-- Mirrors the existing has_website pattern (migration 009). Drives
-- two UI gates:
--   • Publications rate modal: SocialAccountsSection only renders
--     when has_social = true (and publication is not dormant)
--   • SocialComposer publication picker: only lists pubs where
--     has_social = true, so the composer doesn't show pubs that
--     have no social presence to post to
--
-- Existing pubs default to false — Andrew flips on the ones that
-- actually have social accounts to manage. Idempotent so re-runs
-- don't error.
-- ============================================================

ALTER TABLE public.publications
  ADD COLUMN IF NOT EXISTS has_social boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
