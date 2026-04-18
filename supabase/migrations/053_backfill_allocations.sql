-- Migration 053: one-shot backfill of issue_goal_allocations from any
-- existing commission_issue_goals rows. If commission_issue_goals is
-- empty at apply time (as was the case in production), this is a no-op;
-- migration 054 handles the legacy-data carry-forward and emits the
-- actual rebuild through the triggers.
do $backfill$
declare
  r record;
begin
  for r in
    select distinct i.id
    from public.issues i
    join public.commission_issue_goals cig on cig.issue_id = i.id
    where coalesce(cig.goal, 0) > 0
  loop
    perform public.rebuild_issue_goal_allocations(r.id);
  end loop;

  update public.issue_goal_allocations iga
  set is_frozen = true, updated_at = now()
  from public.issues i
  where iga.issue_id = i.id
    and i.sent_to_press_at is not null
    and iga.is_frozen = false;
end;
$backfill$;
