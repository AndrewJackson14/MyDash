---
role: ad-designer
display_name: Ad Designer
team_role_label: Ad Designer
department: Design / Production
team_members: [Jen]
reports_to: publisher
last_updated: 2026-04-29
version: 1.0
---

# Ad Designer

## Role Summary

The Ad Designer builds every display ad sold across all publications. Jen owns this seat. Each ad starts as an `ad_projects` row auto-created when a sale closes; she works through brief intake → design → proof → revision → designer signoff. After her signoff, the rep gets the client's approval and the ad moves to placement in Flatplan. Pacing curve drives her queue: she's expected to hit 50% of an issue's ads done 7 days out, scaling to 100% the day before press.

## Core Responsibilities

- **Brief intake check.** Verify the ad project has the brief filled (headline, style, colors, instructions). If missing, ping the rep.
- **Asset gathering.** Reference ads, client logos, photos. Pulls from `global_assets[]` (reusable per client) and `project_assets[]` (one-off per project).
- **Design pass.** Build proof v1 in the design tool of choice (Adobe / Canva / etc.). Upload via Design Studio's proof upload.
- **Send for client approval.** First upload moves status to `proof_sent`. Emits `proof_sent_for_approval` event (outcome).
- **Revision iteration.** Up to 3 free revisions; v4+ accrues `revision_charges` ($25/each). Each upload re-emits `proof_sent_for_approval` (or `revision_sent` for v2+).
- **Designer signoff.** When client approves the proof, designer signoff stamp goes on. `designer_signoff_at` set; status flips to `approved`. Emits `proof_approved` (outcome).
- **Camera-ready handling.** When client provides finished art, no design pass needed — fast-path to approved.
- **Standalone creative.** `creative_jobs` for non-ad work (logos, flyers). Currently a thinner workflow (no proofs, no chat thread) — gap in BUSINESS_DOMAINS.

## Daily Workflow

1. **Open dashboard.** Pacing tile at top: "Queue at 68%; needs 75% by EOD." Drill-down per upcoming issue.
2. **Pick the most urgent project.** Sort by issue press date ascending; within day, pacing variance (worst behind first).
3. **Open Design Studio (`/adprojects`).** Issue × status grid. Find her in-flight projects.
4. **Brief intake check.** If brief is empty / "needs_brief", ping the rep via team_notes or chat thread.
5. **Build proof.** Use her design tools; upload via project's "Upload Proof" button. Writes `ad_proofs` row + flips `ad_projects.status='proof_sent'`. Emits event.
6. **Client review.** Rep sends the public proof link to client (or email send-proof EF). Client annotates on the public ProofApproval page.
7. **Iterate.** Address annotations. Upload v2, v3, etc. After v3 (4th iteration), revision charges accrue.
8. **Designer signoff** when client approves. `approved_at` + `designer_signoff_at` stamp. Status → `approved`. Emits `proof_approved`.
9. **Salesperson signoff** — the rep then signs off too. Status → `signed_off`. Emits `ad_press_ready`.
10. **Anthony picks up** — places ad in Flatplan. Status → `placed`.
11. **Bulk signoff power-action.** When multiple projects are stacked at "approved" awaiting rep signoff, she can use the bulk action grid in Design Studio.

## MyDash Modules Used

| Module | Purpose | Permission Level |
|--------|---------|------------------|
| My Dash | Jen-specific dashboard with pacing curve + per-issue cards | Full |
| Calendar | Press / ad deadlines | Full |
| Production (Editorial) | Read-only — for context on issue mix | Read |
| Design Studio (Ad Projects) | Primary surface — Issue × status grid + project detail | Full |
| Flatplan | Read-only — see how her ads land | Read |
| Media Library | Asset library + upload | Full |

Ad Designer's `module_permissions` default per [TeamModule.jsx:61](src/pages/TeamModule.jsx#L61): `dashboard, calendar, editorial, flatplan, adprojects, medialibrary`.

## Key Workflows

### Building proof v1

1. Project lands at `awaiting_art` or `designing` status.
2. Brief check — if `brief_headline` / `brief_style` / `brief_colors` are empty, ping rep.
3. Asset check — `client_assets_path` (Bunny drop) or `project_assets[]`. Logos from `global_assets[]`.
4. Build in her design tool.
5. Click "Upload Proof" → file goes to BunnyCDN, `ad_proofs` row written, project status → `proof_sent`. Emits `proof_sent_for_approval`.
6. Project's chat thread auto-posts a system message: "Proof v1 uploaded".
7. After v3 (4th iteration), system message warns: "⚠ Last free revision. Additional revisions $25 each."

