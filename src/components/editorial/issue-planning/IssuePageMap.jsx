import React, { useMemo } from "react";
import { Z, COND, FS, Ri } from "../../../lib/theme";
import { DEFAULT_PAGE_COUNT } from "./IssuePlanningTab.constants";

// Mini flatplan of the selected issue. Read-only in Wave 2 — clicking
// a tile is a no-op. Wave 3 (separate work) plans to make tiles
// clickable to open the page in the full Flatplan.
function IssuePageMap({ issue, issueStories, fmtPage, onPageClick }) {
  // Pre-compute story → page lookups. Story `page` can be a single
  // number ("3"), a comma list ("3,4"), or a range ("3-5"); we
  // expand all three forms once instead of re-parsing on every tile.
  const storiesByPage = useMemo(() => {
    const map = new Map();
    const priVal = (s) => { const n = parseInt(s.priority); return isNaN(n) ? 999 : n; };
    for (const s of issueStories) {
      const p = String(s.page ?? s.page_number ?? "");
      if (!p) continue;
      let pages = [];
      if (p.includes("-")) {
        const [a, b] = p.split("-").map(Number);
        if (!isNaN(a) && !isNaN(b)) for (let i = a; i <= b; i++) pages.push(i);
      } else {
        pages = p.split(",").map(Number).filter(n => !isNaN(n));
      }
      for (const pg of pages) {
        let arr = map.get(pg);
        if (!arr) { arr = []; map.set(pg, arr); }
        arr.push(s);
      }
    }
    for (const arr of map.values()) arr.sort((a, b) => priVal(a) - priVal(b));
    return map;
  }, [issueStories]);

  if (!issue) return null;
  const pageCount = issue.pageCount || DEFAULT_PAGE_COUNT;
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div style={{ background: Z.sa, borderRadius: Ri, padding: "10px 13px", marginBottom: 10 }}>
      <div style={{ fontSize: FS.base, fontWeight: 700, color: Z.tm, fontFamily: COND, marginBottom: 5 }}>Page Map</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
        {pages.map(pg => {
          const pgStories = storiesByPage.get(pg) || [];
          const hasContent = pgStories.length > 0;
          const truncated = pgStories.length > 3;
          // IP Wave 3 task 3.4: tile is a button — clicking jumps the
          // table to the corresponding page group with a flash. The
          // button styling matches the previous div layout exactly so
          // the visual hasn't changed; only the cursor + hover.
          return (
            <button
              key={pg}
              type="button"
              onClick={() => onPageClick && onPageClick(pg)}
              title={`Jump to page ${pg}`}
              style={{
                width: 52, height: 62,
                border: `1px solid ${Z.bd}`, borderRadius: 3,
                background: hasContent ? Z.ac + "12" : Z.bg,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "flex-start",
                padding: 2, overflow: "hidden",
                cursor: onPageClick ? "pointer" : "default",
                transition: "border-color 0.12s",
                font: "inherit",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = Z.ac; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = Z.bd; }}
            >
              <div style={{ fontSize: FS.micro, fontWeight: 700, color: Z.td }}>{fmtPage(pg)}</div>
              {pgStories.slice(0, 3).map((s, idx) => (
                <div
                  key={s.id}
                  title={`P${parseInt(s.priority) || "—"} — ${s.title}`}
                  style={{ fontSize: 8, fontWeight: idx === 0 ? 800 : 600, color: Z.ac, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%", textAlign: "center", opacity: idx === 0 ? 1 : 0.75 }}
                >
                  {(s.title || "").slice(0, 12)}
                </div>
              ))}
              {truncated && (
                <div style={{ fontSize: 8, fontWeight: 700, color: Z.tm, marginTop: "auto" }}>
                  +{pgStories.length - 3} more
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default React.memo(IssuePageMap);
