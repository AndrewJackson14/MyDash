-- 170_activity_log_v2_foundation.sql
-- Phase 1 of the Daily Activity Log build (spec 2026-04-29).
--
-- Approach (c) per Andrew: keep production column names (type, actor_id,
-- client_id, created_at), add the spec's new columns alongside, log_activity
-- RPC bridges old/new naming. Eventual rename happens once direct INSERTs
-- are fully retrofitted.
--
-- This migration ADDS columns and tables only; it does NOT tighten the
-- activity_log insert policy. ~15 direct INSERTs across the codebase still
-- need to be swept to call log_activity() — that's a follow-up commit.

-- ────────────────────────────────────────────────────────────────────
-- 1. activity_log — additive columns from spec
-- ────────────────────────────────────────────────────────────────────
-- Existing schema (from migration 001 + drift + 169):
--   id, type, client_id, client_name, sale_id, detail, actor_id,
--   actor_name, created_at, entity_table, entity_id, summary, metadata,
--   publication_id
-- Adding: event_category, event_source, actor_role, entity_summary,
--         related_user_id, visibility

ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS event_category    text NOT NULL DEFAULT 'transition',
  ADD COLUMN IF NOT EXISTS event_source      text NOT NULL DEFAULT 'mydash',
  ADD COLUMN IF NOT EXISTS actor_role        text,
  ADD COLUMN IF NOT EXISTS entity_summary    text,
  ADD COLUMN IF NOT EXISTS related_user_id   uuid REFERENCES team_members(id),
  ADD COLUMN IF NOT EXISTS visibility        text NOT NULL DEFAULT 'team';

CREATE INDEX IF NOT EXISTS idx_activity_log_role
  ON activity_log(actor_role, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_visibility
  ON activity_log(visibility);

COMMENT ON COLUMN activity_log.event_category IS
  'effort | outcome | transition | comment | manual_log | journal — drives Hayley''s stream filter (effort excluded).';
COMMENT ON COLUMN activity_log.event_source IS
  'mydash | gmail | calendar | manual | system — provenance of the event.';
COMMENT ON COLUMN activity_log.actor_role IS
  'Denormalized actor role (publisher, sales-rep, ad-designer, etc.) for fast role-scoped filtering.';
COMMENT ON COLUMN activity_log.entity_summary IS
  'Human-readable description of the entity (e.g. "Templeton Vineyards proposal", "Council approves housing plan").';
COMMENT ON COLUMN activity_log.related_user_id IS
  'Other team member referenced by the event (e.g. Cami helped Dana → related_user_id = Dana).';
COMMENT ON COLUMN activity_log.visibility IS
  'team | private — Support Admin journal lives in its own table; all activity_log rows default team-visible.';

-- ────────────────────────────────────────────────────────────────────
-- 2. support_admin_journal — private daily journal for Support Admin
-- ────────────────────────────────────────────────────────────────────
-- Separate table per spec — different schema, different RLS posture.
-- One row per user per day (unique constraint). Auto-save throughout
-- the day = same row.
CREATE TABLE IF NOT EXISTS support_admin_journal (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  entry_date  date NOT NULL,
  shipped     text,
  decisions   text,
  blocked     text,
  next        text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_support_journal_user_date
  ON support_admin_journal(user_id, entry_date DESC);

ALTER TABLE support_admin_journal ENABLE ROW LEVEL SECURITY;

-- Self-only access. Even Hayley/admins do not see Support Admin entries.
CREATE POLICY "support_journal_self_select" ON support_admin_journal
  FOR SELECT USING (
    user_id = (SELECT id FROM team_members WHERE auth_id = auth.uid() LIMIT 1)
  );
CREATE POLICY "support_journal_self_insert" ON support_admin_journal
  FOR INSERT WITH CHECK (
    user_id = (SELECT id FROM team_members WHERE auth_id = auth.uid() LIMIT 1)
  );
CREATE POLICY "support_journal_self_update" ON support_admin_journal
  FOR UPDATE USING (
    user_id = (SELECT id FROM team_members WHERE auth_id = auth.uid() LIMIT 1)
  );

-- updated_at auto-bump trigger
CREATE OR REPLACE FUNCTION public.tg_support_journal_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_journal_touch ON support_admin_journal;
CREATE TRIGGER support_journal_touch
  BEFORE UPDATE ON support_admin_journal
  FOR EACH ROW EXECUTE FUNCTION public.tg_support_journal_touch_updated_at();

COMMENT ON TABLE support_admin_journal IS
  'Private daily journal — Support Admin only. NOT visible to other roles or admins. Replaces an activity_log row for this role.';

-- ────────────────────────────────────────────────────────────────────
-- 3. activity_targets — configurable per-role goals
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_targets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role            text NOT NULL,                                -- 'sales-rep', 'ad-designer', etc.
  target_type     text NOT NULL,                                -- daily_count | pipeline_dollars | queue_pacing_curve | weekly_cycle
  metric_name     text NOT NULL,                                -- phone_calls, proposals_sent, queue_completion_pct, ...
  target_value    numeric,                                      -- count or dollar target
  curve_config    jsonb,                                        -- pacing curve (designers): {"7":0.30, "5":0.50, "3":0.75, "1":1.00}
  active          boolean NOT NULL DEFAULT true,
  effective_from  date NOT NULL DEFAULT current_date,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_targets_role
  ON activity_targets(role, active);

ALTER TABLE activity_targets ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read targets (drives their own dashboard).
CREATE POLICY "activity_targets_read" ON activity_targets
  FOR SELECT USING (true);

-- Only Publisher (Hayley) can write targets. Spec calls for an admin UI
-- in Phase 6 — until then, targets are seeded by this migration.
CREATE POLICY "activity_targets_publisher_write" ON activity_targets
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM team_members
       WHERE auth_id = auth.uid()
         AND role = 'Publisher'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members
       WHERE auth_id = auth.uid()
         AND role = 'Publisher'
    )
  );

