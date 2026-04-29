// PublisherDashboard/lib/pacingCurve.js
// Variance + interpolation logic for the pacing curve. Curve config lives
// in constants.js — this file is pure math against that data.

import { PACING_CURVE, PACING_VARIANCE_BANDS } from "../constants";

// Linear-interpolate the target % at an arbitrary days-to-press value.
// Curve is defined at waypoints (7, 5, 3, 1 days). For values:
//   - past the latest waypoint (day 0 / press day) → 100%
//   - before the earliest waypoint (8+ days out)  → curve start (50%)
//   - between waypoints                            → linear blend
export function targetPctAt(daysToPress) {
  if (!Number.isFinite(daysToPress)) return null;
  const sorted = [...PACING_CURVE].sort((a, b) => b.daysToPress - a.daysToPress);
  // Earliest waypoint (largest days)
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (daysToPress >= first.daysToPress) return first.targetPct;
  if (daysToPress <= 0) return 100;
  if (daysToPress <= last.daysToPress) {
    // Between last waypoint and press day → interpolate to 100
    const t = (last.daysToPress - daysToPress) / last.daysToPress;
    return last.targetPct + (100 - last.targetPct) * t;
  }
  // Find bracketing pair
  for (let i = 0; i < sorted.length - 1; i++) {
    const hi = sorted[i];
    const lo = sorted[i + 1];
    if (daysToPress <= hi.daysToPress && daysToPress >= lo.daysToPress) {
      const span = hi.daysToPress - lo.daysToPress;
      const t = span === 0 ? 0 : (hi.daysToPress - daysToPress) / span;
      return hi.targetPct + (lo.targetPct - hi.targetPct) * t;
    }
  }
  return last.targetPct;
}

// Actual % sold for an issue.
export function actualPctSold(revenueSold, revenueTarget) {
  if (!revenueTarget || revenueTarget <= 0) return null;
  return (Number(revenueSold) || 0) / Number(revenueTarget) * 100;
}

// Variance = actual - target. Positive = ahead. Null when either side missing.
export function pacingVariance(revenueSold, revenueTarget, daysToPress) {
  const actual = actualPctSold(revenueSold, revenueTarget);
  const target = targetPctAt(daysToPress);
  if (actual == null || target == null) return null;
  return actual - target;
}

// Variance → status band. 'green' | 'amber' | 'red' | 'unknown'
export function pacingStatus(variance) {
  if (variance == null) return "unknown";
  if (variance >= PACING_VARIANCE_BANDS.GREEN_THRESHOLD) return "green";
  if (variance >= PACING_VARIANCE_BANDS.AMBER_THRESHOLD) return "amber";
  return "red";
}

// Helper: compute everything in one shot for an issue card row.
export function computePacing({ revenueSold, revenueTarget, daysToPress }) {
  const actual = actualPctSold(revenueSold, revenueTarget);
  const target = targetPctAt(daysToPress);
  const variance = (actual != null && target != null) ? actual - target : null;
  return {
    actualPct: actual == null ? null : Math.round(actual),
    targetPct: target == null ? null : Math.round(target),
    variance,
    status: pacingStatus(variance),
  };
}
