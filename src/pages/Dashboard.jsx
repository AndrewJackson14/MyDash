import { useState, useEffect, useMemo, memo } from "react";
import { Z, DARK, COND, DISPLAY, R, Ri, SP, FS, FW, ACCENT, ZI, INV } from "../lib/theme";
import { Ic, Badge, Btn, Card, Stat, Modal, FilterBar, Pill, glass as glassStyle } from "../components/ui";
import RoleDashboard from "../components/RoleDashboard";
import TeamMemberPanel from "../components/TeamMemberPanel";
import { fmtCurrencyWhole as fmtCurrency, daysUntil, initials as ini } from "../lib/formatters";
import { useDialog } from "../hooks/useDialog";
import { useSignalFeed } from "../hooks/useSignalFeed";

/* ═══ MEMOIZED SUB-COMPONENTS ═══ */

const RevenueCommandBar = memo(({ cards, glass }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
    {cards.map(c => (
      <div key={c.label} onClick={c.onClick} style={{ ...glass, padding: "12px 16px", cursor: "pointer", borderBottom: `2px solid ${c.color}` }}>
        <div style={{ fontSize: 11, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND }}>{c.label}</div>
        <div style={{ fontSize: 22, fontWeight: FW.black, color: c.color, fontFamily: DISPLAY, marginTop: 4 }}>{c.value}</div>
        {c.sub && <div style={{ fontSize: 11, color: Z.tm, fontFamily: COND, marginTop: 2 }}>{c.sub}</div>}
      </div>
    ))}
  </div>
));

const IssueCountdownList = memo(({ magIssues, pn, setIssueDetailId, onNavigate, glass }) => {
  if (magIssues.length === 0) return null;
  return <div style={{ ...glass, padding: "18px 22px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Magazine Countdown</span>
      <Btn sm v="ghost" onClick={() => onNavigate?.("schedule")}>View Schedule</Btn>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {magIssues.slice(0, 8).map(iss => {
        const ringColor = iss.pct >= 80 ? Z.go : iss.pct >= 50 ? Z.wa : Z.da;
        const daysColor = iss.daysOut <= 3 ? Z.da : iss.daysOut <= 7 ? Z.wa : Z.td;
        const r = 14; const stroke = 3; const circ = 2 * Math.PI * r; const offset = circ - (iss.pct / 100) * circ;
        return <div key={iss.id} onClick={() => { if (setIssueDetailId) setIssueDetailId(iss.id); }} style={{ display: "grid", gridTemplateColumns: "40px 1fr 60px 60px 40px", gap: 10, alignItems: "center", padding: "8px 10px", background: Z.bg, borderRadius: Ri, cursor: "pointer" }}>
          <div style={{ position: "relative", width: 34, height: 34 }}>
            <svg width="34" height="34" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="17" cy="17" r={r} fill="none" stroke={Z.bd} strokeWidth={stroke} />
              <circle cx="17" cy="17" r={r} fill="none" stroke={ringColor} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: FW.black, color: ringColor }}>{iss.pct}%</div>
          </div>
          <div>
            <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>{pn(iss.pubId)} {iss.label}</div>
            <div style={{ fontSize: FS.xs, color: Z.tm }}>{iss.adSold} ads · {fmtCurrency(iss.rev)} / {fmtCurrency(iss.goal)}</div>
          </div>
          <div style={{ textAlign: "right", fontSize: FS.sm, fontWeight: FW.heavy, color: ringColor }}>{fmtCurrency(iss.rev)}</div>
          <div style={{ textAlign: "right", fontSize: FS.xs, color: Z.td }}>{iss.date ? new Date(iss.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</div>
          <div style={{ textAlign: "right", fontSize: FS.md, fontWeight: FW.black, color: daysColor }}>{iss.daysOut}d</div>
        </div>;
      })}
    </div>
  </div>;
});

const AdProjectAlerts = memo(({ adProjectAlerts, cn, pn, onNavigate }) => {
  if (adProjectAlerts.length === 0) return null;
  return <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.da, textTransform: "uppercase", letterSpacing: 1 }}>Design Studio Alerts ({adProjectAlerts.length})</div>
    {adProjectAlerts.slice(0, 6).map(a => (
      <div key={a.id} onClick={() => onNavigate?.("design-studio")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: a.color + "12", borderLeft: `3px solid ${a.color}`, borderRadius: Ri, cursor: "pointer" }}>
        <Ic.alert size={13} color={a.color} />
        <span style={{ fontSize: FS.xs, fontWeight: FW.black, color: a.color, whiteSpace: "nowrap" }}>{a.flag}</span>
        <span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, flex: 1 }}>{cn(a.client_id)} · {pn(a.pubId)} {a.issueLabel} · {a.ad_size}</span>
      </div>
    ))}
    {adProjectAlerts.length > 6 && <div style={{ fontSize: FS.xs, color: Z.td, paddingLeft: 14 }}>+{adProjectAlerts.length - 6} more</div>}
  </div>;
});

const DeadlineAlerts = memo(({ deadlineAlerts, setIssueDetailId, onNavigate }) => {
  if (deadlineAlerts.length === 0) return null;
  return <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {deadlineAlerts.map(a => (
      <div key={a.id} onClick={() => {
        if (a.type === "ad" && setIssueDetailId) { const issId = a.id.replace("ad-", ""); setIssueDetailId(issId); }
        else if (a.type === "ed") onNavigate?.("editorial");
        else onNavigate?.("schedule");
      }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: a.color + "12", borderLeft: `3px solid ${a.color}`, borderRadius: Ri, cursor: "pointer" }}>
        <Ic.clock size={14} color={a.color} />
        <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: a.color }}>{a.days <= 0 ? "TODAY" : a.days === 1 ? "TOMORROW" : `${a.days}d`}</span>
        <span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, flex: 1 }}>{a.label}</span>
      </div>
    ))}
  </div>;
});

