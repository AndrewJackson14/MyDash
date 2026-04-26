// ============================================================
// BriefFields — conditional brief inputs (We Design only)
//
// The four-field brief that flows to ad_projects.brief_* on
// conversion. Headline + Style + Brand Colors are required when
// art_source = "we_design". Special Instructions is optional.
// ============================================================

import { Z, FS, FW, COND, Ri, R, CARD } from "../../../lib/theme";
import { Inp, TA } from "../../ui/Primitives";

function ErrorWrap({ hasError, children }) {
  return (
    <div style={{
      borderRadius: Ri,
      boxShadow: hasError ? `inset 0 0 0 2px ${Z.da}` : "none",
    }}>{children}</div>
  );
}

export default function BriefFields({ brief, onChange, errors = {} }) {
  const hasMissing = !!(errors.headline || errors.style || errors.colors);

  return (
    <div style={{
      background: Z.sa,
      borderRadius: R,
      padding: CARD.pad,
      display: "flex", flexDirection: "column", gap: 10,
      border: `1px solid ${hasMissing ? Z.da + "60" : Z.bd}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{
          fontSize: 11, fontWeight: FW.heavy, color: Z.td,
          letterSpacing: 0.5, textTransform: "uppercase", fontFamily: COND,
        }}>
          Creative Brief <span style={{ color: Z.da }}>(required — Jen needs this to start)</span>
        </div>
        {hasMissing && (
          <span style={{
            fontSize: 10, fontWeight: FW.heavy, color: Z.da, fontFamily: COND,
          }}>
            {[errors.headline && "Headline", errors.style && "Style", errors.colors && "Colors"]
              .filter(Boolean).join(" · ")} missing
          </span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <ErrorWrap hasError={!!errors.headline}>
          <Inp
            label="Headline / CTA *"
            value={brief.headline}
            onChange={e => onChange("headline", e.target.value)}
            placeholder="e.g. Grand Opening Sale — 20% Off"
          />
        </ErrorWrap>
        <ErrorWrap hasError={!!errors.style}>
          <Inp
            label="Style Direction *"
            value={brief.style}
            onChange={e => onChange("style", e.target.value)}
            placeholder="e.g. Modern, clean, wine-country feel"
          />
        </ErrorWrap>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <ErrorWrap hasError={!!errors.colors}>
          <Inp
            label="Brand Colors *"
            value={brief.colors}
            onChange={e => onChange("colors", e.target.value)}
            placeholder="e.g. Navy + gold, or use logo colors"
          />
        </ErrorWrap>
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
