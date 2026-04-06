import { useState, useMemo } from "react";
import { Z, COND, DISPLAY, R, Ri, SP, FS, FW } from "../lib/theme";
import { Ic, Badge, Btn, Card, Stat, Modal, FilterBar } from "../components/ui";
import { ACTION_TYPES } from "../constants";

const Dashboard = ({
  pubs, stories, clients, sales, issues, proposals, team,
  invoices, payments, subscribers, dropLocations, dropLocationPubs,
  tickets, legalNotices, creativeJobs,
  onNavigate, setIssueDetailId, userName, currentUser, salespersonPubAssignments, jurisdiction,
  myPriorities, priorityHelpers,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const cn = id => clients?.find(c => c.id === id)?.name || "—";
  const pn = id => pubs?.find(p => p.id === id)?.name || "";
  const actInf = (act) => { if (!act) return null; if (typeof act === "string") return { type: "task", label: act, icon: "✓", color: Z.tm }; return { ...ACTION_TYPES[act.type] || ACTION_TYPES.task, ...act }; };
  const actInfo = actInf;
  const actLabel = (s) => { const a = actInf(s?.nextAction); return a ? a.label : ""; };
  const actIcon = (s) => { const a = actInf(s?.nextAction); return a?.icon || "→"; };
  const actVerb = (s) => { const a = actInf(s?.nextAction); return a?.verb || "Act"; };
  const handleAct = () => { if (onNavigate) onNavigate("sales"); };

  // Ensure arrays exist — use jurisdiction-filtered data when available
  const _sales = sales || [];
  const _clients = clients || [];
  const _issues = jurisdiction?.myIssues || issues || [];
  const _pubs = jurisdiction?.myPubs || pubs || [];
  const _stories = jurisdiction?.myStories || stories || [];

  const daysUntil = (d) => d ? Math.ceil((new Date(d + "T12:00:00") - new Date()) / 86400000) : 999;
  const fmtCurrency = (n) => "$" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const [dayFilter, setDayFilter] = useState("all");
  const [selMember, setSelMember] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [memberNote, setMemberNote] = useState("");
  const [briefingModal, setBriefingModal] = useState(false);
  const [showOnTrack, setShowOnTrack] = useState(false);
  const ini = (name) => name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "??";
  const openMemberPanel = (t) => { setSelMember(t); setTimeout(() => setPanelOpen(true), 10); };
  const closeMemberPanel = () => { setPanelOpen(false); setTimeout(() => setSelMember(null), 250); };

  const _inv = invoices || []; const _pay = payments || []; const _subs = subscribers || [];
  const _tickets = tickets || []; const _legal = legalNotices || []; const _jobs = creativeJobs || [];

  const hour = new Date().getHours();
  const firstName = (userName || "").split(" ")[0] || "there";
  const greeting = hour < 12 ? `Good morning, ${firstName}` : hour < 17 ? `Good afternoon, ${firstName}` : `Good evening, ${firstName}`;

  const closedRev = useMemo(() => _sales.filter(s => s.status === "Closed").reduce((s, x) => s + (x.amount || 0), 0), [_sales]);
  const target = 85000;
  const pct = Math.min(100, Math.round((closedRev / target) * 100));
  const overdue = useMemo(() => _inv.filter(i => i.status === "overdue" || (i.status === "sent" && i.dueDate && i.dueDate < today)).reduce((s, i) => s + (i.balanceDue || 0), 0), [_inv, today]);
  const collectedToday = useMemo(() => _pay.filter(p => p.receivedAt?.startsWith(today)).reduce((s, p) => s + (p.amount || 0), 0), [_pay, today]);
  const uninvoiced = useMemo(() => { const invSaleIds = new Set(); _inv.forEach(inv => inv.lines?.forEach(l => { if (l.saleId) invSaleIds.add(l.saleId); })); return _sales.filter(s => s.status === "Closed" && !invSaleIds.has(s.id)).reduce((s, x) => s + (x.amount || 0), 0); }, [_sales, _inv]);
  const openTickets = _tickets.filter(t => t.status === "open").length;
  const escalatedTickets = _tickets.filter(t => t.status === "escalated").length;
  const activeLegal = _legal.filter(n => !["published", "billed"].includes(n.status)).length;
  const pendingProofLegal = _legal.filter(n => n.status === "proofing").length;
  const overdueJobs = _jobs.filter(j => j.dueDate && j.dueDate < today && !["complete", "billed"].includes(j.status)).length;
  const expiringNext30 = _subs.filter(s => s.status === "active" && s.renewalDate && s.renewalDate <= new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().slice(0, 10) && s.renewalDate >= today).length;

  // ─── Focus Items ──────────────────────────────────────
  const focusItems = [];
  const nearestIssue = _issues.filter(i => i.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (nearestIssue) { const np = _pubs.find(p => p.id === nearestIssue.pubId); const ns = Math.floor((np?.pageCount || 24) * 0.4); const sold = _sales.filter(s => s.issueId === nearestIssue.id && s.status === "Closed").length; const ne = _stories.filter(s => s.publication === nearestIssue.pubId && ["Needs Editing", "Draft"].includes(s.status)).length; const os = Math.max(0, ns - sold); focusItems.push({ id: "fi-pub", title: `${np?.name} ${nearestIssue.label} — ${daysUntil(nearestIssue.date)}d to publish`, sub: `${os > 0 ? os + " open ad slots" : "Ads full"}${ne > 0 ? " · " + ne + " stories in editing" : ""}`, action: "Review", issueId: nearestIssue.id, dept: "production", priority: 1 }); }
  const topDeal = _sales.filter(s => s.nextAction && !["Closed", "Follow-up"].includes(s.status)).sort((a, b) => (b.amount || 0) - (a.amount || 0))[0];
  if (topDeal) { const ai = actInf(topDeal.nextAction); focusItems.push({ id: "fi-deal", title: `${ai?.label || "Follow up"} — ${cn(topDeal.clientId)}`, sub: `${fmtCurrency(topDeal.amount)} deal value`, action: "Go to deal", page: "sales", dept: "sales", priority: 2 }); }
  const reviewStory = _stories.filter(s => s.status === "Edited" || s.status === "Needs Editing").sort((a, b) => (a.dueDate || "9").localeCompare(b.dueDate || "9"))[0];
  if (reviewStory) focusItems.push({ id: "fi-story", title: `Review "${reviewStory.title}"`, sub: `${reviewStory.author} · ${pn(reviewStory.publication)} · ${reviewStory.status}`, action: "Editorial", page: "editorial", dept: "editorial", priority: 3 });
  if (overdue > 0) { const oc = _inv.filter(i => i.status === "overdue" || (i.status === "sent" && i.dueDate && i.dueDate < today)).length; focusItems.push({ id: "fi-overdue", title: `${oc} overdue invoice${oc > 1 ? "s" : ""} — ${fmtCurrency(overdue)}`, sub: "Requires follow-up", action: "Billing", page: "billing", dept: "admin", priority: 2 }); }
  if (escalatedTickets > 0) focusItems.push({ id: "fi-esc", title: `${escalatedTickets} escalated ticket${escalatedTickets > 1 ? "s" : ""}`, sub: "Escalated by office manager", action: "Service Desk", page: "servicedesk", dept: "admin", priority: 2 });
  if (overdueJobs > 0) focusItems.push({ id: "fi-jobs", title: `${overdueJobs} creative job${overdueJobs > 1 ? "s" : ""} past deadline`, sub: "Client deliverables at risk", action: "Creative", page: "creativejobs", dept: "production", priority: 2 });

  // Renewal alerts
  const renewalClients = useMemo(() => _clients.filter(c => c.status === "Renewal"), [clients]);
  const urgentRenewals = renewalClients.filter(c => c.contractEndDate && c.contractEndDate <= new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  if (urgentRenewals.length > 0) focusItems.push({ id: "fi-renewals", title: `${urgentRenewals.length} renewal${urgentRenewals.length > 1 ? "s" : ""} expiring within 2 weeks`, sub: urgentRenewals.slice(0, 3).map(c => c.name).join(", "), action: "Renewals", page: "sales", dept: "sales", priority: 1 });

  // Salesperson check (needed before issueProgress → myGoals → myRevStats)
  const isSalesperson = currentUser && ["Sales Manager", "Salesperson"].includes(currentUser.role);

  // Today's action items for salesperson cockpit
  const todaysActions = useMemo(() => {
    if (!isSalesperson || !currentUser?.id) return [];
    const myClients = new Set(_clients.filter(c => c.repId === currentUser.id).map(c => c.id));
    return _sales.filter(s => myClients.has(s.clientId) && s.nextAction && (s.nextActionDate <= today || !s.nextActionDate) && s.status !== "Closed" && s.status !== "Follow-up")
      .sort((a, b) => (b.amount || 0) - (a.amount || 0));
  }, [isSalesperson, currentUser, _clients, _sales, today]);

  // ─── Issue Progress ─────────────────────────────────────
  const issueProgress = useMemo(() => {
    // Compute historical avg ads & revenue per pub from loaded sales
    const pubAvgs = {};
    const issueAdCounts = {};
    _sales.forEach(s => {
      if (s.status !== "Closed" || !s.issueId || !s.publication) return;
      if (!issueAdCounts[s.publication]) issueAdCounts[s.publication] = {};
      if (!issueAdCounts[s.publication][s.issueId]) issueAdCounts[s.publication][s.issueId] = { count: 0, rev: 0 };
      issueAdCounts[s.publication][s.issueId].count++;
      issueAdCounts[s.publication][s.issueId].rev += s.amount || 0;
    });
    Object.entries(issueAdCounts).forEach(([pubId, issues]) => {
      const vals = Object.values(issues);
      if (vals.length > 0) {
        pubAvgs[pubId] = {
          avgAds: Math.round(vals.reduce((s, v) => s + v.count, 0) / vals.length),
          avgRev: Math.round(vals.reduce((s, v) => s + v.rev, 0) / vals.length),
        };
      }
    });

    return _pubs.map(pub => {
      const ni = _issues.find(i => i.pubId === pub.id && i.date >= today);
      if (!ni) return null;
      const avg = pubAvgs[pub.id] || { avgAds: 20, avgRev: 5000 };
      // Goal hierarchy: per-issue override > pub default > historical average
      const goal = ni.revenueGoal != null ? ni.revenueGoal : (pub.defaultRevenueGoal > 0 ? pub.defaultRevenueGoal : avg.avgRev);
      const goalSource = ni.revenueGoal != null ? "issue" : (pub.defaultRevenueGoal > 0 ? "pub" : "avg");
      const soldAds = _sales.filter(s => s.issueId === ni.id && s.status === "Closed").length;
      const issueRev = _sales.filter(s => s.issueId === ni.id && s.status === "Closed").reduce((s, x) => s + (x.amount || 0), 0);
      const adPct = avg.avgAds > 0 ? Math.min(100, Math.round((soldAds / avg.avgAds) * 100)) : 0;
      const revPct = goal > 0 ? Math.min(100, Math.round((issueRev / goal) * 100)) : 0;
      const daysOut = Math.ceil((new Date(ni.date + "T12:00:00") - new Date()) / 86400000);
      return { pub, issue: ni, soldAds, avgAds: avg.avgAds, issueRev, goal, goalSource, avgRev: avg.avgRev, adPct, revPct, daysOut };
    }).filter(Boolean).sort((a, b) => a.issue.date.localeCompare(b.issue.date));
  }, [pubs, issues, sales, today]);

  // ─── Salesperson Goals (derived from pub assignments × issue goals) ───
  const myGoals = useMemo(() => {
    if (!isSalesperson || !currentUser?.id || !salespersonPubAssignments?.length) return [];
    const myAssignments = salespersonPubAssignments.filter(a => a.salespersonId === currentUser.id && a.isActive);
    if (!myAssignments.length) return [];
    return issueProgress.map(ip => {
      const assignment = myAssignments.find(a => a.publicationId === ip.pub.id);
      if (!assignment) return null;
      const myPct = Number(assignment.percentage || 0) / 100;
      const myGoal = Math.round(ip.goal * myPct);
      const mySales = _sales.filter(s => s.issueId === ip.issue.id && s.status === "Closed" && s.clientId).reduce((sum, s) => sum + (s.amount || 0), 0);
      const myRevPct = myGoal > 0 ? Math.min(100, Math.round((mySales / myGoal) * 100)) : 0;
      return { ...ip, myPct, myGoal, mySales, myRevPct };
    }).filter(Boolean);
  }, [issueProgress, salespersonPubAssignments, currentUser, isSalesperson, sales]);

  // Personal revenue stats (for salesperson Dashboard)
  const myRevStats = useMemo(() => {
    if (!isSalesperson || !currentUser?.id) return null;
    const myClients = new Set(_clients.filter(c => c.repId === currentUser.id).map(c => c.id));
    const mySales = _sales.filter(s => myClients.has(s.clientId) && s.status === "Closed");
    const thisMonth = today.slice(0, 7);
    const thisMonthRev = mySales.filter(s => s.date?.startsWith(thisMonth)).reduce((sum, s) => sum + (s.amount || 0), 0);
    const thisYearRev = mySales.filter(s => s.date?.startsWith(today.slice(0, 4))).reduce((sum, s) => sum + (s.amount || 0), 0);
    const activePipeline = _sales.filter(s => myClients.has(s.clientId) && !["Closed", "Follow-up"].includes(s.status));
    const pipelineValue = activePipeline.reduce((sum, s) => sum + (s.amount || 0), 0);
    const myRenewals = renewalClients.filter(c => c.repId === currentUser.id).length;
    const myTotalGoal = myGoals.reduce((sum, g) => sum + g.myGoal, 0);
    const myTotalSold = myGoals.reduce((sum, g) => sum + g.mySales, 0);

    // Cumulative daily revenue for line chart (this month)
    const monthSales = mySales.filter(s => s.date?.startsWith(thisMonth));
    const daysInMonth = new Date(parseInt(today.slice(0, 4)), parseInt(today.slice(5, 7)), 0).getDate();
    const dailyMap = {};
    monthSales.forEach(s => { const d = parseInt(s.date?.slice(8, 10) || "0"); dailyMap[d] = (dailyMap[d] || 0) + (s.amount || 0); });
    let cumulative = 0;
    const chartData = [];
    for (let d = 1; d <= daysInMonth; d++) {
      cumulative += dailyMap[d] || 0;
      chartData.push({ day: d, cumulative, isFuture: d > parseInt(today.slice(8, 10)) });
    }

    // Last month's revenue for comparison
    const lastMonthDate = new Date(parseInt(today.slice(0, 4)), parseInt(today.slice(5, 7)) - 2, 1);
    const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
    const lastMonthRev = mySales.filter(s => s.date?.startsWith(lastMonthKey)).reduce((sum, s) => sum + (s.amount || 0), 0);
    const monthDelta = lastMonthRev > 0 ? Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 100) : 0;

    return { thisMonthRev, thisYearRev, pipelineValue, pipelineCount: activePipeline.length, myRenewals, myTotalGoal, myTotalSold, chartData, daysInMonth, lastMonthRev, monthDelta };
  }, [isSalesperson, currentUser, clients, sales, today, renewalClients, myGoals]);

  // Top renewals for dashboard display
  const topRenewals = useMemo(() => {
    if (!currentUser?.id) return [];
    return renewalClients
      .filter(c => c.repId === currentUser.id)
      .sort((a, b) => (b.totalSpend || 0) - (a.totalSpend || 0))
      .slice(0, 3);
  }, [renewalClients, currentUser]);

  // Lapsed whale accounts (salesperson's lapsed clients sorted by lifetime spend)
  const lapsedWhales = useMemo(() => {
    if (!isSalesperson || !currentUser?.id) return [];
    return _clients
      .filter(c => c.repId === currentUser.id && c.status === "Lapsed" && (c.totalSpend || 0) > 5000)
      .sort((a, b) => (b.totalSpend || 0) - (a.totalSpend || 0))
      .slice(0, 5)
      .map(c => {
        const lastSale = _sales.filter(s => s.clientId === c.id && s.status === "Closed").sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
        const monthsLapsed = lastSale?.date ? Math.round((new Date() - new Date(lastSale.date + "T12:00:00")) / (30.44 * 86400000)) : 99;
        return { ...c, lastSaleDate: lastSale?.date, monthsLapsed };
      });
  }, [isSalesperson, currentUser, clients, sales]);

  // Recent wins (salesperson's closed deals this month)
  const recentWins = useMemo(() => {
    if (!isSalesperson || !currentUser?.id) return [];
    const myClients = new Set(_clients.filter(c => c.repId === currentUser.id).map(c => c.id));
    return _sales
      .filter(s => myClients.has(s.clientId) && s.status === "Closed" && s.date >= today.slice(0, 7) + "-01")
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 5)
      .map(s => ({ ...s, clientName: cn(s.clientId), pubName: pn(s.publication) }));
  }, [isSalesperson, currentUser, clients, sales, today]);

  // Upcoming ad deadlines (this week)
  const adDeadlines = useMemo(() => {
    const weekOut = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    return issueProgress
      .filter(ip => ip.issue.adDeadline && ip.issue.adDeadline >= today && ip.issue.adDeadline <= weekOut)
      .sort((a, b) => (a.issue.adDeadline || "").localeCompare(b.issue.adDeadline || ""));
  }, [issueProgress, today]);

  // ─── Team Status ────────────────────────────────────────
  const teamStatus = useMemo(() => (team || []).filter(t => t.role !== "Publisher").map(t => {
    const isSales = ["Sales Manager", "Salesperson"].includes(t.role);
    const md = isSales ? _sales.filter(s => !["Closed", "Follow-up"].includes(s.status)) : [];
    const ms = _stories.filter(s => s.author === t.name && !["On Page", "Sent to Web"].includes(s.status));
    const od = md.filter(s => s.nextActionDate && s.nextActionDate < today);
    const ss = ms.filter(s => s.dueDate && s.dueDate < today);
    const nd = od.length > 0 || ss.length > 0; const oc = od.length + ss.length;
    let detail = "";
    if (isSales && od.length > 0) { const o = od.sort((a, b) => (a.nextActionDate || "").localeCompare(b.nextActionDate || ""))[0]; const d = Math.ceil((new Date() - new Date(o.nextActionDate + "T12:00:00")) / 86400000); const ai = actInf(o.nextAction); detail = `Oldest: ${(ai?.label || "action").toLowerCase()} for ${cn(o.clientId)} (${d}d)`; }
    else if (ss.length > 0) { const o = ss.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))[0]; const d = Math.ceil((new Date() - new Date(o.dueDate + "T12:00:00")) / 86400000); detail = `Oldest: "${o.title}" (${d}d overdue)`; }
    const status = isSales ? (od.length > 0 ? `${od.length} actions overdue` : md.length > 0 ? `${md.length} active deals` : "No active deals") : (ss.length > 0 ? `${ss.length} stories past due` : ms.length > 0 ? `${ms.length} stories in progress` : "No assignments");
    return { ...t, needsDirection: nd, status, isSales, overdueCount: oc, oldestDetail: detail };
  }), [team, sales, stories, today]);
  const needsDir = teamStatus.filter(t => t.needsDirection).sort((a, b) => b.overdueCount - a.overdueCount);
  const onTrack = teamStatus.filter(t => !t.needsDirection);

  // ─── Briefing ───────────────────────────────────────────
  const [showWrapUp, setShowWrapUp] = useState(false);
  const generateBriefing = () => { const d = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }); const l = [`13 STARS MEDIA — DAILY BRIEFING`, d, "", "═══ REVENUE ═══", `Closed: ${fmtCurrency(closedRev)} of ${fmtCurrency(target)} (${pct}%)`]; if (overdue > 0) l.push(`⚠ OVERDUE: ${fmtCurrency(overdue)}`); if (uninvoiced > 0) l.push(`Uninvoiced: ${fmtCurrency(uninvoiced)}`); l.push(""); if (issueProgress.length > 0) { l.push("═══ PUBLISHING ═══"); issueProgress.slice(0, 5).forEach(ip => l.push(`${ip.pub.name} ${ip.issue.label} — ${ip.revPct}% of goal`)); l.push(""); } if (focusItems.length > 0) { l.push("═══ PRIORITIES ═══"); focusItems.forEach((fi, i) => l.push(`${i + 1}. ${fi.title}`)); } return l.join("\n"); };
  const copyBriefing = () => { navigator.clipboard?.writeText(generateBriefing()).catch(() => {}); };

  // End-of-day wrap-up
  const generateWrapUp = () => {
    const d = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const l = [`END OF DAY — ${firstName}`, d, ""];
    if (myRevStats) {
      l.push("═══ MY DAY ═══");
      l.push(`This month: ${fmtCurrency(myRevStats.thisMonthRev)}`);
      l.push(`Pipeline: ${myRevStats.pipelineCount} deals · ${fmtCurrency(myRevStats.pipelineValue)}`);
      if (myRevStats.myTotalGoal > 0) l.push(`Goal progress: ${Math.round((myRevStats.myTotalSold / myRevStats.myTotalGoal) * 100)}%`);
      if (myRevStats.myRenewals > 0) l.push(`⚠ ${myRevStats.myRenewals} renewals need attention`);
      l.push("");
    }
    // Tomorrow's priorities
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const tomorrowActions = _sales.filter(s => s.nextAction && s.nextActionDate === tomorrowStr && !["Closed", "Follow-up"].includes(s.status));
    l.push("═══ TOMORROW ═══");
    if (tomorrowActions.length > 0) {
      tomorrowActions.slice(0, 5).forEach((s, i) => {
        const ai = actInf(s.nextAction);
        l.push(`${i + 1}. ${ai?.label || "Follow up"} — ${cn(s.clientId)}${s.amount > 0 ? ` ($${s.amount.toLocaleString()})` : ""}`);
      });
    } else {
      l.push("No scheduled actions — good time to prospect or work renewals.");
    }
    if (urgentRenewals.length > 0) {
      l.push("");
      l.push("═══ RENEWALS EXPIRING SOON ═══");
      urgentRenewals.slice(0, 5).forEach(c => l.push(`• ${c.name}${c.contractEndDate ? ` (expires ${c.contractEndDate})` : ""}`));
    }
    // Upcoming deadlines
    const nearDeadlines = issueProgress.filter(ip => ip.daysOut <= 7);
    if (nearDeadlines.length > 0) {
      l.push("");
      l.push("═══ DEADLINES THIS WEEK ═══");
      nearDeadlines.forEach(ip => l.push(`${ip.pub.name} ${ip.issue.label} — ${ip.daysOut}d · ${ip.revPct}% of goal`));
    }
    return l.join("\n");
  };
  const deptLabel = (d) => ({ sales: "Sales", editorial: "Editorial", production: "Production", admin: "Admin" }[d] || d);

  // ─── Glass card styles ──────────────────────────────────
  const isDark = Z.bg === "#08090D";
  const glass = {
    background: isDark ? "rgba(14,16,24,0.45)" : "rgba(255,255,255,0.35)",
    backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
    border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.5)"}`,
    borderRadius: R, padding: "22px 24px",
  };

  // ─── Status badge helper for updates ────────────────────
  const statusBadge = (status) => {
    const colors = { Approved: { bg: isDark ? "#1a3a1a" : "#dcfce7", tx: "#16a34a" }, Edited: { bg: isDark ? "#1a2a3a" : "#dbeafe", tx: "#2563eb" }, "On Page": { bg: isDark ? "#2a1a3a" : "#ede9fe", tx: "#7c3aed" }, "Needs Editing": { bg: isDark ? "#3a2a1a" : "#fef3c7", tx: "#d97706" }, Draft: { bg: isDark ? "#1a1a2a" : "#f3f4f6", tx: "#6b7280" } };
    const c = colors[status] || colors.Draft;
    return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: Ri, fontSize: FS.xs, fontWeight: FW.bold, background: c.bg, color: c.tx, fontFamily: COND }}>{status}</span>;
  };

  // ─── Render ─────────────────────────────────────────────
  return <><div style={{ display: "flex", flexDirection: "column" }}>

    {/* FROSTED GLASS STICKY HEADER — greeting + briefing */}
    <div style={{
      position: "sticky", top: 0, zIndex: 20,
      padding: "48px 28px 32px",
    }}>
      {/* Blur backdrop layer */}
      <div style={{
        position: "absolute", inset: 0,
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        background: isDark ? "rgba(8,9,13,0.8)" : "rgba(240,241,244,0.8)",
        maskImage: "linear-gradient(to bottom, black 50%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, black 50%, transparent 100%)",
        pointerEvents: "none",
      }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h2 style={{ margin: 0, fontSize: FS.xxl, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{greeting}</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn sm v="secondary" onClick={() => setBriefingModal(true)}>Morning Briefing</Btn>
            <Btn sm v="secondary" onClick={() => setShowWrapUp(true)}>Wrap Up My Day</Btn>
          </div>
        </div>
      </div>
    </div>

    {/* Main content */}
    <div style={{ padding: "0 28px 28px", display: "flex", flexDirection: "column", gap: SP.pageGap }}>

    {/* ═══ SALESPERSON HERO SECTION ═══ */}
    {isSalesperson && myRevStats ? <>
      {/* ROW 1: Revenue Hero + Goal Ring + Line Chart */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 180px 1fr", gap: 14 }}>
        {/* Big Revenue Number */}
        <div style={{ ...glass, padding: "24px 28px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontFamily: COND }}>This Month</div>
          <div style={{ fontSize: 36, fontWeight: FW.black, color: Z.su, fontFamily: DISPLAY, letterSpacing: -1, lineHeight: 1 }}>{fmtCurrency(myRevStats.thisMonthRev)}</div>
          {myRevStats.monthDelta !== 0 && <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8 }}>
            <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: myRevStats.monthDelta > 0 ? Z.go : Z.da }}>{myRevStats.monthDelta > 0 ? "↑" : "↓"} {Math.abs(myRevStats.monthDelta)}%</span>
            <span style={{ fontSize: FS.sm, color: Z.td }}>vs last month</span>
          </div>}
          <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 4 }}>YTD: {fmtCurrency(myRevStats.thisYearRev)}</div>
        </div>

        {/* Goal Progress Ring */}
        <div style={{ ...glass, padding: "20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          {myRevStats.myTotalGoal > 0 ? (() => {
            const pctVal = Math.min(100, Math.round((myRevStats.myTotalSold / myRevStats.myTotalGoal) * 100));
            const radius = 52; const stroke = 8; const circumference = 2 * Math.PI * radius;
            const offset = circumference - (pctVal / 100) * circumference;
            const ringColor = pctVal >= 80 ? Z.go : pctVal >= 50 ? Z.wa : Z.da;
            return <div style={{ position: "relative", width: 120, height: 120 }}>
              <svg width="120" height="120" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="60" cy="60" r={radius} fill="none" stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"} strokeWidth={stroke} />
                <circle cx="60" cy="60" r={radius} fill="none" stroke={ringColor} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1s ease" }} />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: 28, fontWeight: FW.black, color: ringColor, fontFamily: DISPLAY, lineHeight: 1 }}>{pctVal}%</div>
                <div style={{ fontSize: 9, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5 }}>of goal</div>
              </div>
            </div>;
          })() : <div style={{ textAlign: "center", color: Z.td, fontSize: FS.sm }}>No goals set</div>}
        </div>

        {/* Cumulative Revenue Line Chart */}
        <div style={{ ...glass, padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Revenue Trend</span>
            {myRevStats.myTotalGoal > 0 && <span style={{ fontSize: FS.sm, color: Z.tm }}>Goal: {fmtCurrency(myRevStats.myTotalGoal)}</span>}
          </div>
          {myRevStats.chartData.length > 0 && (() => {
            const data = myRevStats.chartData;
            const maxVal = Math.max(myRevStats.myTotalGoal || 0, ...data.map(d => d.cumulative)) * 1.1 || 1;
            const w = 100; const h = 100;
            const todayIdx = data.findIndex(d => d.isFuture) - 1;
            const actualData = data.filter(d => !d.isFuture);
            const points = actualData.map((d, i) => `${(d.day / myRevStats.daysInMonth) * w},${h - (d.cumulative / maxVal) * h}`).join(" ");
            const goalY = myRevStats.myTotalGoal > 0 ? h - (myRevStats.myTotalGoal / maxVal) * h : -10;
            return <svg viewBox={`0 0 ${w} ${h + 4}`} style={{ width: "100%", height: 120 }} preserveAspectRatio="none">
              {/* Goal line */}
              {myRevStats.myTotalGoal > 0 && <line x1="0" y1={goalY} x2={w} y2={goalY} stroke={Z.wa} strokeWidth="0.5" strokeDasharray="2,2" opacity="0.6" />}
              {/* Gradient fill under line */}
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={Z.go} stopOpacity="0.3" />
                  <stop offset="100%" stopColor={Z.go} stopOpacity="0" />
                </linearGradient>
              </defs>
              {actualData.length > 1 && <polygon points={`${(actualData[0].day / myRevStats.daysInMonth) * w},${h} ${points} ${(actualData[actualData.length - 1].day / myRevStats.daysInMonth) * w},${h}`} fill="url(#revGrad)" />}
              {/* Revenue line */}
              {actualData.length > 1 && <polyline points={points} fill="none" stroke={Z.go} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
              {/* Today dot */}
              {actualData.length > 0 && (() => { const last = actualData[actualData.length - 1]; return <circle cx={(last.day / myRevStats.daysInMonth) * w} cy={h - (last.cumulative / maxVal) * h} r="3" fill={Z.go} />; })()}
            </svg>;
          })()}
        </div>
      </div>

      {/* ROW 2: My Stats (replacing company-wide cards) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {[
          { label: "Closed Deals", value: (() => { const mc = new Set(_clients.filter(c => c.repId === currentUser?.id).map(c => c.id)); return _sales.filter(s => mc.has(s.clientId) && s.status === "Closed" && s.date?.startsWith(today.slice(0, 7))).length; })(), icon: "✓", color: Z.su },
          { label: "Active Pipeline", value: `${myRevStats.pipelineCount} · ${fmtCurrency(myRevStats.pipelineValue)}`, icon: "◎", color: Z.ac },
          { label: "Renewals Due", value: myRevStats.myRenewals > 0 ? `${myRevStats.myRenewals} clients` : "All clear", icon: myRevStats.myRenewals > 0 ? "⚠" : "✓", color: myRevStats.myRenewals > 0 ? Z.wa : Z.su },
          { label: "Active Clients", value: _clients.filter(c => c.repId === currentUser?.id && c.status === "Active").length, icon: "♦", color: Z.ac },
        ].map(s => <div key={s.label} style={{ ...glass, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: R, background: s.color + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{s.icon}</div>
          <div>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: COND }}>{s.label}</div>
            <div style={{ fontSize: FS.md, fontWeight: FW.black, color: s.color, fontFamily: DISPLAY }}>{s.value}</div>
          </div>
        </div>)}
      </div>

      {/* ROW 3: Top Renewals (if any) */}
      {topRenewals.length > 0 && <div style={{ ...glass, padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Renewals Due · {myRevStats.myRenewals} total</span>
          <Btn sm v="ghost" onClick={() => onNavigate("sales")}>View All</Btn>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {topRenewals.map(c => <div key={c.id} style={{ flex: 1, padding: "12px 14px", background: Z.bg, borderRadius: R, border: `1px solid ${Z.wa}25`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, fontFamily: COND }}>{c.name}</div>
              <div style={{ fontSize: FS.sm, color: Z.tm }}>{fmtCurrency(c.totalSpend)} lifetime{c.contractEndDate ? ` · expires ${c.contractEndDate.slice(5)}` : ""}</div>
            </div>
            <Btn sm onClick={() => onNavigate("sales")}>Call</Btn>
          </div>)}
        </div>
      </div>}
    </> :
    /* ═══ PUBLISHER/NON-SALES VIEW ═══ */
    <>
    {/* UPDATES ROW — 5 frosted glass cards */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 12 }}>
      {[
        { label: "Sales", items: (() => { const ac = _sales.filter(s => !["Closed", "Follow-up"].includes(s.status)); return ac.length > 0 ? [{ text: `${ac.length} active deals · ${fmtCurrency(ac.reduce((s, x) => s + (x.amount || 0), 0))}` }] : []; })() },
        { label: "Editorial", items: _stories.filter(s => ["Edited", "Approved", "On Page"].includes(s.status)).slice(0, 4).map(s => ({ text: `"${s.title}"`, status: s.status })) },
        { label: "Production", items: _issues.filter(i => i.date >= today && daysUntil(i.date) <= 7).slice(0, 4).map(i => ({ text: `${pn(i.pubId)} ${i.label} — ${daysUntil(i.date)}d` })) },
        { label: "Billing", items: (() => { const it = []; if (collectedToday > 0) it.push({ text: `${fmtCurrency(collectedToday)} collected today` }); if (uninvoiced > 0) it.push({ text: `${fmtCurrency(uninvoiced)} uninvoiced`, alert: true }); return it; })() },
        { label: "Office", items: (() => { const it = []; if (openTickets > 0) it.push({ text: `${openTickets} open ticket${openTickets > 1 ? "s" : ""}` }); if (escalatedTickets > 0) it.push({ text: `${escalatedTickets} escalated`, alert: true }); if (activeLegal > 0) it.push({ text: `${activeLegal} legal notice${activeLegal > 1 ? "s" : ""} active` }); return it; })() },
      ].map(col => <div key={col.label} style={{ ...glass, padding: "18px 20px" }}>
        
        <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 12, fontFamily: COND }}>{col.label}</div>
        {col.items.length === 0 ? <div style={{ fontSize: FS.sm, color: Z.td, fontStyle: "italic" }}>No updates</div>
          : col.items.map((a, i) => <div key={i} style={{ fontSize: FS.base, color: a.alert ? Z.da : Z.tx, fontWeight: a.alert ? 600 : 400, padding: "4px 0", lineHeight: 1.5, display: "flex", gap: 8, alignItems: "center" }}>
            {a.alert && <span style={{ color: Z.da, fontSize: FS.xs, flexShrink: 0 }}>●</span>}
            <span style={{ flex: 1 }}>{a.text}</span>
            {a.status && statusBadge(a.status)}
          </div>)}
      </div>)}
    </div>
    </>}

    {/* TWO COLUMNS — role-specific */}
    {isSalesperson ? <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* LEFT: Next Actions + Deadline Countdown */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* NEXT ACTIONS */}
          <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>Next Actions</span>
              <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: todaysActions.length > 0 ? Z.da : Z.su }}>{todaysActions.length} due</span>
            </div>
            {todaysActions.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: Z.su, fontSize: FS.md, fontWeight: FW.semi }}>All caught up — time to prospect!</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto" }}>
              {todaysActions.slice(0, 8).map(s => <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: Z.bg, borderRadius: Ri, borderLeft: `3px solid ${s.nextActionDate < today ? Z.da : Z.wa}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, fontFamily: COND, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cn(s.clientId)}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: FS.sm, color: Z.tm }}>
                    <span>{actIcon(s)} {actLabel(s)}</span>
                    {s.amount > 0 && <span style={{ fontWeight: FW.heavy, color: Z.su }}>${s.amount.toLocaleString()}</span>}
                    {s.nextActionDate < today && <span style={{ color: Z.da, fontWeight: FW.heavy, fontSize: FS.xs }}>OVERDUE</span>}
                  </div>
                </div>
                <button onClick={() => handleAct(s.id)} style={{ padding: "6px 12px", borderRadius: Ri, border: `1px solid ${(actInfo(s.nextAction)?.color || Z.ac)}40`, background: `${actInfo(s.nextAction)?.color || Z.ac}10`, cursor: "pointer", fontSize: FS.sm, fontWeight: FW.heavy, color: actInfo(s.nextAction)?.color || Z.ac, flexShrink: 0 }}>{actVerb(s)}</button>
              </div>)}
            </div>}
          </div>
          {/* DEADLINE COUNTDOWN */}
          <div style={glass}>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 12 }}>Deadline Countdown</div>
            {adDeadlines.length === 0 ? <div style={{ padding: 16, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No ad deadlines this week</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {adDeadlines.map(ip => {
                const dlDays = Math.ceil((new Date(ip.issue.adDeadline + "T12:00:00") - new Date()) / 86400000);
                const dlColor = dlDays <= 0 ? Z.da : dlDays <= 2 ? Z.wa : Z.tm;
                return <div key={ip.issue.id} style={{ display: "grid", gridTemplateColumns: "1fr 50px 70px 36px", gap: 6, alignItems: "center", padding: "8px 10px", background: Z.bg, borderRadius: Ri, borderLeft: `3px solid ${dlColor}` }}>
                  <div>
                    <div style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx, fontFamily: COND }}>{ip.pub.name}</div>
                    <div style={{ fontSize: FS.sm, color: Z.td }}>{ip.issue.label}</div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: FS.md, fontWeight: FW.black, color: dlColor }}>{dlDays <= 0 ? "NOW" : dlDays + "d"}</div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tx }}>${Math.round(ip.issueRev / 1000)}K / ${Math.round(ip.goal / 1000)}K</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 14, border: `2px solid ${ip.revPct >= 80 ? Z.go : ip.revPct >= 50 ? Z.wa : Z.da}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: FW.black, color: ip.revPct >= 80 ? Z.go : ip.revPct >= 50 ? Z.wa : Z.da }}>{ip.revPct}%</div>
                  </div>
                </div>;
              })}
            </div>}
          </div>
        </div>
        {/* RIGHT: MyPriorities + Hot Opportunities + Win Streak + Upcoming Issues */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* MY PRIORITIES (compact) */}
          {(() => {
            const myP = (myPriorities || []).filter(p => p.teamMemberId === currentUser?.id).sort((a, b) => { if (a.highlighted && !b.highlighted) return -1; if (!a.highlighted && b.highlighted) return 1; return (a.sortOrder || 0) - (b.sortOrder || 0); });
            return myP.length > 0 ? <div style={glass}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>MyPriorities</span>
                <span style={{ fontSize: FS.sm, color: Z.td, fontWeight: FW.heavy }}>{myP.length}/13</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {myP.slice(0, 5).map(p => {
                  const c = _clients.find(x => x.id === p.clientId);
                  if (!c) return null;
                  return <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: Z.bg, borderRadius: Ri }}>
                    {p.highlighted && <svg width="12" height="12" viewBox="0 0 14 14" style={{ flexShrink: 0 }}><polygon points="7,1 9,5 13,5.5 10,8.5 10.8,12.5 7,10.5 3.2,12.5 4,8.5 1,5.5 5,5" fill="#EF9F27" stroke="#BA7517" strokeWidth="0.5"/></svg>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx, fontFamily: COND, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                      <div style={{ fontSize: FS.sm, color: Z.tm }}>{p.signalDetail || fmtCurrency(c.totalSpend)}</div>
                    </div>
                    <Btn sm onClick={() => onNavigate("sales")}>Go</Btn>
                  </div>;
                })}
                {myP.length > 5 && <div style={{ fontSize: FS.sm, color: Z.td, textAlign: "center" }}>+ {myP.length - 5} more</div>}
              </div>
            </div> : null;
          })()}
          {/* HOT OPPORTUNITIES */}
          <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>Hot Opportunities</span>
              {lapsedWhales.length > 0 && <span style={{ fontSize: FS.sm, color: Z.wa, fontWeight: FW.heavy }}>{fmtCurrency(lapsedWhales.reduce((s, c) => s + (c.totalSpend || 0), 0))} lifetime</span>}
            </div>
            {lapsedWhales.length === 0 ? <div style={{ padding: 16, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No lapsed whale accounts</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {lapsedWhales.map(c => <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: Z.bg, borderRadius: Ri, borderLeft: `3px solid ${Z.wa}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, fontFamily: COND, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                  <div style={{ fontSize: FS.sm, color: Z.tm }}>{fmtCurrency(c.totalSpend)} lifetime · lapsed {c.monthsLapsed}mo</div>
                </div>
                <Btn sm onClick={() => onNavigate("sales")}>Re-engage</Btn>
              </div>)}
            </div>}
          </div>
          {/* WIN STREAK */}
          <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>Win Streak</span>
              {recentWins.length > 0 && <span style={{ fontSize: FS.sm, color: Z.su, fontWeight: FW.heavy }}>{recentWins.length} this month</span>}
            </div>
            {recentWins.length === 0 ? <div style={{ padding: 16, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No closed deals this month yet</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {recentWins.map((s, idx) => <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: Ri, background: idx === 0 ? (Z.su + "08") : "transparent" }}>
                <div style={{ width: 22, height: 22, borderRadius: 11, background: Z.su + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: Z.su, flexShrink: 0 }}>✓</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx, fontFamily: COND, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.clientName}</div>
                  <div style={{ fontSize: FS.sm, color: Z.td }}>{s.pubName} · {s.date?.slice(5)}</div>
                </div>
                <span style={{ fontSize: FS.md, fontWeight: FW.black, color: Z.su, fontFamily: DISPLAY, flexShrink: 0 }}>{fmtCurrency(s.amount)}</span>
              </div>)}
            </div>}
          </div>
          {/* UPCOMING ISSUES (compact) */}
          <div style={glass}>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 10 }}>Upcoming Issues</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {issueProgress.slice(0, 6).map((ip, idx, arr) => {
                const urgency = ip.daysOut <= 3 ? Z.da : ip.daysOut <= 7 ? Z.wa : Z.tm;
                return <div key={ip.issue.id} style={{ display: "grid", gridTemplateColumns: "1fr 40px 28px", gap: 6, alignItems: "center", padding: "5px 0", borderBottom: idx < arr.length - 1 ? `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}` : "none" }}>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{ip.pub.name} <span style={{ color: Z.td, fontWeight: FW.normal }}>{ip.issue.label}</span></div>
                  <div style={{ textAlign: "right", fontSize: FS.sm, fontWeight: FW.heavy, color: urgency }}>{ip.daysOut <= 0 ? "Today" : ip.daysOut + "d"}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 24, height: 24, borderRadius: 12, border: `2px solid ${ip.revPct >= 80 ? Z.go : ip.revPct >= 50 ? Z.wa : Z.da}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: FW.black, color: ip.revPct >= 80 ? Z.go : ip.revPct >= 50 ? Z.wa : Z.da }}>{ip.revPct}%</div>
                  </div>
                </div>;
              })}
            </div>
          </div>
        </div>
      </div>
    </>
    : /* ═══ PUBLISHER LAYOUT ═══ */
    <div style={{ display: "grid", gridTemplateColumns: "5fr 3fr", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={glass}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>My Day</span>
            <div style={{ display: "flex", gap: 3 }}>
              {[{ value: "all", label: "All" }, { value: "sales", label: "Sales" }, { value: "editorial", label: "Editorial" }, { value: "production", label: "Production" }, { value: "admin", label: "Admin" }].map(o => <button key={o.value} onClick={() => setDayFilter(o.value)} style={{ padding: "5px 12px", borderRadius: Ri, border: "none", background: dayFilter === o.value ? Z.go : "transparent", color: dayFilter === o.value ? "#fff" : Z.td, cursor: "pointer", fontSize: FS.sm, fontWeight: FW.bold, fontFamily: COND }}>{o.label}</button>)}
            </div>
          </div>
          {focusItems.filter(fi => dayFilter === "all" || fi.dept === dayFilter).map((fi, idx, arr) => <div key={fi.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: idx < arr.length - 1 ? `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` : "none" }}>
            <Badge status={deptLabel(fi.dept)} small />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: FS.md, fontWeight: FW.semi, color: Z.tx, fontFamily: COND, lineHeight: 1.35 }}>{fi.title}</div>
              <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 2 }}>{fi.sub}</div>
            </div>
            <Btn sm onClick={() => { if (fi.issueId && setIssueDetailId) setIssueDetailId(fi.issueId); else if (fi.page) onNavigate(fi.page); }}>{fi.action}</Btn>
          </div>)}
          {focusItems.filter(fi => dayFilter === "all" || fi.dept === dayFilter).length === 0 && <div style={{ padding: 16, textAlign: "center", color: Z.tm, fontSize: FS.md, fontWeight: FW.semi }}>All clear — nothing urgent today</div>}
        </div>
        <div style={glass}>
          
          <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 16 }}>Upcoming Issues</div>
          {issueProgress.length === 0 ? <div style={{ fontSize: FS.base, color: Z.td, padding: 16, textAlign: "center" }}>No upcoming issues</div> :
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {issueProgress.slice(0, 8).map((ip, idx, arr) => {
              const urgency = ip.daysOut <= 3 ? Z.da : ip.daysOut <= 7 ? Z.wa : Z.tm;
              return <div key={ip.issue.id} onClick={() => { if (setIssueDetailId) setIssueDetailId(ip.issue.id); }} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 42px", gap: 8, alignItems: "center", padding: "10px 0", borderBottom: idx < arr.length - 1 ? `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` : "none", cursor: "pointer" }}>
                <div>
                  <div style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx, fontFamily: COND }}>{ip.pub.name}</div>
                  <div style={{ fontSize: FS.sm, color: Z.td }}>{ip.issue.label} · <span style={{ color: urgency, fontWeight: FW.bold }}>{ip.daysOut <= 0 ? "Today" : ip.daysOut + "d"}</span></div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{ip.soldAds}</div>
                  <div style={{ fontSize: FS.micro, color: Z.td }}>/ {ip.avgAds} avg</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>${Math.round(ip.issueRev / 1000)}K</div>
                  <div style={{ fontSize: FS.micro, color: Z.td }}>/ ${Math.round(ip.goal / 1000)}K {ip.goalSource === "issue" ? "goal" : ip.goalSource === "pub" ? "goal" : "avg"}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 18, border: `3px solid ${ip.revPct >= 80 ? Z.go : ip.revPct >= 50 ? Z.wa : Z.da}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: FW.black, color: ip.revPct >= 80 ? Z.go : ip.revPct >= 50 ? Z.wa : Z.da }}>{ip.revPct}%</div>
                </div>
              </div>;
            })}
          </div>}
          {issueProgress.length > 8 && <div style={{ fontSize: FS.sm, color: Z.td, textAlign: "center", marginTop: 8 }}>+ {issueProgress.length - 8} more</div>}
        </div>

        {/* MY GOALS — shows for salespeople with pub assignments */}
        {isSalesperson && myGoals.length > 0 && <div style={glass}>
          <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 16 }}>My Goals</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {myGoals.slice(0, 6).map((g, idx, arr) => (
              <div key={g.issue.id} style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 42px", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: idx < arr.length - 1 ? `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` : "none" }}>
                <div>
                  <div style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx, fontFamily: COND }}>{g.pub.name}</div>
                  <div style={{ fontSize: FS.sm, color: Z.td }}>{g.issue.label} · {Math.round(g.myPct * 100)}% assigned</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>${Math.round(g.mySales / 1000)}K</div>
                  <div style={{ fontSize: FS.micro, color: Z.td }}>sold</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tm }}>${Math.round(g.myGoal / 1000)}K</div>
                  <div style={{ fontSize: FS.micro, color: Z.td }}>goal</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 18, border: `3px solid ${g.myRevPct >= 80 ? Z.go : g.myRevPct >= 50 ? Z.wa : Z.da}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: FW.black, color: g.myRevPct >= 80 ? Z.go : g.myRevPct >= 50 ? Z.wa : Z.da }}>{g.myRevPct}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>}
      </div>

      {/* RIGHT: My Direction — frosted glass */}
      <div style={{ ...glass, alignSelf: "start" }}>
        
        <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 16 }}>My Direction</div>
        {needsDir.length > 0 && <div style={{ position: "relative" }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10, fontFamily: COND }}>Needs attention</div>
          {needsDir.map((t, idx, arr) => <div key={t.id} onClick={() => openMemberPanel(t)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: idx < arr.length - 1 ? `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` : "none", cursor: "pointer" }}>
            <div style={{ fontSize: FS.md, fontWeight: FW.black, color: Z.td, width: 16, flexShrink: 0, fontFamily: DISPLAY }}>{idx + 1}</div>
            <div style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.xs, fontWeight: FW.bold, color: Z.tm, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", flexShrink: 0, borderRadius: R, fontFamily: COND }}>{ini(t.name)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: FS.md, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{t.name}</div>
              <div style={{ fontSize: FS.sm, color: Z.da, fontWeight: FW.semi, marginTop: 1 }}>{t.status}</div>
              {t.oldestDetail && <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 2 }}>{t.oldestDetail}</div>}
            </div>
            <Btn sm onClick={e => { e.stopPropagation(); openMemberPanel(t); }}>Direct</Btn>
          </div>)}
        </div>}

        {/* On Track — collapsed by default */}
        {onTrack.length > 0 && <div style={{ marginTop: 20 }}>
          <button onClick={() => setShowOnTrack(v => !v)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: COND }}>
            <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, letterSpacing: 0.8, textTransform: "uppercase" }}>On track · {onTrack.length}</span>
            <span style={{ fontSize: FS.micro, color: Z.td, transition: "transform 0.2s", transform: showOnTrack ? "rotate(0)" : "rotate(-90deg)" }}>▼</span>
          </button>
          {showOnTrack && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {onTrack.map(t => <div key={t.id} onClick={() => openMemberPanel(t)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 5px", border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, borderRadius: R, cursor: "pointer", fontFamily: COND }} title={t.status}>
              <div style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: FW.bold, color: Z.td, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)", flexShrink: 0, borderRadius: Ri }}>{ini(t.name)}</div>
              <span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tm }}>{t.name}</span>
            </div>)}
          </div>}
        </div>}
      </div>
    </div>}

    </div>{/* end padded content wrapper */}

    {/* BRIEFING MODAL */}
    <Modal open={briefingModal} onClose={() => setBriefingModal(false)} title="Daily Briefing" width={640}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn sm v="secondary" onClick={copyBriefing}>Copy to Clipboard</Btn>
          <Btn sm onClick={() => { copyBriefing(); setBriefingModal(false); }}>Copy & Close</Btn>
        </div>
        <pre style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: R, padding: SP.cardPad, fontSize: FS.sm, color: Z.tx, lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "'Source Sans 3', monospace", maxHeight: 500, overflowY: "auto", margin: 0 }}>{generateBriefing()}</pre>
      </div>
    </Modal>

    {/* END-OF-DAY WRAP-UP */}
    <Modal open={showWrapUp} onClose={() => setShowWrapUp(false)} title="Day Wrap-Up" width={640}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn sm v="secondary" onClick={() => { navigator.clipboard?.writeText(generateWrapUp()); }}>Copy to Clipboard</Btn>
          <Btn sm onClick={() => { navigator.clipboard?.writeText(generateWrapUp()); setShowWrapUp(false); }}>Copy & Close</Btn>
        </div>
        <pre style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: R, padding: SP.cardPad, fontSize: FS.sm, color: Z.tx, lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "'Source Sans 3', monospace", maxHeight: 500, overflowY: "auto", margin: 0 }}>{generateWrapUp()}</pre>
      </div>
    </Modal>

    {/* TEAM MEMBER SLIDE-IN */}
    {selMember && <div style={{ position: "fixed", inset: 0, zIndex: 999 }} onClick={closeMemberPanel}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", opacity: panelOpen ? 1 : 0, transition: "opacity 0.25s" }} />
      <div onClick={e => e.stopPropagation()} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 420, maxWidth: "90vw", background: Z.sf, borderLeft: `1px solid ${Z.bd}`, display: "flex", flexDirection: "column", transform: panelOpen ? "translateX(0)" : "translateX(100%)", transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)", boxShadow: panelOpen ? "-8px 0 30px rgba(0,0,0,0.3)" : "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: `1px solid ${Z.bd}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.md, fontWeight: FW.bold, color: Z.tm, background: Z.bg, fontFamily: COND, borderRadius: R }}>{ini(selMember.name)}</div>
            <div><div style={{ fontSize: 18, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{selMember.name}</div><div style={{ fontSize: FS.base, color: Z.tm }}>{selMember.role}</div></div>
          </div>
          <Btn sm v="ghost" onClick={closeMemberPanel}>&times;</Btn>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6, fontFamily: COND }}>Send a note</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={memberNote} onChange={e => setMemberNote(e.target.value)} placeholder="Direct this team member..." style={{ flex: 1, background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "10px 14px", color: Z.tx, fontSize: FS.base, outline: "none" }} onKeyDown={e => { if (e.key === "Enter" && memberNote.trim()) setMemberNote(""); }} />
              <Btn sm onClick={() => { if (memberNote.trim()) setMemberNote(""); }}>Send</Btn>
            </div>
          </div>
          <div>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6, fontFamily: COND }}>Quick assign</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(["Sales Manager", "Salesperson"].includes(selMember.role) ? ["Follow up with client", "Send media kit", "Send proposal", "Schedule call", "Review contract"] : ["Editor", "Copy Editor", "Managing Editor"].includes(selMember.role) ? ["Edit story", "Review draft", "Final proof", "Assign photos", "Write headline"] : ["Graphic Designer", "Photo Editor"].includes(selMember.role) ? ["Design ad", "Layout pages", "Create proof", "Update media kit", "Photo edit"] : ["Office Manager"].includes(selMember.role) ? ["Follow up on payment", "Process renewal", "Handle complaint", "Schedule driver", "Send legal proof"] : ["Write story", "Submit draft", "Revise story", "Add photos", "Research topic"]
              ).map(task => <button key={task} style={{ padding: "6px 14px", border: `1px solid ${Z.bd}`, borderRadius: Ri, background: Z.bg, cursor: "pointer", fontSize: FS.sm, fontWeight: FW.semi, color: Z.tm, fontFamily: COND }}>{task}</button>)}
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${Z.bd}`, paddingTop: 14 }}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6, fontFamily: COND }}>Contact</div>
            <div style={{ fontSize: FS.base, color: Z.tm }}>{selMember.email}</div>
            {selMember.phone && <div style={{ fontSize: FS.base, color: Z.tm, marginTop: 2 }}>{selMember.phone}</div>}
          </div>
        </div>
      </div>
    </div>}
  </div></>;
};

export default Dashboard;
