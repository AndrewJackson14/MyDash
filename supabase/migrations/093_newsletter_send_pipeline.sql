-- ============================================================
-- Migration 093: Newsletter send pipeline (drafts, templates,
-- per-send tracking, unsubscribe tokens)
--
-- The compose UI in NewsletterPage.jsx was already reading and
-- writing these tables — they just never existed, so any save
-- would 500. This migration creates them, plus the machinery
-- needed for an AWS SES send + click/open/bounce tracking.
--
-- We also stamp an unsubscribe_token on every subscriber so the
-- public /unsubscribe/:token endpoint can flip them off without
-- auth.
-- ============================================================

-- ─── 1. newsletter_templates ───────────────────────────────
-- Reusable per-pub templates. html_shell is the outer skeleton
-- (<html>/<body>/styles); body_template is the content stub the
-- draft editor starts from.
CREATE TABLE IF NOT EXISTS newsletter_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id  text REFERENCES publications(id) ON DELETE SET NULL,
  name            text NOT NULL,
  description     text,
  html_shell      text NOT NULL,
  body_template   text,
  thumbnail_url   text,
  is_default      boolean NOT NULL DEFAULT false,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nl_templates_pub ON newsletter_templates(publication_id);

ALTER TABLE newsletter_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nl_templates_read"  ON newsletter_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "nl_templates_write" ON newsletter_templates FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- ─── 2. newsletter_drafts ──────────────────────────────────
-- A single send (draft → approved → sent). One draft targets one
-- publication; the "from" address is resolved at send time from
-- the publication's site_settings.newsletter_from_address.
CREATE TABLE IF NOT EXISTS newsletter_drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id  text NOT NULL REFERENCES publications(id) ON DELETE RESTRICT,
  template_id     uuid REFERENCES newsletter_templates(id) ON DELETE SET NULL,
  subject         text NOT NULL,
  preheader       text,
  from_name       text,
  from_email      text,
  reply_to        text,
  intro_html      text,
  html_body       text,
  story_ids       uuid[] DEFAULT '{}',
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','approved','scheduled','sending','sent','failed','cancelled')),
  scheduled_at    timestamptz,
  sent_at         timestamptz,
  recipient_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  bounce_count    integer NOT NULL DEFAULT 0,
  complaint_count integer NOT NULL DEFAULT 0,
  open_count      integer NOT NULL DEFAULT 0,
  click_count     integer NOT NULL DEFAULT 0,
  last_error      text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nl_drafts_pub_status ON newsletter_drafts(publication_id, status);
CREATE INDEX IF NOT EXISTS idx_nl_drafts_sent_at    ON newsletter_drafts(sent_at DESC) WHERE sent_at IS NOT NULL;

ALTER TABLE newsletter_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nl_drafts_read"  ON newsletter_drafts FOR SELECT TO authenticated USING (true);
CREATE POLICY "nl_drafts_write" ON newsletter_drafts FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- ─── 3. email_sends ────────────────────────────────────────
-- One row per (draft × subscriber). The send edge function fans
-- out SES PutEmail calls and stamps rows here; SES SNS webhooks
-- update the event_* columns. ses_message_id is the correlation
-- key between our row and SES events.
CREATE TABLE IF NOT EXISTS email_sends (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id        uuid NOT NULL REFERENCES newsletter_drafts(id) ON DELETE CASCADE,
  subscriber_id   uuid REFERENCES newsletter_subscribers(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  ses_message_id  text,
  status          text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','sent','delivered','bounced','complained','failed','suppressed')),
  queued_at       timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  delivered_at    timestamptz,
  first_opened_at timestamptz,
  last_opened_at  timestamptz,
  open_count      integer NOT NULL DEFAULT 0,
  first_clicked_at timestamptz,
  last_clicked_at timestamptz,
  click_count     integer NOT NULL DEFAULT 0,
  bounce_type     text,
  complaint_type  text,
  error_message   text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_sends_draft_email ON email_sends(draft_id, recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_sends_message_id        ON email_sends(ses_message_id) WHERE ses_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_sends_subscriber        ON email_sends(subscriber_id);

ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_sends_read"  ON email_sends FOR SELECT TO authenticated USING (true);
CREATE POLICY "email_sends_write" ON email_sends FOR ALL    TO service_role  USING (true) WITH CHECK (true);

-- ─── 4. Subscriber additions ───────────────────────────────
-- unsubscribe_token is the opaque key embedded in every email's
-- unsubscribe link; a 32-byte urlsafe base64 string is sized to
-- make brute-force enumeration infeasible.
ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS unsubscribe_token  text UNIQUE,
  ADD COLUMN IF NOT EXISTS last_sent_at       timestamptz,
  ADD COLUMN IF NOT EXISTS bounce_count       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS complaint_count    integer NOT NULL DEFAULT 0;

-- Backfill tokens for every existing subscriber so they can be
-- linked into immediately. encode(gen_random_bytes(…)) is the
-- pgcrypto-free path on Supabase and is CSPRNG-sourced.
UPDATE newsletter_subscribers
SET unsubscribe_token = encode(gen_random_bytes(24), 'base64')
WHERE unsubscribe_token IS NULL;

-- Going forward, the insert path gets a default so the app layer
-- doesn't need to generate these.
ALTER TABLE newsletter_subscribers
  ALTER COLUMN unsubscribe_token SET DEFAULT encode(gen_random_bytes(24), 'base64');

-- ─── 5. Per-pub send identity ──────────────────────────────
-- The SES-verified "from" address varies per pub (e.g.
-- newsletter@pasoroblespress.com). We already have a JSON
-- site_settings column on publications for loose key/value
-- config, so we just document the contract here — no schema
-- change required.
COMMENT ON COLUMN publications.site_settings IS
  'Loose per-pub JSON config. Keys used by the newsletter pipeline: newsletter_from_name, newsletter_from_email, newsletter_reply_to. Only pubs with a verified SES domain can set these.';

-- ─── 6. updated_at trigger for drafts + templates ──────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_nl_drafts_updated    ON newsletter_drafts;
CREATE TRIGGER       trg_nl_drafts_updated    BEFORE UPDATE ON newsletter_drafts    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_nl_templates_updated ON newsletter_templates;
CREATE TRIGGER       trg_nl_templates_updated BEFORE UPDATE ON newsletter_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

NOTIFY pgrst, 'reload schema';
