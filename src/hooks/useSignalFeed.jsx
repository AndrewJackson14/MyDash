import { useState, useEffect, useMemo } from "react";
import { supabase, isOnline } from "../lib/supabase";
import { Z, ACCENT } from "../lib/theme";
import { ACTION_TYPES, THRESHOLDS, MS_PER_DAY } from "../constants";
import { daysUntil } from "../lib/formatters";

// ============================================================
// useSignalFeed — publisher-scoped signal aggregation for the
// Dashboard (and soon DashboardV2). Every downstream card, cloud
// tile, or ambient glow should pull its data from here so the
// math lives in one place and both dashboards agree.
//
// Pure-ish: the only side effects are the two Supabase fetches
// that don't live in useAppData yet (ad_projects alerts and the
// 24h web-traffic rollup). All other values are memoized on the
// props passed in.
// ============================================================

// Editorial percent-complete by stage. Single-source model: Ready is
// editorial done regardless of where it goes next (web/print). A story
// that's already sent_to_web or sent_to_print is 1.0 regardless of
// status — the caller handles that case.
const STORY_STAGE_PCT = { Draft: 0, Edit: 0.5, Ready: 1, Archived: 0 };

const actInfo = (act) => {
  if (!act) return null;
  if (typeof act === "string") return { type: "task", label: act, icon: "✓", color: Z.tm };
  return { ...(ACTION_TYPES[act.type] || ACTION_TYPES.task), ...act };
};

