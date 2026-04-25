import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Gallery } from "../lib/tiptapGallery";
import EntityThread from "./EntityThread";
import { Z, SC, COND, DISPLAY, ACCENT, FS, Ri } from "../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, TB, Modal } from "./ui";
import FuzzyPicker from "./FuzzyPicker";
import { STORY_STATUSES } from "../constants";
import { supabase, EDGE_FN_URL } from "../lib/supabase";
import MediaModal from "./MediaModal";
import { useDialog } from "../hooks/useDialog";
import { uploadMedia } from "../lib/media";

// ── Constants ────────────────────────────────────────────────────
// Single-source status model: Draft → Edit → Ready → Approved.
// Destination flags (sent_to_web / sent_to_print) track where it shipped.
// Old stories live in the Editorial > Archive view (a date-based filter),
// not in an "Archived" status.
const WORKFLOW_STAGES = ["Draft", "Edit", "Ready", "Approved"];
const STAGE_TO_STATUS = { "Draft": "Draft", "Edit": "Edit", "Ready": "Ready", "Approved": "Approved" };
const STATUS_TO_STAGE = { Draft: "Draft", Edit: "Edit", Ready: "Ready", Approved: "Approved" };
const STORY_TYPES = [
  { key: "article", label: "Article" }, { key: "column", label: "Column" },
  { key: "letter", label: "Letter to Editor" }, { key: "obituary", label: "Obituary" },
  { key: "legal_notice", label: "Legal Notice" }, { key: "calendar_event", label: "Calendar Event" },
  { key: "press_release", label: "Press Release" }, { key: "opinion", label: "Opinion" },
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
  const res = await fetch(EDGE_FN_URL + "/upload-image", {
    method: "POST",
    headers: { "Authorization": "Bearer " + session.access_token, "x-upload-path": path || "uploads", "x-file-name": filename, "x-content-type": file.type || "image/jpeg" },
    body: file,
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Upload failed: " + res.status); }
  return (await res.json()).url;
}

// Title → URL-safe slug. NFD-normalizes so "Café" survives as "cafe"
// instead of being stripped to "caf"; collapses all non-alphanumeric
// runs to a single hyphen; trims leading/trailing hyphens; caps at
// 120 chars so Postgres / any index + display surface stays safe.
const slugify = (title) => (title || "")
  .toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 120);

// ── Toolbar components ───────────────────────────────────────────
const TBtn = ({ onClick, active, children, title }) => (
  <button onClick={onClick} title={title} style={{ padding: "4px 8px", border: "none", borderRadius: Ri, background: active ? Z.ac + "20" : "transparent", color: active ? Z.ac : Z.tm, cursor: "pointer", fontSize: FS.base, fontWeight: active ? 700 : 500, display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 28, height: 28 }}
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
        return <button key={o.id} onClick={() => onChange(on ? selected.filter(x => x !== o.id) : [...selected, o.id])} style={{ padding: "3px 8px", borderRadius: Ri, fontSize: 10, fontWeight: on ? 700 : 500, border: "none", background: on ? (o.color || Z.ac) + "18" : "transparent", color: on ? (o.color || Z.ac) : Z.tm, cursor: "pointer", fontFamily: COND }}>{o.name}</button>;
      })}
    </div>
  </div>
);

