// ClientSignals.jsx — Signal-driven client dashboard with MyPriorities
import { useState, useMemo } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R, CARD } from "../../lib/theme";
import { Btn, SB, glass } from "../../components/ui";

const fmtK = n => n >= 10000 ? "$" + Math.round(n / 1000) + "K" : "$" + (n || 0).toLocaleString();

const SIGNAL_TYPES = [
  { key: "all", label: "All signals" },
  { key: "churn", label: "Churn" },
  { key: "trending_down", label: "At risk" },
  { key: "whale", label: "Whales" },
  { key: "seasonal", label: "Seasonal" },
  { key: "crosssell", label: "Cross-sell" },
  { key: "upsell", label: "Upsell" },
  { key: "stale_lead", label: "Stale leads" },
  { key: "inventory", label: "Inventory" },
  { key: "competitor", label: "Competitor" },
];

const SIGNAL_COLORS = {
  churn: "#71717a", trending_down: "#52525b", whale: "#3f3f46",
  seasonal: "#a1a1aa", crosssell: "#78716c", upsell: "#57534e",
  competitor: "#64748b", stale_lead: "#a8a29e", inventory: "#6b7280",
};

export default function ClientSignals({
  clients, sales, pubs, issues, currentUser, jurisdiction,
  myPriorities, priorityHelpers, onSelectClient,
}) {
  const [signalFilter, setSignalFilter] = useState("all");
  const [expandedPanels, setExpandedPanels] = useState(new Set());
  const togglePanel = (key) => setExpandedPanels(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const today = new Date().toISOString().slice(0, 10);
  const cn = id => clients?.find(c => c.id === id)?.name || "—";
  const pn = id => pubs?.find(p => p.id === id)?.name || "";

  // IDs already in MyPriorities for this user
  const priorityClientIds = useMemo(() => {
    return new Set((myPriorities || []).filter(p => p.teamMemberId === currentUser?.id).map(p => p.clientId));
  }, [myPriorities, currentUser]);

  const myPriorityItems = useMemo(() => {
    return (myPriorities || [])
      .filter(p => p.teamMemberId === currentUser?.id)
      .sort((a, b) => {
        // Highlighted first, then by sort order
        if (a.highlighted && !b.highlighted) return -1;
        if (!a.highlighted && b.highlighted) return 1;
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      });
  }, [myPriorities, currentUser]);

  // All clients for this salesperson (signals scan the full book of business)
  const myClients = useMemo(() => {
    return jurisdiction?.isSalesperson ? (jurisdiction.myClients || []) : (clients || []);
  }, [clients, jurisdiction]);

  // Lapsed + Lead subset (for churn-specific signals)
  const myLapsed = useMemo(() => {
    return myClients.filter(c => c.status === "Lapsed" || c.status === "Lead");
  }, [myClients]);

  // Pre-compute per-client sales data
  const clientSalesMap = useMemo(() => {
    const _sales = sales || [];
    const map = {};
    _sales.forEach(s => {
      if (!map[s.clientId]) map[s.clientId] = { closed: [], all: [], pubSet: new Set(), adSizes: new Set(), lastDate: "", totalSpend: 0, monthlyDates: [] };
      map[s.clientId].all.push(s);
      if (s.status === "Closed") {
        map[s.clientId].closed.push(s);
        map[s.clientId].totalSpend += s.amount || 0;
        if (s.publication) map[s.clientId].pubSet.add(s.publication);
        if (s.type) map[s.clientId].adSizes.add(s.type);
        if (s.date > map[s.clientId].lastDate) map[s.clientId].lastDate = s.date;
        if (s.date) map[s.clientId].monthlyDates.push(s.date);
      }
    });
    return map;
  }, [sales]);

  // ═══ SIGNAL COMPUTATIONS ═══

  // 1. Missed buying cycle — clients who bought regularly but missed recent cycles
  const churnSignals = useMemo(() => {
    return myLapsed.filter(c => {
      if (priorityClientIds.has(c.id)) return false;
      const d = clientSalesMap[c.id];
      if (!d || d.closed.length < 4) return false; // need at least 4 purchases to detect cycle
      const months = d.monthlyDates.map(dt => dt.slice(0, 7)).sort();
      const uniqueMonths = [...new Set(months)];
      if (uniqueMonths.length < 3) return false;
      // Detect if they were buying at least quarterly
      const lastPurchaseMonth = uniqueMonths[uniqueMonths.length - 1];
      const monthsAgo = Math.round((new Date() - new Date(lastPurchaseMonth + "-15")) / (30.44 * 86400000));
      return monthsAgo >= 2 && monthsAgo <= 12 && d.totalSpend >= 2000;
    }).sort((a, b) => (clientSalesMap[b.id]?.totalSpend || 0) - (clientSalesMap[a.id]?.totalSpend || 0))
    .slice(0, 20)
    .map(c => {
      const d = clientSalesMap[c.id];
      const months = [...new Set(d.monthlyDates.map(dt => dt.slice(0, 7)))].sort();
      const lastMonth = months[months.length - 1];
      const monthsAgo = Math.round((new Date() - new Date(lastMonth + "-15")) / (30.44 * 86400000));
      return { clientId: c.id, name: c.name, spend: d.totalSpend, detail: `Bought regularly, missed ${monthsAgo} cycles · ${fmtK(d.totalSpend)} lifetime`, signal: "churn" };
    });
  }, [myLapsed, clientSalesMap, priorityClientIds]);

  // 2. Spend trending down YoY (all clients, not just lapsed)
  const trendingDownSignals = useMemo(() => {
    const thisYear = today.slice(0, 4);
    const lastYear = String(parseInt(thisYear) - 1);
    return myClients.filter(c => {
      if (priorityClientIds.has(c.id)) return false;
      const d = clientSalesMap[c.id];
      if (!d) return false;
      const tyRev = d.closed.filter(s => s.date?.startsWith(thisYear)).reduce((s, x) => s + (x.amount || 0), 0);
      const lyRev = d.closed.filter(s => s.date?.startsWith(lastYear)).reduce((s, x) => s + (x.amount || 0), 0);
      return lyRev > 2000 && tyRev < lyRev * 0.6;
    }).sort((a, b) => (clientSalesMap[b.id]?.totalSpend || 0) - (clientSalesMap[a.id]?.totalSpend || 0))
    .slice(0, 20)
    .map(c => {
      const d = clientSalesMap[c.id];
      const tyRev = d.closed.filter(s => s.date?.startsWith(today.slice(0, 4))).reduce((s, x) => s + (x.amount || 0), 0);
      const lyRev = d.closed.filter(s => s.date?.startsWith(String(parseInt(today.slice(0, 4)) - 1))).reduce((s, x) => s + (x.amount || 0), 0);
      const pctDown = lyRev > 0 ? Math.round(((lyRev - tyRev) / lyRev) * 100) : 0;
      return { clientId: c.id, name: c.name, spend: d.totalSpend, detail: `${fmtK(d.totalSpend)} lifetime, down ${pctDown}% YoY · was ${d.pubSet.size} pubs`, signal: "trending_down" };
    });
  }, [myClients, clientSalesMap, priorityClientIds, today]);

  // 3. Lapsed whales ($10K+ lifetime)
  const whaleSignals = useMemo(() => {
    return myLapsed.filter(c => {
      if (priorityClientIds.has(c.id)) return false;
      return (c.totalSpend || 0) >= 10000 && c.status === "Lapsed";
    }).sort((a, b) => (b.totalSpend || 0) - (a.totalSpend || 0))
    .slice(0, 20)
    .map(c => {
      const d = clientSalesMap[c.id];
      const monthsLapsed = d?.lastDate ? Math.round((new Date() - new Date(d.lastDate + "T12:00:00")) / (30.44 * 86400000)) : 99;
      const hasEmail = (c.contacts || []).some(ct => ct.email);
      return { clientId: c.id, name: c.name, spend: c.totalSpend, detail: `${fmtK(c.totalSpend)} · ${monthsLapsed}mo dark · ${d?.pubSet?.size || 0} pubs${hasEmail ? " · has email" : ""}`, signal: "whale" };
    });
  }, [myLapsed, clientSalesMap, priorityClientIds]);

  // 4. Seasonal — bought same issue last year, not yet this year
  const seasonalSignals = useMemo(() => {
    const results = [];
    const upcomingIssues = (issues || []).filter(i => {
      const daysOut = Math.ceil((new Date(i.date + "T12:00:00") - new Date()) / 86400000);
      return daysOut > 0 && daysOut <= 45 && i.adDeadline;
    });
    upcomingIssues.forEach(issue => {
      const lastYearMonth = new Date(new Date(issue.date).setFullYear(new Date(issue.date).getFullYear() - 1)).toISOString().slice(0, 7);
      // Find clients who bought in this pub around this time last year
      const _sales = sales || [];
      const lastYearBuyers = _sales.filter(s =>
        s.status === "Closed" && s.publication === issue.pubId && s.date?.startsWith(lastYearMonth)
      ).map(s => s.clientId);
      const uniqueBuyers = [...new Set(lastYearBuyers)];
      // Find those who haven't booked this year's issue
      const thisYearBooked = new Set(_sales.filter(s => s.issueId === issue.id && s.status === "Closed").map(s => s.clientId));
      uniqueBuyers.forEach(cId => {
        if (thisYearBooked.has(cId) || priorityClientIds.has(cId)) return;
        const c = clients?.find(x => x.id === cId);
        if (!c) return;
        const pubName = pn(issue.pubId);
        const daysOut = Math.ceil((new Date(issue.adDeadline + "T12:00:00") - new Date()) / 86400000);
        results.push({ clientId: cId, name: c.name, spend: c.totalSpend || 0, detail: `Bought ${pubName} ${lastYearMonth.slice(0, 4)} · not booked '${today.slice(2, 4)} · ${daysOut}d to deadline`, signal: "seasonal" });
      });
    });
    return results.sort((a, b) => b.spend - a.spend).slice(0, 20);
  }, [issues, sales, clients, priorityClientIds, today]);

  // 5. Cross-sell — clients buying in only 1-2 pubs
  const crossSellSignals = useMemo(() => {
    return myClients.filter(c => {
      if (priorityClientIds.has(c.id)) return false;
      const d = clientSalesMap[c.id];
      return d && d.pubSet.size <= 2 && d.totalSpend >= 2000;
    }).sort((a, b) => (clientSalesMap[b.id]?.totalSpend || 0) - (clientSalesMap[a.id]?.totalSpend || 0))
    .slice(0, 20)
    .map(c => {
      const d = clientSalesMap[c.id];
      const currentPubs = [...d.pubSet].map(pn).join(", ");
      const otherPubs = (pubs || []).filter(p => !d.pubSet.has(p.id)).slice(0, 2).map(p => p.name).join(", ");
      return { clientId: c.id, name: c.name, spend: d.totalSpend, detail: `${fmtK(d.totalSpend)} but only ${currentPubs} · try ${otherPubs}?`, signal: "crosssell" };
    });
  }, [myClients, clientSalesMap, pubs, priorityClientIds]);

  // 6. Upsell — same ad size for 6+ months
  const upsellSignals = useMemo(() => {
    return myClients.filter(c => {
      if (priorityClientIds.has(c.id)) return false;
      const d = clientSalesMap[c.id];
      if (!d || d.closed.length < 4) return false;
      return d.adSizes.size === 1 && d.totalSpend >= 1000;
    }).sort((a, b) => (clientSalesMap[b.id]?.totalSpend || 0) - (clientSalesMap[a.id]?.totalSpend || 0))
    .slice(0, 20)
    .map(c => {
      const d = clientSalesMap[c.id];
      const size = [...d.adSizes][0] || "same size";
      return { clientId: c.id, name: c.name, spend: d.totalSpend, detail: `${size} x${d.closed.length} months · upgrade?`, signal: "upsell" };
    });
  }, [myClients, clientSalesMap, priorityClientIds]);

  // 7. Competitor just bought — same industry, lapsed client
  const competitorSignals = useMemo(() => {
    const _sales = sales || [];
    const _clients = clients || [];
    // Find recent closed sales (last 30 days)
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const recentSales = _sales.filter(s => s.status === "Closed" && s.date >= cutoff);
    const recentClientIds = new Set(recentSales.map(s => s.clientId));
    const recentClients = _clients.filter(c => recentClientIds.has(c.id));
    const results = [];
    myLapsed.forEach(c => {
      if (priorityClientIds.has(c.id) || !c.category) return;
      const competitors = recentClients.filter(rc => rc.category === c.category && rc.id !== c.id);
      if (competitors.length > 0) {
        results.push({ clientId: c.id, name: c.name, spend: c.totalSpend || 0, detail: `Lapsed · competitor "${competitors[0].name}" just bought`, signal: "competitor" });
      }
    });
    return results.sort((a, b) => b.spend - a.spend).slice(0, 20);
  }, [myLapsed, sales, clients, priorityClientIds]);

  // 8. Stale leads
  const staleLeadSignals = useMemo(() => {
    return myLapsed.filter(c => {
      if (priorityClientIds.has(c.id)) return false;
      return c.status === "Lead";
    }).map(c => ({ clientId: c.id, name: c.name, spend: 0, detail: "Lead · no purchases", signal: "stale_lead" }));
  }, [myLapsed, priorityClientIds]);

  // 9. Open inventory — issues with low fill rate
  const inventorySignals = useMemo(() => {
    const _sales = sales || [];
    return (issues || []).filter(i => {
      const daysOut = i.adDeadline ? Math.ceil((new Date(i.adDeadline + "T12:00:00") - new Date()) / 86400000) : 999;
      return daysOut > 0 && daysOut <= 21;
    }).map(i => {
      const soldCount = _sales.filter(s => s.issueId === i.id && s.status === "Closed").length;
      const pub = pubs?.find(p => p.id === i.pubId);
      const avgAds = 20; // placeholder
      const fillPct = avgAds > 0 ? Math.round((soldCount / avgAds) * 100) : 0;
      const daysOut = Math.ceil((new Date(i.adDeadline + "T12:00:00") - new Date()) / 86400000);
      if (fillPct >= 85) return null;
      return { issueId: i.id, pubName: pub?.name || "", label: i.label, fillPct, daysOut, signal: "inventory" };
    }).filter(Boolean).sort((a, b) => a.daysOut - b.daysOut).slice(0, 4);
  }, [issues, sales, pubs]);

  // Combine all signals into a flat sorted list for grid display
  const SIGNAL_META = {
    churn: { title: "Missed cycle", color: SIGNAL_COLORS.churn },
    trending_down: { title: "Trending down", color: SIGNAL_COLORS.trending_down },
    whale: { title: "Lapsed whale", color: SIGNAL_COLORS.whale },
    seasonal: { title: "Seasonal", color: SIGNAL_COLORS.seasonal },
    crosssell: { title: "Cross-sell", color: SIGNAL_COLORS.crosssell },
    upsell: { title: "Upsell", color: SIGNAL_COLORS.upsell },
    competitor: { title: "Competitor", color: SIGNAL_COLORS.competitor },
    stale_lead: { title: "Stale lead", color: SIGNAL_COLORS.stale_lead },
  };

  const flatSignals = useMemo(() => {
    const all = [
      ...churnSignals, ...trendingDownSignals, ...whaleSignals,
      ...seasonalSignals, ...crossSellSignals, ...upsellSignals,
      ...competitorSignals, ...staleLeadSignals,
    ];
    const filtered = signalFilter === "all" ? all : all.filter(s => s.signal === signalFilter);
    // Sort: highest spend first within each signal, but interleave signal types for variety
    // Priority order: churn > trending_down > whale > seasonal > competitor > crosssell > upsell > stale_lead
    const signalPriority = { churn: 0, trending_down: 1, whale: 2, seasonal: 3, competitor: 4, crosssell: 5, upsell: 6, stale_lead: 7 };
    return filtered.sort((a, b) => {
      const pa = signalPriority[a.signal] ?? 99;
      const pb = signalPriority[b.signal] ?? 99;
      if (pa !== pb) return pa - pb;
      return (b.spend || 0) - (a.spend || 0);
    });
  }, [signalFilter, churnSignals, trendingDownSignals, whaleSignals, seasonalSignals, crossSellSignals, upsellSignals, competitorSignals, staleLeadSignals]);

  // Signal type counts for filter badges
  const signalCounts = useMemo(() => {
    const counts = {};
    [churnSignals, trendingDownSignals, whaleSignals, seasonalSignals, crossSellSignals, upsellSignals, competitorSignals, staleLeadSignals].forEach(arr => {
      arr.forEach(s => { counts[s.signal] = (counts[s.signal] || 0) + 1; });
    });
    counts.all = Object.values(counts).reduce((s, n) => s + n, 0);
    return counts;
  }, [churnSignals, trendingDownSignals, whaleSignals, seasonalSignals, crossSellSignals, upsellSignals, competitorSignals, staleLeadSignals]);

  // ═══ 30-DAY WINS — recent closed sales from clients that matched signal categories ═══
  const recentWins = useMemo(() => {
    const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const recentClosed = (sales || []).filter(s => s.status === "Closed" && s.date >= cutoff30);

    // Build a set of all signal client IDs by category
    const signalClientMap = {};
    const allSignalArrays = { churn: churnSignals, trending_down: trendingDownSignals, whale: whaleSignals, seasonal: seasonalSignals, crosssell: crossSellSignals, upsell: upsellSignals, competitor: competitorSignals, stale_lead: staleLeadSignals };
    Object.entries(allSignalArrays).forEach(([key, arr]) => {
      arr.forEach(s => { if (!signalClientMap[s.clientId]) signalClientMap[s.clientId] = []; signalClientMap[s.clientId].push(key); });
    });

    // Also check previously-lapsed clients who came back (any closed sale from lapsed/lead)
    const lapsedIds = new Set(myLapsed.map(c => c.id));

    const wins = { total: 0, revenue: 0, byCategory: {} };
    recentClosed.forEach(s => {
      const categories = signalClientMap[s.clientId] || [];
      if (categories.length === 0 && lapsedIds.has(s.clientId)) categories.push("reactivation");
      if (categories.length === 0) return;
      wins.total++;
      wins.revenue += s.amount || 0;
      categories.forEach(cat => {
        if (!wins.byCategory[cat]) wins.byCategory[cat] = { count: 0, revenue: 0 };
        wins.byCategory[cat].count++;
        wins.byCategory[cat].revenue += s.amount || 0;
      });
    });
    return wins;
  }, [sales, churnSignals, trendingDownSignals, whaleSignals, seasonalSignals, crossSellSignals, upsellSignals, competitorSignals, staleLeadSignals, myLapsed]);

  // Pipeline value from MyPriorities clients
  const pipelineValue = useMemo(() => {
    return myPriorityItems.reduce((sum, p) => {
      const c = clients?.find(x => x.id === p.clientId);
      return sum + (c?.totalSpend || 0);
    }, 0);
  }, [myPriorityItems, clients]);

  // Conversion rate — priorities that have recent closed sales
  const conversionRate = useMemo(() => {
    if (myPriorityItems.length === 0) return 0;
    const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const recentClosedClientIds = new Set((sales || []).filter(s => s.status === "Closed" && s.date >= cutoff30).map(s => s.clientId));
    const converted = myPriorityItems.filter(p => recentClosedClientIds.has(p.clientId)).length;
    return Math.round((converted / myPriorityItems.length) * 100);
  }, [myPriorityItems, sales]);

  const handleAdd = async (clientId, signal, detail) => {
    if (!currentUser?.id || !priorityHelpers?.addPriority) return;
    const result = await priorityHelpers.addPriority(currentUser.id, clientId, signal, detail);
    if (result?.error) alert(result.error);
  };

  const handleRemove = async (priorityId) => {
    if (!priorityHelpers?.removePriority) return;
    await priorityHelpers.removePriority(priorityId);
  };

  // ═══ RENDER ═══
  const STAT_CARDS = [
    { key: "churn", label: "Missed Cycle", color: SIGNAL_COLORS.churn, icon: "\u21ba" },
    { key: "trending_down", label: "Trending Down", color: SIGNAL_COLORS.trending_down, icon: "\u2198" },
    { key: "whale", label: "Whales", color: SIGNAL_COLORS.whale, icon: "\u2666" },
    { key: "seasonal", label: "Seasonal", color: SIGNAL_COLORS.seasonal, icon: "\u25d4" },
    { key: "crosssell", label: "Cross-sell", color: SIGNAL_COLORS.crosssell, icon: "\u2194" },
    { key: "upsell", label: "Upsell", color: SIGNAL_COLORS.upsell, icon: "\u2191" },
    { key: "competitor", label: "Competitor", color: SIGNAL_COLORS.competitor, icon: "\u2694" },
    { key: "stale_lead", label: "Stale Leads", color: SIGNAL_COLORS.stale_lead, icon: "\u25cb" },
    { key: "inventory", label: "Inventory", color: SIGNAL_COLORS.inventory, icon: "\u25a1" },
  ];

  const PANELS = [
    { key: "churn", title: "Missed buying cycle", items: flatSignals.filter(s => s.signal === "churn"), color: SIGNAL_COLORS.churn },
    { key: "trending_down", title: "Spend trending down", items: flatSignals.filter(s => s.signal === "trending_down"), color: SIGNAL_COLORS.trending_down },
    { key: "whale", title: "Lapsed whales ($10K+)", items: flatSignals.filter(s => s.signal === "whale"), color: SIGNAL_COLORS.whale },
    { key: "seasonal", title: "Seasonal \u2014 bought this issue last year", items: flatSignals.filter(s => s.signal === "seasonal"), color: SIGNAL_COLORS.seasonal },
    { key: "crosssell", title: "Cross-sell \u2014 only 1\u20132 pubs", items: flatSignals.filter(s => s.signal === "crosssell"), color: SIGNAL_COLORS.crosssell },
    { key: "upsell", title: "Upsell \u2014 same ad size", items: flatSignals.filter(s => s.signal === "upsell"), color: SIGNAL_COLORS.upsell },
    { key: "competitor", title: "Competitor just bought", items: flatSignals.filter(s => s.signal === "competitor"), color: SIGNAL_COLORS.competitor },
    { key: "stale_lead", title: "Stale leads", items: flatSignals.filter(s => s.signal === "stale_lead"), color: SIGNAL_COLORS.stale_lead },
  ].filter(p => (signalFilter === "all" || signalFilter === p.key) && p.items.length > 0);

  return <div style={{ display: "grid", gridTemplateColumns: "260px minmax(0, 1fr)", gap: 16 }}>

    {/* LEFT: MyPriorities */}
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
        <span style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>MyPriorities</span>
        <span style={{ fontSize: FS.sm, color: Z.td, fontWeight: FW.heavy }}>{myPriorityItems.length} / 13</span>
      </div>

      {myPriorityItems.map(p => {
        const c = clients?.find(x => x.id === p.clientId);
        if (!c) return null;
        return <div key={p.id} style={{ ...glass(), borderRadius: Ri, padding: "8px 10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, minWidth: 0 }}>
              {p.highlighted && <svg width="13" height="13" viewBox="0 0 14 14" style={{ flexShrink: 0 }}><polygon points="7,1 9,5 13,5.5 10,8.5 10.8,12.5 7,10.5 3.2,12.5 4,8.5 1,5.5 5,5" fill="#EF9F27" stroke="#BA7517" strokeWidth="0.5"/></svg>}
              <span onClick={() => onSelectClient?.(c.id)} style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.ac, fontFamily: COND, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
            </div>
            <div onClick={() => handleRemove(p.id)} style={{ width: 16, height: 16, borderRadius: 3, border: `1px solid ${Z.da}40`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <svg width="8" height="8" viewBox="0 0 8 8"><line x1="1" y1="1" x2="7" y2="7" stroke={Z.da} strokeWidth="1.5"/><line x1="7" y1="1" x2="1" y2="7" stroke={Z.da} strokeWidth="1.5"/></svg>
            </div>
          </div>
          <div style={{ fontSize: FS.sm, color: Z.tm, margin: "2px 0" }}>{p.signalDetail || `${fmtK(c.totalSpend)} \u00b7 ${c.status}`}</div>
          <div style={{ display: "flex", gap: 3, marginTop: 3 }}>
            <Btn sm style={{ padding: "2px 8px", fontSize: 11 }}>Email</Btn>
            <Btn sm v="ghost" style={{ padding: "2px 8px", fontSize: 11 }}>Call</Btn>
            <Btn sm v="ghost" style={{ padding: "2px 8px", fontSize: 11 }}>Proposal</Btn>
          </div>
        </div>;
      })}

      {myPriorityItems.length < 13 && <div style={{ border: `1px dashed ${Z.bd}`, borderRadius: Ri, padding: "14px 10px", textAlign: "center" }}>
        <div style={{ fontSize: FS.sm, color: Z.td }}>{13 - myPriorityItems.length} slots open</div>
        <div style={{ fontSize: FS.xs, color: Z.td }}>Add from signals</div>
      </div>}
    </div>

    {/* RIGHT: Stats + Wins + Signal Panels */}
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── Stats Card Row ────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 6 }}>
        {STAT_CARDS.map(sc => {
          const count = sc.key === "inventory" ? inventorySignals.length : (signalCounts[sc.key] || 0);
          if (count === 0) return null;
          return <button key={sc.key} onClick={() => setSignalFilter(signalFilter === sc.key ? "all" : sc.key)} style={{
            ...glass(), borderRadius: Ri, padding: "8px 6px", textAlign: "center", cursor: "pointer",
            border: signalFilter === sc.key ? `2px solid ${sc.color}` : `1px solid ${Z.bd}`,
            background: signalFilter === sc.key ? sc.color + "12" : undefined,
          }}>
            <div style={{ fontSize: 18 }}>{sc.icon}</div>
            <div style={{ fontSize: 20, fontWeight: FW.black, color: sc.color, fontFamily: DISPLAY, lineHeight: 1 }}>{count}</div>
            <div style={{ fontSize: 9, fontWeight: FW.heavy, color: Z.tm, fontFamily: COND, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 2 }}>{sc.label}</div>
          </button>;
        })}
      </div>

      {/* ── 30-Day Wins + Pipeline Bar ────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {/* Wins */}
        <div style={{ ...glass(), borderRadius: Ri, padding: "10px 14px", borderLeft: "3px solid #22c55e" }}>
          <div style={{ fontSize: 9, fontWeight: FW.heavy, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>30-Day Wins</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 24, fontWeight: FW.black, color: "#22c55e", fontFamily: DISPLAY }}>{recentWins.total}</span>
            <span style={{ fontSize: 12, fontWeight: FW.heavy, color: "#22c55e", fontFamily: COND }}>{fmtK(recentWins.revenue)}</span>
          </div>
          {Object.keys(recentWins.byCategory).length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
              {Object.entries(recentWins.byCategory).map(([cat, data]) => (
                <span key={cat} style={{ fontSize: 9, fontWeight: FW.heavy, padding: "1px 6px", borderRadius: 2, background: (SIGNAL_COLORS[cat] || "#22c55e") + "18", color: SIGNAL_COLORS[cat] || "#22c55e", fontFamily: COND }}>
                  {SIGNAL_META[cat]?.title || cat} {data.count}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Pipeline */}
        <div style={{ ...glass(), borderRadius: Ri, padding: "10px 14px", borderLeft: "3px solid " + Z.ac }}>
          <div style={{ fontSize: 9, fontWeight: FW.heavy, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Pipeline Value</div>
          <div style={{ fontSize: 24, fontWeight: FW.black, color: Z.ac, fontFamily: DISPLAY }}>{fmtK(pipelineValue)}</div>
          <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND, marginTop: 2 }}>{myPriorityItems.length} active priorities</div>
        </div>

        {/* Conversion */}
        <div style={{ ...glass(), borderRadius: Ri, padding: "10px 14px", borderLeft: "3px solid #6366f1" }}>
          <div style={{ fontSize: 9, fontWeight: FW.heavy, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Conversion Rate</div>
          <div style={{ fontSize: 24, fontWeight: FW.black, color: "#6366f1", fontFamily: DISPLAY }}>{conversionRate}%</div>
          <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND, marginTop: 2 }}>priorities {"\u2192"} closed (30d)</div>
        </div>
      </div>

      {/* ── Filter tabs ───────────────────────────────────── */}
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {SIGNAL_TYPES.map(st => {
          const count = signalCounts[st.key] || 0;
          if (st.key !== "all" && count === 0) return null;
          return <button key={st.key} onClick={() => setSignalFilter(st.key)} style={{
            padding: "4px 10px", borderRadius: Ri, border: `1px solid ${signalFilter === st.key ? Z.ac + "60" : Z.bd}`,
            background: signalFilter === st.key ? Z.as : "transparent", color: signalFilter === st.key ? Z.ac : Z.td,
            fontSize: FS.sm, fontWeight: FW.heavy, cursor: "pointer", fontFamily: COND,
          }}>{st.label}{count > 0 ? ` (${count})` : ""}</button>;
        })}
      </div>

      {/* ── Signal Panels — two per row ───────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {PANELS.map(panel => {
          const isOpen = expandedPanels.has(panel.key);
          const visible = isOpen ? panel.items : panel.items.slice(0, 4);
          const hasMore = panel.items.length > 4;
          const winCount = recentWins.byCategory[panel.key]?.count || 0;
          return <div key={panel.key} style={{ ...glass(), borderRadius: Ri, borderLeft: `3px solid ${panel.color}`, padding: "10px 12px" }}>
            <div onClick={() => hasMore && togglePanel(panel.key)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: visible.length > 0 ? 8 : 0, cursor: hasMore ? "pointer" : "default", userSelect: "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: panel.color, fontFamily: COND }}>{panel.title}</span>
                {hasMore && <span style={{ fontSize: 10, color: Z.td, transition: "transform 0.15s", display: "inline-block", transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)" }}>{"\u25bc"}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {winCount > 0 && <span style={{ fontSize: 9, fontWeight: FW.heavy, padding: "1px 6px", borderRadius: 2, background: "#dcfce7", color: "#16a34a", fontFamily: COND }}>{winCount} won</span>}
                <span style={{ fontSize: FS.sm, color: Z.td }}>{panel.items.length}</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {visible.map(item => <div key={item.clientId} style={{ padding: "6px 8px", background: Z.bg, borderRadius: Ri, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div onClick={() => onSelectClient?.(item.clientId)} style={{ fontSize: FS.md, fontWeight: FW.semi, color: Z.ac, cursor: "pointer", fontFamily: COND, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{item.name}</div>
                    {item.spend > 0 && <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tx, flexShrink: 0, marginLeft: 6 }}>{fmtK(item.spend)}</span>}
                  </div>
                  <div style={{ fontSize: FS.sm, color: Z.tm, lineHeight: 1.3 }}>{item.detail}</div>
                </div>
                <button onClick={() => handleAdd(item.clientId, item.signal, item.detail)} style={{
                  padding: "4px 10px", borderRadius: Ri, border: `1px solid ${Z.ac}30`,
                  background: "transparent", color: Z.ac, fontSize: FS.sm, fontWeight: FW.heavy,
                  cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                }}>+ Add</button>
              </div>)}
            </div>
            {hasMore && !isOpen && <div onClick={() => togglePanel(panel.key)} style={{ fontSize: FS.sm, color: Z.td, textAlign: "center", marginTop: 6, cursor: "pointer", fontWeight: FW.heavy }}>+ {panel.items.length - 4} more</div>}
          </div>;
        })}

        {/* Inventory panel */}
        {(signalFilter === "all" || signalFilter === "inventory") && inventorySignals.length > 0 && <div style={{ ...glass(), borderRadius: Ri, borderLeft: `3px solid ${SIGNAL_COLORS.inventory}`, padding: "10px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: SIGNAL_COLORS.inventory, fontFamily: COND }}>Open inventory {"\u2014"} deadline approaching</span>
            <span style={{ fontSize: FS.sm, color: Z.td }}>{inventorySignals.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {inventorySignals.map(inv => <div key={inv.issueId} style={{ padding: "6px 8px", background: Z.bg, borderRadius: Ri }}>
              <div style={{ fontSize: FS.md, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{inv.pubName} {inv.label}</div>
              <div style={{ fontSize: FS.sm, color: Z.tm }}>{inv.fillPct}% sold {"\u00b7"} {inv.daysOut}d to deadline</div>
            </div>)}
          </div>
        </div>}
      </div>

      {flatSignals.length === 0 && inventorySignals.length === 0 && <div style={{ padding: 24, textAlign: "center", color: Z.su, fontSize: FS.md, fontWeight: FW.semi }}>{signalFilter === "all" ? "All clear \u2014 no actionable signals right now" : "No signals in this category"}</div>}
    </div>
  </div>;
}
