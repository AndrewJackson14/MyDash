---
id: billing-invoices
module: Billing
audience: office-manager
last_verified: 2026-04-19
---

# Invoices — auto-generated vs manual, sending, QuickBooks sync

**Auto-generated invoices** appear in Draft status and need Publisher/Office Manager review before sending:

- **Per-issue billing** — one invoice per sale issue, created at conversion time
- **Monthly billing** — one invoice per month for the contract term
- **Lump-sum billing** — one invoice for the full contract, due net-30 from signing
- **Legal notices** — auto-invoiced when the notice is marked `billed`
- **Rolling magazine window** — auto-generated 30 days ahead of issue date
- **Newspaper monthly bulk** — auto-generated at month-end for all that month's ads

**Manual invoices** — from a client's profile click **Create Invoice**, or from the Billing tab click **+ New Invoice** and add lines manually.

**Sending an invoice:** open the invoice detail, click **Send**. The system emails the client from accounts@13stars.media with a payment link (Stripe-hosted). Status changes Draft → Sent.

**Recording a payment:** from the invoice detail, **Add Payment** and enter method, amount, and reference. Partial payments supported — the invoice stays Sent until the balance hits zero.

**QuickBooks sync:** click **Push to QBO** on an invoice row. The system finds or creates the customer, resolves the income account via the QBO mapping table, and creates the invoice in QBO. Sync errors surface in a red banner — common cause: the account name in MyDash doesn't match QBO.
