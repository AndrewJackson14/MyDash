-- ============================================================
-- 189_add_support_admin_role.sql
--
-- Adds 'Support Admin' to the team_role enum and updates the
-- is_publisher_or_admin RLS helper (introduced in mig 186) so
-- Support Admins can read/write people rows alongside Publishers
-- and Office Administrators.
--
-- Applied as two separate transactions: Postgres requires the new
-- enum literal to be committed before it can appear in a function
-- body, so the ALTER TYPE and the CREATE OR REPLACE FUNCTION can't
-- share a transaction. Both steps were applied via supabase MCP.
--
-- Background: team_role was consolidated to 8 values in mig 178
-- (Publisher, Salesperson, Stringer, Ad Designer, Layout Designer,
-- Content Editor, Office Administrator, Bot). Many JS-side TEAM_ROLES
-- entries don't exist in the enum (Editor-in-Chief, Managing Editor,
-- etc.) — that's a separate drift; not addressed here.
-- ============================================================

-- Step 1: add the enum value (run in its own transaction).
ALTER TYPE team_role ADD VALUE IF NOT EXISTS 'Support Admin';

-- Step 2: update the RLS helper (run in a separate transaction so
-- the new enum literal is visible to the function body).
CREATE OR REPLACE FUNCTION public.is_publisher_or_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM people
    WHERE auth_id = auth.uid()
      AND (
        global_role = 'super_admin'
        OR role IN (
          'Publisher'::team_role,
          'Office Administrator'::team_role,
          'Support Admin'::team_role
        )
      )
  );
$$;