// ── Preflight Checklist Modal ────────────────────────────────────
const PreflightModal = ({ open, onClose, onPublish, checks, scheduledAt, onScheduleChange }) => {
  const allPassed = checks.every(c => c.pass);
  const isScheduled = !!scheduledAt;
  const fmtScheduled = scheduledAt ? new Date(scheduledAt).toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  return (
    <Modal open={open} onClose={onClose} title="Publish Preflight Check">
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 380 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {checks.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: Ri, background: c.pass ? (Z.su || "#22c55e") + "10" : Z.da + "10", border: "1px solid " + (c.pass ? (Z.su || "#22c55e") + "30" : Z.da + "30") }}>
              <span style={{ fontSize: 14 }}>{c.pass ? "\u2713" : "\u2717"}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: c.pass ? (Z.su || "#22c55e") : Z.da, fontFamily: COND }}>{c.label}</span>
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>Publish Date & Time</div>
          <input type="datetime-local" value={scheduledAt ? new Date(scheduledAt).toISOString().slice(0, 16) : ""} onChange={e => onScheduleChange(e.target.value ? new Date(e.target.value).toISOString() : null)} style={{ width: "100%", padding: "6px 8px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 11, fontFamily: COND }} />
          <div style={{ fontSize: 11, fontWeight: 600, color: isScheduled ? ACCENT.indigo : (Z.su || "#22c55e"), fontFamily: COND, marginTop: 4 }}>
            {isScheduled ? `Scheduled: ${fmtScheduled}` : "Immediately upon publish"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <Btn sm v="cancel" onClick={onClose}>Cancel</Btn>
          <Btn sm onClick={onPublish} disabled={!allPassed} style={!allPassed ? { opacity: 0.5, cursor: "not-allowed" } : {}}>
            <Ic.send size={11} /> {isScheduled ? "Schedule" : "Publish Now"}
          </Btn>
        </div>
        {!allPassed && <p style={{ fontSize: 10, color: Z.da, fontFamily: COND, margin: 0, textAlign: "right" }}>Fix required items before publishing</p>}
      </div>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════════
// LAYOUT HANDOFF PANEL — Anthony Phase 2 (G13)
// Camille's "Send to Anthony" affordance. Flips story to Ready +
// print_status to ready (if not already), then posts a team_notes
// ping with notes so Anthony's dashboard surfaces it as an Issue Ping.
// ══════════════════════════════════════════════════════════════════
function LayoutHandoffPanel({ story, meta, saveMeta, team, currentUser, dialog }) {
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [lastSentAt, setLastSentAt] = useState(null);

  // Find the active layout designer to ping. Production Manager falls
  // back if no Layout Designer is wired up. team comes in app-shape
  // so we filter by .role/.isActive (camelCase).
  const layoutDesigner = (team || []).find(t => t.role === "Layout Designer" && t.isActive !== false)
    || (team || []).find(t => t.role === "Production Manager" && t.isActive !== false);

  if (!layoutDesigner) {
    return (
      <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Layout Handoff</div>
        <div style={{ fontSize: 11, color: Z.td, fontStyle: "italic" }}>No Layout Designer assigned</div>
      </div>
    );
  }

  const send = async () => {
    if (sending) return;
    if (!meta.print_issue_id) {
      await dialog.alert("Set a Print Issue above first — Anthony needs to know which issue this is for.");
      return;
    }
    setSending(true);
    try {
      // 1. Flip status to Ready + print_status to ready if not yet
      if (meta.status !== "Ready" && meta.status !== "Approved") {
        await saveMeta("status", "Ready");
      }
      if (!meta.print_status || meta.print_status === "none") {
        await saveMeta("print_status", "ready");
      }

      // 2. Post a team_notes ping. context_type='story' so the
      // dashboard's Issue Pings tile (filtered to context_type=issue)
      // doesn't fire — but DirectionCard (no context filter) does.
      // The ping body includes the story title so Anthony has context.
      const message = notes.trim()
        ? `Layout: "${story.title || 'Untitled'}" ready — ${notes.trim()}`
        : `Layout: "${story.title || 'Untitled'}" is ready for you.`;
      await supabase.from("team_notes").insert({
        from_user: currentUser?.id || null,
        to_user: layoutDesigner.id,
        message,
        context_type: "story",
        context_id: story.id,
      });

      setLastSentAt(new Date().toISOString());
      setNotes("");
    } catch (err) {
      console.error("Send to Anthony failed:", err);
      await dialog.alert("Couldn't send: " + (err?.message || "unknown error"));
    }
    setSending(false);
  };

  const designerFirst = (layoutDesigner.name || "Layout Designer").split(" ")[0];

  return (
    <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND }}>Layout Handoff</div>
        {lastSentAt && <span style={{ fontSize: 10, color: Z.go, fontFamily: COND }}>✓ sent</span>}
      </div>
      <div style={{ fontSize: 11, color: Z.tm, marginBottom: 6 }}>
        Send to <span style={{ color: Z.tx, fontWeight: 600 }}>{layoutDesigner.name}</span>
      </div>
      <TA
        label={`Notes for ${designerFirst} (optional)`}
        value={notes}
        onChange={v => setNotes(v)}
        rows={3}
      />
      <Btn
        sm
        onClick={send}
        disabled={sending}
        style={{ width: "100%", marginTop: 6 }}
      >
        {sending ? "Sending…" : `Send to ${designerFirst}`}
      </Btn>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// STORY EDITOR
// ══════════════════════════════════════════════════════════════════
const StoryEditor = ({ story, onClose, onUpdate, pubs, issues, team, bus, currentUser, publishStory, unpublishStory }) => {
  const dialog = useDialog();
  const [meta, setMeta] = useState({ ...story });
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerMode, setMediaPickerMode] = useState("featured");
  const [socialPosts, setSocialPosts] = useState([]);
  const [socialLoading, setSocialLoading] = useState(true);
  const [imageCaption, setImageCaption] = useState("");
  const [pendingImageUrl, setPendingImageUrl] = useState("");
  const [activity, setActivity] = useState([]);
  const [categories, setCategories] = useState([]);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [webApproved, setWebApproved] = useState(!!story.web_approved);
  const [republishing, setRepublishing] = useState(false);
  const [republishedFlash, setRepublishedFlash] = useState(0); // timestamp, non-zero while flash is visible
  const [editingPubDate, setEditingPubDate] = useState(false);
  const [pubDateDraft, setPubDateDraft] = useState("");
  const [savingPubDate, setSavingPubDate] = useState(false);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [discussionCount, setDiscussionCount] = useState(null);
  // Story lock: who (if anyone) is already editing this story. Driven by
  // Supabase Realtime presence. When non-null + not me, render a blocking
  // modal so only one editor has the story open at a time.
  const [lockedBy, setLockedBy] = useState(null);
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
      .select("body, content_json, published_at, first_published_at, last_significant_edit_at, edit_count, correction_note, notes, web_status, web_approved, print_status, print_issue_id, priority, story_type, source, assigned_to, is_featured, is_premium, is_sponsored, sponsor_name, slug, seo_title, seo_description, excerpt, featured_image_url, featured_image_id, category_id, view_count, scheduled_at, created_at, submitted_at, edited_at, approved_for_web_at, editor_id, needs_legal_review, legal_reviewed_by, legal_reviewed_at, word_limit, audience")
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
  // Order by sort_order so the publication's intended ordering wins
  // (e.g. Featured first for magazines), falling back to alphabetical
  // for any category that shares a sort_order.
  useEffect(() => {
    if (!selectedPubs.length) { setCategories([]); return; }
    supabase.from("categories")
      .select("id, name, slug, publication_id, sort_order")
      .in("publication_id", selectedPubs)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name")
      .then(({ data }) => { if (data) setCategories(data); });
  }, [selectedPubs.join(",")]);

  // ── Story Library (images tagged with this story) ──────────
  // Designers pick the featured image by clicking one of these tiles;
  // they also drive the "Download Originals" bulk action. Re-queried
  // after each upload so the grid stays live.
  const [storyImages, setStoryImages] = useState([]);
  const loadStoryImages = useCallback(async () => {
    if (!story?.id) { setStoryImages([]); return; }
    const { data } = await supabase
      .from("media_assets")
      .select("id, cdn_url, original_url, thumbnail_url, file_name, created_at, width, height, caption, alt_text")
      .eq("story_id", story.id)
      .like("mime_type", "image/%")
      .order("created_at", { ascending: false });
    setStoryImages(data || []);
  }, [story?.id]);
  useEffect(() => { loadStoryImages(); }, [loadStoryImages]);

  // Persist a sidecar caption on a single image. Optimistic UI so the
  // input doesn't lag while the network round-trips. The caption travels
  // with the image to StellarPress sites via the same media_assets row.
  const saveImageCaption = useCallback(async (imageId, caption) => {
    setStoryImages(prev => prev.map(i => i.id === imageId ? { ...i, caption } : i));
    const { error } = await supabase.from("media_assets").update({ caption, updated_at: new Date().toISOString() }).eq("id", imageId);
    if (error) console.error("Caption save failed:", error.message);
  }, []);

  // ── Authors from team (editorial roles) ─────────────────────
  const authors = useMemo(() => {
    const roles = ["Publisher", "Editor-in-Chief", "Content Editor", "Writer", "Stringer", "Contributor"];
    // Only active team members — excludes archived / import-only byline rows
    // that were seeded to keep historical stories.author_id FKs valid.
    return team.filter(t => t.isActive !== false
      && !t.is_freelance
      && (roles.some(r => (t.role || "").includes(r)) || t.stellarpress_roles));
  }, [team]);

  // ── Freelance contributors ─────────────────────────────────
  // Only surface active freelancers; inactive/archived rows stay in the
  // DB to keep historical FKs valid but should not appear in the picker.
  const [freelancers, setFreelancers] = useState([]);
  useEffect(() => {
    supabase.from("team_members").select("id, name, role, is_freelance, specialty, is_active")
      .eq("is_freelance", true).eq("is_active", true).order("name")
      .then(({ data }) => { if (data) setFreelancers(data); });
  }, []);

  const addFreelancer = async (name, specialty) => {
    const newMember = { name, role: specialty, is_freelance: true, specialty, created_at: new Date().toISOString() };
    const { data } = await supabase.from("team_members").insert(newMember).select().single();
    if (data) setFreelancers(prev => [...prev, data]);
  };

  // ── Smart issue filter: +/-30 days, scoped to THIS story's pub ──
  // An issue only belongs in the selector if it matches the story's
  // publication. useAppData maps issues to { pubId } (camelCase) and
  // stories to { publication } — check both keys on each side so the
  // filter survives either shape.
  const filteredIssues = useMemo(() => {
    const now = new Date(), min = new Date(now), max = new Date(now);
    min.setDate(min.getDate() - 30); max.setDate(max.getDate() + 30);
    const storyPub = selectedPubs[0] || null;
    if (!storyPub) return [];
    return (issues || []).filter(i => {
      if (i.sentToPressAt || i.sentToPress) return false;
      const issuePub = i.pubId || i.pub_id || i.publicationId;
      if (issuePub !== storyPub) return false;
      const d = new Date(i.date || i.deadline);
      return d >= min && d <= max;
    }).sort((a, b) => {
      return new Date(a.date || a.deadline) - new Date(b.date || b.deadline);
    });
  }, [issues, selectedPubs]);

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
      // Inline style on every emitted <img> caps height at 500px and lets
      // width auto-scale to maintain aspect ratio. Inline so the constraint
      // travels with the HTML — no dependency on the consumer (StellarPress
      // or otherwise) shipping matching CSS, and survives any sanitizer
      // that strips classes but allows style.
      Image.configure({ HTMLAttributes: { class: "editor-image", style: "max-height:500px;width:auto;max-width:100%" }, allowBase64: false }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Start writing your story\u2026" }),
      Underline, TextAlign.configure({ types: ["heading", "paragraph"] }),
      Gallery,
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

  // ── Social media posts ──────────────────────────────────────
  useEffect(() => {
    if (!story.id) return;
    supabase.from("social_posts").select("*").eq("story_id", story.id)
      .then(({ data }) => { setSocialPosts(data || []); setSocialLoading(false); });
    const ch = supabase.channel(`social-${story.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "social_posts", filter: `story_id=eq.${story.id}` },
        (payload) => setSocialPosts(prev => prev.some(p => p.id === payload.new.id) ? prev : [...prev, payload.new]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [story.id]);

  // ── Story lock (single-editor presence channel) ────────────
  // Uses Supabase Realtime presence: each StoryEditor mount joins
  // `story-lock-${storyId}` and tracks its user. On sync we compare
  // joinedAt timestamps — the earliest joiner owns the lock; anyone
  // who arrives later sees a blocking modal and can only back out.
  //
  // Automatic cleanup: closing the tab / navigating away / network
  // drop evicts the presence row (~30s heartbeat timeout), so the
  // lock releases without manual intervention.
  useEffect(() => {
    if (!story?.id) return;
    // Resolve a stable identity for this session. Prefer the passed-in
    // currentUser; fall back to the signed-in auth user so we never
    // register an anonymous lock that nobody can break.
    let cancelled = false;
    let channel;
    const joinedAt = Date.now();
    (async () => {
      let me = currentUser;
      if (!me?.id) {
        const { data } = await supabase.auth.getUser();
        const authUser = data?.user;
        const teamRow = authUser?.email && Array.isArray(team)
          ? team.find(t => (t.email || "").toLowerCase() === authUser.email.toLowerCase())
          : null;
        me = {
          id: teamRow?.id || authUser?.id || `anon-${joinedAt}`,
          name: teamRow?.name || authUser?.user_metadata?.name || authUser?.email || "Unknown",
        };
      }
      if (cancelled) return;
      const key = me.id;
      channel = supabase.channel(`story-lock-${story.id}`, {
        config: { presence: { key } },
      });
      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        // Flatten — presenceState returns { key: [ {…meta} ] }.
        const everyone = Object.values(state).flat();
        if (everyone.length <= 1) { setLockedBy(null); return; }
        // Earliest joiner owns the lock; ties broken by user id.
        const winner = everyone.slice().sort((a, b) =>
          (a.joinedAt - b.joinedAt) || (a.userId || "").localeCompare(b.userId || "")
        )[0];
        if (!winner || winner.userId === me.id) { setLockedBy(null); return; }
        setLockedBy({ userId: winner.userId, userName: winner.userName || "another editor", joinedAt: winner.joinedAt });
      });
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ userId: me.id, userName: me.name || "Editor", joinedAt });
        }
      });
    })();
    return () => {
      cancelled = true;
      try { if (channel) { channel.untrack(); supabase.removeChannel(channel); } } catch (_) {}
    };
  }, [story?.id, currentUser?.id, team]);

  // ── Auto-save content ───────────────────────────────────────
  const autoSave = useCallback(async (cj, pt) => {
    setSaving(true);
    const wc = pt.trim() ? pt.trim().split(/\s+/).length : 0;
    const now = new Date().toISOString();
    const u = { content_json: cj, word_count: wc, updated_at: now };
    if (editor) u.body = editor.getHTML();
    // Stamp last_significant_edit_at on every content write after the story
    // has gone live. That's what drives the "Unpublished Changes" badge —
    // republish clears this field so the badge disappears until the next
    // real edit.
    if (meta.published_at) u.last_significant_edit_at = now;
    const { error } = await supabase.from("stories").update(u).eq("id", story.id);
    if (!error) { setLastSaved(new Date()); onUpdate(story.id, u); setMeta(m => ({ ...m, ...u })); }
    setSaving(false);
  }, [story.id, editor, onUpdate, meta.published_at]);

  // ── Publication date editing ───────────────────────────────
  // Editors can override the original publish date — useful for
  // backdating imported stories or correcting an incorrect auto-stamp.
  // We write both published_at (the field StellarPress sorts on) and
  // first_published_at (the displayed "Published" date) to keep them
  // aligned as a single source of truth.
  const openPubDateEdit = () => {
    const existing = meta.first_published_at || meta.published_at;
    if (existing) {
      const d = new Date(existing);
      const pad = n => String(n).padStart(2, "0");
      setPubDateDraft(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    } else {
      setPubDateDraft("");
    }
    setEditingPubDate(true);
  };

  const savePubDate = async () => {
    if (!pubDateDraft) { setEditingPubDate(false); return; }
    const parsed = new Date(pubDateDraft);
    if (isNaN(parsed.getTime())) { setEditingPubDate(false); return; }
    setSavingPubDate(true);
    const iso = parsed.toISOString();
    const u = {
      published_at: iso,
      first_published_at: iso,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("stories").update(u).eq("id", story.id);
    setSavingPubDate(false);
    if (!error) {
      setMeta(m => ({ ...m, ...u }));
      onUpdate(story.id, u);
      setLastSaved(new Date());
      setEditingPubDate(false);
      if (bus) bus.emit("notification.add", { text: '"' + (meta.title || "Untitled") + '" publish date updated', route: "editorial" });
    } else {
      console.error("Pub date update failed:", error);
      if (bus) bus.emit("notification.add", { text: "Publish date update failed: " + error.message, route: "editorial" });
    }
  };

  // ── Save metadata ───────────────────────────────────────────
  const saveMeta = useCallback(async (field, value) => {
    // FIX #3: Map frontend camelCase to DB snake_case for publication
    const dbField = field === "publication" ? "publication_id" : field;
    const u = { [dbField]: value, updated_at: new Date().toISOString() };
    // Keep the legacy `issue_id` column in sync with `print_issue_id`.
    // The Story Planner anchors strictly on print_issue_id, but legacy
    // consumers (and the planner sidebar count) still read issue_id —
    // letting them drift produces ghost stories under the wrong issue.
    if (dbField === "print_issue_id") u.issue_id = value;
    setMeta(m => ({ ...m, [field]: value, [dbField]: value, ...(dbField === "print_issue_id" ? { issue_id: value, issueId: value } : {}) }));
    const { error } = await supabase.from("stories").update(u).eq("id", story.id);
    if (!error) {
      const propagate = dbField === "print_issue_id" ? { [field]: value, issue_id: value, issueId: value } : { [field]: value };
      onUpdate(story.id, propagate);
      setLastSaved(new Date());
    }
  }, [story.id, onUpdate]);

  // ── FIX #4: Preflight check before publish ──────────────────
  const preflightChecks = useMemo(() => {
    const hasTitle = !!(meta.title && meta.title.trim() && meta.title !== "New Story");
    const hasBody = !!(editor && editor.getText().trim().length > 20);
    const hasCategory = !!(meta.category || meta.category_id);
    const hasFeaturedImage = !!meta.featured_image_url;
    const legalOk = !meta.needs_legal_review || !!meta.legal_reviewed_at;
    const checks = [
      { label: "Title is set", pass: hasTitle },
      { label: "Body has content (20+ characters)", pass: hasBody },
      { label: "Category is selected", pass: hasCategory },
      { label: "Featured image is set", pass: hasFeaturedImage },
    ];
    if (meta.needs_legal_review) checks.push({ label: "Legal review signed off", pass: legalOk, blocking: true });
    return checks;
  }, [meta, editor]);

  const handlePublishClick = () => setPreflightOpen(true);

  const publishToWeb = async () => {
    setPreflightOpen(false);
    // Single-source model: Ready + sent_to_web=true is "live on web".
    // The sync trigger will mirror sent_to_web into the legacy
    // web_status column for any StellarPress consumer still reading it.
    //
    // Preserve any existing published_at (re-publish after an unpublish
    // should stay chronologically where it was) and stamp
    // first_published_at on the true first publish only.
    const now = new Date().toISOString();
    const u = {
      status: "Ready",
      sent_to_web: true,
      published_at: meta.published_at || now,
      first_published_at: meta.first_published_at || meta.published_at || now,
      updated_at: now,
    };
    // Always derive slug from title on first publish (slug is the URL
    // path). If an editor manually set one, preserve it; otherwise
    // generate from the current title so publishing isn't gated on a
    // separate slug-entry step.
    if (!meta.slug || !meta.slug.trim()) u.slug = slugify(meta.title) || "untitled";
    if (!meta.excerpt && editor) u.excerpt = editor.getText().slice(0, 300);
    // Grab the latest editor state synchronously so a click before the
    // 2s autoSave debounce fires still publishes the content the user
    // actually sees. Without this the first publish could land with a
    // stale (or empty) body on StellarPress.
    if (editor) { u.body = editor.getHTML(); u.content_json = editor.getJSON(); }
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
  // Preserve the original published_at so the story stays in its
  // chronological slot on StellarPress (sorted by published_at DESC).
  // CLEAR last_significant_edit_at so the "Unpublished Changes" badge
  // disappears — next edit will re-stamp it and flip the badge back on.
  const republishToWeb = async () => {
    setRepublishing(true);
    const now = new Date().toISOString();
    const u = {
      web_status: "published",
      last_significant_edit_at: null,
      updated_at: now,
    };
    if (editor) { u.body = editor.getHTML(); u.content_json = editor.getJSON(); }
    const { error } = await supabase.from("stories").update(u).eq("id", story.id);
    setRepublishing(false);
    if (!error) {
      setMeta(m => ({ ...m, ...u }));
      onUpdate(story.id, u);
      setLastSaved(new Date());
      setRepublishedFlash(Date.now());
      setTimeout(() => setRepublishedFlash(0), 2500);
      if (bus) bus.emit("notification.add", { text: '"' + (meta.title || "Untitled") + '" republished to web', route: "editorial" });
    } else {
      console.error("Republish failed:", error);
      if (bus) bus.emit("notification.add", { text: "Republish failed: " + error.message, route: "editorial" });
    }
  };

  // ── Image upload ────────────────────────────────────────────
  const handleImageUpload = async (file) => {
    if (!file) return;
    if (!selectedPubs[0]) {
      await dialog.alert("Please choose a publication first.");
      return;
    }
    setImageUploading(true);
    try {
      const row = await uploadMedia(file, {
        category: meta.story_type === "obituary" ? "obituary" : "story_image",
        storyType: meta.story_type || "article",
        storyId: story?.id || null,
        publicationId: selectedPubs[0],
      });
      setPendingImageUrl(row.cdn_url); setImageCaption(""); setImageModalOpen(true);
      loadStoryImages();
    } catch (err) { console.error("Image upload failed:", err); await dialog.alert("Image upload failed: " + err.message); }
    setImageUploading(false);
  };

  const insertImage = () => {
    if (!pendingImageUrl || !editor) return;
    editor.chain().focus().setImage({ src: pendingImageUrl, alt: imageCaption || "", title: imageCaption || "" }).run();
    if (imageCaption) editor.chain().focus().createParagraphNear().insertContent('<em style="font-size:14px;color:#6b7280;">' + imageCaption + "</em>").run();
    setImageModalOpen(false); setPendingImageUrl(""); setImageCaption("");
  };

  // Upload one or more files to the Story Library. Enforces the pub
  // guard up front so we don't hit uploadMedia with a failing state.
  const uploadToStoryLibrary = async (files) => {
    const list = Array.from(files || []).filter(f => f.type?.startsWith("image/"));
    if (!list.length) return;
    if (!selectedPubs[0]) {
      await dialog.alert("Please choose a publication first.");
      return;
    }
    setImageUploading(true);
    try {
      for (const f of list) {
        await uploadMedia(f, {
          category: meta.story_type === "obituary" ? "obituary" : "story_image",
          storyType: meta.story_type || "article",
          storyId: story?.id || null,
          publicationId: selectedPubs[0],
        });
      }
      await loadStoryImages();
    } catch (err) {
      await dialog.alert("Upload failed: " + err.message);
    }
    setImageUploading(false);
  };

  const pickStoryLibraryUpload = () => {
    if (!selectedPubs[0]) {
      dialog.alert("Please choose a publication first.");
      return;
    }
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*"; inp.multiple = true;
    inp.onchange = (e) => uploadToStoryLibrary(e.target.files);
    inp.click();
  };

  // Media Library picker — re-uses the existing MediaModal (mediaPickerMode
  // already supports "featured" / "inline" / "gallery"). New "story" mode
  // attaches the chosen asset to this story_id without creating a
  // duplicate upload on BunnyCDN. Caption + alt_text travel with the row.
  const openLibraryForStory = async () => {
    if (!selectedPubs[0]) {
      await dialog.alert("Please choose a publication first.");
      return;
    }
    setMediaPickerMode("story");
    setMediaPickerOpen(true);
  };
  // Attach a Media-Library pick to this story.
  //   - asset.id present  → update media_assets.story_id (one-line patch).
  //   - asset.id missing  → legacy Bunny-only item with no DB row;
  //     INSERT a fresh media_assets row tagged with this story so it
  //     shows up in the Story Library grid like any other upload.
  // Either path must surface errors — silent return left the user
  // staring at a closed modal with nothing happening.
  const attachAssetToStory = async (asset) => {
    if (!story?.id) {
      await dialog.alert("Save the story first, then attach an image.");
      return;
    }
    if (!asset?.url) {
      console.warn("attachAssetToStory: missing asset url", asset);
      await dialog.alert("Couldn't attach: no image URL on the picked asset.");
      return;
    }
    if (asset.id) {
      const { error } = await supabase.from("media_assets")
        .update({ story_id: story.id, updated_at: new Date().toISOString() })
        .eq("id", asset.id);
      if (error) {
        console.error("attachAssetToStory update failed:", error);
        await dialog.alert("Attach failed: " + error.message);
        return;
      }
    } else {
      // Legacy Bunny-only item — make a fresh media_assets row pointing
      // at the same URL so it joins the Story Library on next reload.
      const { error } = await supabase.from("media_assets").insert({
        story_id: story.id,
        publication_id: selectedPubs[0] || null,
        cdn_url: asset.url,
        file_url: asset.url,
        file_name: asset.fileName || asset.url.split("/").pop() || "image",
        mime_type: "image/jpeg",
        category: meta.story_type === "obituary" ? "obituary" : "story_image",
        caption: asset.caption || null,
        alt_text: asset.alt || null,
      });
      if (error) {
        console.error("attachAssetToStory insert failed:", error);
        await dialog.alert("Attach failed: " + error.message);
        return;
      }
    }
    await loadStoryImages();
  };

  const setAsFeatured = async (img) => {
    await saveMeta("featured_image_url", img.cdn_url);
    if (img.id) await saveMeta("featured_image_id", img.id);
  };

  // Bundle all originals + a captions.docx into a single zip so the
  // production team gets one click → file with the captions paired up.
  // Lazy-load the bundler so the docx/jszip code only ships when used.
  const [downloadingOriginals, setDownloadingOriginals] = useState(false);
  const downloadOriginals = async () => {
    if (!storyImages.length) return;
    setDownloadingOriginals(true);
    try {
      const { downloadStoryImagesBundle } = await import("../lib/storyImagesBundle");
      await downloadStoryImagesBundle({
        storyTitle: meta.title || story?.title || "story",
        images: storyImages.map(img => ({
          url: img.original_url || img.cdn_url,
          file_name: img.file_name || "image",
          caption: img.caption || "",
        })),
      });
    } catch (err) {
      console.error("Download Originals failed:", err);
      await dialog.alert("Download failed: " + (err?.message || err));
    } finally {
      setDownloadingOriginals(false);
    }
  };

  const insertLink = () => { if (!linkUrl || !editor) return; editor.chain().focus().setLink({ href: linkUrl.startsWith("http") ? linkUrl : "https://" + linkUrl }).run(); setLinkModalOpen(false); setLinkUrl(""); };

  const wordCount = editor ? (editor.getText().trim() ? editor.getText().trim().split(/\s+/).length : 0) : 0;
  const needsRepublish = meta.published_at && meta.last_significant_edit_at && new Date(meta.last_significant_edit_at) > new Date(meta.published_at);
  const currentStage = getStage(meta.status);
  const isPublished = !!(meta.sent_to_web || meta.sentToWeb || meta.sent_to_print || meta.sentToPrint);

  useEffect(() => { return () => { if (saveTimer.current) clearTimeout(saveTimer.current); }; }, []);

  if (contentLoading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: Z.tm, fontFamily: COND }}>Loading story content\u2026</div>;
  if (!editor) return null;

  // ── Story-lock blocking modal ──────────────────────────────
  // If another editor got here first, don't render the editor at
  // all — show a full-screen notice with a single exit affordance.
  if (lockedBy) {
    const since = lockedBy.joinedAt ? new Date(lockedBy.joinedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: Z.bg, padding: 24 }}>
        <div style={{ maxWidth: 460, textAlign: "center", background: Z.sf, border: "1px solid " + Z.bd, borderRadius: R, padding: 32, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>\ud83d\udd12</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: Z.tx, fontFamily: DISPLAY }}>Story is open elsewhere</h2>
          <p style={{ margin: "0 0 20px", fontSize: 14, color: Z.tm, fontFamily: COND, lineHeight: 1.5 }}>
            <strong style={{ color: Z.tx }}>{lockedBy.userName}</strong> is editing "{meta.title || "this story"}"{since ? ` since ${since}` : ""}. Only one editor can have a story open at a time to avoid conflicting saves.
          </p>
          <Btn onClick={onClose} style={{ width: "100%" }}>Back to Editorial</Btn>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: Z.bg }}>
      {/* Top Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", borderBottom: "1px solid " + Z.bd, background: Z.sf, flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontFamily: COND, fontWeight: 600 }}>{"\u2190"} Back to Editorial</button>
        <TSep />
        <span style={{ fontSize: FS.base, fontWeight: 700, color: Z.tx, fontFamily: COND, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta.title || "Untitled Story"}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {saving && <span style={{ fontSize: 10, color: Z.tm, fontFamily: COND }}>Saving\u2026</span>}
          {!saving && lastSaved && <span style={{ fontSize: 10, color: Z.su || "#22c55e", fontFamily: COND }}>{"\u2713"} Saved {ago(lastSaved)}</span>}
          {imageUploading && <span style={{ fontSize: 10, color: Z.wa, fontFamily: COND }}>Uploading\u2026</span>}
          <Badge status={meta.status || "Draft"} small />
          {meta.is_featured && <span style={{ fontSize: FS.micro, fontWeight: 700, padding: "2px 6px", borderRadius: Ri, background: Z.wa + "18", color: Z.wa }}>{"\u2605"} Featured</span>}
          {isPublished && !needsRepublish && !republishedFlash && <span style={{ fontSize: FS.micro, fontWeight: 700, padding: "2px 6px", borderRadius: Ri, background: ACCENT.green + "18", color: ACCENT.green }}>Live</span>}
          {republishedFlash > 0 && <span style={{ fontSize: FS.micro, fontWeight: 700, padding: "2px 6px", borderRadius: Ri, background: ACCENT.green + "22", color: ACCENT.green }}>{"\u2713"} Republished</span>}
          {needsRepublish && !republishedFlash && <Btn sm onClick={republishToWeb} disabled={republishing} style={{ background: Z.wa + "18", color: Z.wa, border: "1px solid " + Z.wa + "40" }}>{republishing ? "Republishing\u2026" : "\u21bb Republish"}</Btn>}
          {/* Web Preview pill — renders the story body in a reader-view modal */}
          <Btn sm v="secondary" onClick={() => setPreviewOpen(true)} title="Preview how this story will render on the web">{"👁"} Preview</Btn>
          {/* Discussion dropdown — top-bar pill + popover below */}
          {story?.id && (
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setDiscussionOpen(o => !o)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "4px 10px", borderRadius: Ri,
                  border: "1px solid " + Z.bd,
                  background: discussionOpen ? Z.ac + "18" : Z.sa,
                  color: discussionOpen ? Z.ac : Z.tx,
                  fontSize: 12, fontFamily: COND, fontWeight: 600, cursor: "pointer",
                }}
                title="Open thread"
              >
                <Ic.chat size={13} />
                <span>Discussion</span>
                {discussionCount > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: Z.tm }}>{"\u00b7"} {discussionCount}</span>
                )}
                <span style={{ fontSize: 10, color: Z.tm, marginLeft: 2 }}>{discussionOpen ? "\u25be" : "\u25bf"}</span>
              </button>
              {discussionOpen && (
                <>
                  {/* click-away backdrop */}
                  <div onClick={() => setDiscussionOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 90, background: "transparent" }} />
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0,
                    width: 440, maxWidth: "90vw", zIndex: 91,
                    background: Z.sf, border: "1px solid " + Z.bd, borderRadius: 8,
                    boxShadow: "0 18px 48px rgba(0,0,0,0.35)", overflow: "hidden",
                  }}>
                    <EntityThread
                      refType="story"
                      refId={story.id}
                      title={`Story: ${meta.title || "Untitled"}`}
                      participants={[meta.assigned_to, meta.editor_id].filter(Boolean)}
                      team={team}
                      headerless
                      height={420}
                      onMsgCount={setDiscussionCount}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left: Editor */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "20px 32px 0" }}>
            <input value={meta.title || ""} onChange={e => setMeta(m => ({ ...m, title: e.target.value }))} onBlur={e => saveMeta("title", e.target.value)} placeholder="Story title\u2026" style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 28, fontWeight: 800, color: Z.tx, fontFamily: DISPLAY, lineHeight: 1.2, padding: 0, marginBottom: 8 }} />
            <div style={{ fontSize: 11, color: Z.tm, fontFamily: COND, marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
              {selectedPubs.map(pid => <span key={pid} style={{ color: pColor(pid, pubs) }}>{pn(pid, pubs)}</span>)}
              <span>{"\u00b7"}</span><span>{meta.author || "No author"}</span><span>{"\u00b7"}</span><span>{meta.category || "Uncategorized"}</span><span>{"\u00b7"}</span><span style={{ color: meta.word_limit && wordCount > meta.word_limit ? Z.da : undefined, fontWeight: meta.word_limit && wordCount > meta.word_limit ? 700 : undefined }}>{wordCount.toLocaleString()}{meta.word_limit ? ` / ${meta.word_limit.toLocaleString()}` : ""} words</span>
              {meta.word_limit && wordCount > meta.word_limit && <span style={{ color: Z.da, fontWeight: 700 }}>{"\u26a0"} Over by {(wordCount - meta.word_limit).toLocaleString()}</span>}
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
            <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullets"><Ic.listBul size={16} /></TBtn>
            <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered list"><Ic.listOl size={16} /></TBtn>
            <TBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Quote"><Ic.quote size={16} /></TBtn>
            <TSep />
            <TBtn onClick={() => { setLinkUrl(editor.getAttributes("link").href || ""); setLinkModalOpen(true); }} active={editor.isActive("link")} title="Link"><Ic.link size={16} /></TBtn>
            <TBtn onClick={() => fileInput.current?.click()} title="Upload Image"><Ic.up size={16} /></TBtn>
            <TBtn onClick={() => { setMediaPickerMode("inline"); setMediaPickerOpen(true); }} title="From Library"><Ic.image size={16} /></TBtn>
            <TBtn onClick={() => { setMediaPickerMode("gallery"); setMediaPickerOpen(true); }} title="Insert Gallery"><Ic.flat size={16} /></TBtn>
            <TBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider"><Ic.divider size={16} /></TBtn>
            <TSep />
            <TBtn onClick={() => editor.chain().focus().undo().run()} title="Undo"><Ic.undo size={16} /></TBtn>
            <TBtn onClick={() => editor.chain().focus().redo().run()} title="Redo"><Ic.redo size={16} /></TBtn>
            <input ref={fileInput} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleImageUpload(e.target.files[0]); e.target.value = ""; }} />
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px 64px" }}><EditorContent editor={editor} /></div>
        </div>

        {/* Right: Metadata */}
        <div style={{ width: 320, flexShrink: 0, borderLeft: "1px solid " + Z.bd, background: Z.sf, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* FIX #1: Published/Updated dates — editable for editors */}
          {isPublished && (
            <div style={{ background: Z.bg, borderRadius: Ri, padding: 10, border: "1px solid " + Z.bd }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND }}>Publication Dates</span>
                {!editingPubDate && (meta.first_published_at || meta.published_at) && (
                  <button onClick={openPubDateEdit} title="Change the original publish date" style={{ background: "none", border: "none", cursor: "pointer", color: Z.ac, fontSize: 10, fontFamily: COND, fontWeight: 700, padding: 0 }}>Edit</button>
                )}
              </div>
              {editingPubDate ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input
                    type="datetime-local"
                    value={pubDateDraft}
                    onChange={e => setPubDateDraft(e.target.value)}
                    style={{ padding: "4px 6px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 11, fontFamily: COND }}
                  />
                  <div style={{ fontSize: 9, color: Z.tm, fontFamily: COND }}>Controls the story's chronological slot on the public site.</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn sm onClick={savePubDate} disabled={savingPubDate || !pubDateDraft} style={{ flex: 1 }}>{savingPubDate ? "Saving…" : "Save Date"}</Btn>
                    <Btn sm v="cancel" onClick={() => setEditingPubDate(false)} disabled={savingPubDate}>Cancel</Btn>
                  </div>
                </div>
              ) : (
                <>
                  {meta.first_published_at && <div style={{ fontSize: 11, color: Z.tx, fontFamily: COND }}>Published: <strong>{fmtDate(meta.first_published_at)}</strong></div>}
                  {!meta.first_published_at && meta.published_at && <div style={{ fontSize: 11, color: Z.tx, fontFamily: COND }}>Published: <strong>{fmtDate(meta.published_at)}</strong></div>}
                  {/* Slug is locked once set on first publish — the URL path is permanent so editors can see it but not change it. */}
                  {meta.slug && <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND, marginTop: 4, wordBreak: "break-all" }} title="URL slug — set automatically on first publish, cannot be changed">Slug: <code style={{ background: Z.sa, padding: "1px 4px", borderRadius: 2, color: Z.tx }}>{meta.slug}</code></div>}
                  {meta.last_significant_edit_at && <div style={{ fontSize: 11, color: Z.tx, fontFamily: COND, marginTop: 2 }}>Updated: <strong>{fmtDate(meta.last_significant_edit_at)}</strong></div>}
                  {meta.edit_count > 0 && <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND, marginTop: 2 }}>{meta.edit_count} edit{meta.edit_count > 1 ? "s" : ""} since first publish</div>}
                </>
              )}
            </div>
          )}

          {/* Status — standard pill selector */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>Status</div>
            <TB tabs={STORY_STATUSES.map(s => s === "Approved"
              ? { value: "Approved", label: <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Ic.check size={13} color={meta.status === "Approved" ? "#fff" : (Z.su || "#22c55e")} /> Approved</span> }
              : s
            )} active={meta.status || "Draft"} onChange={v => saveMeta("status", v)} />
            {isPublished && <div style={{ fontSize: 10, fontWeight: 700, color: Z.su || "#22c55e", fontFamily: COND, marginTop: 4 }}>{"\u2713"} Published</div>}
          </div>

          {/* Web Approval + Publish / Featured */}
          <div style={{ background: Z.bg, borderRadius: Ri, padding: 10, border: "1px solid " + Z.bd }}>
            {isPublished && !needsRepublish ? (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: Z.su || "#22c55e", fontFamily: COND, marginBottom: 6 }}>
                  {republishedFlash > 0 ? "\u2713 Republished just now" : "\u2713 Live on Web"}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn sm onClick={republishToWeb} disabled={republishing} style={{ flex: 1 }}>{republishing ? "Republishing\u2026" : "\u21bb Update Live"}</Btn>
                  <Btn sm v="secondary" onClick={async () => { if (unpublishStory) { await unpublishStory(story.id); setMeta(m => ({ ...m, status: "Ready", sent_to_web: false })); onUpdate(story.id, { status: "Ready", sent_to_web: false }); } }} style={{ flex: 1, color: Z.da, borderColor: Z.da + "40" }}>Unpublish</Btn>
                </div>
              </div>
            ) : needsRepublish ? (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: Z.wa, fontFamily: COND, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>{"\u26a0"} Unpublished Changes</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn sm onClick={republishToWeb} disabled={republishing} style={{ flex: 1, background: Z.wa + "18", color: Z.wa, border: "1px solid " + Z.wa + "40" }}>{republishing ? "Republishing\u2026" : "\u21bb Republish"}</Btn>
                  <Btn sm v="secondary" onClick={async () => { if (unpublishStory) { await unpublishStory(story.id); setMeta(m => ({ ...m, status: "Ready", sent_to_web: false })); onUpdate(story.id, { status: "Ready", sent_to_web: false }); } }} style={{ flex: 1, color: Z.da, borderColor: Z.da + "40" }}>Unpublish</Btn>
                </div>
              </div>
            ) : currentStage === "Ready" && !webApproved ? (
              <Btn sm onClick={async () => { setWebApproved(true); await saveMeta("web_approved", true); }} style={{ width: "100%", background: ACCENT.blue + "20", color: ACCENT.blue, border: "1px solid " + ACCENT.blue + "40" }}>{"\u2713"} Approve for Web</Btn>
            ) : webApproved || isPublished ? (
              <Btn sm onClick={handlePublishClick} style={{ width: "100%" }}><Ic.send size={11} /> Publish to Web</Btn>
            ) : (
              <div style={{ fontSize: 11, color: Z.tm, fontFamily: COND, textAlign: "center", padding: 4 }}>Set status to Ready and approve before publishing</div>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, cursor: "pointer", fontSize: 11, fontFamily: COND, color: Z.tx }}>
              <input type="checkbox" checked={!!meta.is_featured} onChange={e => saveMeta("is_featured", e.target.checked)} style={{ accentColor: Z.wa }} />
              <span style={{ fontWeight: 600 }}>{"\u2605"} Featured Article</span><span style={{ fontSize: FS.micro, color: Z.tm }}>(hero)</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, cursor: "pointer", fontSize: 11, fontFamily: COND, color: Z.tx }}>
              <input type="checkbox" checked={!!meta.is_premium} onChange={e => saveMeta("is_premium", e.target.checked)} style={{ accentColor: ACCENT.indigo }} />
              <span style={{ fontWeight: 600 }}>{"\ud83d\udd12"} Premium</span><span style={{ fontSize: FS.micro, color: Z.tm }}>(paywall)</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, cursor: "pointer", fontSize: 11, fontFamily: COND, color: Z.tx }}>
              <input type="checkbox" checked={!!meta.is_sponsored} onChange={e => saveMeta("is_sponsored", e.target.checked)} style={{ accentColor: Z.wa }} />
              <span style={{ fontWeight: 600 }}>Sponsored</span>
            </label>
            {meta.is_sponsored && (
              <input value={meta.sponsor_name || ""} onChange={e => setMeta(m => ({ ...m, sponsor_name: e.target.value }))} onBlur={e => saveMeta("sponsor_name", e.target.value)} placeholder="Sponsor name..." style={{ width: "100%", padding: "4px 8px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 11, fontFamily: COND, marginTop: 2 }} />
            )}
          </div>

          {/* Scheduled indicator (set via preflight) */}
          {!isPublished && meta.scheduled_at && (
            <div style={{ fontSize: 10, color: ACCENT.indigo, fontFamily: COND, padding: "6px 8px", background: ACCENT.indigo + "10", borderRadius: Ri, border: "1px solid " + ACCENT.indigo + "30" }}>
              Scheduled: {fmtDate(meta.scheduled_at)}
            </div>
          )}

          {/* View on site — only render when the publication has a real
              website configured. Previously this fell back to turning
              the publication name into a fake slug-as-domain (e.g.
              'calabasas-style-magazine' with no TLD) which generated
              broken links. Now: no website_url, no link. */}
          {isPublished && meta.slug && selectedPubs[0] && (() => {
            const site = (pubs || []).find(p => p.id === selectedPubs[0]);
            if (!site?.hasWebsite) return null;
            const raw = (site.websiteUrl || "").trim();
            if (!raw) return null;
            // Normalize: strip protocol + trailing slash so we can
            // safely prepend https:// regardless of what the publisher
            // entered.
            const host = raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
            if (!host.includes(".")) return null; // still looks like a slug, refuse
            const href = `https://${host}/${meta.slug}`;
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: "block", padding: "6px 10px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sa, textAlign: "center", fontSize: 11, fontWeight: 600, color: Z.ac, fontFamily: COND, textDecoration: "none" }}>
                View on {host} {"\u2197"}
              </a>
            );
          })()}

          {/* View count */}
          {meta.view_count > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: Z.sa, borderRadius: Ri }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND }}>Views</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: Z.tx, fontFamily: DISPLAY }}>{(meta.view_count || 0).toLocaleString()}</span>
            </div>
          )}

          {/* Featured image (preview only — picked by clicking a tile below). */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND }}>Featured Image</div>
              {meta.featured_image_url && (
                <button onClick={() => { saveMeta("featured_image_url", null); saveMeta("featured_image_id", null); }} style={{ background: "none", border: "none", color: Z.da, fontSize: 10, cursor: "pointer", fontFamily: COND, fontWeight: 700 }}>Clear</button>
              )}
            </div>
            {meta.featured_image_url ? (
              <img src={meta.featured_image_url} alt="" style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: Ri, border: "1px solid " + Z.bd }} />
            ) : (
              <div style={{ width: "100%", height: 80, border: "1px dashed " + Z.bd, borderRadius: Ri, background: Z.sa, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: Z.tm, fontFamily: COND, textAlign: "center", padding: "0 12px" }}>
                Click a Story Library tile below to set featured
              </div>
            )}
          </div>

          {/* Story Library — all images uploaded to this story. Click a
              tile to promote it to featured. Designers pull originals
              via "Download Originals" for print layout. */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND }}>Story Library · {storyImages.length}</div>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={openLibraryForStory}
                  disabled={imageUploading}
                  style={{ padding: "3px 8px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sf, color: Z.tx, fontSize: 10, fontWeight: 700, fontFamily: COND, cursor: imageUploading ? "default" : "pointer", opacity: imageUploading ? 0.6 : 1 }}
                  title="Pick existing image from this publication's media library"
                >
                  + From Library
                </button>
                <button
                  onClick={pickStoryLibraryUpload}
                  disabled={imageUploading}
                  style={{ padding: "3px 10px", borderRadius: Ri, border: "none", background: Z.ac, color: "#fff", fontSize: 10, fontWeight: 700, fontFamily: COND, cursor: imageUploading ? "default" : "pointer", opacity: imageUploading ? 0.6 : 1 }}
                >
                  {imageUploading ? "Uploading…" : "+ Upload"}
                </button>
              </div>
            </div>
            {storyImages.length === 0 ? (
              <div style={{ width: "100%", padding: "16px 12px", border: "1px dashed " + Z.bd, borderRadius: Ri, background: Z.sa, fontSize: 11, color: Z.tm, fontFamily: COND, textAlign: "center" }}>
                No images yet. Upload above or pick from the library.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {storyImages.map(img => {
                  const isFeatured = meta.featured_image_url === img.cdn_url;
                  return (
                    <div key={img.id} style={{ display: "flex", flexDirection: "column", gap: 3, padding: 4, border: isFeatured ? `2px solid ${Z.ac}` : `1px solid ${Z.bd}`, borderRadius: Ri, background: Z.sa }}>
                      <button
                        onClick={() => setAsFeatured(img)}
                        title={isFeatured ? "Currently featured" : "Click to set as featured"}
                        style={{ position: "relative", padding: 0, border: "none", background: "none", cursor: "pointer", overflow: "hidden", borderRadius: Ri, height: 90 }}
                      >
                        <img src={img.thumbnail_url || img.cdn_url} alt={img.caption || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: Ri }} />
                        {isFeatured && (
                          <div style={{ position: "absolute", top: 2, right: 2, background: Z.ac, color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: Ri, fontFamily: COND }}>★ Featured</div>
                        )}
                      </button>
                      {/* Sidecar caption — saved on blur to media_assets.caption.
                          Travels with the image to StellarPress so it lands as
                          the figcaption on the published article. */}
                      <input
                        defaultValue={img.caption || ""}
                        placeholder="Caption (sent to site as figcaption)"
                        onBlur={(e) => {
                          const next = e.target.value;
                          if ((img.caption || "") !== next) saveImageCaption(img.id, next);
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                        style={{ width: "100%", padding: "4px 6px", border: `1px solid ${Z.bd}`, borderRadius: Ri, background: Z.bg, color: Z.tx, fontSize: 11, fontFamily: COND, outline: "none", boxSizing: "border-box" }}
                      />
                      <div style={{ fontSize: 9, color: Z.td, fontFamily: COND, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={img.file_name}>{img.file_name}</div>
                    </div>
                  );
                })}
              </div>
            )}
            {storyImages.length > 0 && (
              <button
                onClick={downloadOriginals}
                disabled={downloadingOriginals}
                style={{ marginTop: 6, width: "100%", padding: "5px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sa, color: Z.tx, fontSize: 10, fontWeight: 700, fontFamily: COND, cursor: downloadingOriginals ? "default" : "pointer", opacity: downloadingOriginals ? 0.6 : 1 }}
              >
                {downloadingOriginals ? "Downloading…" : `↓ Download Originals (${storyImages.length})`}
              </button>
            )}
          </div>

          {/* Publication */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Publication</div>
            <select value={selectedPubs[0] || ""} onChange={e => saveMeta("publication", e.target.value || null)} style={{ width: "100%", padding: "6px 8px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 12, fontFamily: COND }}>
              <option value="">Select publication...</option>
              {pubs.filter(p => p.type !== "Special Publication").map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Author */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Author</div>
            {(() => {
              const opts = [];
              const seen = new Set();
              authors.forEach(a => {
                opts.push({ value: a.name, label: (a.name || "").replace(/[\u2013\u2014]/g, "-"), sub: a.is_freelance ? "Freelance" : (a.role || "Staff") });
                seen.add(a.name);
              });
              freelancers.forEach(f => {
                if (!seen.has(f.name)) {
                  opts.push({ value: f.name, label: f.name, sub: "Freelance" + (f.specialty ? " \u00b7 " + f.specialty : "") });
                  seen.add(f.name);
                }
              });
              if (meta.author && !seen.has(meta.author)) {
                opts.unshift({ value: meta.author, label: meta.author, sub: "inactive" });
              }
              return (
                <div style={{ display: "flex", gap: 4, alignItems: "stretch" }}>
                  <div style={{ flex: 1 }}>
                    <FuzzyPicker
                      value={meta.author || ""}
                      onChange={(v) => saveMeta("author", v)}
                      options={opts}
                      placeholder="Search author\u2026"
                      emptyLabel="No author"
                      size="sm"
                    />
                  </div>
                  <button
                    type="button"
                    title="Type a custom byline (freelancer, syndicated, etc.)"
                    onClick={async () => { const name = await dialog.prompt("Enter author name:"); if (name) saveMeta("author", name); }}
                    style={{ padding: "0 10px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sa, color: Z.tm, fontSize: 12, cursor: "pointer", fontFamily: COND, flexShrink: 0 }}
                  >+ Custom</button>
                </div>
              );
            })()}
          </div>

          {/* Freelance Contributors */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND }}>Freelancers</div>
              <button onClick={async () => {
                const name = await dialog.prompt("Freelancer name:");
                if (!name) return;
                const specialty = await dialog.prompt("Specialty (Writer, Photographer, etc.):");
                addFreelancer(name, specialty || "Writer");
              }} style={{ fontSize: 10, fontWeight: 700, color: Z.ac, background: "none", border: "none", cursor: "pointer", fontFamily: COND }}>+ Add</button>
            </div>
            {freelancers.length > 0 && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {freelancers.map(f => (
                  <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: Ri, fontSize: 10, fontFamily: COND, background: Z.sa, color: Z.tx, border: "1px solid " + Z.bd }}>
                    {f.name} <span style={{ color: Z.tm, fontSize: FS.micro }}>{f.specialty}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Category */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Category</div>
            <select value={meta.category_id || ""} onChange={e => { const cat = categories.find(c => c.id === e.target.value); saveMeta("category_id", e.target.value); if (cat) { saveMeta("category", cat.name); saveMeta("category_slug", cat.slug); } }} style={{ width: "100%", padding: "6px 8px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 12, fontFamily: COND }}>
              <option value="">Select category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Audience: Public stories appear on the website; Internal KB
               articles never publish — they're searchable by the team and
               readable by MyHelper. Defaults to Public. */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Audience</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[["public", "Public"], ["internal", "Internal Knowledge Base"]].map(([v, l]) => {
                const sel = (meta.audience || "public") === v;
                return <button key={v} onClick={() => saveMeta("audience", v)} style={{ flex: 1, padding: "6px 12px", borderRadius: Ri, border: `1px solid ${sel ? Z.ac : Z.bd}`, background: sel ? Z.ac + "15" : "transparent", color: sel ? Z.ac : Z.tm, cursor: "pointer", fontSize: 12, fontWeight: sel ? 700 : 600, fontFamily: COND }}>{l}</button>;
              })}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Type</div><select value={meta.story_type || "article"} onChange={e => saveMeta("story_type", e.target.value)} style={{ width: "100%", padding: "6px 8px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 12, fontFamily: COND }}>{STORY_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
            <div><div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Assigned To</div><select value={meta.assigned_to || ""} onChange={e => saveMeta("assigned_to", e.target.value || null)} style={{ width: "100%", padding: "6px 8px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 12, fontFamily: COND }}><option value="">Unassigned</option>{team.map(t => <option key={t.id} value={t.id}>{t.name} {"\u2014"} {t.role}</option>)}</select></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Inp label="Due Date" type="date" value={meta.due_date || ""} onChange={v => saveMeta("due_date", v)} />
            <div>
              <Inp label="Word Limit" type="number" value={meta.word_limit || ""} onChange={v => saveMeta("word_limit", v ? Number(v) : null)} placeholder="No limit" />
              {meta.word_limit && wordCount > meta.word_limit && <div style={{ fontSize: 10, color: Z.da, fontWeight: 700, fontFamily: COND, marginTop: 2 }}>{"\u26a0"} {wordCount - meta.word_limit} over limit</div>}
            </div>
          </div>

          {/* Print Issue */}
          <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Print Issue</div>
            <select value={meta.print_issue_id || ""} onChange={e => saveMeta("print_issue_id", e.target.value || null)} style={{ width: "100%", padding: "6px 8px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 12, fontFamily: COND }}><option value="">None</option>{filteredIssues.map(i => <option key={i.id} value={i.id}>{i.label || new Date(i.date).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}</option>)}</select>
          </div>

          {/* Layout Handoff — Anthony Phase 2 G13 fix. Camille uses
              this to send a story to Anthony explicitly: flips status
              + print_status if needed, AND posts a team_notes ping
              with optional notes ("Cut to 600 words. Photo by Sarah is
              the lede.") so Anthony sees it on his dashboard. */}
          <LayoutHandoffPanel
            story={story}
            meta={meta}
            saveMeta={saveMeta}
            team={team}
            currentUser={currentUser}
            dialog={dialog}
          />

          {/* SEO */}
          <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>SEO</div>
            <div>
              <Inp label="SEO Title" value={meta.seo_title || ""} onChange={v => setMeta(m => ({ ...m, seo_title: v }))} onBlur={() => saveMeta("seo_title", meta.seo_title)} />
              <div style={{ fontSize: FS.micro, color: (meta.seo_title || "").length >= 50 && (meta.seo_title || "").length <= 60 ? (Z.su || "#22c55e") : Z.tm, fontFamily: COND, textAlign: "right" }}>{(meta.seo_title || "").length}/60</div>
            </div>
            <div style={{ marginTop: 4 }}>
              <TA label="SEO Description" value={meta.seo_description || ""} onChange={v => setMeta(m => ({ ...m, seo_description: v }))} onBlur={() => saveMeta("seo_description", meta.seo_description)} rows={2} />
              <div style={{ fontSize: FS.micro, color: (meta.seo_description || "").length >= 150 && (meta.seo_description || "").length <= 160 ? (Z.su || "#22c55e") : Z.tm, fontFamily: COND, textAlign: "right" }}>{(meta.seo_description || "").length}/160</div>
            </div>
            <Inp label="Slug" value={meta.slug || ""} onChange={v => setMeta(m => ({ ...m, slug: v }))} onBlur={() => saveMeta("slug", meta.slug)} />
            {/* Google search preview */}
            <div style={{ marginTop: 8, padding: 10, background: Z.bg, borderRadius: Ri, border: "1px solid " + Z.bd }}>
              <div style={{ fontSize: FS.micro, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>Search Preview</div>
              {/* SEO preview colors (Google standard) */}
              <div style={{ fontSize: 14, color: "#1a0dab", fontFamily: "arial, sans-serif", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta.seo_title || meta.title || "Page Title"}</div>
              <div style={{ fontSize: 11, color: "#006621", fontFamily: "arial, sans-serif", marginTop: 2 }}>{selectedPubs[0] && pn(selectedPubs[0], pubs).toLowerCase().replace(/\s+/g, "") + ".com"}/{meta.slug || "article-slug"}</div>
              <div style={{ fontSize: 11, color: "#545454", fontFamily: "arial, sans-serif", marginTop: 2, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{meta.seo_description || meta.excerpt || "No description set"}</div>
            </div>
          </div>

          {/* Legal Review */}
          <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: meta.needs_legal_review ? Z.wa : Z.tm, fontFamily: COND, cursor: "pointer" }}>
                <input type="checkbox" checked={!!meta.needs_legal_review} onChange={e => { saveMeta("needs_legal_review", e.target.checked); if (!e.target.checked) { saveMeta("legal_reviewed_by", null); saveMeta("legal_reviewed_at", null); } }} style={{ accentColor: Z.wa }} />
                Needs Legal Review
              </label>
              {meta.needs_legal_review && !meta.legal_reviewed_at && (
                <Btn sm v="secondary" onClick={() => { const now = new Date().toISOString(); saveMeta("legal_reviewed_by", story.editor_id || null); saveMeta("legal_reviewed_at", now); setMeta(m => ({ ...m, legal_reviewed_by: story.editor_id || null, legal_reviewed_at: now })); }} style={{ fontSize: 10, padding: "2px 8px" }}>Sign Off</Btn>
              )}
            </div>
            {meta.needs_legal_review && meta.legal_reviewed_at && (
              <div style={{ fontSize: 10, color: Z.su, fontFamily: COND, marginTop: 4 }}>Legal reviewed {new Date(meta.legal_reviewed_at).toLocaleDateString()}</div>
            )}
            {meta.needs_legal_review && !meta.legal_reviewed_at && (
              <div style={{ fontSize: 10, color: Z.wa, fontFamily: COND, marginTop: 4 }}>Awaiting legal sign-off</div>
            )}
          </div>

          <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}><TA label="Correction Note (visible to readers)" value={meta.correction_note || ""} onChange={v => setMeta(m => ({ ...m, correction_note: v }))} onBlur={() => saveMeta("correction_note", meta.correction_note)} rows={2} /></div>
          <TA label="Internal Notes" value={meta.notes || ""} onChange={v => setMeta(m => ({ ...m, notes: v }))} onBlur={() => saveMeta("notes", meta.notes)} rows={3} />

          {/* Delete story */}
          <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
            <Btn sm v="danger" style={{ width: "100%" }} onClick={async () => {
              if (!await dialog.confirm("Are you sure you want to delete this story? This cannot be undone.")) return;
              const { error } = await supabase.from("stories").delete().eq("id", story.id);
              if (error) { await dialog.alert("Delete failed: " + error.message); return; }
              onUpdate(story.id, { _deleted: true }); onClose();
            }}>Delete Story</Btn>
          </div>

          {/* Audit timestamps */}
          <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>Timeline</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, fontFamily: COND, color: Z.tm }}>
              {meta.created_at && <div>Created: <span style={{ color: Z.tx, fontWeight: 600 }}>{fmtDate(meta.created_at)}</span></div>}
              {meta.submitted_at && <div>Submitted: <span style={{ color: Z.tx, fontWeight: 600 }}>{fmtDate(meta.submitted_at)}</span></div>}
              {meta.edited_at && <div>Edited: <span style={{ color: Z.tx, fontWeight: 600 }}>{fmtDate(meta.edited_at)}</span></div>}
              {meta.approved_for_web_at && <div>Web approved: <span style={{ color: Z.tx, fontWeight: 600 }}>{fmtDate(meta.approved_for_web_at)}</span></div>}
              {meta.first_published_at && <div>First published: <span style={{ color: Z.tx, fontWeight: 600 }}>{fmtDate(meta.first_published_at)}</span></div>}
              {meta.last_significant_edit_at && <div>Last major edit: <span style={{ color: Z.tx, fontWeight: 600 }}>{fmtDate(meta.last_significant_edit_at)}</span></div>}
              {meta.edit_count > 0 && <div>Total edits: <span style={{ color: Z.tx, fontWeight: 600 }}>{meta.edit_count}</span></div>}
            </div>
          </div>

          {/* Social Media Posts — only show once editorial is Ready */}
          {meta.status === "Ready" && (() => {
            const PLATFORMS = { facebook: { label: "Facebook", limit: 500, color: "#1877F2" }, instagram: { label: "Instagram", limit: 2200, color: "#E4405F" }, x: { label: "X", limit: 280, color: Z.tx } };
            if (socialLoading) return <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10, fontSize: FS.sm, color: Z.td }}>Loading social posts...</div>;
            return <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>Social Media</div>
              {socialPosts.length === 0 ? <div style={{ fontSize: FS.sm, color: Z.td, fontStyle: "italic" }}>Social posts will be generated when this story is approved.</div>
              : socialPosts.map(p => {
                const plat = PLATFORMS[p.platform] || { label: p.platform, limit: 500, color: Z.tm };
                const overLimit = (p.post_text || "").length > plat.limit;
                return <div key={p.id} style={{ marginBottom: 10, padding: 8, background: Z.bg, borderRadius: Ri, border: "1px solid " + Z.bd }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: plat.color }}>{plat.label}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: p.status === "approved" ? Z.go : p.status === "posted" ? Z.go : Z.td, background: (p.status === "approved" || p.status === "posted" ? Z.go : Z.td) + "15", padding: "1px 6px", borderRadius: Ri }}>{p.status}</span>
                  </div>
                  <textarea value={p.post_text || ""} onChange={e => {
                    const val = e.target.value;
                    setSocialPosts(prev => prev.map(sp => sp.id === p.id ? { ...sp, post_text: val } : sp));
                  }} onBlur={() => { supabase.from("social_posts").update({ post_text: p.post_text, updated_at: new Date().toISOString() }).eq("id", p.id); }}
                    rows={3} style={{ width: "100%", padding: "6px 8px", borderRadius: Ri, border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx, fontSize: 12, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: overLimit ? Z.da : Z.td }}>{(p.post_text || "").length}/{plat.limit}</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {p.status === "draft" && <Btn sm v="secondary" onClick={async () => { await supabase.from("social_posts").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", p.id); setSocialPosts(prev => prev.map(sp => sp.id === p.id ? { ...sp, status: "approved" } : sp)); }}>Approve</Btn>}
                      {(p.status === "draft" || p.status === "approved") && <Btn sm onClick={async () => { await supabase.from("social_posts").update({ status: "posted", posted_at: new Date().toISOString() }).eq("id", p.id); setSocialPosts(prev => prev.map(sp => sp.id === p.id ? { ...sp, status: "posted" } : sp)); }}>Post</Btn>}
                    </div>
                  </div>
                </div>;
              })}
            </div>;
          })()}


          {activity.length > 0 && <div style={{ borderTop: "1px solid " + Z.bd, paddingTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm, fontFamily: COND, marginBottom: 6 }}>Activity</div>
            {activity.slice(0, 8).map(a => <div key={a.id} style={{ fontSize: 10, color: Z.tm, fontFamily: COND, padding: "4px 0", borderBottom: "1px solid " + Z.bd + "22" }}><span style={{ fontWeight: 600 }}>{a.action.replace(/_/g, " ")}</span>{a.performed_by && <span> by {tn(a.performed_by, team)}</span>}<span style={{ float: "right", color: Z.td || Z.tm }}>{ago(a.created_at)}</span></div>)}
          </div>}
        </div>
      </div>

      {/* Modals */}
      <PreflightModal open={preflightOpen} onClose={() => setPreflightOpen(false)} onPublish={publishToWeb} checks={preflightChecks} scheduledAt={meta.scheduled_at} onScheduleChange={v => { saveMeta("scheduled_at", v); setMeta(m => ({ ...m, scheduled_at: v })); }} />

      {/* Web preview modal — renders the current editor HTML in an
          article-shaped container so editors see what readers will
          see before they click Publish / Republish. Reads the live
          editor state, not the persisted body, so unsaved changes
          preview correctly. */}
      {previewOpen && (
        <div onClick={() => setPreviewOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px", overflowY: "auto" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 760, background: "#fff", color: "#111318", borderRadius: 8, boxShadow: "0 30px 80px rgba(0,0,0,0.4)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#6b7280", letterSpacing: "0.1em", textTransform: "uppercase" }}>Web Preview</span>
              <button onClick={() => setPreviewOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 22, lineHeight: 1 }}>×</button>
            </div>
            <article style={{ padding: "32px 48px 48px", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 18, lineHeight: 1.7, color: "#111318" }}>
              {meta.featured_image_url && (
                <img src={meta.featured_image_url} alt="" style={{ width: "100%", maxHeight: 420, objectFit: "cover", borderRadius: 4, marginBottom: 24 }} />
              )}
              <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                {(pubs.find(p => p.id === (meta.publication_id || meta.publication))?.name) || "Publication"}
                {meta.category ? <> · <span style={{ color: "#2563eb" }}>{meta.category}</span></> : null}
              </div>
              <h1 style={{ fontFamily: "Georgia, serif", fontSize: 34, lineHeight: 1.2, fontWeight: 800, margin: "0 0 12px", color: "#111318" }}>{meta.title || "(untitled)"}</h1>
              {meta.excerpt && <p style={{ fontSize: 17, color: "#525e72", fontStyle: "italic", margin: "0 0 20px", lineHeight: 1.55 }}>{meta.excerpt}</p>}
              <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
                By <strong style={{ color: "#111318" }}>{meta.author || "No author"}</strong>
                {meta.first_published_at && <> · {new Date(meta.first_published_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</>}
              </div>
              <div
                className="tiptap"
                dangerouslySetInnerHTML={{ __html: editor?.getHTML() || "" }}
                style={{ fontSize: 18, lineHeight: 1.7 }}
              />
            </article>
          </div>
        </div>
      )}

      <Modal open={linkModalOpen} onClose={() => setLinkModalOpen(false)} title="Insert Link"><div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 360 }}><Inp label="URL" value={linkUrl} onChange={setLinkUrl} placeholder="https://\u2026" /><div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>{editor?.isActive("link") && <Btn sm v="secondary" onClick={() => { editor.chain().focus().unsetLink().run(); setLinkModalOpen(false); }}>Remove Link</Btn>}<Btn sm onClick={insertLink}>Insert Link</Btn></div></div></Modal>

      <Modal open={imageModalOpen} onClose={() => setImageModalOpen(false)} title="Add Image"><div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 360 }}>{pendingImageUrl && <img src={pendingImageUrl} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: Ri, background: Z.sa }} />}<Inp label="Caption (optional)" value={imageCaption} onChange={setImageCaption} placeholder="Photo credit or description\u2026" /><div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Btn sm v="cancel" onClick={() => setImageModalOpen(false)}>Cancel</Btn><Btn sm onClick={insertImage}>Insert Image</Btn></div></div></Modal>

      <MediaModal
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        pubs={pubs}
        pubFilter={selectedPubs[0] || undefined}
        multi={mediaPickerMode === "gallery"}
        onSelect={(media) => {
          if (mediaPickerMode === "featured") {
            saveMeta("featured_image_url", media.url);
            if (media.id) saveMeta("featured_image_id", media.id);
          } else if (mediaPickerMode === "story") {
            attachAssetToStory(media);
          } else {
            if (editor) editor.chain().focus().setImage({ src: media.url, alt: media.alt || "", title: media.caption || "" }).run();
          }
        }}
        onSelectMulti={(assets) => {
          if (!editor || !assets?.length) return;
          editor.chain().focus().insertGallery({
            images: assets.map(a => ({ url: a.url, alt: a.alt || "", caption: a.caption || "" })),
            columns: 3,
          }).run();
        }}
      />

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
        .tiptap .editor-image { max-width: 100%; max-height: 500px; width: auto; height: auto; border-radius: 4px; margin: 1.5em 0; }\
        .tiptap .story-gallery { display: grid; gap: 6px; margin: 1.5em 0; grid-template-columns: repeat(3, 1fr); }\
        .tiptap .story-gallery[data-columns='2'] { grid-template-columns: repeat(2, 1fr); }\
        .tiptap .story-gallery[data-columns='4'] { grid-template-columns: repeat(4, 1fr); }\
        .tiptap .story-gallery a { display: block; overflow: hidden; border-radius: 4px; position: relative; cursor: zoom-in; }\
        .tiptap .story-gallery img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; display: block; margin: 0; }\
        .tiptap .story-gallery.ProseMirror-selectednode { outline: 2px solid " + Z.ac + "; outline-offset: 2px; }\
        .tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); float: left; color: " + Z.tm + "; pointer-events: none; height: 0; font-style: italic; }\
      "}</style>
    </div>
  );
};

export default StoryEditor;
