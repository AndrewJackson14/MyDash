-- ============================================================
-- MyDash — Realistic Seed Data (Forward-Looking)
-- Run AFTER 001_initial_schema.sql
-- 
-- IMPORTANT: Before running this file, run this command SEPARATELY:
--   ALTER TYPE story_status ADD VALUE IF NOT EXISTS 'Assigned' BEFORE 'Draft';
-- Then run this file.
-- ============================================================

-- Clear existing sample data (keep publications, ad_sizes, team_members)
delete from proposal_lines;
delete from proposals;
delete from sales;
delete from communications;
delete from client_contacts;
delete from clients;
delete from stories;
delete from notifications;
delete from activity_log;
delete from calendar_events;

-- ============================================================
-- CLIENTS — 15 realistic SLO County and Malibu businesses
-- ============================================================
insert into clients (id, name, status, total_spend) values
  (gen_random_uuid(), 'Conejo Hardwoods', 'Active', 204000),
  (gen_random_uuid(), 'UCLA Health Central Coast', 'Active', 111000),
  (gen_random_uuid(), 'Solarponics', 'Active', 89000),
  (gen_random_uuid(), 'Malik Real Estate Group', 'Active', 42000),
  (gen_random_uuid(), 'Five Star Rain Gutters', 'Active', 67000),
  (gen_random_uuid(), 'The Agency RE', 'Active', 106000),
  (gen_random_uuid(), 'Sunpoint Public Adjusters', 'Active', 128000),
  (gen_random_uuid(), 'IPS Global Logistics', 'Active', 154000),
  (gen_random_uuid(), 'Shevin Team - Douglas Elliman', 'Active', 128000),
  (gen_random_uuid(), 'Paso Robles Wine Country Alliance', 'Active', 78000),
  (gen_random_uuid(), 'Malibu Beach Inn', 'Active', 95000),
  (gen_random_uuid(), 'Central Coast Brewing', 'Lead', 0),
  (gen_random_uuid(), 'Nobu Malibu', 'Lead', 0),
  (gen_random_uuid(), 'SLO County Regional Airport', 'Active', 48000),
  (gen_random_uuid(), 'Atascadero Mutual Water Company', 'Active', 32000);

-- Add contacts for each client
insert into client_contacts (client_id, name, email, phone, role, is_primary)
select id, 'Dan Conejo', 'dan@conejohardwoods.com', '(805) 238-0101', 'Business Owner', true from clients where name = 'Conejo Hardwoods';
insert into client_contacts (client_id, name, email, phone, role, is_primary)
select id, 'Rachel Torres', 'rtorres@uclahealth.org', '(805) 434-3500', 'Marketing Manager', true from clients where name = 'UCLA Health Central Coast';
insert into client_contacts (client_id, name, email, phone, role, is_primary)
select id, 'Jeff Stein', 'jeff@solarponics.com', '(805) 466-5595', 'Business Owner', true from clients where name = 'Solarponics';
insert into client_contacts (client_id, name, email, phone, role, is_primary)
select id, 'Sam Malik', 'sam@malikrealestate.com', '(805) 226-8400', 'Business Owner', true from clients where name = 'Malik Real Estate Group';
insert into client_contacts (client_id, name, email, phone, role, is_primary)
select id, 'Mike Fitzgerald', 'mike@fivestargutters.com', '(805) 462-4700', 'Business Owner', true from clients where name = 'Five Star Rain Gutters';
insert into client_contacts (client_id, name, email, phone, role, is_primary)
select id, 'Lindsey Harn', 'lindsey@theagencyre.com', '(805) 369-2000', 'Marketing Director', true from clients where name = 'The Agency RE';
insert into client_contacts (client_id, name, email, phone, role, is_primary)
select id, 'Carlos Mendez', 'carlos@sunpointpa.com', '(805) 544-1000', 'Business Owner', true from clients where name = 'Sunpoint Public Adjusters';
insert into client_contacts (client_id, name, email, phone, role, is_primary)
select id, 'Brian Walsh', 'bwalsh@ipsglobal.com', '(805) 238-9800', 'Marketing VP', true from clients where name = 'IPS Global Logistics';
insert into client_contacts (client_id, name, email, phone, role, is_primary)
select id, 'Jonathan Shevin', 'jonathan@shevinteam.com', '(310) 456-8888', 'Team Lead', true from clients where name = 'Shevin Team - Douglas Elliman';
insert into client_contacts (client_id, name, email, phone, role, is_primary)
select id, 'Joel Peterson', 'joel@pasowine.com', '(805) 239-8463', 'Executive Director', true from clients where name = 'Paso Robles Wine Country Alliance';
insert into client_contacts (client_id, name, email, phone, role, is_primary)
select id, 'Sabrina Chen', 'sabrina@malibubeachinn.com', '(310) 456-4444', 'General Manager', true from clients where name = 'Malibu Beach Inn';
insert into client_contacts (client_id, name, email, phone, role, is_primary)
select id, 'George Dallons', 'george@centralcoastbrewing.com', '(805) 781-2739', 'Owner', true from clients where name = 'Central Coast Brewing';
insert into client_contacts (client_id, name, email, phone, role, is_primary)
select id, 'Kevin Park', 'kpark@nobu.com', '(310) 317-9140', 'Marketing Manager', true from clients where name = 'Nobu Malibu';
insert into client_contacts (client_id, name, email, phone, role, is_primary)
select id, 'Courtney Brandt', 'cbrandt@sloairport.com', '(805) 781-5205', 'Business Development', true from clients where name = 'SLO County Regional Airport';
insert into client_contacts (client_id, name, email, phone, role, is_primary)
select id, 'Nate Collins', 'ncollins@amwc.org', '(805) 462-2411', 'Communications Director', true from clients where name = 'Atascadero Mutual Water Company';

