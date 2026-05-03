import { Z, COND, DISPLAY, FS, FW, R } from "../../lib/theme";

// Empty-state hero for tabs/lists that render nothing. Three slots:
// - icon: emoji or <Ic.foo size={...} /> — the focal glyph (~28px)
// - title: short reassurance ("No deals in your pipeline yet")
// - body: 1-line context, optional
// - action: <Btn> or null — primary CTA the empty-state suggests
//
// Wave 3 Task 3.12 — extracted so Pipeline / Inquiries / Proposals /
// Closed / Renewals share one visual treatment for "nothing here yet"
// instead of each tab improvising a different blank.
export default function EmptyState({ icon, title, body, action }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "48px 20px",
        textAlign: "center",
        background: Z.sf,
        borderRadius: R,
        border: `1px solid ${Z.bd}`,
      }}
    >
      {icon != null && (
        <div style={{ fontSize: 32, lineHeight: 1, color: Z.td, marginBottom: 4 }}>
          {icon}
        </div>
      )}
      {title && (
        <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>
          {title}
        </div>
      )}
      {body && (
        <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND, maxWidth: 420 }}>
          {body}
        </div>
      )}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
