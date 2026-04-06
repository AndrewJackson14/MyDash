import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Z, SC, COND, DISPLAY } from "../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Modal } from "./ui";
import { STORY_STATUSES } from "../constants";
import { supabase } from "../lib/supabase";

// ── Constants ────────────────────────────────────────────────────
const WORKFLOW_STAGES = ["Draft", "Assigned", "Editing", "Ready"];
const PRINT_STAGES = [
  { key: "none", label: "Not Assigned" }, { key: "ready", label: "Ready for Print" },
  { key: "on_page", label: "On Page" }, { key: "proofread", label: "Proofread" },
  { key: "approved", label: "Approved" }, { key: "sent_to_press", label: "Sent to Press" },
];
const STAGE_TO_STATUS = { "Draft": "Draft", "Assigned": "Needs Editing", "Editing": "Edited", "Ready": "Approved" };
const STATUS_TO_STAGE = {}; Object.entries(STAGE_TO_STATUS).forEach(([k, v]) => { STATUS_TO_STAGE[v] = k; });
const STORY_TYPES = [
  { key: "article", label: "Article" }, { key: "column", label: "Column" },
  { key: "letter", label: "Letter to Editor" }, { key: "obituary", label: "Obituary" },
  { key: "legal_notice", label: "Legal Notice" }, { key: "calendar_event", label: "Calendar Event" },
  { key: "press_release", label: "Press Release" }, { key: "opinion", label: "Opinion" },
];
const SOURCES = [
  { key: "staff", label: "Staff" }, { key: "freelance", label: "Freelance" },
  { key: "syndicated", label: "Syndicated" }, { key: "press_release", label: "Press Release" },
  { key: "community", label: "Community" }, { key: "ai_assisted", label: "AI Assisted" },
];
const PRIORITIES = [
  { key: "low", label: "Low" }, { key: "normal", label: "Normal" },
  { key: "high", label: "High" }, { key: "urgent", label: "Urgent" },
];

// ── Helpers ──────────────────────────────────────────────────────
const pn = (id, pubs) => pubs.find(p => p.id === id)?.name || id;
const pColor = (id, pubs) => pubs.find(p => p.id === id)?.color || Z.ac;
const tn = (id, team) => { const t = team.find(t => t.id === id); return t ? t.name || "Unknown" : "Unassigned"; };
const ago = (d) => { if (!d) return ""; const ms = Date.now() - new Date(d).getTime(); const m = Math.floor(ms / 60000); if (m < 60) return m + "m ago"; const h = Math.floor(m / 60); if (h < 24) return h + "h ago"; return Math.floor(h / 24) + "d ago"; };
const getStage = (status) => STATUS_TO_STAGE[status] || "Draft";
const fmtDate = (d) => d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";

// ── Upload via Edge Function ─────────────────────────────────────
async function uploadImage(file, path) {
  const ext = file.name?.split(".").pop()?.toLowerCase() || "jpg";
  const filename = Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  const res = await fetch("https://hqywacyhpllapdwccmaw.supabase.co/functions/v1/upload-image", {
    method: "POST",
    headers: { "Authorization": "Bearer " + session.access_token, "x-upload-path": path || "uploads", "x-file-name": filename, "x-content-type": file.type || "image/jpeg" },
    body: file,
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Upload failed: " + res.status); }
  return (await res.json()).url;
}

// ── Toolbar components ───────────────────────────────────────────
const TBtn = ({ onClick, active, children, title }) => (
  <button onClick={onClick} title={title} style={{ padding: "4px 8px", border: "none", borderRadius: 2, background: active ? Z.ac + "20" : "transparent", color: active ? Z.ac : Z.tm, cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 500, display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 28, height: 28 }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = Z.sa; }} onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>{children}</button>
);
const TSep = () => <div style={{ width: 1, height: 20, background: Z.bd, margin: "0 4px" }} />;

// ── Multi-select Chip Picker ─────────────────────────────────────
const ChipPicker = ({ label, options, selected, onChange }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>{label}</div>
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
      {options.map(o => {
        const on = selected.includes(o.id);
        return <button key={o.id} onClick={() => onChange(on ? selected.filter(x => x !== o.id) : [...selected, o.id])} style={{ padding: "3px 8px", borderRadius: 2, fontSize: 10, fontWeight: on ? 700 : 500, border: "1px solid " + (on ? (o.color || Z.ac) : Z.bd), background: on ? (o.color || Z.ac) + "18" : "transparent", color: on ? (o.color || Z.ac) : Z.tm, cursor: "pointer", fontFamily: COND }}>{o.name}</button>;
      })}
    </div>
  </div>
);

// ── Preflight Checklist Modal ────────────────────────────────────
const PreflightModal = ({ open, onClose, onPublish, checks }) => {
  const allPassed = checks.every(c => c.pass);
  return (
    <Modal open={open} onClose={onClose} title="Publish Preflight Check">
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 380 }}>
        <p style={{ fontSize: 12, color: Z.tm, fontFamily: COND, margin: 0 }}>This story will be published to the website immediately.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {checks.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 2, background: c.pass ? (Z.su || "#22c55e") + "10" : "#ef444410", border: "1px solid " + (c.pass ? (Z.su || "#22c55e") + "30" : "#ef444430") }}>
              <span style={{ fontSize: 14 }}>{c.pass ? "\u2713" : "\u2717"}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: c.pass ? (Z.su || "#22c55e") : "#ef4444", fontFamily: COND }}>{c.label}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <Btn sm v="secondary" onClick={onClose}>Cancel</Btn>
          <Btn sm onClick={onPublish} disabled={!allPassed} style={!allPassed ? { opacity: 0.5, cursor: "not-allowed" } : {}}>
            <Ic.send size={11} /> Publish Now
          </Btn>
        </div>
        {!allPassed && <p style={{ fontSize: 10, color: "#ef4444", fontFamily: COND, margin: 0, textAlign: "right" }}>Fix required items before publishing</p>}
      </div>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════════
