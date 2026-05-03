import React, { useState, useEffect } from "react";
import { EditorContent } from "@tiptap/react";
import { Z, COND, DISPLAY, FS } from "../../lib/theme";
import { pn, pColor } from "./StoryEditor.helpers";

// Title row + byline strip + EditorContent. wordCount lives here and
// is computed via editor.on("update") instead of being recomputed on
// every parent render. Lifted up via onWordCount so the sidebar's
// over-limit warning can read it without re-running editor.getText()
// on each render.
function StoryEditorBody({
  meta, setMeta, selectedPubs, pubs, editor, onTitleBlur, onWordCount,
}) {
  const [wordCount, setWordCount] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const recount = () => {
      const t = editor.getText().trim();
      const wc = t ? t.split(/\s+/).length : 0;
      setWordCount(wc);
      if (onWordCount) onWordCount(wc);
    };
    recount();
    editor.on("update", recount);
    return () => editor.off("update", recount);
  }, [editor, onWordCount]);

  return (
    <>
      <div style={{ padding: "20px 32px 0" }}>
        <input
          value={meta.title || ""}
          onChange={e => setMeta(m => ({ ...m, title: e.target.value }))}
          onBlur={e => onTitleBlur(e.target.value)}
          placeholder="Story title…"
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 28, fontWeight: 800, color: Z.tx, fontFamily: DISPLAY, lineHeight: 1.2, padding: 0, marginBottom: 8 }}
        />
        <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
          {selectedPubs.map(pid => <span key={pid} style={{ color: pColor(pid, pubs, Z.ac) }}>{pn(pid, pubs)}</span>)}
          <span>{"·"}</span>
          <span>{meta.author || "No author"}</span>
          <span>{"·"}</span>
          <span>{meta.category || "Uncategorized"}</span>
          <span>{"·"}</span>
          <span style={{ color: meta.word_limit && wordCount > meta.word_limit ? Z.da : undefined, fontWeight: meta.word_limit && wordCount > meta.word_limit ? 700 : undefined }}>
            {wordCount.toLocaleString()}{meta.word_limit ? ` / ${meta.word_limit.toLocaleString()}` : ""} words
          </span>
          {meta.word_limit && wordCount > meta.word_limit && <span style={{ color: Z.da, fontWeight: 700 }}>{"⚠"} Over by {(wordCount - meta.word_limit).toLocaleString()}</span>}
        </div>
      </div>
    </>
  );
}

export default React.memo(StoryEditorBody);
