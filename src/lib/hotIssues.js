// ============================================================
// hotIssues.js — pure computation of "what's burning" per team
// member, grouped by category and sorted by heat.
//
// Heat is a 0–100 score. Higher = more urgent. Each category
// has its own formula, usually time × distance-to-target.
//
// Used by TeamMemberPanel (filtered to one member) and can be
// reused by DeptDrillIn later (aggregated across a dept).
// ============================================================

import { fmtCurrencyWhole as fmtCurrency } from "./formatters";

const DAY = 86400000;
const today = () => new Date();
const todayStr = () => today().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.floor((a.getTime() - b.getTime()) / DAY);

// Clamp 0..100
const clamp = (n) => Math.max(0, Math.min(100, n));

// Role detectors
const isSalesRole = (role) => ["Sales Manager", "Salesperson"].includes(role);
const isEditorRole = (role) => ["Editor", "Copy Editor", "Managing Editor", "Content Editor", "Editor-in-Chief", "Writer/Reporter"].includes(role);
const isDesignerRole = (role) => ["Graphic Designer", "Photo Editor", "Layout Designer", "Ad Designer", "Production Manager"].includes(role);
const isAdminRole = (role) => ["Office Manager", "Office Administrator"].includes(role);

// ── Story-stage completion percentage (time × distance math) ──
const STORY_STAGE_PCT = {
  Draft: 0,
  "Needs Editing": 0.25,
  Edited: 0.5,
  Approved: 0.75,
  "On Page": 1,
  Published: 1,
  "Sent to Web": 1,
};

// ============================================================
// computeHotIssues(member, data)
// data = {
//   sales, clients, issues, stories, invoices,
//   tickets, legalNotices, creativeJobs, proposals,
//   salesToGoal, pubs
// }
// Returns an array of categories:
//   { key, title, icon, color, items: [{ id, heat, title, sub, page, issueId?, clientId? }] }
// Items within each category are sorted heat-desc.
// Categories themselves are returned in definition order.
// ============================================================
export function computeHotIssues(member, data) {
  if (!member || !data) return [];
  const categories = [];

  if (isSalesRole(member.role)) {
    categories.push(...salesHotIssues(member, data));
  } else if (isEditorRole(member.role)) {
    categories.push(...editorialHotIssues(member, data));
  } else if (isDesignerRole(member.role)) {
    categories.push(...designerHotIssues(member, data));
  } else if (isAdminRole(member.role)) {
    categories.push(...adminHotIssues(member, data));
  }

  // Sort items within each category, filter empties
  return categories
    .map(cat => ({ ...cat, items: [...cat.items].sort((a, b) => b.heat - a.heat) }))
    .filter(cat => cat.items.length > 0);
}

