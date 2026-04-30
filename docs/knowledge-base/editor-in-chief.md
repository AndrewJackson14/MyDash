---
role: editor-in-chief
display_name: Editor-in-Chief
team_role_label: Editor-in-Chief
department: Leadership
team_members: [Nic Mattson]
reports_to: publisher
last_updated: 2026-04-29
version: 1.0
---

# Editor-in-Chief

## Role Summary

The Editor-in-Chief owns editorial direction across all publications. Sets coverage priorities, approves stories for web and print, manages the editorial taxonomy (categories, sections), and gates the publish-to-web flow. Currently held by Nic Mattson, who also doubles as Support Admin (private journal). Until a separate EIC seat is staffed, the role's queue surfaces fold into the Publisher Dashboard's EIC strip.

## Core Responsibilities

- **Story approval for web and print.** Move stories from `Edit` → `Ready` and flip `web_approved` / `approved_for_print_by`. Until set, stories don't surface to readers.
- **Editorial taxonomy.** Per-pub `categories` (Featured, Home, Health, Real Estate, etc.) and section structure. Adds, renames, reorders.
- **Editorial calendar + coverage planning.** What gets covered in each issue, who's assigned, due dates.
- **Pitch triage.** Inbound from freelancers, press releases, reader tips. Decide what to assign and what to kill.
- **Sensitive story sign-off.** Stories flagged for legal or reputational risk get an EIC review before web publish.
- **Newsletter and social oversight.** Final sign-off on the weekly newsletter; social post drafts when needed.
- **Editorial permissions.** Per-pub `editorial_permissions` for each writer / freelancer (can_assign, can_edit, can_approve_web, can_approve_print, can_publish, can_manage_categories).
- **Cross-publication strategy.** Decides which stories from sister sites cross-publish via `cross_published_stories`.

## Daily Workflow

1. **Open Production (`/editorial`).** Workflow kanban view. Triage what's in `Edit` (approval queue) and what's in `Draft` (stale or new).
2. **Approve / send back / kill.** Move ready stories from `Edit` to `Ready`. Flip `web_approved` for digital, `approved_for_print_by` for print. Use the inline comment thread to send notes back to the writer.
3. **Web Queue tab.** Stories in `Ready` not yet `sent_to_web=true`. Decide schedule + go-live. Manual flip or schedule for later (note: scheduled-publish cron is not yet running — flip manually for now).
4. **Editorial pacing for next press.** Glance at the EIC strip on the dashboard (mirrored from `publisher_issue_pacing_view`) to see how many stories are filed-vs-needed for the next press date.
5. **Newsletter prep** — at least once a week. Open Newsletters, drag-drop the week's stories into order, edit AI-generated blurbs, send to test, send to subscribers.
6. **Direction notes** — write team_notes to writers / Camille / freelancers. Surfaces real-time on their dashboards.
7. **Throughout the day:** respond to writer questions in StoryEditor inline comments, cross-publish flags from sister sites, photo-credit corrections, post-publish corrections (`correction_note`).

## MyDash Modules Used

| Module | Purpose | Permission Level |
|--------|---------|------------------|
| My Dash | Role dashboard with editorial pacing tile | Full |
| Calendar | Editorial assignment due-dates, photo shoots | Full |
| Production (Editorial) | Story workflow kanban, approval queue, web queue | Full (sole approver) |
| Design Studio (Ad Projects) | Read-only — see ad placement context per issue | Read |
| Media Library | Featured images, photo credits | Full |
| Flatplan | Read-only — see story-on-page placement | Read |
| Newsletters | Compose, draft, send | Full |
| Social Composer | Draft / publish social posts | Full |
| MySites | Per-pub site settings, redirects | Full |
| Schedule | Read-only — issue cadence | Read |
| Publications | Read-only — pub roster | Read |
| Team | Read-only — see who's assigned what | Read |
| Analytics / Reports | Audience metrics, story performance (when wired) | Full |
| Knowledge Base | This module; also writes internal articles | Full |
| Journal | Support Admin private journal (Nic only) | Full |

The EIC's `module_permissions` default per [TeamModule.jsx:52](src/pages/TeamModule.jsx#L52): `dashboard, calendar, editorial, flatplan, adprojects, medialibrary, publications, schedule, analytics, team, circulation, social-composer`.

## Key Workflows

### Approving a story for web

1. Story sits in `Edit` after Camille's pass.
2. Open in StoryEditor (Production page → click card).
3. Review headline, body, SEO title/description, slug, featured image, category.
4. Inline-comment any final tweaks needed (Camille or writer addresses).
5. Click "Approve for web" → flips `web_approved=true`, `approved_for_web_by=currentUser.id`, status → `Ready`.
6. Decide go-live timing:
   - **Now** → click Publish → flips `sent_to_web=true`, stamps `published_at`. Emits `story_published` (outcome) to activity_log.
   - **Scheduled** → set `scheduled_at`. *Note: scheduled-publish cron is NOT yet running per BUSINESS_DOMAINS gap. Flip manually at the scheduled time.*
