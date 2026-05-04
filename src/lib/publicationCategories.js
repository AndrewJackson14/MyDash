// ============================================================
// Publication categories — canonical catalog + per-pub selection layer.
//
// The categories table is the global canonical catalog (one row per
// logical category, no publication_id). publication_categories joins
// pubs to the canonical categories they've selected, with `position`
// driving display order in MySites nav and the Story Editor dropdown.
//
// All mutations renumber positions to stay contiguous (1..N) so the
// UI can rely on position semantics without holes.
// ============================================================

import { supabase } from "./supabase";

const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Load the full canonical catalog. */
export async function loadCanonicalCategories() {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, sort_order, parent_id, description")
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Load a publication's selected categories with positions. */
export async function loadPubCategories(pubId) {
  if (!pubId) return [];
  const { data, error } = await supabase
    .from("publication_categories")
    .select("position, category:categories(id, name, slug, sort_order, description)")
    .eq("publication_id", pubId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data || [])
    .filter((r) => r.category)
    .map((r) => ({ ...r.category, position: r.position }));
}

/** Append a canonical category to a pub at max(position)+1. */
export async function addPubCategory(pubId, categoryId) {
  const { data: maxRow } = await supabase
    .from("publication_categories")
    .select("position")
    .eq("publication_id", pubId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos = (maxRow?.position || 0) + 1;
  const { error } = await supabase
    .from("publication_categories")
    .insert({ publication_id: pubId, category_id: categoryId, position: nextPos });
  if (error) throw error;
}

/** Remove a category from a pub, then renumber the remaining rows. */
export async function removePubCategory(pubId, categoryId) {
  const { error: delErr } = await supabase
    .from("publication_categories")
    .delete()
    .eq("publication_id", pubId)
    .eq("category_id", categoryId);
  if (delErr) throw delErr;
  await renumberPubCategories(pubId);
}

/**
 * Rewrite positions to match the order of `orderedCategoryIds`.
 * Two-step write to avoid the unique (pub, position) collision while
 * positions overlap mid-update: first move every row to a high
 * negative offset, then write the final positions.
 *
 * Note: there's no UNIQUE on (pub, position) today, so a single-pass
 * rewrite would actually work. Keeping the two-step pattern as
 * defense-in-depth in case we add the constraint later.
 */
export async function reorderPubCategories(pubId, orderedCategoryIds) {
  if (!pubId || !Array.isArray(orderedCategoryIds)) return;
  const moves = orderedCategoryIds.map((id, i) => ({ id, finalPos: i + 1 }));
  for (const m of moves) {
    const { error } = await supabase
      .from("publication_categories")
      .update({ position: -1000 - m.finalPos })
      .eq("publication_id", pubId)
      .eq("category_id", m.id);
    if (error) throw error;
  }
  for (const m of moves) {
    const { error } = await supabase
      .from("publication_categories")
      .update({ position: m.finalPos })
      .eq("publication_id", pubId)
      .eq("category_id", m.id);
    if (error) throw error;
  }
}

/** Internal: rewrite positions to 1..N in current order. */
async function renumberPubCategories(pubId) {
  const rows = await loadPubCategories(pubId);
  await reorderPubCategories(pubId, rows.map((r) => r.id));
}

/**
 * Create a brand new canonical category. Returns the row.
 * Slug is derived from the name (lowercase + hyphenated). Throws on
 * UNIQUE collisions so the caller can surface a friendly error.
 */
export async function createCategory({ name, description = null, sortOrder = null }) {
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("Category name is required");
  const slug = slugify(cleanName);
  if (!slug) throw new Error("Category name must contain at least one letter or digit");
  const { data, error } = await supabase
    .from("categories")
    .insert({ name: cleanName, slug, description, sort_order: sortOrder })
    .select("id, name, slug, sort_order, parent_id, description")
    .single();
  if (error) throw error;
  return data;
}
