import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense, memo } from "react";
import { Z, SC, COND, DISPLAY, ACCENT, FS, FW, R, Ri, INV, CARD } from "../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Card, SB, TB, Modal, FilterBar, TabRow, TabPipe, GlassStat, DataTable, FilterPillStrip } from "./ui";
import { STORY_STATUSES } from "../constants";
import { supabase } from "../lib/supabase";
import { useDialog } from "../hooks/useDialog";
import { usePageHeader } from "../contexts/PageHeaderContext";

// Heavy modules — lazy-load so the kanban view doesn't pull in tiptap or pdfjs
const StoryEditor = lazy(() => import("./StoryEditor"));
const EditionManager = lazy(() => import("../pages/EditionManager"));
const LazyFallback = () => <div style={{ padding: 40, textAlign: "center", color: Z.td, fontSize: 13 }}>Loading…</div>;

// ── Editorial Workflow Constants ──────────────────────────────────
// Single-source status model: Draft → Edit → Ready → (published via
// sent_to_web / sent_to_print). The Published column reads from the
// flags, not from a status value. See filterForStage() below.
const KANBAN_COLS = [
  { key: "pitched", label: "Pitched", color: Z.pu || "#7C3AED", statuses: ["Pitched"] },
  { key: "draft", label: "Draft", color: ACCENT.grey, statuses: ["Draft"] },
  { key: "edit", label: "Edit", color: ACCENT.amber, statuses: ["Edit"] },
  { key: "ready", label: "Ready", color: ACCENT.blue, statuses: ["Ready"], needsFlags: "unpublished" },
  { key: "published", label: "Published", color: Z.su || "#22c55e", statuses: ["Ready"], needsFlags: "published" },
];

// Filter a story list into a single kanban column. Handles the new
// Ready-but-(un)published split via the needsFlags hint.
const isPublished = (s) => !!(s.sent_to_web || s.sentToWeb || s.sent_to_print || s.sentToPrint);
const filterForStage = (story, col) => {
  if (!col.statuses.includes(story.status)) return false;
  if (col.needsFlags === "published") return isPublished(story);
  if (col.needsFlags === "unpublished") return !isPublished(story);
  return true;
};

const PRINT_STAGES = [
  { key: "none", label: "Not Assigned" },
  { key: "ready", label: "Ready for Print" },
  { key: "on_page", label: "On Page" },
  { key: "proofread", label: "Proofread" },
  { key: "approved", label: "Approved" },
  { key: "sent_to_press", label: "Sent to Press" },
];

const PRIORITY_COLORS = { 1: Z.da, 2: ACCENT.amber, 3: Z.wa || "#e8b03a", 4: Z.tm || ACCENT.grey, 5: "#a1a8b8", 6: "#d1d5db" };
const PRIORITY_LABELS = { 1: "1 — Critical", 2: "2 — Urgent", 3: "3 — High", 4: "4 — Normal", 5: "5 — Low", 6: "6 — Fill" };
const PRIORITY_OPTIONS = [1, 2, 3, 4, 5, 6].map(n => ({ value: String(n), label: String(n) }));

// Default status colors — overridden by org_settings.status_colors if configured
const DEFAULT_statusColors = {
  Pitched:  { bg: "rgba(144,102,232,0.12)", fg: "#7c3aed" },
  Draft:    { bg: "rgba(138,149,168,0.12)", fg: Z.tm },
  Edit:     { bg: "rgba(59,130,246,0.12)",  fg: "#3B82F6" },
  Ready:    { bg: "rgba(34,197,94,0.12)",   fg: "#16a34a" },
  Archived: { bg: "rgba(138,149,168,0.08)", fg: "#9ca3af" },
};

const STORY_TYPES = ["article", "column", "letter", "obituary", "legal_notice", "calendar_event", "press_release", "opinion"];
const SOURCES = ["staff", "freelance", "syndicated", "press_release", "community", "ai_assisted"];

const TABS = [
  { id: "workflow", label: "Workflow", icon: "flat" },
  { id: "stories", label: "Issue Planning", icon: "pub" },
  { id: "web", label: "Web Queue", icon: "send" },
  { id: "editions", label: "Editions", icon: "pub" },
];

