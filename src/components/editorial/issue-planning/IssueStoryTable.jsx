import React, { Fragment, useMemo, useState, useCallback } from "react";
import { Z, COND, DISPLAY, ACCENT, FS, Ri } from "../../../lib/theme";
import { Sel, DataTable, Ic } from "../../ui";
import FuzzyPicker from "../../FuzzyPicker";
import { STORY_STATUSES } from "../../../constants";
import { sectionForPage, updateSection as updateSectionDb } from "../../../lib/sections";
import { PRIORITY_OPTIONS, DEFAULT_PAGE_COUNT, STORY_CATEGORIES } from "./IssuePlanningTab.constants";
import BulkActionBar from "./BulkActionBar";
import "./IssueStoryTable.css";

const COLUMNS = [
  { key: "_select", label: "" },
  { key: "_drag", label: "" },
  { key: "title", label: "Title" },
  { key: "author", label: "Author" },
  { key: "category", label: "Section" },
  { key: "status", label: "Status" },
  { key: "page_number", label: "Page" },
  { key: "jump_to_page", label: "Jump" },
  { key: "priority", label: "Pri" },
  { key: "word_limit", label: "Limit" },
  { key: "_img", label: "Img", title: "Story is flagged to run with images (planning flag — separate from attached uploads)" },
  { key: "_delete", label: "" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "—" },
  ...STORY_CATEGORIES.map(c => ({ value: c, label: c })),
];

const inpS = { background: "transparent", border: `1px solid ${Z.bd}`, borderRadius: 3, color: Z.tx, fontSize: FS.sm, fontFamily: COND, outline: "none", padding: "3px 6px", width: "100%", boxSizing: "border-box" };

// Build per-issue page-number options once per issueStories+max change
// rather than per-row. The orphan-preserving variant from IP Wave 1
// (out-of-range values still appear with "(orphan)" suffix) is now
// computed against the union of the dropdown's current value when
// rendering the cell.
function buildPageOptions(max, currentValue) {
  const opts = [{ value: "", label: "—" }];
  for (let i = 1; i <= max; i++) opts.push({ value: String(i), label: String(i) });
  if (currentValue && !isNaN(Number(currentValue)) && Number(currentValue) > max) {
    opts.push({ value: String(currentValue), label: `${currentValue} (orphan)` });
  }
  return opts;
}

// Section divider row — appears above the first page-group whose
// page falls inside a section. Editable label + kind + delete.
const SectionHeaderRow = React.memo(function SectionHeaderRow({ section, pubType, onLabelChange, onLabelBlur, onKindChange, onDelete }) {
  // Cached so a per-issue render pass doesn't recompute the tooltip
  // string for every section divider on the page.
  const tooltip = useMemo(
    () => pubType === "Newspaper"
      ? "Main = resets newspaper page numbering. Sub = label only."
      : "Magazine: kind doesn't affect numbering",
    [pubType],
  );
  return (
    <tr style={{ background: Z.bg }}>
      <td colSpan={12} style={{ padding: "10px 12px 4px", borderTop: `2px solid ${ACCENT.indigo}40` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: ACCENT.indigo, fontFamily: COND, padding: "2px 6px", background: ACCENT.indigo + "15", borderRadius: Ri, textTransform: "uppercase", letterSpacing: 0.6 }}>
            {section.kind === "sub" ? "SUB" : "SECTION"}
          </span>
          <input
            value={section.label || ""}
            onChange={e => onLabelChange(section.id, e.target.value)}
            onBlur={e => onLabelBlur(section.id, e.target.value)}
            style={{ fontSize: FS.md, fontWeight: 800, color: Z.tx, fontFamily: DISPLAY, background: "transparent", border: "none", outline: "none", padding: 0, flex: 1 }}
          />
          <select
            value={section.kind || "main"}
            onChange={e => onKindChange(section.id, e.target.value)}
            title={tooltip}
            style={{ fontSize: FS.micro, fontWeight: 700, fontFamily: COND, background: "transparent", border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "2px 6px", color: Z.tm, cursor: "pointer" }}
          >
            <option value="main">Main</option>
            <option value="sub">Sub</option>
          </select>
          <button
            onClick={() => onDelete(section)}
            title="Delete section"
            style={{ background: "none", border: "none", cursor: "pointer", color: Z.td, padding: "0 4px", display: "inline-flex", alignItems: "center" }}
          ><Ic.close size={14} /></button>
        </div>
      </td>
    </tr>
  );
});

