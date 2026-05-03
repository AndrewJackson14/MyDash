import { Z, COND, DISPLAY, FS, FW, Ri, R, INV } from "../../../../lib/theme";
import { Btn, GlassCard, cardSurface } from "../../../../components/ui";
import { cn as cnHelper } from "../SalesCRM.helpers";

// Renewals tab — three-lane scoreboard ("Ready / Warm / At Risk") for
// clients flagged as Renewal or Lapsed. Score weights are stable
// across the lane. The scoring logic lives in this file because it's
// renewals-specific; if upsell uses spread elsewhere, lift to helpers.
function scoreRenewal(s) {
  let score = 50;
  if (s.clientStatus === "Renewal") score += 25;
  if (s.saleCount > 6) score += 15;
  else if (s.saleCount > 2) score += 5;
  if (s.totalSpend > 5000) score += 15;
  else if (s.totalSpend > 1000) score += 5;
  if (s.pubCount > 1) score += 10;
  const daysSince = s.lastDate ? Math.floor((new Date() - new Date(s.lastDate)) / 86400000) : 999;
  if (daysSince < 60) score += 10;
  else if (daysSince > 365) score -= 30;
  else if (daysSince > 180) score -= 15;
  return Math.min(100, Math.max(0, score));
}

export default function RenewalsTab({
  renewalsDue, sales, pubs, clientsById,
  navTo, openRenewalProposal,
}) {
  const cn = (id) => cnHelper(id, clientsById);
  const scored = renewalsDue.map(s => ({ ...s, score: scoreRenewal(s) }));
  const ready = scored.filter(s => s.score >= 80).slice(0, 25);
  const warm = scored.filter(s => s.score >= 40 && s.score < 80).slice(0, 25);
  const atRisk = scored.filter(s => s.score < 40).slice(0, 25);
  const totalRenewRev = scored.reduce((s, x) => s + (x.totalSpend || x.amount || 0), 0);
  const totalReady = scored.filter(s => s.score >= 80).length;
  const totalWarm = scored.filter(s => s.score >= 40 && s.score < 80).length;
  const totalAtRisk = scored.filter(s => s.score < 40).length;

  const lanes = [
    { label: "Ready to Renew", items: ready, total: totalReady, color: Z.ac, action: "Send Renewal" },
    { label: "Warm Up Needed", items: warm, total: totalWarm, color: Z.wa, action: "Schedule Check-in" },
    { label: "At Risk", items: atRisk, total: totalAtRisk, color: Z.da, action: "Review Account" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Scoreboard */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {[
          ["Renewal Revenue", "$" + (totalRenewRev / 1000).toFixed(0) + "K", Z.ac],
          ["Ready", String(totalReady), Z.ac],
          ["Warm Up", String(totalWarm), Z.wa],
          ["At Risk", String(totalAtRisk), totalAtRisk > 0 ? Z.da : Z.ac],
        ].map(([l, v]) => (
          <div key={l} style={{ ...cardSurface(), borderRadius: R, padding: "10px 14px" }}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>{l}</div>
            <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{v}</div>
          </div>
        ))}
      </div>

      {scored.length === 0 && (
        <GlassCard style={{ textAlign: "center", padding: 20, color: Z.ac, fontSize: FS.lg, fontWeight: FW.bold }}>
          All caught up — no renewals due
        </GlassCard>
      )}

      {/* Lanes */}
      {lanes.map(lane => lane.items.length === 0 ? null : (
        <div key={lane.label}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0 4px", borderBottom: `2px solid ${lane.color}` }}>
            <span style={{ fontSize: FS.lg, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{lane.label}</span>
            <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: INV.light, background: lane.color, padding: "1px 7px", borderRadius: R }}>
              {lane.items.length}{lane.total > lane.items.length ? ` of ${lane.total}` : ""}
            </span>
          </div>
          {lane.items.slice(0, 25).map(s => {
            const clientSales = sales.filter(x => x.clientId === s.clientId && x.status === "Closed");
            const activePubs = new Set(clientSales.map(x => x.publication));
            const otherPubs = pubs.filter(p => !activePubs.has(p.id));
            return (
              <div key={s.clientId || s.id} style={{ ...cardSurface(), borderRadius: R, padding: 16, marginTop: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: FS.lg, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{cn(s.clientId)}</span>
                    <div style={{ fontSize: FS.sm, color: Z.tm }}>
                      ${(s.totalSpend || s.amount || 0).toLocaleString()} total · {s.saleCount || 1} orders · {s.pubCount || 1} pub{(s.pubCount || 1) > 1 ? "s" : ""}
                    </div>
                    <div style={{ fontSize: FS.xs, color: Z.td }}>Last: {s.lastDate || s.date}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: lane.color }}>{s.score}</div>
                    <div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase" }}>score</div>
                  </div>
                </div>
                {otherPubs.length > 0 && (
                  <div style={{ marginTop: 4, padding: "6px 10px", background: Z.bg, borderRadius: Ri, fontSize: FS.xs, color: Z.tm }}>
                    Cross-sell: {otherPubs.slice(0, 3).map(p => p.name).join(", ")}
                  </div>
                )}
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  <Btn sm onClick={() => openRenewalProposal(s.clientId)}>{lane.action}</Btn>
                  <Btn sm v="secondary" onClick={() => navTo("Clients", s.clientId)}>Profile</Btn>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
