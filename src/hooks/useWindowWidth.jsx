// useWindowWidth — single source of truth for viewport-driven layout
// switches. Returns the current window.innerWidth, throttled to one
// update per animation frame so resize storms don't thrash React.
//
// Pair with the BREAKPOINTS table for semantic checks
// (`width < BREAKPOINTS.md` etc.) so callers don't sprinkle magic
// numbers everywhere.
import { useEffect, useState } from "react";

export const BREAKPOINTS = {
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
};

export function useWindowWidth() {
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? BREAKPOINTS.lg : window.innerWidth
  );

  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setWidth(window.innerWidth));
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return width;
}

export function useIsMobile() {
  return useWindowWidth() < BREAKPOINTS.md;
}
