-- ============================================================
-- stories.legacy_url
--
-- Durable cross-reference from each MyDash story to its original URL
-- on the legacy WordPress site it was migrated from. Populated by
-- scripts/audit-legacy-migration.mjs (with --apply) and used downstream
-- for 301 redirect mapping so bookmarked / indexed legacy URLs resolve
-- to the live StellarPress article.
--
-- Nullable — not every story is a migration. Unique partial index so
-- two stories can't claim the same legacy URL (indexes are smaller
-- when the column is mostly null).
-- ============================================================

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS legacy_url text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stories_legacy_url_unique
  ON stories(legacy_url)
  WHERE legacy_url IS NOT NULL;

COMMENT ON COLUMN stories.legacy_url IS
  'Canonical URL on the pre-migration WordPress site (e.g. https://pasoroblespress.com/news/slug/). Populated by scripts/audit-legacy-migration.mjs --apply. Used to drive 301 redirects.';