DROP TRIGGER IF EXISTS activity_targets_touch ON activity_targets;
CREATE OR REPLACE FUNCTION public.tg_activity_targets_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER activity_targets_touch
  BEFORE UPDATE ON activity_targets
  FOR EACH ROW EXECUTE FUNCTION public.tg_activity_targets_touch_updated_at();

COMMENT ON TABLE activity_targets IS
  'Per-role daily/weekly/curve targets. Hayley edits via admin UI (Phase 6); seeded with placeholder values.';

-- ────────────────────────────────────────────────────────────────────
-- 4. log_activity RPC — replace v1 with wider signature
-- ────────────────────────────────────────────────────────────────────
-- v1 (mig 169) accepted: event_type, summary, entity_table, entity_id,
-- publication_id, client_id, client_name, metadata.
-- v2 adds: event_category, event_source, entity_summary, related_user_id,
-- visibility, detail. Existing v1 callers (none in the codebase yet
-- since the sweep hasn't run) would need updating; we DROP and recreate
-- because PostgreSQL treats different argument lists as overloads.
DROP FUNCTION IF EXISTS public.log_activity(text, text, text, uuid, text, uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.log_activity(
  p_event_type        text,
  p_summary           text,
  p_event_category    text DEFAULT 'transition',
  p_event_source      text DEFAULT 'mydash',
  p_entity_table      text DEFAULT NULL,
  p_entity_id         uuid DEFAULT NULL,
  p_entity_summary    text DEFAULT NULL,
  p_publication_id    text DEFAULT NULL,
  p_client_id         uuid DEFAULT NULL,
  p_client_name       text DEFAULT NULL,
  p_related_user_id   uuid DEFAULT NULL,
  p_metadata          jsonb DEFAULT NULL,
  p_visibility        text DEFAULT 'team',
  p_detail            text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id   uuid;
  v_actor_name text;
  v_actor_role text;
  v_id         uuid;
BEGIN
  SELECT id, name, role
    INTO v_actor_id, v_actor_name, v_actor_role
    FROM team_members
   WHERE auth_id = auth.uid()
   LIMIT 1;

  -- Map spec role labels (sales-rep, ad-designer, ...) to MyDash
  -- TEAM_ROLES enum (Salesperson, Ad Designer, ...). Caller can override
  -- by passing the kebab via metadata, but the canonical actor_role
  -- column carries the spec slug for dashboard filtering.
  INSERT INTO activity_log (
    type, summary, detail,
    event_category, event_source,
    actor_id, actor_name, actor_role,
    client_id, client_name,
    entity_table, entity_id, entity_summary,
    publication_id, related_user_id,
    metadata, visibility
  )
  VALUES (
    p_event_type, p_summary, COALESCE(p_detail, p_summary),
    p_event_category, p_event_source,
    v_actor_id, v_actor_name,
    -- Convert TEAM_ROLES label to spec slug.
    CASE v_actor_role
      WHEN 'Publisher'           THEN 'publisher'
      WHEN 'Editor-in-Chief'     THEN 'editor-in-chief'
      WHEN 'Salesperson'         THEN 'sales-rep'
      WHEN 'Sales Manager'       THEN 'sales-rep'
      WHEN 'Ad Designer'         THEN 'ad-designer'
      WHEN 'Layout Designer'     THEN 'layout-designer'
      WHEN 'Production Manager'  THEN 'layout-designer'
      WHEN 'Content Editor'      THEN 'content-editor'
      WHEN 'Managing Editor'     THEN 'content-editor'
      WHEN 'Office Administrator' THEN 'office-admin'
      WHEN 'Office Manager'      THEN 'office-admin'
      WHEN 'Finance'             THEN 'office-admin'
      ELSE NULL
    END,
    p_client_id, p_client_name,
    p_entity_table, p_entity_id, p_entity_summary,
    p_publication_id, p_related_user_id,
    p_metadata, p_visibility
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_activity(
  text, text, text, text, text, uuid, text, text, uuid, text, uuid, jsonb, text, text
) TO authenticated;

COMMENT ON FUNCTION public.log_activity IS
  'v2: writes activity_log with the spec-wide schema. Stamps actor_id, actor_name, and actor_role from auth.uid().';

-- ────────────────────────────────────────────────────────────────────
-- 5. Seed activity_targets placeholders (per spec Section 1-5)
-- ────────────────────────────────────────────────────────────────────
-- Hayley overrides via Phase 6 admin UI. Inserted only on fresh
-- migration — re-running won't duplicate (UNIQUE-style guard via
-- WHERE NOT EXISTS).

INSERT INTO activity_targets (role, target_type, metric_name, target_value, notes)
SELECT * FROM (VALUES
  ('sales-rep',       'daily_count',     'phone_calls',          15::numeric,  'placeholder — Hayley to tune'),
  ('sales-rep',       'daily_count',     'emails_sent',          20::numeric,  'placeholder'),
  ('sales-rep',       'daily_count',     'meetings_held',         2::numeric,  'placeholder'),
  ('sales-rep',       'daily_count',     'proposals_sent',        1::numeric,  'placeholder'),
  ('sales-rep',       'pipeline_dollars','pipeline_value_added',1500::numeric, 'placeholder'),
  ('content-editor',  'daily_count',     'stories_edited',        5::numeric,  'placeholder'),
  ('content-editor',  'daily_count',     'stories_published',     3::numeric,  'placeholder'),
  ('office-admin',    'weekly_cycle',    'invoices_issued_within_24h_of_issue_close', 95::numeric, 'percentage target'),
  ('office-admin',    'weekly_cycle',    'ar_followups_completed', 10::numeric, 'placeholder'),
  ('office-admin',    'weekly_cycle',    'subscriptions_processed', 5::numeric, 'placeholder')
) AS seed(role, target_type, metric_name, target_value, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM activity_targets t
  WHERE t.role = seed.role AND t.metric_name = seed.metric_name
);

INSERT INTO activity_targets (role, target_type, metric_name, curve_config, notes)
SELECT * FROM (VALUES
  ('ad-designer',     'queue_pacing_curve', 'queue_completion_pct',
    '{"7":0.30,"5":0.50,"3":0.75,"1":1.00}'::jsonb,
    'queue completion = ad_projects in signed_off or placed status / total assigned'),
  ('layout-designer', 'queue_pacing_curve', 'queue_completion_pct',
    '{"7":0.30,"5":0.50,"3":0.75,"1":1.00}'::jsonb,
    'queue completion = flatplan_page_status with completed_at IS NOT NULL / issues.page_count')
) AS seed(role, target_type, metric_name, curve_config, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM activity_targets t
  WHERE t.role = seed.role AND t.metric_name = seed.metric_name
);
