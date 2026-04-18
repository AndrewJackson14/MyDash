import { Z } from "../../lib/theme";

// Color-code a percent change. Threshold: ±5% flat, else green/red.
export const deltaColor = (pctChange) => {
  if (pctChange == null || isNaN(pctChange)) return Z.tm;
  if (pctChange > 5) return Z.go;
  if (pctChange < -5) return Z.da;
  return Z.wa;
};

export const deltaArrow = (pctChange) => {
  if (pctChange == null || isNaN(pctChange)) return "";
  if (pctChange > 0.5) return "↑";
  if (pctChange < -0.5) return "↓";
  return "→";
};

// Pacing color for % of goal: ≥95 green, 75–95 amber, <75 red, null muted.
export const pacingColor = (pctOfGoal) => {
  if (pctOfGoal == null || isNaN(pctOfGoal)) return Z.tm;
  if (pctOfGoal >= 95) return Z.go;
  if (pctOfGoal >= 75) return Z.wa;
  return Z.da;
};

export const pacingIcon = (pctOfGoal) => {
  if (pctOfGoal == null || isNaN(pctOfGoal)) return "—";
  if (pctOfGoal >= 95) return "✓";
  if (pctOfGoal >= 75) return "△";
  return "✗";
};
