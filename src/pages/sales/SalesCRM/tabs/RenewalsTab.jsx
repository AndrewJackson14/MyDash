import { useMemo, useState } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R, INV } from "../../../../lib/theme";
import { Btn, EmptyState, GlassCard, Ic, Sel, cardSurface } from "../../../../components/ui";
import { cn as cnHelper } from "../SalesCRM.helpers";

// Renewals tab — three-lane scoreboard ("Ready / Warm / At Risk") for
// clients flagged as Renewal or Lapsed. Score weights are stable
// across the lane. Wave 3 added pub/rep/window filters + sort + reset
// so multi-pub overlapping renewal cycles can be triaged.
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

// Days from today until contract expiry. Negative = already expired.
// Lapsed clients without a contractEndDate get +Infinity so the window
// filter never excludes them (they're always "no contract" candidates).
function daysUntilExpiry(contractEndDate) {
  if (!contractEndDate) return Infinity;
  return Math.floor((new Date(contractEndDate) - new Date()) / 86400000);
}

const SORT_OPTIONS = [
  { value: "score", label: "Score (highest first)" },
  { value: "expiry", label: "Expiry date" },
  { value: "client", label: "Client name" },
  { value: "spend", label: "Lifetime spend" },
];

export default function RenewalsTab({
  renewalsDue, sales, pubs, team, clientsById,
  navTo, openRenewalProposal,
}) {
  const cn = (id) => cnHelper(id, clientsById);

  // Wave 3 Task 3.5 — filter state
  const [renewalsRep, setRenewalsRep] = useState("all");
  const [renewalsPub, setRenewalsPub] = useState("all");
  const [renewalsWindow, setRenewalsWindow] = useState("any"); // "30" | "60" | "90" | "any"
  const [renewalsSort, setRenewalsSort] = useState("score");

  const filtersActive = renewalsRep !== "all" || renewalsPub !== "all" || renewalsWindow !== "any" || renewalsSort !== "score";
  const resetFilters = () => {
    setRenewalsRep("all");
    setRenewalsPub("all");
    setRenewalsWindow("any");
    setRenewalsSort("score");
  };

  // Score everything once, then filter, then sort. Pub filter checks the
  // last-publication-bought (publication on the row); a multi-pub client
  // gets matched on its most-recent ad pub. Rep filter looks up via
  // clientsById since renewalsDue rows don't carry repId.
  const scored = useMemo(() => {
    const all = renewalsDue.map(r => ({
      ...r,
      score: scoreRenewal(r),
      repId: clientsById?.get?.(r.clientId)?.repId || null,
      daysToExpiry: daysUntilExpiry(r.contractEndDate),
    }));
    const filtered = all.filter(r => {
      if (renewalsRep !== "all" && r.repId !== renewalsRep) return false;
      if (renewalsPub !== "all" && r.publication !== renewalsPub) return false;
      if (renewalsWindow !== "any") {
        const max = Number(renewalsWindow);
        // Lapsed (Infinity) excluded when window narrows; include when "any"
        if (r.daysToExpiry === Infinity || r.daysToExpiry > max) return false;
      }
      return true;
    });
    const cmp = {
      score:  (a, b) => b.score - a.score,
      expiry: (a, b) => (a.daysToExpiry === Infinity ? 1 : b.daysToExpiry === Infinity ? -1 : a.daysToExpiry - b.daysToExpiry),
      client: (a, b) => (cn(a.clientId) || "").localeCompare(cn(b.clientId) || ""),
      spend:  (a, b) => (b.totalSpend || 0) - (a.totalSpend || 0),
    }[renewalsSort] || ((a, b) => b.score - a.score);
    return [...filtered].sort(cmp);
  }, [renewalsDue, clientsById, renewalsRep, renewalsPub, renewalsWindow, renewalsSort, cn]);

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

  const repOptions = [
    { value: "all", label: "All Reps" },
    ...(team || []).filter(t => t.permissions?.includes("sales") || t.permissions?.includes("admin")).map(t => ({ value: t.id, label: t.name })),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Scoreboard */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {[
          ["Renewal Revenue", "$" + (totalRenewRev / 1000).toFixed(0) + "K"],
          ["Ready", String(totalReady)],
          ["Warm Up", String(totalWarm)],
          ["At Risk", String(totalAtRisk)],
        ].map(([l, v]) => (
          <div key={l} style={{ ...cardSurface(), borderRadius: R, padding: "10px 14px" }}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>{l}</div>
            <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Wave 3 Task 3.5 — filter row. Inline with the scoreboard's
          visual rhythm — small selects, no chrome card. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <Sel value={renewalsPub} onChange={e => setRenewalsPub(e.target.value)} options={[{ value: "all", label: "All Publications" }, ...pubs.map(p => ({ value: p.id, label: p.name }))]} />
        <Sel value={renewalsRep} onChange={e => setRenewalsRep(e.target.value)} options={repOptions} />
        <Sel value={renewalsWindow} onChange={e => setRenewalsWindow(e.target.value)} options={[
          { value: "any", label: "Any window" },
          { value: "30",  label: "Expiring ≤30d" },
          { value: "60",  label: "Expiring ≤60d" },
          { value: "90",  label: "Expiring ≤90d" },
        ]} />
        <Sel value={renewalsSort} onChange={e => setRenewalsSort(e.target.value)} options={SORT_OPTIONS} />
        {filtersActive && <Btn sm v="ghost" onClick={resetFilters} title="Clear renewal filters"><Ic.x size={11} /> Clear filters</Btn>}
      </div>

      {scored.length === 0 && (
        <EmptyState
          icon="✅"
          title={filtersActive ? "No renewals match these filters" : "All caught up"}
          body={filtersActive
            ? "Try widening the window or clearing filters."
            : "No upcoming renewals. We'll surface clients here as their contract end-date approaches or they go Lapsed."
          }
          action={filtersActive ? <Btn sm v="ghost" onClick={resetFilters}>Clear filters</Btn> : null}
        />
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
                    <div style={{ fontSize: FS.xs, color: Z.td }}>
                      Last: {s.lastDate || s.date}
                      {s.contractEndDate && (
                        <span style={{ marginLeft: 8, color: s.daysToExpiry < 30 ? Z.da : s.daysToExpiry < 60 ? Z.wa : Z.tm }}>
                          · expires {s.contractEndDate}
                          {s.daysToExpiry !== Infinity && ` (${s.daysToExpiry < 0 ? Math.abs(s.daysToExpiry) + "d ago" : "in " + s.daysToExpiry + "d"})`}
                        </span>
                      )}
                    </div>
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
