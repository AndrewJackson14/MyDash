// Returns the percentage of the selected period (annual / quarter / month)
// that has already elapsed, bounded [0, 100]. When the selected year is
// already complete or not yet started, the caller should handle that case
// before invoking this helper — for the active period it gives the
// pacing reference for "how far through are we?"
export const daysElapsedPct = (year, granularity, referenceMonth) => {
  const now = new Date();
  const y = Number(year);
  const yearStart = new Date(y, 0, 1);
  const yearEnd = new Date(y, 11, 31, 23, 59, 59, 999);

  if (now < yearStart) return 0;
  if (now > yearEnd) return 100;

  if (granularity === "annual") {
    const total = yearEnd - yearStart;
    const elapsed = now - yearStart;
    return Math.max(0, Math.min(100, (elapsed / total) * 100));
  }
  if (granularity === "quarter") {
    const q = Math.floor((referenceMonth ?? now.getMonth()) / 3);
    const qStart = new Date(y, q * 3, 1);
    const qEnd = new Date(y, q * 3 + 3, 0, 23, 59, 59, 999);
    if (now < qStart) return 0;
    if (now > qEnd) return 100;
    const total = qEnd - qStart;
    return Math.max(0, Math.min(100, ((now - qStart) / total) * 100));
  }
  if (granularity === "month") {
    const m = referenceMonth ?? now.getMonth();
    const mStart = new Date(y, m, 1);
    const mEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);
    if (now < mStart) return 0;
    if (now > mEnd) return 100;
    const total = mEnd - mStart;
    return Math.max(0, Math.min(100, ((now - mStart) / total) * 100));
  }
  return 0;
};

// Is the selected year in the past relative to today?
export const isYearComplete = (year) => {
  const y = Number(year);
  return new Date().getFullYear() > y;
};

// Is a YYYY-MM period in the future relative to "now"?
export const isPeriodFuture = (period) => {
  const nowPeriod = new Date().toISOString().slice(0, 7);
  return period > nowPeriod;
};
