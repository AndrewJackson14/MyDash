-- ============================================================
-- 012: Add alert_preferences JSONB column to team_members
-- Stores per-member notification preferences keyed by event type
-- Values: "off", "in_app", "email", "both"
-- ============================================================

alter table team_members add column if not exists alert_preferences jsonb default '{}';
