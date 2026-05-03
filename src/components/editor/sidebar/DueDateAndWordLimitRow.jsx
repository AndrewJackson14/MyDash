import React from "react";
import { Z, COND, FS } from "../../../lib/theme";
import { Inp } from "../../ui";

function DueDateAndWordLimitRow({ dueDate, wordLimit, wordCount, onDueDateChange, onWordLimitChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <Inp label="Due Date" type="date" value={dueDate || ""} onChange={onDueDateChange} />
      <div>
        <Inp
          label="Word Limit"
          type="number"
          value={wordLimit || ""}
          onChange={v => onWordLimitChange(v ? Number(v) : null)}
          placeholder="No limit"
        />
        {wordLimit && wordCount > wordLimit && (
          <div style={{ fontSize: FS.micro, color: Z.da, fontWeight: 700, fontFamily: COND, marginTop: 2 }}>
            {"⚠"} {wordCount - wordLimit} over limit
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(DueDateAndWordLimitRow);
