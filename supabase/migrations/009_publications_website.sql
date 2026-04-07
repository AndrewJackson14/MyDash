-- ============================================================
-- 008: Add website fields to publications
-- ============================================================

alter table publications add column if not exists has_website boolean default false;
alter table publications add column if not exists website_url text default '';
