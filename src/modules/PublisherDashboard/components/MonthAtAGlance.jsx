// MonthAtAGlance.jsx — bottom summary card. 4 metrics, drill-in to Financials.

import { Z, COND, DISPLAY, FS, FW, R } from "../../../lib/theme";
import { fmtCurrencyWhole } from "../../../lib/formatters";
import { MONTH_AT_A_GLANCE_BANDS } from "../constants";
import SectionCard from "./SectionCard";

const fmtKish = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1000) return `$${Math.round(v / 1000)}k`;
  return fmtCurrencyWhole(v);
};

function revenueTone(pct) {
  if (pct == null) return Z.tm;
  if (pct >= MONTH_AT_A_GLANCE_BANDS.REVENUE_GREEN_PCT) return Z.go;
  if (pct >= MONTH_AT_A_GLANCE_BANDS.REVENUE_AMBER_PCT) return Z.wa;
  return Z.da;
}

function arTone(amount) {
  const v = Number(amount) || 0;
  if (v < MONTH_AT_A_GLANCE_BANDS.AR_GREEN_MAX) return Z.go;
  if (v < MONTH_AT_A_GLANCE_BANDS.AR_AMBER_MAX) return Z.wa;
  return Z.da;
}

export default function MonthAtAGlance({
  revenue,
  revenueGoal,
  revenuePctOfGoal,
  net,
  netMarginPct,
  arOver60,
  arOver60Accounts,
  subscribersActive,
  subscribersNetChange,
  onOpenFinancials,
}) {
  const tile = (label, big, sub, color) => (
    <div style={{ flex: "1 1 0", padding: "14px 12px", background: Z.bg, borderRadius: R, textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: FW.black, color, fontFamily: DISPLAY, lineHeight: 1.1 }}>{big}</div>
      <div style={{ fontSize: 9, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const subDelta = Number(subscribersNetChange) || 0;
  const subTone = subDelta >= 0 ? Z.go : Z.da;
  const subSign = subDelta > 0 ? "+" : "";

  const openFinancials = onOpenFinancials && (
    <button
      onClick={onOpenFinancials}
      style={{
        background: "transparent",
        border: "none",
        color: Z.ac,
        fontSize: FS.xs,
        fontWeight: FW.bold,
        fontFamily: COND,
        cursor: "pointer",
        padding: 0,
      }}
    >
      Open Financials →
    </button>
  );

  return (
    <SectionCard title="Month at a Glance" controls={openFinancials}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {tile(
          "Revenue",
          fmtKish(revenue),
          revenuePctOfGoal != null ? `${revenuePctOfGoal}% of ${fmtKish(revenueGoal)} goal` : "no goal set",
          revenueTone(revenuePctOfGoal),
        )}
        {tile(
          "Net",
          fmtKish(net),
          netMarginPct != null ? `${netMarginPct}% margin` : "—",
          Z.tx,
        )}
        {tile(
          "AR > 60d",
          fmtKish(arOver60),
          `${arOver60Accounts || 0} account${arOver60Accounts === 1 ? "" : "s"}`,
          arTone(arOver60),
        )}
        {tile(
          "Subscribers",
          (subscribersActive ?? 0).toLocaleString(),
          `${subSign}${subDelta} net`,
          subTone,
        )}
      </div>
    </SectionCard>
  );
}
