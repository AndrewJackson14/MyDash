// useVisualViewport — full visual-viewport state, polled from the
// VisualViewport API.
//
// Returns { width, height, offsetTop, offsetLeft } sized in CSS px.
//
// Why this exists: on iOS WebKit (Safari + Chrome-on-iOS), the
// on-screen keyboard scrolls the visual viewport DOWN within the
// layout viewport to bring the focused input into view.
// position:fixed elements anchor to the layout viewport, so they
// appear to slide out of the visible area when this happens — even
// with the document fully locked (body fixed inset:0 + html overflow
// hidden) because the visual viewport scroll is independent of DOM
// scroll containers.
//
// To keep elements pinned to what the user actually sees, position
// them with top: ${offsetTop}px / left: ${offsetLeft}px / width:
// ${width}px / height: ${height}px and they'll ride the visual
// viewport instead of the layout.
//
// Two important details:
//
// 1. We listen to `resize` only, not `scroll`. iOS fires many
//    `scroll` events per second during the keyboard slide animation,
//    and each one carries an intermediate offsetTop value as the
//    visual viewport bounces toward its final position. Reacting
//    to all of them produced a visible bounce on the messaging
//    chrome. `resize` fires only on the final keyboard-open and
//    keyboard-close transitions — no intermediate values, no bounce.
//
// 2. We snap-rAF the resize handler. iOS sometimes fires `resize`
//    twice in quick succession (one for "keyboard about to open"
//    and one for "keyboard fully open"); coalescing into the next
//    paint settles to the final value before React commits.
import { useEffect, useState } from "react";

export function useVisualViewport() {
  const [vv, setVv] = useState(() => ({
    width:      typeof window !== "undefined" ? window.innerWidth  : 0,
    height:     typeof window !== "undefined" ? window.innerHeight : 0,
    offsetTop:  0,
    offsetLeft: 0,
  }));

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const v = window.visualViewport;
    let raf = 0;
    const snapshot = () => setVv({
      width:      v.width,
      height:     v.height,
      offsetTop:  v.offsetTop,
      offsetLeft: v.offsetLeft,
    });
    const onResize = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(snapshot);
    };
    snapshot();
    v.addEventListener("resize", onResize);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      v.removeEventListener("resize", onResize);
    };
  }, []);

  return vv;
}
