// KBViewer — markdown renderer with frontmatter header + Edit-on-GitHub
// link. Anchor-aware: scrolls into view when the URL hash matches a
// heading slug.

import { useEffect, useRef } from "react";
import { Z, COND, DISPLAY, FS, FW, R } from "../../lib/theme";
import { MarkdownRenderer } from "./markdownRenderer";

const GITHUB_REPO = "https://github.com/AndrewJackson14/MyDash";
const GITHUB_BRANCH = "main";

export default function KBViewer({ doc, hash, onLinkClick }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!hash || !containerRef.current) return;
    // Wait for next paint so headings are mounted.
    const t = setTimeout(() => {
      const el = containerRef.current?.querySelector(`#${CSS.escape(hash)}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => clearTimeout(t);
  }, [hash, doc?.slug]);

  if (!doc) {
    return (
      <div style={{ flex: 1, padding: 32, color: Z.tm, fontSize: FS.sm }}>
        Pick a role from the sidebar to view its knowledge base.
      </div>
    );
  }

  // Edit-on-GitHub URL — strip the leading `../../../` from the doc path.
  const repoRelativePath = doc.path.replace(/^(\.\.\/)+/, "");
  const editUrl = `${GITHUB_REPO}/edit/${GITHUB_BRANCH}/${repoRelativePath}`;

  const title = doc.metadata?.display_name || doc.metadata?.title || doc.slug;
  const subtitle = doc.metadata?.team_role_label || doc.metadata?.department || null;
  const members = Array.isArray(doc.metadata?.team_members)
    ? doc.metadata.team_members.join(", ")
    : doc.metadata?.team_members;

  return (
    <main ref={containerRef} style={{
      flex: 1, minWidth: 0,
      background: Z.sa, border: `1px solid ${Z.bd}`, borderRadius: R,
      padding: "24px 32px",
      maxWidth: 860,
    }}>
      {/* Frontmatter header — only render if we have meta. */}
      {(title || subtitle) && (
        <header style={{ marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${Z.bd}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{
                margin: 0,
                fontSize: 28, fontWeight: FW.black,
                color: Z.tx, fontFamily: DISPLAY, lineHeight: 1.2,
              }}>
                {title}
              </h1>
              {subtitle && (
                <div style={{
                  fontSize: FS.xs, color: Z.td,
                  textTransform: "uppercase", letterSpacing: 1,
                  fontFamily: COND, fontWeight: FW.heavy,
                  marginTop: 4,
                }}>
                  {subtitle}{members ? ` · ${members}` : ""}
                </div>
              )}
            </div>
            <a
              href={editUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: FS.xs, fontWeight: FW.bold, fontFamily: COND,
                color: Z.tm, textDecoration: "none",
                padding: "4px 10px", border: `1px solid ${Z.bd}`, borderRadius: 999,
                whiteSpace: "nowrap",
              }}
              title="Edit this page on GitHub"
            >
              Edit on GitHub ↗
            </a>
          </div>
          {doc.metadata?.last_updated && (
            <div style={{ fontSize: 11, color: Z.tm, fontFamily: COND, marginTop: 6 }}>
              Last updated {doc.metadata.last_updated}
              {doc.metadata?.version && ` · v${doc.metadata.version}`}
            </div>
          )}
        </header>
      )}

      <MarkdownRenderer source={doc.body} onLinkClick={onLinkClick} />
    </main>
  );
}
