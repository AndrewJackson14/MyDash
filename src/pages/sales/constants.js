// ============================================================
// Sales Constants — shared across all SalesCRM sub-pages
// ============================================================
import { Z } from "../../lib/theme";

export const PIPELINE = ["Discovery", "Presentation", "Proposal", "Negotiation", "Closed", "Follow-up"];
export const PIPELINE_COLORS = { Discovery: Z.tm, Presentation: Z.tm, Proposal: Z.tx, Negotiation: Z.tx, Closed: Z.tx, "Follow-up": Z.td };
export const PROPOSAL_STATUSES = ["Draft", "Sent", "Under Review", "Approved/Signed", "Expired"];
export const TERMS = [{ label: "1× (per issue)", key: "rate", months: 1 }, { label: "6-month", key: "rate6", months: 6 }, { label: "12-month", key: "rate12", months: 12 }];

export function getAutoTier(n) { return n >= 12 ? "rate12" : n >= 6 ? "rate6" : "rate"; }
export function getAutoTermLabel(n) { return n >= 12 ? "12+ insertions" : n >= 6 ? "6-11 insertions" : "1-5 insertions"; }

export const ACTION_TYPES = {
  call: { icon: "📞", label: "Call", verb: "Schedule Call", color: Z.su },
  email: { icon: "✉️", label: "Email", verb: "Send Email", color: Z.ac },
  meeting: { icon: "📅", label: "Meeting", verb: "Schedule Meeting", color: Z.pu },
  send_kit: { icon: "📎", label: "Send Kit", verb: "Send Rate Cards", color: Z.wa },
  send_proposal: { icon: "📝", label: "Proposal", verb: "Create Proposal", color: Z.or },
  review_proposal: { icon: "👁", label: "Review", verb: "Review Proposal", color: Z.pu },
  follow_up: { icon: "🔄", label: "Follow Up", verb: "Follow Up", color: Z.ac },
  task: { icon: "✓", label: "Task", verb: "Complete Task", color: Z.tm },
};

export const STAGE_AUTO_ACTIONS = {
  Discovery: { type: "call", label: "Schedule intro call" },
  Presentation: { type: "send_kit", label: "Send media kit" },
  Proposal: { type: "follow_up", label: "Follow up on proposal" },
  Negotiation: { type: "review_proposal", label: "Review & finalize terms" },
  Closed: { type: "task", label: "Confirm ad materials received" },
  "Follow-up": { type: "follow_up", label: "Check in with client" },
};

export const actInfo = (act) => { if (!act) return null; if (typeof act === "string") return { type: "task", label: act, ...ACTION_TYPES.task }; const base = ACTION_TYPES[act.type] || ACTION_TYPES.task; return { ...base, ...act }; };

export const INDUSTRIES = [
  "Wine & Spirits", "Restaurants & Dining", "Real Estate", "Home Services",
  "Financial Services", "Healthcare & Wellness", "Legal Services", "Automotive",
  "Retail / Shopping", "Hospitality / Hotels & Lodging", "Agriculture / Farming / Ranching",
  "Education", "Nonprofit / Community", "Government / Public Agencies",
  "Construction / Development", "Technology", "Arts & Entertainment",
  "Beauty & Personal Care", "Fitness & Recreation", "Food & Beverage",
  "Accounting & Tax", "Marketing & Advertising", "Architecture & Design",
  "Engineering", "Consulting", "Photography / Videography", "Printing & Signage",
  "Staffing & HR", "Property Management", "Veterinary Services",
  "Funeral Services & Memorial", "Pest Control", "Cleaning & Janitorial",
];

export const LEAD_SOURCES = ["Referral", "Cold Call", "Walk-in", "Event", "Website Inquiry", "Social Media", "Existing Client", "Other"];

export const computeClientStatus = (clientId, sales, issues) => {
  const clientSales = (sales || []).filter(s => s.clientId === clientId && s.status === "Closed");
  if (clientSales.length === 0) return "Lead";
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysOut = new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().slice(0, 10);
  const futureAds = clientSales.filter(s => {
    if (!s.issueId) return false;
    const iss = (issues || []).find(i => i.id === s.issueId);
    return iss && iss.date >= today;
  });
  const latestFutureIssue = futureAds.map(s => {
    const iss = (issues || []).find(i => i.id === s.issueId);
    return iss?.date || "";
  }).sort().pop();
  if (!latestFutureIssue && futureAds.length === 0) return "Lapsed";
  if (latestFutureIssue && latestFutureIssue <= thirtyDaysOut) return "Renewal";
  return "Active";
};

export const CLIENT_STATUS_COLORS = {
  Lead: { bg: Z.sa, text: Z.tm },
  Active: { bg: Z.ss, text: Z.su },
  Renewal: { bg: Z.ws, text: Z.wa },
  Lapsed: { bg: Z.ds, text: Z.da },
};
