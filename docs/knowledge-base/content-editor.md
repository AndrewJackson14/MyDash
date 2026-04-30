---
role: content-editor
display_name: Content Editor
team_role_label: Content Editor
department: Editorial
team_members: [Camille]
reports_to: editor-in-chief
last_updated: 2026-04-29
version: 1.0
---

# Content Editor

## Role Summary

The Content Editor is the editorial workhorse — the seat where stories get edited line-by-line, photos get selected, SEO metadata gets polished, and the queue moves from `Draft` to `Edit` to `Ready`. Camille owns this seat across all publications. She also drafts the weekly newsletter and frontline-edits social posts before EIC approval.

## Core Responsibilities

- **Edit pass on every story.** Dev edit, copy edit, AP/house style enforcement. Move stories from `Draft` → `Edit`.
- **Send back / approve.** When a story needs writer follow-up, comment + send back. When ready, push to `Edit` and tag the EIC for approval.
- **Photo selection and cutlines.** Pick featured image from `media_assets`, write captions, verify photo credits (`photo_credit` field).
- **SEO polish.** `seo_title`, `seo_description`, `slug`, social share image (`og_image_id`).
- **Category and section assignment.** Per-pub `categories` (Featured, Home, Health, etc.).
- **Newsletter composition.** Drag-drop ordering, AI blurbs, preview, send (EIC final approval for major sends).
- **Social Composer drafts.** Initial draft for X / FB / IG / LinkedIn posts; EIC approves before publish.
- **Cross-publish flagging.** When a story belongs on a sister site, set `cross_published_stories` row.
- **Comment moderation.** When public comments are wired (currently deferred), Camille triages.
- **Tag / category housekeeping.** Keep `article_tags` clean.

## Daily Workflow

1. **Open Production (`/editorial`).** Workflow tab. Filter to "My Edits" — stories assigned to her or in `Draft` that need a pass.
2. **Process the queue oldest-first.** Stuck stories (>3 days untouched) get priority — they signal a writer / EIC bottleneck.
3. **Edit each story in StoryEditor.** Tiptap composer. Save autosaves; first autosave of the day on a given story emits `story_worked_on` (effort) for her target progress.
4. **Move to `Edit`** when her pass is done. EIC picks up from there.
5. **Address EIC sendbacks.** When a story comes back with comments, address and bump back to `Edit`.
6. **From Layout inbox** — Anthony's flag-back team_notes. Show in the dashboard "From Layout" tile. Address each (page-fit issues, photo credit gaps, etc.) and reply.
7. **Newsletter prep day** — typically once a week. Drag-drop the week's published stories, edit blurbs, send to test, hand off to EIC for final approval.
8. **Direction queue** — read EIC / publisher direction notes; reply.

## MyDash Modules Used

| Module | Purpose | Permission Level |
|--------|---------|------------------|
| My Dash | Role dashboard with edit-queue counter and "From Layout" inbox | Full |
| Calendar | Story due dates | Full |
| Production (Editorial) | Story workflow kanban — primary surface | Full |
| Flatplan | Read-only — see where stories land on pages | Read |
| Media Library | Featured images, caption + credit edits | Full |
| Newsletters | Weekly draft + send | Full |
| Social Composer | Compose draft posts | Full |

Camille's `module_permissions` default per [TeamModule.jsx:55](src/pages/TeamModule.jsx#L55): `dashboard, calendar, editorial, flatplan, medialibrary, social-composer`.

## Key Workflows

### Edit pass on a story

1. Open story from Production page → click card → StoryEditor opens.
2. First save of the day on this story emits `story_worked_on` event (effort).
3. Edit body, headline, lead, attribution. Tiptap supports inline formatting + image embeds.
4. Polish SEO fields: `seo_title` (60 chars), `seo_description` (160 chars), `slug`, `excerpt`.
5. Pick featured image from Media Library or upload. Sets `featured_image_url` + (optionally) `og_image_id`.
6. Set `category` from per-pub list. If category is missing, ask EIC.
7. Comment any final author-attention items inline.
8. Move to `Edit` (left dropdown) → story disappears from her queue, surfaces in EIC's approval queue. Emits `story_filed` (outcome).

See `_shared/workflows.md#editorial-flow` for the full pipeline.

### Sending a story back to writer

1. In StoryEditor → Status dropdown → `Draft` (with comment).
2. Inline-comment the specific changes needed.
3. Writer's dashboard shows the story re-queued; they'll address.

### Newsletter weekly send

