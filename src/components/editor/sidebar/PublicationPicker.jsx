import React from "react";
import { Z, COND, FS, Ri } from "../../../lib/theme";

function PublicationPicker({ value, pubs, onChange }) {
  return (
    <div>
      <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Publication</div>
      <select
        value={value || ""}
        onChange={e => onChange(e.target.value || null)}
        style={{ width: "100%", padding: "6px 8px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: FS.sm, fontFamily: COND }}
      >
        <option value="">Select publication...</option>
        {pubs.filter(p => p.type !== "Special Publication").map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}

export default React.memo(PublicationPicker);
