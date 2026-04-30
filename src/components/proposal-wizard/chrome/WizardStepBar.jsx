// ============================================================
// WizardStepBar — top horizontal stepper
//
// Renders the 7 (or 6, when no print pubs) numbered steps with
// the DEAL → INTAKE phase pivot between steps 5 and 6. Completed
// steps are clickable; uncompleted future steps are not.
// ============================================================

import { Z, FS, FW, COND, Ri, INV } from "../../../lib/theme";
import Ic from "../../ui/Icons";
import {
  STEPS,
  PHASE_LABELS,
  PHASE_PIVOT_AFTER_STEP,
  STEP_IDS,
} from "../proposalWizardConstants";
import { hasAnyPrintFormat } from "../proposalWizardValidation";

export default function WizardStepBar({ state, currentStep, completedSteps, onGoto }) {
  const visibleSteps = STEPS.filter(s => {
    if (s.conditional === "anyPrint") return hasAnyPrintFormat(state);
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 4px" }}>
      {/* Phase labels — DEAL on the left, INTAKE on the right */}
      <div style={{ display: "flex", gap: 8, position: "relative", height: 16, alignItems: "center" }}>
        {visibleSteps.map((s, idx) => {
          const isFirstOfPhase =
            idx === 0 || visibleSteps[idx - 1].phase !== s.phase;
          return (
            <div key={s.id} style={{ flex: 1, position: "relative" }}>
              {isFirstOfPhase && (
                <span style={{
                  position: "absolute", left: 0, top: 0,
                  fontSize: FS.micro, fontWeight: FW.heavy, letterSpacing: 0.5,
                  textTransform: "uppercase", color: Z.tm, fontFamily: COND,
                }}>{PHASE_LABELS[s.phase]}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Step pills */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
        {visibleSteps.map((s, idx) => {
          const completed = !!completedSteps[s.id];
          const current   = currentStep === s.id;
          const clickable = completed || current;

          // Vertical phase divider sits in the connector line between
          // step 5 and step 6.
          const showPhaseDivider =
            idx > 0 &&
            visibleSteps[idx - 1].id === PHASE_PIVOT_AFTER_STEP &&
            s.phase === "intake";

          const segmentBorder = current
            ? `1px solid ${Z.ac}`
            : completed
              ? `1px solid ${Z.go}`
              : `1px solid ${Z.bd}`;
          const segmentBg = current
            ? Z.ac + "12"
            : completed
              ? Z.go + "12"
              : "transparent";
          const labelColor = current ? Z.ac : completed ? Z.go : Z.tm;

          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", flex: 1, gap: 8 }}>
              {showPhaseDivider && (
                <div style={{
                  width: 2, height: 24, background: Z.bd, borderRadius: 1, marginRight: 4,
                }} />
              )}
              <button
                onClick={clickable ? () => onGoto(s.id) : undefined}
                disabled={!clickable}
                style={{
                  flex: 1,
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px",
                  borderRadius: Ri,
                  border: segmentBorder,
                  background: segmentBg,
                  cursor: clickable ? "pointer" : "default",
                  fontFamily: COND,
                  textAlign: "left",
                  opacity: clickable ? 1 : 0.65,
                }}
              >
                {/* Step number badge */}
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 22, height: 22, borderRadius: "50%",
                  background: completed ? Z.go : current ? Z.ac : "transparent",
                  border: completed || current ? "none" : `1px solid ${Z.bd}`,
                  color: completed || current ? INV.light : Z.tm,
                  fontSize: FS.xs, fontWeight: FW.heavy,
                  flexShrink: 0,
                }}>
                  {completed ? <Ic.check size={11} color={INV.light} /> : (idx + 1)}
                </span>
                <span style={{
                  fontSize: FS.sm,
                  fontWeight: current ? FW.heavy : FW.bold,
                  color: labelColor,
                  whiteSpace: "nowrap",
                  overflow: "hidden", textOverflow: "ellipsis",
                }}>{s.label}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
