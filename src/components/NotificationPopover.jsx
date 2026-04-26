// NotificationPopover — macOS-style incoming notification stack.
//
// Subscribes to team_notes INSERT events for the current user via
// Supabase realtime. Each new message slides in from the top-right,
// auto-dismisses after a few seconds, and can be clicked to open the
// sender's profile or thread.
//
// Renders in a portal-like fixed container at the top-right of the
// viewport, stacked vertically. Dismissed notifications animate out.
import { useEffect, useState, useRef, useCallback } from "react";
import { COND, FW } from "../lib/theme";
import { supabase } from "../lib/supabase";

const AUTO_DISMISS_MS = 8000;
const URGENT_DISMISS_MS = 16000;
const STAGGER_MS = 150;

// May-sim P0.4 — visual treatment per urgency tier. `blocking` notes
// stick around until the user acts (no auto-dismiss); `urgent` get a
// longer dwell + amber border; `normal` keeps existing behavior.
const URGENCY_STYLE = {
  blocking: {
    border: "1.5px solid rgba(239, 68, 68, 0.85)",
    boxShadow: "0 10px 30px rgba(239, 68, 68, 0.32), 0 0 0 3px rgba(239, 68, 68, 0.18)",
    badge: { bg: "rgba(239, 68, 68, 0.22)", color: "#fca5a5", label: "BLOCKING" },
    autoDismissMs: null,
  },
  urgent: {
    border: "1.5px solid rgba(245, 158, 11, 0.85)",
    boxShadow: "0 10px 30px rgba(245, 158, 11, 0.28), 0 0 0 2px rgba(245, 158, 11, 0.18)",
    badge: { bg: "rgba(245, 158, 11, 0.22)", color: "#fcd34d", label: "URGENT" },
    autoDismissMs: URGENT_DISMISS_MS,
  },
};

