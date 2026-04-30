// KBSidebar — role list + shared docs list + search input.
// Current user's role is highlighted and pinned to top.

import { Z, COND, FS, FW, R, Ri } from "../../lib/theme";

export default function KBSidebar({
  roles,
  shared,
  selectedSlug,
  onSelect,
  search,
  onSearchChange,
  searchHits,
  currentUserRoleSlug,
}) {
  const reordered = currentUserRoleSlug
    ? [
        ...roles.filter(r => r.slug === currentUserRoleSlug),
        ...roles.filter(r => r.slug !== currentUserRoleSlug),
      ]
    : roles;

  return (
    <aside style={{
      width: 240, flexShrink: 0,
      background: Z.sa, border: `1px solid ${Z.bd}`, borderRadius: R, padding: 12,
      position: "sticky", top: 16,
      maxHeight: "calc(100vh - 80px)", overflowY: "auto",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <input
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="Search…"
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "8px 10px",
          background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri,
          fontSize: FS.sm, color: Z.tx, fontFamily: "inherit", outline: "none",
        }}
      />

      {search.length >= 2 && (
        <div>
          <SectionLabel>Search results</SectionLabel>
          {searchHits.length === 0 ? (
            <Empty>No matches.</Empty>
          ) : (
            searchHits.slice(0, 20).map((hit, i) => (
              <button
                key={i}
                onClick={() => onSelect(hit.doc.slug)}
                style={navButton(selectedSlug === hit.doc.slug)}
              >
                <div style={{ fontWeight: FW.bold, marginBottom: 2 }}>
                  {hit.doc.metadata?.display_name || hit.doc.metadata?.title || hit.doc.slug}
                </div>
                <div style={{ fontSize: 10, color: Z.tm, lineHeight: 1.3, fontStyle: "italic" }}>
                  {hit.snippet}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      <div>
        <SectionLabel>Roles</SectionLabel>
        {reordered.map(r => (
          <button
            key={r.slug}
            onClick={() => onSelect(r.slug)}
            style={navButton(selectedSlug === r.slug)}
          >
            {r.metadata?.display_name || r.slug}
            {r.slug === currentUserRoleSlug && (
              <span style={{ marginLeft: 6, fontSize: 9, color: Z.ac, fontFamily: COND, fontWeight: FW.heavy, textTransform: "uppercase", letterSpacing: 0.5 }}>· you</span>
            )}
          </button>
        ))}
      </div>

      <div>
        <SectionLabel>Shared</SectionLabel>
        {shared.map(s => (
          <button
            key={s.slug}
            onClick={() => onSelect(s.slug)}
            style={navButton(selectedSlug === s.slug)}
          >
            {s.metadata?.title || s.slug}
          </button>
        ))}
      </div>
    </aside>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td,
      textTransform: "uppercase", letterSpacing: 1, fontFamily: COND,
      padding: "4px 8px", marginBottom: 4,
    }}>{children}</div>
  );
}

function Empty({ children }) {
  return <div style={{ padding: "4px 8px", fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{children}</div>;
}

function navButton(active) {
  return {
    display: "block", width: "100%", textAlign: "left",
    padding: "6px 8px", marginBottom: 2,
    background: active ? Z.ac + "18" : "transparent",
    border: "none", borderRadius: 4,
    color: active ? Z.ac : Z.tx,
    fontSize: 13, fontWeight: active ? 700 : 500,
    fontFamily: "inherit", cursor: "pointer",
    lineHeight: 1.3,
  };
}
