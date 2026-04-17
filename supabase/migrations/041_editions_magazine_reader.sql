-- Add magazine reader columns to existing editions table
ALTER TABLE editions ADD COLUMN IF NOT EXISTS page_images_base_url text;
ALTER TABLE editions ADD COLUMN IF NOT EXISTS page_image_format text DEFAULT 'webp';
ALTER TABLE editions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE editions ADD COLUMN IF NOT EXISTS is_published boolean DEFAULT true;
ALTER TABLE editions ADD COLUMN IF NOT EXISTS status text DEFAULT 'ready';
