-- ============================================================
-- Migration 094: Advertiser eBlast pipeline
--
-- Sponsored dedicated sends ride the existing SES send pipeline
-- (html_body still holds the fully-rendered email). What's new is
-- the compose shape: a tiptap body + advertiser identity fields
-- + CTA, assembled at compose time by a dedicated template.
-- Also seeds an eBlast product into digital_ad_products so
-- proposals can include it as a line item.
-- ============================================================

ALTER TABLE newsletter_drafts
  ADD COLUMN IF NOT EXISTS draft_type text NOT NULL DEFAULT 'newsletter'
    CHECK (draft_type IN ('newsletter','eblast')),
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS advertiser_name    text,
  ADD COLUMN IF NOT EXISTS advertiser_website text,
  ADD COLUMN IF NOT EXISTS advertiser_logo_url text,
  ADD COLUMN IF NOT EXISTS advertiser_address text,
  ADD COLUMN IF NOT EXISTS advertiser_phone   text,
  ADD COLUMN IF NOT EXISTS body_html          text,
  ADD COLUMN IF NOT EXISTS cta_text           text,
  ADD COLUMN IF NOT EXISTS cta_url            text;

COMMENT ON COLUMN newsletter_drafts.draft_type IS
  'newsletter (story-assembled) or eblast (single advertiser message).';
COMMENT ON COLUMN newsletter_drafts.body_html IS
  'tiptap-authored HTML source. Composed into the final html_body via eblastTemplate.js at send time.';
COMMENT ON COLUMN newsletter_drafts.client_id IS
  'Sales-side client attached to this eBlast. Powers ClientProfile eBlast history + billing.';

CREATE INDEX IF NOT EXISTS idx_nl_drafts_client ON newsletter_drafts(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nl_drafts_type   ON newsletter_drafts(draft_type, publication_id);

-- Seed eBlast as a digital-ad product so proposals can include it.
-- product_type='eblast' is already allowed by the 004 enum. Pricing
-- is a placeholder ($350/send); edit in the digital products admin.
INSERT INTO digital_ad_products (pub_id, name, slug, product_type, description, rate_monthly, sort_order, is_active)
SELECT p.id,
       'eBlast (per send)',
       'eblast-per-send',
       'eblast',
       'Dedicated email to the ' || p.name || ' newsletter subscriber list. Branded header, advertiser-authored body, CTA button, sponsored disclaimer.',
       350,
       100,
       true
  FROM publications p
 WHERE p.id IN ('pub-the-malibu-times','pub-paso-robles-press','pub-atascadero-news')
   AND NOT EXISTS (SELECT 1 FROM digital_ad_products d WHERE d.pub_id = p.id AND d.product_type = 'eblast');

NOTIFY pgrst, 'reload schema';
