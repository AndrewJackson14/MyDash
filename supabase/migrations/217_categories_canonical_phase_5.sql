-- 217 — Categories canonicalization, Phase 5: retire nav_categories JSONB.
--
-- Prerequisites:
--   1. Migration 216 has been applied (publication_categories pruned
--      to nav-only — synthetic 3b/3c rows removed so the join IS the
--      nav).
--   2. StellarPress' three reader components (SiteHeader, SiteFooter,
--      MagazineHeader) read from publication_categories ⨝ categories
--      ordered by position — NOT publications.site_settings.nav_categories.
--   3. The matching MyDash code change (MySites.jsx) drops the read of
--      site.settings?.nav_categories and stops writing it back into
--      site_settings on save. (Phase 5 PR — committed in same wave.)
--
-- After this migration, the nav_categories JSONB key is removed from
-- every publications row. The canonical source for "what nav cats does
-- this pub show" is publication_categories alone.
--
-- Also drops the snapshot tables created during migrations 213-216.
-- Those covered the riskiest data moves; if Phase 1 has been stable in
-- prod for the time you've been running on it, the snapshots are
-- ballast. (If you want to keep them longer for paranoia, comment out
-- the DROP TABLE block below.)

begin;

-- ── 1) Strip nav_categories from publications.site_settings ────────
update publications
set site_settings = site_settings - 'nav_categories'
where site_settings ? 'nav_categories';

-- ── 2) Drop the migration snapshots ────────────────────────────────
drop table if exists _mig213_categories_snapshot;
drop table if exists _mig213_stories_remap_snapshot;
drop table if exists _mig214_categories_snapshot;
drop table if exists _mig214_nav_snapshot;
drop table if exists _mig215_stories_snapshot;
drop table if exists _mig216_pruned_join_snapshot;

-- ── 3) Verification log ────────────────────────────────────────────
do $$
declare
  pubs_with_nav int;
  snapshot_count int;
begin
  select count(*) into pubs_with_nav from publications
    where site_settings ? 'nav_categories';
  select count(*) into snapshot_count
    from information_schema.tables
    where table_schema = 'public' and table_name like '\_mig21%' escape '\';
  raise notice '[mig216] pubs_with_nav_remaining=% snapshot_tables_remaining=%',
    pubs_with_nav, snapshot_count;
end $$;

commit;
