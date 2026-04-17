// ============================================================
// Theme — MyDash Design System (Editorial Monochrome)
// 
// Philosophy: Black, white, and greys do the work. Color is
// reserved for true alerts (overdue, danger, deadlines).
// Typography (size, weight, family) creates hierarchy, not color.
// ============================================================

export const DARK = {
  bg:  "#08090D",
  sf:  "#0E1018",
  sa:  "#161A24",
  bd:  "#1C2130",
  tx:  "#E8ECF2",
  tx2: "#C8CED8",
  tm:  "#8A95A8",
  td:  "#525E72",
  go:  "#00a300",
  da:  "#E05050",
  ds:  "rgba(224,80,80,0.12)",
  wa:  "#D4890E",
  ws:  "rgba(212,137,14,0.12)",
  ac:  "#E8ECF2",
  as:  "rgba(232,236,242,0.08)",
  su:  "#E8ECF2",
  ss:  "rgba(232,236,242,0.06)",
  pu:  "#8A95A8",
  ps:  "rgba(138,149,168,0.08)",
  or:  "#D4890E",
  // Shell v2 semantic surface tokens — keep DARK and LIGHT in lockstep
  // so Object.assign(Z, ...) on theme toggle propagates every key.
  bgCanvas:     "#0a0c10",
  bgChrome:     "#0f1317",
  bgHover:      "#171c22",
  bgActive:     "#1a2533",
  fgPrimary:    "#e8ebef",
  fgSecondary:  "#9aa3af",
  fgMuted:      "#6b7280",
  fgAccent:     "#7fa3c8",
  borderSubtle: "#1c2128",
  borderStrong: "#262d36",
  glassBg:      "rgba(18,22,27,0.72)",
  glassBorder:  "rgba(255,255,255,0.06)",
  glassShadow:  "0 20px 60px -20px rgba(0,0,0,0.6), 0 8px 24px -8px rgba(0,0,0,0.4)",
};

export const LIGHT = {
  bg:  "#F4F5F7",
  sf:  "#FFFFFF",
  sa:  "#EBEDF0",
  bd:  "#D8DBE2",
  tx:  "#111318",
  tx2: "#2D3142",
  tm:  "#6B7280",
  td:  "#9CA3AF",
  go:  "#00a300",
  da:  "#C53030",
  ds:  "rgba(197,48,48,0.08)",
  wa:  "#D4890E",
  ws:  "rgba(212,137,14,0.08)",
  ac:  "#111318",
  as:  "rgba(17,19,24,0.06)",
  su:  "#111318",
  ss:  "rgba(17,19,24,0.04)",
  pu:  "#6B7280",
  ps:  "rgba(107,114,128,0.06)",
  or:  "#D4890E",
  // Shell v2 semantic surface tokens — keep DARK and LIGHT in lockstep
  // so Object.assign(Z, ...) on theme toggle propagates every key.
  bgCanvas:     "#f6f7f8",
  bgChrome:     "#ffffff",
  bgHover:      "#eceef1",
  bgActive:     "#f0f4f9",
  fgPrimary:    "#111418",
  fgSecondary:  "#4b5563",
  fgMuted:      "#6b7280",
  fgAccent:     "#385879",
  borderSubtle: "#dfe2e7",
  borderStrong: "#c7ccd3",
  glassBg:      "rgba(255,255,255,0.72)",
  glassBorder:  "rgba(255,255,255,0.5)",
  glassShadow:  "0 20px 60px -20px rgba(15,29,44,0.25), 0 8px 24px -8px rgba(15,29,44,0.12)",
};

// ============================================================
// Shell v2 palettes — theme-independent constants.
// ============================================================
export const STEEL = {
  50:  "#f0f4f9",
  100: "#dbe4ef",
  200: "#b8c9de",
  300: "#8ea8c6",
  400: "#6787ae",
  500: "#486b95",
  600: "#385879",
  700: "#2c465e",
  800: "#1f3448",
  900: "#14243380",
  navy: "#0f1d2c",
};

export const NEUTRAL = {
  0:   "#ffffff",
  25:  "#fbfbfc",
  50:  "#f6f7f8",
  100: "#eceef1",
  200: "#dfe2e7",
  300: "#c7ccd3",
  400: "#9ca3af",
  500: "#6b7280",
  600: "#4b5563",
  700: "#374151",
  800: "#1f2937",
  900: "#111418",
  950: "#0a0c10",
};

