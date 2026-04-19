-- Migration 057: Introduce ad_placements for named premium positions
-- (Back Cover / Inside Front Cover / Inside Back Cover this session; other
-- placement categories — skybox, footer, map, banner, directory — deferred).
--
-- Also extends proposal_lines + contract_lines with placement + guarantee
-- columns so a line can represent either a named cover slot or a generic
-- page / right-hand / competitor-distance guarantee. The guarantee percent
-- is a single capped value per line (13 Stars policy: "up to 30% for back
-- cover / inside covers, 20% for other placement guarantees").
--
-- Publications gain default_placement_guarantee_pct (default 20) so the
-- proposal UI can suggest a value when the salesperson toggles a guarantee.
--
-- Data moves:
--   * Malibu Magazine: existing Back Cover → ad_placements. Existing
--     Inside Cover row splits into IFC + IBC at the same rate (the kit
--     lists one price; both positions are 1-per-issue).
--   * SYV: Back Cover → ad_placements.
--   * Calabasas Style: insert BC / IFC / IBC (rates from 2025 kit).
--   * WTDIM: insert BC / IFC / IBC (kit has single-tier rates; semi-annual).
--   * Malibu Times: delete Streamer (product retired per publisher).
--   * Malibu Magazine Page 3 stays in ad_sizes as legacy — page-number
--     guarantees land on proposal_lines.page_guarantee going forward.
--   * Other placement-like rows (MT Skybox/Footer, SYV Cover/Reg Banner,
--     Morro Bay Biz Directory, etc.) are intentionally left in ad_sizes
--     for later bundles.

create table if not exists ad_placements (
  id uuid primary key default uuid_generate_v4(),
  pub_id text not null references publications(id) on delete cascade,
  name text not null,
  category text not null default 'cover',       -- cover | page | map | banner | skybox | footer | directory
  base_size_id uuid references ad_sizes(id) on delete set null,
  rate int not null default 0,                  -- 1x / open rate
  rate_6 int not null default 0,                -- 6-insertion tier (or 3x/6x on magazines with different ladders)
  rate_12 int not null default 0,               -- 12-insertion tier
  limited_per_issue int,                        -- null = unlimited; 1 = back cover / IFC / IBC
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_ad_placements_pub on ad_placements(pub_id, sort_order);

alter table ad_placements enable row level security;

create policy "ad_placements_read" on ad_placements for select using (true);
create policy "ad_placements_write_ins" on ad_placements for insert with check (has_permission('admin'));
create policy "ad_placements_write_upd" on ad_placements for update using (has_permission('admin'));
create policy "ad_placements_write_del" on ad_placements for delete using (has_permission('admin'));

-- Publisher-configurable default % for "other placement guarantees" (the
-- 13 Stars policy default is 20). Salespeople can override per-line.
alter table publications
  add column if not exists default_placement_guarantee_pct numeric(5,2) not null default 20;

-- proposal_lines: placement FK + guarantee fields.
alter table proposal_lines
  add column if not exists placement_id uuid references ad_placements(id) on delete set null,
  add column if not exists page_guarantee int,
  add column if not exists rh_guarantee boolean not null default false,
  add column if not exists competitor_distance_pages int,
  add column if not exists competitor_client_id uuid references clients(id) on delete set null,
  add column if not exists placement_guarantee_pct numeric(5,2) not null default 0;

-- Mirror on contract_lines so conversion preserves placement + guarantee.
alter table contract_lines
  add column if not exists placement_id uuid references ad_placements(id) on delete set null,
  add column if not exists page_guarantee int,
  add column if not exists rh_guarantee boolean not null default false,
  add column if not exists competitor_distance_pages int,
  add column if not exists competitor_client_id uuid references clients(id) on delete set null,
  add column if not exists placement_guarantee_pct numeric(5,2) not null default 0;

-- =======================================================================
-- Backfill: move named covers from ad_sizes → ad_placements.
-- =======================================================================

-- Malibu Magazine — Back Cover (1 row → 1 placement)
insert into ad_placements (pub_id, name, category, rate, rate_6, rate_12, limited_per_issue, sort_order)
select 'pub-malibu-magazine', 'Back Cover', 'cover', rate, rate_6, rate_12, 1, 1
from ad_sizes where pub_id = 'pub-malibu-magazine' and name = 'Back Cover';

-- Malibu Magazine — Inside Cover row splits into IFC + IBC at same rate
insert into ad_placements (pub_id, name, category, rate, rate_6, rate_12, limited_per_issue, sort_order)
select 'pub-malibu-magazine', 'Inside Front Cover', 'cover', rate, rate_6, rate_12, 1, 2
from ad_sizes where pub_id = 'pub-malibu-magazine' and name = 'Inside Cover';

insert into ad_placements (pub_id, name, category, rate, rate_6, rate_12, limited_per_issue, sort_order)
select 'pub-malibu-magazine', 'Inside Back Cover', 'cover', rate, rate_6, rate_12, 1, 3
from ad_sizes where pub_id = 'pub-malibu-magazine' and name = 'Inside Cover';

-- Delete the moved ad_sizes rows (Back Cover + Inside Cover). Page 3 stays.
delete from ad_sizes where pub_id = 'pub-malibu-magazine' and name in ('Back Cover', 'Inside Cover');

-- Santa Ynez Valley Star — Back Cover
insert into ad_placements (pub_id, name, category, rate, rate_6, rate_12, limited_per_issue, sort_order)
select 'pub-santa-ynez-valley-st', 'Back Cover', 'cover', rate, rate_6, rate_12, 1, 1
from ad_sizes where pub_id = 'pub-santa-ynez-valley-st' and name = 'Back Cover';

delete from ad_sizes where pub_id = 'pub-santa-ynez-valley-st' and name = 'Back Cover';

-- Calabasas Style — rates from 2025 kit (1x / 3x / 6x ladder)
insert into ad_placements (pub_id, name, category, rate, rate_6, rate_12, limited_per_issue, sort_order) values
  ('pub-calabasas-style', 'Back Cover',         'cover', 3000, 2800, 2600, 1, 1),
  ('pub-calabasas-style', 'Inside Front Cover', 'cover', 2100, 2000, 1900, 1, 2),
  ('pub-calabasas-style', 'Inside Back Cover',  'cover', 2100, 2000, 1900, 1, 3);

-- What To Do In Malibu — semi-annual, single-tier rates (rate_6/rate_12 = 0)
insert into ad_placements (pub_id, name, category, rate, rate_6, rate_12, limited_per_issue, sort_order) values
  ('pub-what-to-do-malibu', 'Back Cover',         'cover', 8250, 0, 0, 1, 1),
  ('pub-what-to-do-malibu', 'Inside Front Cover', 'cover', 3053, 0, 0, 1, 2),
  ('pub-what-to-do-malibu', 'Inside Back Cover',  'cover', 2970, 0, 0, 1, 3);

-- Retire Malibu Times Streamer per publisher direction.
delete from ad_sizes where pub_id = 'pub-the-malibu-times' and name = 'Streamer';
