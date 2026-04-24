-- ============================================================
-- 102b — Schedule the discussion-purge-cron daily.
-- 03:30 UTC offsets from the existing 03:00 (placements) and 03:17
-- (gmail-watch) jobs so retries don't pile up if one slows.
-- ============================================================
SELECT cron.schedule(
  'discussion-purge-daily',
  '30 3 * * *',
  $$
  SELECT public.cron_invoke_edge_function(
    'discussion-purge-cron',
    '{}'::jsonb
  );
  $$
);
