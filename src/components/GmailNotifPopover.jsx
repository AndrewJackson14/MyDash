// ============================================================
// GmailNotifPopover — top-right toast stack for newly-arrived
// Gmail messages. Registers a listener on the useGmailUnread
// hook and pops a card for each new message. Click opens Mail
// with that message selected.
// ============================================================
import { useEffect, useState, useRef, useCallback } from "react";
import { COND, FW } from "../lib/theme";
import { gmailHeader, shortenGmailFrom } from "../lib/gmail";

const AUTO_DISMISS_MS = 8000;
const STAGGER_MS = 150;

export function GmailNotifPopover({ onNewUnread, onOpenMail }) {
  const [stack, setStack] = useState([]);
  const dismissTimers = useRef({});

  const dismiss = useCallback((id) => {
    setStack(prev => prev.map(x => x.id === id ? { ...x, shown: false } : x));
    setTimeout(() => setStack(prev => prev.filter(x => x.id !== id)), 300);
    clearTimeout(dismissTimers.current[id]);
    delete dismissTimers.current[id];
  }, []);

  // Listen for new unread messages from the parent hook. The hook
  // diffs against its own seenIds set, so we only get called for
  // genuinely new messages, not every existing unread.
  useEffect(() => {
    if (!onNewUnread) return;
    const unsub = onNewUnread((newMessages) => {
      setStack(prev => {
        const next = [...prev];
        for (const m of newMessages) {
          if (next.some(x => x.id === m.id)) continue;
          next.push({ id: m.id, msg: m, shown: false });
          // Animate in after the next tick
          setTimeout(() => {
            setStack(p => p.map(x => x.id === m.id ? { ...x, shown: true } : x));
          }, STAGGER_MS);
          dismissTimers.current[m.id] = setTimeout(() => dismiss(m.id), AUTO_DISMISS_MS);
        }
        return next;
      });
    });
    return unsub;
  }, [onNewUnread, dismiss]);

  useEffect(() => () => {
    Object.values(dismissTimers.current).forEach(clearTimeout);
    dismissTimers.current = {};
  }, []);

  const openMsg = (m) => {
    dismiss(m.id);
    if (onOpenMail) onOpenMail(m.id);
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
      {stack.map(({ id, msg, shown }) => {
        const from = shortenGmailFrom(gmailHeader(msg, "From"));
        const subject = gmailHeader(msg, "Subject") || "(no subject)";
        const snippet = (msg.snippet || "").slice(0, 140);
        const initials = (from || "?").split(" ").map(w => w[0]).filter(Boolean).join("").slice(0, 2).toUpperCase() || "?";
        const hash = [...from].reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0);

        return (
          <div
            key={id}
            onClick={() => openMsg(msg)}
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
              <div style={{
                width: 36, height: 36, borderRadius: 18,
                background: `hsl(${Math.abs(hash) % 360}, 55%, 50%)`,
                color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: FW.black, flexShrink: 0,
              }}>{initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: FW.black, color: "#fff", fontFamily: COND }}>{from}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: FW.bold, textTransform: "uppercase", letterSpacing: 0.5 }}>Gmail</span>
                </div>
                <div style={{ fontSize: 13, color: "#fff", fontWeight: FW.semi, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subject}</div>
                <div style={{
                  fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.4,
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}>{snippet}</div>
              </div>
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
