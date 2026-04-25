import { useState, useMemo, useEffect } from "react";
import { Z, COND, DISPLAY, R, Ri, FS, FW, CARD } from "../../lib/theme";
import { Ic, Btn, Inp, Sel, Badge, GlassCard, PageHeader, TabRow, TB, TabPipe, DataTable, Modal, SB } from "../../components/ui";
import { usePageHeader } from "../../contexts/PageHeaderContext";

const STATUS_COLORS = { active: Z.su || "#22C55E", completed: Z.tm, cancelled: Z.da };

// Mirror of AdProjects status palette so the inline pill matches the
// kanban column the project actually lives in.
const PROJECT_STATUS_META = {
  needs_brief:   { label: "Needs Brief",  color: Z.tm,           short: "Brief?" },
  brief:         { label: "Brief",        color: Z.wa || "#F59E0B", short: "Brief"   },
  awaiting_art:  { label: "Brief",        color: Z.wa || "#F59E0B", short: "Brief"   },
  designing:     { label: "Designing",    color: Z.ac,           short: "Design"  },
  proof_sent:    { label: "Proof Sent",   color: Z.pu || "#A855F7", short: "Proof"   },
  revising:      { label: "Revising",     color: Z.pu || "#A855F7", short: "Revise"  },
  approved:      { label: "Approved",     color: Z.go || "#B8923D", short: "OK"      },
  signed_off:    { label: "Signed Off",   color: Z.su || "#22C55E", short: "Off"     },
  placed:        { label: "Placed",       color: Z.su || "#22C55E", short: "Placed"  },
};

