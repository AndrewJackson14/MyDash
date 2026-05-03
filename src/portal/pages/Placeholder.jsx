// Bare-bones placeholder used by every Phase B route stub. Phase C/D
// pages replace these with real implementations.
export default function Placeholder({ title, body }) {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 24,
      fontFamily: "inherit", color: "#0d0f14",
    }}>
      <div style={{
        maxWidth: 480, width: "100%", textAlign: "center",
        padding: "40px 32px", background: "#fff",
        borderRadius: 12, border: "1px solid #e2e6ed",
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#8994a7", letterSpacing: 1, marginBottom: 12 }}>
          13 STARS MEDIA · CUSTOMER PORTAL
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 14, color: "#525e72", lineHeight: 1.6 }}>{body}</div>
      </div>
    </div>
  );
}
