-- Migration 174 — Industries become the canonical taxonomy.
--
-- Two-part:
--   1. Seed the 33 names previously hardcoded in
--      src/pages/sales/constants.js INDUSTRIES into the `industries`
--      table. Markup_percent defaults to 0; existing markup rows are
--      untouched.
--   2. Replace the super_admin-only write policy with one that also
--      lets Publisher-role team members add/edit industries (so Hayley
--      can curate without code changes).
--
-- clients.industries stays TEXT[] of names — no schema change. The
-- seeded names match what existing rows already store, so existing
-- ClientProfile benchmark joins keep working.

-- 1. Seed canonical industry names. ON CONFLICT (slug) DO NOTHING so
--    re-running is idempotent and existing markup-bearing rows aren't
--    overwritten.
INSERT INTO industries (name, slug, markup_percent) VALUES
  ('Wine & Spirits',                       'wine-spirits',                       0),
  ('Restaurants & Dining',                 'restaurants-dining',                 0),
  ('Real Estate',                          'real-estate',                        0),
  ('Home Services',                        'home-services',                      0),
  ('Financial Services',                   'financial-services',                 0),
  ('Healthcare & Wellness',                'healthcare-wellness',                0),
  ('Legal Services',                       'legal-services',                     0),
  ('Automotive',                           'automotive',                         0),
  ('Retail / Shopping',                    'retail-shopping',                    0),
  ('Hospitality / Hotels & Lodging',       'hospitality-hotels-lodging',         0),
  ('Agriculture / Farming / Ranching',     'agriculture-farming-ranching',       0),
  ('Education',                            'education',                          0),
  ('Nonprofit / Community',                'nonprofit-community',                0),
  ('Government / Public Agencies',         'government-public-agencies',         0),
  ('Construction / Development',           'construction-development',           0),
  ('Technology',                           'technology',                         0),
  ('Arts & Entertainment',                 'arts-entertainment',                 0),
  ('Beauty & Personal Care',               'beauty-personal-care',               0),
  ('Fitness & Recreation',                 'fitness-recreation',                 0),
  ('Food & Beverage',                      'food-beverage',                      0),
  ('Accounting & Tax',                     'accounting-tax',                     0),
  ('Marketing & Advertising',              'marketing-advertising',              0),
  ('Architecture & Design',                'architecture-design',                0),
  ('Engineering',                          'engineering',                        0),
  ('Consulting',                           'consulting',                         0),
  ('Photography / Videography',            'photography-videography',            0),
  ('Printing & Signage',                   'printing-signage',                   0),
  ('Staffing & HR',                        'staffing-hr',                        0),
  ('Property Management',                  'property-management',                0),
  ('Veterinary Services',                  'veterinary-services',                0),
  ('Funeral Services & Memorial',          'funeral-services-memorial',          0),
  ('Pest Control',                         'pest-control',                       0),
  ('Cleaning & Janitorial',                'cleaning-janitorial',                0)
ON CONFLICT (slug) DO NOTHING;

-- 2. Replace write policy: super_admin OR Publisher.
--    Read policies (industries_read_all, industries_anon_read) stay
--    as-is — anyone signed in or anon can list.
DROP POLICY IF EXISTS industries_super_admin_write ON industries;
DROP POLICY IF EXISTS industries_publisher_write   ON industries;

CREATE POLICY industries_publisher_write ON industries
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid()
        AND (tm.global_role = 'super_admin' OR tm.role = 'Publisher')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.auth_id = auth.uid()
        AND (tm.global_role = 'super_admin' OR tm.role = 'Publisher')
    )
  );
