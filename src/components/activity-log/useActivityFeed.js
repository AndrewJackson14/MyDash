// useActivityFeed — load today's activity_log rows for a given actor +
// optional category/source filters. Used by per-role dashboards, the
// Office Admin module, and any other surface that wants a chronological
// feed of "what I did today."
//
// Defaults (today, my own row, both effort and outcome) keep the call
// site small. Pass actorId=null to read team-wide. Pass category=null to
// include all categories.

import { useCallback, useEffect, useState } from "react";
import { supabase, isOnline } from "../../lib/supabase";

const DAY_MS = 86400000;

export function useActivityFeed({
  actorId,           // people.id — null = team-wide
  scope = "today",   // 'today' | 'yesterday'
  categories = ["effort", "outcome", "transition", "comment", "manual_log"],
  limit = 50,
} = {}) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const since = (() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    if (scope === "yesterday") d.setTime(d.getTime() - DAY_MS);
    return d.toISOString();
  })();

  const load = useCallback(async (append = false, beforeCreatedAt = null) => {
    if (!isOnline()) { setLoading(false); return; }
    let q = supabase
      .from("activity_log")
      .select("*")
      .gte("created_at", since)
      .eq("visibility", "team")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (actorId) q = q.eq("actor_id", actorId);
    if (categories && categories.length) q = q.in("event_category", categories);
    if (beforeCreatedAt) q = q.lt("created_at", beforeCreatedAt);

    const { data, error } = await q;
    if (error) { console.warn("[useActivityFeed] load failed:", error.message); return; }
    setRows(prev => append ? [...prev, ...(data || [])] : (data || []));
    setHasMore((data || []).length === limit);
    setLoading(false);
  }, [actorId, categories?.join(","), limit, since]);

  useEffect(() => { load(); /* on mount + when filters change */ }, [load]);

  return {
    rows,
    loading,
    hasMore,
    refresh: () => load(false, null),
    loadMore: () => load(true, rows[rows.length - 1]?.created_at || null),
  };
}
