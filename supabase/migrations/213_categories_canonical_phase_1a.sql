-- 213 — Categories canonicalization, Phase 1a: dedupe + entity cleanup.
--
-- Today: categories is per-publication; same names like "News" / "Sports"
-- exist as separate rows for each pub. Names like "Arts &amp; Culture" still
-- carry HTML entities from the original WordPress import. Paso Robles Press
-- has internal duplicates (Business, Events, Chamber of Commerce, Public
-- Safety each appear twice). 207 rows total, 109 of which use parent_id.
--
-- After this migration:
--   • One canonical row per logical category (collapses 207 → ~142).
--   • HTML entities decoded in name + slug.
--   • 2,399 stories carry a category_id pointing at a row that won't
--     survive — they get remapped to the surviving canonical id.
--   • categories.publication_id is preserved (still populated) so the
--     existing StoryEditor query keeps working until Phase 1b ships.
--
-- Phase 1b (migration 214 + StoryEditor.jsx code change) will introduce
-- publication_categories as the per-pub selection layer, switch the
-- read path, and only THEN drop publication_id + add UNIQUE(name,slug).
-- That sequencing is deliberate: dropping the column before the read
-- path moves would break the Story Editor at runtime.
--
-- The 61,657 stories with category text but no category_id are not
-- touched here; they're handled in a later phase.
--
-- Rollback: snapshot categories + the affected stories rows before
-- applying. There is no in-migration rollback once the deletes land.

begin;

-- Survivor selection: lowest created_at within each normalized name group.
-- Normalized name = lowercase, trimmed, with the three HTML entities we
-- actually see in the data (&amp;, &#39;, &quot;) decoded.
create temp table cat_remap as
with norm as (
  select
    id,
    created_at,
    lower(trim(
      replace(replace(replace(name, '&amp;', '&'), '&#39;', ''''), '&quot;', '"')
    )) as norm_name
  from categories
),
ranked as (
  select id, norm_name,
    first_value(id) over (
      partition by norm_name
      order by created_at, id
    ) as survivor_id,
    row_number() over (
      partition by norm_name
      order by created_at, id
    ) as rn
  from norm
)
select id as old_id, survivor_id as new_id, rn
from ranked;

-- Sanity guard: log counts so the apply log shows what we actually did.
-- Expected as of 2026-05-04: total=207, losers=65, dedupe_groups=20.
do $$
declare
  total_rows int;
  loser_count int;
  group_count int;
begin
  select count(*) into total_rows from cat_remap;
  select count(*) into loser_count from cat_remap where rn > 1;
  select count(distinct new_id) into group_count from cat_remap
    where new_id in (select old_id from cat_remap where rn > 1);
  raise notice '[mig213] cat_remap total=% losers=% dedupe_groups=%',
    total_rows, loser_count, group_count;
end $$;

-- Remap stories to surviving canonical ids.
update stories
set category_id = r.new_id
from cat_remap r
where stories.category_id = r.old_id
  and r.old_id <> r.new_id;

-- Remap categories.parent_id where the parent was itself a loser.
-- Self-referencing FK; safe because we update before delete.
update categories
set parent_id = r.new_id
from cat_remap r
where categories.parent_id = r.old_id
  and r.old_id <> r.new_id;

-- Drop the now-unreferenced loser rows.
delete from categories
where id in (select old_id from cat_remap where rn > 1);

-- Clean HTML entities and stray whitespace on the survivors.
update categories
set
  name = trim(
    replace(replace(replace(name, '&amp;', '&'), '&#39;', ''''), '&quot;', '"')
  ),
  slug = trim(
    replace(replace(replace(slug, '&amp;', '&'), '&#39;', ''''), '&quot;', '"')
  );

drop table cat_remap;

commit;