export const SIGNAL = {
  success:      "#2f9e6b",
  successHover: "#248656",
  warning:      "#d99a28",
  warningHover: "#b87f1a",
  danger:       "#d64545",
  dangerHover:  "#b63232",
};

const getInitTheme = () => {
  try { const s = localStorage.getItem("mydash-theme"); if (s) return s; } catch(e) {}
  return window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
};

export let Z = getInitTheme() === "light" ? { ...LIGHT } : { ...DARK };

// Convenience: check active theme mode without hard-coding hex values
export const isDark = () => Z.bg === DARK.bg;

export const getStatusColors = () => ({
  Discovery:    { bg: Z.sa, text: Z.tm },
  Presentation: { bg: Z.sa, text: Z.tx },
  Proposal:     { bg: Z.sa, text: Z.tx },
  Negotiation:  { bg: Z.sa, text: Z.tx },
  Closed:       { bg: Z.sa, text: Z.tx },
  "Follow-up":  { bg: Z.sa, text: Z.tm },
  Draft:        { bg: Z.sa, text: Z.tm },
  Sent:         { bg: Z.sa, text: Z.tx },
  "Under Review": { bg: Z.sa, text: Z.tx },
  "Signed & Converted": { bg: Z.ss, text: Z.su },
  Declined:     { bg: Z.ds, text: Z.da },
  Expired:      { bg: Z.ds, text: Z.da },
  Assigned:     { bg: Z.sa, text: Z.tm },
  "Needs Editing": { bg: Z.ws, text: Z.wa },
  Edited:       { bg: Z.sa, text: Z.tx },
  Approved:     { bg: Z.sa, text: Z.tx },
  "On Page":    { bg: Z.sa, text: Z.tx },
  "Sent to Web": { bg: Z.sa, text: Z.tx },
  Scheduled:    { bg: Z.sa, text: Z.tm },
  "In Progress": { bg: Z.sa, text: Z.tx },
  Editing:      { bg: Z.sa, text: Z.tx },
  Proofing:     { bg: Z.sa, text: Z.tx },
  "Packaged for Publishing": { bg: Z.sa, text: Z.tx },
  Lead:         { bg: Z.sa, text: Z.tm },
  Active:       { bg: Z.sa, text: Z.tx },
  Renewal:      { bg: Z.ws, text: Z.wa },
  Lapsed:       { bg: Z.sa, text: Z.td },
  Inactive:     { bg: Z.sa, text: Z.td },
});

export const SC = new Proxy({}, { get: (_, key) => getStatusColors()[key] });

export const COND = "'IBM Plex Sans Condensed','DM Sans',sans-serif";
export const DISPLAY = "'Playfair Display',Georgia,serif";
export const BODY = "'Source Sans 3','DM Sans','Segoe UI',system-ui,sans-serif";

export const FONT_URL = "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;500;600;700&family=DM+Sans:wght@400;500;600;700;800&family=IBM+Plex+Sans+Condensed:wght@400;500;600;700&family=Playfair+Display:wght@700;800;900&display=swap";

// Typography scale — font sizes
export const FS = {
  micro: 10,    // uppercase annotations, tiny labels
  xs: 11,       // table headers, timestamps, section labels
  sm: 12,       // meta text, badges, subtitle lines
  base: 13,     // default body text, descriptions
  md: 14,       // list item titles, table body, primary content
  lg: 16,       // section headings inside cards
  xl: 20,       // stat values, sub-page titles
  title: 22,    // page titles (PageHeader)
  xxl: 26,      // dashboard greeting, page-level display
};

// Typography scale — font weights
export const FW = {
  normal: 400,  // quiet text, placeholders
  medium: 500,  // inactive tabs, light emphasis
  semi: 600,    // list item titles, active body
  bold: 700,    // buttons, active tabs, strong labels
  heavy: 800,   // table headers, section titles, uppercase labels
  black: 900,   // page titles, stat values, display type
};

// Layout tokens
export const R = 18;      // border-radius (px) — card-level rounding
export const Ri = 10;     // border-radius (px) — internal elements (buttons, badges, inputs)

