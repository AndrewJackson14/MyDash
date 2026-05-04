-- 215 — Backfill stories.category_id by name-match against canonical.
--
-- Phase 1 (mig 213+214) produced a clean canonical catalog and per-pub
-- selection layer, but only ~9,980 of 90,575 stories carried a
-- category_id. The other ~71K stories (mostly WordPress imports) carry
-- a denormalized `category` text only.
--
-- This migration matches name-only stories to canonical rows by
-- normalized name (lowercase + trim + decode the three HTML entities
-- the data actually uses). Dry-run on 2026-05-04: 53,989 of 61,657
-- name-only stories match (87.5%). 7,668 stay name-only across 87
-- distinct names — those names can be promoted to canonical later
-- through the Publications-settings UI (planned for mig 216 and beyond).
--
-- Also cleans HTML entities + leading/trailing whitespace in
-- stories.category and stories.category_slug across ALL stories, not
-- just the matched ones — important so display + slug-based URLs are
-- consistent regardless of whether category_id is set.
--
-- Idempotent: safe to re-run. The category_id update has a guard so
-- it never overwrites a non-null id; the entity-clean updates only
-- touch rows that still contain entities or whitespace.

begin;

-- ── 1) Set category_id on name-only stories whose normalized name matches a canonical row ──
update stories s
set category_id = c.id
from categories c
where s.category_id is null
  and s.category is not null
  and s.category <> ''
  and lower(trim(replace(replace(replace(s.category, '&amp;', '&'), '&#39;', ''''), '&quot;', '"')))
    = lower(c.name);

-- ── 2) Clean HTML entities and whitespace in stories.category text ──
update stories
set category = trim(replace(replace(replace(category, '&amp;', '&'), '&#39;', ''''), '&quot;', '"'))
where category is not null
  and (
    category like '%&amp;%'
    or category like '%&#39;%'
    or category like '%&quot;%'
    or category <> trim(category)
  );

-- ── 3) Same for stories.category_slug ──
update stories
set category_slug = trim(replace(replace(replace(category_slug, '&amp;', '&'), '&#39;', ''''), '&quot;', '"'))
where category_slug is not null
  and (
    category_slug like '%&amp;%'
    or category_slug like '%&#39;%'
    or category_slug like '%&quot;%'
    or category_slug <> trim(category_slug)
  );

-- ── 4) Verification log ──
do $$
declare
  total_stories int;
  with_cat_id int;
  name_only int;
  no_cat int;
begin
  select count(*) into total_stories from stories;
  select count(*) into with_cat_id from stories where category_id is not null;
  select count(*) into name_only from stories
    where category_id is null and category is not null and category <> '';
  select count(*) into no_cat from stories
    where category_id is null and (category is null or category = '');
  raise notice '[mig215] total=% with_cat_id=% name_only=% no_cat=%',
    total_stories, with_cat_id, name_only, no_cat;
end $$;

commit;
