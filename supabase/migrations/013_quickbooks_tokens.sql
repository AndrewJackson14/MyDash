-- ============================================================
-- 013: QuickBooks OAuth token storage
-- Company-level (not per-user) — one QB connection per org
-- ============================================================

create table if not exists quickbooks_tokens (
  id uuid primary key default gen_random_uuid(),
  realm_id text not null unique,
  company_name text default '',
  access_token text not null,
  refresh_token text not null,
  token_expiry timestamptz,
  connected_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table quickbooks_tokens enable row level security;

create policy "Authenticated users can read QB tokens" on quickbooks_tokens
  for select using (true);

create policy "Service role full access" on quickbooks_tokens
  for all using (auth.role() = 'service_role');
