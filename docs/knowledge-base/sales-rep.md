---
role: sales-rep
display_name: Sales Representative
team_role_label: Salesperson
department: Sales
team_members: [Dana McGraw, Christie Coyes]
reports_to: publisher
last_updated: 2026-04-29
version: 1.0
---

# Sales Representative

## Role Summary

The Sales Rep owns the revenue side of MyDash — capturing leads, qualifying, building proposals, signing contracts, and managing client relationships through the full lifecycle. Dana McGraw and Christie Coyes split the seat across publications. Reps work jurisdiction-scoped (`assigned_pubs`) so they only see their own clients and pipeline. Daily cadence: phone calls, emails, meetings, proposals, and renewals — all measurable against placeholder targets Hayley tunes via the Activity Targets admin.

## Core Responsibilities

- **Lead capture + qualification.** From `ad_inquiries` (web form), walk-ins, referrals, prospecting. Confirm fit, assign rep, promote to client.
- **Client management.** `clients` records — billing info, contacts, industries, interested pubs, primary rep. Multi-contact via `client_contacts`.
- **Pipeline management.** Stages: Discovery → Presentation → Proposal → Negotiation → Closed → Follow-up. Lost is a fork.
- **Proposal building.** Multi-pub, multi-issue bundles. Auto-tier from term length (1× / 6× / 12×). Pay plans (lump sum / monthly).
- **Proposal sending + e-sign.** Public ProposalSign page captures signature, IP, UA. Client signs → automatic conversion path.
- **Contract conversion.** `convert_proposal_to_contract` mints contract + per-issue sales + ad_projects in one RPC.
- **Brief intake.** After conversion, fill brief on the auto-created ad project (headline, style, colors, instructions).
- **Salesperson signoff** on proofs after client approval.
- **Communications log.** Calls, emails, meetings logged via QuickLog or inline buttons.
- **Renewal outreach.** Clients with `contract_end_date` within 30 days surface in the Renewals tab.
- **Outreach campaigns.** Win-back lists with `outreach_campaigns` + `outreach_entries`.
- **Mobile in-the-field.** PWA on phones — call/email/charge/log/nav from a client card.

## Daily Workflow

1. **Open dashboard.** Headline metrics: pipeline value, MTD closed, today's actions count.
2. **Today's actions** — clients with `nextActionDate <= today`. Process oldest first.
3. **For each action** — call / email / meeting via QuickLog (⌘L) or the kanban card's inline 📞 / ✉️ buttons. Effort logs to `client.comms` + `activity_log`.
4. **Pipeline kanban / list view.** Move stages as deals progress. Each move → activity_log `deal_advanced` or `deal_closed`.
5. **Build proposals** for new opportunities. Open ProposalWizard from the client / sale → pick pubs / issues / sizes / dates → send.
6. **Renewals tab** — clients near contract end. Pre-populate renewal proposals from prior closed sales.
7. **Sign-off proofs** — Design Studio shows projects awaiting salesperson signoff after Jen's signoff. Confirm client approval, click signoff.
8. **Lead inbox** — new `ad_inquiries` from the web form. Confirm match against existing client OR promote to new client. Assign rep.
9. **Outreach** — outbound win-back / cold list. Log every contact via campaign entries.
10. **Commission view** — see commission ledger updating as deals close + invoices get paid.

## MyDash Modules Used

| Module | Purpose | Permission Level |
|--------|---------|------------------|
| My Dash | Sales dashboard with pipeline + today's actions + targets | Full |
| Calendar | Meeting scheduling, client appointments | Full |
| Sales | Primary surface — clients, pipeline, proposals, contracts, outreach, signals, commissions | Full |
| Contracts | Active contracts list + renewal status | Full |
| Billing | Read-only — see invoice status for own clients | Full |
| Flatplan | Read-only — see where her ads land in issues | Read |
| Design Studio (Ad Projects) | See projects per closed sale; brief intake; client proof links; salesperson signoff | Full |

Sales Rep's `module_permissions` default per [TeamModule.jsx:54](src/pages/TeamModule.jsx#L54): `dashboard, calendar, sales, contracts, billing, flatplan, adprojects`.

**Jurisdiction:** `assigned_pubs` array scopes everything. Dana sees Paso Robles Press / Atascadero News / etc. assigned to her; Christie sees hers. Cross-pub bundles still work in proposals (jurisdiction is a filter, not a wall).

## Key Workflows

### New opportunity

1. Click "+ Opportunity" on dashboard or pipeline.
2. Modal: client (autocomplete or new), publication, source, contact, notes, next action + date.
3. If new client → creates `clients` row.
4. Creates `sales` row at `Discovery`.
5. Emits `opportunity_created` event (transition).

### Building a proposal

1. From client profile or pipeline card → "+ Proposal".
2. ProposalWizard opens (7 steps: client / publications / issues / sizes & flights / payment / brief / review).
3. Pick pubs (jurisdiction-scoped to her assigned pubs).
4. Pick issues per pub.
5. Pick ad sizes per pub. Auto-tier (1× / 6× / 12×) suggested from term length.
6. Set pay plan: lump sum or monthly with charge_day.
7. Brief: art source (we_design / camera_ready), creative direction.
8. Review + send. Stamps `sent_at`, populates `sent_to[]`, emits `proposal_sent` (outcome).

See `_shared/workflows.md#ad-lifecycle` for the full flow from here.

### Converting a signed proposal

