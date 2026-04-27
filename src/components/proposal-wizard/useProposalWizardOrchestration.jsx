// ============================================================
// useProposalWizardOrchestration — wizard state + send + step routing
//
// Pulled out of ProposalWizard.jsx so the desktop and mobile shells
// can share one hook instance. Two shells consuming two separate
// hook instances would mean two autosave timers, two hydrations,
// two send flows in flight — exactly the bug the spec calls out.
//
// This file owns ALL non-presentational logic that used to sit in
// ProposalWizard. The shells own only JSX (Backdrop, Panel, Header,
// Body grid, Footer wiring, the Sent! confirmation render).
//
// Per spec §"What's not changing", nothing else should touch this
// hook — it's the load-bearing piece for both shells.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { generateProposalHtml, DEFAULT_PROPOSAL_CONFIG } from "../../lib/proposalTemplate";
import { sendGmailEmail, initiateGmailAuth } from "../../lib/gmail";
import { COMPANY } from "../../constants";
import {
  useProposalWizard,
  hydrateStateFromProposal,
  serializeStateToProposalRow,
  selectMonthSpan,
  selectPropLineItems,
  selectPTotal,
  makeInitialState,
} from "./useProposalWizard";
import { STEP_IDS, STEPS } from "./proposalWizardConstants";
import { hasAnyPrintFormat, validateStep, validateStep7 } from "./proposalWizardValidation";

import Step1Client            from "./steps/Step1Client";
import Step3Issues            from "./steps/Step3Issues";
import Step4SizesAndFlights   from "./steps/Step4SizesAndFlights";
import Step5PaymentTerms      from "./steps/Step5PaymentTerms";
import Step6BriefAndArtSource from "./steps/Step6BriefAndArtSource";
import Step7Review            from "./steps/Step7Review";

const cnFromList = (clients, id) => clients.find(c => c.id === id)?.name || "";

