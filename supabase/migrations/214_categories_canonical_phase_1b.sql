-- 214 — Categories canonicalization, Phase 1b: per-pub join + retire publication_id.
--
-- Builds on migration 213, which left a clean canonical catalog of 132 rows
-- but kept categories.publication_id populated so the existing StoryEditor
-- query stayed working.
--
-- This migration:
--   1. Creates publication_categories — the per-pub selection layer.
--   2. Creates 4 missing canonical rows for nav strings that don't yet
--      exist in editorial: "Issues", "Malibu Life", "Crime Report",
--      "Malibu Fires" (per dry-run #4 on 2026-05-04).
--   3. Backfills the join from THREE sources, in priority order:
--        a) site_settings.nav_categories — index becomes position
--           (publisher-set display order is the strongest signal).
--        b) categories.publication_id — categories the editorial table
--           explicitly assigned to this pub.
--        c) DISTINCT (story.publication_id, story.category_id) — covers
--           the dedupe-collapse case where a canonical category is
--           used by stories from a pub that wasn't its survivor's pub.
--      Source (a) wins on position; (b) and (c) append after.
--   4. Drops categories.publication_id (the legacy unique index drops
--      with it).
--   5. Adds UNIQUE(name) and UNIQUE(slug) on categories.
--
-- After this migration, the StoryEditor.jsx code change in the same PR
-- switches the dropdown's read path to publication_categories. MySites
-- still reads/writes site_settings.nav_categories — that JSONB key is
-- retired in Phase 5 once the new Publications-settings UI is live.
--
-- Rollback: migration 213's _mig213_categories_snapshot covers the
-- catalog; this migration is restorable by dropping publication_categories
-- and re-creating categories.publication_id from that snapshot if needed.

begin;

-- ── 0) Loosen categories.publication_id so we can seed new canonical
-- rows that aren't tied to any single pub. The column itself is dropped
-- at the end of this migration; this NOT NULL relax just gets us
-- through the seed + backfill steps.
alter table categories alter column publication_id drop not null;

-- ── 1) Create the join table ──────────────────────────────────────
create table publication_categories (
  publication_id text not null references publications(id) on delete cascade,
  category_id    uuid not null references categories(id)   on delete cascade,
  position       int  not null,
  created_at     timestamptz not null default now(),
  primary key (publication_id, category_id)
);

create index idx_publication_categories_pub_pos
  on publication_categories(publication_id, position);

alter table publication_categories enable row level security;

create policy "publication_categories_read" on publication_categories
  for select using (true);

-- Same role gate as issues_write_upd (migration 212): admins, plus
-- Publisher / Content Editor / Office Administrator can curate the
-- per-pub category list. INSERT / UPDATE / DELETE all share the gate.
create policy "publication_categories_write_ins" on publication_categories
  for insert with check (
    has_permission('admin') or exists (
      select 1 from people
      where auth_id = auth.uid()
        and role::text in ('Publisher', 'Content Editor', 'Office Administrator')
    )
  );

create policy "publication_categories_write_upd" on publication_categories
  for update using (
    has_permission('admin') or exists (
      select 1 from people
      where auth_id = auth.uid()
        and role::text in ('Publisher', 'Content Editor', 'Office Administrator')
    )
  );

create policy "publication_categories_write_del" on publication_categories
  for delete using (
    has_permission('admin') or exists (
      select 1 from people
      where auth_id = auth.uid()
        and role::text in ('Publisher', 'Content Editor', 'Office Administrator')
    )
  );

-- ── 2) Create missing canonical rows for nav strings ───────────────
-- These names appear in publications.site_settings.nav_categories on at
-- least one pub but have no matching canonical category. Seeded with
-- gen_random_uuid() defaults; sort_order left null (publishers can
-- adjust later via the per-pub UI).
insert into categories (name, slug)
values
  ('Issues',       'issues'),
  ('Malibu Life',  'malibu-life'),
  ('Crime Report', 'crime-report'),
  ('Malibu Fires', 'malibu-fires')
