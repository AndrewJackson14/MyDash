import { useMemo } from "react";

// ============================================================
// AmbientPressureLayer — global animated background tint that
// tracks with the user's "how stressed is the newsroom" heat.
//
// pressure: 0-100 from useSignalFeed.globalPressure.
//   0  = serene rippling blue (deep calm, slow ripple)
//   50 = muted amber (warming)
//   100 = pulsing red (on fire — fast pulse + stronger alpha)
//
// Renders three layered radial gradients at different positions
// with CSS keyframe animations that drift + pulse. Animation
// speed and color alpha interpolate continuously so pressure
// changes feel like a living background.
//
// Fixed-position, pointer-events: none. Meant to sit ABOVE the
// wallpaper image layer and BELOW the app content.
// ============================================================

// Linearly interpolate between two RGB triples
function lerpColor(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}
const BLUE = { r: 59, g: 130, b: 246 };   // #3B82F6 — serene
const AMBER = { r: 245, g: 158, b: 11 };  // #F59E0B — warming
const RED = { r: 239, g: 68, b: 68 };     // #EF4444 — urgent

export default function AmbientPressureLayer({ pressure = 20 }) {
  const p = Math.max(0, Math.min(100, pressure));

  const { color, alpha, duration, pulseAlpha } = useMemo(() => {
    // Two-stage interpolation: 0→50 is blue→amber, 50→100 is amber→red.
    const c = p < 50
      ? lerpColor(BLUE, AMBER, p / 50)
      : lerpColor(AMBER, RED, (p - 50) / 50);
    // Alpha and pulse strength scale with pressure — calm is subtle, hot is loud.
    // Non-linear ramp: stays gentle up to ~50, then climbs faster so red really
    // reads when the dashboard has multiple urgent cards.
    const eased = Math.pow(p / 100, 1.4);
    const alpha = 0.08 + eased * 0.26;             // 0.08 → 0.34
    const pulseAlpha = 0.02 + eased * 0.10;
    // Ripple/pulse duration: 14s at full calm, 1.8s at full heat. Shorter = more urgent.
    const duration = 14 - eased * 12.2;
    return { color: c, alpha, duration, pulseAlpha };
  }, [p]);

  const rgb = `${color.r},${color.g},${color.b}`;
  const g1 = `rgba(${rgb},${alpha.toFixed(3)})`;
  const g2 = `rgba(${rgb},${(alpha * 0.75).toFixed(3)})`;
  const g3 = `rgba(${rgb},${(alpha * 0.5).toFixed(3)})`;

  return <>
    <style>{`
      @keyframes ambient-ripple {
        0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
        25%      { transform: translate3d(1.5%, 0.8%, 0) scale(1.015); }
        50%      { transform: translate3d(-0.8%, 1.6%, 0) scale(0.99); }
        75%      { transform: translate3d(0.6%, -0.9%, 0) scale(1.01); }
      }
      @keyframes ambient-pulse {
        0%, 100% { opacity: 0.85; }
        50%      { opacity: 1; }
      }
    `}</style>
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: "-12%",
        backgroundImage:
          `radial-gradient(ellipse 60% 50% at 25% 30%, ${g1}, transparent 65%),` +
          `radial-gradient(ellipse 55% 55% at 75% 70%, ${g2}, transparent 65%),` +
          `radial-gradient(ellipse 70% 40% at 50% 90%, ${g3}, transparent 70%)`,
        animation: `ambient-ripple ${duration.toFixed(2)}s ease-in-out infinite, ambient-pulse ${(duration / 2).toFixed(2)}s ease-in-out infinite`,
        transition: "background-image 4s ease",
        pointerEvents: "none",
        zIndex: 0,
        willChange: "transform, opacity",
      }}
    />
  </>;
}
