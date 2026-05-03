import React from "react";
import { Z } from "../../../lib/theme";
import { TA } from "../../ui";

// Two textareas grouped together because they share the same shape
// (free-form text, blur-to-save) and live in adjacent sidebar slots.
// Correction Note prints to readers; Internal Notes are private.
function NotesPanel({ meta, setMeta, saveMeta }) {
  return (
    <>
      <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
        <TA
          label="Correction Note (visible to readers)"
          value={meta.correction_note || ""}
          onChange={v => setMeta(m => ({ ...m, correction_note: v }))}
          onBlur={() => saveMeta("correction_note", meta.correction_note)}
          rows={2}
        />
      </div>
      <TA
        label="Internal Notes"
        value={meta.notes || ""}
        onChange={v => setMeta(m => ({ ...m, notes: v }))}
        onBlur={() => saveMeta("notes", meta.notes)}
        rows={3}
      />
    </>
  );
}

export default React.memo(NotesPanel);
