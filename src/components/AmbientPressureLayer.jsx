import { useMemo } from "react";
import { isDark as _isDark } from "../lib/theme";

// ============================================================
// AmbientPressureLayer — global animated background tint that
// tracks with the user's "how stressed is the newsroom" heat.
//
// pressure: 0-100 from useSignalFeed.globalPressure.
//   0  = serene rippling blue (deep calm, slow ripple)
//   50 = muted amber (warming)
//   100 = pulsing red (on fire — fast pulse + stronger alpha)
//
// Design notes:
// - Three independent layers (not one div with three gradients)
//   each run their own keyframe animation on different durations
//   and phase offsets so the blobs drift across each other like
//   slow waves instead of moving as a rigid unit. That's what
//   makes the motion feel fluid instead of like a single sliding
//   panel.
// - Each layer has a blur filter applied to soften the gradient
//   falloff even further — without it the radial edges look hard
//   against the wallpaper.
// - Light mode and dark mode need different alpha ceilings: light
//   mode needs a deeper red to avoid reading as pink; dark mode
//   needs a louder blue so it actually shows through the near-
//   black wallpaper.
// ============================================================

// Linearly interpolate between two RGB triples
function lerpColor(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}
const BLUE = { r: 59, g: 130, b: 246 };       // #3B82F6 — serene (both modes)
const AMBER = { r: 245, g: 158, b: 11 };      // #F59E0B — warming
const RED_DARK_MODE = { r: 239, g: 68, b: 68 };   // #EF4444 — reads fine on dark
const RED_LIGHT_MODE = { r: 185, g: 28, b: 28 };  // #B91C1C — deeper, avoids pink wash

export default function AmbientPressureLayer({ pressure = 20 }) {
  const p = Math.max(0, Math.min(100, pressure));
  const isDark = _isDark();

  const { color, alpha, baseDuration } = useMemo(() => {
    // Two-stage interpolation: 0→50 is blue→amber, 50→100 is amber→red.
    const RED = isDark ? RED_DARK_MODE : RED_LIGHT_MODE;
    const c = p < 50
      ? lerpColor(BLUE, AMBER, p / 50)
      : lerpColor(AMBER, RED, (p - 50) / 50);
    // Eased alpha ramp: calm up to ~50, then climbs. Dark mode needs a
    // much higher base so the blue actually reads over the near-black
    // wallpaper; light mode needs a high base too so the calm blue
    // actually shows instead of being a faint wash, plus a strong
    // ceiling so red doesn't read as pink.
    const eased = Math.pow(p / 100, 1.4);
    const alphaBase = isDark ? 0.22 : 0.28;
    const alphaRamp = isDark ? 0.32 : 0.32;
    const alpha = alphaBase + eased * alphaRamp;  // dark: 0.22→0.54, light: 0.28→0.60
    // Base duration that each layer multiplies against. 22s fully calm,
    // ~3s at full heat.
    const baseDuration = 22 - eased * 19;
    return { color: c, alpha, baseDuration };
  }, [p, isDark]);

  const rgb = `${color.r},${color.g},${color.b}`;
  // Three layers each at a slightly different alpha so crossfades
  // between them create organic brightness variation.
  const a1 = alpha.toFixed(3);
  const a2 = (alpha * 0.85).toFixed(3);
  const a3 = (alpha * 0.7).toFixed(3);

  // Each blob uses a different keyframe + duration + phase offset so
  // they drift past each other instead of moving as a rigid unit.
  const d1 = baseDuration.toFixed(2);
  const d2 = (baseDuration * 1.35).toFixed(2);  // 35% slower
  const d3 = (baseDuration * 0.8).toFixed(2);   // 20% faster

  const layerBase = {
    position: "fixed",
    inset: "-20%",
    pointerEvents: "none",
    zIndex: 0,
    willChange: "transform, opacity",
    filter: "blur(60px)",
  };

  return <>
    <style>{`
      /* Each amoeba lobe anchors near the middle and wobbles via
         asymmetric scale so the silhouette warps instead of uniformly
         growing. Slight translate keeps the lobes from sitting dead-
         center on top of each other. */
      @keyframes ambient-amoeba-a {
        0%, 100% { transform: translate3d(0, 0, 0) scale(1, 1); }
        33%      { transform: translate3d(1.5%, -1%, 0) scale(1.14, 0.92); }
        66%      { transform: translate3d(-1%, 1.5%, 0) scale(0.94, 1.12); }
      }
      @keyframes ambient-amoeba-b {
        0%, 100% { transform: translate3d(0, 0, 0) scale(1, 1); }
        50%      { transform: translate3d(-1.5%, -0.5%, 0) scale(1.08, 1.15); }
      }
      @keyframes ambient-amoeba-c {
        0%, 100% { transform: translate3d(0, 0, 0) scale(1, 1); }
        40%      { transform: translate3d(0.8%, 1.5%, 0) scale(0.9, 1.06); }
        80%      { transform: translate3d(-1.2%, -1%, 0) scale(1.1, 0.94); }
      }
      @keyframes ambient-breath {
        0%, 100% { opacity: 0.82; }
        50%      { opacity: 1; }
      }
    `}</style>
    {/* Amoeba lobe A — wide horizontal ellipse at center */}
    <div aria-hidden style={{
      ...layerBase,
      background: `radial-gradient(ellipse 45% 35% at 50% 50%, rgba(${rgb},${a1}), transparent 72%)`,
      animation: `ambient-amoeba-a ${d1}s ease-in-out infinite, ambient-breath ${(baseDuration * 0.7).toFixed(2)}s ease-in-out infinite`,
    }} />
    {/* Amoeba lobe B — taller vertical ellipse, offset phase */}
    <div aria-hidden style={{
      ...layerBase,
      background: `radial-gradient(ellipse 32% 45% at 50% 50%, rgba(${rgb},${a2}), transparent 72%)`,
      animation: `ambient-amoeba-b ${d2}s ease-in-out infinite, ambient-breath ${(baseDuration * 0.9).toFixed(2)}s ease-in-out infinite`,
      animationDelay: `-${(baseDuration * 0.4).toFixed(2)}s, -${(baseDuration * 0.25).toFixed(2)}s`,
    }} />
    {/* Amoeba lobe C — slight off-axis warp, faster drift */}
    <div aria-hidden style={{
      ...layerBase,
      background: `radial-gradient(ellipse 38% 30% at 50% 50%, rgba(${rgb},${a3}), transparent 72%)`,
      animation: `ambient-amoeba-c ${d3}s ease-in-out infinite, ambient-breath ${(baseDuration * 0.6).toFixed(2)}s ease-in-out infinite`,
      animationDelay: `-${(baseDuration * 0.7).toFixed(2)}s, -${(baseDuration * 0.5).toFixed(2)}s`,
    }} />
  </>;
}
