import React from "react";
import { Z, COND, FS } from "../../../lib/theme";
import { ago, tn } from "../StoryEditor.helpers";

function ActivityPanel({ activity, team }) {
  if (!activity?.length) return null;
  return (
    <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
      <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>Activity</div>
      {activity.slice(0, 8).map(a => (
        <div key={a.id} style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND, padding: "4px 0", borderBottom: "1px solid " + Z.bd + "22" }}>
          <span style={{ fontWeight: 600 }}>{a.action.replace(/_/g, " ")}</span>
          {a.performed_by && <span> by {tn(a.performed_by, team)}</span>}
          <span style={{ float: "right", color: Z.td || Z.tm }}>{ago(a.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

export default React.memo(ActivityPanel);
