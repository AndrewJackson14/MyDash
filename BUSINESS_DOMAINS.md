# MyDash — Business Domain Map & Gap Analysis

Iteration doc. Maps a real print + digital media company's operational domains onto what MyDash actually does today, then walks two end-to-end lifecycles (ad sale, editorial story) to surface workflow gaps before we write the formal site schematic.

Legend: ✓ built · △ partial / implicit · ✗ missing

---

## 1. Business Domains

| # | Domain | Real-world responsibility | MyDash coverage |
|---|---|---|---|
| 1 | **Sales & CRM** | Capture leads, qualify, propose, contract, renew | SalesCRM, clients, client_contacts, sales, proposals, proposal_lines, proposal_signatures, contracts, contract_lines, ad_inquiries |
| 2 | **Ad Production / Creative** | Brief → design → proof → approve → place | AdProjects (Design Studio) for display ads tied to a sale; CreativeJobs for standalone paid creative (logos, flyers, printing); ProofApproval, ad_projects, ad_proofs, creative_jobs, media_assets, ad_sizes, ad_zones, ad_placements |
| 3 | **Editorial** | Pitch → assign → write → edit → approve → publish | StoriesModule, EditorialDashboard, StoryEditor, stories, article_revisions, article_tags, categories, story_activity, page_stories |
| 4 | **Issues & Production Planning** | Schedule issues, build flatplan, assign pages, pre-press | IssueSchedule, IssueDetail, Flatplan, EZSchedule, issues, issue_goals, flatplan_sections, flatplan_placeholders, print_runs, printers |
| 5 | **Circulation & Distribution** | Subscribers, drivers, routes, drop points, mailing | Circulation, subscribers, subscriptions, drivers, driver_routes, route_stops, drop_locations, distribution_points, mailing_lists, mailing_exports |
| 6 | **Audience / Digital** | Web sites, newsletter, social, SEO, analytics | NewsletterPage, StellarPress integration, newsletter_subscribers, newsletter_drafts, newsletter_templates, social_posts, page_views, daily_page_views, cross_published_stories, redirects |
| 7 | **Billing / AR** | Invoice, collect, reconcile, statements | Billing, BillsTab, PayInvoice, invoices, invoice_lines, payments |
| 8 | **Accounts Payable / Payroll-lite** | Vendor bills, freelancer pay, commissions | BillsTab, TeamModule, bills, freelancer_payments, commission_rates, commission_ledger, commission_payouts |
| 9 | **Team / HR / Permissions** | Staff, roles, schedules, access control | TeamModule, TeamMemberProfile, Permissions, ProfilePanel, CalendarPage, team_members, profiles, editorial_permissions, salesperson_pub_assignments, calendar_events, team_notes |
| 10 | **Performance / Reporting** | Dashboards, briefings, goals, alerts | DashboardV2, Performance, Analytics, activity_log, briefing_configs, my_priorities, notifications |
| 11 | **Ops / Service / Comms** | Tickets, internal chat, email, legal notices | ServiceDesk, Messaging, Mail, LegalNotices, service_tickets, messages, communications, email_log, email_templates, legal_notices, outreach_campaigns |
| 12 | **Integrations** | QuickBooks, Gmail, Google Cal, Stripe, StellarPress | IntegrationsPage, quickbooks_tokens, gmail_tokens, google_tokens |
| 13 | **Publications / Sites (multi-brand)** | Brand identity, site config, categories | Publications, SiteSettings, publications, org_settings, categories |

**Out of scope (handled elsewhere):** inventory and payroll — both run outside MyDash and we are not bringing them in. Issuu — no integration planned (drop `issuu_editions` references from the schematic).

**Domains we don't model at all but may need eventually:** contracts/legal beyond ad contracts (NDAs, rate cards as signed docs), HR/benefits, 1099 generation.

### 1a. ad_projects vs creative_jobs

Both live in Design Studio and both represent paid creative work, but they serve different purposes:

- **`ad_projects`** — the in-flight **display-ad pipeline**. One row = one ad being built for one sale/issue. Rich brief fields, reference ads, client-asset drops, designer + salesperson sign-off, ChatPanel thread, revision tracking, provenance back to the originating proposal/contract. Auto-created on `sale.closed`. Statuses: `brief → awaiting_art → designing → proof_sent → revising → approved → signed_off → placed`. Wired into flatplan.
- **`creative_jobs`** — a **standalone creative shop ticket** for work that isn't a display ad: logos, flyers, standalone print runs, business-card jobs. Not tied to a sale, issue, or publication. Statuses are commerce-flavored: `quoted → approved → in_progress → proofing → complete → billed`.

