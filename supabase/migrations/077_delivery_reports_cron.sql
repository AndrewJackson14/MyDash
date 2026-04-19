-- Migration 077: Schedule delivery report generator (Phase 7)
--
-- Calls generate-delivery-report edge function hourly. The function itself
-- only does work for schedules where next_run_at <= now() and is_active,
-- so the cost of an idle hourly tick is negligible (one query that returns
-- zero rows). 15-minute polling would be overkill since the smallest
-- cadence is weekly.

select cron.schedule(
  'delivery-reports-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/generate-delivery-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
