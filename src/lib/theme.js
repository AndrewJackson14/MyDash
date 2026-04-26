// ============================================================
// Theme — MyDash Design System (Editorial Monochrome)
// 
// Philosophy: Black, white, and greys do the work. Color is
// reserved for true alerts (overdue, danger, deadlines).
// Typography (size, weight, family) creates hierarchy, not color.
// ============================================================

// ============================================================
// LIGHT / DARK — legacy palette shape, Press Room values.
//
// Z proxy: every page module reads `Z.bg`, `Z.tx`, etc. inline.
// Rather than migrate every consumer, we redefine LIGHT and DARK
// to emit Press Room-equivalent values under the legacy keys.
// The Object.assign(Z, isDark ? LIGHT : DARK) toggle still works
// and the entire app flips to Press visuals.
//
// Border tokens (bd, borderSubtle, borderStrong) stay as solid
// hex values pre-merged from --rule onto --paper, so the existing
// alpha-suffix concatenation pattern (`Z.bd + "22"`) keeps
// producing valid 8-char hex.
// ============================================================
export const DARK = {
  bg:  "#14120E",                          // PRESS_DARK.paper
  sf:  "#1F1C16",                          // PRESS_DARK.card
  sa:  "#1F1C16",                          // collapsed onto card under Press Room
  bd:  "#32302B",                          // rule pre-merged on paper
  tx:  "#EDE8DC",                          // PRESS_DARK.ink
  tx2: "#EDE8DC",
  tm:  "#8C8578",                          // PRESS_DARK.muted
  td:  "#8C8578",
  go:  "#7BA77B",                          // PRESS_DARK.ok
  da:  "#E8473A",                          // PRESS_DARK.accent (Press red)
  ds:  "rgba(232,71,58,0.12)",
  wa:  "#D4A93C",                          // PRESS_DARK.warn
  ws:  "rgba(212,169,60,0.12)",
  ac:  "#EDE8DC",
  as:  "rgba(237,232,220,0.08)",
  su:  "#EDE8DC",
  ss:  "rgba(237,232,220,0.06)",
  pu:  "#8C8578",
  ps:  "rgba(140,133,120,0.08)",
  or:  "#D4A93C",
  bgCanvas:     "#142433",                // steel-900 — Steel Office canvas (dark, v2)
  bgChrome:     "#142433",                // chrome backgrounds resolve to glass at component layer
  bgHover:      "rgba(31,52,72,0.55)",    // hover-wash steel-800 @ 55% (dark, v2)
  bgActive:     "rgba(20,36,51,0.65)",    // active-wash steel-900 @ 65% (dark, v2)
  fgPrimary:    "#EDE8DC",
  fgSecondary:  "#EDE8DC",
  fgMuted:      "#8C8578",
  fgAccent:     "#E8473A",
  borderSubtle: "#32302B",
  borderStrong: "#3D3B36",
  glassBg:      "#1F1C16",                  // collapsed to card; no glass under Press
  glassBorder:  "#32302B",
  glassShadow:  "none",                     // Press Room rejects shadows
};

