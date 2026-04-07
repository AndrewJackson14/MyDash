-- ============================================================
-- 010: Google OAuth token storage
-- Stores per-user refresh tokens for Gmail/Calendar access
-- ============================================================

create table if not exists google_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_member_id uuid references team_members(id) on delete set null,
  email text not null,
  access_token text not null,
  refresh_token text not null,
  token_expiry timestamptz,
  scopes text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

-- RLS
alter table google_tokens enable row level security;

-- Users can only read/write their own tokens
create policy "Users manage own tokens" on google_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Service role (Edge Functions) can access all tokens
create policy "Service role full access" on google_tokens
  for all using (auth.role() = 'service_role');
