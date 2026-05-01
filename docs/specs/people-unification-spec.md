# People Unification — Build Spec

**Version:** 1.0
**Last updated:** 2026-04-30
**Owner:** Nic Mattson (Support Admin)
**Status:** Ready for implementation
**Builds on:** Migration 178 (team_role enum consolidation)

---

## Goal

Replace `team_members` with a unified `people` table that represents every human (or bot) connected to 13 Stars in any non-subscriber capacity. Separate authors from team members at the schema level. Track contractors and contractor payments cleanly. Build a contractor portal as a follow-up.

Subscribers stay in their own table forever; an optional FK links workforce people who happen to subscribe.

---

## Conceptual model

**`people`** = anyone we know personally — staff, contractors, authors, drivers, bots, wire services.
**`subscribers`** = anyone who consumes our product (separate, ~10k+ rows).
**`clients`** + **`client_contacts`** = advertisers (out of scope for this round).

A person can have multiple **labels** (`staff`, `contractor`, `author`, `driver`, `bot`, `wire`). Labels describe categories of relationship — what kind of person they are to us. They're additive: Camille is `[staff, author]`, a stringer is `[contractor, author]`, the Press Processor is `[bot, author]`.

A person also has an operational **role** (the existing 8-value enum from migration 178: `Publisher`, `Salesperson`, `Stringer`, `Ad Designer`, `Layout Designer`, `Content Editor`, `Office Administrator`, `Bot`). Role is what they *do*; labels are what they *are*. Role is required for staff and bots; can be `Stringer` for contractors; nullable for non-workforce contributors.

A person also has a **status** (`active`, `inactive`, `retired`) — describes their current relationship to the company.

### Examples

| Person | labels | role | status |
|---|---|---|---|
| Hayley Mattson | `[staff, author]` | `Publisher` | `active` |
| Camille DeVaul | `[staff, author]` | `Content Editor` | `active` |
| Anthony (layout) | `[staff]` | `Layout Designer` | `active` |
| Mark Diaz the stringer | `[contractor, author]` | `Stringer` | `active` |
| A delivery driver who also writes | `[contractor, driver, author]` | `Stringer` | `active` |
| Departed staff with archived stories | `[author]` | `null` | `retired` |
| Press Processor bot | `[bot, author]` | `Bot` | `active` |
| Wire service | `[wire, author]` | `null` | `active` |

---

## Schema

### `people` table

```sql
CREATE TABLE people (
  -- Identity
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_name    text NOT NULL,
  legal_name      text,                  -- For pen names; admin-only visibility
  slug            text UNIQUE NOT NULL,  -- Lowercase, hyphens. Powers voice profile lookup.
  previous_names  text[] DEFAULT '{}',   -- Aliases (e.g. maiden names) for byline search
  
  -- Contact
  email           text,
  phone           text,
  website         text,
  bio             text DEFAULT '',
  
  -- Categorization
  labels          text[] NOT NULL DEFAULT '{}',
                  -- CHECK: subset of {staff, contractor, author, driver, bot, wire}
  role            team_role,             -- Optional operational role; uses migration 178 enum
  status          text NOT NULL DEFAULT 'active',
                  -- CHECK: active | inactive | retired
  
  -- Workforce-only fields
  auth_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  permissions     text[] DEFAULT '{}',
  module_permissions text[] DEFAULT '{}',
  assigned_pubs   text[] DEFAULT '{all}',
  global_role     text,                  -- existing super_admin etc.
  
  -- Contractor fields
  rate_type       text,                  -- per_article, per_word, per_route, hourly, flat
  rate_amount     numeric(10,2),
  qb_vendor_id    text,                  -- QuickBooks vendor reference for 1099 sync
  
  -- Lifecycle
  retired_at      timestamptz,
  notes           text DEFAULT '',
  is_hidden       boolean DEFAULT false, -- Hide from rosters/dropdowns without retiring
  
  -- Alert preferences (existing team_members fields)
  alerts          text[] DEFAULT '{}',
  alert_preferences jsonb,
  ooo_from        date,
  ooo_until       date,
  alerts_mirror_to uuid REFERENCES people(id) ON DELETE SET NULL,
  
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  
  CONSTRAINT people_labels_valid CHECK (
    labels <@ ARRAY['staff', 'contractor', 'author', 'driver', 'bot', 'wire']::text[]
  ),
  CONSTRAINT people_status_valid CHECK (
    status IN ('active', 'inactive', 'retired')
  ),
  CONSTRAINT people_email_unique UNIQUE NULLS NOT DISTINCT (email)
);

CREATE INDEX idx_people_slug ON people(slug);
CREATE INDEX idx_people_labels ON people USING gin(labels);
CREATE INDEX idx_people_status ON people(status) WHERE status = 'active';
CREATE INDEX idx_people_role ON people(role) WHERE role IS NOT NULL;
CREATE INDEX idx_people_auth ON people(auth_id) WHERE auth_id IS NOT NULL;
CREATE INDEX idx_people_display_name ON people(display_name);
CREATE INDEX idx_people_email ON people(email) WHERE email IS NOT NULL;
```

