import { Z, COND, DISPLAY, FS, FW, R } from "../../../../lib/theme";
import { Btn, GlassCard, Modal, Ic, cardSurface } from "../../../../components/ui";
import EntityThread from "../../../../components/EntityThread";
import { generatePdf } from "../../../../lib/pdf";
import { supabase } from "../../../../lib/supabase";
import { cn as cnHelper, pn as pnHelper } from "../SalesCRM.helpers";

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
      <GlassCard style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS.sm, fontFamily: COND }}>
          <thead><tr style={{ borderBottom: `1px solid ${Z.bd}` }}>
            {[["Client", "client"], ["Publications", "pubs"], ["Value", "amount"], ["Closed", "date"], ["Salesperson", "rep"]].map(([label, key]) => (
              <th key={label} onClick={() => setClosedSort(prev => ({ key, dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc" }))} style={{ padding: "8px 12px", textAlign: label === "Value" ? "right" : "left", fontSize: FS.xs, fontWeight: FW.heavy, color: closedSort.key === key ? Z.ac : Z.td, textTransform: "uppercase", cursor: "pointer", userSelect: "none" }}>
                {label}{closedSort.key === key ? (closedSort.dir === "asc" ? " ▲" : " ▼") : ""}
              </th>
            ))}
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
      </GlassCard>

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
