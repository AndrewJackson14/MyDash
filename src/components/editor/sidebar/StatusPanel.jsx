import React from "react";
import { Z, COND, FS } from "../../../lib/theme";
import { Ic, TB } from "../../ui";
import { STORY_STATUSES } from "../../../constants";

function StatusPanel({ status, isPublished, onChange }) {
  return (
    <div>
      <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>Status</div>
      <TB
        tabs={STORY_STATUSES.map(s => s === "Approved"
          ? { value: "Approved", label: <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Ic.check size={13} color={status === "Approved" ? "#fff" : (Z.su || "#22c55e")} /> Approved</span> }
          : s
        )}
        active={status || "Draft"}
        onChange={onChange}
      />
      {isPublished && <div style={{ fontSize: FS.micro, fontWeight: 700, color: Z.su || "#22c55e", fontFamily: COND, marginTop: 4 }}>{"✓"} Published</div>}
    </div>
  );
}

export default React.memo(StatusPanel);
