// ============================================================
// NewsletterTemplates.jsx — Template editor with live preview
// ============================================================
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../lib/theme";
import { Btn, Inp, TA, Sel, GlassCard, Toggle } from "../components/ui";
import { supabase, isOnline } from "../lib/supabase";
import { renderNewsletter } from "../utils/newsletterRenderer";

const NEWSLETTER_PUBS = ["pub-paso-robles-press", "pub-atascadero-news", "pub-the-malibu-times"];

const TYPE_LABELS = {
  daily: "Daily Digest",
  weekly_top: "This Week's Top Stories",
  breaking: "Breaking News",
  sponsored: "Sponsored",
};

const SOURCE_OPTIONS = [
  { value: "featured", label: "Featured stories" },
  { value: "latest", label: "Latest (any category)" },
  { value: "top_viewed", label: "Most viewed" },
  { value: "category:news", label: "Category — News" },
  { value: "category:sports", label: "Category — Sports" },
  { value: "category:events", label: "Category — Events" },
  { value: "category:business", label: "Category — Business" },
  { value: "category:crime", label: "Category — Crime" },
  { value: "category:education", label: "Category — Education" },
  { value: "category:obituaries", label: "Category — Obituaries" },
  { value: "category:commentary", label: "Category — Commentary" },
];

const LAYOUT_OPTIONS = [
  { value: "hero", label: "Hero — big image" },
  { value: "list", label: "List — thumbnail" },
  { value: "compact", label: "Compact — title only" },
];

const LOOKBACK_OPTIONS = [
  { value: 24, label: "Last 24 hours" },
  { value: 48, label: "Last 48 hours" },
  { value: 72, label: "Last 3 days" },
  { value: 168, label: "Last 7 days" },
  { value: 336, label: "Last 14 days" },
];

