// useTargetProgress — load activity_targets for a role and compute
// "today's progress" against each target by counting matching rows in
// activity_log.
//
// Daily-count metrics: count today's rows where event_type matches the
// metric_name's expected event types.
// Pipeline-dollars: sum the metadata.amount across today's matching rows.
// Weekly-cycle: count rows in the current Mon-Sun window.
// Queue-pacing-curve: handled separately by usePacingProgress (designers
// — uses ad_projects / flatplan_page_status, not activity_log counts).

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, isOnline } from "../../lib/supabase";

// Map activity_targets.metric_name → activity_log event_types that
// count toward it. Conservative — extend as new metrics get added.
const METRIC_EVENT_TYPES = {
  phone_calls:        ["phone_call_logged"],
  emails_sent:        ["email_sent"],
  meetings_held:      ["meeting_held"],
  proposals_sent:     ["proposal_sent"],
  contracts_signed:   ["contract_signed"],
  pipeline_value_added: ["proposal_sent", "contract_signed"],
  stories_edited:     ["story_worked_on"],
  stories_published:  ["story_published"],
  invoices_issued_within_24h_of_issue_close: ["invoice_issued"],
  ar_followups_completed: ["ar_followup", "phone_call_logged", "email_sent"],
  subscriptions_processed: ["subscription_added", "subscription_renewed"],
};

const DAY_MS = 86400000;

function startOfToday() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfThisWeek() {
  // Monday 00:00 local
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0 = Sunday, 1 = Monday
  const offset = dow === 0 ? 6 : dow - 1;
  d.setTime(d.getTime() - offset * DAY_MS);
  return d.toISOString();
}

export function useTargetProgress({ role, actorId } = {}) {
  const [targets, setTargets] = useState([]);
  const [progress, setProgress] = useState({});  // metric_name → { actual, target, type, pct }
  const [loading, setLoading] = useState(true);

  const loadTargets = useCallback(async () => {
    if (!isOnline() || !role) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("activity_targets")
      .select("*")
      .eq("role", role)
      .eq("active", true);
    if (error) { console.warn("[useTargetProgress] targets load failed:", error.message); setLoading(false); return; }
    setTargets(data || []);
  }, [role]);

  const computeProgress = useCallback(async () => {
    if (!isOnline() || !targets.length || !actorId) { setLoading(false); return; }

    const out = {};
    for (const t of targets) {
      // queue_pacing_curve is handled by a separate hook (usePacingProgress)
      if (t.target_type === "queue_pacing_curve") continue;

      const eventTypes = METRIC_EVENT_TYPES[t.metric_name] || [];
      if (!eventTypes.length) {
        out[t.metric_name] = { actual: null, target: Number(t.target_value) || null, type: t.target_type, pct: null };
        continue;
      }

      const since = t.target_type === "weekly_cycle" ? startOfThisWeek() : startOfToday();

      if (t.target_type === "pipeline_dollars") {
        // Sum metadata.amount across matching rows. Supabase doesn't
        // SUM a JSON path natively; pull rows + sum client-side. Bounded
        // to today, scoped to actor — small.
        const { data } = await supabase
          .from("activity_log")
          .select("metadata")
          .gte("created_at", since)
          .eq("actor_id", actorId)
          .in("type", eventTypes);
        const sum = (data || []).reduce((acc, r) => acc + (Number(r.metadata?.amount) || 0), 0);
        out[t.metric_name] = {
          actual: sum,
          target: Number(t.target_value) || null,
          type: t.target_type,
          pct: t.target_value > 0 ? Math.round((sum / Number(t.target_value)) * 100) : null,
        };
      } else {
        // daily_count or weekly_cycle — head-only count
        const { count } = await supabase
          .from("activity_log")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since)
          .eq("actor_id", actorId)
          .in("type", eventTypes);
        const actual = count || 0;
        out[t.metric_name] = {
          actual,
          target: Number(t.target_value) || null,
          type: t.target_type,
          pct: t.target_value > 0 ? Math.round((actual / Number(t.target_value)) * 100) : null,
        };
      }
    }
    setProgress(out);
    setLoading(false);
  }, [targets, actorId]);

  useEffect(() => { loadTargets(); }, [loadTargets]);
  useEffect(() => { computeProgress(); }, [computeProgress]);

  return useMemo(() => ({
    targets,
    progress,
    loading,
    refresh: () => { loadTargets(); computeProgress(); },
  }), [targets, progress, loading, loadTargets, computeProgress]);
}