1. Client signs via public ProposalSign page → `proposal_signatures` row written.
2. Pipeline card flips to "Signed — convert?" prompt.
3. Click Convert → fires `convert_proposal_to_contract` RPC.
4. RPC mints contract + lines + per-issue sales rows + ad_projects (one per ad-design line) + message threads.
5. Emits `contract_signed` (outcome) — Hayley sees in her stream.

### Logging a call

Two paths:

- **QuickLog (⌘L)** — opens floating modal. Pick client, outcome (connected/voicemail/no answer/not interested/interested), notes. Writes `phone_call_logged` (effort).
- **Inline 📞 button** on the kanban card — quick prompt for note. Same `phone_call_logged` event + writes to `client.comms` for the per-client timeline.

### Renewal flow

1. Renewals tab in Sales CRM — sorted by urgency (`contract_end_date` ascending).
2. Click client → "Renewal proposal".
3. Pre-populated from prior closed sales' lines. Adjust as needed.
4. Send — same flow as a new proposal.

### Outreach campaign

1. Sales CRM → Outreach tab.
2. Create campaign (e.g., "Q2 Lapsed Reactivation").
3. Add entries (clients to contact).
4. Per entry: contacted_via, meeting_date, won_back_at, won_back_amount.
5. Track campaign performance over time.

### Mobile in-the-field

PWA at `/mobile`. Client list, pipeline, capture (calls / proposals on the road).

- **Charge card** — Stripe Elements with iOS card-scan support. Apply payment to existing invoice or contract via picker.
- **Log call/email** — same QuickLog flow.
- **Edit client basics** — pencil on client header opens edit modal.

## Decisions This Role Owns

- **Pipeline stage moves** — Discovery → Presentation → Proposal → etc.
- **Proposal pricing within rate-card.** Auto-tier suggested; rep can adjust.
- **Ad size + dimensions** in proposal building.
- **Pay plan** — lump sum or monthly + charge day.
- **Brief content.** Headline, style, colors, instructions for Jen.
- **Salesperson signoff** on proofs.
- **Lost reason** when a deal dies (required dropdown: Budget cut / Chose competitor / Timing / etc.).
- **Communications log** — every touch.
- **Outreach campaign membership.**
- **Renewal proposal terms.**

## Decisions That Require Escalation

- **Off-rate-card pricing.** Discounts beyond auto-tier → Publisher.
- **Multi-pub bundle pricing** outside standard tiers → Publisher.
- **Credit hold or terms** for past-due clients → Office Admin / Publisher.
- **Client reassignment** to another rep → Sales Manager / Publisher (uses Transfer Open Work in TeamMemberProfile).
- **Make-good** decisions on bad-run ads → Publisher.

## Handoffs

### To Ad Designer (Jen)

- **Sale closed → ad project auto-created** with brief fields. She picks up.
- **Brief edits** through the project's chat thread.

### To Office Admin (Cami)

- **Sale closed → invoice mint** (per `billing_schedule`).
- **Payment received in the field (mobile charge)** → posts to `payments` immediately; Cami reconciles to QBO.

### To Publisher (Hayley)

- **Off-rate-card or escalation requests** via team_notes or in-person.
- **Major-account renewals at risk** — Publisher relationship play.

### From Office Admin (Cami)

- **Past-due client flag** before she starts new work.

### From Ad Designer (Jen)

- **Proof ready for client review** — `proof_sent` status surfaces the client link to send.

### From inbound

- **`ad_inquiries`** from web forms. Triage in Booking Queue.
- **Client phone calls / walk-ins / referrals** — log via QuickLog as a `phone_call_logged` or `manual_log` entry.

## KPIs & Success Metrics

Surfaced on her dashboard with target progress:

- **Phone calls / day** — placeholder target 15 (Hayley tunes).
- **Emails sent / day** — target 20.
- **Meetings held / day** — target 2.
- **Proposals sent / day** — target 1.
- **Pipeline value added / day** — placeholder $1,500 in proposal value.

Other (no daily target, surfaced via Performance):

- **Close rate** — Closed sales / total sales over period.
- **Avg deal size.**
- **Pipeline value** — sum of open sales.
- **Renewal rate** — renewal-stage clients that re-sign.
- **Commission earned** — `commission_ledger` rolled up.

## Common Issues & Resolutions

| Issue | Resolution |
|---|---|
| "Client not found" on mobile charge | Refresh app — local cache may have a stale client.id. EF returns the prefix in the error if the issue persists. |
| Proposal won't send | Required field missing (typically email recipient or pay plan). Check the wizard's Send Validate panel. |
| Convert button disabled on a Signed proposal | Network race — refresh the page; signed status may not have replicated. |
| Pipeline card shows wrong publication | `sale.publication_id` mismatch — edit the sale directly. |
| Auto-tier didn't pick the rate I expected | Term months may not match the tier breakpoint. Adjust `term_months` or override the line price manually. |
| Renewal proposal is empty | No prior `Closed` sales for this client OR they were attributed to a different rep. Build manually. |
| Email send rejected | Gmail throttle. Wait or use a different sender; for high volume, swap to SES via Newsletter (sales emails go via Gmail today). |
| Inquiry won't auto-match a client | Email exact-match against `client_contacts` only — domain match is intentionally off (false-positive risk too high). Add the contact email to the client manually. |

## Glossary References

See `_shared/glossary.md` for: Sale, Proposal, Contract, Ad Project, contract_signed, proposal_sent, ProposalSign, ProofApproval, jurisdiction, A/R.

See `_shared/workflows.md` for: ad lifecycle, A/R cycle.
