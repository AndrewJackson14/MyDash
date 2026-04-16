-- Add QuickBooks sync tracking to invoices and payments,
-- matching the pattern already on bills.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS quickbooks_id text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS quickbooks_synced_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS quickbooks_sync_error text;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS quickbooks_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS quickbooks_synced_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS quickbooks_sync_error text;