1. Open Newsletters → pick pub.
2. The composer auto-populates with `sent_to_web=true` stories from the past week.
3. Drag-drop into desired order. Toggle off any she doesn't want to include.
4. Each story has an AI-generated blurb — edit if needed (one-click regenerate).
5. Set subject + preheader.
6. Send to her own email as a test.
7. EIC final approval — she pings him via team_notes.
8. EIC approves → click Send to subscribers (or "Schedule for tomorrow 6am").

### Addressing a flag-back from Anthony

1. Layout sidebar shows `team_notes` from Anthony with `context_type='page_layout_issue'` (page number, fit issue, photo problem).
2. Click the note → opens the relevant story / page.
3. Fix (cut copy to fit, swap photo, request a higher-res image).
4. Reply to the note → Anthony sees in his dashboard.

## Decisions This Role Owns

- **Edit pass content choices.** What stays, what cuts, how to restructure.
- **Headline + SEO.** Web headline, social title, slug.
- **Photo selection + cutline.** Which featured image, what caption.
- **Category assignment.** Picking from the EIC-managed taxonomy.
- **Newsletter ordering + blurbs.** EIC approves; she shapes.
- **Social post drafts.** EIC approves; she drafts.

## Decisions That Require Escalation

- **Story kill.** EIC decides if a story dies.
- **`web_approved` flag.** Only EIC sets this.
- **Sensitive stories.** Legal-flag stories go to EIC before any editorial choices get final.
- **Cross-publish to sister site.** EIC's call (Camille can flag intent).
- **New category creation.** EIC owns taxonomy.

## Handoffs

### To Editor-in-Chief (Nic / Andrew)

- **Story moved to `Edit`** — surfaces in his approval queue. Emits `story_filed` (outcome).
- **Newsletter for final review** via team_notes.
- **Sensitive story flag** via team_notes with explicit legal-review request.

### To Layout Designer (Anthony)

- **Story marked `Ready`** with `print_issue_id` set. Surfaces in Anthony's "Ready for Layout" tile.
- **Replies to flag-back notes** so he knows the page-fit issue is resolved.

### To Writers / Freelancers

- **Send-back with comments** via StoryEditor inline comments + status flip.

### From Editor-in-Chief

- **Sendbacks** — story moves from `Edit` back to `Draft` with EIC comments.
- **Direction notes** — coverage priorities, kill decisions.

### From Writers / Freelancers

- **Drafts submitted** — `status='Draft'` → writer flags done → moves to `Edit` for her pass.

### From Layout Designer (Anthony)

- **Flag-back notes** — page-layout issues that need editorial resolution.

## KPIs & Success Metrics

Surfaced on her dashboard + the publisher's role-level views:

- **Stories edited / day.** Daily target seeded at 5 (placeholder; Hayley tunes via Activity Targets admin).
- **Stories published / day.** Daily target 3 (placeholder).
- **Queue depth.** Stories in `Draft` + `Edit` assigned to her or unassigned in pubs she covers.
- **Stuck stories.** Count of `Edit` items >3 days old (urgency).
- **First-pass rate.** Stories that go to `Ready` without a sendback round-trip. (Not yet a tile; surfaces via Performance Review → Editorial Metrics.)

## Common Issues & Resolutions

| Issue | Resolution |
|---|---|
| Story showing wrong featured image on StellarPress | `featured_image_url` is the source of truth — edit in StoryEditor → save → wait for ISR (~5min). |
| Slug change broke an inbound link | Add a redirect: MySites → pick pub → Redirects tab → add `old_path → new_path`. |
| Newsletter blurb regeneration is off-tone | Edit manually. AI is a starting point, not a finisher. |
| Tag dropdown empty | Per-pub `tags` table — add via TeamModule's Tag Manager (or ask EIC to add). |
| Story can't be moved to `Edit` | Likely a required-field validation (missing slug, category, etc.). Check the toast / error in the editor. |
| Photo credit field doesn't save | `photo_credit` is plain text on `stories`. If save fails, check the network tab — likely an RLS issue if a non-EIC tries to flip web_approved at the same time. |
| Story copy too long for the page Anthony assigned | Anthony's flag-back will name the issue — cut copy, change story to a sidebar, or request a layout adjustment. |

## Glossary References

See `_shared/glossary.md` for: Story, Page Story, sent_to_web, print_status, web_approved, StoryEditor, Tiptap, BunnyCDN, editorial_permissions.

See `_shared/workflows.md` for: editorial flow, issue press-readiness.
