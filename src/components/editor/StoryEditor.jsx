import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Gallery } from "../../lib/tiptapGallery";
import { Figure, Figcaption } from "../../lib/tiptapFigure";
import EntityThread from "../EntityThread";
import EditorialChecker from "../EditorialChecker";
import { Z, SC, COND, DISPLAY, ACCENT, FS, Ri } from "../../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, TB, Modal } from "../ui";
import FuzzyPicker from "../FuzzyPicker";
import { STORY_STATUSES } from "../../constants";
import { supabase, EDGE_FN_URL } from "../../lib/supabase";
import MediaModal from "../MediaModal";
import { useDialog } from "../../hooks/useDialog";
import { uploadMedia } from "../../lib/media";
import { formatInTimezone, parseFromTimezone, getBrowserTimezone, tzShortLabel, fmtInTimezone } from "../../lib/timezone";
import { useSaveStatus } from "../../hooks/useSaveStatus";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";

import { WORKFLOW_STAGES, STORY_TYPES } from "./StoryEditor.constants";
import { pn, pColor, tn, ago, getStage, fmtDate, slugify } from "./StoryEditor.helpers";
import PreflightModal from "./PreflightModal";
import LayoutHandoffPanel from "./LayoutHandoffPanel";
import WebPreviewModal from "./WebPreviewModal";
import StoryEditorSidebar from "./StoryEditorSidebar";
import StoryEditorTopBar from "./StoryEditorTopBar";
import StoryEditorToolbar from "./StoryEditorToolbar";
import StoryEditorBody from "./StoryEditorBody";
import LoadingSkeleton from "./LoadingSkeleton";
import "./StoryEditor.css";

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


