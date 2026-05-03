import React from "react";
import { Z, COND, FS, Ri } from "../../../lib/theme";
import { Inp, TA } from "../../ui";
import { pn } from "../StoryEditor.helpers";

// SEO tuning + a Google-style search-result preview so editors can
// eyeball title length, description, and slug at once. Length
// indicators flip green inside Google's recommended ranges.
function SEOPanel({ meta, setMeta, saveMeta, selectedPubs, pubs }) {
  const titleLen = (meta.seo_title || "").length;
  const descLen = (meta.seo_description || "").length;
  return (
    <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
      <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>SEO</div>
      <div>
        <Inp
          label="SEO Title"
          value={meta.seo_title || ""}
          onChange={v => setMeta(m => ({ ...m, seo_title: v }))}
          onBlur={() => saveMeta("seo_title", meta.seo_title)}
        />
        <div style={{ fontSize: FS.micro, color: titleLen >= 50 && titleLen <= 60 ? (Z.su || "#22c55e") : Z.tm, fontFamily: COND, textAlign: "right" }}>{titleLen}/60</div>
      </div>
      <div style={{ marginTop: 4 }}>
        <TA
          label="SEO Description"
          value={meta.seo_description || ""}
          onChange={v => setMeta(m => ({ ...m, seo_description: v }))}
          onBlur={() => saveMeta("seo_description", meta.seo_description)}
          rows={2}
        />
        <div style={{ fontSize: FS.micro, color: descLen >= 150 && descLen <= 160 ? (Z.su || "#22c55e") : Z.tm, fontFamily: COND, textAlign: "right" }}>{descLen}/160</div>
      </div>
      <Inp
        label="Slug"
        value={meta.slug || ""}
        onChange={v => setMeta(m => ({ ...m, slug: v }))}
        onBlur={() => saveMeta("slug", meta.slug)}
      />
      <div style={{ marginTop: 8, padding: 10, background: Z.bg, borderRadius: Ri, border: "1px solid " + Z.bd }}>
        <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>Search Preview</div>
        <div style={{ fontSize: FS.md, color: "#1a0dab", fontFamily: "arial, sans-serif", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta.seo_title || meta.title || "Page Title"}</div>
        <div style={{ fontSize: FS.xs, color: "#006621", fontFamily: "arial, sans-serif", marginTop: 2 }}>{selectedPubs[0] && pn(selectedPubs[0], pubs).toLowerCase().replace(/\s+/g, "") + ".com"}/{meta.slug || "article-slug"}</div>
        <div style={{ fontSize: FS.xs, color: "#545454", fontFamily: "arial, sans-serif", marginTop: 2, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{meta.seo_description || meta.excerpt || "No description set"}</div>
      </div>
    </div>
  );
}

export default React.memo(SEOPanel);
