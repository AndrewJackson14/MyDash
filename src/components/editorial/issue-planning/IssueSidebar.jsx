import React from "react";
import { Z, COND, FS, Ri } from "../../../lib/theme";

// Left rail — list of upcoming issues + collapse affordance. Reads
// per-issue story counts from the storiesByIssue index (O(1) lookup)
// instead of filtering the full stories array per row.
function IssueSidebar({
  futureIssues,
  selIssue,
  onSelectIssue,
  collapsed,
  onToggleCollapsed,
  pubsById,
  getStoryCount,
}) {
  if (collapsed) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
        <button
          onClick={() => onToggleCollapsed(false)}
          title="Show Upcoming Issues"
          style={{
            width: 36, height: 36, borderRadius: Ri,
            background: Z.sa, border: "1px solid " + Z.bd,
            cursor: "pointer", color: Z.tx,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700, lineHeight: 1, padding: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = Z.ac + "18"; e.currentTarget.style.color = Z.ac; }}
          onMouseLeave={e => { e.currentTarget.style.background = Z.sa; e.currentTarget.style.color = Z.tx; }}
        >›</button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", maxHeight: 600 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", marginBottom: 4 }}>
        <span style={{ fontSize: FS.xs, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: Z.tm, fontFamily: COND }}>Upcoming Issues</span>
        <button
          onClick={() => onToggleCollapsed(true)}
          title="Collapse — distraction-free story view"
          style={{
            width: 32, height: 32, borderRadius: Ri,
            background: "transparent", border: "1px solid " + Z.bd,
            cursor: "pointer", color: Z.tm,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700, lineHeight: 1, padding: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = Z.sa; e.currentTarget.style.color = Z.tx; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = Z.tm; }}
        >‹</button>
      </div>
      {futureIssues.length === 0 && <div style={{ fontSize: FS.sm, color: Z.tm, padding: 12 }}>No upcoming issues</div>}
      {futureIssues.map(iss => {
        const isSelected = selIssue === iss.id;
        const pubId = iss.publicationId || iss.pubId;
        const pubName = pubsById.get(pubId)?.name || pubId;
        const stCount = getStoryCount(iss.id);
        // IP Wave 3 task 3.9: dim issues that have no stories yet so
        // populated issues stand out in a long sidebar.
        const isEmpty = stCount === 0;
        return (
          <div
            key={iss.id}
            onClick={() => onSelectIssue(iss.id)}
            style={{
              padding: "8px 10px", borderRadius: Ri, cursor: "pointer",
              background: isSelected ? Z.ac + "18" : "transparent",
              opacity: isEmpty && !isSelected ? 0.55 : 1,
              transition: "opacity 0.15s",
            }}
          >
            <div style={{ fontSize: FS.sm, fontWeight: 700, color: Z.tx, fontFamily: COND }}>{pubName}</div>
            <div style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND, marginTop: 2 }}>
              {iss.date ? new Date(iss.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : iss.label || "Issue"} · {stCount} {stCount === 1 ? "story" : "stories"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default React.memo(IssueSidebar);
