# Knowledge Base

The internal Knowledge Base ("KB") lives inside `stories` — same table the
public-facing articles use. We tag KB articles with `audience = 'internal'`
to keep the team-only content separate from website content.

## Authoring

1. Editorial → Story Editor → New Story.
2. In the meta sidebar, set **Audience** to `Internal Knowledge Base`.
3. Write the title, excerpt (used in KB list previews), and body.
4. Saving is automatic.

The `audience` field defaults to `public` for any story without an explicit
choice — existing 11k+ articles continue to behave as before.

## Where it appears

- **Knowledge Base page** (sidebar → Content → Knowledge Base): list +
  search of every `audience='internal'` story. Click to read inline.
- **MyHelper bot** (floating chat, ⌘/): reads KB articles via Supabase
  service role to ground its answers. Same source — no separate corpus.

## Where it does NOT appear

- Public StellarPress sites — anon RLS now requires
  `sent_to_web = true AND audience = 'public'`, so a misconfigured KB
  article can't leak.
- Editorial dashboard / public story lists — those filter on the existing
  `audience = 'public'` default.

## Permissions

- **Authoring:** anyone with `editorial` or `stories` permission (existing
  story-edit policy).
- **Reading the KB page:** any authenticated team member — a dedicated
  RLS policy `Authed can read internal KB` opens read access regardless
  of editorial permission so non-editors can browse.
- **Bot reads:** service role bypasses RLS as designed.

## Migration

`supabase/migrations/080_stories_audience.sql` introduced:
- `stories.audience text not null default 'public' check (in
  ('public','internal'))`
- partial index `idx_stories_audience_updated` for fast list lookups
- updated anon read policy
- new `Authed can read internal KB` policy
