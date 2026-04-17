-- 033_issues_shared_pages.sql
--
-- Adds shared_pages integer[] to issues for the primary/mirror flatplan
-- model. Pages listed in this array are owned by the primary publication
-- and rendered read-only in the mirror pub's flatplan.
--
-- Also seeds shared_primary on Atascadero News (true) and Paso Robles
-- Press (false) so the flatplan knows which direction content flows.

alter table public.issues
  add column if not exists shared_pages integer[] default '{}';

update public.publications
set site_settings = coalesce(site_settings, '{}'::jsonb)
  || '{"shared_primary": true}'::jsonb
where id = 'pub-atascadero-news';

update public.publications
set site_settings = coalesce(site_settings, '{}'::jsonb)
  || '{"shared_primary": false}'::jsonb
where id = 'pub-paso-robles-press';

notify pgrst, 'reload schema';