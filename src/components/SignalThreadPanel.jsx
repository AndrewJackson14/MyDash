import { useState, useEffect, useRef } from "react";
import { Z, COND, DISPLAY, FS, FW, R, Ri, ZI } from "../lib/theme";
import { Btn } from "./ui";
import { supabase, isOnline } from "../lib/supabase";

// ============================================================
// SignalThreadPanel — slide-in messenger thread scoped to a
// specific signal (focus item, deadline, etc).
//
// This is the "messenger on the item itself" pattern from the
// vision discussion. Click a focus item → instead of routing
// straight to a page, you land in a thread attached to that
// signal where you can DM your team about it. The thread is
// keyed off the underlying entity (issueId / clientId / a
// stable semantic id) so discussions persist even as the
// dashboard's "top deal" rotates.
//
// Storage: piggybacks on the existing team_notes table with
// context_type = "signal" and context_id = the chosen key.
//
// Props:
//   signal: { title, sub, dept, contextType, contextId,
//             page?, pageLabel?, issueId? }  (or null)
//   onClose, currentUser, onNavigate, setIssueDetailId
// ============================================================

const SignalThreadPanel = ({ signal, onClose, currentUser, onNavigate, setIssueDetailId }) => {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  // Slide-in
  useEffect(() => {
    if (!signal) { setOpen(false); return; }
    const t = setTimeout(() => setOpen(true), 10);
    return () => clearTimeout(t);
  }, [signal]);

  // Load thread for this signal context
  useEffect(() => {
    if (!signal?.contextId || !isOnline()) { setNotes([]); return; }
    let cancelled = false;
    supabase.from("team_notes")
      .select("*")
      .eq("context_id", signal.contextId)
      .order("created_at", { ascending: true })
      .limit(50)
      .then(({ data }) => { if (!cancelled) setNotes(data || []); });
    return () => { cancelled = true; };
  }, [signal]);

  // Auto-scroll to bottom when notes change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [notes.length]);

  const close = () => {
    setOpen(false);
    setTimeout(() => onClose?.(), 250);
  };

  const send = async () => {
    if (!draft.trim() || sending || !signal?.contextId) return;
    setSending(true);
    const { data } = await supabase.from("team_notes").insert({
      from_user: currentUser?.authId || null,
      to_user: null,
      message: draft.trim(),
      context_type: signal.contextType || "signal",
      context_id: signal.contextId,
    }).select().single();
    if (data) setNotes(prev => [...prev, data]);
    setDraft("");
    setSending(false);
  };

  const goToPage = () => {
    if (signal.issueId && setIssueDetailId) { setIssueDetailId(signal.issueId); close(); return; }
    if (signal.page && onNavigate) { onNavigate(signal.page); close(); }
  };

  if (!signal) return null;

  const accent = signal.color || Z.ac;
  const canOpenPage = !!(signal.page || signal.issueId);

  return <div style={{ position: "fixed", inset: 0, zIndex: ZI?.top || 9999 }} onClick={close}>
    {/* Backdrop */}
    <div style={{
      position: "absolute", inset: 0,
      background: "rgba(0,0,0,0.45)",
      backdropFilter: "blur(4px)",
      WebkitBackdropFilter: "blur(4px)",
      opacity: open ? 1 : 0,
      transition: "opacity 0.25s",
    }} />

    {/* Panel */}
    <div onClick={e => e.stopPropagation()} style={{
      position: "absolute", right: 0, top: 0, bottom: 0,
      width: 480, maxWidth: "92vw",
      background: Z.sf,
      borderLeft: `1px solid ${Z.bd}`,
      display: "flex", flexDirection: "column",
      transform: open ? "translateX(0)" : "translateX(100%)",
      transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
      boxShadow: open ? "-12px 0 40px rgba(0,0,0,0.4)" : "none",
    }}>
      {/* Header */}
      <div style={{ padding: "20px 24px 18px", borderBottom: `1px solid ${Z.bd}`, borderTop: `3px solid ${accent}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: accent, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>
            {(signal.dept || "signal").toUpperCase()}
          </span>
          <Btn sm v="ghost" onClick={close}>&times;</Btn>
        </div>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, lineHeight: 1.3 }}>{signal.title}</h3>
        {signal.sub && <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 6, lineHeight: 1.4 }}>{signal.sub}</div>}
        {canOpenPage && (
          <div style={{ marginTop: 14 }}>
            <Btn sm v="secondary" onClick={goToPage}>Open in {signal.pageLabel || "page"} →</Btn>
          </div>
        )}
      </div>

      {/* Thread */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND, marginBottom: 4 }}>
          Thread {notes.length > 0 && <span style={{ color: Z.tm }}>({notes.length})</span>}
        </div>
        {notes.length === 0 && (
          <div style={{ padding: "24px 0", textAlign: "center", color: Z.td, fontSize: FS.sm }}>
            No discussion yet — start the thread.
          </div>
        )}
        {notes.map(n => {
          const isFromMe = n.from_user === currentUser?.authId;
          const time = n.created_at ? new Date(n.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
          return <div key={n.id} style={{
            alignSelf: isFromMe ? "flex-end" : "flex-start",
            maxWidth: "85%",
            padding: "10px 14px",
            background: isFromMe ? `${Z.ac}20` : Z.bg,
            border: `1px solid ${isFromMe ? `${Z.ac}40` : Z.bd}`,
            borderRadius: 14,
          }}>
            <div style={{ fontSize: FS.sm, color: Z.tx, whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{n.message}</div>
            <div style={{ fontSize: FS.micro, color: Z.td, marginTop: 4, textAlign: isFromMe ? "right" : "left" }}>{time}</div>
          </div>;
        })}
      </div>

      {/* Composer */}
      <div style={{ padding: 16, borderTop: `1px solid ${Z.bd}`, display: "flex", gap: 8 }}>
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && draft.trim()) send(); }}
          placeholder="Message your team about this..."
          style={{ flex: 1, background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "10px 14px", color: Z.tx, fontSize: FS.base, outline: "none", fontFamily: "inherit" }}
        />
        <Btn sm onClick={send} disabled={!draft.trim() || sending}>{sending ? "..." : "Send"}</Btn>
      </div>
    </div>
  </div>;
};

export default SignalThreadPanel;
