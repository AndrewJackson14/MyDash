-- magazine_issues view: expose id as text and drop the UUID-only filter.
-- The prior view cast id::uuid, so PostgREST would 400 when StellarPress
-- queried it with a legacy non-UUID id (issues.id is text with arbitrary
-- formats). It also filtered to UUID-format ids only, hiding legacy
-- magazine issues from StellarPress entirely. Keep the Magazine type
-- gate; drop the cast and the regex.

DROP VIEW IF EXISTS magazine_issues;

CREATE VIEW magazine_issues AS
SELECT
  id,
  pub_id AS site_id,
  label AS title,
  lower(regexp_replace(label, '\s+', '-', 'g')) AS slug,
  label AS issue_label,
  EXTRACT(year FROM date)::integer AS year,
  EXTRACT(month FROM date)::integer AS month,
  NULL::text AS cover_image_url,
  NULL::text AS description,
  date = (
    SELECT max(i2.date)
    FROM issues i2
    WHERE i2.pub_id = i.pub_id AND i2.type = 'Magazine'
  ) AS is_current,
  (date::timestamp AT TIME ZONE 'UTC') AS published_at,
  created_at
FROM issues i
WHERE type = 'Magazine';
