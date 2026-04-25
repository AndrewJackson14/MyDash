-- 133_email_log_inbound_columns.sql
--
-- Tier 1 audit M-1 (Dana's Tuesday Walkthrough): inbound Gmail
-- messages need to land in email_log so the relationship timeline
-- on a client profile shows BOTH sides of the conversation.
--
-- Existing rows are all outbound (every type — proposal/contract/
-- invoice/etc — was a server-initiated send). New inbound rows
-- carry direction='inbound' + from_email so the UI can render
-- them with an inbound icon and attribute the sender.

ALTER TABLE email_log
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('outbound', 'inbound')),
  ADD COLUMN IF NOT EXISTS from_email text;

-- Profile timeline reads "all email_log rows for this client, sorted
-- by created_at desc" — index supports both that query and the
-- ingest dedupe lookup (gmail_message_id).
CREATE INDEX IF NOT EXISTS idx_email_log_client_created
  ON email_log (client_id, created_at DESC)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_log_gmail_message_id
  ON email_log (gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;

-- gmail_watches.history_id tracks the last value Pub/Sub told us
-- about. The new column tracks how far the ingest worker has
-- actually processed — they advance independently because the
-- worker can lag behind a busy inbox.
ALTER TABLE gmail_watches
  ADD COLUMN IF NOT EXISTS last_ingested_history_id text;
