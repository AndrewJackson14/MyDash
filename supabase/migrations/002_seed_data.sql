-- ============================================================
-- 13 Stars Media PubHub — Seed Data
-- Run this in Supabase SQL Editor AFTER the migration
-- ============================================================

-- ============================================================
-- PUBLICATIONS
-- ============================================================
insert into publications (id, name, color, type, page_count, width, height, frequency, circulation) values
  ('pub-prm', 'Paso Robles Magazine', '#4B8BF5', 'Magazine', 64, 8.375, 10.875, 'Monthly', 25000),
  ('pub-anm', 'Atascadero News Magazine', '#22C583', 'Magazine', 48, 8.375, 10.875, 'Monthly', 13000),
  ('pub-prp', 'The Paso Robles Press', '#E84855', 'Newspaper', 24, 11.125, 20.75, 'Weekly', 2085),
  ('pub-atn', 'The Atascadero News', '#9066E8', 'Newspaper', 24, 11.125, 20.75, 'Weekly', 2415),
  ('pub-mbl', 'Morro Bay Life', '#E8793A', 'Magazine', 32, 10.375, 15.875, 'Monthly', 8500),
  ('pub-syv', 'Santa Ynez Valley Star', '#F0A030', 'Newspaper', 24, 10.375, 15.875, 'Bi-Monthly', 8500),
  ('pub-mt', 'The Malibu Times', '#4BCCE8', 'Newspaper', 16, 12.5, 20.5, 'Weekly', 8500);

-- ============================================================
-- AD SIZES
-- ============================================================
-- Magazine sizes (PRM, ANM)
insert into ad_sizes (pub_id, name, dims, width, height, rate, rate_6, rate_12, sort_order) values
  ('pub-prm', 'Full Page', '8.375×10.875', 8.375, 10.875, 1800, 1530, 1350, 1),
  ('pub-prm', '3/4 Page', '8.375×8.15', 8.375, 8.15, 1595, 1353, 1194, 2),
  ('pub-prm', '1/2 Page', '8.375×5.44', 8.375, 5.44, 1111, 947, 831, 3),
  ('pub-prm', '1/4 Page', '4.19×5.44', 4.19, 5.44, 616, 523, 463, 4),
  ('pub-prm', '1/8 Page', '4.19×2.72', 4.19, 2.72, 369, 314, 275, 5),
  ('pub-anm', 'Full Page', '8.375×10.875', 8.375, 10.875, 1800, 1530, 1350, 1),
  ('pub-anm', '3/4 Page', '8.375×8.15', 8.375, 8.15, 1595, 1353, 1194, 2),
  ('pub-anm', '1/2 Page', '8.375×5.44', 8.375, 5.44, 1111, 947, 831, 3),
  ('pub-anm', '1/4 Page', '4.19×5.44', 4.19, 5.44, 616, 523, 463, 4),
  ('pub-anm', '1/8 Page', '4.19×2.72', 4.19, 2.72, 369, 314, 275, 5);

-- Newspaper broadsheet sizes (PRP, ATN)
insert into ad_sizes (pub_id, name, dims, width, height, rate, rate_6, rate_12, sort_order) values
  ('pub-prp', 'Full Page', '11.125×20.75', 11.125, 20.75, 1399, 1189, 979, 1),
  ('pub-prp', '1/2 Page (H)', '11.125×10.25', 11.125, 10.25, 749, 637, 524, 2),
  ('pub-prp', '1/4 Page', '5.5×10.25', 5.5, 10.25, 399, 339, 279, 3),
  ('pub-prp', '1/8 Page', '5.5×5.125', 5.5, 5.125, 249, 212, 174, 4),
  ('pub-atn', 'Full Page', '11.125×20.75', 11.125, 20.75, 1399, 1189, 979, 1),
  ('pub-atn', '1/2 Page (H)', '11.125×10.25', 11.125, 10.25, 749, 637, 524, 2),
  ('pub-atn', '1/4 Page', '5.5×10.25', 5.5, 10.25, 399, 339, 279, 3),
  ('pub-atn', '1/8 Page', '5.5×5.125', 5.5, 5.125, 249, 212, 174, 4);