export function useProposalWizardOrchestration({
  // Mode/launch
  mode = "new",
  clientId,
  proposalId,
  pendingSaleId,
  initialPrefill,
  // Data
  clients,
  pubs,
  issues,
  digitalAdProducts,
  proposals,
  team,
  currentUser,
  // Persistence
  insertProposal,
  updateProposal,
  loadDigitalAdProducts,
  loadClientDetails,
  // Lifecycle
  onClose,
  onSent,
  onSignedFromConfirm,
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Ensure client contacts/billing info is loaded — Step 5's delivery
  // recipient picker pulls from client.contacts + billingEmail. SalesCRM
  // doesn't trigger this load itself; the wizard does on mount.
  useEffect(() => {
    if (typeof loadClientDetails === "function") loadClientDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build the static ctx the reducer + selectors need.
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
    return `${cn} — Proposal ${new Date().toLocaleDateString()}`;
  }, [clients, clientId]);

  const { state, actions, saveNow } = useProposalWizard({
    initialMode: mode,
    initialClientId: clientId || "",
    initialProposalName: hydratedState ? "" : initialName,
    initialProposalId: proposalId || null,
    hydratedState,
    ctx,
    insertProposal,
    updateProposal,
    today,
  });

  // Lazy-load the digital products catalog when the wizard opens.
  useEffect(() => {
    if (loadDigitalAdProducts) loadDigitalAdProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Send / confirmation flow ─────────────────────────────────
  const [sentScreen, setSentScreen]   = useState(null);
  // sentScreen shape: { proposalId, total, lineCount } | null
  const [isSending, setIsSending]     = useState(false);
  const [sendStatusMsg, setSendStatus] = useState(null);

  // Validation hooks for the active step + step 7 readiness.
  const stepValidation = validateStep(state.currentStep, state);
  const finalValidation = validateStep7(state);
  const canSend = finalValidation.valid;

  // Soft validation rule: Next is enabled even when current step
  // has errors (errors highlight inline). Exceptions:
  //   - Step 4 (Sizes & Flights) is hard-gated — Andrew wants the
  //     rep to confirm a size + a digital product for every selected
  //     pub before advancing. Inline errors stay visible regardless.
  //   - Step 7 → Send is hard-gated by canSend (see Footer).
  const isHardGated = state.currentStep === STEP_IDS.SIZES_AND_FLIGHTS;
  const canGoNext = state.currentStep < STEP_IDS.REVIEW
    && (!isHardGated || stepValidation.valid);

  const stepBarSteps = STEPS.filter(s => {
    if (s.conditional === "anyPrint") return hasAnyPrintFormat(state);
    return true;
  });

  const handleNext = () => {
    if (stepValidation.valid) actions.markCompleted(state.currentStep);
    let next = state.currentStep + 1;
    // PUBLICATIONS step is folded into the CLIENT step body — skip it.
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

  const handleSaveDraft = async () => {
    setIsSending(true);
    try {
      await saveNow("Draft");
    } finally {
      setIsSending(false);
    }
  };

  // Full send flow — runs the same sequence as the pre-wizard
  // sendProposalEmail in SalesCRM.jsx: save → signature →
  // template → Gmail. Mode is "send" (default) or "draft" (Gmail
  // draft only). Errors land in sendStatusMsg for Step 7 to show.
  const performSend = async (sendMode = "send") => {
    if (!canSend) return;
    if (state.emailRecipients.length === 0) {
      setSendStatus({ tone: "error", msg: "Add at least one recipient." });
      return;
    }
    const client = clients.find(c => c.id === state.clientId);
    if (!client) {
      setSendStatus({ tone: "error", msg: "Client not found." });
      return;
    }
    setIsSending(true);
    setSendStatus(null);
    try {
      const monthSpan = selectMonthSpan(state, ctx.issueMap);
      const renewalDate = monthSpan > 1
        ? (() => { const d = new Date(today); d.setMonth(d.getMonth() + monthSpan); return d.toISOString().slice(0, 10); })()
        : null;
      const proposalRow = {
        ...serializeStateToProposalRow(state, ctx, "Sent", today),
        renewalDate,
        sentAt: new Date().toISOString(),
      };

      // 1. Persist with status='Sent'
      const saveRes = await saveNow("Sent");
      if (!saveRes.success) throw new Error(saveRes.error?.message || "Save failed");
      const propId = saveRes.proposalId;

      // 2. Signature row
      const primaryContact = (client.contacts || []).find(c => c.email) || {};
      let signLink = "";
      if (propId) {
        const snapshot = { ...proposalRow, clientName: client?.name };
        const { data: sigData, error: sigErr } = await supabase.from("proposal_signatures").insert({
          proposal_id: propId,
          signer_name: primaryContact.name || client?.name,
          signer_email: state.emailRecipients[0] || primaryContact.email || "",
          proposal_snapshot: snapshot,
        }).select("access_token").single();
        if (sigErr) console.error("[wizard] signature insert error:", sigErr);
        if (sigData?.access_token) signLink = `${window.location.origin}/sign/${sigData.access_token}`;
      }

      // 3. Template config + render HTML
      const teamMember = currentUser
        || (team || []).find(t => t.permissions?.includes("admin"))
        || team?.[0];
      if (!teamMember) throw new Error("No team member found for sending.");

      let templateConfig = { ...DEFAULT_PROPOSAL_CONFIG };
      const { data: templates } = await supabase.from("email_templates")
        .select("config").eq("category", "proposal").eq("is_default", true).limit(1);
      if (templates?.[0]?.config) templateConfig = { ...templateConfig, ...templates[0].config };
      templateConfig.paymentTiming = state.payTiming;

      const htmlBody = generateProposalHtml({
        config: templateConfig,
        proposal: proposalRow,
        client,
        salesperson: teamMember,
        pubs: pubs || [],
        introText: state.emailMessage,
        signLink,
      });

      // 4. Gmail send (or draft)
      const result = await sendGmailEmail({
        teamMemberId: teamMember.id,
        to: state.emailRecipients,
        subject: `Proposal: ${state.proposalName} — ${client?.name || ""}`,
        htmlBody, mode: sendMode,
        emailType: "proposal", clientId: state.clientId, refId: propId, refType: "proposal",
      });

      if (result.needs_auth) {
        const auth = await initiateGmailAuth(teamMember.id);
        if (auth.error) setSendStatus({ tone: "error", msg: `Gmail auth error: ${auth.error}` });
        else setSendStatus({ tone: "warning", msg: "Connect your Gmail account in the popup, then click Send again." });
        return;
      }
      if (!result.success) {
        setSendStatus({ tone: "error", msg: `Email failed: ${result.error || "Unknown error"}` });
        return;
      }

      // 5. Append history (sent | draft)
      if (propId) {
        const { data: propRow } = await supabase.from("proposals").select("history").eq("id", propId).single();
        const hist = Array.isArray(propRow?.history) ? propRow.history : [];
        hist.push({
          event: sendMode === "send" ? "sent" : "draft",
          date: new Date().toISOString(),
          detail: sendMode === "send"
            ? `Sent to ${state.emailRecipients.join(", ")}`
            : "Saved as Gmail draft",
        });
        await supabase.from("proposals").update({ history: hist }).eq("id", propId);
      }

      // 6. Confirmation
      const total = selectPTotal(state, ctx);
      const lines = selectPropLineItems(state, ctx);
      if (sendMode === "send") {
        if (onSent) onSent(propId);
        setSentScreen({ proposalId: propId, total, lineCount: lines.length });
      } else {
        setSendStatus({ tone: "info", msg: "Saved as Gmail draft. Check your drafts folder." });
      }
    } catch (err) {
      console.error("[wizard] send error:", err);
      setSendStatus({ tone: "error", msg: err?.message || String(err) });
    } finally {
      setIsSending(false);
    }
  };

  const handleSend = () => performSend("send");

  // Step routing ──────────────────────────────────────────────
  const stepProps = {
    state, actions, ctx,
    clients, pubs, issues, digitalAdProducts, today,
    team, currentUser,
    validation: stepValidation,
    finalValidation,
    sendStatusMsg,
  };

  let activeStep = null;
  switch (state.currentStep) {
    case STEP_IDS.CLIENT:
    case STEP_IDS.PUBLICATIONS:
      // PUBLICATIONS folded into CLIENT screen — render Step 1 for both
      // so any saved draft that lands on step 2 still shows correctly.
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

  const showSummaryPanel = state.currentStep !== STEP_IDS.REVIEW;
  const titleClient = cnFromList(clients, state.clientId);
  const title = sentScreen
    ? "Sent!"
    : `Build Proposal${titleClient ? ` — ${titleClient}` : ""}`;

  return {
    // Wizard state
    state, actions,

    // Send-flow local state
    sentScreen, isSending, sendStatusMsg,

    // Derived
    ctx,
    canSend,
    canGoNext,
    stepBarSteps,
    showSummaryPanel,
    titleClient, title,

    // Step rendering
    activeStep,
    stepProps,

    // Handlers
    handleNext, handleBack,
    handleSaveDraft, handleSend,

    // Pass-throughs the shells need
    onClose,
    onSignedFromConfirm,
  };
}
