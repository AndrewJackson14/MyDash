// ============================================================
// MobileProposalWizard — full-screen page-by-page proposal builder
//
// Wraps the existing useProposalWizard hook + desktop step
// components in a mobile-shaped chrome (full-screen takeover,
// sticky bottom Back/Next bar, no right-rail summary). One step
// at a time. Reuses every selector/reducer from desktop so the
// data model is identical — a draft started here can be opened
// on desktop and vice versa.
//
// Send flow currently saves a draft + opens an email handoff —
// the existing Gmail-based send is desktop-only for now (relies
// on desktop OAuth scope). Reps can finish the send on desktop
// when they're back at one.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { TOKENS, SURFACE, INK, ACCENT, GOLD } from "./mobileTokens";
import { Ic } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { Z, LIGHT, DARK } from "../../lib/theme";

// Hotfix: the wizard step components (Step1Client, Step3Issues, etc.)
// use inline JS-Z values for color/background, while the page chrome
// uses CSS vars (--ink, --paper, --canvas). When the two systems
// disagree (Z = DARK but [data-theme] = light, or vice versa), step
// content renders dark-on-dark or light-on-light. Force-syncs Z to
// match the live CSS theme on mount, restores on unmount. The proper
// fix is CP3 (migrate step inline-styles to CSS vars).
function syncZToCssTheme() {
  if (typeof document === "undefined") return null;
  const cssIsDark = document.documentElement.dataset.theme === "dark";
  const snapshot = { ...Z };
  Object.assign(Z, cssIsDark ? DARK : LIGHT);
  return snapshot;
}
import {
  useProposalWizard,
  hydrateStateFromProposal,
  serializeStateToProposalRow,
  selectMonthSpan,
  selectPropLineItems,
  selectPTotal,
  makeInitialState,
} from "../../components/proposal-wizard/useProposalWizard";
import { STEP_IDS, STEPS } from "../../components/proposal-wizard/proposalWizardConstants";
import { hasAnyPrintFormat, validateStep, validateStep7 } from "../../components/proposal-wizard/proposalWizardValidation";

import Step1Client            from "../../components/proposal-wizard/steps/Step1Client";
import Step3Issues            from "../../components/proposal-wizard/steps/Step3Issues";
import Step4SizesAndFlights   from "../../components/proposal-wizard/steps/Step4SizesAndFlights";
import Step5PaymentTerms      from "../../components/proposal-wizard/steps/Step5PaymentTerms";
import Step6BriefAndArtSource from "../../components/proposal-wizard/steps/Step6BriefAndArtSource";
import Step7Review            from "../../components/proposal-wizard/steps/Step7Review";

const cnFromList = (clients, id) => clients.find(c => c.id === id)?.name || "";