-- Morro Bay Life sizes
insert into ad_sizes (pub_id, name, dims, width, height, rate, rate_6, rate_12, sort_order) values
  ('pub-mbl', 'Full Page', '10.375×15.875', 10.375, 15.875, 849, 722, 637, 1),
  ('pub-mbl', '1/2 Page', '10.375×7.94', 10.375, 7.94, 478, 406, 358, 2),
  ('pub-mbl', '1/4 Page', '4.94×7.69', 4.94, 7.69, 371, 316, 279, 3),
  ('pub-mbl', '1/8 Page', '4.94×3.75', 4.94, 3.75, 265, 226, 199, 4);

-- SYV Star sizes
insert into ad_sizes (pub_id, name, dims, width, height, rate, rate_6, rate_12, sort_order) values
  ('pub-syv', 'Full Page', '10.375×15.875', 10.375, 15.875, 1398, 1150, 918, 1),
  ('pub-syv', '1/2 Page (H)', '10×7.69', 10, 7.69, 851, 775, 702, 2),
  ('pub-syv', '1/4 Page (V)', '4.94×7.69', 4.94, 7.69, 432, 380, 325, 3),
  ('pub-syv', '1/8 Page', '4.94×3.75', 4.94, 3.75, 255, 211, 175, 4);

-- Malibu Times sizes
insert into ad_sizes (pub_id, name, dims, width, height, rate, rate_6, rate_12, sort_order) values
  ('pub-mt', 'Full Page', '12.5×20.5', 12.5, 20.5, 3382, 2541, 2252, 1),
  ('pub-mt', 'Half Page (H)', '12.5×10.44', 12.5, 10.44, 2254, 1687, 1495, 2),
  ('pub-mt', 'Quarter Page (V)', '6.19×10.44', 6.19, 10.44, 1234, 878, 778, 3),
  ('pub-mt', 'Banner', '12.5×7', 12.5, 7, 1778, 1338, 1186, 4),
  ('pub-mt', 'Showcase', '6.19×5', 6.19, 5, 715, 537, 476, 5);

-- ============================================================
-- TEAM MEMBERS
-- Your Google account is linked to Hayley Mattson (Publisher/Admin)
-- ============================================================
insert into team_members (auth_id, name, role, email, phone, alerts, assigned_pubs, permissions) values
  ('366c31ed-de10-463d-9d33-3eb2ddfcf180', 'Hayley Mattson', 'Publisher', 'hayley@13stars.media', '(805) 466-2585',
   '{"Story status change","Sale confirmed","Issue published","Proposal signed"}', '{"all"}', '{"admin"}');

insert into team_members (name, role, email, phone, alerts, assigned_pubs, permissions) values
  ('Nicholas Mattson', 'Editor-in-Chief', 'nicholas@13stars.media', '(805) 466-2586',
   '{"Story status change","New comment"}', '{"all"}', '{"admin","editorial","stories"}'),
  ('Dana McGraw', 'Sales Manager', 'dana@13stars.media', '(805) 423-6740',
   '{"Sale confirmed","Proposal signed"}', '{"all"}', '{"sales","clients"}'),
  ('Sarah Chen', 'Managing Editor', 'sarah@13stars.media', '',
   '{"Story status change"}', '{"all"}', '{"editorial","stories","flatplan"}'),
  ('Marcus Rivera', 'Writer/Reporter', 'marcus@13stars.media', '',
   '{}', '{"pub-prp","pub-atn","pub-prm"}', '{"stories"}'),
  ('Lisa Nguyen', 'Writer/Reporter', 'lisa@13stars.media', '',
   '{}', '{"pub-prm","pub-anm","pub-mt"}', '{"stories"}'),
  ('Tom Bradley', 'Stringer', 'tom@freelance.com', '',
   '{}', '{"pub-prp","pub-mbl"}', '{"stories"}'),
  ('Jennifer Park', 'Stringer', 'jennifer@freelance.com', '',
   '{}', '{"pub-atn","pub-syv"}', '{"stories"}'),
  ('Jimy Tallal', 'Stringer', 'jimy@freelance.com', '',
   '{}', '{"pub-mt"}', '{"stories"}'),
  ('Alex Torres', 'Stringer', 'alex@freelance.com', '',
   '{}', '{"pub-prp","pub-prm"}', '{"stories"}'),
  ('Rachel Kim', 'Stringer', 'rachel@freelance.com', '',
   '{}', '{"pub-anm","pub-mbl"}', '{"stories"}'),
  ('David Chen', 'Stringer', 'david@freelance.com', '',
   '{}', '{"pub-syv","pub-mt"}', '{"stories"}'),
  ('Maria Santos', 'Stringer', 'maria@freelance.com', '',
   '{}', '{"pub-prp","pub-atn"}', '{"stories"}'),
  ('Mike Johnson', 'Copy Editor', 'mike@13stars.media', '',
   '{"Story status change"}', '{"all"}', '{"editorial","stories"}'),
  ('Emily Watson', 'Graphic Designer', 'emily@13stars.media', '',
   '{"Flatplan updated"}', '{"all"}', '{"editorial","flatplan"}'),
  ('Chris Lee', 'Graphic Designer', 'chris@13stars.media', '',
   '{"Flatplan updated"}', '{"all"}', '{"editorial","flatplan"}'),
  ('Jake Morrison', 'Salesperson', 'jake@13stars.media', '(805) 555-0101',
   '{"Sale confirmed","Proposal signed"}', '{"pub-prm","pub-prp"}', '{"sales","clients"}'),
  ('Amanda Price', 'Salesperson', 'amanda@13stars.media', '(805) 555-0102',
   '{"Sale confirmed","Proposal signed"}', '{"pub-mt","pub-mbl"}', '{"sales","clients"}'),
  ('Ryan Davis', 'Salesperson', 'ryan@13stars.media', '(805) 555-0103',
   '{"Sale confirmed","Proposal signed"}', '{"pub-atn","pub-anm","pub-syv"}', '{"sales","clients"}'),
  ('Karen Phillips', 'Office Manager', 'karen@13stars.media', '(805) 466-2585',
   '{}', '{"all"}', '{"analytics"}');

