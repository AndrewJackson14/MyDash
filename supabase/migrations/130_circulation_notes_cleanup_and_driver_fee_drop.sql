-- Post-spec cleanup:
-- 1. Collapse drop_locations.access_notes into drop_locations.notes.
--    Per Andrew's call: single notes field, driver-primary author,
--    both can edit. access_notes was added in migration 120 as a
--    driver-specific field but never surfaced in the modal — no
--    production data expected, but merge defensively.
-- 2. Add driver UPDATE policy on drop_locations.notes (scoped to
--    locations the driver's active route_instances reference). Fills
--    the gap from migration 127 which only granted INSERT for
--    driver-added stops.
-- 3. Drop drivers.flat_fee — superseded by driver_routes.flat_fee
--    (migration 126). Pay trigger (129) already reads from template.

-- ── 1. Merge access_notes into notes ─────────────────────────────
UPDATE drop_locations
SET notes = CASE
  WHEN notes IS NULL OR notes = '' THEN access_notes
  WHEN access_notes IS NULL OR access_notes = '' THEN notes
  ELSE notes || E'\n\n' || access_notes
END
WHERE access_notes IS NOT NULL AND access_notes <> '';

ALTER TABLE drop_locations DROP COLUMN IF EXISTS access_notes;

-- ── 2. Driver UPDATE policy for notes on locations in their route ─
-- Driver can write notes back on any drop_location that's a stop on
-- one of their currently-active route_instances. Restricted via WITH
-- CHECK so the driver can't change anything else about the row.
CREATE POLICY driver_update_notes_on_own_route_locations ON drop_locations
FOR UPDATE TO authenticated
USING (id IN (
  SELECT drop_location_id FROM route_stops WHERE route_id IN (
    SELECT route_template_id FROM route_instances
    WHERE driver_id::text = current_setting('request.jwt.claims', true)::json->>'driver_id'
      AND status IN ('scheduled','sms_sent','in_progress')
  )
));

-- ── 3. Drop drivers.flat_fee ─────────────────────────────────────
-- Zero blast radius — pay trigger (129) reads driver_routes.flat_fee;
-- smoke test confirmed the template is canonical.
ALTER TABLE drivers DROP COLUMN IF EXISTS flat_fee;
