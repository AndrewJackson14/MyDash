import { STATUS_TO_STAGE } from "./StoryEditor.constants";

// Publication name lookup with id fallback for orphaned references.
export const pn = (id, pubs) => pubs.find(p => p.id === id)?.name || id;

// Publication brand color lookup. Fallback is required (callers pass
// the theme accent) so this helper stays decoupled from the theme module.
export const pColor = (id, pubs, fallback) =>
  pubs.find(p => p.id === id)?.color || fallback;

// Team-member name lookup. Returns "Unassigned" for missing ids
// (stories without an assignee) and "Unknown" for stale ids whose
// row was deleted/archived — different copy because the two cases
// mean different things to the user.
export const tn = (id, team) => {
  const t = team.find(t => t.id === id);
  return t ? t.name || "Unknown" : "Unassigned";
};

// Compact relative time. Floors at minutes (anything fresher than 1m
// reads as "0m ago" — fine for the activity log; the editor never
// shows ago() on anything that fresh).
export const ago = (d) => {
  if (!d) return "";
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
};

export const getStage = (status) => STATUS_TO_STAGE[status] || "Draft";

export const fmtDate = (d) => d
  ? new Date(d).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    })
  : "";

// Title → URL-safe slug. NFD-normalizes so "Café" survives as "cafe"
// instead of being stripped to "caf"; collapses non-alphanumeric runs
// to a single hyphen; trims leading/trailing hyphens; caps at 120
// chars so Postgres / any index + display surface stays safe.
export const slugify = (title) => (title || "")
  .toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 120);
