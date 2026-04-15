-- 027_ad_projects_sale_id_foundation.sql
--
-- Foundation for Design Studio rewrite: every ad_project must belong
-- to exactly one sale. This migration backfills ad_projects.sale_id by
-- matching (client_id, publication_id, issue_id) between ad_projects and
-- sales, hard-deletes orphan ad_projects that can't be matched, and
-- enforces FK + NOT NULL + uniqueness going forward.
--
-- Notes:
--   - sale_id column was already present on ad_projects but had no FK,
--     no constraint, no data. This migration wires it up.
--   - Dedup tiebreaker on duplicate matches: keep the ad_project with
--     the most recent updated_at / created_at.
--   - ON DELETE CASCADE: when a sale is deleted, its ad_project goes
--     with it. (Sales deletions themselves still require explicit user
--     confirmation — see project convention.)

with best_match as (
  select distinct on (s.id)
    s.id as sale_id,
    ap.id as project_id
  from public.ad_projects ap
  join public.sales s
    on s.client_id = ap.client_id
   and s.publication_id = ap.publication_id
   and s.issue_id = ap.issue_id
  where ap.sale_id is null
  order by s.id, ap.updated_at desc nulls last, ap.created_at desc nulls last
)
update public.ad_projects ap
set sale_id = bm.sale_id
from best_match bm
where ap.id = bm.project_id;

delete from public.ad_projects where sale_id is null;

alter table public.ad_projects
  add constraint ad_projects_sale_id_fkey
  foreign key (sale_id) references public.sales(id) on delete cascade;

alter table public.ad_projects alter column sale_id set not null;

create unique index ad_projects_sale_id_key on public.ad_projects(sale_id);

notify pgrst, 'reload schema';
