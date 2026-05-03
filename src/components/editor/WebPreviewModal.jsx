import React from "react";
import { FS } from "../../lib/theme";
import { useModalStack } from "../../hooks/useModalStack";

// Reader-view preview of the live editor body. Reads `editor.getHTML()`
// once on render so editors see in-flight changes (not just persisted
// body). Markup mirrors a StellarPress article page enough to catch
// "did I forget the byline / featured image / category" before publish.
function WebPreviewModal({ open, onClose, meta, pubs, editor }) {
  useModalStack(open, onClose);
  if (!open) return null;
  const pubName = (pubs.find(p => p.id === (meta.publication_id || meta.publication))?.name) || "Publication";
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 760, background: "#fff", color: "#111318", borderRadius: 8, boxShadow: "0 30px 80px rgba(0,0,0,0.4)", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
          <span style={{ fontSize: FS.xs, fontWeight: 800, color: "#6b7280", letterSpacing: "0.1em", textTransform: "uppercase" }}>Web Preview</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: FS.title, lineHeight: 1 }}>{"×"}</button>
        </div>
        <article style={{ padding: "32px 48px 48px", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 18, lineHeight: 1.7, color: "#111318" }}>
          {meta.featured_image_url && (
            <img src={meta.featured_image_url} alt="" style={{ width: "100%", maxHeight: 420, objectFit: "cover", borderRadius: 4, marginBottom: 24 }} />
          )}
          <div style={{ fontSize: FS.sm, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            {pubName}
            {meta.category ? <> {"·"} <span style={{ color: "#2563eb" }}>{meta.category}</span></> : null}
          </div>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 34, lineHeight: 1.2, fontWeight: 800, margin: "0 0 12px", color: "#111318" }}>{meta.title || "(untitled)"}</h1>
          {meta.excerpt && <p style={{ fontSize: 17, color: "#525e72", fontStyle: "italic", margin: "0 0 20px", lineHeight: 1.55 }}>{meta.excerpt}</p>}
          <div style={{ fontSize: FS.base, color: "#6b7280", marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
            By <strong style={{ color: "#111318" }}>{meta.author || "No author"}</strong>
            {meta.first_published_at && <> {"·"} {new Date(meta.first_published_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</>}
          </div>
          <div
            className="tiptap"
            dangerouslySetInnerHTML={{ __html: editor?.getHTML() || "" }}
            style={{ fontSize: 18, lineHeight: 1.7 }}
          />
        </article>
      </div>
    </div>
  );
}

export default React.memo(WebPreviewModal);