on conflict do nothing;

-- ── 3a) Backfill from nav_categories (publisher-set display order) ──
insert into publication_categories (publication_id, category_id, position)
select
  p.id        as publication_id,
  c.id        as category_id,
  elem.ord::int as position
from publications p,
  lateral jsonb_array_elements_text(
    coalesce(p.site_settings->'nav_categories', '[]'::jsonb)
  ) with ordinality as elem(value, ord)
join categories c on
  lower(trim(replace(replace(replace(c.name, '&amp;', '&'), '&#39;', ''''), '&quot;', '"')))
  =
  lower(trim(replace(replace(replace(elem.value, '&amp;', '&'), '&#39;', ''''), '&quot;', '"')))
on conflict (publication_id, category_id) do update set position = excluded.position;

-- ── 3b) Backfill from legacy categories.publication_id ─────────────
-- Append after any nav-derived rows. Order by canonical sort_order then
-- name so the appended block is at least internally consistent.
with existing_max as (
  select publication_id, max(position) as max_pos
  from publication_categories
  group by publication_id
),
to_insert as (
  select c.publication_id, c.id as category_id,
    row_number() over (
      partition by c.publication_id
      order by c.sort_order nulls last, c.name
    ) as rn
  from categories c
  where c.publication_id is not null
    and not exists (
      select 1 from publication_categories pc
      where pc.publication_id = c.publication_id and pc.category_id = c.id
    )
)
insert into publication_categories (publication_id, category_id, position)
select t.publication_id, t.category_id,
       coalesce(em.max_pos, 0) + t.rn
from to_insert t
left join existing_max em on em.publication_id = t.publication_id;

-- ── 3c) Backfill from stories (preserves links lost in dedupe) ─────
-- A canonical "Sports" might survive only on Atascadero News (its
-- survivor's pub_id) but be referenced by stories on Paso Robles Press,
-- Santa Ynez, etc. Step 3b alone would orphan those pubs. This step
-- pulls every (story.publication_id, story.category_id) pair so every
-- pub keeps every category it actually uses.
with distinct_pairs as (
  select distinct s.publication_id, s.category_id
  from stories s
  where s.publication_id is not null
    and s.category_id is not null
    and not exists (
      select 1 from publication_categories pc
      where pc.publication_id = s.publication_id and pc.category_id = s.category_id
    )
),
existing_max as (
  select publication_id, max(position) as max_pos
  from publication_categories
  group by publication_id
),
ordered as (
  select dp.publication_id, dp.category_id,
    row_number() over (
      partition by dp.publication_id
      order by c.sort_order nulls last, c.name
    ) as rn
  from distinct_pairs dp
  join categories c on c.id = dp.category_id
)
insert into publication_categories (publication_id, category_id, position)
select o.publication_id, o.category_id,
       coalesce(em.max_pos, 0) + o.rn
from ordered o
left join existing_max em on em.publication_id = o.publication_id;

-- ── 4) Verification log ────────────────────────────────────────────
do $$
declare
  pc_count int;
  pubs_with_join int;
  pubs_with_nav int;
  cats_count int;
begin
  select count(*) into pc_count from publication_categories;
  select count(distinct publication_id) into pubs_with_join from publication_categories;
  select count(*) into pubs_with_nav from publications
    where jsonb_array_length(coalesce(site_settings->'nav_categories', '[]'::jsonb)) > 0;
  select count(*) into cats_count from categories;
  raise notice '[mig214] join=% pubs_in_join=% pubs_with_nav=% canonical_cats=%',
    pc_count, pubs_with_join, pubs_with_nav, cats_count;
end $$;

-- ── 5) Retire categories.publication_id ────────────────────────────
-- The unique index categories_publication_id_slug_key drops with it.
alter table categories drop column publication_id;

-- ── 6) Enforce canonical uniqueness ────────────────────────────────
alter table categories add constraint categories_name_unique unique (name);
alter table categories add constraint categories_slug_unique unique (slug);

commit;