// Page-group header row — collapsible. Drop target for "append to this page".
const PageGroupRow = React.memo(function PageGroupRow({ group, isCollapsed, onToggle, onDragOver, onDrop, fmtPage, draggingId }) {
  const wordSum = useMemo(
    () => group.stories.reduce((sum, s) => sum + (Number(s.word_count || s.wordCount) || 0), 0),
    [group.stories]
  );
  // `data-drop-target` toggles between "false" and "true" via direct
  // DOM mutation from IssuePlanningTab.setDropTargetVisuals; the
  // append-target tint is driven by IssueStoryTable.css.
  return (
    <tr
      data-group-key={group.key}
      data-group-row="true"
      data-drop-target="false"
      style={{ background: Z.sa, transition: "background 0.1s, outline 0.2s" }}
      onDragOver={(e) => {
        if (!draggingId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        // IP Wave 3 task 3.8: auto-expand a collapsed group when a
        // drag enters it so the editor can drop to a specific row.
        if (isCollapsed) onToggle(group.key);
        onDragOver(group.key, null);
      }}
      onDrop={(e) => { e.preventDefault(); if (draggingId) onDrop(group.key, null); }}
    >
      <td colSpan={12} style={{ padding: "6px 10px", borderBottom: `1px solid ${Z.bd}`, cursor: "pointer", userSelect: "none" }} onClick={() => onToggle(group.key)}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: COND, fontSize: FS.xs, fontWeight: 800, color: group.key === "unassigned" ? Z.wa : Z.tx, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <span style={{ width: 12, color: Z.tm, display: "inline-flex", alignItems: "center" }}>
            {isCollapsed ? <Ic.chevronRight size={12} /> : <Ic.chevronDown size={12} />}
          </span>
          <span>{group.key === "unassigned" ? group.label : `Page ${fmtPage(group.page)}`}</span>
          <span style={{ color: Z.tm, fontWeight: 600, letterSpacing: 0 }}>
            {group.stories.length} {group.stories.length === 1 ? "story" : "stories"}
            {wordSum > 0 ? ` · ${wordSum.toLocaleString()} words` : ""}
            {group.jumpsIn.length ? ` · ${group.jumpsIn.length} jumping in` : ""}
          </span>
          <span className="ip-drop-append-hint" style={{ marginLeft: "auto", fontSize: FS.micro, color: Z.ac, fontWeight: 700 }}>Drop to append</span>
        </div>
      </td>
    </tr>
  );
});

// Read-only "(cont. from p.X)" jump-in indicator. Click title opens
// the origin story in the editor.
const JumpRow = React.memo(function JumpRow({ story, onOpenDetail }) {
  return (
    <tr style={{ background: "rgba(232,176,58,0.04)", borderLeft: `3px solid ${Z.wa}` }}>
      <td colSpan={12} style={{ padding: "4px 10px 4px 16px", fontStyle: "italic", color: Z.tm, fontSize: FS.sm }}>
        <span style={{ color: Z.wa, marginRight: 6, display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}><Ic.cornerDownLeft size={13} /></span>
        <span onClick={() => onOpenDetail(story)} style={{ cursor: "pointer", color: Z.ac, fontWeight: 600, marginRight: 4 }}>{story.title || "Untitled"}</span>
        <span style={{ color: Z.td }}>(cont. from p.{story.jump_from_page ?? story.page})</span>
      </td>
    </tr>
  );
});

// The editable story row. Wrapped in memo so unrelated row edits or
// keystrokes elsewhere in the table don't re-render every row.
const StoryRow = React.memo(function StoryRow({
  story,
  groupKey,
  isDragging,
  isSelected, onToggleSelect,
  authorOptions, pageOptions, jumpOptions,
  siblingOptions, primaryPubName,
  isSibling, isMirror,
  statusColor,
  // callbacks
  onUpdateStory, onDeleteStory, onOpenDetail, onToggleSiblingLink,
  onDragStart, onDragOver, onDrop, onDragEnd,
  draggingId,
}) {
  const s = story;
  const hasSavedTitle = s.title && s.title !== "";
  const sc = statusColor;
  return (
    <tr
      data-row-id={s.id}
      data-drop-target="false"
      style={{
        borderBottom: `1px solid ${Z.bd}`,
        opacity: isSibling ? 0.6 : (isDragging ? 0.4 : 1),
        background: isDragging ? Z.sa : undefined,
      }}
      onDragOver={(e) => {
        if (!draggingId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver(groupKey, s.id);
      }}
      onDrop={(e) => { e.preventDefault(); if (draggingId) onDrop(groupKey, s.id); }}
    >
      <td style={{ padding: "5px 4px", width: 24, textAlign: "center" }}>
        {!isSibling && !isMirror && (
          <input
            type="checkbox"
            checked={!!isSelected}
            onChange={() => onToggleSelect(s.id)}
            style={{ cursor: "pointer", accentColor: Z.ac, width: 14, height: 14 }}
          />
        )}
      </td>
      <td
        draggable={!isSibling && !isMirror}
        onDragStart={(e) => {
          if (isSibling || isMirror) { e.preventDefault(); return; }
          onDragStart(s.id);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", s.id);
        }}
        onDragEnd={onDragEnd}
        style={{ padding: "5px 4px", width: 18, textAlign: "center", color: Z.td, cursor: (isSibling || isMirror) ? "default" : "grab", userSelect: "none", opacity: (isSibling || isMirror) ? 0.3 : 1, verticalAlign: "middle" }}
        title={(isSibling || isMirror) ? "" : "Drag to reorder"}
      >
        <span style={{ display: "inline-flex", alignItems: "center" }}><Ic.gripVertical size={14} /></span>
      </td>
      <td style={{ padding: "5px 8px", maxWidth: 280 }}>
        {isSibling && (
          <span
            title={`Sibling-pub view from ${s._siblingPub} — read-only here.`}
            style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 800, color: "var(--action)", background: "color-mix(in srgb, var(--action) 10%, transparent)", padding: "1px 5px", borderRadius: 3, marginRight: 4, textTransform: "uppercase", letterSpacing: 0.5 }}
          >
            <Ic.link size={9} />
            {s._siblingPub?.split(" ")[0]}
          </span>
        )}
        {isMirror && (
          <span
            title={`This story lives on ${primaryPubName}'s issue. Edits there mirror here.`}
            style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 800, color: "var(--action)", background: "color-mix(in srgb, var(--action) 10%, transparent)", padding: "1px 5px", borderRadius: 3, marginRight: 4, textTransform: "uppercase", letterSpacing: 0.5 }}
          >
            <Ic.link size={9} />
            {primaryPubName}
          </span>
        )}
        {hasSavedTitle
          ? <span onClick={() => !isSibling && onOpenDetail(s)} style={{ fontWeight: 700, color: isSibling ? Z.tm : Z.ac, cursor: isSibling ? "default" : "pointer", display: "inline", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
          : <input defaultValue="" placeholder="Story title..." autoFocus onBlur={e => onUpdateStory(s.id, { title: e.target.value })} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }} style={{ ...inpS, fontWeight: 700 }} />
        }
        {siblingOptions.length > 0 && hasSavedTitle && (
          <div style={{ marginTop: 3, display: "flex", gap: 4, flexWrap: "wrap" }}>
            {siblingOptions.map(({ issue: sibIss, pub: sibPub }) => {
              const linked = Array.isArray(s.also_in_issue_ids) && s.also_in_issue_ids.includes(sibIss.id);
              return (
                <button
                  key={sibIss.id}
                  onClick={() => onToggleSiblingLink(s, sibIss.id)}
                  title={linked ? `Unlink from ${sibPub.name}` : `Also publish in ${sibPub.name} (${new Date(sibIss.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })})`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 3,
                    fontSize: 9, fontWeight: 700, fontFamily: COND, letterSpacing: 0.3,
                    padding: "2px 7px", borderRadius: 10, cursor: "pointer",
                    background: linked ? "color-mix(in srgb, var(--action) 15%, transparent)" : Z.sa,
                    color: linked ? "var(--action)" : Z.tm,
                    border: `1px solid ${linked ? "color-mix(in srgb, var(--action) 40%, transparent)" : Z.bd}`,
                  }}
                >
                  {linked ? <Ic.link size={10} /> : <Ic.plus size={10} />}
                  {sibPub.name}
                </button>
              );
            })}
          </div>
        )}
      </td>
      <td style={{ padding: "5px 8px" }}>
        <FuzzyPicker value={s.author || ""} onChange={(v) => onUpdateStory(s.id, { author: v })} options={authorOptions} placeholder="Author…" emptyLabel="—" size="sm" />
      </td>
      <td style={{ padding: "5px 8px" }}>
        <Sel value={s.category || ""} onChange={e => onUpdateStory(s.id, { category: e.target.value })} options={CATEGORY_OPTIONS} style={{ padding: "3px 24px 3px 6px" }} />
      </td>
      <td style={{ padding: "5px 8px" }}>
        <Sel
          value={s.status || "Draft"}
          onChange={e => onUpdateStory(s.id, { status: e.target.value })}
          options={STORY_STATUSES.map(st => ({ value: st, label: st }))}
          style={{ padding: "3px 24px 3px 6px", color: sc ? "#fff" : Z.tx, fontWeight: 700, background: sc?.fg || "transparent", border: "none", borderRadius: 20 }}
        />
      </td>
      <td style={{ padding: "5px 8px", width: 60 }}>
        <Sel
          value={String(s.page_number || s.page || "")}
          onChange={e => onUpdateStory(s.id, { page_number: e.target.value, page: e.target.value })}
          options={pageOptions}
          style={{ padding: "3px 24px 3px 6px", width: 55 }}
        />
      </td>
      <td style={{ padding: "5px 8px", width: 60 }}>
        <Sel
          value={s.jump_to_page != null ? String(s.jump_to_page) : ""}
          onChange={e => onUpdateStory(s.id, { jump_to_page: e.target.value || null })}
          options={jumpOptions}
          style={{ padding: "3px 24px 3px 6px", width: 55 }}
        />
      </td>
      <td style={{ padding: "5px 8px", width: 50 }}>
        <Sel value={String(s.priority || "4")} onChange={e => onUpdateStory(s.id, { priority: e.target.value })} options={PRIORITY_OPTIONS} style={{ padding: "3px 24px 3px 6px", width: 45 }} />
      </td>
      <td style={{ padding: "5px 8px", width: 55 }}>
        <input value={s.word_limit || ""} onChange={e => onUpdateStory(s.id, { word_limit: e.target.value ? Number(e.target.value) : null })} placeholder="—" style={{ ...inpS, width: 45, textAlign: "center", color: s.word_limit && (s.word_count || s.wordCount || 0) > s.word_limit ? Z.da : Z.tm }} />
      </td>
      <td style={{ padding: "5px 4px", width: 32, textAlign: "center" }}>
        <input
          type="checkbox"
          checked={!!s.has_images}
          onChange={e => onUpdateStory(s.id, { has_images: e.target.checked })}
          title="Will run with images"
          style={{ cursor: "pointer", accentColor: Z.ac, width: 14, height: 14 }}
        />
      </td>
      <td style={{ padding: "5px 4px", width: 32, textAlign: "center" }}>
        <button onClick={() => onDeleteStory(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.td, fontSize: FS.md, padding: 2, lineHeight: 1 }} title="Delete story">×</button>
      </td>
    </tr>
  );
});

