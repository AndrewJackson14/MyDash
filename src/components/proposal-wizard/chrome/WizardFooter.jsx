// ============================================================
// WizardFooter — sticky bottom action bar
//
// Three zones: Cancel (left) | Save status (center) | Back+Next (right).
// On Step 7 the right side becomes Save Draft + Send Now.
// ============================================================

import { Z, FS, FW, COND } from "../../../lib/theme";
import { Btn } from "../../ui/Primitives";
import Ic from "../../ui/Icons";
import { fmtTimeRelative } from "../../../lib/formatters";
import { STEP_IDS } from "../proposalWizardConstants";

function SaveIndicator({ saveStatus, lastSavedAt }) {
  if (saveStatus === "saving") {
    return <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>Saving…</span>;
  }
  if (saveStatus === "saved" && lastSavedAt) {
    return (
      <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
        <Ic.check size={10} color={Z.go} /> Saved · {fmtTimeRelative(lastSavedAt)}
      </span>
    );
  }
  if (saveStatus === "error") {
    return (
      <span style={{ fontSize: FS.xs, color: Z.da, fontFamily: COND, fontWeight: FW.bold }}>
        Save failed — retrying
      </span>
    );
  }
  return null;
}

export default function WizardFooter({
  currentStep,
  totalSteps,
  saveStatus,
  lastSavedAt,
  canGoNext,
  canSend,
  isSending,
  nextLabel,
  onCancel,
  onBack,
  onNext,
  onSaveDraft,
  onSend,
}) {
  const isFirst  = currentStep === STEP_IDS.CLIENT;
  const isReview = currentStep === STEP_IDS.REVIEW;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr auto 1fr",
      alignItems: "center",
      gap: 12,
      padding: "12px 24px",
      borderTop: `1px solid ${Z.glassBorder}`,
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", justifyContent: "flex-start" }}>
        <Btn v="cancel" onClick={onCancel}>Cancel</Btn>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: 140 }}>
        <SaveIndicator saveStatus={saveStatus} lastSavedAt={lastSavedAt} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn v="cancel" onClick={onBack} disabled={isFirst}>Back</Btn>
        {isReview ? (
          <>
            <Btn v="cancel" onClick={onSaveDraft} disabled={isSending}>
              {isSending ? "Saving…" : "Save Draft"}
            </Btn>
            <Btn onClick={onSend} disabled={!canSend || isSending}>
              <Ic.send size={12} /> {isSending ? "Sending…" : "Send Now"}
            </Btn>
          </>
        ) : (
          <Btn onClick={onNext} disabled={!canGoNext}>
            {nextLabel || "Next"} →
          </Btn>
        )}
      </div>
    </div>
  );
}