### `story_authors` junction (joint bylines)

```sql
CREATE TABLE story_authors (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  story_id     uuid REFERENCES stories(id) ON DELETE CASCADE,
  person_id    uuid REFERENCES people(id) ON DELETE RESTRICT,
  byline_order int DEFAULT 0,            -- 0 = primary, 1 = second listed, etc.
  created_at   timestamptz DEFAULT now(),
  UNIQUE(story_id, person_id)
);

CREATE INDEX idx_story_authors_story ON story_authors(story_id);
CREATE INDEX idx_story_authors_person ON story_authors(person_id);
```

### `contractor_payments` (renamed from `freelancer_payments`)

```sql
ALTER TABLE freelancer_payments RENAME TO contractor_payments;
ALTER TABLE contractor_payments
  RENAME COLUMN freelancer_id TO person_id;
ALTER TABLE contractor_payments
  ADD COLUMN payment_type text,           -- per_story, per_route, per_shoot, flat, hourly
  ADD COLUMN route_id uuid REFERENCES driver_routes(id) ON DELETE SET NULL,
  ADD COLUMN creative_job_id uuid REFERENCES creative_jobs(id) ON DELETE SET NULL;

-- Re-FK person_id to point at people instead of team_members:
ALTER TABLE contractor_payments
  DROP CONSTRAINT freelancer_payments_freelancer_id_fkey;
ALTER TABLE contractor_payments
  ADD CONSTRAINT contractor_payments_person_id_fkey
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE RESTRICT;
```

### `subscribers` table — minimal change

```sql
ALTER TABLE subscribers
  ADD COLUMN linked_person_id uuid REFERENCES people(id) ON DELETE SET NULL;

CREATE INDEX idx_subscribers_linked_person ON subscribers(linked_person_id)
  WHERE linked_person_id IS NOT NULL;
```

### `stories` table — re-FK author_id

```sql
ALTER TABLE stories DROP CONSTRAINT IF EXISTS stories_author_id_fkey;
-- Backfill happens in migration script (see below)
ALTER TABLE stories
  ADD CONSTRAINT stories_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES people(id) ON DELETE SET NULL;
```

`stories.author` (text byline) stays as-is — that's the "as it appeared in print" string. The FK is the source of truth for queries; the text is a denormalized convenience that may differ in historical cases (e.g., maiden names).

### `team_members` table — gets dropped

After all FK rewires complete and the `people` table is verified, drop `team_members` entirely. Don't keep it as a view; the rename is intentional.

---

## Re-FK every table that points at `team_members`

Migration 178 noted 14 RLS policies referencing `team_members.role`; the schema has many more FKs. The migration script must enumerate every one and rewrite to point at `people`. Known list (from grep across all migrations):

**Story-related:**
- `stories.author_id`
- `stories.editor_id`
- `stories.assigned_to`
- `stories.placed_by`
- `stories.assigned_by`
- `stories.edited_by`

