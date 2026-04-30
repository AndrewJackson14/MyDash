// RoleActivityStrip — pairs TargetProgressCard + ActivityFeedCard for
// any role. Mounted by App.jsx beneath the RoleDashboard so every
// role gets a uniform "today's targets + today's activity" footer
// without touching the 2870-line RoleDashboard.jsx.
//
// Maps MyDash team_role labels (Salesperson, Ad Designer, …) to the
// spec slugs used in activity_targets.role (sales-rep, ad-designer, …).

import { Z, FW, COND, FS } from "../../lib/theme";
import TargetProgressCard from "./TargetProgressCard";
import ActivityFeedCard from "./ActivityFeedCard";

// Same mapping as the log_activity RPC's CASE — keep in sync.
const TEAM_ROLE_TO_SPEC_SLUG = {
  "Publisher":            "publisher",
  "Editor-in-Chief":      "editor-in-chief",
  "Salesperson":          "sales-rep",
  "Sales Manager":        "sales-rep",
  "Ad Designer":          "ad-designer",
  "Layout Designer":      "layout-designer",
  "Production Manager":   "layout-designer",
  "Content Editor":       "content-editor",
  "Managing Editor":      "content-editor",
  "Office Administrator": "office-admin",
  "Office Manager":       "office-admin",
  "Finance":              "office-admin",
};

// Roles that have spec'd activity_targets — others get a feed only.
const ROLES_WITH_TARGETS = new Set([
  "sales-rep", "ad-designer", "layout-designer",
  "content-editor", "office-admin",
]);

// Roles that should NOT see the strip:
//   - Publisher: own dedicated dashboard, doesn't need its own activity feed
//     (the publisher stream covers it).
//   - Support Admin (Nic): private journal, separate page.
const ROLES_WITHOUT_STRIP = new Set([
  "publisher",
  // Support Admin slug — Nic's journal lives elsewhere.
  // No team_role enum entry; identified by name in usage; explicit
  // skip via ROLES_WITHOUT_STRIP keeps the check declarative.
]);

export default function RoleActivityStrip({ currentUser }) {
  if (!currentUser) return null;
  const teamRole = currentUser.role || "";
  const slug = TEAM_ROLE_TO_SPEC_SLUG[teamRole] || null;
  if (!slug) return null;
  if (ROLES_WITHOUT_STRIP.has(slug)) return null;

  const showTargets = ROLES_WITH_TARGETS.has(slug);

  return (
    <div style={{ padding: "0 28px 28px", maxWidth: "100%" }}>
      <div style={{
        fontSize: 11, fontWeight: FW.heavy, color: Z.td,
        textTransform: "uppercase", letterSpacing: 1, fontFamily: COND,
        marginBottom: 10, paddingLeft: 4,
      }}>
        Your Day · {teamRole}
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: showTargets ? "minmax(0, 1fr) minmax(0, 1.4fr)" : "minmax(0, 1fr)",
        gap: 14,
      }}>
        {showTargets && (
          <TargetProgressCard role={slug} actorId={currentUser.id} title="Today's Targets" />
        )}
        <ActivityFeedCard
          actorId={currentUser.id}
          title="Today's Activity"
          emptyText={
            slug === "sales-rep"   ? "No calls, emails, or proposals logged yet today."
            : slug === "ad-designer" ? "No proofs sent or signed off yet today."
            : slug === "layout-designer" ? "No pages built yet today."
            : slug === "content-editor" ? "No stories edited or published yet today."
            : "Nothing logged yet today."
          }
        />
      </div>
    </div>
  );
}
