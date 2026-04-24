-- Phase 1 of MyDash Circulation Workflow (spec v1.1 §3.7, with patches).
--
-- Divergences from spec v1.1 §3.7:
-- 1. `drivers.active` skipped — existing `drivers.is_active` already
--    fills that role (same semantic); adding `active` would duplicate.
-- 2. `route_stops.stop_order` added per spec; the existing `sort_order`
--    column stays in place and is backfilled into stop_order so nothing
--    is orphaned. The new Circulation UI writes to stop_order; any
--    remaining reads of sort_order still see the original data.
-- 3. Three fields added to `driver_routes` that spec §6.7 and §7.1
--    reference but §3.7 forgets: publication_id (TEXT to match the
--    existing publications key), default_driver_id, and flat_fee
--    (used by the pay trigger at route completion).

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS sms_phone TEXT, -- E.164 format; required for SMS magic-link
  ADD COLUMN IF NOT EXISTS sms_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_route_completed_at TIMESTAMPTZ;

ALTER TABLE route_stops
  ADD COLUMN IF NOT EXISTS expected_qty INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stop_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS access_notes TEXT;

-- Backfill stop_order from legacy sort_order so existing template rows
-- have real values (new inserts will write stop_order directly).
UPDATE route_stops SET stop_order = sort_order WHERE stop_order = 0 AND sort_order IS NOT NULL;

ALTER TABLE driver_routes
  ADD COLUMN IF NOT EXISTS publication_id TEXT REFERENCES publications(id),
  ADD COLUMN IF NOT EXISTS default_driver_id UUID REFERENCES drivers(id),
  ADD COLUMN IF NOT EXISTS flat_fee NUMERIC(10,2);

CREATE INDEX IF NOT EXISTS idx_route_stops_order
  ON route_stops(route_id, stop_order);
