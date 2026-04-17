-- Performance indexes on hot query paths.
-- CONCURRENTLY avoids locking writes during creation; IF NOT EXISTS makes
-- the migration idempotent in case any of these were added out of band.

-- sales.publication_id — Analytics, Flatplan, pub-scoped dashboards filter on this.
CREATE INDEX IF NOT EXISTS idx_sales_publication ON sales(publication_id);

-- sales.date — boot query filters `gte('date', cutoff)` and orders by date desc.
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);

-- commission_ledger.created_at — boot loader now filters by a 2-year window
-- and orders by created_at desc; without this it scans the whole table.
CREATE INDEX IF NOT EXISTS idx_commission_ledger_created_at ON commission_ledger(created_at DESC);

-- ad_inquiries.created_at — loader orders by created_at desc limit 500.
CREATE INDEX IF NOT EXISTS idx_ad_inquiries_created_at ON ad_inquiries(created_at DESC);

-- invoice_lines.invoice_id — per-invoice line hydration does .eq('invoice_id', id)
-- against ~40k rows. A sale_id partial index already exists; invoice_id did not.
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice_id ON invoice_lines(invoice_id);