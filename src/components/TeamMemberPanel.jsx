import { useState, useEffect, useMemo } from "react";
import { Z, COND, DISPLAY, FS, FW, R, Ri, ZI } from "../lib/theme";
import { Btn } from "./ui";
import { initials as ini } from "../lib/formatters";
import { supabase, isOnline } from "../lib/supabase";
import { computeHotIssues } from "../lib/hotIssues";

// ============================================================
// TeamMemberPanel — slide-in messenger for one team member.
// Shared between Dashboard.jsx and DashboardV2.jsx so both
// dashboards have the same "click a face → direct + assign +
// notes history" interaction.
//
// Self-contained: manages its own slide animation, note state,
// and Supabase reads/writes against the team_notes table.
//
// Props:
//   member: team member object (or null to render nothing)
//   onClose: callback when user dismisses the panel
//   currentUser: for from_user attribution
// ============================================================

const ROLE_QUICK_TASKS = {
  sales: ["Follow up with client", "Send media kit", "Send proposal", "Schedule call", "Review contract"],
  editor: ["Edit story", "Review draft", "Final proof", "Assign photos", "Write headline"],
  design: ["Design ad", "Layout pages", "Create proof", "Update media kit", "Photo edit"],
  admin: ["Follow up on payment", "Process renewal", "Handle complaint", "Schedule driver", "Send legal proof"],
  default: ["Write story", "Submit draft", "Revise story", "Add photos", "Research topic"],
};

const tasksFor = (role) => {
  if (["Sales Manager", "Salesperson"].includes(role)) return ROLE_QUICK_TASKS.sales;
  if (["Editor", "Copy Editor", "Managing Editor", "Content Editor"].includes(role)) return ROLE_QUICK_TASKS.editor;
  if (["Graphic Designer", "Photo Editor", "Layout Designer", "Production Manager"].includes(role)) return ROLE_QUICK_TASKS.design;
  if (["Office Manager", "Office Administrator"].includes(role)) return ROLE_QUICK_TASKS.admin;
  return ROLE_QUICK_TASKS.default;
};

