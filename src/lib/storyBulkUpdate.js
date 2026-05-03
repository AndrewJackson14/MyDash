// ============================================================
// storyBulkUpdate.js — atomic bulk update for stories
//
// Why this exists: drag-drop reorder used to fire N separate PATCH
// requests in a tight forEach. If any one failed (RLS, network, race),
// the others still went through, leaving an inconsistent ordering.
// upsert is atomic: all rows commit, or none do.
//
// Postgres + supabase-js don't expose multi-row UPDATE with different
// values per row in a single statement, so we use upsert with `id` as
// the conflict target. Every row in `updates` must include `id`; only
// the fields present on each row's `patch` are written.
// ============================================================
import { supabase } from "./supabase";

export async function bulkUpdateStories(updates) {
  if (!Array.isArray(updates) || updates.length === 0) return { error: null };

  const now = new Date().toISOString();
  const rows = updates.map(u => ({
    id: u.id,
    updated_at: now,
    ...u.patch,
  }));

  const { error } = await supabase
    .from("stories")
    .upsert(rows, { onConflict: "id" });

  return { error };
}
