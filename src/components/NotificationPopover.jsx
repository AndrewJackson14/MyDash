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
const STAGGER_MS = 150;

export function NotificationPopover({ currentUser, team, onOpenMemberProfile }) {
  const [stack, setStack] = useState([]); // [{id, note, shown}]
  const dismissTimers = useRef({});

  const dismiss = useCallback((id) => {
    setStack(prev => prev.map(x => x.id === id ? { ...x, shown: false } : x));
    // Remove from state after animation
    setTimeout(() => {
      setStack(prev => prev.filter(x => x.id !== id));
    }, 300);
    clearTimeout(dismissTimers.current[id]);
    delete dismissTimers.current[id];
  }, []);

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

        setStack(prev => {
          // Dedupe
          if (prev.some(x => x.id === n.id)) return prev;
          return [...prev, { id: n.id, note: n, shown: false }];
        });

        // Animate in after the next tick
        setTimeout(() => {
          setStack(prev => prev.map(x => x.id === n.id ? { ...x, shown: true } : x));
        }, STAGGER_MS);

        // Auto-dismiss
        dismissTimers.current[n.id] = setTimeout(() => dismiss(n.id), AUTO_DISMISS_MS);
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
        return (
          <div
            key={id}
            onClick={() => openSender(note)}
            style={{
              pointerEvents: "auto",
              background: "rgba(30, 30, 35, 0.92)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              padding: "12px 14px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.2)",
              cursor: "pointer",
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
                  <span style={{ fontSize: 13, fontWeight: FW.black, color: "#fff", fontFamily: COND }}>{name}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: FW.bold, textTransform: "uppercase", letterSpacing: 0.5 }}>MyDash</span>
                </div>
                {role && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginBottom: 4, fontWeight: FW.semi }}>{role}</div>}
                {task && <span style={{ display: "inline-block", padding: "1px 6px", background: "rgba(255,180,0,0.25)", color: "#ffcd6b", borderRadius: 3, fontSize: 10, fontWeight: FW.heavy, marginRight: 5, marginBottom: 3 }}>TASK: {task}</span>}
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.92)", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
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
          </div>
        );
      })}
    </div>
  );
}
