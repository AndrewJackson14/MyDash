-- Migration 056: Sync publications + ad_sizes with 2026 media kits.
--
-- Source: /Media Kits/ PDFs (13 Stars, Malibu Times, SYV Star,
-- Morro Bay Life, Central Coast Living, Calabasas Style, Malibu Magazine,
-- What To Do In Malibu).
--
-- Scope:
--   * publications: correct circulation/frequency for SYV, CCL, WTDIM, CSM.
--   * PRP/ATN: populate rate_6 (26-wk contract, 30% off) and rate_12
--     (52-wk contract, 40% off); compute missing custom-size rates at $22/ci.
--   * MBL: insert missing 1/4 Page H.
--   * Malibu Magazine: fix rate_6/rate_12 mapping (rate_6 was holding 6x
--     rate; should be 3x. rate_12 should be 6x.).
--   * CSM, CCL, WTDIM: insert missing ad_sizes (sizes only — placement
--     premiums like IFC/IBC/Back Cover/Page 3/First RH/Map positions are
--     intentionally deferred until the global placement-flag model lands).

-- =======================================================================
-- 1. Publications — circulation + frequency corrections
-- =======================================================================
update publications set circulation = 8500, frequency = 'Semi-Monthly'
  where id = 'pub-santa-ynez-valley-st';

update publications set circulation = 10000, frequency = 'Bi-Monthly'
  where id = 'pub-central-coast-living';

update publications set circulation = 20000, frequency = 'Semi-Annual'
  where id = 'pub-what-to-do-malibu';

update publications set circulation = 10000
  where id = 'pub-calabasas-style';

-- =======================================================================
-- 2. PRP + ATN — populate contract-discount tiers (rate_6 = 26-wk 30% off,
--    rate_12 = 52-wk 40% off) for the standard sizes, and fill in the
--    custom sizes (1/6, 1/10, 1/12, 1/15, Double Truck) at $22/column-inch.
-- =======================================================================

-- Standard sizes: rate_6 = round(rate*0.70), rate_12 = round(rate*0.60)
update ad_sizes set rate_6 = 979,  rate_12 = 839  where pub_id in ('pub-paso-robles-press','pub-atascadero-news') and name = 'Full Page';
update ad_sizes set rate_6 = 699,  rate_12 = 599  where pub_id in ('pub-paso-robles-press','pub-atascadero-news') and name = '3/4 Page';
update ad_sizes set rate_6 = 524,  rate_12 = 449  where pub_id in ('pub-paso-robles-press','pub-atascadero-news') and name in ('1/2 Page H','1/2 Page V');
update ad_sizes set rate_6 = 279,  rate_12 = 239  where pub_id in ('pub-paso-robles-press','pub-atascadero-news') and name in ('1/4 Page H','1/4 Page V');
update ad_sizes set rate_6 = 174,  rate_12 = 149  where pub_id in ('pub-paso-robles-press','pub-atascadero-news') and name in ('1/8 Page H','1/8 Page V');

-- Custom sizes: base = columns * height * $22. rate_6 = 30% off, rate_12 = 40% off.
-- Column widths: 2c=3.625", 3c=5.5", 4c=7.375", 6c=11.125", 12c=22.25"
update ad_sizes set rate = 451, rate_6 = 316, rate_12 = 271
  where pub_id in ('pub-paso-robles-press','pub-atascadero-news') and name in ('1/6 Page H','1/6 Page V');
update ad_sizes set rate = 264, rate_6 = 185, rate_12 = 158
  where pub_id in ('pub-paso-robles-press','pub-atascadero-news') and name = '1/10 Page H';
update ad_sizes set rate = 271, rate_6 = 190, rate_12 = 163
  where pub_id in ('pub-paso-robles-press','pub-atascadero-news') and name = '1/10 Page V';
update ad_sizes set rate = 220, rate_6 = 154, rate_12 = 132
  where pub_id in ('pub-paso-robles-press','pub-atascadero-news') and name = '1/12 Page';
update ad_sizes set rate = 180, rate_6 = 126, rate_12 = 108
  where pub_id in ('pub-paso-robles-press','pub-atascadero-news') and name = '1/15 Page';
update ad_sizes set rate = 5478, rate_6 = 3835, rate_12 = 3287
  where pub_id in ('pub-paso-robles-press','pub-atascadero-news') and name = 'Double Truck';

-- =======================================================================
-- 3. Morro Bay Life — add missing 1/4 Page H
-- =======================================================================
insert into ad_sizes (pub_id, name, dims, width, height, rate, rate_6, rate_12, sort_order)
values ('pub-morro-bay-life', '1/4 Page H', '7.625 x 2.375', 7.625, 2.375, 371, 316, 279, 8);

