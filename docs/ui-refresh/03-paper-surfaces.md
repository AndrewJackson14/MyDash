# Paper-Surface Audit (v2 checkpoint 3)

> **DEPRECATED 2026-04-27.** Paper surface was retired — every page
> now inherits the steel canvas. The `[data-surface="paper"]` rule was
> removed from `global.css`, all opt-in attributes stripped from JSX,
> and explicit `var(--paper)` surface backgrounds (TopBar, StoryEditor,
> dev/Typography) flipped to `var(--canvas)`. The `--paper` token still
> exists because primitives use it as a contrast color for toggles,
> checkboxes, and avatars. Audit list below is preserved for historical
> reference only — do not re-apply.

> Per `01-direction-decisions-v2.md` §1: pages that should retain the
> heritage paper register apply `data-surface="paper"` to their root
> container. All other pages inherit `--canvas` (steel) from `body`.
> Awaiting Andrew's approval before the attribute lands on these
> roots. Lines below are recommendations, not commits.

## Heuristic

Paper if the page is **reading-** or **composition-shaped**: long-form
content, narrative, the editorial register feels right. Steel if the
page is **dashboard-**, **table-**, or **operations-shaped**: lists,
KPIs, forms-as-data-entry.

When in doubt — steel. The whole synthesis rule is "heritage on the
page, modern on the chrome." Most pages in MyDash are operations
chrome by definition; paper opt-in should be the exception, not the
default.

---

## Recommended `data-surface="paper"` pages

### Authenticated, in-app

| Page | File | Why paper |
|---|---|---|
| Story Editor | `src/components/StoryEditor.jsx` | Long-form article composition. Tiptap editor + headline + body — the canonical reading-shaped surface. |
| Issue Proofing | `src/components/IssueProofingTab.jsx` | Full-bleed PDF + annotation viewing. Reading register is correct for proofs. |
| Eblast Composer | `src/components/EblastComposer.jsx` | Long-form newsletter / email composition with rich preview. |
| Newsletter Page | `src/pages/NewsletterPage.jsx` | Same — newsletter content composition + preview. |
| Knowledge Base | `src/pages/KnowledgeBase.jsx` | Internal docs / how-tos. Reading-shaped. |
| Performance Review | `src/pages/Performance.jsx` | The direction docs' own example: editorial-leaning monthly review of contributor performance. The metadata-strip example uses this page literally. |
| Affidavit Workspace | `src/components/legal/AffidavitWorkspace.jsx` | Legal affidavit drafting + preview — reading-shaped legal text. |
| Affidavit Template | `src/components/legal/AffidavitTemplate.jsx` | Same — template editing of legal copy. |

### Public-facing (route-level, pre-auth)

| Page | File | Why paper |
|---|---|---|
| Proposal Sign | `src/pages/ProposalSign.jsx` | The client opens this and reads + signs a proposal. Heritage register is correct. |
| Proof Approval | `src/pages/ProofApproval.jsx` | Client reviews + approves an ad proof — reading-shaped, paper helps the proof feel authored. |
| Campaign Public | `src/pages/CampaignPublic.jsx` | Public campaign report — narrative + KPIs + chart. Editorial in shape. |
| Tearsheet Portal | `src/pages/TearsheetPortal.jsx` | Public tearsheet view. Same logic. |
| Pay Invoice | `src/pages/PayInvoice.jsx` | Single-purpose checkout page; paper register makes the invoice feel formal vs. SaaS. |
| Client Upload | `src/pages/ClientUpload.jsx` | Single-purpose upload portal; same logic — feels like dropping art into a pre-paid envelope. |

---

## Pages I'm leaving on steel

The default. Listed only so you can challenge any I got wrong.

**Dashboards / KPIs**
DashboardV2, RoleDashboard, dashboard module variants

**Tables / lists / queues**
SalesCRM, Billing, Circulation, AdProjects, BookingsQueue,
ClassifiedAds, CollectionsCenter, CreativeJobs, ServiceDesk,
LegalNotices, ProofApproval (in-app proof queue), TearsheetCenter,
EditionManager, EmailTemplates, NewsletterTemplates,
Permissions, Team, Publications, IssueSchedule, EZSchedule,
DataImport, IntegrationsPage, MySites, MediaLibrary

**Production / layout consoles**
Flatplan, IssueLayoutConsole, IssueDetail

**Communication / scheduling**
Mail, Messaging, Calendar, CalendarPage

**Meta**
Analytics, BillsTab, Merch, ProfilePanel

**Auth + special**
LoginPage (own visual register, not refresh-touched in this pass),
MerchShop (commerce — explicit non-editorial shape),
ClientPortal (CRM-shaped client dashboard),
ClientPortfolioPortal (gallery / tile shape, not narrative)

---

## Edge cases worth your call

These are pages where I see arguments both ways. My pick is in
parens but I'd bend either direction.

| Page | My pick | Why it's a coin flip |
|---|---|---|
| **Mail.jsx** | steel (current) | Email reading is reading-shaped, but the inbox layout is list-driven. Single-message-view is paper-leaning, list-view is steel-leaning. Hard to scope `data-surface="paper"` to just one mode without per-component plumbing. Default to steel; revisit if reading-mode feels wrong. |
| **MerchShop** | steel | Public commerce page. Heritage register would feel more "letterpress storefront" but most commerce conventions are SaaS-shaped. Punt to steel. |
| **AdProjects** detail view | steel | Inside an Ad Project, the brief + reference assets feel paper-leaning. The list of jobs is steel. Same scope problem as Mail — call it steel until subview feedback says otherwise. |
| **IssueDetail** | steel | Issue overview is dashboard-shaped (status, sales, stories list). The story bodies inside live in StoryEditor (already paper). Keep IssueDetail steel. |

---

## What lands after your approval

Once you greenlight (or redline), I:

1. Add `data-surface="paper"` to the root containers of every approved page above. The rule already exists in `global.css` (shipped in checkpoint 1) — this is the consumer-side opt-in.
2. Verify each opted-in page renders against the warm `--paper` background, not the cool `--canvas`. Paper grain reads slightly more present on paper than on steel (intentional — that's the heritage register's texture).
3. Move on to the rest of checkpoint 3: glass on `GmailNotifPopover`, `NotificationPopover`, sticky table headers in `DataTable`, and the modal backdrop recipe.

---

## Sign-off

- ✅ Approve the recommended list as-is
- ⚠️  Approve with edits — specify which pages to add or remove
- ❌ Different cut — describe the principle and I'll redraft

The audit is the deliverable; the attribute application waits on you.
