import React from "react";
import { Btn, Ic } from "../../ui";

// Quick-add buttons that sit above the story table: New Story (inline
// blank row), New Section (divider), and Apply Pub Defaults (visible
// only when the publication has default sections configured AND the
// issue has no sections yet).
function IssueToolbar({
  selIssue, addingInlineStory,
  defaultSectionsCount, hasIssueSections,
  onNewStory, onNewSection, onApplyDefaults,
}) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 4, gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <Btn sm v="secondary" onClick={onNewStory} disabled={addingInlineStory}>
        <Ic.plus size={12} /> {addingInlineStory ? "Adding…" : "New Story"}
      </Btn>
      <Btn sm v="secondary" onClick={onNewSection} disabled={!selIssue}>
        <Ic.plus size={12} /> New Section
      </Btn>
      {defaultSectionsCount > 0 && !hasIssueSections && (
        <Btn sm v="secondary" onClick={onApplyDefaults}>
          Apply pub defaults ({defaultSectionsCount})
        </Btn>
      )}
    </div>
  );
}

export default React.memo(IssueToolbar);
