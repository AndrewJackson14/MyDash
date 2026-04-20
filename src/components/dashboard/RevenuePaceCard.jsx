// ============================================================
// RevenuePaceCard — MTD revenue vs MTD goal with pace read and
// same-period comparisons (last month, last year).
//
// Answers Hayley's most-asked question ("are we hitting the number?")
// on the front page of the dashboard so she doesn't have to drill in.
// ============================================================
import { useMemo } from "react";
import { Z, FS, FW, COND } from "../../lib/theme";
import { Btn } from "../ui";
import { fmtCurrencyWhole as fmtCurrency } from "../../lib/formatters";
import DashboardModule from "./DashboardModule";
import MetricWithBenchmark from "./MetricWithBenchmark";

const DAY_MS = 86400000;

// Closed-sales revenue between two inclusive dates.
function sumClosedBetween(sales, start, end) {
  return (sales || []).reduce((sum, s) => {
    if (s.status !== "Closed") return sum;
    const d = new Date(s.closedAt || s.closed_at || s.date || 0);
    if (d >= start && d < end) return sum + (Number(s.amount) || 0);
    return sum;
  }, 0);
}

// Goal for the current month from commission_issue_goals — sum across
// issues whose `date` falls in the target month. commissionGoals rows
// carry issueId, so we need the issues array to resolve the date.
function sumGoalsForMonth(commissionGoals, issues, year, month) {
  const issueIds = new Set(
    (issues || [])
      .filter(iss => {
        const d = new Date(iss.date || iss.publishDate || iss.publish_date || 0);
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .map(iss => iss.id)
  );
  return (commissionGoals || []).reduce((sum, g) => {
    if (g.issueId && issueIds.has(g.issueId)) return sum + (Number(g.goal) || 0);
    return sum;
  }, 0);
}

export default function RevenuePaceCard({
  sales, commissionGoals, issues,
  userId, onClick,
}) {
  const data = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const dayOfMonth = now.getDate();
    const monthStart = new Date(y, m, 1);
    const nextMonthStart = new Date(y, m + 1, 1);
    const daysInMonth = Math.round((nextMonthStart - monthStart) / DAY_MS);
    const monthPct = dayOfMonth / daysInMonth;

    const mtdRev = sumClosedBetween(sales, monthStart, new Date(Date.now() + DAY_MS));
    const mtdGoal = sumGoalsForMonth(commissionGoals, issues, y, m);

    // Same-period-last-month: from 1st of prior month up to the same
    // day-of-month as today.
    const lastMonthStart = new Date(y, m - 1, 1);
    const lastMonthSameDay = new Date(y, m - 1, dayOfMonth + 1);
    const lastMonthSame = sumClosedBetween(sales, lastMonthStart, lastMonthSameDay);

    // Same-period-last-year.
    const lyStart = new Date(y - 1, m, 1);
    const lySameDay = new Date(y - 1, m, dayOfMonth + 1);
    const lySame = sumClosedBetween(sales, lyStart, lySameDay);

    const pctToGoal = mtdGoal > 0 ? mtdRev / mtdGoal : null;
    const projected = mtdGoal > 0 && monthPct > 0 ? Math.round(mtdRev / monthPct) : null;
    const paceDelta = pctToGoal !== null ? pctToGoal - monthPct : null;

    return {
      mtdRev, mtdGoal, pctToGoal, projected, paceDelta,
      dayOfMonth, daysInMonth, monthPct,
      lastMonthSame, lySame,
    };
  }, [sales, commissionGoals, issues]);

  const paceLabel = data.paceDelta === null
    ? "Set a monthly goal to see pace"
    : data.paceDelta >= 0
      ? `Ahead of pace by ${Math.round(data.paceDelta * 100)}pts`
      : `Behind pace by ${Math.round(-data.paceDelta * 100)}pts`;

  const paceColor = data.paceDelta === null ? Z.tm
    : data.paceDelta >= 0 ? Z.go
    : data.paceDelta > -0.1 ? Z.wa : Z.da;

  return (
    <DashboardModule
      id="revenue-pace"
      userId={userId}
      title="Revenue Pace"
      subtitle={`Day ${data.dayOfMonth} of ${data.daysInMonth} · ${Math.round(data.monthPct * 100)}% through month`}
      action={onClick ? <Btn sm v="ghost" onClick={onClick}>Open Reports</Btn> : null}
    >
      <div style={{
        display: "grid",
        gridTemplateColumns: "1.2fr 1fr 1fr",
        gap: 12,
      }}>
        <MetricWithBenchmark
          label="MTD Revenue"
          value={fmtCurrency(data.mtdRev)}
          goal={data.mtdGoal > 0 ? {
            value: fmtCurrency(data.mtdGoal),
            pctReached: data.pctToGoal || 0,
            label: "vs month goal",
          } : null}
          sublabel={data.projected !== null ? `Projected: ${fmtCurrency(data.projected)}` : null}
          color={paceColor}
        />
        <MetricWithBenchmark
          label="Same period last month"
          value={fmtCurrency(data.lastMonthSame)}
          benchmark={data.lastMonthSame > 0 ? {
            value: `${Math.round(((data.mtdRev - data.lastMonthSame) / data.lastMonthSame) * 100)}%`,
            label: "vs this MTD",
            direction: data.mtdRev >= data.lastMonthSame ? "up" : "down",
            good: true,
          } : null}
        />
        <MetricWithBenchmark
          label="Same period last year"
          value={fmtCurrency(data.lySame)}
          benchmark={data.lySame > 0 ? {
            value: `${Math.round(((data.mtdRev - data.lySame) / data.lySame) * 100)}%`,
            label: "vs this MTD",
            direction: data.mtdRev >= data.lySame ? "up" : "down",
            good: true,
          } : null}
        />
      </div>
      <div style={{
        marginTop: 12,
        padding: "10px 14px",
        borderRadius: 8,
        background: paceColor + "14",
        borderLeft: `3px solid ${paceColor}`,
        fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx,
        fontFamily: COND,
      }}>{paceLabel}</div>
    </DashboardModule>
  );
}