### Revision flow

1. Client returns annotations on ProofApproval page → comes back as `revising` status.
2. Open project; review `client_notes` + pin annotations on the proof.
3. Address; upload v2.
4. Emits `revision_sent` (outcome) for tracking.
5. Repeat until client approves.

### Camera-ready fast path

1. Project's `art_source = 'camera_ready'`.
2. Skip design step; client emails finished art (PDF / EPS).
3. Upload as proof v1 → status → `proof_sent`.
4. Once client confirms it's the right file, designer signoff → straight to `approved`.

*Per BUSINESS_DOMAINS Walk #2 #6 — the camera-ready path isn't optimally surfaced; flagged for future improvement.*

### Bulk signoff

1. In Design Studio, switch to the Issue × Status grid.
2. Select cards (checkbox) in the "approved" column awaiting salesperson signoff.
3. Click "Sign off N selected" → both designer + salesperson signoffs flip in one round trip. Status → `signed_off`. Emits one `ad_press_ready` event per project.

## Decisions This Role Owns

- **Design choices.** Layout, type, color, imagery within the brief.
- **When to push back on a brief.** "Headline too long for the ad size" / "These colors won't read at this size."
- **When to charge for revisions.** v4+ accrues charges automatically; she can choose to absorb.
- **Asset reuse.** Whether to add a fresh upload to `global_assets` for next time.
- **Camera-ready acceptance.** When the client's file is print-ready vs needs work.

## Decisions That Require Escalation

- **Major brief deviation** the rep didn't approve → Sales Rep / Publisher.
- **Fee waivers beyond standard revisions** → Publisher.
- **Tool / asset budget changes** → Publisher.

## Handoffs

### To Salesperson (per project's rep)

- **Proof ready for client review** via `proof_sent` status. Rep sends the link or emails the proof.
- **Question about brief** via project's chat thread or team_notes.

### To Layout Designer (Anthony)

- **Ad ready for placement** when status = `signed_off`. Surfaces in his "Approved ads awaiting placement" view.

### From Salesperson

- **Sale closed → ad project auto-created.** Brief fields populate from the proposal's brief section (if rep filled them).
- **Salesperson signoff** after client approval — flips status to `signed_off`.
- **Brief edits** when rep revises the headline / colors / instructions.

### From Publisher

- **Direction notes** for high-value clients or special creative direction.

### From client (via ProofApproval public page)

- **Annotations + approve / request changes** — surfaces on the project as `client_annotations` jsonb.

## KPIs & Success Metrics

Surfaced on her dashboard:

- **Pacing curve.** Single dashboard signal — "You're at X% on the curve, needs Y% by EOD." Color-banded (green ≥ -5%, amber -5 to -15%, red < -15%).
- **Per-issue queue progress.** Each in-window issue shows projects in flight + pacing variance vs. its specific timeline.
- **First-proof rate.** % of projects that get client approval on v1. Higher = better brief intake + design quality.
- **On-time rate.** Projects signed off ≤ ad_deadline ratio.
- **Active project count.** How many projects in flight simultaneously (workload signal for Hayley's Designer Workload tile).

## Common Issues & Resolutions

| Issue | Resolution |
|---|---|
| Project stuck at `awaiting_art` >3 days | Brief is empty OR client assets haven't arrived. Ping rep via chat thread. |
| Client annotations not visible | Client needs to actually click "Submit changes" on ProofApproval page — annotations stay local until then. Verify with rep. |
| Revision charge fired unexpectedly | `revision_count > 4` triggers it; check `revision_billable_count`. If client request was minor and you absorbed, manually decrement (admin). |
| Proof upload fails | Likely BunnyCDN auth. Check Integrations → BunnyCDN; re-auth if expired. |
| Status won't move from `proof_sent` → `revising` | Client annotation submission may have failed. Re-send proof link or revert manually. |
| Bulk signoff hit RLS error | Some projects in the selection may belong to other reps; bulk action requires owner-level access. Filter to her projects only. |
| Pacing curve says "behind" but I just shipped 5 projects | Curve is per-issue, weighted by total ads in the issue. Ship the right issues' projects, not just any 5. |

## Glossary References

See `_shared/glossary.md` for: Ad Project, Ad Proof, designer signoff, salesperson signoff, ProofApproval, BunnyCDN, revision_charges, camera-ready.

See `_shared/workflows.md` for: ad lifecycle.
