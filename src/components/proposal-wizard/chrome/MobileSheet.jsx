// ============================================================
// MobileSheet — bottom-sheet primitive for the mobile wizard
//
// Slides up from the bottom. Dismissible by:
//   1. Backdrop tap (dim layer behind the sheet)
//   2. Drag-down on the handle/header area (>=80px OR velocity > 0.5px/ms)
//   3. Escape key — but ONLY when no input/textarea is focused (so Esc
//      while typing dismisses the keyboard, not the sheet)
//   4. Close X button in the header (if title provided)
//
// Pointer events (not touch) so iOS Safari + Android Chrome + a
// Bluetooth-mouse-on-tablet all behave the same. No glass anywhere
// (per spec — solid Z.bg + a hairline at the top edge).
//
// Reused by MobileStepJumpSheet, MobileDealSummarySheet, and the
// cancel-confirm prompt.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { Z, COND, FS, FW, EASE, DUR } from "../../../lib/theme";
import Ic from "../../ui/Icons";

const DRAG_DISMISS_PX = 80;          // pixels of downward drag to dismiss
const DRAG_DISMISS_VELOCITY = 0.5;   // px per ms
const Z_INDEX = 1100;                // above the wizard shell (1000), below toasts

export default function MobileSheet({
  open,
  onClose,
  title,
  height = "auto",     // "auto" | "60vh" | "80vh" | etc
  children,
}) {
  const sheetRef = useRef(null);
  const dragStateRef = useRef(null);  // { startY, startTime, lastY, lastTime }
  const [dragOffset, setDragOffset] = useState(0);
  const [animating, setAnimating] = useState(false);

  // Reset drag offset whenever the sheet re-opens.
  useEffect(() => {
    if (open) {
      setDragOffset(0);
      setAnimating(true);
      // Let the slide-in animation finish before re-enabling drag.
      const t = setTimeout(() => setAnimating(false), DUR.med);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Esc-to-close — but only when the user isn't typing.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      const ae = document.activeElement;
      const tag = ae?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || ae?.isContentEditable) return;
      e.preventDefault();
      onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while the sheet is open. The sheet's own body
  // is the scroll container.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const onPointerDown = (e) => {
    // Only react to primary pointer (left mouse / first finger).
    if (e.button != null && e.button !== 0) return;
    // Don't start a drag if the user grabbed an input — they're trying
    // to focus, not dismiss.
    const target = e.target;
    if (target?.closest?.("input, textarea, select, button")) {
      // Buttons inside the header are fine to drag from too — but only
      // if they're the close X / handle area, not an action button.
      if (!target.closest("[data-sheet-grab]")) return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const now = performance.now();
    dragStateRef.current = {
      startY: e.clientY,
      startTime: now,
      lastY: e.clientY,
      lastTime: now,
    };
  };
  const onPointerMove = (e) => {
    if (!dragStateRef.current) return;
    const dy = e.clientY - dragStateRef.current.startY;
    // Only respond to downward drag — upward stays put.
    setDragOffset(Math.max(0, dy));
    dragStateRef.current.lastY = e.clientY;
    dragStateRef.current.lastTime = performance.now();
  };
  const onPointerUp = (e) => {
    const ds = dragStateRef.current;
    dragStateRef.current = null;
    if (!ds) return;
    const dy = Math.max(0, e.clientY - ds.startY);
    const dt = Math.max(1, performance.now() - ds.startTime);
    const velocity = dy / dt;  // px/ms downward
    if (dy >= DRAG_DISMISS_PX || velocity >= DRAG_DISMISS_VELOCITY) {
      onClose?.();
    } else {
      // Snap back.
      setAnimating(true);
      setDragOffset(0);
      setTimeout(() => setAnimating(false), DUR.fast);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(15,29,44,0.45)",
          zIndex: Z_INDEX,
          animation: `v2FadeIn ${DUR.med}ms ${EASE}`,
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || "Sheet"}
        style={{
          position: "fixed",
          left: 0, right: 0, bottom: 0,
          maxHeight: "92dvh",
          height,
          background: Z.bg,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          borderTop: `1px solid ${Z.bd}`,
          boxShadow: "0 -12px 32px rgba(15,29,44,0.18)",
          display: "flex", flexDirection: "column",
          zIndex: Z_INDEX + 1,
          transform: `translateY(${dragOffset}px)`,
          transition: animating
            ? `transform ${DUR.med}ms ${EASE}`
            : "none",
          // Slide-in animation only fires on initial open (animating=true
          // for ~DUR.med). After that we run on direct transform writes
          // so the drag tracks 1:1 with the finger.
          animation: animating && dragOffset === 0
            ? `mobileSheetIn ${DUR.med}ms ${EASE}`
            : undefined,
          paddingBottom: "env(safe-area-inset-bottom)",
          touchAction: "none",   // sheet itself doesn't scroll; the body does
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Drag handle — small grey pill, centered. Marked as a grab
            target so onPointerDown picks up drags here even though it
            sits inside what would otherwise be a non-draggable area. */}
        <div
          data-sheet-grab
          style={{
            display: "flex", justifyContent: "center", padding: "8px 0 4px",
            cursor: "grab",
            flexShrink: 0,
          }}
        >
          <div style={{
            width: 36, height: 4,
            background: Z.bd,
            borderRadius: 2,
          }} />
        </div>

        {/* Header — title left, close X right. Optional. Header is also
            grabable so the user can drag the title bar to dismiss. */}
        {title && (
          <div
            data-sheet-grab
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "4px 16px 12px",
              borderBottom: `1px solid ${Z.bd}`,
              flexShrink: 0,
            }}
          >
            <h3 style={{
              margin: 0,
              fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx,
              fontFamily: COND, letterSpacing: -0.2,
            }}>{title}</h3>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "transparent", border: "none",
                padding: 8, cursor: "pointer",
                color: Z.tm, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 8,
                minWidth: 32, minHeight: 32,
              }}
            ><Ic.close size={16} /></button>
          </div>
        )}

        {/* Body — the scroller. touchAction:auto so vertical scroll works
            here; the parent has touchAction:none so drags on the handle
            don't accidentally start a scroll. */}
        <div style={{
          flex: 1, minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          touchAction: "auto",
        }}>
          {children}
        </div>
      </div>

      <style>{`
        @keyframes mobileSheetIn {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