const DoseStrip = memo(({ closedThisMonth, topSeller, teamEdited, allDeadlinesMet, fmtCurrency }) => {
  const isDark = Z.bg === DARK.bg;
  return <>
    {closedThisMonth.count > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: Z.go + "10", borderRadius: 20 }}>
      <span style={{ fontSize: 12 }}>💰</span>
      <span style={{ fontSize: 11, fontWeight: FW.bold, color: Z.go }}>{closedThisMonth.count} deals closed MTD · {fmtCurrency(closedThisMonth.total)}</span>
    </div>}
    {topSeller && topSeller.monthlyTotal > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: Z.ac + "10", borderRadius: 20 }}>
      <span style={{ fontSize: 12 }}>⭐</span>
      <span style={{ fontSize: 11, fontWeight: FW.bold, color: Z.ac }}>{topSeller.sp.name?.split(" ")[0]}: {fmtCurrency(topSeller.monthlyTotal)} MTD</span>
    </div>}
    {teamEdited > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: ACCENT.blue + "10", borderRadius: 20 }}>
      <span style={{ fontSize: 12 }}>📝</span>
      <span style={{ fontSize: 11, fontWeight: FW.bold, color: ACCENT.blue }}>{teamEdited} stories edited this month</span>
    </div>}
    {allDeadlinesMet && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: Z.go + "10", borderRadius: 20 }}>
      <span style={{ fontSize: 12 }}>✨</span>
      <span style={{ fontSize: 11, fontWeight: FW.bold, color: Z.go }}>All deadlines met</span>
    </div>}
  </>;
});

const MorningBriefing = memo(({ briefingText, copyBriefing, onClose, glass: glassObj }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Btn sm v="secondary" onClick={copyBriefing}>Copy to Clipboard</Btn>
      <Btn sm onClick={() => { copyBriefing(); onClose(); }}>Copy & Close</Btn>
    </div>
    <pre style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: R, padding: SP.cardPad, fontSize: FS.sm, color: Z.tx, lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "'Source Sans 3', monospace", maxHeight: 500, overflowY: "auto", margin: 0 }}>{briefingText}</pre>
  </div>
));

/* ═══ END MEMOIZED SUB-COMPONENTS ═══ */