// ============================================================
// Sales
// ============================================================
function salesHotIssues(member, data) {
  const { sales = [], clients = [], proposals = [], salesToGoal = [] } = data;
  const now = today();
  const nowStr = todayStr();
  const cats = [];

  const myClientIds = new Set(clients.filter(c => c.repId === member.id).map(c => c.id));
  const clientById = {};
  clients.forEach(c => { clientById[c.id] = c; });

  // 1. Aging proposals (>14 days old, not signed/declined/expired)
  const agingStatuses = new Set(["Draft", "Sent", "Under Review"]);
  const agingItems = proposals
    .filter(p => myClientIds.has(p.clientId) && agingStatuses.has(p.status) && p.date)
    .map(p => {
      const age = daysBetween(now, new Date(p.date + "T12:00:00"));
      if (age <= 14) return null;
      const client = clientById[p.clientId];
      return {
        id: `prop-${p.id}`,
        heat: clamp(((age - 14) / 14) * 60 + 40),
        title: `${client?.name || "Client"} · ${fmtCurrency(p.total || 0)}`,
        sub: `Sent ${age}d ago · ${p.status}`,
        page: "sales",
        propId: p.id,
      };
    })
    .filter(Boolean);
  cats.push({ key: "aging-prop", title: "Aging Proposals", icon: "📄", color: "#F59E0B", items: agingItems });

  // 2. Overdue next actions
  const overdueActions = sales
    .filter(s =>
      myClientIds.has(s.clientId) &&
      s.nextActionDate &&
      s.nextActionDate < nowStr &&
      !["Closed", "Follow-up"].includes(s.status)
    )
    .map(s => {
      const age = daysBetween(now, new Date(s.nextActionDate + "T12:00:00"));
      const client = clientById[s.clientId];
      const actionLabel = typeof s.nextAction === "string"
        ? s.nextAction
        : (s.nextAction?.label || "Follow up");
      return {
        id: `act-${s.id}`,
        heat: clamp((age / 7) * 80 + 20),
        title: `${actionLabel} · ${client?.name || "Client"}`,
        sub: `${age}d overdue${s.amount ? " · " + fmtCurrency(s.amount) : ""}`,
        page: "sales",
        clientId: s.clientId,
      };
    });
  cats.push({ key: "overdue-act", title: "Overdue Next Actions", icon: "⏰", color: "#EF4444", items: overdueActions });

  // 3. Stalled pipeline (>21 days in the same stage, using date as a proxy
  //    since we don't have stage-change history)
  const stalled = sales
    .filter(s =>
      myClientIds.has(s.clientId) &&
      !["Closed", "Follow-up"].includes(s.status) &&
      s.date
    )
    .map(s => {
      const age = daysBetween(now, new Date(s.date + "T12:00:00"));
      if (age <= 21) return null;
      const client = clientById[s.clientId];
      return {
        id: `stall-${s.id}`,
        heat: clamp(((age - 21) / 21) * 50 + 30),
        title: `${client?.name || "Client"} · ${s.status}`,
        sub: `${age}d in pipeline${s.amount ? " · " + fmtCurrency(s.amount) : ""}`,
        page: "sales",
        clientId: s.clientId,
      };
    })
    .filter(Boolean);
  cats.push({ key: "stalled", title: "Stalled Deals", icon: "🧊", color: "#6366F1", items: stalled });

  // 4. Renewal window (contract ending within 30 days)
  const renewalItems = clients
    .filter(c => c.repId === member.id && c.contractEndDate)
    .map(c => {
      const daysUntil = Math.ceil((new Date(c.contractEndDate + "T12:00:00").getTime() - now.getTime()) / DAY);
      if (daysUntil < 0 || daysUntil > 30) return null;
      return {
        id: `renew-${c.id}`,
        heat: clamp(100 - (daysUntil * 3.0)),
        title: c.name,
        sub: `Contract ends in ${daysUntil}d`,
        page: "sales",
        clientId: c.id,
      };
    })
    .filter(Boolean);
  cats.push({ key: "renewal", title: "Renewal Window", icon: "🔄", color: "#F59E0B", items: renewalItems });

  // 5. Lapsed whales — $10k+ per year in the last 12 months,
  //    no activity in 90+ days
  const yearAgo = new Date(now.getTime() - 365 * DAY);
  const annualByClient = {};
  sales.forEach(s => {
    if (s.status !== "Closed" || !s.date) return;
    const d = new Date(s.date + "T12:00:00");
    if (d < yearAgo) return;
    annualByClient[s.clientId] = (annualByClient[s.clientId] || 0) + (s.amount || 0);
  });
  const whales = clients
    .filter(c => c.repId === member.id)
    .map(c => {
      const annual = annualByClient[c.id] || 0;
      if (annual < 10000) return null;
      const lastAd = c.lastAdDate ? new Date(c.lastAdDate + "T12:00:00") : null;
      const daysSinceLast = lastAd ? daysBetween(now, lastAd) : 9999;
      if (daysSinceLast <= 90) return null;
      return {
        id: `whale-${c.id}`,
        heat: clamp(40 + Math.min(60, (daysSinceLast - 90) / 3)),
        title: c.name,
        sub: `${fmtCurrency(annual)}/yr · ${daysSinceLast < 9999 ? daysSinceLast + "d since last ad" : "no recent ads"}`,
        page: "sales",
        clientId: c.id,
      };
    })
    .filter(Boolean);
  cats.push({ key: "whale", title: "Lapsed Whales ($10K+/yr)", icon: "🐋", color: "#3B82F6", items: whales });

  // 6. Month-to-goal gap — TWO calculations:
  //    (a) sales CLOSED this month  (when the deal is booked)
  //    (b) sales PUBLISHING this month (when the issue actually runs)
  const mySalesToGoal = salesToGoal.find(x => x.sp?.id === member.id);
  const thisMonth = nowStr.slice(0, 7);
  const monthIssueIds = new Set((data.issues || []).filter(i => i.date?.startsWith(thisMonth)).map(i => i.id));
  const publishingTotal = sales
    .filter(s =>
      myClientIds.has(s.clientId) &&
      s.status === "Closed" &&
      s.issueId &&
      monthIssueIds.has(s.issueId)
    )
    .reduce((acc, s) => acc + (s.amount || 0), 0);
  const goalItems = [];
  if (mySalesToGoal && mySalesToGoal.monthlyGoal > 0) {
    const closedPct = mySalesToGoal.monthlyPct || 0;
    const closedGap = mySalesToGoal.monthlyGoal - (mySalesToGoal.monthlyTotal || 0);
    if (closedGap > 0) {
      goalItems.push({
        id: "goal-closed",
        heat: clamp(100 - closedPct),
        title: "Closed this month",
        sub: `${fmtCurrency(mySalesToGoal.monthlyTotal || 0)} of ${fmtCurrency(mySalesToGoal.monthlyGoal)} (${closedPct}%)`,
        page: "sales",
      });
    }
    const pubPct = mySalesToGoal.monthlyGoal > 0 ? Math.round((publishingTotal / mySalesToGoal.monthlyGoal) * 100) : 0;
    const pubGap = mySalesToGoal.monthlyGoal - publishingTotal;
    if (pubGap > 0) {
      goalItems.push({
        id: "goal-pub",
        heat: clamp(100 - pubPct),
        title: "Publishing this month",
        sub: `${fmtCurrency(publishingTotal)} of ${fmtCurrency(mySalesToGoal.monthlyGoal)} (${pubPct}%)`,
        page: "sales",
      });
    }
  }
  cats.push({ key: "goal", title: "Month-to-Goal Gap", icon: "🎯", color: "#F59E0B", items: goalItems });

  return cats;
}

