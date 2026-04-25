-- 140_jen_p2_gmail_message_links.sql
--
-- P2.22: link a Gmail message to an ad project. Lets Jen tag a
-- client email back at "this is about that proof" so the project
-- detail surfaces the conversation in context. Mail tab adds a
-- "Link to ad project" action; AdProjects detail shows a
-- "Linked Emails" panel beneath the project chat.

CREATE TABLE IF NOT EXISTS gmail_message_links (
  gmail_message_id text NOT NULL,
  ad_project_id    uuid NOT NULL REFERENCES ad_projects(id) ON DELETE CASCADE,
  thread_id        uuid REFERENCES message_threads(id) ON DELETE SET NULL,
  linked_by        uuid REFERENCES team_members(id),
  linked_at        timestamptz NOT NULL DEFAULT now(),
  excerpt          text,
  from_email       text,
  subject          text,
  PRIMARY KEY (gmail_message_id, ad_project_id)
);

CREATE INDEX IF NOT EXISTS gmail_message_links_project_idx
  ON gmail_message_links(ad_project_id, linked_at DESC);

ALTER TABLE gmail_message_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gmail_links_authenticated ON gmail_message_links;
CREATE POLICY gmail_links_authenticated ON gmail_message_links
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
