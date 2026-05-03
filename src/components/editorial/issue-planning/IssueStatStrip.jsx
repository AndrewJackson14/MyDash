import React, { useMemo } from "react";
import { Z, COND, DISPLAY, FS, Ri } from "../../../lib/theme";

// Five at-a-glance counters across the selected issue: stories, pages
// assigned, ads placed, stories flagged for images, stories with
// jumps. Each counter is cheap to compute but doing it in render
// without memoization meant we walked issueStories four times per
// row-edit; once each via useMemo keeps the math local.
function IssueStatStrip({ issueStories, sales, selIssue }) {
  const stats = useMemo(() => {
    const pagesAssigned = new Set(
      issueStories.map(s => s.page).filter(p => p != null && p !== "")
    ).size;
    const adsPlaced = (sales || []).filter(
      s => s.issueId === selIssue && s.page != null && s.page > 0
    ).length;
    const withImages = issueStories.filter(s => s.has_images).length;
    const withJumps = issueStories.filter(s => s.jump_to_page != null).length;
    return {
      total: issueStories.length,
      pagesAssigned, adsPlaced, withImages, withJumps,
    };
  }, [issueStories, sales, selIssue]);

  const Stat = ({ val, label, color }) => (
    <div style={{ flex: 1, padding: "6px 10px", background: Z.sa, borderRadius: Ri, textAlign: "center" }}>
      <div style={{ fontSize: FS.lg, fontWeight: 800, color: color || Z.tx, fontFamily: DISPLAY }}>{val}</div>
      <div style={{ fontSize: 9, fontWeight: 700, color: Z.tm, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: COND }}>{label}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", gap: 4 }}>
      <Stat val={stats.total} label="Stories" />
      <Stat val={stats.pagesAssigned} label="Pages assigned" />
      <Stat val={stats.adsPlaced} label="Ads placed" />
      <Stat val={stats.withImages} label="With images" color={stats.withImages > 0 ? Z.su : null} />
      <Stat val={stats.withJumps} label="Jumps" color={stats.withJumps > 0 ? Z.wa : null} />
    </div>
  );
}

export default React.memo(IssueStatStrip);