-- =======================================================================
-- 4. Malibu Magazine — fix rate tier mapping.
--    Was: rate = 1x, rate_6 = 6x, rate_12 = 0.
--    Now: rate = 1x, rate_6 = 3x, rate_12 = 6x.
-- =======================================================================
update ad_sizes set rate_6 = 2000, rate_12 = 1700 where pub_id = 'pub-malibu-magazine' and name = 'Full Page';
update ad_sizes set rate_6 = 1375, rate_12 = 1100 where pub_id = 'pub-malibu-magazine' and name in ('1/2 Page V','1/2 Page H');
update ad_sizes set rate_6 = 1100, rate_12 = 880  where pub_id = 'pub-malibu-magazine' and name = '1/3 Page';
update ad_sizes set rate_6 = 780,  rate_12 = 680  where pub_id = 'pub-malibu-magazine' and name = '1/4 Page';
update ad_sizes set rate_6 = 7500, rate_12 = 6500 where pub_id = 'pub-malibu-magazine' and name = 'Back Cover';
update ad_sizes set rate_6 = 2800, rate_12 = 2600 where pub_id = 'pub-malibu-magazine' and name = 'Inside Cover';
update ad_sizes set rate_6 = 2700, rate_12 = 2400 where pub_id = 'pub-malibu-magazine' and name = 'Page 3';
update ad_sizes set rate_6 = 3200, rate_12 = 2900 where pub_id = 'pub-malibu-magazine' and name = '2-Page Spread';

-- =======================================================================
-- 5. Calabasas Style — insert sizes. Placement premiums (IFC/IBC/Back
--    Cover/Page 3/Page 5) deferred; they belong to the global placement-
--    flag model.
-- =======================================================================
insert into ad_sizes (pub_id, name, dims, width, height, rate, rate_6, rate_12, sort_order) values
  ('pub-calabasas-style', 'Full Page',     '8.875 x 11.375', 8.875, 11.375, 1800, 1700, 1600, 1),
  ('pub-calabasas-style', '1/2 Page H',    '7.125 x 4.825',  7.125, 4.825,  1100, 1050, 1000, 2),
  ('pub-calabasas-style', '1/2 Page V',    '3.5 x 9.875',    3.5,   9.875,  1100, 1050, 1000, 3),
  ('pub-calabasas-style', '1/4 Page',      '3.5 x 4.825',    3.5,   4.825,  650,  600,  550,  4),
  ('pub-calabasas-style', '2-Page Spread', '16.75 x 10.875', 16.75, 10.875, 3400, 3000, 2800, 5);

-- =======================================================================
-- 6. Central Coast Living — insert sizes. Kit uses Open / 3x / 6x; mapped
--    to rate / rate_6 / rate_12.
-- =======================================================================
insert into ad_sizes (pub_id, name, dims, width, height, rate, rate_6, rate_12, sort_order) values
  ('pub-central-coast-living', 'Full Page',  '8.375 x 10.875',  8.375,  10.875, 1800, 1450, 1350, 1),
  ('pub-central-coast-living', '1/2 Page V', '3.8125 x 10.125', 3.8125, 10.125, 1050, 950,  850,  2),
  ('pub-central-coast-living', '1/2 Page H', '7.75 x 5',        7.75,   5,      1050, 950,  850,  3),
  ('pub-central-coast-living', '1/4 Page V', '3.8125 x 5',      3.8125, 5,      800,  700,  600,  4);

-- =======================================================================
-- 7. What To Do In Malibu — insert non-placement sizes only. WTDIM is
--    semi-annual with no frequency discount, so rate_6/rate_12 = 0.
--    Placement positions (Back Cover, IFC, IBC, First RH, Map Cover/Back/
--    Sponsor) deferred to the global placement-flag model.
-- =======================================================================
insert into ad_sizes (pub_id, name, dims, width, height, rate, rate_6, rate_12, sort_order) values
  ('pub-what-to-do-malibu', 'Full Page',     '8.375 x 10.875',  8.375,  10.875, 2235, 0, 0, 1),
  ('pub-what-to-do-malibu', '1/2 Page V',    '3.8125 x 10.125', 3.8125, 10.125, 1386, 0, 0, 2),
  ('pub-what-to-do-malibu', '1/2 Page H',    '7.75 x 5',        7.75,   5,      1386, 0, 0, 3),
  ('pub-what-to-do-malibu', '1/3 Page',      '2.25 x 10.125',   2.25,   10.125, 935,  0, 0, 4),
  ('pub-what-to-do-malibu', '1/4 Page',      '3.8125 x 5',      3.8125, 5,      770,  0, 0, 5),
  ('pub-what-to-do-malibu', '2-Page Spread', '16.75 x 10.875',  16.75,  10.875, 3823, 0, 0, 6);
