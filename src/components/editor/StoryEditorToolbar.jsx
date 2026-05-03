import React, { useState, useEffect } from "react";
import { Z, COND, FS, Ri } from "../../lib/theme";
import { Ic } from "../ui";

const TBtn = ({ onClick, active, children, title }) => (
  <button onClick={onClick} title={title} style={{ padding: "4px 8px", border: "none", borderRadius: Ri, background: active ? Z.ac + "20" : "transparent", color: active ? Z.ac : Z.tm, cursor: "pointer", fontSize: FS.base, fontWeight: active ? 700 : 500, display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 28, height: 28 }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = Z.sa; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>{children}</button>
);
const TSep = () => <div style={{ width: 1, height: 20, background: Z.bd, margin: "0 4px" }} />;

// TipTap formatting toolbar. The "active" state of each button needs
// to track the editor's selection — TipTap doesn't push state into
// React on its own, so we tick a force-update counter on
// selectionUpdate / update events. This is the pattern from TipTap's
// own examples and adds a no-op state slot per editor mount.
function StoryEditorToolbar({
  editor, fileInputRef,
  onLinkClick, onUploadClick, onPickInlineMedia, onPickGalleryMedia, onFileSelected,
}) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const tick = () => force(n => n + 1);
    editor.on("selectionUpdate", tick);
    editor.on("update", tick);
    return () => {
      editor.off("selectionUpdate", tick);
      editor.off("update", tick);
    };
  }, [editor]);

  if (!editor) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "4px 32px", borderTop: "1px solid " + Z.bd, borderBottom: "1px solid " + Z.bd, background: Z.sf, flexWrap: "wrap", flexShrink: 0 }}>
      <TBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold"><strong>B</strong></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic"><em>I</em></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline"><u>U</u></TBtn>
      <TSep />
      <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="H1">H1</TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="H2">H2</TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="H3">H3</TBtn>
      <TBtn onClick={() => editor.chain().focus().setParagraph().run()} active={editor.isActive("paragraph")} title="P">{"¶"}</TBtn>
      <TSep />
      <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullets"><Ic.listBul size={16} /></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered list"><Ic.listOl size={16} /></TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Quote"><Ic.quote size={16} /></TBtn>
      <TSep />
      <TBtn onClick={onLinkClick} active={editor.isActive("link")} title="Link"><Ic.link size={16} /></TBtn>
      <TBtn onClick={onUploadClick} title="Upload Image"><Ic.up size={16} /></TBtn>
      <TBtn onClick={onPickInlineMedia} title="From Library"><Ic.image size={16} /></TBtn>
      <TBtn onClick={onPickGalleryMedia} title="Insert Gallery"><Ic.flat size={16} /></TBtn>
      <TBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider"><Ic.divider size={16} /></TBtn>
      <TSep />
      <TBtn onClick={() => editor.chain().focus().undo().run()} title="Undo"><Ic.undo size={16} /></TBtn>
      <TBtn onClick={() => editor.chain().focus().redo().run()} title="Redo"><Ic.redo size={16} /></TBtn>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={e => { if (e.target.files[0]) onFileSelected(e.target.files[0]); e.target.value = ""; }}
      />
    </div>
  );
}

export default React.memo(StoryEditorToolbar);
