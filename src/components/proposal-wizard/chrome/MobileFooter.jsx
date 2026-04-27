// ============================================================
// MobileFooter — sticky 64px action bar for the mobile wizard
//
// Two-button layout, full-width:
//   Steps 1–6: [Back 40%] [Next → 60%]
//   Step 7   : [Save Draft 40%] [Send Now → 60%]
//
// Back is disabled on Step 1. Send Now is gated on canSend (same
// rule the desktop footer uses). When isSending is true the active
// button shows its in-flight label and disables.
//
// The save-status row sits in its own thin band ABOVE the footer
// (24px, only renders when there's a saveStatus to show). That's
// in the parent shell, not here — keeps this component just the
// action bar.
//
// safe-area-inset-bottom on the wrapper so the iPhone home indicator
// doesn't sit on top of the buttons.
// ============================================================
import { Z, COND, FS, FW } from "../../../lib/theme";
import Ic from "../../ui/Icons";

export default function MobileFooter({
  isReview,        // true on Step 7
  isFirst,         // true on Step 1 (Back disabled)
  canGoNext,       // gates Next on steps 1–6
  canSend,         // gates Send Now on Step 7
  isSending,       // in-flight flag for Save Draft / Send Now
  nextLabel,       // "Next" or "Review"
  onBack,
  onNext,
  onSaveDraft,
  onSend,
}) {
  return (
    <div style={{
      flexShrink: 0,
      background: Z.bg,
      borderTop: `1px solid ${Z.bd}`,
      paddingBottom: "env(safe-area-inset-bottom)",
    }}>
      <div style={{
        height: 64,
        display: "grid",
        gridTemplateColumns: "2fr 3fr",   // 40% / 60% feel
        gap: 8,
        padding: "10px 12px",
      }}>
        {isReview ? (
          <>
            <button
              onClick={onSaveDraft}
              disabled={isSending}
              style={btnSecondary(isSending)}
            >
              {isSending ? "Saving…" : "Save Draft"}
            </button>
            <button
              onClick={onSend}
              disabled={!canSend || isSending}
              style={btnPrimary(!canSend || isSending)}
            >
              <Ic.send size={14} color="#FFFFFF" />
              <span>{isSending ? "Sending…" : "Send Now"}</span>
              <span aria-hidden style={{ fontSize: 16, lineHeight: 1, marginLeft: 2 }}>›</span>
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onBack}
              disabled={isFirst}
              style={btnSecondary(isFirst)}
            >
              Back
            </button>
            <button
              onClick={onNext}
              disabled={!canGoNext}
              style={btnPrimary(!canGoNext)}
            >
              <span>{nextLabel || "Next"}</span>
              <span aria-hidden style={{ fontSize: 16, lineHeight: 1, marginLeft: 2 }}>›</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function btnPrimary(disabled) {
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    minHeight: 44,
    background: disabled ? Z.bd : "var(--action)",
    color: disabled ? Z.tm : "#FFFFFF",
    border: "none",
    borderRadius: 10,
    padding: "0 16px",
    fontSize: FS.base,
    fontWeight: FW.heavy,
    fontFamily: COND,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.7 : 1,
    transition: "background 120ms ease, opacity 120ms ease",
  };
}

function btnSecondary(disabled) {
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minHeight: 44,
    background: "transparent",
    color: disabled ? Z.td : Z.tx,
    border: `1px solid ${Z.bd}`,
    borderRadius: 10,
    padding: "0 16px",
    fontSize: FS.base,
    fontWeight: FW.bold,
    fontFamily: COND,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}
