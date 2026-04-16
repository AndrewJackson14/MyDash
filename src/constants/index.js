// ============================================================
// Constants — enums, lookup tables, configuration
// ============================================================

// ─── Time ────────────────────────────────────────────────────
export const MS_PER_DAY = 86400000;
export const DAYS_PER_MONTH = 30.44;

// ─── Date helpers ────────────────────────────────────────────
export const getToday = () => new Date().toISOString().slice(0, 10);
export const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
export const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
export const thisYear = () => String(new Date().getFullYear());
export const yearStart = (offset = 0) => (new Date().getFullYear() + offset) + "-01-01";

// ─── Business thresholds ─────────────────────────────────────
export const THRESHOLDS = {
  churnMinSpend: 2000,         // Minimum lifetime spend to flag as churn risk
  churnMinMonths: 2,           // Min months since last purchase
  churnMaxMonths: 12,          // Max months since last purchase
  churnMinPurchases: 4,        // Min purchases to detect buying cycle
  declineDropPct: 0.6,         // YoY revenue must drop below 60% to flag
  declineMinRevenue: 2000,     // Min last-year revenue to flag decline
  whaleMinSpend: 10000,        // Min lifetime spend for "whale" designation
  crossSellMinSpend: 2000,     // Min spend to suggest cross-sell
  crossSellMaxPubs: 2,         // Max current pubs to suggest cross-sell
  renewalUrgentDays: 14,       // Days before contract end = urgent
  subExpiringDays: 30,         // Days ahead to flag expiring subscriptions
};

export const FREQ_MAP = { Weekly:7, "Bi-Weekly":14, "Semi-Monthly":15.2, Monthly:DAYS_PER_MONTH, "Bi-Monthly":60.8, Quarterly:91.3, "Semi-Annual":182.6, Annual:365 };

export const COMPANY = { name: "13 Stars Media", tagline: "Making Communities Better Through Print.™", phone: "(805) 466-2585", sales: { name: "Dana McGraw", email: "dana@13stars.media", phone: "(805) 423-6740" } };

export const MILESTONES = ["Scheduled", "In Progress", "Editing", "Proofing", "Packaged for Publishing"];
// Single-source-of-truth story lifecycle. Publishing destinations
// (web / print) are tracked via sent_to_web and sent_to_print booleans,
// not via additional status values.
export const STORY_STATUSES = ["Pitched", "Draft", "Edit", "Ready", "Archived"];
export const CONTACT_ROLES = ["Business Owner", "Marketing Manager", "Art Director", "Accounts Payable", "Customer Service", "Other"];
export const COMM_TYPES = ["Email", "Phone", "Text", "Comment"];
export const COMM_AUTHORS = ["Account Manager", "Graphic Designer", "Publisher", "Editor"];
export const STORY_AUTHORS = ["Hayley Mattson", "Nicholas Mattson", "Sarah Chen", "Marcus Rivera", "Jimy Tallal", "Lisa Nguyen", "Tom Bradley", "Jennifer Park", "Staff Writer"];

export const PIPELINE = ["Discovery", "Presentation", "Proposal", "Negotiation", "Closed", "Follow-up"];
export const PROPOSAL_STATUSES = ["Draft", "Sent", "Under Review", "Signed & Converted"];
export const TERMS = [{ label: "1× (per issue)", key: "rate", months: 1 }, { label: "6-month", key: "rate6", months: 6 }, { label: "12-month", key: "rate12", months: 12 }];

export const TEAM_ROLES = ["Publisher", "Editor-in-Chief", "Managing Editor", "Editor", "Writer/Reporter", "Stringer", "Copy Editor", "Photo Editor", "Graphic Designer", "Sales Manager", "Salesperson", "Distribution Manager", "Marketing Manager", "Production Manager", "Finance", "Office Manager"];

export function getAutoTier(n) { return n >= 12 ? "rate12" : n >= 6 ? "rate6" : "rate"; }
export function getAutoTermLabel(n) { return n >= 12 ? "12+ insertions" : n >= 6 ? "6-11 insertions" : "1-5 insertions"; }