// ============================================================
// Editorial
// ============================================================
function editorialHotIssues(member, data) {
  const { stories = [], issues = [] } = data;
  const now = today();
  const nowStr = todayStr();
  const cats = [];

  // Structured ownership match: author, editor, or current assignee.
  // The string-match-on-author fallback only kicks in for legacy rows
  // where none of the id fields were populated.
  const myStories = stories.filter(s => {
    if (s.authorId === member.id) return true;
    if (s.editorId === member.id) return true;
    if (s.assignedTo === member.id) return true;
    // Legacy fallback: first-name substring in the free-text author
    const first = (member.name || "").split(" ")[0];
    if (!first) return false;
    if (s.authorId || s.editorId || s.assignedTo) return false; // skip if we have structured data but no match
    return (s.author || "").includes(first);
  });

  const issueById = {};
  issues.forEach(i => { issueById[i.id] = i; });

  // 1. Stuck in "Needs Editing" > 3 days
  const stuckEditing = myStories
    .filter(s => s.status === "Needs Editing")
    .map(s => {
      const ref = s.updatedAt || s.dueDate || s.createdAt;
      if (!ref) return null;
      const age = daysBetween(now, new Date(ref));
      if (age <= 3) return null;
      return {
        id: `stuck-${s.id}`,
        heat: clamp(((age - 3) / 4) * 60 + 30),
        title: s.title || "Untitled",
        sub: `${age}d in Needs Editing`,
        page: "editorial",
        storyId: s.id,
      };
    })
    .filter(Boolean);
  cats.push({ key: "stuck-edit", title: "Stuck in Editing", icon: "🧊", color: "#F59E0B", items: stuckEditing });

  // 2. Past due stories (personal dueDate exceeded)
  const pastDue = myStories
    .filter(s => s.dueDate && s.dueDate < nowStr && !["Published", "Sent to Web", "On Page"].includes(s.status))
    .map(s => {
      const age = daysBetween(now, new Date(s.dueDate + "T12:00:00"));
      return {
        id: `due-${s.id}`,
        heat: clamp((age / 5) * 70 + 30),
        title: s.title || "Untitled",
        sub: `${age}d past due · ${s.status}`,
        page: "editorial",
        storyId: s.id,
      };
    });
  cats.push({ key: "past-due", title: "Past Due", icon: "⏰", color: "#EF4444", items: pastDue });

  // 3. Time × distance at risk — stories for an upcoming issue where
  //    stage completion is < (1 - slack), so we're behind schedule.
  //    Formula: expected pct by now = (total stage days - days left) / total stage days
  //    If actual stage pct < expected pct, it's at risk. Heat = gap × 100.
  const atRisk = myStories
    .filter(s => s.issueId && issueById[s.issueId] && issueById[s.issueId].date)
    .map(s => {
      const iss = issueById[s.issueId];
      const issueDate = new Date(iss.date + "T12:00:00");
      const daysLeft = daysBetween(issueDate, now);
      if (daysLeft <= 0 || daysLeft > 21) return null;
      const stagePct = STORY_STAGE_PCT[s.status] ?? 0;
      if (stagePct >= 1) return null;
      // Assume a 21-day typical runway. Expected completion by now:
      const expected = Math.max(0, Math.min(1, 1 - (daysLeft / 21)));
      const gap = expected - stagePct;
      if (gap <= 0.05) return null; // not at risk
      return {
        id: `risk-${s.id}`,
        heat: clamp(gap * 100 + 30),
        title: s.title || "Untitled",
        sub: `${s.status} · ${daysLeft}d to issue`,
        page: "editorial",
        storyId: s.id,
        issueId: s.issueId,
      };
    })
    .filter(Boolean);
  cats.push({ key: "at-risk", title: "Time/Distance at Risk", icon: "⚠️", color: "#F59E0B", items: atRisk });

  // 4. Approved waiting for placement
  const waitingPlacement = myStories
    .filter(s => s.status === "Approved")
    .map(s => {
      const iss = issueById[s.issueId];
      const issLabel = iss ? (iss.label || iss.date) : "";
      return {
        id: `place-${s.id}`,
        heat: 45,
        title: s.title || "Untitled",
        sub: `Approved · ready for ${issLabel || "layout"}`,
        page: "flatplan",
        storyId: s.id,
      };
    });
  cats.push({ key: "place", title: "Ready for Page Placement", icon: "📄", color: "#3B82F6", items: waitingPlacement });

  // 5. Ideas queue depth — if Draft count is thin, surface as hot
  //    (missing assignments = future pipeline risk)
  const draftCount = myStories.filter(s => s.status === "Draft").length;
  if (draftCount < 3) {
    cats.push({
      key: "queue",
      title: "Thin Story Queue",
      icon: "💡",
      color: "#6366F1",
      items: [{
        id: "queue-thin",
        heat: clamp(60 + (3 - draftCount) * 15),
        title: `Only ${draftCount} draft${draftCount === 1 ? "" : "s"} in queue`,
        sub: "Assign more stories to stay ahead",
        page: "editorial",
      }],
    });
  }

  return cats;
}

