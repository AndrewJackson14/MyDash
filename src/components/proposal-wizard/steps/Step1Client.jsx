// ============================================================
// Step 1 — Client & Publications (merged)
//
// Picks the client + the proposal name on one row, then once a
// client is chosen, shows publications as a pill row below. Adding
// a pub via pill click flips its print format on by default; an
// inline Print/Digital toggle next to each selected pub lets the
// rep enable digital or swap to digital-only.
//
// This step does the work of the legacy Step 1 (Client) AND the
// legacy Step 2 (Publications). The PUBLICATIONS step ID stays in
// the constants for back-compat with stored progress, but the
// wizard skips over it on next/back.
// ============================================================

import { useRef, useEffect } from "react";
import { Z, FS, FW, COND, Ri, R, CARD, INV, ACCENT } from "../../../lib/theme";
import { Inp } from "../../ui/Primitives";
import FuzzyPicker from "../../FuzzyPicker";

const StepHeader = ({ title, subtitle }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
    <h2 style={{
      margin: 0, fontSize: FS.title, fontWeight: 700,
      color: Z.tx, fontFamily: COND, letterSpacing: -0.3,
    }}>{title}</h2>
    {subtitle && (
      <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>{subtitle}</div>
    )}
  </div>
);

const ErrInline = ({ msg }) => msg ? (
  <div style={{ fontSize: FS.xs, color: Z.da, fontFamily: COND, marginTop: 4 }}>{msg}</div>
) : null;

function autoName(clientName) {
  return `${clientName} — Proposal ${new Date().toLocaleDateString()}`;
}

export default function Step1Client({ state, actions, clients, pubs, validation }) {
  const errors = validation?.errors || {};
  const wasAutoRef = useRef(true);

  useEffect(() => {
    if (!state.clientId) return;
    if (!wasAutoRef.current) return;
    const name = autoName(clients.find(c => c.id === state.clientId)?.name || "");
    if (state.proposalName !== name) actions.setProposalName(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.clientId]);

  const selectedPubIds = new Set((state.pubs || []).map(p => p.pubId));
  const togglePub = (pubId) => {
    if (selectedPubIds.has(pubId)) actions.removePub(pubId);
    else actions.addPub(pubId);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 820 }}>
      <StepHeader
        title="Pick a client & publications"
        subtitle="Search the client, confirm the proposal name, then click pubs to add. Print is on by default — toggle Digital where it applies."
      />

      {/* Client + Proposal Name on one row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <FuzzyPicker
            label="Client"
            value={state.clientId}
            onChange={(v) => { wasAutoRef.current = true; actions.setClient(v); }}
            options={[...clients]
              .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
              .map(c => ({ value: c.id, label: c.name }))}
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
                  fontSize: FS.xs, fontWeight: FW.bold, color: Z.tm,
                  fontFamily: COND, cursor: "pointer",
                }}
              >Reset to auto</button>
            )}
          </div>
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

      {/* Publications — pill row, only shown after a client is picked. */}
      {state.clientId && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{
            fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td,
            letterSpacing: 0.5, textTransform: "uppercase", fontFamily: COND,
          }}>
            Publications {selectedPubIds.size > 0 && (
              <span style={{ marginLeft: 6, color: ACCENT.indigo, fontSize: FS.micro }}>
                · {selectedPubIds.size} selected
              </span>
            )}
          </div>

          {/* All pubs as toggleable pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(pubs || []).map(p => {
              const active = selectedPubIds.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePub(p.id)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: `1px solid ${active ? Z.ac : Z.bd}`,
                    background: active ? Z.ac : "transparent",
                    color: active ? INV.light : Z.tm,
                    fontSize: FS.sm,
                    fontWeight: active ? FW.bold : FW.normal,
                    fontFamily: COND,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {active && <span>✓</span>}
                  {p.name}
                </button>
              );
            })}
          </div>

          {errors.pubs && (
            <div style={{ fontSize: FS.sm, color: Z.da, fontFamily: COND }}>{errors.pubs}</div>
          )}

          {/* Selected pub cards — each gets a Print/Digital toggle inline. */}
          {selectedPubIds.size > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
              {state.pubs.map(p => {
                const pub = pubs.find(x => x.id === p.pubId);
                const formatErr = errors[`pub:${p.pubId}`];
                return (
                  <div
                    key={p.pubId}
                    style={{
                      background: Z.sa,
                      border: `1px solid ${Z.bd}`,
                      borderRadius: R,
                      padding: "10px 12px",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx, fontFamily: COND, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {pub?.name || p.pubId}
                      </div>
                      {pub?.type && (
                        <div style={{ fontSize: FS.micro, color: Z.td, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5 }}>
                          {pub.type}
                        </div>
                      )}
                    </div>
                    <FormatToggle
                      kind="print"
                      active={!!p.formats?.print}
                      onClick={() => actions.togglePubFormat(p.pubId, "print")}
                    />
                    <FormatToggle
                      kind="digital"
                      active={!!p.formats?.digital}
                      onClick={() => actions.togglePubFormat(p.pubId, "digital")}
                    />
                    {formatErr && (
                      <span style={{ fontSize: FS.micro, color: Z.da, fontFamily: COND, marginLeft: 4 }}>
                        {formatErr}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FormatToggle({ kind, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 12px",
        borderRadius: 999,
        border: `1px solid ${active ? Z.ac : Z.bd}`,
        background: active ? Z.ac : "transparent",
        color: active ? INV.light : Z.tm,
        fontSize: FS.xs,
        fontWeight: active ? FW.bold : FW.normal,
        fontFamily: COND,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {active ? "✓ " : ""}{kind === "print" ? "Print" : "Digital"}
    </button>
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
