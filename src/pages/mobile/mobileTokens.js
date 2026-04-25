// Mobile design tokens — mirrors Spec 056 §2.4 color scale + type ramp.
// Inline-styles only (no Tailwind on mobile so we control bundle).
//
// Why a separate file from src/lib/theme: desktop theme has dark-mode
// support and many semantic tokens (Z.bg, Z.tx, Z.bd…). Mobile spec
// is light-mode only with a deliberately restrained palette — small
// screens punish visual noise. Cleaner to keep the namespaces apart.

export const INK = "#1A1A1A";
export const ACCENT = "#0C447C";  // 13 Stars navy — primary actions
export const GOLD = "#B8923D";    // signed/won states

export const TOKENS = {
  ink: INK,
  body: "#2C2C2A",
  muted: "#5F5E5A",
  accent: ACCENT,
  gold: GOLD,
  urgent: "#791F1F",
  warn: "#854F0B",
  good: "#27500A",
  rule: "#E6E5DE",
};

export const SURFACE = {
  primary: "#FFFFFF",
  alt: "#F5F5F3",
  soft: "#F1EFE8",
  elevated: "#FFFFFF",
};

export const TYPE = {
  display: { fontSize: 28, lineHeight: "32px", fontWeight: 700, letterSpacing: -0.5 },
  heading: { fontSize: 20, lineHeight: "24px", fontWeight: 600 },
  body:    { fontSize: 16, lineHeight: "22px", fontWeight: 400 },
  small:   { fontSize: 14, lineHeight: "20px", fontWeight: 400, color: TOKENS.muted },
  caption: { fontSize: 12, lineHeight: "16px", fontWeight: 400, color: TOKENS.muted },
  button:  { fontSize: 16, lineHeight: "20px", fontWeight: 600 },
};

// Common card style — used across tabs for content blocks.
export const CARD = {
  background: SURFACE.elevated,
  borderRadius: 12,
  border: `1px solid ${TOKENS.rule}`,
  padding: 14,
};

// Tap targets minimum 44pt per Apple HIG.
export const TAP_MIN = 44;

// Format a Date or ISO string as a relative ("2h ago") string for
// timeline items. Mobile loves these — saves horizontal space.
export function fmtRelative(when) {
  if (!when) return "";
  const t = typeof when === "string" ? new Date(when).getTime() : when.getTime();
  const diffMs = Date.now() - t;
  if (diffMs < 60_000) return "just now";
  const m = Math.round(diffMs / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(diffMs / 3_600_000);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(diffMs / 86_400_000);
  if (d < 7) return `${d}d ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtMoney(n) {
  if (n == null) return "—";
  if (Math.abs(n) >= 1000) return "$" + Math.round(n / 100) / 10 + "K";
  return "$" + Math.round(n).toLocaleString();
}

export function fmtMoneyFull(n) {
  if (n == null) return "—";
  return "$" + Math.round(n).toLocaleString();
}

export const todayISO = () => new Date().toISOString().slice(0, 10);
