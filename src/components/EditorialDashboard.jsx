import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense, memo, Fragment } from "react";
import { Z, SC, COND, DISPLAY, ACCENT, FS, FW, R, Ri, INV, CARD } from "../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Card, SB, TB, Modal, FilterBar, TabRow, TabPipe, GlassStat, DataTable, FilterPillStrip } from "./ui";
import FuzzyPicker from "./FuzzyPicker";
import { STORY_STATUSES } from "../constants";
import { supabase } from "../lib/supabase";
import { useDialog } from "../hooks/useDialog";
import { useSaveStatus } from "../hooks/useSaveStatus";
import { bulkUpdateStories } from "../lib/storyBulkUpdate";
import IssuePlanningErrorBoundary from "./editorial/issue-planning/IssuePlanningErrorBoundary";
import IssuePlanningTab from "./editorial/issue-planning/IssuePlanningTab";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { loadSectionsForIssue, createSection as createSectionDb, updateSection as updateSectionDb, deleteSection as deleteSectionDb, applyDefaultSectionsToIssue, sectionForPage, pageLabel } from "../lib/sections";

// Heavy modules — lazy-load so the kanban view doesn't pull in tiptap or pdfjs
const StoryEditor = lazy(() => import("./editor/StoryEditor"));
const EditionManager = lazy(() => import("../pages/EditionManager"));
const Flatplan = lazy(() => import("../pages/Flatplan"));
import EntityThread from "./EntityThread";
import RegenerateAsNewDraftButton from "./editor/RegenerateAsNewDraftButton";
import StoryEditorErrorBoundary from "./editor/StoryEditorErrorBoundary";
const LazyFallback = () => <div style={{ padding: 40, textAlign: "center", color: Z.td, fontSize: FS.base }}>Loading…</div>;

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
  Edit:     { bg: "color-mix(in srgb, var(--action) 12%, transparent)",  fg: "var(--action)" },
  Ready:    { bg: "rgba(34,197,94,0.12)",   fg: "#16a34a" },
  Archived: { bg: "rgba(138,149,168,0.08)", fg: "#9ca3af" },
};

const STORY_TYPES = ["article", "column", "letter", "obituary", "legal_notice", "calendar_event", "press_release", "opinion"];
const SOURCES = ["staff", "freelance", "syndicated", "press_release", "community", "ai_assisted"];

