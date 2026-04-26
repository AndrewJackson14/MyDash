// ============================================================
// Step 4 — Sizes & Flights
//
// Tabbed by pub. Each tab shows print-side controls (default ad
// size + per-issue overrides) and/or digital-side controls
// (one DigitalFlightRow per digital line). A pub may carry both
// when its formats has print AND digital active.
// ============================================================

import { useState, useEffect } from "react";
import { Z, FS, FW, COND, R, CARD } from "../../../lib/theme";
import { Btn } from "../../ui/Primitives";
import Ic from "../../ui/Icons";
import AdSizeDefault from "../parts/AdSizeDefault";
import DigitalFlightRow from "../parts/DigitalFlightRow";
import { selectAutoTier } from "../useProposalWizard";
import { FilterPillStrip } from "../../ui/FilterPillStrip";

const StepHeader = ({ title, subtitle }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: Z.tx, fontFamily: COND, letterSpacing: -0.3 }}>{title}</h2>
    {subtitle && <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>{subtitle}</div>}
  </div>
);

export default function Step4SizesAndFlights({
  state, actions, ctx, pubs, digitalAdProducts, today, validation,
}) {
  const errors = validation?.errors || {};
  const autoTier = selectAutoTier(state);
  const [activeTab, setActiveTab] = useState(state.pubs[0]?.pubId || null);

  useEffect(() => {
    if (activeTab && !state.pubs.some(p => p.pubId === activeTab)) {
      setActiveTab(state.pubs[0]?.pubId || null);
    }
  }, [state.pubs, activeTab]);

  if (state.pubs.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 720 }}>
        <StepHeader title="Sizes & Flights" />
        <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>
          Add at least one publication first (Step 2).
        </div>
      </div>
    );
  }

  const issLabel = ctx.issLabel;

  const activePub  = state.pubs.find(p => p.pubId === activeTab);
  const activePubObj = pubs.find(p => p.id === activeTab);
  const activeIssues = state.issuesByPub[activeTab] || [];
  const activeDigitalLines = state.digitalLines.filter(d => d.pubId === activeTab);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 820 }}>
      <StepHeader
        title="Set sizes & flights"
        subtitle="Default ad size flows to every issue. Customize individual issues if needed."
      />

      {/* Tab strip — app-wide blue sliding pill style. */}
      {state.pubs.length > 1 && (
        <FilterPillStrip
          slider
          color={Z.ac}
          options={state.pubs.map(p => {
            const pub = pubs.find(x => x.id === p.pubId);
            const fmtHints = [p.formats?.print ? "P" : "", p.formats?.digital ? "D" : ""].filter(Boolean).join("·");
            return {
              value: p.pubId,
              label: fmtHints ? `${pub?.name || p.pubId} · ${fmtHints}` : (pub?.name || p.pubId),
            };
          })}
          value={activeTab}
          onChange={setActiveTab}
        />
      )}

      {/* Active pub content */}
      {activePub && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {activePub.formats?.print && (
            <div style={{
              background: Z.sa, border: `1px solid ${Z.bd}`, borderRadius: R,
              padding: CARD.pad,
              display: "flex", flexDirection: "column", gap: 10,
            }}>
              <div style={{
                fontSize: 11, fontWeight: FW.heavy, color: Z.td,
                letterSpacing: 0.5, textTransform: "uppercase", fontFamily: COND,
              }}>Print</div>
              <AdSizeDefault
                pub={activePubObj}
                pubId={activeTab}
                selectedIssues={activeIssues}
                defaultSizeIdx={state.defaultSizeByPub[activeTab]}
                perIssueOverrides={state.perIssueOverrides}
                issLabel={issLabel}
                autoTier={autoTier}
                onSetDefault={(idx) => actions.setDefaultSize(activeTab, idx)}
                onSetIssueSize={(issueId, idx) => actions.setIssueSize(activeTab, issueId, idx)}
                onApplyBelow={(issueId, idx) => actions.applySizeBelow(activeTab, issueId, idx)}
                error={errors[`size:${activeTab}`]}
              />
            </div>
          )}

          {activePub.formats?.digital && (
            <div style={{
              background: Z.sa, border: `1px solid ${Z.bd}`, borderRadius: R,
              padding: CARD.pad,
              display: "flex", flexDirection: "column", gap: 10,
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div style={{
                  fontSize: 11, fontWeight: FW.heavy, color: Z.td,
                  letterSpacing: 0.5, textTransform: "uppercase", fontFamily: COND,
                }}>Digital</div>
                <Btn
                  sm v="secondary"
                  onClick={() => actions.addDigitalLine(activeTab, today)}
                  disabled={(digitalAdProducts || []).filter(p => p.pub_id === activeTab).length === 0}
                ><Ic.plus size={11} /> Add Line</Btn>
              </div>

              {activeDigitalLines.length === 0 && (
                <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>
                  {errors[`digital:${activeTab}`] || "No digital lines yet."}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {activeDigitalLines.map(line => (
                  <DigitalFlightRow
                    key={line.id}
                    line={line}
                    pubs={pubs}
                    digitalAdProducts={digitalAdProducts}
                    errors={errors}
                    onUpdate={actions.updateDigitalLine}
                    onRemove={actions.removeDigitalLine}
                  />
                ))}
              </div>
            </div>
          )}

          {!activePub.formats?.print && !activePub.formats?.digital && (
            <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>
              No format selected for this pub. Go back to Step 2 and pick print, digital, or both.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
