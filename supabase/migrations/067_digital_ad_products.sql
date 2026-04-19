-- Migration 067: digital_ad_products catalog (Phase 2 of Digital Ad Workflow)
--
-- Replaces the implicit web_ad_rates + ad_zones combination with a proper
-- catalog of sellable digital products per publication. Each row is one
-- thing a salesperson can put on a proposal line: "Leaderboard — Homepage,"
-- "Newsletter Sponsor — Friday," etc. Pricing tiers mirror print rate cards
-- (1mo / 6mo / 12mo).
--
-- web_ad_rates stays around for now (legacy data + still used by
-- src/pages/SiteSettings.jsx). It will be deprecated in Phase 6 (MySites).

create table digital_ad_products (
  id              uuid primary key default uuid_generate_v4(),
  pub_id          text not null references publications(id) on delete cascade,
  name            text not null,                                     -- "Leaderboard — Homepage"
  slug            text not null,                                     -- "leaderboard-home"
  zone_id         uuid references ad_zones(id) on delete set null,   -- which zone serves this ad
  product_type    text not null,                                     -- web_ad | newsletter_sponsor | eblast | social_sponsor | programmatic
  description     text default '',
  width           int,                                               -- null for non-display
  height          int,
  rate_monthly    numeric(10,2) not null,
  rate_6mo        numeric(10,2),                                     -- 10% discount tier
  rate_12mo       numeric(10,2),                                     -- 25% discount tier
  sort_order      int default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_digital_products_pub on digital_ad_products(pub_id, is_active);
create unique index idx_digital_products_slug on digital_ad_products(pub_id, slug);

alter table digital_ad_products enable row level security;
create policy "digital_products_read"      on digital_ad_products for select using (true);
create policy "digital_products_write_ins" on digital_ad_products for insert with check (has_permission('admin'));
create policy "digital_products_write_upd" on digital_ad_products for update using (has_permission('admin'));
create policy "digital_products_write_del" on digital_ad_products for delete using (has_permission('admin'));

-- updated_at trigger (matches existing pattern via update_updated_at()).
create trigger tr_digital_products_updated
  before update on digital_ad_products
  for each row execute function update_updated_at();

-- Proposal + contract lines reference this catalog for digital items, with
-- flight dates carried alongside (analogous to issue_id for print).
alter table proposal_lines
  add column if not exists digital_product_id uuid references digital_ad_products(id) on delete set null,
  add column if not exists flight_start_date  date,
  add column if not exists flight_end_date    date,
  add column if not exists flight_months      int;

alter table contract_lines
  add column if not exists digital_product_id uuid references digital_ad_products(id) on delete set null,
  add column if not exists flight_start_date  date,
  add column if not exists flight_end_date    date,
  add column if not exists flight_months      int;