const TABS = [
  { id: "workflow", label: "Workflow", icon: "flat" },
  { id: "stories", label: "Issue Planning", icon: "pub" },
  { id: "flatplan", label: "Flatplan", icon: "flat" },
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
        <span style={{ fontSize: FS.base, fontWeight: 700, color: Z.tx, lineHeight: 1.3, fontFamily: COND, flex: 1 }}>
          {story.title || "Untitled"}
        </span>
      </div>

      {/* Meta row */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: FS.micro, color: Z.tm, fontFamily: COND }}>
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
const KanbanCol = memo(function KanbanCol({ col, stories, pubs, team, onDrop, onClick }) {
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

      {/* Drop zone — viewport-derived max height (May Sim P2.2). Old
          fixed maxHeight:420 silently cut off cards 7-14 when Camille
          had 14 stories in Edit on 5/4. Now scales to the viewport so
          the column scrolls within itself instead of clipping. */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", gap: 8,
        overflowY: "auto", maxHeight: "calc(100vh - 280px)",
        background: dragOver ? col.color + "08" : "transparent",
        borderRadius: Ri, transition: "background 0.15s",
      }}>
        {stories.map(s => (
          <StoryCard key={s.id} story={s} pubs={pubs} team={team} onClick={onClick} />
        ))}
        {stories.length === 0 && (
          <div style={{ padding: 16, textAlign: "center", fontSize: FS.xs, color: Z.td, fontStyle: "italic" }}>
            Drop stories here
          </div>
        )}
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════
// MAIN EDITORIAL DASHBOARD
// ══════════════════════════════════════════════════════════════════
const EditorialDashboard = ({ stories: storiesRaw, setStories, pubs, issues, setIssues, team, bus, editorialPermissions, currentUser, publishStory, unpublishStory, editions, setEditions, isActive, deepLink,
  // Flatplan-tab props — forwarded straight through so the embedded Flatplan
  // uses the same shared state (sales, placements, page-story map) as the
  // top-level Flatplan route.
  jurisdiction, sales, setSales, updateSale, clients, contracts, globalPageStories, setGlobalPageStories, lastFlatplanIssue, lastFlatplanPub, onFlatplanSelectionChange, onNavigate }) => {
  // Publish TopBar header while this module is the active page. Gated on
  // isActive because App.jsx keeps modules mounted after first visit.
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({
        breadcrumb: [{ label: "Home" }, { label: "Production" }],
        title: "Production",
      });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);
  const stories = storiesRaw || [];
  const dialog = useDialog();
  // IP Wave 1: every Issue-Planning write flows through this so RLS
  // rejections, network failures, and 0-rows-affected results show up
  // as a visible badge with retry — instead of disappearing into
  // console.error like they used to.
  const save = useSaveStatus();

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
  // Issue-Planning state (collapsedGroups, draggingId, dropTarget,
  // showSiblings, issueSections, sidebarCollapsed, sortCol/Dir)
  // moved into IssuePlanningTab as part of IP Wave 2 decomposition.

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

  const [addingInlineStory, setAddingInlineStory] = useState(false);

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

      // Text search composes with view-scope (used to short-circuit the
      // scope check, which made Archive's date window silently no-op
      // the moment the editor typed a query).
      if (sr) {
        const q = sr.toLowerCase();
        const match = (s.title || "").toLowerCase().includes(q) ||
          (s.author || "").toLowerCase().includes(q) ||
          (s.category || "").toLowerCase().includes(q);
        if (!match) return false;
      }

      if (viewScope === "active") {
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

  const updateStory = useCallback((id, updates) => {
    if (updates._deleted) {
      setStories(prev => prev.filter(s => s.id !== id));
      return;
    }
    // Optimistic local update
    setStories(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    if (selected?.id === id) setSelected(s => ({ ...s, ...updates }));

    if (!id) return;

    // Build the DB-shape patch
    const dbFields = {};
    if (updates.title             !== undefined) dbFields.title = updates.title;
    if (updates.author            !== undefined) dbFields.author = updates.author;
    if (updates.category          !== undefined) dbFields.category = updates.category;
    if (updates.status            !== undefined) dbFields.status = updates.status;
    if (updates.page              !== undefined) dbFields.page = updates.page;
    if (updates.page_number       !== undefined) dbFields.page = updates.page_number;
    if (updates.web_status        !== undefined) dbFields.web_status = updates.web_status;
    if (updates.sent_to_web       !== undefined) dbFields.sent_to_web = updates.sent_to_web;
    if (updates.published_at      !== undefined) dbFields.published_at = updates.published_at;
    if (updates.first_published_at !== undefined) dbFields.first_published_at = updates.first_published_at;
    if (updates.word_limit        !== undefined) dbFields.word_limit = updates.word_limit;
    if (updates.priority          !== undefined) dbFields.priority = updates.priority;
    if (updates.has_images        !== undefined) dbFields.has_images = !!updates.has_images;
    if (updates.jump_to_page      !== undefined) {
      const n = parseInt(updates.jump_to_page);
      dbFields.jump_to_page = isNaN(n) ? null : n;
    }
    if (Object.keys(dbFields).length === 0) return;

    if (dbFields.page !== undefined) {
      const pgNum = parseInt(String(dbFields.page));
      dbFields.page = isNaN(pgNum) ? null : pgNum;
    }

    // INSERT path for client-side temp ids ("story-…") — only after title is set
    if (String(id).startsWith("story-")) {
      const full = storiesRaw.find(s => s.id === id) || {};
      const titleVal = updates.title || full.title || "";
      if (!titleVal.trim()) return;
      const pubId = full.publication_id || full.publication || null;
      const issId = full.print_issue_id || full.issue_id || full.issueId || null;
      const insertRow = {
        title: titleVal,
        author: full.author || null,
        status: "Draft",
        category: full.category || "News",
        publication_id: pubId,
        print_issue_id: issId,
        page: dbFields.page || null,
        ...dbFields,
      };
      const doInsert = async () => {
        const { data, error } = await supabase
          .from("stories")
          .insert(insertRow)
          .select("id")
          .single();
        if (error) throw error;
        if (data?.id) {
          setStories(prev => prev.map(s => s.id === id ? { ...s, id: data.id } : s));
        }
      };
      save.track(doInsert(), { retry: () => save.track(doInsert()) }).catch(() => {});
      return;
    }

    // UPDATE path. .select() back so 0-rows-affected (RLS rejection)
    // turns into a thrown error — PostgREST doesn't throw on its own,
    // it just returns an empty array.
    dbFields.updated_at = new Date().toISOString();
    const doUpdate = async () => {
      const { data, error } = await supabase
        .from("stories")
        .update(dbFields)
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Update affected 0 rows. The row may have been deleted, or you don't have permission.");
      }
    };
    save.track(doUpdate(), { retry: () => save.track(doUpdate()) }).catch(() => {});
  }, [storiesRaw, selected, setStories, save]);

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





  // ── Inline new-story creator scoped to the selected issue ──
  // Used by the "+ New Story" affordance under the Page Map. Inserts
  // a blank row tagged with the current issue + its publication so the
  // user can type the title inline in the data table without leaving
  // the planner. Mirrors the schema-side behavior of the toolbar
  // "New Story" button but skips the openDetail call.
  const addInlineStoryForIssue = useCallback(async () => {
    if (!selIssue || addingInlineStory) return;
    const issue = issues.find(i => i.id === selIssue);
    if (!issue) return;
    const pubId = issue.publicationId || issue.pubId || null;
    // Auto-priority: highest numeric priority in this issue + 1 (capped
    // at 6). Lets editors hit "+ New Story" repeatedly and get an
    // ordered priority stack without touching the dropdown each time.
    const usedPriorities = (stories || [])
      .filter(s => s.print_issue_id === selIssue)
      .map(s => parseInt(s.priority))
      .filter(n => !isNaN(n));
    const nextPriority = Math.min(6, (usedPriorities.length ? Math.max(...usedPriorities) : 0) + 1);

    // IP Wave 1: keep the button locked while the insert is in flight
    // so a 5×-rapid-click doesn't insert 5 rows. Reset only on settle
    // (success or failure) — failure surfaces the save badge and the
    // user can click again rather than being silently no-op'd.
    setAddingInlineStory(true);
    const row = {
      title: "", status: "Draft", author: "",
      publication_id: pubId,
      issue_id: selIssue, print_issue_id: selIssue,
      category: "News", priority: String(nextPriority),
      web_status: "none", print_status: "none",
      site_id: pubId,
    };
    const doInsert = async () => {
      const { data, error } = await supabase.from("stories").insert(row).select().single();
      if (error) throw error;
      if (!data) throw new Error("Insert returned no row");
      const mapped = {
        id: data.id, title: "", status: "Draft", author: "",
        publication_id: pubId, publication: pubId,
        issueId: selIssue, issue_id: selIssue, print_issue_id: selIssue,
        category: "News", priority: String(nextPriority),
        web_status: "none", print_status: "none",
        created_at: data.created_at,
      };
      setStories(prev => [mapped, ...prev]);
    };
    try {
      await save.track(doInsert(), { retry: () => save.track(doInsert()) });
    } catch (_) {
      // Already surfaced via save.error
    } finally {
      setAddingInlineStory(false);
    }
  }, [selIssue, issues, addingInlineStory, setStories, stories, save]);

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
          <StoryEditorErrorBoundary onClose={closeEditor}>
            <StoryEditor
              story={selected}
              onClose={closeEditor}
              onUpdate={updateStory}
              onDraftCreated={(newStory) => {
                // Phase C of editorial-generate-v2-spec: prepend the new
                // draft to local state and switch the editor to it. The
                // user lands on the fresh draft, ready to refine.
                setStories(prev => [newStory, ...prev]);
                setSelected(newStory);
              }}
              onOpenStory={(id) => {
                const target = stories.find(s => s.id === id);
                if (target) setSelected(target);
              }}
              pubs={pubs}
              issues={issues}
              team={team}
              bus={bus}
              currentUser={currentUser}
              publishStory={publishStory}
              unpublishStory={unpublishStory}
            />
          </StoryEditorErrorBoundary>
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
              <div key={s.id} style={{ position: "relative" }}>
                <StoryCard story={s} pubs={pubs} team={team} onClick={() => openDetail(s)} />
                <div style={{ position: "absolute", top: 8, right: 8, zIndex: 1 }}>
                  <RegenerateAsNewDraftButton
                    sourceStory={s}
                    viewerId={currentUser?.id}
                    viewerName={currentUser?.name}
                    viewerRole={currentUser?.role}
                    viewerIsAdmin={!!currentUser?.permissions?.includes?.("admin")}
                    onCreated={(newStory) => {
                      setStories(prev => [newStory, ...prev]);
                      openDetail(newStory);
                    }}
                  />
                </div>
              </div>
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
            <span style={{ fontSize: FS.micro, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.su, fontFamily: COND, whiteSpace: "nowrap", flexShrink: 0 }}>Top This Week</span>
            {topStories.map((s, i) => (
              <div key={s.id} onClick={() => openDetail(s)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: i === 0 ? (Z.su + "12") : Z.bg, borderRadius: Ri, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, border: `1px solid ${i === 0 ? Z.su + "30" : "transparent"}` }}>
                <span style={{ fontSize: FS.xs, fontWeight: 800, color: i === 0 ? Z.su : Z.ac, fontFamily: COND }}>{(s.view_count || s.viewCount || 0).toLocaleString()}</span>
                <span style={{ fontSize: FS.xs, fontWeight: 600, color: Z.tx, fontFamily: COND, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</span>
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

      {/* STORIES VIEW — IP Wave 2 lifted into IssuePlanningTab */}
      {tab === "stories" && (
        <IssuePlanningTab
          stories={filtered}
          setStories={setStories}
          pubs={pubs}
          issues={issues}
          team={team}
          sales={sales}
          currentUser={currentUser}
          statusColors={statusColors}
          statusColorsOn={statusColorsOn}
          fPub={fPub}
          save={save}
          selIssue={selIssue}
          setSelIssue={setSelIssue}
          openDetail={openDetail}
          onUpdateStory={updateStory}
          onDeleteStory={deleteStory}
          onAddInlineStoryForIssue={addInlineStoryForIssue}
          addingInlineStory={addingInlineStory}
        />
      )}

      {/* FLATPLAN — embedded, seeded from the currently-selected Issue Planning
          issue (selIssue). The outer Flatplan route lives at src/pages/Flatplan
          and is a full module; this tab reuses the exact same component + shared
          state (sales, page-story map, placements) so ad placement and story
          pagination show up here identically. `isActive={false}` suppresses
          Flatplan's own TopBar header override so "Production" stays the title. */}
      {tab === "flatplan" && (() => {
        // Issue Planning selection wins — that's the view the user is
        // working against, so the Flatplan tab should mirror it even
        // when lastFlatplanPub/Issue points at a different issue from
        // a prior top-level Flatplan session.
        const seedPub = (selIssue ? issues.find(i => i.id === selIssue)?.pubId : null) || lastFlatplanPub;
        const seedIssue = selIssue || lastFlatplanIssue;
        return (
          <Suspense fallback={<LazyFallback />}>
            {/* IP Wave 2 task 2.10: explicit key forces a clean
                unmount/remount on every tab return. The {tab === ...}
                gate already does this in practice, but the key makes
                the intent obvious and is cheap insurance against
                future Suspense quirks holding a stale instance. */}
            <Flatplan
              key="flatplan-tab"
              isActive={false}
              jurisdiction={jurisdiction}
              pubs={pubs}
              issues={issues}
              setIssues={setIssues}
              sales={sales || []}
              setSales={setSales}
              updateSale={updateSale}
              clients={clients || []}
              contracts={contracts || []}
              stories={storiesRaw}
              globalPageStories={globalPageStories}
              setGlobalPageStories={setGlobalPageStories}
              lastIssue={seedIssue}
              lastPub={seedPub}
              onSelectionChange={onFlatplanSelectionChange}
              currentUser={currentUser}
              onNavigate={onNavigate}
            />
          </Suspense>
        );
      })()}

      {/* WEB PUBLISHING QUEUE */}
      {tab === "web" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: FS.xs, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: Z.tm, fontFamily: COND, padding: "4px 0" }}>
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
                    <span style={{ fontSize: FS.base, fontWeight: 700, color: Z.tx, fontFamily: COND }}>{s.title}</span>
                    {isRepub && (
                      <span style={{ fontSize: FS.micro, fontWeight: 700, padding: "1px 6px", borderRadius: Ri, background: Z.wa + "18", color: Z.wa }}>
                        Updated since last publish
                      </span>
                    )}
                    <Badge status={s.status} small />
                  </div>
                  <div style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND, marginTop: 2 }}>
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