-- ============================================================
-- STORIES — 30+ realistic stories assigned to upcoming issues
-- All due dates are March 25, 2026 through May 2026
-- ============================================================
insert into stories (title, author_name, status, publication_id, due_date, images, word_count, category) values
  -- PRM April (pub date ~Apr 15)
  ('Spring Wine Guide: 10 Hidden Gems', 'Sarah Chen', 'Edited', 'pub-prm', '2026-04-01', 14, 3200, 'Wine'),
  ('Downtown Paso Revival: New Shops Opening', 'Marcus Rivera', 'Needs Editing', 'pub-prm', '2026-03-28', 8, 2400, 'Business'),
  ('Chef Profile: Sofia Reyes at The Hatch', 'Lisa Nguyen', 'Draft', 'pub-prm', '2026-04-03', 6, 1800, 'Food'),
  ('Barney Schwartz Park Expansion Plans', 'Tom Bradley', 'Assigned', 'pub-prm', '2026-04-05', 4, 1500, 'Community'),
  ('Spring Arts Preview: Studios on the Park', 'Jennifer Park', 'Edited', 'pub-prm', '2026-03-30', 10, 2000, 'Culture'),

  -- ANM April (pub date ~Apr 15)
  ('Colony Days 2026 Complete Guide', 'Staff Writer', 'Edited', 'pub-anm', '2026-04-01', 12, 2200, 'Events'),
  ('New Atascadero Brewery District', 'Marcus Rivera', 'Needs Editing', 'pub-anm', '2026-03-28', 6, 1600, 'Business'),
  ('Chalk Mountain Trail Restoration', 'Tom Bradley', 'Draft', 'pub-anm', '2026-04-03', 8, 1400, 'Outdoors'),
  ('Atascadero Lake Pavilion Renovation', 'Jennifer Park', 'Assigned', 'pub-anm', '2026-04-05', 5, 1200, 'Community'),

  -- PRP Week 14 (pub date ~Apr 3)
  ('City Council: New Housing Ordinance', 'Marcus Rivera', 'Edited', 'pub-prp', '2026-03-31', 1, 1100, 'News'),
  ('Bearcats Baseball Season Preview', 'Tom Bradley', 'Needs Editing', 'pub-prp', '2026-03-28', 6, 900, 'Sports'),
  ('Pioneer Day Parade Route Announced', 'Staff Writer', 'Approved', 'pub-prp', '2026-03-26', 3, 800, 'Events'),

  -- PRP Week 15 (pub date ~Apr 10)
  ('Water District Rate Hearing Coverage', 'Sarah Chen', 'Assigned', 'pub-prp', '2026-04-07', 1, 1000, 'News'),
  ('Local Vineyard Wins National Award', 'Lisa Nguyen', 'Assigned', 'pub-prp', '2026-04-07', 4, 900, 'Wine'),

  -- ATN Week 14 (pub date ~Apr 3)
  ('Zoo Expansion Groundbreaking Ceremony', 'Jennifer Park', 'Edited', 'pub-atn', '2026-03-31', 8, 1500, 'Community'),
  ('Atascadero School Bond Measure Analysis', 'Marcus Rivera', 'Draft', 'pub-atn', '2026-03-30', 2, 1200, 'News'),

  -- ATN Week 15 (pub date ~Apr 10)
  ('Summer Concert Series Lineup Revealed', 'Staff Writer', 'Assigned', 'pub-atn', '2026-04-07', 5, 800, 'Events'),

  -- MBL April (pub date ~Apr 15)
  ('Morro Rock Kayak Season Guide', 'Tom Bradley', 'Edited', 'pub-mbl', '2026-04-01', 12, 2000, 'Outdoors'),
  ('Harbor Dredging Project Update', 'Staff Writer', 'Needs Editing', 'pub-mbl', '2026-03-30', 3, 1100, 'Community'),
  ('Sea Otter Festival Preview', 'Lisa Nguyen', 'Draft', 'pub-mbl', '2026-04-03', 8, 1600, 'Events'),
  ('Best Fish Tacos on the Coast', 'Jennifer Park', 'Assigned', 'pub-mbl', '2026-04-05', 6, 1400, 'Food'),

  -- SYV April (pub date ~Apr 15)
  ('Women in Wine: SYV Trailblazers', 'Lisa Nguyen', 'Needs Editing', 'pub-syv', '2026-03-28', 10, 2400, 'Business'),
  ('Solvang Danish Days Preview', 'Staff Writer', 'Edited', 'pub-syv', '2026-04-01', 6, 1200, 'Events'),
  ('Los Olivos Tasting Room Boom', 'Sarah Chen', 'Draft', 'pub-syv', '2026-04-03', 8, 1800, 'Wine'),

  -- MT Week 14 (pub date ~Apr 3)
  ('Malibu Transit Expansion Plan', 'Jimy Tallal', 'Needs Editing', 'pub-mt', '2026-03-28', 3, 1600, 'News'),
  ('PCH Bridge Retrofit Progress', 'Jimy Tallal', 'Edited', 'pub-mt', '2026-03-30', 4, 1200, 'News'),
  ('Nobu Anniversary Celebration', 'Lisa Nguyen', 'Draft', 'pub-mt', '2026-04-01', 6, 1400, 'Food'),

  -- MT Week 15 (pub date ~Apr 10)
  ('Beach Erosion: What Homeowners Need to Know', 'Jimy Tallal', 'Assigned', 'pub-mt', '2026-04-07', 5, 1800, 'Environment'),
  ('Malibu Arts Commission New Grants', 'David Chen', 'Assigned', 'pub-mt', '2026-04-07', 3, 1000, 'Culture');

