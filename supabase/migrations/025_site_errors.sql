-- ═══════════════════════════════════════════════════════
-- 025: Site Errors — expand schema for StellarPress error tracking
-- ═══════════════════════════════════════════════════════

ALTER TABLE site_errors ADD COLUMN IF NOT EXISTS status_code INT;
ALTER TABLE site_errors ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE site_errors ADD COLUMN IF NOT EXISTS stack_trace TEXT;
ALTER TABLE site_errors ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE site_errors ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE site_errors ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE site_errors ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE site_errors ADD COLUMN IF NOT EXISTS resolved_by UUID;

CREATE INDEX IF NOT EXISTS idx_site_errors_pub ON site_errors(publication_id);
CREATE INDEX IF NOT EXISTS idx_site_errors_type ON site_errors(error_type);
CREATE INDEX IF NOT EXISTS idx_site_errors_created ON site_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_errors_resolved ON site_errors(resolved) WHERE resolved = FALSE;
