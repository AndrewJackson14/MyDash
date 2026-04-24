-- Phase 1 of MyDash Circulation Workflow (spec v1.1 §3.4).
-- Magic-link / PIN session store for non-staff drivers. Separate
-- from Supabase Auth / team_members. The driver-auth Edge Function
-- inserts here on SMS issue, reads + updates on PIN verify, and
-- signs a driver JWT with Supabase's ambient SUPABASE_JWT_SECRET
-- once pin_hash matches.
--
-- 5 wrong PIN attempts auto-locks the session; Cami re-issues a
-- fresh magic_link via the Drivers tab.
CREATE TABLE driver_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  magic_token TEXT NOT NULL UNIQUE, -- the URL token
  pin_hash TEXT NOT NULL, -- bcrypt of 6-digit PIN
  pin_attempts INT NOT NULL DEFAULT 0,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL, -- 8 hours from issue
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_driver_sessions_token ON driver_sessions(magic_token);
CREATE INDEX idx_driver_sessions_driver ON driver_sessions(driver_id, expires_at);
