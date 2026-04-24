-- Phase 1 of MyDash Circulation Workflow (spec v1.1 §3.2).
-- Each scheduled execution of a driver_routes template becomes a
-- route_instance row. The template is the recipe; the instance is
-- the meal on a specific day with a specific driver and an issue.
--
-- Divergence from spec v1.1: issue_id + publication_id are TEXT,
-- not UUID, because issues.id and publications.id are text-typed
-- (legacy keys like "pub-mt-2026-04-24"). The spec's FK-typing is
-- wrong for the current schema; this migration matches reality.
CREATE TABLE route_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_template_id UUID NOT NULL REFERENCES driver_routes(id) ON DELETE CASCADE,
  issue_id TEXT REFERENCES issues(id),
  publication_id TEXT REFERENCES publications(id),
  driver_id UUID REFERENCES drivers(id),
  scheduled_for DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  -- scheduled | sms_sent | in_progress | complete | abandoned
  sms_sent_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_stops INT NOT NULL DEFAULT 0,
  completed_stops INT NOT NULL DEFAULT 0,
  skipped_stops INT NOT NULL DEFAULT 0,
  driver_pay_amount NUMERIC(10,2),
  driver_pay_status TEXT DEFAULT 'pending',
  -- pending | approved | paid
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_route_instances_driver ON route_instances(driver_id, status);
CREATE INDEX idx_route_instances_scheduled ON route_instances(scheduled_for, status);
CREATE INDEX idx_route_instances_template ON route_instances(route_template_id);
