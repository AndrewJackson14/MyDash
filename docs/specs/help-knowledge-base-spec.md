# Help Knowledge Base — Build Spec

**Version:** 1.0
**Last updated:** 2026-04-29
**Owner:** Nic Mattson (Support Admin)
**Status:** Ready for implementation

---

## Goal

Generate **38 user-facing help articles** — one per page/view in MyDash — and seed them into the existing Knowledge Base substrate (`stories` table where `audience='internal'`).

The articles power three surfaces simultaneously:

1. **The Knowledge Base page** (`/knowledgebase`) — searchable list, click to read
2. **MyHelper bot** — already grounds answers from these same rows
3. **Future: per-page contextual help** — a "?" button on each page that opens its KB article in a slideout

One source of truth. No new tables.

---

## Storage Pattern (Existing)

The Knowledge Base page reads from:

```sql
SELECT id, title, excerpt, body, content_json, updated_at, author, author_id, category_slug
FROM stories
WHERE audience = 'internal'
ORDER BY updated_at DESC
LIMIT 500;
```

Articles are created in **StoryEditor** with `audience='internal'`. The MyHelper bot uses the same rows for grounded answers.

For this build, we'll add a `category_slug` value of **`help-page`** to distinguish help articles from other internal SOPs (process docs, onboarding guides, etc.).

We'll also add a custom field `page_id` (in the `metadata` JSONB column on `stories`, or a new column if cleaner) so each article maps to one MyDash page route — enables future contextual help linking.

### Required schema additions

```sql
-- If `metadata` jsonb already exists on stories: just write { "page_id": "..." } to it.
-- If not, add a column:
ALTER TABLE stories ADD COLUMN IF NOT EXISTS page_id text;
CREATE INDEX IF NOT EXISTS idx_stories_page_id ON stories (page_id) WHERE audience = 'internal';
```

---

## Article Template

Every help article follows this exact 6-section structure:

```markdown
# {Page Display Name}

## Purpose
What this page is for, in plain English. 2-4 sentences max. Answers
"why does this page exist?" — not a feature list.

## Who Uses It
Which roles, when in their workflow. Single paragraph. If multiple
roles use it differently, briefly note how.

## How to Use
The primary path through the page. 3-7 bullet points or numbered steps.
Focus on the most common entry → action → exit sequence. Don't try
to document every button.

## Common Tasks
The 3-5 things people actually do here, each as a short subsection
with a heading. Format:

### {Task name}
1. Step
2. Step
3. Step

Keep tasks scoped to "I want to accomplish X" — not "the X menu
contains Y options."

## Tips & Gotchas
Non-obvious things that bite people. Bullet points. Each one is a
self-contained piece of guidance — no longer than 2 sentences.

## Related
Links to other pages/articles in the natural workflow. Format:
- [Page Name](page-id) — when/why someone goes there from here
```

### Frontmatter fields (stored as `stories` row metadata)

| Field | Source | Example |
|---|---|---|
| `title` | Page display name | "My Dash" |
| `audience` | Hardcoded | `internal` |
| `category_slug` | Hardcoded | `help-page` |
| `page_id` | The route ID from `pageMeta.js` | `dashboard` |
| `excerpt` | First sentence of Purpose section | "My Dash is your personalized command surface..." |
| `author` | "MyDash Help" (system author) | "MyDash Help" |
| `author_id` | Nic Mattson's user ID (or service account) | `<uuid>` |

---

## Page Inventory (38 articles)

Source: `src/data/pageMeta.js`

### Dash (4)
1. `dashboard` — My Dash
2. `calendar` — Calendar
3. `messaging` — Messages
4. `mail` — Mail

### Revenue (3)
5. `sales` — Sales
6. `contracts` — Contracts
7. `billing` — Billing

### Editorial / Content (12)
8. `editorial` — Production
9. `adprojects` — Design Studio
10. `medialibrary` — Media Library
11. `flatplan` — Flatplan
12. `layout` — Layout Console
13. `tearsheets` — Tearsheet Center
14. `collections` — Collections
15. `newsletters` — Newsletters
16. `social-composer` — Social Composer
17. `sitesettings` — MySites
18. `knowledgebase` — Knowledge Base
19. `journal` — Journal
20. `performance` — Performance Review

### Advertising (3)
21. `bookings-queue` — Booking Queue
22. `classifieds` — Classifieds
23. `merch` — Merch

### Operations (3)
24. `circulation` — Circulation
25. `servicedesk` — Service Desk
26. `legalnotices` — Legal Notices

### Analytics (1)
27. `analytics` — Reports