// STORY EDITOR
// ══════════════════════════════════════════════════════════════════
const StoryEditor = ({ story, onClose, onUpdate, pubs, issues, team, bus, publishStory, unpublishStory }) => {
  const [meta, setMeta] = useState({ ...story });
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageCaption, setImageCaption] = useState("");
  const [pendingImageUrl, setPendingImageUrl] = useState("");
  const [activity, setActivity] = useState([]);
  const [categories, setCategories] = useState([]);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [webApproved, setWebApproved] = useState(!!story.web_approved);
  const [fullContent, setFullContent] = useState(null); // loaded from DB
  const [contentLoading, setContentLoading] = useState(true);
  const saveTimer = useRef(null);
  const fileInput = useRef(null);

  // ── FIX #3: Use 'publication' (camelCase from useAppData) ───
  const selectedPubs = useMemo(() => {
    const pid = meta.publication_id || meta.publication;
    return Array.isArray(pid) ? pid : pid ? [pid] : [];
  }, [meta.publication_id, meta.publication]);

  // ── FIX #5: Fetch full content (body + content_json) on mount ──
  useEffect(() => {
    if (!story.id) { setContentLoading(false); return; }
    supabase.from("stories")
      .select("body, content_json, published_at, first_published_at, last_significant_edit_at, edit_count, correction_note, notes, web_status, web_approved, print_status, print_issue_id, priority, story_type, source, assigned_to, is_featured, slug, seo_title, seo_description, excerpt, featured_image_url, category_id")
      .eq("id", story.id).single()
      .then(({ data }) => {
        if (data) {
          setFullContent(data);
          setMeta(m => ({ ...m, ...data }));
          if (data.web_approved) setWebApproved(true);
        }
        setContentLoading(false);
      });
  }, [story.id]);

  // ── Load categories for selected publications ───────────────
  useEffect(() => {
    if (!selectedPubs.length) { setCategories([]); return; }
    supabase.from("categories").select("id, name, slug, publication_id").in("publication_id", selectedPubs).order("name")
      .then(({ data }) => { if (data) setCategories(data); });
  }, [selectedPubs.join(",")]);

  // ── Authors from team (editorial roles) ─────────────────────
  const authors = useMemo(() => {
    const roles = ["Publisher", "Editor-in-Chief", "Content Editor", "Writer", "Stringer", "Contributor"];
    return team.filter(t => !t.is_freelance && (roles.some(r => (t.role || "").includes(r)) || t.stellarpress_roles));
  }, [team]);

  // ── Freelance contributors ─────────────────────────────────
  const [freelancers, setFreelancers] = useState([]);
  useEffect(() => {
    supabase.from("team_members").select("id, name, role, is_freelance, specialty")
      .eq("is_freelance", true).order("name")
      .then(({ data }) => { if (data) setFreelancers(data); });
  }, []);

  const addFreelancer = async (name, specialty) => {
    const newMember = { name, role: specialty, is_freelance: true, specialty, created_at: new Date().toISOString() };
    const { data } = await supabase.from("team_members").insert(newMember).select().single();
    if (data) setFreelancers(prev => [...prev, data]);
  };

  // ── Smart issue filter: +/-30 days, grouped by pub ──────────
  const filteredIssues = useMemo(() => {
    const now = new Date(), min = new Date(now), max = new Date(now);
    min.setDate(min.getDate() - 30); max.setDate(max.getDate() + 30);
    return (issues || []).filter(i => {
      if (i.sentToPress) return false;
      const d = new Date(i.date || i.deadline);
      return d >= min && d <= max;
    }).sort((a, b) => {
      const pa = pn(a.pub_id || a.publicationId, pubs), pb = pn(b.pub_id || b.publicationId, pubs);
      if (pa !== pb) return pa.localeCompare(pb);
      return new Date(a.date || a.deadline) - new Date(b.date || b.deadline);
    });
  }, [issues, pubs]);

  // ── TipTap Editor ───────────────────────────────────────────
  const editorContent = useMemo(() => {
    if (contentLoading) return "";
    // FIX #5: Use content_json if available, fall back to body (HTML)
    if (fullContent?.content_json) return fullContent.content_json;
    if (fullContent?.body) return fullContent.body;
    if (story.content_json) return story.content_json;
    if (story.body) return story.body;
    return "";
  }, [contentLoading, fullContent, story]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Image.configure({ HTMLAttributes: { class: "editor-image" }, allowBase64: false }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Start writing your story\u2026" }),
      Underline, TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: editorContent,
    editorProps: {
      attributes: { style: "font-family: Georgia, 'Times New Roman', serif; font-size: 17px; line-height: 1.75; color: " + Z.tx + "; outline: none; min-height: 400px; padding: 0;" },
      handleDrop: (v, e) => { const f = e.dataTransfer?.files; if (f?.[0]?.type.startsWith("image/")) { e.preventDefault(); handleImageUpload(f[0]); return true; } return false; },
      handlePaste: (v, e) => { const items = e.clipboardData?.items; if (items) { for (const i of items) { if (i.type.startsWith("image/")) { e.preventDefault(); handleImageUpload(i.getAsFile()); return true; } } } return false; },
    },
    onUpdate: ({ editor }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => autoSave(editor.getJSON(), editor.getText()), 2000);
    },
  }, [editorContent]); // re-create when content loads

  // ── Sync content into editor when async load completes ──
  useEffect(() => {
    if (!editor || contentLoading) return;
    const content = fullContent?.content_json || fullContent?.body || "";
    if (content && editor.isEmpty) {
      editor.commands.setContent(content);
    }
  }, [editor, contentLoading, fullContent]);

  // ── Load activity log ───────────────────────────────────────
  useEffect(() => {
    if (!story.id) return;
    supabase.from("story_activity").select("*").eq("story_id", story.id).order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => { if (data) setActivity(data); });
  }, [story.id]);

  // ── Auto-save content ───────────────────────────────────────
  const autoSave = useCallback(async (cj, pt) => {
    setSaving(true);
    const wc = pt.trim() ? pt.trim().split(/\s+/).length : 0;
    const u = { content_json: cj, word_count: wc, updated_at: new Date().toISOString() };
    if (editor) u.body = editor.getHTML();
    const { error } = await supabase.from("stories").update(u).eq("id", story.id);
    if (!error) { setLastSaved(new Date()); onUpdate(story.id, u); }
    setSaving(false);
  }, [story.id, editor, onUpdate]);

  // ── Save metadata ───────────────────────────────────────────
  const saveMeta = useCallback(async (field, value) => {
    // FIX #3: Map frontend camelCase to DB snake_case for publication
    const dbField = field === "publication" ? "publication_id" : field;
    const u = { [dbField]: value, updated_at: new Date().toISOString() };
    setMeta(m => ({ ...m, [field]: value, [dbField]: value }));
    const { error } = await supabase.from("stories").update(u).eq("id", story.id);
    if (!error) { onUpdate(story.id, { [field]: value }); setLastSaved(new Date()); }
  }, [story.id, onUpdate]);

  // ── FIX #4: Preflight check before publish ──────────────────
  const preflightChecks = useMemo(() => {
    const hasTitle = !!(meta.title && meta.title.trim() && meta.title !== "New Story");
    const hasBody = !!(editor && editor.getText().trim().length > 20);
    const hasCategory = !!(meta.category || meta.category_id);
    const hasFeaturedImage = !!meta.featured_image_url;
    return [
      { label: "Title is set", pass: hasTitle },
      { label: "Body has content (20+ characters)", pass: hasBody },
      { label: "Category is selected", pass: hasCategory },
      { label: "Featured image is set", pass: hasFeaturedImage },
    ];
  }, [meta, editor]);

  const handlePublishClick = () => setPreflightOpen(true);

  const publishToWeb = async () => {
    setPreflightOpen(false);
    const u = {
      web_status: "published", status: "Published",
      published_at: meta.published_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (!meta.slug) u.slug = (meta.title || "untitled").toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").slice(0, 120);
    if (!meta.excerpt && editor) u.excerpt = editor.getText().slice(0, 300);
    const { error } = await supabase.from("stories").update(u).eq("id", story.id);
    if (!error) {
      setMeta(m => ({ ...m, ...u }));
      onUpdate(story.id, u);
      setLastSaved(new Date());
      // FIX #7: Notify publisher
      if (bus) {
        bus.emit("story.published", { storyId: story.id, title: meta.title });
        bus.emit("notification.add", {
          text: '"' + (meta.title || "Untitled") + '" published to web by ' + (meta.author || "editor"),
          route: "editorial",
        });
      }
    }
  };

  // ── Republish (skip preflight — already published once) ─────
  const republishToWeb = async () => {
    const u = { web_status: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (editor) { u.body = editor.getHTML(); u.content_json = editor.getJSON(); }
    const { error } = await supabase.from("stories").update(u).eq("id", story.id);
    if (!error) {
      setMeta(m => ({ ...m, ...u }));
      onUpdate(story.id, u);
      setLastSaved(new Date());
      if (bus) bus.emit("notification.add", { text: '"' + (meta.title || "Untitled") + '" republished to web', route: "editorial" });
    }
  };

  // ── Image upload ────────────────────────────────────────────
  const handleImageUpload = async (file) => {
    if (!file) return;
    setImageUploading(true);
    try {
      const ps = selectedPubs[0] ? pn(selectedPubs[0], pubs).toLowerCase().replace(/\s+/g, "-") : "general";
      const url = await uploadImage(file, "articles/" + ps + "/" + new Date().getFullYear());
      setPendingImageUrl(url); setImageCaption(""); setImageModalOpen(true);
    } catch (err) { console.error("Image upload failed:", err); alert("Image upload failed: " + err.message); }
    setImageUploading(false);
  };

  const insertImage = () => {
    if (!pendingImageUrl || !editor) return;
    editor.chain().focus().setImage({ src: pendingImageUrl, alt: imageCaption || "", title: imageCaption || "" }).run();
    if (imageCaption) editor.chain().focus().createParagraphNear().insertContent('<em style="font-size:14px;color:#6b7280;">' + imageCaption + "</em>").run();
    setImageModalOpen(false); setPendingImageUrl(""); setImageCaption("");
  };

  const setFeaturedImage = async () => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.onchange = async (e) => { const f = e.target.files[0]; if (!f) return; setImageUploading(true); try { const ps = selectedPubs[0] ? pn(selectedPubs[0], pubs).toLowerCase().replace(/\s+/g, "-") : "general"; const url = await uploadImage(f, "featured/" + ps); await saveMeta("featured_image_url", url); } catch (err) { alert("Upload failed: " + err.message); } setImageUploading(false); };
    inp.click();
  };

  const insertLink = () => { if (!linkUrl || !editor) return; editor.chain().focus().setLink({ href: linkUrl.startsWith("http") ? linkUrl : "https://" + linkUrl }).run(); setLinkModalOpen(false); setLinkUrl(""); };

  const wordCount = editor ? (editor.getText().trim() ? editor.getText().trim().split(/\s+/).length : 0) : 0;
  const needsRepublish = meta.published_at && meta.last_significant_edit_at && new Date(meta.last_significant_edit_at) > new Date(meta.published_at);
  const currentStage = getStage(meta.status);
  const isPublished = meta.status === "Published" || meta.status === "Sent to Web";

  useEffect(() => { return () => { if (saveTimer.current) clearTimeout(saveTimer.current); }; }, []);

  if (contentLoading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: Z.tm, fontFamily: COND }}>Loading story content\u2026</div>;
  if (!editor) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: Z.bg }}>
      {/* Top Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", borderBottom: "1px solid " + Z.bd, background: Z.sf, flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontFamily: COND, fontWeight: 600 }}>{"\u2190"} Back to Editorial</button>
        <TSep />
        <span style={{ fontSize: 13, fontWeight: 700, color: Z.tx, fontFamily: COND, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta.title || "Untitled Story"}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {saving && <span style={{ fontSize: 10, color: Z.tm, fontFamily: COND }}>Saving\u2026</span>}
          {!saving && lastSaved && <span style={{ fontSize: 10, color: Z.su || "#22c55e", fontFamily: COND }}>{"\u2713"} Saved {ago(lastSaved)}</span>}
          {imageUploading && <span style={{ fontSize: 10, color: "#f59e0b", fontFamily: COND }}>Uploading\u2026</span>}
          <Badge status={meta.status || "Draft"} small />
          {meta.is_featured && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 2, background: "#fef3c7", color: "#d97706" }}>{"\u2605"} Featured</span>}
          {isPublished && !needsRepublish && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 2, background: "#dcfce7", color: "#16a34a" }}>Live</span>}
          {needsRepublish && <Btn sm onClick={republishToWeb} style={{ background: "#fef3c7", color: "#d97706", border: "1px solid #fde68a" }}>{"\u21bb"} Republish</Btn>}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left: Editor */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "20px 32px 0" }}>
            <input value={meta.title || ""} onChange={e => setMeta(m => ({ ...m, title: e.target.value }))} onBlur={e => saveMeta("title", e.target.value)} placeholder="Story title\u2026" style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 28, fontWeight: 800, color: Z.tx, fontFamily: DISPLAY, lineHeight: 1.2, padding: 0, marginBottom: 8 }} />
            <div style={{ fontSize: 11, color: Z.tm, fontFamily: COND, marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
              {selectedPubs.map(pid => <span key={pid} style={{ color: pColor(pid, pubs) }}>{pn(pid, pubs)}</span>)}
              <span>{"\u00b7"}</span><span>{meta.author || "No author"}</span><span>{"\u00b7"}</span><span>{meta.category || "Uncategorized"}</span><span>{"\u00b7"}</span><span>{wordCount.toLocaleString()} words</span>
            </div>
          </div>
          {/* Toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "4px 32px", borderTop: "1px solid " + Z.bd, borderBottom: "1px solid " + Z.bd, background: Z.sf, flexWrap: "wrap", flexShrink: 0 }}>
            <TBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold"><strong>B</strong></TBtn>
            <TBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic"><em>I</em></TBtn>
            <TBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline"><u>U</u></TBtn>
            <TSep />
            <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="H1">H1</TBtn>
            <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="H2">H2</TBtn>
            <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="H3">H3</TBtn>
            <TBtn onClick={() => editor.chain().focus().setParagraph().run()} active={editor.isActive("paragraph")} title="P">{"\u00b6"}</TBtn>
            <TSep />
            <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullets">{"\u2022"}</TBtn>
            <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbers">1.</TBtn>
            <TBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Quote">{"\u201c"}</TBtn>
            <TSep />
            <TBtn onClick={() => { setLinkUrl(editor.getAttributes("link").href || ""); setLinkModalOpen(true); }} active={editor.isActive("link")} title="Link">{"\ud83d\udd17"}</TBtn>
            <TBtn onClick={() => fileInput.current?.click()} title="Image">{"\ud83d\udcf7"}</TBtn>
            <TBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">{"\u2014"}</TBtn>
            <TSep />
            <TBtn onClick={() => editor.chain().focus().undo().run()} title="Undo">{"\u21a9"}</TBtn>
            <TBtn onClick={() => editor.chain().focus().redo().run()} title="Redo">{"\u21aa"}</TBtn>
            <input ref={fileInput} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleImageUpload(e.target.files[0]); e.target.value = ""; }} />
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px 64px" }}><EditorContent editor={editor} /></div>
        </div>

        {/* Right: Metadata */}
        <div style={{ width: 320, flexShrink: 0, borderLeft: "1px solid " + Z.bd, background: Z.sf, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* FIX #1: Published/Updated dates */}
          {isPublished && (
            <div style={{ background: Z.bg, borderRadius: 3, padding: 10, border: "1px solid " + Z.bd }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Publication Dates</div>
              {meta.first_published_at && <div style={{ fontSize: 11, color: Z.tx, fontFamily: COND }}>Published: <strong>{fmtDate(meta.first_published_at)}</strong></div>}
              {!meta.first_published_at && meta.published_at && <div style={{ fontSize: 11, color: Z.tx, fontFamily: COND }}>Published: <strong>{fmtDate(meta.published_at)}</strong></div>}
              {meta.last_significant_edit_at && <div style={{ fontSize: 11, color: Z.tx, fontFamily: COND, marginTop: 2 }}>Updated: <strong>{fmtDate(meta.last_significant_edit_at)}</strong></div>}
              {meta.edit_count > 0 && <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND, marginTop: 2 }}>{meta.edit_count} edit{meta.edit_count > 1 ? "s" : ""} since first publish</div>}
            </div>
          )}

          {/* Unified workflow */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>Workflow</div>
            <div style={{ display: "flex", gap: 0 }}>
              {WORKFLOW_STAGES.map((stage, i) => {
                const cur = currentStage === stage, past = WORKFLOW_STAGES.indexOf(currentStage) > i;
                return <button key={stage} onClick={() => saveMeta("status", STAGE_TO_STATUS[stage])} style={{ flex: 1, padding: "6px 4px", fontSize: 10, fontWeight: cur ? 800 : 600, border: "1px solid " + (cur ? Z.ac : Z.bd), borderRight: i < 3 ? "none" : undefined, borderRadius: i === 0 ? "3px 0 0 3px" : i === 3 ? "0 3px 3px 0" : 0, background: cur ? Z.ac + "18" : past ? (Z.su || "#22c55e") + "10" : "transparent", color: cur ? Z.ac : past ? (Z.su || "#22c55e") : Z.tm, cursor: "pointer", fontFamily: COND }}>{stage}</button>;
              })}
            </div>
            {isPublished && <div style={{ fontSize: 10, fontWeight: 700, color: Z.su || "#22c55e", fontFamily: COND, marginTop: 4 }}>{"\u2713"} Published</div>}
          </div>

          {/* Web Approval + Publish / Featured */}
          <div style={{ background: Z.bg, borderRadius: 3, padding: 10, border: "1px solid " + Z.bd }}>
            {isPublished && !needsRepublish ? (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: Z.su || "#22c55e", fontFamily: COND, marginBottom: 6 }}>{"\u2713"} Live on Web</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn sm onClick={republishToWeb} style={{ flex: 1 }}>{"\u21bb"} Update Live</Btn>
                  <Btn sm v="secondary" onClick={async () => { if (unpublishStory) { await unpublishStory(story.id); setMeta(m => ({ ...m, status: "Approved", web_status: "unpublished", sent_to_web: false })); onUpdate(story.id, { status: "Approved", web_status: "unpublished", sent_to_web: false }); } }} style={{ flex: 1, color: "#ef4444", borderColor: "#ef444440" }}>Unpublish</Btn>
                </div>
              </div>
            ) : needsRepublish ? (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#d97706", fontFamily: COND, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>{"\u26a0"} Unpublished Changes</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn sm onClick={republishToWeb} style={{ flex: 1, background: "#fef3c7", color: "#d97706", border: "1px solid #fde68a" }}>{"\u21bb"} Republish</Btn>
                  <Btn sm v="secondary" onClick={async () => { if (unpublishStory) { await unpublishStory(story.id); setMeta(m => ({ ...m, status: "Approved", web_status: "unpublished", sent_to_web: false })); onUpdate(story.id, { status: "Approved", web_status: "unpublished", sent_to_web: false }); } }} style={{ flex: 1, color: "#ef4444", borderColor: "#ef444440" }}>Unpublish</Btn>
                </div>
              </div>
            ) : currentStage === "Ready" && !webApproved ? (
              <Btn sm onClick={async () => { setWebApproved(true); await saveMeta("web_approved", true); }} style={{ width: "100%", background: "#3b82f620", color: "#3b82f6", border: "1px solid #3b82f640" }}>{"\u2713"} Approve for Web</Btn>
            ) : webApproved || isPublished ? (
              <Btn sm onClick={handlePublishClick} style={{ width: "100%" }}><Ic.send size={11} /> Publish to Web</Btn>
            ) : (
              <div style={{ fontSize: 11, color: Z.tm, fontFamily: COND, textAlign: "center", padding: 4 }}>Set status to Ready and approve before publishing</div>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, cursor: "pointer", fontSize: 11, fontFamily: COND, color: Z.tx }}>
              <input type="checkbox" checked={!!meta.is_featured} onChange={e => saveMeta("is_featured", e.target.checked)} style={{ accentColor: "#d97706" }} />
              <span style={{ fontWeight: 600 }}>{"\u2605"} Featured Article</span><span style={{ fontSize: 9, color: Z.tm }}>(hero)</span>
            </label>
          </div>

          {/* Featured image */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>Featured Image</div>
            {meta.featured_image_url ? (
              <div style={{ position: "relative" }}><img src={meta.featured_image_url} alt="" style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 3, border: "1px solid " + Z.bd }} /><button onClick={setFeaturedImage} style={{ position: "absolute", bottom: 6, right: 6, padding: "3px 8px", borderRadius: 2, border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 10, cursor: "pointer", fontFamily: COND }}>Change</button></div>
            ) : (
              <button onClick={setFeaturedImage} style={{ width: "100%", height: 80, border: "1px dashed " + Z.bd, borderRadius: 3, background: Z.sa, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: Z.tm, fontFamily: COND }}>+ Add Featured Image</button>
            )}
          </div>

          {/* Publications */}
          <ChipPicker label="Publications" options={pubs.map(p => ({ id: p.id, name: p.name, color: p.color }))} selected={selectedPubs} onChange={ids => { const newId = ids.find(id => !selectedPubs.includes(id)) || ids[0] || null; saveMeta("publication", newId); }} />

          {/* Author */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Author</div>
            <select value={meta.author || ""} onChange={e => { if (e.target.value === "__custom") { const name = prompt("Enter author name:"); if (name) saveMeta("author", name); } else saveMeta("author", e.target.value); }} style={{ width: "100%", padding: "6px 8px", borderRadius: 2, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 12, fontFamily: COND }}>
              <option value="">Select author...</option>
              {authors.map(a => <option key={a.id} value={a.name}>{(a.name || "").replace(/[\u2013\u2014]/g, "-")} ({a.is_freelance ? "Freelance" : "Staff"}{a.role ? ", " + a.role : ""})</option>)}
              {freelancers.map(f => <option key={f.id} value={f.name}>{f.name} (Freelance{f.specialty ? ", " + f.specialty : ""})</option>)}
              <option value="__custom">Other (type name)...</option>
            </select>
          </div>

          {/* Freelance Contributors */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND }}>Freelancers</div>
              <button onClick={() => {
                const name = prompt("Freelancer name:");
                if (!name) return;
                const specialty = prompt("Specialty (Writer, Photographer, etc.):");
                addFreelancer(name, specialty || "Writer");
              }} style={{ fontSize: 10, fontWeight: 700, color: Z.ac, background: "none", border: "none", cursor: "pointer", fontFamily: COND }}>+ Add</button>
            </div>
            {freelancers.length > 0 && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {freelancers.map(f => (
                  <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 2, fontSize: 10, fontFamily: COND, background: Z.sa, color: Z.tx, border: "1px solid " + Z.bd }}>
                    {f.name} <span style={{ color: Z.tm, fontSize: 9 }}>{f.specialty}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Category */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Category</div>
            <select value={meta.category_id || ""} onChange={e => { const cat = categories.find(c => c.id === e.target.value); saveMeta("category_id", e.target.value); if (cat) { saveMeta("category", cat.name); saveMeta("category_slug", cat.slug); } }} style={{ width: "100%", padding: "6px 8px", borderRadius: 2, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 12, fontFamily: COND }}>
              <option value="">Select category\u2026</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}{selectedPubs.length > 1 ? " (" + pn(c.publication_id, pubs) + ")" : ""}</option>)}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Priority</div><select value={meta.priority || "normal"} onChange={e => saveMeta("priority", e.target.value)} style={{ width: "100%", padding: "6px 8px", borderRadius: 2, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 12, fontFamily: COND }}>{PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></div>
            <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Type</div><select value={meta.story_type || "article"} onChange={e => saveMeta("story_type", e.target.value)} style={{ width: "100%", padding: "6px 8px", borderRadius: 2, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 12, fontFamily: COND }}>{STORY_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Source</div><select value={meta.source || ""} onChange={e => saveMeta("source", e.target.value || null)} style={{ width: "100%", padding: "6px 8px", borderRadius: 2, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 12, fontFamily: COND }}><option value="">{"\u2014"}</option>{SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
            <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Assigned To</div><select value={meta.assigned_to || ""} onChange={e => saveMeta("assigned_to", e.target.value || null)} style={{ width: "100%", padding: "6px 8px", borderRadius: 2, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 12, fontFamily: COND }}><option value="">Unassigned</option>{team.map(t => <option key={t.id} value={t.id}>{t.name} {"\u2014"} {t.role}</option>)}</select></div>
          </div>

          <Inp label="Due Date" type="date" value={meta.due_date || ""} onChange={v => saveMeta("due_date", v)} />

          {/* Print */}
          <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>Print</div>
            <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Print Issue</div><select value={meta.print_issue_id || ""} onChange={e => saveMeta("print_issue_id", e.target.value || null)} style={{ width: "100%", padding: "6px 8px", borderRadius: 2, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 12, fontFamily: COND }}><option value="">None</option>{filteredIssues.map(i => <option key={i.id} value={i.id}>{pn(i.pub_id || i.publicationId, pubs)} {"\u203a"} {i.label || new Date(i.date).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}</option>)}</select></div>
            <div style={{ marginTop: 6 }}><div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Print Status</div><select value={meta.print_status || "none"} onChange={e => saveMeta("print_status", e.target.value)} style={{ width: "100%", padding: "6px 8px", borderRadius: 2, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 12, fontFamily: COND }}>{PRINT_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
          </div>

          {/* SEO */}
          <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>SEO</div>
            <Inp label="SEO Title" value={meta.seo_title || ""} onChange={v => setMeta(m => ({ ...m, seo_title: v }))} onBlur={() => saveMeta("seo_title", meta.seo_title)} />
            <div style={{ marginTop: 6 }}><TA label="SEO Description" value={meta.seo_description || ""} onChange={v => setMeta(m => ({ ...m, seo_description: v }))} onBlur={() => saveMeta("seo_description", meta.seo_description)} rows={2} /></div>
            <Inp label="Slug" value={meta.slug || ""} onChange={v => setMeta(m => ({ ...m, slug: v }))} onBlur={() => saveMeta("slug", meta.slug)} />
          </div>

          <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}><TA label="Correction Note (visible to readers)" value={meta.correction_note || ""} onChange={v => setMeta(m => ({ ...m, correction_note: v }))} onBlur={() => saveMeta("correction_note", meta.correction_note)} rows={2} /></div>
          <TA label="Internal Notes" value={meta.notes || ""} onChange={v => setMeta(m => ({ ...m, notes: v }))} onBlur={() => saveMeta("notes", meta.notes)} rows={3} />

          {activity.length > 0 && <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>Activity</div>
            {activity.slice(0, 8).map(a => <div key={a.id} style={{ fontSize: 10, color: Z.tm, fontFamily: COND, padding: "4px 0", borderBottom: "1px solid " + Z.bd + "22" }}><span style={{ fontWeight: 600 }}>{a.action.replace(/_/g, " ")}</span>{a.performed_by && <span> by {tn(a.performed_by, team)}</span>}<span style={{ float: "right", color: Z.td || Z.tm }}>{ago(a.created_at)}</span></div>)}
          </div>}
        </div>
      </div>

      {/* Modals */}
      <PreflightModal open={preflightOpen} onClose={() => setPreflightOpen(false)} onPublish={publishToWeb} checks={preflightChecks} />

      <Modal open={linkModalOpen} onClose={() => setLinkModalOpen(false)} title="Insert Link"><div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 360 }}><Inp label="URL" value={linkUrl} onChange={setLinkUrl} placeholder="https://\u2026" /><div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>{editor?.isActive("link") && <Btn sm v="secondary" onClick={() => { editor.chain().focus().unsetLink().run(); setLinkModalOpen(false); }}>Remove Link</Btn>}<Btn sm onClick={insertLink}>Insert Link</Btn></div></div></Modal>

      <Modal open={imageModalOpen} onClose={() => setImageModalOpen(false)} title="Add Image"><div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 360 }}>{pendingImageUrl && <img src={pendingImageUrl} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 3, background: Z.sa }} />}<Inp label="Caption (optional)" value={imageCaption} onChange={setImageCaption} placeholder="Photo credit or description\u2026" /><div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Btn sm v="secondary" onClick={() => setImageModalOpen(false)}>Cancel</Btn><Btn sm onClick={insertImage}>Insert Image</Btn></div></div></Modal>

      <style>{"\
        .tiptap { outline: none; }\
        .tiptap p { margin-bottom: 1em; }\
        .tiptap h1 { font-size: 1.8em; font-weight: bold; margin: 1.5em 0 0.5em; }\
        .tiptap h2 { font-size: 1.4em; font-weight: bold; margin: 1.3em 0 0.4em; }\
        .tiptap h3 { font-size: 1.15em; font-weight: bold; margin: 1.2em 0 0.3em; }\
        .tiptap ul, .tiptap ol { margin: 0.8em 0; padding-left: 1.5em; }\
        .tiptap ul { list-style: disc; } .tiptap ol { list-style: decimal; }\
        .tiptap li { margin-bottom: 0.4em; }\
        .tiptap blockquote { border-left: 3px solid " + Z.ac + "; padding-left: 16px; margin: 1.2em 0; color: " + Z.tm + "; font-style: italic; }\
        .tiptap a { color: " + Z.ac + "; text-decoration: underline; }\
        .tiptap hr { border: none; border-top: 1px solid " + Z.bd + "; margin: 2em 0; }\
        .tiptap .editor-image { max-width: 100%; border-radius: 4px; margin: 1.5em 0; }\
        .tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); float: left; color: " + Z.tm + "; pointer-events: none; height: 0; font-style: italic; }\
      "}</style>
    </div>
  );
};

export default StoryEditor;
