// invoiceTemplate.js — Generates invoice email HTML
// Sent on invoice creation + Sent to Press trigger + overdue reminders

const fmtCurrency = (n) => "$" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";

const NAVY = "#1A365D";
const RED = "#C53030";
const BLACK = "#111111";
const GRAY = "#6B7280";
const GRAY_LT = "#9CA3AF";
const DIVIDER = "#E5E7EB";
const FAINT = "#F3F4F6";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/**
 * @param {object} params
 * @param {object} params.invoice - { invoiceNumber, issueDate, dueDate, total, balanceDue, status, lines }
 * @param {string} params.clientName
 * @param {number} params.pastDueBalance - any carried-forward balance
 * @param {string} params.reminderLevel - null | 'first' | 'second' | 'final'
 */
export function generateInvoiceHtml({ invoice, clientName, pastDueBalance = 0, reminderLevel = null }) {
  const lines = invoice?.lines || [];
  const isOverdue = reminderLevel !== null;
  const accentColor = isOverdue ? RED : NAVY;

  const reminderText = {
    first: "This is a friendly reminder that your invoice is past due. Please remit payment at your earliest convenience.",
    second: "This is a second notice regarding your outstanding balance. Please contact us if you need to discuss payment arrangements.",
    final: "FINAL NOTICE: Your account is significantly past due. Immediate payment is required to avoid service interruption.",
  };

  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;font-size:0">

  <!-- TOP BAR -->
  <tr><td style="background:${accentColor};height:4px;font-size:0;line-height:0">&nbsp;</td></tr>

  <!-- MASTHEAD -->
  <tr><td style="padding:32px 40px 0;text-align:center">
    <div style="font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal">13 Stars Media Group</div>
    <div style="font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:${GRAY_LT};margin-top:4px">Central Coast & Malibu's Premier News Publications</div>
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
          <div style="font-family:${SANS};font-size:14px;font-weight:bold;color:${BLACK}">${invoice?.invoiceNumber || ""}</div>
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
          <div style="font-family:${SANS};font-size:13px;color:${BLACK};margin-top:2px">${fmtDate(invoice?.issueDate)}</div>
        </td>
        <td style="width:25%;text-align:right">
          <div style="font-family:${SANS};font-size:11px;color:${isOverdue ? RED : GRAY_LT};text-transform:uppercase;font-weight:${isOverdue ? "bold" : "normal"}">${isOverdue ? "PAST DUE" : "Due Date"}</div>
          <div style="font-family:${SANS};font-size:13px;color:${isOverdue ? RED : BLACK};font-weight:${isOverdue ? "bold" : "normal"};margin-top:2px">${fmtDate(invoice?.dueDate)}</div>
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
      ${lines.map(l => `<tr>
        <td style="padding:8px 14px;font-family:${SANS};font-size:13px;color:${BLACK};border-bottom:1px solid ${FAINT}">${l.description || ""}</td>
        <td style="padding:8px 14px;font-family:${SANS};font-size:13px;color:${BLACK};text-align:right;border-bottom:1px solid ${FAINT}">${fmtCurrency(l.amount)}</td>
      </tr>`).join("")}
    </table>
  </td></tr>

  <!-- TOTALS -->
  <tr><td style="padding:0 24px">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${pastDueBalance > 0 ? `<tr>
        <td style="padding:8px 14px;font-family:${SANS};font-size:13px;color:${RED}">Past due balance</td>
        <td style="padding:8px 14px;font-family:${SANS};font-size:13px;color:${RED};text-align:right;font-weight:bold">${fmtCurrency(pastDueBalance)}</td>
      </tr>` : ""}
      <tr>
        <td style="padding:14px;font-family:${SANS};font-size:16px;font-weight:bold;color:${BLACK};border-top:2px solid ${NAVY}">Amount Due</td>
        <td style="padding:14px;font-family:${SANS};font-size:18px;font-weight:bold;color:${isOverdue ? RED : NAVY};text-align:right;border-top:2px solid ${NAVY}">${fmtCurrency((invoice?.balanceDue || invoice?.total || 0) + pastDueBalance)}</td>
      </tr>
    </table>
  </td></tr>

  <!-- PAYMENT INSTRUCTIONS -->
  <tr><td style="padding:24px 40px 0">
    <div style="font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};margin-bottom:8px">Payment options</div>
    <div style="font-family:${SANS};font-size:12px;color:${GRAY};line-height:1.8">
      <strong>Mail check to:</strong> 13 Stars Media Group, P.O. Box 427, Paso Robles, CA 93447<br>
      <strong>Phone:</strong> (805) 237-6060<br>
      <strong>Email:</strong> billing@13stars.media
    </div>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="padding:24px 40px 32px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:1px solid ${DIVIDER};height:1px;font-size:0;line-height:0">&nbsp;</td></tr></table>
    <div style="font-family:${SANS};font-size:12px;color:${GRAY_LT};text-align:center;margin-top:16px">13 Stars Media Group</div>
    <div style="font-family:${SANS};font-size:11px;color:${GRAY_LT};text-align:center;margin-top:2px">805-237-6060 &middot; billing@13stars.media</div>
  </td></tr>

</table>
</td></tr></table>`;
}