-- ============================================================
-- CLIENTS
-- ============================================================
insert into clients (name, status, total_spend) values
  ('Conejo Hardwoods', 'Active', 204000),
  ('UCLA Health', 'Active', 111000),
  ('Solarponics', 'Active', 89000),
  ('Malik Real Estate', 'Lead', 42000),
  ('Five Star Rain Gutters', 'Active', 67000),
  ('The Agency RE', 'Active', 106000),
  ('Sunpoint Public Adjusters', 'Active', 128000),
  ('IPS Global', 'Active', 154000),
  ('Shevin Team - Douglas Elliman', 'Active', 128000);

-- Add primary contacts for each client
insert into client_contacts (client_id, name, email, phone, role, is_primary)
select c.id, 'Main Contact', lower(replace(c.name, ' ', '')) || '@example.com', '', 'Business Owner', true
from clients c;

-- ============================================================
-- SAMPLE STORIES
-- ============================================================
insert into stories (title, author_name, status, publication_id, due_date, images, word_count, category) values
  ('Spring Wine Guide', 'Sarah Chen', 'Approved', 'pub-prm', '2026-03-15', 12, 3000, 'Wine'),
  ('Downtown Revitalization', 'Marcus Rivera', 'Edited', 'pub-prm', '2026-03-20', 8, 2400, 'Business'),
  ('Chef Profiles', 'Lisa Nguyen', 'Needs Editing', 'pub-prm', '2026-03-28', 6, 1800, 'Food'),
  ('Colony Days Preview', 'Staff Writer', 'Edited', 'pub-anm', '2026-04-01', 10, 1800, 'Community'),
  ('Pioneer Day Preview', 'Staff Writer', 'Edited', 'pub-prp', '2026-03-25', 5, 1400, 'Events'),
  ('City Council Recap', 'Marcus Rivera', 'On Page', 'pub-prp', '2026-03-18', 2, 900, 'News'),
  ('Harbor Update', 'Staff Writer', 'Needs Editing', 'pub-mbl', '2026-03-28', 4, 1100, 'Community'),
  ('Kayak Season Guide', 'Tom Bradley', 'Edited', 'pub-mbl', '2026-03-22', 9, 1700, 'Outdoors'),
  ('Women in Business', 'Lisa Nguyen', 'Needs Editing', 'pub-syv', '2026-03-20', 8, 2200, 'Business'),
  ('Malibu Transit Plan', 'Jimy Tallal', 'Needs Editing', 'pub-mt', '2026-04-03', 3, 1600, 'News'),
  ('Beach Erosion Report', 'Marcus Rivera', 'Edited', 'pub-mt', '2026-03-26', 5, 1200, 'Environment'),
  ('Zoo Expansion Plans', 'Jennifer Park', 'Edited', 'pub-atn', '2026-03-24', 7, 1500, 'Community');
