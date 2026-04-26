// ============================================================
// Step 1 — Client
//
// Pick the client and confirm/edit the proposal name. Both fields
// are required (validateStep1). The proposal name auto-generates
// when the rep picks a client; an "Auto" pill regenerates it if
// the rep edited and wants to revert.
// ============================================================

import { useRef, useEffect } from "react";
import { Z, FS, FW, COND, Ri } from "../../../lib/theme";
import { Inp } from "../../ui/Primitives";
import FuzzyPicker from "../../FuzzyPicker";
import { ART_SOURCES } from "../proposalWizardConstants";

const StepHeader = ({ title, subtitle }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
    <h2 style={{
      margin: 0, fontSize: 22, fontWeight: 700,
      color: Z.tx, fontFamily: COND, letterSpacing: -0.3,
    }}>{title}</h2>
    {subtitle && (
      <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>{subtitle}</div>
    )}
  </div>
);

const ErrInline = ({ msg }) => msg ? (
  <div style={{ fontSize: 11, color: Z.da, fontFamily: COND, marginTop: 4 }}>{msg}</div>
) : null;

function autoName(clientName) {
  return `${clientName} — Proposal ${new Date().toLocaleDateString()}`;
}

export default function Step1Client({ state, actions, clients, validation }) {
  const errors = validation?.errors || {};
  const wasAutoRef = useRef(true);          // was the current name auto-generated?

  // When the rep picks a different client, auto-update the name only
  // if they haven't manually edited it (wasAuto stays true until they
  // type into the name input).
  useEffect(() => {
    if (!state.clientId) return;
    if (!wasAutoRef.current) return;
    const name = autoName(clients.find(c => c.id === state.clientId)?.name || "");
    if (state.proposalName !== name) actions.setProposalName(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.clientId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 640 }}>
      <StepHeader
        title="Pick a client"
        subtitle="Search or pick from the list. The proposal name auto-fills — edit it if needed."
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <FuzzyPicker
          label="Client"
          value={state.clientId}
          onChange={(v) => { wasAutoRef.current = true; actions.setClient(v); }}
          options={clients.map(c => ({ value: c.id, label: c.name }))}
          placeholder="Search clients…"
        />
        <ErrInline msg={errors.clientId} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <Inp
          label="Proposal Name"
          value={state.proposalName}
          onChange={e => { wasAutoRef.current = false; actions.setProposalName(e.target.value); }}
          placeholder="Acme Co — Proposal 4/26/26"
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <ErrInline msg={errors.proposalName} />
          {state.clientId && !wasAutoRef.current && (
            <button
              type="button"
              onClick={() => {
                wasAutoRef.current = true;
                actions.setProposalName(autoName(clients.find(c => c.id === state.clientId)?.name || ""));
              }}
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: `1px solid ${Z.bd}`,
                borderRadius: Ri,
                padding: "3px 10px",
                fontSize: 11, fontWeight: FW.bold, color: Z.tm,
                fontFamily: COND, cursor: "pointer",
              }}
            >Reset to auto</button>
          )}
        </div>
      </div>

      {state.mode === "renewal" && (
        <div style={{
          padding: "10px 14px",
          borderRadius: Ri,
          background: Z.go + "12",
          border: `1px solid ${Z.go}40`,
          fontSize: FS.sm, color: Z.tx, fontFamily: COND,
        }}>
          <strong style={{ color: Z.go }}>Renewal mode</strong> — publications, issues, and pricing
          have been pre-filled from the prior contract. Skim each step and adjust before sending.
        </div>
      )}
    </div>
  );
}

// Keep StepStub export for the other step files that still reference it.
export function StepStub({ n, title }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 8,
      padding: 24, fontFamily: COND,
    }}>
      <div style={{ fontSize: FS.xl, color: Z.tx, fontWeight: 800 }}>
        Step {n} — {title}
      </div>
      <div style={{ fontSize: FS.sm, color: Z.tm }}>
        (Coming up — wizard chrome scaffold for now.)
      </div>
    </div>
  );
}
