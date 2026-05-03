import React, { useState, useEffect, useCallback } from "react";
import { Z, COND, FS, Ri } from "../../lib/theme";
import { Ic, Badge, Btn } from "../ui";
import EntityThread from "../EntityThread";
import { ago } from "./StoryEditor.helpers";
import { useModalStack } from "../../hooks/useModalStack";

const TSep = () => <div style={{ width: 1, height: 20, background: Z.bd, margin: "0 4px" }} />;

// Save indicator. Wave-3 polish: relative time stays fresh via a 30s
// tick, and the idle-with-a-saved-state copy reads "All changes
// saved · Xm ago" past the first minute so the editor doesn't appear
// frozen during a quiet stretch.
function SaveIndicator({ save }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  if (save.status === "saving") {
    return <span style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND }}>Saving…</span>;
  }
  if (save.status === "error") {
    return (
      <button
        onClick={() => (save.error?.retry ? save.error.retry() : save.clearError())}
        title={save.error?.message}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.micro, color: Z.da, fontFamily: COND, fontWeight: 700, background: Z.da + "12", border: "1px solid " + Z.da + "40", padding: "2px 8px", borderRadius: Ri, cursor: "pointer" }}
      >
        <Ic.alert size={11} /> Save failed — retry
      </button>
    );
  }
  if (save.status === "saved" && save.lastSavedAt) {
    const ageMs = Date.now() - save.lastSavedAt.getTime();
    const ageMin = Math.floor(ageMs / 60000);
    if (ageMin >= 1) {
      return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.micro, color: Z.su || "#22c55e", fontFamily: COND }}><Ic.check size={11} /> All changes saved · {ago(save.lastSavedAt)}</span>;
    }
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.micro, color: Z.su || "#22c55e", fontFamily: COND }}><Ic.check size={11} /> Saved</span>;
  }
  return null;
}

// Sticky top of the editor: back nav, story title, save status pill,
// upload counter, workflow status badge, word-limit warning, preview
// pill, and the discussion popover. Wave-3 trim: the Live/Republished
// pills and the Republish button moved into the sidebar's Hand-off
// section so publish state has one canonical home. Featured pill also
// removed from the top bar — already shown in the sidebar's Flags
// panel.
function StoryEditorTopBar({
  meta, save, uploads, story, team, wordCount,
  discussionOpen, discussionCount,
  onBack, onPreview, onSetDiscussionOpen, onMsgCount,
}) {
  const overBy = meta.word_limit && wordCount > meta.word_limit ? wordCount - meta.word_limit : 0;
  const closeDiscussion = useCallback(() => onSetDiscussionOpen(false), [onSetDiscussionOpen]);
  useModalStack(discussionOpen, closeDiscussion);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", borderBottom: "1px solid " + Z.bd, background: Z.sf, flexShrink: 0 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, display: "flex", alignItems: "center", gap: 4, fontSize: FS.sm, fontFamily: COND, fontWeight: 600 }}>{"←"} Back to Editorial</button>
      <TSep />
      <span style={{ fontSize: FS.base, fontWeight: 700, color: Z.tx, fontFamily: COND, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta.title || "Untitled Story"}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SaveIndicator save={save} />
        {uploads.size > 0 && <span style={{ fontSize: FS.micro, color: Z.wa, fontFamily: COND }}>Uploading {uploads.size}…</span>}
        {/* Word-limit overflow badge — sticky from anywhere in the editor.
            Distinct from the byline-strip count (which shows current
            count); this one only appears once you're over and nags. */}
        {overBy > 0 && (
          <span
            title={`${overBy} words over the ${meta.word_limit} limit`}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.micro, fontWeight: 700, padding: "2px 8px", borderRadius: Ri, background: Z.da + "18", color: Z.da, fontFamily: COND }}
          >
            <Ic.alert size={11} /> {overBy} over
          </span>
        )}
        <Badge status={meta.status || "Draft"} small />
        <Btn sm v="secondary" onClick={onPreview} title="Preview how this story will render on the web"><Ic.eye size={11} /> Preview</Btn>
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
