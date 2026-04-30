---
role: layout-designer
display_name: Layout Designer
team_role_label: Layout Designer
department: Design / Production
team_members: [Anthony]
reports_to: publisher
last_updated: 2026-04-29
version: 1.0
---

# Layout Designer

## Role Summary

The Layout Designer assembles every print issue page-by-page — placing approved ads, fitting stories to pages, marking pages press-ready, and triggering the send-to-press handoff. Anthony owns this seat across newspapers and magazines. The press cadence runs through him: nothing ships until pages are complete, the Publisher has signed off, and he hits Send-to-Press.

## Core Responsibilities

- **Page layout per issue.** Each page is a 2×4 grid (Flatplan view). Story placements via `page_stories`, ad placements via `sales.page` + `grid_row` + `grid_col`.
- **Mark pages press-ready.** Per-page checklist in Layout Console. Each completion writes `flatplan_page_status.completed_at` and emits `page_press_ready` (outcome).
- **Layout reference uploads.** When a page needs visual direction (ad swap, photo crop), upload reference to `flatplan_page_layouts`.
- **Flag-back to editorial.** When a page has a story-fit issue (copy too long, missing photo), fire a flag-back team_note to Camille / EIC.
- **Press handoff.** After Publisher signoff, trigger send-to-press. Edge Function fires; `issues.sent_to_press_at` stamps; issue locks.
- **Pre-press checks.** Bleed, color space, page count parity (multiples of 4 for newspapers, 8 or 16 for magazines).
- **Print run logging.** *Currently a gap — `print_runs` schema exists but no UI; Anthony tracks runs offline today.*

## Daily Workflow

1. **Open dashboard.** "Active Issues" tile shows the next 21 days of upcoming issues across his assigned pubs, with progress per issue (stories ready, ads approved, pages complete).
2. **Pick the most urgent issue** — typically nearest press date with the lowest completion %.
3. **Open Layout Console for that issue.** Page-by-page grid. Mark pages complete as he finishes layout.
4. **Check the "Ready for Layout" pipeline tile.** Stories in `Ready` + `print_status='on_page'` are queued; he places them.
5. **Address proofs in review.** When ads are `signed_off` but not yet `placed`, drop them onto the right page in Flatplan.
6. **Fire flag-backs** when something doesn't fit. Camille / EIC sees in their dashboard.
7. **Publisher signoff check.** When all pages are complete, the issue surfaces on Hayley's "Awaiting Your Signoff" tile.
8. **Send-to-press.** Once `publisher_signoff_at` is stamped, the button enables. Click → fires the Edge Function → `sent_to_press_at` stamps → issue locks.
9. **Throughout:** check direction notes from Hayley; respond to layout reference uploads.

## MyDash Modules Used

| Module | Purpose | Permission Level |
|--------|---------|------------------|
| My Dash | Anthony-specific dashboard with active-issues queue, ready-for-layout pipeline, Hayley's layout refs | Full |
| Calendar | Press dates, ad/ed deadlines | Full |
| Production (Editorial) | Read-only — see story status across his pubs | Read |
| Design Studio (Ad Projects) | Read-only — see ad approval status before placing | Read |
| Flatplan | Drag-drop ad/story placement, page-by-page grid | Full |
| Layout Console | Per-issue press-readiness checklist + send-to-press | Full (sole trigger) |
| Media Library | Featured-image references, layout reference uploads | Full |

Layout Designer's `module_permissions` default per [TeamModule.jsx:60](src/pages/TeamModule.jsx#L60): `dashboard, calendar, editorial, flatplan, adprojects, medialibrary`.

## Key Workflows

### Marking a page complete

1. Open Layout Console for the issue.
2. Page checklist on the right rail.
3. Each page row shows: story titles assigned, ads placed, completion toggle.
4. Click toggle → writes `flatplan_page_status` row with `completed_at = now()` and `completed_by = currentUser.id`. Emits `page_press_ready` (outcome).
5. Issue progress meter ticks up.

### Send-to-press

The load-bearing handoff. See `_shared/workflows.md#issue-press-readiness` for the full sequence.

1. Verify all pages marked complete (page status rail is fully green).
2. Verify `publisher_signoff_at` is stamped (button is gated; if disabled, ping Hayley via team_notes).
3. Click Send to Press → confirmation modal.
4. Edge Function fires → `sent_to_press_at` + `sent_to_press_by` stamp.
5. Issue locks; Flatplan blocks further drops.
6. Publisher's "From Press" celebration tile lights up for the next 7 days.

### Flag-back to editorial

