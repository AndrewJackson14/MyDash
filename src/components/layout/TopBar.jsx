// ============================================================
// TopBar — subscribes to PageHeaderContext. Renders null until a
// page publishes a header. The full visual (search, bell, avatar,
// keyboard hint) is wired here; pages control content via
//   const { setHeader } = usePageHeader();
//   useEffect(() => { setHeader({ breadcrumb, title, actions }); }, [...]);
// ============================================================
import { useState } from "react";
import { usePageHeader } from "../../contexts/PageHeaderContext";
import { Z, FONT, RADII, DUR, EASE, INV } from "../../lib/theme";
import Ic from "../ui/Icons";

export default function TopBar({
  searchValue,
  onSearchChange,
  onSearchSubmit,
  user,
  onUserClick,
  onHelpClick,
  // Notifications: when provided, TopBar renders the bell + popover.
  notifications,
  setNotifications,
  onMarkAllRead,
  onNavigate,
  // Back nav: when provided, render a back button on the far left.
  // App.jsx passes this for every non-dashboard page so users who
  // haven't migrated to a breadcrumb still have a way home.
  onBack,
}) {
  const { header: rawHeader } = usePageHeader();
  const header = rawHeader || {};
  const [showNotifs, setShowNotifs] = useState(false);

  // Local search state for when no parent supplies onSearchChange/Value.
  // Without this the input is controlled to "" and rejects every keystroke.
  // When a real global-search hook is wired, parent props take over.
  const [localSearch, setLocalSearch] = useState("");
  const searchControlled = onSearchChange !== undefined;
  const searchVal = searchControlled ? (searchValue || "") : localSearch;
  const handleSearchChange = (e) => {
    if (searchControlled) onSearchChange(e.target.value);
    else setLocalSearch(e.target.value);
  };

  const initials = user?.initials || (user?.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  const unreadCount = (notifications || []).filter(n => !n.read).length;
  // Persist to DB when available (notifications table), otherwise just
  // update local state. Previously this was state-only, so reloads
  // resurrected every unread notification from the DB.
  const markAllRead = () => {
    if (onMarkAllRead) onMarkAllRead();
    else setNotifications?.(ns => (ns || []).map(n => ({ ...n, read: true })));
  };

  return (
    <header
      data-shell="v2"
      style={{
        height: 64,
        background: "var(--paper)",
        borderBottom: `1px solid ${"var(--rule)"}`,
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: 24,
        position: "sticky",
        top: 0,
        zIndex: 30,
        fontFamily: "var(--font-body)",
      }}
    >
      {/* Back button — pre-breadcrumb, for pages that haven't published
          a breadcrumb yet. When a page does publish, the breadcrumb
          handles hierarchy; this remains the "previous module" affordance. */}
      {onBack && (
        <button
          onClick={onBack}
          title="Back"
          style={{
            display: "flex", alignItems: "center", gap: 4,
            background: "transparent", border: "none",
            cursor: "pointer",
            color: "var(--ink)",
            fontSize: 13, fontWeight: 500,
            padding: "6px 10px",
            borderRadius: RADII.sm,
            fontFamily: "var(--font-body)",
            flexShrink: 0,
            transition: `background-color ${DUR.fast}ms ${EASE}, color ${DUR.fast}ms ${EASE}`,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--accent-soft)"; e.currentTarget.style.color = "var(--ink)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--ink)"; }}
        >
          <Ic.back size={14} /> Back
        </button>
      )}

      {/* Breadcrumb */}
      {header.breadcrumb && header.breadcrumb.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {header.breadcrumb.map((c, i) => {
            const last = i === header.breadcrumb.length - 1;
            return (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {i > 0 && <span style={{ color: "var(--rule)", fontSize: 12 }}>›</span>}
                <span
                  onClick={c.onClick}
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: last ? "var(--ink)" : "var(--muted)",
                    cursor: c.onClick ? "pointer" : "default",
                  }}
                >
                  {c.label}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* Title */}
      {header.title && (
        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "var(--ink)",
            letterSpacing: "-0.02em",
            margin: 0,
            paddingLeft: header.breadcrumb?.length ? 16 : 0,
            marginLeft: header.breadcrumb?.length ? 8 : 0,
            borderLeft: header.breadcrumb?.length ? `1px solid ${"var(--rule)"}` : "none",
            fontFamily: "var(--font-body)",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {header.title}
        </h1>
      )}

      {/* Search */}
      <div style={{ flex: 1, maxWidth: 480, marginLeft: "auto", position: "relative" }}>
        <div style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none", display: "flex" }}>
          <Ic.search size={14} />
        </div>
        <input
          type="text"
          value={searchVal}
          onChange={handleSearchChange}
          onKeyDown={onSearchSubmit ? (e) => { if (e.key === "Enter") onSearchSubmit(e.currentTarget.value); } : undefined}
          placeholder="Search stories, clients, invoices…"
          style={{
            width: "100%",
            height: 36,
            // Background/border/border-radius come from the legacy
            // input rule in global.css so the search box matches every
            // other input in the app. Padding stays inline so the
            // search icon (left:11) doesn't overlap text.
            padding: "0 44px 0 36px",
            fontSize: 13,
            outline: "none",
            fontFamily: "var(--font-body)",
            transition: `box-shadow ${DUR.fast}ms ${EASE}`,
          }}
          onFocus={(e) => { e.currentTarget.style.boxShadow = "0 0 0 3px rgba(72,107,149,0.18)"; }}
          onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
        />
        <kbd
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 10.5,
            fontWeight: 500,
            color: "var(--muted)",
            padding: "3px 6px",
            background: "var(--paper)",
            border: `1px solid ${"var(--rule)"}`,
            borderRadius: RADII.xs,
            fontFamily: "var(--font-mono)",
          }}
        >
          ⌘K
        </kbd>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {header.actions}

        {/* Notification bell — shows when `notifications` prop is provided.
            Popover is a lightweight clone of the legacy header's "My Alerts"
            dropdown; once all pages migrate to TopBar the legacy copy in
            App.jsx can be deleted. */}
        {notifications && (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowNotifs(s => !s)}
              title="Alerts"
              style={{
                width: 36, height: 36,
                borderRadius: RADII.md,
                border: "1px solid transparent",
                background: "transparent",
                color: "var(--ink)",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: `all ${DUR.fast}ms ${EASE}`,
                position: "relative",
              }}
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
                  border: `1px solid ${"var(--rule)"}`,
                  borderRadius: RADII.md,
                  boxShadow: "none",
                  zIndex: 9999,
                  fontFamily: "var(--font-body)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${"var(--rule)"}` }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>My Alerts</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 3, padding: 0 }}
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
                          borderBottom: `1px solid ${"var(--rule)"}`,
                          cursor: n.route ? "pointer" : "default",
                          background: n.read ? "transparent" : "var(--accent-soft)",
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

        {onHelpClick && (
          <button
            onClick={onHelpClick}
            title="Help"
            style={{
              width: 36, height: 36,
              borderRadius: RADII.md,
              border: "1px solid transparent",
              background: "transparent",
              color: "var(--ink)",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: `all ${DUR.fast}ms ${EASE}`,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>?</span>
          </button>
        )}
        {user && (
          <div
            onClick={onUserClick}
            title={user.name}
            style={{
              width: 32, height: 32,
              borderRadius: "50%",
              background: "var(--ink)",
              color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "-0.01em",
              border: `2px solid ${"var(--paper)"}`,
              outline: `1px solid ${"var(--rule)"}`,
              transition: `outline-color ${DUR.fast}ms ${EASE}`,
            }}
          >
            {initials}
          </div>
        )}
      </div>
    </header>
  );
}
