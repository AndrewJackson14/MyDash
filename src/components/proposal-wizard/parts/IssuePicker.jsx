// ============================================================
// IssuePicker — issue chip grid for a single publication
//
// Range buttons (3/6/12mo) wipe the current selection and replace
// with the issues whose dates fall inside the chosen window. The
// per-issue chips toggle individual issues. Used by Step3Issues.
// ============================================================

import { Z, FS, FW, COND, R, INV } from "../../../lib/theme";

export default function IssuePicker({
  pub,
  issues,             // already filtered to this pub
  selectedIds,        // Set<string> of selected issueIds
  onToggle,           // (issueId) => void
  onSelectRange,      // (months) => void
  onClear,            // () => void
  error,
}) {
  const upcoming = issues
    .filter(i => i.date >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    .slice(0, 24);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Range chips */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{
          fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td,
          letterSpacing: 0.5, textTransform: "uppercase", fontFamily: COND,
          marginRight: 6,
        }}>Quick pick</span>
        {[3, 6, 12].map(m => (
          <button
            key={m}
            onClick={() => onSelectRange(m)}
            style={{
              padding: "4px 12px", borderRadius: 999,
              border: `1px solid ${Z.bd}`, background: Z.bg,
              fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx,
              fontFamily: COND, cursor: "pointer",
            }}
          >{m}mo</button>
        ))}
        <button
          onClick={onClear}
          style={{
            padding: "4px 12px", borderRadius: 999,
            border: `1px solid ${Z.bd}`, background: "transparent",
            fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm,
            fontFamily: COND, cursor: "pointer",
          }}
        >Clear</button>
      </div>

      {/* Issue chip grid */}
      {upcoming.length === 0 ? (
        <div style={{
          padding: 16, textAlign: "center",
          background: Z.bg, border: `1px dashed ${Z.bd}`, borderRadius: R,
          fontSize: FS.sm, color: Z.tm, fontFamily: COND,
        }}>
          No upcoming issues for {pub?.name || "this publication"}.
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
          gap: 4,
        }}>
          {upcoming.map(iss => {
            const sel = selectedIds.has(iss.id);
            return (
              <button
                key={iss.id}
                onClick={() => onToggle(iss.id)}
                style={{
                  padding: "6px 10px",
                  borderRadius: R,
                  border: `1px solid ${sel ? Z.go : Z.bd}`,
                  background: sel ? Z.go : "transparent",
                  fontSize: FS.sm, fontWeight: FW.bold,
                  color: sel ? INV.light : Z.tm,
                  fontFamily: COND, cursor: "pointer",
                  textAlign: "left",
                }}
              >{iss.label}</button>
            );
          })}
        </div>
      )}

      {/* Selection count + error */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 16 }}>
        <span style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>
          {selectedIds.size === 0 ? "No issues selected" : `${selectedIds.size} issue${selectedIds.size === 1 ? "" : "s"} selected`}
        </span>
        {error && (
          <span style={{ fontSize: FS.xs, color: Z.da, fontFamily: COND, fontWeight: FW.bold }}>{error}</span>
        )}
      </div>
    </div>
  );
}
