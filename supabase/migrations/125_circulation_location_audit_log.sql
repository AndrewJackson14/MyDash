-- Phase 1 of MyDash Circulation Workflow (spec v1.1 §3.6).
-- Every change to drop_locations, route_stops, or route_template
-- ordering writes here. Required because both office and driver
-- can edit the same records (driver re-sorts during a route,
-- office edits templates); we need a clear paper trail to diagnose
-- disputes and to show history in the Route Detail audit drawer.
CREATE TABLE location_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- 'drop_location' | 'route_stop' | 'route_template'
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  -- created | updated | reordered | deleted | reactivated
  actor_type TEXT NOT NULL, -- 'office' | 'driver' | 'system'
  actor_team_member_id UUID REFERENCES team_members(id),
  actor_driver_id UUID REFERENCES drivers(id),
  field_changes JSONB, -- {"qty": {"from": 25, "to": 30}}
  context JSONB, -- {"route_instance_id": "...", "reason": "..."}
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_entity ON location_audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_actor_driver ON location_audit_log(actor_driver_id, created_at DESC);
