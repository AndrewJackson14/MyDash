import React, { useState } from "react";
import { Z } from "../../../lib/theme";
import { Btn } from "../../ui";
import { supabase } from "../../../lib/supabase";

// Story-level actions that don't fit elsewhere. Currently:
//   • Duplicate as draft — clones core fields into a new Draft row,
//     scrubs identity (slug, published_at, audit timestamps) so the
//     copy is genuinely fresh.
//   • Delete Story — hard delete with confirm.
//
// Spec called for renaming to MoreActionsPanel; kept the existing
// filename to avoid touching the sidebar import. Visually still the
// "danger zone" because Delete dominates and Duplicate sits above
// the divider.
function DangerZonePanel({ story, meta, dialog, onUpdate, onClose, onOpenStory, currentUser, onDelete }) {
  const [duplicating, setDuplicating] = useState(false);

  const duplicate = async () => {
    if (duplicating) return;
    if (!await dialog.confirm("Create a new draft copy of this story? The original is unchanged.")) return;
    setDuplicating(true);
    try {
      const { data: newStory, error } = await supabase
        .from("stories")
        .insert({
          publication_id: meta.publication_id,
          category_id: meta.category_id,
          category: meta.category,
          author: meta.author,
          author_id: meta.author_id || currentUser?.id,
          title: (meta.title || "Untitled") + " (Copy)",
          body: meta.body,
          content_json: meta.content_json,
          excerpt: meta.excerpt,
          story_type: meta.story_type,
          status: "Draft",
          // Leave published_at, first_published_at, slug null — this
          // is a new draft and needs its own slug on first publish.
        })
        .select()
        .single();
      if (error) throw error;
      onClose();
      if (onOpenStory) onOpenStory(newStory.id);
    } catch (err) {
      await dialog.alert("Duplicate failed: " + (err?.message || err));
    } finally {
      setDuplicating(false);
    }
  };

  return (
    <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      <Btn sm v="secondary" onClick={duplicate} disabled={duplicating} style={{ width: "100%" }}>
        {duplicating ? "Duplicating…" : "Duplicate as draft"}
      </Btn>
      <Btn sm v="danger" onClick={onDelete} style={{ width: "100%" }}>
        Delete Story
      </Btn>
    </div>
  );
}

export default React.memo(DangerZonePanel);
