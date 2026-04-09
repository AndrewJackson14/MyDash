// ============================================================
// RoleDashboard.jsx — Role-specific team member dashboards
// Renders personalized 2-column dashboard per role (Sec 12.1-12.6)
// ============================================================
import { useState, useMemo, memo } from "react";
import { Z, DARK, COND, DISPLAY, R, Ri, SP, FS, FW, ACCENT, INV } from "../lib/theme";
import { Ic, Btn, Pill, GlassCard, GlassStat, glass as glassStyle } from "../components/ui";

const today = new Date().toISOString().slice(0, 10);
const thisMonth = today.slice(0, 7);
const fmtCurrency = (n) => "$" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
const daysUntil = (d) => d ? Math.ceil((new Date(d + "T12:00:00") - new Date()) / 86400000) : 999;
const ini = (name) => name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "??";

const RoleDashboard = memo(({
  role, currentUser, pubs, stories, setStories, clients, sales, issues,
  team, invoices, payments, subscribers, tickets, legalNotices, creativeJobs,
  onNavigate, setIssueDetailId,
}) => {
  const isDark = Z.bg === DARK.bg;
  const glass = { ...glassStyle(), borderRadius: R, padding: "22px 24px" };
  const firstName = (currentUser?.name || "").split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? `Good morning, ${firstName}` : hour < 17 ? `Good afternoon, ${firstName}` : `Good evening, ${firstName}`;

  const _stories = stories || [];
  const _sales = sales || [];
  const _clients = clients || [];
  const _tickets = tickets || [];
  const _subs = subscribers || [];
  const _legal = legalNotices || [];
  const _jobs = creativeJobs || [];
  const _issues = issues || [];

  const pn = (pid) => (pubs || []).find(p => p.id === pid)?.name || "";
  const cn = (cid) => _clients.find(c => c.id === cid)?.name || "—";

  // ─── Content Editor Dashboard (Camille) — Sec 12.2 ────
  if (["Editor", "Managing Editor", "Copy Editor", "Content Editor"].includes(role)) {
    const myQueue = _stories.filter(s => ["Needs Editing", "Draft"].includes(s.status)).sort((a, b) => (a.dueDate || "9").localeCompare(b.dueDate || "9"));
    const editedToday = _stories.filter(s => s.status === "Edited" && s.updatedAt?.startsWith(today));
    const stuckCount = myQueue.filter(s => s.updatedAt && Math.round((new Date(today) - new Date(s.updatedAt.slice(0, 10))) / 86400000) > 3).length;
    const issuesThisWeek = _issues.filter(i => i.edDeadline && daysUntil(i.edDeadline) <= 7 && daysUntil(i.edDeadline) >= 0);

    return <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 28 }}>
      <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{greeting}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <GlassStat label="My Editing Queue" value={myQueue.length} color={myQueue.length > 5 ? Z.wa : Z.go} />
        <GlassStat label="Submitted Today" value={editedToday.length} color={Z.go} />
        <GlassStat label="Stuck >3 Days" value={stuckCount} color={stuckCount > 0 ? Z.da : Z.go} />
        <GlassStat label="Issues This Week" value={issuesThisWeek.length} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>
        {/* LEFT: Queue */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={glass}>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 12 }}>My Editing Queue</div>
            {myQueue.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: Z.tm }}>Queue empty — nice work!</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 400, overflowY: "auto" }}>
              {myQueue.map(s => {
                const age = s.updatedAt ? Math.round((new Date(today) - new Date(s.updatedAt.slice(0, 10))) / 86400000) : 0;
                const urgency = age > 3 ? Z.da : s.dueDate && daysUntil(s.dueDate) <= 2 ? Z.wa : Z.tm;
                return <div key={s.id} onClick={() => onNavigate?.("stories")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: Z.bg, borderRadius: Ri, borderLeft: `3px solid ${urgency}`, cursor: "pointer" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{s.title}</div>
                    <div style={{ fontSize: FS.xs, color: Z.tm }}>{s.author || "—"} · {pn(s.publication)} · {age}d in queue</div>
                  </div>
                  <Btn sm v="secondary" onClick={(e) => { e.stopPropagation(); onNavigate?.("editorial"); }}>Edit</Btn>
                </div>;
              })}
            </div>}
          </div>
          {/* Issue Story Assignments */}
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 10 }}>Issue Assignments</div>
            {issuesThisWeek.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No editorial deadlines this week</div>
            : issuesThisWeek.map(iss => {
              const issStories = _stories.filter(s => s.issueId === iss.id || s.publication === iss.pubId);
              const edited = issStories.filter(s => !["Draft", "Needs Editing"].includes(s.status)).length;
              const pct = issStories.length > 0 ? Math.round((edited / issStories.length) * 100) : 0;
              return <div key={iss.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${Z.bd}15` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{pn(iss.pubId)} {iss.label}</div>
                  <div style={{ fontSize: FS.xs, color: Z.tm }}>{edited}/{issStories.length} edited · {daysUntil(iss.edDeadline)}d to deadline</div>
                </div>
                <div style={{ width: 60, height: 6, background: Z.bd, borderRadius: 3 }}>
                  <div style={{ height: 6, borderRadius: 3, background: pct >= 80 ? Z.go : pct >= 50 ? Z.wa : Z.da, width: `${pct}%` }} />
                </div>
              </div>;
            })}
          </div>
        </div>
        {/* RIGHT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Today's Completed</div>
            {editedToday.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No stories submitted yet today</div>
            : editedToday.map(s => <div key={s.id} style={{ fontSize: FS.sm, color: Z.tx, padding: "4px 0" }}>{s.title}</div>)}
          </div>
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Quick Links</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Btn sm v="secondary" onClick={() => onNavigate?.("stories")} style={{ justifyContent: "flex-start" }}>Story Editor</Btn>
              <Btn sm v="secondary" onClick={() => onNavigate?.("editorial")} style={{ justifyContent: "flex-start" }}>Editorial Dashboard</Btn>
            </div>
          </div>
        </div>
      </div>
    </div>;
  }

  // ─── Layout Designer Dashboard (Anthony) — Sec 12.3 ────
  if (["Graphic Designer", "Layout Designer", "Production Manager"].includes(role) && !["Ad Designer"].includes(currentUser?.title || "")) {
    const readyForPrint = _stories.filter(s => s.printStatus === "ready_for_print" || s.status === "Approved");
    const onPage = _stories.filter(s => s.printStatus === "on_page" || s.status === "On Page");
    const activeIssues = _issues.filter(i => i.date >= today && daysUntil(i.date) <= 30);

    return <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 28 }}>
      <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{greeting}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <GlassStat label="Ready for Print" value={readyForPrint.length} color={readyForPrint.length > 0 ? Z.wa : Z.go} />
        <GlassStat label="On Page" value={onPage.length} color={ACCENT.indigo} />
        <GlassStat label="Active Issues" value={activeIssues.length} />
        <GlassStat label="Print Deadlines" value={activeIssues.filter(i => i.date && daysUntil(i.date) <= 7).length} color={Z.da} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={glass}>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 12 }}>Ready for Print Queue</div>
            {readyForPrint.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: Z.tm }}>No stories waiting for layout</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 300, overflowY: "auto" }}>
              {readyForPrint.map(s => (
                <div key={s.id} onClick={() => onNavigate?.("flatplan")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: Z.bg, borderRadius: Ri, cursor: "pointer" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{s.title}</div>
                    <div style={{ fontSize: FS.xs, color: Z.tm }}>{pn(s.publication)} · {s.wordCount || "?"} words</div>
                  </div>
                  <Btn sm onClick={(e) => { e.stopPropagation(); }}>Pull to Layout</Btn>
                </div>
              ))}
            </div>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Print Schedule</div>
            {activeIssues.slice(0, 6).map(iss => {
              const d = daysUntil(iss.date);
              const c = d <= 3 ? Z.da : d <= 7 ? Z.wa : Z.td;
              return <div key={iss.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${Z.bd}15` }}>
                <span style={{ fontSize: FS.sm, color: Z.tx }}>{pn(iss.pubId)} {iss.label}</span>
                <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: c }}>{d}d</span>
              </div>;
            })}
          </div>
        </div>
      </div>
    </div>;
  }

  // ─── Office Admin Dashboard (Cami) — Sec 12.5 ────
  if (["Office Manager", "Office Administrator"].includes(role)) {
    const openTix = _tickets.filter(t => ["open", "in_progress"].includes(t.status));
    const d30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const renewalsDue = _subs.filter(s => s.status === "active" && s.renewalDate && s.renewalDate >= today && s.renewalDate <= d30);
    const recentPayments = (payments || []).filter(p => p.receivedAt && p.receivedAt >= new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)).slice(0, 5);

    // Auto-generated checklist
    const checklist = [];
    if (renewalsDue.length > 0) checklist.push({ id: "renewals", title: `${renewalsDue.length} renewal notices to send`, dept: "Subs", page: "circulation", priority: renewalsDue.length > 10 ? 1 : 2 });
    if (openTix.length > 0) checklist.push({ id: "tickets", title: `${openTix.length} open service desk ticket${openTix.length > 1 ? "s" : ""}`, dept: "Tickets", page: "servicedesk", priority: openTix.some(t => t.status === "escalated") ? 1 : 2 });
    const activeLegal = _legal.filter(n => !["published", "billed"].includes(n.status));
    if (activeLegal.length > 0) checklist.push({ id: "legal", title: `${activeLegal.length} legal notice${activeLegal.length > 1 ? "s" : ""} pending`, dept: "Legal", page: "legalnotices", priority: 2 });
    checklist.sort((a, b) => a.priority - b.priority);

    return <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 28 }}>
      <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{greeting}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <GlassStat label="Open Tickets" value={openTix.length} color={openTix.length > 0 ? Z.wa : Z.go} />
        <GlassStat label="Renewals Due" value={renewalsDue.length} color={renewalsDue.length > 5 ? Z.wa : Z.tm} />
        <GlassStat label="Active Subscribers" value={_subs.filter(s => s.status === "active").length} />
        <GlassStat label="Legal Pending" value={activeLegal.length} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={glass}>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 12 }}>Today's Checklist</div>
            {checklist.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: Z.tm }}>All clear!</div>
            : checklist.map(item => (
              <div key={item.id} onClick={() => onNavigate?.(item.page)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: Z.bg, borderRadius: Ri, cursor: "pointer", borderLeft: `3px solid ${item.priority <= 1 ? Z.da : Z.wa}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx }}>{item.title}</div>
                </div>
                <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, background: Z.sa, padding: "2px 6px", borderRadius: Ri }}>{item.dept}</span>
              </div>
            ))}
          </div>
          {/* Service desk tickets */}
          {openTix.length > 0 && <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 10 }}>Open Tickets</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
              {openTix.slice(0, 8).map(t => (
                <div key={t.id} onClick={() => onNavigate?.("servicedesk")} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", background: Z.bg, borderRadius: Ri, cursor: "pointer" }}>
                  <div style={{ fontSize: FS.sm, color: Z.tx }}>{t.subject || t.description?.slice(0, 50) || "Ticket"}</div>
                  <span style={{ fontSize: FS.xs, color: t.status === "escalated" ? Z.da : Z.tm }}>{t.status}</span>
                </div>
              ))}
            </div>
          </div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Quick Links</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Btn sm v="secondary" onClick={() => onNavigate?.("circulation")} style={{ justifyContent: "flex-start" }}>Subscriptions</Btn>
              <Btn sm v="secondary" onClick={() => onNavigate?.("servicedesk")} style={{ justifyContent: "flex-start" }}>Service Desk</Btn>
              <Btn sm v="secondary" onClick={() => onNavigate?.("legalnotices")} style={{ justifyContent: "flex-start" }}>Legal Notices</Btn>
            </div>
          </div>
          {recentPayments.length > 0 && <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Recent Payments</div>
            {recentPayments.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: FS.sm }}>
                <span style={{ color: Z.tx }}>{fmtDate(p.receivedAt)}</span>
                <span style={{ color: Z.go, fontWeight: FW.bold }}>{fmtCurrency(p.amount)}</span>
              </div>
            ))}
          </div>}
        </div>
      </div>
    </div>;
  }

  // ─── Ad Designer Dashboard (Jen) — Sec 12.4 ────
  if (role === "Ad Designer" || (role === "Graphic Designer" && currentUser?.title === "Ad Designer")) {
    const myJobs = _jobs.filter(j => !["complete", "billed"].includes(j.status)).sort((a, b) => (a.dueDate || "9").localeCompare(b.dueDate || "9"));
    const newRequests = myJobs.filter(j => j.status === "not_started");
    const inProgress = myJobs.filter(j => j.status === "in_progress");
    const proofsSent = myJobs.filter(j => j.status === "proof_sent");
    const approvedWeek = _jobs.filter(j => j.status === "complete" && j.completedAt && daysUntil(j.completedAt.slice(0, 10)) >= -7);

    return <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 28 }}>
      <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{greeting}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <GlassStat label="New Requests" value={newRequests.length} color={newRequests.length > 0 ? Z.wa : Z.go} />
        <GlassStat label="In Progress" value={inProgress.length} color={ACCENT.blue} />
        <GlassStat label="Proofs Sent" value={proofsSent.length} color={Z.wa} />
        <GlassStat label="Approved This Week" value={approvedWeek.length} color={Z.go} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>
        <div style={glass}>
          <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 12 }}>My Design Queue</div>
          {myJobs.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: Z.tm }}>No active design requests</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 400, overflowY: "auto" }}>
            {myJobs.map(j => {
              const d = j.dueDate ? daysUntil(j.dueDate) : 999;
              const c = d <= 2 && ["not_started", "in_progress"].includes(j.status) ? Z.da : d <= 5 ? Z.wa : Z.tm;
              const statusColors = { not_started: Z.td, in_progress: ACCENT.blue, proof_sent: Z.wa, revision_requested: Z.da, complete: Z.go };
              return <div key={j.id} onClick={() => onNavigate?.("adprojects")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: Z.bg, borderRadius: Ri, borderLeft: `3px solid ${c}`, cursor: "pointer" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{cn(j.clientId)} — {j.adSize || "Ad"}</div>
                  <div style={{ fontSize: FS.xs, color: Z.tm }}>{j.dueDate ? `Due ${fmtDate(j.dueDate)}` : "No deadline"}</div>
                </div>
                <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: statusColors[j.status] || Z.tm, background: (statusColors[j.status] || Z.tm) + "15", padding: "2px 8px", borderRadius: Ri }}>{j.status?.replace(/_/g, " ")}</span>
              </div>;
            })}
          </div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Deadline Calendar</div>
            {_issues.filter(i => i.adDeadline && daysUntil(i.adDeadline) >= 0 && daysUntil(i.adDeadline) <= 30).slice(0, 6).map(iss => {
              const d = daysUntil(iss.adDeadline);
              const myCount = myJobs.filter(j => j.issueId === iss.id).length;
              return <div key={iss.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${Z.bd}15` }}>
                <span style={{ fontSize: FS.sm, color: Z.tx }}>{pn(iss.pubId)} {iss.label}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {myCount > 0 && <span style={{ fontSize: FS.xs, color: Z.tm }}>{myCount} designs</span>}
                  <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: d <= 3 ? Z.da : d <= 7 ? Z.wa : Z.td }}>{d}d</span>
                </div>
              </div>;
            })}
          </div>
        </div>
      </div>
    </div>;
  }

  // ─── Fallback: generic team dashboard ────
  return <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 28 }}>
    <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{greeting}</div>
    <div style={{ padding: 40, textAlign: "center", color: Z.tm, fontSize: FS.md }}>
      Your personalized dashboard is being set up. Use the sidebar to navigate to your modules.
    </div>
  </div>;
});

RoleDashboard.displayName = "RoleDashboard";
export default RoleDashboard;