export function NotificationPopover({ currentUser, team, onOpenMemberProfile }) {
  const [stack, setStack] = useState([]); // [{id, note, shown}]
  const [expandedId, setExpandedId] = useState(null);
  const [drafts, setDrafts] = useState({}); // id -> reply text
  const [sendingId, setSendingId] = useState(null);
  const dismissTimers = useRef({});

  const dismiss = useCallback((id) => {
    setStack(prev => prev.map(x => x.id === id ? { ...x, shown: false } : x));
    // Remove from state after animation
    setTimeout(() => {
      setStack(prev => prev.filter(x => x.id !== id));
      setDrafts(prev => { const n = { ...prev }; delete n[id]; return n; });
    }, 300);
    clearTimeout(dismissTimers.current[id]);
    delete dismissTimers.current[id];
  }, []);

  const expand = useCallback((id) => {
    // Pause auto-dismiss while composing
    clearTimeout(dismissTimers.current[id]);
    delete dismissTimers.current[id];
    setExpandedId(id);
  }, []);

  const sendReply = useCallback(async (note) => {
    const text = (drafts[note.id] || "").trim();
    if (!text) return;
    setSendingId(note.id);
    const fromId = currentUser?.id || currentUser?.authId || null;
    const { error } = await supabase.from("team_notes").insert({
      from_user: fromId,
      to_user: note.from_user,
      message: text,
      context_type: note.context_type || "general",
      context_id: note.context_id || null,
    });
    if (error) {
      console.error("NotificationPopover reply failed:", error);
      setSendingId(null);
      return;
    }
    // Mark original as read
    await supabase.from("team_notes").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", note.id);
    setSendingId(null);
    setExpandedId(null);
    dismiss(note.id);
  }, [drafts, currentUser, dismiss]);

  useEffect(() => {
    const uid = currentUser?.id;
    if (!uid) return;

    let channel;
    try {
      channel = supabase.channel(`notif_${uid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "team_notes" }, (payload) => {
        const n = payload.new;
        // Only surface incoming messages addressed to me, and skip my own sends
        if (n.to_user !== uid || n.from_user === uid) return;
        if (n.is_read) return;
        // MyHelper has its own floating launcher with unread badge and a
        // dedicated subscription. Suppress the top-level toast for bot
        // threads so replies don't double-notify.
        if (n.context_type === "bot_query") return;

        setStack(prev => {
          // Dedupe
          if (prev.some(x => x.id === n.id)) return prev;
          return [...prev, { id: n.id, note: n, shown: false }];
        });

        // Animate in after the next tick
        setTimeout(() => {
          setStack(prev => prev.map(x => x.id === n.id ? { ...x, shown: true } : x));
        }, STAGGER_MS);

        // Auto-dismiss — blocking notes never auto-dismiss; urgent get a
        // longer dwell so the recipient has time to read and act.
        const tierMs = n.urgency === "blocking"
          ? null
          : n.urgency === "urgent"
          ? URGENT_DISMISS_MS
          : AUTO_DISMISS_MS;
        if (tierMs != null) {
          dismissTimers.current[n.id] = setTimeout(() => dismiss(n.id), tierMs);
        }
      })
      // P1.8 — also subscribe to the notifications table so @-mention
      // events written by ChatPanel surface here. We map them into
      // the same toast-stack shape the team_notes branch uses, with
      // context_type='mention' as a discriminator for the render
      // branch below.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` }, (payload) => {
        const n = payload.new;
        if (n.type !== "mention") return;
        const stackId = `notif:${n.id}`;
        setStack(prev => {
          if (prev.some(x => x.id === stackId)) return prev;
          return [...prev, {
            id: stackId,
            note: {
              id: n.id,
              message: n.detail || n.title || "You were mentioned",
              from_user: null,
              context_type: "mention",
              context_url: n.link || null,
              title: n.title || null,
              created_at: n.created_at,
            },
            shown: false,
          }];
        });
        setTimeout(() => {
          setStack(prev => prev.map(x => x.id === stackId ? { ...x, shown: true } : x));
        }, STAGGER_MS);
        dismissTimers.current[stackId] = setTimeout(() => dismiss(stackId), AUTO_DISMISS_MS);
      })
      .subscribe();
    } catch (err) {
      console.error("NotificationPopover subscribe failed:", err);
    }

    return () => {
      try { if (channel) supabase.removeChannel(channel); } catch (_) {}
      Object.values(dismissTimers.current).forEach(clearTimeout);
      dismissTimers.current = {};
    };
  }, [currentUser?.id, dismiss]);

  const parseTask = (msg) => {
    const m = (msg || "").match(/^\[Task: ([^\]]+)\]\s*(.*)$/s);
    return m ? { task: m[1], body: m[2] } : { task: null, body: msg || "" };
  };

  const senderName = (uid) => (team || []).find(t => t.id === uid)?.name || "Someone";
  const senderRole = (uid) => (team || []).find(t => t.id === uid)?.role || "";

  const openSender = async (note) => {
    // Mark read + open the sender's profile
    await supabase.from("team_notes").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", note.id);
    dismiss(note.id);
    if (onOpenMemberProfile && note.from_user) onOpenMemberProfile(note.from_user);
  };

  const setDraft = (id, val) => setDrafts(prev => ({ ...prev, [id]: val }));

  if (stack.length === 0) return null;

  return (
    <div style={{
      position: "fixed",
      top: 20,
      right: 20,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      zIndex: 10000,
      pointerEvents: "none",
      maxWidth: 380,
    }}>
      {stack.map(({ id, note, shown }) => {
        const { task, body } = parseTask(note.message);
        const name = senderName(note.from_user);
        const role = senderRole(note.from_user);
        const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
        const isExpanded = expandedId === id;
        const draft = drafts[id] || "";
        const isSending = sendingId === id;
        const urgency = note.urgency;
        const urgencyStyle = URGENCY_STYLE[urgency] || null;
        return (
          <div
            key={id}
            onClick={() => !isExpanded && expand(id)}
            style={{
              pointerEvents: "auto",
              background: "rgba(30, 30, 35, 0.92)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              border: urgencyStyle?.border || "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              padding: "12px 14px",
              boxShadow: urgencyStyle?.boxShadow || "0 10px 30px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.2)",
              cursor: isExpanded ? "default" : "pointer",
              transform: shown ? "translateX(0)" : "translateX(400px)",
              opacity: shown ? 1 : 0,
              transition: "transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.35s ease-out",
              color: "#fff",
              minWidth: 320,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              {/* Avatar */}
              <div style={{
                width: 36, height: 36, borderRadius: 18,
                background: `hsl(${Math.abs([...name].reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)) % 360}, 55%, 50%)`,
                color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: FW.black, flexShrink: 0,
              }}>{initials}</div>
              {/* Body */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                  <span
                    onClick={(e) => { e.stopPropagation(); openSender(note); }}
                    style={{ fontSize: 13, fontWeight: FW.black, color: "#fff", fontFamily: COND, cursor: "pointer", textDecoration: "none" }}
                    title="Open profile"
                  >{name}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: FW.bold, textTransform: "uppercase", letterSpacing: 0.5 }}>MyDash</span>
                </div>
                {role && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginBottom: 4, fontWeight: FW.semi }}>{role}</div>}
                {urgencyStyle && <span style={{ display: "inline-block", padding: "1px 6px", background: urgencyStyle.badge.bg, color: urgencyStyle.badge.color, borderRadius: 3, fontSize: 10, fontWeight: FW.heavy, marginRight: 5, marginBottom: 3, letterSpacing: 0.5 }}>{urgencyStyle.badge.label}</span>}
                {note.mirrored_from && (() => {
                  const mirroredName = (team || []).find(t => t.id === note.mirrored_from)?.name?.split(" ")[0] || "team";
                  return <span title="OOO mirror — original recipient is out, you're covering" style={{ display: "inline-block", padding: "1px 6px", background: "rgba(99, 102, 241, 0.25)", color: "#a5b4fc", borderRadius: 3, fontSize: 10, fontWeight: FW.heavy, marginRight: 5, marginBottom: 3, letterSpacing: 0.5 }}>FOR {mirroredName.toUpperCase()}</span>;
                })()}
                {task && <span style={{ display: "inline-block", padding: "1px 6px", background: "rgba(255,180,0,0.25)", color: "#ffcd6b", borderRadius: 3, fontSize: 10, fontWeight: FW.heavy, marginRight: 5, marginBottom: 3 }}>TASK: {task}</span>}
                <div style={{
                  fontSize: 13, color: "rgba(255,255,255,0.92)", lineHeight: 1.4,
                  overflow: "hidden",
                  display: isExpanded ? "block" : "-webkit-box",
                  WebkitLineClamp: isExpanded ? "unset" : 3,
                  WebkitBoxOrient: "vertical",
                  whiteSpace: "pre-wrap",
                }}>
                  {body}
                </div>
              </div>
              {/* Close X */}
              <button
                onClick={(e) => { e.stopPropagation(); dismiss(id); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "rgba(255,255,255,0.55)", padding: 2,
                  fontSize: 14, lineHeight: 1,
                  flexShrink: 0,
                }}
                aria-label="Dismiss"
              >×</button>
            </div>
            {isExpanded && (
              <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "flex-end" }}>
                <textarea
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(id, e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends, Shift+Enter inserts a newline
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(note); }
                    if (e.key === "Escape") { setExpandedId(null); }
                  }}
                  placeholder={`Reply to ${name.split(" ")[0]}…`}
                  rows={2}
                  disabled={isSending}
                  style={{
                    flex: 1,
                    resize: "none",
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 8,
                    color: "#fff",
                    padding: "8px 10px",
                    fontSize: 13,
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
                <button
                  onClick={() => sendReply(note)}
                  disabled={isSending || !draft.trim()}
                  style={{
                    background: draft.trim() ? "var(--accent)" : "rgba(255,255,255,0.12)",
                    border: "none",
                    borderRadius: 8,
                    color: "#fff",
                    padding: "8px 14px",
                    fontSize: 12,
                    fontWeight: FW.black,
                    cursor: draft.trim() && !isSending ? "pointer" : "default",
                    fontFamily: COND,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    height: 36,
                  }}
                >{isSending ? "…" : "Send"}</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
