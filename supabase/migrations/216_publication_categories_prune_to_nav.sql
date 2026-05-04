-- 216 — Prune publication_categories to match curated nav.
--
-- Migration 214 backfilled publication_categories from THREE sources in
-- priority order:
--   3a) site_settings.nav_categories  → positions 1..nav_len   (curated)
--   3b) legacy categories.publication_id → positions nav_len+1..K (synthetic)
--   3c) DISTINCT (story.publication_id, story.category_id) → positions K+1..M (synthetic)
--
-- The 3b/3c data was generated defensively to keep pub→category links
-- intact through the dedupe collapse. But it conflated two different
-- ideas: "the curated nav" and "every category any story uses on this
-- pub". Reading the join unfiltered as nav would over-render badly:
--
--   Paso Robles Press      114 join rows → 8 nav (delete 106)
--   Calabasas Style         25 join rows → 11 nav (delete 14)
--   The Malibu Times        11 join rows → 8 nav (delete 3)
--   Atascadero News         10 join rows → 8 nav (delete 2)
--
-- After this migration, publication_categories IS the per-pub
-- selection layer (rows present = nav-selected, position = display
-- order), so StellarPress readers can `select ... order by position`
-- with no filtering. Phase 5 (mig 217) then drops the JSONB key.
--
-- Pubs whose JSONB nav was empty (Santa Ynez Valley Star, etc.) are
-- intentionally skipped: there's no "curated truth" to fall back to,
-- so we leave whatever 3b/3c produced as the starting nav and let
-- the publisher curate via the new Publications-page Categories UI.
--
-- Stories' category_id FKs are unaffected — only join rows are
-- removed. Stories already tagged with a category that's no longer
-- in their pub's nav keep their tag; future stories on that pub
-- can't pick that category until the publisher re-adds it through
-- the Publications UI. That's the intended model.

begin;

-- Snapshot the rows about to be deleted so we can audit / restore
-- if a pub turns out to have a category they want re-added.
create table if not exists _mig216_pruned_join_snapshot as
  select pc.publication_id, pc.category_id, pc.position, pc.created_at,
         c.name as category_name, c.slug as category_slug
  from publication_categories pc
  join publications p on p.id = pc.publication_id
  join categories c on c.id = pc.category_id
  where jsonb_array_length(coalesce(p.site_settings->'nav_categories', '[]'::jsonb)) > 0
    and pc.position > jsonb_array_length(p.site_settings->'nav_categories');

-- Prune. The same predicate.
delete from publication_categories
where (publication_id, category_id) in (
  select pc.publication_id, pc.category_id
  from publication_categories pc
  join publications p on p.id = pc.publication_id
  where jsonb_array_length(coalesce(p.site_settings->'nav_categories', '[]'::jsonb)) > 0
    and pc.position > jsonb_array_length(p.site_settings->'nav_categories')
);

-- Verification log.
do $$
declare
  remaining int;
  pruned int;
  pubs_in_join int;
begin
  select count(*) into remaining from publication_categories;
  select count(*) into pruned from _mig216_pruned_join_snapshot;
  select count(distinct publication_id) into pubs_in_join from publication_categories;
  raise notice '[mig216] pruned=% remaining=% pubs_in_join=%',
    pruned, remaining, pubs_in_join;
end $$;

commit;
