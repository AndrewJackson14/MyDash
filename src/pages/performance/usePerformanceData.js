// ============================================================
// usePerformanceData — centralized compute for the Performance
// Review page. Takes the app's loaded datasets (passed in as
// props from Performance.jsx so we don't re-query Supabase) and
// returns shaped metrics for each department, scoped to the
// selected time window and team member.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { scoreItem, aggregateScores } from "./deadlineProximity";

const DAY_MS = 86400000;

function daysAgo(n) {
  return new Date(Date.now() - n * DAY_MS);
}

// Build a [start, end] range from a preset key. end is exclusive.
export function rangeForPreset(preset, customStart, customEnd) {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (preset === "week") {
    return { start: daysAgo(7), end: endOfToday };
  }
  if (preset === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end: endOfToday };
  }
  if (preset === "custom" && customStart && customEnd) {
    return { start: new Date(customStart), end: new Date(customEnd) };
  }
  // Default: month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start, end: endOfToday };
}

function inRange(dateLike, range) {
  if (!dateLike || !range) return false;
  const d = new Date(dateLike);
  return d >= range.start && d < range.end;
}

function priorRange(range) {
  const span = range.end - range.start;
  return { start: new Date(range.start.getTime() - span), end: range.start };
}

// ─── SALES ──────────────────────────────────────────────────
function buildSalesMetrics({ sales, clients, team, range, teamFilter }) {
  const priorPeriod = priorRange(range);

  // Scope to team member if filter is set (defaults to "all")
  const repSales = (sales || []).filter(s => teamFilter === "all" || s.repId === teamFilter || s.rep_id === teamFilter);

  const closedInRange = repSales.filter(s => s.status === "Closed" && inRange(s.closedAt || s.closed_at || s.date, range));
  const closedPrior = repSales.filter(s => s.status === "Closed" && inRange(s.closedAt || s.closed_at || s.date, priorPeriod));

  const leadsInRange = repSales.filter(s => inRange(s.createdAt || s.created_at || s.date, range));
  const leadToClosePct = leadsInRange.length > 0
    ? (closedInRange.length / leadsInRange.length) * 100
    : 0;

  // Revenue mix: existing vs new clients (new = client created < 90 days before sale close)
  const isNewClientForSale = (sale) => {
    const client = (clients || []).find(c => c.id === (sale.clientId || sale.client_id));
    if (!client) return false;
    const created = new Date(client.created_at || client.createdAt || 0);
    const closed = new Date(sale.closedAt || sale.closed_at || sale.date);
    return (closed - created) <= 90 * DAY_MS;
  };

  const existingRev = closedInRange
    .filter(s => !isNewClientForSale(s))
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const newRev = closedInRange
    .filter(s => isNewClientForSale(s))
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const totalRev = existingRev + newRev;
  const existingPct = totalRev > 0 ? (existingRev / totalRev) * 100 : 0;
  const newPct = 100 - existingPct;

  const priorRev = closedPrior.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const revenueDelta = priorRev > 0 ? ((totalRev - priorRev) / priorRev) * 100 : 0;

  // Client retention windows — % of clients with at least one closed sale
  // inside the rolling window.
  const retention = (days) => {
    const scope = (clients || []).filter(c => teamFilter === "all" || c.repId === teamFilter || c.rep_id === teamFilter);
    if (scope.length === 0) return 0;
    const since = daysAgo(days);
    const active = scope.filter(c => repSales.some(s =>
      (s.clientId === c.id || s.client_id === c.id)
      && s.status === "Closed"
      && new Date(s.closedAt || s.closed_at || s.date) >= since
    )).length;
    return (active / scope.length) * 100;
  };

  // Per-salesperson breakdown (ignores teamFilter so publisher can scan the grid)
  const salesReps = (team || []).filter(t => ["Sales Manager", "Salesperson"].includes(t.role));
  const perRep = salesReps.map(rep => {
    const repClosed = (sales || []).filter(s => (s.repId === rep.id || s.rep_id === rep.id) && s.status === "Closed" && inRange(s.closedAt || s.closed_at || s.date, range));
    const repLeads = (sales || []).filter(s => (s.repId === rep.id || s.rep_id === rep.id) && inRange(s.createdAt || s.created_at || s.date, range));
    const repRevenue = repClosed.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const leadClose = repLeads.length > 0 ? (repClosed.length / repLeads.length) * 100 : 0;
    return {
      id: rep.id,
      name: rep.name,
      closed: repClosed.length,
      leads: repLeads.length,
      leadToClose: leadClose,
      revenue: repRevenue,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  return {
    leadToClosePct,
    leadsInRange: leadsInRange.length,
    closedInRange: closedInRange.length,
    existingPct,
    newPct,
    existingRev,
    newRev,
    totalRev,
    revenueDelta,
    retention30: retention(30),
    retention60: retention(60),
    retention90: retention(90),
    perRep,
  };
}

// ─── EDITORIAL ──────────────────────────────────────────────
function buildEditorialMetrics({ stories, issues, team, range, teamFilter }) {
  // Story "status" uses the Editorial stage enum. We only score stories
  // inside an issue whose ed_deadline sits anywhere in or before range.end
  // and ispublishing forward of range.start.
  const issuesInRange = (issues || []).filter(iss => {
    const ed = iss.edDeadline || iss.ed_deadline;
    if (!ed) return false;
    const edDate = new Date(ed);
    return edDate <= range.end && edDate >= new Date(range.start.getTime() - 60 * DAY_MS);
  });
  const issueById = new Map(issuesInRange.map(i => [i.id, i]));

  const scopeStories = (stories || []).filter(s => {
    if (teamFilter !== "all") {
      if (s.assigneeId !== teamFilter && s.author !== teamFilter && s.editorId !== teamFilter) return false;
    }
    return issueById.has(s.issueId || s.issue_id);
  });

  const scored = scopeStories.map(story => {
    const issue = issueById.get(story.issueId || story.issue_id);
    return scoreItem("editorial", story, issue);
  });

  const aggregate = aggregateScores(scored);

  // Per-editor throughput — count stories that moved past Assigned in range.
  const editorialTeam = (team || []).filter(t => ["Content Editor", "Copy Editor", "Editor"].includes(t.role));
  const perEditor = editorialTeam.map(ed => {
    const owned = scopeStories.filter(s => s.editorId === ed.id || s.assigneeId === ed.id || s.author === ed.name);
    const ownedScored = owned.map(story => scoreItem("editorial", story, issueById.get(story.issueId || story.issue_id)));
    const agg = aggregateScores(ownedScored);
    return {
      id: ed.id,
      name: ed.name,
      role: ed.role,
      count: owned.length,
      onTrack: agg.onTrack || 0,
      onTrackPct: agg.onTrackPct,
      avgScore: agg.avgScore,
    };
  });

  return {
    ...aggregate,
    scored,
    stories: scopeStories,
    issuesInRange,
    perEditor,
  };
}

// ─── PRODUCTION ─────────────────────────────────────────────
function buildProductionMetrics({ stories, adProjects, issues, team, range, teamFilter }) {
  const issuesInRange = (issues || []).filter(iss => {
    const lock = iss.pagesLockedDate || iss.pages_locked_date || iss.edDeadline || iss.ed_deadline;
    if (!lock) return false;
    const lockDate = new Date(lock);
    return lockDate <= range.end && lockDate >= new Date(range.start.getTime() - 60 * DAY_MS);
  });
  const issueById = new Map(issuesInRange.map(i => [i.id, i]));

  // Layout lane = stories from Ready → On Page (editorial handoff onward)
  const layoutStatuses = new Set(["Ready", "Approved", "On Page", "Sent to Web"]);
  const layoutStories = (stories || []).filter(s => layoutStatuses.has(s.status) && issueById.has(s.issueId || s.issue_id));
  const scopeLayout = teamFilter === "all"
    ? layoutStories
    : layoutStories.filter(s => s.layoutId === teamFilter || s.designerId === teamFilter);
  const layoutScored = scopeLayout.map(story => scoreItem("editorial", story, issueById.get(story.issueId || story.issue_id)));
  const layoutAgg = aggregateScores(layoutScored);

  // Ad lane
  const scopeAds = (adProjects || []).filter(a => {
    if (!issueById.has(a.issueId || a.issue_id)) return false;
    if (teamFilter !== "all" && a.designerId !== teamFilter && a.designer_id !== teamFilter) return false;
    return true;
  });
  const adScored = scopeAds.map(ad => scoreItem("ad", ad, issueById.get(ad.issueId || ad.issue_id)));
  const adAgg = aggregateScores(adScored);

  const revisionTotal = scopeAds.reduce((s, a) => s + (a.revisionCount || a.revision_count || 0), 0);
  const avgRevisions = scopeAds.length > 0 ? revisionTotal / scopeAds.length : 0;

  // Per-designer breakdown
  const designers = (team || []).filter(t => ["Ad Designer", "Layout Designer", "Production", "Designer"].includes(t.role));
  const perDesigner = designers.map(dz => {
    const ads = (adProjects || []).filter(a => (a.designerId === dz.id || a.designer_id === dz.id) && issueById.has(a.issueId || a.issue_id));
    const scored = ads.map(ad => scoreItem("ad", ad, issueById.get(ad.issueId || ad.issue_id)));
    const agg = aggregateScores(scored);
    const revs = ads.reduce((s, a) => s + (a.revisionCount || a.revision_count || 0), 0);
    return {
      id: dz.id,
      name: dz.name,
      role: dz.role,
      count: ads.length,
      onTrackPct: agg.onTrackPct,
      avgScore: agg.avgScore,
      avgRevisions: ads.length > 0 ? revs / ads.length : 0,
    };
  });

  return {
    layout: { ...layoutAgg, items: scopeLayout },
    ads: { ...adAgg, items: scopeAds, avgRevisions, revisionTotal },
    perDesigner,
    issuesInRange,
  };
}

// ─── ADMIN ──────────────────────────────────────────────────
async function buildAdminMetrics({ range, teamFilter }) {
  // Tickets + subscribers live in service_tickets / subscribers tables.
  // Pulled live because they're not always in the app's preloaded state.
  const [ticketRes, commentRes, subsRes] = await Promise.all([
    supabase.from("service_tickets").select("id, status, assigned_to, first_response_at, resolved_at, created_at"),
    supabase.from("ticket_comments").select("ticket_id, author_id, is_internal, created_at").order("created_at", { ascending: true }),
    supabase.from("subscribers").select("id, status, created_at, renewal_date, expiry_date, amount_paid"),
  ]);

  const tickets = ticketRes.data || [];
  const comments = commentRes.data || [];
  const subs = subsRes.data || [];

  // First response: use column when set, otherwise fall back to first
  // non-internal comment's created_at.
  const firstReplyByTicket = new Map();
  for (const c of comments) {
    if (c.is_internal) continue;
    if (!firstReplyByTicket.has(c.ticket_id)) firstReplyByTicket.set(c.ticket_id, c.created_at);
  }

  const scopeTickets = tickets.filter(t => teamFilter === "all" || t.assigned_to === teamFilter);
  const openedInRange = scopeTickets.filter(t => inRange(t.created_at, range));
  const closedInRange = scopeTickets.filter(t => inRange(t.resolved_at, range));

  // First response time — for every ticket opened in range that has a
  // first response (column or comment), avg the ms diff.
  const responseDurations = [];
  for (const t of openedInRange) {
    const firstResp = t.first_response_at || firstReplyByTicket.get(t.id);
    if (!firstResp) continue;
    responseDurations.push(new Date(firstResp) - new Date(t.created_at));
  }
  const avgFirstResponseMs = responseDurations.length > 0
    ? responseDurations.reduce((s, v) => s + v, 0) / responseDurations.length
    : 0;
  const avgFirstResponseHours = avgFirstResponseMs / 3600000;

  // Resolution time
  const resolutionDurations = closedInRange
    .filter(t => t.resolved_at && t.created_at)
    .map(t => new Date(t.resolved_at) - new Date(t.created_at));
  const avgResolutionMs = resolutionDurations.length > 0
    ? resolutionDurations.reduce((s, v) => s + v, 0) / resolutionDurations.length
    : 0;
  const avgResolutionHours = avgResolutionMs / 3600000;

  const volumeCleared = closedInRange.length - openedInRange.length;

  // Subscribers
  const newSubs = subs.filter(s => inRange(s.created_at, range) && s.status === "active").length;
  const cancelledInRange = subs.filter(s =>
    s.status === "cancelled"
    && s.renewal_date
    && inRange(s.renewal_date, range)
  ).length;
  const netSubs = newSubs - cancelledInRange;

  const activeAtStart = subs.filter(s => {
    const created = new Date(s.created_at || 0);
    return created < range.start && s.status !== "cancelled";
  }).length;
  const churnRate = activeAtStart > 0 ? (cancelledInRange / activeAtStart) * 100 : 0;

  // Renewal rate — of subs with an expiry_date inside the range, how many
  // actually renewed (their renewal_date advanced past the expiry)?
  const dueRenewal = subs.filter(s => inRange(s.expiry_date, range));
  const renewed = dueRenewal.filter(s => s.status === "active" && s.renewal_date && new Date(s.renewal_date) > new Date(s.expiry_date)).length;
  const renewalRate = dueRenewal.length > 0 ? (renewed / dueRenewal.length) * 100 : 0;

  const subRevenue = subs
    .filter(s => inRange(s.created_at, range))
    .reduce((sum, s) => sum + (Number(s.amount_paid) || 0), 0);

  return {
    avgFirstResponseHours,
    avgResolutionHours,
    volumeCleared,
    ticketsOpened: openedInRange.length,
    ticketsClosed: closedInRange.length,
    newSubs,
    cancelledSubs: cancelledInRange,
    netSubs,
    churnRate,
    renewalRate,
    subRevenue,
  };
}

// ─── Entry point ────────────────────────────────────────────
export function usePerformanceData({
  preset = "month",
  customStart = null,
  customEnd = null,
  teamFilter = "all",
  sales = [],
  clients = [],
  stories = [],
  issues = [],
  adProjects = [],
  team = [],
}) {
  const range = useMemo(() => rangeForPreset(preset, customStart, customEnd), [preset, customStart, customEnd]);

  const salesMetrics = useMemo(
    () => buildSalesMetrics({ sales, clients, team, range, teamFilter }),
    [sales, clients, team, range, teamFilter]
  );

  const editorialMetrics = useMemo(
    () => buildEditorialMetrics({ stories, issues, team, range, teamFilter }),
    [stories, issues, team, range, teamFilter]
  );

  const productionMetrics = useMemo(
    () => buildProductionMetrics({ stories, adProjects, issues, team, range, teamFilter }),
    [stories, adProjects, issues, team, range, teamFilter]
  );

  const [adminMetrics, setAdminMetrics] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAdminLoading(true);
    buildAdminMetrics({ range, teamFilter })
      .then(result => { if (!cancelled) setAdminMetrics(result); })
      .catch(err => { console.error("admin metrics failed:", err); if (!cancelled) setAdminMetrics(null); })
      .finally(() => { if (!cancelled) setAdminLoading(false); });
    return () => { cancelled = true; };
  }, [range, teamFilter]);

  return {
    range,
    sales: salesMetrics,
    editorial: editorialMetrics,
    production: productionMetrics,
    admin: adminMetrics,
    adminLoading,
  };
}