export function useSignalFeed({
  pubs, stories, clients, sales, issues, team,
  invoices, payments, subscribers, tickets, legalNotices, creativeJobs,
  salespersonPubAssignments, commissionGoals,
  jurisdiction,
}) {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);

  // ── Normalized arrays ────────────────────────────────────
  const _sales = sales || [];
  const _clients = clients || [];
  const _issues = jurisdiction?.myIssues || issues || [];
  const _pubs = jurisdiction?.myPubs || pubs || [];
  const _stories = jurisdiction?.myStories || stories || [];
  const _inv = invoices || [];
  const _pay = payments || [];
  const _subs = subscribers || [];
  const _tickets = tickets || [];
  const _legal = legalNotices || [];
  const _jobs = creativeJobs || [];

  // ── Lookup maps & helpers ────────────────────────────────
  const clientMap = useMemo(() => { const m = {}; _clients.forEach(c => { m[c.id] = c; }); return m; }, [_clients]);
  const pubMap = useMemo(() => { const m = {}; _pubs.forEach(p => { m[p.id] = p; }); return m; }, [_pubs]);
  const cn = (id) => clientMap[id]?.name || "—";
  const pn = (id) => pubMap[id]?.name || "";

  // ── Revenue command bar ──────────────────────────────────
  const adRevMTD = useMemo(() => _sales.filter(s => s.status === "Closed" && s.date?.startsWith(thisMonth)).reduce((s, x) => s + (x.amount || 0), 0), [_sales, thisMonth]);
  const issueRevThisMonth = useMemo(() => {
    const monthIssueIds = new Set(_issues.filter(i => i.date?.startsWith(thisMonth)).map(i => i.id));
    return _sales.filter(s => s.status === "Closed" && s.issueId && monthIssueIds.has(s.issueId)).reduce((s, x) => s + (x.amount || 0), 0);
  }, [_sales, _issues, thisMonth]);
  const monthlyIssueCount = useMemo(() => _issues.filter(i => i.date?.startsWith(thisMonth)).length, [_issues, thisMonth]);
  const outstandingAR = useMemo(() => _inv.filter(i => ["overdue", "sent"].includes(i.status)).reduce((s, i) => s + (i.balanceDue || 0), 0), [_inv]);
  // Admin dashboard is noisy when every 1-day-late invoice lights up red, so
  // the "overdue" signal shown on the dashboard is filtered to invoices 60+
  // days past due. Billing.jsx still shows all overdue invoices on the
  // Invoices tab — this stricter signal only drives the admin dashboard
  // stat card, the focus-feed item, and the admin heat score.
  const sixtyDaysAgo = useMemo(() => {
    const d = new Date(Date.now() - 60 * MS_PER_DAY);
    return d.toISOString().slice(0, 10);
  }, [today]);
  const isDashboardOverdue = (i) => {
    if (!i.dueDate) return false;
    if (i.dueDate >= sixtyDaysAgo) return false;
    return i.status === "overdue" || i.status === "sent" || i.status === "partially_paid";
  };
  const overdueInvCount = useMemo(() => _inv.filter(isDashboardOverdue).length, [_inv, sixtyDaysAgo]);
  const overdueBalance = useMemo(() => _inv.filter(isDashboardOverdue).reduce((s, i) => s + (i.balanceDue || 0), 0), [_inv, sixtyDaysAgo]);
  // Pipeline = every non-closed deal (includes Follow-up). Only
  // Closed is subtracted from the total.
  const pipelineValue = useMemo(() => _sales.filter(s => s.status !== "Closed").reduce((s, x) => s + (x.amount || 0), 0), [_sales]);
  const pipelineCount = useMemo(() => _sales.filter(s => s.status !== "Closed").length, [_sales]);
  // Dashboard "Uninvoiced" card: rolling +/- 30 day window from today,
  // matching the Billing-module-wide rule. Older un-invoiced sales don't
  // bleed into the dashboard number; future sales beyond 30 days out
  // aren't ready to bill yet. The Client Profile page is the only place
  // that shows the full uninvoiced list for a client.
  const uninvoicedContracts = useMemo(() => {
    const invSaleIds = new Set();
    _inv.forEach(inv => inv.lines?.forEach(l => { if (l.saleId) invSaleIds.add(l.saleId); }));
    const past30 = new Date(Date.now() - 30 * MS_PER_DAY).toISOString().slice(0, 10);
    const future30 = new Date(Date.now() + 30 * MS_PER_DAY).toISOString().slice(0, 10);
    return _sales
      .filter(s => s.status === "Closed" && !invSaleIds.has(s.id) && s.date && s.date >= past30 && s.date <= future30)
      .reduce((s, x) => s + (x.amount || 0), 0);
  }, [_sales, _inv]);

  const revenueCommand = { adRevMTD, issueRevThisMonth, monthlyIssueCount, outstandingAR, overdueBalance, overdueInvCount, pipelineValue, pipelineCount, uninvoicedContracts };

  // ── Deadline alerts (next 48 hours) ──────────────────────
  const deadlineAlerts = useMemo(() => {
    const cutoff48h = new Date(Date.now() + 48 * 3600000).toISOString().slice(0, 10);
    const alerts = [];
    _issues.forEach(iss => {
      if (iss.adDeadline && iss.adDeadline >= today && iss.adDeadline <= cutoff48h) {
        const d = daysUntil(iss.adDeadline);
        alerts.push({ id: "ad-" + iss.id, type: "ad", label: `Ad Deadline — ${pn(iss.pubId)} ${iss.label}`, date: iss.adDeadline, days: d, color: d <= 1 ? Z.da : Z.wa, pubId: iss.pubId, issueId: iss.id, pubName: pn(iss.pubId), issueLabel: iss.label });
      }
      if (iss.edDeadline && iss.edDeadline >= today && iss.edDeadline <= cutoff48h) {
        const d = daysUntil(iss.edDeadline);
        const editingCount = _stories.filter(s => s.publication === iss.pubId && ["Draft", "Edit"].includes(s.status)).length;
        alerts.push({ id: "ed-" + iss.id, type: "ed", label: `Ed Deadline — ${pn(iss.pubId)} ${iss.label}${editingCount > 0 ? ` (${editingCount} still editing)` : ""}`, date: iss.edDeadline, days: d, color: d <= 1 ? Z.da : Z.wa, pubId: iss.pubId, issueId: iss.id, pubName: pn(iss.pubId), issueLabel: iss.label });
      }
    });
    return alerts.sort((a, b) => a.date.localeCompare(b.date));
  }, [_issues, _stories, today, pubMap]);

  // ── Issue countdown (next 10 issues, with rev-vs-goal) ──
  const issueCountdown = useMemo(() => {
    return _issues.filter(i => i.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10).map(iss => {
      const issSales = _sales.filter(s => s.issueId === iss.id && s.status === "Closed");
      const rev = issSales.reduce((s, x) => s + (x.amount || 0), 0);
      const goal = iss.revenueGoal || (pubMap[iss.pubId]?.defaultRevenueGoal || 0);
      const pct = goal > 0 ? Math.min(100, Math.round((rev / goal) * 100)) : 0;
      const d = daysUntil(iss.date);
      return { ...iss, rev, goal, pct, daysOut: d, adSold: issSales.length };
    });
  }, [_issues, _sales, today, pubMap]);

  // ── Weekly-newspaper issue readiness ─────────────────────
  const weeklyNewspapers = useMemo(() => _pubs.filter(p => p.frequency === "Weekly"), [_pubs]);
  const issueReadiness = useMemo(() => weeklyNewspapers.map(pub => {
    const nextIssue = _issues.filter(i => i.pubId === pub.id && i.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!nextIssue) return { pub, issue: null, daysOut: 999, editorialPct: 0, adPct: 0, blended: 0 };
    // "Assigned" = tied to the next issue, OR belonging to this pub and
    // not yet live on either channel. Under the new model, "not live"
    // means no sent_to_web and no sent_to_print.
    const assignedStories = _stories.filter(s => s.issueId === nextIssue.id || (s.publication === pub.id && !(s.sent_to_web || s.sentToWeb) && !(s.sent_to_print || s.sentToPrint)));
    const editorialPct = assignedStories.length > 0 ? Math.round(assignedStories.reduce((s, st) => s + (STORY_STAGE_PCT[st.status] || 0), 0) / assignedStories.length * 100) : 0;
    const issSales = _sales.filter(s => s.issueId === nextIssue.id && s.status === "Closed");
    const totalAds = issSales.length;
    const adPct = totalAds > 0 ? 100 : 0;
    const blended = assignedStories.length > 0 ? editorialPct : adPct;
    const d = daysUntil(nextIssue.date);
    const rev = issSales.reduce((s, x) => s + (x.amount || 0), 0);
    const goal = nextIssue.revenueGoal || (pub.defaultRevenueGoal || 0);
    return { pub, issue: nextIssue, daysOut: d, editorialPct, adPct, blended, storyCount: assignedStories.length, adCount: totalAds, rev, goal };
  }), [weeklyNewspapers, _issues, _stories, _sales, today]);

  // ── Issue progress (all pubs, next issue each) ───────────
  const issueProgress = useMemo(() => {
    const pubAvgs = {};
    const issueAdCounts = {};
    _sales.forEach(s => {
      if (s.status !== "Closed" || !s.issueId || !s.publication) return;
      if (!issueAdCounts[s.publication]) issueAdCounts[s.publication] = {};
      if (!issueAdCounts[s.publication][s.issueId]) issueAdCounts[s.publication][s.issueId] = { count: 0, rev: 0 };
      issueAdCounts[s.publication][s.issueId].count++;
      issueAdCounts[s.publication][s.issueId].rev += s.amount || 0;
    });
    Object.entries(issueAdCounts).forEach(([pubId, iss]) => {
      const vals = Object.values(iss);
      if (vals.length > 0) {
        pubAvgs[pubId] = {
          avgAds: Math.round(vals.reduce((s, v) => s + v.count, 0) / vals.length),
          avgRev: Math.round(vals.reduce((s, v) => s + v.rev, 0) / vals.length),
        };
      }
    });
    const nextIssueByPub = {};
    _issues.filter(i => i.date >= today).sort((a, b) => a.date.localeCompare(b.date)).forEach(i => {
      if (!nextIssueByPub[i.pubId]) nextIssueByPub[i.pubId] = i;
    });
    return _pubs.map(pub => {
      const ni = nextIssueByPub[pub.id];
      if (!ni) return null;
      const avg = pubAvgs[pub.id] || { avgAds: 20, avgRev: 5000 };
      const goal = ni.revenueGoal != null ? ni.revenueGoal : (pub.defaultRevenueGoal > 0 ? pub.defaultRevenueGoal : avg.avgRev);
      const goalSource = ni.revenueGoal != null ? "issue" : (pub.defaultRevenueGoal > 0 ? "pub" : "avg");
      const soldAds = _sales.filter(s => s.issueId === ni.id && s.status === "Closed").length;
      const issueRev = _sales.filter(s => s.issueId === ni.id && s.status === "Closed").reduce((s, x) => s + (x.amount || 0), 0);
      const adPct = avg.avgAds > 0 ? Math.min(100, Math.round((soldAds / avg.avgAds) * 100)) : 0;
      const revPct = goal > 0 ? Math.min(100, Math.round((issueRev / goal) * 100)) : 0;
      const daysOut = Math.ceil((new Date(ni.date + "T12:00:00") - new Date()) / 86400000);
      return { pub, issue: ni, soldAds, avgAds: avg.avgAds, issueRev, goal, goalSource, avgRev: avg.avgRev, adPct, revPct, daysOut };
    }).filter(Boolean).sort((a, b) => a.issue.date.localeCompare(b.issue.date));
  }, [_pubs, _issues, _sales, today]);

  // ── Sales-to-goal per salesperson ────────────────────────
  const salesToGoal = useMemo(() => {
    const salespeople = (team || []).filter(t => ["Sales Manager", "Salesperson"].includes(t.role) && t.isActive !== false && !t.isHidden);
    const assignments = salespersonPubAssignments || [];
    const goals = commissionGoals || [];
    const d7 = new Date(Date.now() + 7 * MS_PER_DAY).toISOString().slice(0, 10);
    const d30 = new Date(Date.now() + 30 * MS_PER_DAY).toISOString().slice(0, 10);
    return salespeople.map(sp => {
      const spAssignments = assignments.filter(a => a.salespersonId === sp.id && a.isActive);
      const myClientIds = new Set(_clients.filter(c => c.repId === sp.id).map(c => c.id));
      const mySalesThisMonth = _sales.filter(s => myClientIds.has(s.clientId) && s.status === "Closed" && s.date?.startsWith(thisMonth));
      const monthlyTotal = mySalesThisMonth.reduce((s, x) => s + (x.amount || 0), 0);
      const pubRows = [];
      spAssignments.forEach(a => {
        const pub = _pubs.find(p => p.id === a.publicationId);
        if (!pub) return;
        const isWeekly = pub.frequency === "Weekly" || pub.frequency === "Bi-Weekly";
        const cutoff = isWeekly ? d7 : d30;
        const nextIssue = _issues.filter(i => i.pubId === a.publicationId && i.date >= today && i.date <= cutoff).sort((x, y) => x.date.localeCompare(y.date))[0];
        if (!nextIssue) return;
        const issueGoalObj = goals.find(g => g.issueId === nextIssue.id);
        const issueGoal = issueGoalObj ? issueGoalObj.goal : (pub.defaultRevenueGoal || 0);
        const spGoal = Math.round(issueGoal * (a.percentage / 100));
        const spSold = _sales.filter(s => myClientIds.has(s.clientId) && s.issueId === nextIssue.id && s.status === "Closed").reduce((s2, x) => s2 + (x.amount || 0), 0);
        const pct = spGoal > 0 ? Math.round((spSold / spGoal) * 100) : 0;
        pubRows.push({ pub, issue: nextIssue, goal: spGoal, sold: spSold, pct, isWeekly });
      });
      const monthlyGoal = spAssignments.reduce((s, a) => {
        const pub = _pubs.find(p => p.id === a.publicationId);
        const monthIssues = _issues.filter(i => i.pubId === a.publicationId && i.date?.startsWith(thisMonth));
        return s + monthIssues.reduce((s2, iss) => {
          const g = goals.find(g2 => g2.issueId === iss.id);
          return s2 + Math.round((g ? g.goal : (pub?.defaultRevenueGoal || 0)) * (a.percentage / 100));
        }, 0);
      }, 0);
      const monthlyPct = monthlyGoal > 0 ? Math.round((monthlyTotal / monthlyGoal) * 100) : 0;
      return { sp, pubRows, monthlyTotal, monthlyGoal, monthlyPct };
    });
  }, [team, salespersonPubAssignments, commissionGoals, _issues, _sales, _clients, _pubs, thisMonth, today]);

  // ── Renewals & urgents ───────────────────────────────────
  const renewalClients = useMemo(() => _clients.filter(c => c.status === "Renewal"), [_clients]);
  const urgentRenewals = useMemo(() => renewalClients.filter(c => c.contractEndDate && c.contractEndDate <= new Date(Date.now() + THRESHOLDS.renewalUrgentDays * MS_PER_DAY).toISOString().slice(0, 10)), [renewalClients]);

  // ── Counts used by focus items ───────────────────────────
  const openTickets = _tickets.filter(t => t.status === "open").length;
  const escalatedTickets = _tickets.filter(t => t.status === "escalated").length;
  const expiringNext30 = _subs.filter(s => s.status === "active" && s.renewalDate && s.renewalDate <= new Date(Date.now() + 30 * MS_PER_DAY).toISOString().slice(0, 10) && s.renewalDate >= today).length;
  const overdueJobs = _jobs.filter(j => j.dueDate && j.dueDate < today && !["complete", "billed"].includes(j.status)).length;
  const pendingProofLegal = _legal.filter(n => n.status === "proofing").length;
  const activeLegal = _legal.filter(n => !["published", "billed"].includes(n.status)).length;

  // ── Focus items (the unified publisher signal feed) ──────
  const focusItems = useMemo(() => {
    const items = [];
    const nearestIssue = _issues.filter(i => i.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (nearestIssue) {
      const np = pubMap[nearestIssue.pubId];
      const ns = Math.floor((np?.pageCount || 24) * 0.4);
      const sold = _sales.filter(s => s.issueId === nearestIssue.id && s.status === "Closed").length;
      const ne = _stories.filter(s => s.publication === nearestIssue.pubId && ["Draft", "Edit"].includes(s.status)).length;
      const os = Math.max(0, ns - sold);
      items.push({ id: "fi-pub", title: `${np?.name} ${nearestIssue.label} — ${daysUntil(nearestIssue.date)}d to publish`, sub: `${os > 0 ? os + " open ad slots" : "Ads full"}${ne > 0 ? " · " + ne + " stories in editing" : ""}`, action: "Review", issueId: nearestIssue.id, dept: "production", priority: 1 });
    }
    const topDeal = _sales.filter(s => s.nextAction && !["Closed", "Follow-up"].includes(s.status)).sort((a, b) => (b.amount || 0) - (a.amount || 0))[0];
    if (topDeal) {
      const ai = actInfo(topDeal.nextAction);
      items.push({ id: "fi-deal", title: `${ai?.label || "Follow up"} — ${cn(topDeal.clientId)}`, sub: `${(topDeal.amount || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} deal value`, action: "Go to deal", page: "sales", dept: "sales", priority: 2 });
    }
    // "Review needed" = anything sitting in Edit. Under the single-source
    // model there's no distinction between 'Needs Editing' vs 'Edited';
    // an editor owns it until it moves to Ready.
    const reviewStory = _stories.filter(s => s.status === "Edit").sort((a, b) => (a.dueDate || "9").localeCompare(b.dueDate || "9"))[0];
    if (reviewStory) items.push({ id: "fi-story", title: `Review "${reviewStory.title}"`, sub: `${reviewStory.author} · ${pn(reviewStory.publication)} · ${reviewStory.status}`, action: "Editorial", page: "editorial", dept: "editorial", priority: 3 });
    if (overdueBalance > 0) {
      items.push({ id: "fi-overdue", title: `${overdueInvCount} invoice${overdueInvCount > 1 ? "s" : ""} 60+ days past due — ${overdueBalance.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}`, sub: "Escalate collections", action: "Billing", page: "billing", dept: "admin", priority: 2 });
    }
    if (escalatedTickets > 0) items.push({ id: "fi-esc", title: `${escalatedTickets} escalated ticket${escalatedTickets > 1 ? "s" : ""}`, sub: "Escalated by office manager", action: "Service Desk", page: "servicedesk", dept: "admin", priority: 2 });
    if (overdueJobs > 0) items.push({ id: "fi-jobs", title: `${overdueJobs} creative job${overdueJobs > 1 ? "s" : ""} past deadline`, sub: "Client deliverables at risk", action: "Creative", page: "creativejobs", dept: "production", priority: 2 });
    if (urgentRenewals.length > 0) items.push({ id: "fi-renewals", title: `${urgentRenewals.length} renewal${urgentRenewals.length > 1 ? "s" : ""} expiring within 2 weeks`, sub: urgentRenewals.slice(0, 3).map(c => c.name).join(", "), action: "Renewals", page: "sales", dept: "sales", priority: 1 });
    return items;
  }, [_issues, _sales, _stories, _inv, urgentRenewals, escalatedTickets, overdueJobs, overdueBalance, today, pubMap, clientMap]);

  // ── Team status / Team direction ─────────────────────────
  const teamStatus = useMemo(() => (team || []).filter(t => t.role !== "Publisher").map(t => {
    const isSales = ["Sales Manager", "Salesperson"].includes(t.role);
    const myClientIds = new Set(_clients.filter(c => c.repId === t.id).map(c => c.id));
    const md = isSales ? _sales.filter(s => myClientIds.has(s.clientId) && !["Closed", "Follow-up"].includes(s.status)) : [];
    // In-progress stories for this editor = anything they own that
    // isn't yet fully shipped to every channel it targets. Under the
    // new model "still in play" means not both flags set (if it's a
    // dual-channel story) or not the one flag set (if single-channel).
    // Simplest honest rule: status != 'Ready' OR neither flag is true.
    const ms = _stories.filter(s => s.author === t.name && (s.status !== "Ready" || !((s.sent_to_web || s.sentToWeb) || (s.sent_to_print || s.sentToPrint))));
    const od = md.filter(s => s.nextActionDate && s.nextActionDate < today);
    const ss = ms.filter(s => s.dueDate && s.dueDate < today);
    const needsDirection = od.length > 0 || ss.length > 0;
    const overdueCount = od.length + ss.length;
    let oldestDetail = "";
    if (isSales && od.length > 0) {
      const o = od.sort((a, b) => (a.nextActionDate || "").localeCompare(b.nextActionDate || ""))[0];
      const d = Math.ceil((new Date() - new Date(o.nextActionDate + "T12:00:00")) / 86400000);
      const ai = actInfo(o.nextAction);
      oldestDetail = `Oldest: ${(ai?.label || "action").toLowerCase()} for ${cn(o.clientId)} (${d}d)`;
    } else if (ss.length > 0) {
      const o = ss.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))[0];
      const d = Math.ceil((new Date() - new Date(o.dueDate + "T12:00:00")) / 86400000);
      oldestDetail = `Oldest: "${o.title}" (${d}d overdue)`;
    }
    const status = isSales
      ? (od.length > 0 ? `${od.length} actions overdue` : md.length > 0 ? `${md.length} active deals` : "No active deals")
      : (ss.length > 0 ? `${ss.length} stories past due` : ms.length > 0 ? `${ms.length} stories in progress` : "No assignments");
    return { ...t, needsDirection, status, isSales, overdueCount, oldestDetail };
  }), [team, _sales, _stories, _clients, today, clientMap]);

  const needsDir = useMemo(() => teamStatus.filter(t => t.needsDirection).sort((a, b) => b.overdueCount - a.overdueCount), [teamStatus]);
  const onTrack = useMemo(() => teamStatus.filter(t => !t.needsDirection), [teamStatus]);

  // ── DOSE wins strip ──────────────────────────────────────
  const doseWins = useMemo(() => {
    const closedThisMonthArr = _sales.filter(s => s.status === "Closed" && s.date?.startsWith(thisMonth));
    const topSeller = [...salesToGoal].sort((a, b) => b.monthlyTotal - a.monthlyTotal)[0];
    const teamEdited = _stories.filter(s => s.status !== "Draft" && s.updatedAt?.startsWith(thisMonth)).length;
    const allDeadlinesMet = deadlineAlerts.length === 0;
    return {
      closedThisMonth: { count: closedThisMonthArr.length, total: closedThisMonthArr.reduce((s, x) => s + (x.amount || 0), 0) },
      topSeller,
      teamEdited,
      allDeadlinesMet,
    };
  }, [_sales, salesToGoal, _stories, deadlineAlerts, thisMonth]);

  // ── Per-department pressure (new for V2 dashboard) ───────
  // heat: 0 (calm blue) → 100 (hot red). Count = how many items need attention.
  const departmentPressure = useMemo(() => {
    const deptItems = { sales: [], editorial: [], production: [], admin: [] };
    focusItems.forEach(fi => { if (deptItems[fi.dept]) deptItems[fi.dept].push(fi); });

    // Sales: how far below goal is the average salesperson?
    const salesGapAvg = salesToGoal.length > 0 ? salesToGoal.reduce((s, sp) => s + Math.max(0, 100 - (sp.monthlyPct || 0)), 0) / salesToGoal.length : 0;
    const salesHeat = Math.min(100, Math.round(salesGapAvg + deptItems.sales.filter(i => i.priority <= 1).length * 15));

    // Editorial: stories stuck + deadline pressure
    const stuckStories = _stories.filter(s => ["Draft", "Edit"].includes(s.status)).length;
    const editDeadlines = deadlineAlerts.filter(a => a.type === "ed").length;
    const edHeat = Math.min(100, stuckStories * 5 + editDeadlines * 20);

    // Production: overdue ad projects + jobs past deadline + imminent press dates
    const prodItems = deptItems.production.length;
    const adDl = deadlineAlerts.filter(a => a.type === "ad").length;
    const prodHeat = Math.min(100, prodItems * 20 + adDl * 15 + overdueJobs * 10);

    // Admin: open + escalated tickets + overdue invoices
    const adminItems = deptItems.admin.length;
    const adminHeat = Math.min(100, openTickets * 8 + escalatedTickets * 20 + overdueInvCount * 5 + adminItems * 10);

    return {
      sales: { heat: salesHeat, count: deptItems.sales.length, items: deptItems.sales, pipelineValue, pctToGoal: salesToGoal.length > 0 ? Math.round(salesToGoal.reduce((s, sp) => s + (sp.monthlyPct || 0), 0) / salesToGoal.length) : 0 },
      editorial: { heat: edHeat, count: deptItems.editorial.length + stuckStories, items: deptItems.editorial, stuckStories, editDeadlines },
      production: { heat: prodHeat, count: prodItems + adDl, items: deptItems.production, adDeadlines: adDl, overdueJobs },
      admin: { heat: adminHeat, count: adminItems + openTickets + overdueInvCount, items: deptItems.admin, openTickets, escalatedTickets, overdueInvCount, expiringNext30 },
    };
  }, [focusItems, salesToGoal, _stories, deadlineAlerts, overdueJobs, openTickets, escalatedTickets, overdueInvCount, pipelineValue, expiringNext30]);

  // ── Global pressure (0–100) for ambient glow state ──────
  // Weighted toward the HOTTEST department so one dept on fire visibly tints
  // the room, even if the other three are calm. Pure average would dilute
  // three red sales cards down to blue just because editorial is quiet.
  // Also adds a direct "red card" count bonus — every priority-1 focus item
  // adds +4 on top, so the user sees the background respond 1:1 to the
  // red cards they're looking at.
  const globalPressure = useMemo(() => {
    const d = departmentPressure;
    const heats = [d.sales.heat, d.editorial.heat, d.production.heat, d.admin.heat];
    const maxHeat = Math.max(...heats);
    const avgHeat = heats.reduce((s, h) => s + h, 0) / heats.length;
    const redCards = (focusItems || []).filter(fi => fi.priority <= 1).length;
    const raw = maxHeat * 0.7 + avgHeat * 0.3 + redCards * 4;
    return Math.min(100, Math.round(raw));
  }, [departmentPressure, focusItems]);

  // ── Ad project alerts (overdue / past-press) ─────────────
  const [adProjectAlerts, setAdProjectAlerts] = useState([]);
  useEffect(() => {
    if (!isOnline()) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("ad_projects")
        .select("id, status, client_id, publication_id, issue_id, ad_size")
        .not("status", "in", '("approved","signed_off","placed")');
      if (cancelled || !data) return;
      const issueMap = {};
      _issues.forEach(i => { issueMap[i.id] = i; });
      const alerts = [];
      for (const p of data) {
        const iss = issueMap[p.issue_id];
        if (!iss) continue;
        const adDl = iss.adDeadline ? Math.ceil((new Date(iss.adDeadline + "T12:00:00") - new Date()) / 86400000) : 99;
        if (iss.date < today && !["approved", "signed_off", "placed"].includes(p.status)) {
          alerts.push({ ...p, flag: "INCOMPLETE — PAST PRESS", color: Z.da, issueLabel: iss.label, pubId: iss.pubId, issueId: iss.id });
        } else if (adDl <= 0) {
          alerts.push({ ...p, flag: "OVERDUE", color: Z.wa, issueLabel: iss.label, pubId: iss.pubId, issueId: iss.id });
        }
      }
      if (!cancelled) setAdProjectAlerts(alerts);
    })();
    return () => { cancelled = true; };
  }, [_issues, today]);

  // ── Web traffic (24h rollup from page_views) ─────────────
  const [webViews24h, setWebViews24h] = useState(null);
  const [webViewsPrev24h, setWebViewsPrev24h] = useState(null);
  const [topSiteName, setTopSiteName] = useState("");
  useEffect(() => {
    if (!isOnline()) return;
    const now = new Date();
    const h24ago = new Date(now - 24 * 3600000).toISOString();
    const h48ago = new Date(now - 48 * 3600000).toISOString();
    supabase.from("page_views").select("site_id", { count: "exact", head: false })
      .gte("created_at", h24ago).limit(50000).then(({ data }) => {
        if (!data) return;
        const bysite = {}; data.forEach(r => { bysite[r.site_id] = (bysite[r.site_id] || 0) + 1; });
        const top = Object.entries(bysite).sort((a, b) => b[1] - a[1])[0];
        if (top) { setWebViews24h(top[1]); setTopSiteName(pn(top[0]) || top[0]); }
        else setWebViews24h(0);
      });
    supabase.from("page_views").select("id", { count: "exact", head: true })
      .gte("created_at", h48ago).lt("created_at", h24ago).then(({ count }) => setWebViewsPrev24h(count || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const webTrend = webViews24h !== null && webViewsPrev24h ? Math.round(((webViews24h - webViewsPrev24h) / Math.max(1, webViewsPrev24h)) * 100) : 0;

  return {
    // data refs + helpers
    _sales, _clients, _issues, _pubs, _stories, _inv, _pay, _subs, _tickets, _legal, _jobs,
    clientMap, pubMap, cn, pn, actInfo,
    today, thisMonth,
    // signals
    focusItems,
    deadlineAlerts,
    adProjectAlerts,
    teamStatus, needsDir, onTrack,
    issueProgress,
    issueCountdown,
    issueReadiness,
    salesToGoal,
    revenueCommand,
    doseWins,
    departmentPressure,
    globalPressure,
    // ambient stats
    renewalClients, urgentRenewals,
    openTickets, escalatedTickets, expiringNext30, overdueJobs, pendingProofLegal, activeLegal,
    // web
    webViews24h, webViewsPrev24h, webTrend, topSiteName,
  };
}
