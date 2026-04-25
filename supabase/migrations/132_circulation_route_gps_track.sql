-- Phase 7 prep: continuous GPS tracking through a route_instance.
-- Per Andrew's Q3 decision: snapshot one ping every ~30 seconds while
-- the driver is on a route, so the Complete screen can render the
-- actual driving path and the office detail drawer can show
-- where-they-are-now during in-progress runs.
--
-- Volume math: 28 stops × 5 min average = ~2.5h per run; one ping
-- every 30s = ~300 rows/run. 15 drivers × 4 runs/week × 4 weeks =
-- ~72k rows/month. Tiny. Index on (route_instance_id, recorded_at)
-- for the path-replay query.

CREATE TABLE route_gps_track (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_instance_id UUID NOT NULL REFERENCES route_instances(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id),
  lat NUMERIC(10,7) NOT NULL,
  lng NUMERIC(10,7) NOT NULL,
  accuracy_m NUMERIC(6,2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_route_gps_track_instance ON route_gps_track(route_instance_id, recorded_at);
CREATE INDEX idx_route_gps_track_driver ON route_gps_track(driver_id, recorded_at DESC);

ALTER TABLE route_gps_track ENABLE ROW LEVEL SECURITY;

-- Driver writes own GPS pings while their JWT carries the matching driver_id.
CREATE POLICY driver_insert_own_gps ON route_gps_track
FOR INSERT TO authenticated
WITH CHECK (driver_id::text = current_setting('request.jwt.claims', true)::json->>'driver_id');

-- Driver can read their own track (Complete screen).
CREATE POLICY driver_read_own_gps ON route_gps_track
FOR SELECT TO authenticated
USING (driver_id::text = current_setting('request.jwt.claims', true)::json->>'driver_id');

-- Office reads all tracks (route detail drawer path-replay).
CREATE POLICY office_read_all_gps ON route_gps_track
FOR SELECT TO authenticated
USING (auth.uid() IN (SELECT auth_id FROM team_members WHERE is_active));