// Shell v2 radius scale — named tokens, matches the wireframe.
// R stays a scalar (18) for existing callers; RADII is the new scale.
export const RADII = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
};

// Shell v2 motion primitives.
export const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
export const DUR = { fast: 140, med: 220, slow: 320 };

// Shell v2 font stacks — SF Pro system stack for the Apple-glass aesthetic.
// Existing COND / DISPLAY / BODY remain untouched for legacy callers.
export const FONT = {
  sans:    "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif",
  display: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', system-ui, sans-serif",
  mono:    "ui-monospace, 'SF Mono', Menlo, monospace",
};
export const SP = {        // spacing scale
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  cardPad: 20,             // internal card padding
  sectionGap: 28,          // gap between major sections
  pageGap: 32,             // gap between top-level page blocks
};

// Card/List tokens — universal card and list item rules
export const CARD = {
  pad: 14,                 // internal padding
  gap: 8,                  // gap between floating cards
  radius: 5,               // border-radius (matches R)
  hoverAlpha: 0.08,        // hover background alpha
  dividerAlpha: 0.06,      // internal divider alpha (matches My Day)
  titleSize: 14,           // list item title font size
  titleWeight: 600,        // list item title weight
  metaSize: 12,            // subtitle/meta font size
};
export const TBL = {
  headerSize: 11,          // th font size
  headerWeight: 800,       // th font weight
  bodySize: 14,            // td font size
  cellPad: "10px 14px",    // td/th padding
  hoverAlpha: 0.08,        // row hover background alpha
  activeAlpha: 0.08,       // selected/active row background alpha
  borderAlpha: 0.06,       // row divider opacity (matches My Day dividers)
  radius: 5,               // container border-radius (matches R)
};

// Input tokens — shared styling for text inputs, selects, textareas
export const INPUT = {
  pad: "9px 14px",         // standard input padding
  padSm: "6px 8px",        // compact input padding (Site Settings, inline)
  fontSize: 13,            // matches FS.base
  radius: Ri,              // internal-level rounding
};

// Button tokens — shared button sizing
export const BTN = {
  pad: "9px 22px",         // default button padding
  padSm: "7px 16px",       // small button padding
  fontSize: 13,
  fontWeight: 700,
  radius: Ri,
};

// Modal tokens — overlay + dialog sizing
export const MODAL = {
  backdropBg: "rgba(0,0,0,0.7)",
  backdropBlur: "blur(4px)",
  defaultWidth: 540,
  pad: "16px 24px",        // modal content padding
  radius: R,
};

// Label tokens — uppercase section/field labels used everywhere
export const LABEL = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
};

// Feature accent colors — semantic colors beyond the base palette
export const ACCENT = {
  amber: "#D4890E",
  indigo: "#6366f1",
  green: "#16a34a",
  blue: "#3b82f6",
  grey: "#6B7280",
};

// Z-index scale — every z-index in the app should use this
export const ZI = {
  base: 0,
  raised: 1,         // sticky table headers, inline overlays
  sticky: 10,        // sticky nav, floating action bars
  dropdown: 20,      // dropdowns, popovers, tooltips
  modal: 100,        // modal backdrop
  modalContent: 101, // modal dialog
  overlay: 998,      // full-screen overlays (lightbox, side panels)
  top: 999,          // notification toasts, profile panel
  max: 1000,         // modal on top of modal (confirmation over modal)
};

// Contrast text — guaranteed readable on colored backgrounds
export const INV = {
  light: "#FFFFFF",   // white text on dark/colored backgrounds
  dark: "#111318",    // dark text on light backgrounds
};

// Toggle dimensions — shared by all toggle switch implementations
export const TOGGLE = {
  w: 36,              // outer width
  h: 20,              // outer height
  circle: 16,         // inner circle diameter
  pad: 2,             // gap between circle and edge
  radius: 10,         // outer border-radius (half of h)
  circleRadius: 8,    // inner circle border-radius
};

// Avatar dimensions — shared by all avatar/initials implementations
export const AVATAR = {
  sm: 28,             // small (list items, inline)
  md: 40,             // medium (cards, table rows)
  lg: 56,             // large (profile headers)
  fontSize: { sm: 11, md: 15, lg: 22 },
};
