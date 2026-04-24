-- Phase 1 of MyDash Circulation Workflow (spec v1.1 §3.8).
--
-- Two distinct policy sets:
--   - Office:  any authenticated team_member (is_active=true) can read
--              everything circulation-related and write within their
--              lane. Gate is `auth.uid() IN (SELECT auth_id FROM
--              team_members WHERE is_active)`.
--   - Driver:  no team_members row; JWT has a custom `driver_id`
--              claim set by the driver-auth Edge Function. Read/write
--              gates reference that claim via
--              current_setting('request.jwt.claims', true)::json->>'driver_id'.
--
-- Divergences from spec v1.1 §3.8 (corrected to real schema):
--   - `user_id` → `auth_id` on team_members
--   - `WHERE active` → `WHERE is_active` on team_members
--
-- CRITICAL: driver_id JWT claim is set by the driver-auth Edge Function
-- using Supabase's ambient SUPABASE_JWT_SECRET (HS256). Do NOT use a
-- separate DRIVER_JWT_SECRET — PostgREST verifies claims against the
-- project key and a different secret would 401 every driver call.

ALTER TABLE drop_locations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_routes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops        ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_instances    ENABLE ROW LEVEL SECURITY;
ALTER TABLE stop_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_audit_log ENABLE ROW LEVEL SECURITY;

-- ── OFFICE SIDE ───────────────────────────────────────────────────
-- Team-members can read + write every circulation table.

CREATE POLICY office_read_drop_locations ON drop_locations
  FOR SELECT TO authenticated
  USING (auth.uid() IN (SELECT auth_id FROM team_members WHERE is_active));

CREATE POLICY office_write_drop_locations ON drop_locations
  FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT auth_id FROM team_members WHERE is_active));

CREATE POLICY office_all_driver_routes ON driver_routes
  FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT auth_id FROM team_members WHERE is_active));

CREATE POLICY office_all_route_stops ON route_stops
  FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT auth_id FROM team_members WHERE is_active));

CREATE POLICY office_all_route_instances ON route_instances
  FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT auth_id FROM team_members WHERE is_active));

CREATE POLICY office_all_stop_confirmations ON stop_confirmations
  FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT auth_id FROM team_members WHERE is_active));

CREATE POLICY office_all_driver_messages ON driver_messages
  FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT auth_id FROM team_members WHERE is_active));

CREATE POLICY office_all_location_audit_log ON location_audit_log
  FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT auth_id FROM team_members WHERE is_active));

-- ── DRIVER SIDE ───────────────────────────────────────────────────
-- Driver JWTs have a custom `driver_id` claim but no team_members row.
-- These policies gate reads + writes to ONLY that driver's active
-- route_instances + related data.

CREATE POLICY driver_read_own_instances ON route_instances
  FOR SELECT TO authenticated
  USING (driver_id::text = current_setting('request.jwt.claims', true)::json->>'driver_id');

CREATE POLICY driver_update_own_instances ON route_instances
  FOR UPDATE TO authenticated
  USING (driver_id::text = current_setting('request.jwt.claims', true)::json->>'driver_id');

CREATE POLICY driver_write_own_confirmations ON stop_confirmations
  FOR ALL TO authenticated
  USING (route_instance_id IN (
    SELECT id FROM route_instances
    WHERE driver_id::text = current_setting('request.jwt.claims', true)::json->>'driver_id'
  ));

-- Drivers can read drop_locations only for stops on their active route.
CREATE POLICY driver_read_route_locations ON drop_locations
  FOR SELECT TO authenticated
  USING (id IN (
    SELECT drop_location_id FROM route_stops WHERE route_id IN (
      SELECT route_template_id FROM route_instances
      WHERE driver_id::text = current_setting('request.jwt.claims', true)::json->>'driver_id'
        AND status IN ('scheduled','sms_sent','in_progress')
    )
  ));

-- Drivers can INSERT new drop_locations (on-the-fly adds).
CREATE POLICY driver_insert_drop_locations ON drop_locations
  FOR INSERT TO authenticated
  WITH CHECK (
    source = 'driver-added' AND
    created_by_driver_id::text = current_setting('request.jwt.claims', true)::json->>'driver_id'
  );

-- Drivers can read route_stops for their active routes (to render the stop list).
CREATE POLICY driver_read_own_route_stops ON route_stops
  FOR SELECT TO authenticated
  USING (route_id IN (
    SELECT route_template_id FROM route_instances
    WHERE driver_id::text = current_setting('request.jwt.claims', true)::json->>'driver_id'
      AND status IN ('scheduled','sms_sent','in_progress')
  ));

-- Drivers can INSERT new route_stops only for their active route (add-stop flow).
CREATE POLICY driver_insert_own_route_stops ON route_stops
  FOR INSERT TO authenticated
  WITH CHECK (route_id IN (
    SELECT route_template_id FROM route_instances
    WHERE driver_id::text = current_setting('request.jwt.claims', true)::json->>'driver_id'
      AND status IN ('scheduled','sms_sent','in_progress')
  ));

-- Drivers can read/insert their own messages (office↔driver chat).
CREATE POLICY driver_messages_own ON driver_messages
  FOR ALL TO authenticated
  USING (driver_id::text = current_setting('request.jwt.claims', true)::json->>'driver_id');

-- Drivers can INSERT audit log entries tagging themselves as actor.
CREATE POLICY driver_insert_audit_log ON location_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_type = 'driver' AND
    actor_driver_id::text = current_setting('request.jwt.claims', true)::json->>'driver_id'
  );
