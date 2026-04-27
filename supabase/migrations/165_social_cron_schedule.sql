-- ============================================================
-- Migration 165 — pg_cron schedule for social-cron
--
-- Wires the social-cron Edge Function to fire every minute. The
-- function scans social_posts for status='scheduled' rows whose
-- scheduled_for has passed and fans them out to social-publish
-- (each with the service-role token).
--
-- Pattern matches scheduled-tasks-5min in migration 089: pg_cron
-- calls public.cron_invoke_edge_function('social-cron', '{}'),
-- which reads the service-role JWT from Vault and POSTs to
-- /functions/v1/social-cron with that bearer.
--
-- Cadence: every minute. The publish step is non-trivial (token
-- refresh, X media upload, network calls per destination) so we
-- cap MAX_PER_TICK at 25 inside the function — anything queued
-- past that gets picked up next minute. With realistic schedule
-- volumes (handful per day across all pubs) this is plenty of
-- headroom.
--
-- Idempotent — uses unschedule-then-schedule, so re-applying the
-- migration upgrades the cadence cleanly.
-- ============================================================

SELECT cron.unschedule('social-cron-1min')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social-cron-1min');

SELECT cron.schedule(
  'social-cron-1min',
  '* * * * *',
  $cron$
  SELECT public.cron_invoke_edge_function(
    'social-cron',
    '{}'::jsonb
  );
  $cron$
);

NOTIFY pgrst, 'reload schema';
