-- Migration 080: stories.audience for internal Knowledge Base articles
--
-- The team writes KB articles in the existing Story Editor; we just need
-- a marker so KB stories don't appear on public sites and DO appear in the
-- new Knowledge Base browse + bot lookups.
--
-- audience values:
--   'public'   — default; current behavior (web stories, print stories)
--   'internal' — team-only KB / SOP article. Never exposed to anon.
--
-- The existing anon read policy filters `sent_to_web = true`, which already
-- gates internal articles out (a KB article should never be flagged for
-- web). Belt-and-suspenders: drop and recreate that policy with an
-- explicit audience check so a misconfigured KB article can't accidentally
-- leak via sent_to_web=true.
--
-- The existing authenticated read policy (admin/editorial/stories perms)
-- stays. To let any team member browse KB articles regardless of those
-- perms, add a new policy: authenticated can read stories WHERE
-- audience='internal'.

alter table stories
  add column if not exists audience text not null default 'public'
    check (audience in ('public','internal'));

-- Browsing the KB: filter by audience + sort by recency.
create index if not exists idx_stories_audience_updated
  on stories(audience, updated_at desc) where audience = 'internal';

-- Tighten the anon policy so only public stories ever leak.
drop policy if exists "Anon can read web-published stories" on stories;
create policy "Anon can read web-published stories"
  on stories for select
  to anon
  using (sent_to_web = true and audience = 'public');

-- Let any authenticated team member read internal KB articles. The bot
-- (service role) bypasses RLS — this is for the team-facing browse page.
create policy "Authed can read internal KB"
  on stories for select
  to authenticated
  using (audience = 'internal');
