// ═══════════════════════════════════════════════════════
// Centralized formatting utilities
// ═══════════════════════════════════════════════════════

// ─── Currency ──────────────────────────────────────────
/** $1,234.56 — financial precision */
export const fmtCurrency = (n) => "$" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** $1,235 — display (no decimals) */
export const fmtCurrencyWhole = (n) => "$" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** $1.2K — abbreviated */
export const fmtK = (n) => "$" + ((n || 0) / 1000).toFixed(1) + "K";

// ─── Dates ─────────────────────────────────────────────
/** Jan 5, 2024 — standard display */
export const fmtDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "\u2014";

/** January 5, 2024 — formal (contracts, invoices) */
export const fmtDateLong = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";

/** Jan 5 — compact (no year) */
export const fmtDateShort = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "\u2014";

/** Jan 5, 2024, 2:30 PM — with time */
export const fmtDateTime = (d) => d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";

// ─── Time ──────────────────────────────────────────────
/** 2:30 PM */
export const fmtTime = (d) => d ? new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";

/** 2 PM — hour only (for calendar grids) */
export const fmtTimeHour = (h) => `${h % 12 || 12} ${h >= 12 ? "PM" : "AM"}`;

/** now / 5m / 2:30 PM / Yesterday 2:30 PM / Jan 5 2:30 PM */
export const fmtTimeRelative = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  const now = new Date();
  const diff = now - dt;
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000 && dt.getDate() === now.getDate()) return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (diff < 172800000) return "Yesterday " + dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

/** just now / 5 mins ago / 2 hours ago / Jan 5 */
export const fmtAgo = (d) => {
  if (!d) return "";
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins !== 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

// ─── Elapsed ───────────────────────────────────────────
/** Days until date (999 if missing — safe for sorting) */
export const daysUntil = (d) => d ? Math.ceil((new Date(d + "T12:00:00") - new Date()) / 86400000) : 999;

/** Days between two date strings */
export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

// ─── Names ─────────────────────────────────────────────
/** "JD" from "John Doe" */
export const initials = (name) => name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "??";
