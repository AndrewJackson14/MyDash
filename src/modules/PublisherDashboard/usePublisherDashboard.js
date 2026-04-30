// usePublisherDashboard.js — assembles all sections from Supabase.
// Realtime subscriptions are stubbed — per spec, "Hayley reviews before
// activity stream is wired live." Wire the channel block when she signs off.

import { useCallback, useEffect, useState, useMemo } from "react";
import { supabase, isOnline } from "../../lib/supabase";
import { ACTIVITY_PAGE_SIZE } from "./constants";

export default function usePublisherDashboard({ team }) {
  const [issues, setIssues]               = useState([]);
  const [alerts, setAlerts]               = useState([]);
  const [events, setEvents]               = useState([]);
  const [eventsHasMore, setEventsHasMore] = useState(false);
  const [glance, setGlance]               = useState(null);
  const [loading, setLoading]             = useState(true);
  const [scope, setScope]                 = useState("today");

  // ── Lookups (resolve activity_log foreign keys to display names)
  const teamById = useMemo(() => {
    const m = new Map();
    (team || []).forEach(t => m.set(t.id, t.name));
    return m;
  }, [team]);

  const resolveActor = useCallback((actorId) => {
    if (!actorId) return null;
    return teamById.get(actorId) || null;
  }, [teamById]);

  const resolveClient = useCallback((_clientId, fallback) => fallback || null, []);
  const resolvePublication = useCallback(() => null, []);

  // ── Issue cards (publisher_issue_pacing_view)
  const loadIssues = useCallback(async () => {
    if (!isOnline()) return;
    const { data, error } = await supabase
      .from("publisher_issue_pacing_view")
      .select("*")
      .order("press_date", { ascending: true });
    if (error) {
      console.error("[publisher-dashboard] issues load failed:", error);
      return;
    }
    setIssues(data || []);
  }, []);

  // ── Alerts (publisher_alerts UNION view)
  const loadAlerts = useCallback(async () => {
    if (!isOnline()) return;
    const { data, error } = await supabase
      .from("publisher_alerts")
      .select("*")
      .order("occurred_at", { ascending: true });
    if (error) {
      console.error("[publisher-dashboard] alerts load failed:", error);
      return;
    }
    setAlerts(data || []);
  }, []);

  // ── Activity stream (activity_log direct read).
  // Filter per spec: visibility=team only; effort-category events excluded
  // (raw call/email counts roll up to Sales Rep's own dashboard, not
  // Hayley's stream). Today = since local 12:00am; yesterday extends 24h
  // further.
  const loadEvents = useCallback(async (selectedScope = scope, append = false, beforeId = null) => {
    if (!isOnline()) return;
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    if (selectedScope === "yesterday") since.setDate(since.getDate() - 1);

    let q = supabase
      .from("activity_log")
      .select("*")
      .gte("created_at", since.toISOString())
      .eq("visibility", "team")
      .in("event_category", ["outcome", "transition", "comment", "manual_log"])
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_PAGE_SIZE);

    if (beforeId) {
      // Cursor-style for "Load more"
      const cursor = events.find(e => e.id === beforeId);
      if (cursor?.created_at) q = q.lt("created_at", cursor.created_at);
    }

    const { data, error } = await q;
    if (error) {
      console.error("[publisher-dashboard] events load failed:", error);
      return;
    }
    setEvents(prev => append ? [...prev, ...(data || [])] : (data || []));
    setEventsHasMore((data || []).length === ACTIVITY_PAGE_SIZE);
  }, [scope, events]);

  // ── Month at a Glance (single-row aggregate view)
  const loadGlance = useCallback(async () => {
    if (!isOnline()) return;
    const { data, error } = await supabase
      .from("publisher_month_at_a_glance_view")
      .select("*")
      .single();
    if (error) {
      console.error("[publisher-dashboard] glance load failed:", error);
      return;
    }
    setGlance(data || null);
  }, []);

  // ── Initial mount + scope changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([loadIssues(), loadAlerts(), loadGlance(), loadEvents(scope)]);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadEvents(scope);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // ── Realtime — staged off per spec. Restore when Hayley approves
  // the event filter list for the activity stream.
  //
  // useEffect(() => {
  //   if (!isOnline()) return;
  //   const ch = supabase
  //     .channel("publisher-activity")
  //     .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log" },
  //         (payload) => setEvents(prev => [payload.new, ...prev]))
  //     .subscribe();
  //   return () => { supabase.removeChannel(ch); };
  // }, []);

  return {
    loading,
    issues,
    alerts,
    events,
    eventsHasMore,
    eventsScope: scope,
    setEventsScope: setScope,
    loadMoreEvents: () => loadEvents(scope, true, events[events.length - 1]?.id),
    glance,
    refresh: () => Promise.all([loadIssues(), loadAlerts(), loadGlance(), loadEvents(scope)]),
    resolveActor,
    resolveClient,
    resolvePublication,
  };
}
