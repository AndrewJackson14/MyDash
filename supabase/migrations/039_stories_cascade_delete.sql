-- Cascade story deletion to dependent tables so deletes don't
-- silently fail on FK violations.
ALTER TABLE page_stories DROP CONSTRAINT page_stories_story_id_fkey,
  ADD CONSTRAINT page_stories_story_id_fkey FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE;
ALTER TABLE story_publications DROP CONSTRAINT story_publications_story_id_fkey,
  ADD CONSTRAINT story_publications_story_id_fkey FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE;
ALTER TABLE media_assets DROP CONSTRAINT media_assets_story_id_fkey,
  ADD CONSTRAINT media_assets_story_id_fkey FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE SET NULL;
ALTER TABLE article_tags DROP CONSTRAINT article_tags_story_id_fkey,
  ADD CONSTRAINT article_tags_story_id_fkey FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE;
ALTER TABLE article_revisions DROP CONSTRAINT article_revisions_story_id_fkey,
  ADD CONSTRAINT article_revisions_story_id_fkey FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE;
ALTER TABLE story_activity DROP CONSTRAINT story_activity_story_id_fkey,
  ADD CONSTRAINT story_activity_story_id_fkey FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE;
ALTER TABLE cross_published_stories DROP CONSTRAINT cross_published_stories_story_id_fkey,
  ADD CONSTRAINT cross_published_stories_story_id_fkey FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE;
