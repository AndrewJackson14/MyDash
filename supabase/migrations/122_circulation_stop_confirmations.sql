-- Phase 1 of MyDash Circulation Workflow (spec v1.1 §3.3).
-- One row per stop per route_instance. Captures everything the
-- driver records at a drop: delivered quantity, skip reason + note,
-- photo, GPS. This is the source of truth for the reconciliation
-- report and driver pay.
--
-- publication_id is TEXT (see migration 121 note).
CREATE TABLE stop_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_instance_id UUID NOT NULL REFERENCES route_instances(id) ON DELETE CASCADE,
  drop_location_id UUID NOT NULL REFERENCES drop_locations(id),
  publication_id TEXT REFERENCES publications(id),
  stop_order INT NOT NULL, -- 1, 2, 3... at moment of delivery
  expected_qty INT NOT NULL,
  delivered_qty INT,
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending | delivered | skipped | partial
  skip_reason TEXT,
  -- closed | refused | rack-full | not-found | unsafe | other
  notes TEXT,
  photo_url TEXT,
  gps_lat NUMERIC(10,7),
  gps_lng NUMERIC(10,7),
  gps_accuracy_m NUMERIC(6,2),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_stop_confirmations_instance ON stop_confirmations(route_instance_id);
CREATE INDEX idx_stop_confirmations_location ON stop_confirmations(drop_location_id);
CREATE INDEX idx_stop_confirmations_status ON stop_confirmations(status);
