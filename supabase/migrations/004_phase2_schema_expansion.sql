-- ============================================================
-- 13 Stars Media MyDash — Phase 2 Schema Expansion
-- Addresses all 17 gaps identified in the Interaction Mesh
-- Run AFTER 001_initial_schema.sql
-- ============================================================

-- ============================================================
-- NEW ENUMS
-- ============================================================

-- Product types beyond print display ads
create type product_type as enum (
  'display_print',        -- Standard print display ad
  'classified',           -- Classified ad (newspapers only)
  'legal_notice',         -- Legal/public notice (newspapers only)
  'web_ad',               -- Website advertising
  'sponsored_content',    -- Sponsored content / advertorial (print)
  'newsletter_sponsor',   -- Sponsor placement in daily email
  'eblast',               -- Advertorial email to subscriber list
  'social_sponsor',       -- Sponsored social media post
  'creative_service'      -- A la carte design/layout/printing
);

-- Subscriber types
create type subscriber_type as enum ('print', 'digital');
create type subscriber_status as enum ('active', 'expired', 'cancelled', 'pending');

-- Service ticket
create type ticket_channel as enum ('phone', 'email', 'web_form', 'walk_in', 'other');
create type ticket_category as enum ('subscription', 'billing', 'ad_question', 'complaint', 'general', 'legal_notice', 'delivery');
create type ticket_status as enum ('open', 'in_progress', 'escalated', 'resolved', 'closed');

-- Invoice & payment
create type invoice_status as enum ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void');
create type payment_method as enum ('card', 'check', 'ach', 'cash', 'other');
create type billing_schedule as enum ('lump_sum', 'per_issue', 'monthly_plan');

-- Legal notice
create type legal_notice_type as enum ('fictitious_business', 'name_change', 'probate', 'trustee_sale', 'government', 'other');
create type legal_notice_status as enum ('received', 'proofing', 'approved', 'placed', 'published', 'billed');

-- Creative service job
create type job_status as enum ('quoted', 'approved', 'in_progress', 'proofing', 'complete', 'billed');

-- Driver route frequency
create type route_frequency as enum ('weekly', 'bi_weekly', 'monthly', 'per_issue');


-- ============================================================
-- 1. RATE CARD: Add rate_18 tier (25% discount at 18+ insertions)
-- ============================================================
alter table ad_sizes add column rate_18 int;

-- Backfill: estimate rate_18 as ~12% less than rate_12
update ad_sizes set rate_18 = round(rate_12 * 0.88) where rate_18 is null;


-- ============================================================
-- 2. WEB AD RATES — separate rate table for digital products
-- ============================================================
create table web_ad_rates (
  id uuid primary key default uuid_generate_v4(),
  pub_id text references publications(id) on delete cascade,
  name text not null,                    -- e.g. "Leaderboard", "Sidebar", "Newsletter Sponsor"
  product_type product_type not null,    -- web_ad, newsletter_sponsor, eblast, social_sponsor
  description text default '',
  rate_monthly numeric(10,2) not null,   -- base monthly rate (1-5 months)
  rate_6mo numeric(10,2),                -- 10% discount (6-11 months)
  rate_12mo numeric(10,2),               -- 25% discount (12+ months)
  is_active boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);
create index idx_web_rates_pub on web_ad_rates(pub_id);


-- ============================================================
-- 3. SALES: Add product_type to support all revenue streams
-- ============================================================
alter table sales add column product_type product_type default 'display_print';
alter table sales add column web_rate_id uuid references web_ad_rates(id);
alter table sales add column contract_months int default 0;
alter table sales add column placement_notes text default '';  -- competitor separation, specific page, etc.


-- ============================================================
-- 4. MULTI-PUBLICATION STORIES — junction table
--    Replaces the single publication_id/issue_id on stories
-- ============================================================
create table story_publications (
  id uuid primary key default uuid_generate_v4(),
  story_id uuid references stories(id) on delete cascade,
  publication_id text references publications(id) on delete cascade,
  issue_id text references issues(id),
  layout_notes text default '',          -- per-publication layout instructions
  photo_selection jsonb default '[]',    -- ranked image IDs for this pub
  status text default 'pending',         -- pending, placed, published
  created_at timestamptz default now(),
  unique(story_id, publication_id, issue_id)
);
create index idx_story_pubs_story on story_publications(story_id);
create index idx_story_pubs_pub on story_publications(publication_id);
create index idx_story_pubs_issue on story_publications(issue_id);


