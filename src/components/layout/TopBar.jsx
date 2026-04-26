// ============================================================
// TopBar — consolidated chrome.
//
// Subscribes to PageHeaderContext for the page title + actions.
// Layout: [Back?] [Title] [actions···] [Notification bell]
//
// Removed in this revision (Andrew override 2026-04-26):
//   • Breadcrumb — pages own their hierarchy below
//   • Global search input — relocated; not part of header
//   • User initials avatar — relocated to the sidebar footer
//
// The notification dot keeps Press red (--accent) because that
// IS an alert affordance.
// ============================================================
import { useState } from "react";
import { usePageHeader } from "../../contexts/PageHeaderContext";
import { Z, FONT, RADII, DUR, EASE, INV } from "../../lib/theme";
import Ic from "../ui/Icons";

export default function TopBar({
  // Notifications: when provided, TopBar renders the bell + popover.
  notifications,
  setNotifications,
  onMarkAllRead,
  onNavigate,
  // Back nav: when provided, render a back button on the far left.
  onBack,
}) {
  const { header: rawHeader } = usePageHeader();
  const header = rawHeader || {};
  const [showNotifs, setShowNotifs] = useState(false);

  const unreadCount = (notifications || []).filter(n => !n.read).length;
  const markAllRead = () => {
    if (onMarkAllRead) onMarkAllRead();
    else setNotifications?.(ns => (ns || []).map(n => ({ ...n, read: true })));
  };

  return (
    <header
      data-shell="v2"
      style={{
        height: 56,
        background: "var(--paper)",
        borderBottom: `1px solid var(--rule)`,
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: 16,
        position: "sticky",
        top: 0,
        zIndex: 30,
        fontFamily: "var(--font-body)",
      }}
    >
      {/* Back — far left, only when onBack is provided. */}
      {onBack && (
        <button
          onClick={onBack}
          title="Back"
          style={{
            display: "flex", alignItems: "center", gap: 4,
            background: "transparent", border: "1px solid var(--rule)",
            cursor: "pointer",
            color: "var(--ink)",
            fontSize: 13, fontWeight: 500,
            padding: "5px 10px",
            borderRadius: 4,
            fontFamily: "var(--font-body)",
            flexShrink: 0,
            transition: `background-color ${DUR.fast}ms ${EASE}`,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--action-soft)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
        >
          <Ic.back size={14} /> Back
        </button>
      )}

      {/* Title — Geist 600, mid weight. Cormorant lives at 28px+ on
          page bodies, not here. */}
      {header.title && (
        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "var(--ink)",
            letterSpacing: "-0.02em",
            margin: 0,
            fontFamily: "var(--font-body)",
            lineHeight: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {header.title}
        </h1>
      )}

      {/* Spacer to push actions + bell to the right. */}
      <div style={{ flex: 1 }} />

      {/* Page-level actions (publish/save/etc.) live here when pages
          set them via setHeader({ actions }). */}
      {header.actions && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {header.actions}
        </div>
      )}

      {/* Notification bell — only render when `notifications` prop is provided. */}
      {notifications && (
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setShowNotifs(s => !s)}
            title="Alerts"
            style={{
              width: 36, height: 36,
              borderRadius: 4,
              border: "1px solid transparent",
              background: "transparent",
              color: "var(--ink)",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: `all ${DUR.fast}ms ${EASE}`,
              position: "relative",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--action-soft)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            <Ic.bell size={18} />
            {unreadCount > 0 && (
              <span style={{
                position: "absolute", top: 4, right: 4,
                background: "var(--accent)", color: INV.light,
                fontSize: 9, fontWeight: 800,
                borderRadius: 8,
                minWidth: 14, height: 14,
                padding: "0 4px",
                display: "flex", alignItems: "center", justifyContent: "center",
                lineHeight: 1,
                fontFamily: "var(--font-body)",
              }}>{unreadCount}</span>
            )}
          </button>
          {showNotifs && (
            <>
              <div onClick={() => setShowNotifs(false)} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />
              <div style={{
                position: "absolute",
                right: 0, top: 44,
                width: 340, maxHeight: 420,
                overflowY: "auto",
                background: "var(--paper)",
                border: `1px solid var(--rule)`,
                borderRadius: 4,
                boxShadow: "none",
                zIndex: 9999,
                fontFamily: "var(--font-body)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid var(--rule)` }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>My Alerts</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "var(--action)", textDecoration: "underline", textUnderlineOffset: 3, padding: 0 }}
                    >Mark all read</button>
                  )}
                </div>
                {(notifications || []).length === 0 && (
                  <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--muted)", fontSize: 12 }}>No alerts</div>
                )}
                {[...(notifications || [])]
                  .sort((a, b) => (a.read === b.read ? 0 : a.read ? 1 : -1))
                  .slice(0, 12)
                  .map(n => (
                    <div
                      key={n.id}
                      onClick={() => {
                        setNotifications?.(ns => (ns || []).map(x => x.id === n.id ? { ...x, read: !x.read } : x));
                        if (n.route && !n.read) { onNavigate?.(n.route); setShowNotifs(false); }
                      }}
                      style={{
                        padding: "10px 16px",
                        borderBottom: `1px solid var(--rule)`,
                        cursor: n.route ? "pointer" : "default",
                        background: n.read ? "transparent" : "var(--action-soft)",
                      }}
                    >
                      <div style={{ fontSize: 13, color: n.read ? "var(--muted)" : "var(--ink)", fontWeight: n.read ? 400 : 600 }}>{n.text}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{n.time}</div>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
}