// ══════════════════════════════════════════════════════════════════
// STORY EDITOR
// ══════════════════════════════════════════════════════════════════
const StoryEditor = ({ story, onClose, onUpdate, onDraftCreated, onOpenStory, pubs, issues, team, bus, currentUser, publishStory, unpublishStory }) => {
  const dialog = useDialog();
  const [meta, setMeta] = useState({ ...story });
  // Wave-1 hardening: a single status object replaces the scattered
  // saving/lastSaved booleans so every save site flows through one
  // place that can also surface errors and offer retry.
  const save = useSaveStatus();
  // Per-file upload tracking. Map<id, { progress, abortController, fileName }>.
  // Drives the progress strip in the right sidebar.
  const [uploads, setUploads] = useState(new Map());
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerMode, setMediaPickerMode] = useState("featured");
  const [imageCaption, setImageCaption] = useState("");
  const [pendingImageUrl, setPendingImageUrl] = useState("");
  const [activity, setActivity] = useState([]);
  const [categories, setCategories] = useState([]);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [webApproved, setWebApproved] = useState(!!story.web_approved);
  const [republishing, setRepublishing] = useState(false);
  const [republishedFlash, setRepublishedFlash] = useState(0); // timestamp, non-zero while flash is visible
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
  // Optimistic-concurrency guard. Holds the most recent updated_at the
  // server is known to have for this row; every save uses this as a
  // .eq() filter and bumps the ref to the new value it just wrote. A
  // mismatch (PGRST116) means another writer (or another tab) got
  // there first — we refetch and warn the user instead of silently
  // overwriting. Initialized when the full row loads in the mount fetch.
  const lastUpdatedAtRef = useRef(null);
  // Captured for Wave-3 admin Break Lock: re-track ourselves with
  // joinedAt=0 so we win the earliest-joiner tiebreaker
  // deterministically. The other tab (if alive) sees itself flip to
  // the loser side on its next sync.
  const lockChannelRef = useRef(null);
  const lockMeRef = useRef(null);

  // ── FIX #3: Use 'publication' (camelCase from useAppData) ───
  const selectedPubs = useMemo(() => {
    const pid = meta.publication_id || meta.publication;
    return Array.isArray(pid) ? pid : pid ? [pid] : [];
  }, [meta.publication_id, meta.publication]);

  // The owning publication object — used by the publish-scheduler picker
  // and the post-publish pub-date editor so both operate in the
  // publication's editorial timezone, not the editor's browser zone.
  const publication = useMemo(
    () => pubs.find(p => p.id === (meta.publication_id || meta.publication)),
    [pubs, meta.publication_id, meta.publication]
  );
  const publicationTz = publication?.timezone || "America/Los_Angeles";

  // ── FIX #5: Fetch full content (body + content_json) on mount ──
  useEffect(() => {
    if (!story.id) { setContentLoading(false); return; }
    supabase.from("stories")
      .select("body, content_json, published_at, first_published_at, last_significant_edit_at, edit_count, correction_note, notes, web_status, web_approved, print_status, print_issue_id, priority, story_type, source, assigned_to, is_featured, is_premium, is_sponsored, sponsor_name, slug, seo_title, seo_description, excerpt, featured_image_url, featured_image_id, category_id, view_count, scheduled_at, created_at, submitted_at, edited_at, approved_for_web_at, editor_id, needs_legal_review, legal_reviewed_by, legal_reviewed_at, word_limit, audience, updated_at")
      .eq("id", story.id).single()
      .then(({ data }) => {
        if (data) {
          setFullContent(data);
          setMeta(m => ({ ...m, ...data }));
          if (data.web_approved) setWebApproved(true);
          // Seed the optimistic-concurrency guard with the freshly
          // fetched server timestamp.
          lastUpdatedAtRef.current = data.updated_at || story.updated_at || null;
        }
        setContentLoading(false);
      });
  }, [story.id]);

  // ── Load categories for selected publications ───────────────
  // Order by sort_order so the publication's intended ordering wins
  // (e.g. Featured first for magazines), falling back to alphabetical
  // for any category that shares a sort_order.
  // Stable-key guard: stringify the array so React effect equality
  // doesn't trigger on every parent render (the .join(",") variant
  // worked but mis-typed the dep — eslint-react-hooks treats it as a
  // computed expression, not a value).
  const selectedPubsKey = useMemo(() => JSON.stringify(selectedPubs), [selectedPubs]);
  useEffect(() => {
    if (!selectedPubs.length) { setCategories([]); return; }
    let alive = true;
    supabase.from("categories")
      .select("id, name, slug, publication_id, sort_order")
      .in("publication_id", selectedPubs)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name")
      .then(({ data }) => { if (alive && data) setCategories(data); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPubsKey]);

  // ── Story Library (images tagged with this story) ──────────
  // Designers pick the featured image by clicking one of these tiles;
  // they also drive the "Download Originals" bulk action. Re-queried
  // after each upload so the grid stays live.
  const [storyImages, setStoryImages] = useState([]);
  const storyId = story?.id;
  useEffect(() => {
    if (!storyId) { setStoryImages([]); return; }
    const controller = new AbortController();
    supabase.from("media_assets")
      .select("id, cdn_url, original_url, thumbnail_url, file_name, created_at, width, height, caption, alt_text")
      .eq("story_id", storyId)
      .like("mime_type", "image/%")
      .order("created_at", { ascending: false })
      .abortSignal(controller.signal)
      .then(({ data }) => { if (data) setStoryImages(data); });
    return () => controller.abort();
  }, [storyId]);
  // Manual refresh after uploads / attaches; the mount-time fetch handles initial load.
  const loadStoryImages = useCallback(async () => {
    if (!storyId) return;
    const { data } = await supabase.from("media_assets")
      .select("id, cdn_url, original_url, thumbnail_url, file_name, created_at, width, height, caption, alt_text")
      .eq("story_id", storyId)
      .like("mime_type", "image/%")
      .order("created_at", { ascending: false });
    if (data) setStoryImages(data);
  }, [storyId]);

  // Drop any pending debounced autoSave. Must be called inside any
  // flow that itself writes body/content_json (publish, republish,
  // content-replacing generators) so we don't get an out-of-order
  // overwrite ~2s after the user's action.
  const flushAutoSaveTimer = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  }, []);

  // Concurrency-guarded UPDATE on stories. Uses lastUpdatedAtRef as the
  // .eq() filter: if the row's updated_at has changed since we last
  // saw it, the update matches zero rows and we treat that as a
  // concurrent-edit signal — refetch, refresh local state, notify the
  // user. On success, bump the ref so the next save chains correctly.
  const updateStoryGuarded = useCallback(async (patch) => {
    const guard = lastUpdatedAtRef.current;
    let q = supabase.from("stories").update(patch).eq("id", story.id);
    if (guard) q = q.eq("updated_at", guard);
    const { data, error } = await q.select("updated_at").maybeSingle();
    if (error) throw error;
    if (!data) {
      const { data: fresh } = await supabase
        .from("stories")
        .select("body, content_json, status, web_status, sent_to_web, sent_to_print, updated_at, last_significant_edit_at, published_at, first_published_at, scheduled_at")
        .eq("id", story.id)
        .single();
      if (fresh) {
        setMeta(m => ({ ...m, ...fresh }));
        lastUpdatedAtRef.current = fresh.updated_at;
      }
      if (bus) bus.emit("notification.add", {
        text: "Story changed elsewhere — your last edit was not saved. Refresh to continue.",
        route: "editorial",
      });
      throw new Error("Concurrent edit detected — story was changed elsewhere.");
    }
    lastUpdatedAtRef.current = data.updated_at;
    return data;
  }, [story.id, bus]);

  // Per-file upload tracking helpers. Each upload registers an id +
  // AbortController; progress events tick the entry's fraction; the
  // sidebar strip renders one row per active upload with a Cancel.
  const startUpload = useCallback((file) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const abortController = new AbortController();
    setUploads(prev => {
      const next = new Map(prev);
      next.set(id, { progress: 0, abortController, fileName: file.name });
      return next;
    });
    return { id, abortController };
  }, []);

  const updateUpload = useCallback((id, patch) => {
    setUploads(prev => {
      const cur = prev.get(id);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(id, { ...cur, ...patch });
      return next;
    });
  }, []);

  const finishUpload = useCallback((id) => {
    setUploads(prev => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Persist a sidecar caption on a single image. Optimistic UI so the
  // input doesn't lag while the network round-trips. The caption travels
  // with the image to StellarPress sites via the same media_assets row.
  // Routed through save.track so a network blip surfaces the retry pill
  // instead of vanishing into console.error.
  const saveImageCaption = useCallback((imageId, caption) => {
    setStoryImages(prev => prev.map(i => i.id === imageId ? { ...i, caption } : i));
    const doSave = async () => {
      const { error } = await supabase.from("media_assets")
        .update({ caption, updated_at: new Date().toISOString() })
        .eq("id", imageId);
      if (error) throw error;
    };
    return save.track(doSave(), { retry: () => save.track(doSave()) });
  }, [save]);

  // ── Authors from team (editorial roles) ─────────────────────
  const authors = useMemo(() => {
    // Editorial-eligible roles per the team_role enum (mig 178/189).
    const roles = ["Publisher", "Support Admin", "Content Editor", "Stringer"];
    // Only active staff (people-unification: isFreelance derives from
    // labels[]; status drives isActive). Excludes archived / import-only
    // byline rows that were seeded to keep historical stories.author_id
    // FKs valid.
    return team.filter(t => t.isActive !== false
      && !t.isFreelance
      && (roles.some(r => (t.role || "").includes(r)) || t.stellarpress_roles));
  }, [team]);

  // ── Freelance contributors ─────────────────────────────────
  // Only surface active freelancers; inactive/archived rows stay in the
  // DB to keep historical FKs valid but should not appear in the picker.
  const [freelancers, setFreelancers] = useState([]);
  useEffect(() => {
    // people-unification: query the people table with the contractor
    // label (replaces is_freelance=true) and active status.
    supabase.from("people")
      .select("id, display_name, role, labels, specialty, status")
      .contains("labels", ["contractor"])
      .eq("status", "active")
      .order("display_name")
      .then(({ data }) => {
        if (data) setFreelancers(data.map(p => ({
          id: p.id,
          name: p.display_name,
          role: p.role,
          specialty: p.specialty,
          is_freelance: true,    // legacy flag for downstream consumers
          is_active: true,
        })));
      });
  }, []);

  const addFreelancer = async (name, specialty) => {
    const newMember = {
      display_name: name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      role: 'Stringer',
      specialty,
      labels: ['contractor', 'author'],
      status: 'active',
    };
    const { data } = await supabase.from("people").insert(newMember).select().single();
    if (data) setFreelancers(prev => [...prev, {
      id: data.id, name: data.display_name, role: data.role,
      specialty: data.specialty, is_freelance: true, is_active: true,
    }]);
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
  // Created exactly ONCE per StoryEditor mount. Earlier the deps array
  // was [editorContent] — every async content load re-instantiated the
  // editor, throwing away undo history and doing a full DOM swap. We
  // now hydrate via setContent(html, false) when fullContent arrives;
  // the second arg suppresses the update event so hydration doesn't
  // trigger a redundant autoSave.
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
      Figure, Figcaption,
    ],
    content: "",
    editorProps: {
      attributes: { style: "font-family: Georgia, 'Times New Roman', serif; font-size: 17px; line-height: 1.75; color: " + Z.tx + "; outline: none; min-height: 400px; padding: 0;" },
      handleDrop: (v, e) => { const f = e.dataTransfer?.files; if (f?.[0]?.type.startsWith("image/")) { e.preventDefault(); handleImageUpload(f[0]); return true; } return false; },
      handlePaste: (v, e) => { const items = e.clipboardData?.items; if (items) { for (const i of items) { if (i.type.startsWith("image/")) { e.preventDefault(); handleImageUpload(i.getAsFile()); return true; } } } return false; },
    },
    onUpdate: ({ editor }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => autoSave(editor.getJSON(), editor.getText()), 2000);
    },
  }, []);

  // Hydrate content once the async fetch completes. Guard with isEmpty
  // so a re-fetch doesn't clobber an editor the user has already
  // started typing into. setContent(content, false) skips the update
  // event so we don't trigger a redundant autoSave on hydration.
  useEffect(() => {
    if (!editor || contentLoading) return;
    const content = fullContent?.content_json
      || fullContent?.body
      || story.content_json
      || story.body
      || "";
    if (content && editor.isEmpty) {
      editor.commands.setContent(content, false);
    }
  }, [editor, contentLoading, fullContent, story.content_json, story.body]);

  // ── Load activity log + subscribe to real-time inserts ─────
  // The mount fetch grabs the last 20 entries; the realtime subscription
  // prepends new ones so the panel doesn't lag behind action triggers
  // (publish, status flips, layout handoff pings) coming from elsewhere.
  useEffect(() => {
    if (!story.id) return;
    supabase.from("story_activity").select("*").eq("story_id", story.id).order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => { if (data) setActivity(data); });
    const channel = supabase
      .channel(`story-activity-${story.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "story_activity",
        filter: `story_id=eq.${story.id}`,
      }, (payload) => {
        // Idempotent append: server-side triggers occasionally fire
        // alongside our own optimistic writes; dedupe on row id so
        // ActivityPanel's memo doesn't see a churning array on
        // unrelated re-renders.
        setActivity(prev => {
          if (prev.some(a => a.id === payload.new.id)) return prev;
          return [payload.new, ...prev].slice(0, 20);
        });
      })
      .subscribe();
    return () => { try { supabase.removeChannel(channel); } catch (_) {} };
  }, [story.id]);

  // (Wednesday Agent's per-story social_posts panel was removed in
  // migration 163. The new social-scheduling feature opens via the
  // toolbar's "Compose Social Post" hook → SocialComposer.)

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
      lockMeRef.current = me;
      channel = supabase.channel(`story-lock-${story.id}`, {
        config: { presence: { key } },
      });
      lockChannelRef.current = channel;
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
      lockChannelRef.current = null;
      try { if (channel) { channel.untrack(); supabase.removeChannel(channel); } } catch (_) {}
    };
  }, [story?.id, currentUser?.id, team]);

  // Admin Break Lock — re-tracks self with joinedAt=0. Sync recomputes
  // the winner (us, since 0 sorts first) and the lock screen falls
  // away. The previous holder (if their tab is alive) flips to the
  // loser side on their next sync.
  const breakLock = useCallback(async () => {
    if (!lockedBy) return;
    const ok = await dialog.confirm(
      `Break ${lockedBy.userName}'s lock? If they're actually still editing, both edits may conflict.`
    );
    if (!ok) return;
    const ch = lockChannelRef.current;
    const me = lockMeRef.current;
    if (!ch || !me) return;
    try {
      await ch.track({ userId: me.id, userName: me.name || "Editor", joinedAt: 0 });
    } catch (err) {
      console.error("breakLock failed:", err);
      await dialog.alert("Couldn't break the lock: " + (err?.message || "unknown"));
    }
  }, [dialog, lockedBy]);

  // ── Auto-save content ───────────────────────────────────────
  const autoSave = useCallback(async (cj, pt) => {
    const wc = pt.trim() ? pt.trim().split(/\s+/).length : 0;
    const now = new Date().toISOString();
    const u = { content_json: cj, word_count: wc, updated_at: now };
    if (editor) u.body = editor.getHTML();
    // Stamp last_significant_edit_at on every content write after the story
    // has gone live. That's what drives the "Unpublished Changes" badge —
    // republish clears this field so the badge disappears until the next
    // real edit.
    if (meta.published_at) u.last_significant_edit_at = now;
    const doSave = async () => {
      await updateStoryGuarded(u);
      onUpdate(story.id, u);
      setMeta(m => ({ ...m, ...u }));
    };
    return save.track(doSave(), { retry: () => save.track(doSave()) });
  }, [story.id, editor, onUpdate, meta.published_at, updateStoryGuarded, save]);

  // ── Save metadata ───────────────────────────────────────────
  // Atomic patch save. Accepts either a single-field call (legacy
  //   saveMeta("status", "Ready"))
  // or a multi-field patch
  //   saveMeta({ category_id, category, slug })
  // Multiple fields land in ONE UPDATE (no partial-write states).
  // camelCase → snake_case mapping handles known aliases ("publication");
  // print_issue_id changes mirror into the legacy issue_id column.
  const saveMeta = useCallback(async (fieldOrPatch, value) => {
    const patch = typeof fieldOrPatch === "string"
      ? { [fieldOrPatch]: value }
      : fieldOrPatch;

    const FIELD_MAP = { publication: "publication_id" };
    const dbPatch = {};
    const localPatch = { ...patch };
    for (const [k, v] of Object.entries(patch)) {
      const dbKey = FIELD_MAP[k] || k;
      dbPatch[dbKey] = v;
      localPatch[dbKey] = v;
    }

    if ("print_issue_id" in dbPatch) {
      dbPatch.issue_id = dbPatch.print_issue_id;
      localPatch.issue_id = dbPatch.print_issue_id;
      localPatch.issueId = dbPatch.print_issue_id;
    }

    dbPatch.updated_at = new Date().toISOString();
    localPatch.updated_at = dbPatch.updated_at;

    setMeta(m => ({ ...m, ...localPatch }));

    const doSave = async () => {
      await updateStoryGuarded(dbPatch);
      onUpdate(story.id, localPatch);
    };
    return save.track(doSave(), { retry: () => save.track(doSave()) });
  }, [story.id, onUpdate, updateStoryGuarded, save]);

  // ── Preflight checks ────────────────────────────────────────
  // Live: re-evaluates on every meta / wordCount change so the modal
  // updates as the user fixes issues instead of going stale on open.
  // Each check has a stable id so the click-through "→ fix" handler
  // can scroll the relevant sidebar panel into view.
  const preflightChecks = useMemo(() => {
    const hasTitle = !!(meta.title && meta.title.trim() && meta.title !== "New Story");
    const hasBody = wordCount >= 5;
    const hasCategory = !!(meta.category || meta.category_id);
    const hasFeaturedImage = !!meta.featured_image_url;
    const legalOk = !meta.needs_legal_review || !!meta.legal_reviewed_at;
    const checks = [
      { id: "title",    label: "Title is set",                  pass: hasTitle },
      { id: "body",     label: "Body has content (5+ words)",   pass: hasBody },
      { id: "category", label: "Category is selected",          pass: hasCategory },
      { id: "image",    label: "Featured image is set",         pass: hasFeaturedImage },
    ];
    if (meta.needs_legal_review) checks.push({ id: "legal", label: "Legal review signed off", pass: legalOk });
    return checks;
  }, [meta, wordCount]);

  const handlePublishClick = useCallback(() => setPreflightOpen(true), []);

  // Click-through "→ fix" from the preflight modal: scroll the
  // relevant sidebar panel into view and flash an accent outline so
  // the editor's eye lands on the right control. Keys map to the
  // `id` attributes wired onto each panel's outermost element.
  const scrollAndFlash = useCallback((domId) => {
    const el = typeof document !== "undefined" ? document.getElementById(domId) : null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const prevTransition = el.style.transition;
    const prevOutline = el.style.outline;
    const prevOffset = el.style.outlineOffset;
    el.style.transition = "outline 0.2s";
    el.style.outline = `2px solid ${Z.ac}`;
    el.style.outlineOffset = "2px";
    setTimeout(() => {
      el.style.outline = prevOutline || "none";
      el.style.outlineOffset = prevOffset || "";
      el.style.transition = prevTransition || "";
    }, 1500);
  }, []);

  const fixPreflight = useCallback((checkId) => {
    setPreflightOpen(false);
    if (checkId === "title") {
      // Title input lives inside the body. Defer to next tick so the
      // modal close finishes before we steal focus.
      setTimeout(() => {
        const el = typeof document !== "undefined" ? document.querySelector('input[placeholder^="Story title"]') : null;
        el?.focus();
      }, 80);
      return;
    }
    if (checkId === "body") {
      setTimeout(() => editor?.commands.focus(), 80);
      return;
    }
    const targetId = {
      category: "panel-category",
      image:    "panel-story-library",
      legal:    "panel-legal-review",
    }[checkId];
    if (targetId) setTimeout(() => scrollAndFlash(targetId), 80);
  }, [editor, scrollAndFlash]);

  // Sidebar callbacks. Wrapped in useCallback so the memoized panels
  // don't tear down when meta changes for unrelated reasons.

  const savePubDateRange = useCallback(async (patch) => {
    flushAutoSaveTimer();
    const u = { ...patch, updated_at: new Date().toISOString() };
    const doSave = async () => {
      await updateStoryGuarded(u);
      setMeta(m => ({ ...m, ...u }));
      onUpdate(story.id, u);
      if (bus) bus.emit("notification.add", { text: '"' + (meta.title || "Untitled") + '" publish date updated', route: "editorial" });
    };
    try {
      await save.track(doSave(), { retry: () => save.track(doSave()) });
    } catch (err) {
      if (bus) bus.emit("notification.add", { text: "Publish date update failed: " + (err?.message || "unknown"), route: "editorial" });
    }
  }, [story.id, onUpdate, updateStoryGuarded, save, bus, meta.title, flushAutoSaveTimer]);

  const handleApprove = useCallback(async () => {
    setWebApproved(true);
    await saveMeta("web_approved", true);
  }, [saveMeta]);

  const handleUnpublish = useCallback(async () => {
    flushAutoSaveTimer();
    if (unpublishStory) {
      await unpublishStory(story.id);
      setMeta(m => ({ ...m, status: "Ready", sent_to_web: false }));
      onUpdate(story.id, { status: "Ready", sent_to_web: false });
    }
  }, [unpublishStory, story.id, onUpdate, flushAutoSaveTimer]);

  const clearFeaturedImage = useCallback(
    () => saveMeta({ featured_image_url: null, featured_image_id: null }),
    [saveMeta]
  );

  const handleSetTitle = useCallback((t) => {
    setMeta(m => ({ ...m, title: t }));
    saveMeta("title", t);
  }, [saveMeta]);

  const handleApplyGeneratedBody = useCallback((html) => {
    if (!editor) return;
    flushAutoSaveTimer();
    editor.commands.setContent(html);
    saveTimer.current = setTimeout(() => autoSave(editor.getJSON(), editor.getText()), 100);
  }, [editor, flushAutoSaveTimer]);

  const handleAuthorCustom = useCallback(async () => {
    const name = await dialog.prompt("Enter author name:");
    if (name) saveMeta("author", name);
  }, [dialog, saveMeta]);

  const handleAddFreelancer = useCallback(async () => {
    const name = await dialog.prompt("Freelancer name:");
    if (!name) return;
    const specialty = await dialog.prompt("Specialty (Writer, Photographer, etc.):");
    addFreelancer(name, specialty || "Writer");
  }, [dialog]);

  const handleDelete = useCallback(async () => {
    if (!await dialog.confirm("Are you sure you want to delete this story? This cannot be undone.")) return;
    const { error } = await supabase.from("stories").delete().eq("id", story.id);
    if (error) { await dialog.alert("Delete failed: " + error.message); return; }
    onUpdate(story.id, { _deleted: true });
    onClose();
  }, [dialog, story.id, onUpdate, onClose]);

  const publishToWeb = async () => {
    flushAutoSaveTimer();
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
    const doSave = async () => {
      await updateStoryGuarded(u);
      setMeta(m => ({ ...m, ...u }));
      onUpdate(story.id, u);
      if (bus) {
        bus.emit("story.published", { storyId: story.id, title: meta.title });
        bus.emit("notification.add", {
          text: '"' + (meta.title || "Untitled") + '" published to web by ' + (meta.author || "editor"),
          route: "editorial",
        });
      }
    };
    try {
      await save.track(doSave(), { retry: () => save.track(doSave()) });
    } catch (err) {
      if (bus) bus.emit("notification.add", { text: "Publish failed: " + (err?.message || "unknown"), route: "editorial" });
    }
  };

  // ── Republish (skip preflight — already published once) ─────
  // Preserve the original published_at so the story stays in its
  // chronological slot on StellarPress (sorted by published_at DESC).
  // CLEAR last_significant_edit_at so the "Unpublished Changes" badge
  // disappears — next edit will re-stamp it and flip the badge back on.
  //
  // Two writes by design: autoSave first to land the editor's latest
  // body/content_json, then a flag-only update to clear the badge.
  // Bundling body into the second write would re-fire track_story_edits
  // (it stamps last_significant_edit_at on any body change to a
  // published row), silently undoing our null clear.
  const republishToWeb = async () => {
    flushAutoSaveTimer();
    setRepublishing(true);
    try {
      if (editor) await autoSave(editor.getJSON(), editor.getText());
      const now = new Date().toISOString();
      const u = {
        web_status: "published",
        last_significant_edit_at: null,
        updated_at: now,
      };
      const doSave = async () => {
        await updateStoryGuarded(u);
        setMeta(m => ({ ...m, ...u }));
        onUpdate(story.id, u);
        setRepublishedFlash(Date.now());
        setTimeout(() => setRepublishedFlash(0), 2500);
        if (bus) bus.emit("notification.add", { text: '"' + (meta.title || "Untitled") + '" republished to web', route: "editorial" });
      };
      await save.track(doSave(), { retry: () => save.track(doSave()) });
    } catch (err) {
      if (bus) bus.emit("notification.add", { text: "Republish failed: " + (err?.message || "unknown"), route: "editorial" });
    } finally {
      setRepublishing(false);
    }
  };

  // ── Image upload ────────────────────────────────────────────
  // Routed through startUpload/finishUpload so the sidebar progress
  // strip shows a bar per file and a Cancel that aborts mid-flight
  // (XHR-level abort via AbortController in lib/media.js).
  const handleImageUpload = async (file) => {
    if (!file) return;
    if (!selectedPubs[0]) {
      await dialog.alert("Please choose a publication first.");
      return;
    }
    const { id, abortController } = startUpload(file);
    try {
      const row = await uploadMedia(file, {
        category: meta.story_type === "obituary" ? "obituary" : "story_image",
        storyType: meta.story_type || "article",
        storyId: story?.id || null,
        publicationId: selectedPubs[0],
        onProgress: (p) => updateUpload(id, { progress: p }),
        signal: abortController.signal,
      });
      setPendingImageUrl(row.cdn_url); setImageCaption(""); setImageModalOpen(true);
      loadStoryImages();
    } catch (err) {
      if (err?.message !== "Upload cancelled") {
        console.error("Image upload failed:", err);
        await dialog.alert("Image upload failed: " + err.message);
      }
    } finally {
      finishUpload(id);
    }
  };

  const insertImage = () => {
    if (!pendingImageUrl || !editor) return;
    if (imageCaption) {
      editor.chain().focus().insertFigure({
        src: pendingImageUrl,
        alt: imageCaption,
        caption: imageCaption,
      }).run();
    } else {
      editor.chain().focus().setImage({ src: pendingImageUrl, alt: "" }).run();
    }
    setImageModalOpen(false); setPendingImageUrl(""); setImageCaption("");
  };

  // Upload one or more files to the Story Library. Enforces the pub
  // guard up front so we don't hit uploadMedia with a failing state.
  // Each file gets its own progress entry + cancel; failures are
  // surfaced per-file rather than aborting the whole batch.
  const uploadToStoryLibrary = async (files) => {
    const list = Array.from(files || []).filter(f => f.type?.startsWith("image/"));
    if (!list.length) return;
    if (!selectedPubs[0]) {
      await dialog.alert("Please choose a publication first.");
      return;
    }
    const failures = [];
    for (const f of list) {
      const { id, abortController } = startUpload(f);
      try {
        await uploadMedia(f, {
          category: meta.story_type === "obituary" ? "obituary" : "story_image",
          storyType: meta.story_type || "article",
          storyId: story?.id || null,
          publicationId: selectedPubs[0],
          onProgress: (p) => updateUpload(id, { progress: p }),
          signal: abortController.signal,
        });
      } catch (err) {
        if (err?.message !== "Upload cancelled") failures.push({ name: f.name, message: err?.message || "unknown" });
      } finally {
        finishUpload(id);
      }
    }
    await loadStoryImages();
    if (failures.length) {
      await dialog.alert("Some uploads failed:\n" + failures.map(f => `• ${f.name}: ${f.message}`).join("\n"));
    }
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
    const doAttach = asset.id
      ? async () => {
          const { error } = await supabase.from("media_assets")
            .update({ story_id: story.id, updated_at: new Date().toISOString() })
            .eq("id", asset.id);
          if (error) throw error;
        }
      : async () => {
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
          if (error) throw error;
        };
    try {
      await save.track(doAttach(), { retry: () => save.track(doAttach()) });
    } catch (err) {
      console.error("attachAssetToStory failed:", err);
      await dialog.alert("Attach failed: " + (err?.message || "unknown"));
      return;
    }
    await loadStoryImages();
  };

  // Promote an image to the story's featured image. Single-UPDATE via
  // the atomic saveMeta patch form so featured_image_url + featured_image_id
  // land together.
  const setAsFeatured = (img) =>
    saveMeta({
      featured_image_url: img.cdn_url,
      ...(img.id ? { featured_image_id: img.id } : {}),
    });

  // Bundle all originals + a captions.docx into a single zip so the
  // production team gets one click → file with the captions paired up.
  // Lazy-load the bundler so the docx/jszip code only ships when used.
  const [downloadingOriginals, setDownloadingOriginals] = useState(false);
  const downloadOriginals = async () => {
    if (!storyImages.length) return;
    setDownloadingOriginals(true);
    try {
      const { downloadStoryImagesBundle } = await import("../../lib/storyImagesBundle");
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

  // wordCount state lives here but is fed by StoryEditorBody's
  // editor.on("update") callback (see onWordCount). Avoids the
  // editor.getText() recompute on every parent render.
  const [wordCount, setWordCount] = useState(0);
  const needsRepublish = meta.published_at && meta.last_significant_edit_at && new Date(meta.last_significant_edit_at) > new Date(meta.published_at);
  const currentStage = getStage(meta.status);
  const isPublished = !!(meta.sent_to_web || meta.sentToWeb || meta.sent_to_print || meta.sentToPrint);

  useEffect(() => { return () => { if (saveTimer.current) clearTimeout(saveTimer.current); }; }, []);

  // Keyboard shortcuts. Defined after the render-state derivations
  // above (isPublished / needsRepublish / webApproved) and after the
  // save / publish handlers \u2014 referencing those in TDZ throws.
  // Esc is owned by the modal-stack hook in each open modal so this
  // hook intentionally doesn't bind it.
  const shortcuts = useMemo(() => [
    {
      key: "s", cmd: true, allowInInputs: true,
      fn: () => {
        if (!editor) return;
        if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
        autoSave(editor.getJSON(), editor.getText());
      },
    },
    {
      key: "Enter", cmd: true, allowInInputs: true,
      fn: () => {
        if (isPublished && needsRepublish) republishToWeb();
        else if (!isPublished && webApproved) setPreflightOpen(true);
      },
    },
    {
      key: "k", cmd: true, allowInInputs: true,
      fn: () => {
        setLinkUrl(editor?.getAttributes("link").href || "");
        setLinkModalOpen(true);
      },
    },
    {
      key: "p", cmd: true, allowInInputs: true,
      fn: () => setPreviewOpen(true),
    },
  ], [editor, autoSave, isPublished, needsRepublish, webApproved, republishToWeb]);
  useKeyboardShortcuts(shortcuts);

  if (contentLoading) return <LoadingSkeleton />;
  if (!editor) return null;

  // ── Story-lock blocking modal ──────────────────────────────
  // If another editor got here first, don't render the editor at
  // all — show a full-screen notice with a single exit affordance.
  if (lockedBy) {
    const since = lockedBy.joinedAt ? new Date(lockedBy.joinedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
    // Stale-lock surface: presence rows past 30 minutes likely belong
    // to a closed-laptop / hibernated tab whose heartbeat hasn't yet
    // timed out. Admins get a Break Lock affordance for those.
    const lockAgeMin = lockedBy.joinedAt ? (Date.now() - lockedBy.joinedAt) / 60000 : 0;
    const isStale = lockAgeMin > 30;
    const isAdmin = !!(currentUser?.permissions?.includes?.("admin"));
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: Z.bg, padding: 24 }}>
        <div style={{ maxWidth: 460, textAlign: "center", background: Z.sf, border: "1px solid " + Z.bd, borderRadius: R, padding: 32, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
          <div style={{ marginBottom: 12, color: Z.tm, display: "flex", justifyContent: "center" }}><Ic.lock size={40} /></div>
          <h2 style={{ margin: "0 0 8px", fontSize: FS.xl, fontWeight: 800, color: Z.tx, fontFamily: DISPLAY }}>Story is open elsewhere</h2>
          <p style={{ margin: "0 0 16px", fontSize: FS.md, color: Z.tm, fontFamily: COND, lineHeight: 1.5 }}>
            <strong style={{ color: Z.tx }}>{lockedBy.userName}</strong> is editing "{meta.title || "this story"}"{since ? ` since ${since}` : ""}. Only one editor can have a story open at a time to avoid conflicting saves.
          </p>
          {isStale && (
            <div style={{ fontSize: FS.xs, color: Z.wa, fontFamily: COND, marginBottom: 16, padding: "8px 10px", background: Z.wa + "12", borderRadius: R, border: "1px solid " + Z.wa + "30" }}>
              This lock has been held for over 30 minutes \u2014 they may have closed their browser without releasing it.
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <Btn onClick={onClose} style={{ flex: 1 }}>Back to Editorial</Btn>
            {isAdmin && isStale && (
              <Btn v="secondary" onClick={breakLock} style={{ flex: 1, color: Z.da, borderColor: Z.da + "40" }}>Break Lock</Btn>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--canvas)" }}>

      <StoryEditorTopBar
        meta={meta}
        save={save}
        uploads={uploads}
        story={story}
        team={team}
        wordCount={wordCount}
        discussionOpen={discussionOpen}
        discussionCount={discussionCount}
        onBack={onClose}
        onPreview={() => setPreviewOpen(true)}
        onSetDiscussionOpen={setDiscussionOpen}
        onMsgCount={setDiscussionCount}
      />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left: Editor */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <StoryEditorBody
            meta={meta}
            setMeta={setMeta}
            selectedPubs={selectedPubs}
            pubs={pubs}
            editor={editor}
            onTitleBlur={(t) => saveMeta("title", t)}
            onWordCount={setWordCount}
          />
          <StoryEditorToolbar
            editor={editor}
            fileInputRef={fileInput}
            onLinkClick={() => { setLinkUrl(editor.getAttributes("link").href || ""); setLinkModalOpen(true); }}
            onUploadClick={() => fileInput.current?.click()}
            onPickInlineMedia={() => { setMediaPickerMode("inline"); setMediaPickerOpen(true); }}
            onPickGalleryMedia={() => { setMediaPickerMode("gallery"); setMediaPickerOpen(true); }}
            onFileSelected={handleImageUpload}
          />
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px 64px" }}><EditorContent editor={editor} /></div>
        </div>

        <StoryEditorSidebar
          story={story}
          meta={meta}
          setMeta={setMeta}
          fullContent={fullContent}
          publication={publication}
          publicationTz={publicationTz}
          isPublished={isPublished}
          needsRepublish={needsRepublish}
          currentStage={currentStage}
          webApproved={webApproved}
          republishing={republishing}
          republishedFlash={republishedFlash}
          selectedPubs={selectedPubs}
          filteredIssues={filteredIssues}
          storyImages={storyImages}
          categories={categories}
          freelancers={freelancers}
          activity={activity}
          authors={authors}
          pubs={pubs}
          team={team}
          currentUser={currentUser}
          uploads={uploads}
          downloadingOriginals={downloadingOriginals}
          wordCount={wordCount}
          editor={editor}
          dialog={dialog}
          saveMeta={saveMeta}
          saveImageCaption={saveImageCaption}
          savePubDateRange={savePubDateRange}
          onApprove={handleApprove}
          onPublish={handlePublishClick}
          onRepublish={republishToWeb}
          onUnpublish={handleUnpublish}
          onSetTitle={handleSetTitle}
          onApplyGeneratedBody={handleApplyGeneratedBody}
          onDraftCreated={onDraftCreated}
          onClearFeatured={clearFeaturedImage}
          onSetFeatured={setAsFeatured}
          onUpload={pickStoryLibraryUpload}
          onPickFromLibrary={openLibraryForStory}
          onAddFreelancer={handleAddFreelancer}
          onAuthorCustom={handleAuthorCustom}
          onDownloadOriginals={downloadOriginals}
          onDelete={handleDelete}
          onOpenStory={onOpenStory}
          onClose={onClose}
          onUpdate={onUpdate}
        />
      </div>

      {/* Modals */}
      <PreflightModal open={preflightOpen} onClose={() => setPreflightOpen(false)} onPublish={publishToWeb} checks={preflightChecks} scheduledAt={meta.scheduled_at} onScheduleChange={v => { saveMeta("scheduled_at", v); setMeta(m => ({ ...m, scheduled_at: v })); }} publication={publication} onFix={fixPreflight} />

      <WebPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} meta={meta} pubs={pubs} editor={editor} />

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
            saveMeta({
              featured_image_url: media.url,
              ...(media.id ? { featured_image_id: media.id } : {}),
            });
          } else if (mediaPickerMode === "story") {
            attachAssetToStory(media);
          } else if (editor) {
            // Inline insert: use semantic figure when there's a
            // caption / alt text; otherwise plain <img>.
            if (media.caption || media.alt) {
              editor.chain().focus().insertFigure({
                src: media.url,
                alt: media.alt || "",
                caption: media.caption || media.alt || "",
              }).run();
            } else {
              editor.chain().focus().setImage({ src: media.url, alt: "" }).run();
            }
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

    </div>
  );
};

export default StoryEditor;
