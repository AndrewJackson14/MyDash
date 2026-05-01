-- ============================================================
-- 177_drop_story_status_enum.sql
--
-- Audit item 5: stories.status is TEXT (not the story_status enum)
-- and has been since at least the live → archive split. Actual data
-- is 4 values: 'Approved' (74,864), 'Ready' (14,078), 'Draft' (7),
-- 'Edit' (3). The 9-value enum (Draft, Needs Editing, Edited,
-- Approved, On Page, Sent to Web, Scheduled, Published, Archived)
-- is unreferenced by any column.
--
-- Two orphan trigger functions (articles_view_insert /
-- articles_view_update) were the only things still casting to
-- story_status. The articles_view they fired on does not exist —
-- they're dead code. Drop both, then drop the enum.
--
-- We do NOT add a CHECK constraint on stories.status. The codebase
-- still references abandoned values like 'Edited' / 'Published' /
-- 'On Page' in filter chains; tightening the column now would risk
-- breaking writes from those code paths until they're rewritten.
-- That cleanup is a separate pass.
-- ============================================================

DROP FUNCTION IF EXISTS public.articles_view_insert() CASCADE;
DROP FUNCTION IF EXISTS public.articles_view_update() CASCADE;
DROP TYPE IF EXISTS public.story_status;
