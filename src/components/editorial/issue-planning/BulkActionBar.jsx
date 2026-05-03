import React from "react";
import { Z, COND, FS, Ri } from "../../../lib/theme";
import { Btn, Sel, Ic } from "../../ui";
import { STORY_STATUSES } from "../../../constants";

// IP Wave 3 task 3.6 — sticky toolbar that surfaces when 1+ rows
// are selected via the table's bulk-select column. Each action
// goes through one supabase call (storyBulkUpdate or .delete().in())
// instead of N per-row writes.
function BulkActionBar({
  selectedCount,
  team,
  onClearSelection,
  onChangeStatus,
  onChangeAssignee,
  onClearPage,
  onDelete,
}) {
  if (selectedCount === 0) return null;
  const teamOpts = (team || [])
    .filter(t => t.isActive !== false && !t.isHidden && !t.is_hidden)
    .map(t => ({ value: t.id, label: t.name }));
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 10,
      display: "flex", alignItems: "center", gap: 12,
      padding: "8px 12px",
      background: Z.ac + "12",
      border: `1px solid ${Z.ac}40`,
      borderRadius: Ri,
      marginBottom: 4,
    }}>
      <span style={{ fontSize: FS.sm, fontWeight: 700, color: Z.ac, fontFamily: COND, whiteSpace: "nowrap" }}>
        {selectedCount} selected
      </span>
      <div style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap", alignItems: "center" }}>
        <Sel
          value=""
          onChange={e => { if (e.target.value) { onChangeStatus(e.target.value); e.target.value = ""; } }}
          options={[{ value: "", label: "Change status…" }, ...STORY_STATUSES.map(s => ({ value: s, label: s }))]}
        />
        <Sel
          value=""
          onChange={e => { if (e.target.value) { onChangeAssignee(e.target.value); e.target.value = ""; } }}
          options={[{ value: "", label: "Change assignee…" }, { value: "__unassigned__", label: "Unassigned" }, ...teamOpts]}
        />
        <Btn sm v="secondary" onClick={onClearPage}>Clear page</Btn>
        <Btn sm v="danger" onClick={onDelete}>Delete</Btn>
      </div>
      <button
        onClick={onClearSelection}
        title="Clear selection"
        style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, padding: 4, display: "inline-flex" }}
      >
        <Ic.close size={14} />
      </button>
    </div>
  );
}

export default React.memo(BulkActionBar);
