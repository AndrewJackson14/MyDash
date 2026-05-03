import { useEffect, useRef } from "react";

// Module-level stack of open modals. Esc dispatches to the topmost
// (most-recently-opened) and stops propagation so a single keypress
// closes one modal at a time, deepest first.
const stack = [];

// Register an open modal. While `isOpen` is true, the modal is on
// the stack; on close (or unmount) it's removed. Esc fires the
// topmost entry's `onClose`.
//
// Centralizing Esc here means modals don't compete via independent
// keydown listeners, and the underlying `Modal` component's own Esc
// handling (if any) should be deferred to this hook to avoid double
// firing.
export function useModalStack(isOpen, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const entry = { close: () => onCloseRef.current && onCloseRef.current() };
    stack.push(entry);
    const handler = (e) => {
      if (e.key !== "Escape") return;
      const top = stack[stack.length - 1];
      if (top === entry) {
        e.preventDefault();
        e.stopPropagation();
        entry.close();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      const idx = stack.indexOf(entry);
      if (idx !== -1) stack.splice(idx, 1);
      window.removeEventListener("keydown", handler);
    };
  }, [isOpen]);
}
