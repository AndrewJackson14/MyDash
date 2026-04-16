-- Lightweight fact-check / legal review flag on stories.
-- When needs_legal_review=true and legal_reviewed_at is null,
-- the preflight check blocks publish.
ALTER TABLE stories ADD COLUMN IF NOT EXISTS needs_legal_review boolean DEFAULT false;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS legal_reviewed_by uuid;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS legal_reviewed_at timestamptz;
