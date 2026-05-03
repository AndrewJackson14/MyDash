import React from "react";
import { Z, COND, FS, Ri } from "../../../lib/theme";

// Compact "Xm ago" / "Xh ago" formatter, mirroring the helper used in
// EditorialDashboard's module scope so the save indicator reads the
// same way it did pre-extraction.
const ago = (d) => {
  if (!d) return "";
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// IP Wave 2 — title row + sibling toggle + save indicator + story
// count. Wave-1 save state pill comes through via the `save` prop so
// the host page can wire the same useSaveStatus instance it uses for
// every planner write.
function IssueHeader({ issue, siblingCtx, showSiblings, onToggleSiblings, storyCount, save }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: Z.tx, fontFamily: COND }}>
        Stories for {issue?.label || "this issue"}
      </h3>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {siblingCtx && (
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: FS.xs, color: showSiblings ? "var(--action)" : Z.tm, fontFamily: COND, cursor: "pointer" }}>
            <input type="checkbox" checked={showSiblings} onChange={e => onToggleSiblings(e.target.checked)} style={{ accentColor: "var(--action)" }} />
            + {siblingCtx.map(sc => sc.pub.name).join(", ")}
          </label>
        )}
        {save?.status === "saving" && (
          <span style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND }}>Saving…</span>
        )}
        {save?.status === "saved" && save.lastSavedAt && (
          <span style={{ fontSize: FS.micro, color: Z.su || "#22c55e", fontFamily: COND }}>{"✓"} Saved {ago(save.lastSavedAt)}</span>
        )}
        {save?.status === "error" && (
          <button
            onClick={() => (save.error?.retry ? save.error.retry() : save.clearError())}
            title={save.error?.message}
            style={{ fontSize: FS.micro, color: Z.da, fontFamily: COND, fontWeight: 700, background: Z.da + "12", border: "1px solid " + Z.da + "40", padding: "2px 8px", borderRadius: Ri, cursor: "pointer" }}
          >
            {"⚠"} Save failed — retry
          </button>
        )}
        <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{storyCount} stories</span>
      </div>
    </div>
  );
}

export default React.memo(IssueHeader);
