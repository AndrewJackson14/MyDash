// ============================================================
// Issue Planning constants
// ----------------------------------------------------------------
// Lifted from inline definitions in EditorialDashboard.jsx as part
// of IP Wave 2 decomposition. Imported by the Tab shell + sub-row
// components so PRINT_STAGES drives both the print-pipeline strip
// and the per-row print-status pill.
// ============================================================

export const PRINT_STAGES = [
  { key: "none",          label: "Not Assigned" },
  { key: "ready",         label: "Ready for Print" },
  { key: "on_page",       label: "On Page" },
  { key: "proofread",     label: "Proofread" },
  { key: "approved",      label: "Approved" },
  { key: "sent_to_press", label: "Sent to Press" },
];

// Default page count for issues that haven't been sized yet. Used by
// the page/jump dropdowns and the mini Page Map; was repeated as a
// magic 24 in three render sites.
export const DEFAULT_PAGE_COUNT = 24;

// Priority dropdown values. Kept as 1-6 (Critical → Fill) for display
// even though the schema permits higher numbers.
export const PRIORITY_OPTIONS = [1, 2, 3, 4, 5, 6].map(n => ({
  value: String(n),
  label: String(n),
}));
