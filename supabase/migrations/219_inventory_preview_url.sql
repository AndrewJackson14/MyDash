-- 219 — Inventory preview images.
--
-- Lets the Browse-and-Book catalog (StellarPress) render a thumbnail
-- per ad size / digital product so customers can see what each item
-- looks like at a glance, instead of choosing from text-only tiles.
--
-- Image upload happens in the MyDash Publications-modal Rate Card
-- editor (for ad_sizes) and MySites Digital Catalog tab (for
-- digital_ad_products). Stored as CDN URLs from the existing
-- uploadMedia helper.

alter table ad_sizes            add column if not exists preview_url text;
alter table digital_ad_products add column if not exists preview_url text;

comment on column ad_sizes.preview_url            is 'CDN URL for a preview/thumbnail image shown in the Browse-and-Book catalog and rep-side rate-card editor.';
comment on column digital_ad_products.preview_url is 'CDN URL for a preview/thumbnail image shown in the Browse-and-Book catalog and the per-pub digital catalog editor.';
