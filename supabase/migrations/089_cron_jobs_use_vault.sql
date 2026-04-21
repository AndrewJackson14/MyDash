-- ============================================================
-- Migration 089: Rewrite cron jobs to read secrets from Vault
--
-- Fixes a pre-existing bug that silently broke every cron job in
-- the project for months: migrations 031 and 077 used
-- current_setting('app.settings.supabase_url') and
-- current_setting('app.settings.service_role_key') without those
-- settings ever being applied at the database level (ALTER DATABASE
-- requires superuser, which hosted Supabase doesn't grant).
--
-- Result: scheduled-tasks-5min and delivery-reports-hourly have
-- been failing every run with "null value in column url" since
-- inception. Invoice dunning, subscription renewals, scheduled story
-- publishing, auto-charge payment plans, and delivery reports —
-- all dead.
--
-- Fix: move the secrets to Supabase Vault (service_role_key,
-- supabase_url). Rewrite all four cron jobs to read from
-- vault.decrypted_secrets inside a helper function.
--
-- Prerequisites applied out-of-band before this migration:
--   1. vault.create_secret(<service_role_key>, 'service_role_key')
--   2. vault.create_secret('https://hqywacyhpllapdwccmaw.supabase.co',
--                           'supabase_url')
-- Both confirmed present at time of writing.
--
-- The four cron jobs rewritten:
--   - scheduled-tasks-5min    (from migration 031)
--   - delivery-reports-hourly (from migration 077)
--   - signal-runner-daily     (from migration 088)
--   - signal-runner-weekly    (from migration 088)
-- ============================================================


-- ─── Helper: call an Edge Function from a cron job ─────
-- SECURITY DEFINER so it can read vault.decrypted_secrets regardless
-- of the calling role. STABLE is wrong here (performs writes via
-- net.http_post), so VOLATILE is correct.

CREATE OR REPLACE FUNCTION public.cron_invoke_edge_function(
  function_name text,
  body jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_url text;
  v_key text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_url';

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'Vault secrets supabase_url or service_role_key not found';
  END IF;

  SELECT net.http_post(
    url := v_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := body,
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
\$\$;

COMMENT ON FUNCTION public.cron_invoke_edge_function IS
  'Cron-job helper: invokes an Edge Function using secrets from Vault. Used by scheduled-tasks-5min, delivery-reports-hourly, signal-runner-daily, signal-runner-weekly. If Gemini or Edge Function URLs need to be called from other cron jobs in the future, use this.';

-- Lock it down: only the postgres role (cron worker) and
-- service_role should be able to invoke this. Authenticated users
-- should never be able to fire arbitrary Edge Functions via SQL.
REVOKE ALL ON FUNCTION public.cron_invoke_edge_function FROM public;
REVOKE ALL ON FUNCTION public.cron_invoke_edge_function FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cron_invoke_edge_function TO postgres, service_role;


-- ─── Unschedule the broken jobs and reschedule clean ───
-- cron.unschedule is idempotent — returns false if the job didn't
-- exist, doesn't raise. Safe to run on a fresh DB that never had
-- the old jobs.

SELECT cron.unschedule('scheduled-tasks-5min')      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'scheduled-tasks-5min');
SELECT cron.unschedule('delivery-reports-hourly')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delivery-reports-hourly');
SELECT cron.unschedule('signal-runner-daily')       WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'signal-runner-daily');
SELECT cron.unschedule('signal-runner-weekly')      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'signal-runner-weekly');


-- Re-create all four using the Vault-backed helper.

-- Existing: runs every 5 minutes, activates invoice dunning,
-- subscription renewals, asset cleanup, scheduled story publish,
-- auto-charge payment plans.
SELECT cron.schedule(
  'scheduled-tasks-5min',
  '*/5 * * * *',
  \$cron\$
  SELECT public.cron_invoke_edge_function(
    'scheduled-tasks',
    '{"task":"all"}'::jsonb
  );
  \$cron\$
);

-- Existing: runs hourly, generates delivery reports for digital ads.
SELECT cron.schedule(
  'delivery-reports-hourly',
  '0 * * * *',
  \$cron\$
  SELECT public.cron_invoke_edge_function(
    'generate-delivery-report',
    '{}'::jsonb
  );
  \$cron\$
);

-- New (from migration 088): daily briefing, weekdays 6:00am PT
-- (14:00 UTC standard, 13:00 UTC DST; scheduled in UTC and the
-- Edge Function surfaces the local time in the subject).
SELECT cron.schedule(
  'signal-runner-daily',
  '0 14 * * 1-5',
  \$cron\$
  SELECT public.cron_invoke_edge_function(
    'signal-runner',
    '{"type":"daily"}'::jsonb
  );
  \$cron\$
);

-- New (from migration 088): weekly preview, Sundays 6:00pm PT
-- (02:00 UTC Monday).
SELECT cron.schedule(
  'signal-runner-weekly',
  '0 2 * * 1',
  \$cron\$
  SELECT public.cron_invoke_edge_function(
    'signal-runner',
    '{"type":"weekly"}'::jsonb
  );
  \$cron\$
);

-- ============================================================
-- END Migration 089
-- ============================================================

