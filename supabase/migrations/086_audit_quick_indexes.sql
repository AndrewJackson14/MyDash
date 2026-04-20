-- ============================================================
-- Composite indexes for the hot paths called out in AUDIT-2026-04-20.md
--
-- Simple / additive migration. IF NOT EXISTS so re-running is a no-op
-- if any index was already added by a prior hotfix.
-- ============================================================

-- stories(publication_id, slug) — article-detail lookups across every
-- publication's frontend. Existing idx_stories_slug is single-column
-- and not enough when two pubs share a slug.
CREATE INDEX IF NOT EXISTS idx_stories_pub_slug
  ON stories(publication_id, slug);

-- invoices(status, client_id) — Billing page's main filter combines
-- both. Existing invoices indexes are on rep_id / contract_id only.
CREATE INDEX IF NOT EXISTS idx_invoices_status_client
  ON invoices(status, client_id);

-- sales(status, rep_id) — SalesCRM jurisdiction filter. Existing
-- indexes are publication_id / date single-column.
CREATE INDEX IF NOT EXISTS idx_sales_status_rep
  ON sales(status, rep_id);

-- team_notes(from_user, to_user, created_at DESC) — Messaging inbox
-- sort orders by conversation pair. Existing idx_team_notes_to is
-- (to_user, is_read, created_at) which helps the unread count but
-- not the Messaging page's thread-by-pair query.
CREATE INDEX IF NOT EXISTS idx_team_notes_pair
  ON team_notes(from_user, to_user, created_at DESC);
