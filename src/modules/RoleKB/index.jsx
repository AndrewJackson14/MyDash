// RoleKB — in-app viewer for the role knowledge base.
//
// Reads markdown from docs/knowledge-base/ at build time via the
// useKBContent hook (Vite glob). Sidebar + main pane layout. Deep
// links: ?role=sales-rep#contract-conversion resolves to the role
// file, scrolls to the heading anchor.
//
// Distinct from src/pages/KnowledgeBase.jsx — that one serves the
// in-app `_docs/`-style help articles backed by the stories table
// (audience='internal'). This module is the markdown role-doc viewer
// the spec calls for.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { Z } from "../../lib/theme";
import KBSidebar from "./KBSidebar";
import KBViewer from "./KBViewer";
import { useKBContent } from "./useKBContent";

// Map team_role label to spec role slug. Same as the log_activity
// RPC's CASE — keep in sync.
const TEAM_ROLE_TO_SLUG = {
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

export default function RoleKB({ deepLink }) {
  const { teamMember } = useAuth();
  const myRoleSlug = teamMember?.role ? TEAM_ROLE_TO_SLUG[teamMember.role] : null;

  // deepLink = { role: 'sales-rep', anchor: 'contract-conversion' } from
  // App.jsx's nav router when a /kb?role=…#anchor URL hits.
  const [search, setSearch] = useState("");
  const { roles, shared, searchHits } = useKBContent({ search });

  // Selected slug: prefer deep-link, then current user's role, then first role.
  const [selectedSlug, setSelectedSlug] = useState(
    deepLink?.role || myRoleSlug || (roles[0]?.slug)
  );

  // Update selection when deepLink changes (user followed a KBLink).
  useEffect(() => {
    if (deepLink?.role) setSelectedSlug(deepLink.role);
  }, [deepLink?.role]);

  const allDocs = useMemo(() => [...roles, ...shared], [roles, shared]);
  const selectedDoc = allDocs.find(d => d.slug === selectedSlug) || null;

  // Internal markdown links inside the viewer. Markdown link patterns:
  //   `_shared/glossary.md#issue` → switch to glossary, scroll to issue
  //   `publisher.md#daily-workflow` → switch to publisher
  //   `(/sales)` or other absolute MyDash routes → ignore here (no router)
  const handleLinkClick = (href) => {
    // Strip leading `_shared/` if present
    const m = href.match(/^(_shared\/)?([a-z0-9-]+)\.md(?:#(.+))?$/);
    if (m) {
      const slug = m[2];
      const anchor = m[3] || null;
      if (allDocs.some(d => d.slug === slug)) {
        setSelectedSlug(slug);
        if (anchor) setTimeout(() => {
          const el = document.getElementById(anchor);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
        return;
      }
    }
    // Anchor-only links inside current doc
    if (href.startsWith("#")) {
      const id = href.slice(1);
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    // Otherwise let it through (default browser behavior)
    window.open(href, "_blank", "noreferrer");
  };

  return (
    <div style={{ padding: 28, display: "flex", gap: 20, alignItems: "start" }}>
      <KBSidebar
        roles={roles}
        shared={shared}
        selectedSlug={selectedSlug}
        onSelect={setSelectedSlug}
        search={search}
        onSearchChange={setSearch}
        searchHits={searchHits}
        currentUserRoleSlug={myRoleSlug}
      />
      <KBViewer
        doc={selectedDoc}
        hash={deepLink?.anchor}
        onLinkClick={handleLinkClick}
      />
    </div>
  );
}