**Sales-related:**
- `sales.assigned_to`
- `proposals.assigned_to`
- `proposals.created_by`
- `commission_ledger.salesperson_id`
- `commission_payouts.salesperson_id`
- `salesperson_pub_assignments.salesperson_id`
- `commission_rates.salesperson_id`
- `outreach_campaigns.created_by`
- `outreach_campaigns.assigned_to`
- `outreach_entries.assigned_to`

**Billing-related:**
- `invoices.created_by`
- `invoices.rep_id`
- `payments.received_by`
- `bills.approved_by`

**Tickets/comms:**
- `service_tickets.assigned_to`
- `service_tickets.escalated_to`
- `ticket_comments.author_id`
- `communications.author_id`
- `team_notes.from_user`
- `team_notes.to_user`

**Misc:**
- `legal_notices.placed_by`
- `legal_notices.verified_by`
- `creative_jobs.assigned_to`
- `notifications.user_id`
- `calendar_events.created_by`
- `activity_log.user_id`
- `activity_log.actor_id` (mig 170)
- `activity_log.related_user_id` (mig 170)
- `media_assets.uploaded_by`
- `client_contacts.created_by` (if present)
- `briefing_configs.user_id`
- `daily_briefings.recipient_user_id`
- `proposal_drafting_log.rep_id`
- `my_priorities.team_member_id`
- `my_priorities.added_by`
- `my_priorities.highlighted_by`
- `flatplan_page_status.changed_by`
- `issue_proofs.uploaded_by`
- `issue_proof_annotations.author_id`
- `print_runs.ordered_by`
- `tearsheets` related FKs
- `route_instances.driver_id` (FK to drivers, not team_members — verify)
- `driver_messages.driver_id` (FK to drivers, not team_members — verify)

The migration script must do a full schema scan to enumerate the actual FK list at execution time (Postgres has `information_schema.referential_constraints` for this). Don't trust this hand-written list to be complete.

**FK rewire pattern:**
```sql
-- For each FK that references team_members(id):
ALTER TABLE <table> DROP CONSTRAINT <fk_name>;
ALTER TABLE <table>
  ADD CONSTRAINT <fk_name>
  FOREIGN KEY (<col>) REFERENCES people(id) <on_delete_clause>;
```

Since `people.id` will be backfilled with the same UUIDs as `team_members.id` (see migration order below), no data update is needed — just the constraint swap.

---

## RLS policies — rewire all 19 from migration 178

Migration 178 dropped and recreated 19 policies on `team_members.role`. This migration does the same dance but on `people.role`. The body of each policy is identical — only the table reference changes (`team_members` → `people`).

The migration script must:
1. Drop all policies that reference `team_members` in their USING/WITH CHECK clauses
2. Re-point any FKs as listed above
3. Recreate each policy against `people`

Use a programmatic approach (loop over `pg_policies` and reissue) rather than hand-writing each — there are 19 today and counting.

---

## Migration script order

Single transaction-wrapped migration `179_people_unification.sql` (next number after 178). Big-bang per Q6.1.

