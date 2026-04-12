import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Z, SC, COND, DISPLAY, ACCENT, FS, Ri, INV } from "../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Card, SB, Modal, FilterBar, TabRow, TabPipe } from "./ui";
import { STORY_STATUSES } from "../constants";
import StoryEditor from "./StoryEditor";
import StoriesModule from "../pages/StoriesModule";

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
  { id: "kanban", label: "Workflow", icon: "flat" },
  { id: "table", label: "Stories", icon: "story" },
  { id: "issues", label: "Issue Planning", icon: "pub" },
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
const EditorialDashboard = ({ stories: storiesRaw, setStories, pubs, issues, team, bus, editorialPermissions, currentUser, publishStory, unpublishStory, globalPageStories, setGlobalPageStories }) => {
  const stories = storiesRaw || [];
  const [tab, setTab] = useState("kanban");
  const [fPub, setFPub] = useState("all");
  const [fAssignee, setFAssignee] = useState("all");
  const [fPriority, setFPriority] = useState("all");
  const [sr, setSr] = useState("");
  const [selected, setSelected] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);

  // Issue planning state
  const [selIssue, setSelIssue] = useState(null);

  // ── Filtered stories ────────────────────────────────────────
  const filtered = useMemo(() => {
    return stories.filter(s => {
      if (fPub !== "all" && (s.publication_id || s.publication) !== fPub) return false;
      if (fAssignee !== "all" && s.assigned_to !== fAssignee) return false;
      if (fPriority !== "all" && (s.priority || "normal") !== fPriority) return false;
      if (sr) {
        const q = sr.toLowerCase();
        const match = (s.title || "").toLowerCase().includes(q) ||
          (s.author || "").toLowerCase().includes(q) ||
          (s.category || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [stories, fPub, fAssignee, fPriority, sr]);

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
    return (issues || [])
      .filter(i => !i.sentToPress && (fPub === "all" || i.publicationId === fPub))
      .sort((a, b) => new Date(a.date || a.deadline) - new Date(b.date || b.deadline))
      .slice(0, 20);
  }, [issues, fPub]);

  const issueStories = useMemo(() => {
    if (!selIssue) return [];
    return stories.filter(s => s.print_issue_id === selIssue || s.issue_id === selIssue);
  }, [stories, selIssue]);

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
  const stats = useMemo(() => ({
    total: filtered.length,
    drafts: filtered.filter(s => s.status === "Draft").length,
    inProgress: filtered.filter(s => ["Needs Editing", "Edited", "Approved"].includes(s.status)).length,
    published: filtered.filter(s => s.status === "Published" || s.status === "Sent to Web").length,
    needsRepublish: filtered.filter(s => needsRepublish(s)).length,
    urgent: filtered.filter(s => s.priority === "urgent" || s.priority === "high").length,
  }), [filtered]);

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
            const newStory = { id, title: "New Story", status: "Draft", author: "", publication_id: fPub !== "all" ? fPub : pubs[0]?.id, category: "News", priority: "normal", web_status: "none", print_status: "none", created_at: new Date().toISOString() };
            setStories(prev => [newStory, ...prev]);
            openDetail(newStory);
          }}><Ic.plus size={12} /> New Story</Btn>
        </div>
      </div>

      {/* ── Stats bar ─────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {[
          { label: "Total", value: stats.total, color: Z.tx },
          { label: "Drafts", value: stats.drafts, color: ACCENT.grey },
          { label: "In Progress", value: stats.inProgress, color: ACCENT.indigo },
          { label: "Published", value: stats.published, color: Z.su || "#22c55e" },
          ...(stats.needsRepublish > 0 ? [{ label: "Needs Republish", value: stats.needsRepublish, color: Z.wa }] : []),
          ...(stats.urgent > 0 ? [{ label: "Urgent", value: stats.urgent, color: Z.da }] : []),
        ].map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: DISPLAY }}>{s.value}</span>
            <span style={{ fontSize: 11, color: Z.tm, fontFamily: COND, fontWeight: 600 }}>{s.label}</span>
          </div>
        ))}
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
          {/* Priority filter */}
          <select value={fPriority} onChange={e => setFPriority(e.target.value)} style={{ padding: "3px 8px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sf, color: Z.tx, fontSize: 11, fontFamily: COND, cursor: "pointer" }}>
            <option value="all">All Priority</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* ── Tab Content ───────────────────────────────────── */}

      {/* KANBAN VIEW */}
      {tab === "kanban" && (
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

      {/* STORIES TABLE VIEW */}
      {tab === "table" && (
        <StoriesModule stories={stories} setStories={setStories} pubs={pubs} issues={issues} globalPageStories={globalPageStories} setGlobalPageStories={setGlobalPageStories} />
      )}

      {/* ISSUE PLANNING VIEW */}
      {tab === "issues" && (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, minHeight: 400 }}>
          {/* Issue list */}
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
                  borderLeft: `3px solid ${pColor(iss.publicationId, pubs)}`,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: Z.tx, fontFamily: COND }}>{iss.label || iss.title || "Issue"}</div>
                  <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND, marginTop: 2 }}>
                    {pn(iss.publicationId, pubs)} · {stCount} stories
                    {iss.date && ` · ${new Date(iss.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Issue detail / story list */}
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
                  <span style={{ fontSize: 11, color: Z.tm, fontFamily: COND }}>{issueStories.length} stories</span>
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
                {/* Story cards */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {issueStories.length === 0 && <div style={{ fontSize: 12, color: Z.tm, padding: 16, textAlign: "center" }}>No stories assigned to this issue yet</div>}
                  {issueStories.map(s => (
                    <StoryCard key={s.id} story={s} pubs={pubs} team={team} onClick={openDetail} />
                  ))}
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
