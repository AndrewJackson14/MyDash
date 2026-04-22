-- from_email / from_name resolve at send time from the publication's
-- site_settings (send-newsletter edge function, lines 150-157). The
-- compose UI leaves both blank; the legacy NOT NULL on these columns
-- blocks every draft insert. Relax the constraints.
ALTER TABLE newsletter_drafts
  ALTER COLUMN from_email DROP NOT NULL,
  ALTER COLUMN from_name  DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
