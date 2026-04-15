// ============================================================
// WinsCard — celebrates what went right in the selected period.
// Used on the Performance page (one per tab) and also referenced
// by the Monday Morning Briefing to generate the weekly wins
// callout. Generic shape so each department can feed it whatever
// "win" means for them.
// ============================================================
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../../lib/theme";
import { GlassCard } from "../../components/ui";
import { fmtCurrencyWhole } from "../../lib/formatters";

export default function WinsCard({ title = "Wins", wins = [], footer }) {
  const hasWins = (wins || []).length > 0;
  return <GlassCard style={{ borderLeft: `3px solid ${Z.go}`, padding: 16 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
      <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.go, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>
        {title}
      </span>
      <span style={{ fontSize: FS.micro, color: Z.td, fontFamily: COND }}>{wins.length}</span>
    </div>
    {!hasWins && (
      <div style={{ padding: "12px 0", fontSize: FS.sm, color: Z.td, textAlign: "center" }}>
        Nothing to celebrate yet — keep going.
      </div>
    )}
    {hasWins && (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {wins.map(w => (
          <div key={w.id} style={{
            padding: "8px 10px",
            background: Z.ss || (Z.go + "10"),
            borderRadius: Ri,
            borderLeft: `2px solid ${Z.go}`,
          }}>
            <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.label}</span>
              {w.amount != null && <span style={{ color: Z.go, fontFamily: DISPLAY }}>{fmtCurrencyWhole(w.amount)}</span>}
            </div>
            {w.sub && <div style={{ fontSize: FS.micro, color: Z.tm, marginTop: 2 }}>{w.sub}</div>}
          </div>
        ))}
      </div>
    )}
    {footer && (
      <div style={{ marginTop: 10, fontSize: FS.micro, color: Z.td, fontFamily: COND }}>{footer}</div>
    )}
  </GlassCard>;
}

// Export the composing fn used by the Monday briefing so the dashboard and
// the briefing email/banner render the same lines.
export function winsBriefingLines(data) {
  const lines = [];
  const s = data?.sales;
  if (s?.wins?.length) {
    const total = s.wins.reduce((sum, w) => sum + (w.amount || 0), 0);
    lines.push(`Sales · ${s.wins.length} deals closed · ${fmtCurrencyWhole(total)}`);
  }
  const e = data?.editorial;
  if (e?.wins?.length) {
    lines.push(`Editorial · ${e.wins.length} stories shipped`);
  }
  const p = data?.production;
  if (p?.wins?.length) {
    lines.push(`Production · ${p.wins.length} items placed / on page`);
  }
  const a = data?.admin;
  if (a?.wins?.length) {
    lines.push(...a.wins.map(w => `Admin · ${w.label}`));
  }
  return lines;
}
