-- ============================================================
-- Migration 108 — Supabase Advisor criticals: RLS on archive
-- tables, drop SECURITY DEFINER on goal/revenue views, policies
-- on RLS-on-no-policy tables.
--
-- Source: get_advisors output 2026-04-23 — 22 ERROR-level + 3 INFO.
-- The 75 "rls_policy_always_true" + 69 "function_search_path_mutable"
-- WARN-level lints need per-row review; search_path handled in 108b.
-- ============================================================

-- 1. Lock down archive tables ------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    '_nl_invs',
    'calendar_events_archive_20260419b',
    'clients_archive_20260419',
    'contract_lines_archive_20260419b',
    'invoice_lines_archive_20260419',
    'invoice_lines_archive_20260419b',
    'invoices_archive_20260419',
    'issues_archive_20260419b',
    'payments_archive_20260419',
    'proposal_lines_archive_20260419b',
    'publications_archive_20260419b',
    'sales_archive_20260419',
    'sales_archive_20260419b',
    'web_ad_rates_archive_20260419'
  ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated, anon', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_admin_select ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_admin_select ON public.%I FOR SELECT TO authenticated USING (has_permission(''admin''))',
      t, t
    );
  END LOOP;
END $$;

-- 2. Strip SECURITY DEFINER from goal + revenue views ------------
ALTER VIEW public.company_annual_goals          SET (security_invoker = true);
ALTER VIEW public.company_monthly_goals         SET (security_invoker = true);
ALTER VIEW public.publication_annual_goals      SET (security_invoker = true);
ALTER VIEW public.publication_monthly_goals     SET (security_invoker = true);
ALTER VIEW public.publication_monthly_revenue   SET (security_invoker = true);
ALTER VIEW public.salesperson_annual_goals      SET (security_invoker = true);
ALTER VIEW public.salesperson_monthly_goals     SET (security_invoker = true);
ALTER VIEW public.salesperson_monthly_revenue   SET (security_invoker = true);

-- 3. Policies on RLS-on-no-policy tables --------------------------
ALTER TABLE public.ad_projects_archive_20260413_2 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ad_projects_archive_20260413_2_admin ON public.ad_projects_archive_20260413_2;
CREATE POLICY ad_projects_archive_20260413_2_admin
  ON public.ad_projects_archive_20260413_2
  FOR SELECT TO authenticated
  USING (has_permission('admin'));

DROP POLICY IF EXISTS gmail_maintenance_log_admin ON public.gmail_maintenance_log;
CREATE POLICY gmail_maintenance_log_admin
  ON public.gmail_maintenance_log
  FOR ALL TO authenticated
  USING (has_permission('admin'))
  WITH CHECK (has_permission('admin'));

DROP POLICY IF EXISTS gmail_maintenance_preferences_admin ON public.gmail_maintenance_preferences;
CREATE POLICY gmail_maintenance_preferences_admin
  ON public.gmail_maintenance_preferences
  FOR ALL TO authenticated
  USING (has_permission('admin'))
  WITH CHECK (has_permission('admin'));
