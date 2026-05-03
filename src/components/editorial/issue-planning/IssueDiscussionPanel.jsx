import React, { useState } from "react";
import { Z, COND, FS, Ri } from "../../../lib/theme";
import { Ic } from "../../ui";
import EntityThread from "../../EntityThread";

// IP Wave 2 — replaces the always-mounted <EntityThread> at the top
// of the Issue Planning detail pane. Now lazy: the thread component
// only mounts (and fires its message fetch) when the editor clicks
// to open the discussion. Cuts a Supabase round-trip per
// issue-switch on the workflow surface.
function IssueDiscussionPanel({ selIssue, issueLabel, team, currentUser }) {
  const [open, setOpen] = useState(false);
  if (!selIssue) return null;
  return (
    <div style={{ background: Z.sa, borderRadius: Ri, border: "1px solid " + Z.bd, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", padding: "8px 12px",
          display: "flex", alignItems: "center", gap: 8,
          background: "transparent", border: "none",
          cursor: "pointer", color: Z.tx, fontFamily: COND,
          fontSize: FS.sm, fontWeight: 600, textAlign: "left",
        }}
      >
        <span style={{ display: "inline-flex", color: Z.tm }}>
          {open ? <Ic.chevronDown size={12} /> : <Ic.chevronRight size={12} />}
        </span>
        <span>Issue discussion</span>
      </button>
      {open && (
        <div style={{ padding: 4, borderTop: "1px solid " + Z.bd }}>
          <EntityThread
            refType="issue"
            refId={selIssue}
            title={`Issue: ${issueLabel || "Untitled"}`}
            team={team}
            currentUser={currentUser}
            label="Issue discussion"
            height={300}
          />
        </div>
      )}
    </div>
  );
}

export default React.memo(IssueDiscussionPanel);
