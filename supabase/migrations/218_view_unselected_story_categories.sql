-- 218 — View: categories used by stories but not in their pub's curated list.
--
-- After the prune in mig 216, publication_categories represents only
-- the per-pub curated nav. There are still ~207 (pub × category) pairs
-- that exist in stories' historical tags but aren't in any pub's
-- selection — surfaced here so publishers have a checklist when
-- curating via the Publications page Categories editor.
--
-- The view is just a saved query; no rows of its own. Always reflects
-- live state, so as publishers add categories the count drops.
--
-- Read-only by default (no INSERT/UPDATE/DELETE triggers); SECURITY
-- INVOKER means callers see only the rows their existing RLS allows
-- on the underlying tables (stories, categories, publication_categories,
-- publications) — all of which are publicly readable today.

create or replace view v_unselected_story_categories
with (security_invoker = true)
as
select
  p.id   as publication_id,
  p.name as pub_name,
  c.id   as category_id,
  c.name as category_name,
  c.slug as category_slug,
  count(s.id) as stories_tagged
from stories s
join publications p on p.id = s.publication_id
join categories c on c.id = s.category_id
where s.publication_id is not null
  and s.category_id is not null
  and not exists (
    select 1 from publication_categories pc
    where pc.publication_id = s.publication_id
      and pc.category_id = s.category_id
  )
group by p.id, p.name, c.id, c.name, c.slug;

comment on view v_unselected_story_categories is
  'Categories used by historical story tags but not in the pub''s curated nav (publication_categories). Surfaces post-mig-216 review work for publishers.';
