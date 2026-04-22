-- newsletter_drafts pre-existed with an earlier shape, so the
-- CREATE TABLE IF NOT EXISTS in 093 was a no-op. Add the columns
-- referenced by the send-newsletter edge function, EblastComposer,
-- and NewsletterPage.jsx so inserts and updates stop 400'ing.
ALTER TABLE newsletter_drafts
  ADD COLUMN IF NOT EXISTS created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_id     uuid REFERENCES newsletter_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS preheader       text,
  ADD COLUMN IF NOT EXISTS reply_to        text,
  ADD COLUMN IF NOT EXISTS delivered_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bounce_count    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS complaint_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error      text;

NOTIFY pgrst, 'reload schema';
