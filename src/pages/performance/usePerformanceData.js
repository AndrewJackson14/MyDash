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
function buildSalesMetrics({ sales, clients, team, range, teamFilter, adInquiries = [] }) {
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

  // Action items — fresh website inquiries come FIRST (highest-value
  // action: a warm lead nobody's touched yet), then reps that trip one
  // of the three thresholds, ordered by severity. The dashboard cycles
  // through these one at a time, so every struggling rep and every
  // unhandled lead gets surface time.
  const actionItems = [];

  // 1. Unhandled website inquiries — status === "new"
  const newInquiries = (adInquiries || [])
    .filter(i => i.status === "new")
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  for (const inq of newInquiries) {
    const name = inq.business_name || inq.name || "Website inquiry";
    const ageHours = inq.created_at ? Math.floor((Date.now() - new Date(inq.created_at).getTime()) / 3600000) : 0;
    const ageLabel = ageHours < 1 ? "just now" : ageHours < 24 ? `${ageHours}h ago` : `${Math.floor(ageHours / 24)}d ago`;
    actionItems.push({
      id: `inq-${inq.id}`,
      kind: "new_inquiry",
      headline: `New website lead — ${name} · ${ageLabel}`,
      // Fresh leads age fast: +10,000 base priority, +1 per hour unhandled
      // so older untouched leads bubble up even higher.
      severity: 10000 + ageHours,
      cta: "Assign to rep",
      navTo: { page: "sales", params: { tab: "Inquiries", inquiryId: inq.id } },
    });
  }
  for (const rep of perRep) {
    const reasons = [];
    if (rep.leads >= 3 && rep.leadToClose < 20) {
      reasons.push({ key: "leadClose", label: `Lead→close ${Math.round(rep.leadToClose)}%`, severity: 20 - rep.leadToClose });
    }
    // Proposals closed in the last 60 days — approximation: use sales closed
    // vs sales touched in the trailing 60-day window.
    const sixtyAgo = daysAgo(60);
    const repRecent = (sales || []).filter(s => (s.repId === rep.id || s.rep_id === rep.id) && (new Date(s.createdAt || s.created_at || s.date) >= sixtyAgo));
    const repRecentClosed = repRecent.filter(s => s.status === "Closed").length;
    if (repRecent.length >= 3) {
      const closeRate = (repRecentClosed / repRecent.length) * 100;
      if (closeRate < 50) {
        reasons.push({ key: "proposalClose60", label: `${Math.round(closeRate)}% proposals closed · last 60d`, severity: 50 - closeRate });
      }
    }
    if (reasons.length === 0) continue;
    const severity = reasons.reduce((s, r) => s + r.severity, 0);
    actionItems.push({
      id: rep.id,
      kind: "rep_flag",
      repId: rep.id,
      name: rep.name,
      primary: reasons[0].label,
      reasons,
      severity,
      headline: `${rep.name} — ${reasons.map(r => r.label).join(" · ")}`,
      cta: "Open rep profile",
      navTo: { page: "performance", params: { dept: "Sales", teamFilter: rep.id } },
    });
  }
  actionItems.sort((a, b) => b.severity - a.severity);

  // Wins — closed deals + website inquiries converted during the period.
  // Used by the Wins panel on Performance > Sales and the Monday briefing
  // callout.
  const wins = closedInRange
    .map(s => ({
      id: s.id,
      clientId: s.clientId || s.client_id,
      amount: Number(s.amount) || 0,
      closedAt: s.closedAt || s.closed_at || s.date,
      repId: s.repId || s.rep_id,
      label: (clients || []).find(c => c.id === (s.clientId || s.client_id))?.name || "Client",
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const convertedInquiries = (adInquiries || [])
    .filter(i => i.status === "converted" && inRange(i.updated_at || i.created_at, range));
  const inquiriesNew = (adInquiries || []).filter(i => i.status === "new").length;
  const inquiriesConverted = convertedInquiries.length;
  const inquiryConversionWins = convertedInquiries.length > 0
    ? [{ id: "inq-converted", label: `${convertedInquiries.length} website lead${convertedInquiries.length === 1 ? "" : "s"} signed`, sub: "This period" }]
    : [];

  // Top performer — non-action callout for when no rep is flagged
  const topRep = perRep[0] || null;

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
    actionItems,
    wins,
    inquiryConversionWins,
    inquiriesNew,
    inquiriesConverted,
    topRep,
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

  // Action items — every behind-pace story across every in-window issue,
  // ranked by severity (most negative proximityScore first). Cycling card
  // walks through one at a time, so every concurrent issue gets airtime.
  const scoredWithStory = scopeStories
    .map(story => {
      const issue = issueById.get(story.issueId || story.issue_id);
      const score = scoreItem("editorial", story, issue);
      if (!score) return null;
      return { ...score, story, issue };
    })
    .filter(Boolean);

  const actionItems = scoredWithStory
    .filter(s => !s.onTrack)
    .sort((a, b) => a.proximityScore - b.proximityScore)
    .slice(0, 20)
    .map(s => ({
      id: s.id,
      kind: "story_behind",
      title: s.story.title || "Untitled story",
      author: s.story.author || s.story.assigneeName || "Unassigned",
      issue: s.issue?.label || "",
      pubId: s.issue?.pubId || s.issue?.pub_id,
      status: s.status,
      proximityScore: Math.round(s.proximityScore),
      severity: -s.proximityScore,
      headline: `${s.story.title || "Untitled"} — ${Math.round(s.proximityScore)}pts behind · ${s.issue?.label || ""}`,
      cta: "Open story",
      navTo: { page: "editorial", params: { storyId: s.story.id } },
    }));

  // Wins — stories moved to On Page / Sent to Web during the period
  const wins = scopeStories
    .filter(s => ["On Page", "Sent to Web", "Approved"].includes(s.status))
    .slice(0, 5)
    .map(s => ({
      id: s.id,
      label: s.title || "Untitled",
      sub: `${s.author || ""} · ${issueById.get(s.issueId || s.issue_id)?.label || ""}`,
    }));

  return {
    ...aggregate,
    scored,
    stories: scopeStories,
    issuesInRange,
    perEditor,
    actionItems,
    wins,
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

  // Action items — pull the worst ads AND the worst layout stories into
  // one stream so the dashboard can cycle across both lanes. Billable-
  // threshold revisions (≥3 rounds) jump to the top regardless of proximity.
  const layoutScoredWithStory = scopeLayout
    .map(story => {
      const issue = issueById.get(story.issueId || story.issue_id);
      const score = scoreItem("editorial", story, issue);
      if (!score) return null;
      return { ...score, story, issue };
    })
    .filter(Boolean);
  const adScoredWithItem = scopeAds
    .map(ad => {
      const issue = issueById.get(ad.issueId || ad.issue_id);
      const score = scoreItem("ad", ad, issue);
      if (!score) return null;
      return { ...score, ad, issue };
    })
    .filter(Boolean);

  const layoutActions = layoutScoredWithStory
    .filter(s => !s.onTrack)
    .map(s => ({
      id: s.id,
      kind: "layout_behind",
      title: s.story.title || "Untitled",
      issue: s.issue?.label || "",
      pubId: s.issue?.pubId || s.issue?.pub_id,
      proximityScore: Math.round(s.proximityScore),
      severity: -s.proximityScore,
      headline: `${s.story.title || "Untitled"} — layout ${Math.round(s.proximityScore)}pts behind · ${s.issue?.label || ""}`,
      cta: "Open in flatplan",
      navTo: { page: "flatplan", params: { storyId: s.story.id } },
    }));

  const adActions = adScoredWithItem.map(s => {
    const revCount = s.ad.revisionCount || s.ad.revision_count || 0;
    const isBillable = revCount >= 3;
    const off = !s.onTrack;
    if (!isBillable && !off) return null;
    // Billable revisions always jump priority (+1000 severity)
    const severity = (isBillable ? 1000 : 0) + Math.max(0, -s.proximityScore);
    const headline = isBillable
      ? `${s.ad.clientName || s.ad.title || "Ad"} — round ${revCount} revisions (billable) · ${s.issue?.label || ""}`
      : `${s.ad.clientName || s.ad.title || "Ad"} — ${Math.round(s.proximityScore)}pts behind · ${s.issue?.label || ""}`;
    return {
      id: s.ad.id,
      kind: isBillable ? "ad_billable_revisions" : "ad_behind",
      title: s.ad.clientName || s.ad.title || "Ad project",
      issue: s.issue?.label || "",
      pubId: s.issue?.pubId || s.issue?.pub_id,
      revisionCount: revCount,
      proximityScore: Math.round(s.proximityScore),
      severity,
      headline,
      cta: "Open ad project",
      navTo: { page: "adprojects", params: { adId: s.ad.id } },
    };
  }).filter(Boolean);

  const actionItems = [...adActions, ...layoutActions]
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 20);

  // Wins — recently placed ads and On-Page stories
  const wins = [
    ...adScoredWithItem
      .filter(s => s.ad.status === "placed" || s.ad.status === "signed_off")
      .slice(0, 3)
      .map(s => ({ id: s.ad.id, label: s.ad.clientName || s.ad.title || "Ad", sub: `Placed · ${s.issue?.label || ""}` })),
    ...layoutScoredWithStory
      .filter(s => s.story.status === "On Page" || s.story.status === "Sent to Web")
      .slice(0, 2)
      .map(s => ({ id: s.story.id, label: s.story.title || "Story", sub: `On page · ${s.issue?.label || ""}` })),
  ];

  return {
    layout: { ...layoutAgg, items: scopeLayout },
    ads: { ...adAgg, items: scopeAds, avgRevisions, revisionTotal },
    perDesigner,
    issuesInRange,
    actionItems,
    wins,
  };
}

// ─── ADMIN ──────────────────────────────────────────────────
// Admin is a comms-first surface: the Office Administrator passes work TO
// the publisher (escalations, signoffs, flagged clients). We pull team_notes
// addressed to the publisher alongside the ticket/subscriber metrics so the
// card can cycle through "what the admin needs from you" items, not just
// raw KPIs.
async function buildAdminMetrics({ range, teamFilter, publisherId }) {
  const [ticketRes, commentRes, subsRes, notesRes] = await Promise.all([
    supabase.from("service_tickets").select("id, subject, status, assigned_to, escalated_to, first_response_at, resolved_at, created_at, client_id"),
    supabase.from("ticket_comments").select("ticket_id, author_id, is_internal, created_at").order("created_at", { ascending: true }),
    supabase.from("subscribers").select("id, status, created_at, renewal_date, expiry_date, amount_paid"),
    publisherId
      ? supabase.from("team_notes")
          .select("id, from_user, to_user, message, is_read, context_type, context_id, created_at")
          .eq("to_user", publisherId)
          .is("is_read", false)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
  ]);

  const tickets = ticketRes.data || [];
  const comments = commentRes.data || [];
  const subs = subsRes.data || [];
  const unreadNotes = notesRes.data || [];

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

  // Action items — comms-first, not metrics-first. Ordered:
  //   1. Unread team_notes addressed to the publisher (admin asks)
  //   2. Escalated tickets (tickets with escalated_to set)
  //   3. Open tickets past target (> 48h unresolved)
  // Each item links to ServiceDesk or the message thread.
  const actionItems = [];

  for (const note of unreadNotes) {
    actionItems.push({
      id: note.id,
      kind: "admin_message",
      headline: note.message?.slice(0, 120) || "New message from admin",
      severity: 1000 - (Date.now() - new Date(note.created_at).getTime()) / 86400000,
      cta: "Reply",
      navTo: { page: "messaging", params: { fromUser: note.from_user } },
    });
  }

  const escalated = tickets.filter(t => t.escalated_to && t.status !== "resolved" && t.status !== "closed");
  for (const t of escalated) {
    actionItems.push({
      id: t.id,
      kind: "escalated_ticket",
      headline: `Escalated: ${t.subject || "Service ticket"}`,
      severity: 500 + (Date.now() - new Date(t.created_at).getTime()) / 3600000,
      cta: "Open ticket",
      navTo: { page: "servicedesk", params: { ticketId: t.id } },
    });
  }

  const staleOpen = tickets.filter(t => {
    if (t.status === "resolved" || t.status === "closed") return false;
    const age = (Date.now() - new Date(t.created_at).getTime()) / 3600000;
    return age > 48;
  }).slice(0, 10);
  for (const t of staleOpen) {
    const hours = Math.round((Date.now() - new Date(t.created_at).getTime()) / 3600000);
    actionItems.push({
      id: t.id,
      kind: "stale_ticket",
      headline: `${hours}h open: ${t.subject || "Service ticket"}`,
      severity: hours,
      cta: "Open ticket",
      navTo: { page: "servicedesk", params: { ticketId: t.id } },
    });
  }

  actionItems.sort((a, b) => b.severity - a.severity);

  // Wins — tickets resolved under target + net positive subs
  const underSla = closedInRange.filter(t => {
    if (!t.resolved_at || !t.created_at) return false;
    return (new Date(t.resolved_at) - new Date(t.created_at)) / 3600000 <= 48;
  }).length;
  const wins = [];
  if (underSla > 0) wins.push({ id: "sla-cleared", label: `${underSla} tickets resolved inside 48h`, sub: "Under target" });
  if (netSubs > 0) wins.push({ id: "net-subs", label: `+${netSubs} subscribers net`, sub: `${newSubs} new, ${cancelledInRange} lost` });

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
    actionItems,
    wins,
    unreadNoteCount: unreadNotes.length,
    escalatedCount: escalated.length,
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
  adInquiries = [],
  publisherId = null,
}) {
  const range = useMemo(() => rangeForPreset(preset, customStart, customEnd), [preset, customStart, customEnd]);

  const salesMetrics = useMemo(
    () => buildSalesMetrics({ sales, clients, team, range, teamFilter, adInquiries }),
    [sales, clients, team, range, teamFilter, adInquiries]
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
    buildAdminMetrics({ range, teamFilter, publisherId })
      .then(result => { if (!cancelled) setAdminMetrics(result); })
      .catch(err => { console.error("admin metrics failed:", err); if (!cancelled) setAdminMetrics(null); })
      .finally(() => { if (!cancelled) setAdminLoading(false); });
    return () => { cancelled = true; };
  }, [range, teamFilter, publisherId]);

  // Single-source heat scores the dashboard + ambient layer can read.
  // 0 = calm, 100 = on fire. Matches the spec color thresholds inverted
  // so "100 − onTrackPct" maps big-behind = hot.
  const heatScores = useMemo(() => {
    const salesHeat = Math.max(0, Math.min(100, 100 - (salesMetrics.leadToClosePct || 0)));
    const edHeat = Math.max(0, Math.min(100, 100 - (editorialMetrics.onTrackPct || 0)));
    const layoutPct = productionMetrics.layout?.onTrackPct || 0;
    const adsPct = productionMetrics.ads?.onTrackPct || 0;
    const prodHeat = Math.max(0, Math.min(100, 100 - Math.min(layoutPct, adsPct || layoutPct || 0)));
    const adminHeatRaw = adminMetrics
      ? Math.max(
          (adminMetrics.avgFirstResponseHours || 0) > 1 ? ((adminMetrics.avgFirstResponseHours - 1) * 20) : 0,
          (adminMetrics.churnRate || 0) * 10,
          (adminMetrics.unreadNoteCount || 0) * 15,
          (adminMetrics.escalatedCount || 0) * 25
        )
      : 0;
    const adminHeat = Math.max(0, Math.min(100, adminHeatRaw));
    return { sales: salesHeat, editorial: edHeat, production: prodHeat, admin: adminHeat };
  }, [salesMetrics, editorialMetrics, productionMetrics, adminMetrics]);

  // Global pressure = weighted-max so one hot dept tints the whole room.
  const globalPressure = useMemo(() => {
    const vals = Object.values(heatScores);
    if (vals.length === 0) return 0;
    return Math.max(...vals);
  }, [heatScores]);

  return {
    range,
    sales: salesMetrics,
    editorial: editorialMetrics,
    production: productionMetrics,
    admin: adminMetrics,
    adminLoading,
    heatScores,
    globalPressure,
  };
}
