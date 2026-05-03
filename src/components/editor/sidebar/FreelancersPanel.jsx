import React from "react";
import { Z, COND, FS, Ri } from "../../../lib/theme";

function FreelancersPanel({ freelancers, onAdd }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND }}>Freelancers</div>
        <button onClick={onAdd} style={{ fontSize: FS.micro, fontWeight: 700, color: Z.ac, background: "none", border: "none", cursor: "pointer", fontFamily: COND }}>+ Add</button>
      </div>
      {freelancers.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {freelancers.map(f => (
            <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: Ri, fontSize: FS.micro, fontFamily: COND, background: Z.sa, color: Z.tx, border: "1px solid " + Z.bd }}>
              {f.name} <span style={{ color: Z.tm, fontSize: FS.micro }}>{f.specialty}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default React.memo(FreelancersPanel);
