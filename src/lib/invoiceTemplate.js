// invoiceTemplate.js — Generates invoice email HTML
// Sent on invoice creation + Sent to Press trigger + overdue reminders

import { fmtCurrency, fmtDateLong as fmtDate } from "./formatters";

const NAVY = "#1A365D";
const RED = "#C53030";
const BLACK = "#111111";
const GRAY = "#6B7280";
const GRAY_LT = "#9CA3AF";
const DIVIDER = "#E5E7EB";
const FAINT = "#F3F4F6";
const GREEN = "#16A34A";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const COMPANY = {
  name: "13 Stars Media Group",
  tagline: "Central Coast & Malibu's Premier News Publications",
  address: "P.O. Box 427, Paso Robles, CA 93447",
  phone: "(805) 237-6060",
  email: "billing@13stars.media",
  website: "13stars.media",
};

/**
 * @param {object} params
 * @param {object} params.invoice - { invoiceNumber, issueDate, dueDate, total, balanceDue, status, lines }
 * @param {string} params.clientName
 * @param {string} params.clientCode - for portal link
 * @param {number} params.pastDueBalance - any carried-forward balance
 * @param {string} params.reminderLevel - null | 'first' | 'second' | 'final'
 * @param {string} params.portalUrl - override portal URL
 * @param {string} params.payUrl - override Stripe pay URL
 */
