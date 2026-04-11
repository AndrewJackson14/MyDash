-- 024_reminder_tracking.sql
-- Track which invoice reminders and renewal notices have been sent

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS first_reminder_sent boolean DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS first_reminder_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS second_reminder_sent boolean DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS second_reminder_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS final_reminder_sent boolean DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS final_reminder_at timestamptz;

ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS first_notice_sent boolean DEFAULT false;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS second_notice_sent boolean DEFAULT false;
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS third_notice_sent boolean DEFAULT false;

-- Daily cron: calls scheduled-tasks edge function at 8am Pacific (3pm UTC)
-- SELECT cron.schedule('daily-scheduled-tasks', '0 15 * * *', $$SELECT net.http_post(url := '...', body := '{"task": "all"}'::jsonb)$$);

NOTIFY pgrst, 'reload schema';
