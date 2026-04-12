import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Z, SC, COND, DISPLAY, ACCENT, FS, Ri, INV } from "../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Card, SB, Modal, FilterBar, TabRow, TabPipe, GlassStat } from "./ui";
import { STORY_STATUSES } from "../constants";
import { supabase } from "../lib/supabase";
import { useDialog } from "../hooks/useDialog";
import StoryEditor from "./StoryEditor";

// ── Editorial Workflow Constants ──────────────────────────────────
const KANBAN_COLS = [
  { key: "idea", label: "Ideas", color: ACCENT.grey, statuses: ["Draft"] },
  { key: "assigned", label: "Assigned", color: ACCENT.indigo, statuses: ["Needs Editing"] },
  { key: "editing", label: "Editing", color: ACCENT.amber, statuses: ["Edited"] },
  { key: "ready", label: "Ready", color: ACCENT.blue, statuses: ["Approved"] },
  { key: "published", label: "Published", color: Z.su || "#22c55e", statuses: ["Published", "Sent to Web"] },
];

const PRINT_STAGES = [
  { key: "none", label: "Not Assigned" },
  { key: "ready", label: "Ready for Print" },
  { key: "on_page", label: "On Page" },
  { key: "proofread", label: "Proofread" },
  { key: "approved", label: "Approved" },
  { key: "sent_to_press", label: "Sent to Press" },
];

