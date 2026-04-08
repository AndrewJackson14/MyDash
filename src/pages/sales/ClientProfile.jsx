import { useState } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R, INV } from "../../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Card, SB, Modal } from "../../components/ui";
import { CONTACT_ROLES, COMM_TYPES, COMM_AUTHORS } from "../../constants";
import { computeClientStatus, CLIENT_STATUS_COLORS, INDUSTRIES, actInfo } from "./constants";

const ClientProfile = ({
  clientId, clients, setClients, sales, pubs, issues, proposals, contracts,
  commForm, setCommForm, onBack, onNavTo, onOpenProposal, onSetViewPropId,
  onOpenEditClient, bus,
}) => {
  const vc = (clients || []).find(x => x.id === clientId);
  if (!vc) return null;

  const pn = id => (pubs || []).find(p => p.id === id)?.name || "—";
  const cn = id => (clients || []).find(c => c.id === id)?.name || "—";
  const today = new Date().toISOString().slice(0, 10);
  const serif = "'Playfair Display',Georgia,serif";

  const cS = sales.filter(s => s.clientId === vc.id);
  const closedCS = cS.filter(s => s.status === "Closed");
  const activeCS = cS.filter(s => !["Closed", "Follow-up"].includes(s.status));
  const comms = (vc.comms || []).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const primaryContact = (vc.contacts || [])[0] || {};
  const daysSinceContact = comms.length > 0 ? Math.floor((new Date() - new Date(comms[0].date)) / 86400000) : null;
  const clientProposals = (proposals || []).filter(p => p.clientId === vc.id);

  // Revenue computations
  const revByPub = pubs.map(p => ({ pub: p, rev: closedCS.filter(s => s.publication === p.id).reduce((sm, x) => sm + (x.amount || 0), 0), count: closedCS.filter(s => s.publication === p.id).length })).filter(r => r.rev > 0).sort((a, b) => b.rev - a.rev);
  const maxPubRev = Math.max(...revByPub.map(r => r.rev), 1);
  const activePubIds = [...new Set(cS.map(s => s.publication))];
  const crossSellPubs = pubs.filter(p => !activePubIds.includes(p.id));
  const totalRevenue = closedCS.reduce((s, x) => s + (x.amount || 0), 0);
  const avgDeal = closedCS.length > 0 ? Math.round(totalRevenue / closedCS.length) : 0;

  // Key dates
  const lastAdDate = closedCS.sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0]?.date;
  const lastContractDate = clientProposals.filter(p => p.status === "Approved/Signed").sort((a, b) => (b.closedAt || b.date || "").localeCompare(a.closedAt || a.date || ""))[0]?.closedAt?.slice(0, 10) || clientProposals.filter(p => p.status === "Approved/Signed")[0]?.date;
  const firstSaleDate = closedCS.sort((a, b) => (a.date || "").localeCompare(b.date || ""))[0]?.date;
  const yearsAsClient = firstSaleDate ? Math.max(1, Math.round((new Date() - new Date(firstSaleDate)) / (365.25 * 86400000) * 10) / 10) : 0;

  // Seasonal spending
  const monthlySpend = Array(12).fill(0);
  closedCS.forEach(s => { if (s.date) { const m = parseInt(s.date.slice(5, 7)) - 1; monthlySpend[m] += s.amount || 0; } });
  const maxMonthSpend = Math.max(...monthlySpend, 1);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const peakMonth = monthlySpend.indexOf(Math.max(...monthlySpend));
  const quietMonth = monthlySpend.indexOf(Math.min(...monthlySpend));

  // Product adoption
  const hasPrint = cS.some(s => !s.productType || s.productType === "display_print");
  const hasDigital = cS.some(s => s.productType === "web" || s.productType === "newsletter" || s.productType === "eblast");
  const hasSponsored = cS.some(s => s.productType === "sponsored_content" || s.productType === "advertorial");

  // Auto status
  const clientStatus = vc.status || computeClientStatus(vc.id, sales, issues);
  const stColor = CLIENT_STATUS_COLORS[clientStatus] || CLIENT_STATUS_COLORS.Renewal || CLIENT_STATUS_COLORS.Lead;

  // Industry benchmarks
  const vcIndustries = vc.industries || [];
  const industryPeers = vcIndustries.length > 0 ? clients.filter(c => c.id !== vc.id && (c.industries || []).some(ind => vcIndustries.includes(ind))) : [];
  const peerAvgSpend = industryPeers.length > 0 ? Math.round(industryPeers.reduce((s, c) => s + (c.totalSpend || 0), 0) / industryPeers.length) : 0;
  const peerTopSpender = [...industryPeers].sort((a, b) => (b.totalSpend || 0) - (a.totalSpend || 0))[0];
  const peerTopSpend = peerTopSpender?.totalSpend || 0;

  // Surveys
  const surveys = (vc.surveys || []).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const avgScore = surveys.length > 0 ? (surveys.reduce((s, x) => s + (x.overallScore || 0), 0) / surveys.length).toFixed(1) : null;

  // Contracts for this client
  const clientContracts = (contracts || []).filter(c => c.clientId === vc.id).sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
  const activeContracts = clientContracts.filter(c => c.status === "active");
  const completedContracts = clientContracts.filter(c => c.status === "completed");

  // Helpers
  const addComm = () => { if (!commForm.note.trim()) return; setClients(cl => cl.map(c => c.id === vc.id ? { ...c, comms: [...(c.comms || []), { id: "cm" + Date.now(), type: commForm.type, author: commForm.author, date: today, note: commForm.note }] } : c)); setCommForm({ type: "Comment", author: "Account Manager", note: "" }); };
  const updClient = (f, v) => setClients(cl => cl.map(c => c.id === vc.id ? { ...c, [f]: v } : c));
  const updCt = (i, f, v) => setClients(cl => cl.map(c => c.id === vc.id ? { ...c, contacts: c.contacts.map((ct, j) => j === i ? { ...ct, [f]: v } : ct) } : c));
  const cc = t => ({ Email: Z.tx, Phone: Z.tx, Text: Z.tx, Comment: Z.tm, Survey: Z.tm, Result: Z.tm })[t] || Z.tm;
  const fmtD = d => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

    {/* ── HEADER ── */}
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div style={{ width: 56, height: 56, borderRadius: Ri, background: `hsl(${Math.abs([...vc.name].reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)) % 360}, 45%, 40%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: FW.black, color: INV.light, flexShrink: 0 }}>{vc.name.split(" ").map(w => w[0]).join("").slice(0, 2)}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: FS.xxl, fontWeight: FW.black, color: Z.tx, fontFamily: serif }}>{primaryContact.name || vc.name}</h2>
          <span style={{ display: "inline-flex", padding: "3px 10px", borderRadius: Ri, fontSize: FS.xs, fontWeight: FW.heavy, background: stColor.bg, color: stColor.text, letterSpacing: 0.5, textTransform: "uppercase" }}>{clientStatus}</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: FW.semi, color: Z.tm, fontFamily: COND, marginTop: 1 }}>{vc.name}{primaryContact.name ? ` · ${primaryContact.role || "Contact"}` : ""}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
          {vcIndustries.length > 0 && vcIndustries.map(ind => <span key={ind} style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.pu, background: Z.pu + "14", padding: "2px 8px", borderRadius: Ri }}>{ind}</span>)}
          {vcIndustries.length === 0 && <span style={{ fontSize: FS.micro, fontWeight: FW.semi, color: Z.td, background: Z.sa, padding: "2px 8px", borderRadius: Ri }}>No industry set</span>}
          {vc.leadSource && <span style={{ fontSize: FS.micro, fontWeight: FW.semi, color: Z.tm, background: Z.sa, padding: "2px 8px", borderRadius: Ri }}>via {vc.leadSource}</span>}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
          {vc.totalSpend > 0 && <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.ac }}>Lifetime: ${vc.totalSpend?.toLocaleString()}</span>}
          {daysSinceContact !== null && <span style={{ fontSize: FS.base, color: daysSinceContact > 14 ? Z.da : daysSinceContact > 7 ? Z.wa : Z.ac, fontWeight: FW.bold }}>Last touch: {daysSinceContact === 0 ? "today" : daysSinceContact + "d ago"} ({comms[0]?.type})</span>}
          {daysSinceContact === null && <span style={{ fontSize: FS.base, color: Z.da, fontWeight: FW.bold }}>No contact logged</span>}
        </div>
        {(vc.interestedPubs || []).length > 0 && <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 6 }}>
          <span style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginRight: 2 }}>Interested:</span>
          {(vc.interestedPubs || []).map(pid => { const pub = pubs.find(p => p.id === pid); return pub ? <span key={pid} style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.tx, background: Z.sa, padding: "2px 6px", borderRadius: Ri }}>{pub.name.split(" ").map(w => w[0]).join("")}</span> : null; })}
        </div>}
      </div>
    </div>

    {/* ── RENEWAL ALERT ── */}
    {clientStatus === "Renewal" && <div style={{ padding: "12px 16px", background: `${Z.wa}15`, border: `1px solid ${Z.wa}40`, borderRadius: R, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <div>
        <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.wa }}>Renewal Due</div>
        <div style={{ fontSize: FS.sm, color: Z.tm }}>
          {vc.contractEndDate ? `Contract expires ${fmtD(vc.contractEndDate)}` : "This client is due for renewal."}
          {activeContracts.length > 0 && ` · Current: ${activeContracts[0].name} ($${activeContracts[0].totalValue.toLocaleString()})`}
        </div>
      </div>
      <Btn sm onClick={() => { if (onOpenProposal) onOpenProposal(vc.id); }}>Create Renewal Proposal</Btn>
    </div>}

    {/* ── PURCHASE HISTORY SUMMARY ── */}
    {closedCS.length > 0 && (() => {
      // Group historical purchases by publication + ad size
      const hist = {};
      closedCS.forEach(s => {
        const key = `${s.publication}__${s.size || s.type || "Ad"}`;
        if (!hist[key]) hist[key] = { pubId: s.publication, pubName: pn(s.publication), adSize: s.size || s.type || "Ad", count: 0, total: 0 };
        hist[key].count++;
        hist[key].total += s.amount || 0;
      });
      const rows = Object.values(hist).sort((a, b) => b.total - a.total).slice(0, 8);
      if (!rows.length) return null;
      return <Card style={{ borderLeft: `3px solid ${Z.ac}`, marginBottom: 0 }}>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Purchase History</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS.sm, fontFamily: COND }}>
          <thead><tr style={{ borderBottom: `1px solid ${Z.bd}` }}>
            <th style={{ padding: "4px 8px", textAlign: "left", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Publication</th>
            <th style={{ padding: "4px 8px", textAlign: "left", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Ad Size</th>
            <th style={{ padding: "4px 8px", textAlign: "center", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Times</th>
            <th style={{ padding: "4px 8px", textAlign: "right", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Total</th>
          </tr></thead>
          <tbody>{rows.map(r => <tr key={r.pubId + r.adSize} style={{ borderBottom: `1px solid ${Z.bd}10` }}>
            <td style={{ padding: "5px 8px", fontWeight: FW.semi, color: Z.tx }}>{r.pubName}</td>
            <td style={{ padding: "5px 8px", color: Z.tm }}>{r.adSize}</td>
            <td style={{ padding: "5px 8px", textAlign: "center", color: Z.tm }}>{r.count}</td>
            <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: FW.heavy, color: Z.tx }}>${r.total.toLocaleString()}</td>
          </tr>)}</tbody>
        </table>
      </Card>;
    })()}

    {/* ── TWO-COLUMN LAYOUT ── */}
    <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16, alignItems: "start" }}>

      {/* ══ LEFT COLUMN ══ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Relationship Notes */}
        <Card style={{ borderLeft: `3px solid ${Z.wa}` }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Relationship Notes</div>
          <textarea value={vc.notes || ""} onChange={e => updClient("notes", e.target.value)} placeholder="Personal notes — preferences, interests, family, best time to call, how they like to be contacted, what matters to them..." style={{ width: "100%", minHeight: 120, background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: 10, color: Z.tx, fontSize: FS.md, outline: "none", resize: "vertical", fontFamily: "'Source Sans 3',sans-serif", lineHeight: 1.5, boxSizing: "border-box" }} />
        </Card>

        {/* Client Intelligence */}
        <Card>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Client Intelligence</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
            {[{ label: "Total Ads", value: closedCS.length }, { label: "Avg Deal", value: `$${avgDeal.toLocaleString()}` }, { label: "Years", value: yearsAsClient > 0 ? yearsAsClient : "New" }, { label: "Active Deals", value: activeCS.length }].map(m => <div key={m.label} style={{ textAlign: "center", padding: 16, background: Z.bg, borderRadius: Ri }}>
              <div style={{ fontSize: 18, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{m.value}</div>
              <div style={{ fontSize: 9, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5 }}>{m.label}</div>
            </div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
            {[{ label: "Last Ad Placed", value: fmtD(lastAdDate) }, { label: "Last Contract Signed", value: fmtD(lastContractDate) }, { label: "First Purchase", value: fmtD(firstSaleDate) }].map(d => <div key={d.label} style={{ padding: 16, background: Z.bg, borderRadius: Ri }}>
              <div style={{ fontSize: 9, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>{d.label}</div>
              <div style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx, marginTop: 2 }}>{d.value}</div>
            </div>)}
          </div>
          {closedCS.length > 0 && <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 6 }}>Spending Pattern</div>
            <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 50 }}>
              {monthlySpend.map((v, i) => <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ width: "100%", background: v > 0 ? (i === peakMonth ? Z.ac : Z.as) : Z.bg, borderRadius: Ri, height: `${Math.max(4, (v / maxMonthSpend) * 40)}px`, transition: "height 0.3s" }} />
                <span style={{ fontSize: 8, color: i === peakMonth ? Z.ac : Z.td, fontWeight: i === peakMonth ? 800 : 400 }}>{monthNames[i]}</span>
              </div>)}
            </div>
            <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 4 }}>Peak: <span style={{ fontWeight: FW.bold, color: Z.ac }}>{monthNames[peakMonth]}</span>{monthlySpend[quietMonth] === 0 && <span> · Quiet: <span style={{ fontWeight: FW.bold, color: Z.wa }}>{monthNames[quietMonth]}</span></span>}</div>
          </div>}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 6 }}>Product Adoption</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[{ label: "Print Ads", active: hasPrint }, { label: "Digital/Web", active: hasDigital }, { label: "Sponsored Content", active: hasSponsored }, { label: "Newsletter", active: cS.some(s => s.productType === "newsletter") }, { label: "E-Blast", active: cS.some(s => s.productType === "eblast") }, { label: "Creative Services", active: cS.some(s => s.productType === "creative") }].map(p => <span key={p.label} style={{ fontSize: FS.xs, fontWeight: FW.bold, padding: "3px 10px", borderRadius: Ri, background: p.active ? Z.as : Z.bg, color: p.active ? Z.ac : Z.td, border: `1px solid ${p.active ? Z.ac : Z.bd}` }}>{p.active ? "✓ " : ""}{p.label}</span>)}
            </div>
          </div>
          {revByPub.length > 0 && <div>
            <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 6 }}>Revenue by Publication</div>
            {revByPub.map(r => <div key={r.pub.id} style={{ marginBottom: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{r.pub.name}</span><span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.ac }}>${r.rev.toLocaleString()}</span></div>
              <div style={{ height: 4, background: Z.bg, borderRadius: Ri, marginTop: 2 }}><div style={{ height: "100%", borderRadius: Ri, width: `${(r.rev / maxPubRev) * 100}%`, background: Z.tm }} /></div>
            </div>)}
          </div>}
        </Card>

        {/* Contracts */}
        <Card style={{ borderLeft: `3px solid ${activeContracts.length > 0 ? Z.su || "#22C55E" : Z.wa}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Contracts ({clientContracts.length})</span>
            {activeContracts.length > 0 && <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.su || "#22C55E", background: (Z.su || "#22C55E") + "15", padding: "2px 8px", borderRadius: Ri }}>{activeContracts.length} Active</span>}
          </div>
          {clientContracts.length === 0
            ? <div style={{ padding: 12, textAlign: "center", color: Z.td, fontSize: FS.sm, background: Z.bg, borderRadius: Ri }}>No contracts yet</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {clientContracts.slice(0, 8).map(ct => <div key={ct.id} style={{ padding: "10px 14px", background: Z.bg, borderRadius: Ri, border: ct.status === "active" ? `1px solid ${(Z.su || "#22C55E") + "40"}` : `1px solid transparent` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{ct.name}</div>
                    <div style={{ fontSize: FS.xs, color: Z.tm }}>{ct.startDate || "?"} → {ct.endDate || "?"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>${ct.totalValue.toLocaleString()}</div>
                    <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: ct.status === "active" ? Z.su || "#22C55E" : Z.tm, textTransform: "uppercase" }}>{ct.status}</span>
                  </div>
                </div>
                {ct.lines && ct.lines.length > 0 && <div style={{ marginTop: 4, fontSize: FS.xs, color: Z.td }}>
                  {ct.lines.slice(0, 3).map((ln, i) => <span key={i}>{i > 0 ? " · " : ""}{pn(ln.pubId)} ({ln.adSize} ×{ln.quantity})</span>)}
                  {ct.lines.length > 3 && <span> + {ct.lines.length - 3} more</span>}
                </div>}
              </div>)}
              {clientContracts.length > 8 && <div style={{ fontSize: FS.xs, color: Z.td, textAlign: "center" }}>+ {clientContracts.length - 8} more contracts</div>}
            </div>}
          {vc.contractEndDate && <div style={{ marginTop: 8, fontSize: FS.xs, color: Z.tm }}>
            Contract ends: <span style={{ fontWeight: FW.bold, color: new Date(vc.contractEndDate) < new Date() ? Z.da : Z.su || "#22C55E" }}>{fmtD(vc.contractEndDate)}</span>
          </div>}
        </Card>

        {/* Client Satisfaction */}
        <Card style={{ borderLeft: `3px solid ${avgScore && avgScore >= 4 ? Z.su : avgScore && avgScore >= 3 ? Z.wa : avgScore ? Z.da : Z.bd}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Client Satisfaction</div>
            {avgScore && <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 22, fontWeight: FW.black, color: avgScore >= 4 ? Z.su : avgScore >= 3 ? Z.wa : Z.da, fontFamily: DISPLAY }}>{avgScore}</span>
              <span style={{ fontSize: FS.xs, color: Z.td }}>/5 avg ({surveys.length} survey{surveys.length !== 1 ? "s" : ""})</span>
            </div>}
          </div>
          {surveys.length === 0
            ? <div style={{ padding: 16, textAlign: "center", color: Z.td, fontSize: FS.base, background: Z.bg, borderRadius: Ri }}>No survey responses yet. Surveys auto-send 7 days after ad publication.</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {surveys.slice(0, 5).map((sv, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: Z.bg, borderRadius: Ri }}>
                <div><div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx }}>{sv.publication} — {sv.issue || "Ad Survey"}</div><div style={{ fontSize: FS.xs, color: Z.tm }}>{fmtD(sv.date)}</div></div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>{[1, 2, 3, 4, 5].map(n => <span key={n} style={{ fontSize: FS.md, color: n <= (sv.overallScore || 0) ? Z.tx : Z.bd }}>★</span>)}</div>
              </div>)}
            </div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: FS.sm, color: Z.tm, cursor: "pointer" }}>
              <input type="checkbox" checked={vc.surveyAutoSend !== false} onChange={e => updClient("surveyAutoSend", e.target.checked)} />
              Auto-send surveys (7 days after pub)
            </label>
          </div>
        </Card>

        {/* Contacts */}
        <Card style={{ borderLeft: `3px solid ${Z.ac}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Contacts</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={() => setClients(cl => cl.map(c => c.id === vc.id ? { ...c, contacts: [...(c.contacts || []), { name: "", email: "", phone: "", role: "Other" }] } : c))} style={{ background: "none", border: `1px solid ${Z.bd}`, borderRadius: Ri, cursor: "pointer", color: Z.ac, fontSize: FS.sm, fontWeight: FW.bold, padding: "2px 8px" }}>+ Add</button>
              {onOpenEditClient && <button onClick={() => onOpenEditClient(vc)} style={{ background: "none", border: `1px solid ${Z.bd}`, borderRadius: Ri, cursor: "pointer", color: Z.tm, fontSize: FS.sm, fontWeight: FW.semi, padding: "2px 8px" }}>Edit</button>}
            </div>
          </div>
          {(vc.contacts || []).map((ct, idx) => <div key={idx} style={{ background: Z.bg, borderRadius: R, padding: 16, marginBottom: 4 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
              <select value={ct.role} onChange={e => updCt(idx, "role", e.target.value)} style={{ background: "none", border: "none", color: Z.ac, fontSize: FS.xs, fontWeight: FW.heavy, cursor: "pointer", textTransform: "uppercase" }}>{CONTACT_ROLES.map(r => <option key={r}>{r}</option>)}</select>
              {idx === 0 && <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.wa, background: Z.ws, padding: "1px 5px", borderRadius: Ri }}>PRIMARY</span>}
            </div>
            <input value={ct.name} onChange={e => updCt(idx, "name", e.target.value)} placeholder="Name" style={{ display: "block", width: "100%", background: "none", border: "none", color: Z.tx, fontSize: FS.md, fontWeight: FW.semi, fontFamily: COND, outline: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 10, fontSize: FS.sm, color: Z.tm }}><span>{ct.email}</span>{ct.phone && <span>· {ct.phone}</span>}</div>
          </div>)}
        </Card>
      </div>

      {/* ══ RIGHT COLUMN (sticky) ══ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 20, maxHeight: "calc(100vh - 120px)", overflow: "hidden" }}>

        {/* Action Center */}
        <Card style={{ borderLeft: `3px solid ${daysSinceContact > 7 ? Z.da : Z.ac}`, background: daysSinceContact > 14 ? Z.ds : Z.sf }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Next Step</div>
          {activeCS.length > 0 ? <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx, fontFamily: COND, marginBottom: 8 }}>{activeCS[0].nextAction ? (typeof activeCS[0].nextAction === "string" ? activeCS[0].nextAction : activeCS[0].nextAction?.label || "Follow up") : "Follow up on active deal"}{activeCS[0].nextActionDate ? ` — ${activeCS[0].nextActionDate}` : ""}</div>
            : <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tm, fontFamily: COND, marginBottom: 8 }}>No active deals — time to reach out?</div>}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <Btn sm onClick={() => onOpenProposal(vc.id)}><Ic.send size={11} /> Draft Proposal</Btn>
            {closedCS.length > 0 && <Btn sm v="secondary" onClick={() => { if (bus) bus.emit("invoice.create", { clientId: vc.id, clientName: vc.name }); }}><Ic.invoice size={11} /> Create Invoice</Btn>}
            <Btn sm v="secondary" onClick={() => setCommForm({ type: "Phone", author: "Account Manager", note: "" })}>Log Call</Btn>
            <Btn sm v="secondary" onClick={() => setCommForm({ type: "Email", author: "Account Manager", note: "" })}>Log Email</Btn>
          </div>
        </Card>

        {/* Communication Timeline */}
        <Card style={{ borderLeft: `3px solid ${Z.pu}`, display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Relationship Timeline ({comms.length})</div>
          <div style={{ background: Z.bg === "#08090D" ? "rgba(14,16,24,0.3)" : "rgba(255,255,255,0.25)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRadius: Ri, padding: 6, marginBottom: 6, border: `1px solid ${Z.bd}` }}>
            <div style={{ display: "flex", gap: 3, marginBottom: 3 }}>
              <select value={commForm.type} onChange={e => setCommForm(x => ({ ...x, type: e.target.value }))} style={{ background: Z.sa, border: "none", borderRadius: Ri, padding: "3px", color: Z.tx, fontSize: FS.sm, flex: 1 }}>{[...COMM_TYPES, "Result", "Survey"].map(t => <option key={t}>{t}</option>)}</select>
              <select value={commForm.author} onChange={e => setCommForm(x => ({ ...x, author: e.target.value }))} style={{ background: Z.sa, border: "none", borderRadius: Ri, padding: "3px", color: Z.tx, fontSize: FS.sm, flex: 1 }}>{COMM_AUTHORS.map(a => <option key={a}>{a}</option>)}</select>
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              <input value={commForm.note} onChange={e => setCommForm(x => ({ ...x, note: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") addComm(); }} placeholder="What happened..." style={{ flex: 1, background: Z.sa, border: "none", borderRadius: Ri, padding: "5px 8px", color: Z.tx, fontSize: FS.base, outline: "none" }} />
              <Btn sm onClick={addComm}>Log</Btn>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
            {comms.map(cm => <div key={cm.id} style={{ padding: "10px 14px", borderLeft: `3px solid ${cc(cm.type)}`, background: Z.bg, borderRadius: "0 2px 2px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: cc(cm.type) }}>{cm.type}</span><span style={{ fontSize: FS.xs, color: Z.td }}>{cm.date} · {cm.author}</span></div>
              <div style={{ fontSize: FS.base, color: Z.tx, lineHeight: 1.4, marginTop: 2 }}>{cm.note}</div>
            </div>)}
            {comms.length === 0 && <div style={{ padding: 16, textAlign: "center", color: Z.td, fontSize: FS.base }}>No communication logged yet</div>}
          </div>
        </Card>

        {/* Opportunity */}
        <Card style={{ borderLeft: `3px solid ${Z.or || Z.wa}`, flexShrink: 0 }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Opportunity</div>
          {(() => {
            const signals = [];
            if (clientStatus === "Renewal") signals.push({ text: "Last ordered ad runs within 30 days — renewal conversation is now", color: Z.da, icon: "🔥" });
            if (clientStatus === "Lapsed") { const daysSinceLast = lastAdDate ? Math.floor((new Date() - new Date(lastAdDate)) / 86400000) : null; signals.push({ text: `No future ads ordered${daysSinceLast ? ` · last ad ${daysSinceLast}d ago` : ""} — re-engage`, color: Z.wa, icon: "⏰" }); }
            if (closedCS.length > 0 && monthlySpend[peakMonth] > 0) { const now = new Date().getMonth(); const monthsUntilPeak = (peakMonth - now + 12) % 12; if (monthsUntilPeak > 0 && monthsUntilPeak <= 2) signals.push({ text: `Peak spending month (${monthNames[peakMonth]}) approaching — pitch now`, color: Z.ac, icon: "📈" }); }
            if (avgDeal > 0 && avgDeal < peerAvgSpend * 0.6 && peerAvgSpend > 0) signals.push({ text: `Spending below industry avg — room to grow`, color: Z.wa, icon: "💡" });
            return signals.length > 0 ? <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
              {signals.map((sig, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 14px", background: sig.color + "10", borderRadius: Ri, border: `1px solid ${sig.color}30` }}>
                <span style={{ flexShrink: 0 }}>{sig.icon}</span>
                <span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: sig.color, lineHeight: 1.3 }}>{sig.text}</span>
              </div>)}
            </div> : null;
          })()}
          {vcIndustries.length > 0 && industryPeers.length > 0 && <div style={{ padding: 16, background: Z.bg, borderRadius: Ri, marginBottom: 10 }}>
            <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Industry Benchmark ({vcIndustries[0]})</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><div style={{ fontSize: 9, color: Z.td, textTransform: "uppercase" }}>Peer Avg Spend</div><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: (vc.totalSpend || 0) >= peerAvgSpend ? Z.su : Z.wa }}>${peerAvgSpend.toLocaleString()}</div></div>
              <div><div style={{ fontSize: 9, color: Z.td, textTransform: "uppercase" }}>Top in Category</div><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.ac }}>${peerTopSpend.toLocaleString()}</div>{peerTopSpender && <div style={{ fontSize: FS.micro, color: Z.tm }}>{peerTopSpender.name}</div>}</div>
            </div>
            <div style={{ fontSize: FS.xs, color: (vc.totalSpend || 0) >= peerAvgSpend ? Z.su : Z.wa, fontWeight: FW.bold, marginTop: 4 }}>{(vc.totalSpend || 0) >= peerAvgSpend ? "Above industry average" : `$${(peerAvgSpend - (vc.totalSpend || 0)).toLocaleString()} below average`}</div>
          </div>}
          {activeCS.length > 0 && <div style={{ marginBottom: 8 }}><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Active Pipeline ({activeCS.length})</div>{activeCS.map(s => <div key={s.id} style={{ padding: "4px 0", borderBottom: `1px solid ${Z.bd}` }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{pn(s.publication)} · {s.type}</span><span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.ac }}>${(s.amount || 0).toLocaleString()}</span></div></div>)}</div>}
          {crossSellPubs.length > 0 && <div style={{ marginBottom: 8 }}><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Not Yet Advertising In</div>{crossSellPubs.slice(0, 4).map(p => <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}><div style={{ width: 4, height: 14, borderRadius: Ri, background: Z.tm }} /><span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{p.name}</span><span style={{ fontSize: FS.micro, color: Z.tm }}>{p.circ?.toLocaleString()}</span></div>)}</div>}
          {clientProposals.length > 0 && <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Proposals</div>{clientProposals.map(p => <div key={p.id} onClick={() => { if (onNavTo) onNavTo("Proposals"); if (onSetViewPropId) setTimeout(() => onSetViewPropId(p.id), 50); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", cursor: "pointer", borderBottom: `1px solid ${Z.bd}`, background: p.status === "Draft" ? Z.wa + "08" : "transparent", borderLeft: p.status === "Draft" ? `3px solid ${Z.wa}` : "none", paddingLeft: p.status === "Draft" ? 6 : 0 }}><div><span style={{ fontSize: FS.xs, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{p.name}</span>{p.status === "Draft" && <span style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.wa, marginLeft: 6 }}>PENDING</span>}</div><span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.ac }}>${p.total?.toLocaleString()}</span></div>)}</div>}
        </Card>
      </div>
    </div>
  </div>;
};

export default ClientProfile;
