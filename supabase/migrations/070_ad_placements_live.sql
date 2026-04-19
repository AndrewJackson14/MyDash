-- Migration 070: ad_placements (digital live-serving table) (Phase 2 of Digital Ad Workflow)
--
-- This is the NEW ad_placements — the table StellarPress reads to serve
-- live digital ads on each site. The OLD ad_placements (print premium
-- positions catalog) was renamed to print_placements in migration 066,
-- freeing this name for its proper purpose.
--
-- One row per (zone × flight). Created automatically by the Phase 5
-- trigger create_placement_on_digital_approval when an ad_project is
-- signed off. Deactivated nightly by the cron job below.
--
-- WebAds.jsx + SiteSettings.jsx have been writing/reading against an
-- imagined version of this table since they shipped — this migration
-- finally makes that table real (with the schema those files always
-- assumed). Phase 6 (MySites) replaces those files entirely; this
-- table powers their replacement.

create table ad_placements (
  id              uuid primary key default uuid_generate_v4(),
  ad_zone_id      uuid not null references ad_zones(id) on delete cascade,
  ad_project_id   uuid references ad_projects(id) on delete set null,
  sale_id         uuid references sales(id) on delete set null,
  client_id       uuid references clients(id) on delete set null,

  -- Creative
  creative_url    text,
  creative_html   text,                    -- HTML5 / rich-media ads
  click_url       text,
  alt_text        text,

  -- Flight
  start_date      date not null,
  end_date        date not null,
  is_active       boolean not null default true,

  -- Activation tracking
  activated_by    uuid references team_members(id),
  activated_at    timestamptz,
  deactivated_by  uuid references team_members(id),
  deactivated_at  timestamptz,

  -- Performance counters (incremented by edge function logging impressions/clicks)
  impressions     bigint not null default 0,
  clicks          bigint not null default 0,

  created_at      timestamptz not null default now()
);

create index idx_ad_placements_zone_active on ad_placements(ad_zone_id, is_active, end_date);
create index idx_ad_placements_sale on ad_placements(sale_id) where sale_id is not null;
create index idx_ad_placements_active_window on ad_placements(start_date, end_date) where is_active = true;

alter table ad_placements enable row level security;
create policy "ad_placements_read"      on ad_placements for select using (true);
create policy "ad_placements_write_ins" on ad_placements for insert with check (has_permission('admin'));
create policy "ad_placements_write_upd" on ad_placements for update using (has_permission('admin'));
create policy "ad_placements_write_del" on ad_placements for delete using (has_permission('admin'));

-- Nightly cron: deactivate placements whose flight has ended.
create or replace function deactivate_expired_placements()
returns void
language plpgsql
security definer
as $$
begin
  update ad_placements
     set is_active     = false,
         deactivated_at = now()
   where is_active = true
     and end_date < current_date;
end;
$$;

-- pg_cron schedule (3am daily) — extension already installed.
select cron.schedule(
  'deactivate-expired-placements',
  '0 3 * * *',
  $$select deactivate_expired_placements()$$
);
