import React from "react";
import { Z, COND, FS, Ri } from "../../../lib/theme";

function PrintIssuePicker({ printIssueId, filteredIssues, onChange }) {
  return (
    <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
      <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Print Issue</div>
      <select
        value={printIssueId || ""}
        onChange={e => onChange(e.target.value || null)}
        style={{ width: "100%", padding: "6px 8px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: FS.sm, fontFamily: COND }}
      >
        <option value="">None</option>
        {filteredIssues.map(i => <option key={i.id} value={i.id}>{i.label || new Date(i.date).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}</option>)}
      </select>
    </div>
  );
}

export default React.memo(PrintIssuePicker);
