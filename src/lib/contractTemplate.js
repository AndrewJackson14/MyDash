// contractTemplate.js — Generates contract confirmation email HTML
// Sent automatically when client signs proposal via ProposalSign page
// Same editorial design as proposal template (navy bar, Georgia headings)

const fmtCurrency = (n) => "$" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";

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

/**
 * Generate contract confirmation email HTML
 * @param {object} params
 * @param {object} params.proposal - Proposal snapshot (lines, total, payPlan, etc.)
 * @param {object} params.signature - { signerName, signerTitle, signedAt }
 * @param {object} params.salesperson - { name, email, phone }
 * @param {object[]} params.pubs - Publications array
 * @param {object} params.config - Template config (terms, etc.)
 */
export function generateContractHtml({ proposal, signature, salesperson, pubs = [], config = {} }) {
  const lines = proposal?.lines || [];
  const total = proposal?.total || lines.reduce((s, l) => s + (l.price || 0), 0);
  const clientName = proposal?.clientName || "";

  // Detect single vs multi-pub
  const pubIds = [...new Set(lines.map(l => l.pubId || l.publication))];
  const isMultiPub = pubIds.length > 1;

  // Payment schedule
  const payTiming = proposal?.payTiming || "per_issue";

  // Build line items by publication
  const renderLines = () => {
    if (!isMultiPub) {
      return lines.map(l => `<tr>
        <td style="padding:6px 14px;font-family:${SANS};font-size:13px;color:${BLACK};border-bottom:1px solid ${FAINT}">${l.issueLabel || fmtDate(l.issueDate) || ""}</td>
        <td style="padding:6px 14px;font-family:${SANS};font-size:13px;color:${BLACK};text-align:center;border-bottom:1px solid ${FAINT}">${l.adSize || ""}</td>
        <td style="padding:6px 14px;font-family:${SANS};font-size:12px;color:${RED};border-bottom:1px solid ${FAINT}">${l.adDeadline ? fmtDate(l.adDeadline) : ""}</td>
        <td style="padding:6px 14px;font-family:${SANS};font-size:13px;color:${BLACK};text-align:right;border-bottom:1px solid ${FAINT}">${fmtCurrency(l.price)}</td>
      </tr>`).join("");
    }
    return pubIds.map((pubId, idx) => {
      const pub = pubs.find(p => p.id === pubId);
      const pubLines = lines.filter(l => (l.pubId || l.publication) === pubId);
      const pubTotal = pubLines.reduce((s, l) => s + (l.price || 0), 0);
      return `
        ${idx > 0 ? `<tr><td colspan="4" style="padding:0 24px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:1px solid ${FAINT};height:1px;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>` : ""}
        <tr><td colspan="4" style="padding:16px 14px 4px;font-family:${SERIF};font-size:15px;font-weight:bold;color:${BLACK}">${pub?.name || pubId}</td></tr>
        <tr>
          <td style="padding:4px 14px;font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};border-bottom:1px solid ${DIVIDER}">Issue</td>
          <td style="padding:4px 14px;font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};text-align:center;border-bottom:1px solid ${DIVIDER}">Size</td>
          <td style="padding:4px 14px;font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};border-bottom:1px solid ${DIVIDER}">Materials Due</td>
          <td style="padding:4px 14px;font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};text-align:right;border-bottom:1px solid ${DIVIDER}">Rate</td>
        </tr>
        ${pubLines.map(l => `<tr>
          <td style="padding:6px 14px;font-family:${SANS};font-size:13px;color:${BLACK};border-bottom:1px solid ${FAINT}">${l.issueLabel || fmtDate(l.issueDate) || ""}</td>
          <td style="padding:6px 14px;font-family:${SANS};font-size:13px;color:${BLACK};text-align:center;border-bottom:1px solid ${FAINT}">${l.adSize || ""}</td>
          <td style="padding:6px 14px;font-family:${SANS};font-size:12px;color:${RED};border-bottom:1px solid ${FAINT}">${l.adDeadline ? fmtDate(l.adDeadline) : ""}</td>
          <td style="padding:6px 14px;font-family:${SANS};font-size:13px;color:${BLACK};text-align:right;border-bottom:1px solid ${FAINT}">${fmtCurrency(l.price)}</td>
        </tr>`).join("")}
        <tr>
          <td colspan="3" style="padding:8px 14px;border-top:1px solid ${DIVIDER}">&nbsp;</td>
          <td style="padding:8px 14px;font-family:${SANS};font-size:13px;font-weight:bold;color:${BLACK};text-align:right;border-top:1px solid ${DIVIDER}">${fmtCurrency(pubTotal)}</td>
        </tr>
      `;
    }).join("");
  };

  // Payment schedule
  const renderPayment = () => {
    if (payTiming === "lump_sum") {
      return `<tr>
        <td style="padding:8px 14px;font-family:${SANS};font-size:13px;color:${BLACK};border-bottom:1px solid ${FAINT}">Due before first issue</td>
        <td style="padding:8px 14px;font-family:${SANS};font-size:13px;font-weight:bold;color:${BLACK};text-align:right;border-bottom:1px solid ${FAINT}">${fmtCurrency(total)}</td>
      </tr>`;
    }
    if (payTiming === "monthly" && proposal?.termMonths > 1) {
      const monthly = proposal.monthly || Math.round(total / proposal.termMonths);
      return `<tr>
        <td style="padding:8px 14px;font-family:${SANS};font-size:13px;color:${BLACK};border-bottom:1px solid ${FAINT}">${proposal.termMonths} monthly installments</td>
        <td style="padding:8px 14px;font-family:${SANS};font-size:13px;font-weight:bold;color:${BLACK};text-align:right;border-bottom:1px solid ${FAINT}">${fmtCurrency(monthly)}/month</td>
      </tr>`;
    }
    return `<tr>
      <td style="padding:8px 14px;font-family:${SANS};font-size:13px;color:${BLACK};border-bottom:1px solid ${FAINT}">Per issue, due before each publish date</td>
      <td style="padding:8px 14px;font-family:${SANS};font-size:13px;font-weight:bold;color:${BLACK};text-align:right;border-bottom:1px solid ${FAINT}">${fmtCurrency(total)} total</td>
    </tr>`;
  };

  // Terms
  const terms = config?.terms || [
    "Payment is due on or before each issue's publish date.",
    "Cancellation requires 14 days written notice prior to the ad materials deadline.",
    "Ad materials are due 5 business days before the publish date.",
    "Proof approval is required 3 business days before publish.",
    "Rates quoted are locked for the duration of this contract.",
  ];

  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;font-size:0">

  <!-- NAVY TOP BAR -->
  <tr><td style="background:${NAVY};height:4px;font-size:0;line-height:0">&nbsp;</td></tr>

  <!-- MASTHEAD -->
  <tr><td style="padding:32px 40px 0;text-align:center">
    <div style="font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal">13 Stars Media Group</div>
    <div style="font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:${GRAY_LT};margin-top:4px">Central Coast & Malibu's Premier News Publications</div>
  </td></tr>

  <!-- RED ACCENT RULE -->
  <tr><td style="padding:20px 24px 0"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:1.5px solid ${RED};height:1px;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>

  <!-- CONTRACT CONFIRMED -->
  <tr><td style="padding:28px 40px 0;text-align:center">
    <div style="font-family:${SANS};font-size:13px;color:${GRAY}">${config?.confirmationMessage || "Your advertising contract is confirmed"}</div>
    <div style="font-family:${SERIF};font-size:28px;color:${NAVY};margin-top:6px">${clientName}</div>
    <div style="font-family:${SANS};font-size:12px;color:${GRAY_LT};margin-top:4px">${fmtDate(signature?.signedAt?.slice?.(0, 10) || new Date().toISOString().slice(0, 10))}</div>
  </td></tr>

  <!-- CLIENT NOTE (new or returning) -->
  ${config?.newClientNote || config?.returningClientNote ? `<tr><td style="padding:16px 40px 0">
    <div style="font-family:${SANS};font-size:13px;color:${GRAY};line-height:1.6;font-style:italic;text-align:center">${config.newClientNote || config.returningClientNote}</div>
  </td></tr>` : ""}

  <!-- SIGNED BY -->
  <tr><td style="padding:20px 40px 0;text-align:center">
    <table cellpadding="0" cellspacing="0" align="center"><tr>
      <td style="padding:12px 24px;background:${GREEN}10;border:1px solid ${GREEN}30">
        <div style="font-family:${SANS};font-size:13px;color:${GREEN};font-weight:bold">
          &#10003; Signed by ${signature?.signerName || ""}${signature?.signerTitle ? `, ${signature.signerTitle}` : ""} on ${fmtDate(signature?.signedAt?.slice?.(0, 10))}
        </div>
      </td>
    </tr></table>
  </td></tr>

  <!-- SALESPERSON -->
  ${salesperson?.name ? `<tr><td style="padding:16px 40px 0;text-align:center">
    <div style="font-family:${SANS};font-size:12px;color:${GRAY}">Your account representative</div>
    <div style="font-family:${SANS};font-size:13px;font-weight:bold;color:${BLACK};margin-top:2px">${salesperson.name}</div>
    <div style="font-family:${SANS};font-size:12px;color:${GRAY}">${salesperson.email || ""}${salesperson.phone ? ` &middot; ${salesperson.phone}` : ""}</div>
  </td></tr>` : ""}

  <!-- LINE ITEMS -->
  <tr><td style="padding:28px 24px 0">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${!isMultiPub ? `<tr>
        <td style="padding:4px 14px;font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};border-bottom:1px solid ${DIVIDER}">Issue</td>
        <td style="padding:4px 14px;font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};text-align:center;border-bottom:1px solid ${DIVIDER}">Size</td>
        <td style="padding:4px 14px;font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};border-bottom:1px solid ${DIVIDER}">Materials Due</td>
        <td style="padding:4px 14px;font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};text-align:right;border-bottom:1px solid ${DIVIDER}">Rate</td>
      </tr>` : ""}
      ${renderLines()}
    </table>
  </td></tr>

  <!-- CAMPAIGN TOTAL -->
  <tr><td style="padding:0 24px">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:14px;font-family:${SANS};font-size:16px;font-weight:bold;color:${BLACK};border-top:2px solid ${NAVY}">${isMultiPub ? "Campaign total" : "Total"}</td>
        <td style="padding:14px;font-family:${SANS};font-size:16px;font-weight:bold;color:${BLACK};text-align:right;border-top:2px solid ${NAVY}">${fmtCurrency(total)}</td>
      </tr>
    </table>
  </td></tr>

  <!-- PAYMENT TERMS -->
  <tr><td style="padding:24px 24px 0">
    <div style="font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};margin-bottom:8px">Payment schedule</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${renderPayment()}
    </table>
  </td></tr>

  <!-- TERMS -->
  <tr><td style="padding:28px 40px 0">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:1px solid ${DIVIDER};height:1px;font-size:0;line-height:0">&nbsp;</td></tr></table>
    <div style="font-family:${SANS};font-size:10px;color:${GRAY_LT};line-height:1.8;margin-top:16px">
      ${terms.map(t => `&bull; ${t}`).join("<br>")}
    </div>
  </td></tr>

  <!-- LEGAL DISCLAIMER -->
  ${config?.legalDisclaimer ? `<tr><td style="padding:12px 40px 0">
    <div style="font-family:${SANS};font-size:10px;color:${GRAY_LT};line-height:1.8">${config.legalDisclaimer}</div>
  </td></tr>` : ""}

  <!-- SAVE FOR RECORDS -->
  <tr><td style="padding:24px 40px 0;text-align:center">
    <div style="font-family:${SANS};font-size:12px;color:${GRAY};font-style:italic">Please save this email for your records.</div>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="padding:24px 40px 32px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:1px solid ${DIVIDER};height:1px;font-size:0;line-height:0">&nbsp;</td></tr></table>
    <div style="font-family:${SANS};font-size:12px;color:${GRAY_LT};text-align:center;margin-top:16px">13 Stars Media Group</div>
    <div style="font-family:${SANS};font-size:11px;color:${GRAY_LT};text-align:center;margin-top:2px">805-237-6060 &middot; PasoRoblesPress.com &middot; AtascaderoNews.com</div>
  </td></tr>

</table>
</td></tr></table>`;
}