### Admin / Systems (6)
28. `team` — Team
29. `publications` — Publications
30. `schedule` — Schedule
31. `emailtemplates` — Email Templates
32. `integrations` — Integrations
33. `dataimport` — Data Import

### Detail / Context (2)
34. `team-member` — Team Member Profile
35. `issue-detail` — Issue Detail

### Already-confirmed answers needed for these (3 + below)
36–38: Any pages discovered during scan that aren't in `pageMeta.js` but are user-reachable. Skip dev-only and public-portal pages.

**Note for implementer:** If the count differs from 38, that's fine — match the actual user-facing surfaces, not the number.

---

## Build Process

### Step 1: Read every page file

For each page in the inventory:

1. Read the JSX file at `src/pages/{PageName}.jsx` (or `src/modules/{ModuleName}/index.jsx` for module-style pages, or `src/components/{ComponentName}.jsx` for the few that live there — e.g., `EditorialDashboard`).
2. Extract:
   - **Component imports** → infers what features exist on the page
   - **Tab definitions** → primary tasks/views
   - **Modal definitions** → secondary actions
   - **Role gates** → who sees what (`currentUser?.role === ...`, `isAdmin`, `jurisdiction.is...`)
   - **Top-of-file comment block** → developer-stated purpose (often the best signal)
   - **`usePageHeader` breadcrumb** → confirmed display name
3. Build a "page profile" with the above.

### Step 2: Apply user-confirmed answers

The user has already answered the 4 core questions (Purpose / Gotcha / Related / Role Differences) for the first 3 pages. These answers are below. **For pages 4–38, the implementer must derive the answers from the codebase scan PLUS the patterns established by these 3 examples.** Do not invent specifics that aren't visible in the code.

#### Page 1: `dashboard` (My Dash) — confirmed answers

- **Purpose:** All three depending on role; My Dash is the personalized command surface ("What's most urgent?" / "What did I miss?" / "What do I do next?")
- **Gotcha:** Missing the activity strip below the fold — users don't realize there's more below the main dashboard content.
- **Related:** Dashboard is the hub, all top-bar pages are spokes (Calendar, Messages, Mail, Sales, Production, etc.)
- **Role Differences:** Yes — Publisher sees `PublisherDashboard` (press timeline, issue cards grid, activity stream, month-at-a-glance, EIC strip). All other roles see `RoleDashboard` (role-specific surface) plus a `RoleActivityStrip` below. Very different surfaces.

#### Page 2: `calendar` (Calendar) — confirmed answers

- **Purpose:** Single source of truth for everyone's deadlines and meetings. One calendar shows Google Calendar events PLUS auto-derived MyDash events (publish dates, ad/ed deadlines, sales actions, story dues) PLUS custom events.
- **Gotcha:** Not knowing custom events sync to Google Calendar (when connected). Users create a custom event expecting it to stay local; it actually pushes to their connected Google Calendar account too.
- **Related:** All — Schedule, Sales, Production, Mail, Messages. Snapshot cards at the bottom deep-link to the relevant page based on role.
- **Role Differences:** Yes — each role gets a different default filter set (e.g., Salesperson sees ad deadlines + sales actions by default; Editor sees ed deadlines + story dues). Snapshot cards below also adapt per role with auto-tuned metrics.

#### Page 3: `messaging` (Messages) — confirmed answers

