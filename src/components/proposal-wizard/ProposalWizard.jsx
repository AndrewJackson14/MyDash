// ============================================================
// ProposalWizard — viewport router
//
// Pre-Checkpoint-1 this file owned everything: state, send flow,
// step routing, and the desktop chrome. It's now a thin shell that
// (a) calls the orchestration hook ONCE, then (b) hands the result
// to whichever shell matches the viewport.
//
// Why one hook instance for both shells? If the desktop and mobile
// shells each called useProposalWizard separately, autosave would
// fire twice, two hydrations would race, and a single resize across
// the breakpoint would lose unsaved state. So: one hook, two views.
//
// See _specs/proposal-wizard-mobile.md for the full plan.
// ============================================================
import { useIsMobile } from "../../hooks/useWindowWidth";
import { useProposalWizardOrchestration } from "./useProposalWizardOrchestration";
import ProposalWizardDesktopShell from "./ProposalWizardDesktopShell";
import ProposalWizardMobile       from "./ProposalWizardMobile";

export default function ProposalWizard(props) {
  const orch = useProposalWizardOrchestration(props);
  const isMobile = useIsMobile();
  return isMobile
    ? <ProposalWizardMobile orch={orch} />
    : <ProposalWizardDesktopShell orch={orch} />;
}