```sql
BEGIN;

-- ────────────────────────────────────────────────────────────
-- Phase 1: Create people table + helpers
-- ────────────────────────────────────────────────────────────
CREATE TABLE people ( ... );  -- as above
CREATE INDEX ...;
CREATE FUNCTION my_person_id() ...;  -- replaces my_team_member_id()

-- ────────────────────────────────────────────────────────────
-- Phase 2: Backfill people from team_members
-- Same UUIDs — preserves all existing FK references
-- ────────────────────────────────────────────────────────────
INSERT INTO people (
  id, display_name, slug, email, phone, role, status,
  labels, auth_id, permissions, module_permissions, assigned_pubs,
  global_role, rate_type, rate_amount,
  alerts, alert_preferences, ooo_from, ooo_until, alerts_mirror_to,
  is_hidden, created_at, updated_at, notes
)
SELECT
  tm.id,
  tm.name AS display_name,
  lower(regexp_replace(tm.name, '[^a-zA-Z0-9]+', '-', 'g')) AS slug,
  tm.email,
  tm.phone,
  tm.role,
  CASE
    WHEN tm.is_active = false THEN 'retired'
    WHEN tm.is_hidden = true AND tm.is_active = true THEN 'active'  -- bots
    ELSE 'active'
  END AS status,
  CASE
    WHEN tm.role = 'Bot' THEN ARRAY['bot']::text[]
    WHEN tm.role = 'Stringer' THEN ARRAY['contractor', 'author']::text[]
    WHEN tm.is_freelance = true THEN ARRAY['contractor']::text[]
    ELSE ARRAY['staff']::text[]
  END AS labels,
  tm.auth_id,
  tm.permissions,
  tm.module_permissions,
  tm.assigned_pubs,
  tm.global_role,
  tm.rate_type,
  tm.rate_amount,
  tm.alerts,
  tm.alert_preferences,
  tm.ooo_from,
  tm.ooo_until,
  tm.alerts_mirror_to,
  tm.is_hidden,
  tm.created_at,
  tm.updated_at,
  ''
FROM team_members tm;

-- ────────────────────────────────────────────────────────────
-- Phase 3: Auto-create people rows for historical bylines
-- (per Q4.4: bylines appearing ≥3 times that don't match existing people)
-- ────────────────────────────────────────────────────────────
WITH historical_bylines AS (
  SELECT
    s.author AS byline,
    COUNT(*) AS story_count,
    MAX(s.published_at) AS last_published
  FROM stories s
  WHERE s.author IS NOT NULL
    AND s.author <> ''
    AND s.author NOT ILIKE '% and %'   -- skip joint for now (Phase 5)
    AND s.author NOT ILIKE '% & %'
  GROUP BY s.author
  HAVING COUNT(*) >= 3
),
unmatched AS (
  SELECT hb.byline, hb.last_published, hb.story_count
  FROM historical_bylines hb
  WHERE NOT EXISTS (
    SELECT 1 FROM people p WHERE p.display_name = hb.byline
  )
)
INSERT INTO people (display_name, slug, labels, status, role, notes)
SELECT
  u.byline,
  lower(regexp_replace(u.byline, '[^a-zA-Z0-9]+', '-', 'g')) AS slug,
  CASE
    WHEN u.byline ILIKE '%press release%' THEN ARRAY['bot', 'author']::text[]
    WHEN u.byline ILIKE '%associated press%'
      OR u.byline ILIKE '%reuters%'
      OR u.byline ILIKE '%wire%' THEN ARRAY['wire', 'author']::text[]
    ELSE ARRAY['author']::text[]
  END AS labels,
  CASE
    WHEN u.last_published > now() - interval '18 months' THEN 'active'
    ELSE 'retired'
  END AS status,
  NULL AS role,
  format('Auto-created from %s historical stories. Last published: %s',
         u.story_count, u.last_published::date) AS notes
FROM unmatched u;

-- ────────────────────────────────────────────────────────────
-- Phase 4: Backfill stories.author_id where it's NULL but
--         stories.author text matches a people row
-- ────────────────────────────────────────────────────────────
UPDATE stories s
SET author_id = p.id
FROM people p
WHERE s.author = p.display_name
  AND s.author_id IS NULL;

-- ────────────────────────────────────────────────────────────
-- Phase 5: Joint byline handling (story_authors junction)
-- This is the gnarly one. Done in a Python pre-migration script
-- if SQL string-splitting gets too ugly. SQL version:
-- ────────────────────────────────────────────────────────────
CREATE TABLE story_authors ( ... );  -- as above

-- For solo bylines (author_id is set, no " and " in author text):
INSERT INTO story_authors (story_id, person_id, byline_order)
SELECT s.id, s.author_id, 0
FROM stories s
WHERE s.author_id IS NOT NULL
  AND s.author NOT ILIKE '% and %'
  AND s.author NOT ILIKE '% & %';

-- For joint bylines: invoke a helper function that splits the byline,
-- finds-or-creates each people row, inserts story_authors rows.
-- See split_joint_byline() below.

-- ────────────────────────────────────────────────────────────
-- Phase 6: Re-FK every table from team_members → people
-- ────────────────────────────────────────────────────────────
-- Programmatic loop using information_schema (see implementer notes).
-- Roughly: for each FK r where r.references team_members(id):
--   ALTER TABLE <r.table> DROP CONSTRAINT <r.name>;
--   ALTER TABLE <r.table> ADD CONSTRAINT <r.name>
--     FOREIGN KEY (<r.column>) REFERENCES people(id) ...;

-- ────────────────────────────────────────────────────────────
-- Phase 7: Drop and recreate all RLS policies referencing team_members
-- ────────────────────────────────────────────────────────────
-- Programmatic loop using pg_policies. For each policy that references
-- team_members in its USING/WITH CHECK clause:
--   1. Save the policy definition
--   2. DROP POLICY
--   3. Reissue with team_members → people substituted

-- ────────────────────────────────────────────────────────────
-- Phase 8: Rename freelancer_payments → contractor_payments + add columns
-- ────────────────────────────────────────────────────────────
ALTER TABLE freelancer_payments RENAME TO contractor_payments;
ALTER TABLE contractor_payments RENAME COLUMN freelancer_id TO person_id;
ALTER TABLE contractor_payments
  ADD COLUMN payment_type text,
  ADD COLUMN route_id uuid REFERENCES driver_routes(id) ON DELETE SET NULL,
  ADD COLUMN creative_job_id uuid REFERENCES creative_jobs(id) ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────
-- Phase 9: Add subscribers.linked_person_id
-- ────────────────────────────────────────────────────────────
ALTER TABLE subscribers
  ADD COLUMN linked_person_id uuid REFERENCES people(id) ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────
-- Phase 10: Drop dead columns from people (carried over from team_members)
-- ────────────────────────────────────────────────────────────
ALTER TABLE people
  DROP COLUMN IF EXISTS specialty,
  DROP COLUMN IF EXISTS availability;

-- (rate_type, rate_amount, is_freelance — the latter renamed conceptually
-- to "has contractor label" — already removed at the migration boundary
-- since they don't appear in the people INSERT statement above.)

-- ────────────────────────────────────────────────────────────
-- Phase 11: Drop team_members
-- ────────────────────────────────────────────────────────────
DROP TABLE team_members CASCADE;

-- ────────────────────────────────────────────────────────────
-- Phase 12: Stringer triage — move no-byline stringers to subscribers
-- with pending opt-in (per Q4.4)
-- ────────────────────────────────────────────────────────────
-- For people rows with role='Stringer' and labels=['contractor','author']
-- but zero stories, transition them out:
WITH no_byline_stringers AS (
  SELECT p.id, p.email, p.display_name
  FROM people p
  WHERE 'contractor' = ANY(p.labels)
    AND 'author' = ANY(p.labels)
    AND NOT EXISTS (
      SELECT 1 FROM stories s WHERE s.author_id = p.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM story_authors sa WHERE sa.person_id = p.id
    )
)
-- Insert into subscribers with status='pending' and 30-day expiry
INSERT INTO subscribers (
  type, status, first_name, last_name, email,
  publication_id, source, notes,
  expiry_date  -- 30 days from now
)
SELECT
  'newsletter' AS type,
  'pending' AS status,
  split_part(nbs.display_name, ' ', 1) AS first_name,
  split_part(nbs.display_name, ' ', 2) AS last_name,
  nbs.email,
  -- Pick a default pub for the subscription; configurable
  (SELECT id FROM publications WHERE id = 'PRP') AS publication_id,
  'migrated_from_writer_list' AS source,
  format('Migrated from team_members on people-unification. Original display: %s', nbs.display_name) AS notes,
  (now() + interval '30 days')::date AS expiry_date
FROM no_byline_stringers nbs
WHERE nbs.email IS NOT NULL AND nbs.email <> '';

-- Mark those people as retired (not deleted) for audit trail
UPDATE people p
SET status = 'retired',
    notes = notes || E'\nMigrated to subscribers (pending opt-in) on people-unification.',
    is_hidden = true
WHERE p.id IN (SELECT id FROM no_byline_stringers);

-- The opt-in confirmation email is sent by a separate cron job
-- (see "Opt-in confirmation flow" below). It's not part of this migration.

NOTIFY pgrst, 'reload schema';

COMMIT;
```

