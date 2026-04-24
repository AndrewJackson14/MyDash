-- 106a — extend the legal_notice_status enum.
-- Run this first so 106b can add the affidavit_status / delivery
-- columns without tripping the enum check.
ALTER TYPE legal_notice_status ADD VALUE IF NOT EXISTS 'affidavit_draft';
ALTER TYPE legal_notice_status ADD VALUE IF NOT EXISTS 'affidavit_ready';
ALTER TYPE legal_notice_status ADD VALUE IF NOT EXISTS 'delivered';
