-- Migration 050: issue_goal_allocations
-- Per-issue salesperson share snapshot so share % changes aren't retroactive.
-- When an issue is sent_to_press, allocations are frozen; later share
-- changes only affect non-frozen (future) issues.
--
-- Schema notes (spec-fix versus the original writeup):
--   * issues.id is TEXT (not uuid) — FK declared accordingly.
--   * RLS policies link team_members via auth_id = auth.uid(), not
--     team_members.id = auth.uid() — those are different columns.

create table if not exists public.issue_goal_allocations (
  id uuid primary key default gen_random_uuid(),
  issue_id text not null references public.issues(id) on delete cascade,
  salesperson_id uuid not null references public.team_members(id) on delete cascade,
  publication_id text not null references public.publications(id) on delete cascade,
  share_pct numeric(5,2) not null check (share_pct >= 0 and share_pct <= 100),
  allocated_goal numeric(12,2) not null default 0,
  is_frozen boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(issue_id, salesperson_id)
);

create index if not exists idx_issue_goal_allocations_sp on public.issue_goal_allocations(salesperson_id);
create index if not exists idx_issue_goal_allocations_pub on public.issue_goal_allocations(publication_id);
create index if not exists idx_issue_goal_allocations_issue on public.issue_goal_allocations(issue_id);
create index if not exists idx_issue_goal_allocations_frozen on public.issue_goal_allocations(is_frozen) where is_frozen = false;

alter table public.issue_goal_allocations enable row level security;

create policy "Publisher sees all allocations"
  on public.issue_goal_allocations for select
  using (exists (
    select 1 from public.team_members tm
    where tm.auth_id = auth.uid()
      and tm.role = 'Publisher'
  ));

create policy "Salesperson sees own allocations"
  on public.issue_goal_allocations for select
  using (salesperson_id = (
    select id from public.team_members where auth_id = auth.uid()
  ));

create policy "Publisher manages allocations"
  on public.issue_goal_allocations for all
  using (exists (
    select 1 from public.team_members tm
    where tm.auth_id = auth.uid()
      and tm.role = 'Publisher'
  ))
  with check (exists (
    select 1 from public.team_members tm
    where tm.auth_id = auth.uid()
      and tm.role = 'Publisher'
  ));

comment on table public.issue_goal_allocations is
  'Per-issue x salesperson allocation snapshot. Rebuilt by trg_issue_goal_changed and trg_share_changed; frozen on sent_to_press so share % changes do not retroactively rewrite past allocations.';
