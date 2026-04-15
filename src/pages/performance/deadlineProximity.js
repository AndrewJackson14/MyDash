// ============================================================
// deadlineProximity.js — Compression-window math for the
// Performance Review page.
//
// Every editorial story and ad project lives inside a compression
// window bounded by a "start" deadline (ed_deadline for stories,
// ad_deadline for ads) and a "pages locked" deadline. Performance
// is measured as "percent stage complete" minus "percent time
// elapsed". Positive = ahead of pace, negative = behind.
// ============================================================

// Editorial stage weights — the single-source-of-truth model uses a
// 4-value status column: Draft → Edit → Ready → Archived. Publication
// to web/print forks from Ready via the sent_to_web / sent_to_print
// boolean flags, not via additional statuses. Ready = 100% complete
// on the editorial side; the destination flags represent channel
// hand-offs and are handled separately by the caller.
export const EDITORIAL_STAGE_WEIGHTS = {
  Draft: 0,
  Edit: 50,
  Ready: 100,
  Archived: 0,
};

// Ad lifecycle stage weights (from AdProjects.jsx)
export const AD_STAGE_WEIGHTS = {
  brief: 0,
  awaiting_art: 10,
  designing: 30,
  proof_sent: 50,
  revising: 50,
  approved: 80,
  signed_off: 90,
  placed: 100,
};

// Days a stale (no pages_locked_date) issue is treated as compressing
// over, so deadline proximity still produces a real number when the
// publisher hasn't set a lock date yet.
export const DEFAULT_LOCK_OFFSET_DAYS = 5;

// Parse a DB date/string into a Date at noon UTC so day-only values don't
// shift under local timezone conversion.
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  // Handle YYYY-MM-DD — interpret as noon UTC
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00Z`);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Build the compression window for a single item.
// kind: "editorial" | "ad"
// issue: { ed_deadline, ad_deadline, pages_locked_date, date }
export function buildWindow(kind, issue, now = new Date()) {
  if (!issue) return null;
  const startRaw = kind === "ad" ? issue.ad_deadline || issue.adDeadline : issue.ed_deadline || issue.edDeadline;
  const start = toDate(startRaw);
  let end = toDate(issue.pages_locked_date || issue.pagesLockedDate);
  if (!start) return null;
  if (!end) {
    // No explicit lock date — fall back to N days after the start
    // so the window always has a non-zero duration.
    end = new Date(start.getTime() + DEFAULT_LOCK_OFFSET_DAYS * 86400000);
  }
  if (end <= start) {
    end = new Date(start.getTime() + 86400000);
  }
  const duration = end.getTime() - start.getTime();
  const elapsed = Math.max(0, now.getTime() - start.getTime());
  const percentTimeElapsed = Math.min(100, (elapsed / duration) * 100);
  return { start, end, duration, elapsed, percentTimeElapsed };
}

// Score one item. Returns proximityScore (percent points), percentComplete,
// percentTimeElapsed. Late-breaking items carry a 1.3x weight for averaging.
export function scoreItem(kind, item, issue, now = new Date()) {
  const window = buildWindow(kind, issue, now);
  if (!window) return null;
  const weights = kind === "ad" ? AD_STAGE_WEIGHTS : EDITORIAL_STAGE_WEIGHTS;
  const percentComplete = weights[item.status] ?? 0;
  const proximityScore = percentComplete - window.percentTimeElapsed;
  const isLateBreaking = !!(item.lateBreaking || item.late_breaking);
  const weight = isLateBreaking ? 1.3 : 1;
  return {
    id: item.id,
    status: item.status,
    percentComplete,
    percentTimeElapsed: window.percentTimeElapsed,
    proximityScore,
    isLateBreaking,
    weight,
    onTrack: proximityScore >= 0,
  };
}

// Aggregate a list of scored items into a weighted average.
export function aggregateScores(scored) {
  const real = scored.filter(Boolean);
  if (real.length === 0) return { avgScore: 0, onTrackPct: 0, count: 0 };
  const totalWeight = real.reduce((s, r) => s + r.weight, 0);
  const weightedSum = real.reduce((s, r) => s + r.proximityScore * r.weight, 0);
  const onTrack = real.filter(r => r.onTrack).length;
  return {
    avgScore: weightedSum / totalWeight,
    onTrackPct: (onTrack / real.length) * 100,
    count: real.length,
    onTrack,
    behind: real.length - onTrack,
  };
}

// Translate a proximityScore or onTrackPct into a traffic-light color key.
// Consumers map the key to Z.go / Z.wa / Z.da via the theme.
export function proximityColorKey(percent) {
  if (percent >= 80) return "green";
  if (percent >= 50) return "amber";
  return "red";
}
