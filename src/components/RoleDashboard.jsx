// ============================================================
// RoleDashboard.jsx — Role-specific team member dashboards
// Renders personalized 2-column dashboard per role (Sec 12.1-12.6)
// ============================================================
import { useState, useEffect, useMemo, memo } from "react";
import { Z, DARK, COND, DISPLAY, R, Ri, SP, FS, FW, ACCENT, INV } from "../lib/theme";
import { Ic, Btn, Pill, GlassCard, GlassStat, glass as glassStyle } from "../components/ui";
import { supabase, isOnline } from "../lib/supabase";

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

  // ─── Ad Designer state (must be top-level, not inside if block) ──
  const [adProjects, setAdProjects] = useState([]);
  const [adFilter, setAdFilter] = useState("all");
  const [upcomingRange, setUpcomingRange] = useState("30d");
  const [pinging, setPinging] = useState(null);

  // ─── Direction from Publisher (Sec 12.0.3) ─────────────
  const [directionNotes, setDirectionNotes] = useState([]);
  const [replyText, setReplyText] = useState("");
  useEffect(() => {
    if (!currentUser?.authId || !isOnline()) return;
    supabase.from("team_notes").select("*")
      .eq("to_user", currentUser.authId)
      .order("created_at", { ascending: false }).limit(10)
      .then(({ data }) => setDirectionNotes(data || []));
  }, [currentUser?.authId]);

  const markNoteRead = async (noteId) => {
    await supabase.from("team_notes").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", noteId);
    setDirectionNotes(prev => prev.map(n => n.id === noteId ? { ...n, is_read: true } : n));
  };

  const replyToNote = async (note) => {
    if (!replyText.trim()) return;
    const { data } = await supabase.from("team_notes").insert({
      from_user: currentUser.authId, to_user: note.from_user,
      message: replyText.trim(), context_type: "general",
    }).select().single();
    if (data) setDirectionNotes(prev => [data, ...prev]);
    setReplyText("");
  };

  const DirectionCard = () => {
    const unread = directionNotes.filter(n => !n.is_read && n.from_user !== currentUser?.authId);
    return <div style={glass}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Direction from Publisher</span>
        {unread.length > 0 && <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.ac, background: Z.ac + "15", padding: "2px 8px", borderRadius: Ri }}>{unread.length} new</span>}
      </div>
      {directionNotes.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No notes from publisher</div>
      : <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
        {directionNotes.filter(n => n.from_user !== currentUser?.authId).slice(0, 5).map(n => (
          <div key={n.id} onClick={() => { if (!n.is_read) markNoteRead(n.id); }} style={{ padding: "8px 10px", borderRadius: Ri, background: Z.bg, borderLeft: `2px solid ${n.is_read ? Z.bd : Z.ac}`, cursor: n.is_read ? "default" : "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ fontSize: FS.xs, color: n.is_read ? Z.td : Z.ac, fontWeight: FW.bold }}>{n.context_type === "task" ? "Task" : "Note"}</span>
              <span style={{ fontSize: FS.micro, color: Z.td }}>{fmtDate(n.created_at?.slice(0, 10))}</span>
            </div>
            <div style={{ fontSize: FS.sm, color: Z.tx, whiteSpace: "pre-wrap" }}>{n.message}</div>
          </div>
        ))}
      </div>}
      {/* Reply input */}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input value={replyText} onChange={e => setReplyText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && replyText.trim() && directionNotes[0]) replyToNote(directionNotes[0]); }}
          placeholder="Reply..." style={{ flex: 1, padding: "6px 10px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, outline: "none", fontFamily: "inherit" }} />
        <Btn sm onClick={() => { if (directionNotes[0]) replyToNote(directionNotes[0]); }} disabled={!replyText.trim()}>Reply</Btn>
      </div>
    </div>;
  };

  // ─── Content Editor Dashboard (Camille) — Sec 12.2 ────
  if (["Editor", "Managing Editor", "Copy Editor", "Content Editor"].includes(role)) {
    const myQueue = _stories.filter(s => ["Needs Editing", "Draft"].includes(s.status)).sort((a, b) => (a.dueDate || "9").localeCompare(b.dueDate || "9"));
    const editedToday = _stories.filter(s => s.status === "Edited" && s.updatedAt?.startsWith(today));
    const stuckCount = myQueue.filter(s => s.updatedAt && Math.round((new Date(today) - new Date(s.updatedAt.slice(0, 10))) / 86400000) > 3).length;
    const issuesThisWeek = _issues.filter(i => i.edDeadline && daysUntil(i.edDeadline) <= 7 && daysUntil(i.edDeadline) >= 0);

    // DOSE metrics
    const thisMonthStr = today.slice(0, 7);
    const editedThisMonth = _stories.filter(s => s.status !== "Draft" && s.updatedAt?.startsWith(thisMonthStr)).length;
    const recentEdited = _stories.filter(s => ["Edited", "Approved", "On Page", "Published"].includes(s.status)).slice(0, 30);
    const firstPassRate = recentEdited.length > 0 ? Math.round(recentEdited.filter(s => s.status !== "Needs Editing").length / recentEdited.length * 100) : 100;
    const publishedRecent = _stories.filter(s => s.status === "Published" && s.publishedAt).sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""))[0];
    const d7ago = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const last7d = _stories.filter(s => s.status === "Edited" && s.updatedAt && s.updatedAt.slice(0, 10) >= d7ago);
    const byDay = {}; last7d.forEach(s => { const d = s.updatedAt.slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; });
    const hwm = Math.max(0, ...Object.values(byDay));
    const queueEmpty = myQueue.length === 0;

    return <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 28 }}>
      {/* DOSE Eye Candy */}
      <div style={{ ...glassStyle(), borderRadius: R, padding: "28px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{greeting}</div>
          {hwm > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: Z.ac + "12", borderRadius: 20 }}>
            <span style={{ fontSize: 16 }}>📝</span>
            <div><div style={{ fontSize: 14, fontWeight: FW.black, color: Z.ac }}>{hwm} in a day</div><div style={{ fontSize: 10, color: Z.tm }}>7-day best</div></div>
          </div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.go, fontFamily: DISPLAY }}>{editedThisMonth}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Edited This Month</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: firstPassRate >= 80 ? Z.go : Z.wa, fontFamily: DISPLAY }}>{firstPassRate}%</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>First-Pass Rate</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: editedToday.length > 0 ? Z.go : Z.tm, fontFamily: DISPLAY }}>{editedToday.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Edited Today</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: myQueue.length > 5 ? Z.wa : Z.tx, fontFamily: DISPLAY }}>{myQueue.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>In Queue</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {publishedRecent && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: Z.bg, borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>📰</span>
            <span style={{ fontSize: FS.sm, color: Z.tx }}><span style={{ fontWeight: FW.bold }}>Your edit of "{publishedRecent.title?.slice(0, 40)}"</span> <span style={{ color: Z.tm }}>published</span></span>
          </div>}
          {queueEmpty && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: Z.go + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>✨</span>
            <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.go }}>Queue cleared — nice work!</span>
          </div>}
          {!queueEmpty && myQueue.length <= 3 && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: ACCENT.blue + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>🎯</span>
            <span style={{ fontSize: FS.sm, color: ACCENT.blue, fontWeight: FW.bold }}>{myQueue.length} to go — you've got this</span>
          </div>}
        </div>
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
          <DirectionCard />
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

    // DOSE metrics
    const thisMonthStr = today.slice(0, 7);
    const pagesThisMonth = onPage.length; // approximate
    const sentToPress = _issues.filter(i => i.sentToPressAt && i.sentToPressAt.startsWith(thisMonthStr)).length;
    const nearDeadlines = activeIssues.filter(i => i.date && daysUntil(i.date) <= 7);
    const queueEmpty = readyForPrint.length === 0 && onPage.length === 0;
    const recentPress = _issues.filter(i => i.sentToPressAt).sort((a, b) => (b.sentToPressAt || "").localeCompare(a.sentToPressAt || ""))[0];

    return <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 28 }}>
      {/* DOSE Eye Candy */}
      <div style={{ ...glassStyle(), borderRadius: R, padding: "28px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{greeting}</div>
          {sentToPress > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: Z.go + "12", borderRadius: 20 }}>
            <span style={{ fontSize: 16 }}>🖨️</span>
            <div><div style={{ fontSize: 14, fontWeight: FW.black, color: Z.go }}>{sentToPress} to press</div><div style={{ fontSize: 10, color: Z.tm }}>this month</div></div>
          </div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: readyForPrint.length > 0 ? Z.wa : Z.go, fontFamily: DISPLAY }}>{readyForPrint.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Ready for Layout</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: ACCENT.indigo, fontFamily: DISPLAY }}>{onPage.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>On Page</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: activeIssues.length > 0 ? Z.tx : Z.td, fontFamily: DISPLAY }}>{activeIssues.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Active Issues</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: nearDeadlines.length > 0 ? Z.da : Z.go, fontFamily: DISPLAY }}>{nearDeadlines.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Deadlines (7d)</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {recentPress && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: Z.bg, borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>🖨️</span>
            <span style={{ fontSize: FS.sm, color: Z.tx }}><span style={{ fontWeight: FW.bold }}>{pn(recentPress.pubId)} {recentPress.label}</span> <span style={{ color: Z.tm }}>went to press</span></span>
          </div>}
          {queueEmpty && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: Z.go + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>✨</span>
            <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.go }}>All caught up — no pages waiting</span>
          </div>}
          {!queueEmpty && readyForPrint.length <= 3 && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: ACCENT.indigo + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>🎯</span>
            <span style={{ fontSize: FS.sm, color: ACCENT.indigo, fontWeight: FW.bold }}>{readyForPrint.length} waiting for layout</span>
          </div>}
        </div>
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
          <DirectionCard />
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

    // DOSE metrics
    const resolvedThisWeek = _tickets.filter(t => t.status === "resolved" && t.resolvedAt && t.resolvedAt.slice(0, 10) >= new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)).length;
    const activeSubs = _subs.filter(s => s.status === "active").length;
    const newSubsMonth = _subs.filter(s => s.status === "active" && s.startDate?.startsWith(today.slice(0, 7))).length;
    const allClear = openTix.length === 0 && renewalsDue.length === 0 && activeLegal.length === 0;

    return <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 28 }}>
      {/* DOSE Eye Candy */}
      <div style={{ ...glassStyle(), borderRadius: R, padding: "28px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{greeting}</div>
          {resolvedThisWeek > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: Z.go + "12", borderRadius: 20 }}>
            <span style={{ fontSize: 16 }}>✅</span>
            <div><div style={{ fontSize: 14, fontWeight: FW.black, color: Z.go }}>{resolvedThisWeek} resolved</div><div style={{ fontSize: 10, color: Z.tm }}>this week</div></div>
          </div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: openTix.length > 0 ? Z.wa : Z.go, fontFamily: DISPLAY }}>{openTix.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Open Tickets</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: renewalsDue.length > 5 ? Z.wa : Z.tx, fontFamily: DISPLAY }}>{renewalsDue.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Renewals Due</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.go, fontFamily: DISPLAY }}>{activeSubs}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Active Subscribers</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: newSubsMonth > 0 ? Z.go : Z.td, fontFamily: DISPLAY }}>{newSubsMonth}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>New This Month</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {allClear && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: Z.go + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>✨</span>
            <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.go }}>All caught up — everything's handled</span>
          </div>}
          {!allClear && checklist.length <= 3 && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: ACCENT.blue + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>🎯</span>
            <span style={{ fontSize: FS.sm, color: ACCENT.blue, fontWeight: FW.bold }}>{checklist.length} item{checklist.length !== 1 ? "s" : ""} on today's list</span>
          </div>}
        </div>
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
          <DirectionCard />
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
  // Load ad projects for designer (runs for all roles but only acts for designers)
  const isAdDesigner = role === "Ad Designer" || (role === "Graphic Designer" && currentUser?.title === "Ad Designer");
  useEffect(() => {
    if (!isAdDesigner) return;
      if (!currentUser?.id || !isOnline()) return;
      (async () => {
        const { data: projects } = await supabase.from("ad_projects").select("*").order("created_at", { ascending: false });
        const myProjects = (projects || []).filter(p => p.designer_id === currentUser.id || !p.designer_id);
        setAdProjects(myProjects);

        // Auto-create ad projects for closed sales within 30d that have no project
        const cutoff30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        const upcomingIssueIds = new Set((_issues || []).filter(i => i.date >= today && i.date <= cutoff30).map(i => i.id));
        const existingKeys = new Set(myProjects.map(p => `${p.client_id}|${p.issue_id}`));
        const jobKeys = new Set((_jobs || []).map(j => `${j.clientId}|${j.issueId}`));

        const needsProject = (_sales || [])
          .filter(s => s.status === "Closed" && s.issueId && upcomingIssueIds.has(s.issueId))
          .filter(s => !existingKeys.has(`${s.clientId}|${s.issueId}`) && !jobKeys.has(`${s.clientId}|${s.issueId}`));

        if (needsProject.length > 0) {
          const newProjects = needsProject.map(s => ({
            client_id: s.clientId,
            publication_id: s.publication,
            issue_id: s.issueId,
            ad_size: s.size || s.adSize || s.type || null,
            designer_id: currentUser.id,
            salesperson_id: (_clients || []).find(c => c.id === s.clientId)?.repId || null,
            status: "brief",
            design_notes: `Auto-created from sale. Ad size: ${s.size || s.adSize || s.type || "TBD"}`,
          }));
          const { data: created } = await supabase.from("ad_projects").insert(newProjects).select();
          if (created) setAdProjects(prev => [...created, ...prev]);
        }
      })();
  }, [isAdDesigner, currentUser?.id, _sales?.length, _issues?.length]);

  if (isAdDesigner) {
    // Active projects (not placed/signed off)
    const activeProjects = adProjects.filter(p => !["signed_off", "placed"].includes(p.status));
    const revisionProjects = activeProjects.filter(p => p.status === "revising");
    const approvedProjects = adProjects.filter(p => p.status === "approved" || p.status === "signed_off");
    const approvedThisWeek = approvedProjects.filter(p => p.updated_at && daysUntil(p.updated_at.slice(0, 10)) >= -7);

    // Also pull from creativeJobs as fallback
    const myJobs = _jobs.filter(j => !["complete", "billed"].includes(j.status)).sort((a, b) => (a.dueDate || "9").localeCompare(b.dueDate || "9"));

    // Combined queue: ad_projects + creativeJobs (deduplicated)
    const projectClientIds = new Set(activeProjects.map(p => p.client_id));
    const combinedQueue = [
      ...activeProjects.map(p => ({ id: p.id, type: "project", clientId: p.client_id, adSize: p.ad_size, status: p.status, issueId: p.issue_id, dueDate: null, artSource: p.art_source || "we_design" })),
      ...myJobs.filter(j => !projectClientIds.has(j.clientId)).map(j => ({ id: j.id, type: "job", clientId: j.clientId, adSize: j.adSize, status: j.status, issueId: j.issueId, dueDate: j.dueDate, artSource: "we_design" })),
    ];

    // Filter
    const filteredQueue = adFilter === "all" ? combinedQueue
      : adFilter === "revision" ? combinedQueue.filter(q => q.status === "revising" || q.status === "revision_requested")
      : combinedQueue.filter(q => q.status === adFilter);

    // Upcoming ads: closed sales for issues publishing within 30d (or 7d) that may not have design briefs yet
    const rangeDays = upcomingRange === "7d" ? 7 : 30;
    const upcomingAds = useMemo(() => {
      const cutoff = new Date(Date.now() + rangeDays * 86400000).toISOString().slice(0, 10);
      const closedSales = (_sales || []).filter(s => s.status === "Closed" && s.issueId);
      const upcomingIssueIds = new Set((_issues || []).filter(i => i.date >= today && i.date <= cutoff).map(i => i.id));
      return closedSales
        .filter(s => upcomingIssueIds.has(s.issueId))
        .map(s => {
          const issue = _issues.find(i => i.id === s.issueId);
          const hasProject = adProjects.some(p => p.client_id === s.clientId && p.issue_id === s.issueId);
          const hasJob = _jobs.some(j => j.clientId === s.clientId && j.issueId === s.issueId);
          return { ...s, issue, hasBrief: hasProject || hasJob, projectId: adProjects.find(p => p.client_id === s.clientId && p.issue_id === s.issueId)?.id };
        })
        .sort((a, b) => (a.issue?.date || "9").localeCompare(b.issue?.date || "9"));
    }, [_sales, _issues, adProjects, _jobs, rangeDays, today]);
    const noBriefCount = upcomingAds.filter(a => !a.hasBrief).length;

    // Ping salesperson
    const pingSalesperson = async (sale) => {
      setPinging(sale.id);
      const sp = (_clients || []).find(c => c.id === sale.clientId);
      const spId = sp?.repId;
      const spMember = (team || []).find(t => t.id === spId);
      if (spMember?.authId) {
        await supabase.from("team_notes").insert({
          from_user: currentUser?.authId || null,
          to_user: spMember.authId,
          message: `Design brief needed: ${cn(sale.clientId)} has a ${sale.size || sale.adSize || "ad"} in ${pn(sale.publication)} ${sale.issue?.label || ""} — can you send me the details?`,
          context_type: "task",
        });
      }
      setPinging(null);
    };

    // Stats + DOSE computations
    const statusColors = { brief: Z.wa, designing: ACCENT.blue, proof_sent: Z.wa, revising: Z.da, approved: Z.go, signed_off: Z.go, placed: Z.go, not_started: Z.td, in_progress: ACCENT.blue, revision_requested: Z.da, complete: Z.go };

    // DOSE metrics
    const thisMonthStr = today.slice(0, 7);
    const allCompleted = adProjects.filter(p => ["approved", "signed_off", "placed"].includes(p.status));
    const completedThisMonth = allCompleted.filter(p => p.updated_at?.startsWith(thisMonthStr));
    const totalDesignsCareer = allCompleted.length + _jobs.filter(j => j.status === "complete").length;

    // First-proof approval rate: approved without revision (revision_count <= 1)
    const recentCompleted = allCompleted.slice(0, 30);
    const firstProofRate = recentCompleted.length > 0 ? Math.round(recentCompleted.filter(p => (p.revision_count || 1) <= 1).length / recentCompleted.length * 100) : 100;

    // On-time: completed before issue publish date
    const onTimeCount = allCompleted.filter(p => {
      const issue = _issues.find(i => i.id === p.issue_id);
      return issue && p.updated_at && p.updated_at.slice(0, 10) <= issue.date;
    }).length;
    const onTimeRate = allCompleted.length > 0 ? Math.round(onTimeCount / allCompleted.length * 100) : 100;

    // 7-day high water mark: most ads approved in a single day over the past 7 days
    const d7ago = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const last7dApproved = allCompleted.filter(p => p.updated_at && p.updated_at.slice(0, 10) >= d7ago);
    const byDay = {};
    last7dApproved.forEach(p => { const d = p.updated_at.slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; });
    const highWaterMark = Math.max(0, ...Object.values(byDay));

    // Recent placed ads (your work in print)
    const placedAds = _sales.filter(s => s.status === "Closed" && s.page).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 3);

    // Queue clear state
    const queueEmpty = activeProjects.length === 0 && myJobs.length === 0;

    return <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 28 }}>

      {/* ═══ DOSE EYE CANDY ═══ */}
      <div style={{ ...glassStyle(), borderRadius: R, padding: "28px 32px" }}>
        {/* Greeting + streak */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{greeting}</div>
          {highWaterMark > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: Z.wa + "12", borderRadius: 20 }}>
            <span style={{ fontSize: 16 }}>🔥</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: FW.black, color: Z.wa }}>{highWaterMark} in a day</div>
              <div style={{ fontSize: 10, color: Z.tm }}>7-day best</div>
            </div>
          </div>}
        </div>

        {/* Pride metrics — 4 cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.go, fontFamily: DISPLAY }}>{completedThisMonth.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Designs This Month</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: firstProofRate >= 80 ? Z.go : firstProofRate >= 50 ? Z.wa : Z.da, fontFamily: DISPLAY }}>{firstProofRate}%</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>First-Proof Approval</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: onTimeRate >= 90 ? Z.go : onTimeRate >= 70 ? Z.wa : Z.da, fontFamily: DISPLAY }}>{onTimeRate}%</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>On-Time Delivery</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: ACCENT.indigo, fontFamily: DISPLAY }}>{totalDesignsCareer}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Total Designs</div>
          </div>
        </div>

        {/* Oxytocin/Endorphin row — your work in print + queue status */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {placedAds.length > 0 && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: Z.bg, borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>📰</span>
            <div style={{ fontSize: FS.sm, color: Z.tx }}>
              <span style={{ fontWeight: FW.bold }}>Your {cn(placedAds[0].clientId)} ad</span>
              <span style={{ color: Z.tm }}> · Page {placedAds[0].page} of {pn(placedAds[0].publication)} {_issues.find(i => i.id === placedAds[0].issueId)?.label || ""}</span>
            </div>
          </div>}
          {queueEmpty && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: Z.go + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>✨</span>
            <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.go }}>Queue cleared — nice work!</span>
          </div>}
          {!queueEmpty && activeProjects.length + myJobs.length <= 3 && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: ACCENT.blue + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>🎯</span>
            <span style={{ fontSize: FS.sm, color: ACCENT.blue, fontWeight: FW.bold }}>{activeProjects.length + myJobs.length} to go today — you've got this</span>
          </div>}
        </div>
      </div>

      {/* ═══ OPERATIONAL STATS (smaller, below eye candy) ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        {[
          { label: "Active", value: activeProjects.length + myJobs.length, color: ACCENT.blue },
          { label: "Revisions", value: revisionProjects.length, color: revisionProjects.length > 0 ? Z.da : Z.go },
          { label: "Proofs Out", value: activeProjects.filter(p => p.status === "proof_sent").length, color: Z.wa },
          { label: "Approved (7d)", value: approvedThisWeek.length, color: Z.go },
          { label: "Pick Up", value: adProjects.filter(p => !p.designer_id && !["approved", "signed_off", "placed"].includes(p.status)).length, color: adProjects.filter(p => !p.designer_id).length > 0 ? Z.wa : Z.go },
        ].map(s => (
          <div key={s.label} style={{ padding: "8px 12px", background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: Ri, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</span>
            <span style={{ fontSize: 16, fontWeight: FW.black, color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16 }}>
        {/* ═══ LEFT COLUMN ═══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, overflow: "auto" }}>

          {/* Design Queue with filter pills */}
          <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>My Design Queue</span>
              <span style={{ fontSize: FS.xs, color: Z.tm }}>{filteredQueue.length} item{filteredQueue.length !== 1 ? "s" : ""}</span>
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
              {[["all", "All"], ["brief", "Brief"], ["designing", "Designing"], ["proof_sent", "Proof Sent"], ["revision", "Revisions"], ["approved", "Approved"]].map(([k, l]) => (
                <button key={k} onClick={() => setAdFilter(k)} style={{ padding: "3px 10px", borderRadius: 14, border: "none", cursor: "pointer", fontSize: 11, fontWeight: adFilter === k ? FW.bold : 500, background: adFilter === k ? Z.tx + "12" : "transparent", color: adFilter === k ? Z.tx : Z.td }}>{l}</button>
              ))}
            </div>
            {filteredQueue.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No items match this filter</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 300, overflowY: "auto" }}>
              {filteredQueue.map(q => {
                const c = statusColors[q.status] || Z.tm;
                return <div key={q.id} onClick={() => onNavigate?.("adprojects")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: Z.bg, borderRadius: Ri, borderLeft: `3px solid ${c}`, cursor: "pointer" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{cn(q.clientId)} — {q.adSize || "Ad"}</div>
                    <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}>
                      <span style={{ fontSize: FS.xs, color: Z.tm }}>{q.dueDate ? `Due ${fmtDate(q.dueDate)}` : pn((_issues || []).find(i => i.id === q.issueId)?.pubId)}</span>
                      <span style={{ fontSize: 9, fontWeight: FW.bold, color: q.artSource === "camera_ready" ? Z.wa : Z.ac, background: (q.artSource === "camera_ready" ? Z.wa : Z.ac) + "15", padding: "1px 5px", borderRadius: Ri }}>{q.artSource === "camera_ready" ? "CR" : "Design"}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: c, background: c + "15", padding: "2px 8px", borderRadius: Ri }}>{(q.status || "").replace(/_/g, " ")}</span>
                </div>;
              })}
            </div>}
          </div>

          {/* Revisions — separated for priority visibility */}
          {revisionProjects.length > 0 && <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.da, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Revisions Requested</span>
              <span style={{ fontSize: FS.xs, color: Z.da, fontWeight: FW.bold }}>{revisionProjects.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {revisionProjects.map(p => (
                <div key={p.id} onClick={() => onNavigate?.("adprojects")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: Z.da + "08", borderRadius: Ri, borderLeft: `3px solid ${Z.da}`, cursor: "pointer" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{cn(p.client_id)}</div>
                    <div style={{ fontSize: FS.xs, color: Z.tm }}>v{p.revision_count || 1} · {p.updated_at ? `${Math.round((new Date() - new Date(p.updated_at)) / 86400000)}d ago` : ""}</div>
                  </div>
                  <Btn sm v="secondary" onClick={(e) => { e.stopPropagation(); onNavigate?.("adprojects"); }}>Revise</Btn>
                </div>
              ))}
            </div>
          </div>}

          {/* Pickup Queue — unassigned projects */}
          {(() => {
            const pickupProjects = adProjects.filter(p => !p.designer_id && !["approved", "signed_off", "placed"].includes(p.status));
            if (pickupProjects.length === 0) return null;
            return <div style={glass}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.wa, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Available to Pick Up</span>
                <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.wa }}>{pickupProjects.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
                {pickupProjects.map(p => {
                  const iss = _issues.find(i => i.id === p.issue_id);
                  const d = iss?.adDeadline ? daysUntil(iss.adDeadline) : 999;
                  const isCR = p.art_source === "camera_ready";
                  return <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: Z.bg, borderRadius: Ri, border: `1.5px dashed ${Z.da}50` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{cn(p.client_id)}</div>
                      <div style={{ fontSize: FS.xs, color: Z.tm }}>{pn(p.publication_id)} · {p.ad_size || "Ad"} · {d < 99 ? `${d}d` : ""}</div>
                      <span style={{ fontSize: 9, fontWeight: FW.bold, color: isCR ? Z.wa : Z.ac, background: (isCR ? Z.wa : Z.ac) + "15", padding: "1px 5px", borderRadius: Ri }}>{isCR ? "Camera Ready" : "We Design"}</span>
                    </div>
                    <Btn sm onClick={async () => {
                      await supabase.from("ad_projects").update({ designer_id: currentUser.id, status: isCR ? "awaiting_art" : "designing", updated_at: new Date().toISOString() }).eq("id", p.id);
                      setAdProjects(prev => prev.map(ap => ap.id === p.id ? { ...ap, designer_id: currentUser.id, status: isCR ? "awaiting_art" : "designing" } : ap));
                    }}>Pick Up →</Btn>
                  </div>;
                })}
              </div>
            </div>;
          })()}
        </div>

        {/* ═══ RIGHT COLUMN ═══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <DirectionCard />

          {/* Recently Approved */}
          {approvedProjects.length > 0 && <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Recently Approved</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}>
              {approvedProjects.slice(0, 6).map(p => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${Z.bd}15` }}>
                  <div>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx }}>{cn(p.client_id)}</div>
                    <div style={{ fontSize: FS.xs, color: Z.tm }}>{p.ad_size || "Ad"}</div>
                  </div>
                  <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: p.status === "placed" ? ACCENT.indigo : Z.go, background: (p.status === "placed" ? ACCENT.indigo : Z.go) + "15", padding: "2px 8px", borderRadius: Ri }}>{p.status === "placed" ? "Placed" : "Ready"}</span>
                </div>
              ))}
            </div>
          </div>}

          {/* Deadline Calendar */}
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Deadline Calendar</div>
            {_issues.filter(i => i.adDeadline && daysUntil(i.adDeadline) >= 0 && daysUntil(i.adDeadline) <= 30).slice(0, 8).map(iss => {
              const d = daysUntil(iss.adDeadline);
              const myCount = upcomingAds.filter(a => a.issueId === iss.id).length;
              return <div key={iss.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${Z.bd}15` }}>
                <span style={{ fontSize: FS.sm, color: Z.tx }}>{pn(iss.pubId)} {iss.label}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {myCount > 0 && <span style={{ fontSize: FS.xs, color: Z.tm }}>{myCount} ads</span>}
                  <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: d <= 3 ? Z.da : d <= 7 ? Z.wa : Z.td }}>{d}d</span>
                </div>
              </div>;
            })}
          </div>

          {/* Quick Stats */}
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Quick Stats</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS.sm }}>
                <span style={{ color: Z.tm }}>Completed this month</span>
                <span style={{ fontWeight: FW.bold, color: Z.tx }}>{adProjects.filter(p => ["approved", "signed_off", "placed"].includes(p.status) && p.updated_at?.startsWith(today.slice(0, 7))).length + _jobs.filter(j => j.status === "complete" && j.completedAt?.startsWith(today.slice(0, 7))).length}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS.sm }}>
                <span style={{ color: Z.tm }}>Revision rate</span>
                <span style={{ fontWeight: FW.bold, color: Z.tx }}>{adProjects.length > 0 ? Math.round(adProjects.filter(p => (p.revision_count || 0) > 1).length / adProjects.length * 100) : 0}%</span>
              </div>
            </div>
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
