// PublisherDashboard/lib/activityFormatters.js
// event_type → display string mapping. One pure function per event type.
// All formatters are pure: they take a row from activity_log + optional
// resolved metadata (actor name from people, client name) and
// return { headline, detail, isItalic, isCritical }.

import { ACTIVITY_EVENT_TYPES } from "../constants";

// Currency formatter — keep light, no locale assumptions beyond USD.
const fmtUSD = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

// 9:42 AM — local time formatter against a timestamptz.
export function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

// Top-level formatter. Returns a normalized shape for ActivityEventCard.
//   row: activity_log row with summary, type/event_type, metadata, etc.
//   ctx: { actorName, clientName, publicationName }
export function formatActivity(row, ctx = {}) {
  const eventType = row.event_type || row.type;
  const fmt = FORMATTERS[eventType] || FORMATTERS._default;
  return fmt(row, ctx);
}

const FORMATTERS = {
  [ACTIVITY_EVENT_TYPES.PROPOSAL_RECEIVED_SELF_SERVE]: (row, ctx) => {
    const m = row.metadata || {};
    const intake = m.intake_email ? ` (${m.intake_email})` : "";
    return {
      headline: `Self-serve proposal received from ${ctx.clientName || row.client_name || "new advertiser"}${intake}`,
      detail: m.total ? fmtUSD(m.total) : "",
      isItalic: false,
      isCritical: false,
    };
  },

  [ACTIVITY_EVENT_TYPES.PROPOSAL_REJECTED_SELF_SERVE]: (row, ctx) => ({
    headline: `${ctx.actorName || "—"} declined self-serve proposal from ${ctx.clientName || row.client_name || "—"}`,
    detail: "",
    isItalic: false,
    isCritical: false,
  }),

  [ACTIVITY_EVENT_TYPES.PROPOSAL_SENT]: (row, ctx) => ({
    headline: `${ctx.actorName || "—"} sent proposal to ${ctx.clientName || row.client_name || "—"}`,
    detail: amountDetail(row.metadata),
    isItalic: false,
    isCritical: false,
  }),

  [ACTIVITY_EVENT_TYPES.CONTRACT_SIGNED]: (row, ctx) => ({
    headline: `${ctx.actorName || "—"} signed contract with ${ctx.clientName || row.client_name || "—"}`,
    detail: amountDetail(row.metadata),
    isItalic: false,
    isCritical: false,
  }),

  [ACTIVITY_EVENT_TYPES.PROOF_APPROVED]: (row, ctx) => {
    const m = row.metadata || {};
    const tail = [m.client_name || ctx.clientName, m.ad_size].filter(Boolean).join(" ");
    return {
      headline: `${ctx.actorName || "—"} approved proof${tail ? ` — ${tail}` : ""}`,
      detail: "",
      isItalic: false,
      isCritical: false,
    };
  },

  [ACTIVITY_EVENT_TYPES.STORY_FILED]: (row, ctx) => {
    const headline = (row.metadata && row.metadata.headline) || row.summary || "";
    return {
      headline: `${ctx.actorName || "—"} filed: '${headline}'`,
      detail: ctx.publicationName || "",
      isItalic: false,
      isCritical: false,
    };
  },

  [ACTIVITY_EVENT_TYPES.STORY_PUBLISHED]: (row, ctx) => {
    const headline = (row.metadata && row.metadata.headline) || row.summary || "";
    return {
      headline: `${ctx.actorName || "—"} published: '${headline}'`,
      detail: ctx.publicationName || "",
      isItalic: false,
      isCritical: false,
    };
  },

  [ACTIVITY_EVENT_TYPES.PAGE_BUILT]: (row, ctx) => {
    const m = row.metadata || {};
    const range = m.page_range || m.pages || "";
    const issue = m.issue_label || ctx.publicationName || "";
    return {
      headline: `${ctx.actorName || "—"} built pages ${range} — ${issue}`.trim(),
      detail: "",
      isItalic: false,
      isCritical: false,
    };
  },

  [ACTIVITY_EVENT_TYPES.INVOICE_ISSUED]: (row, ctx) => {
    const m = row.metadata || {};
    const n = m.count || 1;
    const issue = m.issue_label || "";
    return {
      headline: `${ctx.actorName || "—"} issued ${n} invoice${n === 1 ? "" : "s"}${issue ? ` — ${issue}` : ""}`,
      detail: m.total ? fmtUSD(m.total) : "",
      isItalic: false,
      isCritical: false,
    };
  },

  [ACTIVITY_EVENT_TYPES.COMMENT]: (row, ctx) => ({
    headline: `"${row.summary || row.text || ""}"`,
    detail: `— ${ctx.actorName || "—"}`,
    isItalic: true,
    isCritical: false,
  }),

  [ACTIVITY_EVENT_TYPES.ESCALATION]: (row, ctx) => ({
    headline: row.summary || row.text || "Escalation flagged",
    detail: ctx.actorName || "",
    isItalic: false,
    isCritical: true,
  }),

  // Unknown event types fall through to summary text.
  _default: (row, ctx) => ({
    headline: row.summary || row.text || "Activity",
    detail: ctx.actorName || "",
    isItalic: false,
    isCritical: false,
  }),
};

// Helper: pull amount from metadata into a detail string. Used by
// proposal_sent / contract_signed.
function amountDetail(metadata) {
  if (!metadata) return "";
  const amount = metadata.amount;
  const issues = metadata.issue_count;
  if (amount && issues) return `${fmtUSD(amount)} / ${issues} issue${issues === 1 ? "" : "s"}`;
  if (amount) return fmtUSD(amount);
  return "";
}
