// ============================================================
// MobileStepJumpSheet — bottom sheet listing every visible step
//
// Triggered by tapping the step indicator in the MobileTopBar.
// Lists each visible step as a row with:
//   1.  ✓  Client & Publications     "Client picked, 2 pubs"
//   3.  ✓  Sizes & Flights           ← active
//   5.     Brief & Art               "not started"
//
// Tapping a row jumps to that step IF it's completed or current.
// Future-uncompleted rows are visually disabled. Closes the sheet
// on jump.
// ============================================================
import { Z, COND, FS, FW, Ri } from "../../../lib/theme";
import Ic from "../../ui/Icons";
import MobileSheet from "./MobileSheet";

export default function MobileStepJumpSheet({
  open,
  onClose,
  visibleSteps,        // [{ id, label, phase, ... }] (already filtered by anyPrint)
  currentStepId,
  completedSteps,      // map: { [stepId]: true }
  onGoto,              // (stepId) => void
  summaryFor,          // (stepId) => string | null  (e.g. "Client picked, 2 pubs")
}) {
  return (
    <MobileSheet open={open} onClose={onClose} title="Jump to step">
      <div style={{ display: "flex", flexDirection: "column" }}>
        {visibleSteps.map((s, idx) => {
          const completed = !!completedSteps[s.id];
          const current = currentStepId === s.id;
          const clickable = completed || current;
          const summary = summaryFor?.(s.id);

          return (
            <button
              key={s.id}
              onClick={() => {
                if (!clickable) return;
                onGoto(s.id);
                onClose();
              }}
              disabled={!clickable}
              aria-current={current ? "step" : undefined}
              style={{
                display: "grid",
                gridTemplateColumns: "32px 24px 1fr auto",
                gap: 12,
                alignItems: "center",
                padding: "14px 16px",
                minHeight: 56,
                background: current ? Z.ac + "10" : "transparent",
                border: "none",
                borderBottom: idx === visibleSteps.length - 1 ? "none" : `1px solid ${Z.bd}`,
                cursor: clickable ? "pointer" : "default",
                textAlign: "left",
                fontFamily: COND,
                color: Z.tx,
                opacity: clickable ? 1 : 0.55,
              }}
            >
              {/* Step number */}
              <span style={{
                fontSize: FS.sm, fontWeight: FW.heavy,
                color: current ? Z.ac : completed ? Z.go : Z.td,
                textAlign: "center",
              }}>
                {idx + 1}.
              </span>

              {/* Status icon */}
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                {completed
                  ? <Ic.check size={14} color={Z.go} />
                  : current
                    ? <span style={{ width: 8, height: 8, borderRadius: 999, background: Z.ac }} />
                    : <span style={{ width: 8, height: 8, borderRadius: 999, border: `1px solid ${Z.bd}` }} />
                }
              </span>

              {/* Label + sub */}
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: FS.base, fontWeight: current ? FW.heavy : FW.bold,
                  color: current ? Z.ac : Z.tx,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{s.label}</div>
                {summary && (
                  <div style={{
                    fontSize: 11, color: Z.tm, marginTop: 2,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{summary}</div>
                )}
              </div>

              {/* Active marker */}
              {current && (
                <span style={{
                  fontSize: 10, fontWeight: FW.heavy, color: Z.ac,
                  letterSpacing: 0.5, textTransform: "uppercase",
                  background: Z.ac + "18",
                  padding: "2px 8px",
                  borderRadius: Ri,
                }}>Active</span>
              )}
            </button>
          );
        })}
      </div>
    </MobileSheet>
  );
}
