-- Migration 082: Restore the sync_story_site_id trigger
--
-- Migration 026 originally created `trigger_sync_story_site_id` to mirror
-- publication_id -> site_id on every insert/update of stories. The trigger
-- was dropped at some point (likely in a later cleanup pass), leaving
-- StoryEditor writes that change publication_id without also touching
-- site_id (which the website queries on) silently desyncing.
--
-- Symptom that surfaced this: a Malibu Times story (publication_id =
-- 'pub-the-malibu-times') had site_id = 'pub-atascadero-news' from an
-- earlier draft state, and never appeared on the Malibu Times homepage
-- hero — the hero query filters on site_id.
--
-- Fix:
--   1. Backfill rows where the two columns drifted.
--   2. Recreate the trigger so future writes can't drift again.

-- Backfill first so the trigger doesn't have legacy mismatches to ignore.
update stories
   set site_id = publication_id, updated_at = now()
 where publication_id is not null
   and site_id is distinct from publication_id;

-- Recreate function (idempotent — replaces if exists).
create or replace function sync_story_site_id()
returns trigger
language plpgsql
as $$
begin
  if new.publication_id is not null then
    new.site_id := new.publication_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_sync_story_site_id on stories;
create trigger trigger_sync_story_site_id
  before insert or update on stories
  for each row
  execute function sync_story_site_id();
