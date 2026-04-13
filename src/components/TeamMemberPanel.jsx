import { useState, useEffect } from "react";
import { Z, COND, DISPLAY, FS, FW, R, Ri, ZI } from "../lib/theme";
import { Btn } from "./ui";
import { initials as ini } from "../lib/formatters";
import { supabase, isOnline } from "../lib/supabase";

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

const TeamMemberPanel = ({ member, onClose, currentUser }) => {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  // Slide-in animation: render off-screen, then trigger transform on next tick
  useEffect(() => {
    if (!member) { setOpen(false); return; }
    const t = setTimeout(() => setOpen(true), 10);
    return () => clearTimeout(t);
  }, [member]);

  // Load notes for this team member
  useEffect(() => {
    if (!member?.authId || !isOnline()) { setNotes([]); return; }
    let cancelled = false;
    supabase.from("team_notes").select("*")
      .or(`to_user.eq.${member.authId},from_user.eq.${member.authId}`)
      .order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => { if (!cancelled) setNotes(data || []); });
    return () => { cancelled = true; };
  }, [member]);

  const close = () => {
    setOpen(false);
    setTimeout(() => onClose?.(), 250);
  };

  const sendNote = async (message, contextType, contextId) => {
    if (!message?.trim() || !member?.authId || sending) return;
    setSending(true);
    const { data } = await supabase.from("team_notes").insert({
      from_user: currentUser?.authId || null,
      to_user: member.authId,
      message: message.trim(),
      context_type: contextType || "general",
      context_id: contextId || null,
    }).select().single();
    if (data) setNotes(prev => [data, ...prev]);
    setDraft("");
    setSending(false);
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: FS.md, fontWeight: FW.bold, color: Z.tm, background: Z.bg,
            fontFamily: COND, borderRadius: R,
          }}>{ini(member.name)}</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{member.name}</div>
            <div style={{ fontSize: FS.base, color: Z.tm }}>{member.role}</div>
          </div>
        </div>
        <Btn sm v="ghost" onClick={close}>&times;</Btn>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Send a note */}
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6, fontFamily: COND }}>Send a note</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && draft.trim()) sendNote(draft); }}
              placeholder="Direct this team member..."
              style={{ flex: 1, background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "10px 14px", color: Z.tx, fontSize: FS.base, outline: "none", fontFamily: "inherit" }}
            />
            <Btn sm onClick={() => sendNote(draft)} disabled={!draft.trim() || sending}>
              {sending ? "..." : "Send"}
            </Btn>
          </div>
        </div>

        {/* Quick assign */}
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6, fontFamily: COND }}>Quick assign</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {quickTasks.map(task => (
              <button
                key={task}
                onClick={() => sendNote(`Task assigned: ${task}`, "task", null)}
                style={{
                  padding: "6px 14px",
                  border: `1px solid ${Z.bd}`,
                  borderRadius: Ri,
                  background: Z.bg,
                  cursor: "pointer",
                  fontSize: FS.sm, fontWeight: FW.semi, color: Z.tm,
                  fontFamily: COND,
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = Z.sa}
                onMouseLeave={e => e.currentTarget.style.background = Z.bg}
              >{task}</button>
            ))}
          </div>
        </div>

        {/* Notes history */}
        <div style={{ borderTop: `1px solid ${Z.bd}`, paddingTop: 14 }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6, fontFamily: COND }}>
            Recent Notes {notes.length > 0 && <span style={{ color: Z.tm }}>({notes.length})</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
            {notes.length === 0 && <div style={{ fontSize: FS.sm, color: Z.td, padding: "8px 0" }}>No notes yet</div>}
            {notes.slice(0, 10).map(n => {
              const isFromMe = n.from_user === currentUser?.authId;
              const isTask = n.context_type === "task";
              return <div key={n.id} style={{
                padding: "8px 10px",
                borderRadius: Ri,
                background: isTask ? Z.wa + "08" : Z.bg,
                borderLeft: `2px solid ${isTask ? Z.wa : isFromMe ? Z.ac : Z.go || "#22C55E"}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: isFromMe ? Z.ac : Z.go || "#22C55E" }}>
                    {isFromMe ? "You" : member?.name?.split(" ")[0]}
                  </span>
                  <span style={{ fontSize: FS.micro, color: Z.td }}>{fmtDate(n.created_at?.slice(0, 10))}</span>
                </div>
                <div style={{ fontSize: FS.sm, color: Z.tx, whiteSpace: "pre-wrap" }}>{n.message}</div>
                {!n.is_read && !isFromMe && (
                  <span style={{ fontSize: FS.micro, color: Z.wa, fontWeight: FW.bold }}>UNREAD</span>
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

export default TeamMemberPanel;
