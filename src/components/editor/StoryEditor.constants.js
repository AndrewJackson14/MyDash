// Single-source status model: Draft → Edit → Ready → Approved.
// Destination flags (sent_to_web / sent_to_print) track where it shipped.
// Old stories live in the Editorial > Archive view (a date-based filter),
// not in an "Archived" status.
export const WORKFLOW_STAGES = ["Draft", "Edit", "Ready", "Approved"];
export const STAGE_TO_STATUS = { Draft: "Draft", Edit: "Edit", Ready: "Ready", Approved: "Approved" };
export const STATUS_TO_STAGE = { Draft: "Draft", Edit: "Edit", Ready: "Ready", Approved: "Approved" };

export const STORY_TYPES = [
  { key: "article",        label: "Article" },
  { key: "column",         label: "Column" },
  { key: "letter",         label: "Letter to Editor" },
  { key: "obituary",       label: "Obituary" },
  { key: "legal_notice",   label: "Legal Notice" },
  { key: "calendar_event", label: "Calendar Event" },
  { key: "press_release",  label: "Press Release" },
  { key: "opinion",        label: "Opinion" },
];

// Editorial-eligible roles per the team_role enum (mig 178/189). Used
// by the byline picker to filter active staff to people who can be
// credited as authors.
export const EDITORIAL_ROLES = ["Publisher", "Support Admin", "Content Editor", "Stringer"];
