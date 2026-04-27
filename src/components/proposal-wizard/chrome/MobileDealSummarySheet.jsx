// ============================================================
// MobileDealSummarySheet — bottom sheet showing the running deal
//
// Same data as WizardSummaryPanel but reflowed for the mobile sheet
// (no fixed width, no sticky positioning, full single column).
// Replaces the desktop right-rail panel that doesn't fit on a phone.
//
// Data flow: takes orch (the wizard orchestration) so it can call
// the same selectors WizardSummaryPanel uses. No new logic — just
// a vertical layout of the same numbers.
// ============================================================
import { Z, COND, FS, FW } from "../../../lib/theme";
import {
  selectAutoTermLabel,
  selectTotalInsertions,
  selectPropLineItems,
  selectPTotal,
  selectPubSummary,
} from "../useProposalWizard";
import MobileSheet from "./MobileSheet";

const PAY_LABELS = {
  per_issue: "Per issue",
  monthly:   "Monthly",
  lump_sum:  "Lump sum upfront",
};

export default function MobileDealSummarySheet({ open, onClose, state, ctx, clients }) {
  if (!open) return <MobileSheet open={false} onClose={onClose} />;

  const client = clients.find(c => c.id === state.clientId);
  const pubLines = selectPropLineItems(state, ctx);
  const total    = selectPTotal(state, ctx);
  const insertions = selectTotalInsertions(state);
  const term = selectAutoTermLabel(state);

  const printSubtotal   = pubLines.filter(li =>  li.issueId).reduce((s, li) => s + (li.price || 0), 0);
  const digitalSubtotal = pubLines.filter(li => !li.issueId).reduce((s, li) => s + (li.price || 0), 0);

  return (
    <MobileSheet open={open} onClose={onClose} title="Deal summary" height="auto">
      <div style={{ padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

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
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {state.pubs.map(p => {
                const pub = ctx.pubs.find(x => x.id === p.pubId);
                const issueCount = (state.issuesByPub[p.pubId] || []).length;
                const digitalCount = state.digitalLines.filter(d => d.pubId === p.pubId).length;
                const summary = p.formats?.print
                  ? selectPubSummary(state, ctx, p.pubId)
                  : null;
                return (
                  <div key={p.pubId} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tx }}>
                      {pub?.name || p.pubId}
                    </span>
                    {p.formats?.print && (
                      <span style={{ fontSize: FS.xs, color: Z.tm }}>
                        {issueCount === 0 ? "Print · no issues yet" : `Print · ${summary}`}
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

        {/* Totals band */}
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
            paddingTop: 8, borderTop: `1px solid ${Z.bd}`,
          }}>
            <span>Total</span>
            <span>${total.toLocaleString()}</span>
          </div>
          <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, marginTop: 4 }}>
            {PAY_LABELS[state.payTiming] || "Payment timing not set"}
            {state.payTiming === "monthly" && state.chargeDay
              ? ` · charge on the ${state.chargeDay === 1 ? "1st" : "15th"}`
              : ""}
          </div>
        </div>
      </div>
    </MobileSheet>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{
        fontSize: 10, fontWeight: FW.heavy, color: Z.td,
        letterSpacing: 0.5, textTransform: "uppercase", fontFamily: COND,
      }}>{label}</div>
      <div style={{ fontSize: FS.base, color: Z.tx, fontFamily: COND }}>
        {children}
      </div>
    </div>
  );
}
