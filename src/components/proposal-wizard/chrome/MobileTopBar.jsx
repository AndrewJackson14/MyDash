// ============================================================
// MobileTopBar — sticky 56px bar for the mobile wizard
//
// Three zones, fixed-grid:
//   left  : Cancel — chevron-left + "Cancel" word; tap → cancel handler
//           (which itself decides whether to confirm vs close immediately)
//   center: "Step X of Y · StepName" — tappable, opens the step jump sheet
//   right : "$N,NNN ⌃" — tappable, opens the deal summary sheet
//
// Solid Z.bg, 1px Z.bd hairline at the bottom. No glass anywhere.
// safe-area-inset-top so the iOS notch / Dynamic Island doesn't eat
// the bar.
// ============================================================
import { Z, COND, FS, FW } from "../../../lib/theme";
import Ic from "../../ui/Icons";

const fmtMoney = (n) => "$" + (Math.round(Number(n) || 0)).toLocaleString();

export default function MobileTopBar({
  stepIndex,        // 1-based visible step number (e.g. 3)
  stepCount,        // total visible steps (e.g. 6 or 7)
  stepLabel,        // e.g. "Issues"
  total,            // dollar amount, integer
  onCancel,         // tap on left
  onTapStep,        // tap on center → step jump sheet
  onTapTotal,       // tap on right → deal summary sheet
}) {
  return (
    <div
      style={{
        flexShrink: 0,
        background: Z.bg,
        borderBottom: `1px solid ${Z.bd}`,
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div style={{
        height: 56,
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: 4,
        padding: "0 8px",
      }}>
        {/* Left — Cancel */}
        <button
          onClick={onCancel}
          aria-label="Cancel"
          style={{
            display: "inline-flex", alignItems: "center", gap: 2,
            background: "transparent", border: "none",
            cursor: "pointer",
            padding: "10px 8px",
            minHeight: 44,
            color: Z.tm,
            fontFamily: COND,
            fontSize: FS.sm,
            fontWeight: FW.semi,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            <Ic.back size={16} />
          </span>
          <span>Cancel</span>
        </button>

        {/* Center — Step indicator (tap → jump sheet) */}
        <button
          onClick={onTapStep}
          aria-label={`Step ${stepIndex} of ${stepCount}: ${stepLabel}. Tap to jump`}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            background: "transparent", border: "none", cursor: "pointer",
            padding: "10px 8px",
            minHeight: 44,
            minWidth: 0,
            color: Z.tx,
            fontFamily: COND,
          }}
        >
          <span style={{ fontSize: 11, color: Z.tm, fontWeight: FW.bold, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
            Step {stepIndex} of {stepCount}
          </span>
          <span style={{ fontSize: 11, color: Z.td }}>·</span>
          <span style={{
            fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tx,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            minWidth: 0,
          }}>
            {stepLabel}
          </span>
          <span style={{ fontSize: 10, color: Z.tm, marginLeft: 1 }}>▾</span>
        </button>

        {/* Right — Total (tap → summary sheet) */}
        <button
          onClick={onTapTotal}
          aria-label={`Total ${fmtMoney(total)}. Tap to see deal summary`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: "transparent", border: "none", cursor: "pointer",
            padding: "10px 8px",
            minHeight: 44,
            color: Z.tx,
            fontFamily: COND,
            fontSize: FS.sm,
            fontWeight: FW.heavy,
          }}
        >
          <span>{fmtMoney(total)}</span>
          <span style={{ fontSize: 10, color: Z.tm }}>▴</span>
        </button>
      </div>
    </div>
  );
}