7. Story propagates to StellarPress on next ISR refresh (~5 min).

See `_shared/workflows.md#editorial-flow` for full step-by-step.

### Killing a story

1. Open in StoryEditor.
2. Status dropdown → `Archived`. Add `correction_note` explaining why if relevant.
3. If already published: also flip `sent_to_web=false` to pull from web. Emits `story_unpublished` (transition) event.
4. Optional: write `correction_note` for the public corrections page.

### Editorial permissions per writer

1. Team → click member → Editorial Permissions tab.
2. Per-pub matrix of booleans: `can_assign`, `can_edit`, `can_approve_web`, `can_approve_print`, `can_publish`, `can_manage_editions`, `can_manage_categories`.
3. Save → next page load picks up the change.

### Newsletter approval flow

1. Open Newsletters → pick pub.
2. Drag-drop the week's `sent_to_web=true` stories into the desired order.
3. Edit AI-generated blurbs (one-click regenerate available).
4. Set subject + preheader. Send to self or test list.
5. Approve → send to subscribers via Gmail (small) or SES (large).

## Decisions This Role Owns

- **Story approval (web + print).** Single gate to publication.
- **Editorial taxonomy.** Categories, sections, tags.
- **Coverage priorities.** What gets pitched, assigned, prioritized, killed.
- **Editorial permissions.** Per-pub-per-user permissions for writers and freelancers.
- **Newsletter content + send.** Weekly approval and send.
- **Cross-publication.** Which stories from sister sites pick up.
- **Style + house rules.** When to enforce AP vs house style.
- **Photo credits + rights.** Attribution decisions.

## Decisions That Require Escalation

- **Legal review** of sensitive stories → outside counsel via Publisher.
- **Public corrections / retractions** affecting reputation → Publisher signoff.
- **Editorial budget changes** (freelance rates, photo budgets) → Publisher.
- **New publications or section structures** → Publisher.

## Handoffs

### To Content Editor (Camille)

- **Story comes back from `Edit`** → `Edit` (sent back) with comments. Camille addresses, returns.
- **Approval direction** via team_notes when a story needs a specific edit pass.

### To Writers / Freelancers

- **Assignments** via `stories.assigned_to` + due_date. Writers see in their queue.
- **Edits** via inline StoryEditor comments. Real-time visible.

### To Publisher (Hayley)

- **Sensitive story sign-off requests** via team_notes flagging the story.
- **Editorial budget asks** — informal, usually in conversation.

### From Content Editor (Camille)

- **Story moved to `Edit`** ready for EIC approval. Surfaces in the approval queue.
- **Photo credit / fact questions** via inline comments.

### From Writers / Freelancers

- **Pitches** — currently informal (email, Slack). *Gap per BUSINESS_DOMAINS Walk #3 #1: no pitch intake inbox.*
- **Submitted drafts** — `status='Draft'` → writer marks done → goes to `Edit`.

### From Publisher (Hayley)

- **Direction notes** — coverage priorities, story killings, sensitive-story flags.

## KPIs & Success Metrics

Surfaced on the Publisher Dashboard's EIC strip and the Editor-in-Chief's role dashboard:

- **Approval queue depth** — count of stories in `Edit`. Oldest pending age (red if >3 days).
- **Web queue depth** — `Ready` stories not yet `sent_to_web=true`.
- **Editorial pacing for next press** — % `Ready` vs total assigned to the next upcoming issue.
- **Stories published this week / month** — count from `published_at`.
- **Newsletter open + click rates** — surfaces on `newsletter_drafts.open_count` / `click_count` once SES tracking is wired.

## Common Issues & Resolutions

| Issue | Resolution |
|---|---|
| Story stuck in `Edit` for >3 days | Open the story → comment with specific blockers OR move back to `Draft` and reassign. |
| `web_approved=true` but story not on StellarPress | Check `sent_to_web=true` — `web_approved` alone doesn't push to web. Also check StellarPress ISR — 5-min refresh is normal. |
| Story scheduled but didn't auto-publish | Known gap — scheduled-publish cron not yet running. Manual flip at the time. |
| Author byline shows wrong name | `stories.author` is single text; freelancer multi-byline isn't modeled. Edit author field directly. |
| Cross-published story doesn't appear on sister site | Verify `cross_published_stories.position` is set + StellarPress refresh has run. |
| Newsletter sends rejected | Gmail likely hit recipient cap. Switch to SES via Newsletter settings (Integrations → SES). |
| Permission change not picked up by writer | Their browser session is cached. They need to refresh — `editorial_permissions` reads fresh on page mount. |

## Glossary References

See `_shared/glossary.md` for: Story, Page Story, web_approved, sent_to_web, print_status, cross_published_stories, StellarPress, BunnyCDN, editorial_permissions.

See `_shared/workflows.md` for cross-role workflows: editorial flow, ad lifecycle, issue press-readiness.