export default function MobileProposalWizard({
  mode = "new",
  clientId,
  proposalId,
  initialPrefill,
  appData,
  currentUser,
  onClose,
  onSent,
}) {
  // Snapshot + force-sync Z BEFORE first render so step components
  // see a Z that matches the CSS theme. Lazy ref initializer runs once,
  // synchronously, before any child renders.
  const zSnapshotRef = useRef(undefined);
  if (zSnapshotRef.current === undefined) {
    zSnapshotRef.current = syncZToCssTheme();
  }
  useEffect(() => {
    return () => {
      // Restore on unmount so other surfaces aren't left with mutated Z.
      if (zSnapshotRef.current) Object.assign(Z, zSnapshotRef.current);
    };
  }, []);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const clients = appData.clients || [];
  const pubs = appData.pubs || appData.allPubs || [];
  const issues = appData.issues || [];
  const proposals = appData.proposals || [];
  const team = appData.team || [];
  const digitalAdProducts = appData.digitalAdProducts || [];

  // Lazy-load digital products on mount, same as desktop.
  useEffect(() => {
    if (appData.loadDigitalAdProducts) appData.loadDigitalAdProducts();
    if (appData.loadClientDetails) appData.loadClientDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build ctx the reducer + selectors need.
  const issueMap = useMemo(() => {
    const m = {};
    (issues || []).forEach(i => { m[i.id] = i; });
    return m;
  }, [issues]);
  const issLabel = (issueId) => issues.find(i => i.id === issueId)?.label || "";
  const ctx = useMemo(() => ({
    pubs, issues, issueMap, issLabel, digitalAdProducts,
  }), [pubs, issues, issueMap, digitalAdProducts]);

  // Hydrate from existing proposal in edit mode, or from a renewal seed.
  const hydratedState = useMemo(() => {
    if (mode === "edit" && proposalId) {
      const p = proposals.find(x => x.id === proposalId);
      if (p) return hydrateStateFromProposal(p, ctx);
    }
    if (mode === "renewal" && initialPrefill) {
      return {
        ...makeInitialState({
          mode: "renewal",
          clientId: clientId || "",
          proposalName: initialPrefill.proposalName || "",
        }),
        ...initialPrefill,
      };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initialName = useMemo(() => {
    const cn = cnFromList(clients, clientId);
    return cn ? `${cn} — Proposal ${new Date().toLocaleDateString()}` : "";
  }, [clients, clientId]);

  const { state, actions, saveNow, saveStatus, lastSavedAt } = useProposalWizard({
    initialMode: mode,
    initialClientId: clientId || "",
    initialProposalName: hydratedState ? "" : initialName,
    initialProposalId: proposalId || null,
    hydratedState,
    ctx,
    insertProposal: appData.insertProposal,
    updateProposal: appData.updateProposal,
    today,
  });

  // Derived: visible steps, validation, navigation predicates.
  const stepValidation = validateStep(state.currentStep, state);
  const finalValidation = validateStep7(state);
  const canSend = finalValidation.valid;
  const isHardGated = state.currentStep === STEP_IDS.SIZES_AND_FLIGHTS;
  const canGoNext = state.currentStep < STEP_IDS.REVIEW
    && (!isHardGated || stepValidation.valid);

  const visibleSteps = STEPS.filter(s => {
    if (s.conditional === "anyPrint") return hasAnyPrintFormat(state);
    return true;
  });
  const visibleIdx = Math.max(0, visibleSteps.findIndex(s => s.id === state.currentStep));
  const totalVisible = visibleSteps.length;

  const handleNext = () => {
    if (stepValidation.valid) actions.markCompleted(state.currentStep);
    let next = state.currentStep + 1;
    if (next === STEP_IDS.PUBLICATIONS) next++;
    if (next === STEP_IDS.ISSUES && !hasAnyPrintFormat(state)) next++;
    if (next > STEP_IDS.REVIEW) next = STEP_IDS.REVIEW;
    actions.gotoStep(next);
  };
  const handleBack = () => {
    let prev = state.currentStep - 1;
    if (prev === STEP_IDS.ISSUES && !hasAnyPrintFormat(state)) prev--;
    if (prev === STEP_IDS.PUBLICATIONS) prev--;
    if (prev < STEP_IDS.CLIENT) prev = STEP_IDS.CLIENT;
    actions.gotoStep(prev);
  };

  // Save flows. "Save & finish on desktop" replaces the desktop
  // wizard's full Gmail send for now — the rep can finalize from
  // their laptop where Gmail OAuth already lives.
  const [isSaving, setIsSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(null);
  const handleSaveDraft = async () => {
    setIsSaving(true);
    setSavedMsg(null);
    try {
      await saveNow("Draft");
      setSavedMsg({ tone: "ok", msg: "Draft saved. Open on desktop to send." });
    } catch (err) {
      setSavedMsg({ tone: "error", msg: err?.message || "Save failed." });
    } finally {
      setIsSaving(false);
    }
  };

  // Step routing — same body as desktop but rendered without the
  // right-rail summary panel. Wrap so internal grids reflow to 1col.
  const stepProps = {
    state, actions, ctx,
    clients, pubs, issues, digitalAdProducts, today,
    team, currentUser,
    validation: stepValidation,
    finalValidation,
    sendStatusMsg: savedMsg,
  };
  let activeStep = null;
  switch (state.currentStep) {
    case STEP_IDS.CLIENT:
    case STEP_IDS.PUBLICATIONS:
      activeStep = <Step1Client {...stepProps} />; break;
    case STEP_IDS.ISSUES:
      activeStep = <Step3Issues {...stepProps} />; break;
    case STEP_IDS.SIZES_AND_FLIGHTS:
      activeStep = <Step4SizesAndFlights {...stepProps} />; break;
    case STEP_IDS.PAYMENT_TERMS:
      activeStep = <Step5PaymentTerms {...stepProps} />; break;
    case STEP_IDS.BRIEF_AND_ART_SOURCE:
      activeStep = <Step6BriefAndArtSource {...stepProps} />; break;
    case STEP_IDS.REVIEW:
      activeStep = <Step7Review {...stepProps} />; break;
    default:
      activeStep = <Step1Client {...stepProps} />;
  }

  const titleClient = cnFromList(clients, state.clientId);
  const stepLabel = visibleSteps[visibleIdx]?.label || "";
  const isReview = state.currentStep === STEP_IDS.REVIEW;

  return (
    <div
      role="dialog"
      aria-label="Build proposal"
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: SURFACE.alt,
        display: "flex", flexDirection: "column",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {/* Mobile-grid override so the desktop step components
          collapse their 1fr 1fr grids to single column inside the
          wizard. Scoped to data-mobile-wizard so we don't disturb
          desktop renders. */}
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

      {/* Header */}
      <div style={{
        flexShrink: 0,
        background: SURFACE.elevated,
        borderBottom: `1px solid ${TOKENS.rule}`,
        paddingTop: "env(safe-area-inset-top)",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 12px", minHeight: 48,
        }}>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              padding: 8, background: "transparent", border: "none",
              cursor: "pointer", color: INK, display: "flex",
            }}
          >
            <Ic.close size={22} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {titleClient || "New proposal"}
            </div>
            <div style={{ fontSize: 11, color: TOKENS.muted, marginTop: 1 }}>
              Step {visibleIdx + 1} of {totalVisible} · {stepLabel}
            </div>
          </div>
          <SaveDot status={saveStatus} />
        </div>
        {/* Progress bar */}
        <div style={{ height: 3, background: TOKENS.rule, position: "relative" }}>
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: `${((visibleIdx + 1) / totalVisible) * 100}%`,
            background: ACCENT,
            transition: "width 200ms ease",
          }} />
        </div>
      </div>

      {/* Body */}
      <div
        data-mobile-wizard
        style={{
          flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch",
          padding: "14px 12px 14px",
        }}
      >
        {activeStep}
        {savedMsg && (
          <div style={{
            marginTop: 12, padding: "10px 12px", borderRadius: 10,
            background: (savedMsg.tone === "error" ? TOKENS.urgent : TOKENS.good) + "12",
            border: `1px solid ${(savedMsg.tone === "error" ? TOKENS.urgent : TOKENS.good)}40`,
            color: INK, fontSize: 13,
          }}>
            {savedMsg.msg}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        flexShrink: 0,
        background: SURFACE.elevated,
        borderTop: `1px solid ${TOKENS.rule}`,
        padding: "10px 12px",
        paddingBottom: "calc(10px + env(safe-area-inset-bottom))",
        display: "flex", gap: 8, alignItems: "center",
      }}>
        <button
          onClick={handleBack}
          disabled={state.currentStep === STEP_IDS.CLIENT}
          style={{
            padding: "12px 14px", minHeight: 48, minWidth: 64,
            background: "transparent",
            border: `1px solid ${TOKENS.rule}`,
            borderRadius: 10,
            color: state.currentStep === STEP_IDS.CLIENT ? TOKENS.muted : INK,
            fontSize: 14, fontWeight: 600, cursor: state.currentStep === STEP_IDS.CLIENT ? "default" : "pointer",
            opacity: state.currentStep === STEP_IDS.CLIENT ? 0.5 : 1,
          }}
        >Back</button>
        <div style={{ flex: 1 }} />
        {isReview ? (
          <button
            onClick={handleSaveDraft}
            disabled={isSaving}
            style={{
              padding: "12px 16px", minHeight: 48,
              background: ACCENT, color: "#FFFFFF",
              border: "none", borderRadius: 10,
              fontSize: 14, fontWeight: 700,
              cursor: isSaving ? "default" : "pointer",
              opacity: isSaving ? 0.6 : 1,
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            {isSaving ? "Saving…" : (
              <><Ic.check size={16} color="#FFFFFF" /><span>Save draft</span></>
            )}
          </button>
        ) : (
          <button
            onClick={handleNext}
            disabled={!canGoNext}
            style={{
              padding: "12px 18px", minHeight: 48,
              background: canGoNext ? ACCENT : TOKENS.rule,
              color: canGoNext ? "#FFFFFF" : TOKENS.muted,
              border: "none", borderRadius: 10,
              fontSize: 14, fontWeight: 700,
              cursor: canGoNext ? "pointer" : "default",
              opacity: canGoNext ? 1 : 0.7,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            Next <span style={{ fontSize: 16, lineHeight: 1 }}>›</span>
          </button>
        )}
      </div>
    </div>
  );
}

function SaveDot({ status }) {
  if (status === "saving") {
    return <span style={{ fontSize: 11, color: TOKENS.muted }}>Saving…</span>;
  }
  if (status === "saved") {
    return (
      <span style={{ fontSize: 11, color: TOKENS.good, display: "inline-flex", alignItems: "center", gap: 3 }}>
        <Ic.check size={12} color={TOKENS.good} /> Saved
      </span>
    );
  }
  if (status === "error") {
    return <span style={{ fontSize: 11, color: TOKENS.urgent }}>Save retry…</span>;
  }
  return null;
}
