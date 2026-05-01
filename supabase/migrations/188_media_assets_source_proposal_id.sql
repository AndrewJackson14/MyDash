-- ============================================================
-- 188_media_assets_source_proposal_id.sql
--
-- Adds the missing column referenced by src/lib/media.js + the
-- proposal wizard's ReferenceAssetUploader. Without this, every
-- media upload failed with "Could not find the 'source_proposal_id'
-- column of 'media_assets' in the schema cache" — the column was
-- used in code but never made it into the schema.
--
-- ON DELETE SET NULL matches the pattern of story_id / ad_project_id
-- / legal_notice_id: deleting a proposal doesn't cascade-delete the
-- uploaded media; the upload just loses its lineage pointer.
-- ============================================================

BEGIN;

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS source_proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_media_assets_source_proposal
  ON media_assets(source_proposal_id) WHERE source_proposal_id IS NOT NULL;

COMMENT ON COLUMN media_assets.source_proposal_id IS
  'When a media asset was uploaded as a reference attachment during proposal creation, this references the proposal it was attached to. NULL otherwise.';

NOTIFY pgrst, 'reload schema';

COMMIT;
