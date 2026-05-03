import React, { useEffect, useState } from "react";
import { Z, COND, ACCENT, FS, Ri } from "../../../lib/theme";
import { supabase } from "../../../lib/supabase";

// Backlink panel for drafts created via RegenerateModal. The new
// draft carries generated_from_id; this panel resolves the source's
// title/author/date and lets the editor jump to it. Stays hidden
// when generated_from_id is null (most stories).
function GeneratedFromPanel({ generatedFromId, onOpenSource }) {
  const [source, setSource] = useState(null);

  useEffect(() => {
    if (!generatedFromId) { setSource(null); return; }
    let alive = true;
    supabase.from("stories")
      .select("id, title, first_published_at, published_at, author")
      .eq("id", generatedFromId)
      .single()
      .then(({ data }) => { if (alive) setSource(data); });
    return () => { alive = false; };
  }, [generatedFromId]);

  if (!generatedFromId) return null;

  return (
    <div style={{ background: ACCENT.indigo + "10", borderRadius: Ri, padding: 10, border: "1px solid " + ACCENT.indigo + "30" }}>
      <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: ACCENT.indigo, fontFamily: COND, marginBottom: 4 }}>
        Generated from
      </div>
      {!source ? (
        <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, fontStyle: "italic" }}>Loading…</div>
      ) : (
        <button
          onClick={() => onOpenSource && onOpenSource(source.id)}
          style={{
            background: "none", border: "none", padding: 0, textAlign: "left",
            cursor: onOpenSource ? "pointer" : "default", color: Z.tx, fontFamily: COND,
            fontSize: FS.xs, fontWeight: 600, width: "100%",
          }}
        >
          {source.title || "(untitled)"}
          <div style={{ fontSize: FS.micro, color: Z.tm, fontWeight: 400, marginTop: 2 }}>
            {source.author && `${source.author}`}
            {(source.first_published_at || source.published_at) &&
              ` · ${new Date(source.first_published_at || source.published_at).toLocaleDateString()}`}
          </div>
        </button>
      )}
    </div>
  );
}

export default React.memo(GeneratedFromPanel);
