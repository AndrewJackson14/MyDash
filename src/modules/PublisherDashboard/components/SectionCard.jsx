// SectionCard.jsx — shared column primitive.
//
// Global layout rule for the Publisher Dashboard: every column section
// is a SectionCard — header lives INSIDE the card's first row, optional
// right-aligned controls. This guarantees side-by-side columns share a
// top baseline. Don't render a label-above-card pattern here; the
// `title` always sits inside the chrome.

import { Z, COND, FS, FW, R } from "../../../lib/theme";

export default function SectionCard({
  title,
  controls,
  children,
  bodyStyle,
  style,           // outer overrides (e.g. position:sticky for ActivityStream)
  ...rest
}) {
  return (
    <section
      style={{
        background: Z.sa,
        border: `1px solid ${Z.bd}`,
        borderRadius: R,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 0,
        // minWidth: 0 lets this card shrink inside CSS Grid columns
        // even when its content has a wider min-content (auto-fit
        // grids, long unbroken text). Without it, the column expands
        // past its `fr` share and squeezes its sibling.
        minWidth: 0,
        boxShadow: "var(--card-highlight, none)",
        ...style,
      }}
      {...rest}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 4px",
        }}
      >
        <div
          style={{
            fontSize: FS.xs,
            fontWeight: FW.heavy,
            color: Z.td,
            textTransform: "uppercase",
            letterSpacing: 1,
            fontFamily: COND,
          }}
        >
          {title}
        </div>
        {controls}
      </header>
      <div style={{ flex: 1, minHeight: 0, ...bodyStyle }}>{children}</div>
    </section>
  );
}
