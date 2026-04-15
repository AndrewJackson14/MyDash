-- Team notes expiration: nightly prune job.
-- Read notes age out after 60 days, unread after 90.
-- Runs daily at 03:15 UTC (off-hours for the newsroom).

create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'team_notes_expire',
  '15 3 * * *',
  $$
    delete from public.team_notes
    where (is_read = true  and created_at < now() - interval '60 days')
       or (is_read = false and created_at < now() - interval '90 days');
  $$
);
