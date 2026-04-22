ALTER TABLE newsletter_drafts
  ADD COLUMN IF NOT EXISTS advertiser_notified_at timestamptz;

COMMENT ON COLUMN newsletter_drafts.advertiser_notified_at IS
  'Set when send-newsletter emails the attached client the campaign share link. Guards against duplicate advertiser notifications when a draft is completed in multiple runs.';

NOTIFY pgrst, 'reload schema';