**Gap (#2 — proofing parity for creative_jobs):** `creative_jobs` needs the same proofing workflow as `ad_projects` — briefs, reference assets, designer upload, client proof link, revision loop, designer + salesperson sign-off, chat thread — just without the print/digital ad placement context at the end. Today it's a thin ticket with no proof object, no brief fields, no thread, and no structured asset path. The distinction between the two should be "tied to an ad placement vs not," not "has a proofing process vs doesn't."

**Open question:** should `creative_jobs.billed` eventually mint a real `sale` + `invoice`, or stay as its own ledger? Right now it's an unintegrated side-quest from billing's perspective. ANSWER: A Creative Job should be paid for upfront.

---

## 2. Lifecycle Walk: Ad Sale — Lead → Paid

Stages a print+digital media ad goes through from first contact to cash in the bank, with MyDash coverage flags.

| # | Stage | What happens in the real world | MyDash today | Gap |
|---|---|---|---|---|
| 1 | **Lead captured** | Inbound call, web form, walk-in, referral, rep prospecting | ✓ `ad_inquiries`, website leads surfaced in Sales strip/Dashboard | △ No unified "lead inbox" view; sources not normalized (web form vs walk-in vs referral) |
| 2 | **Qualify** | Rep categorizes: fit, budget, authority, timing (BANT) | △ Client status field, no structured qualification | ✗ No lead-scoring, no disqualification reason capture |
| 3 | **Rep assignment** | Lead routed to territory/vertical rep | ✓ `salesperson_pub_assignments`, `rep_id` on clients | △ Routing rules aren't automated — manual assignment |
| 4 | **Discovery call / needs brief** | Rep learns the client's goals, audience, creative readiness | ✗ No discovery notes structure | ✗ No reusable "campaign brief" that flows into creative later |
| 5 | **Proposal built** | Rep selects pubs, issues, sizes, dates, package discounts | ✓ `proposals` + `proposal_lines` | △ Rate card enforcement, frequency-discount logic unclear |
| 6 | **Proposal sent & signed** | Emailed, reviewed, signed (DocuSign-style) | ✓ `ProposalSign` page, `proposal_signatures` | △ Expiration/followup cadence, version history on proposal |
| 7 | **Accepted → Contract** | Signed proposal becomes a contract (insertion order) | ✓ `contracts` + `contract_lines` | △ Is contract auto-minted on signature? Need to verify the promotion step |
| 8 | **Sales rows created** | Each issue/run in the contract gets a `sales` row | ✓ `sales` table with `contract_id`, `issue_id` | ✓ |
| 9 | **Credit check / deposit** | New clients or >$X require credit hold or deposit | ✗ No credit-hold flag, no deposit tracking | ✗ No mechanism to block production until credit clears |
| 10 | **Creative brief → ad_project** | Sale handoff triggers design work (if client needs an ad designed) | ✓ `ad_projects` auto-created on `sale.closed` (recent work) | △ Brief content (copy, logo, call-to-action, landing URL) not structured — freeform notes |
| 11 | **Design → proofs** | Designer builds ad, internal QC, version iterations | ✓ `ad_projects` status grid, `ad_proofs` | △ Proof versioning (v1, v2, v3) and diff surfacing |
| 12 | **Client proof approval** | Client sees proof, approves or requests changes | ✓ `ProofApproval` page | △ External proof links + reminders; approval SLA countdown |
| 13 | **Placement in flatplan** | Approved ad dropped onto a page in a specific issue | ✓ `flatplan_placeholders`, `ad_placements` | △ Drag-and-drop flatplan UI exists; conflict detection (double-booked slot) |
| 14 | **Pre-press / send to printer** | Entire issue goes to press once ads + edit are locked | ✓ `print_runs`, `sent_to_press_at` on issues | △ Pre-press checklist (color, bleed, resolution) not enforced |
| 15 | **Tearsheet / proof of publication** | Client gets a copy of the printed page as proof | ✗ No tearsheet generation/delivery | ✗ Legal notices require affidavits — partially covered in `legal_notices` |
| 16 | **Invoice generated** | At sale close (or on run date), invoice minted | ✓ `invoices` + `invoice_lines` | △ Timing rules: invoice-on-close vs invoice-on-run vs monthly; net terms |
| 17 | **Invoice sent** | Email to client with pay link | ✓ `PayInvoice`, email_log | △ Dunning cadence (3/7/14/30 day followups) — not sure this is automated |
| 18 | **Payment received** | ACH, card, check; reconciled to invoice | ✓ `payments`, Stripe integration | △ Partial payments, over/underpayment, write-offs |
| 19 | **AR aging & collections** | 30/60/90 day buckets, collection workflow, credit hold | △ Lapsed-reason field exists; no aging dashboard I've seen | ✗ No collections queue / dunning workflow |
| 20 | **Commission calc & payout** | Rep earns commission on paid (or sold) amount | ✓ `commission_ledger`, `commission_payouts`, trigger configurable | △ Commission clawback on refund/writeoff not modeled |
| 21 | **Make-goods / credits / refunds** | Ad ran wrong, missed, or client disputes → credit next issue | ✗ No credit-memo / make-good workflow | ✗ No link from credit back to the originating sale |
| 22 | **Renewal / upsell** | Contract expiring, rep reaches out | △ `contract_end_date` on clients, `last_ad_date` | ✗ No renewal pipeline / auto-surfacing of expiring contracts |
| 23 | **QuickBooks sync** | AR, payments, customer records flow to QBO | ✓ `quickbooks_tokens`, IntegrationsPage | △ Unclear which objects actually sync (invoices? payments? credits?) |

**Biggest ad-sale gaps** (my call): credit hold / deposits (#9), structured campaign brief (#4, #10), tearsheets (#15), dunning + AR aging (#17, #19), make-goods / credits (#21), renewal pipeline (#22). These are the things that bite a media company in month 6 of running the app for real.

---

## 3. Lifecycle Walk: Editorial Story — Pitch → Published (Print + Web)

Stages a story goes through from idea to print + digital publication.

| # | Stage | What happens in the real world | MyDash today | Gap |
|---|---|---|---|---|
| 1 | **Pitch captured** | Editorial meeting, freelance query, reader tip, press release | ✗ No distinct "pitch" state — stories start at Draft | ✗ No pitch queue, no freelance pitch intake, no editor triage |
| 2 | **Assignment** | Editor assigns writer + photographer, sets due date | ✓ `stories.assigned_to`, `assigned_by`, `due_date` | △ Photographer is a separate assignment (photo vs text) — not modeled |
| 3 | **Research & reporting** | Reporter does the work | — | (out of app scope) |
| 4 | **Draft written** | Writer submits first draft | ✓ Status: Draft | ✓ |
| 5 | **Editor review** | Dev edit, restructuring, questions | ✓ Status: Edit, `article_revisions` for version history | △ Inline comments / track changes — `comments` table exists but not sure it surfaces in StoryEditor |
| 6 | **Copy edit / proofread** | Style, grammar, AP, house rules | △ Rolled into Edit state | △ No distinct copy-edit stage |
| 7 | **Photo selection** | Photo editor picks images, writes cutlines | ✓ `media_assets`, featured_image_url | △ No photographer credit / rights tracking surface; no cutline field separate from caption |
| 8 | **Fact check / legal review** | Sensitive stories reviewed by editor or attorney | ✗ No fact-check workflow | ✗ No sign-off trail per story |
| 9 | **SEO / headline polish** | Web headline, meta, slug, social title | ✓ `seo_title`, `seo_description`, `slug` in StoryEditor | △ A/B headline test not modeled |
| 10 | **Approve for web** | Editor approves for digital publication | ✓ `web_approved` | ✓ |
| 11 | **Schedule / publish to web** | Go live on the site now or at a time | ✓ `sent_to_web=true`, `published_at`, `scheduled_at` | △ Scheduled publish — is there a worker that flips `sent_to_web` at `scheduled_at`? Need to verify |
| 12 | **Distribute: newsletter** | Story featured in upcoming newsletter blast | ✓ `newsletter_drafts`, newsletter_templates | △ Auto-inclusion rules (by category, by is_featured) not modeled |
| 13 | **Distribute: social** | Auto/manual post to FB, IG, X, LinkedIn | △ `social_posts` table | △ Which platforms actually connected; manual vs scheduled |
| 14 | **Distribute: cross-publish** | Sister pub picks up the story | ✓ `cross_published_stories` | ✓ |
| 15 | **Place in print issue** | Editor assigns story to a print issue + page | ✓ `print_issue_id`, `page_stories`, flatplan integration | ✓ |
| 16 | **Flatplan layout** | Designer places story on a page, sizes to fit | ✓ `flatplan_sections`, `flatplan_placeholders`, `print_section`, `print_page` | △ Word-count fit vs page hole — is the mismatch surfaced? |
| 17 | **Print proofread stages** | Story moves through none → on_page → proofread → approved → sent_to_press | ✓ `print_status` enum with these stages | ✓ |
| 18 | **Issue sent to press** | Entire issue's stories locked | ✓ `sent_to_press_at` on issue, story `sent_to_print`, `print_published_at` | ✓ |
| 19 | **Post-publish: corrections** | Reader flags error, editor updates and logs | ✓ `corrected_after_publish`, `last_correction_at`, `correction_note` | △ Public correction banner on StellarPress? Not sure it's rendered |
| 20 | **Post-publish: metrics loop** | Page views, time-on-page feed back to editorial to inform future coverage | △ `page_views`, `daily_page_views`, `view_count` captured | ✗ Editorial dashboard doesn't surface "what worked, what didn't" — lost learning loop |
| 21 | **Archive** | Story stays queryable, maybe paywalled after N days | ✓ Status: Archived, `is_premium` flag | △ Time-based paywall auto-flip not modeled |
| 22 | **Syndication / rights** | Story licensed or resold externally; freelancer rights tracked | ✗ Not modeled | ✗ Freelance rights (one-time vs perpetual) not tracked; matters for `freelancer_payments` accounting |

**Biggest editorial gaps**: no pitch stage / freelance pitch intake (#1), no fact-check / legal sign-off trail (#8), no photographer-as-assignment path (#2, #7), scheduled publish worker (#11), post-publish metrics loop back into the editorial UI (#20), syndication & rights (#22), no photo credit option in the UI.

---

## 4. Cross-cutting observations

A few things that touch every domain and that I'd flag before we finalize this:

- **Audit trail / activity log** — `activity_log`, `story_activity` exist. Unclear if *every* significant action (proposal sent, proof approved, story published, invoice paid) writes one row consistently. If we want "who did what when" to work in the help docs, this should be load-bearing.
- **Notifications** — `notifications` is an events table. Real workflows need routing rules (this event → this person → this channel). Not sure how much of that is wired vs ad hoc.
- **Multi-brand scoping** — Most tables have `publication_id` / `pub_id` / `site_id`. A gap hunt against every list/filter to make sure we never accidentally leak one brand into another's view (we already found one in the Story Editor issue picker).
- **State machines as first-class** — Story status, proposal status, ad_project status, invoice status, print_status all live as strings/enums. A formal state-machine doc for each would be valuable for the schematic.
- **Archived tables** — Several `*_archive_20260413` tables exist. Worth confirming these are genuinely historical vs still referenced, before documenting them.

---

## Domain Walks (building up as we iterate)

### Walk #1 — Sales & CRM

**Must do to be fully functional**

A print+digital media sales team needs to: capture a lead from any channel, qualify and route it to a rep, log every touch, build a proposal with the right rate tier, get it signed electronically, mint a contract, generate the per-issue `sales` rows, hand the ad brief to creative, track status through close, surface the renewal 60+ days before the contract ends, and keep a clean activity trail tying proposal → contract → sale → invoice → payment → commission together.

**Built (✓)**

- **Lead capture** — `ad_inquiries` with rich fields ([ad_types](src/pages/SalesCRM.jsx), preferred_zones, budget_range, desired_start, message, how_heard), `match_confidence` + `match_reason` to auto-link to existing clients, `confirmed` bool, `status` enum. Website leads also surface on Sales strip, Dashboard, briefing.
- **Client model** — full contact/billing split (`billing_email`, `billing_cc_emails`, `billing_address*`), multi-contact via `client_contacts` with `is_primary`, `rep_id`, `client_code`, `industries[]`, `interested_pubs[]`, `lead_source`, `stripe_customer_id` + `stripe_payment_method_id` + `card_last4/brand/exp`, `credit_balance`, `contract_end_date`, `last_ad_date`, `lapsed_reason`.
- **Client status derivation** — computed from sales + issue dates ([sales/constants.js:51](src/pages/sales/constants.js#L51)): `Lead → Active → Renewal (≤30 days to last future ad) → Lapsed`. Surfaces as filter tabs in [ClientList.jsx](src/pages/sales/ClientList.jsx) and as badge colors in [ClientProfile.jsx](src/pages/sales/ClientProfile.jsx).
- **Pipeline** — 6 stages (`Discovery → Presentation → Proposal → Negotiation → Closed → Follow-up`), stage-entry auto-actions ([sales/constants.js:25](src/pages/sales/constants.js#L25)), 8 action types with next-action-date dunning, kanban + list + "Today's Actions" views ([PipelineView.jsx](src/pages/sales/PipelineView.jsx)).
- **Proposals** — full object model: `proposal_lines` with pub/issue/ad_size/price/dims, `history` jsonb audit, `sent_to[]` + `sent_at`, `pay_plan` + `monthly` + `charge_day`, rate-tier auto-pick (`getAutoTier`: 1× / 6× / 12× from `term_months`), `art_source` (we_design / camera_ready), PDF generation ([lib/proposalTemplate.js](src/lib/proposalTemplate.js)).
- **Proposal e-sign** — `proposal_signatures` with `access_token`, full audit trail (`signed_at`, `signed_ip`, `signed_user_agent`, `viewed_at`, `view_count`, `expires_at`), `proposal_snapshot` jsonb frozen at signature time, [ProposalSign.jsx](src/pages/ProposalSign.jsx) public page.
- **Contract promotion** — `contracts` with `proposal_id` backlink, `contract_lines`, `total_value`, `total_paid`, `discount_pct`, `monthly_amount`, `charge_day`, `is_synthetic` flag for auto-minted contracts.
- **Sale rows** — strict link chain: `sale.proposal_id` + `sale.proposal_line_id` + `sale.contract_id` + `sale.contract_line_id`, enforced via recent migrations (027, 028, 029).
- **Renewals** — first-class: `Renewals` subtab in Pipeline, urgent-renewal counter in header ([SalesCRM.jsx:723](src/pages/SalesCRM.jsx#L723)), renewal-proposal flow that pre-populates from previous closed sales ([SalesCRM.jsx:404](src/pages/SalesCRM.jsx#L404)), `renewalDate` on proposal, score-ranked "who to call first" list.
- **Communications log** — `communications` table with `type` (call / meeting / comment), `author_*`, per-client history rolled into `ClientProfile`.
- **Outreach / win-back** — `outreach_campaigns` + `outreach_entries` with `contacted_via`, `meeting_date`, `won_back_at`, `won_back_amount` ([Outreach.jsx](src/pages/sales/Outreach.jsx)).
- **Commissions** — `commission_ledger`, `commission_payouts`, `commission_rates`, `commission_issue_goals`, `salesperson_pub_assignments`, `salesperson_pub_shares`, configurable commission trigger per rep (both / sold / paid), [Commissions.jsx](src/pages/sales/Commissions.jsx).
- **Gmail send** — `sendGmailEmail` from the proposal flow with `initiateGmailAuth` OAuth handshake.
- **Jurisdiction scoping** — `jurisdiction.myPubs` filters all dropdowns so a rep sees only their assigned pubs.
- **AR aging** — 4-bucket report (current / 30 / 60 / 90+) in [Billing.jsx:328](src/pages/Billing.jsx#L328).
- **Credit balance** — stored as $ on `clients.credit_balance`.

**Partial (△)**

- **Lead triage inbox** — `ad_inquiries` exist and surface on Sales strip, but there's no dedicated "unmatched leads queue" UI where a rep confirms/rejects the auto-match, assigns a rep, and promotes to `clients`. Today it's implied through the match_confidence field with no clear workflow surface.
- **Proposal followup automation** — `sent_at` + `viewed_at` + `view_count` are captured. Reminder cadences ("client opened 3× but hasn't signed in 5 days") aren't wired — the rep has to notice.
- **Dunning** — AR aging exists but there's no automated reminder sequence (3 / 7 / 14 / 30 days past-due). `BillsTab.jsx` has some of this for AP; AR side is a manual read of the aging report.
- **Credit hold / deposits** — `credit_balance` is informational. No `credit_hold` boolean that blocks downstream production (ad_projects auto-creation, flatplan placement).
- **Discovery / needs brief** — freeform `notes` only. No structured capture of goals / target audience / creative readiness that would flow into `ad_projects.brief_*` fields later.
- **Rate card enforcement** — `proposal_lines.price` is free-form. Frequency tiers (`rate`, `rate_6`, `rate_12`) are on `ad_sizes` and `getAutoTier` picks one, but a rep can still type any number without warning.
- **Campaign-level brief** — `ad_projects` has rich brief fields, but those are per-ad, per-sale. A multi-issue, multi-pub campaign doesn't have a single "what's this campaign actually trying to achieve" brief that ties them together.
- **Activity log** — `activity_log` table exists globally but it's unclear whether sales events (proposal sent, proposal signed, contract minted, sale closed, proof approved) all write to it consistently. `story_activity` handles editorial; there's no equivalent `sales_activity`.
- **Make-goods / credits** — `credit_balance` is a $ number on the client. There's no credit-memo object that ties a credit back to the specific bad-run sale, with an audit trail for accounting.
- **QuickBooks sync coverage** — `quickbooks_tokens` exists; unclear which objects actually sync (customers? invoices? payments? credit memos?).

**Missing (✗)**

- **Lead-to-rep auto-routing rules** — territory / vertical / round-robin / load-balance. Currently manual via `rep_id`.
- **Lead scoring** — no BANT / fit-score capture; qualification is a status change, not a scored outcome.
- **Credit check workflow** — new clients / >$X need a structured check → hold until cleared.
- **Tearsheets / proof-of-publication delivery** — once an issue runs, the client should automatically get a PDF of the page their ad appeared on. `legal_notices` has affidavits for legal ads; display ads have nothing.
- **Forecast / weighted pipeline** — no probability % per stage → expected-close forecast by month.
- **Commission clawback on refund / write-off** — when a closed sale is voided, the rep's commission row isn't automatically reversed.
- **Lost-deal reason capture** — dropping a sale out of the pipeline doesn't capture *why*, so there's no win/loss analysis downstream.

**Decisions we need from you**

1. **Lead triage inbox** — do you want a dedicated "new leads" queue with confirm-match / assign-rep / dismiss actions, or keep inquiries as a passive strip? I'd recommend a queue — currently a good web lead could easily sit unseen.
2. **Credit hold semantics** — add a `credit_hold` boolean on clients that (a) blocks `ad_project` auto-creation on `sale.closed` and (b) prevents the sale from entering `flatplan_placeholders`? If yes, who clears the hold — Publisher only? Bookkeeper + Publisher?
3. **Dunning automation** — do you want MyDash to send the Day 3 / Day 7 / Day 14 / Day 30 past-due reminders via Gmail, or keep collections as a read-the-aging-report manual task?
4. **Campaign brief** — should proposals gain a structured brief section (goals, target audience, creative readiness, call-to-action, landing URL) that auto-populates `ad_projects.brief_*` when the sale is created? Eliminates duplicate data entry.
5. **Rate card guardrails** — warn / block when `proposal_lines.price` falls more than X% below the auto-tier rate? Or stay trusting?
6. **Commission clawback** — reverse commission rows on refund / write-off automatically, or flag for manual review?
7. **Lost-deal reasons** — add a required reason-code picker on Pipeline stages moving *out* of Discovery / Presentation / Proposal / Negotiation without reaching Closed?
8. **Tearsheets** — worth auto-generating + emailing once the issue hits `sent_to_press`? Or is the physical paper enough for most clients?

**My recommendations (for discussion, not decisions)**

- Do (1), (4), and (7) first — they cost little and unblock real workflow: visibility into inbound, cleaner creative handoff, and win/loss data you can actually read.
- Defer (3) and (8) to after the Accounts Payable / AR walk — dunning belongs in the billing domain's walk, and tearsheets tie into print production.
- (2) credit hold is the highest-value *blocking* gap — if you ever burn a production slot on a client who doesn't pay, this is the lesson that pays for the feature 10×.

---

### Walk #2 — Ad Production / Creative

**Must do to be fully functional**

A media company's creative team needs to: receive a brief for every sold ad, know who to contact for client assets, build a proof, send it to the client via a shareable link (no login), capture their annotated feedback, iterate through revisions with billable thresholds, get dual sign-off (designer + salesperson), and drop the approved ad into the flatplan slot on the right page of the right issue. Parallel workflows: camera-ready ads skip design but still need approval and placement, classified ads follow a word-count pricing model, web ads serve via a zone-based ad system with rates, and standalone creative work (logos, flyers, non-ad printing) runs outside the ad pipeline but needs the same proofing loop.

**Built (✓)**

- **ad_projects is the display-ad pipeline core** — auto-created on `sale.closed` (recent work: `0d4eadd` Design Studio: auto-create ad_project on sale.closed), one row per sold ad, scoped to `sale_id` + `issue_id` + `publication_id` + `ad_size`, provenance back to `source_proposal_id` + `source_contract_id`.
- **Structured brief** — `brief_headline`, `brief_style`, `brief_colors`, `brief_instructions`, `reference_ads` (jsonb), `design_notes`, `client_contact_name/email/phone`, `art_source` (we_design / camera_ready / client_supplied).
- **Asset separation** — `global_assets[]` (reusable client-brand assets like logos), `project_assets[]` (one-off uploads for this project), `project_assets_expire_at` for cleanup, `client_assets_path` for Bunny-storage drop, separate `AssetPanel` component.
- **8-state workflow** — `brief → awaiting_art → designing → proof_sent → revising → approved → signed_off → placed`. Recent rewrite ([AdProjects.jsx](src/pages/AdProjects.jsx)) shows it as issue × status grid with a synthetic "needs_brief" column for closed sales that don't yet have an ad_project (`7ba4014`).
- **Proof object** — `ad_proofs` separate from `ad_projects`: `version`, `proof_url` + `proof_filename`, separate `designer_notes` / `salesperson_notes` / `client_notes`, `client_annotations` (jsonb pin-on-image), `access_token` for unauthenticated client view, `sent_to_client_at/by`, `saved_at/by`, `internal_status`, `client_approved` + `client_approved_at`.
- **Client-facing proof page** — [ProofApproval.jsx](src/pages/ProofApproval.jsx) is a standalone `/approve/:token` page with its own minimal theme (no auth dependency). Pin-on-image annotation UI, version history across all proofs for the project, approve / request-changes flow, feedback capture.
- **Dual sign-off** — `designer_signoff` + `designer_signoff_at`, `salesperson_signoff` + `salesperson_signoff_at`. Designer completes → SalesCRM surfaces "proof ready for your review" signal ([SalesCRM.jsx:29-37](src/pages/SalesCRM.jsx)).
- **Revision tracking + billable threshold** — `revision_count`, `revision_billable_count`, `revision_charges`. Revisions beyond the free threshold accrue charges on the project.
- **Chat thread per project** — `thread_id` on `ad_projects`, `ChatPanel` component for designer ↔ salesperson ↔ publisher discussion inside a project.
- **Media library** — 931-line [MediaLibrary.jsx](src/pages/MediaLibrary.jsx), `media_assets` with rich metadata (width, height, mime_type, alt_text, caption, tags, category) and cross-links to `story_id`, `ad_project_id`, `legal_notice_id`, plus Bunny CDN URL + storage path.
- **Ad size catalog** — `ad_sizes` per pub with frequency tier rates (`rate`, `rate_6`, `rate_12`, `rate_18`), sort order, dims.
- **Web ad zones** — `ad_zones` per pub with slug, `zone_type`, `dimensions` jsonb, `fallback_provider` + `fallback_code` (house ad fallback when no live placement). Configured in [SiteSettings.jsx](src/pages/SiteSettings.jsx).
- **Web ad placements** — `ad_placements` table fully modeled: `ad_zone_id`, `client_id`, `sale_id`, `creative_url` or `creative_html`, `click_url`, `alt_text`, `start_date/end_date`, `impressions`, `clicks`, `is_active`.
- **Web ad rate card** — `web_ad_rates` with monthly / 6mo / 12mo tiers, `product_type`, per-pub.

**Partial (△)**

- **Creative Jobs parity** — (already flagged in §1a) `creative_jobs` lacks brief fields, proof object, revision loop, dual sign-off, and chat thread. Same proofing workflow, non-ad context.
- **Camera-ready path** — `art_source: "camera_ready"` is captured on the ad_project, but the skip-design-go-straight-to-proof path isn't clearly differentiated in the status flow. A camera-ready ad shouldn't sit in "designing" — it should drop straight to "proof_sent" (or even "approved" if the client sent a print-ready file).
- **Client asset intake** — `client_assets_path` is a Bunny drop location. Is there a client-facing upload page (like ProofApproval but for uploads)? Not obvious — `client_assets_path` may be populated via internal upload only, meaning the designer chases the client via email for files.
- **Designer workload view** — designers can be assigned per project, but there's no "designer queue" dashboard showing all in-flight work for a given designer with due dates.
- **Proof ↔ flatplan placement** — `ad_projects` has `placed` status and `flatplan_placeholders` exists, but the link from "approved ad → lives in page X slot Y" isn't airtight. `sales.page`, `sales.grid_row`, `sales.grid_col` exist; the wiring to flip ad_project → placed when flatplan drops happen is unclear.
- **Preflight checks** — no color-space / resolution / bleed / trim / fonts checks on uploaded proofs. Press-fail risk lives entirely with the designer's eye.
- **Revision billing → invoice** — `revision_charges` accrues on the project, but there's no documented path for that charge to become an invoice line.

**Missing (✗)**

- **Classified ads workflow** — `classified_ads` + `classified_rates` schema exists (word count, bold / border / photo surcharges, run_dates array, pricing) but *no UI renders it*. No Classifieds page, no creation flow, no publication, no invoicing. This is a real newspaper revenue stream that's completely stranded.
- **Web ad serving UI** — `ad_placements` is fully modeled and `ad_zones` are configurable in SiteSettings, but there's no admin UI to actually create a web ad placement from a closed sale, upload creative, set start/end dates, and flip it live. The serving side (what StellarPress pulls) may exist, but the "I just sold a web ad, now what?" authoring side appears unbuilt.
- **Web ad performance loop** — `impressions` and `clicks` columns exist on `ad_placements`; not sure they're incremented by anything or reported to the advertiser.
- **Ad zone preflight in Flatplan** — double-booking detection (two ads on the same grid slot in the same issue), bleed/margin overlap warnings, hole/orphan detection (approved ad with no placement 5 days before press).
- **Creative brief templates per industry** — a wine-bar ad has different copy conventions than a real-estate listing. No templates to pre-fill briefs for common verticals.
- **House ad fallback workflow** — `ad_zones.fallback_provider/code` exists as config, but there's no UI to maintain house ads or rotate them.
- **Ad library / reuse** — when a client renews the same ad, there's no "copy ad from last issue" button that clones the approved proof forward into the new project.
- **Proof link expiration / revocation** — `access_token` has no `expires_at`; a stale link stays live forever.
- **Mobile proof experience** — ProofApproval is pin-on-image; unclear if it's usable on a phone, which is where most small-business owners will open the email link.

**Decisions we need from you**

1. **Classified ads** — is this a live revenue line you want to run through MyDash, or is it on hold? If live, we need to build the UI against the existing schema (classified builder, word-count pricing preview, run-dates picker, per-issue publication, invoicing). If not, archive the tables so they stop showing up in the schematic.
2. **Web ad authoring** — same question. Do you sell web ads through MyDash, or is that run elsewhere? If you sell them here, we need a "new web ad placement" flow and a "live ads" dashboard. If not, demote `ad_placements` and `web_ad_rates` to "configured but not wired."
3. **Client asset intake** — do clients ever upload their own files, or is it always "rep collects by email and uploads internally"? If the former, we need a public upload page parallel to ProofApproval.
4. **Revision billing → invoice** — should `revision_charges` accruing on an ad_project automatically create an `invoice_lines` row on the next invoice for that client? Or flag for manual addition?
5. **Ad library / reuse on renewal** — worth adding a "clone last approved proof" button to the renewal flow?
6. **Camera-ready fast path** — should camera-ready ad_projects skip the `designing` state and drop directly to `proof_sent` (or `approved` if the file is print-ready)?
7. **Preflight checks** — run automated Acrobat preflight on uploaded proofs (color space, resolution, fonts, bleed) before marking "designer signed off"? Requires integration with a preflight engine.
8. **Proof link expiration** — set `ad_proofs.access_token` to expire N days after `sent_to_client_at`? Protects against stale links leaking.

**My recommendations (for discussion, not decisions)**

- (1) and (2) are the biggest scope questions. Both schemas are fully built but neither has a workflow UI. Either build them out or archive — half-built dead tables will rot the schematic.
- (3) client asset intake is the #1 time-sink complaint in every ad shop I've seen. A public `/upload/:token` page that mirrors ProofApproval would pay for itself in reclaimed designer hours.
- (5) ad library / reuse is a small build with outsized renewal-flow impact — if 60%+ of your ads are unchanged renewals, this is a 5× speedup for the designer.
- Defer (7) preflight — it's a real feature but it needs an engine decision (Ghostscript? callas pdfToolbox? Adobe PDF Services?), which is a separate conversation.

---

### Walk #3 — Editorial

**Must do to be fully functional**

A newsroom needs to: capture pitches from any source (editorial meeting, freelance query, reader tip, press release, community submission), route each to a writer with a due date, iterate through draft → edit → copy/proofread → approve, handle photos and photo credit, do a fact-check / legal review when warranted, publish to web at the right time (now, scheduled, embargoed), push to newsletter + social + cross-publications, place the story on the right page of the right print issue, move it through the print proofread → sent-to-press stages, log corrections after publication, and close the loop by surfacing "what performed" back to editors.

**Built (✓)**

- **Single source of truth** — `stories.status` is the 4-state editorial enum (`Draft → Edit → Ready → Archived`), with `sent_to_web` + `sent_to_print` as destination flags. Recent unification collapsed the old triple-tracking mess (migration context from prior session). Trigger keeps legacy `web_status` / `print_status` in sync for StellarPress consumers.
- **Workflow kanban** — [EditorialDashboard.jsx:14](src/components/EditorialDashboard.jsx#L14) splits Ready into Ready-unpublished + Published via `needsFlags`, surfaces `needsRepublish` when content changed after publish, has drag-and-drop columns.
- **Four dashboard tabs** — Workflow (kanban), Issue Planning ([StoriesModule.jsx](src/pages/StoriesModule.jsx) table with mini-flatplan preview when filtered to one issue), Web Queue, Editions.
- **StoryEditor** — 773-line Tiptap-based composer with SEO preview (Google-style), category selector sorted by `sort_order`, publication-scoped issue picker (recent fix), featured image picker, slug, excerpt, correction note, internal notes, preflight modal before publish, schedule picker.
- **Rich content model** — `body` (HTML legacy) + `content_json` (Tiptap jsonb) side-by-side. `article_revisions` table for version history (content_json, title, author_id, revision_note).
- **Dual approval trails** — `approved_for_web_by/at` + `approved_for_print_by/at`, `submitted_at`, `edited_by/at`, `web_approved` bool, `editor_id`, `assigned_to/by/at`. Every significant state change has a who + when.
- **Print pipeline** — 6-state `print_status`: `none → ready → on_page → proofread → approved → sent_to_press`. `print_issue_id`, `print_page`, `print_section`, `print_published_at`, `sent_to_press_at`. `page_stories` m2m for page layout (issue + story + page + sort_order).
- **Cross-publication within brand** — `story_publications` (story → publication → issue) with `layout_notes`, `photo_selection` jsonb, per-pub `status`.
- **Cross-publication between brands** — `cross_published_stories` for StellarPress-side syndication from a sister site.
- **Story types + sources** — `story_type` enum (article / column / letter / obituary / legal_notice / calendar_event / press_release / opinion), `source` enum (staff / freelance / syndicated / press_release / community / ai_assisted).
- **Freelance contributors** — `freelancer_name`, `freelancer_email` direct on the story for non-team contributors; `team_members.is_freelance` for freelancer records; StoryEditor freelancer multi-select.
- **Priority** — `priority` text (urgent / high / normal / low) with color coding on cards.
- **Category taxonomy** — per-pub `categories` with `parent_id` (hierarchy), `sort_order`, `slug`. Recent magazine seeding (Featured, Home, Health, Real Estate, etc.).
- **Tag taxonomy** — `tags` per pub, `article_tags` m2m.
- **Reader comments** — `comments` table with threading (`parent_id`), status enum (approved/pending/spam/etc), `ip_address`, `user_agent` for moderation.
- **Correction trail** — `correction_note`, `corrected_after_publish`, `last_correction_at`, `edit_count`, `last_significant_edit_at`, "Story has been edited after being published" alert in EditorialDashboard.
- **Sponsored content** — `is_sponsored`, `sponsor_name`, `is_premium`, `is_featured`, `is_page` (landing-page stories), `content_type` (feature / photo_essay / restaurant_guide / best_of / advertorial).
- **Attribution** — `photo_credit` field on story, `og_image_id` for share cards.
- **Story activity** — `story_activity` table (action, performed_by, details jsonb) as a per-story audit log.
- **Editorial permissions** — `editorial_permissions` per-user per-pub booleans: `can_assign`, `can_edit`, `can_approve_web`, `can_approve_print`, `can_publish`, `can_manage_editions`, `can_manage_categories`. Finer-grained than global roles.
- **Bulk actions** — StoriesModule has multi-select for publish / unpublish / review / kill / feature / category / delete across selected stories.
- **Scheduling capture** — `scheduled_at` field stored and surfaced in StoryEditor ("Scheduled: Apr 20 2026") with a PreflightModal schedule picker.
- **Edit tracking → republish prompt** — `needsRepublish` detects content changes after publish and prompts "Update Live" in the editor.

**Partial (△)**

- **Scheduled publish is *not* wired end-to-end** — `scheduled_at` is captured and displayed, but there's no worker flipping `sent_to_web=true` when the scheduled time arrives. The [scheduled-tasks edge function](supabase/functions/scheduled-tasks/index.ts) has Gmail maintenance logic but zero story logic. **Stories scheduled in the UI will never auto-publish.** This is the biggest operational gap in the domain.
- **article_revisions** — table is modeled but I'm not sure StoryEditor writes a new revision on save, and there's no visible version-history UI that lets an editor revert. Auditable but not user-surfaced.
- **Multi-author byline** — `author` is a single text field plus `author_id` uuid. Multi-contributor stories (reporter + photographer + copy editor) can't share a byline cleanly.
- **Photographer as separate assignment** — `assigned_to` is one person. `photo_credit` is freeform text. Photo editor can't own the photo side of a story while the writer owns the text side.
- **Pitch pre-state** — stories start at `Draft`. A pitch from a freelance query or editorial meeting is captured as an unfinished draft, which conflates "haven't written this yet" with "haven't even approved that we'll cover this."
- **Copy-edit / proofread stages** — both are rolled into the single `Edit` state. A two-editor newsroom (developmental editor → copy editor) has no distinct stage boundary.
- **Fact-check / legal review** — no dedicated stage, no sign-off trail per story. For a sensitive story, editors rely on freeform internal notes.
- **Comments moderation** — `comments` table has status and IP/UA, but I don't see a dedicated moderation UI. Unclear whether comments even render on StellarPress; the table may exist as future infrastructure.
- **Tag selector in StoryEditor** — `article_tags` + `tags` exist, but the StoryEditor category selector focuses on single `category_id`; I don't see a tag multi-select surfaced.
- **Print make-good trail** — `corrected_after_publish` is a web-oriented bool. A print run that shipped with an error → correction in next issue isn't modeled as a link from one story to another.
- **Post-publish performance loop** — `view_count` exists on stories and `page_views` + `daily_page_views` tables exist, but I don't see "top stories this week" surfaced in EditorialDashboard so editors can see what's landing.

**Missing (✗)**

- **Pitch intake inbox** — no dedicated queue for incoming pitches (freelance query, reader tip, press release). Press releases land in `source: "press_release"` but that's only after an editor has already created the story. The inbox side is email.
- **Editorial calendar (story-centric)** — `calendar_events` exists generically; there's no "all stories due this week by pub/section" calendar view beyond the Issue Planning table.
- **Embargo / hold-for-release** — no `embargo_until` timestamp; editors rely on not-yet-approved to gate pre-release content, which leaks if the approval flow is slow.
- **Series / ongoing coverage** — a multi-part series has no parent story or series ID linking episodes.
- **Time-based paywall auto-flip** — `is_premium` is a manual toggle. No rule to auto-flip after N days past `first_published_at`.
- **Syndication rights tracking** — when a story is syndicated (in or out), there's no license term / rights expiration / payment-to-author record tied to the syndication event.
- **AP style / house-rules linter** — no automated style check on submit.
- **Duplicate/near-duplicate detection** — no check for "is this pitch already covered."
- **Story analytics dashboard in editorial** — who's reading, how long, scroll depth, referrer. View count exists raw; no UI.
- **Published correction workflow** — the `correction_note` field exists but there's no public "Corrections" page aggregating recent corrections per pub (standard for most news sites as a credibility feature).

**Decisions we need from you**

1. **Scheduled publish worker** — this is effectively broken today (UI captures `scheduled_at`, nothing runs). Do you want me to add a cron to `scheduled-tasks` that runs every 5 minutes and flips `sent_to_web=true` on stories where `scheduled_at <= now() AND sent_to_web=false AND web_approved=true`? Same question for `approved_for_print_at + scheduled_at` → print flow.
2. **Pitch pre-state** — add a `Pitched` status before Draft, or add a `pitch_status` field separately (pitched / approved / assigned / in_progress)? I lean "add Pitched to the status enum" — simpler, fewer fields.
3. **Multi-author byline** — convert `author` from text to `author_ids[]` with a lookup to team_members + freelancers? Affects the StellarPress rendering side too.
4. **Photographer assignment** — add `photographer_id` (separate from `assigned_to`) and a photographer workload view?
5. **Copy-edit stage** — split `Edit` into `Dev Edit → Copy Edit`, or keep single? I lean keep single for small teams; split only if you have dedicated copy editors.
6. **Fact-check / legal review** — add a `needs_legal_review` bool + sign-off fields (`legal_reviewed_by/at`) that block publish when set? Only for high-risk stories.
7. **article_revisions autosave** — should StoryEditor write a new revision row on every significant save (>20% content delta or every N minutes)? And surface a version-history diff UI?
8. **Post-publish performance** — add a "Top This Week" widget to EditorialDashboard pulling view_count by published_at? Low build, high value for editorial feedback loops.
9. **Embargo** — add `embargo_until` on stories + enforce at publish time?
10. **Time-based paywall** — auto-flip `is_premium=true` after N days from `first_published_at`? Config per pub?
11. **Comments moderation UI** — build an admin moderation queue for `comments`, or defer comments entirely (Disqus / other)?
12. **Corrections page** — auto-generate a `/corrections` page on each StellarPress site from stories with `correction_note`?

**My recommendations (for discussion, not decisions)**

- **(1) scheduled publish is the #1 urgent fix.** The UI promises a feature that doesn't work. Build the cron this week — it's ~50 lines of edge function code.
- **(8) performance widget** and **(2) Pitched status** are high-value, low-build. Do both.
- **(6) fact-check / legal review** is worth adding for the lightweight flag-plus-sign-off version; the full review workflow can wait.
- **Defer (3) multi-author byline** unless you're actively feeling the pain — it's a schema change that ripples into StellarPress rendering.
- **(12) corrections page** is a credibility win and costs nothing once (11) comments moderation decision is made.
- **(11) comments**: I'd actually vote to defer comments to Disqus or similar and archive the `comments` table — running comment moderation in-house is a bigger time-sink than it looks.

---

### Walk #4 — Issues & Production Planning

**Must do to be fully functional**

The issue is the convergence point for everything. A full-function issues domain needs to: generate issues on a frequency pattern (weekly / bi-weekly / semi-monthly / monthly), set ad + editorial deadlines with enough lead time, track a revenue goal against sold + pending ads, show a live flatplan where ads and stories occupy real page slots, surface "is this issue going to be OK" health at a glance, lock pages at the deadline, package and send to the printer, log the print run cost + quantity, track shipped/received dates, and mark the issue published when the paper hits the street. Magazines and newspapers have different page counts and different cadences but use the same pipeline.

**Built (✓)**

- **Unified issue model** — `issues` table holds both newspapers and magazines via `type` column (recent migration collapsed magazine_issues into issues). Fields: `id`, `pub_id`, `label`, `date`, `page_count`, `ad_deadline`, `ed_deadline`, `status`, `revenue_goal`, `sent_to_press_at`, `sent_to_press_by`, `pages_locked_date`.
- **Issue generator** — [EZSchedule.jsx](src/pages/EZSchedule.jsx) (470 lines) generates issues from a frequency pattern: Weekly (day-of-week), Bi-Weekly, Semi-Monthly (dates-of-month array), Monthly (nth-weekday or date), with configurable `adCloseDays` and `edCloseDays` offsets back from publish date. Bulk creates a year of issues at a time.
- **Publisher health dashboard** — [IssueSchedule.jsx](src/pages/IssueSchedule.jsx) (412 lines) computes per-issue status chips: `Overdue / At Risk / Behind Goal / On Track / Published` based on `adPct`, `revPct`, `edPct`, `hasAnyStories`, deadlines, and `sent_to_press_at`. Drill-in only — no executive actions, intentional split.
- **Issue detail drill-down** — [IssueDetail.jsx](src/pages/IssueDetail.jsx) (252 lines) per-issue view.
- **Revenue goals** — `issues.revenue_goal` numeric + `issue_goals` table (per-issue goal history), `commission_issue_goals` (per-rep goal slice), Billing.jsx aging surfaces expected-vs-sold per issue.
- **Flatplan drag-drop** — [Flatplan.jsx](src/pages/Flatplan.jsx) (643 lines) renders each page as a 2×4 grid (GRID_COLS=2, GRID_ROWS=4), ads auto-fit by `adToGridSpan(adW, adH, pubW, pubH)` (calculates grid cell span based on ad size vs trim), drop-to-cell placement, drag-between-pages, visual distinction between `Sold` (solid green) / `Pending` (hatched amber) / `Placeholder` (gray dashed), editorial stories overlay on selected page, remove button, zoom.
- **Placeholders** — `flatplan_placeholders` with `grid_row`, `grid_col`, `grid_w`, `grid_h`, `sale_id` (optional link), `label`, `type`, `color`, `notes`. Used for holding a slot for a sale that's in-negotiation before it closes.
- **Sections** — `flatplan_sections` (name, start_page, end_page, color, sort_order) for grouping pages into editorial sections (News / Sports / Obituaries).
- **Story page assignments** — `page_stories` (issue → story → page → sort_order) for print layout.
- **Send to press** — Flatplan has a button that stamps `issues.sent_to_press_at` + `sent_to_press_by` + triggers the print flow. Single-point transition from "in production" to "locked."
- **Issue-scoped workflows** — Every sale, ad_project, and story carries `issue_id` as the pivot, so the issue page can show ads-vs-goal, ads-missing-proofs, stories-due-today, pages-not-laid-out all at once.

**Partial (△)**

- **Ads-grid mapping** — `sales` has `page`, `grid_row`, `grid_col` columns and `flatplan_placeholders` has its own grid cells. The Flatplan places sold ads from the `sales` table. Unclear: if a placeholder gets promoted to a real sale, does the placeholder get deleted or does the placeholder's `grid_row/col` get copied onto the sale? Needs a look.
- **Conflict / double-booking detection** — `buildPageGrid` has overlap-avoidance logic that *auto-shifts* items when they overlap, but there's no warning surface ("this ad can't fit where it's placed, we moved it"). Silent reflow hides real conflicts.
- **Page count drift** — `issues.page_count` is the planned count, but a magazine often grows or shrinks 4 pages during production. There's no "planned vs actual" tracking or change history.
- **Locked-date enforcement** — `pages_locked_date` field exists on issues but I don't see it being written or enforced (can you still drop an ad onto a locked flatplan?).
- **sent_to_press_by is hardcoded** — [Flatplan.jsx:127](src/pages/Flatplan.jsx#L127) literally sets `sent_to_press_by: "publisher"` as a string, not pulling from the current user. Minor bug; audit trail is wrong.
- **Issue statuses** — `issues.status` is text. IssueSchedule derives health chips from deadlines + percentages but doesn't write back to `status`. Stored status and computed status can diverge.
- **Editorial hole detection** — Flatplan shows editorial story titles on the selected page but doesn't warn "this page has zero editorial and zero ads — what's going on?"
- **Magazine page-count even/odd** — magazines typically need page counts in multiples of 8 or 16 for signatures. `EZSchedule` creates issues with a generic page count; no constraint or warning if a user sets 23.
- **Jurisdiction filtering** — Flatplan scopes to `jurisdiction?.myPubs`; IssueSchedule's scoping needs verification.

**Missing (✗)**

- **Print runs are a dead schema** — `print_runs`, `printers`, `printer_contacts`, `printer_publications` tables are **fully modeled but zero code references them** (single hit I found was a false positive). No UI to: manage printers, assign printers to publications, set cost-per-copy, log print run quantities, track shipped/received dates, reconcile print cost against `bills`. The entire cost side of print production is stranded.
- **Printer handoff** — no PDF packaging workflow (export combined PDF of all pages, include bleed, include preflight report, email to printer contact, log handoff). `sent_to_press_at` flips but nothing is physically sent from MyDash.
- **Printer cost vs budget** — no "this issue's print run cost $X against a $Y target" surface, even though print cost is a top-3 line item for any paper.
- **Signature / press imposition math** — for magazines, no reminder that you're at 46 pages and need to add or drop to hit a signature boundary.
- **Color pages tracking** — newspapers charge more for color pages and have limited color page slots per press run. Not modeled.
- **Spot color / special sections** — no per-page metadata for spot color, special inserts, or section breaks (beyond flatplan_sections grouping).
- **Delivery confirmation** — `print_runs.received_at` would track when bundles arrive at drop locations; without the print_runs wiring, there's no receipt confirmation.
- **Back issue archive** — once an issue ships, there's no "browse past issues for this pub" view beyond the data staying in the DB. Magazines especially want a browseable archive.
- **Revenue-vs-goal alert** — IssueSchedule computes at-risk chips but there's no "ping the publisher on Day-3-before-ad-deadline if revenue < 75%" notification pipeline.
- **Ad deadline extension workflow** — when an ad deadline moves, the new deadline needs to propagate to every open sale and every pending ad_project, and downstream recipients need to know. Today it's a single date update with no notifications.
- **Issue templates** — a publication with 32 regular pages and 4 always-the-same-slot back-page ads has no template system to pre-populate new issues with its standing layout.

**Decisions we need from you**

1. **Print runs — build or archive?** Same question as classifieds and web ads: the schema is fully there. Do you want a Printers page (manage printers + costs), a Print Run log per issue (quantity + cost + shipped + received), and a printer handoff workflow? Or is print production cost tracked outside MyDash? This is a real fork.
2. **Printer handoff automation** — if print runs go live, do you want MyDash to package the issue as a single PDF and email it to the printer contact on `sent_to_press`? Or keep "send to press" as a metadata flip and handle physical delivery offline?
3. **Page count enforcement** — magazines multiple-of-8? newspapers multiple-of-4? Warn or block bad page counts? Per-pub config?
4. **Locked flatplan** — after `pages_locked_date`, should Flatplan block drops, or just warn?
5. **Status derivation vs storage** — IssueSchedule computes health chips from live data. Should those persist to `issues.status` (so it can be queried cheaply across the app), or stay computed on-the-fly? I lean "persist" — easier for notifications and reporting.
6. **Ad deadline propagation** — when an issue's `ad_deadline` moves, do open sales and ad_projects get their reminder cadences recalculated automatically, and does the assigned rep get notified?
7. **Issue templates** — do any of your pubs have a standing layout (back cover always rate-X advertiser, page 2 always publisher note, page 32 always calendar)? If yes, "issue template" that pre-populates the flatplan on creation is a real speedup.
8. **Revenue-vs-goal alerts** — auto-ping publisher via notification when an issue hits T-3 days to ad close with <75% of revenue goal?
9. **Back issue archive** — build a `/issues` browse per pub (like MagazineHomePage's past-issues carousel but for newspapers too)?
10. **sent_to_press_by bug** — quick fix: pull from current user instead of literal string?
11. **Color pages** — do your newspapers charge premium for color? If yes, we need per-page color tracking + the associated rate card hook.

**My recommendations (for discussion, not decisions)**

- **(1) print runs is the biggest scope call in this domain.** My lean: build a minimal version (Printers page, Print Run log with quantity + cost + shipped/received, link `print_runs.id` to `bills` so cost flows to AP). Skip automated PDF packaging (2) for now — it needs a PDF engine decision.
- **(5) persist the derived status** — computing "At Risk" on every render when it could be a stored column refreshed nightly by `scheduled-tasks` is wasteful and makes state-transition notifications impossible.
- **(10) the sent_to_press_by bug** is a 1-line fix with meaningful audit-trail impact. Do this now.
- **(8) revenue alerts** ties into the Notifications domain walk later — hold off until then.
- **Defer (3), (4), (7), (9), (11)** — low-pain-today features that are real-but-not-urgent.

---

### Walk #5 — Circulation & Distribution

**Must do to be fully functional**

A print+digital media circulation operation needs to: maintain a subscriber file with mailing addresses, handle both mailed and rack-delivered copies, generate a mailing label file per issue for the printer or fulfillment house, assign drop locations (cafes, racks, hotels) to drivers on routes, optimize/print route sheets for each delivery day, restock drops on a schedule, collect subscription payments (one-time, recurring), send renewal notices at 60/30/10 day cadences, track copies distributed per location vs copies actually taken, and reconcile the draw-vs-returns side of rack copies against print run cost.

**Built (✓)**

- **Subscriber model** — `subscribers` with `type` (print / digital enum), `status` (active / expired / cancelled / pending), full name + company name, complete mailing address, `start_date`, `expiry_date`, `renewal_date`, `amount_paid`, `payment_method`, `stripe_customer_id`.
- **Subscription model** — `subscriptions` separate from subscribers: `publication_id`, `tier`, `status`, `start_date`, `end_date`, `auto_renew`, `stripe_subscription_id`, `copies`, `renewed_from` (chain of renewals), `paused_at`, `cancelled_at`, `price_description`. Supports one subscriber having multiple subscriptions (one per pub).
- **Subscription payments** — `subscription_payments` with amount, method, `stripe_payment_id`, `check_number`, `status`, `quickbooks_synced`, `paid_at`.
- **Circulation page** — [Circulation.jsx](src/pages/Circulation.jsx) (756 lines), 4 tabs: **Overview**, **Subscribers** (Print/Digital subtab × status filter), **Drop Locations**, **Routes**.
- **Subscriber CRUD** — add, edit, delete; subscription-detail panel with payment history.
- **Drop locations** — `drop_locations` with type (newsstand / coffee_shop / hotel / business_center / restaurant / retail / other), address, contact, `rack_type`, `quantity`, latitude/longitude (map-ready), active flag.
- **Drop → pub m2m** — `drop_location_pubs` with `quantity` per drop-location/publication, so a single cafe can carry 10 copies of Malibu Times + 5 copies of Calabasas Style with different counts.
- **Drivers** — `drivers` with vehicle, contact, active flag.
- **Driver routes** — `driver_routes` with `frequency` enum, `day_of_week`, `estimated_time`, route name.
- **Route stops** — `route_stops` links route → drop_location with `sort_order`, so a route is an ordered list of drops.
- **Renewal email template** — `generateRenewalHtml` + `getRenewalSubject` with Gmail send integration ([lib/renewalTemplate.js](src/lib/renewalTemplate.js)).
- **Mailing list generator schema** — `mailing_lists` with `publication_id`, `issue_id`, `record_count`, `csv_url`, `xlsx_url`, `sent_to_printer`, `sent_to_fulfillment`, `generated_at`. Surfaced through Circulation page.
- **Stripe subscription linkage** — `stripe_subscription_id` + `stripe_customer_id` captured on the subscription/subscriber.
- **DataImport → bulk load** — [DataImport.jsx](src/pages/DataImport.jsx) handles subscriber + subscription_payments bulk import (likely migration from a prior system).

**Partial (△)**

- **Renewal notices cadence** — `subscribers.first_notice_sent`, `second_notice_sent`, `third_notice_sent` booleans exist on the schema but **nothing writes them**. The `scheduled-tasks` edge function has zero subscription logic. So the 60/30/10 day notice cadence isn't running — Circulation has a renewal modal for manual send, but there's no automation.
- **Stripe auto-renew** — `auto_renew` is captured but read-only. Circulation doesn't watch for Stripe webhooks that renew the subscription row on charge success (would come through `stripe-webhook` edge function). Unclear if this loop is closed.
- **Mailing exports** — `mailing_exports` table is schema-only, **zero code references**. The newer `mailing_lists` seems to have replaced it, but both are still in the DB — duplicate model for the same concept.
- **Subscription tier usage** — `tier` field is free text on `subscriptions`. No tier catalog / rate card / pricing table, so a rep setting tier = "Gold" has no enforcement.
- **Copies column** — `subscriptions.copies` suggests multi-copy delivery (e.g. a business subscribing to 10 copies), but I don't see it surfaced anywhere in Circulation.jsx.
- **Route sheet printing / mobile handoff** — `route_stops` model supports ordered stops, but I don't see a "Print today's route sheet" or "SMS this route to driver" action. Drivers run manual from the list.
- **Route optimization** — sort_order is manual. No geographic optimization (latitude/longitude is captured but not used for routing).
- **Restock tracking** — `distribution_points.last_restocked_at` exists on a table that isn't wired (see below), and `drop_locations` has no equivalent.
- **Overview tab math** — I didn't open the Overview tab code, but typical gaps: total active subs per pub, expiring this month, revenue run-rate, print vs digital split — may or may not be computed.

**Missing (✗)**

- **`distribution_points` is a dead schema** — second table, same concept as `drop_locations` (name, location_type, address, contact, publication_id, copy_count, delivery_day, contact_name/phone, is_active, last_restocked_at, notes). **Zero code references.** Either an earlier iteration that was superseded by drop_locations, or an intended second model that never got built. Needs to be archived or merged.
- **Automated renewal cadence** — the notice-sent booleans promise automation but no cron runs them. Subscribers with expiry_date in 60 / 30 / 10 days should be auto-emailed via the renewal template.
- **Draw-vs-returns tracking** — for rack-distributed copies, the classic circulation metric is "draw" (copies delivered to a drop) vs "returns" (unsold copies picked up on the next delivery). Not modeled. Without it, there's no way to tune per-drop quantity, and the print run cost is impossible to reconcile against actual readership.
- **Stripe webhook renewal loop** — when Stripe renews a subscription charge, does `stripe-webhook` edge function roll the subscription `end_date` forward and create a new `subscription_payments` row? Not confirmed in the schema walk.
- **Label/postage generation** — mailing list CSV exists, but no integration with USPS / Every Door Direct Mail / a mail house API for postage calculation, CASS-certification, or NCOA address correction.
- **Digital delivery distinction** — `subscribers.type` has `digital`, but no wiring to gate StellarPress content (like `is_premium` flip based on active digital subscription).
- **Complimentary / comp subs / trade / staff copies** — no "complimentary" subscription type with reason code (staff, trade, exchange, VIP list).
- **Subscription pause / vacation hold** — `paused_at` exists but no UI to toggle it, no logic to skip generation of the paused subscriber from the mailing list for the pause period.
- **Bounced / returned mail tracking** — when USPS returns "undeliverable," no place to mark it and no auto-pause after N bounces.
- **Address cleanup workflow** — duplicate detection, fuzzy match (Jon Smith vs John Smith at same address), move-update processing.
- **Mobile driver app / route confirmation** — driver sees the route, marks each stop done, optionally captures a "restocked N copies" count, reports out-of-stock or "rack damaged." Full driver workflow is missing.
- **Subscription signup public page** — no equivalent of `ProofApproval` for `/subscribe` where a reader can buy or renew online. `newsletter_signups` exists for free newsletter; paid subscription onboarding isn't wired.
- **Bulk distribution** — apartment buildings, hotels, offices subscribing to 50 copies delivered to one address. Partially covered by `subscriptions.copies`, but no bulk address model.

**Decisions we need from you**

1. **Schema cleanup: `distribution_points` vs `drop_locations`** — do we archive `distribution_points` entirely, or merge the extra fields (`copy_count`, `delivery_day`, `last_restocked_at`) onto `drop_locations`? My lean: archive; pull any missing columns onto drop_locations.
2. **Schema cleanup: `mailing_exports` vs `mailing_lists`** — same question. Archive the older one?
3. **Renewal cadence automation** — build the cron on `scheduled-tasks` to send notices at `expiry_date - 60`, `expiry_date - 30`, `expiry_date - 10` and flip the notice-sent booleans? Same infrastructure as the scheduled-publish cron from Domain #3.
4. **Stripe webhook renewal loop** — confirm (and wire if needed) that `stripe-webhook` advances `end_date` + inserts a `subscription_payments` row on Stripe's `invoice.payment_succeeded` event.
5. **Draw-vs-returns tracking** — worth adding a `rack_returns` table (drop_location × issue × delivered_qty × returned_qty)? Only worth it if rack distribution is a meaningful slice of your business.
6. **Route sheet / driver workflow** — minimum viable: print-a-route-sheet PDF button. Next level: driver mobile app where each stop is marked done with optional count captured. Which level?
7. **Public subscription signup** — do readers buy subscriptions through MyDash directly (needs a public `/subscribe` page + Stripe Checkout hookup), or is it all phone / rep-entered / DataImport? If online, StellarPress should host the form and hit MyDash.
8. **Digital subscriber gating** — should `subscribers.type='digital'` + active subscription = unlock `is_premium` articles on StellarPress? This is the "subscribe to read" loop. If yes, we need a subscriber-token cookie or JWT from StellarPress to MyDash.
9. **Tier catalog** — do you want a `subscription_tiers` table (per pub) to replace the free-text `subscriptions.tier` field? Probably yes if you ever want pricing enforcement, probably skip if tiers are just labels.
10. **Comp subscriptions** — add `subscriptions.is_comp` + `comp_reason` (staff / trade / exchange / VIP)?
11. **Address quality** — worth integrating a CASS/NCOA service (SmartyStreets, Lob, Melissa), or is manual address entry good enough?

**My recommendations (for discussion, not decisions)**

- **(1) and (2) schema cleanup first.** Two of these dead-schema pairs (`distribution_points`/`drop_locations` and `mailing_exports`/`mailing_lists`) are cheap to resolve and keep the schematic clean. 30-minute task each.
- **(3) renewal cadence** — high value. A missed 60-day renewal notice is a lost customer. Stacks with the scheduled-publish cron from Domain #3 on the same `scheduled-tasks` function, so the engineering cost is lower if both ship together.
- **(4) Stripe webhook audit** — needs a verification pass regardless of the answer. Either confirm it works end-to-end or fix it; a subscription renewal silently failing is a silent revenue leak.
- **(7) public subscription signup** — big scope jump. Don't do this unless subscription revenue is meaningful. If it's mostly ad-supported and subscriptions are gravy, stay with phone/rep entry.
- **(8) digital gating** — only worth it if you'll actively sell digital-only paid subs. For most community papers, this isn't the business model.
- **Defer (5) draw-vs-returns** — real but labor-intensive for drivers to track, and usually only worth it at scale.
- **Defer (6)** to the route-sheet-PDF level for now — mobile app is a real separate build.
- **Defer (9), (10), (11)** — all real but not urgent.

---

### Walk #6 — Audience / Digital

**Must do to be fully functional**

The digital side of a media company needs to: run public websites via StellarPress, route readers from social + search + direct, capture web analytics (page views, sessions, referrers), build and send newsletter blasts tied to recent stories, post to social platforms when stories publish, manage URL redirects when slugs change or stories get killed, monitor site errors (404s, JS failures, broken images), and close the loop so editorial sees what performed. Bonus: newsletter signup capture, SEO health, RSS feeds.

**Built (✓)**

- **StellarPress integration** — shared Supabase backend with 5 magazine sites (malibumag, atasmag, pasomag, calstyle, living) on `XXX.13stars.media` staging + newspaper sites. StoryEditor publishes via `sent_to_web=true` (after the recent schema swap). Multi-tenant by `site_id` with per-pub categories, sort_order, renewal → rebuild loop working.
- **Newsletter composer** — [NewsletterPage.jsx](src/pages/NewsletterPage.jsx) (410 lines) with drag-drop story ordering (`@dnd-kit`), AI-generated editable blurbs, toggleable story inclusion, per-pub templates, draft history, preview, send via Gmail. `newsletter_drafts` captures: `subject`, `intro_text`, `stories` (jsonb ordered list), `html_body`, `from_email/name`, `status`, `recipient_count`, `open_count`, `click_count`. Currently scoped to 3 newspaper pubs via `NEWSLETTER_PUBS` constant.
- **Newsletter templates** — [NewsletterTemplates.jsx](src/pages/NewsletterTemplates.jsx) (329 lines) manages per-pub templates with `subject`, `preheader`, `intro`, `footer`, `sections` jsonb, `template_type`.
- **Newsletter subscribers** — `newsletter_subscribers` with publication_id, source (form / signup / import), status (active / unsubscribed / bounced), `subscribed_at`, `unsubscribed_at`.
- **Newsletter signups capture** — `newsletter_signups` is the raw capture from the public form on StellarPress (`site_id`, `email`, `created_at`) before they're promoted to `newsletter_subscribers`.
- **Cross-publication syndication** — `cross_published_stories` links origin → target sites with `display_label` and `position` for the "From Our Sister Publications" section on magazine homepages (verified working in the StellarPress walk earlier this session).
- **Web analytics schema** — `page_views` (site_id, path, referrer, user_agent, screen_width, session_id, created_at) + `daily_page_views` (pre-aggregated: article_id, path, view_date, view_count, unique_visitors).
- **Analytics surface (sort of)** — [SiteSettings.jsx:162](src/pages/SiteSettings.jsx#L162) queries `page_views` directly and aggregates to show site-level stats. Not in the app's main "Analytics" page.
- **Redirects management** — `redirects` table with `old_path`, `new_path`, `status_code`, `hit_count`, `last_hit_at`, per-pub. Referenced in SiteSettings.
- **Site error monitoring** — `site_errors` with full fields (url, error_type, first/last detected, hit_count, status_code, message, stack_trace, user_agent, ip_address, metadata, resolved + resolved_by/at). SiteSettings has the admin UI to mark resolved, filter by pub. There's a `site-errors` edge function ingesting them.
- **Newsletter open/click tracking** — columns on `newsletter_drafts` (open_count, click_count). Infrastructure is there; unclear whether Gmail-sent newsletters actually report back (probably not without a tracking pixel/link wrapper).
- **SEO fields on stories** — `seo_title`, `seo_description`, `slug`, `featured_image_url`, `og_image_id` (verified in Editorial walk).
- **RSS feed** — StellarPress `/rss` page builds an RSS feed from `sent_to_web=true` stories per site (verified in earlier StellarPress fix).
- **Sitemap** — StellarPress `SitemapPage.jsx` generates a sitemap.xml per site.

**Partial (△)**

- **"Analytics" page is financial, not audience** — [Analytics.jsx](src/pages/Analytics.jsx) is built around sales, payments, subscribers, P&L, invoices, commissions. It does **not** query `page_views` or `daily_page_views`. An editor looking for "what story performed" won't find it in Analytics — they'd need to know to look in SiteSettings. The page name conflicts with what editors expect.
- **Story-performance loop** — `stories.view_count` is on the story and incremented on article page view (verified in StellarPress walk), but EditorialDashboard doesn't surface "top 10 this week" or per-story performance. The data is captured; the editorial feedback loop is missing.
- **Newsletter send cadence** — NewsletterPage is a manual composer per send. No "every Tuesday at 6am send the auto-digest" cron logic. No automated weekly / daily newsletter from the story stream.
- **Newsletter send channel** — sending through Gmail. Fine for ~100 subscribers; breaks at scale. No Mailgun / SendGrid / Amazon SES integration visible despite HALO having Amazon SES.
- **Newsletter pub scoping** — hardcoded `NEWSLETTER_PUBS = ["pub-paso-robles-press", "pub-atascadero-news", "pub-the-malibu-times"]`. Magazine newsletters aren't wired.
- **Newsletter signup → subscriber promotion** — `newsletter_signups` captures raw; unclear whether there's a worker or manual step that promotes them to `newsletter_subscribers`. May be manual (or automatic via trigger; needs verification).
- **Redirects admin UI** — `redirects` is queryable from SiteSettings but I didn't verify there's a CRUD for it. Users will hit "Jane replaced the slug, now the old link 404s" — if they can't add a redirect easily, that's friction.
- **Site error alerting** — ingest pipeline exists but no "ping me when site errors spike" notification. The publisher has to open SiteSettings and look.
- **Newsletter tracking pixel / link wrapper** — `open_count` and `click_count` columns exist but sending via raw Gmail gives you no open/click data unless we wrap links through a tracker.

**Missing (✗)**

- **`social_posts` is a stranded schema** — fully modeled with `platform`, `post_text`, `article_title`, `article_url`, `featured_image_url`, `status`, `scheduled_for`, `posted_at`, `engagement_clicks/likes/shares/comments`, dual approval. **Zero code references.** No social publishing UI, no platform OAuth (no Meta Graph, no X API, no LinkedIn), no scheduler, no engagement fetcher. This is another entire stranded schema.
- **Audience dashboard** — no editorial-facing "top stories by views this week / this month / all time" per pub. Page view data is captured and aggregated into `daily_page_views`; nothing uses it for the editorial feedback loop.
- **Referrer breakdown** — `page_views.referrer` is captured; no UI showing "this week 40% from Facebook, 30% from Google, 20% direct." Traffic source mix is invisible.
- **Device / screen-width mix** — `page_views.screen_width` is captured; no surface.
- **Time-on-page / scroll depth / bounce rate** — not captured at ingest.
- **Session attribution** — `session_id` is captured; no session analysis (pages per session, session duration).
- **Newsletter A/B testing** — subject line tests, send-time tests. Not modeled.
- **Newsletter unsubscribe flow** — `newsletter_subscribers.status='unsubscribed'` exists but no public unsubscribe page or CAN-SPAM compliant footer link.
- **Push notifications / web push** — not modeled.
- **SEO health dashboard** — missing meta descriptions, duplicate titles, broken internal links, missing featured images, slugs collisions. Nothing checks for any of that.
- **Broken link detection** — no crawler.
- **Sitemap submission / indexing status** — generated but no "Google Search Console says you have 12 pages with errors" surface.
- **Google Analytics / Search Console integration** — nothing.
- **Comments on StellarPress** — `comments` exists (Domain #3) but not rendered on any StellarPress page that I've seen.
- **Public newsletter archive** — sent newsletter drafts aren't browseable publicly; a reader wanting "last week's newsletter" has nothing.
- **404 → redirect helper** — `site_errors` captures 404s + `redirects` exists; no UI to promote a 404 site_error into a new redirect in one click.
- **Reader segmentation** — newsletter subscribers are one big list per pub; no tagging (e.g. "wine tasting events list") for segmented sends.
- **AMP / Apple News / Google News integration** — none.

**Decisions we need from you**

1. **`social_posts` — build or archive?** Yet another fully-modeled stranded schema. Real-world question: are you posting to social platforms from MyDash, or is that a social media person working in Buffer / Hootsuite / manually? If MyDash, we need to pick one (Meta Graph API for FB+IG, Buffer API as abstraction, or Zapier webhook). ANSWER: We will post straight from MyDash.
2. **Story-performance loop on EditorialDashboard** — add a "Top This Week" / "Top This Month" widget that reads `daily_page_views` and surfaces to editors? (Same decision as Editorial #8, ties into this domain.) ANSWER: Yes.
3. **Rename / split the "Analytics" page** — it's actually a financial/operations dashboard, not audience analytics. Options: (a) rename to "Performance" or "Operations Dashboard" (but we already have Performance), (b) add a separate "Audience" page that pulls page_views data, (c) merge audience into DashboardV2. My lean: add an Audience page. ANSWER: B add Audience to Analytics page.
4. **Automated newsletter cron** — a "daily digest" or "weekly roundup" that auto-builds from `sent_to_web` stories in the last N hours and emails to subscribers, without a human composing each one? ANSWER: Yes
5. **Email service provider** — move newsletter sending off Gmail to SendGrid / Mailgun / Amazon SES? Needed beyond ~500 subscribers per pub, and needed for reliable open/click tracking. ANSWER: Yes, already have an AWS SES.
6. **Newsletter tracking pixel / link wrapper** — if we stay on Gmail, do we still want to wrap links + inject a tracking pixel through an edge function, or accept that open/click are not available? ANSWER: AWS SES
7. **Redirects CRUD in SiteSettings** — confirm there's an admin UI to add/edit redirects, or build one. ANSWER: Build one
8. **404-to-redirect one-click** — when a site_error has `error_type='404'` and hit_count > N, show an "Add redirect" button in the SiteSettings errors list that pre-populates `old_path`? ANSWER: Yes
9. **Public newsletter archive page** — build `/newsletter/archive` on each StellarPress site listing sent newsletters? ANSWER: No
10. **Unsubscribe page** — build a public `/unsubscribe/:token` page on StellarPress that flips the subscriber's status? ANSWER: Yes
11. **Editorial feedback cadence** — weekly digest to editors: "here's what performed last week, here's what underperformed"? ANSWER: Yes
12. **Audience segmentation / tags on newsletter_subscribers** — add a `tags` array column and "send this issue to subscribers tagged 'wine'"? Later
13. **Comments on StellarPress** — render them, or defer to Disqus, or drop comments entirely? (Related to Domain #3 decision #11.) ANSWER: No comments.

**My recommendations (for discussion, not decisions)**

- **(1) social_posts — archive the schema for now.** Social scheduling is a crowded market (Buffer, Hootsuite, Later, Meta Business Suite), and rolling your own OAuth to three platforms is a significant side-project. Unless you have a specific reason to own this, defer. DEFER
- **(2) + (11) editorial feedback loop** — this is the biggest missed-value gap in the whole domain. The data exists, the story model has `view_count` per-row and `daily_page_views` aggregated, the editors have no idea. Building the widget + a weekly digest is maybe 4 hours of work for massive impact on editorial decisions. YES
- **(3) rename & add Audience page** — do it. The current Analytics naming is misleading and creates a "where do I look for that" problem.
- **(5) email service provider** — wait until you need it. Gmail works for small lists. Switch *before* you cross 500 per pub, not after.
- **(8) 404-to-redirect one-click** — small build, big win. An editor who can fix a 404 in one click fixes more 404s. YES
- **Defer (4) automated newsletter cron** — human-curated is fine until it isn't.
- **Defer (9), (10), (12)** — all real but not urgent.
- **Stranded-schema tally after this walk:** classifieds, web ad authoring, print runs, distribution_points, mailing_exports, **social_posts**. Six tables/groups fully modeled and unwired. This is a theme worth formalizing in the gap triage.

---

### Walk #7 — Billing / AR

**Must do to be fully functional**

A media company's AR shop needs to: mint an invoice at the right time (per-close, per-run, monthly), generate a PDF that matches the brand, email it to the right billing contact, accept payment via ACH/card/check, reconcile payments to invoices (including partial, over, and under), run automated dunning at 30/60/90 days past due, auto-charge saved cards for clients on payment plans, produce client statements, calculate AR aging, handle credit memos / make-goods / refunds, sync everything to QuickBooks, and throw off the data the publisher needs to make "should we extend credit to this client" calls.

**Built (✓)**

- **Billing page** — [Billing.jsx](src/pages/Billing.jsx) (1796 lines, the largest non-AdProjects file) with 7 top tabs: **Overview**, **Invoices**, **Bills**, **Payment Plans**, **Receivables**, **Reports**, **Settings**. Invoices tab has a status sub-filter row. This is a serious, load-bearing module.
- **Invoice model** — `invoices` with `invoice_number`, `client_id`, `status` enum, `billing_schedule` enum (per-close / per-run / monthly), `issue_date`, `due_date`, `subtotal`, `tax_rate`, `tax_amount`, `total`, `balance_due`, `monthly_amount` + `plan_months` (for payment plans), provenance via `sale_id` + `proposal_id`, `locked_at` (protects sent invoices from edits).
- **Invoice lines** — `invoice_lines` with `description`, `quantity`, `unit_price`, `total`, `publication_id`, `issue_id`, `sort_order`, `sale_id` provenance on each line.
- **Payment model** — `payments` with `invoice_id`, `amount`, `method` enum, `reference_number`, `last_four`, `received_at`, `recorded_by`, `applied_to_credit` (for overpayments flowing into `clients.credit_balance`), `stripe_fee` captured per payment.
- **Bills (AP)** — `bills` with `vendor_name`, `vendor_email`, `category`, `amount`, `bill_date`, `due_date`, `status`, `paid_method`, `check_number`, `cc_last_four`, `attachment_url`, `source_type` + `source_id` (provenance — probably for freelancer_payments → bill, print_run → bill, etc.), `quickbooks_id` + `quickbooks_synced_at` + `quickbooks_sync_error`. [BillsTab.jsx](src/pages/BillsTab.jsx) (603 lines) is the AP UI embedded into Billing.
- **AR aging report** — 4-bucket (Current / 30 / 60 / 90+) in [Billing.jsx:330-340](src/pages/Billing.jsx#L330). Surfaced on Overview tab as stat cards and on Reports tab.
- **Receivables tab** — client-grouped AR with sort by total, expandable by client to show their open invoices.
- **Payment Plans tab** — dedicated tab for invoices with `plan_months > 1` and their monthly charge cadence.
- **Reports tab** — separate analytics view (not audited in detail here).
- **Stripe integration** — `stripe_payment_intent_id` on invoices, `stripe_customer_id` + `stripe_payment_method_id` on clients, `stripe_fee` captured on payments. `stripe-card` and `stripe-webhook` edge functions exist.
- **Public pay invoice page** — [PayInvoice.jsx](src/pages/PayInvoice.jsx) (181 lines) is a no-auth public page where a client pays an invoice via Stripe. Parallel to ProofApproval's pattern.
- **Invoice PDF generation** — `generateInvoiceHtml` in [lib/invoiceTemplate.js](src/lib/invoiceTemplate.js), Gmail-send integrated.
- **Tax support** — `tax_rate` + `tax_amount` on invoices.
- **Credit balance** — `clients.credit_balance` stores over/short, `payments.applied_to_credit` flips the payment into credit instead of invoice application.
- **Invoice-sale chain integrity** — recent migrations (027, 028, 029) enforced the `sale.proposal_id / proposal_line_id / contract_id / contract_line_id` link chain. An invoice minted from a closed sale can trace back to the contract and proposal.
- **Payment history per subscriber** — `subscription_payments` feeds into Billing's revenue reports (Domain #5).
- **Jurisdiction scoping** — Billing respects `jurisdiction` prop.

**Partial (△)**

- **Dunning cron is schema-only** — `invoices.first_reminder_sent`, `second_reminder_sent`, `final_reminder_sent` + matching `*_at` columns exist, but **no code writes them**. Same pattern as Editorial scheduled publish and Circulation renewal notices: the schema promises automation, the `scheduled-tasks` edge function has no AR logic. The staff has to open the aging report and manually email reminders.
- **Auto-charge is schema-only** — `invoices.auto_charge_attempts`, `last_charge_attempt`, `charge_error` exist. useAppData reads them into state for display. **Nothing in the codebase writes them.** So there's no worker that iterates payment-plan invoices, runs the Stripe charge, and logs the attempt/error. Payment Plans tab is a display; it doesn't actually run the plan.
- **QuickBooks sync on bills is partial** — `bills` has the sync fields. `invoices` and `payments` don't have `quickbooks_id` / `synced_at` columns, so there's no obvious way to tell if they've been pushed to QBO. Sync scope is unclear.
- **Invoice generation automation** — `billing_schedule` enum exists (per-close / per-run / monthly). Is there a cron that auto-mints invoices on sale-close, on run-date, or on the 1st of the month? `generatePending` is referenced in BillingSettings but I didn't verify what it actually does. Likely manual trigger, not cron.
- **Invoice locking** — `locked_at` field exists; unclear whether the UI enforces it (does editing a locked invoice produce an error?).
- **Credit memo / refund** — `payments.applied_to_credit` handles the positive case (client overpaid, keep the surplus). But there's no explicit credit-memo object (invoice of negative amount, or a `credit_memos` table) for the ad-ran-wrong / make-good case. The refund path lives as an adjustment in notes.
- **Dispute / chargeback handling** — Stripe disputes surface via webhook but there's no in-app dispute queue. A chargeback would probably arrive in the stripe-webhook edge function and silently update.
- **Reminder templates** — no per-pub dunning template system (30-day polite, 60-day firm, 90-day legal). Generic `generateRenewalHtml` is for subscribers, not invoices.
- **Statements** — no "client monthly statement" generation (one doc showing everything open, recent payments, current balance). Separate concept from invoice.

**Missing (✗)**

- **Dunning automation** — the single biggest AR gap. Automate first/second/final reminders at 30/60/90 days past due, via Gmail (or an email provider), flipping the reminder_sent booleans on send.
- **Auto-charge cron** — for invoices on payment plans with a saved Stripe card, run the charge on the scheduled day, handle failure retries (3 attempts with exponential backoff), notify the rep and the client on failure.
- **Credit memos as first-class objects** — add a `credit_memos` table or allow negative-amount invoices with a reason code (make-good / credit / refund / writeoff). Link to the originating sale for audit.
- **Client statements** — a monthly "here's everything you owe and everything you've paid" document that's emailable.
- **Commission clawback on writeoff** — when an invoice is written off, the associated `commission_ledger` row should be reversed (mentioned in Sales walk; it's an AR concern too).
- **Revenue recognition** — accrual vs cash. A sale closed in January for a June issue should probably recognize revenue when the ad runs, not when the invoice posts. Not modeled.
- **Tax jurisdiction** — `tax_rate` is per-invoice. Multi-state / multi-city tax (where you might have different rates per pub or per advertiser location) isn't handled.
- **Late fees** — no automatic late fee calculation or line addition.
- **Write-off workflow** — no "this is uncollectible, write it off, close the invoice, reverse commission, log the loss" one-click.
- **Invoice delivery failure** — if the Gmail send bounces (bad billing_email), no queue to retry or alert.
- **Batch invoicing** — "generate invoices for all closed sales in April" as a single batch with review → approve → send flow.
- **Deposit invoices** — for new clients on a big campaign, often 50% upfront. No distinct "deposit" invoice tied to the main invoice.
- **Multi-currency** — not relevant for you probably, but a gap for completeness.
- **AR collections queue** — no dedicated "here are the accounts in collections, here's the status, here's who's handling" surface. Today it's "read the aging report."
- **AR aging CSV export** — probably there, not verified.
- **Freelancer payout linkage** — `freelancer_payments` exists as a separate table; the walk-through for how it connects to `bills` or `commission_payouts` needs a pass.
- **Invoice auto-numbering per pub** — `clients.invoice_prefix` exists, suggests per-client or per-pub number schemes, but I didn't verify the next-number generator.
- **Credit check / hold integration** — same as the Sales walk #9 (credit hold that blocks production). Billing would be where the actual hold is triggered from (past-due 60+).

**Confirmed business rules**

- **Contract cancellation → invoice warning**: The `cancel_contract` RPC already (a) retains orders sent to press, (b) voids unpaid invoices for cancelled orders. But the UI in [SalesCRM.jsx:991-1001](src/pages/SalesCRM.jsx#L991) doesn't warn before voiding invoices — it runs the RPC and shows results after. **Requirement**: before calling `cancel_contract`, check for associated invoices that aren't void/paid. If any exist, show a specific confirmation: "Are you sure you want to delete the invoiced order?" Only proceed on confirm. (The RPC doesn't need changes — only the frontend confirmation flow.)

**Decisions we need from you**

1. **Dunning cron** — build now. Same scheduled-tasks cron that handles scheduled publish + renewal notices + issue status refresh. A single daily job can drive all four. Want me to? YES
2. **Auto-charge cron for payment plans** — Payment Plans is a tab that suggests it works. Do you want it actually running? If yes, this is a Stripe API call loop with retry logic + failure alerting. Medium build. YES
3. **Credit memos** — do you need them as first-class (a `credit_memos` table with audit trail back to the originating sale), or is "negative invoice + note in the description" good enough? GOOD ENOUGH
4. **Statements** — generate monthly client statements as a separate doc type, or stay with per-invoice only? ADD STATEMENTS
5. **Invoice generation automation** — what triggers an invoice? Options: (a) sale.closed → immediate invoice, (b) issue.sent_to_press → invoice for all sales in that issue, (c) first-of-month → invoice for all completed runs in prior month, (d) all three, configurable per pub. I need you to tell me which you actually want. B OR MANUAL FOR EVERYTHING BUT NEWSPAPERS; NEWSPAPERS TRIGGERS INVOICE FOR WHOLE MONTH ON THE SECOND ISSUE OF THE MONTH IS SENT TO PRESS
6. **Write-off workflow** — do bad debts get written off through MyDash, or through QuickBooks directly? If MyDash, we need a write-off UI that also handles the commission clawback. WRITE OFF UI WITH CLAWBACK
7. **QBO sync scope** — which objects actually need to sync to QuickBooks: invoices, payments, credit memos, clients, bills, subscription_payments? Bills have the sync columns; invoices/payments don't. Want me to audit and extend? AUDIT AND EXTEND; CAN WE PULL CLIENTS AND VENDORS FROM QUICKBOOKS AND/OR CONNECT CLIENTS AND VENDORS? NEED VENDORS CATEGORY IN MYDASH
8. **Revenue recognition** — do you care about accrual accounting (revenue recognized on run date) or is cash accounting fine? If accrual, we need to model the difference. CASH
9. **Late fees** — auto-apply at 30/60 days past due, or manual add? AUTO APPLY AT 30/60 DAYS PAST DUE
10. **Invoice delivery failure queue** — should failed Gmail sends land in a retry queue with an admin view? AWS SES

**My recommendations (for discussion, not decisions)**

- **(1) dunning cron is the #1 AR fix.** Same infrastructure as three other scheduled-task gaps. Stack them into a single scheduled-tasks deploy that ships this week and you solve four domains' worth of "schema promises automation, nothing runs it" problems at once. OK
- **(5) invoice generation automation** needs you to answer the business question first. I can't build it until you tell me what the right trigger is. If you don't know yet, default: **mint invoices when the issue hits `sent_to_press_at`** (covers per-run, and feels like the natural "we delivered what was sold" moment). SEE ABOVE
- **(3) credit memos as first-class** — worth it. "Negative invoice with a note" is how messes start. A proper credit memo with a link back to the originating sale is the auditable version. OK
- **(7) QBO sync audit** — urgent but lightweight. If invoices and payments aren't syncing, the accounting person is doing double entry. An hour of audit + a schema addition can save 10 hours a month of manual reconciliation. OK
- **(2) auto-charge cron** — second priority after (1). Payment Plans tab is dishonest until this runs. YES
- **Defer (4), (6), (8), (9), (10)** — all real, none urgent.

---

### Walk #8 — Accounts Payable / Commissions

**Must do to be fully functional**

The AP side needs to: record every expense (vendor bills, freelancer payments, commissions, printing, postage, route drivers), categorize by type and publication, mark as paid with method + reference, sync to QuickBooks, and produce reports. The commissions side needs to: calculate per-sale commission at the right rate (base + bonus tiers), respect the earning trigger (issue publishes / invoice paid / both), handle pub-share splits for multi-rep pubs, aggregate into per-period payouts, and allow the publisher to approve and mark paid.

**Built (✓)**

- **Bills system (AP)** — [BillsTab.jsx](src/pages/BillsTab.jsx) (603 lines) is a full-featured AP module embedded in Billing. `bills` table: `vendor_name`, `vendor_email`, `category` (freelance / commission / route_driver / shipping / printing / postage / payroll / rent / utilities / software / insurance / marketing / other), `amount`, `bill_date`, `due_date`, `status`, `paid_method` (check / credit_card / ACH / cash / wire / other), `check_number`, `cc_last_four`, `attachment_url`, `notes`, `source_type` + `source_id` (for provenance from freelancer_payments, print_runs, etc.), `created_by`.
- **QuickBooks sync on bills** — `quickbooks_id`, `quickbooks_synced_at`, `quickbooks_sync_error`. BillsTab maps each category to a canonical QB account name (e.g. `freelance → "Freelance"`, `printing → "Printing"`, `commission → "Commissions"`). Push-to-QB flow present.
- **Commission engine** — [Commissions.jsx](src/pages/sales/Commissions.jsx) (264 lines) with 4 tabs: **Overview**, **Rate Tables**, **Goals**, **Assignments**.
  - **Rate overrides** — `commission_rates` per salesperson × publication × product_type. Default rate: 20%. Overrides can be scoped to a single pub or product type or both.
  - **Bonus tiers** — hardcoded escalator: hit goal (+2%), 110% (+4%), 120% (+6%), 130% (+8%), 140%+ (+10%). Stacks on top of base rate.
  - **Commission triggers** — per-rep configurable: `issue_published` (earn when the issue ships), `invoice_paid` (earn when the client pays), or `both` (earn when both conditions are true). Stored on `team_members.commission_trigger`.
  - **Pub share assignments** — `salesperson_pub_assignments` with percentage per pub, `salesperson_pub_shares` for the split. UI shows slider per rep × pub with "100% assigned" validation.
  - **Per-issue goals** — `commission_issue_goals` with issue × pub × goal amount. UI shows goal per upcoming issue, auto-splits by rep share.
  - **Ledger** — `commission_ledger` fully modeled: `sale_id`, `salesperson_id`, `publication_id`, `issue_id`, `client_id`, `sale_amount`, `share_pct`, `commission_rate`, `bonus_pct`, `bonus_amount`, `total_amount`, `status` (pending / earned / paid), `issue_published` flag, `invoice_paid` flag, `earned_at`, `payout_id`, `paid_at`, `period`, `notes`.
  - **Payouts** — `commission_payouts` with `salesperson_id`, `period`, `total_amount`, `commission_count`, `status`, `approved_by/at`, `paid_at`. "Pay" button in Overview aggregates earned entries and marks paid.
  - **Recalculate all** — `recalculateAllCommissions` helper for bulk rebuild of the ledger (e.g. after rate changes).

**Partial (△)**

- **`freelancer_payments` is semi-stranded** — table exists with `freelancer_id`, `story_id`, `amount`, `status`, `paid_at`, `notes`. Only referenced in [Analytics.jsx](src/pages/Analytics.jsx) for report sums. **No CRUD UI.** The practical AP path for freelancer pay is through `bills` with `category='freelance'`. So `freelancer_payments` is a duplicated model — the specific story-level link (`freelancer_id` + `story_id`) doesn't exist on `bills`, but the CRUD does.
- **Bonus tiers are hardcoded** — the escalator lives as a `const BONUS_TIERS` in [Commissions.jsx:8-14](src/pages/sales/Commissions.jsx#L8). Not configurable per pub, per rep, or per period. A publisher who wants different bonus brackets for magazines vs newspapers can't do it without a code change.
- **Commission clawback** — no reversal logic when a sale is cancelled / invoice voided / contract cancelled. The `cancel_contract` RPC cancels sales and voids invoices but doesn't touch `commission_ledger`. An earned commission on a voided invoice stays earned.
- **Commission → bills linkage** — when commissions are marked paid, a `commission_payouts` row is created but no corresponding `bills` row with `category='commission'` is auto-created. So the commission payment isn't automatically visible in AP or in the QuickBooks sync path.
- **Bills → print_runs linkage** — `bills.source_type + source_id` could link to a print_run, but since print_runs is unbuilt, the printing category on bills is manually entered with no provenance.
- **Approval workflow on bills** — `bills.status` is text but there's no dual-approval (entered by bookkeeper, approved by publisher) surface. Anyone who can edit bills can mark them paid.
- **Bill recurrence** — monthly rent, software subscriptions, insurance — no recurring bill template. Each month's rent is manually entered.
- **1099 preparation** — freelancer/contractor payments above $600 need 1099 reporting. `freelancer_payments` has the per-person linkage, but `bills` (the actual CRUD) doesn't aggregate by vendor for tax purposes.

**Missing (✗)**

- **Commission clawback** — auto-reverse commission ledger entries when the associated sale's invoice is voided or the contract is cancelled. The `cancel_contract` RPC should cascade to `commission_ledger` (flip status → 'reversed', create a negative entry, or delete).
- **Commission → AP bill auto-creation** — when commissions are marked paid, auto-create a `bills` row with `category='commission'` so the payout flows into AP and QBO.
- **Freelancer payment UI** — either build CRUD for `freelancer_payments` (with story-level linkage) or archive it and enhance `bills` with an optional `story_id` + `freelancer_id` for the same granularity. The current state is duplicated models with neither fully functional.
- **Recurring bills** — template-based auto-generation for fixed monthly expenses.
- **Bill approval workflow** — publisher sign-off before payment (at least for bills above a threshold).
- **Vendor directory** — `bills.vendor_name` is free text. No `vendors` table to prevent "John's Printing" vs "Johns Printing" vs "John's Print Shop" drift. Same vendor, three spellings, impossible to aggregate for 1099.
- **1099 report** — aggregate vendor payments by calendar year, flag those above $600, generate the 1099 data (name, TIN, total). Today this would have to be done manually from QB.
- **Commission disputes** — a salesperson who disagrees with a commission calculation has no formal dispute/review surface.
- **Commission forecasting** — no "based on the pipeline, here's projected commission for next quarter" view.
- **AP aging** — `bills` has `due_date` but I didn't see an AP aging report (overdue vendor bills). Billing has AR aging; the AP side may be missing the same.
- **Check printing / ACH batch** — bills can be marked paid with method=check, but there's no check-printing integration or ACH batch file export.
- **Budget vs actual per category** — bills have categories, but there's no "we budgeted $5K for printing this quarter, we've spent $4.2K" surface.

**Decisions we need from you**

1. **Commission clawback** — should `cancel_contract` also reverse commission ledger entries? If yes: (a) create a negative entry with `status='reversed'` and link to the original, or (b) flip the original to `status='reversed'`? I lean (a) for audit trail.
2. **Commission → bill auto-creation** — when you click "Confirm Payout" for a rep, should a `bills` row auto-create so the payout flows to QBO? This closes the commission → AP → QB loop.
3. **Freelancer payments — build or merge?** Options: (a) build CRUD for `freelancer_payments` with story-level linkage + rate tracking, (b) archive `freelancer_payments` and add `story_id` + `freelancer_id` columns to `bills`, (c) keep both. I lean (b) — one payment system, not two.
4. **Vendor directory** — add a `vendors` table and link `bills.vendor_id` to it? Eliminates name drift, enables 1099 aggregation, enables recurring bill templates.
5. **Bonus tiers** — make configurable per pub or per rep, or is the current hardcoded escalator fine for your business?
6. **Bill approval workflow** — require publisher approval for bills above $X? Or stay trust-based?
7. **Recurring bills** — template-based auto-generation for fixed monthly expenses?
8. **AP aging report** — add an AP aging view (Current / 30 / 60 / 90+ overdue vendor bills) mirroring the AR aging?

**My recommendations (for discussion, not decisions)**

- **(1) commission clawback** is the #1 gap. Without it, cancelling a contract leaves phantom commission dollars that inflate the payout. Negative entry approach is cleanest. YES
- **(2) commission → bill auto-creation** closes a real gap. Without it, the publisher is double-entering commission payouts (once in Commissions, once in Bills for QBO). YES
- **(3) merge freelancer_payments into bills** — one AP system. Add `story_id` and `freelancer_id` as optional columns on `bills`. Stranded-schema tally drops by one. YES
- **(4) vendor directory** — if you plan to do 1099s from MyDash, this is prerequisite. If 1099s happen in QBO, it's nice-to-have. YES
- **Defer (5), (6), (7), (8)** — all real, none blocking.

---

### Walk #9 — Team / HR / Permissions

**Must do to be fully functional**

A multi-pub media company's team management needs to: maintain a roster with roles and contact info, assign staff to publications, scope every module + action to what each person should see, handle freelancers with different rate structures, integrate the calendar so everyone sees their role-relevant deadlines (ad close / ed close / story due / publish date), and support inter-team messaging with context (about a story, a client, a proof).

**Built (✓)**

- **Team model** — `team_members` with `name`, `role` (16-value enum: Publisher / Editor-in-Chief / Managing Editor / Editor / Writer/Reporter / Stringer / Copy Editor / Photo Editor / Graphic Designer / Sales Manager / Salesperson / Distribution Manager / Marketing Manager / Production Manager / Finance / Office Manager), `email`, `phone`, `avatar_url`, `auth_id` (links to Supabase auth), `assigned_pubs[]`, `is_active`, `is_hidden` (for admin shadow accounts).
- **Freelancer support** — `is_freelance`, `specialty`, `rate_type`, `rate_amount`, `specialties[]`, `availability` (available / busy / on_leave). Freelancers appear in StoryEditor's contributor selector.
- **StellarPress roles** — `stellarpress_roles` jsonb for cross-platform role assignment.
- **Module permissions matrix** — [Permissions.jsx](src/pages/Permissions.jsx) (130 lines) renders a team × module grid where each cell is a checkmark toggle. 18 modules: Dashboard, Sales Pipeline, Client Profiles, Proposals, Commissions, Stories/Editorial, Flatplan/Layout, Publications/Schedule, Billing/Invoices, Circulation/Subscribers, Service Desk, Legal Notices, Creative Jobs, Calendar, Analytics, Team Management, Permissions, Integrations/Settings.
- **Role-based defaults** — `ROLE_DEFAULTS` per role: e.g. Salesperson gets {dashboard, sales, clients, proposals, commissions, flatplan, publications, billing, calendar}, Content Editor gets {dashboard, stories, flatplan, calendar}. One-click "Reset to defaults" per person.
- **Module enforcement in App.jsx** — [App.jsx:368](src/App.jsx#L368) reads `currentUser.modulePermissions` and gates sidebar navigation + route rendering.
- **Jurisdiction system** — [useJurisdiction.js](src/hooks/useJurisdiction.js) (95 lines) computes filtered data per role. Admin roles (Publisher, EIC, Office Admin) see everything. Salespeople see only their clients (by `repId`) across all pubs. Non-admin staff see data only for their `assigned_pubs[]`. Returns `{ isAdmin, isSalesperson, myPubs, myClients, mySales, myIssues, myStories, myJobs, hasPub() }`.
- **Editorial permissions** — `editorial_permissions` per-user per-pub with 7 booleans: `can_assign`, `can_edit`, `can_approve_web`, `can_approve_print`, `can_publish`, `can_manage_editions`, `can_manage_categories`. More granular than module permissions — controls who can actually approve a story for press vs who can just draft.
- **Calendar** — [CalendarPage.jsx](src/pages/CalendarPage.jsx) (500 lines) with Google Calendar API integration (`gcal-api` edge function), 7 event types (Google Calendar, Publish Date, Ad Deadline, Ed Deadline, Sales Action, Story Due, Custom), role-based default filters (Publisher sees all types; Writer sees only Story Due + Google + Custom), month/week/day views.
- **Team notes** — `team_notes` with `from_user`, `to_user`, `message`, `is_read`, `read_at`, `context_type` + `context_id` (links to a story, client, ad_project, etc. for contextual messaging).
- **Team Member Profile** — [TeamMemberProfile.jsx](src/pages/TeamMemberProfile.jsx) (452 lines) with contact info, availability status, module permissions editor, role assignment, pub assignments.
- **Commission config on team members** — `commission_trigger` (issue_published / invoice_paid / both), `commission_default_rate` stored directly on the team member.
- **Alert preferences** — `alert_preferences` jsonb and `alerts[]` array for per-user notification settings.
- **Profile system** — `profiles` table (separate from `team_members`) with `email`, `full_name`, `avatar_url`, `bio`, `site_roles` jsonb, `global_role`. This is the Supabase auth-linked profile; `team_members` is the operational record.
- **Auth** — [useAuth.jsx](src/hooks/useAuth.jsx) handles Supabase auth + matching to `team_members` via `auth_id`. Invite user flow via `invite-user` edge function.

**Partial (△)**

- **Two identity tables** — `profiles` (auth-linked) and `team_members` (operational) overlap. `auth_id` on team_members links them, but there's no enforcement that every auth user has a team_member or vice versa. A mismatch means someone can log in but has no role, or has a role but can't log in.
- **Freelancer rate enforcement** — `rate_type` + `rate_amount` exist on team_members but aren't used to auto-calculate freelancer_payments or bill amounts. The rate is informational, not functional.
- **Module permissions vs editorial permissions** — two separate systems. Module permissions control sidebar visibility; editorial permissions control story-level actions. A user with module access to "Stories / Editorial" but without `can_publish` in editorial_permissions can see the editorial module but can't publish. The two systems are complementary but could confuse an admin.
- **Calendar ↔ story deadlines** — CalendarPage generates story-due events from `stories.due_date`, which is good. But story deadlines don't push to Google Calendar — they're only visible in-app. An editor who lives in Google Calendar misses deadlines.
- **Team notes UI** — `team_notes` table is modeled but I need to verify where the UI for sending/reading notes lives. May be in TeamMemberProfile or ChatPanel.
- **Availability status** — `availability` (available / busy / on_leave) is on team_members but I didn't see it surfaced in assignment UIs (when assigning a story or ad_project, does the UI warn "this person is on_leave"?).
- **Deactivation** — `is_active` flag exists. When a team member is deactivated, does their data (assigned stories, clients, ad_projects) get reassigned or orphaned? No transition workflow visible.

**Missing (✗)**

- **Onboarding workflow** — when a new team member is added, there's no "invite → set up profile → configure permissions → assign pubs → welcome" guided flow. It's separate screens (TeamModule → add, Permissions → toggle, TeamMemberProfile → assign pubs).
- **Offboarding workflow** — deactivating a member should trigger reassignment of their open items (clients, stories, ad_projects, pipeline deals). No cascade.
- **Role change audit** — no log of when a team member's role or permissions changed. If you need to answer "who gave John access to Billing in March?" there's no trail.
- **Time tracking** — out of scope per inventory/payroll being external, but worth noting: no hours logging for freelancers against stories, which means freelancer billing is manual.
- **Org chart / reporting structure** — no `reports_to` field. Everyone reports to Publisher by convention. Fine for a small team; breaks at 15+ people.
- **Multi-company team isolation** — all team members are in one pool. If Wednesday Consulting team members shouldn't see 13 Stars media data, there's no company-level isolation.
- **Google Calendar write-back** — story deadlines, ad deadlines, and publish dates show in-app but don't push to Google Calendar. Only pull works (gcal-api reads events).
- **Vacation / PTO tracking** — out of scope (external payroll), but `availability: 'on_leave'` could benefit from date ranges (out Apr 15-22) rather than a toggle.
- **Skill matrix** — `specialties[]` exists on freelancers; no matching when assigning stories ("who on the team covers wine / real estate / government?").

**Decisions we need from you**

1. **Profiles vs team_members** — do we need both? If `profiles` is only for auth linkage, we could merge its unique fields (`bio`, `site_roles`, `global_role`) onto `team_members` and drop the table. If `profiles` serves a public-facing purpose (StellarPress author pages, for instance), keep both but enforce the 1:1 linkage. MERGE
2. **Onboarding flow** — worth building a guided "New Team Member" wizard that walks through name → role → pubs → permissions → invite email? Or stay with the current multi-screen approach? BUILD IT
3. **Offboarding cascade** — when deactivating, should MyDash prompt to reassign all open items (stories, clients, pipeline deals, ad_projects) to another team member? YES
4. **Google Calendar write-back** — push story deadlines, ad deadlines, and publish dates TO Google Calendar, not just read FROM it? YES
5. **Availability in assignment UIs** — when assigning a story or ad_project, show a warning badge if the person is `on_leave` or `busy`? YES
6. **Permission audit log** — log role/permission changes to `activity_log` for accountability? YES
7. **Module permissions documentation** — the two-layer system (module visibility + editorial action permissions) works but needs explaining in the help docs. Worth adding an in-app tooltip or helper text in Permissions.jsx? YES

**My recommendations (for discussion, not decisions)**

- **(3) offboarding cascade** is the highest-impact gap. A deactivated rep whose clients and pipeline deals sit orphaned is a revenue leak. Build a reassignment modal that fires on deactivation.
- **(1) profiles vs team_members** — merge if `profiles` has no StellarPress-facing role. Two identity tables is a bug waiting to happen.
- **(4) Google Calendar write-back** — high daily-value. Editors and salespeople live in Google Calendar; if deadlines only exist in-app, they get missed. The `gcal-api` edge function already has the OAuth; write-back is an incremental build.
- **(6) permission audit log** — cheap to add (one `activity_log` insert on save). Important for when you have 10+ team members.
- **Defer (2), (5), (7)** — real but not urgent.

---

### Walk #10 — Performance / Reporting

**Must do to be fully functional**

A publisher needs a single surface that answers: "how is each department doing against deadlines and goals?" Sales needs lead-to-close velocity, revenue mix (new vs existing), per-rep breakdown. Editorial needs stories-on-track-vs-behind, deadline proximity, throughput. Production needs ad-project velocity, revision counts (quality signal), layout completion. Admin needs ticket resolution time and subscriber health. And all of it should surface wins (celebrating what went right) and pressure signals (what's about to blow up) in a glanceable ambient display.

**Built (✓)**

- **Performance page** — [Performance.jsx](src/pages/Performance.jsx) with 4 department tabs: **Sales**, **Editorial**, **Production**, **Admin**. Period filter (This Week / This Month / Custom) + team-member filter scoped to relevant roles. Data via `usePerformanceData` hook.
- **SalesMetrics** — lead-to-close velocity, revenue delta (vs prior period), revenue mix bar (existing vs new, 70/30 target marker), per-rep breakdown, WinsCard.
- **EditorialMetrics** — on-track % across stories in issues whose `ed_deadline` falls in the window, average proximity score (`stage % − time %`), per-editor breakdown. Content Editor 70% weight, Copy Editor 30%.
- **ProductionMetrics** — two lanes: Layout Designer (stories past Ready) and Ad Designer (ad_projects lifecycle). Each has deadline proximity + on-track %. Ad lane also tracks average revision count (quality metric — lower wins).
- **AdminMetrics** — service ticket response/resolution time against targets, subscriber KPIs. Live Supabase query for tickets + subscribers.
- **Deadline proximity scoring** — [deadlineProximity.js](src/pages/performance/deadlineProximity.js) computes a numeric score per item relative to its issue deadline. Green/amber/red. Used across all four metric tabs.
- **WinsCard** — generic celebration component per department: closed deals (Sales), published stories (Editorial), completed projects (Production), resolved tickets (Admin). Also feeds Morning Briefing.
- **DashboardV2** — [DashboardV2.jsx](src/pages/DashboardV2.jsx) is the main landing page:
  - **DOSE wins strip** — celebrates recent wins with pop animation.
  - **Ambient pressure glow** — [AmbientPressureLayer.jsx](src/components/AmbientPressureLayer.jsx) animates a global background: serene blue (0) → amber (50) → pulsing red (100) from `globalPressure`. Three animated layers with blur for fluid wave motion.
  - **Cycling action items** — rotates through every concurrent flagged issue per department.
  - **Morning Briefing modal** — wins, upcoming deadlines, revenue-vs-goal, open actions. `briefing_configs` per-user (sections jsonb, morning/afternoon times).
  - **Per-department summary tiles** — headline stat + cycling actions + wins count.
  - **Global pressure score** from useSignalFeed drives the ambient background.
  - **Supabase realtime** — cross-tab / cross-user wins detection.
- **useSignalFeed** — [useSignalFeed.jsx](src/hooks/useSignalFeed.jsx) is the single-source publisher signal aggregator: deadline alerts, ad-project status, editorial progress, revenue vs goal, 24h web traffic, global pressure score. Feeds DashboardV2 and Dashboard.
- **My Priorities** — `my_priorities` per-team-member with `signal_type`, `signal_detail`, `highlighted` (publisher can highlight for a rep), `sort_order`.
- **Activity log** — `activity_log` with `type`, `client_id/name`, `sale_id`, `detail`, `actor_id/name`. Sales-focused.
- **Notifications** — `notifications` with `user_id`, `type`, `title`, `detail`, `link`, `read`. Bell-icon dropdown via NotificationPopover. Written by `cancel_contract` RPC, editorial publish flow, etc.
- **Analytics (financial)** — [Analytics.jsx](src/pages/Analytics.jsx) for P&L: sales revenue, payments, subscriber revenue, commissions, freelancer payments, circulation, legal notices.

**Partial (△)**

- **Briefing automation** — `briefing_configs.time_morning/afternoon` promise a timed send. **No cron runs it.** Adds to the scheduled-tasks tally: now **5 domains**.
- **Activity log consistency** — `activity_log` is sales-focused. Story events → `story_activity`. Bill payments, commission payouts, subscriber renewals, proof approvals don't write to either. "Who did what when" only works fully for sales.
- **Notification routing** — many writes insert with `user_id=NULL` (broadcast). No routing rules (event → person → channel). No email/SMS escalation.
- **My Priorities ↔ pipeline** — manual list. No auto-population from stale pipeline items.
- **Pressure score transparency** — `globalPressure` drives the glow, but the formula isn't surfaceable. Publisher sees "the screen is red" but can't drill into which issues drive it.
- **Cross-department issue health** — no unified "this issue is behind on editorial AND ads AND sales" roll-up across departments. IssueSchedule has some; Performance doesn't.
- **Historical trend** — Performance shows one period. No month-over-month comparison.

**Missing (✗)**

- **Briefing cron** — fifth domain with promised-but-unwired automation.
- **Unified audit log** — no single surface for all significant events across domains.
- **Notification routing rules** — no "ad deadline T-3 → ping rep + manager" engine.
- **Notification escalation** — no "unread 4h → email; unread 24h → SMS."
- **Role-aware dashboard layouts** — DashboardV2 tiles are the same for everyone.
- **Scheduled email digests** — no "Monday morning, email the publisher a weekly PDF."
- **KPI targets** — revenue goals per issue exist; no "95% on-track editorial by end of quarter" target.
- **Data export** — no CSV/PDF from Performance, Analytics, or Billing reports.
- **Drill-through** — Performance shows per-rep stats but no click-to-navigate to the filtered module.
- **Alerting on state transitions** — no "when issue flips On Track → At Risk, notify publisher."

**Decisions we need from you**

1. **Briefing cron** — add to the scheduled-tasks deploy? Auto-email the morning briefing to users with `briefing_configs` set? Stacks with 4 other cron items.
2. **Unified audit log** — single write target for all events, or domain-specific logs + unified read view?
3. **Notification routing rules** — rules engine (event × conditions → recipient + channel), or keep ad-hoc?
4. **Role-aware dashboard** — auto-select the department matching the user's role, or render a different layout per role?
5. **Drill-through** — click per-rep stat → navigate to filtered module?
6. **Pressure drill-down** — click the ambient glow → show top 3-5 contributing items?
7. **Data export** — CSV + PDF from Performance/Analytics?

**My recommendations**

- **(1) briefing cron** — stack with the other four. One deploy, five domains unblocked. YES
- **(5) drill-through** — high-value, low-build. Performance already knows which items are behind. Click-to-navigate is a few lines per tab. YES
- **(6) pressure drill-down** — makes the ambient glow operational instead of decorative. YES
- **(2) unified audit log** — extend `activity_log` writes to all domain save functions. YES
- **Defer (3), (4), (7)** — additive, not blocking.

**Scheduled-tasks debt: 5 domains.** Editorial (scheduled publish), Issues (status refresh), Circulation (renewal notices), Billing (dunning + auto-charge), Performance (morning briefing). Single deploy covers all.

---

### Walk #11 — Ops / Service / Comms

**Must do to be fully functional**

A media company's operations layer needs to: handle inbound service requests (subscriber complaints, advertiser questions, delivery issues), route them to the right person, track resolution time, manage legal notice publication as a separate revenue stream with its own compliance workflow, send and receive email from within the app, maintain reusable email templates with merge fields, and support internal team messaging with context.

**Built (✓)**

- **Service Desk** — [ServiceDesk.jsx](src/pages/ServiceDesk.jsx) (455 lines) with full ticketing: 5 channels (phone / email / web_form / walk_in / other), 7 categories (subscription / billing / ad_question / complaint / delivery / legal_notice / general), 5-state status (open / in_progress / escalated / resolved / closed), 3-priority (normal / high / urgent), `assigned_to` + `escalated_to`, `first_response_at` (SLA tracking), `resolution_notes`, `ticket_comments` with `is_internal` flag (internal notes vs client-visible replies), `contact_name/email/phone` for non-client submitters, `publication_id` scoping.
- **Legal Notices** — [LegalNotices.jsx](src/pages/LegalNotices.jsx) (565 lines) with 6 types (fictitious_business / name_change / probate / trustee_sale / government / other), 6-state workflow (received → proofing → approved → placed → published → billed), `run_dates[]` array with `total_runs` / `completed_runs` tracking, `rate_per_run` / `total_amount`, `proof_approved` flag, `contact_name/email/phone`, `client_id` linkage. `legal_notice_issues` m2m links each notice to specific issues with page assignment and per-issue status. `media_assets.legal_notice_id` for file uploads.
- **Internal messaging** — [Messaging.jsx](src/pages/Messaging.jsx) (387 lines) direct messages backed by `team_notes`, grouped by conversation partner, unread count, composer. Shared with NotificationPopover and TeamMemberProfile for consistency. `team_notes.context_type + context_id` enables contextual messaging (about a specific story, client, ad_project).
- **Gmail client** — [Mail.jsx](src/pages/Mail.jsx) (700 lines) is a full embedded Gmail client: 2-column layout (message list + reading pane), label-based filtering, TipTap-powered compose with rich text + links + images, `gmail-api` and `gmail-auth` edge functions for OAuth, DOMPurify for safe HTML rendering.
- **Email templates** — [EmailTemplates.jsx](src/pages/EmailTemplates.jsx) (670 lines) with CRUD: `name`, `category`, `subject`, `html_body`, `merge_fields[]` array (e.g. `{{client_name}}`, `{{invoice_number}}`), `publication_id` / `publication_ids[]` scoping, `include_letterhead`, `is_default`, `config` jsonb, `created_by` / `updated_by`. Per-pub templates for branded outbound.
- **Email send audit** — `email_log` captures every outbound email: `type`, `to_email`, `subject`, `status`, `error_message`, `sent_by`, `client_id`, `ref_type + ref_id` (invoice, proposal, proof, etc.), `gmail_message_id` for threading.
- **Gmail maintenance** — automated inbox cleanup: `gmail_maintenance_preferences` (configurable per-user: delete spam, promotions older than N days, social older than N days, noreply older than N days, flag large attachments). `gmail_maintenance_log` tracks actions taken + space freed. This actually runs in `scheduled-tasks` — one of the few things that does.
- **Communications log** — `communications` per-client with type (call / meeting / comment), author, date, note. Feeds into ClientProfile (covered in Sales walk).
- **Outreach campaigns** — `outreach_campaigns` + `outreach_entries` for structured client win-back (covered in Sales walk).

**Partial (△)**

- **Service ticket ↔ email** — tickets have `channel: 'email'` but there's no auto-create-ticket-from-inbound-email flow. If a subscriber emails a complaint, someone has to manually create the ticket. No email-to-ticket bridge.
- **Ticket SLA alerting** — `first_response_at` captures the first response time, and AdminMetrics uses it for performance scoring. But there's no "this ticket has been open 4 hours with no response, alert the manager" auto-escalation.
- **Legal notice → invoice** — `legal_notices` has `total_amount` and status reaches `billed`, but I didn't verify the auto-mint path to `invoices`. May be manual.
- **Legal notice affidavit** — legal notices often require a sworn affidavit of publication for the court. No PDF generation for the affidavit, just the notice body.
- **Email template preview** — templates have merge fields, but I didn't verify there's a live-preview with sample data before sending.
- **Messaging ↔ notifications** — when a team_note is sent, does it create a `notifications` row for the recipient? Needs verification. If not, messages are silent until the person opens Messaging.

**Missing (✗)**

- **Email-to-ticket bridge** — inbound email from a subscriber or advertiser auto-creates a service ticket. This is the #1 gap for any support flow. Without it, email complaints sit in Gmail unseen until someone manually creates a ticket.
- **Ticket auto-escalation** — "open > 4h with no response → escalate to manager." No timer-based status transitions.
- **Customer-facing ticket portal** — no public "view my ticket status" page for the submitter. All communication happens via phone/email reply.
- **Canned responses** — no quick-reply templates for common ticket types (e.g. "your subscription has been renewed, here's your confirmation").
- **Legal notice affidavit PDF** — standard requirement for court filings. Generate a branded PDF with the notice text, run dates, and a notarized-style attestation.
- **Legal notice online filing** — some jurisdictions accept electronic filing. No integration.
- **Knowledge base / FAQ** — no public-facing help articles that could deflect tickets before they're created.
- **Ticket metrics dashboard** — AdminMetrics in Performance covers some of this, but there's no dedicated "Service Desk dashboard" with queue depth, avg response time, category breakdown, repeat-contact rate.
- **CSAT / satisfaction survey** — no post-resolution survey.

**Decisions we need from you**

1. **Email-to-ticket bridge** — worth building? Would require the Gmail integration to watch for emails matching certain patterns (or a shared inbox) and auto-create tickets. Medium build.
2. **Legal notice affidavit PDF** — do your publications publish legal notices? If yes, affidavit generation is a real revenue requirement (courts require them). If not, deprioritize.
3. **Legal notice → invoice auto-mint** — should status reaching `billed` auto-create an invoice, or is it manual?
4. **Ticket auto-escalation** — add to `scheduled-tasks`? (Would be the 6th cron item.)
5. **Canned responses** — worth adding a quick-reply picker to the ticket comment composer?

**My recommendations**

- **(2) legal notice affidavit** — if you publish legal notices, this is table stakes. A court that gets a plain-text email instead of a signed affidavit rejects it. YES
- **(1) email-to-ticket** — highest-impact for service quality, but medium build. Defer to after the scheduled-tasks mega-deploy. YES
- **(5) canned responses** — cheap win. A `ticket_responses` table + dropdown in the comment composer. YES
- **Defer (3), (4)** — refinements.

---

### Walk #12 — Integrations

**Must do to be fully functional**

The integration layer connects MyDash to external systems: payment processing (Stripe), accounting (QuickBooks), email (Gmail), calendar (Google Calendar), file storage (Bunny CDN), PDF generation, site hosting (StellarPress), and AI assistance. Each integration needs: OAuth credential management, token refresh, error handling, and a health/status surface.

**Built (✓)**

- **17 edge functions** — `ai-proxy`, `bunny-storage`, `contract-email`, `create-checkout-session`, `create-portal-session`, `gcal-api`, `generate-pdf`, `gmail-api`, `gmail-auth`, `invite-user`, `qb-api`, `qb-auth`, `scheduled-tasks`, `site-errors`, `stripe-card`, `stripe-webhook`, `upload-image`.
- **Stripe** — `create-checkout-session` (payment page), `create-portal-session` (customer billing portal), `stripe-card` (save card on file), `stripe-webhook` (payment events). `stripe_customer_id` + `stripe_payment_method_id` on clients. `stripe_payment_intent_id` on invoices. `stripe_fee` captured per payment. PayInvoice.jsx public pay page.
- **QuickBooks** — `qb-api` + `qb-auth` edge functions. `quickbooks_tokens` with `realm_id`, `company_name`, auto-refresh. Bills have `quickbooks_id` + `quickbooks_synced_at` + `quickbooks_sync_error`. BillsTab maps categories to QB account names.
- **Gmail** — `gmail-api` + `gmail-auth` edge functions. `gmail_tokens` per team member with refresh. `google_tokens` for broader Google OAuth (Calendar). Full Gmail client in Mail.jsx. `email_log` audit trail. `gmail_maintenance_log/preferences` for automated inbox cleanup.
- **Google Calendar** — `gcal-api` edge function, reads events into CalendarPage. `google_tokens` OAuth.
- **Bunny CDN** — `bunny-storage` edge function for file upload/retrieval. CDN_BASE at `cdn.13stars.media`. Used for ad proofs, media assets, client assets.
- **PDF generation** — `generate-pdf` edge function. Used for proposals, contracts, invoices.
- **AI proxy** — `ai-proxy` edge function (likely for newsletter blurb generation and other AI-assisted features).
- **StellarPress** — shared Supabase database. Stories, categories, magazine_issues (view), cross_published_stories, ad_zones, ad_placements all read directly by StellarPress via PostgREST. Site errors ingested via `site-errors` edge function.
- **Integrations page** — [IntegrationsPage.jsx](src/pages/IntegrationsPage.jsx) (363 lines) for managing connections.
- **Org settings** — `org_settings` singleton: `auto_generate_magazine_invoices`, `auto_generate_newspaper_bulk`, `magazine_lead_days`, `billing_config` jsonb, `global_pressure_enabled`, `serenity_color`, `background_image_url/opacity`.

**Partial (△)**

- **QuickBooks sync scope** — bills sync to QB (has the id/synced_at/error columns). Invoices and payments do NOT have QB sync columns. If invoices aren't syncing, the bookkeeper is doing double entry. This is the single most impactful integration gap.
- **Stripe webhook completeness** — `stripe-webhook` exists but I haven't verified it handles all events: `payment_intent.succeeded`, `invoice.payment_succeeded` (for subscription renewals), `charge.dispute.created`, `customer.subscription.updated`. Gaps here mean silent payment failures.
- **Google Calendar is read-only** — pull events into CalendarPage, but no write-back of deadlines/events to Google Cal. (Covered in Team walk.)
- **`scheduled-tasks` is mostly empty** — only runs Gmail maintenance. Five other domains need crons added: scheduled publish, renewal notices, dunning + auto-charge, issue status refresh, morning briefing. This is the single highest-value integration fix.
- **Token refresh error handling** — OAuth tokens expire. Gmail and Google tokens have refresh logic in `scheduled-tasks`. QuickBooks and Stripe token refresh: need to verify error handling when refresh fails (does it alert someone?).
- **Issuu** — `issuu_editions` table referenced in StellarPress (EditionCover, IssuePage). You've confirmed no Issuu integration going forward. Dead table — should be archived.
- **AI proxy scope** — `ai-proxy` exists but unclear which features use it beyond newsletter blurb generation.

**Missing (✗)**

- **Integration health dashboard** — no "here's the status of every connected service" surface. If the QB token expired 3 days ago and nobody noticed, syncs are silently failing.
- **QB sync for invoices and payments** — invoices and payments need `quickbooks_id` columns and sync logic to close the AR loop in QB.
- **Webhook event log** — `stripe-webhook` processes events but there's no `webhook_events` table logging what was received and how it was processed. Hard to debug "did that payment come through?"
- **Retry queue** — when an integration call fails (QB sync, Gmail send, Stripe charge), there's no retry queue with exponential backoff. It fails silently.
- **SendGrid / Mailgun** — newsletter sending beyond ~500 subs needs a real ESP. No integration.
- **USPS / address validation** — for circulation mailing lists. No integration.
- **Google Search Console** — for SEO health monitoring. No integration.
- **Social media APIs** — Meta Graph, X API, LinkedIn. `social_posts` schema exists but no OAuth. (Confirmed archive recommendation from Audience walk.)

**Decisions we need from you**

1. **QB sync for invoices + payments** — critical. Do you want me to add `quickbooks_id` + `synced_at` + `sync_error` to invoices and payments, and build the push logic in `qb-api`?
2. **scheduled-tasks mega-deploy** — the #1 priority across 5 domains. Bundle: scheduled publish, renewal notices, dunning reminders, auto-charge, issue status refresh, morning briefing. One function, one deploy. Want me to build it?
3. **Integration health dashboard** — add a status card per integration on IntegrationsPage showing last sync time, error count, token expiry countdown?
4. **Webhook event log** — add a `webhook_events` table and log every Stripe/QB webhook for debugging?
5. **Issuu cleanup** — archive `issuu_editions` table + remove StellarPress references?
6. **Newsletter ESP** — when subscriber counts grow, switch to SendGrid/Mailgun. At what subscriber count do you want to plan for this?

**My recommendations**

- **(2) scheduled-tasks mega-deploy is the single highest-ROI task in the entire gap analysis.** One edge function enhancement, 5 domains unblocked, 5 broken promises kept. Ship this first. YES
- **(1) QB invoice + payment sync** — second priority. Closing the AR loop in QB saves hours of manual reconciliation per month. YES
- **(3) integration health dashboard** — cheap insurance. A "last synced 14 days ago" warning prevents the kind of silent failure that causes month-end crises. YES
- **Defer (4), (5), (6)** — nice-to-have.

---

### Walk #13 — Publications / Sites (Multi-brand)

**Must do to be fully functional**

A multi-publication media company needs to: manage each brand as a distinct entity with its own identity (logo, colors, domain), schedule, rate card, and categories; share operational infrastructure (billing, team, CRM) across all brands; and configure each brand's public website independently (theme, navigation, sections, fonts).

**Built (✓)**

- **Publication model** — `publications` with rich config: `name`, `color`, `type` enum (Newspaper / Magazine / Special Publication), `page_count`, `width` × `height` (trim size), `frequency` enum, `circulation`, `pub_day_of_week`, `press_day_pattern`, `ad_close_offset_days` / `ed_close_offset_days`, `schedule_start/end`, `press_dates_of_month[]`, `default_revenue_goal`, `domain`, `slug`, `logo_url`, `favicon_url`, `has_website`, `website_url`, `dormant`, `is_active`.
- **Site settings per pub** — `site_settings` jsonb stores: primary/secondary colors, tagline, homepage section order, fonts, navigation config, social links, best-of slug/label, and anything else StellarPress needs.
- **Theme config** — `theme_config` jsonb for StellarPress rendering: heading/body fonts, color palette.
- **Subscription config** — `subscription_config` jsonb for per-pub subscription tiers/pricing.
- **Categories per pub** — `categories` table with `publication_id`, `parent_id` (hierarchy), `sort_order`, `slug`, `description`. Magazine categories seeded (Featured, Home, Health, Real Estate, Wine and Dine, People, Arts & Culture, Travel, Entertainment, Business).
- **Publications management page** — [Publications.jsx](src/pages/Publications.jsx) (258 lines) for CRUD.
- **SiteSettings** — [SiteSettings.jsx](src/pages/SiteSettings.jsx) (1,047 lines) is a major surface: per-pub website config (colors, fonts, sections, social links), ad zones management, redirects, page_views analytics, site_errors monitoring + resolution, and more.
- **Multi-brand scoping throughout** — every major table carries `publication_id` / `pub_id` / `site_id`. Jurisdiction system filters by `assigned_pubs`. Proposal/contract/sale/invoice all track `publication_id` per line.
- **Domain management** — `domain` + `website_url` on publications. Recent fix (this session) wired staging domains to StellarPress magazines.
- **Dormant flag** — `dormant` to hide a publication from active workflows without deleting it.

**Partial (△)**

- **No pub-level P&L** — revenue flows through sales/invoices per pub, costs flow through bills per pub, but there's no "pub X profit/loss this month" surface. Analytics.jsx is org-wide. A publisher running 8 pubs needs per-pub profitability.
- **Category hierarchy** — `parent_id` exists but I didn't see hierarchical category rendering in StellarPress or StoryEditor. May be flat-only in practice.
- **Schedule config drift** — `ad_close_offset_days`, `ed_close_offset_days`, `press_dates_of_month` live on publications but EZSchedule reads from its own form state. If you change the offset on the pub record, does EZSchedule pick it up, or does the user re-enter?
- **Cross-pub content sharing** — `story_publications` (story → pubs within the company) + `cross_published_stories` (story → other StellarPress sites) exist, but the UI for "share this story with our other 3 newspapers" isn't prominent. It exists; discoverability is the gap.
- **Logo / favicon management** — `logo_url` and `favicon_url` are text fields. No upload UI visible in Publications.jsx (might be in SiteSettings). If missing, logos are managed by pasting URLs.

**Missing (✗)**

- **Per-pub P&L report** — revenue (sales + subscriptions + legal notices) vs costs (bills + commissions + freelancer pay + print runs) per publication per period. The single biggest missing reporting surface for a multi-pub publisher.
- **Brand style guide per pub** — beyond colors and fonts: voice guidelines, photography style, section rules. Could live as a rich-text field on publications or a linked doc.
- **Pub comparison dashboard** — "how does Malibu Times compare to Paso Robles Press this quarter?" Side-by-side revenue, editorial throughput, subscription growth.
- **Pub launch / sunset workflow** — adding a new publication is manual (create record, seed categories, generate issues, configure site settings). No guided wizard. Sunsetting is "set dormant=true." No archival of in-flight items.
- **Multi-pub proposal view** — a client advertising across 3 pubs sees 3 separate proposals or one proposal with 3 pub groups. The grouped view exists in the proposal builder, but a "all my ads across your publications" client-facing view isn't present.
- **RSS per pub** — StellarPress has it. MyDash has no "manage RSS settings per pub" surface.
- **Redirect management CRUD** — `redirects` table per pub exists. SiteSettings references it but I need to verify the full add/edit/delete UI is present.

**Decisions we need from you**

1. **Per-pub P&L** — build as a new tab on Analytics (or a new report on Performance)? This is the #1 reporting gap for a multi-pub publisher.
2. **Pub comparison** — side-by-side pub metrics. Build alongside per-pub P&L, or defer?
3. **Category hierarchy** — do you actually use nested categories (e.g. Sports > High School > Football), or is flat sufficient?
4. **Brand style guide** — worth adding a rich-text field to publications for editorial/photography guidelines?
5. **Pub launch wizard** — worth building for the next time you add a publication?

**My recommendations**

- **(1) per-pub P&L is the single most important missing report.** A publisher running 8+ pubs without per-pub profitability is flying blind. Revenue data is already per-pub on sales/invoices; cost data is per-pub on bills. The aggregation is the missing step. YES
- **(3) flat categories are fine.** Unless you're actively using hierarchy for StellarPress navigation, the complexity isn't worth it. YES
- **Defer (2), (4), (5)** — real but not urgent.

---

## 6. Final Tallies

### Stranded schemas (fully modeled, zero UI)
1. `classified_ads` + `classified_rates` — newspaper revenue stream, no workflow
2. `ad_placements` + `web_ad_rates` — web ad serving, no authoring UI
3. `print_runs` + `printers` + `printer_contacts` + `printer_publications` — print cost tracking
4. `distribution_points` — duplicates `drop_locations`
5. `mailing_exports` — superseded by `mailing_lists`
6. `social_posts` — social scheduling, no OAuth / no platform integration
7. `freelancer_payments` — semi-stranded (only in Analytics report sums, no CRUD)
8. `issuu_editions` — deprecated per user confirmation

**Decision needed:** for each, build the UI or archive the tables. This should happen before the site schematic.

### Unwired automation (schema promises, no cron)
1. **Editorial** — `stories.scheduled_at` → should flip `sent_to_web`
2. **Issues** — derived status (On Track / At Risk / etc.) should persist to `issues.status`
3. **Circulation** — `subscribers.first/second/third_notice_sent` → renewal cadence
4. **Billing** — `invoices.first/second/final_reminder_sent` → dunning; `auto_charge_attempts` → payment plan charges
5. **Performance** — `briefing_configs.time_morning` → auto-send morning briefing

**All five can ship in one `scheduled-tasks` edge function enhancement.** This is the single highest-ROI task in the gap analysis.

### Top 5 fixes by impact (my recommendation)
1. **scheduled-tasks mega-deploy** — unblocks 5 domains in one build ✅ SHIPPED (740f3ea)
2. ~~Per-pub P&L report~~ — **ALREADY BUILT** (Analytics > P&L tab). Mis-flagged during analysis.
3. **QB invoice + payment sync** — stops double-entry in accounting — NEXT
4. **Commission clawback on contract cancel** — stops phantom commission payouts ✅ SHIPPED (ca645b0)
5. **Story-performance loop** — Top This Week on EditorialDashboard ✅ SHIPPED (ca645b0)

### Additional shipped fixes
- **sent_to_press_by audit trail** — stamps actual user ✅ (ca645b0)
- **Contract cancel → invoice warning** — confirms before voiding invoiced orders ✅ (ca645b0)

---

## 5. Proposed next steps

1. **You review this list** — call out anything that's wrong, missing, or mis-scoped. I've made judgment calls on gap severity; your business context wins.
2. **Iterate until the lifecycle walks are accurate** — once we agree on the walks + gap list, we have a baseline for the schematic and the help docs.
3. **Gap triage** — pick which gaps to fix, which to document-as-known, which to defer.
4. **Then** write the site schematic (architecture doc for devs) and the how-to / knowledge base (user-facing), both grounded in this map.

What did I get wrong, and what did I miss?
