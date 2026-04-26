// ============================================================
// Section helpers — flatplan_sections CRUD + page-label computation.
//
// Sections are scoped to an issue and own an explicit page range
// [startPage, endPage]. A page belongs to the section whose range
// contains it. Internally we store snake_case (start_page/end_page/
// name) to match the prod schema; the API surface is camelCase.
//
// Two kinds:
//   main — newspaper page numbering resets here (A1, A2, B1, B2)
//   sub  — label only, no page reset (subsections within a main
//          section keep the parent's pagination)
//
// Both Flatplan and the Issue Planner read/write through this module
// so edits in one view propagate to the other.
// ============================================================

import { supabase } from "./supabase";

/** Load all sections for an issue, ordered by start_page. */
export async function loadSectionsForIssue(issueId) {
  if (!issueId) return [];
  const { data, error } = await supabase
    .from("flatplan_sections")
    .select("id, issue_id, name, start_page, end_page, color, kind, sort_order")
    .eq("issue_id", issueId)
    .order("start_page", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data || []).map(toCamel);
}

/**
 * Insert a new section.
 *
 * Either pass startPage/endPage explicitly, or pass afterPage and the
 * section is created as a 1-page section starting at afterPage + 1.
 * (afterPage kept as a convenience for the Flatplan's "click pages
 * to define section" picker.)
 */
export async function createSection({ issueId, startPage, endPage, afterPage, label, name, kind = "main", color, sortOrder = 0 }) {
  const start = startPage != null ? startPage : (afterPage != null ? afterPage + 1 : 1);
  const end = endPage != null ? endPage : start;
  const insertRow = {
    issue_id: issueId,
    name: (name ?? label ?? "Section").toString(),
    start_page: start,
    end_page: end,
    kind: kind === "sub" ? "sub" : "main",
    sort_order: sortOrder,
  };
  if (color) insertRow.color = color;
  const { data, error } = await supabase
    .from("flatplan_sections")
    .insert(insertRow)
    .select("id, issue_id, name, start_page, end_page, color, kind, sort_order")
    .single();
  if (error) throw error;
  return toCamel(data);
}

/** Patch a section by id. Updates is a camelCase partial. */
export async function updateSection(id, updates) {
  const dbUpdates = {};
  if (updates.label !== undefined || updates.name !== undefined) {
    dbUpdates.name = (updates.name ?? updates.label).toString();
  }
  if (updates.startPage !== undefined) dbUpdates.start_page = updates.startPage;
  if (updates.endPage !== undefined) dbUpdates.end_page = updates.endPage;
  if (updates.afterPage !== undefined) dbUpdates.start_page = updates.afterPage + 1;
  if (updates.kind !== undefined) dbUpdates.kind = updates.kind === "sub" ? "sub" : "main";
  if (updates.color !== undefined) dbUpdates.color = updates.color;
  if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;
  if (Object.keys(dbUpdates).length === 0) return;
  const { error } = await supabase
    .from("flatplan_sections")
    .update(dbUpdates)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteSection(id) {
  const { error } = await supabase.from("flatplan_sections").delete().eq("id", id);
  if (error) throw error;
}

/** Set publications.default_sections. */
export async function updatePubDefaultSections(pubId, sections) {
  const cleaned = (sections || []).map(s => ({
    label: String(s.label || s.name || "").trim() || "Section",
    kind: s.kind === "sub" ? "sub" : "main",
  }));
  const { error } = await supabase
    .from("publications")
    .update({ default_sections: cleaned })
    .eq("id", pubId);
  if (error) throw error;
}

/**
 * Materialize a pub's default_sections into flatplan_sections rows for
 * an issue. Each default section gets a 1-page slot starting at page
 * 1; the publisher then drags boundaries inline. start_page/end_page
 * are NOT NULL in prod so we must give them values.
 */
export async function applyDefaultSectionsToIssue(issueId, defaultSections) {
  if (!issueId || !Array.isArray(defaultSections) || defaultSections.length === 0) return [];
  const rows = defaultSections.map((s, idx) => ({
    issue_id: issueId,
    name: s.label || s.name || "Section",
    start_page: 1,
    end_page: 1,
    kind: s.kind === "sub" ? "sub" : "main",
    sort_order: idx,
  }));
  const { data, error } = await supabase
    .from("flatplan_sections")
    .insert(rows)
    .select("id, issue_id, name, start_page, end_page, color, kind, sort_order");
  if (error) throw error;
  return (data || []).map(toCamel);
}

/**
 * Page-label display:
 *   - Magazine → linear ("12")
 *   - Newspaper → main-section-relative ("A3", "B1")
 */
export function pageLabel(page, sections, pubType) {
  if (page == null) return "";
  if (pubType !== "Newspaper") return String(page);
  const mainContaining = (sections || [])
    .filter(s => s.kind === "main" && page >= (s.startPage ?? 1) && page <= (s.endPage ?? Infinity))
    .sort((a, b) => (a.startPage ?? 1) - (b.startPage ?? 1))[0];
  if (!mainContaining) return String(page);
  const offset = page - (mainContaining.startPage ?? 1) + 1;
  return `${mainContaining.label || ""}${offset}`;
}

/**
 * Return the section a given page belongs to. Range-based: matches
 * any section whose [startPage, endPage] contains the page. Prefers
 * sub over main when both match (subs are more specific labels).
 */
export function sectionForPage(page, sections) {
  if (page == null || !Array.isArray(sections)) return null;
  const containing = sections.filter(s =>
    page >= (s.startPage ?? 1) && page <= (s.endPage ?? -1)
  );
  if (containing.length === 0) return null;
  // Prefer sub over main when both match (sub = more specific)
  const sub = containing.find(s => s.kind === "sub");
  return sub || containing[0];
}

function toCamel(r) {
  return {
    id: r.id,
    issueId: r.issue_id,
    label: r.name,         // canonical display field across UIs
    name: r.name,          // raw schema field
    startPage: r.start_page,
    endPage: r.end_page,
    afterPage: (r.start_page ?? 1) - 1, // legacy convenience for old Flatplan UI
    color: r.color || null,
    kind: r.kind || "main",
    sortOrder: r.sort_order,
  };
}
