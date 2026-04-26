// ============================================================
// MetadataStrip — galley-proof kicker rendered above every page
//
// Format (per docs/ui-refresh/01-direction-decisions.md §Metadata
// Strip Spec):
//
//   13 STARS / MYDASH ── {PAGE} ── REV. {MM.DD.YY} ── {DEPARTMENT}
//
// Geist Mono 500, 11px, letter-spacing 0.08em, uppercase,
// var(--muted) color, hairline rules above and below.
//
// Motion (Phase 6 signature load): on first mount of the session
// the strip types itself in character-by-character, 35ms/char.
// On subsequent navigations the new label snaps in instantly so
// the rep isn't watching it type out every page change. The
// "first mount" check uses a module-scoped flag so it survives
// React StrictMode double-mounts but resets on full reload.
// ============================================================

import { useEffect, useState } from "react";

const _d = new Date();
const REV_DATE =
  String(_d.getMonth() + 1).padStart(2, "0") + "." +
  String(_d.getDate()).padStart(2, "0") + "." +
  String(_d.getFullYear() % 100).padStart(2, "0");

const SEP = " ── ";
const TYPE_DELAY_MS = 35;

let _typedOnce = false;     // session-lived flag: true after first complete type-in

export default function MetadataStrip({ page = "—", department = "" }) {
  const pageLabel = (page || "").toUpperCase();
  const dept = (department || "").toUpperCase();
  const fullText = `13 STARS / MYDASH${SEP}${pageLabel}${SEP}REV. ${REV_DATE}${SEP}${dept}`;

  // Animate only on the first mount of the session.
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

  // After the initial type-in, page changes update without animation.
  useEffect(() => {
    if (_typedOnce) setTyped(fullText);
  }, [fullText]);

  return (
    <div
      role="contentinfo"
      aria-label={fullText}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 0,
        padding: "8px 24px",
        borderTop:    "1px solid var(--rule)",
        borderBottom: "1px solid var(--rule)",
        fontFamily:    "var(--font-mono)",
        fontSize:      "var(--type-meta)",
        fontWeight:    "var(--weight-mono)",
        letterSpacing: "var(--ls-meta)",
        textTransform: "uppercase",
        color: "var(--muted)",
        background: "var(--paper)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <span aria-hidden="true">{typed}</span>
      {/* Caret — only visible during type-in. */}
      {typed.length < fullText.length && (
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
    </div>
  );
}