export function generateInvoiceHtml({ invoice, clientName, clientCode = "", pastDueBalance = 0, reminderLevel = null, config = {}, portalUrl = "", payUrl = "" }) {
  const lines = invoice?.lines || [];
  const isOverdue = reminderLevel !== null;
  const accentColor = isOverdue ? RED : NAVY;

  const portalLink = portalUrl || "https://mydash.media/portal";
  const payLink = payUrl || (invoice?.invoiceNumber ? `https://mydash.media/pay/${invoice.invoiceNumber}` : "");

  const reminderText = {
    first: config?.firstReminderMessage || "This is a friendly reminder that your invoice is past due. Please remit payment at your earliest convenience.",
    second: config?.secondReminderMessage || "This is a second notice regarding your outstanding balance. Please contact us if you need to discuss payment arrangements.",
    final: config?.finalReminderMessage || "FINAL NOTICE: Your account is significantly past due. Immediate payment is required to avoid service interruption.",
  };
  const billingContact = config?.billingContact || COMPANY.email;
  const showPastDue = config?.showPastDueBalance !== false;

  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;font-size:0">

  <!-- TOP BAR -->
  <tr><td style="background:${accentColor};height:4px;font-size:0;line-height:0">&nbsp;</td></tr>

  <!-- MASTHEAD -->
  <tr><td style="padding:32px 40px 0;text-align:center">
    <div style="font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal">${COMPANY.name}</div>
    <div style="font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:${GRAY_LT};margin-top:4px">${COMPANY.tagline}</div>
    <div style="font-family:${SANS};font-size:11px;color:${GRAY};margin-top:8px;line-height:1.6">
      ${COMPANY.address}<br>
      ${COMPANY.phone} &middot; <a href="mailto:${COMPANY.email}" style="color:${NAVY};text-decoration:none">${COMPANY.email}</a>
    </div>
  </td></tr>

  <!-- RED ACCENT RULE -->
  <tr><td style="padding:20px 24px 0"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:1.5px solid ${RED};height:1px;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>

  <!-- INVOICE HEADER -->
  <tr><td style="padding:24px 40px 0">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-family:${SERIF};font-size:22px;color:${NAVY}">${isOverdue ? (reminderLevel === "final" ? "Final Notice" : "Payment Reminder") : "Invoice"}</td>
        <td style="text-align:right">
          <div style="font-family:${SANS};font-size:11px;color:${GRAY_LT};text-transform:uppercase">Invoice #</div>
          <div style="font-family:${SANS};font-size:14px;font-weight:bold;color:${BLACK}">${invoice?.invoiceNumber || "\u2014"}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- CLIENT + DATES -->
  <tr><td style="padding:16px 40px 0">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="width:50%">
          <div style="font-family:${SANS};font-size:11px;color:${GRAY_LT};text-transform:uppercase">Bill To</div>
          <div style="font-family:${SANS};font-size:14px;font-weight:bold;color:${BLACK};margin-top:2px">${clientName}</div>
        </td>
        <td style="width:25%">
          <div style="font-family:${SANS};font-size:11px;color:${GRAY_LT};text-transform:uppercase">Issue Date</div>
          <div style="font-family:${SANS};font-size:13px;color:${BLACK};margin-top:2px">${fmtDate(invoice?.issueDate) || "\u2014"}</div>
        </td>
        <td style="width:25%;text-align:right">
          <div style="font-family:${SANS};font-size:11px;color:${isOverdue ? RED : GRAY_LT};text-transform:uppercase;font-weight:${isOverdue ? "bold" : "normal"}">${isOverdue ? "PAST DUE" : "Due Date"}</div>
          <div style="font-family:${SANS};font-size:13px;color:${isOverdue ? RED : BLACK};font-weight:${isOverdue ? "bold" : "normal"};margin-top:2px">${fmtDate(invoice?.dueDate) || "\u2014"}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- OVERDUE REMINDER -->
  ${isOverdue ? `<tr><td style="padding:16px 40px 0">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:12px 16px;background:${RED}08;border-left:3px solid ${RED}">
      <div style="font-family:${SANS};font-size:13px;color:${RED};line-height:1.6">${reminderText[reminderLevel] || reminderText.first}</div>
    </td></tr></table>
  </td></tr>` : ""}

  <!-- LINE ITEMS -->
  <tr><td style="padding:24px 24px 0">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:8px 14px;font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};border-bottom:1px solid ${DIVIDER}">Description</td>
        <td style="padding:8px 14px;font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};text-align:right;border-bottom:1px solid ${DIVIDER}">Amount</td>
      </tr>
      ${lines.length > 0 ? lines.map(l => `<tr>
        <td style="padding:8px 14px;font-family:${SANS};font-size:13px;color:${BLACK};border-bottom:1px solid ${FAINT}">${l.description || "Ad placement"}</td>
        <td style="padding:8px 14px;font-family:${SANS};font-size:13px;color:${BLACK};text-align:right;border-bottom:1px solid ${FAINT}">${fmtCurrency(l.amount)}</td>
      </tr>`).join("") : `<tr>
        <td style="padding:8px 14px;font-family:${SANS};font-size:13px;color:${BLACK};border-bottom:1px solid ${FAINT}">Advertising</td>
        <td style="padding:8px 14px;font-family:${SANS};font-size:13px;color:${BLACK};text-align:right;border-bottom:1px solid ${FAINT}">${fmtCurrency(invoice?.total || 0)}</td>
      </tr>`}
    </table>
  </td></tr>

  <!-- TOTALS -->
  <tr><td style="padding:0 24px">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${showPastDue && pastDueBalance > 0 ? `<tr>
        <td style="padding:8px 14px;font-family:${SANS};font-size:13px;color:${RED}">Past due balance</td>
        <td style="padding:8px 14px;font-family:${SANS};font-size:13px;color:${RED};text-align:right;font-weight:bold">${fmtCurrency(pastDueBalance)}</td>
      </tr>` : ""}
      <tr>
        <td style="padding:14px;font-family:${SANS};font-size:16px;font-weight:bold;color:${BLACK};border-top:2px solid ${NAVY}">Amount Due</td>
        <td style="padding:14px;font-family:${SANS};font-size:18px;font-weight:bold;color:${isOverdue ? RED : NAVY};text-align:right;border-top:2px solid ${NAVY}">${fmtCurrency((invoice?.balanceDue || invoice?.total || 0) + pastDueBalance)}</td>
      </tr>
    </table>
  </td></tr>

  <!-- PAY NOW BUTTON -->
  ${payLink ? `<tr><td style="padding:24px 40px 0;text-align:center">
    <a href="${payLink}" style="display:inline-block;padding:14px 48px;background:${GREEN};color:#ffffff;font-family:${SANS};font-size:15px;font-weight:bold;text-decoration:none;border-radius:4px">Pay Now</a>
  </td></tr>` : ""}

  <!-- PAYMENT INSTRUCTIONS -->
  <tr><td style="padding:24px 40px 0">
    <div style="font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};margin-bottom:8px">Payment Options</div>
    <div style="font-family:${SANS};font-size:12px;color:${GRAY};line-height:1.8">
      <strong>Mail check to:</strong> ${COMPANY.name}, ${COMPANY.address}<br>
      <strong>Phone:</strong> ${COMPANY.phone}<br>
      <strong>Email:</strong> <a href="mailto:${billingContact}" style="color:${NAVY};text-decoration:none">${billingContact}</a>
    </div>
  </td></tr>

  <!-- CLIENT PORTAL LINK -->
  ${portalLink ? `<tr><td style="padding:20px 40px 0;text-align:center">
    <a href="${portalLink}" style="font-family:${SANS};font-size:12px;color:${NAVY};text-decoration:underline">View your account, contracts & invoices</a>
  </td></tr>` : ""}

  <!-- FOOTER -->
  <tr><td style="padding:24px 40px 32px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:1px solid ${DIVIDER};height:1px;font-size:0;line-height:0">&nbsp;</td></tr></table>
    <div style="font-family:${SANS};font-size:12px;color:${GRAY_LT};text-align:center;margin-top:16px">${COMPANY.name}</div>
    <div style="font-family:${SANS};font-size:11px;color:${GRAY_LT};text-align:center;margin-top:2px">${COMPANY.address}</div>
    <div style="font-family:${SANS};font-size:11px;color:${GRAY_LT};text-align:center;margin-top:2px">${COMPANY.phone} &middot; <a href="mailto:${billingContact}" style="color:${GRAY_LT};text-decoration:none">${billingContact}</a></div>
  </td></tr>

</table>
</td></tr></table>`;
}
