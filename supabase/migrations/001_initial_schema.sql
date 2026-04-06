-- ============================================================
-- 13 Stars Media PubHub — Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
create type pub_type as enum ('Magazine', 'Newspaper');
create type pub_frequency as enum ('Weekly', 'Bi-Weekly', 'Bi-Monthly', 'Monthly', 'Quarterly', 'Semi-Annual', 'Annual');
create type client_status as enum ('Lead', 'Active', 'Inactive');
create type sale_status as enum ('Discovery', 'Presentation', 'Proposal', 'Negotiation', 'Closed', 'Follow-up');
create type proposal_status as enum ('Draft', 'Sent', 'Under Review', 'Approved/Signed', 'Expired');
create type story_status as enum ('Draft', 'Needs Editing', 'Edited', 'Approved', 'On Page', 'Sent to Web');
create type comm_type as enum ('Email', 'Phone', 'Text', 'Comment');
create type action_type as enum ('call', 'email', 'meeting', 'send_kit', 'send_proposal', 'review_proposal', 'follow_up', 'task');
create type team_role as enum (
  'Publisher', 'Editor-in-Chief', 'Managing Editor', 'Editor',
  'Writer/Reporter', 'Stringer', 'Copy Editor', 'Photo Editor',
  'Graphic Designer', 'Sales Manager', 'Salesperson',
  'Distribution Manager', 'Marketing Manager', 'Production Manager',
  'Finance', 'Office Manager'
);

-- ============================================================
-- CORE TABLES
-- ============================================================

