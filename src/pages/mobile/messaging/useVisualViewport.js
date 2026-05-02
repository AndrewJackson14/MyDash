// useVisualViewport — full visual-viewport state, polled from the
// VisualViewport API.
//
// Returns { width, height, offsetTop, offsetLeft } sized in CSS px.
//
// Why this exists (over the simpler useKeyboardHeight): on iOS
// WebKit (Safari + Chrome-on-iOS), the on-screen keyboard makes
// the BROWSER scroll the *visual* viewport down within the layout
// viewport to bring the focused input into view. position:fixed
// elements anchor to the layout viewport, so they appear to slide
// out of the visible area when this happens — even with the
// document fully locked (body fixed inset:0 + html overflow hidden)
// because WebKit's visual viewport scroll is independent of DOM
// scroll containers.
//
// To keep elements pinned to what the user actually sees, position
// them with top: ${offsetTop}px / left: ${offsetLeft}px / width:
// ${width}px / height: ${height}px and they'll ride the visual
// viewport instead of the layout.
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
    const update = () => setVv({
      width:      v.width,
      height:     v.height,
      offsetTop:  v.offsetTop,
      offsetLeft: v.offsetLeft,
    });
    update();
    v.addEventListener("resize", update);
    v.addEventListener("scroll", update);
    return () => {
      v.removeEventListener("resize", update);
      v.removeEventListener("scroll", update);
    };
  }, []);

  return vv;
}
