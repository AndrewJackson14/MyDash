-- Track which catalog products an inquiry expressed interest in.
-- Soft array (not FK-checked) so deleting a product later doesn't
-- error out historical inquiries; reps just see "—" for the row.
ALTER TABLE ad_inquiries
  ADD COLUMN IF NOT EXISTS interested_product_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

CREATE INDEX IF NOT EXISTS ad_inquiries_interested_products_idx
  ON ad_inquiries USING gin (interested_product_ids);
