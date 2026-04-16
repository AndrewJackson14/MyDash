-- ═══ TRIAGE CLEANUP: archive/drop stranded schemas ═══

-- 1. Drop empty tables (0 rows, zero code references)
DROP TABLE IF EXISTS distribution_points CASCADE;
DROP TABLE IF EXISTS mailing_exports CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS freelancer_payments CASCADE;

-- 2. Rename social_posts (6 rows, zero code refs, preserving data)
ALTER TABLE social_posts RENAME TO social_posts_archived;

-- 3. Merge profiles → team_members
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS global_role text;
UPDATE team_members tm SET bio = p.bio, global_role = p.global_role
FROM profiles p WHERE tm.auth_id = p.id AND p.bio IS NOT NULL;
DROP TABLE IF EXISTS profiles CASCADE;

-- 4. Add freelancer linkage columns to bills (merge from freelancer_payments)
ALTER TABLE bills ADD COLUMN IF NOT EXISTS story_id uuid;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS freelancer_id uuid;

-- 5. Add lost_reason to sales for pipeline win/loss tracking
ALTER TABLE sales ADD COLUMN IF NOT EXISTS lost_reason text;