1. In Layout Console, click "Flag back to editor" on a page or story.
2. Modal: pick context (story title, page number), write the issue ("Copy too long — need 50 words cut" / "Missing photo credit").
3. Submit → writes `team_notes` with `context_type='page_layout_issue'` to the EIC + content editor.
4. They address; reply lands in Anthony's "Replies" feed.

### Layout reference upload

1. Upload a sketch / reference image for a page that needs specific direction.
2. Writes `flatplan_page_layouts` row with the page number + reference URL (Bunny-hosted).
3. Surfaces in Hayley's "Layout Reference Gaps" tile when a page within 14 days of press has no reference yet.

### Fixing a hardcoded `sent_to_press_by` bug

*Per BUSINESS_DOMAINS Walk #4 #10 — a known minor bug.* [src/pages/Flatplan.jsx:127](src/pages/Flatplan.jsx#L127) sets `sent_to_press_by: "publisher"` as a literal string. Should pull from `currentUser.id`. **Anthony does not need to fix this — flagging for the engineering team.** Audit trail remains correct via `sent_to_press_at` timestamp.

## Decisions This Role Owns

- **Page layout** — what goes on which page, where ads + stories sit.
- **Pre-press visual quality.** When a layout looks off, he holds the page back.
- **Flag-back vs. fix-it-himself.** Some fits he resolves; others need editorial.
- **Send-to-press timing.** As soon as Publisher signoff lands.
- **Pre-press checklist** — bleed, color, fonts (informal today).

## Decisions That Require Escalation

- **Page count change** mid-cycle → Publisher (impacts revenue goal + signature math).
- **Press deadline shift** → Publisher (cascading downstream impacts on ads + editorial).
- **Story kill / addition near press** → Editor-in-Chief.
- **Ad swap / pull** near press → Sales Rep + Publisher.

## Handoffs

### To Publisher (Hayley)

- **Issue ready for sign-off** — when all pages are marked complete, issue surfaces on Hayley's "Awaiting Your Signoff" tile.
- **Layout reference requests** when she needs to provide direction on a page.

### To Editor-in-Chief / Content Editor

- **Flag-back notes** via `team_notes context_type='page_layout_issue'`. Surfaces in their "From Layout" inbox.

### To Office Admin (Cami)

- **Issue shipped** signal — `sent_to_press_at` stamped → tearsheet workflow can begin (currently manual; gap in BUSINESS_DOMAINS).

### From Publisher (Hayley)

- **Issue sign-off** — `publisher_signoff_at` enables his Send-to-Press button.
- **Layout reference uploads** — surfaces in his "Hayley's Layout Refs (last 7d)" tile.
- **Direction notes** — strategic priorities, page-treatment requests.

### From Ad Designer (Jen)

- **`ad_press_ready` event / `signed_off` status** — ads ready for placement in Flatplan.

### From Content Editor (Camille)

- **Story `Ready` + `print_issue_id` set** — story ready to drop on a page.

## KPIs & Success Metrics

Surfaced on his role dashboard:

- **Active deadlines** — issues in his pipeline (next 21 days).
- **Pages this month** — count completed via `flatplan_page_status`.
- **Issues this month** — count where he triggered send-to-press.
- **On-time rate** — `sent_to_press_at <= ad_deadline` ratio over the last 30 days.
- **Streak days** — consecutive days with at least one page completion.
- **Queue completion curve** — % of pages completed for in-window issues vs. the pacing curve target (50/70/85/95% at 7/5/3/1 days). Same band thresholds as ad sales pacing.

## Common Issues & Resolutions

| Issue | Resolution |
|---|---|
| Send-to-press button disabled even though all pages are complete | Issue is missing `publisher_signoff_at`. Ping Hayley via team_notes; she signs off from her dashboard. |
| Ad won't drop into a page cell in Flatplan | Cell may already be occupied. Check `sales.page` + `grid_row/col` for that issue — may need to move existing item first. |
| Story title missing photo placement | Featured image not set. Open StoryEditor → set featured_image_url → save → reload Flatplan. |
| Page marked complete but issue progress doesn't tick | `flatplan_page_status` upsert may have raced; refresh Layout Console. |
| `sent_to_press_by` shows "publisher" string in audit | Known bug per BUSINESS_DOMAINS. Engineering ticket; doesn't affect press-readiness. |
| Flag-back to Camille not showing in her dashboard | Verify `team_notes.to_user` matches her auth_id. Realtime should push within seconds. |
| Print-run cost not tracked | Schema exists (`print_runs`, `printers`); no UI. Track offline for now. |

## Glossary References

See `_shared/glossary.md` for: Issue, Page Story, Flatplan, send-to-press, publisher signoff, flag-back, Layout Console, BunnyCDN, print_status.

See `_shared/workflows.md` for: ad lifecycle, editorial flow, issue press-readiness.
