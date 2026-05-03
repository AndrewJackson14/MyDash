import React, { useMemo } from "react";
import { Z, COND, DISPLAY, FS, Ri } from "../../../lib/theme";
import { PRINT_STAGES } from "./IssuePlanningTab.constants";

// 5-stage print pipeline counter strip. Skips the "none" stage at
// index 0 since "not assigned" is implied by the absence of a count.
function IssuePrintPipeline({ issueStories }) {
  const counts = useMemo(() => {
    const c = {};
    for (const s of issueStories) {
      const k = s.print_status || "none";
      c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [issueStories]);

  return (
    <div style={{ display: "flex", gap: 2, marginBottom: 8 }}>
      {PRINT_STAGES.slice(1).map(stage => {
        const count = counts[stage.key] || 0;
        return (
          <div key={stage.key} style={{ flex: 1, textAlign: "center", padding: "6px 4px", background: count > 0 ? Z.ac + "12" : Z.sa, borderRadius: Ri }}>
            <div style={{ fontSize: FS.lg, fontWeight: 800, color: count > 0 ? Z.ac : Z.tm, fontFamily: DISPLAY }}>{count}</div>
            <div style={{ fontSize: FS.micro, fontWeight: 600, color: Z.tm, fontFamily: COND }}>{stage.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export default React.memo(IssuePrintPipeline);
