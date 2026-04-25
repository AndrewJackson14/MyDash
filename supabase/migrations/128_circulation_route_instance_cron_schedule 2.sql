-- Phase 5 of MyDash Circulation Workflow.
-- Schedules route-instance-cron to run daily at 13:00 UTC (06:00 PT)
-- per spec v1.1 §7.1. Uses the Vault-stored service_role key pattern
-- established in migration 089.
--
-- Unschedule first so re-applying is idempotent.

SELECT cron.unschedule('route-instance-cron-daily') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'route-instance-cron-daily'
);

SELECT cron.schedule(
  'route-instance-cron-daily',
  '0 13 * * *', -- 06:00 PT = 13:00 UTC
  $$SELECT cron_invoke_edge_function('route-instance-cron', '{}'::jsonb)$$
);
