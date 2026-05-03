import React, { useMemo } from "react";
import { Z, COND, DISPLAY, FS, Ri } from "../../../lib/theme";

// Five at-a-glance counters across the selected issue.
// IP Wave 3 task 3.5: each clickable counter doubles as a filter
// chip. Active filter gets an accent border + tint; click again to
// clear. "Stories" and "Ads placed" are display-only — they don't
// describe a story-level subset to filter on.
function IssueStatStrip({ issueStories, sales, selIssue, activeFilter, onFilterChange }) {
  const stats = useMemo(() => ({
    total: issueStories.length,
    pagesAssigned: new Set(
      issueStories.map(s => s.page).filter(p => p != null && p !== "")
    ).size,
    adsPlaced: (sales || []).filter(
      s => s.issueId === selIssue && s.page != null && s.page > 0
    ).length,
    withImages: issueStories.filter(s => s.has_images).length,
    withJumps: issueStories.filter(s => s.jump_to_page != null).length,
  }), [issueStories, sales, selIssue]);

  const toggle = (key) => onFilterChange && onFilterChange(activeFilter === key ? null : key);

  const Stat = ({ filterKey, val, label, color, clickable = true }) => {
    const isActive = clickable && activeFilter === filterKey;
    return (
      <button
        type="button"
        onClick={clickable ? () => toggle(filterKey) : undefined}
        style={{
          flex: 1, padding: "6px 10px",
          background: isActive ? Z.ac + "22" : Z.sa,
          borderRadius: Ri, textAlign: "center",
          border: isActive ? `1px solid ${Z.ac}` : "1px solid transparent",
          cursor: clickable ? "pointer" : "default",
          transition: "background 0.12s, border-color 0.12s",
          font: "inherit",
        }}
      >
        <div style={{ fontSize: FS.lg, fontWeight: 800, color: color || Z.tx, fontFamily: DISPLAY }}>{val}</div>
        <div style={{ fontSize: 9, fontWeight: 700, color: Z.tm, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: COND }}>{label}</div>
      </button>
    );
  };

  return (
    <div style={{ display: "flex", gap: 4 }}>
      <Stat val={stats.total} label="Stories" clickable={false} />
      <Stat filterKey="hasPage" val={stats.pagesAssigned} label="Pages assigned" />
      <Stat val={stats.adsPlaced} label="Ads placed" clickable={false} />
      <Stat filterKey="withImages" val={stats.withImages} label="With images" color={stats.withImages > 0 ? Z.su : null} />
      <Stat filterKey="withJumps" val={stats.withJumps} label="Jumps" color={stats.withJumps > 0 ? Z.wa : null} />
    </div>
  );
}

export default React.memo(IssueStatStrip);
