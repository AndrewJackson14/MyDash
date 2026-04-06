import { useState, useMemo, useEffect } from "react";
import { Z, COND, DISPLAY, R, Ri, FS, FW, CARD } from "../../lib/theme";
import { Ic, Btn, Inp, Sel, Badge, GlassCard, PageHeader, TabRow, TB, TabPipe, DataTable, Modal, SB } from "../../components/ui";

const STATUS_COLORS = { active: Z.su || "#22C55E", completed: Z.tm, cancelled: Z.da };

const Contracts = ({ contracts, clients, pubs, sales, team, onNavigate, loadContracts, contractsLoaded }) => {
  const [tab, setTab] = useState("Active");
  const [sr, setSr] = useState("");
  const [viewId, setViewId] = useState(null);

  // Lazy load contracts when page is first opened
  useEffect(() => {
    if (loadContracts && !contractsLoaded) loadContracts();
  }, [loadContracts, contractsLoaded]);

  // Lookup maps
  const clientMap = useMemo(() => { const m = {}; (clients || []).forEach(c => { m[c.id] = c; }); return m; }, [clients]);
  const pubMap = useMemo(() => { const m = {}; (pubs || []).forEach(p => { m[p.id] = p.name; }); return m; }, [pubs]);
  const repMap = useMemo(() => { const m = {}; (team || []).forEach(t => { m[t.id] = t.name; }); return m; }, [team]);
  const cn = id => clientMap[id]?.name || "—";
  const pn = id => pubMap[id] || "—";
  const rn = id => repMap[id] || "—";

  // Sales per contract
  const salesByContract = useMemo(() => {
    const m = {};
    (sales || []).forEach(s => {
      if (s.contractId) {
        if (!m[s.contractId]) m[s.contractId] = [];
        m[s.contractId].push(s);
      }
    });
    return m;
  }, [sales]);

  // Filter contracts
  const filtered = useMemo(() => {
    let list = contracts || [];
    if (tab === "Active") list = list.filter(c => c.status === "active");
    else if (tab === "Completed") list = list.filter(c => c.status === "completed");
    else if (tab === "Cancelled") list = list.filter(c => c.status === "cancelled");
    if (sr) {
      const q = sr.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || cn(c.clientId).toLowerCase().includes(q));
    }
    return list.sort((a, b) => b.totalValue - a.totalValue);
  }, [contracts, tab, sr, clientMap]);

  // View contract detail
  const viewContract = (contracts || []).find(c => c.id === viewId);

  if (viewContract) {
    const contractSales = salesByContract[viewContract.id] || [];
    const client = clientMap[viewContract.clientId];
    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title={viewContract.name}>
        <Btn sm v="ghost" onClick={() => setViewId(null)}>← Back to Contracts</Btn>
      </PageHeader>

      {/* Contract summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        {[
          ["Client", cn(viewContract.clientId)],
          ["Status", viewContract.status.charAt(0).toUpperCase() + viewContract.status.slice(1)],
          ["Term", `${viewContract.startDate || "?"} → ${viewContract.endDate || "?"}`],
          ["Total Value", `$${viewContract.totalValue.toLocaleString()}`],
          ["Rep", rn(viewContract.assignedTo)],
        ].map(([l, v]) => <GlassCard key={l} style={{ padding: 12 }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5 }}>{l}</div>
          <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx, marginTop: 4 }}>{v}</div>
        </GlassCard>)}
      </div>

      {/* Contract lines */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Contract Lines</div>
        <DataTable>
          <thead><tr>
            <th>Publication</th><th>Ad Size</th><th>Qty</th><th>Rate</th><th>Line Total</th>
          </tr></thead>
          <tbody>
            {(viewContract.lines || []).map((ln, i) => <tr key={ln.id || i}>
              <td style={{ fontWeight: FW.semi, color: Z.tx }}>{pn(ln.pubId)}</td>
              <td style={{ color: Z.tm }}>{ln.adSize}</td>
              <td style={{ color: Z.tx }}>{ln.quantity}</td>
              <td style={{ color: Z.tm }}>${ln.rate.toLocaleString()}</td>
              <td style={{ fontWeight: FW.bold, color: Z.su || Z.tx }}>${ln.lineTotal.toLocaleString()}</td>
            </tr>)}
          </tbody>
        </DataTable>
      </GlassCard>

      {/* Linked sales */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
          Sales Orders ({contractSales.length})
        </div>
        {contractSales.length === 0
          ? <div style={{ fontSize: FS.base, color: Z.td, padding: 8 }}>No linked sales orders</div>
          : <DataTable>
            <thead><tr>
              <th>Date</th><th>Publication</th><th>Size</th><th>Amount</th><th>Status</th>
            </tr></thead>
            <tbody>
              {contractSales.sort((a, b) => (a.date || "").localeCompare(b.date || "")).slice(0, 50).map(s => <tr key={s.id}>
                <td style={{ color: Z.tm }}>{s.date}</td>
                <td style={{ fontWeight: FW.semi, color: Z.tx }}>{pn(s.publication)}</td>
                <td style={{ color: Z.tm }}>{s.size}</td>
                <td style={{ fontWeight: FW.bold, color: Z.tx }}>${(s.amount || 0).toLocaleString()}</td>
                <td><Badge status={s.status} small /></td>
              </tr>)}
              {contractSales.length > 50 && <tr><td colSpan={5} style={{ color: Z.td, fontSize: FS.sm }}>+ {contractSales.length - 50} more</td></tr>}
            </tbody>
          </DataTable>
        }
      </GlassCard>
    </div>;
  }

  // List view
  if (!contractsLoaded) return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="Contracts" />
    <GlassCard style={{ textAlign: "center", padding: 40 }}>
      <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tm }}>Loading contracts...</div>
      <div style={{ fontSize: FS.sm, color: Z.td, marginTop: 8 }}>This may take a moment for large datasets</div>
    </GlassCard>
  </div>;

  const activeCount = (contracts || []).filter(c => c.status === "active").length;
  const completedCount = (contracts || []).filter(c => c.status === "completed").length;
  const activeValue = (contracts || []).filter(c => c.status === "active").reduce((s, c) => s + c.totalValue, 0);

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="Contracts">
      <SB value={sr} onChange={setSr} placeholder="Search contracts..." />
    </PageHeader>

    <TabRow>
      <TB tabs={["Active", "Completed", "All"]} active={tab} onChange={setTab} />
    </TabRow>

    {/* Summary stats */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
      {[
        ["Active Contracts", activeCount, Z.su],
        ["Active Value", "$" + (activeValue / 1000).toFixed(0) + "K", Z.ac],
        ["Completed", completedCount, Z.tm],
        ["Total Contracts", (contracts || []).length, Z.tm],
      ].map(([l, v, c]) => <GlassCard key={l} style={{ padding: 12 }}>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5 }}>{l}</div>
        <div style={{ fontSize: 18, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{v}</div>
      </GlassCard>)}
    </div>

    {/* Contract list */}
    <DataTable>
      <thead><tr>
        <th>Contract</th><th>Client</th><th>Start</th><th>End</th><th>Value</th><th>Orders</th><th>Rep</th><th>Status</th>
      </tr></thead>
      <tbody>
        {filtered.slice(0, 100).map(c => {
          const orderCount = (salesByContract[c.id] || []).length;
          return <tr key={c.id} onClick={() => setViewId(c.id)}>
            <td style={{ fontWeight: FW.semi, color: Z.tx, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</td>
            <td style={{ color: Z.tx }}>{cn(c.clientId)}</td>
            <td style={{ color: Z.tm, fontSize: FS.sm }}>{c.startDate || "—"}</td>
            <td style={{ color: Z.tm, fontSize: FS.sm }}>{c.endDate || "—"}</td>
            <td style={{ fontWeight: FW.bold, color: Z.tx }}>${c.totalValue.toLocaleString()}</td>
            <td style={{ color: Z.tm }}>{orderCount}</td>
            <td style={{ color: Z.tm, fontSize: FS.sm }}>{rn(c.assignedTo)}</td>
            <td><Badge status={c.status === "active" ? "Active" : c.status === "completed" ? "Completed" : "Cancelled"} small /></td>
          </tr>;
        })}
      </tbody>
    </DataTable>
    {filtered.length > 100 && <div style={{ fontSize: FS.sm, color: Z.td, textAlign: "center" }}>Showing 100 of {filtered.length} contracts</div>}
  </div>;
};

export default Contracts;
