import React, { useMemo } from "react";
import { Z, COND, FS, Ri } from "../../../lib/theme";
import { STORY_TYPES } from "../StoryEditor.constants";

function TypeAndAssigneeRow({ storyType, assignedTo, team, onTypeChange, onAssigneeChange }) {
  const teamOpts = useMemo(
    () => (team || []).filter(t => t.isActive !== false && !t.isHidden && !t.is_hidden),
    [team]
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <div>
        <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Type</div>
        <select
          value={storyType || "article"}
          onChange={e => onTypeChange(e.target.value)}
          style={{ width: "100%", padding: "6px 8px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: FS.sm, fontFamily: COND }}
        >
          {STORY_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Assigned To</div>
        <select
          value={assignedTo || ""}
          onChange={e => onAssigneeChange(e.target.value || null)}
          style={{ width: "100%", padding: "6px 8px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: FS.sm, fontFamily: COND }}
        >
          <option value="">Unassigned</option>
          {teamOpts.map(t => <option key={t.id} value={t.id}>{t.name} {"—"} {t.role}</option>)}
        </select>
      </div>
    </div>
  );
}

export default React.memo(TypeAndAssigneeRow);