-- ============================================================
-- 5. SUBSCRIBERS (replaces SimpleCirc + WordPress subscribers)
-- ============================================================
create table subscribers (
  id uuid primary key default uuid_generate_v4(),
  type subscriber_type not null,
  status subscriber_status default 'active',
  -- Contact info
  first_name text not null,
  last_name text not null,
  email text default '',
  phone text default '',
  -- Mailing address (print subscribers)
  address_line1 text default '',
  address_line2 text default '',
  city text default '',
  state text default '',
  zip text default '',
  -- Subscription details
  publication_id text references publications(id),
  start_date date default current_date,
  expiry_date date,
  renewal_date date,
  amount_paid numeric(10,2) default 0,
  -- Metadata
  source text default '',                -- how they signed up
  notes text default '',
  qb_customer_id text,                   -- QuickBooks sync
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_subscribers_pub on subscribers(publication_id);
create index idx_subscribers_status on subscribers(status);
create index idx_subscribers_type on subscribers(type);
create index idx_subscribers_email on subscribers(email);
create index idx_subscribers_zip on subscribers(zip);
create index idx_subscribers_renewal on subscribers(renewal_date);


-- ============================================================
-- 6. DROP LOCATIONS (rack/newsstand distribution)
-- ============================================================
create table drop_locations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,                    -- business/location name
  location_type text default 'newsstand',-- newsstand, coffee_shop, hotel, business_center, etc.
  address text not null,
  city text default '',
  state text default 'CA',
  zip text default '',
  latitude numeric(10,7),
  longitude numeric(10,7),
  contact_name text default '',
  contact_phone text default '',
  notes text default '',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Which publications go to which drop locations, and how many
create table drop_location_pubs (
  id uuid primary key default uuid_generate_v4(),
  drop_location_id uuid references drop_locations(id) on delete cascade,
  publication_id text references publications(id) on delete cascade,
  quantity int not null default 0,
  unique(drop_location_id, publication_id)
);
create index idx_drop_pubs_location on drop_location_pubs(drop_location_id);
create index idx_drop_pubs_pub on drop_location_pubs(publication_id);


-- ============================================================
-- 7. DRIVER ROUTES
-- ============================================================
create table drivers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  phone text default '',
  email text default '',
  flat_fee numeric(10,2) default 0,      -- per-route payment
  notes text default '',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table driver_routes (
  id uuid primary key default uuid_generate_v4(),
  driver_id uuid references drivers(id) on delete set null,
  name text not null,                    -- route name / region
  frequency route_frequency default 'weekly',
  publication_id text references publications(id),
  notes text default '',
  is_active boolean default true,
  created_at timestamptz default now()
);
create index idx_routes_driver on driver_routes(driver_id);
create index idx_routes_pub on driver_routes(publication_id);

-- Link routes to drop locations
create table route_stops (
  id uuid primary key default uuid_generate_v4(),
  route_id uuid references driver_routes(id) on delete cascade,
  drop_location_id uuid references drop_locations(id) on delete cascade,
  stop_order int default 0,
  unique(route_id, drop_location_id)
);


-- ============================================================
-- 8. SERVICE TICKETS
-- ============================================================
create table service_tickets (
  id uuid primary key default uuid_generate_v4(),
  channel ticket_channel not null,
  category ticket_category not null,
  status ticket_status default 'open',
  priority int default 0,               -- 0=normal, 1=high, 2=urgent
  -- Who is it from
  contact_name text default '',
  contact_email text default '',
  contact_phone text default '',
  -- What is it about
  subject text not null,
  description text default '',
  -- Links to other entities
  client_id uuid references clients(id),
  subscriber_id uuid references subscribers(id),
  publication_id text references publications(id),
  issue_id text references issues(id),
  -- Assignment and resolution
  assigned_to uuid references team_members(id),
  escalated_to uuid references team_members(id),
  resolution_notes text default '',
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_tickets_status on service_tickets(status);
create index idx_tickets_assigned on service_tickets(assigned_to);
create index idx_tickets_client on service_tickets(client_id);
create index idx_tickets_created on service_tickets(created_at desc);

-- Ticket comments / activity
create table ticket_comments (
  id uuid primary key default uuid_generate_v4(),
  ticket_id uuid references service_tickets(id) on delete cascade,
  author_id uuid references team_members(id),
  author_name text not null,
  note text not null,
  is_internal boolean default false,     -- internal note vs customer-facing
  created_at timestamptz default now()
);
create index idx_ticket_comments on ticket_comments(ticket_id);


-- ============================================================
-- 9. LEGAL NOTICES
-- ============================================================
create table legal_notices (
  id uuid primary key default uuid_generate_v4(),
  -- Client info (may or may not be an existing client)
  client_id uuid references clients(id),
  contact_name text not null,
  contact_email text default '',
  contact_phone text default '',
  organization text default '',          -- law firm, agency, individual
  -- Notice details
  notice_type legal_notice_type not null,
  status legal_notice_status default 'received',
  content text not null,                 -- the actual notice text
  -- Publication details
  publication_id text references publications(id) not null,
  issues_requested int default 1,        -- how many issues to run
  -- Pricing (per-line or flat rate)
  rate_per_line numeric(8,2) default 0,
  line_count int default 0,
  flat_rate numeric(10,2) default 0,
  total_amount numeric(10,2) default 0,
  -- Workflow
  proof_approved_at timestamptz,
  placed_by uuid references team_members(id),  -- designer who placed it
  verified_by uuid references team_members(id), -- office manager verification
  verified_at timestamptz,
  -- Billing
  invoice_id uuid,                       -- linked after invoicing (FK added below)
  qb_invoice_id text,
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_legal_notices_pub on legal_notices(publication_id);
create index idx_legal_notices_status on legal_notices(status);
create index idx_legal_notices_client on legal_notices(client_id);

-- Track which issues a legal notice appears in
create table legal_notice_issues (
  id uuid primary key default uuid_generate_v4(),
  legal_notice_id uuid references legal_notices(id) on delete cascade,
  issue_id text references issues(id) on delete cascade,
  page_number int,
  unique(legal_notice_id, issue_id)
);


-- ============================================================
-- 10. INVOICES & PAYMENTS (MyDash commands, QuickBooks executes)
-- ============================================================
create table invoices (
  id uuid primary key default uuid_generate_v4(),
  -- Who it's for
  client_id uuid references clients(id),
  subscriber_id uuid references subscribers(id),
  -- Invoice details
  invoice_number text unique,            -- sequential, human-readable
  status invoice_status default 'draft',
  billing_schedule billing_schedule default 'lump_sum',
  -- Amounts
  subtotal numeric(12,2) default 0,
  discount_pct numeric(5,2) default 0,
  discount_amount numeric(12,2) default 0,
  tax numeric(12,2) default 0,
  total numeric(12,2) default 0,
  amount_paid numeric(12,2) default 0,
  balance_due numeric(12,2) default 0,
  -- Payment plan details
  monthly_amount numeric(10,2) default 0,
  plan_months int default 0,
  -- Dates
  issue_date date default current_date,
  due_date date,
  -- Who created it
  created_by uuid references team_members(id),
  -- QuickBooks sync
  qb_invoice_id text,
  qb_synced_at timestamptz,
  -- Metadata
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_invoices_client on invoices(client_id);
create index idx_invoices_status on invoices(status);
create index idx_invoices_due on invoices(due_date);
create index idx_invoices_qb on invoices(qb_invoice_id);

-- Invoice line items
create table invoice_lines (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid references invoices(id) on delete cascade,
  -- What was sold
  description text not null,
  product_type product_type,
  sale_id uuid references sales(id),
  legal_notice_id uuid references legal_notices(id),
  -- Amounts
  quantity int default 1,
  unit_price numeric(10,2) not null,
  total numeric(10,2) not null,
  sort_order int default 0
);
create index idx_invoice_lines on invoice_lines(invoice_id);

-- Payments received
create table payments (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid references invoices(id) on delete cascade,
  amount numeric(12,2) not null,
  method payment_method not null,
  -- Card / transaction details
  transaction_id text,                   -- from payment processor
  last_four text,                        -- last 4 digits of card
  -- QuickBooks sync
  qb_payment_id text,
  qb_synced_at timestamptz,
  -- Metadata
  received_by uuid references team_members(id),
  notes text default '',
  received_at timestamptz default now(),
  created_at timestamptz default now()
);
create index idx_payments_invoice on payments(invoice_id);
create index idx_payments_date on payments(received_at desc);

-- Now add the FK from legal_notices to invoices
alter table legal_notices
  add constraint fk_legal_notice_invoice
  foreign key (invoice_id) references invoices(id);


-- ============================================================
-- 11. FREELANCER PROFILES (extends team_members)
-- ============================================================
alter table team_members add column is_freelance boolean default false;
alter table team_members add column rate_type text default '';          -- 'per_piece', 'per_hour', 'flat'
alter table team_members add column rate_amount numeric(10,2) default 0;
alter table team_members add column specialties text[] default '{}';
alter table team_members add column availability text default '';       -- 'available', 'busy', 'unavailable'

-- Freelancer payment tracking
create table freelancer_payments (
  id uuid primary key default uuid_generate_v4(),
  freelancer_id uuid references team_members(id) on delete cascade,
  -- What the payment is for
  description text not null,
  story_id uuid references stories(id),
  -- Amount
  amount numeric(10,2) not null,
  -- QuickBooks sync
  qb_bill_id text,
  qb_synced_at timestamptz,
  -- Status
  status text default 'pending',         -- pending, approved, paid
  approved_by uuid references team_members(id),
  paid_at timestamptz,
  created_at timestamptz default now()
);
create index idx_freelancer_payments_freelancer on freelancer_payments(freelancer_id);
create index idx_freelancer_payments_status on freelancer_payments(status);


-- ============================================================
-- 12. PRINTER PROFILES
-- ============================================================
create table printers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  contact_name text default '',
  contact_email text default '',
  contact_phone text default '',
  portal_url text default '',            -- upload portal URL
  portal_notes text default '',          -- login info, instructions
  turnaround_days int default 1,         -- typical turnaround
  address text default '',
  notes text default '',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Which printer handles which publication
create table printer_publications (
  id uuid primary key default uuid_generate_v4(),
  printer_id uuid references printers(id) on delete cascade,
  publication_id text references publications(id) on delete cascade,
  is_default boolean default true,       -- default printer for this pub
  notes text default '',
  unique(printer_id, publication_id)
);
create index idx_printer_pubs on printer_publications(printer_id);


-- ============================================================
-- 13. CREATIVE SERVICE JOBS (a la carte work for outside clients)
-- ============================================================
create table creative_jobs (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id),
  -- Job details
  title text not null,
  description text default '',
  job_type text default 'design',        -- design, layout, printing, mixed
  status job_status default 'quoted',
  -- Assignment
  assigned_to uuid references team_members(id),
  -- Pricing & billing
  quoted_amount numeric(10,2) default 0,
  final_amount numeric(10,2) default 0,
  invoice_id uuid references invoices(id),
  -- Dates
  due_date date,
  completed_at timestamptz,
  -- Metadata
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_creative_jobs_client on creative_jobs(client_id);
create index idx_creative_jobs_status on creative_jobs(status);
create index idx_creative_jobs_assigned on creative_jobs(assigned_to);


-- ============================================================
-- 14. CLASSIFIED ADS
-- ============================================================
create table classified_rates (
  id uuid primary key default uuid_generate_v4(),
  pub_id text references publications(id) on delete cascade,
  name text not null,                    -- e.g. "Standard Line", "Bold Line", "Display Classified"
  rate_per_line numeric(8,2) default 0,
  rate_per_word numeric(8,2) default 0,
  min_lines int default 1,
  min_charge numeric(8,2) default 0,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table classified_ads (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id),
  publication_id text references publications(id) not null,
  issue_id text references issues(id),
  -- Ad details
  category text default 'General',       -- Jobs, Real Estate, Auto, Services, etc.
  content text not null,
  line_count int default 0,
  word_count int default 0,
  rate_id uuid references classified_rates(id),
  amount numeric(10,2) default 0,
  -- Workflow
  status text default 'received',        -- received, placed, published
  placed_page int,
  -- Billing
  invoice_id uuid references invoices(id),
  sale_id uuid references sales(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_classifieds_pub on classified_ads(publication_id);
create index idx_classifieds_issue on classified_ads(issue_id);
create index idx_classifieds_client on classified_ads(client_id);


-- ============================================================
-- 15. PRINT RUNS — track quantities per issue
-- ============================================================
create table print_runs (
  id uuid primary key default uuid_generate_v4(),
  issue_id text references issues(id) on delete cascade,
  printer_id uuid references printers(id),
  -- Quantities
  subscriber_copies int default 0,
  drop_location_copies int default 0,
  office_copies int default 0,
  total_copies int default 0,
  -- Costs
  cost_per_copy numeric(6,4) default 0,
  total_cost numeric(10,2) default 0,
  -- Status
  ordered_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  -- QuickBooks
  qb_bill_id text,
  notes text default '',
  created_at timestamptz default now()
);
create index idx_print_runs_issue on print_runs(issue_id);


-- ============================================================
-- 16. AUTOMATED BRIEFINGS (publisher daily/weekly digest)
-- ============================================================
create table briefing_configs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references team_members(id) on delete cascade,
  name text not null default 'Daily Briefing',
  frequency text default 'daily',        -- daily, weekly
  send_time time default '07:00',
  send_day int,                          -- day of week for weekly (0=Sun)
  -- What to include
  include_deadlines boolean default true,
  include_stories boolean default true,
  include_sales boolean default true,
  include_overdue boolean default true,
  include_print_schedule boolean default true,
  include_tickets boolean default false,
  is_active boolean default true,
  created_at timestamptz default now()
);


-- ============================================================
-- 17. MEDIA KITS / SALES COLLATERAL TRACKING
-- ============================================================
create table media_assets (
  id uuid primary key default uuid_generate_v4(),
  publication_id text references publications(id),
  asset_type text not null,              -- media_kit, rate_card, collateral, sample_issue
  title text not null,
  file_url text default '',              -- Supabase Storage or Synology path
  version int default 1,
  is_current boolean default true,       -- only latest version is current
  uploaded_by uuid references team_members(id),
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_media_assets_pub on media_assets(publication_id);
create index idx_media_assets_type on media_assets(asset_type);


-- ============================================================
-- ROW LEVEL SECURITY for new tables
-- ============================================================

-- Enable RLS
alter table web_ad_rates enable row level security;
alter table story_publications enable row level security;
alter table subscribers enable row level security;
alter table drop_locations enable row level security;
alter table drop_location_pubs enable row level security;
alter table drivers enable row level security;
alter table driver_routes enable row level security;
alter table route_stops enable row level security;
alter table service_tickets enable row level security;
alter table ticket_comments enable row level security;
alter table legal_notices enable row level security;
alter table legal_notice_issues enable row level security;
alter table invoices enable row level security;
alter table invoice_lines enable row level security;
alter table payments enable row level security;
alter table freelancer_payments enable row level security;
alter table printers enable row level security;
alter table printer_publications enable row level security;
alter table creative_jobs enable row level security;
alter table classified_rates enable row level security;
alter table classified_ads enable row level security;
alter table print_runs enable row level security;
alter table briefing_configs enable row level security;
alter table media_assets enable row level security;

-- ─── Read policies (most tables readable by relevant roles) ───

-- Web ad rates: everyone reads, admin writes
create policy "web_rates_read" on web_ad_rates for select using (true);
create policy "web_rates_write" on web_ad_rates for insert with check (has_permission('admin'));
create policy "web_rates_upd" on web_ad_rates for update using (has_permission('admin'));

-- Story publications: editorial + admin
create policy "story_pubs_read" on story_publications for select using (true);
create policy "story_pubs_write" on story_publications for insert with check (has_permission('admin') or has_permission('editorial'));
create policy "story_pubs_upd" on story_publications for update using (has_permission('admin') or has_permission('editorial'));
create policy "story_pubs_del" on story_publications for delete using (has_permission('admin') or has_permission('editorial'));

-- Subscribers: admin + clients (office manager)
create policy "subscribers_read" on subscribers for select using (has_permission('admin') or has_permission('clients'));
create policy "subscribers_write" on subscribers for insert with check (has_permission('admin') or has_permission('clients'));
create policy "subscribers_upd" on subscribers for update using (has_permission('admin') or has_permission('clients'));
create policy "subscribers_del" on subscribers for delete using (has_permission('admin'));

-- Drop locations & routes: admin + clients (distribution = office manager)
create policy "drops_read" on drop_locations for select using (true);
create policy "drops_write" on drop_locations for insert with check (has_permission('admin') or has_permission('clients'));
create policy "drops_upd" on drop_locations for update using (has_permission('admin') or has_permission('clients'));
create policy "drop_pubs_read" on drop_location_pubs for select using (true);
create policy "drop_pubs_write" on drop_location_pubs for insert with check (has_permission('admin') or has_permission('clients'));
create policy "drop_pubs_upd" on drop_location_pubs for update using (has_permission('admin') or has_permission('clients'));

-- Drivers & routes
create policy "drivers_read" on drivers for select using (true);
create policy "drivers_write" on drivers for insert with check (has_permission('admin') or has_permission('clients'));
create policy "drivers_upd" on drivers for update using (has_permission('admin') or has_permission('clients'));
create policy "routes_read" on driver_routes for select using (true);
create policy "routes_write" on driver_routes for insert with check (has_permission('admin') or has_permission('clients'));
create policy "routes_upd" on driver_routes for update using (has_permission('admin') or has_permission('clients'));
create policy "stops_read" on route_stops for select using (true);
create policy "stops_write" on route_stops for insert with check (has_permission('admin') or has_permission('clients'));

-- Service tickets: admin + clients (office manager reads all, others see assigned)
create policy "tickets_read" on service_tickets for select using (
  has_permission('admin') or has_permission('clients')
  or assigned_to = get_current_team_member()
  or escalated_to = get_current_team_member()
);
create policy "tickets_write" on service_tickets for insert with check (has_permission('admin') or has_permission('clients'));
create policy "tickets_upd" on service_tickets for update using (has_permission('admin') or has_permission('clients') or assigned_to = get_current_team_member());
create policy "ticket_comments_read" on ticket_comments for select using (true);
create policy "ticket_comments_write" on ticket_comments for insert with check (true);

-- Legal notices: admin + clients
create policy "legal_read" on legal_notices for select using (has_permission('admin') or has_permission('clients'));
create policy "legal_write" on legal_notices for insert with check (has_permission('admin') or has_permission('clients'));
create policy "legal_upd" on legal_notices for update using (has_permission('admin') or has_permission('clients'));
create policy "legal_issues_read" on legal_notice_issues for select using (true);
create policy "legal_issues_write" on legal_notice_issues for insert with check (has_permission('admin') or has_permission('clients'));

-- Invoices & payments: admin + sales + clients
create policy "invoices_read" on invoices for select using (has_permission('admin') or has_permission('sales') or has_permission('clients'));
create policy "invoices_write" on invoices for insert with check (has_permission('admin') or has_permission('sales') or has_permission('clients'));
create policy "invoices_upd" on invoices for update using (has_permission('admin') or has_permission('sales') or has_permission('clients'));
create policy "invoice_lines_read" on invoice_lines for select using (has_permission('admin') or has_permission('sales') or has_permission('clients'));
create policy "invoice_lines_write" on invoice_lines for insert with check (has_permission('admin') or has_permission('sales') or has_permission('clients'));
create policy "payments_read" on payments for select using (has_permission('admin') or has_permission('sales') or has_permission('clients'));
create policy "payments_write" on payments for insert with check (has_permission('admin') or has_permission('sales') or has_permission('clients'));

-- Freelancer payments: admin + finance
create policy "freelancer_pay_read" on freelancer_payments for select using (
  has_permission('admin') or freelancer_id = get_current_team_member()
);
create policy "freelancer_pay_write" on freelancer_payments for insert with check (has_permission('admin'));
create policy "freelancer_pay_upd" on freelancer_payments for update using (has_permission('admin'));

-- Printers: everyone reads, admin writes
create policy "printers_read" on printers for select using (true);
create policy "printers_write" on printers for insert with check (has_permission('admin'));
create policy "printers_upd" on printers for update using (has_permission('admin'));
create policy "printer_pubs_read" on printer_publications for select using (true);
create policy "printer_pubs_write" on printer_publications for insert with check (has_permission('admin'));

-- Creative jobs: admin + sales
create policy "jobs_read" on creative_jobs for select using (has_permission('admin') or has_permission('sales') or assigned_to = get_current_team_member());
create policy "jobs_write" on creative_jobs for insert with check (has_permission('admin') or has_permission('sales'));
create policy "jobs_upd" on creative_jobs for update using (has_permission('admin') or has_permission('sales') or assigned_to = get_current_team_member());

-- Classified rates & ads
create policy "class_rates_read" on classified_rates for select using (true);
create policy "class_rates_write" on classified_rates for insert with check (has_permission('admin'));
create policy "classifieds_read" on classified_ads for select using (has_permission('admin') or has_permission('sales') or has_permission('clients'));
create policy "classifieds_write" on classified_ads for insert with check (has_permission('admin') or has_permission('sales') or has_permission('clients'));
create policy "classifieds_upd" on classified_ads for update using (has_permission('admin') or has_permission('sales') or has_permission('clients'));

-- Print runs: everyone reads, admin writes
create policy "print_runs_read" on print_runs for select using (true);
create policy "print_runs_write" on print_runs for insert with check (has_permission('admin'));
create policy "print_runs_upd" on print_runs for update using (has_permission('admin'));

-- Briefing configs: user own only
create policy "briefings_own" on briefing_configs for select using (user_id = get_current_team_member());
create policy "briefings_write" on briefing_configs for insert with check (user_id = get_current_team_member());
create policy "briefings_upd" on briefing_configs for update using (user_id = get_current_team_member());

-- Media assets: everyone reads, admin + sales writes
create policy "media_read" on media_assets for select using (true);
create policy "media_write" on media_assets for insert with check (has_permission('admin') or has_permission('sales'));
create policy "media_upd" on media_assets for update using (has_permission('admin') or has_permission('sales'));


-- ============================================================
-- TRIGGERS: auto-update updated_at on new tables
-- ============================================================
create trigger tr_subscribers_updated before update on subscribers for each row execute function update_updated_at();
create trigger tr_drops_updated before update on drop_locations for each row execute function update_updated_at();
create trigger tr_drivers_updated before update on drivers for each row execute function update_updated_at();
create trigger tr_tickets_updated before update on service_tickets for each row execute function update_updated_at();
create trigger tr_legal_updated before update on legal_notices for each row execute function update_updated_at();
create trigger tr_invoices_updated before update on invoices for each row execute function update_updated_at();
create trigger tr_printers_updated before update on printers for each row execute function update_updated_at();
create trigger tr_jobs_updated before update on creative_jobs for each row execute function update_updated_at();
create trigger tr_classifieds_updated before update on classified_ads for each row execute function update_updated_at();
create trigger tr_media_updated before update on media_assets for each row execute function update_updated_at();


-- ============================================================
-- REALTIME: enable for key new tables
-- ============================================================
alter publication supabase_realtime add table invoices;
alter publication supabase_realtime add table payments;
alter publication supabase_realtime add table service_tickets;
alter publication supabase_realtime add table legal_notices;
alter publication supabase_realtime add table subscribers;
alter publication supabase_realtime add table creative_jobs;
alter publication supabase_realtime add table freelancer_payments;
