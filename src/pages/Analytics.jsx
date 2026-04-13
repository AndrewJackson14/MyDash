import { useState, useEffect, useMemo, memo } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, CARD, R } from "../lib/theme";
import { Ic, Btn, Card, Stat, TB, FilterBar , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, DataTable, ListCard, ListDivider, ListGrid } from "../components/ui";
import { supabase } from "../lib/supabase";

import { fmtCurrencyWhole as fmtCurrency } from "../lib/formatters";
const fmtK = (n) => "$" + ((n || 0) / 1000).toFixed(1) + "K";
const today = new Date().toISOString().slice(0, 10);
const thisMonth = today.slice(0, 7);
const thisYear = today.slice(0, 4);

const HBar = ({ value, max, color, label, sub }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
    {label && <span style={{ fontSize: FS.base, fontWeight: FW.semi, fontFamily: COND, color: Z.tx, width: 140, flexShrink: 0 }}>{label}</span>}
    <div style={{ flex: 1, height: 8, background: Z.bg, borderRadius: R }}>
      <div style={{ height: "100%", borderRadius: R, width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%`, background: color || Z.ac, transition: "width 0.3s" }} />
    </div>
    <span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: color || Z.ac, width: 75, textAlign: "right", flexShrink: 0 }}>{fmtCurrency(value)}</span>
    {sub && <span style={{ fontSize: FS.xs, color: Z.td, width: 40, textAlign: "right", flexShrink: 0 }}>{sub}</span>}
  </div>
);

const Analytics = ({
  pubs, sales, clients, issues, stories,
  invoices, payments, subscribers, legalNotices, creativeJobs,
  freelancerPayments, dropLocations, dropLocationPubs, drivers,
}) => {
  const [tab, setTab] = useState("Overview");
  const [plPub, setPlPub] = useState("all");

  const _inv = invoices || [];
  const _pay = payments || [];
  const _subs = subscribers || [];
  const _legal = legalNotices || [];
  const _jobs = creativeJobs || [];
  const _fpay = freelancerPayments || [];
  const _drivers = drivers || [];

  const closedSales = useMemo(() => sales.filter(s => s.status === "Closed"), [sales]);

  // ─── Revenue Metrics ────────────────────────────────────
  const { monthRev, yearRev, totalRev, avgDeal, pipVal, activeDeals } = useMemo(() => {
    const mr = closedSales.filter(s => s.date?.startsWith(thisMonth)).reduce((s, x) => s + (x.amount || 0), 0);
    const yr = closedSales.filter(s => s.date?.startsWith(thisYear)).reduce((s, x) => s + (x.amount || 0), 0);
    const tr = closedSales.reduce((s, x) => s + (x.amount || 0), 0);
    const ad = closedSales.length > 0 ? Math.round(tr / closedSales.length) : 0;
    const active = sales.filter(s => !["Closed", "Follow-up"].includes(s.status));
    const pv = active.reduce((s, x) => s + (x.amount || 0), 0);
    return { monthRev: mr, yearRev: yr, totalRev: tr, avgDeal: ad, pipVal: pv, activeDeals: active };
  }, [closedSales, sales]);

  // Collected payments
  const monthCollected = useMemo(() => _pay.filter(p => p.receivedAt?.startsWith(thisMonth)).reduce((s, p) => s + (p.amount || 0), 0), [_pay]);
  const yearCollected = useMemo(() => _pay.filter(p => p.receivedAt?.startsWith(thisYear)).reduce((s, p) => s + (p.amount || 0), 0), [_pay]);

  // Outstanding / overdue
  const outstanding = useMemo(() => _inv.filter(i => ["sent", "partially_paid", "overdue"].includes(i.status)).reduce((s, i) => s + (i.balanceDue || 0), 0), [_inv]);
  const overdueAmt = useMemo(() => _inv.filter(i => i.status === "overdue" || (i.status === "sent" && i.dueDate && i.dueDate < today)).reduce((s, i) => s + (i.balanceDue || 0), 0), [_inv]);

  // Revenue by stream
  const legalRev = useMemo(() => _legal.reduce((s, n) => s + (n.totalAmount || 0), 0), [_legal]);
  const jobsRev = useMemo(() => _jobs.reduce((s, j) => s + (j.finalAmount || j.quotedAmount || 0), 0), [_jobs]);
  const subRev = useMemo(() => _subs.filter(s => s.status === "active").reduce((s, sub) => s + (sub.amountPaid || 0), 0), [_subs]);
  const adRev = totalRev; // closed sales = ad revenue

  // ─── Per-Publication P&L ────────────────────────────────
  const pubPL = useMemo(() => {
    // Pre-compute lookup maps for O(1) access
    const storyPubMap = {};
    (stories || []).forEach(s => { storyPubMap[s.id] = s.publication; });
    const salesByPub = {};
    closedSales.forEach(s => { if (!salesByPub[s.publication]) salesByPub[s.publication] = []; salesByPub[s.publication].push(s); });
    const totalDriverCost = _drivers.reduce((s, d) => s + (d.flatFee || 0), 0) * 4;
    const totalDropCount = (dropLocationPubs || []).length || 1;

    return pubs.map(pub => {
      const pubAdRev = (salesByPub[pub.id] || []).reduce((s, x) => s + (x.amount || 0), 0);
      const pubLegalRev = _legal.filter(n => n.publicationId === pub.id).reduce((s, n) => s + (n.totalAmount || 0), 0);
      const pubSubRev = _subs.filter(s => s.publicationId === pub.id && s.status === "active").reduce((s, sub) => s + (sub.amountPaid || 0), 0);
      const pubTotalRev = pubAdRev + pubLegalRev + pubSubRev;
      const pubFreelanceCost = _fpay.filter(p => storyPubMap[p.storyId] === pub.id).reduce((s, p) => s + (p.amount || 0), 0);
      const pubIssuesThisYear = issues.filter(i => i.pubId === pub.id && i.date?.startsWith(thisYear) && i.date <= today).length;
      const estPrintCostPerIssue = pub.type === "Magazine" ? 2500 : 800;
      const pubPrintCost = pubIssuesThisYear * estPrintCostPerIssue;
      const pubDropLocs = (dropLocationPubs || []).filter(dp => dp.publicationId === pub.id);
      const pubDriverCost = pubDropLocs.length > 0 ? Math.round((pubDropLocs.length / totalDropCount) * totalDriverCost) : 0;
      const pubTotalCost = pubFreelanceCost + pubPrintCost + pubDriverCost;
      const pubProfit = pubTotalRev - pubTotalCost;
      const pubMargin = pubTotalRev > 0 ? Math.round((pubProfit / pubTotalRev) * 100) : 0;
      return { pub, adRev: pubAdRev, legalRev: pubLegalRev, subRev: pubSubRev, totalRev: pubTotalRev, freelanceCost: pubFreelanceCost, printCost: pubPrintCost, driverCost: pubDriverCost, totalCost: pubTotalCost, profit: pubProfit, margin: pubMargin };
    }).sort((a, b) => b.totalRev - a.totalRev);
  }, [pubs, closedSales, stories, issues, _legal, _subs, _fpay, _drivers, dropLocationPubs]);

  const totalPL = {
    totalRev: pubPL.reduce((s, p) => s + p.totalRev, 0),
    totalCost: pubPL.reduce((s, p) => s + p.totalCost, 0),
    profit: pubPL.reduce((s, p) => s + p.profit, 0),
  };
  totalPL.margin = totalPL.totalRev > 0 ? Math.round((totalPL.profit / totalPL.totalRev) * 100) : 0;

  // ─── Revenue by pub ─────────────────────────────────────
  const revByPub = pubs.map(p => ({ pub: p, rev: closedSales.filter(s => s.publication === p.id).reduce((s, x) => s + (x.amount || 0), 0), deals: closedSales.filter(s => s.publication === p.id).length })).sort((a, b) => b.rev - a.rev);
  const mxP = Math.max(...revByPub.map(r => r.rev), 1);

  // Top clients
  const topC = clients.map(c => ({ name: c.name, id: c.id, spend: closedSales.filter(s => s.clientId === c.id).reduce((s, x) => s + (x.amount || 0), 0) })).filter(c => c.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 10);
  const mxC = Math.max(...topC.map(c => c.spend), 1);

  // Ad fill rates
  const fills = issues.filter(i => i.date >= today).slice(0, 12).map(i => { const p = pubs.find(x => x.id === i.pubId); const ts = Math.floor((p?.pageCount || 24) * 0.4); const sold = closedSales.filter(s => s.issueId === i.id).length; return { i, p, pct: ts > 0 ? Math.round((sold / ts) * 100) : 0, sold, ts }; });

  // Editorial pipeline
  const bySt = {}; stories.forEach(s => { bySt[s.status] = (bySt[s.status] || 0) + 1; });

  // Selected pub for P&L detail
  const selPL = plPub === "all" ? null : pubPL.find(p => p.pub.id === plPub);

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="Analytics" />

    <TabRow><TB tabs={["Overview", "P&L", "Sales", "Editorial", "Subscribers", "Web"]} active={tab} onChange={setTab} /></TabRow>

    {/* ════════ OVERVIEW ════════ */}
    {tab === "Overview" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
        {[
          ["Month Rev", fmtK(monthRev), Z.ac],
          ["Year Rev", fmtK(yearRev), Z.pu],
          ["Collected", fmtK(monthCollected), Z.su],
          ["Outstanding", fmtCurrency(outstanding), outstanding > 0 ? Z.wa : Z.ac],
          ["Pipeline", fmtK(pipVal), Z.or || Z.wa],
          ["Avg Deal", fmtCurrency(avgDeal), Z.ac],
        ].map(([l, v, c]) => <GlassStat key={l} label={l} value={v} />)}
      </div>

      {/* Revenue by stream */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Revenue by Stream</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {[
            { label: "Ad Sales", value: adRev, color: Z.ac, icon: "📰" },
            { label: "Legal Notices", value: legalRev, color: Z.wa, icon: "⚖️" },
            { label: "Creative Services", value: jobsRev, color: Z.pu, icon: "🎨" },
            { label: "Subscriptions", value: subRev, color: Z.su, icon: "📬" },
          ].map(s => <div key={s.label} style={{ textAlign: "center", padding: CARD.pad, background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: FS.xl, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{fmtCurrency(s.value)}</div>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginTop: 2 }}>{s.label}</div>
          </div>)}
        </div>
      </GlassCard>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <GlassCard>
          <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Revenue by Publication</div>
          {revByPub.map(r => <HBar key={r.pub.id} label={r.pub.name} value={r.rev} max={mxP} color={Z.tm} sub={`${r.deals}`} />)}
        </GlassCard>
        <GlassCard>
          <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Top Clients</div>
          {topC.map((c, i) => <HBar key={c.id} label={`${i + 1}. ${c.name}`} value={c.spend} max={mxC} color={Z.ac} />)}
          {topC.length === 0 && <div style={{ fontSize: FS.base, color: Z.td, padding: 16, textAlign: "center" }}>No client revenue data</div>}
        </GlassCard>
      </div>
    </>}

    {/* ════════ P&L ════════ */}
    {tab === "P&L" && <>
      {/* Company totals */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <GlassStat label="Total Revenue" value={fmtCurrency(totalPL.totalRev)} />
        <GlassStat label="Total Costs (Est.)" value={fmtCurrency(totalPL.totalCost)} />
        <GlassStat label="Net Profit (Est.)" value={fmtCurrency(totalPL.profit)} color={totalPL.profit >= 0 ? Z.su : Z.da} />
        <GlassStat label="Margin" value={`${totalPL.margin}%`} color={totalPL.margin >= 30 ? Z.su : totalPL.margin >= 15 ? Z.wa : Z.da} />
      </div>

      {/* Pub selector */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setPlPub("all")} style={{ borderRadius: Ri, border: `1px solid ${Z.bg === "#08090D" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.5)"}`, background: "transparent", cursor: "pointer", fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>All Publications</button>
        {pubs.map(p => <button key={p.id} onClick={() => setPlPub(p.id)} style={{ borderRadius: Ri, border: `1px solid ${plPub === p.id ? Z.tm : Z.bd}`, background: plPub === p.id ? Z.sa : "transparent", cursor: "pointer", fontSize: FS.sm, fontWeight: FW.bold, color: plPub === p.id ? Z.tx : Z.tm }}>{p.name}</button>)}
      </div>

      {/* P&L Table */}
      {plPub === "all" ? (
        <GlassCard style={{ padding: 0, overflow: "hidden" }}>
          <DataTable>
            <thead>
              <tr>
                {["Publication", "Ad Revenue", "Legal", "Subscriptions", "Total Rev", "Freelance", "Printing", "Distribution", "Total Cost", "Profit", "Margin"].map(h =>
                  <th key={h} style={{ textAlign: h === "Publication" ? "left" : "right", fontWeight: FW.heavy, color: Z.tm, fontSize: FS.micro, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {pubPL.map(p => <tr key={p.pub.id} onClick={() => setPlPub(p.pub.id)} style={{ cursor: "pointer" }}>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: R, background: Z.tm }} />
                    <span style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{p.pub.name}</span>
                  </div>
                </td>
                <td style={{ fontSize: FS.sm, color: Z.tx, textAlign: "right" }}>{fmtCurrency(p.adRev)}</td>
                <td style={{ fontSize: FS.sm, color: Z.tx, textAlign: "right" }}>{fmtCurrency(p.legalRev)}</td>
                <td style={{ fontSize: FS.sm, color: Z.tx, textAlign: "right" }}>{fmtCurrency(p.subRev)}</td>
                <td style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.su, textAlign: "right" }}>{fmtCurrency(p.totalRev)}</td>
                <td style={{ fontSize: FS.sm, color: Z.da, textAlign: "right" }}>{fmtCurrency(p.freelanceCost)}</td>
                <td style={{ fontSize: FS.sm, color: Z.da, textAlign: "right" }}>{fmtCurrency(p.printCost)}</td>
                <td style={{ fontSize: FS.sm, color: Z.da, textAlign: "right" }}>{fmtCurrency(p.driverCost)}</td>
                <td style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.da, textAlign: "right" }}>{fmtCurrency(p.totalCost)}</td>
                <td style={{ fontSize: FS.base, fontWeight: FW.black, color: p.profit >= 0 ? Z.su : Z.da, textAlign: "right" }}>{fmtCurrency(p.profit)}</td>
                <td style={{ fontSize: FS.sm, fontWeight: FW.bold, color: p.margin >= 30 ? Z.su : p.margin >= 15 ? Z.wa : Z.da, textAlign: "right" }}>{p.margin}%</td>
              </tr>)}
              {/* Totals row */}
              <tr style={{ background: Z.sa, borderTop: `2px solid ${Z.bd}` }}>
                <td style={{ fontSize: FS.base, fontWeight: FW.black, color: Z.tx }}>TOTAL</td>
                <td style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx, textAlign: "right" }}>{fmtCurrency(pubPL.reduce((s, p) => s + p.adRev, 0))}</td>
                <td style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx, textAlign: "right" }}>{fmtCurrency(pubPL.reduce((s, p) => s + p.legalRev, 0))}</td>
                <td style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx, textAlign: "right" }}>{fmtCurrency(pubPL.reduce((s, p) => s + p.subRev, 0))}</td>
                <td style={{ fontSize: FS.md, fontWeight: FW.black, color: Z.su, textAlign: "right" }}>{fmtCurrency(totalPL.totalRev)}</td>
                <td style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.da, textAlign: "right" }}>{fmtCurrency(pubPL.reduce((s, p) => s + p.freelanceCost, 0))}</td>
                <td style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.da, textAlign: "right" }}>{fmtCurrency(pubPL.reduce((s, p) => s + p.printCost, 0))}</td>
                <td style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.da, textAlign: "right" }}>{fmtCurrency(pubPL.reduce((s, p) => s + p.driverCost, 0))}</td>
                <td style={{ fontSize: FS.md, fontWeight: FW.black, color: Z.da, textAlign: "right" }}>{fmtCurrency(totalPL.totalCost)}</td>
                <td style={{ fontSize: FS.md, fontWeight: FW.black, color: totalPL.profit >= 0 ? Z.su : Z.da, textAlign: "right" }}>{fmtCurrency(totalPL.profit)}</td>
                <td style={{ fontSize: FS.base, fontWeight: FW.black, color: totalPL.margin >= 30 ? Z.su : Z.wa, textAlign: "right" }}>{totalPL.margin}%</td>
              </tr>
            </tbody>
          </DataTable>
        </GlassCard>
      ) : selPL && (
        /* Single publication detail P&L */
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 14, height: 14, borderRadius: R, background: Z.tm }} />
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{selPL.pub.name} — P&L</h3>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            <GlassStat label="Revenue" value={fmtCurrency(selPL.totalRev)} />
            <GlassStat label="Costs (Est.)" value={fmtCurrency(selPL.totalCost)} />
            <GlassStat label="Profit" value={fmtCurrency(selPL.profit)} color={selPL.profit >= 0 ? Z.su : Z.da} />
            <GlassStat label="Margin" value={`${selPL.margin}%`} color={selPL.margin >= 30 ? Z.su : selPL.margin >= 15 ? Z.wa : Z.da} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <GlassCard>
              <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.su, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Revenue Breakdown</div>
              {[
                { label: "Display Ad Sales", value: selPL.adRev },
                { label: "Legal Notices", value: selPL.legalRev },
                { label: "Subscriptions", value: selPL.subRev },
              ].map(r => <div key={r.label} style={{ display: "flex", justifyContent: "space-between",  }}>
                <span style={{ fontSize: FS.base, color: Z.tx }}>{r.label}</span>
                <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.su }}>{fmtCurrency(r.value)}</span>
              </div>)}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0" }}>
                <span style={{ fontSize: FS.md, fontWeight: FW.black, color: Z.tx }}>Total Revenue</span>
                <span style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.su }}>{fmtCurrency(selPL.totalRev)}</span>
              </div>
            </GlassCard>

            <GlassCard>
              <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.da, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Cost Breakdown (Estimated)</div>
              {[
                { label: "Freelance Writers/Editors", value: selPL.freelanceCost },
                { label: "Printing", value: selPL.printCost },
                { label: "Distribution/Drivers", value: selPL.driverCost },
              ].map(r => <div key={r.label} style={{ display: "flex", justifyContent: "space-between",  }}>
                <span style={{ fontSize: FS.base, color: Z.tx }}>{r.label}</span>
                <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.da }}>{fmtCurrency(r.value)}</span>
              </div>)}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0" }}>
                <span style={{ fontSize: FS.md, fontWeight: FW.black, color: Z.tx }}>Total Costs</span>
                <span style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.da }}>{fmtCurrency(selPL.totalCost)}</span>
              </div>
            </GlassCard>
          </div>

          <GlassCard style={{ background: selPL.profit >= 0 ? Z.ss : Z.ds, border: "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: FS.lg, fontWeight: FW.black, color: selPL.profit >= 0 ? Z.su : Z.da }}>Net Profit</span>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 28, fontWeight: FW.black, color: selPL.profit >= 0 ? Z.su : Z.da, fontFamily: DISPLAY }}>{fmtCurrency(selPL.profit)}</span>
                <div style={{ fontSize: FS.base, fontWeight: FW.bold, color: selPL.profit >= 0 ? Z.su : Z.da }}>{selPL.margin}% margin</div>
              </div>
            </div>
          </GlassCard>

          <div style={{ fontSize: FS.xs, color: Z.td, fontStyle: "italic" }}>Note: Costs are estimated from available data. Printing costs use averages ({selPL.pub.type === "Magazine" ? "$2,500" : "$800"}/issue). Actual costs will be more accurate once printer invoices and freelancer payments are tracked in the system.</div>
        </div>
      )}
    </>}

    {/* ════════ SALES TAB ════════ */}
    {tab === "Sales" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
        {[
          ["This Month", fmtK(monthRev), Z.ac],
          ["This Year", fmtK(yearRev), Z.pu],
          ["Avg Deal", fmtCurrency(avgDeal), Z.wa],
          ["Pipeline", fmtK(pipVal), Z.or || Z.wa],
          ["Active Deals", String(activeDeals.length), Z.ac],
        ].map(([l, v, c]) => <GlassStat key={l} label={l} value={v} />)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <GlassCard>
          <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Revenue by Publication</div>
          {revByPub.map(r => <HBar key={r.pub.id} label={r.pub.name} value={r.rev} max={mxP} color={Z.tm} sub={`${r.deals}`} />)}
        </GlassCard>
        <GlassCard>
          <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Top Clients</div>
          {topC.map((c, i) => <HBar key={c.id} label={`${i + 1}. ${c.name}`} value={c.spend} max={mxC} color={Z.ac} />)}
        </GlassCard>
      </div>

      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Ad Fill Rate — Upcoming Issues</div>
        {fills.map(f => <HBar key={f.i.id} label={`${f.p?.name?.split(" ").map(w => w[0]).join("") || ""} ${f.i.label}`} value={f.pct} max={100} color={f.pct >= 80 ? Z.ac : f.pct >= 50 ? Z.wa : Z.tm} sub={`${f.sold}/${f.ts}`} />)}
      </GlassCard>
    </>}

    {/* ════════ EDITORIAL TAB ════════ */}
    {tab === "Editorial" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <GlassStat label="Total Stories" value={stories.length} />
        <GlassStat label="In Progress" value={stories.filter(s => !["On Page", "Sent to Web"].includes(s.status)).length} />
        <GlassStat label="On Page" value={bySt["On Page"] || 0} />
        <GlassStat label="Published to Web" value={bySt["Sent to Web"] || 0} />
      </div>

      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Editorial Pipeline</div>
        {["Assigned", "Draft", "Needs Editing", "Edited", "Approved", "On Page", "Sent to Web"].map(st => {
          const n = bySt[st] || 0;
          const clr = { "Needs Editing": Z.da, Draft: Z.tm, Edited: Z.wa, Approved: Z.ac, "On Page": Z.pu, "Sent to Web": Z.ac, Assigned: Z.td }[st] || Z.tm;
          return <HBar key={st} label={st} value={n} max={Math.max(...Object.values(bySt), 1)} color={clr} />;
        })}
      </GlassCard>

      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Stories by Publication</div>
        {pubs.map(p => {
          const pStories = stories.filter(s => s.publication === p.id);
          return <HBar key={p.id} label={p.name} value={pStories.length} max={Math.max(...pubs.map(pp => stories.filter(s => s.publication === pp.id).length), 1)} color={Z.tm} sub="" />;
        })}
      </GlassCard>
    </>}

    {tab === "Subscribers" && (() => {
      const active = _subs.filter(s => s.status === "active");
      const expired = _subs.filter(s => s.status === "expired");
      const cancelled = _subs.filter(s => s.status === "cancelled");
      const pending = _subs.filter(s => s.status === "pending");
      const printSubs = active.filter(s => s.type === "print");
      const digitalSubs = active.filter(s => s.type === "digital");
      const totalRevenue = _subs.reduce((s, sub) => s + (sub.amountPaid || 0), 0);
      const activeRevenue = active.reduce((s, sub) => s + (sub.amountPaid || 0), 0);

      // Subscribers by publication
      const byPub = {};
      pubs.forEach(p => { byPub[p.id] = { name: p.name, color: Z.tm, count: 0, revenue: 0 }; });
      active.forEach(sub => {
        if (sub.publicationId && byPub[sub.publicationId]) {
          byPub[sub.publicationId].count++;
          byPub[sub.publicationId].revenue += (sub.amountPaid || 0);
        }
      });
      const pubEntries = Object.values(byPub).filter(p => p.count > 0).sort((a, b) => b.count - a.count);
      const maxPubCount = Math.max(...pubEntries.map(p => p.count), 1);
      const maxPubRev = Math.max(...pubEntries.map(p => p.revenue), 1);

      // Monthly signups (last 12 months)
      const monthlySignups = {};
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toISOString().slice(0, 7);
        monthlySignups[key] = 0;
      }
      _subs.forEach(sub => {
        const key = (sub.createdAt || sub.startDate || "").slice(0, 7);
        if (monthlySignups[key] !== undefined) monthlySignups[key]++;
      });
      const monthKeys = Object.keys(monthlySignups);
      const maxMonthly = Math.max(...Object.values(monthlySignups), 1);

      return <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14 }}>
          <GlassStat label="Total" value={_subs.length} />
          <GlassStat label="Active" value={active.length} color={Z.su} />
          <GlassStat label="Print" value={printSubs.length} />
          <GlassStat label="Digital" value={digitalSubs.length} />
          <GlassStat label="Active Revenue" value={fmtCurrency(activeRevenue)} color={Z.su} />
          <GlassStat label="Lifetime Revenue" value={fmtCurrency(totalRevenue)} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <GlassCard>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Status Breakdown</div>
            <HBar label="Active" value={active.length} max={Math.max(_subs.length, 1)} color={Z.su || "#22c55e"} />
            <HBar label="Expired" value={expired.length} max={Math.max(_subs.length, 1)} color={Z.wa || "#f59e0b"} />
            <HBar label="Cancelled" value={cancelled.length} max={Math.max(_subs.length, 1)} color={Z.da || "#ef4444"} />
            <HBar label="Pending" value={pending.length} max={Math.max(_subs.length, 1)} color={Z.tm} />
          </GlassCard>

          <GlassCard>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Type Breakdown</div>
            <HBar label="Print" value={printSubs.length} max={Math.max(active.length, 1)} color={Z.ac} />
            <HBar label="Digital" value={digitalSubs.length} max={Math.max(active.length, 1)} color={Z.pu || "#8b5cf6"} />
          </GlassCard>
        </div>

        <GlassCard>
          <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Monthly Signups (Last 12 Months)</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120 }}>
            {monthKeys.map(key => {
              const val = monthlySignups[key];
              const h = maxMonthly > 0 ? Math.max(4, (val / maxMonthly) * 100) : 4;
              const label = new Date(key + "-01").toLocaleDateString("en-US", { month: "short" });
              return <div key={key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: Z.tx, fontFamily: COND }}>{val || ""}</span>
                <div style={{ width: "100%", height: h + "%", background: Z.ac, borderRadius: 2, minHeight: 4, transition: "height 0.3s" }} />
                <span style={{ fontSize: 9, color: Z.td, fontFamily: COND }}>{label}</span>
              </div>;
            })}
          </div>
        </GlassCard>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <GlassCard>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Subscribers by Publication</div>
            {pubEntries.length > 0 ? pubEntries.map(p => (
              <HBar key={p.name} label={p.name} value={p.count} max={maxPubCount} color={p.color} sub="" />
            )) : <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>No active subscribers</div>}
          </GlassCard>

          <GlassCard>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Revenue by Publication</div>
            {pubEntries.length > 0 ? pubEntries.map(p => (
              <HBar key={p.name} label={p.name} value={p.revenue} max={maxPubRev} color={p.color} />
            )) : <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>No subscriber revenue</div>}
          </GlassCard>
        </div>
      </>;
    })()}

    {/* ════════ WEB ANALYTICS ════════ */}
    {tab === "Web" && <WebAnalyticsTab pubs={pubs} />}
  </div>;
};

