// IssueCard.jsx — single card in the Issue Cards Grid.
// Renders one issue's pacing tile with a left-border color set by
// the variance band (green/amber/red).

import { Z, COND, DISPLAY, FS, FW, R, Ri } from "../../../lib/theme";
import { fmtCurrencyWhole } from "../../../lib/formatters";

// Variance band → left-border color. Lifted from theme tokens so dark
// flips work without per-component conditionals.
const STATUS_COLOR = {
  green:   "go", // Z.go
  amber:   "wa", // Z.wa
  red:     "da", // Z.da
  unknown: "tm", // Z.tm
};

export default function IssueCard({
  publicationAbbrev,
  pressDate,
  daysToPress,
  actualPct,
  targetPct,
  revenueSold,
  revenueTarget,
  unitsSold,
  unitsTotal,
  status,                  // 'green' | 'amber' | 'red' | 'unknown'
  onClick,
}) {
  const colorKey = STATUS_COLOR[status] || "tm";
  const accent = Z[colorKey];

  // Days-to-deadline pill
  const dPillBg = (status === "red") ? Z.da + "18" : (status === "amber") ? Z.wa + "18" : Z.bg;
  const dPillText = (status === "red") ? Z.da : (status === "amber") ? Z.wa : Z.tm;
  const dPillLabel = daysToPress <= 0 ? "today" : daysToPress === 1 ? "1d" : `${daysToPress}d`;

  return (
    <div
      onClick={onClick}
      style={{
        // Match the Month at a Glance tile pattern: dark canvas tone
        // sits inside the lighter SectionCard chrome. Left border is
        // load-bearing (pacing-status color); no surrounding border.
        background: Z.bg,
        borderLeft: `3px solid ${accent}`,
        borderRadius: R,
        padding: "14px 16px",
        cursor: onClick ? "pointer" : "default",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {/* Header row: pub abbrev + press date | days-to-press pill */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tx, fontFamily: COND, letterSpacing: 0.3 }}>
          {publicationAbbrev || "—"} <span style={{ color: Z.tm, fontWeight: FW.semi }}>— {pressDate || "—"}</span>
        </div>
        <span style={{
          fontSize: FS.micro, fontWeight: FW.heavy, fontFamily: COND,
          padding: "2px 8px", borderRadius: 999,
          background: dPillBg, color: dPillText,
          textTransform: "uppercase", letterSpacing: 0.5,
        }}>
          {dPillLabel}
        </span>
      </div>

      {/* Big number: actual % / target % */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 28, fontWeight: FW.black, color: accent, fontFamily: DISPLAY, lineHeight: 1 }}>
          {actualPct == null ? "—" : `${actualPct}%`}
        </span>
        {targetPct != null && (
          <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
            / {targetPct}% target
          </span>
        )}
      </div>

      {/* Detail line: revenue + units */}
      <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
        {fmtCurrencyWhole(revenueSold || 0)}
        {revenueTarget ? ` / ${fmtCurrencyWhole(revenueTarget)}` : ""}
        {(unitsSold != null || unitsTotal != null) && (
          <> · {unitsSold ?? 0}/{unitsTotal ?? 0} units</>
        )}
      </div>
    </div>
  );
}
