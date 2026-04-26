// ============================================================
// Step 3 — Issues (skipped if no print pubs)
//
// Tabbed interface, one tab per print pub. Inside each tab:
// 3/6/12mo quick-pick + per-issue chips. Validation requires
// at least one issue per print pub.
// ============================================================

import { useState, useEffect } from "react";
import { Z, FS, FW, COND } from "../../../lib/theme";
import IssuePicker from "../parts/IssuePicker";

const StepHeader = ({ title, subtitle }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: Z.tx, fontFamily: COND, letterSpacing: -0.3 }}>{title}</h2>
    {subtitle && <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>{subtitle}</div>}
  </div>
);

export default function Step3Issues({ state, actions, pubs, issues, validation }) {
  const errors = validation?.errors || {};
  const printPubs = state.pubs.filter(p => p.formats?.print);
  const [activeTab, setActiveTab] = useState(printPubs[0]?.pubId || null);

  // Re-anchor active tab if its pub gets removed.
  useEffect(() => {
    if (activeTab && !printPubs.some(p => p.pubId === activeTab)) {
      setActiveTab(printPubs[0]?.pubId || null);
    }
  }, [printPubs, activeTab]);

  if (printPubs.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 720 }}>
        <StepHeader title="Issues" />
        <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>
          No print publications selected. This step will be skipped.
        </div>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  const handleSelectRange = (pubId, months) => {
    const cut = new Date(today);
    cut.setMonth(cut.getMonth() + months);
    const cs = cut.toISOString().slice(0, 10);
    const pubIssues = issues.filter(i => i.pubId === pubId && i.date >= today && i.date <= cs);
    actions.setIssuesForPub(pubId, pubIssues.map(i => i.id));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 720 }}>
      <StepHeader
        title="Pick issues"
        subtitle="Use the quick-pick range or click individual issues."
      />

      {/* Tab strip */}
      {printPubs.length > 1 && (
        <div style={{
          display: "flex", gap: 0, borderBottom: `1px solid ${Z.bd}`,
          overflowX: "auto",
        }}>
          {printPubs.map(p => {
            const pub = pubs.find(x => x.id === p.pubId);
            const isActive = activeTab === p.pubId;
            const count = (state.issuesByPub[p.pubId] || []).length;
            const hasError = !!errors[`issues:${p.pubId}`];
            return (
              <button
                key={p.pubId}
                onClick={() => setActiveTab(p.pubId)}
                style={{
                  padding: "10px 16px",
                  border: "none",
                  borderBottom: isActive ? `2px solid ${Z.tx}` : "2px solid transparent",
                  background: "transparent",
                  fontSize: FS.base,
                  fontWeight: isActive ? FW.heavy : FW.bold,
                  color: hasError ? Z.da : isActive ? Z.tx : Z.tm,
                  fontFamily: COND, cursor: "pointer",
                  whiteSpace: "nowrap",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                {pub?.name || p.pubId}
                <span style={{
                  fontSize: 10, padding: "1px 7px", borderRadius: 999,
                  background: count > 0 ? Z.go + "30" : Z.sa,
                  color: count > 0 ? Z.go : Z.tm,
                  fontWeight: FW.heavy,
                }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Active tab content */}
      {activeTab && (() => {
        const pub = pubs.find(p => p.id === activeTab);
        const selectedIds = new Set((state.issuesByPub[activeTab] || []).map(i => i.issueId));
        return (
          <IssuePicker
            pub={pub}
            issues={issues.filter(i => i.pubId === activeTab)}
            selectedIds={selectedIds}
            onToggle={(issueId) => actions.toggleIssue(activeTab, issueId)}
            onSelectRange={(m) => handleSelectRange(activeTab, m)}
            onClear={() => actions.clearIssuesForPub(activeTab)}
            error={errors[`issues:${activeTab}`]}
          />
        );
      })()}
    </div>
  );
}
