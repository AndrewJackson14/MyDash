import { useState } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R, INV } from "../../lib/theme";
import { Ic, Badge, Btn, Sel, Card, SB, TB, glass } from "../../components/ui";
import { PIPELINE, PIPELINE_COLORS, STAGE_AUTO_ACTIONS, actInfo } from "./constants";

const PipelineView = ({
  sales, setSales, clients, pubs, issues, proposals,
  sr, setSr, onNavTo, onHandleAct, onMoveToStage, onCloneSale, onOpenOpp,
  onOpenProposal, onEditProposal, onSetViewPropId,
}) => {
  const [pipeView, setPipeView] = useState("actions");
  const [fPub, setFPub] = useState("all");
  const [dragSaleId, setDragSaleId] = useState(null);
  const [closedRange, setClosedRange] = useState("30days");
  const [actFilter, setActFilter] = useState("all");
  const [actExpanded, setActExpanded] = useState(null);
  const [activityLog] = useState([]);
  const [subTab, setSubTab] = useState("Pipeline");

  const cn = id => (clients || []).find(c => c.id === id)?.name || "—";
  const pn = id => (pubs || []).find(p => p.id === id)?.name || "—";
  const issLabel = id => (issues || []).find(i => i.id === id)?.label || "—";
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().slice(0, 10);
  const fiveDaysAgo = new Date(new Date().setDate(new Date().getDate() - 5)).toISOString().slice(0, 10);
  // Issues whose publish date is within the last 5 days — Follow-up column shows
  // sales attached to these issues (clients whose ad ran recently).
  const recentPublishedIssueIds = new Set((issues || []).filter(i => i.date && i.date >= fiveDaysAgo && i.date <= today).map(i => i.id));
  const dateColor = (d) => { if (!d) return Z.td; if (d < today) return Z.da; if (d === today) return Z.wa; return Z.su; };
  const stageRevenue = (st) => (sales || []).filter(s => s.status === st).reduce((sm, s) => sm + (s.amount || 0), 0);
  const actLabel = (s) => { const a = actInfo(s.nextAction); return a ? a.label : ""; };
  const actIcon = (s) => { const a = actInfo(s.nextAction); return a?.icon || "→"; };
  const actVerb = (s) => { const a = actInfo(s.nextAction); return a?.verb || "Act"; };

  const activeSales = (sales || []).filter(s => { if (fPub !== "all" && s.publication !== fPub) return false; if (sr && !cn(s.clientId).toLowerCase().includes(sr.toLowerCase())) return false; return true; });
  const actionSales = activeSales.filter(s => s.nextAction && s.status !== "Closed" && s.status !== "Follow-up").sort((a, b) => (a.nextActionDate || "9").localeCompare(b.nextActionDate || "9"));
  const todaysActions = activeSales.filter(s => s.nextAction && (s.nextActionDate <= today || !s.nextActionDate) && s.status !== "Closed" && s.status !== "Follow-up").sort((a, b) => (a.nextActionDate || "9").localeCompare(b.nextActionDate || "9"));
  const closedSales = (sales || []).filter(s => s.status === "Closed").sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const renewalsDue = (sales || []).filter(s => (s.status === "Closed" || s.status === "Follow-up") && s.date < new Date(new Date().setDate(new Date().getDate() - 60)).toISOString().slice(0, 10));

  if (subTab === "Closed") {
    const now = new Date(); const thisMonth = now.toISOString().slice(0, 7); const thisYear = now.toISOString().slice(0, 4);
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString().slice(0, 10);
    const d30 = new Date(now); d30.setDate(d30.getDate() - 30); const d30s = d30.toISOString().slice(0, 10);
    const filtered = closedSales.filter(s => { if (closedRange === "30days") return s.date >= d30s; if (closedRange === "month") return s.date?.startsWith(thisMonth); if (closedRange === "quarter") return s.date >= qStart; if (closedRange === "year") return s.date?.startsWith(thisYear); return true; });
    const filtRev = filtered.reduce((s, x) => s + (x.amount || 0), 0);
    return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <TB tabs={["Pipeline", "Closed", "Renewals"]} active="Closed" onChange={setSubTab} />
      <div style={{ display: "flex", gap: 3 }}>
        {[["30days", "Past 30 Days"], ["month", "This Month"], ["quarter", "This Quarter"], ["year", "This Year"], ["all", "All Time"]].map(([k, l]) => <button key={k} onClick={() => setClosedRange(k)} style={{ padding: "6px 12px", borderRadius: Ri, border: `1px solid ${closedRange === k ? Z.ac : Z.bd}`, background: closedRange === k ? Z.as : "transparent", cursor: "pointer", fontSize: FS.sm, fontWeight: closedRange === k ? 700 : 500, color: closedRange === k ? Z.ac : Z.tm, fontFamily: COND }}>{l}</button>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {[["Revenue", "$" + (filtRev / 1000).toFixed(0) + "K", Z.ac], ["Deals", String(filtered.length), Z.pu], ["Avg Deal", "$" + Math.round(filtRev / Math.max(1, filtered.length)).toLocaleString(), Z.wa]].map(([l, v, c]) => <div key={l} style={{ ...glass(), borderRadius: Ri, padding: "10px 14px", borderLeft: `3px solid ${c}` }}><div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: 18, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{v}</div></div>)}
      </div>
      {filtered.map(s => <div key={s.id} onClick={() => onNavTo("Clients", s.clientId)} style={{ ...glass(), borderRadius: R, padding: 16, cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div><span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{cn(s.clientId)}</span><div style={{ fontSize: FS.sm, color: Z.ac }}>{pn(s.publication)} · {s.type}</div></div>
          <div style={{ textAlign: "right" }}><span style={{ fontSize: FS.md, fontWeight: FW.black, color: Z.su }}>${(s.amount || 0).toLocaleString()}</span><div style={{ fontSize: FS.sm, color: Z.tm }}>{s.date}</div></div>
        </div>
      </div>)}
    </div>;
  }

  if (subTab === "Renewals") {
    const calcScore = (s) => { let score = 50; const lastComm = ((clients || []).find(c => c.id === s.clientId)?.comms || []).sort((a, b) => (b.date || "").localeCompare(a.date || ""))?.[0]; if (lastComm && lastComm.date >= new Date(new Date().setDate(new Date().getDate() - 21)).toISOString().slice(0, 10)) score += 20; if ((sales || []).filter(x => x.clientId === s.clientId && x.status === "Closed").length > 2) score += 15; if ((s.amount || 0) > 2000) score += 10; return Math.min(100, Math.max(0, score)); };
    const scored = renewalsDue.map(s => ({ ...s, score: calcScore(s) }));
    const ready = scored.filter(s => s.score >= 80);
    const warm = scored.filter(s => s.score >= 40 && s.score < 80);
    const atRisk = scored.filter(s => s.score < 40);
    return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <TB tabs={["Pipeline", "Closed", "Renewals"]} active="Renewals" onChange={setSubTab} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {[["Ready", String(ready.length), Z.ac], ["Warm Up", String(warm.length), Z.wa], ["At Risk", String(atRisk.length), atRisk.length > 0 ? Z.da : Z.ac]].map(([l, v, c]) => <div key={l} style={{ ...glass(), borderRadius: Ri, padding: "10px 14px", borderLeft: `3px solid ${c}` }}><div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: 18, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{v}</div></div>)}
      </div>
      {scored.length === 0 && <Card style={{ textAlign: "center", padding: 20, color: Z.ac }}>All caught up — no renewals due</Card>}
      {[{ label: "Ready to Renew", items: ready, color: Z.ac }, { label: "Warm Up", items: warm, color: Z.wa }, { label: "At Risk", items: atRisk, color: Z.da }].map(lane => lane.items.length === 0 ? null : <div key={lane.label}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0 4px", borderBottom: `2px solid ${lane.color}` }}><span style={{ fontSize: FS.lg, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{lane.label}</span><span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: INV.light, background: lane.color, padding: "1px 7px", borderRadius: Ri }}>{lane.items.length}</span></div>
        {lane.items.map(s => <div key={s.id} style={{ ...glass(), borderRadius: R, padding: 16, marginTop: 4, borderLeft: `3px solid ${lane.color}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><span style={{ fontSize: 15, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{cn(s.clientId)}</span><div style={{ fontSize: FS.sm, color: Z.tm }}>{pn(s.publication)} · ${(s.amount || 0).toLocaleString()}</div></div>
            <div style={{ textAlign: "right" }}><div style={{ fontSize: 18, fontWeight: FW.black, color: lane.color }}>{s.score}</div><div style={{ fontSize: FS.micro, color: Z.td }}>SCORE</div></div>
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            <Btn sm onClick={() => onOpenProposal(s.clientId)}>Renew</Btn>
            <Btn sm v="secondary" onClick={() => onNavTo("Clients", s.clientId)}>Profile</Btn>
          </div>
        </div>)}
      </div>)}
    </div>;
  }

  // Pipeline view (default)
  return <>
    <TB tabs={["Pipeline", "Closed", "Renewals"]} active="Pipeline" onChange={setSubTab} />
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{PIPELINE.filter(s => stageRevenue(s) > 0).map(s => <div key={s} style={{ padding: "6px 12px", borderRadius: Ri, background: `${PIPELINE_COLORS[s]}15`, border: `1px solid ${PIPELINE_COLORS[s]}30`, display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 6, height: 6, borderRadius: Ri, background: PIPELINE_COLORS[s] }} /><span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: PIPELINE_COLORS[s] }}>{s}</span><span style={{ fontSize: FS.base, fontWeight: FW.black, color: Z.tx }}>${(stageRevenue(s) / 1000).toFixed(0)}K</span></div>)}</div>
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><TB tabs={["My Actions", "Full Pipeline"]} active={pipeView === "actions" ? "My Actions" : "Full Pipeline"} onChange={v => setPipeView(v === "My Actions" ? "actions" : "all")} /><Sel value={fPub} onChange={e => setFPub(e.target.value)} options={[{ value: "all", label: "All Pubs" }, ...(pubs || []).map(p => ({ value: p.id, label: p.name }))]} /><SB value={sr} onChange={setSr} placeholder="Client..." /></div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
      {PIPELINE.map(stage => {
        const ss = (pipeView === "actions" ? actionSales : activeSales).filter(s => {
          // Closed = only sales tied to a signed contract (proposal → contract)
          if (stage === "Closed") return s.status === "Closed" && s.contractId != null;
          // Follow-up = clients whose ad was published within the last 5 days
          if (stage === "Follow-up") return s.status === "Closed" && s.issueId && recentPublishedIssueIds.has(s.issueId);
          return s.status === stage;
        });
        return <div key={stage} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragSaleId) { onMoveToStage(dragSaleId, stage); setDragSaleId(null); } }} style={{ background: Z.bg === "#08090D" ? "rgba(14,16,24,0.3)" : "rgba(255,255,255,0.25)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRadius: Ri, padding: 6, border: `1px solid ${Z.bd}`, display: "flex", flexDirection: "column", minHeight: 100 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 4px 6px", borderBottom: `2px solid ${PIPELINE_COLORS[stage]}` }}><span style={{ fontSize: FS.sm, fontWeight: FW.black, color: PIPELINE_COLORS[stage] }}>{stage}</span><span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, background: Z.sa, padding: "1px 5px", borderRadius: Ri }}>{ss.length}</span></div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, marginTop: 4, overflowY: "auto", maxHeight: 420 }}>
            {ss.slice(0, 8).map(s => <div key={s.id} draggable onDragStart={() => setDragSaleId(s.id)} style={{ ...glass(), borderRadius: Ri, padding: 6, cursor: "grab", borderLeft: `3px solid ${PIPELINE_COLORS[stage]}` }}>
              <div onClick={() => onNavTo("Clients", s.clientId)} style={{ fontWeight: FW.semi, color: Z.ac, fontSize: 15, cursor: "pointer", marginBottom: 2, fontFamily: COND }}>{cn(s.clientId)}</div>
              {s.type !== "TBD" && <div style={{ color: Z.tm, fontSize: FS.sm, marginBottom: 2 }}>{pn(s.publication)} · {s.type}</div>}
              {(s.amount || 0) > 0 && <div style={{ fontWeight: FW.black, color: Z.su, fontSize: FS.base }}>${(s.amount || 0).toLocaleString()}</div>}
              {s.nextAction && <div onClick={e => { e.stopPropagation(); onHandleAct(s.id); }} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, padding: "4px 6px", background: `${actInfo(s.nextAction)?.color || Z.ac}10`, border: `1px solid ${actInfo(s.nextAction)?.color || Z.ac}25`, borderRadius: Ri, cursor: "pointer" }}>
                <span style={{ fontSize: FS.sm }}>{actIcon(s)}</span>
                <span style={{ fontSize: FS.sm, color: actInfo(s.nextAction)?.color || Z.ac, fontWeight: FW.bold, flex: 1 }}>{actLabel(s)}</span>
                {s.nextActionDate && <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: dateColor(s.nextActionDate) }}>{s.nextActionDate.slice(5)}</span>}
              </div>}
              <div style={{ display: "flex", gap: 3, marginTop: 3 }}>
                {stage !== "Follow-up" && <button onClick={e => { e.stopPropagation(); onMoveToStage(s.id, PIPELINE[Math.min(PIPELINE.indexOf(stage) + 1, 5)]); }} style={{ flex: 1, padding: "3px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sa, cursor: "pointer", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.tm }}>→ {PIPELINE[Math.min(PIPELINE.indexOf(stage) + 1, 5)]}</button>}
                {(stage === "Closed" || stage === "Follow-up") && <button onClick={e => { e.stopPropagation(); onCloneSale(s); }} style={{ padding: "3px 5px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sa, cursor: "pointer", fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tm }}>⟳</button>}
              </div>
            </div>)}
          </div>
        </div>;
      })}
    </div>
    {/* Today's actions */}
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><h4 style={{ margin: 0, fontSize: FS.md, fontWeight: FW.black, color: Z.tx }}>Today's Actions</h4><span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: todaysActions.length > 0 ? Z.da : Z.su }}>{todaysActions.length}</span></div>
      {todaysActions.length === 0 ? <div style={{ padding: 16, textAlign: "center", color: Z.su, fontSize: FS.base }}>All caught up!</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>{todaysActions.slice(0, 10).map(s => <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: Z.bg, borderRadius: Ri, borderLeft: `3px solid ${dateColor(s.nextActionDate)}` }}>
          <div style={{ flex: 1 }}><div style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{cn(s.clientId)}</div><div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: FS.sm }}><span>{actIcon(s)}</span><span style={{ fontWeight: FW.semi, color: Z.tx }}>{actLabel(s)}</span></div></div>
          <button onClick={() => onHandleAct(s.id)} style={{ padding: "6px 12px", borderRadius: Ri, border: `1px solid ${(actInfo(s.nextAction)?.color || Z.ac)}40`, background: `${actInfo(s.nextAction)?.color || Z.ac}10`, cursor: "pointer", fontSize: FS.sm, fontWeight: FW.heavy, color: actInfo(s.nextAction)?.color || Z.ac }}>{actVerb(s)}</button>
        </div>)}</div>}
    </Card>
  </>;
};

export default PipelineView;