// ============================================================
// Designer
// ============================================================
function designerHotIssues(member, data) {
  const { sales = [], issues = [], creativeJobs = [], stories = [] } = data;
  const now = today();
  const nowStr = todayStr();
  const cats = [];

  const issueById = {};
  issues.forEach(i => { issueById[i.id] = i; });

  // 1. Ad projects overdue — sales with an issue whose adDeadline has passed
  //    and the sale isn't approved/signed off yet. We proxy "ad project"
  //    with any sale that has an issueId + upcoming press date.
  const overdueAds = sales
    .filter(s => {
      if (s.status !== "Closed") return false;
      const iss = issueById[s.issueId];
      if (!iss || !iss.adDeadline) return false;
      return iss.adDeadline < nowStr && iss.date >= nowStr;
    })
    .map(s => {
      const iss = issueById[s.issueId];
      const age = daysBetween(now, new Date(iss.adDeadline + "T12:00:00"));
      return {
        id: `adover-${s.id}`,
        heat: clamp((age / 3) * 70 + 30),
        title: `${s.size || "Ad"} · ${iss.label || ""}`,
        sub: `Ad deadline ${age}d ago · press in ${daysBetween(new Date(iss.date + "T12:00:00"), now)}d`,
        page: "flatplan",
        issueId: s.issueId,
      };
    });
  cats.push({ key: "ad-over", title: "Ad Projects Overdue", icon: "🔥", color: "#EF4444", items: overdueAds });

  // 2. High-revision / stuck creative jobs
  const stuckJobs = creativeJobs
    .filter(j => (j.revisionCount || 0) >= 3 && !["complete", "billed"].includes(j.status))
    .map(j => ({
      id: `rev-${j.id}`,
      heat: clamp(40 + (j.revisionCount || 0) * 15),
      title: j.title || j.description || "Creative job",
      sub: `${j.revisionCount || 0} revisions · ${j.status}`,
      page: "creativejobs",
    }));
  cats.push({ key: "rev-loop", title: "Stuck in Revisions", icon: "🔁", color: "#F59E0B", items: stuckJobs });

  // 3. Approved stories waiting to flow into layout
  const readyToLayout = stories
    .filter(s => s.status === "Approved")
    .map(s => {
      const iss = issueById[s.issueId];
      return {
        id: `lay-${s.id}`,
        heat: 50,
        title: s.title || "Untitled",
        sub: `Approved · ${iss?.label || "layout pending"}`,
        page: "flatplan",
        storyId: s.id,
      };
    });
  cats.push({ key: "to-lay", title: "Ready for InDesign", icon: "📐", color: "#3B82F6", items: readyToLayout });

  // 5. Press day countdown — upcoming issues where press is soon
  const pressSoon = issues
    .filter(i => i.date >= nowStr && i.sentToPressAt == null)
    .map(i => {
      const daysLeft = Math.ceil((new Date(i.date + "T12:00:00").getTime() - now.getTime()) / DAY);
      if (daysLeft > 10) return null;
      return {
        id: `press-${i.id}`,
        heat: clamp(100 - (daysLeft * 10)),
        title: i.label || "Issue",
        sub: `${daysLeft}d to press`,
        page: "schedule",
        issueId: i.id,
      };
    })
    .filter(Boolean);
  cats.push({ key: "press", title: "Press Day Countdown", icon: "📰", color: "#F59E0B", items: pressSoon });

  return cats;
}

