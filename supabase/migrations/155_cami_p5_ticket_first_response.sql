-- Cami P5 — Service Desk SLA tracking
-- Adds first_response_at so we can show "needs first response" tickets
-- and measure response-time performance.

ALTER TABLE service_tickets
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tickets_first_response_at
  ON service_tickets(first_response_at);
