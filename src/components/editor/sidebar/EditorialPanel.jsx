import React from "react";
import { Z, COND, FS, Ri } from "../../../lib/theme";
import EditorialChecker from "../../EditorialChecker";

// Thin wrapper around EditorialChecker. Pre-builds the story payload
// the checker expects from the editor's local meta state. Phase E hook
// for editorial review just before promoting to Ready.
function EditorialPanel({
  story, meta, fullContent, editor, currentUser, onDraftCreated,
  onSetTitle, onApplyGeneratedBody,
}) {
  const pubId = (Array.isArray(meta.publication_id) ? meta.publication_id[0] : meta.publication_id) || meta.publication || "";
  return (
    <div style={{ background: Z.bg, borderRadius: Ri, padding: 10, border: "1px solid " + Z.bd }}>
      <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>
        Editorial
      </div>
      <EditorialChecker
        story={{
          id:             story.id,
          title:          meta.title || story.title || "",
          author:         meta.author || story.author || "",
          category:       meta.category || story.category || "news",
          publication_id: pubId,
          word_limit:     meta.word_limit || story.word_limit || null,
        }}
        bodyHtml={editor?.getHTML() || fullContent?.body || ""}
        pubId={pubId}
        onSetTitle={onSetTitle}
        viewerId={currentUser?.id}
        viewerName={currentUser?.name}
        viewerRole={currentUser?.role}
        viewerIsAdmin={!!(currentUser?.permissions?.includes?.("admin"))}
        onApplyGeneratedBody={onApplyGeneratedBody}
        onDraftCreated={onDraftCreated}
      />
    </div>
  );
}

export default React.memo(EditorialPanel);
