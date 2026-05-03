import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense, memo, Fragment } from "react";
import { Z, SC, COND, DISPLAY, ACCENT, FS, FW, R, Ri, INV, CARD } from "../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Card, SB, TB, Modal, FilterBar, TabRow, TabPipe, GlassStat, DataTable, FilterPillStrip } from "./ui";
import FuzzyPicker from "./FuzzyPicker";
import { STORY_STATUSES } from "../constants";
import { supabase } from "../lib/supabase";
import { useDialog } from "../hooks/useDialog";
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
  // Page-group collapsed state (Phase 3b). Keys are page numbers as
  // strings, plus "unassigned" for the null-page bucket. Persisted per
  // issue in localStorage so the editor's open/closed shape survives
  // tab switches and reloads.
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  // Drag-and-drop state (Phase 3b/3c — story reorder across page groups).
  // draggingId = the story currently held by the cursor; dropTarget
  // = where it would land if released right now (group key + the row
  // it would insert above, or null for "append to end of group").
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

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

  // Sections for the active issue, shared with Flatplan via the
  // flatplan_sections table. Realtime-subscribed so creates/edits in
  // either view propagate immediately.
  const [issueSections, setIssueSections] = useState([]);
  // Page-label formatter scoped to the active issue's pub type and
  // sections — newspapers get "A1, B2", magazines stay linear.
  const fmtPage = useMemo(() => {
    const pubId = (issues || []).find(i => i.id === selIssue)?.pubId;
    const pubType = pubs.find(p => p.id === pubId)?.type;
    return (page) => pageLabel(page, issueSections, pubType);
  }, [issueSections, issues, selIssue, pubs]);
  useEffect(() => {
    if (!selIssue) { setIssueSections([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const rows = await loadSectionsForIssue(selIssue);
        if (!cancelled) setIssueSections(rows);
      } catch (err) {
        console.error("[Issue Planner] load sections failed:", err);
      }
    })();
    const ch = supabase.channel(`ip-sections-${selIssue}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "flatplan_sections", filter: `issue_id=eq.${selIssue}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = payload.old?.id;
            if (oldId) setIssueSections(prev => prev.filter(s => s.id !== oldId));
          } else {
            const r = payload.new;
            if (!r) return;
            const mapped = { id: r.id, issueId: r.issue_id, label: r.name, name: r.name, startPage: r.start_page, endPage: r.end_page, afterPage: (r.start_page ?? 1) - 1, color: r.color || null, kind: r.kind || "main", sortOrder: r.sort_order };
            setIssueSections(prev => {
              const idx = prev.findIndex(s => s.id === r.id);
              const next = idx === -1 ? [...prev, mapped] : prev.map(s => s.id === r.id ? mapped : s);
              next.sort((a, b) => (a.afterPage ?? 0) - (b.afterPage ?? 0));
              return next;
            });
          }
        }).subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [selIssue]);

  // When the issue changes, restore the per-issue collapsed-groups set
  // from localStorage so editors don't lose the layout they shaped.
  useEffect(() => {
    if (!selIssue) { setCollapsedGroups(new Set()); return; }
    try {
      const raw = localStorage.getItem(`ip_collapsed_${selIssue}`);
      setCollapsedGroups(new Set(raw ? JSON.parse(raw) : []));
    } catch { setCollapsedGroups(new Set()); }
  }, [selIssue]);
  useEffect(() => {
    if (!selIssue) return;
    try { localStorage.setItem(`ip_collapsed_${selIssue}`, JSON.stringify([...collapsedGroups])); } catch {}
  }, [collapsedGroups, selIssue]);
  const toggleGroup = useCallback((key) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [addingInlineStory, setAddingInlineStory] = useState(false);
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
    if (updates.has_images !== undefined) dbFields.has_images = !!updates.has_images;
    if (updates.jump_to_page !== undefined) {
      const n = parseInt(updates.jump_to_page);
      dbFields.jump_to_page = isNaN(n) ? null : n;
    }
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
      // Surface errors. `.catch(() => {})` was hiding RLS rejections —
      // writes silently returned 0 rows and the local optimistic update
      // "stuck" until page reload revealed the DB hadn't changed.
      // We .select() back the affected rows so 0-rows-affected is
      // detectable and loggable (PostgREST doesn't throw on RLS — it
      // just returns an empty array).
      dbFields.updated_at = new Date().toISOString();
      supabase.from("stories").update(dbFields).eq("id", id).select("id").then(({ data, error }) => {
        if (error) {
          console.error("[Issue Planner] stories update failed:", error.message, dbFields);
          return;
        }
        if (!data || data.length === 0) {
          console.error("[Issue Planner] stories update affected 0 rows (likely RLS). Fields:", Object.keys(dbFields));
        }
      });
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
    // Mapper exposes site_settings.shared_content_with as sharedContentWith;
    // fall back to settings.shared_content_with for any older code paths.
    const siblings = pub?.sharedContentWith || pub?.settings?.shared_content_with || [];
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
    //
    // Also include stories linked to this issue as a sibling placement
    // via also_in_issue_ids (see migration 090). Those render with a
    // "↔ [Primary Pub]" badge so editors know they're the shared copy.
    let list = stories
      .filter(s => s.print_issue_id === selIssue
                || (Array.isArray(s.also_in_issue_ids) && s.also_in_issue_ids.includes(selIssue)))
      .map(s => s.print_issue_id === selIssue ? s : { ...s, _mirroredFrom: s.print_issue_id });
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

  // Phase 3b — group issueStories by destination page. Unassigned (page=null)
  // is always pinned at index 0; remaining buckets sort numerically. Each
  // group is a tuple [key, label, stories[], jumpsIn[]] where:
  //   - key:        "unassigned" or the page number as a string
  //   - label:      header text ("Unassigned" or "Page 6")
  //   - stories[]:  primary story rows whose .page matches this group
  //   - jumpsIn[]:  read-only continuation rows — stories whose
  //                 .jump_to_page lands on this page (rendered as
  //                 italic "(cont. from p.X)" rows under the group)
  const pageGroups = useMemo(() => {
    const buckets = new Map();
    buckets.set("unassigned", { key: "unassigned", page: null, label: "Unassigned", stories: [], jumpsIn: [] });
    issueStories.forEach(s => {
      const p = (s.page_number ?? s.page);
      const pn = (p === null || p === undefined || p === "" || isNaN(Number(p))) ? null : Number(p);
      if (pn === null) {
        buckets.get("unassigned").stories.push(s);
        return;
      }
      const k = String(pn);
      if (!buckets.has(k)) buckets.set(k, { key: k, page: pn, label: `Page ${pn}`, stories: [], jumpsIn: [] });
      buckets.get(k).stories.push(s);
    });
    // Wire jump_to_page → destination group's jumpsIn
    issueStories.forEach(s => {
      const j = parseInt(s.jump_to_page);
      if (isNaN(j)) return;
      const k = String(j);
      if (!buckets.has(k)) buckets.set(k, { key: k, page: j, label: `Page ${j}`, stories: [], jumpsIn: [] });
      buckets.get(k).jumpsIn.push(s);
    });
    // Drop empty Unassigned to reduce visual noise.
    if (buckets.get("unassigned").stories.length === 0) buckets.delete("unassigned");
    // Order: Unassigned first, then numerical pages ascending.
    return [...buckets.values()].sort((a, b) => {
      if (a.key === "unassigned") return -1;
      if (b.key === "unassigned") return 1;
      return a.page - b.page;
    });
  }, [issueStories]);

  // Reorder via drag-drop (Phase 3b/3c). Drop semantics:
  //   - Different group  → page changes to destination, priority resets
  //                        to the new in-group position (1..N, capped 6).
  //   - Same group       → page stays, priority renumbered to match
  //                        the new visual order.
  //   - Unassigned drop  → page cleared (null), priority renumbered.
  // Every story in the destination group gets renumbered so visual
  // order = priority order in perpetuity. Cross-group drops also
  // renumber the source group so it stays sequential after extraction.
  const reorderStories = useCallback((targetGroupKey, dropBeforeId) => {
    const draggedId = draggingId;
    setDraggingId(null);
    setDropTarget(null);
    if (!draggedId) return;
    const dragged = issueStories.find(s => s.id === draggedId);
    if (!dragged) return;
    const targetPage = targetGroupKey === "unassigned" ? null : Number(targetGroupKey);

    // Source group key as it currently lives.
    const currentPage = (dragged.page ?? null);
    const sourceGroupKey = currentPage == null ? "unassigned" : String(currentPage);

    // Build destination order with the dragged story inserted at the
    // requested position (or appended).
    const destGroup = pageGroups.find(g => g.key === targetGroupKey);
    const destStories = (destGroup?.stories || []).filter(s => s.id !== draggedId);

    // May Sim P2.3 — prompt before silently adding to a page that
    // already has stories. Cross-group drops only (re-ordering within
    // the same page is intentional and shouldn't ask). The "share page"
    // pattern is normal for print but a tired Tuesday drop should
    // confirm so a slip doesn't quietly land a story on the wrong page.
    if (sourceGroupKey !== targetGroupKey && targetPage != null && destStories.length > 0) {
      const occupants = destStories.slice(0, 3).map(s => `"${(s.title || "Untitled").slice(0, 28)}"`).join(", ");
      const more = destStories.length > 3 ? ` + ${destStories.length - 3} more` : "";
      const ok = window.confirm(
        `Page ${targetPage} already has ${destStories.length} stor${destStories.length === 1 ? "y" : "ies"}: ${occupants}${more}.\n\n` +
        `Add "${(dragged.title || "Untitled").slice(0, 40)}" to the same page?`
      );
      if (!ok) return;
    }
    let insertIdx = dropBeforeId == null ? destStories.length : destStories.findIndex(s => s.id === dropBeforeId);
    if (insertIdx < 0) insertIdx = destStories.length;
    const newDest = [
      ...destStories.slice(0, insertIdx),
      { ...dragged, page: targetPage },
      ...destStories.slice(insertIdx),
    ];
    newDest.forEach((s, idx) => {
      const newPriority = String(Math.min(6, idx + 1));
      const updates = {};
      const sPage = s.page ?? null;
      if (sPage !== targetPage) updates.page = targetPage;
      if (String(s.priority || "") !== newPriority) updates.priority = newPriority;
      if (Object.keys(updates).length > 0) updateStory(s.id, updates);
    });

    // If we crossed groups, renumber what's left in the source.
    if (sourceGroupKey !== targetGroupKey) {
      const srcGroup = pageGroups.find(g => g.key === sourceGroupKey);
      const remaining = (srcGroup?.stories || []).filter(s => s.id !== draggedId);
      remaining.forEach((s, idx) => {
        const newPriority = String(Math.min(6, idx + 1));
        if (String(s.priority || "") !== newPriority) {
          updateStory(s.id, { priority: newPriority });
        }
      });
    }
  }, [draggingId, issueStories, pageGroups]);

  // ── Sibling issue resolver for a given story ──
  // Returns every sibling-pub issue that shares the story's primary
  // issue date. Siblings come from publications.settings.shared_content_with
  // (seeded in migration 033). One story may have 0 or many siblings.
  const siblingIssuesFor = useCallback((story) => {
    const primary = issues.find(i => i.id === story.print_issue_id);
    if (!primary) return [];
    const primaryPubId = primary.publicationId || primary.pubId;
    const primaryPub = (pubs || []).find(p => p.id === primaryPubId);
    const siblings = primaryPub?.sharedContentWith || primaryPub?.settings?.shared_content_with || [];
    return siblings.map(sibPubId => {
      const sibPub = (pubs || []).find(p => p.id === sibPubId);
      const sibIss = issues.find(i => (i.publicationId || i.pubId) === sibPubId && i.date === primary.date);
      return sibIss && sibPub ? { issue: sibIss, pub: sibPub } : null;
    }).filter(Boolean);
  }, [issues, pubs]);

  // ── Toggle a sibling-issue link on a story ──
  // Flips the sibling issue id in/out of stories.also_in_issue_ids,
  // persists, and updates local state. One canonical row — the planner
  // surfaces it under the sibling issue via the array-contains filter.
  const toggleSiblingLink = useCallback(async (story, siblingIssueId) => {
    const current = Array.isArray(story.also_in_issue_ids) ? story.also_in_issue_ids : [];
    const next = current.includes(siblingIssueId)
      ? current.filter(x => x !== siblingIssueId)
      : [...current, siblingIssueId];
    setStories(prev => prev.map(s => s.id === story.id
      ? { ...s, also_in_issue_ids: next, alsoInIssueIds: next }
      : s));
    const { error } = await supabase.from("stories")
      .update({ also_in_issue_ids: next, updated_at: new Date().toISOString() })
      .eq("id", story.id);
    if (error) console.error("Sibling link toggle failed:", error);
  }, [setStories]);

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
    // Auto-priority: take the highest numeric priority used in this
    // issue and add 1 (capped at 6 — the spec's max priority bucket).
    // Lets editors hit "+ New Story" repeatedly and get an ordered
    // priority stack without touching the dropdown each time.
    const usedPriorities = (stories || [])
      .filter(s => s.print_issue_id === selIssue)
      .map(s => parseInt(s.priority))
      .filter(n => !isNaN(n));
    const nextPriority = Math.min(6, (usedPriorities.length ? Math.max(...usedPriorities) : 0) + 1);
    setAddingInlineStory(true);
    const row = {
      title: "", status: "Draft", author: "",
      publication_id: pubId,
      issue_id: selIssue, print_issue_id: selIssue,
      category: "News", priority: String(nextPriority),
      web_status: "none", print_status: "none",
      site_id: pubId,
    };
    const { data, error } = await supabase.from("stories").insert(row).select().single();
    setAddingInlineStory(false);
    if (error) {
      console.error("Inline new story insert failed:", error.message, "code=", error.code, "details=", error.details, "hint=", error.hint, "row=", row);
      return;
    }
    if (!data) return;
    const mapped = {
      id: data.id, title: "", status: "Draft", author: "",
      publication_id: pubId, publication: pubId,
      issueId: selIssue, issue_id: selIssue, print_issue_id: selIssue,
      category: "News", priority: String(nextPriority),
      web_status: "none", print_status: "none",
      created_at: data.created_at,
    };
    setStories(prev => [mapped, ...prev]);
  }, [selIssue, issues, addingInlineStory, setStories, stories]);

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

  // Inactive author names — used to prune the author dropdown so ex-staff
  // can't be picked for new stories. A story already assigned to an
  // inactive author keeps the name in its row's dropdown (see row render)
  // so the value doesn't appear to vanish.
  const inactiveAuthorNames = useMemo(() => new Set(
    (team || []).filter(m => m.isActive === false).map(m => m.name).filter(Boolean)
  ), [team]);

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

      {/* STORIES VIEW (merged Issue Planning + Stories table) */}
      {tab === "stories" && (
        <div style={{ display: "grid", gridTemplateColumns: sidebarCollapsed ? "44px 1fr" : "260px 1fr", gap: 16, minHeight: 400, transition: "grid-template-columns 0.2s ease" }}>
          {/* Collapsed-state rail — always-visible expand chevron so the
              sidebar can be reopened even when no issue is selected. */}
          {sidebarCollapsed && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
              <button
                onClick={() => setSidebarCollapsed(false)}
                title="Show Upcoming Issues"
                style={{
                  width: 36, height: 36, borderRadius: Ri,
                  background: Z.sa, border: "1px solid " + Z.bd,
                  cursor: "pointer", color: Z.tx,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 700, lineHeight: 1, padding: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = Z.ac + "18"; e.currentTarget.style.color = Z.ac; }}
                onMouseLeave={e => { e.currentTarget.style.background = Z.sa; e.currentTarget.style.color = Z.tx; }}
              >›</button>
            </div>
          )}
          {/* Issue sidebar — collapsible for distraction-free story view */}
          {!sidebarCollapsed && <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", maxHeight: 600 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", marginBottom: 4 }}>
              <span style={{ fontSize: FS.xs, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: Z.tm, fontFamily: COND }}>Upcoming Issues</span>
              <button
                onClick={() => setSidebarCollapsed(true)}
                title="Collapse — distraction-free story view"
                style={{
                  width: 32, height: 32, borderRadius: Ri,
                  background: "transparent", border: "1px solid " + Z.bd,
                  cursor: "pointer", color: Z.tm,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 700, lineHeight: 1, padding: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = Z.sa; e.currentTarget.style.color = Z.tx; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = Z.tm; }}
              >‹</button>
            </div>
            {futureIssues.length === 0 && <div style={{ fontSize: FS.sm, color: Z.tm, padding: 12 }}>No upcoming issues</div>}
            {futureIssues.map(iss => {
              // Count matches the issueStories filter — primary placement
              // plus any sibling links (also_in_issue_ids contains iss.id).
              const stCount = stories.filter(s => s.print_issue_id === iss.id
                || (Array.isArray(s.also_in_issue_ids) && s.also_in_issue_ids.includes(iss.id))).length;
              const isSelected = selIssue === iss.id;
              return (
                <div key={iss.id} onClick={() => setSelIssue(iss.id)} style={{
                  padding: "8px 10px", borderRadius: Ri, cursor: "pointer",
                  background: isSelected ? Z.ac + "18" : "transparent",
                }}>
                  <div style={{ fontSize: FS.sm, fontWeight: 700, color: Z.tx, fontFamily: COND }}>{pn(iss.publicationId || iss.pubId, pubs)}</div>
                  <div style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND, marginTop: 2 }}>
                    {iss.date ? new Date(iss.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : iss.label || "Issue"} · {stCount} stories
                  </div>
                </div>
              );
            })}
          </div>}

          {/* Issue detail / story data table */}
          <div>
            {!selIssue ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: Z.tm, fontSize: FS.base }}>
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
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: FS.xs, color: showSiblings ? "var(--action)" : Z.tm, fontFamily: COND, cursor: "pointer" }}>
                        <input type="checkbox" checked={showSiblings} onChange={e => setShowSiblings(e.target.checked)} style={{ accentColor: "var(--action)" }} />
                        + {siblingCtx.map(sc => sc.pub.name).join(", ")}
                      </label>
                    )}
                    <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{issueStories.length} stories</span>
                  </div>
                </div>
                {/* Quick-stat strip (spec §4.1). Five at-a-glance counters
                    across the issue: stories, pages assigned, ads placed,
                    stories flagged for images, stories with jumps. */}
                {(() => {
                  const pagesAssigned = new Set(issueStories.map(s => s.page).filter(p => p != null && p !== "")).size;
                  const adsPlaced = (sales || []).filter(s => s.issueId === selIssue && s.page != null && s.page > 0).length;
                  const withImages = issueStories.filter(s => s.has_images).length;
                  const withJumps = issueStories.filter(s => s.jump_to_page != null).length;
                  const stat = (val, label, color) => (
                    <div style={{ flex: 1, padding: "6px 10px", background: Z.sa, borderRadius: Ri, textAlign: "center" }}>
                      <div style={{ fontSize: FS.lg, fontWeight: 800, color: color || Z.tx, fontFamily: DISPLAY }}>{val}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: Z.tm, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: COND }}>{label}</div>
                    </div>
                  );
                  return (
                    <div style={{ display: "flex", gap: 4 }}>
                      {stat(issueStories.length, "Stories")}
                      {stat(pagesAssigned, "Pages assigned")}
                      {stat(adsPlaced, "Ads placed")}
                      {stat(withImages, "With images", withImages > 0 ? Z.su : null)}
                      {stat(withJumps, "Jumps", withJumps > 0 ? Z.wa : null)}
                    </div>
                  );
                })()}
                {/* Issue-level discussion thread (Phase 2 of editorial→production
                    spec). One thread per issue, shared across surfaces — same
                    underlying message_threads row as the Messages page Issue
                    tab. Collapsed by default; opens inline. */}
                <EntityThread
                  refType="issue"
                  refId={selIssue}
                  title={`Issue: ${issues.find(i => i.id === selIssue)?.label || "Untitled"}`}
                  team={team}
                  currentUser={currentUser}
                  label="Issue discussion"
                  height={300}
                />
                {/* Print status pipeline */}
                <div style={{ display: "flex", gap: 2, marginBottom: 8 }}>
                  {PRINT_STAGES.slice(1).map(stage => {
                    const count = issueStories.filter(s => s.print_status === stage.key).length;
                    return (
                      <div key={stage.key} style={{ flex: 1, textAlign: "center", padding: "6px 4px", background: count > 0 ? Z.ac + "12" : Z.sa, borderRadius: Ri }}>
                        <div style={{ fontSize: FS.lg, fontWeight: 800, color: count > 0 ? Z.ac : Z.tm, fontFamily: DISPLAY }}>{count}</div>
                        <div style={{ fontSize: FS.micro, fontWeight: 600, color: Z.tm, fontFamily: COND }}>{stage.label}</div>
                      </div>
                    );
                  })}
                </div>
                {/* Mini flatplan — enlarged 30% from the original 40×48 */}
                {(() => {
                  const mfIssue = issues.find(i => i.id === selIssue);
                  if (!mfIssue) return null;
                  const mfPages = Array.from({ length: mfIssue.pageCount || 16 }, (_, i) => i + 1);
                  const priVal = (s) => { const n = parseInt(s.priority); return isNaN(n) ? 999 : n; };
                  const getStories = (pg) => issueStories.filter(s => { const p = String(s.page || s.page_number || ""); const pages = p.split(/[,-]/).map(Number).filter(Boolean); if (p.includes("-")) { const [a, b] = p.split("-").map(Number); return pg >= a && pg <= b; } return pages.includes(pg); }).sort((a, b) => priVal(a) - priVal(b));
                  return <div style={{ background: Z.sa, borderRadius: Ri, padding: "10px 13px", marginBottom: 10 }}>
                    <div style={{ fontSize: FS.base, fontWeight: 700, color: Z.tm, fontFamily: COND, marginBottom: 5 }}>Page Map</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {mfPages.map(pg => {
                        const pgStories = getStories(pg);
                        const hasContent = pgStories.length > 0;
                        return <div key={pg} style={{ width: 52, height: 62, border: `1px solid ${Z.bd}`, borderRadius: 3, background: hasContent ? Z.ac + "12" : Z.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: 2, overflow: "hidden" }}>
                          <div style={{ fontSize: FS.micro, fontWeight: 700, color: Z.td }}>{fmtPage(pg)}</div>
                          {pgStories.slice(0, 3).map((s, idx) => <div key={s.id} title={`P${priVal(s)} — ${s.title}`} style={{ fontSize: 8, fontWeight: idx === 0 ? 800 : 600, color: Z.ac, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%", textAlign: "center", opacity: idx === 0 ? 1 : 0.75 }}>{(s.title || "").slice(0, 12)}</div>)}
                        </div>;
                      })}
                    </div>
                  </div>;
                })()}
                {/* Quick-add: inline story for the currently-selected issue.
                    Inserts a blank row into the table without leaving the
                    planner so titles can be batched in. */}
                <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 4, gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <Btn sm v="secondary" onClick={addInlineStoryForIssue} disabled={addingInlineStory}>
                    <Ic.plus size={12} /> {addingInlineStory ? "Adding…" : "New Story"}
                  </Btn>
                  <Btn sm v="secondary" onClick={async () => {
                    if (!selIssue) return;
                    const labelStr = window.prompt("Section name (e.g. A, Sports, B):", "");
                    if (!labelStr) return;
                    const startStr = window.prompt("Starts at page number (use the global page #, leave blank for page 1):", "");
                    const startNum = parseInt(startStr);
                    const afterPage = isNaN(startNum) ? 0 : Math.max(0, startNum - 1);
                    const kindAns = (window.prompt("Type — 'main' (newspaper page reset) or 'sub' (label only). Default: main", "main") || "main").toLowerCase();
                    const kind = kindAns === "sub" ? "sub" : "main";
                    try {
                      const row = await createSectionDb({ issueId: selIssue, afterPage, label: labelStr, kind });
                      setIssueSections(prev => [...prev, row].sort((a, b) => (a.afterPage ?? 0) - (b.afterPage ?? 0)));
                    } catch (err) {
                      console.error("Create section failed:", err);
                      alert("Could not save section: " + (err.message || "unknown error"));
                    }
                  }} disabled={!selIssue}>
                    <Ic.plus size={12} /> New Section
                  </Btn>
                  {(() => {
                    const pId = (issues || []).find(i => i.id === selIssue)?.pubId;
                    const pub = pubs.find(p => p.id === pId);
                    const defaults = Array.isArray(pub?.defaultSections) ? pub.defaultSections : [];
                    if (!defaults.length || issueSections.length > 0) return null;
                    return <Btn sm v="secondary" onClick={async () => {
                      if (!selIssue) return;
                      try {
                        const rows = await applyDefaultSectionsToIssue(selIssue, defaults);
                        setIssueSections(prev => [...prev, ...rows].sort((a, b) => (a.afterPage ?? 0) - (b.afterPage ?? 0)));
                      } catch (err) {
                        console.error("Apply default sections failed:", err);
                        alert("Could not apply defaults: " + (err.message || "unknown error"));
                      }
                    }}>
                      Apply pub defaults ({defaults.length})
                    </Btn>;
                  })()}
                </div>
                {/* Data table with inline editing */}
                <div style={{ overflow: "hidden" }}>
                  <DataTable>
                    <thead>
                      <tr>
                        {[
                          { key: "_drag", label: "" },
                          { key: "title", label: "Title" },
                          { key: "author", label: "Author" },
                          { key: "category", label: "Section" },
                          { key: "status", label: "Status" },
                          { key: "page_number", label: "Page" },
                          { key: "jump_to_page", label: "Jump" },
                          { key: "priority", label: "Pri" },
                          { key: "word_limit", label: "Limit" },
                          { key: "_img", label: "Img" },
                          { key: "_delete", label: "" },
                        ].map(col => {
                          const noSort = col.key === "_delete" || col.key === "_drag";
                          return (
                          <th key={col.key} onClick={!noSort ? () => { if (sortCol === col.key) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortCol(col.key); setSortDir("asc"); } } : undefined} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, color: Z.tm, fontSize: FS.xs, cursor: !noSort ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap", width: noSort ? 18 : undefined }}>
                            {col.label} {sortCol === col.key ? (sortDir === "asc" ? "\u25B2" : "\u25BC") : ""}
                          </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {issueStories.length === 0 && (
                        <tr><td colSpan={11} style={{ padding: 24, textAlign: "center", color: Z.tm }}>No stories assigned to this issue yet</td></tr>
                      )}
                      {pageGroups.map((g, gi) => {
                        const groupCollapsed = collapsedGroups.has(g.key);
                        const wordSum = g.stories.reduce((sum, s) => sum + (Number(s.word_count || s.wordCount) || 0), 0);
                        const isAppendTarget = !!draggingId && dropTarget?.groupKey === g.key && dropTarget?.beforeId == null;
                        // Inject a section divider above this group when a
                        // section starts at or before this page (and either
                        // it's the first group or the previous group fell in
                        // a different section).
                        const prevGroup = gi > 0 ? pageGroups[gi - 1] : null;
                        const hereSection = g.page != null ? sectionForPage(g.page, issueSections) : null;
                        const prevSection = prevGroup && prevGroup.page != null ? sectionForPage(prevGroup.page, issueSections) : null;
                        const showSectionHeader = !!hereSection && (!prevSection || prevSection.id !== hereSection.id);
                        return <Fragment key={g.key}>
                          {showSectionHeader && (
                            <tr style={{ background: Z.bg }}>
                              <td colSpan={11} style={{ padding: "10px 12px 4px", borderTop: `2px solid ${ACCENT.indigo}40` }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span style={{ fontSize: 9, fontWeight: 800, color: ACCENT.indigo, fontFamily: COND, padding: "2px 6px", background: ACCENT.indigo + "15", borderRadius: Ri, textTransform: "uppercase", letterSpacing: 0.6 }}>
                                    {hereSection.kind === "sub" ? "SUB" : "SECTION"}
                                  </span>
                                  <input
                                    value={hereSection.label || ""}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setIssueSections(prev => prev.map(s => s.id === hereSection.id ? { ...s, label: val } : s));
                                    }}
                                    onBlur={e => updateSectionDb(hereSection.id, { label: e.target.value }).catch(err => console.error("Section rename failed:", err))}
                                    style={{ fontSize: FS.md, fontWeight: 800, color: Z.tx, fontFamily: DISPLAY, background: "transparent", border: "none", outline: "none", padding: 0, flex: 1 }}
                                  />
                                  <select
                                    value={hereSection.kind || "main"}
                                    onChange={async e => {
                                      const val = e.target.value;
                                      setIssueSections(prev => prev.map(s => s.id === hereSection.id ? { ...s, kind: val } : s));
                                      try { await updateSectionDb(hereSection.id, { kind: val }); } catch (err) { console.error("Section kind change failed:", err); }
                                    }}
                                    title={(() => { const pId = (issues || []).find(i => i.id === selIssue)?.pubId; return pubs.find(p => p.id === pId)?.type === "Newspaper" ? "Main = resets newspaper page numbering. Sub = label only." : "Magazine: kind doesn't affect numbering"; })()}
                                    style={{ fontSize: FS.micro, fontWeight: 700, fontFamily: COND, background: "transparent", border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "2px 6px", color: Z.tm, cursor: "pointer" }}
                                  >
                                    <option value="main">Main</option>
                                    <option value="sub">Sub</option>
                                  </select>
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`Delete section "${hereSection.label}"?`)) return;
                                      try {
                                        await deleteSectionDb(hereSection.id);
                                        setIssueSections(prev => prev.filter(s => s.id !== hereSection.id));
                                      } catch (err) { console.error("Section delete failed:", err); }
                                    }}
                                    style={{ background: "none", border: "none", cursor: "pointer", color: Z.td, fontSize: FS.md, padding: "0 4px" }}
                                  >×</button>
                                </div>
                              </td>
                            </tr>
                          )}
                          <tr
                            style={{ background: isAppendTarget ? Z.ac + "20" : Z.sa, transition: "background 0.1s" }}
                            onDragOver={(e) => {
                              if (!draggingId) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                              if (!dropTarget || dropTarget.groupKey !== g.key || dropTarget.beforeId !== null) {
                                setDropTarget({ groupKey: g.key, beforeId: null });
                              }
                            }}
                            onDrop={(e) => { e.preventDefault(); if (draggingId) reorderStories(g.key, null); }}
                          >
                            <td colSpan={11} style={{ padding: "6px 10px", borderBottom: `1px solid ${Z.bd}`, cursor: "pointer", userSelect: "none" }} onClick={() => toggleGroup(g.key)}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: COND, fontSize: FS.xs, fontWeight: 800, color: g.key === "unassigned" ? Z.wa : Z.tx, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                <span style={{ width: 12, color: Z.tm }}>{groupCollapsed ? "▸" : "▾"}</span>
                                <span>{g.key === "unassigned" ? g.label : `Page ${fmtPage(g.page)}`}</span>
                                <span style={{ color: Z.tm, fontWeight: 600, letterSpacing: 0 }}>{g.stories.length} {g.stories.length === 1 ? "story" : "stories"}{wordSum > 0 ? ` · ${wordSum.toLocaleString()} words` : ""}{g.jumpsIn.length ? ` · ${g.jumpsIn.length} jumping in` : ""}</span>
                                {isAppendTarget && <span style={{ marginLeft: "auto", fontSize: FS.micro, color: Z.ac, fontWeight: 700 }}>Drop to append</span>}
                              </div>
                            </td>
                          </tr>
                          {!groupCollapsed && g.stories.map(s => {
                        const inpS = { background: "transparent", border: `1px solid ${Z.bd}`, borderRadius: 3, color: Z.tx, fontSize: FS.sm, fontFamily: COND, outline: "none", padding: "3px 6px", width: "100%", boxSizing: "border-box" };
                        const selS = { ...inpS, cursor: "pointer", WebkitAppearance: "none", MozAppearance: "none", appearance: "none" };
                        const hasSavedTitle = s.title && s.title !== "";
                        const isSibling = s._fromSibling;
                        const isMirror = !!s._mirroredFrom; // rendered here because the current issue is in s.also_in_issue_ids
                        const siblingOptions = !isMirror && !isSibling ? siblingIssuesFor(s) : [];
                        const primaryPubName = isMirror ? (pubs.find(p => p.id === (issues.find(i => i.id === s._mirroredFrom)?.publicationId || issues.find(i => i.id === s._mirroredFrom)?.pubId))?.name || "primary") : null;
                        const isDragging = draggingId === s.id;
                        const isDropTarget = !!draggingId && dropTarget?.groupKey === g.key && dropTarget?.beforeId === s.id;
                        return <tr
                          key={s.id}
                          style={{
                            borderTop: isDropTarget ? `2px solid ${Z.ac}` : "none",
                            borderBottom: `1px solid ${Z.bd}`,
                            opacity: isSibling ? 0.6 : (isDragging ? 0.4 : 1),
                            background: isDragging ? Z.sa : undefined,
                          }}
                          onDragOver={(e) => {
                            if (!draggingId) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            if (!dropTarget || dropTarget.groupKey !== g.key || dropTarget.beforeId !== s.id) {
                              setDropTarget({ groupKey: g.key, beforeId: s.id });
                            }
                          }}
                          onDrop={(e) => { e.preventDefault(); if (draggingId) reorderStories(g.key, s.id); }}
                        >
                          {/* Drag handle ☰ — only this cell is draggable so the
                              field cells don't fight with input edits/text
                              selection. Sibling/mirror rows are read-only. */}
                          <td
                            draggable={!isSibling && !isMirror}
                            onDragStart={(e) => {
                              if (isSibling || isMirror) { e.preventDefault(); return; }
                              setDraggingId(s.id);
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", s.id);
                            }}
                            onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
                            style={{ padding: "5px 4px", width: 18, textAlign: "center", color: Z.td, cursor: (isSibling || isMirror) ? "default" : "grab", fontSize: FS.md, userSelect: "none", opacity: (isSibling || isMirror) ? 0.3 : 1 }}
                            title={(isSibling || isMirror) ? "" : "Drag to reorder"}
                          >☰</td>
                          <td style={{ padding: "5px 8px", maxWidth: 280 }}>
                            {isSibling && <span style={{ fontSize: 9, fontWeight: 800, color: "var(--action)", background: "color-mix(in srgb, var(--action) 10%, transparent)", padding: "1px 5px", borderRadius: 3, marginRight: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{s._siblingPub?.split(" ")[0]}</span>}
                            {isMirror && <span title={`Also appears in this issue — lives on ${primaryPubName}`} style={{ fontSize: 9, fontWeight: 800, color: "var(--action)", background: "color-mix(in srgb, var(--action) 10%, transparent)", padding: "1px 5px", borderRadius: 3, marginRight: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>↔ {primaryPubName}</span>}
                            {hasSavedTitle
                              ? <span onClick={() => !isSibling && openDetail(s)} style={{ fontWeight: 700, color: isSibling ? Z.tm : Z.ac, cursor: isSibling ? "default" : "pointer", display: "inline", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                              : <input defaultValue="" placeholder="Story title..." autoFocus onBlur={e => updateStory(s.id, { title: e.target.value })} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }} style={{ ...inpS, fontWeight: 700 }} />
                            }
                            {/* Sibling-link chips — only on primary rows, one per declared sibling pub. */}
                            {siblingOptions.length > 0 && hasSavedTitle && (
                              <div style={{ marginTop: 3, display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {siblingOptions.map(({ issue: sibIss, pub: sibPub }) => {
                                  const linked = Array.isArray(s.also_in_issue_ids) && s.also_in_issue_ids.includes(sibIss.id);
                                  return (
                                    <button
                                      key={sibIss.id}
                                      onClick={() => toggleSiblingLink(s, sibIss.id)}
                                      title={linked ? `Unlink from ${sibPub.name}` : `Also publish in ${sibPub.name} (${new Date(sibIss.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })})`}
                                      style={{
                                        fontSize: 9, fontWeight: 700, fontFamily: COND, letterSpacing: 0.3,
                                        padding: "2px 7px", borderRadius: 10, cursor: "pointer",
                                        background: linked ? "color-mix(in srgb, var(--action) 15%, transparent)" : Z.sa,
                                        color: linked ? "var(--action)" : Z.tm,
                                        border: `1px solid ${linked ? "color-mix(in srgb, var(--action) 40%, transparent)" : Z.bd}`,
                                      }}
                                    >
                                      {linked ? "↔" : "⊕"} {sibPub.name}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "5px 8px" }}>
                            <FuzzyPicker value={s.author || ""} onChange={(v) => updateStory(s.id, { author: v })} options={[...new Set(stories.map(x => x.author).filter(Boolean))].sort().filter(a => !inactiveAuthorNames.has(a) || a === s.author).map(a => ({ value: a, label: a }))} placeholder="Author…" emptyLabel="—" size="sm" />
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
                          <td style={{ padding: "5px 8px", width: 60 }}>
                            {/* Jump column — writes stories.jump_to_page. Empty = no
                                jump. Edit on origin row only; jump lines render
                                read-only at the destination (see page-group view). */}
                            <Sel
                              value={s.jump_to_page != null ? String(s.jump_to_page) : ""}
                              onChange={e => updateStory(s.id, { jump_to_page: e.target.value || null })}
                              options={[{ value: "", label: "—" }, ...Array.from({ length: issues.find(i => i.id === selIssue)?.pageCount || 24 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))]}
                              style={{ padding: "3px 24px 3px 6px", width: 55 }}
                            />
                          </td>
                          <td style={{ padding: "5px 8px", width: 50 }}>
                            <Sel value={String(s.priority || "4")} onChange={e => updateStory(s.id, { priority: e.target.value })} options={PRIORITY_OPTIONS} style={{ padding: "3px 24px 3px 6px", width: 45 }} />
                          </td>
                          <td style={{ padding: "5px 8px", width: 55 }}>
                            <input value={s.word_limit || ""} onChange={e => updateStory(s.id, { word_limit: e.target.value ? Number(e.target.value) : null })} placeholder="—" style={{ ...inpS, width: 45, textAlign: "center", color: s.word_limit && (s.word_count || s.wordCount || 0) > s.word_limit ? Z.da : Z.tm }} />
                          </td>
                          {/* Images column — manual planning flag (stories.has_images).
                              Independent of attachment state: an editor can flag a
                              story for images before anything is uploaded. */}
                          <td style={{ padding: "5px 4px", width: 32, textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={!!s.has_images}
                              onChange={e => updateStory(s.id, { has_images: e.target.checked })}
                              title="Will run with images"
                              style={{ cursor: "pointer", accentColor: Z.ac, width: 14, height: 14 }}
                            />
                          </td>
                          <td style={{ padding: "5px 4px", width: 32, textAlign: "center" }}>
                            <button onClick={() => deleteStory(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.td, fontSize: FS.md, padding: 2, lineHeight: 1 }} title="Delete story">{"\u00D7"}</button>
                          </td>
                        </tr>;
                      })}
                      {/* Jump-in continuation rows. Read-only — jumps are
                          edited from the origin row only. Click the title to
                          open the origin story in the editor. */}
                      {!groupCollapsed && g.jumpsIn.map(s => (
                        <tr key={`jump-${s.id}`} style={{ background: "rgba(232,176,58,0.04)", borderLeft: `3px solid ${Z.wa}` }}>
                          <td colSpan={11} style={{ padding: "4px 10px 4px 16px", fontStyle: "italic", color: Z.tm, fontSize: FS.sm }}>
                            <span style={{ color: Z.wa, fontWeight: 700, marginRight: 6 }}>↩</span>
                            <span onClick={() => openDetail(s)} style={{ cursor: "pointer", color: Z.ac, fontWeight: 600, marginRight: 4 }}>{s.title || "Untitled"}</span>
                            <span style={{ color: Z.td }}>(cont. from p.{s.jump_from_page ?? s.page})</span>
                          </td>
                        </tr>
                      ))}
                        </Fragment>;
                      })}
                    </tbody>
                  </DataTable>
                </div>
              </div>
            )}
          </div>
        </div>
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
            <Flatplan
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
