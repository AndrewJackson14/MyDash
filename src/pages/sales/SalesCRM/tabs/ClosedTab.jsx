import { useMemo } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../../../../lib/theme";
import { Btn, EmptyState, GlassCard, Modal, Ic, cardSurface } from "../../../../components/ui";
import EntityThread from "../../../../components/EntityThread";
import { generatePdf } from "../../../../lib/pdf";
import { supabase } from "../../../../lib/supabase";
import { cn as cnHelper, pn as pnHelper } from "../SalesCRM.helpers";
import { REP_COLORS } from "../SalesCRM.constants";

// Closed tab — last-30-day deal tape sourced from contracts (one row per
// contract, not per sale). Keeps its sort/filter/scroll state independent
// of the contract-detail modal that overlays the table.
//
// Wave 2: extracted from SalesCRM monolith. The contract-detail modal stays
// inside this tab because its lifecycle is fully owned by the deal table —
// nothing else opens it.
export default function ClosedTab({
  contracts, contractsLoaded, loadContracts,
  sales, closedSales, invoices, issues, pubs, clientsById, team,
  setContracts, setSales, setViewContractId, viewContractId,
  fPub, closedRep, closedSearch, closedSort, setClosedSort, showCancelled,
  lostReasonFilter, setLostReasonFilter,
  dialog,
}) {
  // Idempotent — appData's loadContracts gates on contractsLoaded itself.
  if (!contractsLoaded && loadContracts) loadContracts();

  const cn = (id) => cnHelper(id, clientsById);
  const pn = (id) => pnHelper(id, pubs);
  const repName = (tid) => (team || []).find(t => t.id === tid)?.name || "—";
  const d30s = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const deals = (contracts || []).map(c => {
    const pubIds = [...new Set((c.lines || []).map(l => l.pubId))];
    const pubAbbrevs = pubIds.map(pid => { const n = pn(pid); return n.length > 15 ? n.split(" ").map(w => w[0]).join("") : n; }).join(", ");
    const closedDate = c.startDate || "";
    return { ...c, pubAbbrevs, pubIds, closedDate };
  });

  let filtered = showCancelled ? deals : deals.filter(c => c.status !== "cancelled");
  filtered = filtered.filter(c => (c.closedDate || "") >= d30s);
  if (fPub !== "all") filtered = filtered.filter(c => c.pubIds.includes(fPub));
  if (closedRep !== "all") filtered = filtered.filter(c => c.assignedTo === closedRep);
  if (closedSearch) {
    const q = closedSearch.toLowerCase();
    filtered = filtered.filter(c => cn(c.clientId).toLowerCase().includes(q) || c.pubAbbrevs.toLowerCase().includes(q) || (c.name || "").toLowerCase().includes(q));
  }

  const sortDir = closedSort.dir === "asc" ? 1 : -1;
  const getSortVal = (c) => {
    if (closedSort.key === "client") return cn(c.clientId);
    if (closedSort.key === "amount") return c.totalValue || 0;
    if (closedSort.key === "date") return c.closedDate || "";
    if (closedSort.key === "rep") return repName(c.assignedTo);
    if (closedSort.key === "pubs") return c.pubAbbrevs || "";
    return "";
  };
  filtered.sort((a, b) => {
    const av = getSortVal(a), bv = getSortVal(b);
    if (typeof av === "number") return (av - bv) * sortDir;
    return String(av).localeCompare(String(bv)) * sortDir;
  });

  const totalRev = filtered.reduce((s, c) => s + (c.totalValue || 0), 0);
  const repRevs = {};
  filtered.forEach(c => { if (c.assignedTo) { const rn = repName(c.assignedTo); repRevs[rn] = (repRevs[rn] || 0) + (c.totalValue || 0); } });
  const topRep = Object.entries(repRevs).sort((a, b) => b[1] - a[1])[0];

  // Wave 3 Task 3.11 — per-rep stacked bar visible only when no rep
  // filter is active. Uses contract value (same dataset the table
  // shows) so the bar's slices always match the visible deals.
  const repBreakdown = useMemo(() => {
    if (closedRep !== "all") return null;
    const total = Object.values(repRevs).reduce((a, b) => a + b, 0);
    if (!total) return null;
    return Object.entries(repRevs)
      .sort((a, b) => b[1] - a[1])
      .map(([rep, amt]) => ({ rep, amt, pct: amt / total }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closedRep, JSON.stringify(repRevs)]);

  // Wave 3 Task 3.2 — lost-reasons summary. Sales-side (status="Lost"
  // never become contracts), so this is a parallel dataset to the
  // deal table. Hidden when a rep filter is active to keep manager
  // overview vs. rep view distinct.
  const lostReasonsAgg = useMemo(() => {
    if (closedRep !== "all") return null;
    const lostSales = (sales || []).filter(s => s.status === "Lost" && s.lostReason);
    if (lostSales.length === 0) return null;
    const counts = {};
    lostSales.forEach(s => {
      counts[s.lostReason] = (counts[s.lostReason] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [sales, closedRep]);

  // Lost deals panel — surfaces only when a reason chip is active.
  // Lets the manager see which clients to revisit, not just the
  // aggregate count.
  const lostDealsForReason = useMemo(() => {
    if (!lostReasonFilter) return [];
    return (sales || [])
      .filter(s => s.status === "Lost" && s.lostReason === lostReasonFilter)
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }, [sales, lostReasonFilter]);

  const viewContract = viewContractId ? (contracts || []).find(c => c.id === viewContractId) : null;
  const contractSalesForView = viewContract ? closedSales.filter(s => s.contractId === viewContract.id) : [];
  const pubGroups = {};
  if (viewContract) (viewContract.lines || []).forEach(l => { const pk = l.pubId || "other"; if (!pubGroups[pk]) pubGroups[pk] = []; pubGroups[pk].push(l); });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {[
          ["Revenue", "$" + (totalRev >= 1000 ? (totalRev / 1000).toFixed(0) + "K" : totalRev.toLocaleString())],
          ["Deals Closed", String(filtered.length)],
          ["Avg Deal", "$" + Math.round(totalRev / Math.max(1, filtered.length)).toLocaleString()],
          ["Top Seller", topRep ? topRep[0].split(" ")[0] : "—"],
        ].map(([l, v]) => (
          <div key={l} style={{ ...cardSurface(), borderRadius: R, padding: "12px 16px" }}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>{l}</div>
            <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{v}</div>
            {l === "Top Seller" && topRep && <div style={{ fontSize: FS.xs, color: Z.tm }}>${(topRep[1] / 1000).toFixed(0)}K revenue</div>}
          </div>
        ))}
      </div>
      {!contractsLoaded && <div style={{ padding: 16, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>Loading...</div>}

      {/* Wave 3 Task 3.11 — per-rep revenue stacked bar. Only when no
          rep filter; shows the same revenue the table aggregates. */}
      {repBreakdown && repBreakdown.length > 0 && (
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Revenue by rep</div>
          <div style={{ display: "flex", height: 18, borderRadius: Ri, overflow: "hidden", border: `1px solid ${Z.bd}` }}>
            {repBreakdown.map(({ rep, pct, amt }, i) => (
              <div
                key={rep}
                title={`${rep}: $${amt.toLocaleString()} (${(pct * 100).toFixed(0)}%)`}
                style={{ width: `${pct * 100}%`, background: REP_COLORS[i % REP_COLORS.length] }}
              />
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6 }}>
            {repBreakdown.map(({ rep, amt }, i) => (
              <span key={rep} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
                <span style={{ width: 10, height: 10, background: REP_COLORS[i % REP_COLORS.length], borderRadius: 2, display: "inline-block" }} />
                {rep} · ${amt.toLocaleString()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Wave 3 Task 3.2 — top-5 lost reasons. Click a chip to drill
          into the matching lost deals (panel below the contracts table). */}
      {lostReasonsAgg && lostReasonsAgg.length > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Lost reasons (top 5)</span>
            {lostReasonFilter && (
              <button onClick={() => setLostReasonFilter(null)} style={{ background: "none", border: "none", color: Z.tm, fontSize: FS.xs, cursor: "pointer", fontFamily: COND }}>Clear</button>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {lostReasonsAgg.map(([reason, count]) => {
              const active = lostReasonFilter === reason;
              return (
                <button
                  key={reason}
                  onClick={() => setLostReasonFilter(active ? null : reason)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: Ri,
                    border: `1px solid ${active ? Z.da : Z.bd}`,
                    background: active ? Z.da + "15" : "transparent",
                    color: active ? Z.da : Z.tx,
                    cursor: "pointer",
                    fontSize: FS.xs,
                    fontWeight: FW.bold,
                    fontFamily: COND,
                  }}
                >
                  {reason} <span style={{ color: Z.td, fontWeight: FW.semi, marginLeft: 4 }}>· {count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Wave 4 Task 4.5 — scrollable wrapper enables position: sticky on
          the thead row. Without an overflow-auto ancestor, sticky has
          no scroll container to stick to and falls back to static. */}
      <GlassCard style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS.sm, fontFamily: COND }}>
          <thead><tr style={{ borderBottom: `1px solid ${Z.bd}`, position: "sticky", top: 0, zIndex: 2, background: Z.sa, boxShadow: `0 1px 0 0 ${Z.bd}` }}>
            {[["Client", "client"], ["Publications", "pubs"], ["Value", "amount"], ["Closed", "date"], ["Salesperson", "rep"]].map(([label, key]) => {
              const active = closedSort.key === key;
              const isVal = label === "Value";
              return (
                <th key={label} onClick={() => setClosedSort(prev => ({ key, dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc" }))} style={{ padding: "8px 12px", textAlign: isVal ? "right" : "left", fontSize: FS.xs, fontWeight: FW.heavy, color: active ? Z.ac : Z.td, textTransform: "uppercase", cursor: "pointer", userSelect: "none", position: "sticky", top: 0, background: Z.sa }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, justifyContent: isVal ? "flex-end" : "flex-start", width: "100%" }}>
                    {label}
                    {active && (closedSort.dir === "asc" ? <Ic.chevronUp size={11} /> : <Ic.chevronDown size={11} />)}
                  </span>
                </th>
              );
            })}
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: Z.td }}>No deals in this period</td></tr>
              : filtered.slice(0, 100).map(c => (
                <tr key={c.id} onClick={() => setViewContractId(c.id)} style={{ cursor: "pointer", borderBottom: `1px solid ${Z.bd}15` }}
                  onMouseEnter={e => e.currentTarget.style.background = Z.sa} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "8px 12px", fontWeight: FW.semi, color: Z.tx }}>{cn(c.clientId)}</td>
                  <td style={{ padding: "8px 12px", color: Z.tm, fontSize: FS.xs }}>{c.pubAbbrevs}</td>
                  <td style={{ padding: "8px 12px", fontWeight: FW.bold, color: Z.tx, textAlign: "right" }}>${(c.totalValue || 0).toLocaleString()}</td>
                  <td style={{ padding: "8px 12px", color: Z.tm }}>{c.closedDate}</td>
                  <td style={{ padding: "8px 12px", color: Z.tm }}>{c.assignedTo ? repName(c.assignedTo) : "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {filtered.length > 100 && <div style={{ padding: 8, textAlign: "center", fontSize: FS.xs, color: Z.td }}>Showing 100 of {filtered.length}</div>}
        </div>
      </GlassCard>

      {/* Wave 3 Task 3.2 — drilldown panel when a lost-reason chip is
          active. Surfaces the actual lost deals (sales-side, status=Lost),
          not contracts, so the manager can revisit the clients. */}
      {lostReasonFilter && lostDealsForReason.length > 0 && (
        <GlassCard>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>
              Lost deals — {lostReasonFilter} ({lostDealsForReason.length})
            </span>
            <Btn sm v="ghost" onClick={() => setLostReasonFilter(null)}><Ic.x size={11} /> Clear</Btn>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {lostDealsForReason.slice(0, 50).map(s => (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px 80px", gap: 10, padding: "5px 10px", background: Z.bg, borderRadius: Ri, fontSize: FS.sm }}>
                <span style={{ color: Z.tx, fontWeight: FW.semi }}>{cn(s.clientId)}</span>
                <span style={{ color: Z.tm, fontSize: FS.xs }}>{pn(s.publication)}</span>
                <span style={{ color: Z.tm, fontSize: FS.xs }}>{(s.updatedAt || "").slice(0, 10)}</span>
                <span style={{ color: Z.tx, fontWeight: FW.bold, textAlign: "right" }}>${(s.amount || 0).toLocaleString()}</span>
              </div>
            ))}
            {lostDealsForReason.length > 50 && <div style={{ padding: 6, textAlign: "center", fontSize: FS.xs, color: Z.td }}>Showing 50 of {lostDealsForReason.length}</div>}
          </div>
        </GlassCard>
      )}

      <Modal
        open={!!viewContract}
        onClose={() => setViewContractId(null)}
        title={viewContract ? `${cn(viewContract.clientId)} — ${viewContract.name || "Contract"}` : ""}
        width={1100}
        actions={viewContract ? <>
          <Btn sm v="secondary" onClick={async () => {
            try { await generatePdf("contract", viewContract.id); }
            catch (err) { console.error("Contract PDF failed:", err); await dialog.alert(`PDF download failed: ${err.message || "Unknown error"}`); }
          }}><Ic.download size={12} /> Download PDF</Btn>
          {viewContract.status === "active" && <Btn sm v="ghost" onClick={async () => {
            const reason = await dialog.prompt("Cancellation reason:");
            if (!reason) return;
            const csForCheck = (sales || []).filter(s => s.contractId === viewContract.id && s.status === "Closed");
            const invoicedSaleIds = new Set((invoices || []).filter(inv => inv.status !== "void" && inv.status !== "paid").flatMap(inv => inv.saleId ? [inv.saleId] : []));
            const unpressedInvoiced = csForCheck.filter(s => {
              if (!invoicedSaleIds.has(s.id)) return false;
              const iss = (issues || []).find(i => i.id === s.issueId);
              return !iss?.sentToPressAt;
            });
            if (unpressedInvoiced.length > 0) {
              const ok = await dialog.confirm(`${unpressedInvoiced.length} order${unpressedInvoiced.length > 1 ? "s have" : " has"} been invoiced but not sent to press. Cancelling will void ${unpressedInvoiced.length === 1 ? "this invoice" : "these invoices"}. Are you sure you want to delete the invoiced order${unpressedInvoiced.length > 1 ? "s" : ""}?`);
              if (!ok) return;
            }
            const { data, error } = await supabase.rpc("cancel_contract", { p_contract_id: viewContract.id, p_reason: reason });
            if (error) { await dialog.alert("Error: " + error.message); return; }
            if (data?.error) { await dialog.alert(data.error); return; }
            if (setContracts) setContracts(prev => prev.map(c => c.id === viewContract.id ? { ...c, status: "cancelled" } : c));
            setSales(prev => prev.map(s => s.contractId === viewContract.id && s.status === "Closed" ? { ...s, status: "Cancelled" } : s));
            await dialog.alert(`Contract cancelled. ${data.sales_cancelled} sales, ${data.projects_cancelled} ad projects, ${data.invoices_voided} invoices, ${data.commissions_reversed || 0} commissions reversed.`);
            setViewContractId(null);
          }} style={{ color: Z.da }}>Cancel Contract</Btn>}
          {viewContract.status === "cancelled" && <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.da }}>Cancelled</span>}
          <Btn sm v="ghost" onClick={() => setViewContractId(null)}>Close</Btn>
        </> : null}
      >
        {viewContract && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
            {[
              ["Client", cn(viewContract.clientId)],
              ["Status", (viewContract.status || "").charAt(0).toUpperCase() + (viewContract.status || "").slice(1)],
              ["Term", `${viewContract.startDate || "?"} → ${viewContract.endDate || "?"}`],
              ["Value", `$${(viewContract.totalValue || 0).toLocaleString()}`],
              ["Salesperson", viewContract.assignedTo ? repName(viewContract.assignedTo) : "—"],
            ].map(([l, v]) => (
              <div key={l} style={{ ...cardSurface(), borderRadius: R, padding: 12 }}>
                <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5 }}>{l}</div>
                <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx, marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>
          {Object.entries(pubGroups).map(([pubId, lines]) => (
            <GlassCard key={pubId}>
              <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{pn(pubId) || pubId}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {lines.map((l, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 60px 80px", gap: 6, padding: "5px 8px", background: Z.bg, borderRadius: R }}>
                    <span style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{l.adSize}</span>
                    <span style={{ fontSize: FS.sm, color: Z.tm, textAlign: "center" }}>×{l.quantity || 1}</span>
                    <span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx, textAlign: "right" }}>${(l.lineTotal || l.rate || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          ))}
          {contractSalesForView.length > 0 && <GlassCard>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Sales Orders ({contractSalesForView.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {contractSalesForView.sort((a, b) => (a.date || "").localeCompare(b.date || "")).map(s => (
                <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 80px", gap: 6, padding: "4px 8px", background: Z.bg, borderRadius: R, fontSize: FS.sm }}>
                  <span style={{ color: Z.tm }}>{pn(s.publication)}</span>
                  <span style={{ color: Z.tm }}>{s.size || s.type}</span>
                  <span style={{ color: Z.tm }}>{s.date}</span>
                  <span style={{ fontWeight: FW.bold, color: Z.tx, textAlign: "right" }}>${(s.amount || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </GlassCard>}
          <EntityThread
            refType="contract"
            refId={viewContract.id}
            title={`Contract: ${cn(viewContract.clientId) || viewContract.id}`}
            team={team}
            height={320}
          />
        </div>}
      </Modal>
    </div>
  );
}
