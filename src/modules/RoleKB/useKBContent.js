// useKBContent — pulls every role + shared markdown file into the
// bundle at build time via Vite's import.meta.glob, parses the
// frontmatter, and exposes a stable index by slug.
//
// Static import (vs runtime fetch from GitHub raw) means the viewer
// works offline, requires no network, and lets the build catch a
// missing role file at compile time. The Wednesday agent path uses
// runtime fetch from GitHub raw — different consumer, different
// cache requirements; see ../../agent-station/shared/role-kb.js.

import { useMemo } from "react";

// Vite glob — relative to this file. The {as: 'raw'} option imports
// each match as a string (the file's contents) rather than a module.
// `eager: true` resolves all matches synchronously at module load,
// keeping the API simple. The KB's total size is small (~30 KB across
// 9 files), so eager is fine.
const ROLE_FILES = import.meta.glob("../../../docs/knowledge-base/*.md",        { as: "raw", eager: true });
const SHARED_FILES = import.meta.glob("../../../docs/knowledge-base/_shared/*.md", { as: "raw", eager: true });
const META_FILES = import.meta.glob("../../../docs/knowledge-base/_meta.json",  { as: "raw", eager: true });

// Frontmatter parser. Splits on the leading `---` block, parses each
// `key: value` line into the metadata object, returns { metadata, body }.
// Array values are recognized via `[a, b, c]` syntax — sufficient for
// the role files' team_members lists.
function parseFrontmatter(raw) {
  if (!raw.startsWith("---")) return { metadata: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return { metadata: {}, body: raw };
  const fm = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\n/, "");
  const metadata = {};
  for (const line of fm.split("\n")) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    // Array literal: [a, b, c]
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map(s => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }
    metadata[m[1]] = value;
  }
  return { metadata, body };
}

// Extract the slug from a path like
//   ../../../docs/knowledge-base/publisher.md  → 'publisher'
//   ../../../docs/knowledge-base/_shared/glossary.md → 'glossary'
function slugFromPath(path) {
  return path.split("/").pop().replace(/\.md$/, "");
}

// Build index once at module load — re-used across hook calls.
const ROLE_INDEX = (() => {
  const idx = {};
  for (const [path, raw] of Object.entries(ROLE_FILES)) {
    const slug = slugFromPath(path);
    const { metadata, body } = parseFrontmatter(raw);
    idx[slug] = { slug, path, metadata, body, kind: "role" };
  }
  return idx;
})();

const SHARED_INDEX = (() => {
  const idx = {};
  for (const [path, raw] of Object.entries(SHARED_FILES)) {
    const slug = slugFromPath(path);
    const { metadata, body } = parseFrontmatter(raw);
    idx[slug] = { slug, path, metadata, body, kind: "shared" };
  }
  return idx;
})();

const META_RAW = Object.values(META_FILES)[0] || "{}";
let META = {};
try { META = JSON.parse(META_RAW); } catch (e) { console.warn("[RoleKB] _meta.json parse failed:", e); }

// Public hook. Roles ordered per _meta.json; shared docs in their
// own bucket. Search applies a simple substring match across
// metadata + body, returning hits with snippet context.
export function useKBContent({ search = "" } = {}) {
  return useMemo(() => {
    const roles = (META.roles || []).map(r => ROLE_INDEX[r.id]).filter(Boolean);
    const shared = Object.values(SHARED_INDEX);

    const q = (search || "").trim().toLowerCase();
    let searchHits = [];
    if (q.length >= 2) {
      const all = [...Object.values(ROLE_INDEX), ...shared];
      for (const doc of all) {
        const idx = doc.body.toLowerCase().indexOf(q);
        if (idx >= 0) {
          // Snippet — 60 chars on either side of the hit.
          const start = Math.max(0, idx - 60);
          const end = Math.min(doc.body.length, idx + q.length + 60);
          const snippet = (start > 0 ? "…" : "") + doc.body.slice(start, end) + (end < doc.body.length ? "…" : "");
          searchHits.push({ doc, snippet });
        }
      }
    }

    return { roles, shared, meta: META, searchHits };
  }, [search]);
}

// Direct accessor for non-hook callers (the agent helper, KBLink).
export function getKBDoc(slug) {
  return ROLE_INDEX[slug] || SHARED_INDEX[slug] || null;
}