export const ACTION_TYPES = {
  call:           { icon: "📞", color: "#6B7280", verb: "Call",    label: "Call client" },
  email:          { icon: "✉️",  color: "#6B7280", verb: "Email",   label: "Send email" },
  meeting:        { icon: "🤝", color: "#6B7280", verb: "Meet",    label: "Meeting" },
  send_kit:       { icon: "📦", color: "#6B7280", verb: "Send",    label: "Send media kit" },
  send_proposal:  { icon: "📋", color: "#6B7280", verb: "Send",    label: "Send proposal" },
  review_proposal:{ icon: "🔍", color: "#6B7280", verb: "Review",  label: "Review proposal" },
  follow_up:      { icon: "🔄", color: "#6B7280", verb: "Follow",  label: "Follow up" },
  task:           { icon: "✓",  color: "#8A95A8", verb: "Do",      label: "Task" },
};

export const STAGE_AUTO_ACTIONS = {
  Discovery:    { type: "send_kit",       label: "Send media kit",    date: "" },
  Presentation: { type: "call",           label: "Follow up on kit",  date: "" },
  Proposal:     { type: "send_proposal",  label: "Send proposal",     date: "" },
  Negotiation:  { type: "review_proposal",label: "Review terms",      date: "" },
  Closed:       { type: "follow_up",      label: "Onboard client",    date: "" },
  "Follow-up":  { type: "follow_up",      label: "Check in",          date: "" },
};

export const YEARLY_REVENUE = [{year:2023,total:1750000},{year:2024,total:2480000},{year:2025,total:3250000},{year:2026,total:3070000}];
export const MONTHLY_REVENUE = [{month:"Jan",print:45000,digital:12000,social:5000},{month:"Feb",print:48000,digital:13000,social:6000},{month:"Mar",print:52000,digital:14000,social:7000}];

export const SITES = [
  { id: "pub-paso-robles-press", name: "The Paso Robles Press", domain: "pasoroblespress.com" },
  { id: "pub-atascadero-news", name: "The Atascadero News", domain: "atascaderonews.com" },
  { id: "pub-paso-robles-magazine", name: "Paso Robles Magazine", domain: "pasoroblesmagazine.com" },
  { id: "pub-atascadero-news-maga", name: "Atascadero News Magazine", domain: "atascaderonewsmagazine.com" },
  { id: "pub-morro-bay-life", name: "Morro Bay Life", domain: "morrobaylife.com" },
  { id: "pub-santa-ynez-valley-st", name: "Santa Ynez Valley Star", domain: "syvstar.com" },
  { id: "pub-the-malibu-times", name: "The Malibu Times", domain: "themalibutimes.com" },
];

export const RICH_CMDS = [
  { label: "Bold", icon: "B", cmd: "bold" },
  { label: "Italic", icon: "I", cmd: "italic" },
  { label: "Underline", icon: "U", cmd: "underline" },
  { label: "H2", icon: "H2", cmd: "formatBlock", val: "h2" },
  { label: "H3", icon: "H3", cmd: "formatBlock", val: "h3" },
  { label: "Quote", icon: "❝", cmd: "formatBlock", val: "blockquote" },
  { label: "UL", icon: "•", cmd: "insertUnorderedList" },
  { label: "OL", icon: "1.", cmd: "insertOrderedList" },
  { label: "Link", icon: "🔗", cmd: "createLink" },
  { label: "Clear", icon: "⊘", cmd: "removeFormat" },
];

export const AI_ACTIONS = [
  { label: "Continue writing", prompt: "Continue this article naturally:" },
  { label: "Improve clarity", prompt: "Rewrite this for clarity and concision:" },
  { label: "Add detail", prompt: "Expand this with more specific details:" },
  { label: "Rewrite for web", prompt: "Rewrite this for online readers with shorter paragraphs and subheadings:" },
  { label: "Generate headline", prompt: "Write 5 headline options for this article:" },
  { label: "Write caption", prompt: "Write a photo caption for this article:" },
  { label: "Write pull quote", prompt: "Extract the best pull quote from this text:" },
  { label: "SEO metadata", prompt: "Write an SEO title and meta description for this article:" },
  { label: "Social media post", prompt: "Write a social media post promoting this article:" },
  { label: "Summarize", prompt: "Write a 2-sentence summary of this article:" },
];