---

## Joint byline splitter

For Phase 5 — joint bylines like `"Camille DeVaul and Hayley Mattson"` need decomposition into multiple `story_authors` rows.

Implementation as a SQL function:

```sql
CREATE OR REPLACE FUNCTION split_joint_byline(byline_text text)
RETURNS text[] AS $$
DECLARE
  parts text[];
BEGIN
  -- Replace " & " and " and " with comma+space, then split on comma+space
  byline_text := regexp_replace(byline_text, '\s+(and|&)\s+', ', ', 'g');
  byline_text := regexp_replace(byline_text, ',\s*,\s*', ', ', 'g');
  parts := regexp_split_to_array(byline_text, ',\s*');
  -- Trim each, filter empty
  RETURN ARRAY(
    SELECT trim(p) FROM unnest(parts) AS p WHERE trim(p) <> ''
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Then for each story with a joint byline:
INSERT INTO story_authors (story_id, person_id, byline_order)
SELECT
  s.id,
  p.id,
  ord - 1 AS byline_order
FROM stories s,
     LATERAL unnest(split_joint_byline(s.author)) WITH ORDINALITY AS parts(name, ord)
JOIN people p ON p.display_name = parts.name
WHERE s.author ILIKE '% and %' OR s.author ILIKE '% & %';
```

