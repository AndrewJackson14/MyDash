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
  // tx softened ~13% from #E8ECF2 — pure-white-on-near-black was too aggressive
  // for long reading. Keeps active-state text (TB/SliderStrip use literal #fff)
  // and brand accents (ac) at full brightness so selection still pops.
  tx:  "#CACDD3",
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

// ============================================================
// Press Room — Phase 2 tokens (UI refresh)
//
// These mirror the --ink / --paper / --rule / etc. CSS custom
// properties defined in src/styles/global.css. JS callers use
// PRESS_LIGHT / PRESS_DARK directly; the active palette is
// exposed as PRESS, which flips with [data-theme="dark"].
//
// Components migrate to PRESS in Phases 4–5 of the refresh.
// Until then the legacy LIGHT/DARK + Z proxy above keeps
// driving the rest of the app — no runtime collision.
// ============================================================
export const PRESS_LIGHT = {
  ink:         "#1A1814",
  paper:       "#F5F1E8",
  card:        "#FFFFFF",
  rule:        "rgba(26, 24, 20, 0.12)",
  muted:       "#6B655A",
  accent:      "#C8301E",
  accentSoft:  "rgba(200, 48, 30, 0.08)",
  ok:          "#3B6B3B",
  warn:        "#B8860B",
};

export const PRESS_DARK = {
  ink:         "#EDE8DC",
  paper:       "#14120E",
  card:        "#1F1C16",
  rule:        "rgba(237, 232, 220, 0.14)",
  muted:       "#8C8578",
  accent:      "#E8473A",
  accentSoft:  "rgba(232, 71, 58, 0.12)",
  ok:          "#7BA77B",
  warn:        "#D4A93C",
};

// Active Press palette — flips with the data-theme attribute.
// Light is the default per 01-direction-decisions.md.
export let PRESS = { ...PRESS_LIGHT };

export const isPressDark = () =>
  typeof document !== "undefined" &&
  document.documentElement?.dataset?.theme === "dark";

// Type system — sizes, families, weights, line heights, tracking.
// Sizes match the table in 01-direction-decisions.md §Type Scale.
// Weights enforce the discipline rules in §Weight Discipline.
export const TYPE = {
  // Sizes (px)
  size: {
    displayXL: 56, // page titles, hero KPIs
    displayLg: 40, // section heroes
    displayMd: 32, // KPI numbers
    h3:        22, // card headers, section heads
    h4:        18, // subsection heads, table titles
    h5:        14, // table column headers, form labels
    body:      14, // default body
    bodySm:    13, // dense table rows
    caption:   12, // captions, helper text
    meta:      11, // metadata strip, timestamps, IDs
  },

  // Family stacks
  family: {
    display: "'Cormorant Garamond', Georgia, serif",
    body:    "'Geist', system-ui, sans-serif",
    mono:    "'Geist Mono', ui-monospace, monospace",
  },

  // Weights — keep these few. Cormorant 600 only by default;
  // Geist on 400/500/700; Geist Mono on 500. No others.
  weight: {
    display:     600,
    displayEmph: 700,
    body:        400,
    bodyMid:     500,
    bodyBold:    700,
    mono:        500,
  },

  // Line heights
  lh: {
    display: 1.0,
    heading: 1.25,
    body:    1.55,
    meta:    1.45,
  },

  // Letter spacing
  ls: {
    meta:    "0.08em",
    headers: "0.02em",
  },
};

// Elevation — Press Room rejects shadows. The single allowed
// elevation token is the input field inset, kept light enough
// not to read as a shadow.
export const ELEV = {
  none:  "none",
  input: "inset 0 1px 2px rgba(26, 24, 20, 0.04)",
};

// Spacing — preserved from SP at the bottom of this file. New
// callers should reach for SPACE.* (alias of SP) for clarity;
// SP stays exported for back-compat.
//
// (No new export here — SPACE is added below SP, near the bottom,
// once the existing SP block has been read.)

// Radius — DEFERRED. The --rad-* scale and matching JS RAD object
// land in a follow-up commit after Andrew approves
// docs/ui-refresh/02-radius-proposal.md.

const getInitTheme = () => {
  try { const s = localStorage.getItem("mydash-theme"); if (s) return s; } catch(e) {}
  return window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
};

export let Z = getInitTheme() === "light" ? { ...LIGHT } : { ...DARK };

// Initialize the Press Room palette + sync the data-theme attribute
// so CSS custom properties (--ink, --paper, --rule, etc.) match the
// JS palette from first paint. App.jsx mirrors this on toggle.
if (typeof document !== "undefined") {
  const t = getInitTheme();
  Object.assign(PRESS, t === "dark" ? PRESS_DARK : PRESS_LIGHT);
  if (document.documentElement) document.documentElement.dataset.theme = t;
}

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

// Press Room alias — same scale, named to match the --space-*
// CSS custom properties so refreshed components can grep for
// SPACE.cardPad or var(--space-card-pad) interchangeably.
export const SPACE = SP;

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
