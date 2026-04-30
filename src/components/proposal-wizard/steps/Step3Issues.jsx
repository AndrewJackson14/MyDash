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
import { FilterPillStrip } from "../../ui/FilterPillStrip";

const StepHeader = ({ title, subtitle }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
    <h2 style={{ margin: 0, fontSize: FS.title, fontWeight: 700, color: Z.tx, fontFamily: COND, letterSpacing: -0.3 }}>{title}</h2>
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

      {/* Tab strip — uses the app-wide blue sliding pill style. */}
      {printPubs.length > 1 && (
        <FilterPillStrip
          slider
          color={Z.ac}
          options={printPubs.map(p => {
            const pub = pubs.find(x => x.id === p.pubId);
            const count = (state.issuesByPub[p.pubId] || []).length;
            return {
              value: p.pubId,
              label: `${pub?.name || p.pubId} · ${count}`,
            };
          })}
          value={activeTab}
          onChange={setActiveTab}
        />
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
