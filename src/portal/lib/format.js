// Small portal-side formatters. The staff app's lib/formatters.js is
// reusable too, but the portal stays decoupled from staff helpers in
// case the portal carves into its own workspace later.
export const fmtCurrency = (n) => {
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));
};

export const fmtCurrencyWhole = (n) => {
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n));
};

export const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return "—";
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export const fmtRelative = (d) => {
  if (!d) return "—";
  const dt   = new Date(d);
  const now  = new Date();
  const diff = (now - dt) / 1000; // seconds
  if (diff < 60)         return "just now";
  if (diff < 3600)       return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)      return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400)  return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(d);
};
