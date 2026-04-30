// ============================================================
// ProposalWizardMobile — Checkpoint 2 mobile shell
//
// Full-screen takeover for viewport widths under 768px. Consumes
// the SAME orchestration hook as the desktop shell (one hook
// instance owns autosave + send flow + step routing) and lays
// out the chrome the spec describes:
//
//   ┌──────────────────────────────────────────┐
//   │ ← Cancel    Step 3 of 7    $4,250 ⌃     │  TopBar (56px)
//   ├──────────────────────────────────────────┤
//   │  [Step content, single column, scroll-y] │
//   │                                          │
//   ├──────────────────────────────────────────┤
//   │  Saved · 12s ago                         │  SaveStatus (24px, optional)
//   ├──────────────────────────────────────────┤
//   │  [Back]              [    Next →    ]    │  Footer (64px)
//   └──────────────────────────────────────────┘
//
// Sent! confirmation + cancel-confirm both render via MobileSheet.
// Step contents themselves are still the desktop step components —
// CP3 polishes those for narrow widths. CP2 surfaces only the chrome.
//
// Per spec: solid Z.bg surfaces, no glass, no backdrop blur. The
// scoped CSS rule below collapses any 1fr 1fr / 1fr 2fr grids inside
// step components to single column on mobile so they at least fit.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { Z, LIGHT, DARK, COND, FS, FW } from "../../lib/theme";
import Ic from "../ui/Icons";
import { selectPTotal } from "./useProposalWizard";
import { STEP_IDS } from "./proposalWizardConstants";

// Hotfix: the wizard step components use inline JS-Z values, while the
// page chrome uses CSS vars (--ink/--paper/--canvas). When the two
// systems disagree, step content renders dark-on-dark or light-on-light.
// Force-sync Z to the live CSS theme on mount; restore on unmount.
// Proper fix is CP3 — migrate step inline-styles to CSS vars.
function syncZToCssTheme() {
  if (typeof document === "undefined") return null;
  const cssIsDark = document.documentElement.dataset.theme === "dark";
  const snapshot = { ...Z };
  Object.assign(Z, cssIsDark ? DARK : LIGHT);
  return snapshot;
}
import MobileTopBar           from "./chrome/MobileTopBar";
import MobileFooter           from "./chrome/MobileFooter";
import MobileSheet            from "./chrome/MobileSheet";
import MobileStepJumpSheet    from "./chrome/MobileStepJumpSheet";
import MobileDealSummarySheet from "./chrome/MobileDealSummarySheet";

