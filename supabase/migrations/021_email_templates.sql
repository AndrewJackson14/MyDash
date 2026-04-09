-- 021_email_templates.sql
-- Email template system + proposal signature tracking
-- Supports: proposals, contracts, renewals, invoices, marketing, newsletters

CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'proposal', 'contract', 'renewal', 'invoice',
    'marketing', 'newsletter', 'notification', 'other'
  )),
  subject text NOT NULL DEFAULT '',
  html_body text NOT NULL DEFAULT '',
  -- Merge fields available for this template (for UI reference)
  merge_fields text[] DEFAULT '{}',
  -- Branding
  publication_id text REFERENCES publications(id),
  include_letterhead boolean DEFAULT true,
  -- Metadata
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES team_members(id),
  updated_by uuid REFERENCES team_members(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Proposal signatures (public, token-based — like proof approval)
CREATE TABLE IF NOT EXISTS proposal_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  access_token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  signer_name text,
  signer_email text,
  signer_title text,
  -- Signature data
  signed boolean DEFAULT false,
  signed_at timestamptz,
  signed_ip text,
  signed_user_agent text,
  -- The proposal snapshot at time of sending (so edits don't change what was signed)
  proposal_snapshot jsonb,
  -- Lifecycle
  expires_at timestamptz DEFAULT (now() + interval '30 days'),
  viewed_at timestamptz,
  view_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(access_token)
);

CREATE INDEX idx_email_templates_category ON email_templates(category, is_active);
CREATE INDEX idx_proposal_signatures_token ON proposal_signatures(access_token);
CREATE INDEX idx_proposal_signatures_proposal ON proposal_signatures(proposal_id);

-- RLS
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage templates" ON email_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage signatures" ON proposal_signatures
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Public access for signature page (no auth required)
CREATE POLICY "Public can view by token" ON proposal_signatures
  FOR SELECT TO anon USING (true);
CREATE POLICY "Public can update signature" ON proposal_signatures
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
