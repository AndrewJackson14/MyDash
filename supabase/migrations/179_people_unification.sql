-- ============================================================
-- 179_people_unification.sql
--
-- Replaces team_members with a unified `people` table per
-- docs/specs/people-unification-spec.md. Single transaction;
-- failure rolls back cleanly.
--
-- Phase A audit (2026-05-01) drove these design choices:
--   • Q5 returned 0 — NO joint bylines under " and " / " & "
--     separators in 88,952 stories. The story_authors table is
--     created and populated for solo bylines (so future joint
--     handling has a junction ready), but NO joint-byline splitter
--     runs.
--   • 14,302 stories have a text byline but no author_id FK. Of
--     those: 3,255 exact-match an existing team_members.name; the
--     other 11,047 spread across 50 distinct unmatched bylines.
--     Phase 4 runs three backfill passes: exact, normalized, then
--     trigram-fuzzy (pg_trgm enabled below).
--   • Top unmatched bylines are publication-name pseudo-authors
--     ("Paso Robles Press" 5,514 / "Atascadero News" 2,442 / etc.)
--     and generic staff strings ("Press Release" 657 / "Letter to
--     Editor" 46). Those are tagged [wire, author] and [bot, author]
--     respectively in Phase 3. The detection is data-driven (joins
--     against publications.name) so future pubs auto-tag correctly.
--   • One known WP-username artifact: bylines stored as
--     "kimdevore_2" need to remap to a real person. Pre-fix in
--     Phase 2b before backfill runs.
--
-- The freelancer_payments table does NOT exist in production, so
-- the spec's Phase 8 (rename → contractor_payments) is skipped.
-- A future contractor-payments spec will create the table fresh.
--
-- DEFERRED FROM THIS MIGRATION:
--   Pre-migration scan found 17 stored functions that reference
--   `team_members` in their bodies (is_admin, has_permission,
--   log_activity, calculate_sale_commission, etc.). Most are
--   load-bearing — RLS policies + activity log triggers depend on
--   them. Their bodies also reference column-renamed identifiers
--   (`tm.name` vs `p.display_name`, `tm.is_active` vs
--   `p.status = 'active'`), so a simple text substitution isn't
--   safe.
--
--   This migration creates `people`, rewires every FK and RLS
--   policy, and seeds backfill — but DOES NOT drop team_members.
--   The team_members table stays in place after this migration
--   (no inbound FKs, no referencing policies) with a forward sync
--   trigger keeping `people` in step with any writes the 17
--   functions still issue against it. Migration 180 follows up:
--     1. Rewrite each of the 17 function bodies hand-by-hand
--        (team_members → people, tm.name → p.display_name,
--         tm.is_active → p.status = 'active', etc.)
--     2. Drop the sync trigger
--     3. DROP TABLE team_members
--
--   Splitting the work avoids corrupting functions that today
--   secure half the app's RLS surface. 180 should land in the
--   same deploy cycle.
--
-- DEPLOYMENT ORDER:
--   1. Apply 179 to production (this migration).
--   2. Land 180 (function rewrites + drop) immediately after.
--   3. Then ship Phase C app changes that target `people` directly.
--   App changes shipping before 180 are safe — the forward sync
--   trigger keeps team_members in sync with people writes too.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- Phase 0: Extensions for fuzzy matching
-- ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ────────────────────────────────────────────────────────────
-- Phase 1: Create people table + indexes + helper fn
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS people (
  -- Identity
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_name    text NOT NULL,
  legal_name      text,
  slug            text UNIQUE NOT NULL,
  previous_names  text[] NOT NULL DEFAULT '{}',

  -- Contact
  email           text,
  phone           text,
  website         text,
  bio             text NOT NULL DEFAULT '',
  avatar_url      text,
  signature_url           text,
  signature_uploaded_at   timestamptz,

  -- Categorization
  labels          text[] NOT NULL DEFAULT '{}',
  role            team_role,
  status          text NOT NULL DEFAULT 'active',

  -- Workforce-only fields
  auth_id            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  permissions        text[] NOT NULL DEFAULT '{}',
  module_permissions text[] NOT NULL DEFAULT '{}',
  assigned_pubs      text[] NOT NULL DEFAULT '{all}',
  global_role        text,
  stellarpress_roles jsonb,

  -- Sales-specific (carried over from team_members)
  commission_trigger          text,
  commission_default_rate     numeric(5,2),
  commission_payout_frequency text,

  -- Contractor fields
  rate_type   text,
  rate_amount numeric(10,2),
  qb_vendor_id text,

  -- Lifecycle
  retired_at   timestamptz,
  notes        text NOT NULL DEFAULT '',
  is_hidden    boolean NOT NULL DEFAULT false,

  -- Alert preferences
  alerts             text[] NOT NULL DEFAULT '{}',
  alert_preferences  jsonb,
  ooo_from           date,
  ooo_until          date,
  alerts_mirror_to   uuid REFERENCES people(id) ON DELETE SET NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT people_labels_valid CHECK (
    labels <@ ARRAY['staff', 'contractor', 'author', 'driver', 'bot', 'wire']::text[]
  ),
  CONSTRAINT people_status_valid CHECK (
    status IN ('active', 'inactive', 'retired')
  )
);

-- Email uniqueness — partial index instead of UNIQUE NULLS NOT DISTINCT
-- so this works on Postgres < 15. Multiple NULLs are allowed; non-null
-- emails must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS people_email_unique
  ON people (lower(email)) WHERE email IS NOT NULL AND email <> '';

CREATE INDEX IF NOT EXISTS idx_people_slug         ON people(slug);
CREATE INDEX IF NOT EXISTS idx_people_labels       ON people USING gin(labels);
CREATE INDEX IF NOT EXISTS idx_people_status       ON people(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_people_role         ON people(role) WHERE role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_people_auth         ON people(auth_id) WHERE auth_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_people_display_name ON people(display_name);
CREATE INDEX IF NOT EXISTS idx_people_display_name_trgm
  ON people USING gin (display_name gin_trgm_ops);

-- Helper: my_person_id() — replaces my_team_member_id().
-- Both functions coexist through Phase B/C; the alias is dropped
-- in Phase D once all callers are updated.
CREATE OR REPLACE FUNCTION my_person_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM people WHERE auth_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION my_person_id() TO anon, authenticated;

-- Helper: build a slug from a display name.
CREATE OR REPLACE FUNCTION people_slugify(input text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(trim(input), '[^a-zA-Z0-9]+', '-', 'g'))
$$;

-- Helper: byline normalizer for the fuzzy backfill.
CREATE OR REPLACE FUNCTION normalize_byline(input text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(regexp_replace(coalesce(input, ''), '[\s,.]+', ' ', 'g'), '\s+', ' ', 'g'))
$$;


-- ────────────────────────────────────────────────────────────
-- Phase 2: Backfill people from team_members (preserves UUIDs)
-- ────────────────────────────────────────────────────────────
INSERT INTO people (
  id, display_name, slug, email, phone,
  role, status, labels,
  auth_id, permissions, module_permissions, assigned_pubs, global_role,
  stellarpress_roles, commission_trigger, commission_default_rate,
  commission_payout_frequency, rate_type, rate_amount,
  alerts, alert_preferences, ooo_from, ooo_until, alerts_mirror_to,
  is_hidden, avatar_url, signature_url, signature_uploaded_at, bio,
  created_at, updated_at, notes
)
SELECT
  tm.id,
  tm.name,
  people_slugify(tm.name) AS slug,
  NULLIF(tm.email, ''),
  NULLIF(tm.phone, ''),
  tm.role,
  CASE
    WHEN tm.is_active = false THEN 'retired'
    ELSE 'active'
  END AS status,
  CASE
    WHEN tm.role = 'Bot'                      THEN ARRAY['bot']::text[]
    WHEN tm.role = 'Stringer'                 THEN ARRAY['contractor', 'author']::text[]
    WHEN tm.is_freelance = true               THEN ARRAY['contractor']::text[]
    ELSE ARRAY['staff']::text[]
  END AS labels,
  tm.auth_id,
  COALESCE(tm.permissions, '{}'),
  COALESCE(tm.module_permissions, '{}'),
  COALESCE(tm.assigned_pubs, ARRAY['all']),
  tm.global_role,
  tm.stellarpress_roles,
  tm.commission_trigger,
  tm.commission_default_rate,
  tm.commission_payout_frequency,
  tm.rate_type,
  tm.rate_amount,
  COALESCE(tm.alerts, '{}'),
  tm.alert_preferences,
  tm.ooo_from,
  tm.ooo_until,
  tm.alerts_mirror_to,
  COALESCE(tm.is_hidden, false),
  tm.avatar_url,
  tm.signature_url,
  tm.signature_uploaded_at,
  COALESCE(tm.bio, ''),
  COALESCE(tm.created_at, now()),
  COALESCE(tm.updated_at, now()),
  ''
FROM team_members tm
WHERE NOT EXISTS (SELECT 1 FROM people p WHERE p.id = tm.id);

-- Slug collisions — if multiple team_members had the same display
-- name (rare but possible), append a discriminator. We can't use
-- ON CONFLICT in the INSERT above because the UUIDs collide on the
-- PK before the slug; the safer pattern is a post-pass uniquification.
DO $$
DECLARE
  rec record;
  candidate text;
  i int;
BEGIN
  FOR rec IN
    SELECT slug, array_agg(id ORDER BY created_at) AS ids
    FROM people GROUP BY slug HAVING count(*) > 1
  LOOP
    i := 1;
    FOREACH candidate IN ARRAY rec.ids[2:array_length(rec.ids, 1)]::uuid[]
    LOOP
      i := i + 1;
      UPDATE people SET slug = rec.slug || '-' || i WHERE id = candidate::uuid;
    END LOOP;
  END LOOP;
END $$;

DO $$ DECLARE n bigint;
BEGIN SELECT count(*) INTO n FROM people;
  RAISE NOTICE '[179] Phase 2 done: % people seeded from team_members', n;
END $$;


-- ────────────────────────────────────────────────────────────
-- Phase 2b: Pre-fix known WP-username import artifacts
-- ────────────────────────────────────────────────────────────
-- "kimdevore_2" appears in 1,051 stories' author text. It's a
-- WordPress import artifact; the real person is Kim DeVore (already
-- in team_members → people). Remap the byline string before any
-- backfill runs so those stories FK to her existing record.
UPDATE stories
SET author = 'Kim DeVore'
WHERE author = 'kimdevore_2';

-- Add the artifact to her previous_names array so byline searches
-- still find her under the WP slug. Idempotent on re-run.
UPDATE people
SET previous_names = array_append(previous_names, 'kimdevore_2')
WHERE display_name = 'Kim DeVore'
  AND NOT ('kimdevore_2' = ANY(previous_names));

DO $$ DECLARE n bigint;
BEGIN SELECT count(*) INTO n FROM stories WHERE author = 'Kim DeVore';
  RAISE NOTICE '[179] Phase 2b done: stories now bylined "Kim DeVore" = %', n;
END $$;


-- ────────────────────────────────────────────────────────────
-- Phase 3: Auto-create people for historical bylines (≥3 stories)
-- not already represented in team_members.
--
-- Label assignment is data-driven, not hardcoded:
--   • Byline matches publications.name             → [wire, author]
--   • Byline matches generic-staff string list      → [bot, author]
--   • Otherwise                                     → [author]
--
-- Status: active if last published in last 18 months, else retired.
-- ────────────────────────────────────────────────────────────
WITH historical_bylines AS (
  SELECT
    s.author AS byline,
    count(*) AS story_count,
    max(s.published_at) AS last_published
  FROM stories s
  WHERE s.author IS NOT NULL AND s.author <> ''
  GROUP BY s.author
  HAVING count(*) >= 3
),
unmatched AS (
  SELECT hb.*
  FROM historical_bylines hb
  WHERE NOT EXISTS (SELECT 1 FROM people p WHERE p.display_name = hb.byline)
),
-- Generic-staff bylines that should be tagged as [bot, author]. List
-- is small + extensible; new entries land in a follow-up migration.
generic_staff(byline) AS (VALUES
  ('Press Release'),
  ('Press Release (auto)'),
  ('Contributed Article'),
  ('Letter to Editor'),
  ('Staff Report'),
  ('editorial'),
  ('13 Stars Manager')
)
INSERT INTO people (display_name, slug, labels, status, role, notes)
SELECT
  u.byline,
  -- Slug uniqueness — append the row count so it can't collide with
  -- existing slugs from team_members.
  CASE
    WHEN EXISTS (SELECT 1 FROM people p WHERE p.slug = people_slugify(u.byline))
    THEN people_slugify(u.byline) || '-byline'
    ELSE people_slugify(u.byline)
  END AS slug,
  CASE
    WHEN EXISTS (SELECT 1 FROM publications WHERE name = u.byline)
      THEN ARRAY['wire', 'author']::text[]
    WHEN EXISTS (SELECT 1 FROM generic_staff gs WHERE gs.byline = u.byline)
      THEN ARRAY['bot', 'author']::text[]
    ELSE ARRAY['author']::text[]
  END AS labels,
  CASE
    WHEN u.last_published > now() - interval '18 months' THEN 'active'
    ELSE 'retired'
  END AS status,
  NULL::team_role AS role,
  format('Auto-created from %s historical stories. Last published: %s',
         u.story_count,
         coalesce(u.last_published::date::text, '(unknown)')) AS notes
FROM unmatched u;

DO $$ DECLARE n bigint;
BEGIN SELECT count(*) INTO n FROM people WHERE notes LIKE 'Auto-created from %';
  RAISE NOTICE '[179] Phase 3 done: % auto-created people from historical bylines', n;
END $$;


-- ────────────────────────────────────────────────────────────
-- Phase 4: Backfill stories.author_id (3 passes)
-- ────────────────────────────────────────────────────────────

-- Pass 1: exact-match. Fast, no false positives.
UPDATE stories s
SET author_id = p.id
FROM people p
WHERE s.author_id IS NULL
  AND s.author IS NOT NULL AND s.author <> ''
  AND p.display_name = s.author;

DO $$ DECLARE n bigint;
BEGIN SELECT count(*) INTO n FROM stories WHERE author_id IS NULL AND author IS NOT NULL AND author <> '';
  RAISE NOTICE '[179] Phase 4 pass-1 (exact) done: % stories still un-FK''d', n;
END $$;

-- Pass 2: normalized match (lower + collapse whitespace/punct).
-- Catches "James Brescia, Ed.D." vs "James Brescia Ed.D." and
-- " camille devaul " vs "Camille DeVaul".
UPDATE stories s
SET author_id = p.id
FROM people p
WHERE s.author_id IS NULL
  AND s.author IS NOT NULL AND s.author <> ''
  AND normalize_byline(s.author) = normalize_byline(p.display_name);

DO $$ DECLARE n bigint;
BEGIN SELECT count(*) INTO n FROM stories WHERE author_id IS NULL AND author IS NOT NULL AND author <> '';
  RAISE NOTICE '[179] Phase 4 pass-2 (normalized) done: % stories still un-FK''d', n;
END $$;

-- Pass 3: previous_names fallback. If the byline matches any
-- alias in someone's previous_names array, link to that person.
UPDATE stories s
SET author_id = p.id
FROM people p
WHERE s.author_id IS NULL
  AND s.author IS NOT NULL AND s.author <> ''
  AND s.author = ANY(p.previous_names);

DO $$ DECLARE n bigint;
BEGIN SELECT count(*) INTO n FROM stories WHERE author_id IS NULL AND author IS NOT NULL AND author <> '';
  RAISE NOTICE '[179] Phase 4 pass-3 (previous_names) done: % stories still un-FK''d', n;
END $$;

-- Pass 4: trigram-fuzzy match. Threshold 0.85 — high enough to avoid
-- false matches between distinct names, low enough to catch the
-- "James J. Brescia" / "James Brescia" / "Dr. James Brescia, Ed.D."
-- family. Each story's text byline matches at most one person.
UPDATE stories s
SET author_id = best.person_id
FROM (
  SELECT
    s2.id AS story_id,
    p.id  AS person_id,
    similarity(s2.author, p.display_name) AS sim,
    row_number() OVER (
      PARTITION BY s2.id
      ORDER BY similarity(s2.author, p.display_name) DESC
    ) AS rn
  FROM stories s2
  JOIN people p
    ON  similarity(s2.author, p.display_name) >= 0.85
  WHERE s2.author_id IS NULL
    AND s2.author IS NOT NULL AND s2.author <> ''
    AND 'author' = ANY(p.labels)  -- only fuzzy-match against author-tagged people
) best
WHERE best.story_id = s.id AND best.rn = 1;

DO $$ DECLARE n bigint;
BEGIN SELECT count(*) INTO n FROM stories WHERE author_id IS NULL AND author IS NOT NULL AND author <> '';
  RAISE NOTICE '[179] Phase 4 pass-4 (trigram>=0.85) done: % stories still un-FK''d (long tail)', n;
END $$;


-- ────────────────────────────────────────────────────────────
-- Phase 5: story_authors junction (solo bylines only — no joint
-- bylines exist in current data per Phase A audit Q5=0).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS story_authors (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  story_id     uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  person_id    uuid NOT NULL REFERENCES people(id)  ON DELETE RESTRICT,
  byline_order int  NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(story_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_story_authors_story  ON story_authors(story_id);
CREATE INDEX IF NOT EXISTS idx_story_authors_person ON story_authors(person_id);

INSERT INTO story_authors (story_id, person_id, byline_order)
SELECT s.id, s.author_id, 0
FROM stories s
WHERE s.author_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM story_authors sa WHERE sa.story_id = s.id
  );

DO $$ DECLARE n bigint;
BEGIN SELECT count(*) INTO n FROM story_authors;
  RAISE NOTICE '[179] Phase 5 done: % solo bylines in story_authors', n;
END $$;


-- ────────────────────────────────────────────────────────────
-- Phase 6: Re-FK every column that pointed at team_members(id).
-- Programmatic — pg_constraint enumerates them; the loop preserves
-- each FK's ON DELETE behavior so semantics don't change.
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  rec record;
  on_delete_clause text;
  on_update_clause text;
BEGIN
  FOR rec IN
    SELECT
      con.conname,
      cls.relname  AS table_name,
      ns.nspname   AS schema_name,
      att.attname  AS column_name,
      con.confdeltype AS delete_action,
      con.confupdtype AS update_action
    FROM pg_constraint con
    JOIN pg_class     cls ON cls.oid = con.conrelid
    JOIN pg_namespace ns  ON ns.oid  = cls.relnamespace
    JOIN pg_attribute att ON att.attrelid = cls.oid AND att.attnum = ANY(con.conkey)
    WHERE con.confrelid = 'public.team_members'::regclass
      AND con.contype = 'f'
    ORDER BY ns.nspname, cls.relname, con.conname
  LOOP
    on_delete_clause := CASE rec.delete_action
      WHEN 'c' THEN 'ON DELETE CASCADE'
      WHEN 'n' THEN 'ON DELETE SET NULL'
      WHEN 'r' THEN 'ON DELETE RESTRICT'
      WHEN 'd' THEN 'ON DELETE SET DEFAULT'
      ELSE ''
    END;
    on_update_clause := CASE rec.update_action
      WHEN 'c' THEN 'ON UPDATE CASCADE'
      WHEN 'n' THEN 'ON UPDATE SET NULL'
      WHEN 'r' THEN 'ON UPDATE RESTRICT'
      WHEN 'd' THEN 'ON UPDATE SET DEFAULT'
      ELSE ''
    END;

    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',
                   rec.schema_name, rec.table_name, rec.conname);
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.people(id) %s %s',
      rec.schema_name, rec.table_name, rec.conname, rec.column_name,
      on_delete_clause, on_update_clause
    );
    RAISE NOTICE '[179] Phase 6: re-FK''d %.%.% → people(id)', rec.schema_name, rec.table_name, rec.column_name;
  END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────
-- Phase 7: Drop + recreate every RLS policy that referenced
-- team_members. The policy bodies are reissued with team_members
-- → people textual substitution.
--
-- Edge case: a policy referencing a column literally named
-- "team_members" inside a string literal would be incorrectly
-- replaced. Audited the existing 19 policies (migration 178
-- recreations); none have that pattern. If a future policy does,
-- this loop needs hand-tightening.
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  rec record;
  new_qual text;
  new_check text;
  cmd_keyword text;
  roles_clause text;
  using_clause text;
  check_clause text;
BEGIN
  FOR rec IN
    SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE qual::text LIKE '%team_members%' OR with_check::text LIKE '%team_members%'
  LOOP
    new_qual  := replace(coalesce(rec.qual::text, ''),       'team_members', 'people');
    new_check := replace(coalesce(rec.with_check::text, ''), 'team_members', 'people');

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   rec.policyname, rec.schemaname, rec.tablename);

    cmd_keyword  := rec.cmd;  -- ALL | SELECT | INSERT | UPDATE | DELETE
    roles_clause := 'TO ' || array_to_string(
      ARRAY(SELECT quote_ident(r) FROM unnest(rec.roles) AS r), ', '
    );
    using_clause := CASE WHEN new_qual <> '' THEN 'USING (' || new_qual || ')' ELSE '' END;
    check_clause := CASE WHEN new_check <> '' THEN 'WITH CHECK (' || new_check || ')' ELSE '' END;

    EXECUTE format(
      'CREATE POLICY %I ON %I.%I FOR %s %s %s %s',
      rec.policyname, rec.schemaname, rec.tablename,
      cmd_keyword, roles_clause, using_clause, check_clause
    );
    RAISE NOTICE '[179] Phase 7: rewrote policy %.%.%', rec.schemaname, rec.tablename, rec.policyname;
  END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────
