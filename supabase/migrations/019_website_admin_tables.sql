-- 019_website_admin_tables.sql
-- Website analytics, newsletter subs, site errors, distribution points
-- Required by: Phase 6 (Website Management), Phase 7 (Administrative)

-- Daily page view aggregates for StellarPress analytics
CREATE TABLE IF NOT EXISTS daily_page_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id text REFERENCES publications(id),
  article_id uuid,  -- references StellarPress articles table
  path text,
  view_date date NOT NULL,
  view_count integer DEFAULT 0,
  unique_visitors integer DEFAULT 0,
  UNIQUE(article_id, view_date)
);

CREATE INDEX idx_dpv_date ON daily_page_views(view_date);
CREATE INDEX idx_dpv_pub_date ON daily_page_views(publication_id, view_date);

-- Newsletter email subscribers (separate from print subscribers)
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text,
  publication_id text REFERENCES publications(id),
  source text DEFAULT 'website' CHECK (source IN ('website', 'import', 'manual')),
  status text DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed', 'bounced')),
  subscribed_at timestamptz DEFAULT now(),
  unsubscribed_at timestamptz
);

-- Site error tracking for StellarPress
CREATE TABLE IF NOT EXISTS site_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id text REFERENCES publications(id),
  url text NOT NULL,
  error_type text CHECK (error_type IN ('404', 'missing_image', 'render_error', 'timeout')),
  first_detected_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  hit_count integer DEFAULT 1,
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  notes text
);

-- Physical distribution points (racks, hotels, businesses)
-- Extends existing drop_locations concept with spec-compliant schema
CREATE TABLE IF NOT EXISTS distribution_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location_type text CHECK (location_type IN ('rack', 'hotel', 'business', 'library', 'government')),
  address text,
  city text,
  state text DEFAULT 'CA',
  zip text,
  publication_id text REFERENCES publications(id),
  copy_count integer DEFAULT 10,
  delivery_day text,
  contact_name text,
  contact_phone text,
  is_active boolean DEFAULT true,
  last_restocked_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_distribution_points_pub ON distribution_points(publication_id, is_active);
CREATE INDEX idx_site_errors_pub ON site_errors(publication_id, resolved);
CREATE INDEX idx_newsletter_subs_pub ON newsletter_subscribers(publication_id, status);

-- RLS
ALTER TABLE daily_page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE distribution_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read all" ON daily_page_views FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify" ON daily_page_views FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read all" ON newsletter_subscribers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify" ON newsletter_subscribers FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read all" ON site_errors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify" ON site_errors FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read all" ON distribution_points FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify" ON distribution_points FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow anonymous reads for daily_page_views (StellarPress writes these)
CREATE POLICY "Anon can insert page views" ON daily_page_views FOR INSERT TO anon WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