Edge cases:

- A name actually containing "and" (uncommon). The splitter would mangle it. Acceptable risk for v1; manually review any pathological output.
- A joint byline where one component doesn't match an existing `people` row. The INSERT silently skips the missing one. Need to surface those for Hayley to review post-migration: query `stories.author` containing " and " where `story_authors` has fewer rows than expected.

---

## Application-side changes

### `useAppData.jsx`

Replace every `team_members` reference. Highest-touch file. The boot fetcher selects from `team_members`; change to `people`. Field renames:
- `name` stays as `display_name` in DB but the JS hook can still expose it as `name` for UI compat
- `is_freelance` is gone — replace with `labels.includes('contractor')`
- `is_freelance ? '...' : '...'` UI logic becomes label-based

### `useAuth.jsx` and `team_member_id` references

`my_team_member_id()` SQL function must be renamed to `my_person_id()`. All callers updated. JWT mapping logic stays the same — `auth_id` is on `people` now.

### Filtering active staff in dropdowns

Anywhere the UI shows "team dropdown" today (assignee picker, story author picker, etc.), the query becomes:
```sql
SELECT * FROM people
WHERE status = 'active'
  AND is_hidden = false
  AND 'staff' = ANY(labels)
ORDER BY display_name;
```

For author byline pickers in StoryEditor:
```sql
SELECT * FROM people
WHERE status = 'active'
  AND 'author' = ANY(labels)
ORDER BY display_name;
```

### Voice profile resolution (editorial-assistant integration)

Update `shared/voice_kb.py` resolver. Per the simplified editorial-assistant-spec.md, the resolver was substring-matching `display_name` against `stories.author` text. Now it can use the FK:

```python
def resolve_voice(story_author_id, story_author_text):
    if not story_author_id:
        # No FK — fall back to substring match against active author profiles
        return resolve_by_substring(story_author_text)
    
    # FK lookup — ask DB for the person's slug + labels
    person = db.query("""
        SELECT slug, labels, status FROM people WHERE id = %s
    """, story_author_id)
    
    # Skip wire / bot bylines
    if 'wire' in person.labels or 'bot' in person.labels:
        return load("_default")
    
    profile_path = f"voices/{person.slug}.md"
    if exists(profile_path):
        return load(person.slug)
    return load("_default")
```

