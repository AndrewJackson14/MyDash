import React from "react";
import { Z, COND, ACCENT, FS, Ri } from "../../lib/theme";
import { Ic, Badge, Btn } from "../ui";
import EntityThread from "../EntityThread";
import { ago } from "./StoryEditor.helpers";

const TSep = () => <div style={{ width: 1, height: 20, background: Z.bd, margin: "0 4px" }} />;

// Sticky top of the editor: back nav, story title, save status pill,
// upload counter, status badges, preview pill, and the discussion
// popover. None of this depends on body content (the editor instance
// is passed only for the discussion height calc), so memoizing this
// keeps title-input keystrokes from flowing through the discussion
// thread render.
function StoryEditorTopBar({
  meta, save, uploads, story, team,
  isPublished, needsRepublish, republishedFlash,
  republishing,
  discussionOpen, discussionCount,
  onBack, onPreview, onRepublish, onSetDiscussionOpen, onMsgCount,
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", borderBottom: "1px solid " + Z.bd, background: Z.sf, flexShrink: 0 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, display: "flex", alignItems: "center", gap: 4, fontSize: FS.sm, fontFamily: COND, fontWeight: 600 }}>{"←"} Back to Editorial</button>
      <TSep />
      <span style={{ fontSize: FS.base, fontWeight: 700, color: Z.tx, fontFamily: COND, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta.title || "Untitled Story"}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {save.status === "saving" && <span style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND }}>Saving…</span>}
        {save.status === "saved" && save.lastSavedAt && <span style={{ fontSize: FS.micro, color: Z.su || "#22c55e", fontFamily: COND }}>{"✓"} Saved {ago(save.lastSavedAt)}</span>}
        {save.status === "error" && (
          <button
            onClick={() => (save.error?.retry ? save.error.retry() : save.clearError())}
            title={save.error?.message}
            style={{ fontSize: FS.micro, color: Z.da, fontFamily: COND, fontWeight: 700, background: Z.da + "12", border: "1px solid " + Z.da + "40", padding: "2px 8px", borderRadius: Ri, cursor: "pointer" }}
          >
            {"⚠"} Save failed — retry
          </button>
        )}
        {uploads.size > 0 && <span style={{ fontSize: FS.micro, color: Z.wa, fontFamily: COND }}>Uploading {uploads.size}…</span>}
        <Badge status={meta.status || "Draft"} small />
        {meta.is_featured && <span style={{ fontSize: FS.micro, fontWeight: 700, padding: "2px 6px", borderRadius: Ri, background: Z.wa + "18", color: Z.wa }}>{"★"} Featured</span>}
        {isPublished && !needsRepublish && !republishedFlash && <span style={{ fontSize: FS.micro, fontWeight: 700, padding: "2px 6px", borderRadius: Ri, background: ACCENT.green + "18", color: ACCENT.green }}>Live</span>}
        {republishedFlash > 0 && <span style={{ fontSize: FS.micro, fontWeight: 700, padding: "2px 6px", borderRadius: Ri, background: ACCENT.green + "22", color: ACCENT.green }}>{"✓"} Republished</span>}
        {needsRepublish && !republishedFlash && <Btn sm onClick={onRepublish} disabled={republishing} style={{ background: Z.wa + "18", color: Z.wa, border: "1px solid " + Z.wa + "40" }}>{republishing ? "Republishing…" : "↻ Republish"}</Btn>}
        <Btn sm v="secondary" onClick={onPreview} title="Preview how this story will render on the web">{"👁"} Preview</Btn>
        {story?.id && (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => onSetDiscussionOpen(o => !o)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "4px 10px", borderRadius: Ri,
                border: "1px solid " + Z.bd,
                background: discussionOpen ? Z.ac + "18" : Z.sa,
                color: discussionOpen ? Z.ac : Z.tx,
                fontSize: FS.sm, fontFamily: COND, fontWeight: 600, cursor: "pointer",
              }}
              title="Open thread"
            >
              <Ic.chat size={13} />
              <span>Discussion</span>
              {discussionCount > 0 && (
                <span style={{ fontSize: FS.micro, fontWeight: 700, color: Z.tm }}>{"·"} {discussionCount}</span>
              )}
              <span style={{ fontSize: FS.micro, color: Z.tm, marginLeft: 2 }}>{discussionOpen ? "▾" : "▿"}</span>
            </button>
            {discussionOpen && (
              <>
                <div onClick={() => onSetDiscussionOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 90, background: "transparent" }} />
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0,
                  width: 440, maxWidth: "90vw", zIndex: 91,
                  background: Z.sf, border: "1px solid " + Z.bd, borderRadius: 8,
                  boxShadow: "0 18px 48px rgba(0,0,0,0.35)", overflow: "hidden",
                }}>
                  <EntityThread
                    refType="story"
                    refId={story.id}
                    title={`Story: ${meta.title || "Untitled"}`}
                    participants={[meta.assigned_to, meta.editor_id].filter(Boolean)}
                    team={team}
                    headerless
                    height={420}
                    onMsgCount={onMsgCount}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(StoryEditorTopBar);
