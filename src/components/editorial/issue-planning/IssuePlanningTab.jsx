import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Z, FS } from "../../../lib/theme";
import { supabase } from "../../../lib/supabase";
import { useDialog } from "../../../hooks/useDialog";
import { loadSectionsForIssue, createSection as createSectionDb, applyDefaultSectionsToIssue, pageLabel } from "../../../lib/sections";
import { bulkUpdateStories } from "../../../lib/storyBulkUpdate";

import IssuePlanningErrorBoundary from "./IssuePlanningErrorBoundary";
import IssueSidebar from "./IssueSidebar";
import IssueHeader from "./IssueHeader";
import IssueStatStrip from "./IssueStatStrip";
import IssuePrintPipeline from "./IssuePrintPipeline";
import IssuePageMap from "./IssuePageMap";
import IssueDiscussionPanel from "./IssueDiscussionPanel";
import IssueToolbar from "./IssueToolbar";
import IssueStoryTable from "./IssueStoryTable";

// ============================================================
// IssuePlanningTab — IP Wave 2 orchestrator.
// Owns all Issue-Planning-specific state (selIssue, sections,
// collapse state, sort, drag) and renders the decomposed
// sub-panels. Stays under ~400 lines so the shell-vs-leaf
// boundary is obvious.
// ============================================================
function IssuePlanningTab({
  // Data
  stories,           // filtered story array (post fPub/fAssignee filter)
  setStories,        // shared setter (for optimistic updates)
  pubs,
  issues,
  team,
  sales,
  currentUser,
  // Status colors
  statusColors, statusColorsOn,
  // Filters
  fPub,
  // Save status — passed down from the parent so writes in either
  // shell (parent's updateStory etc., or the tab's reorderStories /
  // toggleSiblingLink) all flow through the same indicator.
  save,
  // Selection lives in the parent so the Flatplan tab can seed from
  // it on cross-tab navigation. Everything else is tab-local.
  selIssue, setSelIssue,
  // Callbacks
  openDetail,
  onUpdateStory, onDeleteStory,
  onAddInlineStoryForIssue, addingInlineStory,
}) {
  const dialog = useDialog();
  // ── Local state ──────────────────────────────────────────
  const [showSiblings, setShowSiblings] = useState(false);
  const [issueSections, setIssueSections] = useState([]);
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [sortCol, setSortCol] = useState("title");
  const [sortDir, setSortDir] = useState("asc");

  // ── Lookup indices (IP Wave 2) ───────────────────────────
  // Computed locally so the parent shell doesn't need to thread them
  // through. Each rebuilds O(N) on its source change; the table reads
  // them O(1) per row instead of walking arrays in render.
  const pubsById = useMemo(() => {
    const m = new Map();
    for (const p of pubs) m.set(p.id, p);
    return m;
  }, [pubs]);

  const issuesById = useMemo(() => {
    const m = new Map();
    for (const i of issues) m.set(i.id, i);
    return m;
  }, [issues]);

  // pubId → ISO date → issue. Drives sibling-issue resolution.
  const issuesByPubAndDate = useMemo(() => {
    const m = new Map();
    for (const i of issues) {
      const pubId = i.publicationId || i.pubId;
      const date  = i.date;
      if (!pubId || !date) continue;
      let inner = m.get(pubId);
      if (!inner) { inner = new Map(); m.set(pubId, inner); }
      inner.set(date, i);
    }
    return m;
  }, [issues]);

  // ── fmtPage: pub-aware page-label formatter ──────────────
  const fmtPage = useMemo(() => {
    const issue = issuesById.get(selIssue);
    const pubId = issue?.pubId || issue?.publicationId;
    const pubType = pubsById.get(pubId)?.type;
    return (page) => pageLabel(page, issueSections, pubType);
  }, [issueSections, issuesById, selIssue, pubsById]);

  // ── Sections: initial load + realtime subscription ───────
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

  // ── Per-issue collapsed-groups persistence ───────────────
  // IP Wave 2 task 2.11: debounce the localStorage write so a
  // rapid expand/collapse spree doesn't hit storage on every flip.
  useEffect(() => {
    if (!selIssue) { setCollapsedGroups(new Set()); return; }
    try {
      const raw = localStorage.getItem(`ip_collapsed_${selIssue}`);
      setCollapsedGroups(new Set(raw ? JSON.parse(raw) : []));
    } catch { setCollapsedGroups(new Set()); }
  }, [selIssue]);
  useEffect(() => {
    if (!selIssue) return;
    const id = setTimeout(() => {
      try { localStorage.setItem(`ip_collapsed_${selIssue}`, JSON.stringify([...collapsedGroups])); } catch {}
    }, 200);
    return () => clearTimeout(id);
  }, [collapsedGroups, selIssue]);

  const toggleGroup = useCallback((key) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // ── Memo: upcoming issues for sidebar ────────────────────
  const futureIssues = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const byPub = {};
    (issues || [])
      .filter(i => i.date >= today && (fPub === "all" || i.publicationId === fPub || i.pubId === fPub))
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .forEach(i => {
        const pk = i.publicationId || i.pubId;
        if (!byPub[pk]) byPub[pk] = [];
        if (byPub[pk].length < 2) byPub[pk].push(i);
      });
    return Object.values(byPub).flat().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [issues, fPub]);

  // Per-issue story count for the sidebar — uses Wave 2 indices.
  const getStoryCount = useCallback((issueId) => {
    return (stories || []).filter(s =>
      s.print_issue_id === issueId
      || (Array.isArray(s.also_in_issue_ids) && s.also_in_issue_ids.includes(issueId))
    ).length;
  }, [stories]);

  // ── Sibling-publication context for the selected issue ───
  const siblingCtx = useMemo(() => {
    if (!selIssue) return null;
    const iss = issuesById.get(selIssue);
    if (!iss) return null;
    const pub = pubsById.get(iss.pubId || iss.publicationId);
    const siblings = pub?.sharedContentWith || pub?.settings?.shared_content_with || [];
    if (siblings.length === 0) return null;
    const out = siblings.map(sibId => {
      const sibIss = issuesByPubAndDate.get(sibId)?.get(iss.date);
      const sibPub = pubsById.get(sibId);
      return sibIss && sibPub ? { issue: sibIss, pub: sibPub } : null;
    }).filter(Boolean);
    return out.length > 0 ? out : null;
  }, [selIssue, issuesById, pubsById, issuesByPubAndDate]);

  // ── Sibling resolver per story (used inside the table) ──
  const siblingIssuesFor = useCallback((story) => {
    const primary = issuesById.get(story.print_issue_id);
    if (!primary) return [];
    const primaryPubId = primary.publicationId || primary.pubId;
    const primaryPub = pubsById.get(primaryPubId);
    const sibs = primaryPub?.sharedContentWith || primaryPub?.settings?.shared_content_with || [];
    return sibs.map(sibPubId => {
      const sibPub = pubsById.get(sibPubId);
      const sibIss = issuesByPubAndDate.get(sibPubId)?.get(primary.date);
      return sibIss && sibPub ? { issue: sibIss, pub: sibPub } : null;
    }).filter(Boolean);
  }, [issuesById, pubsById, issuesByPubAndDate]);

  // ── Stories filtered + sorted for the active issue ───────
  const issueStories = useMemo(() => {
    if (!selIssue) return [];
    let list = stories
      .filter(s => s.print_issue_id === selIssue
                || (Array.isArray(s.also_in_issue_ids) && s.also_in_issue_ids.includes(selIssue)))
      .map(s => s.print_issue_id === selIssue ? s : { ...s, _mirroredFrom: s.print_issue_id });
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

  // ── Page-grouped layout for the table ────────────────────
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
    issueStories.forEach(s => {
      const j = parseInt(s.jump_to_page);
      if (isNaN(j)) return;
      const k = String(j);
      if (!buckets.has(k)) buckets.set(k, { key: k, page: j, label: `Page ${j}`, stories: [], jumpsIn: [] });
      buckets.get(k).jumpsIn.push(s);
    });
    if (buckets.get("unassigned").stories.length === 0) buckets.delete("unassigned");
    return [...buckets.values()].sort((a, b) => {
      if (a.key === "unassigned") return -1;
      if (b.key === "unassigned") return 1;
      return a.page - b.page;
    });
  }, [issueStories]);

  // ── Inactive-author filter for the byline dropdown ──────
  const inactiveAuthorNames = useMemo(() => new Set(
    (team || []).filter(t => t.isActive === false).map(t => t.name)
  ), [team]);

  // ── Reorder via drag-drop (atomic upsert from IP Wave 1) ─
  const reorderStories = useCallback(async (targetGroupKey, dropBeforeId) => {
    const draggedId = draggingId;
    setDraggingId(null);
    setDropTarget(null);
    if (!draggedId) return;
    const dragged = issueStories.find(s => s.id === draggedId);
    if (!dragged) return;
    const targetPage = targetGroupKey === "unassigned" ? null : Number(targetGroupKey);

    const currentPage = (dragged.page ?? null);
    const sourceGroupKey = currentPage == null ? "unassigned" : String(currentPage);

    const destGroup = pageGroups.find(g => g.key === targetGroupKey);
    const destStories = (destGroup?.stories || []).filter(s => s.id !== draggedId);

    if (sourceGroupKey !== targetGroupKey && targetPage != null && destStories.length > 0) {
      const occupants = destStories.slice(0, 3).map(s => `"${(s.title || "Untitled").slice(0, 28)}"`).join(", ");
      const more = destStories.length > 3 ? ` + ${destStories.length - 3} more` : "";
      const ok = await dialog.confirm(
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

    const updates = [];
    newDest.forEach((s, idx) => {
      const newPriority = String(Math.min(6, idx + 1));
      const patch = {};
      const sPage = s.page ?? null;
      if (sPage !== targetPage) patch.page = targetPage;
      if (String(s.priority || "") !== newPriority) patch.priority = newPriority;
      if (Object.keys(patch).length > 0) updates.push({ id: s.id, patch });
    });

    if (sourceGroupKey !== targetGroupKey) {
      const srcGroup = pageGroups.find(g => g.key === sourceGroupKey);
      const remaining = (srcGroup?.stories || []).filter(s => s.id !== draggedId);
      remaining.forEach((s, idx) => {
        const newPriority = String(Math.min(6, idx + 1));
        if (String(s.priority || "") !== newPriority) {
          updates.push({ id: s.id, patch: { priority: newPriority } });
        }
      });
    }

    if (updates.length === 0) return;

    setStories(prev => {
      const map = new Map(updates.map(u => [u.id, u.patch]));
      return prev.map(s => map.has(s.id) ? { ...s, ...map.get(s.id) } : s);
    });

    const doBulk = async () => {
      const { error } = await bulkUpdateStories(updates);
      if (error) throw error;
    };
    save.track(doBulk(), { retry: () => save.track(doBulk()) }).catch(() => {});
  }, [draggingId, issueStories, pageGroups, dialog, setStories, save]);

  // ── Sibling-link toggle (functional state from Wave 1) ──
  const toggleSiblingLink = useCallback(async (story, siblingIssueId) => {
    let nextValue;
    setStories(prev => prev.map(s => {
      if (s.id !== story.id) return s;
      const current = Array.isArray(s.also_in_issue_ids) ? s.also_in_issue_ids : [];
      nextValue = current.includes(siblingIssueId)
        ? current.filter(x => x !== siblingIssueId)
        : [...current, siblingIssueId];
      return { ...s, also_in_issue_ids: nextValue, alsoInIssueIds: nextValue };
    }));
    if (nextValue === undefined) return;
    const doSave = async () => {
      const { error } = await supabase.from("stories")
        .update({ also_in_issue_ids: nextValue, updated_at: new Date().toISOString() })
        .eq("id", story.id);
      if (error) throw error;
    };
    save.track(doSave(), { retry: () => save.track(doSave()) }).catch(() => {});
  }, [setStories, save]);

  // ── DnD callbacks routed to children ─────────────────────
  const handleDragStart = useCallback((id) => setDraggingId(id), []);
  const handleDragEnd = useCallback(() => { setDraggingId(null); setDropTarget(null); }, []);
  const handleDragOver = useCallback((groupKey, beforeId) => {
    setDropTarget(prev => {
      if (prev && prev.groupKey === groupKey && prev.beforeId === beforeId) return prev;
      return { groupKey, beforeId };
    });
  }, []);

  // ── New-section creator ──────────────────────────────────
  const handleNewSection = useCallback(async () => {
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
  }, [selIssue]);

  const handleApplyDefaults = useCallback(async () => {
    if (!selIssue) return;
    const issue = issuesById.get(selIssue);
    const pub = pubsById.get(issue?.pubId);
    const defaults = Array.isArray(pub?.defaultSections) ? pub.defaultSections : [];
    if (!defaults.length) return;
    try {
      const rows = await applyDefaultSectionsToIssue(selIssue, defaults);
      setIssueSections(prev => [...prev, ...rows].sort((a, b) => (a.afterPage ?? 0) - (b.afterPage ?? 0)));
    } catch (err) {
      console.error("Apply default sections failed:", err);
      alert("Could not apply defaults: " + (err.message || "unknown error"));
    }
  }, [selIssue, issuesById, pubsById]);

  // Default-sections affordance visibility
  const issue = issuesById.get(selIssue);
  const issuePub = issue ? pubsById.get(issue.pubId || issue.publicationId) : null;
  const defaultSectionsCount = (issuePub?.defaultSections || []).length;

  return (
    <IssuePlanningErrorBoundary>
      <div style={{ display: "grid", gridTemplateColumns: sidebarCollapsed ? "44px 1fr" : "260px 1fr", gap: 16, minHeight: 400, transition: "grid-template-columns 0.2s ease" }}>
        <IssueSidebar
          futureIssues={futureIssues}
          selIssue={selIssue}
          onSelectIssue={setSelIssue}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={setSidebarCollapsed}
          pubsById={pubsById}
          getStoryCount={getStoryCount}
        />

        <div>
          {!selIssue ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: Z.tm, fontSize: FS.base }}>
              Select an issue to view assigned stories
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <IssueHeader
                issue={issue}
                siblingCtx={siblingCtx}
                showSiblings={showSiblings}
                onToggleSiblings={setShowSiblings}
                storyCount={issueStories.length}
                save={save}
              />
              <IssueStatStrip issueStories={issueStories} sales={sales} selIssue={selIssue} />
              <IssueDiscussionPanel
                selIssue={selIssue}
                issueLabel={issue?.label}
                team={team}
                currentUser={currentUser}
              />
              <IssuePrintPipeline issueStories={issueStories} />
              <IssuePageMap issue={issue} issueStories={issueStories} fmtPage={fmtPage} />
              <IssueToolbar
                selIssue={selIssue}
                addingInlineStory={addingInlineStory}
                defaultSectionsCount={defaultSectionsCount}
                hasIssueSections={issueSections.length > 0}
                onNewStory={onAddInlineStoryForIssue}
                onNewSection={handleNewSection}
                onApplyDefaults={handleApplyDefaults}
              />
              <IssueStoryTable
                pageGroups={pageGroups}
                issueSections={issueSections}
                setIssueSections={setIssueSections}
                collapsedGroups={collapsedGroups}
                toggleGroup={toggleGroup}
                sortCol={sortCol}
                sortDir={sortDir}
                setSortCol={setSortCol}
                setSortDir={setSortDir}
                draggingId={draggingId}
                dropTarget={dropTarget}
                fmtPage={fmtPage}
                statusColors={statusColors}
                statusColorsOn={statusColorsOn}
                inactiveAuthorNames={inactiveAuthorNames}
                allStories={stories}
                issue={issue}
                pubsById={pubsById}
                siblingIssuesFor={siblingIssuesFor}
                issuesById={issuesById}
                onUpdateStory={onUpdateStory}
                onDeleteStory={onDeleteStory}
                onOpenDetail={openDetail}
                onToggleSiblingLink={toggleSiblingLink}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={reorderStories}
                onDragEnd={handleDragEnd}
              />
            </div>
          )}
        </div>
      </div>
    </IssuePlanningErrorBoundary>
  );
}

export default IssuePlanningTab;
