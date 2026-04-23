-- ============================================================
-- Migration 097: Gmail push subscription tracking
--
-- Each connected Gmail account gets a row here. gmail.users.watch()
-- subscribes the user's inbox to the Pub/Sub topic (expires at 7
-- days); daily cron renews any watch within 36 hours of expiration.
--
-- The push webhook (gmail-push-webhook) decodes the Pub/Sub payload
-- { emailAddress, historyId } and joins back to this table to find
-- the owning user before broadcasting a realtime event.
-- ============================================================

CREATE TABLE IF NOT EXISTS gmail_watches (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_address    text NOT NULL,
  history_id       text,
  expiration_at    timestamptz,
  watch_started_at timestamptz NOT NULL DEFAULT now(),
  last_renewed_at  timestamptz NOT NULL DEFAULT now(),
  last_push_at     timestamptz,
  push_count       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gmail_watches_email ON gmail_watches(lower(email_address));
CREATE INDEX IF NOT EXISTS idx_gmail_watches_expiring   ON gmail_watches(expiration_at);

ALTER TABLE gmail_watches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gmail_watches_self_read"  ON gmail_watches FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "gmail_watches_service"    ON gmail_watches FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- Daily renewal cron (runs at 03:17 UTC; off the hour boundary).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gmail-watch-renew-daily') THEN
    PERFORM cron.unschedule('gmail-watch-renew-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'gmail-watch-renew-daily',
  '17 3 * * *',
  $cron$
  SELECT public.cron_invoke_edge_function(
    'gmail-watch-init',
    '{"renew_all": true}'::jsonb
  );
  $cron$
);

NOTIFY pgrst, 'reload schema';
