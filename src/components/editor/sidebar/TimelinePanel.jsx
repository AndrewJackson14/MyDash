import React from "react";
import { Z, COND, FS } from "../../../lib/theme";
import { fmtDate } from "../StoryEditor.helpers";

function TimelinePanel({ meta }) {
  return (
    <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
      <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>Timeline</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: FS.micro, fontFamily: COND, color: Z.tm }}>
        {meta.created_at && <div>Created: <span style={{ color: Z.tx, fontWeight: 600 }}>{fmtDate(meta.created_at)}</span></div>}
        {meta.submitted_at && <div>Submitted: <span style={{ color: Z.tx, fontWeight: 600 }}>{fmtDate(meta.submitted_at)}</span></div>}
        {meta.edited_at && <div>Edited: <span style={{ color: Z.tx, fontWeight: 600 }}>{fmtDate(meta.edited_at)}</span></div>}
        {meta.approved_for_web_at && <div>Web approved: <span style={{ color: Z.tx, fontWeight: 600 }}>{fmtDate(meta.approved_for_web_at)}</span></div>}
        {meta.first_published_at && <div>First published: <span style={{ color: Z.tx, fontWeight: 600 }}>{fmtDate(meta.first_published_at)}</span></div>}
        {meta.last_significant_edit_at && <div>Last major edit: <span style={{ color: Z.tx, fontWeight: 600 }}>{fmtDate(meta.last_significant_edit_at)}</span></div>}
        {meta.edit_count > 0 && <div>Total edits: <span style={{ color: Z.tx, fontWeight: 600 }}>{meta.edit_count}</span></div>}
      </div>
    </div>
  );
}

export default React.memo(TimelinePanel);
