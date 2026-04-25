-- Multi-publication route support.
-- Per Andrew's call (option A): one route may deliver multiple pubs on
-- the same run. Cami's PRP-Downtown route drops PRP + AN + SYV at the
-- same Wednesday morning stops — one driver, one truck, one instance.
--
-- Data model:
--   - driver_route_pubs is a many-to-many join: (route_id, publication_id)
--   - is_primary flag on one row per route sets which pub owns the cron
--     dedup anchor and the "primary" label in UI
--   - driver_routes.publication_id stays (nullable-in-spirit) as the
--     backwards-compat primary; backfilled from existing routes, then
--     kept in sync by a trigger so older readers don't break
--
-- Cron side of the refactor lives in the route-instance-cron Edge
-- Function update — see the adjacent commit.

CREATE TABLE IF NOT EXISTS driver_route_pubs (
  route_id UUID NOT NULL REFERENCES driver_routes(id) ON DELETE CASCADE,
  publication_id TEXT NOT NULL REFERENCES publications(id),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (route_id, publication_id)
);

CREATE INDEX IF NOT EXISTS idx_driver_route_pubs_pub ON driver_route_pubs(publication_id);

-- ── Backfill from existing routes ────────────────────────────────
INSERT INTO driver_route_pubs (route_id, publication_id, is_primary)
SELECT id, publication_id, true
FROM driver_routes
WHERE publication_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Only one primary per route.
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_route_pubs_one_primary
  ON driver_route_pubs(route_id) WHERE is_primary;

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE driver_route_pubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY office_all_driver_route_pubs ON driver_route_pubs
FOR ALL TO authenticated
USING (auth.uid() IN (SELECT auth_id FROM team_members WHERE is_active));

-- Drivers can read the pub set for their active routes (needed to
-- render per-pub qty on mobile).
CREATE POLICY driver_read_own_route_pubs ON driver_route_pubs
FOR SELECT TO authenticated
USING (route_id IN (
  SELECT route_template_id FROM route_instances
  WHERE driver_id::text = current_setting('request.jwt.claims', true)::json->>'driver_id'
    AND status IN ('scheduled','sms_sent','in_progress')
));

-- ── Trigger: keep driver_routes.publication_id synced to primary ──
-- Legacy readers (loadCirculation in useAppData, existing UI that
-- only knows about the single column) see consistent data. Future
-- readers should join driver_route_pubs directly for the full set.
CREATE OR REPLACE FUNCTION sync_driver_routes_primary_pub() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.is_primary THEN
    -- Unset any other primary on this route.
    UPDATE driver_route_pubs SET is_primary = false
    WHERE route_id = NEW.route_id AND publication_id <> NEW.publication_id AND is_primary;
    -- Reflect the new primary onto the legacy column.
    UPDATE driver_routes SET publication_id = NEW.publication_id
    WHERE id = NEW.route_id;
  END IF;
  IF TG_OP = 'DELETE' AND OLD.is_primary THEN
    -- If the deleted row was primary, promote another (if any) or null.
    UPDATE driver_route_pubs SET is_primary = true
    WHERE route_id = OLD.route_id AND publication_id = (
      SELECT publication_id FROM driver_route_pubs
      WHERE route_id = OLD.route_id LIMIT 1
    );
    UPDATE driver_routes SET publication_id = (
      SELECT publication_id FROM driver_route_pubs WHERE route_id = OLD.route_id AND is_primary LIMIT 1
    )
    WHERE id = OLD.route_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_driver_route_pubs_sync ON driver_route_pubs;
CREATE TRIGGER trg_driver_route_pubs_sync
AFTER INSERT OR UPDATE OR DELETE ON driver_route_pubs
FOR EACH ROW EXECUTE FUNCTION sync_driver_routes_primary_pub();
