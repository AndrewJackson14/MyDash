-- ============================================================
-- Migration 092: media_assets variants (original + thumbnail)
--
-- Every story image now triples: a reduced main version (current
-- behavior), a thumbnail for grid/list UIs, and the untouched
-- original so designers can pull the full-res file for print.
-- All three live on Bunny; we just store the CDN URLs here.
-- ============================================================

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS original_url   text,
  ADD COLUMN IF NOT EXISTS thumbnail_url  text;

COMMENT ON COLUMN media_assets.original_url IS
  'Bunny URL for the untouched (or 8 MB-capped) original upload. Used for the Download Originals action in Story Editor. Null for pre-092 assets.';
COMMENT ON COLUMN media_assets.thumbnail_url IS
  '~400 px wide thumbnail served throughout MyDash grid UIs. Null for pre-092 assets (fall back to cdn_url).';

NOTIFY pgrst, 'reload schema';
