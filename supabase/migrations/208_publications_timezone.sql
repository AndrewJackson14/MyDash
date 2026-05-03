-- ============================================================
-- 208_publications_timezone.sql
--
-- Adds publications.timezone — IANA zone name (e.g. America/Los_Angeles).
-- Used by the editorial publish-scheduler picker so an editor in any
-- region (e.g. New York) sees and picks times in the publication's
-- home timezone, not their browser TZ. Stored values stay UTC; this
-- column only governs how the picker presents them.
--
-- Default America/Los_Angeles matches the current portfolio (Malibu
-- Times, Paso Robles Press, Atascadero News). Override per-publication
-- as new papers are onboarded.
-- ============================================================

ALTER TABLE public.publications
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Los_Angeles';

COMMENT ON COLUMN public.publications.timezone IS
  'IANA timezone name for editorial scheduling. Picker UI displays scheduled_at values in this zone regardless of browser locale.';