// ── Helpers ──────────────────────────────────────────────────────
const pn = (id, pubs) => pubs.find(p => p.id === id)?.name || "—";
const pColor = (id, pubs) => pubs.find(p => p.id === id)?.color || Z.ac;
const tn = (id, team) => { const t = team.find(t => t.id === id); return t ? `${t.firstName || ""} ${t.lastName || ""}`.trim() : "Unassigned"; };
const ago = (d) => { if (!d) return ""; const ms = Date.now() - new Date(d).getTime(); const m = Math.floor(ms / 60000); if (m < 60) return `${m}m ago`; const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`; return `${Math.floor(h / 24)}d ago`; };

const needsRepublish = (story) => {
  // Story was published to web, then content changed (edit_count > 0 and last_significant_edit_at > published_at)
  if (!story.published_at || !story.last_significant_edit_at) return false;
  return new Date(story.last_significant_edit_at) > new Date(story.published_at);
};

// ── Story Card (used in kanban and lists) ────────────────────────
// Memoized: kanban renders 50–200 cards and only the dragged/updated one
// should re-render. onClick is stabilized via useCallback in the parent.
const StoryCard = memo(({ story, pubs, team, onClick, isDragging }) => {
  const webPublished = !!(story.sent_to_web || story.sentToWeb);
  const repubNeeded = needsRepublish(story);
  const pri = story.priority || "normal";

  return (
    <div
      onClick={() => onClick?.(story)}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("storyId", story.id); e.dataTransfer.effectAllowed = "move"; }}
      style={{
        background: Z.sf, border: `1px solid ${isDragging ? Z.ac : Z.bd}`,
        borderRadius: Ri, padding: "10px 12px", cursor: "pointer",
        borderLeft: `3px solid ${pri === "urgent" ? Z.da : pri === "high" ? ACCENT.amber : pColor(story.publication_id || story.publication, pubs)}`,
        transition: "box-shadow 0.15s, border-color 0.15s",
        opacity: isDragging ? 0.5 : 1,
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 2px 8px ${Z.bd}`; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
    >
      {/* Top row: priority dot + title */}
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 6 }}>
        {pri !== "normal" && (
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: PRIORITY_COLORS[pri], flexShrink: 0, marginTop: 4 }} title={PRIORITY_LABELS[pri]} />
        )}
        <span style={{ fontSize: 13, fontWeight: 700, color: Z.tx, lineHeight: 1.3, fontFamily: COND, flex: 1 }}>
          {story.title || "Untitled"}
        </span>
      </div>

      {/* Meta row */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 10, color: Z.tm, fontFamily: COND }}>
        <span style={{ background: pColor(story.publication_id || story.publication, pubs) + "20", color: pColor(story.publication_id || story.publication, pubs), padding: "1px 6px", borderRadius: Ri, fontWeight: 700, fontSize: FS.micro }}>
          {pn(story.publication_id || story.publication, pubs).split(" ").map(w => w[0]).join("")}
        </span>
        {story.category && <span>{story.category}</span>}
        {story.assigned_to && <span>→ {tn(story.assigned_to, team).split(" ")[0]}</span>}
        {story.due_date && <span>Due {new Date(story.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
      </div>

      {/* Badges row */}
      <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
        {/* Web published badge */}
        {webPublished && !repubNeeded && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: Ri, fontSize: FS.micro, fontWeight: 700, background: ACCENT.green + "18", color: ACCENT.green }}>
            <Ic.check size={9} /> Web
          </span>
        )}
        {/* Needs re-publish signal */}
        {repubNeeded && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: Ri, fontSize: FS.micro, fontWeight: 700, background: Z.wa + "18", color: Z.wa, animation: "pulse 2s infinite" }}>
            ↻ Updated — Republish
          </span>
        )}
        {/* Print status badge */}
        {story.print_status && story.print_status !== "none" && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: Ri, fontSize: FS.micro, fontWeight: 700, background: Z.sa, color: Z.tm }}>
            ⎙ {PRINT_STAGES.find(s => s.key === story.print_status)?.label || story.print_status}
          </span>
        )}
        {/* Correction note indicator */}
        {story.correction_note && (
          <span style={{ padding: "1px 6px", borderRadius: Ri, fontSize: FS.micro, fontWeight: 700, background: Z.wa + "18", color: Z.wa }}>
            Correction
          </span>
        )}
      </div>
    </div>
  );
});

// ── Kanban Column ────────────────────────────────────────────────
const KanbanCol = ({ col, stories, pubs, team, onDrop, onClick }) => {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      style={{
        flex: 1, minWidth: 220, display: "flex", flexDirection: "column",
        background: Z.bg === "#08090D" ? "rgba(140,150,165,0.06)" : "rgba(255,255,255,0.35)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderRadius: R, padding: CARD.pad, border: `1px solid ${Z.bd}`,
        minHeight: 100,
      }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const sid = e.dataTransfer.getData("storyId"); if (sid) onDrop(sid, col.key); }}
    >
      {/* Column header — matches Pipeline style */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "3px 4px 6px", borderBottom: `2px solid ${col.color}`,
        marginBottom: 8,
      }}>
        <span style={{ fontSize: FS.sm, fontWeight: FW.black, textTransform: "uppercase", letterSpacing: "0.04em", color: col.color, fontFamily: COND }}>{col.label}</span>
        <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td }}>{stories.length}</span>
      </div>

      {/* Drop zone */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", gap: 8,
        overflowY: "auto", maxHeight: 420,
        background: dragOver ? col.color + "08" : "transparent",
        borderRadius: Ri, transition: "background 0.15s",
      }}>
        {stories.map(s => (
          <StoryCard key={s.id} story={s} pubs={pubs} team={team} onClick={onClick} />
        ))}
        {stories.length === 0 && (
          <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: Z.td, fontStyle: "italic" }}>
            Drop stories here
          </div>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
