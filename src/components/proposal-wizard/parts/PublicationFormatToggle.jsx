// ============================================================
// PublicationFormatToggle — pill pair for print / digital
// Both pills can be active simultaneously (mixed proposals).
// At least one must be active per pub (validateStep2 guard).
// ============================================================

import { Z, FS, FW, COND, Ri, INV } from "../../../lib/theme";

function Pill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "6px 14px",
        borderRadius: 999,
        border: `1px solid ${active ? Z.ac : Z.bd}`,
        background: active ? Z.ac : "transparent",
        color: active ? INV.light : Z.tm,
        fontSize: FS.sm,
        fontWeight: active ? FW.bold : FW.normal,
        fontFamily: COND,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export default function PublicationFormatToggle({ formats, onToggle, error }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          fontSize: 10, fontWeight: FW.heavy, color: Z.td,
          letterSpacing: 0.5, textTransform: "uppercase", fontFamily: COND,
          minWidth: 60,
        }}>Format</span>
        <div style={{ display: "flex", gap: 6, flex: 1 }}>
          <Pill active={!!formats?.print}   onClick={() => onToggle("print")}>
            {formats?.print ? "✓ " : ""}Print
          </Pill>
          <Pill active={!!formats?.digital} onClick={() => onToggle("digital")}>
            {formats?.digital ? "✓ " : ""}Digital
          </Pill>
        </div>
      </div>
      {error && (
        <div style={{ fontSize: 11, color: Z.da, fontFamily: COND, paddingLeft: 68 }}>{error}</div>
      )}
    </div>
  );
}
