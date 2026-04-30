// ============================================================
// WizardSummaryPanel — right rail running deal summary
//
// Always visible on steps 1-6 (collapses on step 7). Updates live
// as state changes; reflects what the proposal would persist if
// the rep saved right now.
// ============================================================

import { Z, FS, FW, COND, Ri, R } from "../../../lib/theme";
import {
  selectAutoTermLabel,
  selectTotalInsertions,
  selectPropLineItems,
  selectPTotal,
  selectPubSummary,
} from "../useProposalWizard";

const PAY_LABELS = {
  per_issue: "Per issue",
  monthly:   "Monthly",
  lump_sum:  "Lump sum upfront",
};

function Section({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{
        fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td,
        letterSpacing: 0.5, textTransform: "uppercase", fontFamily: COND,
      }}>{label}</div>
      <div style={{ fontSize: FS.base, color: Z.tx, fontFamily: COND }}>
        {children}
      </div>
    </div>
  );
}

export default function WizardSummaryPanel({ state, ctx, clients }) {
  const client = clients.find(c => c.id === state.clientId);
  const pubLines = selectPropLineItems(state, ctx);
  const total    = selectPTotal(state, ctx);
  const insertions = selectTotalInsertions(state);
  const term = selectAutoTermLabel(state);

  // Per-pub print breakdown (skip pubs with zero issues selected)
  const printPubs = state.pubs.filter(p => p.formats?.print);
  const digitalPubIds = new Set(state.pubs.filter(p => p.formats?.digital).map(p => p.pubId));
  const printSubtotal = pubLines.filter(li => li.issueId).reduce((s, li) => s + (li.price || 0), 0);
  const digitalSubtotal = pubLines.filter(li => !li.issueId).reduce((s, li) => s + (li.price || 0), 0);

  return (
    <aside style={{
      width: 280, flexShrink: 0,
      background: Z.sa, borderRadius: R, padding: 16,
      display: "flex", flexDirection: "column", gap: 14,
      alignSelf: "flex-start",
      position: "sticky", top: 0,
      maxHeight: "100%", overflowY: "auto",
      border: `1px solid ${Z.bd}`,
    }}>
      <div style={{
        fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td,
        letterSpacing: 1, textTransform: "uppercase", fontFamily: COND,
        borderBottom: `1px solid ${Z.bd}`, paddingBottom: 8,
      }}>
        Deal Summary
      </div>

      <Section label="Client">
        {client?.name || <span style={{ color: Z.td, fontStyle: "italic" }}>—</span>}
      </Section>

      {state.proposalName && (
        <Section label="Proposal">
          <span style={{ fontSize: FS.sm }}>{state.proposalName}</span>
        </Section>
      )}

      <Section label={`Publications · ${state.pubs.length}`}>
        {state.pubs.length === 0 ? (
          <span style={{ color: Z.td, fontStyle: "italic" }}>None yet</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {state.pubs.map(p => {
              const pub = ctx.pubs.find(x => x.id === p.pubId);
              const issueCount = (state.issuesByPub[p.pubId] || []).length;
              const digitalCount = state.digitalLines.filter(d => d.pubId === p.pubId).length;
              const summary = p.formats?.print
                ? selectPubSummary(state, ctx, p.pubId)
                : null;
              return (
                <div key={p.pubId} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx }}>
                    {pub?.name || p.pubId}
                  </span>
                  {p.formats?.print && (
                    <span style={{ fontSize: FS.xs, color: Z.tm }}>
                      {issueCount === 0 ? "Print · no issues yet" : summary}
                    </span>
                  )}
                  {p.formats?.digital && (
                    <span style={{ fontSize: FS.xs, color: Z.tm }}>
                      Digital · {digitalCount} {digitalCount === 1 ? "line" : "lines"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {insertions > 0 && (
        <Section label={`Insertions · ${insertions}`}>
          <span style={{ fontSize: FS.sm, color: Z.tm }}>Tier: {term}</span>
        </Section>
      )}

      <div style={{
        borderTop: `1px solid ${Z.bd}`,
        paddingTop: 12,
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        {printSubtotal > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS.sm, color: Z.tm }}>
            <span>Print subtotal</span>
            <span>${printSubtotal.toLocaleString()}</span>
          </div>
        )}
        {digitalSubtotal > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS.sm, color: Z.tm }}>
            <span>Digital subtotal</span>
            <span>${digitalSubtotal.toLocaleString()}</span>
          </div>
        )}
        <div style={{
          display: "flex", justifyContent: "space-between",
          fontSize: FS.lg, fontWeight: FW.black, color: Z.tx,
          paddingTop: 4, borderTop: `1px solid ${Z.bd}`,
        }}>
          <span>Total</span>
          <span>${total.toLocaleString()}</span>
        </div>
        <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, marginTop: 4 }}>
          {PAY_LABELS[state.payTiming]}
          {state.payTiming === "monthly" && state.chargeDay
            ? ` · charge on the ${state.chargeDay === 1 ? "1st" : "15th"}`
            : ""}
        </div>
      </div>
    </aside>
  );
}
