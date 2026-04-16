-- 031_social_posts_rls_content_editor.sql
--
-- Locks down social_posts behind a new 'social_posts' permission.
-- Supabase advisor was flagging the table as RLS-disabled in public;
-- migration 026 intended to enable RLS with a permissive
-- authenticated policy but never landed on live.
--
-- The permission is tied per-user, not per-role: publishers toggle it
-- from Team settings. Content Editor and Managing Editor roles get it
-- by default in ROLE_DEFAULTS (see src/pages/TeamModule.jsx). Admins
-- always pass via has_permission()'s built-in admin override.

alter table public.social_posts enable row level security;

drop policy if exists "social_posts read" on public.social_posts;
create policy "social_posts read"
  on public.social_posts
  for select
  to authenticated
  using (public.has_permission('social_posts'));

drop policy if exists "social_posts write" on public.social_posts;
create policy "social_posts write"
  on public.social_posts
  for all
  to authenticated
  using (public.has_permission('social_posts'))
  with check (public.has_permission('social_posts'));