-- Phase 1 of MyDash Circulation Workflow (spec v1.1 §3.1).
-- Adds the fields the CSV import + geocoder + driver-added flow rely on.
-- Existing drop_locations rows keep their data; new columns default so
-- reads stay backwards compatible with the current Circulation UI.
ALTER TABLE drop_locations
  ADD COLUMN IF NOT EXISTS lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS lng NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS geocode_status TEXT DEFAULT 'pending',
  -- pending | success | failed | manual
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'office',
  -- office | csv-import | driver-added
  ADD COLUMN IF NOT EXISTS created_by_driver_id UUID,
  ADD COLUMN IF NOT EXISTS access_notes TEXT,
  -- "Behind counter, ask for Maria"
  ADD COLUMN IF NOT EXISTS rack_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS preferred_delivery_window TEXT;
  -- "Mornings before 10am"

CREATE INDEX IF NOT EXISTS idx_drop_locations_geo ON drop_locations(lat, lng);
CREATE INDEX IF NOT EXISTS idx_drop_locations_source ON drop_locations(source);
