import React from "react";
import { Z, COND, FS, Ri } from "../../../lib/theme";

// Public stories appear on the website; Internal Knowledge Base
// articles never publish — they're searchable by the team and readable
// by MyHelper. Defaults to Public.
const OPTIONS = [["public", "Public"], ["internal", "Internal Knowledge Base"]];

function AudienceToggle({ audience, onChange }) {
  return (
    <div>
      <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Audience</div>
      <div style={{ display: "flex", gap: 4 }}>
        {OPTIONS.map(([v, l]) => {
          const sel = (audience || "public") === v;
          return (
            <button
              key={v}
              onClick={() => onChange(v)}
              style={{ flex: 1, padding: "6px 12px", borderRadius: Ri, border: `1px solid ${sel ? Z.ac : Z.bd}`, background: sel ? Z.ac + "15" : "transparent", color: sel ? Z.ac : Z.tm, cursor: "pointer", fontSize: FS.sm, fontWeight: sel ? 700 : 600, fontFamily: COND }}
            >{l}</button>
          );
        })}
      </div>
    </div>
  );
}

export default React.memo(AudienceToggle);
