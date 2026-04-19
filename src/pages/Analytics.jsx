import { lazy, Suspense, useState, useEffect, useMemo, memo } from "react";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { Z, COND, DISPLAY, FS, FW, Ri, CARD, R } from "../lib/theme";
import { Ic, Btn, Card, Sel, Stat, TB, FilterBar , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, DataTable, ListCard, ListDivider, ListGrid, FilterPillStrip } from "../components/ui";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";

const YearOverYearTab = lazy(() => import("./reports/YearOverYearTab"));
const RevenueVsGoalsTab = lazy(() => import("./reports/RevenueVsGoalsTab"));
const SalesByIssueTab = lazy(() => import("./reports/SalesByIssueTab"));

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
  bills, commissionPayouts, isActive,
}) => {
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({ breadcrumb: [{ label: "Home" }, { label: "Reports" }], title: "Reports" });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);
  const { teamMember } = useAuth();
  const isPublisher = teamMember?.role === "Publisher" || !!teamMember?.permissions?.includes?.("admin");
  const [tab, setTab] = useState("Overview");
  const [plPub, setPlPub] = useState("all");
  const [overviewType, setOverviewType] = useState("all"); // "all" | "Magazine" | "Newspaper"

  const reportTabs = useMemo(() => [
    "Overview",
    ...(isPublisher ? ["Year-over-Year", "Revenue vs. Goals"] : []),
    "P&L", "Sales", "Sales by Issue", "Editorial", "Subscribers", "Audience",
  ], [isPublisher]);

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
    const active = sales.filter(s => s.status !== "Closed");
    const pv = active.reduce((s, x) => s + (x.amount || 0), 0);
    return { monthRev: mr, yearRev: yr, totalRev: tr, avgDeal: ad, pipVal: pv, activeDeals: active };
  }, [closedSales, sales]);

  // Collected payments
  const monthCollected = useMemo(() => _pay.filter(p => p.receivedAt?.startsWith(thisMonth)).reduce((s, p) => s + (p.amount || 0), 0), [_pay]);
  const yearCollected = useMemo(() => _pay.filter(p => p.receivedAt?.startsWith(thisYear)).reduce((s, p) => s + (p.amount || 0), 0), [_pay]);

  // Outstanding / overdue
  const outstanding = useMemo(() => _inv.filter(i => ["sent", "partially_paid", "overdue"].includes(i.status)).reduce((s, i) => s + (i.balanceDue || 0), 0), [_inv]);
  const overdueAmt = useMemo(() => _inv.filter(i => i.status === "overdue" || (i.status === "sent" && i.dueDate && i.dueDate < today)).reduce((s, i) => s + (i.balanceDue || 0), 0), [_inv]);

  // DSO (Days Sales Outstanding) — average days from invoice issue to final payment,
  // using paid invoices only. Lower = faster collection. Also a 3-month rolling value
  // + a 12-month sparkline for the trend widget.
  const { dsoCurrent, dsoTrend, dsoPrior } = useMemo(() => {
    const paymentsByInv = {};
    _pay.forEach(p => {
      if (!p.receivedAt || !p.invoiceId) return;
      const prior = paymentsByInv[p.invoiceId];
      const d = p.receivedAt.slice(0, 10);
      if (!prior || d > prior) paymentsByInv[p.invoiceId] = d;
    });
    const compute = (fromDate, toDate) => {
      let daysSum = 0, amtSum = 0;
      _inv.forEach(i => {
        if (i.status !== "paid" || !i.issueDate || !i.total) return;
        const pDate = paymentsByInv[i.id];
        if (!pDate) return;
        if (fromDate && pDate < fromDate) return;
        if (toDate && pDate > toDate) return;
        const days = (new Date(pDate) - new Date(i.issueDate)) / 86400000;
        if (days < 0) return;
        daysSum += days * (i.total || 0);
        amtSum += i.total || 0;
      });
      return amtSum > 0 ? Math.round(daysSum / amtSum) : null;
    };
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().slice(0, 10);
    const current = compute(threeMonthsAgo, null);
    const prior = compute(sixMonthsAgo, threeMonthsAgo);
    // 12-month sparkline
    const trend = [];
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1).toISOString().slice(0, 10);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).toISOString().slice(0, 10);
      trend.push({ month: start.slice(0, 7), value: compute(start, end) });
    }
    return { dsoCurrent: current, dsoTrend: trend, dsoPrior: prior };
  }, [_inv, _pay]);

  // Subscription revenue: digital = MRR (monthly recurring), print = one-time per renewal
  const activeDigitalSubs = useMemo(() => _subs.filter(s => s.type === "digital" && s.status === "active"), [_subs]);
  const digitalMrr = useMemo(() => activeDigitalSubs.reduce((s, sub) => s + (sub.amountPaid || 0), 0), [activeDigitalSubs]);
  const printRenewalsThisMonth = useMemo(() => _subs.filter(s =>
    (s.type === "print" || !s.type) &&
    ((s.renewalDate && s.renewalDate.startsWith(thisMonth)) ||
     (!s.renewalDate && s.startDate && s.startDate.startsWith(thisMonth)))
  ).reduce((s, sub) => s + (sub.amountPaid || 0), 0), [_subs]);
  const subRevThisMonth = digitalMrr + printRenewalsThisMonth;

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

  // ─── DOSE: Financial Overview Calculations ────────────────
  const now = new Date();
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthPrefix = lastMonthDate.toISOString().slice(0, 7);

  // Monthly revenue goal = sum of issue revenue goals for issues landing in this month
  // (falls back to publication default if issue has no goal set)
  const monthGoal = useMemo(() => (issues || []).filter(i => i.date?.startsWith(thisMonth)).reduce((s, i) => {
    const pub = pubs.find(p => p.id === i.pubId);
    return s + (i.revenueGoal ?? pub?.defaultRevenueGoal ?? 0);
  }, 0), [issues, pubs]);

  // Total revenue this month across ALL streams (ad + sub + legal + creative)
  const mLegalRev = _legal.filter(l => l.createdAt?.startsWith(thisMonth)).reduce((s, x) => s + (x.totalAmount || 0), 0);
  const mJobsRev = _jobs.filter(j => j.createdAt?.startsWith(thisMonth)).reduce((s, x) => s + (x.finalAmount || x.quotedAmount || 0), 0);
  const totalMonthRev = monthRev + subRevThisMonth + mLegalRev + mJobsRev;

  // Last month same-shape comparison
  const lMonthAd = closedSales.filter(s => s.date?.startsWith(lastMonthPrefix)).reduce((s, x) => s + (x.amount || 0), 0);
  const lMonthPrintSub = _subs.filter(s =>
    (s.type === "print" || !s.type) &&
    ((s.renewalDate && s.renewalDate.startsWith(lastMonthPrefix)) ||
     (!s.renewalDate && s.startDate && s.startDate.startsWith(lastMonthPrefix)))
  ).reduce((s, sub) => s + (sub.amountPaid || 0), 0);
  const lMonthLegal = _legal.filter(l => l.createdAt?.startsWith(lastMonthPrefix)).reduce((s, x) => s + (x.totalAmount || 0), 0);
  const lMonthJobs = _jobs.filter(j => j.createdAt?.startsWith(lastMonthPrefix)).reduce((s, x) => s + (x.finalAmount || x.quotedAmount || 0), 0);
  const lMonthTotalRev = lMonthAd + digitalMrr + lMonthPrintSub + lMonthLegal + lMonthJobs;
  const monthRevDelta = totalMonthRev - lMonthTotalRev;

  const lMonthCollected = _pay.filter(p => p.receivedAt?.startsWith(lastMonthPrefix)).reduce((s, p) => s + (p.amount || 0), 0);
  const monthCollectedDelta = monthCollected - lMonthCollected;

  const monthBills = bills?.filter(b => b.billDate?.startsWith(thisMonth) || b.createdAt?.startsWith(thisMonth)).reduce((s, b) => s + (b.amount || 0), 0) || 0;
  const monthPayouts = commissionPayouts?.filter(p => p.period === thisMonth || p.createdAt?.startsWith(thisMonth)).reduce((s, p) => s + (p.totalAmount || 0), 0) || 0;
  const monthExpenses = monthBills + monthPayouts;
  const monthNet = monthCollected - monthExpenses;

  const lMonthBills = bills?.filter(b => b.billDate?.startsWith(lastMonthPrefix) || b.createdAt?.startsWith(lastMonthPrefix)).reduce((s, b) => s + (b.amount || 0), 0) || 0;
  const lMonthPayouts = commissionPayouts?.filter(p => p.period === lastMonthPrefix || p.createdAt?.startsWith(lastMonthPrefix)).reduce((s, p) => s + (p.totalAmount || 0), 0) || 0;
  const lMonthExpenses = lMonthBills + lMonthPayouts;
  const lMonthNet = lMonthCollected - lMonthExpenses;
  const netDelta = monthNet - lMonthNet;

  // Outstanding AR > 30 days
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const oldAR = outstanding > 0 ? _inv.filter(i => ["sent", "partially_paid", "overdue"].includes(i.status) && i.issueDate < thirtyDaysAgo).reduce((s, i) => s + (i.balanceDue || 0), 0) : 0;

  // 12-Month P&L Data — revenue broken down per publication for stacking
  const plMonths = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const pfx = m.toISOString().slice(0, 7);
    const lbl = m.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

    const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0).toISOString().slice(0, 10);
    const mStart = pfx + "-01";

    // Revenue contributions per publication
    const byPub = {}; // { pubId: amount }
    const addRev = (pubId, amt) => { if (!pubId || !amt) return; byPub[pubId] = (byPub[pubId] || 0) + amt; };

    // Ad sales (incl. classifieds + legals-as-sales) — already attached to a pub
    closedSales.filter(s => s.date?.startsWith(pfx)).forEach(s => addRev(s.publication, s.amount || 0));

    // Digital MRR per pub — subs active in this month
    _subs.filter(s => {
      if (s.type !== "digital") return false;
      const start = s.startDate || (s.createdAt ? s.createdAt.slice(0, 10) : null);
      if (!start || start > mEnd) return false;
      const end = s.status === "cancelled" || s.status === "expired" ? (s.expiryDate || s.renewalDate || "0000-00-00") : "9999-12-31";
      return end >= mStart;
    }).forEach(s => addRev(s.publicationId, s.amountPaid || 0));

    // Print sub renewals per pub (one-time)
    _subs.filter(s => {
      if (s.type === "digital") return false;
      if (s.renewalDate && s.renewalDate.startsWith(pfx)) return true;
      if (!s.renewalDate && s.startDate && s.startDate.startsWith(pfx)) return true;
      return false;
    }).forEach(s => addRev(s.publicationId, s.amountPaid || 0));

    // Legal notices per pub (from legal_notices table, if tracked separately from sales)
    _legal.filter(l => l.createdAt?.startsWith(pfx)).forEach(l => addRev(l.publicationId, l.totalAmount || 0));

    // Creative jobs per pub
    _jobs.filter(j => j.createdAt?.startsWith(pfx)).forEach(j => addRev(j.publicationId, j.finalAmount || j.quotedAmount || 0));

    const rev = Object.values(byPub).reduce((s, v) => s + v, 0);

    // Expenses for month (not broken down per pub — hard to allocate reliably)
    const mBil = bills?.filter(b => b.billDate?.startsWith(pfx) || b.createdAt?.startsWith(pfx)).reduce((s, b) => s + (b.amount || 0), 0) || 0;
    const mPay = commissionPayouts?.filter(p => p.period === pfx || p.createdAt?.startsWith(pfx)).reduce((s, x) => s + (x.totalAmount || 0), 0) || 0;
    const exp = mBil + mPay;

    plMonths.push({ pfx, lbl, byPub, rev, exp, net: rev - exp });
  }
  // Filtered view — isolate by publication type (Magazine / Newspaper / all)
  const typePubIds = overviewType === "all"
    ? null
    : new Set(pubs.filter(p => p.type === overviewType).map(p => p.id));
  const plView = plMonths.map(m => {
    if (!typePubIds) return { ...m, net: m.rev - m.exp };
    const rev = Object.entries(m.byPub).reduce((s, [id, amt]) => typePubIds.has(id) ? s + amt : s, 0);
    // Scale expenses proportionally to this type's share of total revenue
    const share = m.rev > 0 ? rev / m.rev : 0;
    const exp = m.exp * share;
    return { ...m, rev, exp, net: rev - exp };
  });
  const maxPlVal = Math.max(1, ...plView.map(m => Math.max(m.rev, m.exp)));

  // ─── Legals & Classifieds Stats ───────────────────────────
  // Legals come from the legal_notices table
  const legalsStats = useMemo(() => {
    const total = _legal.reduce((s, l) => s + (l.totalAmount || 0), 0);
    const thisM = _legal.filter(l => l.createdAt?.startsWith(thisMonth));
    const thisMTotal = thisM.reduce((s, l) => s + (l.totalAmount || 0), 0);
    const byType = {};
    _legal.forEach(l => {
      const t = l.noticeType || "other";
      byType[t] = (byType[t] || { count: 0, amount: 0 });
      byType[t].count++;
      byType[t].amount += (l.totalAmount || 0);
    });
    return { count: _legal.length, total, thisMCount: thisM.length, thisMTotal, byType };
  }, [_legal]);

  // Classifieds live in sales with ad_type = "Classified Line Listing"
  const classifiedsStats = useMemo(() => {
    const all = closedSales.filter(s => s.type === "Classified Line Listing");
    const total = all.reduce((s, x) => s + (x.amount || 0), 0);
    const thisM = all.filter(s => s.date?.startsWith(thisMonth));
    const thisMTotal = thisM.reduce((s, x) => s + (x.amount || 0), 0);
    const byPub = {};
    all.forEach(s => {
      byPub[s.publication] = (byPub[s.publication] || { count: 0, amount: 0 });
      byPub[s.publication].count++;
      byPub[s.publication].amount += (s.amount || 0);
    });
    return { count: all.length, total, thisMCount: thisM.length, thisMTotal, byPub };
  }, [closedSales]);

  // Cash Flow Next 30 Days Arrays
  const next30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const upcomingInvoices = _inv.filter(i => ["sent", "partially_paid", "overdue"].includes(i.status) && i.dueDate >= today && i.dueDate <= next30);
  const upcomingBills = bills?.filter(b => b.status === "pending" && b.dueDate >= today && b.dueDate <= next30) || [];
  
  // Group by date
  const cfDaysMap = {};
  for(let i=0; i<30; i++){
    const d = new Date(now.getTime() + i*86400000).toISOString().slice(0,10);
    cfDaysMap[d] = { in: 0, out: 0, day: parseInt(d.slice(8, 10), 10) };
  }
  upcomingInvoices.forEach(i => { if(cfDaysMap[i.dueDate]) cfDaysMap[i.dueDate].in += (i.balanceDue || 0); });
  upcomingBills.forEach(b => { if(b.dueDate && cfDaysMap[b.dueDate]) cfDaysMap[b.dueDate].out += (b.amount || 0); });
  const cfDays = Object.entries(cfDaysMap).sort((a,b) => a[0].localeCompare(b[0]));
  const maxCfVal = Math.max(1, ...cfDays.map(d => Math.max(d[1].in, d[1].out)));

  // Needs Attention
  const overdueInvs = _inv.filter(i => ["sent", "partially_paid", "overdue"].includes(i.status) && i.dueDate && i.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const pendingBills = bills?.filter(b => b.status === "pending" && b.dueDate && b.dueDate <= next30).sort((a, b) => a.dueDate.localeCompare(b.dueDate)) || [];

  // Selected pub for P&L detail
  const selPL = plPub === "all" ? null : pubPL.find(p => p.pub.id === plPub);

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {/* Title moved to TopBar via usePageHeader; no inline header needed. */}
    <TabRow><TB tabs={reportTabs} active={tab} onChange={setTab} /></TabRow>

    {/* ════════ YEAR-OVER-YEAR (Publisher/admin only) ════════ */}
    {tab === "Year-over-Year" && isPublisher && (
      <Suspense fallback={<GlassCard style={{ padding: 24 }}><div style={{ fontSize: FS.base, color: Z.tm, fontFamily: COND }}>Loading…</div></GlassCard>}>
        <YearOverYearTab pubs={pubs} />
      </Suspense>
    )}

    {/* ════════ REVENUE VS GOALS (Publisher/admin only) ════════ */}
    {tab === "Revenue vs. Goals" && isPublisher && (
      <Suspense fallback={<GlassCard style={{ padding: 24 }}><div style={{ fontSize: FS.base, color: Z.tm, fontFamily: COND }}>Loading…</div></GlassCard>}>
        <RevenueVsGoalsTab pubs={pubs} />
      </Suspense>
    )}

    {/* ════════ SALES BY ISSUE (all Reports users — salespeople auto-scoped by RLS) ════════ */}
    {tab === "Sales by Issue" && (
      <Suspense fallback={<GlassCard style={{ padding: 24 }}><div style={{ fontSize: FS.base, color: Z.tm, fontFamily: COND }}>Loading…</div></GlassCard>}>
        <SalesByIssueTab sales={sales} pubs={pubs} issues={issues} clients={clients} />
      </Suspense>
    )}

    {/* ════════ OVERVIEW ════════ */}
    {tab === "Overview" && <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Row 1: Hero Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
        <GlassCard style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Revenue MTD</div>
          <div style={{ fontSize: 32, fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx, letterSpacing: -1 }}>{fmtCurrency(totalMonthRev)}</div>
          <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: monthRevDelta >= 0 ? Z.su : Z.wa, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
            {monthRevDelta >= 0 ? "▲" : "▼"} {fmtCurrency(Math.abs(monthRevDelta))} vs last month
          </div>
          {monthGoal > 0 && (() => {
            const pct = Math.min(100, Math.round((totalMonthRev / monthGoal) * 100));
            const barColor = pct >= 100 ? Z.su : pct >= 75 ? Z.ac : pct >= 50 ? Z.wa : Z.da;
            return <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>
                <span>Goal: {fmtCurrency(monthGoal)}</span>
                <span style={{ color: barColor }}>{pct}%</span>
              </div>
              <div style={{ height: 6, background: Z.bg, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: barColor, transition: "width 0.3s" }} />
              </div>
            </div>;
          })()}
        </GlassCard>
        <GlassCard style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Cash Collected MTD</div>
          <div style={{ fontSize: 32, fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx, letterSpacing: -1 }}>{fmtCurrency(monthCollected)}</div>
          <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: monthCollectedDelta >= 0 ? Z.su : Z.wa, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
            {monthCollectedDelta >= 0 ? "▲" : "▼"} {fmtCurrency(Math.abs(monthCollectedDelta))} vs last month
          </div>
        </GlassCard>
        <GlassCard style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Outstanding AR</div>
          <div style={{ fontSize: 32, fontWeight: FW.black, fontFamily: DISPLAY, color: outstanding > 0 ? (Z.or || Z.wa) : Z.tx, letterSpacing: -1 }}>{fmtCurrency(outstanding)}</div>
          {oldAR > 0 ? (
             <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.da, marginTop: 4 }}>
               {fmtCurrency(oldAR)} over 30 days old
             </div>
          ) : (
             <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.su, marginTop: 4 }}>
               No old invoices
             </div>
          )}
        </GlassCard>
        <GlassCard style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Net This Month</div>
          <div style={{ fontSize: 32, fontWeight: FW.black, fontFamily: DISPLAY, color: monthNet >= 0 ? Z.su : Z.da, letterSpacing: -1 }}>{fmtCurrency(monthNet)}</div>
          <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: netDelta >= 0 ? Z.su : Z.wa, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
            {netDelta >= 0 ? "▲" : "▼"} {fmtCurrency(Math.abs(netDelta))} vs last month
          </div>
        </GlassCard>
        <GlassCard style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>DSO (90-day)</div>
          <div style={{ fontSize: 32, fontWeight: FW.black, fontFamily: DISPLAY, color: dsoCurrent == null ? Z.td : dsoCurrent <= 30 ? Z.su : dsoCurrent <= 60 ? Z.wa : Z.da, letterSpacing: -1 }}>
            {dsoCurrent != null ? `${dsoCurrent}d` : "—"}
          </div>
          {dsoPrior != null && dsoCurrent != null && <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: dsoCurrent <= dsoPrior ? Z.su : Z.wa, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
            {dsoCurrent <= dsoPrior ? "▼" : "▲"} {Math.abs(dsoCurrent - dsoPrior)}d vs prior 90d
          </div>}
          {/* Sparkline */}
          {dsoTrend.some(t => t.value != null) && <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 24, marginTop: 8 }}>
            {dsoTrend.map((t, i) => {
              const max = Math.max(...dsoTrend.map(x => x.value || 0), 1);
              const h = t.value ? Math.max(2, (t.value / max) * 22) : 0;
              return <div key={i} style={{ flex: 1, height: h, background: t.value ? Z.ac : Z.bd, borderRadius: 1, opacity: t.value ? 0.7 : 0.3 }} />;
            })}
          </div>}
        </GlassCard>
      </div>

      {/* Row 2: 12-Month P&L + Revenue Mix side-by-side */}
      <div style={{ display: "grid", gridTemplateColumns: "65% 35%", gap: 14 }}>
        <GlassCard>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1 }}>12-Month Profit & Loss</div>
            <div style={{ display: "flex", gap: 4 }}>
              <FilterPillStrip
                value={overviewType}
                onChange={setOverviewType}
                options={[
                  { value: "all", label: "All" },
                  { value: "Magazine", label: "Magazines" },
                  { value: "Newspaper", label: "Newspapers" },
                ]}
              />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", height: 220, position: "relative", paddingTop: 22 }}>
            {/* 0 Axis line */}
            <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: Z.bd, zIndex: 1 }} />

            {plView.map((m, i) => {
              const hRev = m.rev === 0 ? 0 : Math.max(2, (m.rev / maxPlVal) * 80);
              const hExp = m.exp === 0 ? 0 : Math.max(2, (m.exp / maxPlVal) * 80);
              const isCurrent = i === 11;

              return (
                <div key={m.pfx} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", zIndex: 2, height: "100%" }}>
                  {/* Value label above bar */}
                  {m.rev > 0 && <div style={{ position: "absolute", top: 0, fontSize: 9, fontWeight: FW.heavy, color: isCurrent ? Z.tx : Z.tm, fontFamily: COND, whiteSpace: "nowrap" }}>{fmtK(m.rev)}</div>}
                  {/* Revenue Bar */}
                  <div style={{ height: "50%", display: "flex", flexDirection: "column", justifyContent: "flex-end", width: "100%", alignItems: "center" }}>
                    <div style={{ width: "55%", height: `${hRev}%`, background: Z.tx, borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: m.rev > 0 ? 2 : 0 }} title={`Rev ${m.lbl}: ${fmtCurrency(m.rev)}`} />
                  </div>
                  {/* Expense Bar */}
                  <div style={{ height: "50%", display: "flex", flexDirection: "column", justifyContent: "flex-start", width: "100%", alignItems: "center" }}>
                    <div style={{ background: Z.da, width: "55%", height: `${hExp}%`, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, minHeight: m.exp > 0 ? 2 : 0 }} title={`Exp ${m.lbl}: ${fmtCurrency(m.exp)}`} />
                  </div>
                  {/* Expense label */}
                  {m.exp > 0 && <div style={{ position: "absolute", bottom: 16, fontSize: 9, fontWeight: FW.bold, color: Z.da, fontFamily: COND, whiteSpace: "nowrap" }}>{fmtK(m.exp)}</div>}
                  {/* Month label */}
                  <div style={{ position: "absolute", bottom: -2, fontSize: 10, color: isCurrent ? Z.tx : Z.td, fontWeight: isCurrent ? FW.bold : FW.normal, fontFamily: COND }}>{m.lbl}</div>
                </div>
              );
            })}
            {/* Net income line — SVG viewBox uses 0-100 numeric coords (was throwing
                "<polyline> Expected number" because percentages/calc() aren't valid
                in points/cx/cy attributes). preserveAspectRatio="none" stretches
                the chart to fill the container. */}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", top: 22, left: 0, width: "100%", height: "calc(100% - 22px)", pointerEvents: "none", zIndex: 3 }}>
              <polyline
                points={plView.map((m, i) => {
                  const x = (i + 0.5) * (100 / 12);
                  const netPlotted = Math.max(-maxPlVal, Math.min(maxPlVal, m.net));
                  const y = 50 - (netPlotted / maxPlVal) * 40;
                  return `${x},${y}`;
                }).join(" ")}
                fill="none"
                stroke={Z.ac}
                strokeWidth="0.5"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
              {plView.map((m, i) => {
                const x = (i + 0.5) * (100 / 12);
                const netPlotted = Math.max(-maxPlVal, Math.min(maxPlVal, m.net));
                const y = 50 - (netPlotted / maxPlVal) * 40;
                return <circle key={i} cx={x} cy={y} r="0.8" fill={Z.ac} vectorEffect="non-scaling-stroke" />;
              })}
            </svg>
          </div>
          <div style={{ paddingBottom: 8, marginTop: 24, display: "flex", justifyContent: "center", gap: 14, fontSize: FS.xs, fontWeight: FW.bold, color: Z.td }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, background: Z.tx, borderRadius: 2 }}/> Revenue</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, background: Z.da, borderRadius: 2 }}/> Expenses</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 12, height: 2, background: Z.ac }}/> Net Income</span>
          </div>
        </GlassCard>

        <GlassCard>
          <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Revenue Mix</div>
          <div style={{ fontSize: FS.xs, color: Z.td, marginBottom: 12 }}>This Month · <span style={{ color: Z.tx, fontWeight: FW.heavy }}>{fmtCurrency(totalMonthRev)}</span></div>
          <div style={{ display: "flex", height: 22, borderRadius: Math.max((CARD?.borderRadius || 6) / 2, 4), overflow: "hidden", marginBottom: 14 }}>
            {(() => {
              const tot = Math.max(1, monthRev + digitalMrr + printRenewalsThisMonth + mLegalRev + mJobsRev);
              const fgOnDark = Z.bg === "#08090D" ? Z.bg : "#FFF";
              const segs = [
                { key: "ad", val: monthRev, color: Z.tx, fg: fgOnDark },
                { key: "mrr", val: digitalMrr, color: Z.tx + "bb", fg: fgOnDark },
                { key: "print", val: printRenewalsThisMonth, color: Z.tx + "77", fg: fgOnDark },
                { key: "legal", val: mLegalRev, color: Z.wa, fg: "#000" },
                { key: "job", val: mJobsRev, color: Z.tx + "44", fg: Z.tx },
              ];
              return segs.filter(s => s.val > 0).map(s => {
                const pct = (s.val / tot) * 100;
                return <div key={s.key} style={{ width: `${pct}%`, background: s.color, display: "flex", alignItems: "center", justifyContent: "center", color: s.fg, fontSize: 9, fontWeight: FW.heavy, overflow: "hidden" }}>{pct >= 8 ? `${Math.round(pct)}%` : ""}</div>;
              });
            })()}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: FS.xs, color: Z.tx }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 9, height: 9, background: Z.tx, borderRadius: 2 }}/> Ad Sales</span>
              <span style={{ fontWeight: FW.heavy }}>{fmtCurrency(monthRev)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 9, height: 9, background: Z.tx + "bb", borderRadius: 2 }}/> Digital MRR <span style={{ color: Z.td }}>({activeDigitalSubs.length})</span></span>
              <span style={{ fontWeight: FW.heavy }}>{fmtCurrency(digitalMrr)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 9, height: 9, background: Z.tx + "77", borderRadius: 2 }}/> Print Renewals</span>
              <span style={{ fontWeight: FW.heavy }}>{fmtCurrency(printRenewalsThisMonth)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 9, height: 9, background: Z.wa, borderRadius: 2 }}/> Legal</span>
              <span style={{ fontWeight: FW.heavy }}>{fmtCurrency(mLegalRev)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 9, height: 9, background: Z.tx + "44", borderRadius: 2, border: `1px solid ${Z.bd}` }}/> Creative</span>
              <span style={{ fontWeight: FW.heavy }}>{fmtCurrency(mJobsRev)}</span>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Row 3: Legals & Classifieds stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <GlassCard>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1 }}>Legal Notices</div>
            <div style={{ fontSize: FS.xs, color: Z.td }}>
              <span style={{ color: Z.tx, fontWeight: FW.heavy }}>{legalsStats.thisMCount}</span> this month · <span style={{ color: Z.tx, fontWeight: FW.heavy }}>{fmtCurrency(legalsStats.thisMTotal)}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 26, fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx, letterSpacing: -0.5 }}>{fmtCurrency(legalsStats.total)}</div>
            <div style={{ fontSize: FS.xs, color: Z.td }}>{legalsStats.count.toLocaleString()} notices all-time</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: FS.xs }}>
            {Object.entries(legalsStats.byType).sort((a, b) => b[1].amount - a[1].amount).slice(0, 5).map(([type, d]) => {
              const pct = legalsStats.total > 0 ? (d.amount / legalsStats.total) * 100 : 0;
              return <div key={type} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 110, color: Z.tm, fontWeight: FW.semi, textTransform: "capitalize", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{type.replace(/_/g, " ")}</div>
                <div style={{ flex: 1, height: 6, background: Z.bg, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: Z.wa }}/>
                </div>
                <div style={{ width: 70, textAlign: "right", color: Z.tx, fontWeight: FW.heavy }}>{fmtCurrency(d.amount)}</div>
                <div style={{ width: 30, textAlign: "right", color: Z.td, fontWeight: FW.bold }}>{d.count}</div>
              </div>;
            })}
            {legalsStats.count === 0 && <div style={{ color: Z.td, padding: 8, textAlign: "center" }}>No legal notices tracked</div>}
          </div>
        </GlassCard>

        <GlassCard>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1 }}>Classifieds</div>
            <div style={{ fontSize: FS.xs, color: Z.td }}>
              <span style={{ color: Z.tx, fontWeight: FW.heavy }}>{classifiedsStats.thisMCount}</span> this month · <span style={{ color: Z.tx, fontWeight: FW.heavy }}>{fmtCurrency(classifiedsStats.thisMTotal)}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 26, fontWeight: FW.black, fontFamily: DISPLAY, color: Z.tx, letterSpacing: -0.5 }}>{fmtCurrency(classifiedsStats.total)}</div>
            <div style={{ fontSize: FS.xs, color: Z.td }}>{classifiedsStats.count.toLocaleString()} listings all-time</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: FS.xs }}>
            {Object.entries(classifiedsStats.byPub).sort((a, b) => b[1].amount - a[1].amount).slice(0, 5).map(([pubId, d]) => {
              const pub = pubs.find(p => p.id === pubId);
              const pct = classifiedsStats.total > 0 ? (d.amount / classifiedsStats.total) * 100 : 0;
              return <div key={pubId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 110, color: Z.tm, fontWeight: FW.semi, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pub?.name || pubId}</div>
                <div style={{ flex: 1, height: 6, background: Z.bg, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: pub?.color || Z.tx }}/>
                </div>
                <div style={{ width: 70, textAlign: "right", color: Z.tx, fontWeight: FW.heavy }}>{fmtCurrency(d.amount)}</div>
                <div style={{ width: 30, textAlign: "right", color: Z.td, fontWeight: FW.bold }}>{d.count}</div>
              </div>;
            })}
            {classifiedsStats.count === 0 && <div style={{ color: Z.td, padding: 8, textAlign: "center" }}>No classifieds tracked</div>}
          </div>
        </GlassCard>
      </div>

      {/* Row 4: Cash Flow Strip */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>30-Day Cash Flow Projection</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, overflowX: "auto", paddingBottom: 10 }}>
          {cfDays.map(([date, vals]) => {
            const hIn = vals.in === 0 ? 0 : Math.max(4, (vals.in / maxCfVal) * 100);
            const hOut = vals.out === 0 ? 0 : Math.max(4, (vals.out / maxCfVal) * 100);
            const isToday = date === today;
            
            return (
              <div key={date} style={{ flexShrink: 0, width: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 9, color: vals.in > 0 ? Z.su : "transparent", fontWeight: 800 }}>{vals.in > 0 ? "$" : "."}</div>
                <div style={{ height: 40, width: 8, background: Z.tg || "rgba(255,255,255,0.05)", borderRadius: 4, display: "flex", flexDirection: "column", justifyContent: "flex-end", overflow: "hidden" }}>
                  {vals.in > 0 && <div style={{ width: "100%", height: `${hIn}%`, background: Z.su }} title={`In: ${fmtCurrency(vals.in)}`} />}
                </div>
                <div style={{ fontSize: 10, fontWeight: isToday ? 900 : 600, color: isToday ? Z.tx : Z.td, fontFamily: COND, padding: "2px 0", borderBottom: isToday ? `2px solid ${Z.ac}` : "2px solid transparent" }}>{vals.day}</div>
                <div style={{ height: 40, width: 8, background: Z.tg || "rgba(255,255,255,0.05)", borderRadius: 4, display: "flex", flexDirection: "column", justifyContent: "flex-start", overflow: "hidden" }}>
                   {vals.out > 0 && <div style={{ width: "100%", height: `${hOut}%`, background: Z.da }} title={`Out: ${fmtCurrency(vals.out)}`} />}
                </div>
                <div style={{ fontSize: 9, color: vals.out > 0 ? Z.da : "transparent", fontWeight: 800 }}>{vals.out > 0 ? "$" : "."}</div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Row 5: Needs Attention */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <GlassCard>
          <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Overdue Invoices</span>
            {overdueInvs.length > 0 ? <span style={{ color: Z.da }}>{overdueInvs.length} Action{overdueInvs.length !== 1 && "s"}</span> : <span style={{ color: Z.su }}>All clear ✓</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {overdueInvs.slice(0, 5).map(i => (
              <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: Z.da + "15", borderRadius: 4, borderLeft: `3px solid ${Z.da}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: FW.bold, color: Z.tx }}>Invoice #{i.invoiceNumber}</div>
                  <div style={{ fontSize: 11, color: Z.da }}>Due: {i.dueDate}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: FW.heavy, color: Z.tx }}>{fmtCurrency(i.balanceDue)}</div>
              </div>
            ))}
            {overdueInvs.length > 5 && <div style={{ fontSize: 11, color: Z.td, textAlign: "center", padding: 4 }}>+ {overdueInvs.length - 5} more</div>}
            {overdueInvs.length === 0 && <div style={{ padding: 12, textAlign: "center", color: Z.su, fontSize: FS.sm, fontWeight: FW.bold }}>No overdue invoices!</div>}
          </div>
        </GlassCard>
        
        <GlassCard>
          <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Upcoming Bills (Next 30 Days)</span>
            {pendingBills.length > 0 ? <span style={{ color: (Z.or || Z.wa) }}>{pendingBills.length} Action{pendingBills.length !== 1 && "s"}</span> : <span style={{ color: Z.su }}>All clear ✓</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pendingBills.slice(0, 5).map(b => (
              <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: Z.sf || Z.bg, borderRadius: 4, borderLeft: `3px solid ${Z.wa}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: FW.bold, color: Z.tx }}>{b.vendorName}</div>
                  <div style={{ fontSize: 11, color: Z.td }}>Due: {b.dueDate}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: FW.heavy, color: Z.tx }}>{fmtCurrency(b.amount)}</div>
              </div>
            ))}
            {pendingBills.length > 5 && <div style={{ fontSize: 11, color: Z.td, textAlign: "center", padding: 4 }}>+ {pendingBills.length - 5} more</div>}
            {pendingBills.length === 0 && <div style={{ padding: 12, textAlign: "center", color: Z.su, fontSize: FS.sm, fontWeight: FW.bold }}>Not tracking any pending bills for the next 30 days!</div>}
          </div>
        </GlassCard>
      </div>
    </div>}

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
    {tab === "Audience" && <WebAnalyticsTab pubs={pubs} />}
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
      <Sel value={webPub} onChange={e => setWebPub(e.target.value)} options={[{ value: "all", label: "All Sites" }, ...pubOptions.map(p => ({ value: p.id, label: p.name }))]} />
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
