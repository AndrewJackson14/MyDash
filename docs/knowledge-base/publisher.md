---
role: publisher
display_name: Publisher
team_role_label: Publisher
department: Leadership
team_members: [Hayley Mattson]
reports_to: null
last_updated: 2026-04-29
version: 1.0
---

# Publisher

## Role Summary

The Publisher is the operational owner of the company. Every domain — sales, editorial, design, production, circulation, billing — eventually rolls up to this seat. In MyDash, the Publisher is the only user who sees the full org-wide DashboardV2 by default, holds `permissions: ["admin"]` (bypasses all module gates), and is the human gate between an issue being "production complete" and that issue actually shipping. The Publisher signs off issues, approves rate-card and contract changes, clears credit holds, and sets the strategic direction every other role works against.

## Core Responsibilities

- **Issue sign-off.** Every issue requires `publisher_signoff_at` before the Layout Designer can trigger send-to-press. This is the single load-bearing approval that gates the print pipeline.
- **Org-wide visibility.** Read every dashboard, every report, every team member's queue. Use the role switcher to view the app as any user (admin-only impersonation).
- **Revenue oversight.** MTD pacing vs same-day-last-month, pipeline value, top closers, A/R aging + DSO, issue revenue forecast for the next 4 issues — all surface on the Publisher dashboard.
- **Approvals & decisions.** Rate-card changes, contract overrides, credit holds, make-goods, terminations, hires, role changes, permission grants.
- **Direction-setting.** "Direction from Publisher" is a first-class card on every other role's dashboard; Publisher writes notes via `team_notes` that target individual users in real-time.
- **Brand & org settings.** Custom backgrounds, publication roster, MySites configuration, integrations (Stripe, QBO, Gmail, Google Cal, BunnyCDN, SES, social OAuth).
- **Final escalation point.** Anything Editor-in-Chief, Office Administrator, Sales Manager, or Production Manager can't resolve lands here.

## Daily Workflow

1. **Open MyDash → DashboardV2 (Publisher dashboard).** Auto-loads on login. Reviews the four hero stats: MTD Revenue (+ pacing delta vs last month projected), Pipeline Value, Awaiting Your Signoff, Overdue Invoices.
2. **Clear "Awaiting Your Signoff" tile.** Issues approaching press in the next 14 days that haven't been signed off. Each row has Open (jumps to Layout Console for that issue) and Sign off buttons. Sign-off stamps `publisher_signoff_at` and `publisher_signoff_by` on the row — this unblocks the Layout Designer's send-to-press button.
3. **Triage Proofs Awaiting Approval and Layout Reference Gaps tiles.** Issue proofs in `review` status; ad pages within 14 days of press that don't yet have a `flatplan_page_layouts` reference upload.
4. **Read A/R Aging stacked bar.** Click-through to Collections if the 90+ bucket is non-zero. Confirm DSO trend.
5. **Scan Top Closers MTD, Issue Revenue Forecast, From Press (recent celebrations).** Forecast flags weak issues (< $1k sold, ≤14 days out).
6. **Reply to Direction queue.** "Direction from Publisher" inbound notes — usually replies from team members on yesterday's directives.
7. **Throughout the day:** approve proofs as they hit the queue, sign off ready issues, respond to escalations from Office Admin (credit-hold questions), Sales (rate exceptions), Editorial (sensitive story sign-off), Layout (press-readiness blockers).

## MyDash Modules Used