const Contracts = ({ contracts, clients, pubs, sales, team, jurisdiction, currentUser, onNavigate, loadContracts, contractsLoaded, deleteContract, bus, isActive, adProjects, adProjectBySaleId, loadAdProjects, adProjectsLoaded }) => {
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({ breadcrumb: [{ label: "Home" }, { label: "Contracts" }], title: "Contracts" });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);
  const [tab, setTab] = useState("Active");
  const [sr, setSr] = useState("");
  const [viewId, setViewId] = useState(null);
  const [sortCol, setSortCol] = useState("value");
  const [sortDir, setSortDir] = useState("desc");
  const [repFilter, setRepFilter] = useState("all");
  const doSort = (col) => { if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortCol(col); setSortDir("desc"); } };

  // Lazy load contracts when page is first opened
  useEffect(() => {
    if (loadContracts && !contractsLoaded) loadContracts();
  }, [loadContracts, contractsLoaded]);

  // Ad projects feed the new "Proof" column. Load opportunistically;
  // the column gracefully shows "—" until the data lands.
  useEffect(() => {
    if (loadAdProjects && !adProjectsLoaded) loadAdProjects();
  }, [loadAdProjects, adProjectsLoaded]);

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

  // Ad projects per contract — joined via the contract's sales. The
  // "headline" status is the most-urgent of the group: anything
  // proof_sent / revising bubbles up first (driver needs to act),
  // else needs_brief, else most-recent status.
  const projectsByContract = useMemo(() => {
    const m = {};
    const byId = adProjectBySaleId;
    if (!byId || !sales) return m;
    Object.entries(salesByContract).forEach(([cid, slist]) => {
      const projects = [];
      let hasNeedsBrief = false;
      slist.forEach(s => {
        const p = byId.get?.(s.id);
        if (p) projects.push({ ...p, _saleId: s.id, _pubId: s.publication, _date: s.date });
        else if (s.status === "Closed") hasNeedsBrief = true;
      });
      // Pick headline status by urgency.
      let headline = null;
      const order = ["proof_sent", "revising", "designing", "brief", "awaiting_art", "approved", "signed_off", "placed"];
      for (const st of order) {
        const hit = projects.find(p => p.status === st);
        if (hit) { headline = st; break; }
      }
      if (!headline && hasNeedsBrief) headline = "needs_brief";
      m[cid] = { projects, headline, count: projects.length, needsBriefCount: hasNeedsBrief && projects.length === 0 ? slist.filter(s => s.status === "Closed" && !byId.get?.(s.id)).length : 0 };
    });
    return m;
  }, [salesByContract, sales, adProjectBySaleId]);

  // Filter contracts — jurisdiction-aware
  const filtered = useMemo(() => {
    let list = contracts || [];
    // Salesperson: only show contracts assigned to them
    if (jurisdiction?.isSalesperson && currentUser?.id) {
      list = list.filter(c => c.assignedTo === currentUser.id);
    } else if (repFilter !== "all") {
      // Publisher / sales manager can filter by team member who sold
      list = list.filter(c => c.assignedTo === repFilter);
    }
    if (tab === "Active") list = list.filter(c => c.status === "active");
    else if (tab === "Completed") list = list.filter(c => c.status === "completed");
    else if (tab === "Cancelled") list = list.filter(c => c.status === "cancelled");
    if (sr) {
      const q = sr.toLowerCase();
      list = list.filter(c => (c.name || "").toLowerCase().includes(q) || cn(c.clientId).toLowerCase().includes(q));
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      const oc = (salesByContract[a.id] || []).length;
      const od = (salesByContract[b.id] || []).length;
      if (sortCol === "name") return dir * (a.name || "").localeCompare(b.name || "");
      if (sortCol === "client") return dir * cn(a.clientId).localeCompare(cn(b.clientId));
      if (sortCol === "start") return dir * (a.startDate || "").localeCompare(b.startDate || "");
      if (sortCol === "end") return dir * (a.endDate || "").localeCompare(b.endDate || "");
      if (sortCol === "value") return dir * (a.totalValue - b.totalValue);
      if (sortCol === "orders") return dir * (oc - od);
      if (sortCol === "rep") return dir * rn(a.assignedTo).localeCompare(rn(b.assignedTo));
      if (sortCol === "status") return dir * (a.status || "").localeCompare(b.status || "");
      return 0;
    });
  }, [contracts, tab, sr, clientMap, jurisdiction, currentUser, sortCol, sortDir, salesByContract, repFilter]);

  // View contract detail
  const viewContract = (contracts || []).find(c => c.id === viewId);

  if (viewContract) {
    const contractSales = salesByContract[viewContract.id] || [];
    const client = clientMap[viewContract.clientId];
    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader title={viewContract.name}>
        <Btn sm v="ghost" onClick={() => setViewId(null)}>← Back to Contracts</Btn>
        {bus && onNavigate && <Btn sm onClick={() => {
          // Drop to Billing with a fresh New Invoice modal pre-filled for this
          // contract's client. Billing listens on 'invoice.create' and wires
          // the rest of the invoice form flow.
          bus.emit("invoice.create", { clientId: viewContract.clientId, contractId: viewContract.id });
          onNavigate("billing");
        }}><Ic.plus size={12} /> Create Invoice</Btn>}
        {deleteContract && !jurisdiction?.isSalesperson && <Btn sm v="danger" onClick={async () => {
          const salesCount = (salesByContract[viewContract.id] || []).length;
          const msg = salesCount > 0
            ? `Delete "${viewContract.name}"? This contract has ${salesCount} sale${salesCount > 1 ? "s" : ""} linked to it. The sales will remain but lose their contract link. This cannot be undone.`
            : `Delete "${viewContract.name}"? This cannot be undone.`;
          if (!window.confirm(msg)) return;
          await deleteContract(viewContract.id);
          setViewId(null);
        }}><Ic.trash size={12} /> Delete Contract</Btn>}
      </PageHeader>

      {/* Contract summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        {[
          ["Client", cn(viewContract.clientId)],
          ["Status", viewContract.status.charAt(0).toUpperCase() + viewContract.status.slice(1)],
          ["Term", `${viewContract.startDate || "?"} → ${viewContract.endDate || "?"}`],
          ["Total Value", `$${Number(viewContract.totalValue || 0).toLocaleString()}`],
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

      {/* Ad projects (joined via this contract's sales) */}
      {(() => {
        const proof = projectsByContract[viewContract.id];
        if (!proof || (proof.count === 0 && proof.needsBriefCount === 0)) return null;
        return <GlassCard>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1 }}>
              Ad Projects ({proof.count}{proof.needsBriefCount > 0 ? ` · ${proof.needsBriefCount} need brief` : ""})
            </div>
            {onNavigate && <Btn sm v="ghost" onClick={() => onNavigate("adprojects")}>Open Ad Projects →</Btn>}
          </div>
          {proof.count > 0 ? <DataTable>
            <thead><tr>
              <th>Sale Date</th><th>Publication</th><th>Status</th><th>Revisions</th>
            </tr></thead>
            <tbody>
              {proof.projects.map(p => {
                const meta = PROJECT_STATUS_META[p.status] || { label: p.status, color: Z.tm };
                return <tr key={p.id} onClick={() => onNavigate?.("adprojects", { saleId: p._saleId })} style={{ cursor: onNavigate ? "pointer" : "default" }}>
                  <td style={{ color: Z.tm, fontSize: FS.sm }}>{p._date || "—"}</td>
                  <td style={{ fontWeight: FW.semi, color: Z.tx }}>{pn(p._pubId)}</td>
                  <td><span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: FS.xs, fontWeight: FW.heavy, color: meta.color, background: `${meta.color}18`, border: `1px solid ${meta.color}40` }}>{meta.label}</span></td>
                  <td style={{ color: Z.tm }}>{p.revision_count ?? 0}</td>
                </tr>;
              })}
            </tbody>
          </DataTable> : <div style={{ fontSize: FS.base, color: Z.da, padding: 8 }}>{proof.needsBriefCount} closed sale{proof.needsBriefCount > 1 ? "s" : ""} have no ad project yet — needs a brief.</div>}
        </GlassCard>;
      })()}

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
    <GlassCard style={{ textAlign: "center", padding: 40 }}>
      <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tm }}>Loading contracts...</div>
      <div style={{ fontSize: FS.sm, color: Z.td, marginTop: 8 }}>This may take a moment for large datasets</div>
    </GlassCard>
  </div>;

  const activeCount = (contracts || []).filter(c => c.status === "active").length;
  const completedCount = (contracts || []).filter(c => c.status === "completed").length;
  const activeValue = (contracts || []).filter(c => c.status === "active").reduce((s, c) => s + c.totalValue, 0);

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {/* Action row — title moved to TopBar via usePageHeader. */}
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <SB value={sr} onChange={setSr} placeholder="Search contracts..." />
      {!jurisdiction?.isSalesperson && <Sel value={repFilter} onChange={e => setRepFilter(e.target.value)} options={[{ value: "all", label: "All Reps" }, ...((team || []).filter(t => !t.isHidden && t.isActive !== false && ["Sales Manager", "Salesperson"].includes(t.role)).map(t => ({ value: t.id, label: t.name })))]} />}
    </div>

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
        {[["name","Contract"],["client","Client"],["start","Start"],["end","End"],["value","Value"],["orders","Orders"],["proof","Proof"],["rep","Rep"],["status","Status"]].map(([k,l]) => (
          <th key={k} onClick={() => doSort(k)} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
            {l}{sortCol === k && <span style={{ marginLeft: 3, fontSize: 9 }}>{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>}
          </th>
        ))}
      </tr></thead>
      <tbody>
        {filtered.slice(0, 100).map(c => {
          const orderCount = (salesByContract[c.id] || []).length;
          const proof = projectsByContract[c.id];
          const meta = proof?.headline ? PROJECT_STATUS_META[proof.headline] : null;
          return <tr key={c.id} onClick={() => setViewId(c.id)}>
            <td style={{ fontWeight: FW.semi, color: Z.tx, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</td>
            <td style={{ color: Z.tx }}>{cn(c.clientId)}</td>
            <td style={{ color: Z.tm, fontSize: FS.sm }}>{c.startDate || "—"}</td>
            <td style={{ color: Z.tm, fontSize: FS.sm }}>{c.endDate || "—"}</td>
            <td style={{ fontWeight: FW.bold, color: Z.tx }}>${Number(c.totalValue || 0).toLocaleString()}</td>
            <td style={{ color: Z.tm }}>{orderCount}</td>
            <td onClick={e => { if (meta && onNavigate) { e.stopPropagation(); onNavigate("adprojects"); } }} style={{ whiteSpace: "nowrap" }}>
              {meta ? <span title={`${proof.count} ad project${proof.count > 1 ? "s" : ""} — headline: ${meta.label}. Click to open Ad Projects.`} style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: FS.xs, fontWeight: FW.heavy, color: meta.color, background: `${meta.color}18`, border: `1px solid ${meta.color}40`, cursor: onNavigate ? "pointer" : "default" }}>{meta.short}{proof.count > 1 ? ` ·${proof.count}` : ""}</span>
              : (proof?.needsBriefCount > 0 ? <span title={`${proof.needsBriefCount} closed sale${proof.needsBriefCount > 1 ? "s" : ""} without an ad project yet`} style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: FS.xs, fontWeight: FW.heavy, color: Z.da, background: `${Z.da}15`, border: `1px solid ${Z.da}40` }}>Brief? ·{proof.needsBriefCount}</span>
                : <span style={{ color: Z.td, fontSize: FS.xs }}>—</span>)}
            </td>
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
