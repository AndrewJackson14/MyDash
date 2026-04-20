-- Migration 084: Align stories.status CHECK with the new editorial states
--
-- Migration sequence reminder (the JS side already shipped this):
--   STORY_STATUSES went from
--     ["Pitched","Draft","Edit","Ready","Archived"]
--   to
--     ["Draft","Edit","Ready","Approved"]
--   in commits c7028fd (Archived → Approved) and a later cleanup that
--   dropped Pitched from the selector. The DB CHECK was never updated,
--   so any insert with status="Approved" now fails 23514. Surfaced
--   while importing 376 Morro Bay Life WP posts.
--
-- Allow the full historical + current state set so legacy rows that
-- still carry "Pitched" or "Archived" don't reject on UPDATE either.

alter table stories drop constraint if exists stories_status_check;
alter table stories add constraint stories_status_check
  check (status = any (array['Pitched','Draft','Edit','Ready','Approved','Archived']));
