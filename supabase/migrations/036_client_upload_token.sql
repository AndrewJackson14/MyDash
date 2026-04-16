-- Client asset upload tokens for public /upload/:token page
ALTER TABLE ad_projects ADD COLUMN IF NOT EXISTS client_upload_token text UNIQUE;
UPDATE ad_projects SET client_upload_token = gen_random_uuid()::text WHERE client_upload_token IS NULL;
