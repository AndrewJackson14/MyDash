-- Phase 1 of MyDash Circulation Workflow (spec v1.1 §3.5).
-- Lightweight scoped chat between a driver and the office during a
-- route. NOT a general messaging system — rows are always tied to
-- a driver_id (thread) and optionally to a route_instance (context
-- strip in the office-side Messages tab).
CREATE TABLE driver_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  route_instance_id UUID REFERENCES route_instances(id) ON DELETE SET NULL,
  sender TEXT NOT NULL, -- 'driver' | 'office'
  sender_team_member_id UUID REFERENCES team_members(id),
  -- only set when sender='office'
  body TEXT NOT NULL,
  attachment_url TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_driver_messages_driver ON driver_messages(driver_id, created_at DESC);
CREATE INDEX idx_driver_messages_instance ON driver_messages(route_instance_id);
CREATE INDEX idx_driver_messages_unread_office
  ON driver_messages(read_at) WHERE sender='driver' AND read_at IS NULL;