const PRIORITY_COLORS = { urgent: Z.da, high: ACCENT.amber, normal: Z.tm || ACCENT.grey, low: "#d1d5db" };
const PRIORITY_LABELS = { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" };

const STORY_TYPES = ["article", "column", "letter", "obituary", "legal_notice", "calendar_event", "press_release", "opinion"];
const SOURCES = ["staff", "freelance", "syndicated", "press_release", "community", "ai_assisted"];

const TABS = [
  { id: "workflow", label: "Workflow", icon: "flat" },
  { id: "stories", label: "Issue Planning", icon: "pub" },
  { id: "web", label: "Web Queue", icon: "send" },
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
const StoryCard = ({ story, pubs, team, onClick, isDragging }) => {
  const webPublished = story.web_status === "published" || story.status === "Published" || story.status === "Sent to Web";
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
};

// ── Kanban Column ────────────────────────────────────────────────
const KanbanCol = ({ col, stories, pubs, team, onDrop, onClick }) => {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 0 }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const sid = e.dataTransfer.getData("storyId"); if (sid) onDrop(sid, col.key); }}
    >
      {/* Column header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "8px 10px", borderBottom: `2px solid ${col.color}`,
        marginBottom: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: col.color, fontFamily: COND }}>{col.label}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: Z.tm, background: Z.sa, padding: "1px 8px", borderRadius: 10, fontFamily: COND }}>{stories.length}</span>
      </div>

      {/* Drop zone */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", gap: 6,
        padding: 4, borderRadius: Ri, minHeight: 120,
        background: dragOver ? col.color + "10" : "transparent",
        border: dragOver ? `1px dashed ${col.color}` : "1px dashed transparent",
        transition: "all 0.15s",
        overflowY: "auto",
      }}>
        {stories.map(s => (
          <StoryCard key={s.id} story={s} pubs={pubs} team={team} onClick={onClick} />
        ))}
        {stories.length === 0 && (
          <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: Z.td || Z.tm, fontStyle: "italic" }}>
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
const EditorialDashboard = ({ stories: storiesRaw, setStories, pubs, issues, team, bus, editorialPermissions, currentUser, publishStory, unpublishStory }) => {
  const stories = storiesRaw || [];
  const dialog = useDialog();

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

  // Issue planning state
  const [selIssue, setSelIssue] = useState(null);
  const [showPublished, setShowPublished] = useState(false);
  const [sortCol, setSortCol] = useState("title");
  const [sortDir, setSortDir] = useState("asc");

  // ── Filtered stories ────────────────────────────────────────
  const filtered = useMemo(() => {
    return stories.filter(s => {
      if (fPub !== "all" && (s.publication_id || s.publication) !== fPub) return false;
      if (fAssignee !== "all" && s.assigned_to !== fAssignee) return false;
      if (sr) {
        const q = sr.toLowerCase();
        const match = (s.title || "").toLowerCase().includes(q) ||
          (s.author || "").toLowerCase().includes(q) ||
          (s.category || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [stories, fPub, fAssignee, sr]);

  // ── Group stories by kanban column ──────────────────────────
  const kanbanData = useMemo(() => {
    const cols = {};
    KANBAN_COLS.forEach(c => { cols[c.key] = []; });
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    filtered.forEach(s => {
      const status = s.status || "Draft";
      // FIX #6: Auto-hide published stories older than 7 days from kanban
      if ((status === "Published" || status === "Sent to Web") && s.published_at) {
        if (new Date(s.published_at) < sevenDaysAgo) return; // skip — aged out
      }
      const col = KANBAN_COLS.find(c => c.statuses.includes(status));
      if (col) cols[col.key].push(s);
      else cols["idea"].push(s);
    });
    return cols;
  }, [filtered]);

  // ── Handle kanban drag-drop ─────────────────────────────────
  const handleDrop = useCallback((storyId, colKey) => {
    const col = KANBAN_COLS.find(c => c.key === colKey);
    if (!col) return;
    const newStatus = col.statuses[0]; // Take first status in column
    setStories(prev => prev.map(s => {
      if (s.id !== storyId) return s;
      const updates = { ...s, status: newStatus };
      // Auto-set web_status when moving to Published
      if (colKey === "published" && s.web_status !== "published") {
        updates.web_status = "published";
        if (!updates.published_at) updates.published_at = new Date().toISOString();
      }
      return updates;
    }));
    if (bus) bus.emit("story.statusChanged", { storyId, newStatus, column: colKey });
  }, [setStories, bus]);

  // ── Story editor ─────────────────────────────────────────
  const openDetail = (story) => { setSelected(story); setEditorOpen(true); };
  const closeEditor = () => { setEditorOpen(false); setSelected(null); };

  const updateStory = (id, updates) => {
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
    if (updates.published_at !== undefined) dbFields.published_at = updates.published_at;
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

  const publishToWeb = (story) => {
    updateStory(story.id, {
      web_status: "published",
      status: "Published",
      published_at: story.published_at || new Date().toISOString(),
    });
    if (bus) bus.emit("story.published", { storyId: story.id, title: story.title });
  };

  // ── Issues for planning tab ─────────────────────────────────
  const futureIssues = useMemo(() => {
    const byPub = {};
    (issues || [])
      .filter(i => !i.sentToPress && i.date >= new Date().toISOString().slice(0, 10) && (fPub === "all" || i.publicationId === fPub || i.pubId === fPub))
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .forEach(i => {
        const pk = i.publicationId || i.pubId;
        if (!byPub[pk]) byPub[pk] = [];
        if (byPub[pk].length < 2) byPub[pk].push(i);
      });
    return Object.values(byPub).flat().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [issues, fPub]);

  const issueStories = useMemo(() => {
    if (!selIssue) return [];
    return stories
      .filter(s => (s.print_issue_id === selIssue || s.issue_id === selIssue) && (showPublished || (s.status !== "Published" && s.status !== "Sent to Web")))
      .sort((a, b) => {
        const av = a[sortCol] || "", bv = b[sortCol] || "";
        const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [stories, selIssue, showPublished, sortCol, sortDir]);

  // ── Web queue: stories that need web action ─────────────────
  const webQueue = useMemo(() => {
    return filtered
      .filter(s => {
        const isReady = s.status === "Approved" || s.status === "Edited" || s.web_status === "ready";
        const isRepub = needsRepublish(s);
        return isReady || isRepub;
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

    const needsEditCount = filtered.filter(s => s.status === "Needs Editing").length;
    const dueThisWeek = filtered.filter(s => {
      if (!s.due_date || s.status === "Published" || s.status === "Sent to Web") return false;
      const d = new Date(s.due_date);
      return d <= weekFromNow;
    });
    const dueThisWeekCount = dueThisWeek.length;
    const hasOverdue = dueThisWeek.some(s => new Date(s.due_date) < now);
    const readyForWebCount = filtered.filter(s => s.status === "Approved" && s.web_status !== "published").length;
    const publishedThisWeekCount = filtered.filter(s => (s.status === "Published" || s.status === "Sent to Web") && s.published_at && new Date(s.published_at) >= weekAgo).length;

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
      <div style={{ position: "fixed", inset: 0, zIndex: 100, background: Z.bg, display: "flex", flexDirection: "column" }}>
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
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Header ────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: Z.tx, fontFamily: DISPLAY }}>Editorial</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <SB value={sr} onChange={setSr} placeholder="Search stories…" />
          <Sel value={fPub} onChange={e => setFPub(e.target.value)} options={[{ value: "all", label: "All Publications" }, ...pubs.map(p => ({ value: p.id, label: p.name }))]} />
          <Btn sm onClick={() => {
            const id = "story-" + Date.now();
            const issueId = selIssue || "";
            const pubId = issueId ? (issues.find(i => i.id === issueId)?.publicationId || issues.find(i => i.id === issueId)?.pubId || "") : (fPub !== "all" ? fPub : pubs[0]?.id || "");
            const newStory = { id, title: "", status: "Draft", author: "", publication_id: pubId, publication: pubId, issueId, issue_id: issueId, print_issue_id: issueId, category: "News", priority: "normal", web_status: "none", print_status: "none", created_at: new Date().toISOString() };
            setStories(prev => [newStory, ...prev]);
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

      {/* ── Tab bar + filters ─────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, borderBottom: `1px solid ${Z.bd}`, paddingBottom: 8 }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "6px 14px", fontSize: 12, fontWeight: tab === t.id ? 800 : 600,
              color: tab === t.id ? Z.ac : Z.tm, background: "none", border: "none",
              borderBottom: `2px solid ${tab === t.id ? Z.ac : "transparent"}`,
              cursor: "pointer", fontFamily: COND, transition: "all 0.15s",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              {t.label}
              {t.id === "web" && stats.needsRepublish > 0 && (
                <span style={{ width: 16, height: 16, borderRadius: "50%", background: Z.wa, color: INV.light, fontSize: FS.micro, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{stats.needsRepublish}</span>
              )}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {/* Assignee filter */}
          {assignees.length > 0 && (
            <select value={fAssignee} onChange={e => setFAssignee(e.target.value)} style={{ padding: "3px 8px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sf, color: Z.tx, fontSize: 11, fontFamily: COND, cursor: "pointer" }}>
              <option value="all">All Writers</option>
              {assignees.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
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
                  background: isSelected ? Z.ac + "12" : Z.sf,
                  border: `1px solid ${isSelected ? Z.ac : Z.bd}`,
                  borderLeft: `3px solid ${pColor(iss.publicationId || iss.pubId, pubs)}`,
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
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: Z.tm, fontFamily: COND, cursor: "pointer" }}>
                      <input type="checkbox" checked={showPublished} onChange={e => setShowPublished(e.target.checked)} style={{ accentColor: Z.ac }} />
                      Show Published
                    </label>
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
                <div style={{ border: `1px solid ${Z.bd}`, borderRadius: Ri, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: COND }}>
                    <thead>
                      <tr style={{ background: Z.sa, borderBottom: `1px solid ${Z.bd}` }}>
                        {[
                          { key: "title", label: "Title" },
                          { key: "author", label: "Author" },
                          { key: "category", label: "Section" },
                          { key: "status", label: "Status" },
                          { key: "page_number", label: "Page" },
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
                        <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: Z.tm }}>No stories assigned to this issue yet</td></tr>
                      )}
                      {issueStories.map(s => {
                        const inpS = { background: "transparent", border: `1px solid ${Z.bd}`, borderRadius: 3, color: Z.tx, fontSize: 12, fontFamily: COND, outline: "none", padding: "3px 6px", width: "100%", boxSizing: "border-box" };
                        const selS = { ...inpS, cursor: "pointer", WebkitAppearance: "none", MozAppearance: "none", appearance: "none" };
                        const hasSavedTitle = s.title && s.title !== "";
                        return <tr key={s.id} style={{ borderBottom: `1px solid ${Z.bd}` }}>
                          <td style={{ padding: "5px 8px", maxWidth: 260 }}>
                            {hasSavedTitle
                              ? <span onClick={() => openDetail(s)} style={{ fontWeight: 700, color: Z.ac, cursor: "pointer", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                              : <input defaultValue="" placeholder="Story title..." autoFocus onBlur={e => updateStory(s.id, { title: e.target.value })} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }} style={{ ...inpS, fontWeight: 700 }} />
                            }
                          </td>
                          <td style={{ padding: "5px 8px" }}>
                            <select value={s.author || ""} onChange={e => updateStory(s.id, { author: e.target.value })} style={selS}>
                              <option value="">—</option>
                              {[...new Set(stories.map(x => x.author).filter(Boolean))].sort().map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: "5px 8px" }}>
                            <select value={s.category || ""} onChange={e => updateStory(s.id, { category: e.target.value })} style={selS}>
                              <option value="">—</option>
                              {["News", "Business", "Lifestyle", "Food", "Wine", "Culture", "Sports", "Opinion", "Events", "Community", "Outdoors", "Environment", "Real Estate", "Agriculture", "Marine", "Government", "Schools", "Travel", "Obituaries", "Crime"].map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: "5px 8px" }}>
                            <select value={s.status || "Draft"} onChange={e => updateStory(s.id, { status: e.target.value })} style={selS}>
                              {STORY_STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: "5px 8px", width: 60 }}>
                            <input value={s.page_number || s.page || ""} onChange={e => updateStory(s.id, { page_number: e.target.value, page: e.target.value })} placeholder="—" style={{ ...inpS, width: 45, textAlign: "center" }} />
                          </td>
                          <td style={{ padding: "5px 4px", width: 32, textAlign: "center" }}>
                            <button onClick={() => deleteStory(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.td, fontSize: 14, padding: 2, lineHeight: 1 }} title="Delete story">{"\u00D7"}</button>
                          </td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
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