Joint byline handling stays the same — detected at the byline text layer before resolution runs.

---

## Opt-in confirmation flow (for migrated no-byline stringers)

Per Q4.4 + your follow-up:

**Day 0 (migration runs):**
- Subscribers row created with `status='pending'`, `expiry_date = now() + 30 days`
- People row marked `retired`, hidden

**Day 1 (next morning, separate cron job — out of scope for this migration):**
- For each pending subscriber with `source='migrated_from_writer_list'`, send opt-in email
- Email includes a "confirm subscription" link with a token
- Email content: "You're getting this because you were on our writer list. Confirm to keep getting our newsletter, ignore to be removed."

**Day 1 to Day 30:**
- If user clicks confirm → subscriber status → `active`
- If user doesn't → subscriber status stays `pending`

**Day 31 (cron):**
- For pending subscribers past their `expiry_date`, status → `cancelled`
- Removed from active newsletter sends

**Implementation:** A separate Edge Function + cron job, spec'd separately. This migration just sets the data up correctly.

---

## Contractor portal (separate spec)

Per Q5.2, you want a contractor portal where freelancers can take actions (upload stories, check payment status, update their profile). **This is a follow-up spec, not part of this migration.** Listed here so it's tracked.

The schema supports it: contractors can have `auth_id` on their `people` row, log in, see only their own data via RLS.

A future spec doc `docs/specs/contractor-portal-spec.md` covers:
- Login UX (separate URL? Same URL with role-based view?)
- What contractors can do (upload story drafts, view payment history, edit their profile, update banking info for ACH)
- RLS policies that scope contractors to their own data
- StoryEditor permissions for contractor-uploaded drafts

---

## Acceptance criteria

### Phase 1: Migration runs cleanly
- [ ] Migration 179 executes in single transaction without errors
- [ ] Row counts match: `count(team_members)` = `count(people WHERE auth_id IS NOT NULL OR labels && ARRAY['staff','contractor','bot']::text[])`
- [ ] `team_members` table no longer exists
- [ ] Every FK that pointed at `team_members(id)` now points at `people(id)`
- [ ] All 19+ RLS policies recreated, semantically identical
- [ ] `my_team_member_id()` renamed to `my_person_id()`, all callers updated

### Phase 2: Data integrity
- [ ] Every `stories.author_id` references a valid `people.id`
- [ ] Every distinct `stories.author` text appearing ≥3 times has a matching `people` row
- [ ] Joint bylines correctly populate `story_authors` with byline_order
- [ ] No orphaned references — `SELECT * FROM <any FK column> WHERE col NOT IN (SELECT id FROM people)` returns 0 for every rewired column

### Phase 3: Application
- [ ] MyDash boots without errors
- [ ] Team dropdowns show only `labels @> ARRAY['staff']` people
- [ ] Story author pickers show only `labels @> ARRAY['author']` active people
- [ ] Existing assignee/sales/proposal flows continue to work (no FK breakage)
- [ ] Editorial assistant voice resolver uses FK-based lookup
- [ ] Activity log writes work (related_user_id resolves correctly)

### Phase 4: Cleanup
- [ ] No-byline stringers migrated to `subscribers` with status='pending'
- [ ] Their `people` rows marked retired and hidden
- [ ] `freelancer_payments` renamed to `contractor_payments` with new columns
- [ ] `subscribers.linked_person_id` column added

---

## Out of scope

- Subscribers data migration (no change to existing subscribers)
- Clients/client_contacts migration (separate future spec)
- Contractor portal (separate future spec)
- Opt-in confirmation email Edge Function (separate spec; migration just preps data)
- Newsletter subscription type discrimination (uses existing `subscribers.type`)
- Author archive pages on StellarPress
- "Meet our writers" public profile pages

---

## Open implementation questions

1. **Default publication for migrated stringers' subscriber rows.** The Phase 12 query hard-codes `PRP`. Should it instead pick the publication where the stringer wrote most often? Recommend: yes, use mode of their archived stories; fall back to PRP if no stories.

