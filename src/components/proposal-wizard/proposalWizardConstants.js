// ============================================================
// Proposal Wizard — Step definitions and shared constants
//
// Step 3 (Issues) is conditional: only shown when at least one pub
// has print format selected. The visible step bar contracts to 6
// steps when the proposal is digital-only.
// ============================================================

export const STEP_IDS = {
  CLIENT: 1,
  PUBLICATIONS: 2,
  ISSUES: 3,
  SIZES_AND_FLIGHTS: 4,
  PAYMENT_TERMS: 5,
  BRIEF_AND_ART_SOURCE: 6,
  REVIEW: 7,
};

// PUBLICATIONS step is folded into the CLIENT step on screen — once a
// client is picked, the publication pills appear inline. The pub-only
// step stays in STEP_IDS for back-compat with stored progress, but we
// hide it from the visible bar and the wizard skips over it on next/back.
export const STEPS = [
  { id: STEP_IDS.CLIENT,                label: "Client & Pubs", phase: "deal"   },
  { id: STEP_IDS.ISSUES,                label: "Issues",        phase: "deal", conditional: "anyPrint" },
  { id: STEP_IDS.SIZES_AND_FLIGHTS,     label: "Sizes",         phase: "deal"   },
  { id: STEP_IDS.PAYMENT_TERMS,         label: "Payment",       phase: "deal"   },
  { id: STEP_IDS.BRIEF_AND_ART_SOURCE,  label: "Brief",         phase: "intake" },
  { id: STEP_IDS.REVIEW,                label: "Review",        phase: "intake" },
];

export const PHASE_LABELS = { deal: "DEAL", intake: "INTAKE" };

// 5 → 6 is the deal-locked-let's-build-the-ad pivot. WizardStepBar
// renders a 2px vertical divider between these step IDs.
export const PHASE_PIVOT_AFTER_STEP = STEP_IDS.PAYMENT_TERMS;

// Reference asset uploader (Step 6) ─────────────────────────
export const REFERENCE_ASSET_MIME_ALLOWLIST = [
  "image/jpeg", "image/jpg", "image/png", "image/heic", "image/heif",
  "image/webp", "image/gif", "image/svg+xml",
  "application/pdf",
  "application/postscript",            // AI / EPS
  "image/vnd.adobe.photoshop",         // PSD
];

export const REFERENCE_ASSET_MAX_BYTES = 25 * 1024 * 1024;   // 25 MB

// Smart placeholder caption rules — first match wins. Patterns are
// case-insensitive substrings of the file's basename.
export const CAPTION_PATTERNS = [
  { pattern: /logo/i,                          caption: "Logo"      },
  { pattern: /interior|inside/i,               caption: "Interior"  },
  { pattern: /storefront|exterior|outside/i,   caption: "Storefront" },
  { pattern: /menu/i,                          caption: "Menu"      },
  { pattern: /merch|product/i,                 caption: "Product"   },
  { pattern: /staff|team|owner/i,              caption: "Staff"     },
];

// First-file-with-no-match fallback caption. After the first file,
// further unmatched files get an empty caption (rep can fill in).
export const FIRST_FILE_FALLBACK_CAPTION = "Storefront";

// Auto-save debounce — matches StoryEditor 2s convention.
export const AUTO_SAVE_DEBOUNCE_MS = 2000;
export const AUTO_SAVE_MAX_RETRIES = 3;

export const PAY_TIMINGS = ["per_issue", "monthly", "lump_sum"];
export const CHARGE_DAYS = [1, 15];
export const DELIVERY_CADENCES = ["weekly", "monthly", "end_of_flight", "annual"];
export const ART_SOURCES = ["we_design", "camera_ready"];
