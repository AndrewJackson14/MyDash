// ProofAnnotationOverlay — shared read-only renderer for proofs
// that may carry client-supplied annotation pins.
//
// Extracted from ProofApproval.jsx (P1.13) so the designer-side
// proof preview in AdProjects.jsx can show the same numbered red
// pins + annotation list the client sees on the public approval
// page. Single source of truth for layout means a future style
// tweak (size, color, pulse on hover) lands in both places.
//
// Read-only by design: takes a proofUrl + annotationsJson string
// (already stamped on ad_proofs.annotations as a JSON-encoded
// array of { id, x, y, text }). Returns null if no annotations,
// so callers can render <ProofAnnotationOverlay …/> next to a
// bare <img> and skip the wrapper when there's nothing to show.
//
// The interactive add/remove flow stays in ProofApproval.jsx —
// folding it in here would make the props surface much messier
// and the public proof page is the only writer.
import { useMemo } from "react";

const PIN = "#DC2626";  // red-600 — matches the public approval page

export default function ProofAnnotationOverlay({ proofUrl, annotationsJson, maxHeight = 320 }) {
  const annotations = useMemo(() => {
    if (!annotationsJson) return [];
    if (Array.isArray(annotationsJson)) return annotationsJson;
    try {
      const parsed = JSON.parse(annotationsJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }, [annotationsJson]);

  if (!proofUrl) return null;
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(proofUrl);
  if (!isImage) return null;  // PDF fallback handled by caller (link to open)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
        <img
          src={proofUrl}
          alt="Proof"
          loading="lazy"
          style={{ maxWidth: "100%", maxHeight, display: "block", borderRadius: 6, objectFit: "contain" }}
          draggable={false}
        />
        {annotations.map((a, i) => (
          <div
            key={a.id || `ann-${i}`}
            title={a.text || ""}
            style={{
              position: "absolute",
              left: `${a.x}%`, top: `${a.y}%`,
              transform: "translate(-50%, -50%)",
              width: 22, height: 22, borderRadius: "50%",
              background: PIN, color: "#FFFFFF",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 800,
              boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
              border: "2px solid #FFFFFF",
              pointerEvents: "auto",
            }}
          >{i + 1}</div>
        ))}
      </div>
      {annotations.length > 0 && (
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.45, color: "#1A1A1A" }}>
          {annotations.map((a, i) => (
            <li key={a.id || `note-${i}`} style={{ marginBottom: 2 }}>{a.text || "(no text)"}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
