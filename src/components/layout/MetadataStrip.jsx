// ============================================================
// MetadataStrip — galley-proof kicker rendered above every page
//
// Format (per docs/ui-refresh/01-direction-decisions.md §Metadata
// Strip Spec):
//
//   13 STARS / MYDASH ── {PAGE} ── REV. {MM.DD.YY} ── {DEPARTMENT}
//
// Geist Mono 500, 11px, letter-spacing 0.08em, uppercase, var(--muted)
// color, hairline rules above and below.
//
// The revision date freezes at module-load time. Same value across
// the session — different on next page load. Close enough to "build
// date" for the working-publication aesthetic; if a true build-time
// constant is needed later, switch to `__BUILD_DATE__` via Vite
// define config.
// ============================================================

const _d = new Date();
const REV_DATE =
  String(_d.getMonth() + 1).padStart(2, "0") + "." +
  String(_d.getDate()).padStart(2, "0") + "." +
  String(_d.getFullYear() % 100).padStart(2, "0");

const SEP = "──"; // ── two horizontal box drawings

export default function MetadataStrip({ page = "—", department = "" }) {
  const pageLabel = (page || "").toUpperCase();
  const dept = (department || "").toUpperCase();

  return (
    <div
      role="contentinfo"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: 12,
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
      <span>13 STARS / MYDASH</span>
      <span aria-hidden="true">{SEP}</span>
      <span>{pageLabel}</span>
      <span aria-hidden="true">{SEP}</span>
      <span>REV. {REV_DATE}</span>
      <span aria-hidden="true">{SEP}</span>
      <span>{dept}</span>
    </div>
  );
}
