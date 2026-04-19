-- Migration 069: Extend `ad_projects` for digital creative (Phase 2 of Digital Ad Workflow)
--
-- ad_projects is the existing creative-workflow table (brief -> design ->
-- proof -> approval -> placed). Digital projects use the same lifecycle
-- but need a few additional creative fields and a constraint relaxation.
-- Print projects pin to issue + ad_size; digital projects pin to flight
-- dates + zone + dimensions (the ad_size value is null for digital).

alter table ad_projects
  add column if not exists delivery_format  text,    -- animated_gif | static_png | html | video_mp4
  add column if not exists click_url        text,
  add column if not exists alt_text         text,
  add column if not exists creative_width   int,
  add column if not exists creative_height  int;

-- ad_size: spec called for relaxing NOT NULL — already nullable in production
-- (no-op, kept here for documentation). Validation lives in the proposal
-- builder, which picks the print path (issue + ad_size) or digital path
-- (zone + flight dates).

-- One ad_project per sale (digital or print). The Phase 5 trigger
-- create_placement_on_digital_approval relies on this 1:1. Production
-- already enforces it via UNIQUE INDEX `ad_projects_sale_id_key` (an
-- index, not a table constraint — pg_constraint scans miss it but it
-- still rejects duplicates). No action needed here; documented for
-- future readers tracing the invariant.

