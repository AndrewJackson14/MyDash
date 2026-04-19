-- Migration 066: Rename `ad_placements` -> `print_placements`
--
-- Migration 057 created `ad_placements` as the catalog of named premium PRINT
-- positions (Back Cover, Inside Front Cover, Inside Back Cover) wired to
-- proposal_lines.placement_id and contract_lines.placement_id.
--
-- The upcoming Digital Ad Workflow (spec) reuses the name `ad_placements`
-- for a fundamentally different concept: the table of LIVE digital ads
-- being served on each site (creative_url, click_url, ad_zone_id, sale_id,
-- ad_project_id, start/end_date, is_active, impressions, clicks).
--
-- Two pieces of evidence for the collision:
--   1. WebAds.jsx + SiteSettings.jsx already query/insert against the
--      "digital" shape (creative_url, ad_zone_id, is_active, ...). Those
--      columns don't exist on the production table — the code has been
--      silently broken since it shipped. Renaming clears the namespace
--      so Phase 5/6 can create the real digital-serving table.
--   2. Publications.jsx uses the production shape correctly to manage
--      print covers per pub (Back Cover / IFC / IBC). It needs to be
--      updated to use `print_placements` after this migration runs.
--
-- All FK references update transparently with ALTER TABLE RENAME — Postgres
-- carries the constraint over by table OID, not by name.

begin;

alter table ad_placements rename to print_placements;

-- Rename the index for clarity in pg_indexes / EXPLAIN output.
alter index idx_ad_placements_pub rename to idx_print_placements_pub;

-- Rename RLS policies (cosmetic — they follow the table automatically).
alter policy "ad_placements_read" on print_placements rename to "print_placements_read";
alter policy "ad_placements_write_ins" on print_placements rename to "print_placements_write_ins";
alter policy "ad_placements_write_upd" on print_placements rename to "print_placements_write_upd";
alter policy "ad_placements_write_del" on print_placements rename to "print_placements_write_del";

commit;

-- Code follow-ups required before this migration ships to prod:
--   * src/pages/Publications.jsx — replace 5 string literals "ad_placements"
--     with "print_placements" (lines ~39, 77, 83, 101, 116).
--   * Comment on line ~19 of Publications.jsx mentions ad_placements;
--     update narrative.
--   * src/pages/WebAds.jsx + src/pages/SiteSettings.jsx — leave alone.
--     These reference a digital-shape ad_placements that never existed.
--     Phase 6 (MySites consolidation) deletes/replaces them with the new
--     digital ad_placements created in Phase 4 (spec migration 068).
