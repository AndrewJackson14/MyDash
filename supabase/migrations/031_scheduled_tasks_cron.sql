-- Schedule the scheduled-tasks edge function to run every 5 minutes.
-- Activates: invoice dunning, subscription renewals, asset cleanup,
-- scheduled story publish, and auto-charge payment plans.

SELECT cron.schedule(
  'scheduled-tasks-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/scheduled-tasks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"task":"all"}'::jsonb
  );
  $$
);
