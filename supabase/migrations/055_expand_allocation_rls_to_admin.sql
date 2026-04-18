-- Migration 055: open issue_goal_allocations Publisher policies to anyone
-- with the 'admin' permission.
--
-- Background: migration 050 gated allocation reads/writes to role = 'Publisher'.
-- Office Managers (and other admin-tier users like the system owner) need the
-- same visibility to review the Financials cascade without impersonating a
-- Publisher. has_permission('admin') is the project-wide check used by
-- publications/issues/team policies in migration 001, so reuse it here.

drop policy if exists "Publisher sees all allocations" on public.issue_goal_allocations;
drop policy if exists "Publisher manages allocations" on public.issue_goal_allocations;

create policy "Admin sees all allocations"
  on public.issue_goal_allocations for select
  using (
    has_permission('admin')
    or exists (
      select 1 from public.team_members tm
      where tm.auth_id = auth.uid()
        and tm.role = 'Publisher'
    )
  );

create policy "Admin manages allocations"
  on public.issue_goal_allocations for all
  using (
    has_permission('admin')
    or exists (
      select 1 from public.team_members tm
      where tm.auth_id = auth.uid()
        and tm.role = 'Publisher'
    )
  )
  with check (
    has_permission('admin')
    or exists (
      select 1 from public.team_members tm
      where tm.auth_id = auth.uid()
        and tm.role = 'Publisher'
    )
  );