- **Purpose:** Both — personal DMs for general team chat, AND entity threads for context-specific work discussion (talk about a story IN that story's thread, not in some external chat).
- **Gotcha:** Not realizing the 3 tabs exist (Direct / Entity / Issue). Users only use Direct and miss the contextual threads attached to stories, ad projects, clients, contracts, legal notices, and issues.
- **Related:** Wherever the entity lives — a story thread links from Production, an ad-project thread from Design Studio, a contract thread from Sales/Contracts, etc.
- **Role Differences:** No — every team member sees the same Messages page; only their conversations differ based on what entities they're involved in.

### Step 3: Generate each article

For each page:

1. Use the page profile from Step 1 + the established pattern from the confirmed answers.
2. Apply the 6-section template.
3. Keep total article length **400–800 words**. Concise, scannable.
4. Output as markdown body for the `stories.body` column.
5. Generate an `excerpt` from the first sentence of the Purpose section.

**Tone:**
- Direct, plain English, second person ("You'll see..." not "Users will see...")
- No marketing voice. No "powerful," "robust," "seamless."
- Speak to a working teammate, not a product evaluator.
- Match the existing MyDash internal voice (read a few existing `audience='internal'` rows for tone calibration before writing).

**What to avoid:**
- Don't list every button. List what users actually do.
- Don't restate the obvious. If the page is called "Calendar," don't open with "The Calendar page is for managing your calendar."
- Don't explain features that aren't gotchas. Save Tips & Gotchas for things that surprise people.
- Don't invent role differences that aren't in the code.

### Step 4: Seed the database

For each generated article, insert a row into `stories`:

```sql
INSERT INTO stories (
  title,
  body,
  excerpt,
  audience,
  category_slug,
  page_id,         -- if this column exists; otherwise put in metadata jsonb
  author,
  author_id,
  status,
  created_at,
  updated_at
) VALUES (
  '{title}',
  '{markdown body}',
  '{first sentence of Purpose}',
  'internal',
  'help-page',
  '{page_id}',
  'MyDash Help',
  '{nic-mattson-user-id}',
  'Published',
  now(),
  now()
);
```

Use a single migration file: `supabase/migrations/{NNN}_seed_help_kb_articles.sql`. All 38 inserts in one migration so they apply atomically.

### Step 5: Verification

After seeding:

1. Open `/knowledgebase` in MyDash. Confirm 38 articles list, sorted by `updated_at` (most recent first — they'll all be the same time, so secondary sort by title is fine).
2. Click a few articles. Confirm body renders (the existing `ArticleViewer` modal handles markdown).
3. Open MyHelper bot. Ask "What is My Dash?" — confirm it grounds the answer in the new article.
4. Search the KB for "deadline." Confirm Calendar and Schedule articles surface (since both mention deadlines).

---

## Future Hooks (out of scope for this build)

These are NOT part of the immediate build but the spec preserves their viability:

### Per-page contextual help
A `?` icon in the page header opens a slideout with that page's KB article. Implementation:
- Add a `<HelpButton pageId={pg} />` component to the metadata strip
- Component fetches `stories` where `page_id = {pg} AND audience = 'internal'`
- Renders in a Modal or slideout

### KB article ↔ page sync
When a page's behavior changes (new feature, removed tab), the KB article needs an update prompt.
- A linter script could compare last-updated dates of `src/pages/{Page}.jsx` vs the corresponding KB article
- Flag any page whose code is newer than its article by 30+ days
- Surface in Support Admin Journal as a "KB freshness" weekly check

### Multi-language
The `metadata` jsonb can hold `{ language: 'en' }`; future translations add new rows with same `page_id` but different language. The Knowledge Base page filters by user's locale.

---

## Acceptance Criteria

- [ ] All 38 (or however many user-facing pages exist) help articles exist as `stories` rows with `audience='internal'`, `category_slug='help-page'`, and a `page_id` matching their route ID
- [ ] Each article follows the 6-section template (Purpose / Who Uses It / How to Use / Common Tasks / Tips & Gotchas / Related)
- [ ] Each article is 400–800 words; excerpts are accurate single sentences
- [ ] Articles are visible in `/knowledgebase` page and searchable
- [ ] MyHelper bot can answer "What is {page name}?" correctly using the new articles
- [ ] No invented role differences — if the codebase doesn't show role-specific behavior, the article doesn't claim it
- [ ] All 38 inserts are in a single migration that can be rolled back if needed
- [ ] The 3 confirmed articles (`dashboard`, `calendar`, `messaging`) exactly match the user-confirmed answers above

---

## Notes for Claude Code

- **Read the codebase, not your training data.** Every claim about MyDash behavior must come from the actual JSX file or its imports. Do not generalize from how other CRMs / news platforms work.
- **The 3 confirmed answers are non-negotiable.** Use them verbatim for those articles. They establish the voice and depth.
- **If a page is genuinely simple, the article should be short.** A 400-word article on a thin page is fine. Don't pad to hit the upper bound.
- **If a page has tabs, treat each tab as a likely "Common Task."** That's how users think about them.
- **If you're unsure about a gotcha, leave it out.** Better to ship 2 real gotchas than 5 invented ones.
- **Author name:** Use "MyDash Help" as `author`. Use Nic Mattson's `team_members.id` as `author_id` (look up by email or by role='Editor-in-Chief' for now until Support Admin role exists).
- **Excerpt rule:** First complete sentence of the Purpose section, not the first 100 characters. Trim cleanly.
- **Stop and ask** if any of these conditions arise:
  - The page file doesn't exist or is unreachable
  - Two pages have nearly identical functionality (might need a single article + redirects)
  - The codebase shows behavior that contradicts what `pageMeta.js` says about the page

---

## Build Order

1. Read this spec end-to-end.
2. Confirm the 3 pre-answered articles compile correctly to the template.
3. Scan the codebase: build a page profile for every page in the inventory.
4. Generate articles in batches of 5–7 (output for review before proceeding to the next batch).
5. After all articles approved, write the seeding migration.
6. Apply the migration to the dev database, run verification step.
7. Apply to production after Nic confirms verification passes.
