import React, { useState } from "react";
import { Z, COND, FS, Ri } from "../../../lib/theme";
import { Inp, TA } from "../../ui";

// SEO tuning + a Google-style search-result preview so editors can
// eyeball title length, description, and slug at once. Length
// indicators flip green inside Google's recommended ranges.
//
// Wave-3 changes:
// - Search preview now uses the publication's actual websiteUrl when
//   one is configured. Refuses to fabricate `${pubname}.com` from a
//   slug that isn't an actual domain — shows a "no website configured"
//   note instead so editors don't see a confidently-wrong URL.
// - Slug locks once the story has a first_published_at (URL is the
//   permanent path; changing it would break inbound links and SEO).
//   Admin permission gates an explicit "Override" affordance with a
//   warning tooltip.
function SEOPanel({ meta, setMeta, saveMeta, primaryPub, currentUser }) {
  const titleLen = (meta.seo_title || "").length;
  const descLen = (meta.seo_description || "").length;

  // Resolve the real publication website to a host. Returns null when
  // the publication has no website configured, when websiteUrl is
  // empty, or when the configured value looks like a slug rather
  // than a domain (no dot in the host) — the no-fabrication rule.
  const websiteHost = (() => {
    if (!primaryPub?.hasWebsite) return null;
    const raw = (primaryPub.websiteUrl || "").trim();
    if (!raw) return null;
    const host = raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    if (!host.includes(".")) return null;
    return host;
  })();

  const isSlugLocked = !!meta.first_published_at;
  const isAdmin = !!(currentUser?.permissions?.includes?.("admin"));
  const [slugUnlocked, setSlugUnlocked] = useState(false);
  const slugReadOnly = isSlugLocked && !slugUnlocked;

  return (
    <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
      <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>SEO</div>
      <div>
        <Inp
          label="SEO Title"
          value={meta.seo_title || ""}
          onChange={e => setMeta(m => ({ ...m, seo_title: e.target.value }))}
          onBlur={() => saveMeta("seo_title", meta.seo_title)}
        />
        <div style={{ fontSize: FS.micro, color: titleLen >= 50 && titleLen <= 60 ? (Z.su || "#22c55e") : Z.tm, fontFamily: COND, textAlign: "right" }}>{titleLen}/60</div>
      </div>
      <div style={{ marginTop: 4 }}>
        <TA
          label="SEO Description"
          value={meta.seo_description || ""}
          onChange={e => setMeta(m => ({ ...m, seo_description: e.target.value }))}
          onBlur={() => saveMeta("seo_description", meta.seo_description)}
          rows={2}
        />
        <div style={{ fontSize: FS.micro, color: descLen >= 150 && descLen <= 160 ? (Z.su || "#22c55e") : Z.tm, fontFamily: COND, textAlign: "right" }}>{descLen}/160</div>
      </div>

      {/* Slug field with post-publish lock + admin override. The
          confirm-on-override pattern (Override button → temporary
          unlock) avoids the case where an editor accidentally types
          into a published slug and breaks the URL. */}
      <div style={{ marginTop: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND }}>
            Slug{isSlugLocked ? " (locked)" : ""}
          </span>
          {isSlugLocked && slugReadOnly && isAdmin && (
            <button
              onClick={() => setSlugUnlocked(true)}
              title="URL slug is permanent once published. Override only if you're prepared to break inbound links."
              style={{ fontSize: FS.micro, fontWeight: 700, color: Z.wa, background: "none", border: "none", cursor: "pointer", fontFamily: COND, padding: 0 }}
            >
              Override (admin)
            </button>
          )}
        </div>
        <input
          value={meta.slug || ""}
          readOnly={slugReadOnly}
          onChange={e => setMeta(m => ({ ...m, slug: e.target.value }))}
          onBlur={() => saveMeta("slug", meta.slug)}
          title={isSlugLocked ? "URL slug is permanent once published" : "URL slug for this story"}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: Ri,
            border: "1px solid " + Z.bd,
            background: slugReadOnly ? Z.sa : Z.sf,
            color: slugReadOnly ? Z.tm : Z.tx,
            fontSize: FS.base, fontFamily: COND,
            cursor: slugReadOnly ? "not-allowed" : "text",
            outline: "none",
          }}
        />
      </div>

      <div style={{ marginTop: 8, padding: 10, background: Z.bg, borderRadius: Ri, border: "1px solid " + Z.bd }}>
        <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>Search Preview</div>
        <div style={{ fontSize: FS.md, color: "#1a0dab", fontFamily: "arial, sans-serif", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {meta.seo_title || meta.title || "Page Title"}
        </div>
        <div style={{ fontSize: FS.xs, color: "#006621", fontFamily: "arial, sans-serif", marginTop: 2 }}>
          {websiteHost
            ? `${websiteHost}/${meta.slug || "article-slug"}`
            : <span style={{ color: Z.tm, fontStyle: "italic" }}>No website configured for this publication</span>
          }
        </div>
        <div style={{ fontSize: FS.xs, color: "#545454", fontFamily: "arial, sans-serif", marginTop: 2, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {meta.seo_description || meta.excerpt || "No description set"}
        </div>
      </div>
    </div>
  );
}

export default React.memo(SEOPanel);
