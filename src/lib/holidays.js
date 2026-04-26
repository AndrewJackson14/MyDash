// May Sim P0.3 — Holiday-aware deadline shifts.
//
// When an editorial / ad deadline lands on a holiday or weekend, the
// effective deadline shifts EARLIER to the previous business day.
// Renderers display "WAS X · NOW Y" so the team sees the compression
// before the week starts.
//
// Nothing mutates `issue.ed_deadline` / `issue.ad_deadline`. Shifts are
// computed at display time so the original dates stay intact for
// reporting and audit.

// Convert a Date to a YYYY-MM-DD string (locale-independent).
const toISODate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Parse a YYYY-MM-DD into a Date at noon local — sidesteps DST edge
// cases that can flip the day when the system clock is near midnight.
const parseISO = (s) => {
  if (!s) return null;
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0);
};

const isWeekend = (date) => {
  const dow = date.getDay();
  return dow === 0 || dow === 6;
};

// Walk back day-by-day until we find a date that's not a weekend and
// not in the holidays set. Capped at 14 iterations to avoid runaway
// loops if the entire prior fortnight were marked off.
const previousBusinessDay = (date, holidayDateSet) => {
  const d = new Date(date);
  for (let i = 0; i < 14; i++) {
    d.setDate(d.getDate() - 1);
    const iso = toISODate(d);
    if (!isWeekend(d) && !holidayDateSet.has(iso)) return d;
  }
  return d;
};

// Build a Set of holiday date strings that apply to a given pub.
// holidays[].observed_by_pubs is an array; empty = applies to all.
export const holidaySetForPub = (holidays, pubId) => {
  const set = new Set();
  for (const h of holidays || []) {
    const observed = h.observed_by_pubs || [];
    if (observed.length === 0 || (pubId && observed.includes(pubId))) {
      set.add(h.holiday_date);
    }
  }
  return set;
};

// Build a label lookup so renderers can show "Memorial Day" instead
// of just a date.
export const holidayLabelMap = (holidays) => {
  const m = new Map();
  for (const h of holidays || []) m.set(h.holiday_date, h.label);
  return m;
};

// Compute the shift for a deadline. Returns:
//   { shifted: false, effective: <orig>, original: <orig>, label: null, holidayLabel: null }
// when the deadline is fine, or:
//   { shifted: true, effective: <new>, original: <orig>, label: "Memorial Day", ... }
// when shifted. effective is what to honor; original is what was on
// the calendar.
export const shiftDeadline = (deadlineISO, holidayDateSet, labelMap) => {
  const result = { shifted: false, effective: deadlineISO || null, original: deadlineISO || null, holidayLabel: null };
  if (!deadlineISO) return result;
  const d = parseISO(deadlineISO);
  if (!d) return result;
  const onHoliday = holidayDateSet.has(deadlineISO);
  const onWeekend = isWeekend(d);
  if (!onHoliday && !onWeekend) return result;
  const shifted = previousBusinessDay(d, holidayDateSet);
  result.shifted = true;
  result.effective = toISODate(shifted);
  result.holidayLabel = onHoliday && labelMap ? labelMap.get(deadlineISO) || null : null;
  return result;
};

// Convenience: format a date for the badge ("Mon May 25").
export const fmtDeadlineBadge = (iso) => {
  const d = parseISO(iso);
  if (!d) return iso || "";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};
