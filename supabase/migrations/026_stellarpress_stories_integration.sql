-- 026_stellarpress_stories_integration.sql
-- Wires MyDash and StellarPress together via shared Supabase DB by adding the missing schema pieces.

-- 1. Add missing columns to stories (non-destructive)
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS excerpt text,
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS category_slug text,
  ADD COLUMN IF NOT EXISTS site_id text,
  ADD COLUMN IF NOT EXISTS featured_image_url text,
  ADD COLUMN IF NOT EXISTS featured_image_id text,
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS correction_note text,
  ADD COLUMN IF NOT EXISTS web_status text default 'none',
  ADD COLUMN IF NOT EXISTS print_status text default 'none',
  ADD COLUMN IF NOT EXISTS print_issue_id text references issues(id),
  ADD COLUMN IF NOT EXISTS priority text default 'normal',
  ADD COLUMN IF NOT EXISTS story_type text default 'article',
  ADD COLUMN IF NOT EXISTS source text default 'staff',
  ADD COLUMN IF NOT EXISTS sponsor_name text,
  ADD COLUMN IF NOT EXISTS category_id text,
  ADD COLUMN IF NOT EXISTS content_json jsonb,
  ADD COLUMN IF NOT EXISTS is_featured boolean default false,
  ADD COLUMN IF NOT EXISTS is_premium boolean default false,
  ADD COLUMN IF NOT EXISTS is_sponsored boolean default false,
  ADD COLUMN IF NOT EXISTS edit_count int default 0,
  ADD COLUMN IF NOT EXISTS view_count int default 0,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_significant_edit_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_for_web_at timestamptz,
  ADD COLUMN IF NOT EXISTS editor_id uuid references team_members(id);

-- 2. Create missing categories table
CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY,
  name text,
  slug text,
  publication_id text REFERENCES publications(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Create missing social_posts table
CREATE TABLE IF NOT EXISTS social_posts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  story_id uuid REFERENCES stories(id) ON DELETE CASCADE,
  platform text,
  post_text text,
  status text DEFAULT 'draft',
  posted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Create sites view mapping to publications
-- Ensure settings and favicon_url exist on publications
ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS favicon_url text;

-- Drop if table exists just in case testing created it, then create view
DROP TABLE IF EXISTS sites CASCADE;
CREATE OR REPLACE VIEW sites AS
SELECT 
  id,
  name,
  website_url as domain,
  true as is_active,
  settings,
  favicon_url,
  created_at,
  updated_at
FROM publications
WHERE has_website = true;

-- 5. Trigger to sync site_id to publication_id automatically
CREATE OR REPLACE FUNCTION sync_story_site_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.publication_id IS NOT NULL THEN
    NEW.site_id := NEW.publication_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_story_site_id ON stories;
CREATE TRIGGER trigger_sync_story_site_id
BEFORE INSERT OR UPDATE ON stories
FOR EACH ROW
EXECUTE FUNCTION sync_story_site_id();

-- 6. Essential Indexes
CREATE INDEX IF NOT EXISTS idx_stories_slug ON stories(slug);
CREATE INDEX IF NOT EXISTS idx_stories_site_id ON stories(site_id);
CREATE INDEX IF NOT EXISTS idx_stories_web_status ON stories(web_status);

-- 7. RLS settings
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'categories' AND policyname = 'Authenticated users can read categories') THEN
        CREATE POLICY "Authenticated users can read categories" ON categories FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'categories' AND policyname = 'Authenticated users can modify categories') THEN
        CREATE POLICY "Authenticated users can modify categories" ON categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'social_posts' AND policyname = 'Authenticated users can read social_posts') THEN
        CREATE POLICY "Authenticated users can read social_posts" ON social_posts FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'social_posts' AND policyname = 'Authenticated users can modify social_posts') THEN
        CREATE POLICY "Authenticated users can modify social_posts" ON social_posts FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;

    -- Ensure anon can read published stories
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stories' AND policyname = 'Anon can read published stories') THEN
        CREATE POLICY "Anon can read published stories" ON stories FOR SELECT TO anon USING (status IN ('Published', 'Sent to Web') OR web_status = 'published');
    END IF;
END $$;

-- Allow anon and authenticated to select from sites view
GRANT SELECT ON sites TO anon, authenticated;

-- Ensure schema cache reload
NOTIFY pgrst, 'reload schema';
