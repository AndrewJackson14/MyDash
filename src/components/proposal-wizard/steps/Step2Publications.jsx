// ============================================================
// Step 2 — Publications
//
// Add publications and pick format(s) per pub. Print/Digital can
// both be active. The format toggle drives whether Step 3 (Issues)
// shows for that pub and whether digital lines appear in Step 4.
// ============================================================

import { useState, useMemo } from "react";
import { Z, FS, FW, COND, Ri, R, CARD } from "../../../lib/theme";
import { Btn, Sel } from "../../ui/Primitives";
import Ic from "../../ui/Icons";
import PublicationFormatToggle from "../parts/PublicationFormatToggle";

const StepHeader = ({ title, subtitle }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
    <h2 style={{ margin: 0, fontSize: FS.title, fontWeight: 700, color: Z.tx, fontFamily: COND, letterSpacing: -0.3 }}>{title}</h2>
    {subtitle && <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>{subtitle}</div>}
  </div>
);

export default function Step2Publications({ state, actions, pubs, validation }) {
  const errors = validation?.errors || {};
  const usedIds = new Set(state.pubs.map(p => p.pubId));
  const dropdownPubs = useMemo(
    () => (pubs || []).filter(p => !usedIds.has(p.id)),
    [pubs, state.pubs]
  );
  const [pendingPubId, setPendingPubId] = useState("");

  // Auto-pick the first available pub when the dropdown changes.
  if (dropdownPubs.length > 0 && !pendingPubId) {
    // setState during render is not ideal; defer with effect-like pattern via lazy
    // initial assignment. Cheap one-shot: only triggers when user just removed
    // a pub or first opens the wizard.
    queueMicrotask(() => setPendingPubId(dropdownPubs[0].id));
  }

  const addPub = () => {
    if (!pendingPubId) return;
    actions.addPub(pendingPubId);
    setPendingPubId("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 720 }}>
      <StepHeader
        title="Add publications"
        subtitle="Pick a publication, then choose print, digital, or both."
      />

      {/* Add row */}
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <Sel
            label="Publication"
            value={pendingPubId}
            onChange={e => setPendingPubId(e.target.value)}
            options={
              dropdownPubs.length === 0
                ? [{ value: "", label: "All publications added" }]
                : dropdownPubs.map(p => ({ value: p.id, label: p.name }))
            }
          />
        </div>
        <Btn onClick={addPub} disabled={!pendingPubId || dropdownPubs.length === 0}>
          <Ic.plus size={12} /> Add
        </Btn>
      </div>

      {errors.pubs && (
        <div style={{ fontSize: FS.sm, color: Z.da, fontFamily: COND }}>{errors.pubs}</div>
      )}

      {/* Pub cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {state.pubs.map(p => {
          const pub = pubs.find(x => x.id === p.pubId);
          return (
            <div
              key={p.pubId}
              style={{
                background: Z.sa,
                border: `1px solid ${Z.bd}`,
                borderRadius: R,
                padding: CARD.pad,
                display: "flex", flexDirection: "column", gap: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: FS.lg, fontWeight: FW.heavy, color: Z.tx, fontFamily: COND }}>
                    {pub?.name || p.pubId}
                  </span>
                  {pub?.type && (
                    <span style={{ fontSize: FS.xs, color: Z.td, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {pub.type}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => actions.removePub(p.pubId)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: Z.da, fontSize: 18, fontWeight: 900, padding: 4,
                  }}
                  aria-label="Remove publication"
                >×</button>
              </div>
              <PublicationFormatToggle
                formats={p.formats}
                onToggle={fmt => actions.togglePubFormat(p.pubId, fmt)}
                error={errors[`pub:${p.pubId}`]}
              />
            </div>
          );
        })}

        {state.pubs.length === 0 && (
          <div style={{
            border: `1px dashed ${Z.bd}`, borderRadius: R,
            padding: 28, textAlign: "center",
            fontSize: FS.sm, color: Z.tm, fontFamily: COND,
          }}>
            No publications added yet.
          </div>
        )}
      </div>
    </div>
  );
}