// ─── Section row editor ──────────────────────────────────────
const SectionEditor = ({ section, idx, onUpdate, onRemove, onMove, canMoveUp, canMoveDown }) => {
  const set = (key, val) => onUpdate(idx, { ...section, [key]: val });
  return (
    <div style={{ padding: 14, border: `1px solid ${Z.bd}`, borderRadius: R, background: Z.sa, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => onMove(idx, -1)} disabled={!canMoveUp} style={{ background: "none", border: "none", cursor: canMoveUp ? "pointer" : "default", color: canMoveUp ? Z.tm : Z.bd, fontSize: 12, padding: "0 4px" }}>{"\u25b2"}</button>
          <button onClick={() => onMove(idx, 1)} disabled={!canMoveDown} style={{ background: "none", border: "none", cursor: canMoveDown ? "pointer" : "default", color: canMoveDown ? Z.tm : Z.bd, fontSize: 12, padding: "0 4px" }}>{"\u25bc"}</button>
        </div>
        <button onClick={() => onRemove(idx)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.da, fontSize: 11, fontWeight: FW.bold, fontFamily: COND }}>Remove</button>
      </div>
      <Inp label="Heading" value={section.heading || ""} onChange={e => set("heading", e.target.value)} placeholder="e.g. Featured" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
        <Sel label="Source" value={section.source || "featured"} onChange={e => set("source", e.target.value)} options={SOURCE_OPTIONS} />
        <Sel label="Layout" value={section.layout || "list"} onChange={e => set("layout", e.target.value)} options={LAYOUT_OPTIONS} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
        <Inp label="Limit" type="number" value={section.limit || 3} onChange={e => set("limit", parseInt(e.target.value) || 1)} />
        <Sel label="Lookback" value={String(section.lookback_hours || 24)} onChange={e => set("lookback_hours", parseInt(e.target.value))} options={LOOKBACK_OPTIONS.map(o => ({ value: String(o.value), label: o.label }))} />
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// TEMPLATE EDITOR MAIN
// ════════════════════════════════════════════════════════════
const NewsletterTemplates = ({ pubs }) => {
  const [selPub, setSelPub] = useState(NEWSLETTER_PUBS[0]);
  const [templates, setTemplates] = useState([]);
  const [selTemplate, setSelTemplate] = useState(null);
  const [draft, setDraft] = useState(null);
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const previewRef = useRef(null);

  const pub = pubs.find(p => p.id === selPub);

  // ─── Load templates + stories for the selected pub ─────────
  useEffect(() => {
    if (!isOnline()) { setLoading(false); return; }
    setLoading(true);

    Promise.all([
      supabase.from("newsletter_templates").select("*").eq("publication_id", selPub).order("template_type"),
      supabase.from("stories")
        .select("id, title, slug, excerpt, published_at, author, category, category_slug, featured_image_url, is_featured, view_count")
        .eq("site_id", selPub)
        .eq("status", "Published")
        .order("published_at", { ascending: false })
        .limit(200),
    ]).then(([tplRes, storyRes]) => {
      const tpls = tplRes.data || [];
      setTemplates(tpls);
      setStories(storyRes.data || []);
      setDraft(tpls[0] || null);
      setSelTemplate(tpls[0]?.id || null);
      setLoading(false);
    });
  }, [selPub]);

  // ─── Site config for rendering (from pubs prop) ────────────
  const site = useMemo(() => {
    const p = pub || {};
    return {
      name: p.name || "",
      domain: p.domain || "",
      logo_url: p.logoUrl || p.logo_url || "",
      primary_color: p.primaryColor || p.primary_color || "#1a1a1a",
      secondary_color: p.secondaryColor || p.secondary_color || "#c53030",
    };
  }, [pub]);

  // ─── Generate live preview HTML ────────────────────────────
  const previewHtml = useMemo(() => {
    if (!draft) return "";
    try {
      return renderNewsletter({ template: draft, stories, site });
    } catch (e) {
      return `<pre style="padding:20px;color:red;">Render error: ${e.message}</pre>`;
    }
  }, [draft, stories, site]);

  // Write preview into iframe
  useEffect(() => {
    if (!previewRef.current || !previewHtml) return;
    const doc = previewRef.current.contentDocument;
    if (doc) {
      doc.open();
      doc.write(previewHtml);
      doc.close();
    }
  }, [previewHtml]);

  const updateDraftField = useCallback((key, value) => {
    setDraft(d => d ? ({ ...d, [key]: value }) : d);
    setSaved(false);
  }, []);

  const updateSection = useCallback((idx, newSection) => {
    setDraft(d => {
      if (!d) return d;
      const sections = [...(d.sections || [])];
      sections[idx] = newSection;
      return { ...d, sections };
    });
    setSaved(false);
  }, []);

  const removeSection = useCallback((idx) => {
    setDraft(d => {
      if (!d) return d;
      return { ...d, sections: (d.sections || []).filter((_, i) => i !== idx) };
    });
    setSaved(false);
  }, []);

  const moveSection = useCallback((idx, dir) => {
    setDraft(d => {
      if (!d) return d;
      const sections = [...(d.sections || [])];
      const to = idx + dir;
      if (to < 0 || to >= sections.length) return d;
      [sections[idx], sections[to]] = [sections[to], sections[idx]];
      return { ...d, sections };
    });
    setSaved(false);
  }, []);

  const addSection = useCallback(() => {
    setDraft(d => {
      if (!d) return d;
      return {
        ...d,
        sections: [...(d.sections || []), {
          heading: "New Section", source: "featured", limit: 3, lookback_hours: 24, layout: "list",
        }],
      };
    });
    setSaved(false);
  }, []);

  const selectTemplate = (id) => {
    const t = templates.find(t => t.id === id);
    if (t) {
      setSelTemplate(id);
      setDraft(t);
      setSaved(false);
    }
  };

  const save = async () => {
    if (!draft || !supabase) return;
    setSaving(true);
    const { error } = await supabase.from("newsletter_templates").update({
      name: draft.name,
      subject: draft.subject,
      preheader: draft.preheader,
      intro: draft.intro,
      footer: draft.footer,
      sections: draft.sections,
    }).eq("id", draft.id);
    if (!error) {
      setTemplates(prev => prev.map(t => t.id === draft.id ? draft : t));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      alert("Save failed: " + error.message);
    }
    setSaving(false);
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: Z.tm }}>Loading templates...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Publication selector + save */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {NEWSLETTER_PUBS.map(pid => {
            const p = pubs.find(x => x.id === pid);
            return (
              <button key={pid} onClick={() => setSelPub(pid)} style={{
                padding: "8px 16px", borderRadius: R, cursor: "pointer", fontFamily: COND,
                fontSize: FS.sm, fontWeight: selPub === pid ? FW.bold : FW.semi,
                border: `1px solid ${selPub === pid ? Z.tm : Z.bd}`,
                background: selPub === pid ? Z.tm + "12" : "transparent",
                color: selPub === pid ? Z.tx : Z.td,
              }}>{p?.name || pid}</button>
            );
          })}
        </div>
        <Btn sm onClick={save} disabled={saving || !draft}>
          {saving ? "Saving..." : saved ? "\u2713 Saved" : "Save Template"}
        </Btn>
      </div>

      {/* Template type tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${Z.bd}`, overflowX: "auto" }}>
        {templates.map(t => (
          <button key={t.id} onClick={() => selectTemplate(t.id)} style={{
            padding: "8px 16px", background: "transparent", border: "none", whiteSpace: "nowrap",
            borderBottom: selTemplate === t.id ? `2px solid ${Z.ac}` : "2px solid transparent",
            color: selTemplate === t.id ? Z.ac : Z.tm, fontSize: FS.sm, fontWeight: FW.heavy,
            fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.6, cursor: "pointer",
          }}>
            {TYPE_LABELS[t.template_type] || t.name}
          </button>
        ))}
      </div>

      {draft && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(360px, 1fr) minmax(400px, 1fr)", gap: 14, alignItems: "start" }}>

          {/* ═══ LEFT: EDITOR ═══ */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Metadata */}
            <GlassCard>
              <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, fontFamily: COND }}>Email Details</div>
              <Inp label="Template Name" value={draft.name || ""} onChange={e => updateDraftField("name", e.target.value)} />
              <div style={{ marginTop: 8 }}>
                <Inp label="Subject" value={draft.subject || ""} onChange={e => updateDraftField("subject", e.target.value)} placeholder="{{pub_name}} — {{date}}" />
                <div style={{ fontSize: FS.micro, color: Z.td, marginTop: 2, fontFamily: COND }}>Tokens: {"{{date}}, {{pub_name}}, {{sponsor}}"}</div>
              </div>
              <div style={{ marginTop: 8 }}>
                <Inp label="Preheader" value={draft.preheader || ""} onChange={e => updateDraftField("preheader", e.target.value)} placeholder="Short preview text shown in inbox" />
              </div>
              <div style={{ marginTop: 8 }}>
                <TA label="Intro (optional)" value={draft.intro || ""} onChange={e => updateDraftField("intro", e.target.value)} rows={2} placeholder="Short intro paragraph" />
              </div>
              <div style={{ marginTop: 8 }}>
                <TA label="Footer (optional)" value={draft.footer || ""} onChange={e => updateDraftField("footer", e.target.value)} rows={2} placeholder="Unsubscribe note, address, etc." />
              </div>
            </GlassCard>

            {/* Sections */}
            <GlassCard>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Sections</div>
                <Btn sm v="ghost" onClick={addSection}>+ Add Section</Btn>
              </div>
              {(draft.sections || []).length === 0 && (
                <div style={{ padding: 20, textAlign: "center", color: Z.td, fontSize: FS.sm, fontFamily: COND }}>No sections. Click "Add Section" to start.</div>
              )}
              {(draft.sections || []).map((sec, i) => (
                <SectionEditor
                  key={i}
                  section={sec}
                  idx={i}
                  onUpdate={updateSection}
                  onRemove={removeSection}
                  onMove={moveSection}
                  canMoveUp={i > 0}
                  canMoveDown={i < (draft.sections?.length || 0) - 1}
                />
              ))}
            </GlassCard>
          </div>

          {/* ═══ RIGHT: LIVE PREVIEW ═══ */}
          <GlassCard style={{ padding: 0, overflow: "hidden", position: "sticky", top: 12 }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${Z.bd}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", fontFamily: COND }}>Live Preview</span>
              <span style={{ fontSize: FS.micro, color: Z.td, fontFamily: COND }}>Using real stories from {site.name}</span>
            </div>
            <iframe
              ref={previewRef}
              title="Newsletter Preview"
              style={{ width: "100%", height: 760, border: "none", background: "#f5f5f5" }}
            />
          </GlassCard>
        </div>
      )}
    </div>
  );
};

export default NewsletterTemplates;
