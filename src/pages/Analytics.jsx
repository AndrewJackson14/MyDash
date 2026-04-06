import { useState } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, CARD, R } from "../lib/theme";
import { Ic, Btn, Card, Stat, TB, FilterBar , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, DataTable, ListCard, ListDivider, ListGrid } from "../components/ui";

const fmtCurrency = (n) => "$" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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

  const closedSales = sales.filter(s => s.status === "Closed");

  // ─── Revenue Metrics ────────────────────────────────────
  const monthRev = closedSales.filter(s => s.date?.startsWith(thisMonth)).reduce((s, x) => s + (x.amount || 0), 0);
  const yearRev = closedSales.filter(s => s.date?.startsWith(thisYear)).reduce((s, x) => s + (x.amount || 0), 0);
  const totalRev = closedSales.reduce((s, x) => s + (x.amount || 0), 0);
  const avgDeal = closedSales.length > 0 ? Math.round(totalRev / closedSales.length) : 0;
  const activeDeals = sales.filter(s => !["Closed", "Follow-up"].includes(s.status));
  const pipVal = activeDeals.reduce((s, x) => s + (x.amount || 0), 0);

  // Collected payments
  const monthCollected = _pay.filter(p => p.receivedAt?.startsWith(thisMonth)).reduce((s, p) => s + (p.amount || 0), 0);
  const yearCollected = _pay.filter(p => p.receivedAt?.startsWith(thisYear)).reduce((s, p) => s + (p.amount || 0), 0);

  // Outstanding / overdue
  const outstanding = _inv.filter(i => ["sent", "partially_paid", "overdue"].includes(i.status)).reduce((s, i) => s + (i.balanceDue || 0), 0);
  const overdueAmt = _inv.filter(i => i.status === "overdue" || (i.status === "sent" && i.dueDate && i.dueDate < today)).reduce((s, i) => s + (i.balanceDue || 0), 0);

  // Revenue by stream
  const legalRev = _legal.reduce((s, n) => s + (n.totalAmount || 0), 0);
  const jobsRev = _jobs.reduce((s, j) => s + (j.finalAmount || j.quotedAmount || 0), 0);
  const subRev = _subs.filter(s => s.status === "active").reduce((s, sub) => s + (sub.amountPaid || 0), 0);
  const adRev = totalRev; // closed sales = ad revenue

  // ─── Per-Publication P&L ────────────────────────────────
  const pubPL = pubs.map(pub => {
    // Revenue
    const pubAdRev = closedSales.filter(s => s.publication === pub.id).reduce((s, x) => s + (x.amount || 0), 0);
    const pubLegalRev = _legal.filter(n => n.publicationId === pub.id).reduce((s, n) => s + (n.totalAmount || 0), 0);
    const pubSubRev = _subs.filter(s => s.publicationId === pub.id && s.status === "active").reduce((s, sub) => s + (sub.amountPaid || 0), 0);
    const pubTotalRev = pubAdRev + pubLegalRev + pubSubRev;

    // Costs (estimated from available data)
    const pubFreelanceCost = _fpay.filter(p => {
      // Link via story → publication
      const story = stories.find(s => s.id === p.storyId);
      return story?.publication === pub.id;
    }).reduce((s, p) => s + (p.amount || 0), 0);

    // Approximate print cost: issues this year × estimated cost
    const pubIssuesThisYear = issues.filter(i => i.pubId === pub.id && i.date?.startsWith(thisYear) && i.date <= today).length;
    const estPrintCostPerIssue = pub.type === "Magazine" ? 2500 : 800;
    const pubPrintCost = pubIssuesThisYear * estPrintCostPerIssue;

    // Driver costs (from drop locations serving this pub)
    const pubDropLocs = (dropLocationPubs || []).filter(dp => dp.publicationId === pub.id);
    // Rough estimate: distribute total driver cost across pubs by drop location count
    const totalDriverCost = _drivers.reduce((s, d) => s + (d.flatFee || 0), 0) * 4; // monthly estimate
    const totalDropCount = (dropLocationPubs || []).length || 1;
    const pubDriverCost = pubDropLocs.length > 0 ? Math.round((pubDropLocs.length / totalDropCount) * totalDriverCost) : 0;

    const pubTotalCost = pubFreelanceCost + pubPrintCost + pubDriverCost;
    const pubProfit = pubTotalRev - pubTotalCost;
    const pubMargin = pubTotalRev > 0 ? Math.round((pubProfit / pubTotalRev) * 100) : 0;

    return {
      pub, adRev: pubAdRev, legalRev: pubLegalRev, subRev: pubSubRev, totalRev: pubTotalRev,
      freelanceCost: pubFreelanceCost, printCost: pubPrintCost, driverCost: pubDriverCost,
      totalCost: pubTotalCost, profit: pubProfit, margin: pubMargin,
    };
  }).sort((a, b) => b.totalRev - a.totalRev);

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
    <PageHeader title="My Analytics" />

    <TabRow><TB tabs={["Overview", "P&L", "Sales", "Editorial"]} active={tab} onChange={setTab} /></TabRow>

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
          {revByPub.map(r => <HBar key={r.pub.id} label={r.pub.name} value={r.rev} max={mxP} color={r.pub.color} sub={`${r.deals}`} />)}
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
        {pubs.map(p => <button key={p.id} onClick={() => setPlPub(p.id)} style={{ borderRadius: Ri, border: `1px solid ${plPub === p.id ? p.color : Z.bd}`, background: plPub === p.id ? p.color + "18" : "transparent", cursor: "pointer", fontSize: FS.sm, fontWeight: FW.bold, color: plPub === p.id ? p.color : Z.tm }}>{p.name}</button>)}
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
                    <div style={{ width: 8, height: 8, borderRadius: R, background: p.pub.color }} />
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
            <div style={{ width: 14, height: 14, borderRadius: R, background: selPL.pub.color }} />
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
          {revByPub.map(r => <HBar key={r.pub.id} label={r.pub.name} value={r.rev} max={mxP} color={r.pub.color} sub={`${r.deals}`} />)}
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
          return <HBar key={p.id} label={p.name} value={pStories.length} max={Math.max(...pubs.map(pp => stories.filter(s => s.publication === pp.id).length), 1)} color={p.color} sub="" />;
        })}
      </GlassCard>
    </>}
  </div>;
};

export default Analytics;