export const LIGHT = {
  bg:  "#F5F1E8",                          // PRESS_LIGHT.paper
  sf:  "#FFFFFF",                          // PRESS_LIGHT.card
  sa:  "#FFFFFF",
  bd:  "#DBD7CF",                          // rule pre-merged on paper
  tx:  "#1A1814",                          // PRESS_LIGHT.ink
  tx2: "#1A1814",
  tm:  "#6B655A",                          // PRESS_LIGHT.muted
  td:  "#6B655A",
  go:  "#3B6B3B",                          // PRESS_LIGHT.ok
  da:  "#C8301E",                          // PRESS_LIGHT.accent (Press red)
  ds:  "rgba(200,48,30,0.08)",
  wa:  "#B8860B",                          // PRESS_LIGHT.warn
  ws:  "rgba(184,134,11,0.08)",
  ac:  "#1A1814",
  as:  "rgba(26,24,20,0.06)",
  su:  "#1A1814",
  ss:  "rgba(26,24,20,0.04)",
  pu:  "#6B655A",
  ps:  "rgba(107,101,90,0.06)",
  or:  "#B8860B",
  bgCanvas:     "#f0f4f9",                // steel-50 — Steel Office canvas (light, v2)
  bgChrome:     "#f0f4f9",                // chrome backgrounds resolve to glass at component layer
  bgHover:      "rgba(219,228,239,0.45)", // hover-wash steel-100 @ 45% (light, v2)
  bgActive:     "rgba(184,201,222,0.55)", // active-wash steel-200 @ 55% (light, v2)
  fgPrimary:    "#1A1814",
  fgSecondary:  "#1A1814",
  fgMuted:      "#6B655A",
  fgAccent:     "#C8301E",
  borderSubtle: "#DBD7CF",
  borderStrong: "#C7C2B6",
  glassBg:      "#FFFFFF",
  glassBorder:  "#DBD7CF",
  glassShadow:  "none",
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
// CANVAS — Steel Office page-canvas constants (v2 2026-04-26).
//
// JS consumers reach for var(--canvas) whenever possible. CANVAS
// is here for cases that need the literal hex (e.g. inline style
// background that React serializes through). The values mirror
// the --canvas CSS custom property in src/styles/global.css.
// ============================================================
export const CANVAS = {
  light: "#f0f4f9",   // steel-50
  dark:  "#142433",   // steel-900
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
  accent:      "#C8301E",                  // Press red — alerts/danger only
  accentSoft:  "rgba(200, 48, 30, 0.08)",
  action:      "#2C465E",                  // STEEL.700 navy — primary actions
  actionSoft:  "rgba(44, 70, 94, 0.10)",
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
  action:      "#486B95",                  // STEEL.500 navy lifted for dark
  actionSoft:  "rgba(72, 107, 149, 0.18)",
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

// ============================================================
// Press Room radius scale (approved 2026-04-26).
// docs/ui-refresh/02-radius-proposal.md.
// Five values: 0 / 2 / 4 / 6 / pill. Most surfaces sit at 0–2px.
// ============================================================
export const RAD = {
  0:    0,        // page chrome, table containers, full-bleed sections
  1:    2,        // panels, modals, dropdowns
  2:    4,        // buttons, inputs, badges, segmented controls
  3:    6,        // drop-zone outlines, image previews
  card: 13,       // cards — pronounced rounding (Andrew override 2026-04-26)
  pill: 9999,     // avatars, status dots, segmented pill containers
};

// Legacy radius tokens — aliased onto the Press Room scale per the
// approved proposal. Existing callers (R / Ri / RADII / CARD.radius /
// TBL.radius / TOGGLE.radius) keep working but render at the new
// values. Phase 4–5 component refresh swaps these references for
// direct RAD.* lookups, then deletes the deprecated names.
export const R  = RAD[1];   // was 18 — card-level rounding
export const Ri = RAD[2];   // was 10 — internal elements (buttons, inputs)

export const RADII = {
  xs: RAD[3],   // was 6   → 6 (preserved at top of scale)
  sm: RAD[2],   // was 8   → 4
  md: RAD[1],   // was 12  → 2
  lg: RAD[1],   // was 16  → 2
  xl: RAD[1],   // was 20  → 2 (modal panels)
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
  radius: RAD.card,        // 13px — pronounced (Andrew override 2026-04-26)
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
  radius: RAD[0],          // was 5 → 0 — Press Room tables are hard rectangles
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
  blue: "var(--accent)",
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
  radius: RAD.pill,   // outer is a pill — visually identical to the prior 10px (=h/2)
  circleRadius: 8,    // inner circle border-radius (kept — half of circle diameter)
};

// Avatar dimensions — shared by all avatar/initials implementations
export const AVATAR = {
  sm: 28,             // small (list items, inline)
  md: 40,             // medium (cards, table rows)
  lg: 56,             // large (profile headers)
  fontSize: { sm: 11, md: 15, lg: 22 },
};
