-- 020_team_members_columns.sql
-- Formalize columns that exist in DB but had no migration file
-- These were added directly in Supabase and are actively used in code

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS module_permissions text[] DEFAULT '{}';
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS commission_trigger text DEFAULT 'both';
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS commission_default_rate numeric(5,2) DEFAULT 20;

NOTIFY pgrst, 'reload schema';
