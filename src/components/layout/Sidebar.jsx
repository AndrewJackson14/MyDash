// ============================================================
// Sidebar v2 — 64px grid placeholder + 240px absolute overlay
// that expands on hover or when pinned. Main content never
// reflows. Pinned state persists to localStorage.
//
// Sidebar owns its own hover + pinned state. Section-fold state
// (collapsedSections / toggleSection) is still controlled by
// App.jsx because it's shared with other parts of the app.
// ============================================================
import { useState, useEffect } from "react";
import { Z, RADII, DUR, EASE, FONT, SIGNAL } from "../../lib/theme";
import Ic from "../ui/Icons";
import { NavItem, NavSection, ThemeToggle } from "../ui/Primitives";

const PIN_KEY = "mydash.sidebar.pinned";

// Map legacy badgeColor on NAV items to v2 variant names.
const variantOf = (n) => {
  if (!n.badgeColor) return "neutral";
  if (n.badgeColor === Z.da) return "danger";
  if (n.badgeColor === Z.wa) return "warning";
  return "neutral";
};

export default function Sidebar({
  navSections,
  collapsedSections,
  toggleSection,
  pg,
  handleNav,
  handleThemeToggle,
  currentUser,
  realUser,
  team,
  isAdmin,
  impersonating,
  setImpersonating,
  showSwitcher,
  setShowSwitcher,
}) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(() => {
    try { return localStorage.getItem(PIN_KEY) === "true"; } catch (e) { return false; }
  });
  const expanded = hovered || pinned;

  // Collapse the admin switcher panel automatically whenever the
  // rail shrinks — otherwise the panel stays open inside a 64px
  // column and looks broken.
  useEffect(() => {
    if (!expanded && showSwitcher) setShowSwitcher(false);
  }, [expanded, showSwitcher, setShowSwitcher]);

  const togglePinned = () => {
    setPinned(p => {
      const next = !p;
      try { localStorage.setItem(PIN_KEY, next ? "true" : "false"); } catch (e) {}
      return next;
    });
  };

  const userInitials = (currentUser?.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div data-shell="v2" style={{ width: 64, flexShrink: 0, position: "relative", zIndex: 50 }}>
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "absolute",
          top: 0, left: 0, bottom: 0,
          width: expanded ? 240 : 64,
          background: Z.bgChrome,
          borderRight: `1px solid ${Z.borderSubtle}`,
          display: "flex",
          flexDirection: "column",
          transition: `width ${DUR.slow}ms ${EASE}, box-shadow ${DUR.med}ms ${EASE}`,
          zIndex: 40,
          overflow: "hidden",
          boxShadow: (hovered && !pinned) ? Z.glassShadow : "none",
          fontFamily: FONT.sans,
        }}
      >
        {/* Brand */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: 16, height: 64, flexShrink: 0,
          borderBottom: `1px solid ${Z.borderSubtle}`,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: RADII.sm,
            background: "#08090D",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 2px 8px -2px rgba(15,29,44,0.4)",
            overflow: "hidden",
          }}>
            <img
              src="/favicon.png"
              alt=""
              style={{ width: 28, height: 28, objectFit: "contain" }}
            />
          </div>
          <div style={{
            opacity: expanded ? 1 : 0,
            transition: `opacity ${DUR.med}ms ${EASE}`,
            whiteSpace: "nowrap", overflow: "hidden",
            display: "flex", flexDirection: "column", gap: 2,
          }}>
            <img
              src="/logo-mydash.png"
              alt="MyDash"
              style={{ height: 22, width: "auto", objectFit: "contain" }}
            />
            <div style={{ fontSize: 10, color: Z.fgMuted, lineHeight: 1.2, letterSpacing: 0.3 }}>13 Stars Media</div>
          </div>
        </div>

        {/* Nav */}
        <div className="shell-v2-hide-scrollbar" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 0", scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {navSections.map(sec => (
            <NavSection
              key={sec.key}
              label={sec.label}
              collapsed={!expanded}
              isCollapsed={collapsedSections[sec.key]}
              onToggle={sec.label ? () => toggleSection(sec.key) : undefined}
              badgeTotal={sec.items.reduce((s, n) => s + (n.badge || 0), 0)}
            >
              {sec.items.map(n => (
                <NavItem
                  key={n.id}
                  icon={n.icon}
                  label={n.label}
                  active={pg === n.id}
                  collapsed={!expanded}
                  badge={n.badge || null}
                  badgeVariant={variantOf(n)}
                  onClick={() => handleNav(n.id)}
                  title={n.label}
                />
              ))}
            </NavSection>
          ))}
        </div>

        {/* Footer: pin toggle + theme toggle + user pill + admin switcher */}
        <div style={{
          borderTop: `1px solid ${Z.borderSubtle}`,
          flexShrink: 0,
          padding: 8,
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          {/* Pin toggle */}
          <div
            onClick={togglePinned}
            title={pinned ? "Unpin sidebar" : "Pin sidebar"}
            style={{
              display: "flex", alignItems: "center",
              height: 36, padding: "0 12px",
              borderRadius: 10, cursor: "pointer",
              color: pinned ? Z.fgAccent : Z.fgMuted,
              fontSize: 13,
              transition: `background-color ${DUR.fast}ms ${EASE}, color ${DUR.fast}ms ${EASE}`,
              whiteSpace: "nowrap",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = Z.bgHover; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ width: 18, height: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Ic.pin size={18} />
            </span>
            <span style={{
              marginLeft: 12,
              opacity: expanded ? 1 : 0,
              transition: `opacity ${DUR.med}ms ${EASE}`,
              fontWeight: 500,
            }}>{pinned ? "Unpin sidebar" : "Pin sidebar"}</span>
          </div>

          {/* Theme toggle — only visible when expanded */}
          {expanded && (
            <div style={{ padding: "0 4px" }}>
              <ThemeToggle onToggle={handleThemeToggle} />
            </div>
          )}

          {/* User pill */}
          <div
            onClick={() => { if (currentUser?.id) handleNav("team", { memberId: currentUser.id }); }}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 8px", cursor: "pointer",
              borderRadius: 10,
              marginTop: 4,
              transition: `background-color ${DUR.fast}ms ${EASE}`,
              justifyContent: expanded ? "flex-start" : "center",
            }}
            onMouseEnter={e => e.currentTarget.style.background = Z.bgHover}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: impersonating
                ? (SIGNAL.warning + "30")
                : "linear-gradient(135deg, #486b95, #2c465e)",
              color: impersonating ? SIGNAL.warning : "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              border: impersonating ? `1px solid ${SIGNAL.warning}` : `2px solid ${Z.bgChrome}`,
              outline: `1px solid ${Z.borderSubtle}`,
              fontSize: 11, fontWeight: 600,
              letterSpacing: "-0.01em",
            }}>{impersonating ? "!" : userInitials}</div>
            {expanded && (
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                <div title={currentUser?.name || "User"} style={{
                  fontSize: 12, fontWeight: 600,
                  color: impersonating ? SIGNAL.warning : Z.fgPrimary,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{currentUser?.name || "User"}</div>
                <div title={currentUser?.role || ""} style={{ fontSize: 11, color: Z.fgMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentUser?.role || ""}</div>
              </div>
            )}
            {expanded && isAdmin && (
              <button
                onClick={e => { e.stopPropagation(); setShowSwitcher(s => !s); }}
                title="Switch role view"
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: showSwitcher ? SIGNAL.warning : Z.fgMuted,
                  fontSize: 14, padding: 2,
                }}
              >⚙</button>
            )}
          </div>

          {/* Admin role switcher panel */}
          {showSwitcher && isAdmin && expanded && (
            <div style={{
              margin: "4px 0 2px",
              padding: 8,
              background: Z.bgCanvas,
              borderRadius: RADII.md,
              border: `1px solid ${Z.borderSubtle}`,
              maxHeight: 240, overflowY: "auto",
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700,
                color: Z.fgMuted,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 6,
                fontFamily: FONT.sans,
              }}>View As</div>
              {impersonating && (
                <button
                  onClick={() => { setImpersonating(null); setShowSwitcher(false); }}
                  style={{
                    display: "block", width: "100%",
                    padding: "6px 8px", marginBottom: 4,
                    borderRadius: RADII.sm,
                    border: `1px solid ${SIGNAL.success}`,
                    background: SIGNAL.success + "15",
                    cursor: "pointer",
                    fontSize: 11, fontWeight: 600, color: SIGNAL.success,
                    textAlign: "left", fontFamily: FONT.sans,
                  }}
                >↩ Back to Admin</button>
              )}
              {(team || []).filter(t => t.email !== realUser?.email).map(t => {
                const isSelected = impersonating?.id === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => { setImpersonating(t); setShowSwitcher(false); }}
                    style={{
                      display: "block", width: "100%",
                      padding: "6px 8px", marginBottom: 2,
                      borderRadius: RADII.sm, border: "none",
                      background: isSelected ? (SIGNAL.warning + "20") : "transparent",
                      cursor: "pointer",
                      fontSize: 11, fontWeight: 500,
                      color: isSelected ? SIGNAL.warning : Z.fgSecondary,
                      textAlign: "left", fontFamily: FONT.sans,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = Z.bgHover; }}
                    onMouseLeave={e => { e.currentTarget.style.background = isSelected ? (SIGNAL.warning + "20") : "transparent"; }}
                  >{t.name} <span style={{ color: Z.fgMuted, fontWeight: 400 }}>· {t.role}</span></button>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
