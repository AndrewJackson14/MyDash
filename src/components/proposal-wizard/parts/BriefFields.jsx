// ============================================================
// BriefFields — conditional brief inputs (We Design only)
//
// The four-field brief that flows to ad_projects.brief_* on
// conversion. Headline + Style + Brand Colors are required when
// art_source = "we_design". Special Instructions is optional.
//
// Required-field treatment (per Andrew, 2026-04-26): replace the
// hard red box-shadow with a softer amber accent — a left border
// stripe on the field plus a subtle amber background tint. The
// "needs to be filled" hint at the top stays amber too. Reads as
// "needs your attention" rather than "you broke something."
// ============================================================

import { Z, FS, FW, COND, Ri, R, CARD } from "../../../lib/theme";
import { Inp, TA } from "../../ui/Primitives";

function NeedsAttention({ hasError, children }) {
  return (
    <div style={{
      borderRadius: Ri,
      borderLeft: hasError ? `3px solid ${Z.wa}` : "3px solid transparent",
      background: hasError ? Z.wa + "08" : "transparent",
      paddingLeft: hasError ? 6 : 0,
      transition: "background 0.15s, border-color 0.15s, padding-left 0.15s",
    }}>{children}</div>
  );
}

export default function BriefFields({ brief, onChange, errors = {} }) {
  const hasMissing = !!(errors.headline || errors.style || errors.colors);
  const missingLabels = [errors.headline && "Headline", errors.style && "Style", errors.colors && "Colors"]
    .filter(Boolean);

  return (
    <div style={{
      background: Z.sa,
      borderRadius: R,
      padding: CARD.pad,
      display: "flex", flexDirection: "column", gap: 10,
      // Card border picks up amber when something's missing — softer
      // than the previous red and matches the field accent.
      border: `1px solid ${hasMissing ? Z.wa + "60" : Z.bd}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{
          fontSize: 11, fontWeight: FW.heavy, color: Z.td,
          letterSpacing: 0.5, textTransform: "uppercase", fontFamily: COND,
        }}>
          Creative Brief <span style={{ color: Z.wa }}>(required for Jen to start)</span>
        </div>
        {hasMissing && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 10, fontWeight: FW.heavy, color: Z.wa, fontFamily: COND,
            padding: "2px 8px", borderRadius: 999, background: Z.wa + "14",
          }}>
            <span aria-hidden style={{ fontSize: 11 }}>!</span>
            Needs: {missingLabels.join(" · ")}
          </span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <NeedsAttention hasError={!!errors.headline}>
          <Inp
            label="Headline / CTA"
            value={brief.headline}
            onChange={e => onChange("headline", e.target.value)}
            placeholder="e.g. Grand Opening Sale — 20% Off"
          />
        </NeedsAttention>
        <NeedsAttention hasError={!!errors.style}>
          <Inp
            label="Style Direction"
            value={brief.style}
            onChange={e => onChange("style", e.target.value)}
            placeholder="e.g. Modern, clean, wine-country feel"
          />
        </NeedsAttention>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <NeedsAttention hasError={!!errors.colors}>
          <Inp
            label="Brand Colors"
            value={brief.colors}
            onChange={e => onChange("colors", e.target.value)}
            placeholder="e.g. Navy + gold, or use logo colors"
          />
        </NeedsAttention>
        <Inp
          label="Special Instructions"
          value={brief.instructions}
          onChange={e => onChange("instructions", e.target.value)}
          placeholder="e.g. Include QR code to website"
        />
      </div>
    </div>
  );
}