-- Phase 8: subscribers.linked_person_id
-- (Phase 8 in spec was the freelancer_payments rename; that table
-- doesn't exist in production, so it's skipped. Numbering preserved
-- against the spec for review legibility.)
-- ────────────────────────────────────────────────────────────
ALTER TABLE subscribers
  ADD COLUMN IF NOT EXISTS linked_person_id uuid REFERENCES people(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subscribers_linked_person
  ON subscribers(linked_person_id) WHERE linked_person_id IS NOT NULL;


-- ────────────────────────────────────────────────────────────
-- Phase 9: Drop dead columns from people (carried from team_members
-- but never used in the new model)
-- ────────────────────────────────────────────────────────────
-- specialty + availability never made it into the people INSERT
-- above, so they don't exist on people. Defensive drop in case a
-- future migration replays this section against an already-
-- partially-migrated state — no-op when columns aren't there.
ALTER TABLE people DROP COLUMN IF EXISTS specialty;
ALTER TABLE people DROP COLUMN IF EXISTS availability;


-- ────────────────────────────────────────────────────────────
-- Phase 10: Stringer triage — move zero-byline contractor/authors
-- to subscribers (pending opt-in). Out-of-band Edge Function will
-- send the opt-in email; this migration just preps data.
-- ────────────────────────────────────────────────────────────
-- Note on data model: the subscribers table doesn't have a `source`
-- column, and subscriber_type enum has only print|digital (no
-- 'newsletter' value). The migrated stringer cohort is tagged via
-- the notes prefix `[migrated_from_writer_list]` — a follow-up
-- migration can promote that to a real column or enum value when
-- the opt-in flow is built.
WITH no_byline AS (
  SELECT p.id, p.email, p.display_name
  FROM people p
  WHERE 'contractor' = ANY(p.labels)
    AND 'author'     = ANY(p.labels)
    AND p.email IS NOT NULL AND p.email <> ''
    AND NOT EXISTS (SELECT 1 FROM stories s WHERE s.author_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM story_authors sa WHERE sa.person_id = p.id)
)
INSERT INTO subscribers (
  type, status, first_name, last_name, email,
  publication_id, notes, expiry_date, linked_person_id
)
SELECT
  'digital'::subscriber_type,
  'pending'::subscriber_status,
  split_part(nb.display_name, ' ', 1),
  CASE
    WHEN position(' ' IN nb.display_name) > 0
      THEN substring(nb.display_name FROM position(' ' IN nb.display_name) + 1)
    ELSE NULL
  END,
  lower(nb.email),
  -- Default pub for migrated stringers — first newspaper in the
  -- catalog. Spec open question 1 suggested using the stringer's
  -- mode-of-published-pub, but these have zero stories by
  -- definition, so we use the canonical default.
  (SELECT id FROM publications WHERE id = 'pub-paso-robles-press' LIMIT 1),
  format(
    '[migrated_from_writer_list] Migrated from team_members. Original name: %s. 30-day opt-in window.',
    nb.display_name
  ),
  (now() + interval '30 days')::date,
  nb.id
FROM no_byline nb
WHERE NOT EXISTS (
  SELECT 1 FROM subscribers sub
  WHERE lower(sub.email) = lower(nb.email)
);

-- For people-rows whose email already had a subscriber row, link
-- them rather than creating a duplicate (per spec open question 2).
UPDATE subscribers sub
SET linked_person_id = nb.id
FROM (
  SELECT p.id, p.email
  FROM people p
  WHERE 'contractor' = ANY(p.labels)
    AND p.email IS NOT NULL AND p.email <> ''
) nb
WHERE sub.linked_person_id IS NULL
  AND lower(sub.email) = lower(nb.email);

-- Mark the migrated stringers retired + hidden.
UPDATE people p
SET status     = 'retired',
    is_hidden  = true,
    notes      = notes || E'\nMigrated to subscribers (pending opt-in) on people-unification.',
    retired_at = now()
WHERE 'contractor' = ANY(p.labels)
  AND 'author'     = ANY(p.labels)
  AND p.email IS NOT NULL AND p.email <> ''
  AND NOT EXISTS (SELECT 1 FROM stories s WHERE s.author_id = p.id)
  AND NOT EXISTS (SELECT 1 FROM story_authors sa WHERE sa.person_id = p.id);

DO $$ DECLARE n bigint;
BEGIN SELECT count(*) INTO n FROM subscribers
  WHERE notes LIKE '[migrated_from_writer_list]%';
  RAISE NOTICE '[179] Phase 10 done: % stringer subscribers seeded (pending opt-in)', n;
END $$;


-- ────────────────────────────────────────────────────────────
-- Phase 11: Backward-compat alias for my_team_member_id().
--
-- Old function still has callers in the app code. Keep the alias
-- pointing at the same logic so MyDash continues to boot through
-- Phase C app updates. Drop in a follow-up migration once
-- callers are migrated.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION my_team_member_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT my_person_id();
$$;

GRANT EXECUTE ON FUNCTION my_team_member_id() TO anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- Phase 12: DROP team_members — DEFERRED to migration 180.
--
-- 17 stored functions (is_admin, has_permission, log_activity,
-- calculate_sale_commission, mirror_ooo_team_notes, ...) reference
-- team_members in their bodies. They also reference column-
-- renamed identifiers (tm.name → p.display_name, tm.is_active →
-- p.status = 'active') so a simple text replace isn't safe.
--
-- Dropping team_members here would either:
--   (a) leave those 17 functions referencing a dead table, breaking
--       them at next call (RLS evaluates is_admin() on every query)
--   (b) require CASCADE, which would silently drop the 17 functions
--       and their triggers, breaking even more
--
-- Migration 180 does the function rewrites + drop in one atomic
-- step. team_members stays in place after this migration as an
-- orphaned table (no inbound FKs, no policies referencing it,
-- writes still go through it via the 17 functions but reads are
-- now mostly served by `people`). Coexistence window is short
-- — 180 is the immediate next migration.
--
-- Until 180 lands, both tables coexist. Trigger-based sync below
-- forwards new INSERTs/UPDATEs/DELETEs on team_members to people
-- so the 17 functions' writes don't drift the two tables apart.
-- ────────────────────────────────────────────────────────────

-- Sync trigger: any write to team_members propagates to people.
-- This keeps the 17 functions correct during the coexistence
-- window. The trigger is dropped along with the table in 180.
CREATE OR REPLACE FUNCTION tg_team_members_sync_to_people()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM people WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO people (
      id, display_name, slug, email, phone, role,
      status, labels, auth_id, permissions, module_permissions,
      assigned_pubs, global_role, stellarpress_roles,
      commission_trigger, commission_default_rate, commission_payout_frequency,
      rate_type, rate_amount, alerts, alert_preferences,
      ooo_from, ooo_until, alerts_mirror_to,
      is_hidden, avatar_url, signature_url, signature_uploaded_at, bio,
      created_at, updated_at
    )
    VALUES (
      NEW.id, NEW.name, people_slugify(NEW.name), NULLIF(NEW.email, ''), NULLIF(NEW.phone, ''),
      NEW.role,
      CASE WHEN NEW.is_active = false THEN 'retired' ELSE 'active' END,
      CASE
        WHEN NEW.role = 'Bot'                  THEN ARRAY['bot']::text[]
        WHEN NEW.role = 'Stringer'             THEN ARRAY['contractor', 'author']::text[]
        WHEN NEW.is_freelance = true           THEN ARRAY['contractor']::text[]
        ELSE ARRAY['staff']::text[]
      END,
      NEW.auth_id, COALESCE(NEW.permissions, '{}'),
      COALESCE(NEW.module_permissions, '{}'),
      COALESCE(NEW.assigned_pubs, ARRAY['all']),
      NEW.global_role, NEW.stellarpress_roles,
      NEW.commission_trigger, NEW.commission_default_rate, NEW.commission_payout_frequency,
      NEW.rate_type, NEW.rate_amount,
      COALESCE(NEW.alerts, '{}'), NEW.alert_preferences,
      NEW.ooo_from, NEW.ooo_until, NEW.alerts_mirror_to,
      COALESCE(NEW.is_hidden, false),
      NEW.avatar_url, NEW.signature_url, NEW.signature_uploaded_at,
      COALESCE(NEW.bio, ''),
      COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now())
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END IF;

  -- UPDATE
  UPDATE people SET
    display_name = NEW.name,
    email        = NULLIF(NEW.email, ''),
    phone        = NULLIF(NEW.phone, ''),
    role         = NEW.role,
    status       = CASE WHEN NEW.is_active = false THEN 'retired' ELSE 'active' END,
    auth_id      = NEW.auth_id,
    permissions        = COALESCE(NEW.permissions, '{}'),
    module_permissions = COALESCE(NEW.module_permissions, '{}'),
    assigned_pubs      = COALESCE(NEW.assigned_pubs, ARRAY['all']),
    global_role        = NEW.global_role,
    stellarpress_roles = NEW.stellarpress_roles,
    commission_trigger = NEW.commission_trigger,
    commission_default_rate = NEW.commission_default_rate,
    commission_payout_frequency = NEW.commission_payout_frequency,
    rate_type   = NEW.rate_type,
    rate_amount = NEW.rate_amount,
    alerts      = COALESCE(NEW.alerts, '{}'),
    alert_preferences = NEW.alert_preferences,
    ooo_from    = NEW.ooo_from,
    ooo_until   = NEW.ooo_until,
    alerts_mirror_to = NEW.alerts_mirror_to,
    is_hidden   = COALESCE(NEW.is_hidden, false),
    avatar_url  = NEW.avatar_url,
    signature_url = NEW.signature_url,
    signature_uploaded_at = NEW.signature_uploaded_at,
    bio         = COALESCE(NEW.bio, ''),
    updated_at  = COALESCE(NEW.updated_at, now())
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_members_sync_to_people ON team_members;
CREATE TRIGGER team_members_sync_to_people
  AFTER INSERT OR UPDATE OR DELETE ON team_members
  FOR EACH ROW EXECUTE FUNCTION tg_team_members_sync_to_people();


-- ────────────────────────────────────────────────────────────
-- Phase 13: Trigger to auto-update updated_at on people
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION people_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS people_updated_at ON people;
CREATE TRIGGER people_updated_at
  BEFORE UPDATE ON people FOR EACH ROW
  EXECUTE FUNCTION people_set_updated_at();


-- ────────────────────────────────────────────────────────────
-- Phase 14: RLS on people itself
-- ────────────────────────────────────────────────────────────
ALTER TABLE people ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user can see active people. Retired/
-- hidden rows are visible to admins only.
CREATE POLICY people_authenticated_read ON people
  FOR SELECT TO authenticated
  USING (
    status = 'active' AND is_hidden = false
    OR EXISTS (
      SELECT 1 FROM people me
      WHERE me.auth_id = auth.uid()
        AND (me.global_role = 'super_admin' OR me.role IN ('Publisher', 'Office Administrator'))
    )
  );

-- Write: super_admin or Publisher only.
CREATE POLICY people_admin_write ON people
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM people me
      WHERE me.auth_id = auth.uid()
        AND (me.global_role = 'super_admin' OR me.role = 'Publisher')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM people me
      WHERE me.auth_id = auth.uid()
        AND (me.global_role = 'super_admin' OR me.role = 'Publisher')
    )
  );


-- ────────────────────────────────────────────────────────────
-- Phase 15: PostgREST schema reload + final verify
-- ────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  total      bigint;
  by_label   text;
  unmatched  bigint;
  joint      bigint;
BEGIN
  SELECT count(*) INTO total FROM people;
  SELECT string_agg(label || '=' || c, ', ') INTO by_label FROM (
    SELECT unnest(labels) AS label, count(*) AS c FROM people GROUP BY 1 ORDER BY 1
  ) t;
  SELECT count(*) INTO unmatched FROM stories
    WHERE author_id IS NULL AND author IS NOT NULL AND author <> '';
  SELECT count(*) INTO joint FROM stories
    WHERE author ILIKE '% and %' OR author ILIKE '% & %';

  RAISE NOTICE '[179] Migration complete:';
  RAISE NOTICE '[179]   people total: %', total;
  RAISE NOTICE '[179]   labels: %', by_label;
  RAISE NOTICE '[179]   stories still un-FK''d (long tail): %', unmatched;
  RAISE NOTICE '[179]   stories with joint-byline pattern: % (expected 0)', joint;
END $$;

COMMIT;
