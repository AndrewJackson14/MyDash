// MobileHeader — the 52pt app header per Spec 056 §2.2.1.
// Title left, optional right-icon action, optional back-arrow when
// not on a root tab. Sits below the OS status bar safe area.
import { TOKENS, SURFACE } from "./mobileTokens";

export default function MobileHeader({ title, onBack, right, sub }) {
  return <div style={{
    position: "sticky", top: 0, zIndex: 10,
    background: SURFACE.elevated,
    borderBottom: `1px solid ${TOKENS.rule}`,
    paddingTop: "env(safe-area-inset-top)",
  }}>
    <div style={{
      display: "flex", alignItems: "center",
      padding: "12px 14px", minHeight: 52,
      gap: 10,
    }}>
      {onBack && <button onClick={onBack} aria-label="Back" style={{
        width: 40, height: 40, marginLeft: -8,
        background: "transparent", border: "none",
        cursor: "pointer", color: TOKENS.ink,
        fontSize: 22, fontWeight: 600, padding: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>‹</button>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 18, fontWeight: 700, color: TOKENS.ink,
          letterSpacing: -0.3,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: TOKENS.muted, marginTop: 1 }}>{sub}</div>}
      </div>
      {right}
    </div>
  </div>;
}