2. **What happens to existing `subscribers` rows whose email matches a person being migrated?** Likely some overlap — a stringer might already be on the newsletter list. Recommend: detect overlap before insert, set `linked_person_id` on the existing subscriber row instead of creating a duplicate.

3. **`UNIQUE NULLS NOT DISTINCT` on `people.email`.** Postgres 15+ feature. Confirms Supabase project is on PG15+ before using; otherwise use a partial unique index `WHERE email IS NOT NULL`.

4. **Bot identity emails.** Migration 088 created bot rows with `@mydash.local` emails. These migrate to `people` cleanly. Verify after migration.

5. **Auth user records for retired staff.** Postgres `auth.users` rows referenced by `people.auth_id`. When someone retires, do we delete their auth record? Recommend: keep, with `auth_id` cleared from `people` only after Hayley confirms.

6. **`team_role` enum stays.** Migration 178's enum is still the operational role taxonomy. The migration doesn't touch it; `people.role` reuses it.

---

## Build order

### Phase A: Pre-migration audit
1. Run audit queries to know what we're dealing with:
```sql
   SELECT COUNT(*) FROM team_members;
   SELECT role, COUNT(*) FROM team_members GROUP BY role;
   SELECT COUNT(DISTINCT author) FROM stories WHERE author IS NOT NULL;
   SELECT COUNT(*) FROM stories WHERE author_id IS NULL AND author IS NOT NULL;
   SELECT COUNT(*) FROM stories WHERE author ILIKE '% and %' OR author ILIKE '% & %';
   SELECT COUNT(*) FROM team_members tm WHERE NOT EXISTS (SELECT 1 FROM stories WHERE author_id = tm.id);
```
2. Report counts to Nic before writing the migration.

### Phase B: Schema migration (single SQL file)
3. Write `supabase/migrations/179_people_unification.sql` per the structure above
4. Test on a Supabase branch (clone of prod) first
5. Verify acceptance criteria on the branch
6. Apply to production

### Phase C: Application updates
7. Update `useAppData.jsx`: `team_members` → `people` everywhere
8. Update `useAuth.jsx`: `my_team_member_id()` → `my_person_id()`
9. Update every dropdown query to use label-based filtering
10. Update Editorial Assistant `voice_kb.py` for FK-based resolution
11. Update Settings UI (if there's a team management page)

### Phase D: New UI surfaces
12. Add Authors management page in Settings (CRUD for `people` rows with `author` label)
13. StoryEditor byline picker → dropdown of active authors
14. Update activity log display for new field names

### Phase E: Stringer transition
15. Verify no-byline stringers migrated to subscribers
16. Build opt-in email Edge Function (separate spec)
17. Cron job for 30-day pending expiry

### Phase F: Documentation
18. Update `docs/knowledge-base/` role docs to reflect `people` table
19. Update API docs / internal references
20. Note migration in changelog

---

## Notes for implementer

- **Single transaction.** Wrap the entire migration in `BEGIN ... COMMIT`. Any failure rolls back cleanly. This is critical with dozens of FK rewires.
- **Use `information_schema` for FK enumeration.** Don't trust hand-written FK lists. Query `referential_constraints` at migration time to find every FK pointing at `team_members(id)`.
- **Use `pg_policies` for RLS enumeration.** Same logic. Programmatic policy migration.
- **Test backfill on copy-of-prod first.** Joint byline splitter especially — pathological cases like names containing "and" need to be caught and handled.
- **Bot identities preserve UUIDs.** The four bot UUIDs in migration 088 (`a1111111-...`, `a2222222-...`, etc.) must come through unchanged.
- **`stories.author` text field is the source of truth for the byline as printed.** Don't update this column unless explicitly asked. The FK + `previous_names` array support search; the text preserves print history.
- **Post-migration: query for unmatched joint bylines.** Show Hayley any joint bylines where `split_joint_byline()` produced names that didn't match a `people` row. She decides per-name whether to create one.