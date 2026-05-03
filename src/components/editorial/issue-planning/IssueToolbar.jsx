import React, { useState } from "react";
import { Btn, Ic } from "../../ui";
import SectionCreateModal from "./SectionCreateModal";

// Quick-add buttons that sit above the story table:
// - New Story (inline blank row)
// - New Section (themed modal — IP Wave 3 replaces the legacy
//   3-step window.prompt dance)
// - Apply Pub Defaults (always visible when the pub has defaults;
//   disabled with a tooltip when the issue already has sections —
//   IP Wave 3 task 3.10).
function IssueToolbar({
  selIssue, addingInlineStory,
  pubName, pubType, issuePageCount,
  defaultSectionsCount, hasIssueSections,
  onNewStory, onCreateSection, onApplyDefaults,
}) {
  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  return (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 4, gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <Btn sm v="secondary" onClick={onNewStory} disabled={addingInlineStory}>
        <Ic.plus size={12} /> {addingInlineStory ? "Adding…" : "New Story"}
      </Btn>
      <Btn sm v="secondary" onClick={() => setSectionModalOpen(true)} disabled={!selIssue}>
        <Ic.plus size={12} /> New Section
      </Btn>
      {defaultSectionsCount > 0 && (
        <Btn
          sm v="secondary"
          onClick={onApplyDefaults}
          disabled={hasIssueSections}
          title={hasIssueSections
            ? "Already has sections — clear them first to apply defaults"
            : `Apply ${defaultSectionsCount} default section${defaultSectionsCount === 1 ? "" : "s"}${pubName ? ` from ${pubName}` : ""}`
          }
        >
          Apply pub defaults ({defaultSectionsCount})
        </Btn>
      )}

      <SectionCreateModal
        open={sectionModalOpen}
        onClose={() => setSectionModalOpen(false)}
        pubType={pubType}
        issuePageCount={issuePageCount}
        onCreate={onCreateSection}
      />
    </div>
  );
}

export default React.memo(IssueToolbar);
