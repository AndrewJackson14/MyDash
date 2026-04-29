// IssueCardsGrid.jsx — 2-col responsive grid of IssueCards. Sort by
// days-to-deadline ascending, then variance ascending (worst first).

import { Z, COND, FS, FW } from "../../../lib/theme";
import IssueCard from "./IssueCard";
import { computePacing } from "../lib/pacingCurve";

const fmtPressDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function IssueCardsGrid({ issues = [], filterPressDay = null, onIssueClick }) {
  // Apply optional press-day filter (set when user clicks a timeline cell)
  const filtered = filterPressDay
    ? issues.filter(i => (i.press_date || "").slice(0, 10) === filterPressDay)
    : issues;

  // Enrich with pacing math, then sort.
  const enriched = filtered.map(i => {
    const pacing = computePacing({
      revenueSold: i.revenue_sold,
      revenueTarget: i.revenue_target,
      daysToPress: i.days_to_deadline,
    });
    return { ...i, pacing };
  });

  enriched.sort((a, b) => {
    const dA = a.days_to_deadline ?? 999;
    const dB = b.days_to_deadline ?? 999;
    if (dA !== dB) return dA - dB;
    const vA = a.pacing.variance ?? 999;
    const vB = b.pacing.variance ?? 999;
    return vA - vB;
  });

  if (enriched.length === 0) {
    // No own card chrome — parent <SectionCard /> provides it.
    return (
      <div style={{
        padding: "32px 12px", textAlign: "center",
        color: Z.tm, fontSize: FS.sm, fontFamily: COND,
      }}>
        {filterPressDay
          ? "No issues press on this day."
          : "No issues hit press in the next 7 days."}
      </div>
    );
  }

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
      gap: 12,
    }}>
      {enriched.map(i => (
        <IssueCard
          key={i.issue_id}
          publicationAbbrev={i.publication_abbrev}
          pressDate={fmtPressDate(i.press_date)}
          daysToPress={i.days_to_deadline}
          actualPct={i.pacing.actualPct}
          targetPct={i.pacing.targetPct}
          revenueSold={i.revenue_sold}
          revenueTarget={i.revenue_target}
          unitsSold={i.units_sold}
          unitsTotal={i.units_total}
          status={i.pacing.status}
          onClick={onIssueClick ? () => onIssueClick(i) : undefined}
        />
      ))}
    </div>
  );
}