| Module | Purpose | Permission Level |
|--------|---------|------------------|
| My Dash | Org-wide DashboardV2 with all hero stats and queues | Full (org-wide) |
| Calendar | All publications, all team members | Full |
| Sales | Read all pipeline; can edit any sale or proposal | Full |
| Contracts | Approve/override contract terms | Full |
| Billing | All AR/AP, payment plans, settings | Full |
| Production (Editorial) | Story queue, kanban, web queue, editions | Full |
| Design Studio (AdProjects) | All ad projects across all designers | Full |
| Media Library | All assets across pubs | Full |
| Flatplan | All issues, all pubs | Full |
| Layout Console | Issue press-readiness, sign-off | Full (issues require Publisher sign-off) |
| Tearsheet Center | Sent-to-client and pending tearsheets | Full |
| Collections | A/R queue, dunning workflow | Full |
| Newsletters | All pubs | Full |
| Social Composer | All pubs | Full |
| MySites | Per-pub site settings, redirects, errors, social account OAuth | Full |
| Knowledge Base | This module | Full |
| Booking Queue | Inbound ad inquiries | Full |
| Classifieds | Classified ad pipeline | Full |
| Merch | Merchandise revenue | Full |
| Circulation | Subscribers, drivers, routes, drop locations | Full |
| Service Desk | Inbound tickets | Full |
| Legal Notices | Legal pipeline, billing-linked notices | Full |
| Performance | Per-team-member performance metrics, sales/editorial/production/admin | Full |
| Reports (Analytics) | Revenue, P&L, commissions, AR aging, financial dashboards | Full |
| Team | Team roster, role assignment, permission grant, alert configuration | Full |
| Publications | Pub roster, ad sizes, rate cards, ad zones, web ad rates | Full (sole owner) |
| Schedule | Issue generator (EZSchedule), per-pub frequency patterns | Full |
| Email Templates | Outbound email templates | Full |
| Integrations | Stripe, QBO, Gmail, Google Cal, BunnyCDN, SES, social OAuth | Full (sole owner) |
| Data Import | Bulk subscriber, payment, contract import | Full |
| Permissions | Per-user module access | Full (sole owner) |

The Publisher's `module_permissions` array contains every key in `MODULES` (see `src/pages/TeamModule.jsx#ROLE_DEFAULTS`). The `admin` permission additionally short-circuits the `hasModule()` gate in `src/App.jsx`, so the Publisher always sees the full sidebar.

## Key Workflows

### Issue sign-off (the load-bearing approval)

The single workflow that only the Publisher can complete. Required before any issue ships.

1. Layout Designer marks all pages complete in Flatplan / Layout Console.
2. Issue surfaces on Publisher dashboard's "Awaiting Your Signoff" tile (next 14 days, not yet sent to press, no sign-off recorded).
3. Publisher reviews the issue (Open button → Layout Console).
4. Publisher clicks "Sign off" on the dashboard tile (or in Layout Console).
5. MyDash writes `publisher_signoff_at = now()` and `publisher_signoff_by = currentUser.id` to the `issues` row.
6. Layout Designer's "Send to Press" button is now enabled. (See `_shared/workflows.md#issue-press-readiness`.)
7. After Layout Designer triggers send-to-press, `sent_to_press_at` stamps and the issue moves to "From Press" celebration tile on the dashboard for 7 days.

