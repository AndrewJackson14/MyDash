-- Migration 065: Cleanup product_type enum duplicates
--
-- The `product_type` enum accumulated two pairs of duplicate-meaning values:
--   web_ad         vs web_display      (web_display had 0 sales, 2 web_ad_rates)
--   social_sponsor vs social_sponsored (both had 0 rows everywhere)
--
-- This caused the well-known "filters miss half the digital sales" class of
-- bug. We collapse to the canonical values (web_ad, social_sponsor) before
-- the digital ad workflow ships, so downstream filters / catalog rows can
-- safely match a single string per product type.
--
-- Postgres can't drop enum values in place — we have to recreate the type,
-- swap every column, and drop the old type.
--
-- Preflight discoveries that this migration handles:
--   1. CHECK constraint `sales_issue_id_by_product_type` references the enum
--      literal — must drop + recreate around the swap.
--   2. Default `'display_print'::product_type` on sales.product_type can't
--      be auto-cast — must drop + restore.
--   3. Trigger `trg_auto_web_ad_placement` (function `auto_create_web_ad_placement`)
--      filters on the dead enum values AND inserts into the old `ad_placements`
--      table with digital-shape columns that never existed. It has been a
--      no-op since deployment (no sales rows ever had those product_types).
--      Dropped here; Phase 5 of the digital ad workflow rebuilds it properly
--      as `create_placement_on_digital_approval`.
--   4. Five tables carry the enum: sales, web_ad_rates, plus three archive
--      tables (sales_archive_20260419, sales_archive_20260419b, and
--      web_ad_rates_archive_20260419). All swapped here.

begin;

-- (3) Drop the dead trigger + function (ghost ad_placements ref + dead enum values).
drop trigger if exists trg_auto_web_ad_placement on sales;
drop function if exists auto_create_web_ad_placement();

-- (1) Drop CHECK constraint that references enum literal.
alter table sales drop constraint sales_issue_id_by_product_type;

-- (2) Drop default that references enum.
alter table sales alter column product_type drop default;

-- Remap stragglers in web_ad_rates (live + archive).
update web_ad_rates set product_type = 'web_ad' where product_type = 'web_display';
update web_ad_rates_archive_20260419 set product_type = 'web_ad' where product_type = 'web_display';

-- Create cleaned enum.
create type product_type_v2 as enum (
  'display_print',
  'classified',
  'legal_notice',
  'web_ad',
  'sponsored_content',
  'newsletter_sponsor',
  'eblast',
  'social_sponsor',
  'creative_service'
);

-- (4) Swap every column over.
alter table sales
  alter column product_type type product_type_v2
  using product_type::text::product_type_v2;

alter table web_ad_rates
  alter column product_type type product_type_v2
  using product_type::text::product_type_v2;

alter table sales_archive_20260419
  alter column product_type type product_type_v2
  using product_type::text::product_type_v2;

alter table sales_archive_20260419b
  alter column product_type type product_type_v2
  using product_type::text::product_type_v2;

alter table web_ad_rates_archive_20260419
  alter column product_type type product_type_v2
  using product_type::text::product_type_v2;

-- Drop old, rename new.
drop type product_type;
alter type product_type_v2 rename to product_type;

-- (2) Restore default.
alter table sales alter column product_type set default 'display_print'::product_type;

-- (1) Restore CHECK constraint.
alter table sales add constraint sales_issue_id_by_product_type
  check (
    ((product_type = 'display_print'::product_type) AND (issue_id IS NOT NULL))
    OR ((product_type <> 'display_print'::product_type) AND (issue_id IS NULL))
  );

commit;

-- Note for callers: src/lib/qboTransactionType.js still has defensive case
-- branches for 'web_display' / 'social_sponsored' as strings. Those cases
-- are unreachable now but harmless — leave them as belt-and-suspenders.
