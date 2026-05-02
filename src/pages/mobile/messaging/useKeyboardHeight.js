// useKeyboardHeight — tracks the on-screen-keyboard height via the
// visualViewport API.
//
// Why this exists: iOS Safari (and Android Chrome to a lesser extent)
// covers the bottom of the layout viewport with the keyboard but
// doesn't shrink 100dvh — it just overlays. When a user focuses an
// input near the bottom of the page, Safari then scrolls the page up
// to bring the input into view, which can push sticky chrome at the
// top off-screen. The fix is to size our messaging area to the
// VISIBLE viewport (window.innerHeight - kbHeight). With the input
// already in the visible area, Safari has nothing to scroll.
//
// Returns 0 when no keyboard / API unavailable.
import { useEffect, useState } from "react";

export function useKeyboardHeight() {
  const [kb, setKb] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => {
      // window.innerHeight = layout viewport (full page including
      // keyboard area). vv.height = visual viewport (what the user
      // sees, minus keyboard). offsetTop accounts for the case where
      // iOS scrolls the layout up so the keyboard "pushes" — we
      // subtract that too so kbHeight is just the visible delta.
      const next = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKb(next);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return kb;
}
