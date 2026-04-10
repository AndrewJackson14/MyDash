// proposalTemplate.js — Generates branded proposal HTML from template config + proposal data
// Used by: sendProposalEmail (SalesCRM), ProposalSign page, PDF export

const PUB_COLORS = {
  PRP: "#1B3A5C", AN: "#2C5F2D", MT: "#0077B6", MBL: "#8B5E3C",
  default: "#111318",
};

const fmtCurrency = (n) => "$" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

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
  const brandColor = isMultiPub ? PUB_COLORS.default : (PUB_COLORS[pubIds[0]] || PUB_COLORS.default);
  const brandName = isMultiPub ? "13 Stars Media Group" : (primaryPub?.name || "13 Stars Media Group");

  // Client info
  const clientName = client?.name || proposal.clientName || "";
  const clientContact = client?.contacts?.[0] || {};

  // Payment schedule
  const payments = buildPaymentSchedule(lines, cfg, pubs);

  // Build HTML
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a2e; margin: 0; padding: 0; }
  table { border-collapse: collapse; width: 100%; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; color: #666; font-weight: 700; padding: 10px 14px; }
  td { padding: 8px 14px; font-size: 13px; border-bottom: 1px solid #eee; }
  .pub-header td { background: #f5f5f5; font-weight: 700; font-size: 12px; text-transform: uppercase; color: ${brandColor}; border-bottom: 2px solid ${brandColor}20; }
  .subtotal td { font-weight: 700; border-top: 1px solid #ddd; }
  .grand-total td { font-weight: 800; font-size: 16px; border-top: 2px solid ${brandColor}; }
</style></head><body>
<div style="max-width: 680px; margin: 0 auto; padding: 32px 24px;">

  <!-- HEADER -->
  <div style="border-bottom: 3px solid ${brandColor}; padding-bottom: 20px; margin-bottom: 24px;">
    <div style="display: flex; justify-content: space-between;">
      <div>
        <div style="font-size: 22px; font-weight: 900; color: ${brandColor};">${brandName}</div>
        <div style="font-size: 11px; color: #666; margin-top: 4px;">P.O. Box 427, Paso Robles, CA 93447</div>
        <div style="font-size: 11px; color: #666;">(805) 237-6060 &middot; info@13stars.media</div>
      </div>
      <div style="text-align: right;">
        ${cfg.showSalespersonContact && salesperson ? `
          <div style="font-size: 12px; font-weight: 700; color: #1a1a2e;">${salesperson.name || ""}</div>
          <div style="font-size: 11px; color: #666;">${salesperson.email || ""}</div>
          ${salesperson.phone ? `<div style="font-size: 11px; color: #666;">${salesperson.phone}</div>` : ""}
        ` : ""}
      </div>
    </div>
  </div>

  <!-- TITLE + CLIENT -->
  <div style="margin-bottom: 24px;">
    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 4px;">
      ${isMultiPub ? "Multi-Publication Advertising Proposal" : "Advertising Proposal"}
    </div>
    <div style="font-size: 12px; color: #666;">${fmtDate(proposal.date || new Date().toISOString().slice(0, 10))}</div>
    ${cfg.showClientContact ? `
      <div style="margin-top: 12px; padding: 12px 16px; background: #f9fafb; border-radius: 6px;">
        <div style="font-size: 11px; text-transform: uppercase; color: #999; letter-spacing: 0.5px; margin-bottom: 4px;">Prepared For</div>
        <div style="font-size: 14px; font-weight: 700; color: #1a1a2e;">${clientName}</div>
        ${clientContact.name ? `<div style="font-size: 12px; color: #666;">${clientContact.name}</div>` : ""}
        ${clientContact.email ? `<div style="font-size: 12px; color: #666;">${clientContact.email}</div>` : ""}
      </div>
    ` : ""}
  </div>

  <!-- INTRO -->
  <div style="font-size: 14px; line-height: 1.7; color: #333; margin-bottom: 28px; white-space: pre-line;">${introText || cfg.defaultIntro}</div>

  <!-- LINE ITEMS TABLE -->
  ${(() => {
    const colCount = (cfg.showIssueDates ? 1 : 0) + (cfg.showAdSize ? 1 : 0) + 1 + (cfg.showIndividualRates ? 1 : 0); // +1 for ad deadline
    const renderLine = (l) => `<tr>
      ${cfg.showIssueDates ? `<td>${l.issueLabel || fmtDate(l.issueDate) || ""}</td>` : ""}
      ${cfg.showAdSize ? `<td>${l.adSize || ""}</td>` : ""}
      <td style="color: #c53030; font-size: 12px;">${l.adDeadline ? fmtDate(l.adDeadline) : ""}</td>
      ${cfg.showIndividualRates ? `<td style="text-align: right; font-weight: 600;">${fmtCurrency(l.price)}</td>` : ""}
    </tr>`;

    return `<table>
      <thead><tr style="background: #f5f5f5;">
        ${cfg.showIssueDates ? '<th>Issue</th>' : ''}
        ${cfg.showAdSize ? '<th>Ad Size</th>' : ''}
        <th>Ad Materials Due</th>
        ${cfg.showIndividualRates ? '<th style="text-align: right;">Rate</th>' : ''}
      </tr></thead>
      <tbody>
        ${cfg.groupByPublication && isMultiPub ? pubIds.map(pubId => {
          const pub = pubs.find(p => p.id === pubId);
          const pubLines = lines.filter(l => (l.pubId || l.publication) === pubId);
          const pubTotal = pubLines.reduce((s, l) => s + (l.price || 0), 0);
          return `
            <tr class="pub-header"><td colspan="${colCount}">${pub?.name || pubId}</td></tr>
            ${pubLines.map(renderLine).join("")}
            ${cfg.showSubtotals ? `<tr class="subtotal">
              <td colspan="${colCount - 1}">Subtotal</td>
              <td style="text-align: right;">${fmtCurrency(pubTotal)}</td>
            </tr>` : ""}
          `;
        }).join("") : lines.map(renderLine).join("")}
      </tbody>
      <tfoot>
        <tr class="grand-total">
          <td colspan="${colCount - 1}">${isMultiPub ? "Campaign Total" : "Total"}</td>
          <td style="text-align: right; font-size: 20px; color: ${brandColor};">${fmtCurrency(total)}</td>
        </tr>
      </tfoot>
    </table>`;
  })()}

  <!-- PAYMENT SCHEDULE -->
  ${payments.length > 0 ? `
    <div style="margin-top: 28px;">
      <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #999; margin-bottom: 10px;">Payment Schedule${cfg.paymentTiming === "per_issue" ? " (by publish month)" : cfg.paymentTiming === "monthly" ? " (monthly installments)" : ""}</div>
      <table>
        <tbody>
          ${payments.map(p => `<tr>
            <td style="font-weight: 600;">Due by ${fmtDate(p.date)}</td>
            <td style="text-align: right; font-weight: 700;">${fmtCurrency(p.amount)}</td>
            <td style="color: #999; font-size: 11px;">${p.description}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  ` : ""}

  <!-- SIGN BUTTON -->
  ${!forPdf && signLink ? `
    <div style="text-align: center; margin: 36px 0;">
      <a href="${signLink}" style="display: inline-block; padding: 16px 48px; background: #16A34A; color: #fff; font-size: 17px; font-weight: 800; text-decoration: none; border-radius: 8px; letter-spacing: 0.3px;">${cfg.signButtonText}</a>
      <div style="font-size: 11px; color: #999; margin-top: 8px;">This proposal is valid for ${cfg.validityDays} days.</div>
    </div>
  ` : forPdf ? `
    <div style="text-align: center; margin: 36px 0; padding: 20px; border: 2px solid #ddd; border-radius: 8px;">
      <div style="font-size: 14px; font-weight: 700; color: #333;">Signature</div>
      <div style="margin-top: 24px; border-bottom: 1px solid #333; width: 60%; display: inline-block;">&nbsp;</div>
      <div style="font-size: 11px; color: #999; margin-top: 8px;">Date: _______________</div>
    </div>
  ` : ""}

  <!-- TERMS -->
  ${cfg.terms && cfg.terms.length > 0 ? `
    <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #eee;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #999; margin-bottom: 8px;">Terms & Conditions</div>
      <ul style="font-size: 11px; color: #666; line-height: 1.8; padding-left: 16px; margin: 0;">
        ${cfg.terms.map(t => `<li>${t.replace("{{validity_days}}", String(cfg.validityDays))}</li>`).join("")}
      </ul>
    </div>
  ` : ""}

  <!-- FOOTER -->
  <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; text-align: center; font-size: 11px; color: #999;">
    ${brandName} &middot; Paso Robles, CA &middot; 13stars.media
  </div>

</div>
</body></html>`;
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
