// proposalTemplate.js — Generates branded proposal HTML from template config + proposal data
// Used by: sendProposalEmail (SalesCRM), ProposalSign page, PDF export

import { fmtCurrencyWhole as fmtCurrency, fmtDate } from "./formatters";

const PUB_COLORS = {
  PRP: "#1B3A5C", AN: "#2C5F2D", MT: "#0077B6", MBL: "#8B5E3C",
  default: "#111318",
};

// Default template config
export const DEFAULT_PROPOSAL_CONFIG = {
  // Header
  showSalespersonContact: true,
  showClientContact: true,
  // Intro
  defaultIntro: "Thank you for the opportunity to present this advertising proposal. We look forward to helping your business reach our readers across the Central Coast.",
  // Table
  groupByPublication: true,
  showSubtotals: true,
  showIssueDates: true,
  showAdSize: true,
  showIndividualRates: true,
  // Payment
  paymentTiming: "per_issue", // per_issue | monthly | lump_sum
  groupPaymentsByDate: true,
  // Closing
  signButtonText: "Accept This Proposal",
  validityDays: 30,
  // Terms
  terms: [
    "Payment is due on or before each issue's publish date listed above.",
    "Cancellation requires 14 days written notice prior to the ad materials deadline.",
    "Ad materials are due 5 business days before the publish date.",
    "Proof approval is required 3 business days before publish. No response within that period constitutes approval.",
    "Rates quoted in this proposal are valid for 30 days from the proposal date.",
  ],
};

/**
 * Generate proposal HTML
 * @param {object} params
 * @param {object} params.config - Template config (from email_templates.config)
 * @param {object} params.proposal - Proposal data (lines, total, payPlan, etc.)
 * @param {object} params.client - Client object (name, contacts)
 * @param {object} params.salesperson - Team member object
 * @param {object[]} params.pubs - Publications array
 * @param {string} params.introText - Custom intro (overrides config default)
 * @param {string} params.signLink - URL for sign button
 * @param {boolean} params.forPdf - Render for PDF (no interactive elements)
 */
