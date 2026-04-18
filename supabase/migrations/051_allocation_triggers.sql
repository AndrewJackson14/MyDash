-- Migration 051: allocation maintenance triggers
-- Keeps issue_goal_allocations in sync with the source-of-truth tables:
--   * commission_issue_goals.goal (the issue-level goal itself)
--   * salesperson_pub_assignments.percentage (the share split)
--   * issues.sent_to_press_at (freeze signal)
--
-- Rebuilds never touch frozen rows, so share % changes are not retroactive.

-- ─── 1. rebuild_issue_goal_allocations(p_issue_id text) ─────────────
-- Deletes non-frozen allocations for the issue, then re-inserts from the
-- current salesperson_pub_assignments. Falls back to issues.revenue_goal
-- if commission_issue_goals has no row for this issue (legacy compat).
create or replace function public.rebuild_issue_goal_allocations(p_issue_id text)
returns void
language plpgsql
security definer
as $fn$
declare
  v_issue_goal numeric(12,2);
  v_pub_id text;
begin
  select coalesce(cig.goal, i.revenue_goal, 0), i.pub_id
    into v_issue_goal, v_pub_id
  from public.issues i
  left join public.commission_issue_goals cig on cig.issue_id = i.id
  where i.id = p_issue_id;

  if v_pub_id is null then return; end if;

  delete from public.issue_goal_allocations
  where issue_id = p_issue_id and is_frozen = false;

  insert into public.issue_goal_allocations (issue_id, salesperson_id, publication_id, share_pct, allocated_goal)
  select
    p_issue_id,
    spa.salesperson_id,
    spa.publication_id,
    spa.percentage,
    round(v_issue_goal * spa.percentage / 100.0, 2)
  from public.salesperson_pub_assignments spa
  where spa.publication_id = v_pub_id
    and coalesce(spa.is_active, true) = true
    and spa.percentage > 0
  on conflict (issue_id, salesperson_id) do update
    set share_pct = excluded.share_pct,
        allocated_goal = excluded.allocated_goal,
        updated_at = now()
  where public.issue_goal_allocations.is_frozen = false;
end;
$fn$;

grant execute on function public.rebuild_issue_goal_allocations(text) to authenticated;


-- ─── 2. trg_issue_goal_changed ─────────────────────────────────────
-- When a goal is set or changed, rebuild that issue's allocations.
create or replace function public.trg_issue_goal_changed()
returns trigger
language plpgsql
as $fn$
begin
  perform public.rebuild_issue_goal_allocations(new.issue_id);
  return new;
end;
$fn$;

drop trigger if exists issue_goal_rebuild on public.commission_issue_goals;
create trigger issue_goal_rebuild
  after insert or update of goal on public.commission_issue_goals
  for each row execute function public.trg_issue_goal_changed();


-- ─── 3. trg_share_changed ──────────────────────────────────────────
-- When a salesperson_pub_assignments row changes, rebuild all non-frozen
-- issues for that pub, plus any issues in the pub with a goal but no
-- allocations yet (covers the first-time allocation case).
create or replace function public.trg_share_changed()
returns trigger
language plpgsql
as $fn$
declare
  v_pub text := coalesce(new.publication_id, old.publication_id);
  v_issue_id text;
begin
  for v_issue_id in
    select distinct i.id
    from public.issues i
    join public.issue_goal_allocations iga on iga.issue_id = i.id
    where i.pub_id = v_pub and iga.is_frozen = false
  loop
    perform public.rebuild_issue_goal_allocations(v_issue_id);
  end loop;

  for v_issue_id in
    select distinct i.id
    from public.issues i
    join public.commission_issue_goals cig on cig.issue_id = i.id
    left join public.issue_goal_allocations iga on iga.issue_id = i.id
    where i.pub_id = v_pub and iga.id is null
  loop
    perform public.rebuild_issue_goal_allocations(v_issue_id);
  end loop;

  return new;
end;
$fn$;

drop trigger if exists share_rebuild on public.salesperson_pub_assignments;
create trigger share_rebuild
  after insert or update of percentage, is_active on public.salesperson_pub_assignments
  for each row execute function public.trg_share_changed();


-- ─── 4. trg_freeze_allocations ─────────────────────────────────────
-- sent_to_press_at populated => freeze all allocations for that issue.
create or replace function public.trg_freeze_allocations()
returns trigger
language plpgsql
as $fn$
begin
  if new.sent_to_press_at is not null
     and (old.sent_to_press_at is null or old.sent_to_press_at is distinct from new.sent_to_press_at)
  then
    update public.issue_goal_allocations
    set is_frozen = true, updated_at = now()
    where issue_id = new.id and is_frozen = false;
  end if;
  return new;
end;
$fn$;

drop trigger if exists freeze_on_press on public.issues;
create trigger freeze_on_press
  after update of sent_to_press_at on public.issues
  for each row execute function public.trg_freeze_allocations();
