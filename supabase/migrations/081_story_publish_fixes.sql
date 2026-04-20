-- Migration 081: Two Story Editor bug fixes
--
-- BUG 1 — body image upload fails for editors
-- The media_assets INSERT/UPDATE policies require admin OR sales perms.
-- Editors writing stories don't have either, so adding an inline image
-- to a story body errors out at the media_assets insert step (RLS blocks
-- "new row violates row-level security policy"). Add editorial + stories
-- to the allowed perm set.
--
-- BUG 2 — publishing to web doesn't show up on the live site
-- The Story Editor's first-publish path sets sent_to_web=true but not
-- web_status='published'. The republish path DOES set web_status. The
-- Malibu Times site (and likely others) reads on web_status='published',
-- so first-publish stories were silently invisible.
-- Add a trigger that mirrors sent_to_web -> web_status on every write so
-- the two columns can never drift, regardless of which UI path wrote the
-- update. Backfill existing rows with the mismatch too.

-- ── Bug 1: media_assets RLS ────────────────────────────────────────
drop policy if exists "media_upd" on media_assets;
drop policy if exists "media_write" on media_assets;

create policy "media_upd" on media_assets for update
  using (has_permission('admin') OR has_permission('sales') OR has_permission('editorial') OR has_permission('stories'));

create policy "media_write" on media_assets for insert
  with check (has_permission('admin') OR has_permission('sales') OR has_permission('editorial') OR has_permission('stories'));

-- ── Bug 2: sync trigger for sent_to_web <-> web_status ─────────────
create or replace function sync_story_web_status()
returns trigger
language plpgsql
as $$
begin
  -- sent_to_web is the user-visible toggle in the UI; web_status is the
  -- legacy column the website queries. Keep them in lockstep.
  if new.sent_to_web is true and (new.web_status is null or new.web_status <> 'published') then
    new.web_status := 'published';
  elsif new.sent_to_web is false and new.web_status = 'published' then
    new.web_status := 'unpublished';
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_sync_story_web_status on stories;
create trigger trigger_sync_story_web_status
  before insert or update on stories
  for each row
  execute function sync_story_web_status();

-- Backfill existing rows that were stuck in the broken state — sent_to_web
-- = true but web_status not 'published'. Touching updated_at fires the new
-- trigger which corrects web_status.
update stories
   set updated_at = now()
 where sent_to_web = true
   and (web_status is null or web_status <> 'published');
