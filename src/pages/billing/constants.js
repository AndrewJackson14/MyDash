import { Z } from "../../lib/theme";

export const INV_COLORS = {
  draft: { bg: Z.sa, text: Z.tm },
  sent: { bg: Z.ps, text: Z.pu },
  partially_paid: { bg: Z.ws, text: Z.wa },
  paid: { bg: Z.ss, text: Z.su },
  overdue: { bg: Z.ds, text: Z.da },
  void: { bg: Z.sa, text: Z.td },
};

export const INV_STATUSES = ["All", "draft", "sent", "partially_paid", "paid", "overdue", "void"];
export const INV_LABELS = { draft: "Draft", sent: "Sent", partially_paid: "Partial", paid: "Paid", overdue: "Overdue", void: "Void" };

export const BILLING_SCHEDULES = [
  { value: "lump_sum", label: "Lump Sum" },
  { value: "per_issue", label: "Per Issue" },
  { value: "monthly_plan", label: "Monthly Plan" },
];

export const PAYMENT_METHODS = [
  { value: "card", label: "Credit Card" },
  { value: "check", label: "Check" },
  { value: "ach", label: "ACH Transfer" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

export const today = new Date().toISOString().slice(0, 10);
export const fmtCurrency = (n) => "$" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

export const InvBadge = ({ status }) => {
  const c = INV_COLORS[status] || INV_COLORS.draft;
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 2, fontSize: 11, fontWeight: 700, background: c.bg, color: c.text, whiteSpace: "nowrap" }}>{INV_LABELS[status] || status}</span>;
};
