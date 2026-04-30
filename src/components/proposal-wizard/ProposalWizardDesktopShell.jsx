// ============================================================
// ProposalWizardDesktopShell — JSX-only desktop chrome
//
// All state, validation, send flow, step routing live in
// useProposalWizardOrchestration. This file owns presentation:
// the glass Backdrop + Panel + Header, the body grid (step
// content + summary panel), the Footer wiring, and the Sent!
// confirmation screen render.
//
// Mirrors the legacy ProposalWizard render exactly so the
// extraction is a no-op for desktop users.
// ============================================================
import { Z, COND, FS, RADII, EASE, DUR, ZI, FONT, MODAL } from "../../lib/theme";
import Ic from "../ui/Icons";
import WizardStepBar      from "./chrome/WizardStepBar";
import WizardFooter       from "./chrome/WizardFooter";
import WizardSummaryPanel from "./chrome/WizardSummaryPanel";
import { STEP_IDS } from "./proposalWizardConstants";

export default function ProposalWizardDesktopShell({ orch }) {
  const {
    state, actions,
    sentScreen, isSending,
    ctx,
    canSend, canGoNext,
    stepBarSteps,
    showSummaryPanel,
    title,
    activeStep,
    handleNext, handleBack,
    handleSaveDraft, handleSend,
    onClose, onSignedFromConfirm,
  } = orch;

  // Sent! confirmation screen ────────────────────────────────
  if (sentScreen) {
    return (
      <Backdrop onClose={onClose}>
        <Panel width={560}>
          <Header title="Sent!" onClose={onClose} />
          <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
            <Ic.check size={32} color={Z.go} />
            <div style={{ fontSize: FS.lg, color: Z.tx, fontFamily: COND, textAlign: "center" }}>
              Proposal sent to {state.emailRecipients.length} {state.emailRecipients.length === 1 ? "recipient" : "recipients"}.
            </div>
            <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND, textAlign: "center", maxWidth: 360 }}>
              When the client signs, this will convert to a contract and create confirmed sales orders. Reference photos you uploaded will be re-tagged to the new ad project automatically.
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                onClick={() => onClose()}
                style={btnGhost}
              >Close</button>
              <button
                onClick={async () => {
                  if (onSignedFromConfirm) await onSignedFromConfirm(sentScreen.proposalId);
                }}
                style={btnPrimary}
              >Client Signed → Convert to Contract</button>
            </div>
          </div>
        </Panel>
      </Backdrop>
    );
  }

  return (
    <Backdrop onClose={onClose}>
      <Panel width={1200}>
        <Header title={title} onClose={onClose} />

        {/* Step bar lives in its own band below the title */}
        <div style={{
          padding: "12px 24px 14px",
          borderBottom: `1px solid ${Z.glassBorder}`,
          flexShrink: 0,
        }}>
          <WizardStepBar
            state={state}
            currentStep={state.currentStep}
            completedSteps={state.completedSteps}
            onGoto={(step) => actions.gotoStep(step)}
          />
        </div>

        {/* Body — flex row: step content (left) + summary panel (right) */}
        <div style={{
          flex: 1, minHeight: 0, overflow: "hidden",
          display: "flex", gap: 20, padding: 24,
        }}>
          <div style={{
            flex: 1, minWidth: 0, overflow: "auto",
            display: "flex", flexDirection: "column", gap: 14,
          }}>
            {activeStep}
          </div>
          {showSummaryPanel && <WizardSummaryPanel state={state} ctx={ctx} clients={orch.stepProps.clients} />}
        </div>

        <WizardFooter
          currentStep={state.currentStep}
          totalSteps={stepBarSteps.length}
          saveStatus={state.saveStatus}
          lastSavedAt={state.lastSavedAt}
          canGoNext={canGoNext}
          canSend={canSend}
          isSending={isSending}
          nextLabel={state.currentStep === STEP_IDS.BRIEF_AND_ART_SOURCE ? "Review" : "Next"}
          onCancel={onClose}
          onBack={handleBack}
          onNext={handleNext}
          onSaveDraft={handleSaveDraft}
          onSend={handleSend}
        />
      </Panel>
    </Backdrop>
  );
}

// ─── Shell primitives ─────────────────────────────────────
function Backdrop({ children, onClose }) {
  const dark = Z.bg === "#08090D";
  return (
    <div
      tabIndex={-1}
      style={{
        position: "fixed", inset: 0,
        background: dark ? "rgba(0,0,0,0.55)" : "rgba(15,29,44,0.35)",
        backdropFilter: "blur(12px) saturate(180%)",
        WebkitBackdropFilter: "blur(12px) saturate(180%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: ZI.max,
        outline: "none",
        animation: `v2FadeIn ${DUR.med}ms ${EASE}`,
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={e => { if (e.key === "Escape") onClose(); }}
    >
      {children}
    </div>
  );
}

function Panel({ children, width = 1200 }) {
  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        background: Z.glassBg,
        backdropFilter: "blur(40px) saturate(180%)",
        WebkitBackdropFilter: "blur(40px) saturate(180%)",
        border: `1px solid ${Z.glassBorder}`,
        borderRadius: RADII.xl,
        boxShadow: Z.glassShadow,
        width,
        maxWidth: "94vw",
        height: "88vh",
        maxHeight: "88vh",
        display: "flex", flexDirection: "column",
        animation: `v2ScaleIn ${DUR.slow}ms ${EASE}`,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function Header({ title, onClose }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: MODAL.pad, borderBottom: `1px solid ${Z.glassBorder}`, flexShrink: 0,
    }}>
      <h3 style={{
        margin: 0, fontSize: 18, fontWeight: 600,
        color: Z.fgPrimary, fontFamily: FONT.display, letterSpacing: "-0.02em",
      }}>{title}</h3>
      <button onClick={onClose} style={{
        background: "none", border: "none", cursor: "pointer", color: Z.fgMuted,
      }}><Ic.close size={18} /></button>
    </div>
  );
}

const btnPrimary = {
  display: "inline-flex", alignItems: "center", gap: 6,
  border: "none", cursor: "pointer",
  borderRadius: 10, padding: "9px 22px",
  background: "var(--action)", color: "#FFFFFF",
  fontSize: FS.base, fontWeight: 700, fontFamily: COND,
};

const btnGhost = {
  display: "inline-flex", alignItems: "center", gap: 6,
  border: `1px solid ${Z.bd}`, cursor: "pointer",
  borderRadius: 10, padding: "9px 22px",
  background: "transparent", color: Z.tm,
  fontSize: FS.base, fontWeight: 700, fontFamily: COND,
};