// ── Web Analytics Tab ──────────────────────────────────────────
const WBar = ({ value, max, color, label, sub }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
    {label && <span style={{ fontSize: FS.base, fontWeight: FW.semi, fontFamily: COND, color: Z.tx, width: 200, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>}
    <div style={{ flex: 1, height: 8, background: Z.bg, borderRadius: R }}>
      <div style={{ height: "100%", borderRadius: R, width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%`, background: color || Z.ac, transition: "width 0.3s" }} />
    </div>
    <span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: color || Z.ac, width: 60, textAlign: "right", flexShrink: 0 }}>{(value || 0).toLocaleString()}</span>
    {sub && <span style={{ fontSize: FS.xs, color: Z.td, width: 40, textAlign: "right", flexShrink: 0 }}>{sub}</span>}
  </div>
);

const WebAnalyticsTab = ({ pubs }) => {
  const [webPub, setWebPub] = useState("all");
  const [range, setRange] = useState("30d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadWebData(); }, [webPub, range]);

  async function loadWebData() {
    setLoading(true);
    const now = new Date();
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
    const since = new Date(now - days * 86400000).toISOString();

    let q = supabase.from("page_views").select("path, session_id, referrer, screen_width, created_at").gte("created_at", since);
    if (webPub !== "all") q = q.eq("site_id", webPub);
    else {
      const siteIds = (pubs || []).filter(p => p.hasWebsite).map(p => p.id);
      if (siteIds.length) q = q.in("site_id", siteIds);
    }
    const { data: rows } = await q.order("created_at", { ascending: false }).limit(50000);
    if (!rows) { setData(null); setLoading(false); return; }

    // Total views
    const totalViews = rows.length;

    // Unique sessions
    const sessions = new Set(rows.map(r => r.session_id).filter(Boolean));
    const uniqueSessions = sessions.size;

    // Views per day (for chart)
    const dailyMap = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
      dailyMap[d] = 0;
    }
    rows.forEach(r => { const d = r.created_at?.slice(0, 10); if (d && dailyMap[d] !== undefined) dailyMap[d]++; });
    const dailyData = Object.entries(dailyMap).sort().map(([date, count]) => ({ date, count }));

    // Top pages
    const pageCounts = {};
    rows.forEach(r => { pageCounts[r.path] = (pageCounts[r.path] || 0) + 1; });
    const topPages = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([path, count]) => ({ path, count }));

    // Top referrers (exclude empty and self)
    const refCounts = {};
    rows.forEach(r => {
      if (!r.referrer) return;
      try { const h = new URL(r.referrer).hostname; if (h) refCounts[h] = (refCounts[h] || 0) + 1; } catch {}
    });
    const topReferrers = Object.entries(refCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([host, count]) => ({ host, count }));

    // Device breakdown
    let mobile = 0, tablet = 0, desktop = 0;
    rows.forEach(r => {
      const w = r.screen_width || 0;
      if (w < 768) mobile++;
      else if (w < 1024) tablet++;
      else desktop++;
    });

    setData({ totalViews, uniqueSessions, dailyData, topPages, topReferrers, mobile, tablet, desktop });
    setLoading(false);
  }

  const pubOptions = (pubs || []).filter(p => p.hasWebsite);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: Z.tm, fontFamily: COND }}>Loading web analytics...</div>;
  if (!data) return <div style={{ padding: 40, textAlign: "center", color: Z.tm, fontFamily: COND }}>No data available</div>;

  const maxDaily = Math.max(...data.dailyData.map(d => d.count), 1);
  const maxPage = data.topPages[0]?.count || 1;
  const maxRef = data.topReferrers[0]?.count || 1;
  const deviceTotal = data.mobile + data.tablet + data.desktop || 1;

  return <>
    {/* Filters */}
    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      <select value={webPub} onChange={e => setWebPub(e.target.value)} style={{ padding: "4px 10px", borderRadius: 3, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: FS.sm, fontFamily: COND }}>
        <option value="all">All Sites</option>
        {pubOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {["7d", "30d", "90d"].map(r => (
        <button key={r} onClick={() => setRange(r)} style={{
          padding: "4px 12px", borderRadius: 3, fontSize: FS.sm, fontWeight: range === r ? FW.heavy : FW.normal,
          border: "1px solid " + (range === r ? Z.ac : Z.bd), background: range === r ? Z.ac + "18" : "transparent",
          color: range === r ? Z.ac : Z.tm, cursor: "pointer", fontFamily: COND,
        }}>{r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : "90 Days"}</button>
      ))}
    </div>

    {/* Stats */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
      <GlassStat label="Page Views" value={data.totalViews.toLocaleString()} />
      <GlassStat label="Unique Sessions" value={data.uniqueSessions.toLocaleString()} />
      <GlassStat label="Pages / Session" value={data.uniqueSessions ? (data.totalViews / data.uniqueSessions).toFixed(1) : "0"} />
      <GlassStat label="Mobile" value={Math.round(data.mobile / deviceTotal * 100) + "%"} />
      <GlassStat label="Tablet" value={Math.round(data.tablet / deviceTotal * 100) + "%"} />
      <GlassStat label="Desktop" value={Math.round(data.desktop / deviceTotal * 100) + "%"} />
    </div>

    {/* Daily views chart */}
    <GlassCard>
      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Page Views Over Time</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 120 }}>
        {data.dailyData.map((d, i) => {
          const h = maxDaily > 0 ? Math.max(2, (d.count / maxDaily) * 100) : 2;
          const showLabel = data.dailyData.length <= 14 || i % Math.ceil(data.dailyData.length / 14) === 0;
          return <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            {d.count > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: Z.tx, fontFamily: COND, marginBottom: 2 }}>{d.count}</span>}
            <div style={{ width: "100%", height: h + "%", background: Z.ac, borderRadius: 2, minHeight: 2, transition: "height 0.3s" }} />
            {showLabel && <span style={{ fontSize: 8, color: Z.td, fontFamily: COND, marginTop: 3 }}>{d.date.slice(5)}</span>}
          </div>;
        })}
      </div>
    </GlassCard>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
      {/* Top Pages */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Top Pages</div>
        {data.topPages.length > 0 ? data.topPages.map(p => (
          <WBar key={p.path} label={p.path} value={p.count} max={maxPage} />
        )) : <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>No page views yet</div>}
      </GlassCard>

      {/* Top Referrers */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Top Referrers</div>
        {data.topReferrers.length > 0 ? data.topReferrers.map(r => (
          <WBar key={r.host} label={r.host} value={r.count} max={maxRef} />
        )) : <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>No external referrers yet</div>}
      </GlassCard>
    </div>
  </>;
};

export default memo(Analytics);