const fmtDate = (d) => {
  if (!d) return "";
  try {
    return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch (e) { return d; }
};

const TeamMemberPanel = ({ member, onClose, currentUser, onOpenProfile, data, onNavigate, setIssueDetailId }) => {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // Quick Assign is a FLAG on the outgoing message, not a separate
  // send. Clicking a task button toggles it; clicking Send emits
  // both the draft text AND the task tag together.
  const [selectedTask, setSelectedTask] = useState(null);

  // Slide-in animation: render off-screen, then trigger transform on next tick
  useEffect(() => {
    if (!member) { setOpen(false); return; }
    const t = setTimeout(() => setOpen(true), 10);
    return () => clearTimeout(t);
  }, [member]);

  // Load notes for this team member.
  // Notes are addressed by team_members.id (not auth.users.id) so
  // sends work regardless of whether the member has an SSO account.
  useEffect(() => {
    if (!member?.id || !isOnline()) { setNotes([]); return; }
    let cancelled = false;
    supabase.from("team_notes").select("*")
      .or(`to_user.eq.${member.id},from_user.eq.${member.id}`)
      .order("created_at", { ascending: false }).limit(20)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error("team_notes load:", error); return; }
        setNotes(data || []);
      });
    return () => { cancelled = true; };
  }, [member]);

  const close = () => {
    setOpen(false);
    setTimeout(() => onClose?.(), 250);
  };

  // Combines the draft text + the selected Quick Assign task into
  // a single row. Format: if a task is selected, prepend "[Task:
  // Follow up] " to the message body so the task is a durable flag
  // that renders as a badge in the thread (see note rendering below).
  // Send is valid if EITHER a draft OR a task is present.
  const sendNote = async () => {
    if (!member?.id || sending) return;
    const text = draft.trim();
    if (!text && !selectedTask) return;
    const message = selectedTask
      ? (text ? `[Task: ${selectedTask}] ${text}` : `[Task: ${selectedTask}]`)
      : text;
    setSending(true);
    const fromId = currentUser?.id || currentUser?.authId || null;
    const { data, error } = await supabase.from("team_notes").insert({
      from_user: fromId,
      to_user: member.id,
      message,
      context_type: selectedTask ? "task" : "general",
      context_id: null,
    }).select().single();
    if (error) console.error("team_notes insert:", error);
    if (data) setNotes(prev => [data, ...prev]);
    setDraft("");
    setSelectedTask(null);
    setSending(false);
  };

  // Parse a stored message into { task, body } so the note renderer
  // can show the task as a badge and the body as the message text.
  const parseTaggedMessage = (msg) => {
    if (!msg) return { task: null, body: "" };
    const m = msg.match(/^\[Task: ([^\]]+)\]\s*(.*)$/s);
    if (m) return { task: m[1], body: m[2] };
    return { task: null, body: msg };
  };

  // Hot issues for this member — live-computed from the data bundle
  // passed by the parent dashboard. Memoized on [member, data].
  const hotCategories = useMemo(() => {
    if (!member || !data) return [];
    return computeHotIssues(member, data);
  }, [member, data]);

  const handleHotIssueClick = (item) => {
    if (item.issueId && setIssueDetailId) { setIssueDetailId(item.issueId); close(); return; }
    if (item.page && onNavigate) { onNavigate(item.page); close(); }
  };

  if (!member) return null;

  const quickTasks = tasksFor(member.role);

  return <div style={{ position: "fixed", inset: 0, zIndex: ZI?.top || 9999 }} onClick={close}>
    {/* Backdrop */}
    <div style={{
      position: "absolute", inset: 0,
      background: "rgba(0,0,0,0.4)",
      opacity: open ? 1 : 0,
      transition: "opacity 0.25s",
    }} />

    {/* Panel */}
    <div onClick={e => e.stopPropagation()} style={{
      position: "absolute", right: 0, top: 0, bottom: 0,
      width: 420, maxWidth: "90vw",
      background: Z.sf,
      borderLeft: `1px solid ${Z.bd}`,
      display: "flex", flexDirection: "column",
      transform: open ? "translateX(0)" : "translateX(100%)",
      transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
      boxShadow: open ? "-8px 0 30px rgba(0,0,0,0.3)" : "none",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: `1px solid ${Z.bd}` }}>
        <div
          onClick={onOpenProfile ? () => { onOpenProfile(member.id); close(); } : undefined}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            cursor: onOpenProfile ? "pointer" : "default",
          }}
          title={onOpenProfile ? "Open team member dashboard" : undefined}
        >
          <div style={{
            width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: FS.md, fontWeight: FW.bold, color: Z.tm, background: Z.bg,
            fontFamily: COND, borderRadius: R,
          }}>{ini(member.name)}</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, textDecoration: onOpenProfile ? "underline" : "none", textDecorationColor: Z.bd, textUnderlineOffset: 3 }}>{member.name}</div>
            <div style={{ fontSize: FS.base, color: Z.tm }}>{member.role}</div>
          </div>
        </div>
        <Btn sm v="ghost" onClick={close}>&times;</Btn>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Send a note — with an optional Quick Assign task flag */}
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6, fontFamily: COND }}>Send a note</div>
          {/* Selected task badge (if any) */}
          {selectedTask && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, padding: "4px 10px", background: Z.wa + "15", border: `1px solid ${Z.wa}40`, borderRadius: Ri, alignSelf: "flex-start", width: "fit-content" }}>
              <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.wa, textTransform: "uppercase", letterSpacing: 0.5 }}>TASK</span>
              <span style={{ fontSize: FS.xs, color: Z.tx, fontWeight: FW.semi }}>{selectedTask}</span>
              <button
                onClick={() => setSelectedTask(null)}
                title="Remove task tag"
                style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, fontSize: 14, padding: "0 2px", marginLeft: 2 }}
              >&times;</button>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") sendNote(); }}
              placeholder={selectedTask ? "Add a message with this task..." : "Direct this team member..."}
              style={{ flex: 1, background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "10px 14px", color: Z.tx, fontSize: FS.base, outline: "none", fontFamily: "inherit" }}
            />
            <Btn sm onClick={sendNote} disabled={sending || (!draft.trim() && !selectedTask)}>
              {sending ? "..." : "Send"}
            </Btn>
          </div>
        </div>

        {/* Quick assign — clicking a task tags it onto the pending
            message. Click again (or the × on the tag above) to clear.
            Combined send happens when the user hits Send or Enter. */}
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6, fontFamily: COND }}>Quick assign</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {quickTasks.map(task => {
              const active = selectedTask === task;
              return <button
                key={task}
                onClick={() => setSelectedTask(active ? null : task)}
                style={{
                  padding: "6px 14px",
                  border: `1px solid ${active ? Z.wa : Z.bd}`,
                  borderRadius: Ri,
                  background: active ? Z.wa + "15" : Z.bg,
                  cursor: "pointer",
                  fontSize: FS.sm, fontWeight: active ? FW.heavy : FW.semi, color: active ? Z.wa : Z.tm,
                  fontFamily: COND,
                  transition: "background 0.1s, border-color 0.1s, color 0.1s",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = Z.sa; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = Z.bg; }}
              >{task}</button>;
            })}
          </div>
        </div>

        {/* Hot issues — live, heat-sorted, per-role */}
        {hotCategories.length > 0 && (
          <div style={{ borderTop: `1px solid ${Z.bd}`, paddingTop: 14 }}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10, fontFamily: COND }}>
              Hot Issues
            </div>
            <HotIssuesList categories={hotCategories} onItemClick={handleHotIssueClick} />
          </div>
        )}

        {/* Notes history */}
        <div style={{ borderTop: `1px solid ${Z.bd}`, paddingTop: 14 }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6, fontFamily: COND }}>
            Recent Notes {notes.length > 0 && <span style={{ color: Z.tm }}>({notes.length})</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
            {notes.length === 0 && <div style={{ fontSize: FS.sm, color: Z.td, padding: "8px 0" }}>No notes yet</div>}
            {notes.slice(0, 10).map(n => {
              const isFromMe = n.from_user && (n.from_user === currentUser?.id || n.from_user === currentUser?.authId);
              const isTask = n.context_type === "task";
              const { task, body } = parseTaggedMessage(n.message);
              return <div key={n.id} style={{
                padding: "8px 10px",
                borderRadius: Ri,
                background: isTask ? Z.wa + "08" : Z.bg,
                borderLeft: `2px solid ${isTask ? Z.wa : isFromMe ? Z.ac : Z.go || "#22C55E"}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: isFromMe ? Z.ac : Z.go || "#22C55E" }}>
                    {isFromMe ? "You" : member?.name?.split(" ")[0]}
                  </span>
                  <span style={{ fontSize: FS.micro, color: Z.td }}>{fmtDate(n.created_at?.slice(0, 10))}</span>
                </div>
                {task && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", background: Z.wa + "15", border: `1px solid ${Z.wa}40`, borderRadius: Ri, marginBottom: body ? 4 : 0 }}>
                    <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.wa, textTransform: "uppercase", letterSpacing: 0.5 }}>TASK</span>
                    <span style={{ fontSize: FS.micro, color: Z.tx, fontWeight: FW.semi }}>{task}</span>
                  </div>
                )}
                {body && <div style={{ fontSize: FS.sm, color: Z.tx, whiteSpace: "pre-wrap" }}>{body}</div>}
                {!n.is_read && !isFromMe && (
                  <span style={{ fontSize: FS.micro, color: Z.wa, fontWeight: FW.bold, display: "block", marginTop: 2 }}>UNREAD</span>
                )}
              </div>;
            })}
          </div>
        </div>

        {/* Contact */}
        <div style={{ borderTop: `1px solid ${Z.bd}`, paddingTop: 14 }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6, fontFamily: COND }}>Contact</div>
          <div style={{ fontSize: FS.base, color: Z.tm }}>{member.email}</div>
          {member.phone && <div style={{ fontSize: FS.base, color: Z.tm, marginTop: 2 }}>{member.phone}</div>}
        </div>
      </div>
    </div>
  </div>;
};

// ============================================================
// HotIssuesList — categorized, heat-sorted list of burning items
// for one team member (or, later, one department). Each category
// shows its top 5 items with "+ N more" to expand. Rows click
// through via onItemClick(item). Empty categories are hidden
// upstream by computeHotIssues.
// ============================================================
const HotIssuesList = ({ categories, onItemClick }) => {
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    {categories.map(cat => (
      <HotCategory key={cat.key} category={cat} onItemClick={onItemClick} />
    ))}
  </div>;
};

const HotCategory = ({ category, onItemClick }) => {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? category.items : category.items.slice(0, 5);
  const hiddenCount = category.items.length - visible.length;

  return <div>
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      marginBottom: 6,
    }}>
      <span style={{ fontSize: 13 }}>{category.icon}</span>
      <span style={{
        fontSize: FS.micro, fontWeight: FW.heavy,
        color: category.color, textTransform: "uppercase",
        letterSpacing: 0.8, fontFamily: COND,
      }}>{category.title}</span>
      <span style={{ fontSize: FS.micro, color: Z.td, fontWeight: FW.bold }}>
        · {category.items.length}
      </span>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {visible.map(item => (
        <HotIssueRow key={item.id} item={item} accent={category.color} onClick={() => onItemClick?.(item)} />
      ))}
      {hiddenCount > 0 && (
        <button onClick={() => setExpanded(true)} style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: FS.micro, fontWeight: FW.bold, color: Z.tm,
          textAlign: "left", padding: "4px 10px",
          textDecoration: "underline", textDecorationColor: Z.bd,
          textUnderlineOffset: 3,
        }}>+ {hiddenCount} more</button>
      )}
    </div>
  </div>;
};

const HotIssueRow = ({ item, accent, onClick }) => {
  const [hover, setHover] = useState(false);
  // Heat dot color picks from the item's heat level
  const heatColor = item.heat >= 75 ? "#EF4444"
    : item.heat >= 50 ? "#F59E0B"
    : item.heat >= 25 ? "var(--accent)"
    : "#10B981";
  return <div
    onClick={onClick}
    onMouseEnter={() => setHover(true)}
    onMouseLeave={() => setHover(false)}
    style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 12px",
      background: hover ? Z.sa : Z.bg,
      border: `1px solid ${hover ? Z.bd : "transparent"}`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: Ri,
      cursor: "pointer",
      transition: "background 0.12s ease, transform 0.12s ease",
      transform: hover ? "translateX(2px)" : "translateX(0)",
    }}>
    {/* Heat dot */}
    <div style={{
      width: 8, height: 8, borderRadius: "50%",
      background: heatColor,
      flexShrink: 0,
      boxShadow: item.heat >= 75 ? `0 0 6px ${heatColor}` : "none",
    }} />
    {/* Title + sub */}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, fontFamily: COND, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {item.title}
      </div>
      {item.sub && <div style={{ fontSize: FS.micro, color: Z.tm, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {item.sub}
      </div>}
    </div>
    {/* Chevron */}
    <span style={{ fontSize: FS.sm, color: hover ? Z.tx : Z.td, fontWeight: FW.heavy, flexShrink: 0 }}>›</span>
  </div>;
};

export default TeamMemberPanel;
