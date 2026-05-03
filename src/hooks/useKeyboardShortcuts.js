import { useEffect } from "react";

// Global keyboard-shortcut binder. Each binding is an object:
//   { key, cmd?, shift?, alt?, fn, allowInInputs?, prevent? }
//
// - `cmd` matches the platform-appropriate modifier (Cmd on macOS,
//   Ctrl on Windows/Linux). Detected via navigator.platform.
// - `allowInInputs` (default false) lets the shortcut fire while an
//   input/textarea/contenteditable has focus — needed for Cmd+S,
//   Cmd+P, Cmd+Enter so editors don't have to blur the title field
//   first.
// - `prevent` (default true) calls preventDefault — important so the
//   browser doesn't also try to save/print the page.
//
// Pass a stable bindings array (e.g. via useMemo) so the effect's
// listener identity is stable across renders.
export function useKeyboardShortcuts(bindings) {
  useEffect(() => {
    const handler = (e) => {
      const tag = e.target.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable;
      const isMac = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");
      const meta = isMac ? e.metaKey : e.ctrlKey;

      for (const binding of bindings) {
        const { key, shift = false, alt = false, cmd = false, fn, allowInInputs = false, prevent = true } = binding;
        if (!key) continue;
        if (e.key.toLowerCase() !== key.toLowerCase()) continue;
        if (cmd !== meta) continue;
        if (shift !== e.shiftKey) continue;
        if (alt !== e.altKey) continue;
        if (inInput && !allowInInputs) continue;
        if (prevent) e.preventDefault();
        fn(e);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [bindings]);
}