// ============================================================
// Office Admin
// ============================================================
function adminHotIssues(member, data) {
  const { invoices = [], tickets = [], legalNotices = [] } = data;
  const now = today();
  const nowStr = todayStr();
  const cats = [];

  // 1. Overdue invoices > 30 days
  const overdueInv = invoices
    .filter(i => {
      if (!["sent", "overdue", "partially_paid"].includes(i.status)) return false;
      if (!i.dueDate || i.dueDate >= nowStr) return false;
      const age = daysBetween(now, new Date(i.dueDate + "T12:00:00"));
      return age > 30;
    })
    .map(i => {
      const age = daysBetween(now, new Date(i.dueDate + "T12:00:00"));
      return {
        id: `inv-${i.id}`,
        heat: clamp(((age - 30) / 30) * 60 + 40),
        title: `Invoice #${i.invoiceNumber || i.id.slice(0, 8)}`,
        sub: `${age}d overdue · ${fmtCurrency(i.balanceDue || 0)}`,
        page: "billing",
        invoiceId: i.id,
      };
    });
  cats.push({ key: "inv-over", title: "Overdue Invoices", icon: "💰", color: "#EF4444", items: overdueInv });

  // 2. Open service tickets > 5 days
  const oldTickets = tickets
    .filter(t => t.status === "open" && t.createdAt)
    .map(t => {
      const age = daysBetween(now, new Date(t.createdAt));
      if (age <= 5) return null;
      return {
        id: `tix-${t.id}`,
        heat: clamp(((age - 5) / 10) * 70 + 30),
        title: t.subject || "Ticket",
        sub: `${age}d open · ${t.category || ""}`,
        page: "servicedesk",
        ticketId: t.id,
      };
    })
    .filter(Boolean);
  cats.push({ key: "tix-old", title: "Aging Tickets", icon: "🎫", color: "#F59E0B", items: oldTickets });

  // 3. Escalated tickets (high priority)
  const escalated = tickets
    .filter(t => t.status === "escalated" || (t.priority && t.priority >= 2))
    .map(t => ({
      id: `esc-${t.id}`,
      heat: 85,
      title: t.subject || "Escalated ticket",
      sub: t.category || "",
      page: "servicedesk",
      ticketId: t.id,
    }));
  cats.push({ key: "tix-esc", title: "Escalated Tickets", icon: "🚨", color: "#EF4444", items: escalated });

  // 4. Pending legal notice proofs
  const proofLegal = legalNotices
    .filter(n => n.status === "proofing")
    .map(n => ({
      id: `legal-${n.id}`,
      heat: 60,
      title: n.organization || n.noticeType || "Legal notice",
      sub: `${n.status} · ${fmtCurrency(n.totalAmount || 0)}`,
      page: "legalnotices",
      legalId: n.id,
    }));
  cats.push({ key: "legal-proof", title: "Legal Proofs Waiting", icon: "⚖️", color: "#F59E0B", items: proofLegal });

  return cats;
}