-- ============================================================
-- COMMUNICATIONS — recent activity for active clients
-- ============================================================
insert into communications (client_id, type, author_name, note, date)
select c.id, 'Email', 'Dana McGraw', 'Sent April rate cards and media kit', '2026-03-20' from clients c where c.name = 'Conejo Hardwoods';
insert into communications (client_id, type, author_name, note, date)
select c.id, 'Phone', 'Dana McGraw', 'Discussed renewal for Q2 — interested in upgrading to full page', '2026-03-22' from clients c where c.name = 'Conejo Hardwoods';
insert into communications (client_id, type, author_name, note, date)
select c.id, 'Email', 'Jake Morrison', 'Proposal follow-up — waiting on board approval', '2026-03-21' from clients c where c.name = 'UCLA Health Central Coast';
insert into communications (client_id, type, author_name, note, date)
select c.id, 'Comment', 'Dana McGraw', 'Lunch meeting — discussed 12-month package across PRM and ANM', '2026-03-19' from clients c where c.name = 'The Agency RE';
insert into communications (client_id, type, author_name, note, date)
select c.id, 'Email', 'Amanda Price', 'Sent Malibu Times rate card and spec sheet', '2026-03-20' from clients c where c.name = 'Malibu Beach Inn';
insert into communications (client_id, type, author_name, note, date)
select c.id, 'Phone', 'Amanda Price', 'Cold call — interested in spring campaign', '2026-03-22' from clients c where c.name = 'Nobu Malibu';
insert into communications (client_id, type, author_name, note, date)
select c.id, 'Email', 'Ryan Davis', 'Sent SYV Star rate card', '2026-03-21' from clients c where c.name = 'Paso Robles Wine Country Alliance';
insert into communications (client_id, type, author_name, note, date)
select c.id, 'Phone', 'Jake Morrison', 'Renewal discussion — happy with results, wants to continue', '2026-03-18' from clients c where c.name = 'Solarponics';
insert into communications (client_id, type, author_name, note, date)
select c.id, 'Email', 'Ryan Davis', 'Intro email and rate cards for ATN and ANM', '2026-03-22' from clients c where c.name = 'Central Coast Brewing';
insert into communications (client_id, type, author_name, note, date)
select c.id, 'Comment', 'Amanda Price', 'Site visit — discussed event program advertising', '2026-03-17' from clients c where c.name = 'Shevin Team - Douglas Elliman';


-- ============================================================
-- TEAM DIRECTIVES TABLE (for publisher notes to team)
-- Run this after 001_initial_schema.sql
-- ============================================================
create table if not exists team_directives (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid references team_members(id),
  to_user_id uuid references team_members(id),
  type text not null default 'note', -- 'note' or 'priority'
  content text not null,
  reference_type text, -- 'sale', 'story', 'issue'
  reference_id text,
  read boolean default false,
  created_at timestamptz default now()
);
create index if not exists idx_directives_to on team_directives(to_user_id, read, created_at desc);
alter table team_directives enable row level security;
create policy "directives_read" on team_directives for select using (true);
create policy "directives_write" on team_directives for insert with check (true);
create policy "directives_update" on team_directives for update using (true);

