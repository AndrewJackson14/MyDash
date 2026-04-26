// ============================================================
// MetadataStrip — galley-proof kicker + Back + notification bell
//
// Per Andrew (2026-04-26): consolidated to be the SINGULAR header.
// Layout:
//
//   [← Back |] 13 STARS / MYDASH ── {PAGE} ── REV. {DATE} ── {DEPT} [···· bell]
//
// Back button matches the strip's typographic style (Geist Mono 500
// 11px uppercase tracked +0.08em, var(--muted)) with no border. Hover
// lifts to var(--ink). The "|" separator after Back uses the same
// muted treatment.
//
// Notification bell stays an icon, anchored right via marginLeft:auto.
// Unread badge stays Press red (--accent) — that's a true alert.
//
// Motion: on first session mount the strip types itself in 35ms/char.
// Subsequent navigations swap content instantly.
// ============================================================

import { useEffect, useRef, useState } from "react";
import Ic from "../ui/Icons";
import { INV } from "../../lib/theme";
import { glass } from "../ui/Primitives";

const _d = new Date();
const REV_DATE =
  String(_d.getMonth() + 1).padStart(2, "0") + "." +
  String(_d.getDate()).padStart(2, "0") + "." +
  String(_d.getFullYear() % 100).padStart(2, "0");

const SEP = " ── ";
const TYPE_DELAY_MS = 35;

let _typedOnce = false;

const stripText = {
  fontFamily:    "var(--font-mono)",
  fontSize:      "var(--type-meta)",
  fontWeight:    "var(--weight-mono)",
  letterSpacing: "var(--ls-meta)",
  textTransform: "uppercase",
  color:         "var(--muted)",
};

export default function MetadataStrip({
  page = "—",
  department = "",
  onBack,
  notifications,
  setNotifications,
  onMarkAllRead,
  onNavigate,
}) {
  const pageLabel = (page || "").toUpperCase();
  const dept      = (department || "").toUpperCase();
  const fullText  = `13 STARS / MYDASH${SEP}${pageLabel}${SEP}REV. ${REV_DATE}${SEP}${dept}`;

  const [typed, setTyped] = useState(_typedOnce ? fullText : "");

  useEffect(() => {
    if (_typedOnce) return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setTyped(fullText.slice(0, i));
      if (i >= fullText.length) {
        clearInterval(id);
        _typedOnce = true;
      }
    }, TYPE_DELAY_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (_typedOnce) setTyped(fullText);
  }, [fullText]);

  // Notification popover ─────────────────────────────────────
  const [showNotifs, setShowNotifs] = useState(false);
  const popoverRef = useRef(null);
  useEffect(() => {
    if (!showNotifs) return;
    const onDocClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setShowNotifs(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showNotifs]);

  const unreadCount = (notifications || []).filter(n => !n.read).length;
  const markAllRead = () => {
    if (onMarkAllRead) onMarkAllRead();
    else setNotifications?.(ns => (ns || []).map(n => ({ ...n, read: true })));
  };

  const isTyping = typed.length < fullText.length;

  return (
    <div
      role="banner"
      aria-label={fullText}
      data-glass="true"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        padding: "8px 24px",
        // Glass over canvas. The mixin provides bg/border/blur/shadow;
        // the v2 spec calls for top + bottom hairlines, so we override
        // the all-around border into top+bottom only.
        ...glass(),
        border: "none",
        borderTop:    "1px solid var(--rule)",
        borderBottom: "1px solid var(--rule)",
        boxShadow: "none",                         // sticky strip — no glass shadow needed
        whiteSpace: "nowrap",
        overflow: "visible",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 30,
        ...stripText,
      }}
    >
      {/* Back — typographic, no border. Renders only when onBack is set. */}
      {onBack && (
        <>
          <button
            onClick={onBack}
            title="Back"
            style={{
              ...stripText,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              transition: "color 140ms cubic-bezier(0.2, 0.8, 0.2, 1)",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--ink)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--muted)"; }}
          >
            <span aria-hidden="true">←</span> Back
          </button>
          <span aria-hidden="true" style={{ margin: "0 12px" }}>|</span>
        </>
      )}

      {/* Galley-proof line — types in on first session mount. */}
      <span aria-hidden="true">{typed}</span>
      {isTyping && (
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: "0.5em",
            marginLeft: 2,
            color: "var(--ink)",
            animation: "metaCaret 600ms steps(2, end) infinite",
          }}
        >▌</span>
      )}

      {/* Spacer pushes the bell to the far right. */}
      <span style={{ flex: 1 }} />

      {/* Notification bell — only when notifications prop provided. */}
      {notifications && (
        <div ref={popoverRef} style={{ position: "relative", display: "inline-flex" }}>
          <button
            onClick={() => setShowNotifs(s => !s)}
            title="Alerts"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--muted)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 4,
              borderRadius: 4,
              position: "relative",
              transition: "color 140ms cubic-bezier(0.2, 0.8, 0.2, 1)",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--ink)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--muted)"; }}
          >
            <Ic.bell size={14} />
            {unreadCount > 0 && (
              <span style={{
                position: "absolute", top: 0, right: 0,
                background: "var(--accent)", color: INV.light,
                fontSize: 9, fontWeight: 800,
                borderRadius: 8,
                minWidth: 14, height: 14,
                padding: "0 4px",
                display: "flex", alignItems: "center", justifyContent: "center",
                lineHeight: 1,
                fontFamily: "var(--font-body)",
                letterSpacing: 0,
              }}>{unreadCount}</span>
            )}
          </button>

          {showNotifs && (
            <div data-glass="true" style={{
              position: "absolute",
              right: 0, top: "calc(100% + 6px)",
              width: 340, maxHeight: 420,
              overflowY: "auto",
              ...glass(),
              borderRadius: 4,
              zIndex: 9999,
              fontFamily: "var(--font-body)",
              textTransform: "none",
              letterSpacing: "normal",
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 16px",
                borderBottom: "1px solid var(--rule)",
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>My Alerts</span>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 11, fontWeight: 600,
                      color: "var(--action)",
                      textDecoration: "underline", textUnderlineOffset: 3,
                      padding: 0,
                    }}
                  >Mark all read</button>
                )}
              </div>
              {(notifications || []).length === 0 && (
                <div style={{
                  padding: "20px 16px", textAlign: "center",
                  color: "var(--muted)", fontSize: 12,
                }}>No alerts</div>
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
                      borderBottom: "1px solid var(--rule)",
                      cursor: n.route ? "pointer" : "default",
                      background: n.read ? "transparent" : "var(--action-soft)",
                    }}
                  >
                    <div style={{
                      fontSize: 13,
                      color: n.read ? "var(--muted)" : "var(--ink)",
                      fontWeight: n.read ? 400 : 600,
                    }}>{n.text}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{n.time}</div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
