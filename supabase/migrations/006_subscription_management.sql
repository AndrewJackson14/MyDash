-- ============================================================
-- 006: Subscription Management
-- Normalized subscriber → subscriptions → payments model
-- Replaces SimpleCirc; extends existing subscribers table
-- ============================================================

-- Add new statuses to subscriber_status enum (ignore if already exists)
do $$ begin alter type subscriber_status add value 'on_hold'; exception when duplicate_object then null; end $$;
do $$ begin alter type subscriber_status add value 'bad_address'; exception when duplicate_object then null; end $$;
do $$ begin alter type subscriber_status add value 'deceased'; exception when duplicate_object then null; end $$;
do $$ begin alter type subscriber_status add value 'other'; exception when duplicate_object then null; end $$;

-- Add company_name and stripe_customer_id to subscribers
alter table subscribers add column if not exists company_name text default '';
alter table subscribers add column if not exists stripe_customer_id text;

-- ============================================================
-- Drop and recreate subscriptions (may exist from SQL editor with wrong schema)
-- ============================================================
drop table if exists subscription_payments cascade;
drop table if exists mailing_lists cascade;
drop table if exists subscriptions cascade;

-- ============================================================
-- SUBSCRIPTIONS — one per subscriber×publication instance
-- ============================================================
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references subscribers(id) on delete cascade,
  publication_id text not null references publications(id) on delete cascade,
  tier text not null default 'print_12mo',
  status text not null default 'active',
  start_date date default current_date,
  end_date date,
  auto_renew boolean default true,
  stripe_subscription_id text,
  amount_paid numeric(10,2) default 0,
  payment_method text default '',
  copies int default 1,
  renewed_from uuid references subscriptions(id),
  paused_at timestamptz,
  cancelled_at timestamptz,
  notes text default '',
  price_description text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_subscriptions_subscriber on subscriptions(subscriber_id);
create index idx_subscriptions_pub on subscriptions(publication_id);
create index idx_subscriptions_status on subscriptions(status);
create index idx_subscriptions_end_date on subscriptions(end_date);

-- ============================================================
-- SUBSCRIPTION PAYMENTS — ledger for all transactions
-- ============================================================
create table subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  amount numeric(10,2) not null default 0,
  method text not null default 'card',
  stripe_payment_id text,
  check_number text,
  status text not null default 'completed',
  quickbooks_synced boolean default false,
  notes text default '',
  paid_at timestamptz default now()
);

create index idx_sub_payments_subscription on subscription_payments(subscription_id);
create index idx_sub_payments_status on subscription_payments(status);

-- ============================================================
-- MAILING LISTS — generated per publication per issue
-- ============================================================
create table mailing_lists (
  id uuid primary key default gen_random_uuid(),
  publication_id text not null references publications(id) on delete cascade,
  issue_id text references issues(id),
  generated_at timestamptz default now(),
  record_count int default 0,
  csv_url text,
  xlsx_url text,
  sent_to_printer boolean default false,
  sent_to_fulfillment boolean default false,
  generated_by text,
  notes text default ''
);

create index idx_mailing_lists_pub on mailing_lists(publication_id);

-- ============================================================
-- Enable RLS on new tables
-- ============================================================
alter table subscriptions enable row level security;
alter table subscription_payments enable row level security;
alter table mailing_lists enable row level security;

-- Allow authenticated users full access
create policy "subscriptions_all" on subscriptions for all using (true) with check (true);
create policy "subscription_payments_all" on subscription_payments for all using (true) with check (true);
create policy "mailing_lists_all" on mailing_lists for all using (true) with check (true);
