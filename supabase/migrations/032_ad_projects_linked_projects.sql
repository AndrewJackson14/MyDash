-- 032_ad_projects_linked_projects.sql
--
-- Adds linked ad project support for shared-content publications.
-- When two publications share physical pages (e.g. Atascadero News +
-- Paso Robles Press), the same ad appears in both issues but only
-- needs one design cycle. A salesperson or designer links the
-- secondary project to the primary; the secondary's status flips to
-- 'linked' and Design Studio hides it from the active grid.
--
-- Also seeds shared_content_with settings on Atascadero News and
-- Paso Robles Press so the auto-suggest system knows which pubs
-- are siblings.

alter table public.ad_projects
  add column if not exists linked_to_project_id uuid
    references public.ad_projects(id) on delete set null;

create index if not exists idx_ad_projects_linked
  on public.ad_projects(linked_to_project_id)
  where linked_to_project_id is not null;

update public.publications
set site_settings = coalesce(site_settings, '{}'::jsonb)
  || '{"shared_content_with": ["pub-paso-robles-press"]}'::jsonb
where id = 'pub-atascadero-news';

update public.publications
set site_settings = coalesce(site_settings, '{}'::jsonb)
  || '{"shared_content_with": ["pub-atascadero-news"]}'::jsonb
where id = 'pub-paso-robles-press';

notify pgrst, 'reload schema';