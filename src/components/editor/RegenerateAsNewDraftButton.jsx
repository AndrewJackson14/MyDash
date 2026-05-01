// ============================================================
// RegenerateAsNewDraftButton — Phase D of editorial-generate-v2-spec.md
//
// Self-contained trigger + modal for the new_draft regeneration flow.
// Hides itself when:
//   - viewer doesn't have a generate-eligible role
//   - source story isn't published (sent_to_web || sent_to_print)
//
// Default render is a small ↻ icon button suitable for overlaying
// on a story card. Pass a `render` prop to substitute a different
// trigger shape (menu item, list-row action, etc.) — the wrapper
// handles modal state regardless.
//
// Usage on Editorial Dashboard archive cards:
//
//   <RegenerateAsNewDraftButton
//     sourceStory={story}
//     viewerId={currentUser?.id}
//     viewerName={currentUser?.name}
//     viewerRole={currentUser?.role}
//     viewerIsAdmin={!!currentUser?.permissions?.includes?.("admin")}
//     onCreated={(newStory) => {
//       setStories(prev => [newStory, ...prev]);
//       openDetail(newStory);
//     }}
//   />
// ============================================================
import { useState } from "react";
import { Z, Ri, FS } from "../../lib/theme";
import RegenerateModal from "./RegenerateModal";

const GENERATE_ROLES = new Set([
  "Publisher", "Content Editor", "Editor-in-Chief", "Managing Editor",
]);

export default function RegenerateAsNewDraftButton({
  sourceStory,
  viewerId, viewerName, viewerRole, viewerIsAdmin,
  onCreated,
  render,
}) {
  const [open, setOpen] = useState(false);

  const canGenerate = !!viewerIsAdmin || GENERATE_ROLES.has(viewerRole);
  const isPublished = !!(
    sourceStory?.sent_to_web    || sourceStory?.sentToWeb ||
    sourceStory?.sent_to_print  || sourceStory?.sentToPrint
  );

  if (!canGenerate || !isPublished) return null;

  const handleOpen = (e) => {
    e?.stopPropagation?.();
    setOpen(true);
  };

  const trigger = render
    ? render(handleOpen)
    : (
      <button
        type="button"
        onClick={handleOpen}
        title="Regenerate as new draft"
        aria-label="Regenerate as new draft"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 22, height: 22,
          padding: 0, border: `1px solid ${Z.bd}`, borderRadius: Ri,
          background: Z.sf, color: Z.tm,
          cursor: "pointer", fontSize: FS.xs, lineHeight: 1,
          transition: "background 0.12s, color 0.12s, border-color 0.12s",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = Z.sa;
          e.currentTarget.style.color = Z.tx;
          e.currentTarget.style.borderColor = Z.tm;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = Z.sf;
          e.currentTarget.style.color = Z.tm;
          e.currentTarget.style.borderColor = Z.bd;
        }}
      >↻</button>
    );

  return (
    <>
      {trigger}
      {open && (
        <RegenerateModal
          sourceStory={sourceStory}
          viewerId={viewerId}
          viewerName={viewerName}
          onCreated={(newStory) => {
            onCreated?.(newStory);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