**Migration:** `supabase/migrations/144_anthony_p1_issues_publisher_signoff.sql` introduced the two columns.
**Code:** `handlePublisherSignoff` in [src/components/RoleDashboard.jsx:770](src/components/RoleDashboard.jsx#L770).

### Direction notes (top-down communication)

The Publisher's primary channel for directing other team members without triggering an email or Slack ping.

1. Publisher writes a note targeting a user (`team_notes.to_user`).
2. Note arrives in real-time on that user's dashboard's "Direction from Publisher" card via Supabase realtime channel `direction-notes-{authId}`.
3. User reads the note → MyDash flips `is_read=true` and stamps `read_at`.
4. User replies in-thread (creates a reverse `team_notes` row).
5. Publisher sees replies on their dashboard.

`context_type` can be `"general"` or `"task"` — task notes are flagged differently in the recipient UI.

### Org-wide impersonation (Admin role switcher)

The Publisher (and any user with `permissions: ["admin"]`) can view MyDash *as* any other team member.

1. Sidebar → user pill → role-switcher icon.
2. Pick a team member from the list.
3. App swaps `currentUser` to the impersonated user; nav, dashboards, jurisdiction, and module gates re-render against the impersonated role's `module_permissions` and `assigned_pubs`.
4. Click out of impersonation to return to Publisher view.

This is the Publisher's primary tool for diagnosing "I can't see X" reports from team members and for QA'ing role-specific dashboard work.

### Setting rate cards and ad sizes

Owned exclusively by the Publisher. Any rep who needs a non-standard rate must escalate.

1. Publisher → Publications → pick pub → Ad Sizes.
2. Edit `rate`, `rate_6`, `rate_12`, `rate_18` (1×, 6×, 12×, 18× frequency tiers) on each ad size.
3. Proposals built in SalesCRM auto-pick a tier from `term_months` via `getAutoTier`. Reps can manually override per-line, but the rate card is the authoritative source.
4. Web ad rates live separately on `web_ad_rates`, also Publication-scoped.

### Approving credit hold release / make-good

Currently manual (no `credit_hold` boolean shipped yet — see [BUSINESS_DOMAINS.md](BUSINESS_DOMAINS.md) Walk #1 decision #2). When Office Administrator flags a client as past-due-and-pending-new-work:

1. Office Administrator escalates via team_notes or Slack.
2. Publisher reviews client's payment history in Billing → Receivables.
3. Publisher decides: clear (allow new ad_projects to spawn), hold (block production), or convert to make-good (issue credit memo).
4. Publisher updates `clients.credit_balance` and notes the decision.

## Decisions This Role Owns

- **Issue sign-off.** Single approval that ships an issue.
- **Rate-card changes.** New rates, new ad sizes, new web ad products, new packages.
- **Contract exceptions.** Discounts beyond the auto-tier, off-rate-card commitments, multi-pub bundle pricing.
- **Credit and collections policy.** Credit hold, make-goods, write-offs, refund authorizations.
- **Hires, terminations, role changes.** Adds and removes `team_members` rows, assigns `role`, sets `module_permissions` and `assigned_pubs`.
- **Brand and publication setup.** New publications, archived publications, custom backgrounds, organization settings.
- **Integration secrets.** Stripe / QBO / Gmail / Google Cal / SES / BunnyCDN / X-OAuth / Meta-OAuth credentials. The Publisher is the only user who should ever see Integrations page secrets.
- **Strategic direction.** Editorial focus areas, sales targets, growth investments, vendor decisions (printers, hosting, CDN).

## Decisions That Require Escalation

The Publisher is the top of the org chart inside MyDash — there is no escalation target above this role. External escalations:

- **Legal review** of sensitive editorial content → outside counsel.
- **Tax / accounting** decisions beyond QuickBooks data entry → outside CPA.
- **Software architecture** changes (schema, RLS, Edge Functions, dependency upgrades) → engineering (Andrew Jackson / Nic Mattson).

## Handoffs

### To Layout Designer (Anthony)

- **Issue sign-off** unblocks the Layout Designer's "Send to Press" action. Realtime channel `direction-notes-{authId}` plus a status flip on the `issues` row.
- **Layout reference uploads** — Publisher uploads a reference image/PDF for Layout Designer when a page needs visual direction. Surfaces in Anthony's "Hayley's Layout Refs (last 7d)" tile.

### To Editor-in-Chief (Andrew / Nic)

- **Editorial direction** via team_notes. Topics, coverage priorities, kill decisions on sensitive stories.
- **Content Editor permission grants** via `editorial_permissions` per-pub-per-user (can_assign, can_edit, can_approve_web, can_approve_print, can_publish, can_manage_editions, can_manage_categories).

### To Sales Manager / Sales Rep (Dana, Christie)

- **Rate exceptions and contract overrides** via team_notes or in-person.
- **Pub assignment changes** via Team → member profile → Publications. Updates `salesperson_pub_assignments` which controls jurisdiction-scoped data on the rep's view.

### To Office Administrator (Cami)

- **Credit-hold clears, make-good authorizations, write-off approvals.**
- **Subscription tier or rate changes** before Cami enters them.

### From Layout Designer

- **Issue ready for sign-off** ping. Issue appears on "Awaiting Your Signoff" tile when all pages are marked complete and `publisher_signoff_at` is null.
- **Press-readiness blockers** — pages missing layout, ads not yet approved, stories not yet on page. Surfaces on Publisher dashboard's "Layout Reference Gaps" and "Proofs Awaiting Approval" tiles.

### From Editor-in-Chief

- **Sensitive-story sign-off** request. Editor-in-Chief writes a team_note flagging a story; Publisher reads in StoryEditor and either approves for web/print or kills.
- **Editorial calendar conflicts** that need a strategic decision (e.g. delaying coverage of a topic).

### From Sales Manager / Sales Rep

- **Rate-exception requests, off-rate-card pricing, multi-pub bundles.** Direct conversation; Publisher updates the proposal or contract directly.
- **Renewal pipeline escalations** — major-account renewal at risk, Publisher relationship play.

### From Office Administrator

- **Credit holds and write-offs** for approval.
- **Disputed payments, chargeback notifications, QBO sync errors.**
- **Subscriber escalations** that require a comp or refund decision.

## KPIs & Success Metrics

The Publisher dashboard is the org's KPI surface. Metrics surfaced:

- **MTD Revenue** with pacing delta vs same-day-last-month and projected month-end. Source: `sales` table where `status='Closed'` and `date` falls in the current month.
- **Pipeline Value** — sum of `sales.amount` where `status NOT IN ('Closed', 'Follow-up')`.
- **Awaiting Your Signoff (count)** — issues in next 14 days, not sent to press, no `publisher_signoff_at`.
- **Overdue Invoices (count + balance)** — invoices where `status IN ('sent','overdue','partially_paid')` and `due_date < today`.
- **A/R Aging buckets** — Current / 1–30 / 31–60 / 61–90 / 90+. DSO ≈ A/R balance ÷ avg daily revenue last 30 days.
- **Top Closers MTD** — top 5 reps by closed revenue.
- **Issue Revenue Forecast** — next 4 publishing issues with sold + pending. Flags issues with <$1k sold and ≤14 days out as weak.
- **Designer Workload** — bottom-of-page tile shows per-designer active project count, on-time rate, first-proof rate.
- **From Press (last 7 days)** — celebration tile of recently shipped issues.

For deeper drill-in: Performance page (per-team-member rollups across sales / editorial / production / admin), Reports page (full financial analytics), Analytics page (sales/payments/P&L/AR aging).

## Common Issues & Resolutions

| Issue | Resolution |
|---|---|
| "Send to press" button is disabled for an issue Layout Designer says is ready | Issue is missing `publisher_signoff_at`. Click Sign off on Publisher dashboard's Awaiting Your Signoff tile. |
| Hero stat shows wrong revenue | Pacing math uses same-day-last-month — partial month comparison is intentional. Projected month-end is `mtdRev × (daysInMonth / dayOfMonth)`. |
| Can't see another user's view | Use admin role-switcher in sidebar (only `permissions: ["admin"]` users see this). |
| Direction note didn't reach a team member | Verify recipient has `team_members.auth_id` set (links Supabase auth to team_members row). Also verify they're online — realtime requires an active session. |
| Rate-card change isn't reflected in proposals | Rate-card lives on `ad_sizes` per pub. Reps still need to rebuild the proposal — existing proposals captured the old rate at build time. |
| QBO sync error in Bills tab | Open Integrations → QuickBooks → check token status. May need to re-authorize via QB OAuth flow. |
| Background image won't change | `org_settings.background_image_url` — set via Profile Panel → background uploader. Wallpaper layer respects this; falls back to default `bg-dark.webp` / `bg-light.webp`. |
| Need to grant a new module to a team member | Team → member → Permissions tab → toggle the module. Or use Permissions page for bulk admin. |
| Subscriber expired but is on auto-renew | Verify `subscriptions.stripe_subscription_id` is set and Stripe webhook is hitting `stripe-webhook` Edge Function. Stripe → renewal → MyDash subscription `end_date` advance loop. |

## Glossary References

See `_shared/glossary.md` for definitions of:

- Publication, Issue, Sale, Proposal, Contract, Ad Project, Ad Proof, Story, Page Story, Flatplan, Tearsheet
- send-to-press, publisher signoff, designer signoff, salesperson signoff
- A/R, A/P, DSO, MTD, Pacing, Pipeline, Renewal
- Jurisdiction, module_permissions, role, team_members.auth_id
- StellarPress (the public-facing CMS that consumes MyDash data)
- BunnyCDN (asset CDN for media), Bunny storage (asset uploads)

See `_shared/workflows.md` for cross-role workflows the Publisher participates in:

- Ad lifecycle (lead → paid)
- Editorial flow (pitch → published)
- Issue press-readiness
- A/R cycle
- Subscription renewal cadence