export function generateProposalHtml({
  config = {}, proposal, client, salesperson, pubs = [],
  introText, signLink, forPdf = false,
}) {
  const cfg = { ...DEFAULT_PROPOSAL_CONFIG, ...config };
  const lines = proposal.lines || [];
  const total = proposal.total || lines.reduce((s, l) => s + (l.price || 0), 0);

  // Detect single vs multi-pub
  const pubIds = [...new Set(lines.map(l => l.pubId || l.publication))];
  const isMultiPub = pubIds.length > 1;
  const primaryPub = pubs.find(p => p.id === pubIds[0]);

  // Client info
  const clientName = client?.name || proposal.clientName || "";
  const clientContact = client?.contacts?.[0] || {};

  // Design tokens — stately editorial palette
  const NAVY = "#1A365D";
  const RED = "#C53030";
  const BLACK = "#111111";
  const GRAY = "#6B7280";
  const GRAY_LT = "#9CA3AF";
  const DIVIDER = "#E5E7EB";
  const FAINT = "#F3F4F6";
  const SERIF = "Georgia, 'Times New Roman', serif";
  const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

  // Payment schedule
  const payments = buildPaymentSchedule(lines, cfg, pubs);

  // Build HTML — email-safe table layout, all inline styles, no classes
  // Stately editorial design: serif headings, generous whitespace, navy + red accents

  // Column count for colspan calculations
  const colCount = (cfg.showIssueDates ? 1 : 0) + (cfg.showAdSize ? 1 : 0) + 1 + (cfg.showIndividualRates ? 1 : 0);

  // Render a single line item row
  const renderLine = (l) => `<tr>
    ${cfg.showIssueDates ? `<td style="padding:6px 14px;font-family:${SANS};font-size:13px;color:${BLACK};border-bottom:1px solid ${FAINT}">${l.issueLabel || fmtDate(l.issueDate) || ""}</td>` : ""}
    ${cfg.showAdSize ? `<td style="padding:6px 14px;font-family:${SANS};font-size:13px;color:${BLACK};text-align:center;border-bottom:1px solid ${FAINT}">${l.adSize || ""}</td>` : ""}
    <td style="padding:6px 14px;font-family:${SANS};font-size:12px;color:${RED};border-bottom:1px solid ${FAINT}">${l.adDeadline ? fmtDate(l.adDeadline) : ""}</td>
    ${cfg.showIndividualRates ? `<td style="padding:6px 14px;font-family:${SANS};font-size:13px;color:${BLACK};text-align:right;border-bottom:1px solid ${FAINT}">${fmtCurrency(l.price)}</td>` : ""}
  </tr>`;

  // Render publication section
  const renderPubSection = (pubId, idx) => {
    const pub = pubs.find(p => p.id === pubId);
    const pubLines = lines.filter(l => (l.pubId || l.publication) === pubId);
    const pubTotal = pubLines.reduce((s, l) => s + (l.price || 0), 0);
    return `
      ${idx > 0 ? `<tr><td colspan="${colCount}" style="padding:0 24px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:1px solid ${FAINT};height:1px;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>` : ""}
      <tr><td colspan="${colCount}" style="padding:16px 14px 4px;font-family:${SERIF};font-size:15px;font-weight:bold;color:${BLACK}">${pub?.name || pubId}</td></tr>
      <tr>
        ${cfg.showIssueDates ? `<td style="padding:4px 14px;font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};border-bottom:1px solid ${DIVIDER}">Issue</td>` : ""}
        ${cfg.showAdSize ? `<td style="padding:4px 14px;font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};text-align:center;border-bottom:1px solid ${DIVIDER}">Size</td>` : ""}
        <td style="padding:4px 14px;font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};border-bottom:1px solid ${DIVIDER}">Materials Due</td>
        ${cfg.showIndividualRates ? `<td style="padding:4px 14px;font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};text-align:right;border-bottom:1px solid ${DIVIDER}">Rate</td>` : ""}
      </tr>
      ${pubLines.map(renderLine).join("")}
      ${cfg.showSubtotals ? `<tr>
        <td colspan="${colCount - 1}" style="padding:8px 14px;border-top:1px solid ${DIVIDER}">&nbsp;</td>
        <td style="padding:8px 14px;font-family:${SANS};font-size:13px;font-weight:bold;color:${BLACK};text-align:right;border-top:1px solid ${DIVIDER}">${fmtCurrency(pubTotal)}</td>
      </tr>` : ""}
    `;
  };

  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;font-size:0">

  <!-- NAVY TOP BAR -->
  <tr><td style="background:${NAVY};height:4px;font-size:0;line-height:0">&nbsp;</td></tr>

  <!-- MASTHEAD -->
  <tr><td style="padding:32px 40px 0;text-align:center">
    <div style="font-family:${SERIF};font-size:24px;color:${NAVY};font-weight:normal">13 Stars Media Group</div>
    <div style="font-family:${SANS};font-size:13px;color:${GRAY};margin-top:6px">Advertising proposal for ${clientName}</div>
    <div style="font-family:${SANS};font-size:11px;color:${GRAY_LT};margin-top:2px">Prepared ${fmtDate(proposal.date || new Date().toISOString().slice(0, 10))}</div>
  </td></tr>

  <!-- RED ACCENT RULE -->
  <tr><td style="padding:20px 24px 0"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:1.5px solid ${RED};height:1px;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>

  <!-- INTRO -->
  <tr><td style="padding:24px 40px 0">
    <div style="font-family:${SANS};font-size:14px;line-height:1.7;color:#333333;white-space:pre-line">${introText || cfg.defaultIntro}</div>
  </td></tr>

  <!-- LINE ITEMS -->
  <tr><td style="padding:28px 24px 0">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${cfg.groupByPublication ? pubIds.map((pubId, i) => renderPubSection(pubId, i)).join("") : `
        <tr>
          ${cfg.showIssueDates ? `<td style="padding:4px 14px;font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};border-bottom:1px solid ${DIVIDER}">Issue</td>` : ""}
          ${cfg.showAdSize ? `<td style="padding:4px 14px;font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};text-align:center;border-bottom:1px solid ${DIVIDER}">Size</td>` : ""}
          <td style="padding:4px 14px;font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};border-bottom:1px solid ${DIVIDER}">Materials Due</td>
          ${cfg.showIndividualRates ? `<td style="padding:4px 14px;font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};text-align:right;border-bottom:1px solid ${DIVIDER}">Rate</td>` : ""}
        </tr>
        ${lines.map(renderLine).join("")}
      `}
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

  <!-- PAYMENT SCHEDULE -->
  ${payments.length > 0 ? `
  <tr><td style="padding:28px 24px 0">
    <div style="font-family:${SANS};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${GRAY_LT};margin-bottom:10px">Payment schedule</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${payments.map((p, i) => `
        <tr>
          <td style="padding:8px 14px;font-family:${SANS};font-size:13px;color:${BLACK};border-bottom:1px solid ${FAINT}">Due by ${fmtDate(p.date)}</td>
          <td style="padding:8px 14px;font-family:${SANS};font-size:13px;font-weight:bold;color:${BLACK};text-align:right;border-bottom:1px solid ${FAINT}">${fmtCurrency(p.amount)}</td>
        </tr>
        <tr><td colspan="2" style="padding:0 14px 8px;font-family:${SANS};font-size:11px;color:${GRAY_LT};border-bottom:${i < payments.length - 1 ? "1px solid " + FAINT : "none"}">${p.description}</td></tr>
      `).join("")}
    </table>
  </td></tr>
  ` : ""}

  <!-- SIGN BUTTON -->
  ${!forPdf && signLink ? `
  <tr><td style="padding:36px 40px;text-align:center">
    <table cellpadding="0" cellspacing="0" align="center"><tr>
      <td style="background:${NAVY};padding:14px 48px">
        <a href="${signLink}" style="font-family:${SANS};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;letter-spacing:0.3px">${cfg.signButtonText}</a>
      </td>
    </tr></table>
    <div style="font-family:${SANS};font-size:11px;color:${GRAY_LT};margin-top:10px">This proposal is valid for ${cfg.validityDays} days</div>
  </td></tr>
  ` : forPdf ? `
  <tr><td style="padding:36px 40px;text-align:center">
    <div style="font-family:${SANS};font-size:13px;font-weight:bold;color:${BLACK}">Signature</div>
    <div style="margin-top:24px;border-bottom:1px solid ${BLACK};width:60%;display:inline-block">&nbsp;</div>
    <div style="font-family:${SANS};font-size:11px;color:${GRAY_LT};margin-top:8px">Date: _______________</div>
  </td></tr>
  ` : ""}

  <!-- TERMS -->
  ${cfg.terms && cfg.terms.length > 0 ? `
  <tr><td style="padding:0 40px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:1px solid ${DIVIDER};height:1px;font-size:0;line-height:0">&nbsp;</td></tr></table>
    <div style="font-family:${SANS};font-size:10px;color:${GRAY_LT};line-height:1.8;margin-top:16px">
      ${cfg.terms.map(t => `&bull; ${t.replace("{{validity_days}}", String(cfg.validityDays))}`).join("<br>")}
    </div>
  </td></tr>
  ` : ""}

  <!-- FOOTER -->
  <tr><td style="padding:24px 40px 32px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:1px solid ${DIVIDER};height:1px;font-size:0;line-height:0">&nbsp;</td></tr></table>
    <div style="font-family:${SANS};font-size:12px;color:${GRAY_LT};text-align:center;margin-top:16px">13 Stars Media Group</div>
    <div style="font-family:${SANS};font-size:11px;color:${GRAY_LT};text-align:center;margin-top:2px">805-237-6060 &middot; PasoRoblesPress.com &middot; AtascaderoNews.com</div>
  </td></tr>

</table>
</td></tr></table>`;
}

/**
 * Build payment schedule from line items
 * Per-issue: groups weekly newspapers into calendar month totals
 * Monthly: equal installments across the campaign duration
 * Lump sum: single payment due before first issue
 */
function buildPaymentSchedule(lines, cfg, pubs) {
  const total = lines.reduce((s, l) => s + (l.price || 0), 0);
  const sortedLines = [...lines].filter(l => l.issueDate).sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  if (sortedLines.length === 0) return [];

  const firstDate = sortedLines[0].issueDate;

  // ── Lump Sum: single payment before first issue ──
  if (cfg.paymentTiming === "lump_sum") {
    return [{
      date: firstDate,
      amount: total,
      description: "Full payment due before first issue",
    }];
  }

  // ── Monthly: equal installments on the 1st of each month ──
  if (cfg.paymentTiming === "monthly") {
    const months = {};
    sortedLines.forEach(l => {
      const m = l.issueDate.slice(0, 7); // YYYY-MM
      if (!months[m]) months[m] = { amount: 0, parts: [] };
      months[m].amount += (l.price || 0);
      months[m].parts.push(pubs.find(p => p.id === (l.pubId || l.publication))?.name || "");
    });
    const monthKeys = Object.keys(months).sort();
    const monthlyAmount = Math.round(total / monthKeys.length);
    return monthKeys.map((m, i) => ({
      date: m + "-01",
      amount: i === monthKeys.length - 1 ? total - (monthlyAmount * (monthKeys.length - 1)) : monthlyAmount,
      description: `Installment ${i + 1} of ${monthKeys.length}`,
    }));
  }

  // ── Per Issue (default): group into calendar months ──
  // Weekly newspapers get combined into one monthly payment
  // Magazines keep their individual payment (one per issue)
  const monthPayments = {};
  sortedLines.forEach(l => {
    const pub = pubs.find(p => p.id === (l.pubId || l.publication));
    const isWeekly = pub && (pub.frequency === "Weekly" || pub.frequency === "Bi-Weekly");
    const pubName = pub?.name || "";

    if (isWeekly) {
      // Group by calendar month
      const monthKey = l.issueDate.slice(0, 7);
      const payKey = `month-${monthKey}`;
      if (!monthPayments[payKey]) monthPayments[payKey] = { date: monthKey + "-01", amount: 0, parts: [], sortDate: monthKey + "-01" };
      monthPayments[payKey].amount += (l.price || 0);
      if (!monthPayments[payKey].parts.includes(pubName)) monthPayments[payKey].parts.push(pubName);
    } else {
      // Individual payment per issue (magazines, special pubs)
      const payKey = `issue-${l.issueId || l.issueDate}`;
      if (!monthPayments[payKey]) monthPayments[payKey] = { date: l.issueDate, amount: 0, parts: [], sortDate: l.issueDate };
      monthPayments[payKey].amount += (l.price || 0);
      monthPayments[payKey].parts.push(`${pubName} ${l.issueLabel || ""}`);
    }
  });

  // Combine same-month weekly and magazine payments if they fall in the same month
  if (cfg.groupPaymentsByDate) {
    const byMonth = {};
    Object.values(monthPayments).forEach(p => {
      const m = p.date.slice(0, 7);
      if (!byMonth[m]) byMonth[m] = { date: p.date, amount: 0, parts: [], sortDate: p.sortDate };
      byMonth[m].amount += p.amount;
      byMonth[m].parts.push(...p.parts);
      if (p.sortDate < byMonth[m].sortDate) byMonth[m].sortDate = p.sortDate;
    });
    return Object.values(byMonth)
      .sort((a, b) => a.sortDate.localeCompare(b.sortDate))
      .map(p => ({
        date: p.date,
        amount: p.amount,
        description: [...new Set(p.parts)].join(", "),
      }));
  }

  return Object.values(monthPayments)
    .sort((a, b) => a.sortDate.localeCompare(b.sortDate))
    .map(p => ({
      date: p.date,
      amount: p.amount,
      description: [...new Set(p.parts)].join(", "),
    }));
}
