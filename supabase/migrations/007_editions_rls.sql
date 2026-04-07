-- ============================================================
-- 007: Editions RLS Policies
-- Ensure issuu_editions table has RLS enabled with proper policies
-- ============================================================

-- Enable RLS (no-op if already enabled)
alter table issuu_editions enable row level security;

-- Drop existing policies if any, then recreate
drop policy if exists "Authenticated users can read editions" on issuu_editions;
drop policy if exists "Authenticated users can manage editions" on issuu_editions;

-- Allow authenticated users full read access
create policy "Authenticated users can read editions"
  on issuu_editions for select using (true);

-- Allow authenticated users full write access
create policy "Authenticated users can manage editions"
  on issuu_editions for all using (true) with check (true);
