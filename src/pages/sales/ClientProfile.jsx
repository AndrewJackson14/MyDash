import { useState, useEffect } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R, INV } from "../../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Card, SB, Modal } from "../../components/ui";
import AssetPanel from "../../components/AssetPanel";
import { CONTACT_ROLES, COMM_TYPES, COMM_AUTHORS } from "../../constants";
import { computeClientStatus, CLIENT_STATUS_COLORS, INDUSTRIES, actInfo } from "./constants";
import { useAppData } from "../../hooks/useAppData";

const ClientProfile = ({
  clientId, clients, setClients, sales, pubs, issues, proposals, contracts,
  invoices, payments, team,
  commForm, setCommForm, onBack, onNavTo, onOpenProposal, onSetViewPropId,
  onOpenEditClient, bus,
}) => {
  const appData = useAppData();
  useEffect(() => {
    if (clientId && appData?.loadSalesForClient) appData.loadSalesForClient(clientId);
  }, [clientId, appData]);

  const vc = (clients || []).find(x => x.id === clientId);
  if (!vc) return null;

  const pn = id => (pubs || []).find(p => p.id === id)?.name || "—";
  const cn = id => (clients || []).find(c => c.id === id)?.name || "—";
  const today = new Date().toISOString().slice(0, 10);
  const serif = "'Playfair Display',Georgia,serif";

  const cS = sales.filter(s => s.clientId === vc.id);
  const closedCS = cS.filter(s => s.status === "Closed");
  const activeCS = cS.filter(s => s.status !== "Closed");
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
  const lastContractDate = clientProposals.filter(p => p.status === "Signed & Converted").sort((a, b) => (b.closedAt || b.date || "").localeCompare(a.closedAt || a.date || ""))[0]?.closedAt?.slice(0, 10) || clientProposals.filter(p => p.status === "Signed & Converted")[0]?.date;
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

  // ─── Financial: invoices & payments for this client ─────────
  const clientInvoices = (invoices || []).filter(i => i.clientId === vc.id);
  const clientInvoiceIds = new Set(clientInvoices.map(i => i.id));
  const clientPayments = (payments || []).filter(p => clientInvoiceIds.has(p.invoiceId));
  const openInvoices = clientInvoices.filter(i => ["sent","overdue","partially_paid","draft"].includes(i.status) && (i.balanceDue || 0) > 0);
  const paidInvoices = clientInvoices.filter(i => i.status === "paid");
  const currentBalance = openInvoices.reduce((s, i) => s + (i.balanceDue || 0), 0);
  const overdueBalance = openInvoices.filter(i => i.dueDate && i.dueDate < today).reduce((s, i) => s + (i.balanceDue || 0), 0);
  const lifetimeBilled = clientInvoices.reduce((s, i) => s + (i.total || 0), 0);
  const lifetimePaid = clientPayments.reduce((s, p) => s + (p.amount || 0), 0);
  // DSO for this client's paid invoices
  const clientDso = (() => {
    let totalDays = 0, totalAmt = 0;
    paidInvoices.forEach(i => {
      if (!i.issueDate || !i.total) return;
      const lastPay = clientPayments.filter(p => p.invoiceId === i.id).sort((a, b) => (b.receivedAt || "").localeCompare(a.receivedAt || ""))[0];
      if (!lastPay?.receivedAt) return;
      const days = (new Date(lastPay.receivedAt.slice(0, 10)) - new Date(i.issueDate)) / 86400000;
      if (days < 0) return;
      totalDays += days * i.total;
      totalAmt += i.total;
    });
    return totalAmt > 0 ? Math.round(totalDays / totalAmt) : null;
  })();
  const lastPayment = [...clientPayments].sort((a, b) => (b.receivedAt || "").localeCompare(a.receivedAt || ""))[0];
  const oldestOpenInvoice = openInvoices.length > 0 ? [...openInvoices].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))[0] : null;

  const [finTab, setFinTab] = useState("invoices"); // invoices | payments

  // Purchase Timeline — group contracts, standalone sales, and orphan proposals by year.
  // A proposal is shown only if it did not convert to a contract, or if the contract it
  // became was later cancelled (so there's unfulfilled commitment to revisit).
  const timelineYears = (() => {
    const byYear = {};
    const ensureYear = (y) => {
      if (!byYear[y]) byYear[y] = { year: y, contracts: [], standaloneSales: [], proposals: [], total: 0, adCount: 0 };
      return byYear[y];
    };

    clientContracts.forEach(ct => {
      const y = (ct.startDate || ct.createdAt || "").slice(0, 4) || "Undated";
      const ads = closedCS.filter(s => s.contractId === ct.id).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      const fulfilled = ads.reduce((s, x) => s + (x.amount || 0), 0);
      const pct = ct.totalValue > 0 ? Math.min(100, Math.round((fulfilled / ct.totalValue) * 100)) : 0;
      ensureYear(y).contracts.push({ ...ct, ads, fulfilled, pct });
    });

    closedCS.filter(s => !s.contractId).forEach(s => {
      const y = (s.date || "").slice(0, 4) || "Undated";
      ensureYear(y).standaloneSales.push(s);
    });

    clientProposals.forEach(p => {
      const converted = p.status === "Signed & Converted";
      const linkedContract = converted && p.contractId ? clientContracts.find(c => c.id === p.contractId) : null;
      const contractCancelled = linkedContract && linkedContract.status === "cancelled";
      if (converted && !contractCancelled) return; // hide — rolled into the contract row
      const y = (p.date || p.closedAt || "").slice(0, 4) || "Undated";
      ensureYear(y).proposals.push({ ...p, _reappeared: contractCancelled });
    });

    Object.values(byYear).forEach(yr => {
      const contractAdTotal = yr.contracts.reduce((s, c) => s + c.fulfilled, 0);
      const contractAdCount = yr.contracts.reduce((s, c) => s + c.ads.length, 0);
      const standaloneTotal = yr.standaloneSales.reduce((s, x) => s + (x.amount || 0), 0);
      yr.total = contractAdTotal + standaloneTotal;
      yr.adCount = contractAdCount + yr.standaloneSales.length;
      yr.standaloneSales.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      yr.contracts.sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
    });

    return Object.values(byYear).sort((a, b) => b.year.localeCompare(a.year));
  })();
  const currentYear = new Date().toISOString().slice(0, 4);
  const [expandedYears, setExpandedYears] = useState(() => new Set([currentYear]));
  const [expandedContracts, setExpandedContracts] = useState(() => new Set());
  const toggleYear = (y) => setExpandedYears(s => { const n = new Set(s); n.has(y) ? n.delete(y) : n.add(y); return n; });
  const toggleContract = (id) => setExpandedContracts(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Helpers
  const addComm = () => { if (!commForm.note.trim()) return; setClients(cl => cl.map(c => c.id === vc.id ? { ...c, comms: [...(c.comms || []), { id: "cm" + Date.now(), type: commForm.type, author: commForm.author, date: today, note: commForm.note }] } : c)); setCommForm({ type: "Comment", author: "Account Manager", note: "" }); };
  const updClient = (f, v) => setClients(cl => cl.map(c => c.id === vc.id ? { ...c, [f]: v } : c));
  const updCt = (i, f, v) => setClients(cl => cl.map(c => c.id === vc.id ? { ...c, contacts: c.contacts.map((ct, j) => j === i ? { ...ct, [f]: v } : ct) } : c));
  const cc = t => ({ Email: Z.tx, Phone: Z.tx, Text: Z.tx, Comment: Z.tm, Survey: Z.tm, Result: Z.tm })[t] || Z.tm;
  const fmtD = d => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

    {/* ── HEADER ── */}
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div style={{ width: 56, height: 56, borderRadius: Ri, background: `hsl(${Math.abs([...(vc.name || "")].reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)) % 360}, 45%, 40%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: FW.black, color: INV.light, flexShrink: 0 }}>{(vc.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2)}</div>
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
        {/* Flag status — out of business / moved / etc. hides the client from active lists */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Flag:</span>
          <select
            value={vc.lapsedReason || ""}
            onChange={e => { const v = e.target.value || null; setClients(cl => cl.map(c => c.id === vc.id ? { ...c, lapsedReason: v } : c)); if (appData?.updateClient) appData.updateClient(vc.id, { lapsedReason: v }); }}
            style={{ background: vc.lapsedReason ? Z.wa + "15" : Z.bg, border: `1px solid ${vc.lapsedReason ? Z.wa : Z.bd}`, borderRadius: Ri, padding: "3px 8px", color: vc.lapsedReason ? Z.wa : Z.td, fontSize: FS.xs, fontWeight: FW.semi, fontFamily: COND, cursor: "pointer", outline: "none" }}
          >
            <option value="">Not flagged</option>
            <option value="out_of_business">Out of Business</option>
            <option value="moved">Moved Out of Area</option>
            <option value="out_of_market">Out of Market</option>
            <option value="duplicate">Duplicate</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
    </div>

    {/* ── RENEWAL ALERT ── */}
    {clientStatus === "Renewal" && <div style={{ padding: "12px 16px", background: `${Z.wa}15`, border: `1px solid ${Z.wa}40`, borderRadius: R, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <div>
        <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.wa }}>Renewal Due</div>
        <div style={{ fontSize: FS.sm, color: Z.tm }}>
          {vc.contractEndDate ? `Contract expires ${fmtD(vc.contractEndDate)}` : "This client is due for renewal."}
          {activeContracts.length > 0 && ` · Current: ${activeContracts[0].name} ($${(activeContracts[0].totalValue || 0).toLocaleString()})`}
        </div>
      </div>
      <Btn sm onClick={() => { if (onOpenProposal) onOpenProposal(vc.id); }}>Create Renewal Proposal</Btn>
    </div>}

    {/* ── FINANCIAL — AR at-a-glance, invoices, payments ── */}
    {(clientInvoices.length > 0 || clientPayments.length > 0) && <Card style={{ borderLeft: `3px solid ${Z.pu}`, marginBottom: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Financial</span>
        <span style={{ fontSize: FS.xs, color: Z.td }}>{clientInvoices.length} invoice{clientInvoices.length === 1 ? "" : "s"} · {clientPayments.length} payment{clientPayments.length === 1 ? "" : "s"}</span>
      </div>
      {/* At-a-glance */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 12 }}>
        <div style={{ background: Z.bg, borderRadius: Ri, padding: "10px 12px" }}>
          <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Current Balance</div>
          <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: currentBalance > 0 ? (overdueBalance > 0 ? Z.da : Z.wa) : Z.su, fontFamily: DISPLAY }}>${currentBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          {overdueBalance > 0 && <div style={{ fontSize: FS.micro, color: Z.da, fontWeight: FW.bold }}>${overdueBalance.toLocaleString()} overdue</div>}
        </div>
        <div style={{ background: Z.bg, borderRadius: Ri, padding: "10px 12px" }}>
          <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Lifetime Billed</div>
          <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>${Math.round(lifetimeBilled).toLocaleString()}</div>
        </div>
        <div style={{ background: Z.bg, borderRadius: Ri, padding: "10px 12px" }}>
          <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Lifetime Paid</div>
          <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.go, fontFamily: DISPLAY }}>${Math.round(lifetimePaid).toLocaleString()}</div>
        </div>
        <div style={{ background: Z.bg, borderRadius: Ri, padding: "10px 12px" }}>
          <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Last Payment</div>
          {lastPayment ? <>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>${Math.round(lastPayment.amount).toLocaleString()}</div>
            <div style={{ fontSize: FS.micro, color: Z.tm }}>{fmtD(lastPayment.receivedAt?.slice(0, 10))}</div>
          </> : <div style={{ fontSize: FS.sm, color: Z.td, fontStyle: "italic" }}>Never</div>}
        </div>
        <div style={{ background: Z.bg, borderRadius: Ri, padding: "10px 12px" }}>
          <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>DSO</div>
          <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: clientDso == null ? Z.td : clientDso <= 30 ? Z.go : clientDso <= 60 ? Z.wa : Z.da, fontFamily: DISPLAY }}>{clientDso != null ? `${clientDso}d` : "—"}</div>
          {oldestOpenInvoice && <div style={{ fontSize: FS.micro, color: Z.tm }}>Oldest: {fmtD(oldestOpenInvoice.dueDate)}</div>}
        </div>
      </div>
      {/* Tabs: Invoices / Payments */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        <button onClick={() => setFinTab("invoices")} style={{ padding: "4px 12px", borderRadius: Ri, border: `1px solid ${finTab === "invoices" ? Z.ac : Z.bd}`, background: finTab === "invoices" ? Z.ac + "15" : "transparent", color: finTab === "invoices" ? Z.ac : Z.tm, cursor: "pointer", fontSize: FS.xs, fontWeight: FW.heavy, fontFamily: COND, textTransform: "uppercase" }}>Invoices ({clientInvoices.length})</button>
        <button onClick={() => setFinTab("payments")} style={{ padding: "4px 12px", borderRadius: Ri, border: `1px solid ${finTab === "payments" ? Z.ac : Z.bd}`, background: finTab === "payments" ? Z.ac + "15" : "transparent", color: finTab === "payments" ? Z.ac : Z.tm, cursor: "pointer", fontSize: FS.xs, fontWeight: FW.heavy, fontFamily: COND, textTransform: "uppercase" }}>Payments ({clientPayments.length})</button>
      </div>
      {/* Invoices list */}
      {finTab === "invoices" && <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${Z.bd}`, borderRadius: Ri }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "140px 100px 100px 100px 100px 80px", gap: 10, alignItems: "center", padding: "8px 10px", background: Z.sa, borderBottom: `1px solid ${Z.bd}`, fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, position: "sticky", top: 0, zIndex: 1 }}>
          <span>Invoice #</span>
          <span>Issued</span>
          <span>Due</span>
          <span style={{ textAlign: "right" }}>Total</span>
          <span style={{ textAlign: "right" }}>Paid</span>
          <span style={{ textAlign: "right" }}>Status</span>
        </div>
        {clientInvoices.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No invoices</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: 4 }}>
          {[...clientInvoices].sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || "")).slice(0, 100).map(inv => {
            // Derive paid amount from invoice.total − balanceDue (authoritative).
            // Falls back to zero only when total is missing.
            const total = Number(inv.total || 0);
            const balance = Number(inv.balanceDue || 0);
            const invPaid = Math.max(0, total - balance);
            const isOverdue = inv.dueDate && inv.dueDate < today && balance > 0;
            return <div key={inv.id} style={{ display: "grid", gridTemplateColumns: "140px 100px 100px 100px 100px 80px", gap: 10, alignItems: "center", padding: "5px 10px", background: Z.bg, borderRadius: Ri, fontSize: FS.sm }}>
              <span style={{ fontWeight: FW.bold, color: Z.ac, fontFamily: COND }}>{inv.invoiceNumber}</span>
              <span style={{ color: Z.tm, fontSize: FS.xs }}>{fmtD(inv.issueDate)}</span>
              <span style={{ color: isOverdue ? Z.da : Z.tm, fontWeight: isOverdue ? FW.bold : FW.regular, fontSize: FS.xs }}>{fmtD(inv.dueDate)}</span>
              <span style={{ textAlign: "right", fontWeight: FW.heavy, color: Z.tx }}>${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              <span style={{ textAlign: "right", color: invPaid > 0 ? Z.go : Z.td, fontWeight: FW.bold }}>{invPaid > 0 ? `$${invPaid.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : "—"}</span>
              <span style={{ textAlign: "right" }}>
                <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: Ri, fontSize: FS.micro, fontWeight: FW.heavy, background: inv.status === "paid" ? Z.go + "20" : inv.status === "overdue" ? Z.da + "20" : inv.status === "partially_paid" ? Z.wa + "20" : Z.ac + "20", color: inv.status === "paid" ? Z.go : inv.status === "overdue" ? Z.da : inv.status === "partially_paid" ? Z.wa : Z.ac, textTransform: "uppercase" }}>
                  {inv.status === "partially_paid" ? "Partial" : inv.status}
                </span>
              </span>
            </div>;
          })}
          {clientInvoices.length > 100 && <div style={{ padding: 6, textAlign: "center", fontSize: FS.micro, color: Z.td }}>Showing 100 of {clientInvoices.length}</div>}
        </div>}
      </div>}
      {/* Payments list */}
      {finTab === "payments" && <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${Z.bd}`, borderRadius: Ri }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "100px 100px 120px 140px 1fr 100px", gap: 10, alignItems: "center", padding: "8px 10px", background: Z.sa, borderBottom: `1px solid ${Z.bd}`, fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, position: "sticky", top: 0, zIndex: 1 }}>
          <span>Date</span>
          <span>Amount</span>
          <span>Method</span>
          <span>Invoice #</span>
          <span>Memo</span>
          <span style={{ textAlign: "right" }}>Ref</span>
        </div>
        {clientPayments.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No payments recorded</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: 4 }}>
          {[...clientPayments].sort((a, b) => (b.receivedAt || "").localeCompare(a.receivedAt || "")).slice(0, 100).map(p => {
            const inv = clientInvoices.find(i => i.id === p.invoiceId);
            const nmMatch = /^NM:\s*([^|]+)/.exec(p.notes || "");
            const methodLabel = nmMatch ? nmMatch[1].trim() : (p.method || "other");
            const memoMatch = /Memo:\s*([^|]+)/.exec(p.notes || "");
            return <div key={p.id} style={{ display: "grid", gridTemplateColumns: "100px 100px 120px 140px 1fr 100px", gap: 10, alignItems: "center", padding: "5px 10px", background: Z.bg, borderRadius: Ri, fontSize: FS.sm }}>
              <span style={{ color: Z.tm, fontSize: FS.xs }}>{fmtD(p.receivedAt?.slice(0, 10))}</span>
              <span style={{ fontWeight: FW.heavy, color: Z.go }}>${(p.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              <span style={{ fontSize: FS.xs, color: Z.tm }}>{methodLabel}</span>
              <span style={{ fontSize: FS.xs, color: Z.ac, fontFamily: COND }}>{inv?.invoiceNumber || "—"}</span>
              <span style={{ fontSize: FS.xs, color: Z.td, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{memoMatch ? memoMatch[1].trim() : ""}</span>
              <span style={{ textAlign: "right", fontSize: FS.micro, color: Z.td }}>{p.referenceNumber || ""}</span>
            </div>;
          })}
          {clientPayments.length > 100 && <div style={{ padding: 6, textAlign: "center", fontSize: FS.micro, color: Z.td }}>Showing 100 of {clientPayments.length}</div>}
        </div>}
      </div>}
    </Card>}

    {/* ── PURCHASE TIMELINE — contracts, standalone ads, orphan proposals grouped by year ── */}
    {(timelineYears.length > 0 || clientProposals.length > 0) && <Card style={{ borderLeft: `3px solid ${Z.ac}`, marginBottom: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Purchase Timeline</span>
        <span style={{ fontSize: FS.xs, color: Z.td }}>{closedCS.length} ad{closedCS.length !== 1 ? "s" : ""} · {clientContracts.length} contract{clientContracts.length !== 1 ? "s" : ""} · ${totalRevenue.toLocaleString()} lifetime</span>
      </div>
      {timelineYears.length === 0 && <div style={{ padding: 12, textAlign: "center", color: Z.td, fontSize: FS.sm, background: Z.bg, borderRadius: Ri }}>No purchase history yet</div>}
      {timelineYears.map(yr => {
        const open = expandedYears.has(yr.year);
        return <div key={yr.year} style={{ marginBottom: 8 }}>
          <button onClick={() => toggleYear(yr.year)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, cursor: "pointer", textAlign: "left" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: Z.tm, width: 10, display: "inline-block" }}>{open ? "▼" : "▶"}</span>
              <span style={{ fontSize: FS.md, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{yr.year}</span>
              <span style={{ fontSize: FS.xs, color: Z.td, marginLeft: 8 }}>
                {yr.contracts.length > 0 && `${yr.contracts.length} contract${yr.contracts.length !== 1 ? "s" : ""} · `}
                {yr.adCount} ad{yr.adCount !== 1 ? "s" : ""}
                {yr.proposals.length > 0 && ` · ${yr.proposals.length} proposal${yr.proposals.length !== 1 ? "s" : ""}`}
              </span>
            </span>
            <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.ac, fontFamily: DISPLAY }}>${yr.total.toLocaleString()}</span>
          </button>

          {open && <div style={{ padding: "8px 0 0 18px", display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Contracts */}
            {yr.contracts.map(ct => {
              const ctOpen = expandedContracts.has(ct.id);
              const stColor = ct.status === "active" ? (Z.su || "#22C55E") : ct.status === "cancelled" ? Z.da : Z.tm;
              return <div key={ct.id} style={{ background: Z.bg, border: `1px solid ${ct.status === "active" ? stColor + "40" : Z.bd}`, borderRadius: Ri, overflow: "hidden" }}>
                <button onClick={() => toggleContract(ct.id)}
                  style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left", color: Z.tx }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 10, color: Z.tm, width: 10 }}>{ctOpen ? "▼" : "▶"}</span>
                      <Ic.handshake size={11} color={Z.tm} />
                      <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>{ct.name}</span>
                      <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: stColor, background: stColor + "15", padding: "1px 6px", borderRadius: Ri, textTransform: "uppercase", letterSpacing: 0.3 }}>{ct.status}</span>
                    </div>
                    <div style={{ fontSize: FS.xs, color: Z.tm, marginLeft: 27 }}>{ct.startDate || "?"} → {ct.endDate || "?"}{ct.lines?.length > 0 && ` · ${ct.lines.map(ln => `${pn(ln.pubId)} ${ln.adSize}×${ln.quantity}`).join(" · ")}`}</div>
                    {ct.totalValue > 0 && <div style={{ marginTop: 6, marginLeft: 27, marginRight: 0 }}>
                      <div style={{ height: 5, background: Z.sa, borderRadius: Ri, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${ct.pct}%`, background: ct.pct >= 100 ? (Z.su || "#22C55E") : ct.status === "cancelled" ? Z.da : Z.ac, transition: "width 0.3s" }} />
                      </div>
                      <div style={{ fontSize: FS.micro, color: Z.td, marginTop: 2 }}>${ct.fulfilled.toLocaleString()} of ${(ct.totalValue || 0).toLocaleString()} delivered · {ct.pct}%</div>
                    </div>}
                  </div>
                  <div style={{ textAlign: "right", paddingLeft: 10 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>${(ct.totalValue || 0).toLocaleString()}</div>
                  </div>
                </button>
                {ctOpen && ct.ads.length > 0 && <div style={{ padding: "0 14px 10px 41px", display: "flex", flexDirection: "column", gap: 2, borderTop: `1px solid ${Z.bd}` }}>
                  <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, padding: "6px 0 2px" }}>Ads under this contract ({ct.ads.length})</div>
                  {ct.ads.map(a => <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: FS.xs, color: Z.tm, borderBottom: `1px solid ${Z.bd}20` }}>
                    <span style={{ display: "flex", gap: 8 }}><span style={{ color: Z.td, width: 72 }}>{a.date || "—"}</span><span style={{ color: Z.tx, fontWeight: FW.semi }}>{pn(a.publication)}</span><span>{a.size || a.type || "Ad"}</span></span>
                    <span style={{ fontWeight: FW.heavy, color: Z.tx }}>${(a.amount || 0).toLocaleString()}</span>
                  </div>)}
                </div>}
                {ctOpen && ct.ads.length === 0 && <div style={{ padding: "4px 14px 10px 41px", fontSize: FS.micro, color: Z.td, borderTop: `1px solid ${Z.bd}` }}>No ads fulfilled yet against this contract.</div>}
              </div>;
            })}

            {/* Standalone ads (not tied to any contract) */}
            {yr.standaloneSales.length > 0 && <div style={{ marginTop: yr.contracts.length > 0 ? 4 : 0 }}>
              <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, paddingLeft: 4 }}>Standalone Ad Orders ({yr.standaloneSales.length})</div>
              <div style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "4px 10px" }}>
                {yr.standaloneSales.map(a => <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", fontSize: FS.xs, borderBottom: `1px solid ${Z.bd}20` }}>
                  <span style={{ display: "flex", gap: 8 }}><Ic.tag size={10} color={Z.td} /><span style={{ color: Z.td, width: 72 }}>{a.date || "—"}</span><span style={{ color: Z.tx, fontWeight: FW.semi }}>{pn(a.publication)}</span><span style={{ color: Z.tm }}>{a.size || a.type || "Ad"}</span></span>
                  <span style={{ fontWeight: FW.heavy, color: Z.tx }}>${(a.amount || 0).toLocaleString()}</span>
                </div>)}
              </div>
            </div>}

            {/* Orphan / reappeared proposals */}
            {yr.proposals.length > 0 && <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, paddingLeft: 4 }}>Proposals ({yr.proposals.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {yr.proposals.map(p => <div key={p.id} onClick={() => { if (onNavTo) onNavTo("Proposals"); if (onSetViewPropId) setTimeout(() => onSetViewPropId(p.id), 50); }}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: p.status === "Draft" ? Z.wa + "10" : Z.bg, border: `1px solid ${p.status === "Draft" ? Z.wa + "40" : Z.bd}`, borderRadius: Ri, cursor: "pointer" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                    <Ic.file size={11} color={Z.tm} />
                    <span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                    <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase" }}>{p.status}</span>
                    {p._reappeared && <span style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.da, background: Z.da + "15", padding: "1px 6px", borderRadius: Ri }}>Contract cancelled</span>}
                  </div>
                  <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.ac }}>${(p.total || 0).toLocaleString()}</span>
                </div>)}
              </div>
            </div>}
          </div>}
        </div>;
      })}
    </Card>}

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
        </Card>
        {/* Client Asset Library */}
        {vc?.clientCode && <Card style={{ marginTop: 10 }}>
          <AssetPanel path={`clients/${vc.clientCode}/assets`} title="Asset Library" />
        </Card>}
      </div>
    </div>
  </div>;
};

export default ClientProfile;