export default function ProposalWizardMobile({ orch }) {
  // Force-sync Z to match the CSS theme BEFORE first render so step
  // components see consistent values. Lazy ref runs once before children.
  const zSnapshotRef = useRef(undefined);
  if (zSnapshotRef.current === undefined) {
    zSnapshotRef.current = syncZToCssTheme();
  }
  useEffect(() => {
    return () => {
      if (zSnapshotRef.current) Object.assign(Z, zSnapshotRef.current);
    };
  }, []);

  const {
    state, actions,
    sentScreen, isSending, sendStatusMsg,
    ctx,
    canSend, canGoNext,
    stepBarSteps,
    activeStep,
    handleNext, handleBack,
    handleSaveDraft, handleSend,
    onClose,
    stepProps,
  } = orch;

  const clients = stepProps.clients;

  // Sheet visibility
  const [jumpOpen, setJumpOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Live total for the TopBar pill.
  const total = selectPTotal(state, ctx);

  // Step indicator wiring — visible steps only (Issues drops if no
  // print format selected).
  const visibleSteps = stepBarSteps;
  const visibleIdx = Math.max(0, visibleSteps.findIndex(s => s.id === state.currentStep));
  const stepLabel = visibleSteps[visibleIdx]?.label || "";
  const isReview = state.currentStep === STEP_IDS.REVIEW;
  const isFirst  = state.currentStep === STEP_IDS.CLIENT;

  // Per-step short summary for the jump sheet. Read-only — no logic
  // changes, just descriptive labels derived from current state.
  const summaryFor = (stepId) => {
    if (stepId === STEP_IDS.CLIENT) {
      const cn = clients.find(c => c.id === state.clientId)?.name;
      const pubCount = state.pubs.length;
      if (!cn) return "Pick a client";
      return `${cn}${pubCount ? ` · ${pubCount} pub${pubCount === 1 ? "" : "s"}` : ""}`;
    }
    if (stepId === STEP_IDS.ISSUES) {
      const issueCount = Object.values(state.issuesByPub).reduce((n, arr) => n + arr.length, 0);
      const pubCount = Object.keys(state.issuesByPub).filter(k => state.issuesByPub[k].length > 0).length;
      return issueCount === 0
        ? "Pick issues"
        : `${issueCount} issue${issueCount === 1 ? "" : "s"} across ${pubCount} pub${pubCount === 1 ? "" : "s"}`;
    }
    if (stepId === STEP_IDS.SIZES_AND_FLIGHTS) {
      const sized = Object.keys(state.defaultSizeByPub).length;
      const dLines = state.digitalLines.length;
      const bits = [];
      if (sized) bits.push(`${sized} default size${sized === 1 ? "" : "s"}`);
      if (dLines) bits.push(`${dLines} digital line${dLines === 1 ? "" : "s"}`);
      return bits.join(" · ") || "Pick ad sizes";
    }
    if (stepId === STEP_IDS.PAYMENT_TERMS) {
      const labels = { per_issue: "Per issue", monthly: "Monthly", lump_sum: "Lump sum" };
      return labels[state.payTiming] || "Pick payment timing";
    }
    if (stepId === STEP_IDS.BRIEF_AND_ART_SOURCE) {
      const labels = { we_design: "We design", camera_ready: "Camera-ready" };
      return labels[state.artSource] || "Pick art source";
    }
    if (stepId === STEP_IDS.REVIEW) {
      return canSend ? "Ready to send" : "Resolve any flagged items";
    }
    return null;
  };

  // Cancel button in the TopBar — confirm-and-discard only when there's
  // meaningful state. Otherwise close immediately.
  const hasMeaningfulState =
    !!state.clientId ||
    state.pubs.length > 0 ||
    Object.keys(state.issuesByPub).some(k => state.issuesByPub[k]?.length) ||
    state.digitalLines.length > 0 ||
    !!state.brief?.headline ||
    !!state.brief?.style ||
    !!state.brief?.colors ||
    !!state.brief?.instructions;

  const onCancelTap = () => {
    if (hasMeaningfulState) setConfirmOpen(true);
    else onClose?.();
  };

  // Sent! confirmation screen — full takeover, replaces the wizard chrome.
  if (sentScreen) {
    return <SentScreen orch={orch} sentScreen={sentScreen} />;
  }

  return (
    <div
      role="dialog"
      aria-label="Build proposal"
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: Z.bg,
        display: "flex", flexDirection: "column",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {/* Scoped grid override — collapses desktop step components'
          1fr 1fr / 1fr 2fr grids to single column so they at least
          fit at narrow widths. CP3 will polish each step properly. */}
      <style>{`
        [data-mobile-wizard] [style*="grid-template-columns: 1fr 1fr"],
        [data-mobile-wizard] [style*="gridTemplateColumns: 1fr 1fr"] {
          grid-template-columns: 1fr !important;
        }
        [data-mobile-wizard] [style*="grid-template-columns: 1fr 2fr"],
        [data-mobile-wizard] [style*="gridTemplateColumns: 1fr 2fr"] {
          grid-template-columns: 1fr !important;
        }
        [data-mobile-wizard] [style*="max-width: 820"],
        [data-mobile-wizard] [style*="maxWidth: 820"],
        [data-mobile-wizard] [style*="max-width: 760"],
        [data-mobile-wizard] [style*="maxWidth: 760"],
        [data-mobile-wizard] [style*="max-width: 720"],
        [data-mobile-wizard] [style*="maxWidth: 720"],
        [data-mobile-wizard] [style*="max-width: 640"],
        [data-mobile-wizard] [style*="maxWidth: 640"] {
          max-width: 100% !important;
        }
      `}</style>

      <MobileTopBar
        stepIndex={visibleIdx + 1}
        stepCount={visibleSteps.length}
        stepLabel={stepLabel}
        total={total}
        onCancel={onCancelTap}
        onTapStep={() => setJumpOpen(true)}
        onTapTotal={() => setSummaryOpen(true)}
      />

      {/* Body — single-column scroll container holding the active step */}
      <div
        data-mobile-wizard
        style={{
          flex: 1, minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "16px",
        }}
      >
        {activeStep}
        {sendStatusMsg && (
          <div style={{
            marginTop: 14, padding: "10px 12px", borderRadius: 10,
            background: (sendStatusMsg.tone === "error" ? Z.da : Z.go) + "12",
            border: `1px solid ${(sendStatusMsg.tone === "error" ? Z.da : Z.go)}40`,
            color: Z.tx, fontSize: FS.sm, fontFamily: COND,
          }}>
            {sendStatusMsg.msg}
          </div>
        )}
      </div>

      {/* Save status row — 24px tall, only renders when there's
          something to say. Sits between body and footer. */}
      {state.saveStatus && state.saveStatus !== "idle" && (
        <SaveStatusRow status={state.saveStatus} lastSavedAt={state.lastSavedAt} />
      )}

      <MobileFooter
        isReview={isReview}
        isFirst={isFirst}
        canGoNext={canGoNext}
        canSend={canSend}
        isSending={isSending}
        nextLabel={state.currentStep === STEP_IDS.BRIEF_AND_ART_SOURCE ? "Review" : "Next"}
        onBack={handleBack}
        onNext={handleNext}
        onSaveDraft={handleSaveDraft}
        onSend={handleSend}
      />

      {/* Bottom sheets */}
      <MobileStepJumpSheet
        open={jumpOpen}
        onClose={() => setJumpOpen(false)}
        visibleSteps={visibleSteps}
        currentStepId={state.currentStep}
        completedSteps={state.completedSteps}
        onGoto={(id) => actions.gotoStep(id)}
        summaryFor={summaryFor}
      />
      <MobileDealSummarySheet
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        state={state}
        ctx={ctx}
        clients={clients}
      />

      {/* Discard-confirm sheet — only opens when Cancel was tapped
          with meaningful state in flight. */}
      <MobileSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Discard draft?"
      >
        <div style={{ padding: "12px 16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{
            margin: 0,
            fontSize: FS.sm, color: Z.tm, fontFamily: COND,
            lineHeight: 1.5,
          }}>
            Your work won't be saved as a sent proposal. A draft was auto-saved while you typed — you can come back to it later from the client profile.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              onClick={() => setConfirmOpen(false)}
              style={{
                minHeight: 44,
                background: "transparent",
                color: Z.tx,
                border: `1px solid ${Z.bd}`,
                borderRadius: 10,
                padding: "0 14px",
                fontSize: FS.base, fontWeight: FW.bold, fontFamily: COND,
                cursor: "pointer",
              }}
            >Keep editing</button>
            <button
              onClick={() => { setConfirmOpen(false); onClose?.(); }}
              style={{
                minHeight: 44,
                background: Z.da,
                color: "#FFFFFF",
                border: "none",
                borderRadius: 10,
                padding: "0 14px",
                fontSize: FS.base, fontWeight: FW.heavy, fontFamily: COND,
                cursor: "pointer",
              }}
            >Discard</button>
          </div>
        </div>
      </MobileSheet>
    </div>
  );
}

// ─── Save status row ─────────────────────────────────────────
function SaveStatusRow({ status, lastSavedAt }) {
  let label = "";
  let color = Z.tm;
  if (status === "saving") label = "Saving…";
  else if (status === "saved") {
    label = lastSavedAt
      ? `Saved · ${fmtRelative(lastSavedAt)}`
      : "Saved";
    color = Z.go;
  } else if (status === "error") {
    label = "Save failed — retrying";
    color = Z.da;
  }
  if (!label) return null;
  return (
    <div style={{
      flexShrink: 0,
      height: 24,
      display: "flex", alignItems: "center",
      padding: "0 16px",
      background: Z.bg,
      borderTop: `1px solid ${Z.bd}`,
      fontSize: FS.xs, color, fontFamily: COND, fontWeight: FW.bold,
    }}>{label}</div>
  );
}

function fmtRelative(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.round(ms / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// ─── Sent! confirmation (mobile takeover) ────────────────────
function SentScreen({ orch, sentScreen }) {
  const { state, onClose, onSignedFromConfirm } = orch;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: Z.bg,
      display: "flex", flexDirection: "column",
      paddingTop: "env(safe-area-inset-top)",
      paddingBottom: "env(safe-area-inset-bottom)",
    }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
        <div style={{
          width: 56, height: 56, borderRadius: 28,
          background: Z.go + "18",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}><Ic.check size={28} color={Z.go} /></div>
        <div style={{ fontSize: FS.title, fontWeight: FW.black, color: Z.tx, fontFamily: COND, letterSpacing: -0.3 }}>
          Sent!
        </div>
        <div style={{ fontSize: FS.base, color: Z.tx, fontFamily: COND, maxWidth: 320, lineHeight: 1.5 }}>
          Proposal sent to {state.emailRecipients.length} {state.emailRecipients.length === 1 ? "recipient" : "recipients"}.
        </div>
        <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND, maxWidth: 320, lineHeight: 1.5 }}>
          When the client signs, this converts to a contract automatically. Reference photos you uploaded re-tag to the new ad project on conversion.
        </div>
      </div>
      <div style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button
          onClick={onClose}
          style={{
            minHeight: 44,
            background: "transparent",
            color: Z.tx,
            border: `1px solid ${Z.bd}`,
            borderRadius: 10,
            padding: "0 14px",
            fontSize: FS.base, fontWeight: FW.bold, fontFamily: COND,
            cursor: "pointer",
          }}
        >Close</button>
        <button
          onClick={async () => {
            if (onSignedFromConfirm) await onSignedFromConfirm(sentScreen.proposalId);
          }}
          style={{
            minHeight: 44,
            background: "var(--action)",
            color: "#FFFFFF",
            border: "none",
            borderRadius: 10,
            padding: "0 14px",
            fontSize: FS.base, fontWeight: FW.heavy, fontFamily: COND,
            cursor: "pointer",
          }}
        >Client signed</button>
      </div>
    </div>
  );
}
