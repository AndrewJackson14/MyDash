---
role: office-admin
display_name: Office Administrator
team_role_label: Office Administrator
department: Administration
team_members: [Cami]
reports_to: publisher
last_updated: 2026-04-29
version: 1.0
---

# Office Administrator

## Role Summary

The Office Administrator runs the operational backbone — invoicing, payments, AR collections, subscription management, vendor bills, service desk triage, legal-notice billing, and QuickBooks reconciliation. Cami owns this seat. Cyclical work rhythm (weekly cycles vs. daily counts), so her targets are weekly: % invoices issued within 24h of issue close, A/R follow-ups, subscriptions processed.

## Core Responsibilities

- **Invoice mint + send.** When sales close, invoices materialize per the `billing_schedule` (per-close / per-run / monthly). Cami verifies, sends via Gmail.
- **Payment recording.** Stripe payments auto-record via webhook; ACH / check / cash recorded manually. Apply payment to invoice; flag overpayments to credit balance.
- **A/R aging + collections.** 4-bucket report. Reach out on 30/60/90+ buckets. *Dunning automation is a gap — manual today.*
- **Vendor bills (A/P).** `bills` entries: vendor, amount, date, attach receipts, mark paid.
- **Subscription management.** Add / update subscribers, record subscription_payments, handle renewals (manual today; cron is a gap).
- **Service desk triage.** Inbound `service_tickets` from clients or internal. Assign, comment, resolve.
- **Legal notice billing.** Legal notices auto-link to invoices via mig 154. Cami reconciles when notices publish.
- **QuickBooks sync supervision.** Watch for sync errors; re-auth tokens when they expire; resolve mapping mismatches.
- **Manual quick-log.** When she helps a teammate (e.g., fixes a billing address on Dana's client), QuickLog with the team member tagged. Surfaces in Hayley's stream.

## Daily Workflow

1. **Open dashboard.** Three hero stats: A/R outstanding ($, 4-bucket aging), open tickets, expiring subs (next 30 days). Plus weekly cycle target progress beneath.
2. **Process Stripe payments.** Stripe webhook auto-records into `payments`. Verify each: client, invoice link, amount.
3. **Record manual payments.** Checks / ACH from morning mail or batch deposits. Billing → Invoice → Add Payment.
4. **A/R aging review.** Click into any bucket > 0; reach out to clients (call / email).
5. **Mint invoices.** For closed sales not yet invoiced — Billing → "Needs Invoice" panel surfaces these.
6. **Bills tab.** New vendor bills entered or imported. Mark paid as they clear.
7. **Service Desk** — triage new tickets, assign, comment.
8. **Subscription work.** New subscribers, renewals, cancellations, address updates.
9. **Legal notices** — when a notice publishes, link to its invoice (auto today via mig 154); Cami verifies.
10. **QBO sync check** — Integrations → QBO sync log. Resolve any errors.
11. **Quick-log helps** — when she helps a rep with a client billing issue, QuickLog with team member tagged.
12. **End of day** — verify A/R numbers match Billing reports; check tomorrow's expiring renewals.

## MyDash Modules Used

| Module | Purpose | Permission Level |
|--------|---------|------------------|
| My Dash | Office Admin dashboard with A/R aging + open tickets + expiring subs | Full |
| Calendar | Vendor payment dates, renewal cadences | Full |
| Billing | Primary surface — Invoices / Bills / Payment Plans / Receivables / Reports / Settings | Full |
| Collections | A/R queue with aging color-coding | Full |
| Circulation | Subscriber + subscription management | Full |
| Service Desk | Ticket triage | Full |
| Legal Notices | Legal pipeline + billing-linked notices | Full |
| Tearsheet Center | Sent + pending tearsheets *(currently manual upload)* | Full |

Office Admin's `module_permissions` default per [TeamModule.jsx:63](src/pages/TeamModule.jsx#L63): `dashboard, calendar, billing, circulation, servicedesk, legalnotices`.

## Key Workflows

### Recording a Stripe payment

Auto-flow:

1. Client pays via PayInvoice public page (or rep takes mobile charge).
2. Stripe webhook fires → `stripe-webhook` Edge Function.
3. EF inserts `payments` row + updates `invoices.balance_due` + flips status if fully paid.
4. EF stores `stripe_fee` for accurate margin reporting.

Manual verification:

1. Billing → Receivables → click client → see new payment.
2. Confirm amount, fee captured, invoice link correct.
3. If overpayment: `applied_to_credit=true` flips remainder into `clients.credit_balance`.

### Recording a check / ACH manually

1. Billing → find invoice → "Add Payment".
2. Modal: amount, method (check / ach / cash), reference number / last_four, received date.
3. Save → `payments` row + `invoices.balance_due` decrements + status auto-flips.
4. Emits `payment_received` (outcome) → Hayley's stream.

### Minting an invoice

1. Billing → Invoices tab → "Needs Invoice" panel shows closed sales without invoices yet.
2. Click Mint → modal previews lines pulled from the sale.
3. Adjust as needed (rare); set due_date if not auto-set per `billing_schedule`.
4. Save → `invoices` + `invoice_lines` rows. Status starts at `sent` typically; `draft` if held.
5. Emits `invoice_issued` (outcome) when status is non-draft.

### A/R aging follow-up

1. Receivables tab → 4-bucket aging.
2. Click 30+ bucket → expanded list.
3. Per row: client name, invoice number, days overdue, balance.
4. Action: call client (QuickLog logs the touch), email (Gmail send via the invoice's "Resend" button), or send statement (`send-statement` EF batches all open invoices for that client into one email).
5. *Dunning automation is the BUSINESS_DOMAINS Walk #7 gap; manual today.*

### Subscription renewal (manual)

1. Circulation → Subscribers → filter "Expiring (30 days)".
2. Click subscriber → renewal modal.
3. Modal pre-populates from prior subscription. Adjust tier / amount / date if needed.
4. Send renewal email (Gmail) → `renewalTemplate` formats it.
5. When client pays → record via Stripe webhook or manual entry.
6. Subscription `end_date` rolls forward; `renewed_from` chains to prior.

### Legal notice billing

1. Notice published → `legal_notices.is_published=true`.
2. Auto-trigger (mig 154): mints `invoices` row tied to the notice.
3. Cami verifies: correct rate, correct billing client (publisher of record vs. notice originator), correct due date.
4. Send invoice via Gmail → `email_log` + `activity_log` mirror.

### QBO sync error resolution

1. Integrations → QuickBooks → sync log.
2. Failed rows show `quickbooks_sync_error`.
3. Common fixes:
   - **Token expired** → click Re-auth, re-OAuth flow.
   - **Mapping missing** → `qbo_account_mapping` for the transaction_type doesn't have a target GL account. Add via mapping table.
   - **Customer mismatch** → client's `qb_customer_id` references a customer that was renamed/deleted in QBO. Re-link.

## Decisions This Role Owns

- **Invoice timing** — when to send (per `billing_schedule` defaults; can adjust per-invoice).
- **Payment application** — which invoice gets credited.
- **Overpayment handling** — apply to credit balance vs. refund.
- **Late-fee charges** *(no automation today; manual decision per case).*
- **Subscription tier** for new subscribers (within Hayley-set rate card).
- **Service desk priority + assignment.**
- **Ticket close criteria.**
- **Vendor bill payment timing.**
- **Quick-log entries** for ad-hoc team help.

## Decisions That Require Escalation

- **Credit hold release** for past-due clients before allowing new work → Publisher.
- **Make-good / credit memos** to a client → Publisher (no credit-memo object today; informal).
- **Write-offs** → Publisher.
- **Refund authorizations** beyond standard returns → Publisher.
- **Subscription pricing changes** → Publisher.
- **Vendor / contract terms changes** → Publisher.
- **QBO chart of accounts changes** → Publisher (and outside CPA).

## Handoffs

### To Publisher (Hayley)

- **Past-due alerts on key accounts** → team_notes.
- **Credit hold / make-good escalations.**
- **QBO sync errors** that need outside-CPA input.

### To Sales Reps (Dana, Christie)

- **Past-due flag** on a client before they start new work — manual today via team_notes.
- **Subscription renewals** — handled separately from ad sales but rep should know if a client lapses.

### To Layout Designer (Anthony)

- **Tearsheet workflow trigger** — when issue ships, tearsheet-generation queue should fire (currently manual / gap).

### From Sales Reps

- **Closed sales** → invoices materialize. She mints + sends.
- **Mobile charge** in the field → Stripe payment lands; she reconciles.
- **Billing address corrections** — she fixes; logs via QuickLog.

### From Stripe webhook

- **Auto-recorded payments** — she verifies + reconciles.

### From clients

- **Payment questions, address updates, refund requests** via Service Desk tickets or direct email.

## KPIs & Success Metrics

Weekly cycle (Mon-Sun rolling):

- **Invoices issued within 24h of issue close (%).** Placeholder target 95% (Hayley tunes).
- **A/R follow-ups completed.** Target 10/week.
- **Subscriptions processed.** Target 5/week.

Daily:

- **A/R outstanding ($).** Total open balance. Color: green < $5k, amber $5-15k, red > $15k.
- **Open tickets.** Service desk backlog.
- **Expiring subscribers (30 days).** Renewal pipeline depth.

Other (Performance Review):

- **DSO** — Days Sales Outstanding.
- **Collection rate** — % of invoiced amount collected within 30 days.

## Common Issues & Resolutions

| Issue | Resolution |
|---|---|
| Stripe payment didn't auto-record | Webhook may have missed. Check `stripe-webhook` logs in Supabase. Manually record the payment if needed. |
| QBO sync error: "Customer not found" | Client's `qb_customer_id` references deleted QBO customer. Re-link via Integrations → QBO → Customer matcher. |
| QBO token expired | Integrations → QuickBooks → Re-authorize. Will hit Intuit OAuth flow. |
| Invoice mint button disabled for a closed sale | Probably already invoiced. Check Billing → Invoices for that client. |
| Subscription auto-renew didn't fire | `auto_renew=true` requires Stripe subscription_id active. Check `subscriptions.stripe_subscription_id` and Stripe dashboard. |
| Service desk ticket assigned to wrong person | Edit the ticket → reassign. Comment explains why. |
| Legal notice missing invoice | Check `legal_notices.invoice_id` — auto-link from mig 154 may not have fired. Manually mint via Legal Notices page. |
| A/R aging shows clients I just collected from | Refresh after Stripe webhook fully replicates (~2-3 min). If still wrong, manually verify `payments` rows are linked to the right `invoice_id`. |
| Tearsheet wasn't auto-generated | Currently manual. Generate the PDF outside MyDash and upload via Tearsheet Center. |

## Glossary References

See `_shared/glossary.md` for: Invoice, Payment, Bill, A/R, A/P, DSO, MTD, Subscription, Subscriber, Drop Location, QBO, Stripe, send-statement, applied_to_credit.

See `_shared/workflows.md` for: A/R cycle, subscription renewal cadence, ad lifecycle (steps 17-21).
