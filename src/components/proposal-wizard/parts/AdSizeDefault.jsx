// ============================================================
// AdSizeDefault — default size + collapsible per-issue override
//
// Shows a single default <Sel> for the pub. When the rep clicks
// "Customize per issue", reveals a list of selected issues with
// per-issue size selectors and an "Apply below ↓" affordance.
// ============================================================

import { useState } from "react";
import { Z, FS, FW, COND, Ri, R } from "../../../lib/theme";
import { Sel } from "../../ui/Primitives";

export default function AdSizeDefault({
  pub,
  selectedIssues,             // [{ issueId, adSizeIdx }]
  defaultSizeIdx,
  perIssueOverrides,          // { "pubId:issueId": true }
  pubId,
  issLabel,
  autoTier,
  onSetDefault,
  onSetIssueSize,
  onApplyBelow,
  error,
}) {
  const [showCustom, setShowCustom] = useState(
    selectedIssues.some(i => perIssueOverrides[`${pubId}:${i.issueId}`])
  );
  const adSizes = pub?.adSizes || [];
  const overrideCount = selectedIssues.filter(i => perIssueOverrides[`${pubId}:${i.issueId}`]).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <Sel
            label={`Default Ad Size for ${pub?.name || ""}`}
            value={defaultSizeIdx ?? ""}
            onChange={e => onSetDefault(Number(e.target.value))}
            options={[
              { value: "", label: "— Pick a size —" },
              ...adSizes.map((a, ai) => ({
                value: ai,
                label: `${a.name} ($${(a[autoTier] || a.rate || 0).toLocaleString()})`,
              })),
            ]}
          />
        </div>
      </div>
      {error && (
        <div style={{ fontSize: 11, color: Z.da, fontFamily: COND }}>{error}</div>
      )}

      {selectedIssues.length > 0 && (
        <button
          type="button"
          onClick={() => setShowCustom(s => !s)}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
            textAlign: "left",
            fontSize: FS.sm,
            fontWeight: FW.bold,
            color: Z.tm,
            fontFamily: COND,
          }}
        >
          {showCustom ? "▾" : "▸"} Customize per issue ({overrideCount} of {selectedIssues.length} changed)
        </button>
      )}

      {showCustom && selectedIssues.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {selectedIssues.map(iss => {
            const ad = adSizes[iss.adSizeIdx];
            const overridden = perIssueOverrides[`${pubId}:${iss.issueId}`];
            return (
              <div
                key={iss.issueId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1.4fr 80px 28px",
                  gap: 6, padding: "5px 8px",
                  background: overridden ? Z.ac + "10" : Z.bg,
                  border: `1px solid ${Z.bd}`,
                  borderRadius: R,
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>
                  {issLabel(iss.issueId)}
                </span>
                <select
                  value={iss.adSizeIdx}
                  onChange={e => onSetIssueSize(iss.issueId, Number(e.target.value))}
                  style={{
                    background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri,
                    padding: "5px 8px", color: Z.tx, fontSize: FS.sm, fontFamily: COND,
                    outline: "none",
                  }}
                >
                  {adSizes.map((a, ai) => (
                    <option key={ai} value={ai}>{a.name}</option>
                  ))}
                </select>
                <span style={{
                  fontSize: FS.sm, fontWeight: FW.heavy,
                  color: Z.tx, textAlign: "right", fontFamily: COND,
                }}>
                  ${(ad?.[autoTier] || ad?.rate || 0).toLocaleString()}
                </span>
                <button
                  onClick={() => onApplyBelow(iss.issueId, iss.adSizeIdx)}
                  title="Apply this size to all issues below"
                  style={{
                    background: "none", border: `1px solid ${Z.bd}`, borderRadius: Ri,
                    cursor: "pointer", color: Z.tx, fontSize: FS.sm, fontWeight: FW.heavy,
                    padding: "2px 0",
                  }}
                >↓</button>
              </div>
            );
          })}
        </div>
      )}

      {selectedIssues.length === 0 && (
        <div style={{ fontSize: FS.sm, color: Z.tm, fontStyle: "italic", fontFamily: COND }}>
          No issues selected for this pub yet — pick some in Step 3.
        </div>
      )}
    </div>
  );
}
