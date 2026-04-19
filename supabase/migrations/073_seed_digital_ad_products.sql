-- Migration 073: Seed digital_ad_products from web_ad_rates (Phase 2 of Digital Ad Workflow)
--
-- web_ad_rates is the legacy catalog (one row per sellable web product per
-- pub). We copy the active rows into digital_ad_products with derived slugs
-- and best-effort zone matching by slug. zone_id stays NULL where no zone
-- match exists — the operator can wire zones in MySites later.
--
-- Skip rows from pub-digital-ad-svc that aren't actually digital ads
-- (Web Design & Development, Web Hosting are services, not ad products).
-- Programmatic — Display Basic/Blend ARE ad products and get carried.

insert into digital_ad_products (
  pub_id, name, slug, zone_id, product_type,
  description, rate_monthly, rate_6mo, rate_12mo,
  sort_order, is_active
)
select
  w.pub_id,
  w.name,
  -- slug = lowercase, non-alphanumeric -> hyphens, trimmed
  trim(both '-' from regexp_replace(lower(w.name), '[^a-z0-9]+', '-', 'g')) as slug,
  -- zone match by slug similarity (best-effort; NULL is fine)
  (select z.id from ad_zones z
    where z.publication_id = w.pub_id
      and z.is_active = true
      and z.slug = trim(both '-' from regexp_replace(lower(w.name), '[^a-z0-9]+', '-', 'g'))
    limit 1) as zone_id,
  w.product_type::text,
  coalesce(w.description, ''),
  w.rate_monthly,
  w.rate_6mo,
  w.rate_12mo,
  coalesce(w.sort_order, 0),
  true
from web_ad_rates w
where w.is_active = true
  and not (w.pub_id = 'pub-digital-ad-svc' and w.name in ('Web Design & Development', 'Web Hosting'))
on conflict (pub_id, slug) do nothing;
