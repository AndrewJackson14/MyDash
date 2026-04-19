-- Migration 071: delivery_reports + schedules (Phase 2 of Digital Ad Workflow)
--
-- Per-campaign performance reports. Cadence is set at proposal time, posted
-- to the client profile, and emailed to a designated client contact. The
-- generator is an edge function (Phase 7) that fires off the schedule rows.

create type delivery_report_cadence as enum ('weekly','monthly','end_of_flight','annual');
create type delivery_report_status  as enum ('draft','scheduled','sent','failed');

create table delivery_reports (
  id                   uuid primary key default uuid_generate_v4(),
  sale_id              uuid not null references sales(id) on delete cascade,
  client_id            uuid not null references clients(id) on delete cascade,
  contact_id           uuid references client_contacts(id) on delete set null,
  cadence              delivery_report_cadence not null,
  period_start         date not null,
  period_end           date not null,

  -- Metrics captured at generation time (snapshot — placements may change later)
  impressions          bigint not null default 0,
  clicks               bigint not null default 0,
  ctr                  numeric(5,2) not null default 0,
  placements_covered   uuid[] not null default '{}'::uuid[],   -- ad_placements rows fed this report
  flight_progress_pct  numeric(5,2),                            -- % of contracted term elapsed
  spend_billed         numeric(10,2) not null default 0,

  -- Delivery
  status               delivery_report_status not null default 'draft',
  pdf_url              text,                                   -- BunnyCDN URL
  html_snapshot        text,                                   -- rendered HTML for client profile inline view
  sent_at              timestamptz,
  sent_to_email        text,
  send_error           text,

  -- Re-send tracking
  resent_count         int not null default 0,
  last_resent_at       timestamptz,

  created_at           timestamptz not null default now()
);

create index idx_delivery_reports_sale   on delivery_reports(sale_id, period_end desc);
create index idx_delivery_reports_client on delivery_reports(client_id, created_at desc);

alter table delivery_reports enable row level security;
create policy "delivery_reports_read"      on delivery_reports for select using (true);
create policy "delivery_reports_write_ins" on delivery_reports for insert with check (has_permission('admin'));
create policy "delivery_reports_write_upd" on delivery_reports for update using (has_permission('admin'));
create policy "delivery_reports_write_del" on delivery_reports for delete using (has_permission('admin'));

-- One schedule row per active campaign. Drives the generator's "what to run
-- tonight" query. Updated on each report fire (advances next_run_at) and
-- when the cadence/contact changes mid-flight.
create table delivery_report_schedules (
  id           uuid primary key default uuid_generate_v4(),
  sale_id      uuid not null references sales(id) on delete cascade,
  contact_id   uuid references client_contacts(id) on delete set null,
  cadence      delivery_report_cadence not null default 'monthly',
  next_run_at  timestamptz not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (sale_id)
);

create index idx_delivery_schedules_next on delivery_report_schedules(next_run_at) where is_active = true;

alter table delivery_report_schedules enable row level security;
create policy "delivery_schedules_read"      on delivery_report_schedules for select using (true);
create policy "delivery_schedules_write_ins" on delivery_report_schedules for insert with check (has_permission('admin'));
create policy "delivery_schedules_write_upd" on delivery_report_schedules for update using (has_permission('admin'));
create policy "delivery_schedules_write_del" on delivery_report_schedules for delete using (has_permission('admin'));

create trigger tr_delivery_schedules_updated
  before update on delivery_report_schedules
  for each row execute function update_updated_at();

-- Proposal-level cadence + recipient (per spec: cadence is proposal-level,
-- not per-line). convert_proposal_to_contract reads these to seed the
-- delivery_report_schedules row(s) for any digital sales it creates.
alter table proposals
  add column if not exists delivery_report_cadence    delivery_report_cadence,
  add column if not exists delivery_report_contact_id uuid references client_contacts(id) on delete set null;
