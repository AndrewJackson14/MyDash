import React from "react";
import { Z } from "../../lib/theme";

// Layout-stable skeleton shown while the story content fetch is in
// flight. Mirrors the editor's actual top bar / title / paragraph
// shape so when the real content lands it slots in without a layout
// jump. The pulse animation is injected once at module level.
const STYLE_ID = "story-editor-skeleton-keyframes";
function ensureKeyframes() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `@keyframes seSkeletonPulse { 0% { opacity: 0.55; } 50% { opacity: 0.9; } 100% { opacity: 0.55; } }`;
  document.head.appendChild(el);
}

const block = (extra = {}) => ({
  background: Z.sa,
  borderRadius: 4,
  animation: "seSkeletonPulse 1.4s ease-in-out infinite",
  ...extra,
});

function LoadingSkeleton() {
  ensureKeyframes();
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: Z.bg }}>
      <div style={{ padding: "8px 16px", borderBottom: "1px solid " + Z.bd, display: "flex", gap: 12, alignItems: "center" }}>
        <div style={block({ width: 110, height: 16 })} />
        <div style={block({ width: 280, height: 16, flex: 1, maxWidth: 480 })} />
        <div style={block({ width: 70, height: 18 })} />
        <div style={block({ width: 90, height: 24 })} />
      </div>
      <div style={{ display: "flex", flex: 1 }}>
        <div style={{ flex: 1, padding: "24px 32px" }}>
          <div style={block({ width: "70%", height: 28, marginBottom: 12 })} />
          <div style={block({ width: "40%", height: 14, marginBottom: 28 })} />
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={block({ width: i === 5 ? "60%" : "100%", height: 12, marginBottom: 10 })} />
          ))}
        </div>
        <div style={{ width: 320, borderLeft: "1px solid " + Z.bd, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {[80, 100, 60, 90, 70].map((h, i) => <div key={i} style={block({ width: "100%", height: h })} />)}
        </div>
      </div>
    </div>
  );
}

export default React.memo(LoadingSkeleton);
