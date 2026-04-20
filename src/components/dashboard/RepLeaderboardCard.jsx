// ============================================================
// RepLeaderboardCard — per-rep MTD closed revenue and pipeline, ranked.
// Publisher uses this to track pace per salesperson without clicking
// into each Team Member Profile.
//
// Per-rep monthly goals aren't in the schema yet — % to goal is shown
// only when a goal is wired (see `repGoals` prop). Otherwise the goal
// column is blank with a hint row pointing at Publications → Goals.
// ============================================================
import { useMemo } from "react";
import { Z, FS, FW, COND } from "../../lib/theme";
import { fmtCurrencyWhole as fmtCurrency } from "../../lib/formatters";
import DashboardModule from "./DashboardModule";

const DAY_MS = 86400000;

const SALES_ROLES = new Set(["Salesperson", "Sales Manager"]);
// Open-pipeline statuses — not yet closed but live.
const PIPELINE_STATUSES = new Set(["Discovery", "Presentation", "Proposal", "Negotiation"]);

export default function RepLeaderboardCard({
  sales, team, repGoals,
  userId, onOpenMember,
}) {
  const rows = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = daysInMonth - now.getDate();

    const salesReps = (team || []).filter(t =>
      SALES_ROLES.has(t.role) && t.isActive !== false && !t.isHidden
    );

    return salesReps.map(rep => {
      const repSales = (sales || []).filter(s => (s.repId || s.rep_id) === rep.id);
      const closedMtd = repSales
        .filter(s => s.status === "Closed" && new Date(s.closedAt || s.closed_at || s.date || 0) >= monthStart)
        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
      const pipeline = repSales
        .filter(s => PIPELINE_STATUSES.has(s.status))
        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

      const goal = Number((repGoals || {})[rep.id]) || 0;
      const pctToGoal = goal > 0 ? closedMtd / goal : null;

      let tone = Z.tm;
      if (pctToGoal !== null) {
        if (pctToGoal >= 1) tone = Z.go;
        else if (pctToGoal >= 0.75) tone = Z.wa;
        else if (daysLeft <= 7 && pctToGoal < 0.5) tone = Z.da;
      }

      return { rep, closedMtd, pipeline, goal, pctToGoal, tone };
    }).sort((a, b) => b.closedMtd - a.closedMtd);
  }, [sales, team, repGoals]);

  const hasAnyGoal = rows.some(r => r.goal > 0);

  return (
    <DashboardModule
      id="rep-leaderboard"
      userId={userId}
      title="Sales Leaderboard"
      subtitle={`${rows.length} active ${rows.length === 1 ? "rep" : "reps"} this month`}
      empty={rows.length === 0}
      emptyText="No active salespeople."
    >
      {/* Header row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1.4fr 1fr 1fr 90px",
        gap: 10,
        padding: "4px 10px 6px",
        fontSize: FS.micro, fontWeight: FW.heavy,
        color: Z.tm, fontFamily: COND,
        textTransform: "uppercase", letterSpacing: 0.6,
        borderBottom: `1px solid ${Z.bd}`,
      }}>
        <div>Rep</div>
        <div style={{ textAlign: "right" }}>MTD Closed</div>
        <div style={{ textAlign: "right" }}>Pipeline</div>
        <div style={{ textAlign: "right" }}>% Goal</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map(r => (
          <div
            key={r.rep.id}
            onClick={() => onOpenMember?.(r.rep.id)}
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr 1fr 90px",
              gap: 10,
              padding: "10px",
              alignItems: "center",
              borderBottom: `1px solid ${Z.bd}`,
              cursor: onOpenMember ? "pointer" : "default",
              transition: "background 0.12s",
              fontSize: FS.sm,
            }}
            onMouseOver={e => { if (onOpenMember) e.currentTarget.style.background = Z.sa; }}
            onMouseOut={e => { e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{
              color: Z.tx, fontWeight: FW.semi,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{r.rep.name}</div>
            <div style={{ color: Z.tx, fontFamily: COND, fontWeight: FW.bold, textAlign: "right" }}>
              {fmtCurrency(r.closedMtd)}
            </div>
            <div style={{ color: Z.tm, fontFamily: COND, textAlign: "right" }}>
              {fmtCurrency(r.pipeline)}
            </div>
            <div style={{ textAlign: "right" }}>
              {r.pctToGoal === null ? (
                <span style={{ color: Z.tm, fontFamily: COND, fontSize: FS.xs }}>—</span>
              ) : (
                <span style={{ color: r.tone, fontWeight: FW.black, fontFamily: COND }}>
                  {Math.round(r.pctToGoal * 100)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {!hasAnyGoal && (
        <div style={{
          padding: "8px 10px", marginTop: 6,
          fontSize: FS.xs, color: Z.tm, fontFamily: COND,
          fontStyle: "italic",
        }}>
          Per-rep monthly goals aren't set. Add them in Publications → Goals to enable pace tracking.
        </div>
      )}
    </DashboardModule>
  );
}
