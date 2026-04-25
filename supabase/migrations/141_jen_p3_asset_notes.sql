-- 141_jen_p3_asset_notes.sql
-- P3.33 — Asset annotations: short, single-line note per media asset
-- so designers can leave context ("hi-res logo, use this one", "client
-- approved 4/22", etc.) that surfaces as a tooltip in AssetPanel.
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS notes TEXT;
