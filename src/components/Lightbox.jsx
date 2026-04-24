// ============================================================
// Lightbox — full-screen image viewer with shadow-box centering.
//
// Used by Discussion attachments. Pass an `images` array of
// { url, alt? } and an `index` of the active one. Calls onClose
// when the user dismisses (Esc, backdrop click, ✕). Arrow keys
// and on-screen chevrons cycle through `images`.
//
// Pure presentation — no DB, no fetching. Hosting components are
// expected to maintain the gallery list and active index.
// ============================================================
import { useEffect, useCallback } from "react";

export default function Lightbox({ images, index, onClose, onIndex }) {
  const total = images?.length || 0;
  const safeIdx = Math.max(0, Math.min(index ?? 0, total - 1));
  const current = total > 0 ? images[safeIdx] : null;

  const goPrev = useCallback(() => {
    if (total <= 1) return;
    onIndex?.((safeIdx - 1 + total) % total);
  }, [safeIdx, total, onIndex]);
  const goNext = useCallback(() => {
    if (total <= 1) return;
    onIndex?.((safeIdx + 1) % total);
  }, [safeIdx, total, onIndex]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goPrev, goNext]);

  if (!current) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose?.(); }}
        aria-label="Close"
        style={{
          position: "absolute", top: 16, right: 18,
          width: 36, height: 36, borderRadius: 18,
          background: "rgba(0,0,0,0.4)", color: "#fff",
          border: "1px solid rgba(255,255,255,0.2)",
          fontSize: 18, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >×</button>
      {total > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          aria-label="Previous"
          style={{
            position: "absolute", left: 24, top: "50%", transform: "translateY(-50%)",
            width: 44, height: 44, borderRadius: 22,
            background: "rgba(0,0,0,0.4)", color: "#fff",
            border: "1px solid rgba(255,255,255,0.2)",
            fontSize: 20, fontWeight: 700, cursor: "pointer",
          }}
        >‹</button>
      )}
      {total > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          aria-label="Next"
          style={{
            position: "absolute", right: 24, top: "50%", transform: "translateY(-50%)",
            width: 44, height: 44, borderRadius: 22,
            background: "rgba(0,0,0,0.4)", color: "#fff",
            border: "1px solid rgba(255,255,255,0.2)",
            fontSize: 20, fontWeight: 700, cursor: "pointer",
          }}
        >›</button>
      )}
      <img
        onClick={(e) => e.stopPropagation()}
        src={current.url}
        alt={current.alt || ""}
        style={{
          maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)", borderRadius: 4,
        }}
      />
      {total > 1 && (
        <div style={{
          position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)",
          color: "rgba(255,255,255,0.7)", fontSize: 12, letterSpacing: "0.06em",
          background: "rgba(0,0,0,0.4)", padding: "4px 10px", borderRadius: 12,
        }}>
          {safeIdx + 1} / {total}
        </div>
      )}
    </div>
  );
}