const Dashboard = ({
  pubs, stories, setStories, clients, sales, issues, proposals, team,
  invoices, payments, subscribers, dropLocations, dropLocationPubs,
  tickets, legalNotices, creativeJobs,
  onNavigate, setIssueDetailId, userName, currentUser, salespersonPubAssignments, jurisdiction,
  myPriorities, priorityHelpers, outreachCampaigns, outreachEntries, commissionGoals,
  billingLoaded, onOpenMemberProfile, onPressureChange,
}) => {
  const dialog = useDialog();

  // All publisher signal computations live in useSignalFeed so the math
  // is in one place. Salesperson-only stats stay inline below.
  const feed = useSignalFeed({
    pubs, stories, clients, sales, issues, team,
    invoices, payments, subscribers, tickets, legalNotices, creativeJobs,
    salespersonPubAssignments, commissionGoals,
    jurisdiction,
  });
  const {
    _sales, _clients, _issues, _pubs, _stories, _inv, _pay, _subs, _tickets, _legal, _jobs,
    clientMap, pubMap, cn, pn, actInfo,
    today, thisMonth,
    focusItems, deadlineAlerts, adProjectAlerts,
    teamStatus, needsDir, onTrack,
    issueProgress, issueCountdown, issueReadiness, salesToGoal,
    revenueCommand, doseWins, departmentPressure, globalPressure,
    renewalClients, urgentRenewals,
    openTickets, escalatedTickets, expiringNext30, overdueJobs,
    webViews24h, webTrend, topSiteName,
  } = feed;
  // Re-export under their old names so the existing render code Just Works
  const { adRevMTD, issueRevThisMonth, monthlyIssueCount, outstandingAR, overdueBalance, overdueInvCount, pipelineValue, pipelineCount, uninvoicedContracts } = revenueCommand;
  const overdue = overdueBalance;

  // Push newsroom heat up to the app shell so the ambient background layer
  // can tint/animate across every page, not just the dashboard.
  useEffect(() => {
    if (onPressureChange) onPressureChange(globalPressure);
  }, [globalPressure, onPressureChange]);

  const actLabel = (s) => { const a = actInfo(s?.nextAction); return a ? a.label : ""; };
  const actIcon = (s) => { const a = actInfo(s?.nextAction); return a?.icon || "→"; };
  const actVerb = (s) => { const a = actInfo(s?.nextAction); return a?.verb || "Act"; };
  const handleAct = () => { if (onNavigate) onNavigate("sales"); };

  const [dayFilter, setDayFilter] = useState("all");
  const [focusMode, setFocusMode] = useState("all");
  const [selMember, setSelMember] = useState(null);
  const [briefingModal, setBriefingModal] = useState(false);
  const [showOnTrack, setShowOnTrack] = useState(false);
  const openMemberPanel = (t) => setSelMember(t);

  const hour = new Date().getHours();
  const firstName = (userName || "").split(" ")[0] || "there";
  const greeting = hour < 12 ? `Good morning, ${firstName}` : hour < 17 ? `Good afternoon, ${firstName}` : `Good evening, ${firstName}`;
  const thisYear = today.slice(0, 4);

  // ─── Revenue Today (all cash since midnight) ───────────
  const revenueToday = useMemo(() => {
    return (_pay || []).filter(p => p.receivedAt?.startsWith(today)).reduce((s, p) => s + (p.amount || 0), 0);
  }, [_pay, today]);
  const dealsClosedToday = useMemo(() => _sales.filter(s => s.status === "Closed" && s.closedAt?.startsWith(today)).length, [_sales, today]);

  // Phase 1: Focus toggle visibility
  const FOCUS_TAGS = {
    adRevMTD: ["sales", "financials"], subRevYTD: ["financials", "admin"],
    outstandingAR: ["financials"], pipelineValue: ["sales"],
    uninvoicedContracts: ["financials", "sales"],
  };
  const showInFocus = (tags) => focusMode === "all" || (tags || []).includes(focusMode);

  // Salesperson check (needed before issueProgress → myGoals → myRevStats)
  const isSalesperson = currentUser && ["Sales Manager", "Salesperson"].includes(currentUser.role);
  const isPublisher = !currentUser?.role || ["Publisher", "Owner"].includes(currentUser.role);
  const isAdmin = currentUser?.permissions?.includes?.("admin") || currentUser?.role === "Editor-in-Chief";
  const isTeamMember = !isSalesperson && !isPublisher && !isAdmin;

  // Today's action items for salesperson cockpit
  const todaysActions = useMemo(() => {
    if (!isSalesperson || !currentUser?.id) return [];
    const myClients = new Set(_clients.filter(c => c.repId === currentUser.id).map(c => c.id));
    return _sales.filter(s => myClients.has(s.clientId) && s.nextAction && (s.nextActionDate <= today || !s.nextActionDate) && s.status !== "Closed" && s.status !== "Follow-up")
      .sort((a, b) => (b.amount || 0) - (a.amount || 0));
  }, [isSalesperson, currentUser, _clients, _sales, today]);

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
    const activePipeline = _sales.filter(s => myClients.has(s.clientId) && s.status !== "Closed");
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

  // ─── Briefing ───────────────────────────────────────────
  const [showWrapUp, setShowWrapUp] = useState(false);
  const generateBriefing = () => {
    const d = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const l = [`13 STARS MEDIA — DAILY BRIEFING`, d, ""];

    // Revenue
    l.push("═══ REVENUE ═══");
    l.push(`Ad Revenue MTD (closed): ${fmtCurrency(adRevMTD)}`);
    l.push(`Issue Revenue (publishing this month): ${fmtCurrency(issueRevThisMonth)}`);
    l.push(`Outstanding AR: ${fmtCurrency(outstandingAR)}${overdueInvCount > 0 ? ` (${overdueInvCount} overdue)` : ""}`);
    l.push(`Pipeline: ${fmtCurrency(pipelineValue)} (${pipelineCount} deals)`);
    if (uninvoicedContracts > 0) l.push(`Uninvoiced: ${fmtCurrency(uninvoicedContracts)}`);
    l.push("");

    // Publishing
    if (issueCountdown.length > 0) {
      l.push("═══ PUBLISHING ═══");
      issueCountdown.slice(0, 6).forEach(iss => l.push(`${pn(iss.pubId)} ${iss.label} — ${iss.daysOut}d — ${fmtCurrency(iss.rev)}/${fmtCurrency(iss.goal)} (${iss.pct}%)`));
      l.push("");
    }

    // Editorial pipeline
    const storyStatuses = {};
    _stories.forEach(s => { storyStatuses[s.status] = (storyStatuses[s.status] || 0) + 1; });
    const editStatuses = ["Draft", "Needs Editing", "Edited", "Approved", "On Page"];
    const hasEditorial = editStatuses.some(st => storyStatuses[st] > 0);
    if (hasEditorial) {
      l.push("═══ EDITORIAL ═══");
      editStatuses.forEach(st => { if (storyStatuses[st]) l.push(`${st}: ${storyStatuses[st]}`); });
      l.push("");
    }

    // Outreach campaigns
    const activeCampaigns = (outreachCampaigns || []).filter(c => c.status === "active");
    if (activeCampaigns.length > 0) {
      l.push("═══ OUTREACH ═══");
      activeCampaigns.forEach(c => {
        const entries = (outreachEntries || []).filter(e => e.campaignId === c.id);
        const contacted = entries.filter(e => !["queued", "not_contacted"].includes(e.status)).length;
        const wonBack = entries.filter(e => e.status === "won_back").length;
        l.push(`${c.name}: ${contacted}/${entries.length} contacted, ${wonBack} won back`);
      });
      l.push("");
    }

    // Subscriptions
    const activeSubs = _subs.filter(s => s.status === "active").length;
    if (activeSubs > 0 || expiringNext30 > 0) {
      l.push("═══ SUBSCRIPTIONS ═══");
      l.push(`Active: ${activeSubs}`);
      if (expiringNext30 > 0) l.push(`Expiring 30d: ${expiringNext30}`);
      l.push("");
    }

    // Priorities
    if (focusItems.length > 0) {
      l.push("═══ PRIORITIES ═══");
      focusItems.forEach((fi, i) => l.push(`${i + 1}. ${fi.title}`));
    }

    return l.join("\n");
  };
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
        const ai = actInfo(s.nextAction);
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
  const isDark = Z.bg === DARK.bg;
  const glass = { ...glassStyle(), borderRadius: R, padding: "22px 24px" };

  // ─── Status badge helper for updates ────────────────────
  const statusBadge = (status) => {
    const colors = { Approved: { bg: isDark ? "#1a3a1a" : "#dcfce7", tx: ACCENT.green }, Edited: { bg: isDark ? "#1a2a3a" : "#dbeafe", tx: ACCENT.blue }, "On Page": { bg: isDark ? "#2a1a3a" : "#ede9fe", tx: ACCENT.indigo }, "Needs Editing": { bg: isDark ? "#3a2a1a" : "#fef3c7", tx: ACCENT.amber }, Draft: { bg: isDark ? "#1a1a2a" : "#f3f4f6", tx: ACCENT.grey } };
    const c = colors[status] || colors.Draft;
    return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: Ri, fontSize: FS.xs, fontWeight: FW.bold, background: c.bg, color: c.tx, fontFamily: COND }}>{status}</span>;
  };

  // ─── Render ─────────────────────────────────────────────
  return <><div style={{ display: "flex", flexDirection: "column" }}>

    {/* FROSTED GLASS STICKY HEADER — greeting + briefing (publisher/salesperson only) */}
    {!isTeamMember && <div style={{
      position: "sticky", top: 0, zIndex: ZI.dropdown,
      padding: "48px 28px 32px",
    }}>
      {/* Blur backdrop layer */}
      <div style={{
        position: "absolute", inset: 0,
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        background: isDark ? "rgba(8,9,13,0.8)" : "rgba(244,245,247,0.85)",
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
            <Btn sm onClick={() => {
              try { localStorage.setItem("mydash-dashboard-v2", "true"); } catch (e) {}
              const url = new URL(window.location.href);
              url.searchParams.set("v", "2");
              window.location.href = url.toString();
            }}>Try V2 →</Btn>
          </div>
        </div>
      </div>
    </div>}

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

      {/* DOSE emotional feedback strip */}
      {(() => {
        const closedThisWeek = _sales.filter(s => s.status === "Closed" && s.closedAt && s.closedAt.slice(0, 10) >= new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10) && myRevStats.myClientIds?.has?.(s.clientId)).length;
        const d7ago = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
        const closedByDay = {};
        _sales.filter(s => s.status === "Closed" && s.closedAt && s.closedAt.slice(0, 10) >= d7ago).forEach(s => {
          const d = s.closedAt.slice(0, 10); closedByDay[d] = (closedByDay[d] || 0) + 1;
        });
        const hwm = Math.max(0, ...Object.values(closedByDay));
        const pipelineEmpty = myRevStats.pipelineCount === 0;
        return <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {hwm > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: Z.wa + "12", borderRadius: 20 }}>
            <span style={{ fontSize: 14 }}>🔥</span>
            <span style={{ fontSize: 12, fontWeight: FW.black, color: Z.wa }}>{hwm} deals in a day</span>
            <span style={{ fontSize: 10, color: Z.tm }}>7d best</span>
          </div>}
          {closedThisWeek > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: Z.go + "10", borderRadius: 20 }}>
            <span style={{ fontSize: 14 }}>💰</span>
            <span style={{ fontSize: 12, fontWeight: FW.bold, color: Z.go }}>{closedThisWeek} closed this week</span>
          </div>}
          {pipelineEmpty && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: ACCENT.blue + "10", borderRadius: 20 }}>
            <span style={{ fontSize: 14 }}>🎯</span>
            <span style={{ fontSize: 12, fontWeight: FW.bold, color: ACCENT.blue }}>Pipeline clear — time to prospect</span>
          </div>}
          {/* Oxytocin: designer output for your clients */}
          {(() => {
            const myClientIds = myRevStats.myClientIds || new Set();
            const myAdsDesigned = (_jobs || []).filter(j => j.status === "complete" && j.completedAt && j.completedAt.slice(0, 10) >= d7ago && myClientIds.has(j.clientId)).length;
            if (myAdsDesigned > 0) return <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: ACCENT.indigo + "10", borderRadius: 20 }}>
              <span style={{ fontSize: 14 }}>🎨</span>
              <span style={{ fontSize: 12, fontWeight: FW.bold, color: ACCENT.indigo }}>{myAdsDesigned} ad{myAdsDesigned !== 1 ? "s" : ""} designed for your clients this week</span>
            </div>;
            return null;
          })()}
        </div>;
      })()}
    </> :
    /* ═══ PUBLISHER'S COMMAND CENTER (not shown for team members) ═══ */
    !isTeamMember ? <>
    {/* ═══ STAT CARDS ═══ */}
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10 }}>
      {/* ISSUE READINESS — large card, 3 newspapers */}
      <div style={{ ...glass, padding: "16px 20px" }}>
        <div style={{ fontSize: 11, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND, marginBottom: 10 }}>Issue Readiness</div>
        <div style={{ display: "flex", gap: 12 }}>
          {issueReadiness.map(ir => {
            if (!ir.issue) return <div key={ir.pub.id} style={{ flex: 1, textAlign: "center", padding: 8 }}><div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.td }}>{ir.pub.name}</div><div style={{ fontSize: FS.xs, color: Z.td }}>No upcoming issue</div></div>;
            const dColor = ir.daysOut <= 3 ? Z.da : ir.daysOut <= 7 ? Z.wa : Z.go;
            const pctColor = ir.blended >= 91 ? Z.go : ir.blended >= 51 ? Z.wa : ir.blended >= 11 ? Z.wa : Z.da;
            const r2 = 18; const stroke2 = 4; const circ2 = 2 * Math.PI * r2; const offset2 = circ2 - (Math.min(ir.blended, 100) / 100) * circ2;
            return <div key={ir.pub.id} onClick={() => { if (setIssueDetailId && ir.issue) setIssueDetailId(ir.issue.id); }} style={{ flex: 1, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "6px 4px", borderRadius: Ri, background: Z.bg }}>
              <div style={{ position: "relative", width: 44, height: 44 }}>
                <svg width="44" height="44" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="22" cy="22" r={r2} fill="none" stroke={Z.bd} strokeWidth={stroke2} />
                  <circle cx="22" cy="22" r={r2} fill="none" stroke={pctColor} strokeWidth={stroke2} strokeLinecap="round" strokeDasharray={circ2} strokeDashoffset={offset2} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: FW.black, color: pctColor }}>{ir.blended}%</div>
              </div>
              <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, fontFamily: COND, textAlign: "center" }}>{ir.pub.name.replace(/^The /, "").split(" ").slice(0, 2).join(" ")}</div>
              <div style={{ fontSize: 11, fontWeight: FW.black, color: dColor }}>{ir.daysOut}d</div>
              <div style={{ fontSize: FS.micro, color: Z.tm }}>{ir.storyCount} stories · {ir.adCount} ads</div>
              <div style={{ fontSize: FS.micro, color: Z.tm }}>{fmtCurrency(ir.rev)} / {fmtCurrency(ir.goal)}</div>
            </div>;
          })}
        </div>
      </div>

      {/* REVENUE TODAY */}
      <div onClick={() => onNavigate?.("billing")} style={{ ...glass, padding: "14px 18px", cursor: "pointer", borderBottom: `2px solid ${Z.go}` }}>
        <div style={{ fontSize: 11, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND }}>Revenue Today</div>
        <div style={{ fontSize: 22, fontWeight: FW.black, color: Z.go, fontFamily: DISPLAY, marginTop: 4 }}>{fmtCurrency(revenueToday)}</div>
        <div style={{ fontSize: 11, color: Z.tm, fontFamily: COND, marginTop: 2 }}>{dealsClosedToday > 0 ? `${dealsClosedToday} deals closed` : "Since midnight"}</div>
      </div>

      {/* PIPELINE */}
      <div onClick={() => onNavigate?.("sales")} style={{ ...glass, padding: "14px 18px", cursor: "pointer", borderBottom: `2px solid ${Z.wa}` }}>
        <div style={{ fontSize: 11, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND }}>Pipeline</div>
        <div style={{ fontSize: 22, fontWeight: FW.black, color: Z.wa, fontFamily: DISPLAY, marginTop: 4 }}>{fmtCurrency(pipelineValue)}</div>
        <div style={{ fontSize: 11, color: Z.tm, fontFamily: COND, marginTop: 2 }}>{pipelineCount} active deals</div>
      </div>

      {/* WEB TRAFFIC */}
      <div style={{ ...glass, padding: "14px 18px", borderBottom: `2px solid ${Z.ac}` }}>
        <div style={{ fontSize: 11, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND }}>Web Traffic 24h</div>
        <div style={{ fontSize: 22, fontWeight: FW.black, color: Z.ac, fontFamily: DISPLAY, marginTop: 4 }}>{webViews24h !== null ? webViews24h.toLocaleString() : "\u2014"}</div>
        <div style={{ fontSize: 11, color: Z.tm, fontFamily: COND, marginTop: 2 }}>
          {topSiteName}{webTrend !== 0 && <span style={{ color: webTrend > 0 ? Z.go : Z.da, marginLeft: 4 }}>{webTrend > 0 ? "+" : ""}{webTrend}%</span>}
        </div>
      </div>
    </div>

    {/* FOCUS TOGGLE STRIP */}
    <div style={{ display: "flex", justifyContent: "center", gap: 4, padding: "4px 0", borderBottom: `0.5px solid ${Z.bd}30` }}>
      {[
        { key: "all", label: "All", icon: Ic.list },
        { key: "editorial", label: "Editorial", icon: Ic.edit },
        { key: "sales", label: "Sales", icon: Ic.sale },
        { key: "financials", label: "Financials", icon: Ic.invoice },
        { key: "websites", label: "Websites", icon: Ic.globe },
        { key: "admin", label: "Administrative", icon: Ic.lock },
      ].map(f => <Pill key={f.key} label={f.label} icon={f.icon} active={focusMode === f.key} onClick={() => setFocusMode(f.key)} />)}
    </div>

    {/* ═══ REVENUE COMMAND BAR — 5 stat cards (Sec 3.2) ═══
        Outstanding AR / Overdue / Uninvoiced read from the invoices array,
        which lazy-loads. Show "—" until billingLoaded so the numbers don't
        flash from 0 to their real value once the load finishes. */}
    <RevenueCommandBar glass={glass} cards={[
      { label: "Ad Revenue MTD", value: fmtCurrency(adRevMTD), color: Z.go, tags: ["sales", "financials"], onClick: () => onNavigate?.("sales") },
      { label: "Issue Revenue", value: fmtCurrency(issueRevThisMonth), color: ACCENT.blue, tags: ["sales", "financials"], sub: `${monthlyIssueCount} issues this month`, onClick: () => onNavigate?.("schedule") },
      { label: "Outstanding AR", value: billingLoaded ? fmtCurrency(outstandingAR) : "—", color: overdueInvCount > 0 ? Z.da : Z.wa, tags: ["financials"], sub: billingLoaded ? (overdueInvCount > 0 ? `${overdueInvCount} overdue` : "All current") : "Loading…", onClick: () => onNavigate?.("billing") },
      { label: "Pipeline Value", value: fmtCurrency(pipelineValue), color: Z.wa, tags: ["sales"], sub: `${pipelineCount} deals`, onClick: () => onNavigate?.("sales") },
      { label: "Uninvoiced", value: billingLoaded ? fmtCurrency(uninvoicedContracts) : "—", color: uninvoicedContracts > 0 ? Z.wa : Z.go, tags: ["financials", "sales"], sub: billingLoaded ? (uninvoicedContracts > 0 ? "Needs invoicing" : "All invoiced") : "Loading…", onClick: () => onNavigate?.("billing") },
    ].filter(c => showInFocus(c.tags))} />

    </> : null}

    {/* TWO COLUMNS — role-specific */}
    {isTeamMember ? <RoleDashboard role={currentUser?.role} currentUser={currentUser} pubs={pubs} stories={_stories} setStories={setStories} clients={_clients} sales={_sales} issues={_issues} team={team} invoices={_inv} payments={_pay} subscribers={_subs} tickets={_tickets} legalNotices={_legal} creativeJobs={_jobs} onNavigate={onNavigate} setIssueDetailId={setIssueDetailId} />
    : isSalesperson ? <>
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
    : /* ═══ PUBLISHER'S COMMAND CENTER — 3-COLUMN LAYOUT ═══ */
    <>
    {/* Publisher DOSE strip */}
    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
      {(() => {
        const closedThisMonth = _sales.filter(s => s.status === "Closed" && s.date?.startsWith(today.slice(0, 7)));
        const teamEdited = _stories.filter(s => s.status !== "Draft" && s.updatedAt?.startsWith(today.slice(0, 7))).length;
        const allDeadlinesMet = deadlineAlerts.length === 0;
        const topSeller = salesToGoal.sort((a, b) => b.monthlyTotal - a.monthlyTotal)[0];
        return <DoseStrip
          closedThisMonth={{ count: closedThisMonth.length, total: closedThisMonth.reduce((s, x) => s + (x.amount || 0), 0) }}
          topSeller={topSeller}
          teamEdited={teamEdited}
          allDeadlinesMet={allDeadlinesMet}
          fmtCurrency={fmtCurrency}
        />;
      })()}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>

      {/* ════ LEFT COLUMN ════ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* AD PROJECT ALERTS — overdue / incomplete past press */}
        <AdProjectAlerts adProjectAlerts={adProjectAlerts} cn={cn} pn={pn} onNavigate={onNavigate} />

        {/* DEADLINE ALERTS — auto-hides when empty */}
        <DeadlineAlerts deadlineAlerts={deadlineAlerts} setIssueDetailId={setIssueDetailId} onNavigate={onNavigate} />

        {/* MY DAY */}
        {showInFocus(["editorial", "sales", "admin"]) && <div style={glass}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>My Day</span>
          </div>
          <div style={{ display: "flex", gap: 3, marginBottom: 12, flexWrap: "wrap" }}>
            {[{ value: "all", label: "All", icon: Ic.list }, { value: "sales", label: "Sales", icon: Ic.sale }, { value: "editorial", label: "Editorial", icon: Ic.edit }, { value: "production", label: "Production", icon: Ic.flat }, { value: "admin", label: "Admin", icon: Ic.lock }].map(o => <Pill key={o.value} label={o.label} icon={o.icon} active={dayFilter === o.value} onClick={() => setDayFilter(o.value)} />)}
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {focusItems.filter(fi => dayFilter === "all" || fi.dept === dayFilter).map((fi, idx, arr) => <div key={fi.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: idx < arr.length - 1 ? `1px solid ${Z.bd}15` : "none" }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, marginTop: 6, flexShrink: 0, background: fi.priority <= 1 ? Z.da : fi.priority <= 2 ? Z.wa : Z.ac }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND, lineHeight: 1.35 }}>{fi.title}</div>
                {fi.sub && <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 2 }}>{fi.sub}</div>}
              </div>
              <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, background: Z.sa, padding: "2px 6px", borderRadius: Ri, textTransform: "capitalize", fontFamily: COND, flexShrink: 0 }}>{fi.dept}</span>
            </div>)}
            {focusItems.filter(fi => dayFilter === "all" || fi.dept === dayFilter).length === 0 && <div style={{ padding: 16, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>All clear</div>}
          </div>
        </div>}

        {/* ISSUE COUNTDOWN — magazines only, next 30 days */}
        {showInFocus(["editorial", "sales"]) && (() => {
          const d30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
          const magIssues = issueCountdown.filter(iss => { const pub = pubMap[iss.pubId]; return pub && pub.type !== "Newspaper" && iss.date <= d30; });
          return <IssueCountdownList magIssues={magIssues} pn={pn} setIssueDetailId={setIssueDetailId} onNavigate={onNavigate} glass={glass} />;
        })()}

        {/* SUBSCRIPTION HEALTH */}
        {showInFocus(["admin", "financials"]) && <div style={glass}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 12 }}>Subscription Health</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "Active", value: _subs.filter(s => s.status === "active").length, sub: "+8", color: Z.go },
              { label: "Expiring 30d", value: expiringNext30, color: expiringNext30 > 10 ? Z.da : Z.wa },
              { label: "Churned", value: _subs.filter(s => s.status === "cancelled").length, sub: `(${(_subs.length > 0 ? (_subs.filter(s => s.status === "cancelled").length / _subs.length * 100).toFixed(1) : 0)}%)`, color: Z.da },
              { label: "New This Month", value: _subs.filter(s => s.createdAt?.startsWith(thisMonth)).length, color: Z.go },
            ].map(s => <div key={s.label} onClick={() => onNavigate?.("circulation")} style={{ padding: "12px 14px", background: Z.bg, borderRadius: Ri, textAlign: "center", cursor: "pointer" }}>
              <div style={{ fontSize: 22, fontWeight: FW.black, color: s.color, fontFamily: DISPLAY }}>{s.value}</div>
              <div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase", fontFamily: COND }}>{s.label} {s.sub && <span style={{ color: s.color }}>{s.sub}</span>}</div>
            </div>)}
          </div>
        </div>}
      </div>

      {/* ════ CENTER COLUMN ════ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* EDITORIAL PIPELINE (Sec 3.5.1) */}
        {showInFocus(["editorial"]) && (() => {
          const STAGES = [
            { key: "Draft", color: ACCENT.amber },
            { key: "Needs Editing", color: Z.da },
            { key: "Edited", color: ACCENT.blue },
            { key: "Approved", color: Z.go },
            { key: "On Page", color: ACCENT.indigo },
          ];
          const counts = {};
          STAGES.forEach(st => { counts[st.key] = _stories.filter(s => s.status === st.key).length; });
          const maxCount = Math.max(1, ...Object.values(counts));
          const total = Object.values(counts).reduce((s, c) => s + c, 0);
          if (total === 0) return null;
          const stuckCount = _stories.filter(s => s.status === "Needs Editing" && s.updatedAt && Math.round((new Date(today) - new Date(s.updatedAt.slice(0, 10))) / 86400000) > 3).length;
          return <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Editorial Pipeline</span>
              <span style={{ fontSize: FS.sm, color: Z.tm }}>{total} stories</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {STAGES.map(st => {
                const c = counts[st.key];
                const pct = Math.round((c / maxCount) * 100);
                const isStuck = st.key === "Needs Editing" && stuckCount > 0;
                return <div key={st.key} onClick={() => onNavigate?.("editorial")} style={{ cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS.xs, color: Z.tm, marginBottom: 2 }}>
                    <span>{st.key} {isStuck && <span style={{ color: Z.da, fontWeight: FW.bold }}>{stuckCount} stuck &gt;3d</span>}</span>
                    <span style={{ fontWeight: FW.bold, color: c > 0 ? st.color : Z.td }}>{c}</span>
                  </div>
                  <div style={{ height: 6, background: Z.bd + "40", borderRadius: 3 }}>
                    <div style={{ height: 6, borderRadius: 3, background: st.color, width: `${pct}%`, transition: "width 0.3s" }} />
                  </div>
                </div>;
              })}
            </div>
          </div>;
        })()}

        {/* WEB PUBLISHING QUEUE (Sec 3.5.2) */}
        {showInFocus(["editorial", "websites"]) && (() => {
          const readyStories = _stories.filter(s => s.status === "Approved" && s.webStatus !== "published");
          if (readyStories.length === 0) return null;
          return <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Web Publishing Queue</span>
              {readyStories.length > 1 && <Btn sm v="secondary" onClick={async () => {
                if (!await dialog.confirm(`Publish all ${readyStories.length} stories to web?`)) return;
                readyStories.forEach(s => { if (setStories) setStories(prev => prev.map(x => x.id === s.id ? { ...x, webStatus: "published", publishedAt: new Date().toISOString() } : x)); });
              }}>Publish All ({readyStories.length})</Btn>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
              {readyStories.slice(0, 8).map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: Z.bg, borderRadius: Ri }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                    <div style={{ fontSize: FS.xs, color: Z.tm }}>{s.author || "—"} · {pn(s.publication)}</div>
                  </div>
                  <Btn sm onClick={() => {
                    if (setStories) setStories(prev => prev.map(x => x.id === s.id ? { ...x, webStatus: "published", publishedAt: new Date().toISOString() } : x));
                  }}>Publish</Btn>
                </div>
              ))}
            </div>
          </div>;
        })()}

        {/* SALES TO GOAL */}
        {showInFocus(["sales"]) && salesToGoal.length > 0 && <div style={glass}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 12 }}>Sales to Goal</div>
          {salesToGoal.map(stg => {
            const barColor = (pct) => pct > 100 ? ACCENT.blue : pct >= 91 ? Z.go : pct >= 51 ? Z.wa : pct >= 11 ? Z.wa : Z.da;
            return <div key={stg.sp.id} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: FS.sm, fontWeight: FW.black, color: Z.tx, fontFamily: COND, textTransform: "uppercase" }}>{stg.sp.name}</span>
                <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tx }}>{fmtCurrency(stg.monthlyTotal)} MTD</span>
              </div>
              {stg.pubRows.map(pr => {
                const c = barColor(pr.pct);
                return <div key={pr.pub.id + (pr.issue?.id || "")} onClick={() => onNavigate?.("sales")} style={{ padding: "4px 0", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS.xs, color: Z.tm, marginBottom: 2 }}>
                    <span>{pr.pub.name} {pr.issue?.label || ""}</span>
                    <span>{fmtCurrency(pr.sold)} / {fmtCurrency(pr.goal)} <span style={{ color: c, fontWeight: FW.bold }}>{pr.pct}%</span></span>
                  </div>
                  <div style={{ height: 6, background: Z.bd, borderRadius: 3 }}>
                    <div style={{ height: 6, borderRadius: 3, background: c, width: `${Math.min(pr.pct, 100)}%`, transition: "width 0.3s" }} />
                  </div>
                </div>;
              })}
              {/* Monthly total bar */}
              <div style={{ padding: "6px 0 0", borderTop: `1px solid ${Z.bd}15`, marginTop: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS.xs, color: Z.tx, fontWeight: FW.bold, marginBottom: 2 }}>
                  <span>Monthly Total</span>
                  <span>{fmtCurrency(stg.monthlyTotal)}{stg.monthlyGoal > 0 ? ` / ${fmtCurrency(stg.monthlyGoal)}` : ""} <span style={{ color: stg.monthlyGoal > 0 ? barColor(stg.monthlyPct) : Z.td }}>{stg.monthlyGoal > 0 ? `${stg.monthlyPct}%` : "No goal"}</span></span>
                </div>
                <div style={{ height: 8, background: Z.bd, borderRadius: 4 }}>
                  <div style={{ height: 8, borderRadius: 4, background: barColor(stg.monthlyPct), width: `${Math.min(stg.monthlyPct, 100)}%`, transition: "width 0.3s" }} />
                </div>
              </div>
            </div>;
          })}
        </div>}

      </div>

      {/* ════ RIGHT COLUMN ════ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* TEAM DIRECTION */}
        {showInFocus(["editorial", "sales", "admin"]) && <div style={glass}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 12 }}>Team Direction</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(team || []).filter(t => t.isActive !== false && !t.isHidden && t.role !== "Publisher").slice(0, 8).map(t => {
              const isSales = ["Sales Manager", "Salesperson"].includes(t.role);
              const isEditor = ["Editor", "Managing Editor", "Editor-in-Chief", "Writer/Reporter"].includes(t.role);
              const isAdmin = ["Office Manager", "Office Administrator"].includes(t.role);
              const myClientIds = new Set(_clients.filter(c => c.repId === t.id).map(c => c.id));
              const overdue = isSales ? _sales.filter(s => myClientIds.has(s.clientId) && s.nextActionDate && s.nextActionDate < today && s.nextAction).length : 0;
              const pipeline = isSales ? _sales.filter(s => myClientIds.has(s.clientId) && s.status !== "Closed").reduce((s, x) => s + (x.amount || 0), 0) : 0;
              const editCount = isEditor ? _stories.filter(s => ["Needs Editing", "Edited"].includes(s.status)).length : 0;
              const openTix = isAdmin ? _tickets.filter(tk => tk.status === "open").length : 0;
              const subTasks = isAdmin ? expiringNext30 : 0;
              const statusColor = overdue > 2 ? Z.da : overdue > 0 ? Z.wa : Z.go;
              const statusLabel = overdue > 2 ? `${overdue} overdue` : overdue > 0 ? `${overdue} late` : "On track";
              const hue = Math.abs([...(t.name || "")].reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)) % 360;
              const metric = isSales ? `Sales · ${overdue} overdue tasks · Pipeline ${fmtCurrency(pipeline)}` : isEditor ? `Editor · ${editCount} stories awaiting edit` : isAdmin ? `Admin · ${openTix} open tickets · ${subTasks} sub tasks` : `${t.role}`;
              return <div key={t.id} onClick={() => openMemberPanel(t)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${Z.bd}10`, cursor: "pointer" }}>
                <div style={{ width: 32, height: 32, borderRadius: R, background: `hsl(${hue}, 40%, 38%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: FW.black, color: INV.light, flexShrink: 0 }}>{ini(t.name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{t.name}</div>
                  <div style={{ fontSize: FS.xs, color: Z.tm, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{metric}</div>
                </div>
                <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: statusColor, background: statusColor + "15", padding: "2px 6px", borderRadius: Ri, whiteSpace: "nowrap" }}>{statusLabel}</span>
              </div>;
            })}
          </div>
        </div>}

        {/* MY PRIORITIES — side by side per salesperson */}
        {showInFocus(["sales"]) && (() => {
          const salespeople = (team || []).filter(t => ["Sales Manager", "Salesperson"].includes(t.role) && t.isActive !== false && !t.isHidden);
          if (salespeople.length === 0) return null;
          return <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 12 }}>MyPriorities</div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(salespeople.length, 2)}, 1fr)`, gap: 12 }}>
              {salespeople.slice(0, 2).map(sp => {
                const spPriorities = (myPriorities || []).filter(p => p.salespersonId === sp.id);
                const priorityClients = spPriorities.slice(0, 5).map(p => { const c = clientMap[p.clientId]; return c ? { ...p, name: c.name, spend: c.totalSpend || 0 } : null; }).filter(Boolean);
                return <div key={sp.id}>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tx, fontFamily: COND, marginBottom: 6, textTransform: "uppercase" }}>{sp.name.split(" ")[0]}</div>
                  {priorityClients.map(p => <div key={p.clientId} onClick={() => onNavigate?.("sales")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", cursor: "pointer", borderBottom: `1px solid ${Z.bd}08` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {p.isHighlighted && <Ic.star size={10} color={Z.wa} />}
                      <span style={{ fontSize: FS.xs, color: Z.tx }}>{p.name}</span>
                    </div>
                    <span style={{ fontSize: FS.micro, color: Z.td }}>{p.signalType || ""}</span>
                  </div>)}
                  {priorityClients.length < 5 && <div onClick={() => onNavigate?.("sales")} style={{ fontSize: FS.xs, color: Z.ac, cursor: "pointer", padding: "3px 0" }}>+ Add from signals</div>}
                </div>;
              })}
            </div>
          </div>;
        })()}

        {/* OUTREACH CAMPAIGNS */}
        {showInFocus(["sales"]) && (() => {
          const campaigns = outreachCampaigns || [];
          const entries = outreachEntries || [];
          if (campaigns.length === 0) return null;
          const totalClients = entries.length;
          const contacted = entries.filter(e => e.contacted).length;
          const wonBack = entries.filter(e => e.wonBack).length;
          const recovered = entries.filter(e => e.wonBack).reduce((s, e) => s + (e.revenue || 0), 0);
          return <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Outreach Campaigns</span>
              <span style={{ fontSize: FS.xs, color: Z.tm }}>{campaigns.filter(c => c.status === "active").length} active</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
              {[["Total", totalClients], ["Contacted", contacted], ["Won Back", wonBack], ["Recovered", fmtCurrency(recovered)]].map(([l, v]) => <div key={l} style={{ textAlign: "center", padding: "6px 4px", background: Z.bg, borderRadius: Ri }}>
                <div style={{ fontSize: FS.md, fontWeight: FW.black, color: l === "Recovered" ? Z.go : Z.tx }}>{v}</div>
                <div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase", fontFamily: COND }}>{l}</div>
              </div>)}
            </div>
            {campaigns.filter(c => c.status === "active").slice(0, 2).map(c => {
              const cEntries = entries.filter(e => e.campaignId === c.id);
              const cContacted = cEntries.filter(e => e.contacted).length;
              const cWon = cEntries.filter(e => e.wonBack).length;
              const cRev = cEntries.filter(e => e.wonBack).reduce((s, e) => s + (e.revenue || 0), 0);
              const pct = cEntries.length > 0 ? Math.round((cContacted / cEntries.length) * 100) : 0;
              return <div key={c.id} onClick={() => onNavigate?.("sales")} style={{ padding: "8px 10px", background: Z.bg, borderRadius: Ri, marginBottom: 6, cursor: "pointer" }}>
                <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{c.name}</div>
                <div style={{ fontSize: FS.xs, color: Z.tm, marginBottom: 4 }}>{(team || []).find(t => t.id === c.assignedTo)?.name || ""} · {cEntries.length} clients</div>
                <div style={{ height: 4, background: Z.bd, borderRadius: 2, marginBottom: 4 }}>
                  <div style={{ height: 4, borderRadius: 2, background: Z.ac, width: `${pct}%` }} />
                </div>
                <div style={{ display: "flex", gap: 8, fontSize: FS.xs, color: Z.tm }}><span>{cContacted} contacted</span><span>{cWon} won back</span><span style={{ color: Z.go }}>{fmtCurrency(cRev)}</span></div>
              </div>;
            })}
          </div>;
        })()}

        {/* SIGNAL SUMMARY */}
        {showInFocus(["sales"]) && <div style={glass}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 12 }}>Signal Summary</div>
          {[
            { label: "Renewals expiring <14d", color: Z.wa, clients: _clients.filter(c => c.contractEndDate && daysUntil(c.contractEndDate) <= 14 && daysUntil(c.contractEndDate) >= 0).slice(0, 3) },
            { label: "Lapsed whales ($10K+)", color: Z.da, clients: _clients.filter(c => c.status === "Lapsed" && (c.totalSpend || 0) >= 10000).slice(0, 3) },
            { label: "Churn risk", color: Z.da, clients: _clients.filter(c => c.status === "Active" && c.lastAdDate && daysUntil(c.lastAdDate) < -90).slice(0, 3) },
            { label: "Cross-sell (1-2 pubs)", color: Z.go, clients: (() => { const pubCounts = {}; _sales.filter(s => s.status === "Closed").forEach(s => { pubCounts[s.clientId] = (pubCounts[s.clientId] || new Set()).add(s.publication); }); return _clients.filter(c => pubCounts[c.id] && pubCounts[c.id].size <= 2 && pubCounts[c.id].size >= 1 && (c.totalSpend || 0) > 1000).slice(0, 3); })() },
          ].map(sig => <div key={sig.label} onClick={() => onNavigate?.("sales")} style={{ padding: "6px 0", cursor: "pointer", borderBottom: `1px solid ${Z.bd}10` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: sig.color }} />
              <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{sig.label}</span>
            </div>
            <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 2, paddingLeft: 14 }}>{sig.clients.map(c => c.name).join(", ") || "None"}</div>
          </div>)}
        </div>}
      </div>
    </div>}
    </>}
    </div>{/* end padded content wrapper */}

    {/* BRIEFING MODAL */}
    <Modal open={briefingModal} onClose={() => setBriefingModal(false)} title="Daily Briefing" width={640}>
      <MorningBriefing briefingText={generateBriefing()} copyBriefing={copyBriefing} onClose={() => setBriefingModal(false)} />
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

    {/* TEAM MEMBER SLIDE-IN — shared with DashboardV2 */}
    <TeamMemberPanel member={selMember} onClose={() => setSelMember(null)} currentUser={currentUser} onOpenProfile={onOpenMemberProfile} />
  </div></>;
};

export default memo(Dashboard);