// MAIN EDITORIAL DASHBOARD
// ══════════════════════════════════════════════════════════════════
const EditorialDashboard = ({ stories: storiesRaw, setStories, pubs, issues, team, bus, editorialPermissions, currentUser, publishStory, unpublishStory, editions, setEditions, isActive, deepLink }) => {
  // Publish TopBar header while this module is the active page. Gated on
  // isActive because App.jsx keeps modules mounted after first visit.
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({
        breadcrumb: [{ label: "Home" }, { label: "Editorial" }],
        title: "Editorial",
      });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);
  const stories = storiesRaw || [];
  const dialog = useDialog();

  // Load status colors + enabled flag from org_settings (publisher-configurable)
  const [statusColors, setStatusColors] = useState(DEFAULT_statusColors);
  const [statusColorsOn, setStatusColorsOn] = useState(true);
  useEffect(() => {
    supabase.from("org_settings").select("status_colors, status_colors_enabled").limit(1).maybeSingle()
      .then(({ data }) => {
        if (data?.status_colors) setStatusColors(sc => ({ ...sc, ...data.status_colors }));
        if (data?.status_colors_enabled === false) setStatusColorsOn(false);
      });
  }, []);

  const deleteStory = async (id) => {
    if (!await dialog.confirm("Delete this story? This cannot be undone.")) return;
    setStories(prev => prev.filter(s => s.id !== id));
    if (!id.startsWith("story-")) {
      supabase.from("stories").delete().eq("id", id).then(() => {}).catch(() => {});
    }
  };
  const [tab, setTab] = useState("workflow");
  const [fPub, setFPub] = useState("all");
  const [fAssignee, setFAssignee] = useState("all");

  const [sr, setSr] = useState("");
  const [selected, setSelected] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  // Active vs Archive view. Active is the daily-work surface (drafts, in
  // progress, recently published); Archive is everything else so old
  // published stories stay searchable but out of the way. Default Active.
  const [viewScope, setViewScope] = useState("active");

  // Header search → /editorial?q=foo deeplinks here. Seed the search
  // input on first activation. When sr is non-empty the filter ignores
  // viewScope (search across all stories), so the user finds matches
  // regardless of which tab is active.
  useEffect(() => {
    if (isActive && deepLink?.q) setSr(deepLink.q);
  }, [isActive, deepLink?.q]);

  // Issue planning state
  const [selIssue, setSelIssue] = useState(null);
  const [showSiblings, setShowSiblings] = useState(false);
  const [sortCol, setSortCol] = useState("title");
  const [sortDir, setSortDir] = useState("asc");

  // Archive-tab date range. Preset-driven (7d / this month / last month /
  // custom). `archiveFrom` / `archiveTo` are always the live window used
  // by the filter; presets compute them on click. When the preset is
  // "custom" the date inputs are editable.
  const [archivePreset, setArchivePreset] = useState("7days");
  const [archiveFrom, setArchiveFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [archiveTo, setArchiveTo] = useState(() => new Date().toISOString().slice(0, 10));

  const applyArchivePreset = useCallback((preset) => {
    setArchivePreset(preset);
    const today = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    if (preset === "7days") {
      const from = new Date(today); from.setDate(from.getDate() - 7);
      setArchiveFrom(iso(from));
      setArchiveTo(iso(today));
    } else if (preset === "thisMonth") {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      setArchiveFrom(iso(from));
      setArchiveTo(iso(today));
    } else if (preset === "lastMonth") {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to   = new Date(today.getFullYear(), today.getMonth(), 0);  // last day of prev month
      setArchiveFrom(iso(from));
      setArchiveTo(iso(to));
    }
    // "custom" leaves the current from/to intact so the user can edit.
  }, []);

  // ── Filtered stories ────────────────────────────────────────
  // Active: default daily-work surface. Anything published > 90 days ago
  // drops out so the kanban stays focused on current work.
  // Archive: published stories inside the user's chosen date range. No
  // drafts / in-progress, no kanban — it's a read-only list view.
  // When the user is searching (sr non-empty), scope is ignored — search
  // hits across the whole corpus.
  const archiveCutoff = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 90);
    return d.toISOString();
  }, []);
  const filtered = useMemo(() => {
    // Archive date-range bounds as ISO strings for column compare.
    const fromISO = archiveFrom ? new Date(archiveFrom + "T00:00:00").toISOString() : null;
    const toISO   = archiveTo   ? new Date(archiveTo   + "T23:59:59").toISOString() : null;
    return stories.filter(s => {
      if (fPub !== "all" && (s.publication_id || s.publication) !== fPub) return false;
      if (fAssignee !== "all" && s.assigned_to !== fAssignee) return false;
      if (sr) {
        const q = sr.toLowerCase();
        const match = (s.title || "").toLowerCase().includes(q) ||
          (s.author || "").toLowerCase().includes(q) ||
          (s.category || "").toLowerCase().includes(q);
        if (!match) return false;
      } else if (viewScope === "active") {
        // Active hides published stories older than 90 days so the
        // kanban doesn't accumulate history.
        const isOld = (s.sent_to_web || s.sentToWeb) && s.published_at && s.published_at < archiveCutoff;
        if (isOld) return false;
      } else if (viewScope === "archive") {
        // Archive: only published stories inside the date range.
        // useAppData maps DB published_at → publishedAt (camelCase only),
        // so read both forms — snake_case will be set on rows that never
        // went through the hook's mapper (fresh inserts, realtime), and
        // camelCase on everything else.
        const pubDate = s.published_at || s.publishedAt;
        if (!(s.sent_to_web || s.sentToWeb) || !pubDate) return false;
        if (fromISO && pubDate < fromISO) return false;
        if (toISO   && pubDate > toISO)   return false;
      }
      return true;
    });
  }, [stories, fPub, fAssignee, sr, viewScope, archiveCutoff, archiveFrom, archiveTo]);

  // ── Group stories by kanban column ──────────────────────────
  // Single-source rules: a story at Ready + no publish flags lives in
  // the 'ready' column; Ready + sent_to_web/print lives in 'published'.
  // Draft / Edit map directly by status. Published stories aged out of
  // the 7-day window drop off the board entirely.
  const kanbanData = useMemo(() => {
    const cols = {};
    KANBAN_COLS.forEach(c => { cols[c.key] = []; });
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    filtered.forEach(s => {
      const status = s.status || "Draft";
      const published = isPublished(s);
      const pubAt = s.published_at || s.publishedAt || s.print_published_at || s.printPublishedAt;
      if (published && pubAt && new Date(pubAt) < sevenDaysAgo) return; // aged out

      const col = KANBAN_COLS.find(c => filterForStage(s, c));
      if (col) cols[col.key].push(s);
      else if (cols.draft) cols.draft.push(s);
    });
    return cols;
  }, [filtered]);

  // ── Story editor ─────────────────────────────────────────
  // Stable refs so memo(StoryCard) isn't invalidated by the kanban re-rendering.
  const openDetail = useCallback((story) => { setSelected(story); setEditorOpen(true); }, []);
  const closeEditor = useCallback(() => { setEditorOpen(false); setSelected(null); }, []);

  const updateStory = (id, updates) => {
    if (updates._deleted) {
      setStories(prev => prev.filter(s => s.id !== id));
      return;
    }
    setStories(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    if (selected?.id === id) setSelected(s => ({ ...s, ...updates }));
    // Auto-save to DB (fire-and-forget)
    if (!id) return;
    const dbFields = {};
    if (updates.title !== undefined) dbFields.title = updates.title;
    if (updates.author !== undefined) dbFields.author = updates.author;
    if (updates.category !== undefined) dbFields.category = updates.category;
    if (updates.status !== undefined) dbFields.status = updates.status;
    if (updates.page !== undefined) dbFields.page = updates.page;
    if (updates.page_number !== undefined) dbFields.page = updates.page_number;
    if (updates.web_status !== undefined) dbFields.web_status = updates.web_status;
    if (updates.sent_to_web !== undefined) dbFields.sent_to_web = updates.sent_to_web;
    if (updates.published_at !== undefined) dbFields.published_at = updates.published_at;
    if (updates.first_published_at !== undefined) dbFields.first_published_at = updates.first_published_at;
    if (updates.word_limit !== undefined) dbFields.word_limit = updates.word_limit;
    if (updates.priority !== undefined) dbFields.priority = updates.priority;
    if (Object.keys(dbFields).length === 0) return;

    // Map page to integer for DB
    if (dbFields.page !== undefined) {
      const pgNum = parseInt(String(dbFields.page));
      dbFields.page = isNaN(pgNum) ? null : pgNum;
    }

    if (id.startsWith("story-")) {
      // New story — only INSERT once it has a title
      const full = storiesRaw.find(s => s.id === id) || {};
      const titleVal = updates.title || full.title || "";
      if (!titleVal.trim()) return; // Don't persist untitled stories yet
      const pubId = full.publication_id || full.publication || null;
      const issId = full.print_issue_id || full.issue_id || full.issueId || null;
      supabase.from("stories").insert({
        title: titleVal,
        author: full.author || null,
        status: "Draft",
        category: full.category || "News",
        publication_id: pubId,
        print_issue_id: issId,
        page: dbFields.page || null,
        ...dbFields,
      }).select("id").single().then(({ data }) => {
        if (data?.id) {
          setStories(prev => prev.map(s => s.id === id ? { ...s, id: data.id } : s));
        }
      }).catch(err => console.error("Story insert error:", err));
    } else {
      dbFields.updated_at = new Date().toISOString();
      supabase.from("stories").update(dbFields).eq("id", id).then(() => {}).catch(() => {});
    }
  };

  // ── Handle kanban drag-drop ─────────────────────────────────
  // Must be defined after updateStory — its dep array closes over the
  // updateStory reference, so the TDZ rule would otherwise crash render.
  const handleDrop = useCallback((storyId, colKey) => {
    const col = KANBAN_COLS.find(c => c.key === colKey);
    if (!col) return;
    const newStatus = col.statuses[0];
    const story = stories.find(s => s.id === storyId);
    const updates = { status: newStatus };
    if (colKey === "published") {
      updates.sent_to_web = true;
      updates.sentToWeb = true;
      const now = new Date().toISOString();
      if (!story?.published_at && !story?.publishedAt) updates.published_at = now;
      if (!story?.first_published_at && !story?.firstPublishedAt) {
        updates.first_published_at = story?.published_at || story?.publishedAt || now;
      }
    } else if (colKey === "ready") {
      updates.sent_to_web = false;
      updates.sentToWeb = false;
    }
    updateStory(storyId, updates);
    if (bus) bus.emit("story.statusChanged", { storyId, newStatus, column: colKey });
  }, [stories, bus]);

  const publishToWeb = (story) => {
    updateStory(story.id, {
      status: "Ready",
      sent_to_web: true,
      published_at: story.published_at || new Date().toISOString(),
    });
    if (bus) bus.emit("story.published", { storyId: story.id, title: story.title });
  };

  // ── Issues for planning tab ─────────────────────────────────
  // Print-side planner — keep sent-to-press issues visible (they're
  // still relevant context for layout cleanup and post-press lookups).
  // Date filter still scopes to today-and-forward to keep the sidebar
  // from filling with archive issues.
  const futureIssues = useMemo(() => {
    const byPub = {};
    (issues || [])
      .filter(i => i.date >= new Date().toISOString().slice(0, 10) && (fPub === "all" || i.publicationId === fPub || i.pubId === fPub))
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .forEach(i => {
        const pk = i.publicationId || i.pubId;
        if (!byPub[pk]) byPub[pk] = [];
        if (byPub[pk].length < 2) byPub[pk].push(i);
      });
    return Object.values(byPub).flat().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [issues, fPub]);

  // Sibling publication context for the selected issue
  const siblingCtx = useMemo(() => {
    if (!selIssue) return null;
    const iss = issues.find(i => i.id === selIssue);
    if (!iss) return null;
    const pub = (pubs || []).find(p => p.id === iss.pubId);
    const siblings = pub?.settings?.shared_content_with || [];
    if (siblings.length === 0) return null;
    // Find sibling issues with the same date
    const siblingIssues = siblings.map(sibId => {
      const sibIss = issues.find(i => i.pubId === sibId && i.date === iss.date);
      const sibPub = (pubs || []).find(p => p.id === sibId);
      return sibIss && sibPub ? { issue: sibIss, pub: sibPub } : null;
    }).filter(Boolean);
    return siblingIssues.length > 0 ? siblingIssues : null;
  }, [selIssue, issues, pubs]);

  const issueStories = useMemo(() => {
    if (!selIssue) return [];
    // Print-side planner — never filters by web-publish state. A story
    // can be live on the web AND still need print attention.
    //
    // Anchor strictly on print_issue_id. The legacy issue_id column
    // (single-issue model from before print/web were split) sometimes
    // drifts from print_issue_id, which made stories appear under two
    // issue dates in the sidebar. print_issue_id is the editor-set
    // value and the canonical print anchor.
    let list = stories
      .filter(s => s.print_issue_id === selIssue);
    // Include sibling pub stories when toggled on
    if (showSiblings && siblingCtx) {
      const siblingIds = new Set(siblingCtx.map(sc => sc.issue.id));
      const sibStories = stories
        .filter(s => siblingIds.has(s.print_issue_id))
        .map(s => ({ ...s, _fromSibling: true, _siblingPub: siblingCtx.find(sc => sc.issue.id === s.print_issue_id)?.pub?.name }));
      list = [...list, ...sibStories];
    }
    return list.sort((a, b) => {
      const av = a[sortCol] || "", bv = b[sortCol] || "";
      const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [stories, selIssue, showSiblings, siblingCtx, sortCol, sortDir]);

  // ── Web queue: Ready stories that haven't been pushed to web yet ──
  const webQueue = useMemo(() => {
    return filtered
      .filter(s => {
        const readyForWeb = s.status === "Ready" && !(s.sent_to_web || s.sentToWeb);
        const isRepub = needsRepublish(s);
        return readyForWeb || isRepub;
      })
      .sort((a, b) => {
        // Urgent/high priority first
        const priOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
        const pa = priOrder[a.priority || "normal"] ?? 2;
        const pb = priOrder[b.priority || "normal"] ?? 2;
        if (pa !== pb) return pa - pb;
        // Then by due date
        return new Date(a.due_date || "9999") - new Date(b.due_date || "9999");
      });
  }, [filtered]);

  // ── Assignees for filter ────────────────────────────────────
  const assignees = useMemo(() => {
    const ids = [...new Set(stories.map(s => s.assigned_to).filter(Boolean))];
    return ids.map(id => ({ id, name: tn(id, team) }));
  }, [stories, team]);

  // ── Stats ───────────────────────────────────────────────────
  const stats = useMemo(() => {
    const now = new Date();
    const weekFromNow = new Date(); weekFromNow.setDate(weekFromNow.getDate() + 7);
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const todayStr = now.toISOString().slice(0, 10);

    const needsEditCount = filtered.filter(s => s.status === "Edit").length;
    const dueThisWeek = filtered.filter(s => {
      if (!s.due_date || isPublished(s)) return false;
      const d = new Date(s.due_date);
      return d <= weekFromNow;
    });
    const dueThisWeekCount = dueThisWeek.length;
    const hasOverdue = dueThisWeek.some(s => new Date(s.due_date) < now);
    const readyForWebCount = filtered.filter(s => s.status === "Ready" && !(s.sent_to_web || s.sentToWeb)).length;
    const publishedThisWeekCount = filtered.filter(s => (s.sent_to_web || s.sentToWeb) && s.published_at && new Date(s.published_at) >= weekAgo).length;

    return {
      needsEditCount,
      dueThisWeekCount,
      hasOverdue,
      readyForWebCount,
      publishedThisWeekCount,
      needsRepublish: filtered.filter(s => needsRepublish(s)).length,
    };
  }, [filtered]);

  // ── If editor is open, render full-page StoryEditor ─────
  if (editorOpen && selected) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 999, background: Z.bg, display: "flex", flexDirection: "column" }}>
        <Suspense fallback={<LazyFallback />}>
          <StoryEditor
            story={selected}
            onClose={closeEditor}
            onUpdate={updateStory}
            pubs={pubs}
            issues={issues}
            team={team}
            bus={bus}
            publishStory={publishStory}
            unpublishStory={unpublishStory}
          />
        </Suspense>
      </div>
    );
  }

  // ── Archive view ────────────────────────────────────────────
  // Flat list of published stories in a date range. No stats, no
  // kanban — just a searchable / pub-filterable archive with a date
  // window. Default window is the past 7 days.
  if (viewScope === "archive") {
    const sorted = [...filtered].sort((a, b) =>
      (b.published_at || b.publishedAt || "").localeCompare(a.published_at || a.publishedAt || "")
    );
    const presetOptions = [
      { value: "7days",     label: "7 days" },
      { value: "thisMonth", label: "This month" },
      { value: "lastMonth", label: "Last month" },
      { value: "custom",    label: "Custom" },
    ];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <TB tabs={["Active", "Archive"]} active="Archive" onChange={(v) => setViewScope(v.toLowerCase())} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <SB value={sr} onChange={setSr} placeholder="Search archive…" />
            <Sel value={fPub} onChange={e => setFPub(e.target.value)} options={[{ value: "all", label: "All Publications" }, ...pubs.map(p => ({ value: p.id, label: p.name }))]} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <FilterPillStrip options={presetOptions} value={archivePreset} onChange={applyArchivePreset} />
          {archivePreset === "custom" && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
                From
                <input type="date" value={archiveFrom} onChange={e => setArchiveFrom(e.target.value)}
                  style={{ padding: "4px 8px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sf, color: Z.tx, fontSize: FS.sm }} />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
                To
                <input type="date" value={archiveTo} onChange={e => setArchiveTo(e.target.value)}
                  style={{ padding: "4px 8px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sf, color: Z.tx, fontSize: FS.sm }} />
              </label>
            </>
          )}
          <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, marginLeft: "auto" }}>
            {archiveFrom} → {archiveTo} · {sorted.length} {sorted.length === 1 ? "story" : "stories"}
          </div>
        </div>
        {sorted.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: Z.tm, fontSize: FS.sm, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}` }}>
            No published stories in this range.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
            {sorted.map(s => (
              <StoryCard key={s.id} story={s} pubs={pubs} team={team} onClick={() => openDetail(s)} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Action row — title moved to TopBar via usePageHeader. ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <TB tabs={["Active", "Archive"]} active={viewScope === "archive" ? "Archive" : "Active"} onChange={(v) => setViewScope(v.toLowerCase())} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <SB value={sr} onChange={setSr} placeholder={sr ? "Searching all stories…" : "Search stories…"} />
          <Sel value={fPub} onChange={e => setFPub(e.target.value)} options={[{ value: "all", label: "All Publications" }, ...pubs.map(p => ({ value: p.id, label: p.name }))]} />
          <Btn sm onClick={async () => {
            const issueId = selIssue || null;  // null, not "" — issue_id is an FK
            const pubId = issueId ? (issues.find(i => i.id === issueId)?.publicationId || issues.find(i => i.id === issueId)?.pubId || "") : (fPub !== "all" ? fPub : pubs[0]?.id || "");
            const row = {
              title: "", status: "Draft", author: "",
              publication_id: pubId,
              issue_id: issueId, print_issue_id: issueId,
              category: "News", priority: "normal",
              web_status: "none", print_status: "none",
              site_id: pubId,
            };
            const { data, error } = await supabase.from("stories").insert(row).select().single();
            if (error) { console.error("New story insert failed:", error); return; }
            if (!data) return;
            const mapped = {
              id: data.id, title: "", status: "Draft", author: "",
              publication_id: pubId, publication: pubId,
              issueId, issue_id: issueId, print_issue_id: issueId,
              category: "News", priority: "normal",
              web_status: "none", print_status: "none",
              created_at: data.created_at,
            };
            setStories(prev => [mapped, ...prev]);
            // Open the editor immediately so the user can type the title.
            // Creating a blank row and dropping them back on the list
            // reads as "button did nothing."
            openDetail(mapped);
          }}><Ic.plus size={12} /> New Story</Btn>
        </div>
      </div>

      {/* ── Stats bar ─────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <GlassStat label="Needs Editing" value={stats.needsEditCount} color={Z.wa} />
        <GlassStat label="Due This Week" value={stats.dueThisWeekCount} color={stats.hasOverdue ? Z.da : Z.wa} />
        <GlassStat label="Ready for Web" value={stats.readyForWebCount} color={Z.ac} />
        <GlassStat label="Published This Week" value={stats.publishedThisWeekCount} color={Z.su} />
      </div>

      {/* ── Top Performing This Week ────────────────────── */}
      {(() => {
        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
        const topStories = filtered
          .filter(s => (s.sent_to_web || s.sentToWeb) && s.published_at && new Date(s.published_at) >= weekAgo && (s.view_count || s.viewCount || 0) > 0)
          .sort((a, b) => (b.view_count || b.viewCount || 0) - (a.view_count || a.viewCount || 0))
          .slice(0, 5);
        if (topStories.length === 0) return null;
        return (
          <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", background: Z.sf, borderRadius: Ri, border: `1px solid ${Z.bd}`, overflowX: "auto" }}>
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.su, fontFamily: COND, whiteSpace: "nowrap", flexShrink: 0 }}>Top This Week</span>
            {topStories.map((s, i) => (
              <div key={s.id} onClick={() => openDetail(s)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: i === 0 ? (Z.su + "12") : Z.bg, borderRadius: Ri, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, border: `1px solid ${i === 0 ? Z.su + "30" : "transparent"}` }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: i === 0 ? Z.su : Z.ac, fontFamily: COND }}>{(s.view_count || s.viewCount || 0).toLocaleString()}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: Z.tx, fontFamily: COND, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Tab bar + filters ─────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, paddingBottom: 8 }}>
        {/* Tabs — standard pill selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <TB tabs={TABS.map(t => t.label)} active={TABS.find(t => t.id === tab)?.label || "Workflow"} onChange={v => { const match = TABS.find(t => t.label === v); if (match) setTab(match.id); }} />
          {stats.needsRepublish > 0 && (
            <span style={{ width: 18, height: 18, borderRadius: "50%", background: Z.wa, color: INV.light, fontSize: FS.micro, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{stats.needsRepublish}</span>
          )}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {/* Assignee filter */}
          {assignees.length > 0 && (
            <Sel value={fAssignee} onChange={e => setFAssignee(e.target.value)} options={[{ value: "all", label: "All Writers" }, ...assignees.map(a => ({ value: a.id, label: a.name }))]} />
          )}
        </div>
      </div>

      {/* ── Tab Content ───────────────────────────────────── */}

      {/* KANBAN VIEW */}
      {tab === "workflow" && (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", minHeight: 400, paddingBottom: 8 }}>
          {KANBAN_COLS.map(col => (
            <KanbanCol
              key={col.key}
              col={col}
              stories={kanbanData[col.key] || []}
              pubs={pubs}
              team={team}
              onDrop={handleDrop}
              onClick={openDetail}
            />
          ))}
        </div>
      )}

      {/* STORIES VIEW (merged Issue Planning + Stories table) */}
      {tab === "stories" && (
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, minHeight: 400 }}>
          {/* Issue sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", maxHeight: 600 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: Z.tm, fontFamily: COND, padding: "4px 0", marginBottom: 4 }}>Upcoming Issues</div>
            {futureIssues.length === 0 && <div style={{ fontSize: 12, color: Z.tm, padding: 12 }}>No upcoming issues</div>}
            {futureIssues.map(iss => {
              const stCount = stories.filter(s => s.print_issue_id === iss.id || s.issue_id === iss.id).length;
              const isSelected = selIssue === iss.id;
              return (
                <div key={iss.id} onClick={() => setSelIssue(iss.id)} style={{
                  padding: "8px 10px", borderRadius: Ri, cursor: "pointer",
                  background: isSelected ? Z.ac + "18" : "transparent",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: Z.tx, fontFamily: COND }}>{pn(iss.publicationId || iss.pubId, pubs)}</div>
                  <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND, marginTop: 2 }}>
                    {iss.date ? new Date(iss.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : iss.label || "Issue"} · {stCount} stories
                  </div>
                </div>
              );
            })}
          </div>

          {/* Issue detail / story data table */}
          <div>
            {!selIssue ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: Z.tm, fontSize: 13 }}>
                Select an issue to view assigned stories
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: Z.tx, fontFamily: COND }}>
                    Stories for {issues.find(i => i.id === selIssue)?.label || "this issue"}
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {siblingCtx && (
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: showSiblings ? "#3B82F6" : Z.tm, fontFamily: COND, cursor: "pointer" }}>
                        <input type="checkbox" checked={showSiblings} onChange={e => setShowSiblings(e.target.checked)} style={{ accentColor: "#3B82F6" }} />
                        + {siblingCtx.map(sc => sc.pub.name).join(", ")}
                      </label>
                    )}
                    <span style={{ fontSize: 11, color: Z.tm, fontFamily: COND }}>{issueStories.length} stories</span>
                  </div>
                </div>
                {/* Print status pipeline */}
                <div style={{ display: "flex", gap: 2, marginBottom: 8 }}>
                  {PRINT_STAGES.slice(1).map(stage => {
                    const count = issueStories.filter(s => s.print_status === stage.key).length;
                    return (
                      <div key={stage.key} style={{ flex: 1, textAlign: "center", padding: "6px 4px", background: count > 0 ? Z.ac + "12" : Z.sa, borderRadius: Ri }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: count > 0 ? Z.ac : Z.tm, fontFamily: DISPLAY }}>{count}</div>
                        <div style={{ fontSize: FS.micro, fontWeight: 600, color: Z.tm, fontFamily: COND }}>{stage.label}</div>
                      </div>
                    );
                  })}
                </div>
                {/* Mini flatplan */}
                {(() => {
                  const mfIssue = issues.find(i => i.id === selIssue);
                  if (!mfIssue) return null;
                  const mfPages = Array.from({ length: mfIssue.pageCount || 16 }, (_, i) => i + 1);
                  const getStories = (pg) => issueStories.filter(s => { const p = String(s.page || s.page_number || ""); const pages = p.split(/[,-]/).map(Number).filter(Boolean); if (p.includes("-")) { const [a, b] = p.split("-").map(Number); return pg >= a && pg <= b; } return pages.includes(pg); });
                  return <div style={{ background: Z.sa, borderRadius: Ri, padding: "8px 10px", marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: Z.tm, fontFamily: COND, marginBottom: 4 }}>Page Map</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                      {mfPages.map(pg => {
                        const pgStories = getStories(pg);
                        const hasContent = pgStories.length > 0;
                        return <div key={pg} style={{ width: 40, height: 48, border: `1px solid ${Z.bd}`, borderRadius: 2, background: hasContent ? Z.ac + "12" : Z.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: 1, overflow: "hidden" }}>
                          <div style={{ fontSize: 8, fontWeight: 700, color: Z.td }}>{pg}</div>
                          {pgStories.slice(0, 2).map(s => <div key={s.id} style={{ fontSize: 6, fontWeight: 600, color: Z.ac, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%", textAlign: "center" }}>{(s.title || "").slice(0, 10)}</div>)}
                        </div>;
                      })}
                    </div>
                  </div>;
                })()}
                {/* Data table with inline editing */}
                <div style={{ overflow: "hidden" }}>
                  <DataTable>
                    <thead>
                      <tr>
                        {[
                          { key: "title", label: "Title" },
                          { key: "author", label: "Author" },
                          { key: "category", label: "Section" },
                          { key: "status", label: "Status" },
                          { key: "page_number", label: "Page" },
                          { key: "priority", label: "Pri" },
                          { key: "word_limit", label: "Limit" },
                          { key: "_img", label: "Img" },
                          { key: "_delete", label: "" },
                        ].map(col => (
                          <th key={col.key} onClick={col.key !== "_delete" ? () => { if (sortCol === col.key) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortCol(col.key); setSortDir("asc"); } } : undefined} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, color: Z.tm, fontSize: 11, cursor: col.key !== "_delete" ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap", width: col.key === "_delete" ? 32 : undefined }}>
                            {col.label} {sortCol === col.key ? (sortDir === "asc" ? "\u25B2" : "\u25BC") : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {issueStories.length === 0 && (
                        <tr><td colSpan={9} style={{ padding: 24, textAlign: "center", color: Z.tm }}>No stories assigned to this issue yet</td></tr>
                      )}
                      {issueStories.map(s => {
                        const inpS = { background: "transparent", border: `1px solid ${Z.bd}`, borderRadius: 3, color: Z.tx, fontSize: 12, fontFamily: COND, outline: "none", padding: "3px 6px", width: "100%", boxSizing: "border-box" };
                        const selS = { ...inpS, cursor: "pointer", WebkitAppearance: "none", MozAppearance: "none", appearance: "none" };
                        const hasSavedTitle = s.title && s.title !== "";
                        const isSibling = s._fromSibling;
                        return <tr key={s.id} style={{ borderBottom: `1px solid ${Z.bd}`, opacity: isSibling ? 0.6 : 1 }}>
                          <td style={{ padding: "5px 8px", maxWidth: 260 }}>
                            {isSibling && <span style={{ fontSize: 9, fontWeight: 800, color: "#3B82F6", background: "rgba(59,130,246,0.1)", padding: "1px 5px", borderRadius: 3, marginRight: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{s._siblingPub?.split(" ")[0]}</span>}
                            {hasSavedTitle
                              ? <span onClick={() => !isSibling && openDetail(s)} style={{ fontWeight: 700, color: isSibling ? Z.tm : Z.ac, cursor: isSibling ? "default" : "pointer", display: "inline", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                              : <input defaultValue="" placeholder="Story title..." autoFocus onBlur={e => updateStory(s.id, { title: e.target.value })} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }} style={{ ...inpS, fontWeight: 700 }} />
                            }
                          </td>
                          <td style={{ padding: "5px 8px" }}>
                            <Sel value={s.author || ""} onChange={e => updateStory(s.id, { author: e.target.value })} options={[{ value: "", label: "—" }, ...[...new Set(stories.map(x => x.author).filter(Boolean))].sort().map(a => ({ value: a, label: a }))]} style={{ padding: "3px 24px 3px 6px" }} />
                          </td>
                          <td style={{ padding: "5px 8px" }}>
                            <Sel value={s.category || ""} onChange={e => updateStory(s.id, { category: e.target.value })} options={[{ value: "", label: "—" }, ...["News", "Business", "Lifestyle", "Food", "Wine", "Culture", "Sports", "Opinion", "Events", "Community", "Outdoors", "Environment", "Real Estate", "Agriculture", "Marine", "Government", "Schools", "Travel", "Obituaries", "Crime"].map(c => ({ value: c, label: c }))]} style={{ padding: "3px 24px 3px 6px" }} />
                          </td>
                          {(() => { const sc = statusColorsOn ? (statusColors[s.status] || statusColors.Draft) : null; return (
                          <td style={{ padding: "5px 8px" }}>
                            <Sel value={s.status || "Draft"} onChange={e => updateStory(s.id, { status: e.target.value })} options={STORY_STATUSES.map(st => ({ value: st, label: st }))} style={{ padding: "3px 24px 3px 6px", color: sc ? "#fff" : Z.tx, fontWeight: 700, background: sc?.fg || "transparent", border: "none", borderRadius: 20 }} />
                          </td>
                          ); })()}
                          <td style={{ padding: "5px 8px", width: 60 }}>
                            <Sel value={String(s.page_number || s.page || "")} onChange={e => updateStory(s.id, { page_number: e.target.value, page: e.target.value })} options={[{ value: "", label: "—" }, ...Array.from({ length: issues.find(i => i.id === selIssue)?.pageCount || 24 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))]} style={{ padding: "3px 24px 3px 6px", width: 55 }} />
                          </td>
                          <td style={{ padding: "5px 8px", width: 50 }}>
                            <Sel value={String(s.priority || "4")} onChange={e => updateStory(s.id, { priority: e.target.value })} options={PRIORITY_OPTIONS} style={{ padding: "3px 24px 3px 6px", width: 45 }} />
                          </td>
                          <td style={{ padding: "5px 8px", width: 55 }}>
                            <input value={s.word_limit || ""} onChange={e => updateStory(s.id, { word_limit: e.target.value ? Number(e.target.value) : null })} placeholder="—" style={{ ...inpS, width: 45, textAlign: "center", color: s.word_limit && (s.word_count || s.wordCount || 0) > s.word_limit ? Z.da : Z.tm }} />
                          </td>
                          <td style={{ padding: "5px 4px", width: 32, textAlign: "center", fontSize: 12 }}>{(s.featured_image_url || s.featuredImageUrl || s.images > 0) ? <span title="Has image" style={{ color: Z.su }}>*</span> : <span style={{ color: Z.td }}>—</span>}</td>
                          <td style={{ padding: "5px 4px", width: 32, textAlign: "center" }}>
                            <button onClick={() => deleteStory(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.td, fontSize: 14, padding: 2, lineHeight: 1 }} title="Delete story">{"\u00D7"}</button>
                          </td>
                        </tr>;
                      })}
                    </tbody>
                  </DataTable>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WEB PUBLISHING QUEUE */}
      {tab === "web" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: Z.tm, fontFamily: COND, padding: "4px 0" }}>
            Ready to Publish / Needs Republish ({webQueue.length})
          </div>
          {webQueue.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: Z.tm, fontSize: FS.base, background: Z.sa, borderRadius: Ri }}>
              No stories waiting for web publishing
            </div>
          )}
          {webQueue.map(s => {
            const isRepub = needsRepublish(s);
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: Ri, borderLeft: `3px solid ${isRepub ? Z.wa : ACCENT.blue}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: Z.tx, fontFamily: COND }}>{s.title}</span>
                    {isRepub && (
                      <span style={{ fontSize: FS.micro, fontWeight: 700, padding: "1px 6px", borderRadius: Ri, background: Z.wa + "18", color: Z.wa }}>
                        Updated since last publish
                      </span>
                    )}
                    <Badge status={s.status} small />
                  </div>
                  <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND, marginTop: 2 }}>
                    {pn(s.publication_id || s.publication, pubs)} · {s.author || "No author"} · {s.category || "Uncategorized"}
                    {s.last_significant_edit_at && ` · Edited ${ago(s.last_significant_edit_at)}`}
                  </div>
                </div>
                <Btn sm onClick={() => publishToWeb(s)} style={{ whiteSpace: "nowrap" }}>
                  <Ic.send size={11} /> {isRepub ? "Republish" : "Publish to Web"}
                </Btn>
              </div>
            );
          })}
        </div>
      )}

      {/* EDITIONS */}
      {tab === "editions" && (
        <Suspense fallback={<LazyFallback />}>
          <EditionManager pubs={pubs} editions={editions} setEditions={setEditions} />
        </Suspense>
      )}

      {/* Pulse animation for republish badge */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
};

export default EditorialDashboard;