// The table shell. Walks pageGroups, injects section dividers above
// pages whose section flips, renders StoryRow + JumpRow children.
function IssueStoryTable(props) {
  const {
    pageGroups, issueSections, setIssueSections, collapsedGroups, toggleGroup,
    sortCol, sortDir, setSortCol, setSortDir,
    draggingId, tableRef,
    fmtPage, statusColors, statusColorsOn,
    inactiveAuthorNames, allStories,
    issue, pubsById,
    siblingIssuesFor, issuesById,
    // Callbacks
    onUpdateStory, onDeleteStory, onOpenDetail, onToggleSiblingLink,
    onDeleteSection,
    onBulkPatch, onBulkDelete,
    team,
    onDragStart, onDragOver, onDrop, onDragEnd,
  } = props;

  // ── Bulk selection (IP Wave 3 task 3.6) ──────────────────
  // Local because no parent surface needs to read it. The bulk
  // handlers below pull the id list from this Set when invoked.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const toggleRowSelection = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  // Bulk-select header: only primary rows (skip mirror + sibling rows
  // since they aren't editable from the IP table).
  const allSelectableIds = useMemo(() => {
    const out = [];
    for (const g of pageGroups) {
      for (const s of g.stories) {
        if (!s._fromSibling && !s._mirroredFrom) out.push(s.id);
      }
    }
    return out;
  }, [pageGroups]);
  const allSelected = allSelectableIds.length > 0 && allSelectableIds.every(id => selectedIds.has(id));
  const someSelected = selectedIds.size > 0 && !allSelected;
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allSelectableIds));
  };
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkStatus = async (status) => {
    if (!onBulkPatch) return;
    await onBulkPatch([...selectedIds], { status });
  };
  const handleBulkAssignee = async (val) => {
    if (!onBulkPatch) return;
    const assigned_to = val === "__unassigned__" ? null : val;
    await onBulkPatch([...selectedIds], { assigned_to });
  };
  const handleBulkClearPage = async () => {
    if (!onBulkPatch) return;
    await onBulkPatch([...selectedIds], { page: null });
  };
  const handleBulkDelete = async () => {
    if (!onBulkDelete) return;
    const ids = [...selectedIds];
    const ok = await onBulkDelete(ids);
    if (ok) setSelectedIds(new Set());
  };

  const max = issue?.pageCount || DEFAULT_PAGE_COUNT;

  // Author dropdown options — computed once for the whole table.
  // Inactive authors are filtered out unless they're the current
  // value on a row (handled per-row by passing that row's author).
  const baseAuthorList = useMemo(
    () => [...new Set(allStories.map(x => x.author).filter(Boolean))].sort(),
    [allStories]
  );

  const handleSort = (key) => {
    if (sortCol === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(key); setSortDir("asc"); }
  };

  const handleSectionLabelChange = (sectionId, value) => {
    setIssueSections(prev => prev.map(s => s.id === sectionId ? { ...s, label: value } : s));
  };
  const handleSectionLabelBlur = (sectionId, value) => {
    updateSectionDb(sectionId, { label: value }).catch(err => console.error("Section rename failed:", err));
  };
  const handleSectionKindChange = async (sectionId, value) => {
    setIssueSections(prev => prev.map(s => s.id === sectionId ? { ...s, kind: value } : s));
    try { await updateSectionDb(sectionId, { kind: value }); } catch (err) { console.error("Section kind change failed:", err); }
  };
  // Section delete is owned by the parent (IP Wave 3) so it can
  // count in-range stories and route through the themed dialog.
  const handleSectionDelete = (section) => onDeleteSection(section);

  const issuePub = issue ? pubsById.get(issue.publicationId || issue.pubId) : null;
  const pubType = issuePub?.type;

  return (
    <div ref={tableRef} style={{ overflow: "hidden" }}>
      <BulkActionBar
        selectedCount={selectedIds.size}
        team={team}
        onClearSelection={clearSelection}
        onChangeStatus={handleBulkStatus}
        onChangeAssignee={handleBulkAssignee}
        onClearPage={handleBulkClearPage}
        onDelete={handleBulkDelete}
      />
      <DataTable>
        <thead className="ip-table-thead">
          <tr>
            {COLUMNS.map(col => {
              const noSort = col.key === "_delete" || col.key === "_drag" || col.key === "_select";
              if (col.key === "_select") {
                return (
                  <th key={col.key} style={{ padding: "6px 4px", width: 24, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleAll}
                      title={allSelected ? "Clear all" : "Select all"}
                      style={{ cursor: "pointer", accentColor: Z.ac }}
                    />
                  </th>
                );
              }
              return (
                <th
                  key={col.key}
                  onClick={!noSort ? () => handleSort(col.key) : undefined}
                  title={col.title}
                  style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, color: Z.tm, fontSize: FS.xs, cursor: !noSort ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap", width: noSort ? 18 : undefined }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {col.label}
                    {sortCol === col.key && (
                      sortDir === "asc"
                        ? <Ic.chevronUp size={11} />
                        : <Ic.chevronDown size={11} />
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {pageGroups.length === 0 || pageGroups.every(g => g.stories.length === 0 && g.jumpsIn.length === 0) ? (
            <tr><td colSpan={12} style={{ padding: 24, textAlign: "center", color: Z.tm }}>No stories assigned to this issue yet</td></tr>
          ) : null}
          {pageGroups.map((g, gi) => {
            const isCollapsed = collapsedGroups.has(g.key);
            const prevGroup = gi > 0 ? pageGroups[gi - 1] : null;
            const hereSection = g.page != null ? sectionForPage(g.page, issueSections) : null;
            const prevSection = prevGroup && prevGroup.page != null ? sectionForPage(prevGroup.page, issueSections) : null;
            const showSectionHeader = !!hereSection && (!prevSection || prevSection.id !== hereSection.id);
            return (
              <Fragment key={g.key}>
                {showSectionHeader && (
                  <SectionHeaderRow
                    section={hereSection}
                    pubType={pubType}
                    onLabelChange={handleSectionLabelChange}
                    onLabelBlur={handleSectionLabelBlur}
                    onKindChange={handleSectionKindChange}
                    onDelete={handleSectionDelete}
                  />
                )}
                <PageGroupRow
                  group={g}
                  isCollapsed={isCollapsed}
                  onToggle={toggleGroup}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  fmtPage={fmtPage}
                  draggingId={draggingId}
                />
                {!isCollapsed && g.stories.map(s => {
                  const isSibling = s._fromSibling;
                  const isMirror = !!s._mirroredFrom;
                  const isDragging = draggingId === s.id;
                  const siblingOptions = !isMirror && !isSibling ? siblingIssuesFor(s) : [];
                  const primaryPubName = isMirror
                    ? (pubsById.get(issuesById.get(s._mirroredFrom)?.publicationId
                        || issuesById.get(s._mirroredFrom)?.pubId)?.name || "primary")
                    : null;
                  const authorOptions = baseAuthorList
                    .filter(a => !inactiveAuthorNames.has(a) || a === s.author)
                    .map(a => ({ value: a, label: a }));
                  const cur = s.page_number || s.page || "";
                  const pageOptions = buildPageOptions(max, cur);
                  const jumpCur = s.jump_to_page != null ? String(s.jump_to_page) : "";
                  const jumpOptions = buildPageOptions(max, jumpCur);
                  const statusColor = statusColorsOn ? (statusColors[s.status] || statusColors.Draft) : null;
                  return (
                    <StoryRow
                      key={s.id}
                      story={s}
                      groupKey={g.key}
                      isDragging={isDragging}
                      isSelected={selectedIds.has(s.id)}
                      onToggleSelect={toggleRowSelection}
                      authorOptions={authorOptions}
                      pageOptions={pageOptions}
                      jumpOptions={jumpOptions}
                      siblingOptions={siblingOptions}
                      primaryPubName={primaryPubName}
                      isSibling={isSibling}
                      isMirror={isMirror}
                      statusColor={statusColor}
                      onUpdateStory={onUpdateStory}
                      onDeleteStory={onDeleteStory}
                      onOpenDetail={onOpenDetail}
                      onToggleSiblingLink={onToggleSiblingLink}
                      onDragStart={onDragStart}
                      onDragOver={onDragOver}
                      onDrop={onDrop}
                      onDragEnd={onDragEnd}
                      draggingId={draggingId}
                    />
                  );
                })}
                {!isCollapsed && g.jumpsIn.map(s => (
                  <JumpRow key={`jump-${s.id}`} story={s} onOpenDetail={onOpenDetail} />
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </DataTable>
    </div>
  );
}

export default React.memo(IssueStoryTable);