-- Publications
create table publications (
  id text primary key,
  name text not null,
  color text default '#4B8BF5',
  type pub_type not null,
  page_count int default 24,
  width numeric(6,3) not null,
  height numeric(6,3) not null,
  frequency pub_frequency not null,
  circulation int default 0,
  pub_day_of_week int, -- 0=Sun, 1=Mon... for newspapers
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Ad sizes per publication
create table ad_sizes (
  id uuid primary key default uuid_generate_v4(),
  pub_id text references publications(id) on delete cascade,
  name text not null,
  dims text not null,
  width numeric(6,3) not null,
  height numeric(6,3) not null,
  rate int not null, -- base rate (1-5 insertions)
  rate_6 int not null, -- 6-11 insertions
  rate_12 int not null, -- 12+ insertions
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Issues (generated per publication)
create table issues (
  id text primary key,
  pub_id text references publications(id) on delete cascade,
  label text not null,
  date date not null,
  page_count int not null,
  ad_deadline date,
  ed_deadline date,
  status text default 'Scheduled',
  created_at timestamptz default now()
);
create index idx_issues_pub_date on issues(pub_id, date);

-- Team members (linked to Supabase auth)
create table team_members (
  id uuid primary key default uuid_generate_v4(),
  auth_id uuid references auth.users(id) on delete set null, -- link to Supabase Auth
  name text not null,
  role team_role not null,
  email text unique not null,
  phone text default '',
  avatar_url text,
  alerts text[] default '{}',
  assigned_pubs text[] default '{all}',
  permissions text[] default '{}',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_team_email on team_members(email);
create index idx_team_auth on team_members(auth_id);

-- Clients
create table clients (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  status client_status default 'Lead',
  total_spend numeric(12,2) default 0,
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_clients_name on clients(name);

-- Client contacts (one-to-many)
create table client_contacts (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  email text default '',
  phone text default '',
  role text default 'Business Owner',
  is_primary boolean default false,
  created_at timestamptz default now()
);
create index idx_contacts_client on client_contacts(client_id);

-- Client communications log
create table communications (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade,
  type comm_type not null,
  author_id uuid references team_members(id),
  author_name text not null,
  note text not null,
  date date default current_date,
  created_at timestamptz default now()
);
create index idx_comms_client on communications(client_id);
create index idx_comms_date on communications(date desc);

-- Sales pipeline
create table sales (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade,
  publication_id text references publications(id),
  issue_id text references issues(id),
  ad_type text default 'TBD',
  ad_size text default '',
  ad_width numeric(6,3) default 0,
  ad_height numeric(6,3) default 0,
  amount numeric(10,2) default 0,
  status sale_status default 'Discovery',
  date date default current_date,
  closed_at timestamptz,
  -- Flatplan placement
  page int,
  grid_row int,
  grid_col int,
  -- Next action
  next_action_type action_type,
  next_action_label text,
  next_action_date date,
  -- Linked proposal
  proposal_id uuid,
  -- Assigned salesperson
  assigned_to uuid references team_members(id),
  notes jsonb default '[]', -- array of {text, time, date}
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_sales_client on sales(client_id);
create index idx_sales_status on sales(status);
create index idx_sales_issue on sales(issue_id);
create index idx_sales_assigned on sales(assigned_to);

-- Proposals
create table proposals (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  term text default '',
  term_months int default 1,
  total numeric(10,2) default 0,
  pay_plan boolean default false,
  monthly numeric(10,2) default 0,
  status proposal_status default 'Draft',
  date date default current_date,
  renewal_date date,
  closed_at timestamptz,
  sent_to text[] default '{}',
  created_by uuid references team_members(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_proposals_client on proposals(client_id);
create index idx_proposals_status on proposals(status);

-- Proposal line items
create table proposal_lines (
  id uuid primary key default uuid_generate_v4(),
  proposal_id uuid references proposals(id) on delete cascade,
  pub_id text references publications(id),
  pub_name text not null,
  ad_size text not null,
  dims text default '',
  ad_width numeric(6,3) default 0,
  ad_height numeric(6,3) default 0,
  issue_id text references issues(id),
  issue_label text not null,
  price numeric(10,2) not null,
  sort_order int default 0
);
create index idx_prop_lines_proposal on proposal_lines(proposal_id);

-- Stories
create table stories (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  author_id uuid references team_members(id),
  author_name text not null,
  status story_status default 'Draft',
  publication_id text references publications(id),
  issue_id text references issues(id),
  assigned_to uuid references team_members(id),
  assigned_to_name text default '',
  due_date date,
  images int default 0,
  word_count int default 0,
  category text default 'News',
  content text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_stories_pub on stories(publication_id);
create index idx_stories_status on stories(status);
create index idx_stories_due on stories(due_date);

-- Calendar events
create table calendar_events (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  date date not null,
  time time default '10:00',
  duration int default 30, -- minutes
  type action_type default 'call',
  client_id uuid references clients(id),
  sale_id uuid references sales(id),
  notes text default '',
  created_by uuid references team_members(id),
  google_event_id text, -- for Google Calendar sync
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_events_date on calendar_events(date);
create index idx_events_client on calendar_events(client_id);

-- Notifications
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references team_members(id) on delete cascade,
  text text not null,
  route text, -- page to navigate to
  route_id text, -- specific entity ID
  read boolean default false,
  created_at timestamptz default now()
);
create index idx_notifs_user on notifications(user_id, read, created_at desc);

-- Flatplan sections
create table flatplan_sections (
  id uuid primary key default uuid_generate_v4(),
  issue_id text references issues(id) on delete cascade,
  after_page int not null,
  label text not null,
  sort_order int default 0
);

-- Flatplan placeholders
create table flatplan_placeholders (
  id uuid primary key default uuid_generate_v4(),
  issue_id text references issues(id) on delete cascade,
  ad_size_name text not null,
  ad_width numeric(6,3) not null,
  ad_height numeric(6,3) not null,
  dims text default '',
  label text default '',
  page int,
  grid_row int,
  grid_col int
);

-- Page story assignments (flatplan editorial)
create table page_stories (
  id uuid primary key default uuid_generate_v4(),
  issue_id text references issues(id) on delete cascade,
  page_num int not null,
  story_id uuid references stories(id) on delete cascade,
  unique(issue_id, page_num, story_id)
);

-- Activity log
create table activity_log (
  id uuid primary key default uuid_generate_v4(),
  text text not null,
  type text not null, -- 'pipeline', 'proposal', 'opp', 'comm'
  client_id uuid references clients(id),
  client_name text,
  user_id uuid references team_members(id),
  created_at timestamptz default now()
);
create index idx_activity_date on activity_log(created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
alter table publications enable row level security;
alter table ad_sizes enable row level security;
alter table issues enable row level security;
alter table team_members enable row level security;
alter table clients enable row level security;
alter table client_contacts enable row level security;
alter table communications enable row level security;
alter table sales enable row level security;
alter table proposals enable row level security;
alter table proposal_lines enable row level security;
alter table stories enable row level security;
alter table calendar_events enable row level security;
alter table notifications enable row level security;
alter table flatplan_sections enable row level security;
alter table flatplan_placeholders enable row level security;
alter table page_stories enable row level security;
alter table activity_log enable row level security;

-- Helper function: get current user's team member record
create or replace function get_current_team_member()
returns uuid as $$
  select id from team_members where auth_id = auth.uid() limit 1;
$$ language sql security definer stable;

-- Helper: check if current user has a permission
create or replace function has_permission(perm text)
returns boolean as $$
  select exists(
    select 1 from team_members
    where auth_id = auth.uid()
    and (permissions @> array[perm] or permissions @> array['admin'])
  );
$$ language sql security definer stable;

-- Publications: everyone can read, admins can write
create policy "publications_read" on publications for select using (true);
create policy "publications_write_ins" on publications for insert with check (has_permission('admin'));
create policy "publications_write_upd" on publications for update using (has_permission('admin'));
create policy "publications_write_del" on publications for delete using (has_permission('admin'));

-- Ad sizes: everyone can read, admins can write
create policy "ad_sizes_read" on ad_sizes for select using (true);
create policy "ad_sizes_write_ins" on ad_sizes for insert with check (has_permission('admin'));
create policy "ad_sizes_write_upd" on ad_sizes for update using (has_permission('admin'));
create policy "ad_sizes_write_del" on ad_sizes for delete using (has_permission('admin'));

-- Issues: everyone can read, admins can write
create policy "issues_read" on issues for select using (true);
create policy "issues_write_ins" on issues for insert with check (has_permission('admin'));
create policy "issues_write_upd" on issues for update using (has_permission('admin'));
create policy "issues_write_del" on issues for delete using (has_permission('admin'));

-- Team: everyone can read, admins can write
create policy "team_read" on team_members for select using (true);
create policy "team_write_ins" on team_members for insert with check (has_permission('admin'));
create policy "team_write_upd" on team_members for update using (has_permission('admin'));
create policy "team_write_del" on team_members for delete using (has_permission('admin'));

-- Clients: sales + admin can read/write
create policy "clients_read" on clients for select using (
  has_permission('admin') or has_permission('sales') or has_permission('clients')
);
create policy "clients_write_ins" on clients for insert with check (has_permission('admin') or has_permission('sales') or has_permission('clients'));
create policy "clients_write_upd" on clients for update using (has_permission('admin') or has_permission('sales') or has_permission('clients'));
create policy "clients_write_del" on clients for delete using (has_permission('admin') or has_permission('sales') or has_permission('clients'));

-- Client contacts: same as clients
create policy "contacts_read" on client_contacts for select using (
  has_permission('admin') or has_permission('sales') or has_permission('clients')
);
create policy "contacts_write_ins" on client_contacts for insert with check (has_permission('admin') or has_permission('sales') or has_permission('clients'));
create policy "contacts_write_upd" on client_contacts for update using (has_permission('admin') or has_permission('sales') or has_permission('clients'));
create policy "contacts_write_del" on client_contacts for delete using (has_permission('admin') or has_permission('sales') or has_permission('clients'));

-- Communications: sales + admin
create policy "comms_read" on communications for select using (
  has_permission('admin') or has_permission('sales') or has_permission('clients')
);
create policy "comms_write" on communications for insert with check (true); -- anyone can log comms

-- Sales: sales team + admin
create policy "sales_read" on sales for select using (
  has_permission('admin') or has_permission('sales')
);
create policy "sales_write_ins" on sales for insert with check (has_permission('admin') or has_permission('sales'));
create policy "sales_write_upd" on sales for update using (has_permission('admin') or has_permission('sales'));
create policy "sales_write_del" on sales for delete using (has_permission('admin') or has_permission('sales'));

-- Proposals: sales + admin
create policy "proposals_read" on proposals for select using (
  has_permission('admin') or has_permission('sales')
);
create policy "proposals_write_ins" on proposals for insert with check (has_permission('admin') or has_permission('sales'));
create policy "proposals_write_upd" on proposals for update using (has_permission('admin') or has_permission('sales'));
create policy "proposals_write_del" on proposals for delete using (has_permission('admin') or has_permission('sales'));

-- Proposal lines: same as proposals
create policy "prop_lines_read" on proposal_lines for select using (
  has_permission('admin') or has_permission('sales')
);
create policy "prop_lines_write_ins" on proposal_lines for insert with check (has_permission('admin') or has_permission('sales'));
create policy "prop_lines_write_upd" on proposal_lines for update using (has_permission('admin') or has_permission('sales'));
create policy "prop_lines_write_del" on proposal_lines for delete using (has_permission('admin') or has_permission('sales'));

-- Stories: editorial + stories + admin
create policy "stories_read" on stories for select using (
  has_permission('admin') or has_permission('editorial') or has_permission('stories')
);
create policy "stories_write_ins" on stories for insert with check (has_permission('admin') or has_permission('editorial') or has_permission('stories'));
create policy "stories_write_upd" on stories for update using (has_permission('admin') or has_permission('editorial') or has_permission('stories'));
create policy "stories_write_del" on stories for delete using (has_permission('admin') or has_permission('editorial') or has_permission('stories'));

-- Calendar: everyone can read, anyone can create
create policy "events_read" on calendar_events for select using (true);
create policy "events_write_ins" on calendar_events for insert with check (true);
create policy "events_write_upd" on calendar_events for update using (true);
create policy "events_write_del" on calendar_events for delete using (true);

-- Notifications: user can only see their own
create policy "notifs_own" on notifications for select using (
  user_id = get_current_team_member()
);
create policy "notifs_write" on notifications for insert with check (true);
create policy "notifs_update" on notifications for update using (
  user_id = get_current_team_member()
);

-- Flatplan: editorial + flatplan + admin
create policy "flatplan_sections_read" on flatplan_sections for select using (true);
create policy "flatplan_sections_write_ins" on flatplan_sections for insert with check (has_permission('admin') or has_permission('editorial') or has_permission('flatplan'));
create policy "flatplan_sections_write_upd" on flatplan_sections for update using (has_permission('admin') or has_permission('editorial') or has_permission('flatplan'));
create policy "flatplan_sections_write_del" on flatplan_sections for delete using (has_permission('admin') or has_permission('editorial') or has_permission('flatplan'));
create policy "flatplan_ph_read" on flatplan_placeholders for select using (true);
create policy "flatplan_ph_write_ins" on flatplan_placeholders for insert with check (has_permission('admin') or has_permission('editorial') or has_permission('flatplan'));
create policy "flatplan_ph_write_upd" on flatplan_placeholders for update using (has_permission('admin') or has_permission('editorial') or has_permission('flatplan'));
create policy "flatplan_ph_write_del" on flatplan_placeholders for delete using (has_permission('admin') or has_permission('editorial') or has_permission('flatplan'));
create policy "page_stories_read" on page_stories for select using (true);
create policy "page_stories_write_ins" on page_stories for insert with check (has_permission('admin') or has_permission('editorial') or has_permission('flatplan'));
create policy "page_stories_write_upd" on page_stories for update using (has_permission('admin') or has_permission('editorial') or has_permission('flatplan'));
create policy "page_stories_write_del" on page_stories for delete using (has_permission('admin') or has_permission('editorial') or has_permission('flatplan'));

-- Activity log: everyone can read, anyone can write
create policy "activity_read" on activity_log for select using (true);
create policy "activity_write" on activity_log for insert with check (true);

-- ============================================================
-- TRIGGERS: auto-update updated_at
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tr_publications_updated before update on publications for each row execute function update_updated_at();
create trigger tr_clients_updated before update on clients for each row execute function update_updated_at();
create trigger tr_sales_updated before update on sales for each row execute function update_updated_at();
create trigger tr_proposals_updated before update on proposals for each row execute function update_updated_at();
create trigger tr_stories_updated before update on stories for each row execute function update_updated_at();
create trigger tr_events_updated before update on calendar_events for each row execute function update_updated_at();
create trigger tr_team_updated before update on team_members for each row execute function update_updated_at();

-- ============================================================
-- REALTIME: enable for key tables
-- ============================================================
alter publication supabase_realtime add table sales;
alter publication supabase_realtime add table proposals;
alter publication supabase_realtime add table stories;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table communications;
alter publication supabase_realtime add table calendar_events;
alter publication supabase_realtime add table activity_log;
