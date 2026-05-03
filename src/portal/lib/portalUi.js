// Portal palette + small style primitives shared across portal pages.
// Steel/cool surface palette matches the Placeholder card from Phase B.
// Accent is 13 Stars Media blue (matches ProposalSign).
export const C = {
  bg:    "#f6f7f9",
  card:  "#ffffff",
  rule:  "#e2e6ed",
  ink:   "#0d0f14",
  muted: "#525e72",
  cap:   "#8994a7",
  ac:    "#2563EB",
  ok:    "#16A34A",
  warn:  "#D97706",
  err:   "#DC2626",
};

export const sx = {
  page: {
    minHeight: "100vh", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", padding: 24,
    fontFamily: "inherit", color: C.ink, background: C.bg,
  },
  card: {
    maxWidth: 480, width: "100%",
    padding: "40px 32px", background: C.card,
    borderRadius: 12, border: `1px solid ${C.rule}`,
  },
  brand: {
    fontSize: 11, fontWeight: 700, color: C.cap, letterSpacing: 1,
    marginBottom: 20, textAlign: "center",
  },
  h1: { fontSize: 22, fontWeight: 700, marginBottom: 6, textAlign: "center" },
  sub: { fontSize: 14, color: C.muted, lineHeight: 1.6, marginBottom: 24, textAlign: "center" },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6 },
  input: {
    width: "100%", padding: "10px 12px", fontSize: 14,
    color: C.ink, background: C.card,
    border: `1px solid ${C.rule}`, borderRadius: 6,
    outline: "none", boxSizing: "border-box",
    fontFamily: "inherit",
  },
  btn: (disabled) => ({
    width: "100%", padding: "12px 16px", fontSize: 14, fontWeight: 700,
    color: "#fff", background: disabled ? "#9CA3AF" : C.ac,
    border: "none", borderRadius: 6,
    cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit",
    transition: "background 0.15s",
  }),
  btnGhost: {
    width: "100%", padding: "10px 16px", fontSize: 13, fontWeight: 600,
    color: C.muted, background: "transparent",
    border: `1px solid ${C.rule}`, borderRadius: 6,
    cursor: "pointer", fontFamily: "inherit",
  },
  link: {
    color: C.ac, fontSize: 13, fontWeight: 600,
    textDecoration: "none", cursor: "pointer", fontFamily: "inherit",
    background: "none", border: "none", padding: 0,
  },
  err: {
    fontSize: 13, color: C.err, background: "#FEF2F2",
    border: "1px solid #FECACA", borderRadius: 6,
    padding: "10px 12px", marginBottom: 16,
  },
  footer: {
    marginTop: 24, fontSize: 12, color: C.cap, textAlign: "center",
  },
};

export function isValidEmail(s) {
  return typeof s === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());
}
