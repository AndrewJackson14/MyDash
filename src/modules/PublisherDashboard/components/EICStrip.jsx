// EICStrip.jsx — Editor-in-Chief additions for the Publisher Dashboard.
//
// Three tiles in a SectionCard:
//   1. Story approval queue (count of stories pending EIC approval)
//   2. Web queue depth (stories approved-for-web but not yet sent_to_web)
//   3. Editorial pacing for next press issue (% stories filed/edited
//      vs. needed for press)
//
// Hayley wears both hats while there's no separate EIC. If an EIC gets
// hired later, this strip can move into a per-role surface — the data
// lives in the same tables either way.

import { useEffect, useMemo, useState } from "react";
import { Z, COND, DISPLAY, FS, FW, R } from "../../../lib/theme";
import { supabase, isOnline } from "../../../lib/supabase";
import SectionCard from "./SectionCard";

export default function EICStrip({ onNavigate }) {
  const [stats, setStats] = useState({
    approvalQueueCount: 0,
    oldestApprovalDays: null,
    webQueueCount: 0,
    nextIssue: null,            // { id, label, pubName, pressDate, daysToPress, edPct }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOnline()) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        // Approval queue — stories in 'Edit' awaiting web approval.
        // The editorial enum is Draft → Edit → Ready → Archived. EIC
        // approves at the Edit→Ready transition for web/print.
        const { data: pending } = await supabase
          .from("stories")
          .select("id, status, updated_at")
          .eq("status", "Edit")
          .order("updated_at", { ascending: true })
          .limit(50);

        const oldest = pending?.[0]?.updated_at
          ? Math.floor((Date.now() - new Date(pending[0].updated_at).getTime()) / 86400000)
          : null;

        // Web queue depth — Ready stories not yet sent_to_web.
        const { count: webCount } = await supabase
          .from("stories")
          .select("id", { count: "exact", head: true })
          .eq("status", "Ready")
          .eq("sent_to_web", false);

        // Editorial pacing — next press issue with story counts.
        // Uses publisher_issue_pacing_view's window (next 7 days, not
        // yet shipped) and joins to story counts.
        const { data: nextIssues } = await supabase
          .from("publisher_issue_pacing_view")
          .select("issue_id, label, publication_name, press_date, days_to_deadline")
          .order("press_date", { ascending: true })
          .limit(1);
        const next = nextIssues?.[0];

        let edPct = null;
        if (next) {
          const { data: stories } = await supabase
            .from("stories")
            .select("id, status")
            .eq("print_issue_id", next.issue_id);
          const total = stories?.length || 0;
          const ready = (stories || []).filter(s => s.status === "Ready").length;
          edPct = total > 0 ? Math.round((ready / total) * 100) : null;
        }

        if (cancelled) return;
        setStats({
          approvalQueueCount: pending?.length || 0,
          oldestApprovalDays: oldest,
          webQueueCount: webCount || 0,
          nextIssue: next ? {
            id: next.issue_id,
            label: next.label,
            pubName: next.publication_name,
            pressDate: next.press_date,
            daysToPress: next.days_to_deadline,
            edPct,
          } : null,
        });
        setLoading(false);
      } catch (err) {
        console.warn("[EICStrip] load failed:", err);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const tile = (label, big, sub, color, onClick) => (
    <div
      onClick={onClick}
      style={{
        flex: "1 1 0",
        padding: "14px 12px",
        background: Z.bg,
        borderRadius: R,
        textAlign: "center",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={{ fontSize: FS.xxl, fontWeight: FW.black, color, fontFamily: DISPLAY, lineHeight: 1.1 }}>{big}</div>
      <div style={{ fontSize: 9, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  // Color the approval queue red if any story has been pending > 3 days
  const approvalTone = stats.oldestApprovalDays != null && stats.oldestApprovalDays > 3
    ? Z.da
    : stats.approvalQueueCount > 0 ? Z.wa : Z.go;

  // Web queue color: any depth is a soft warning
  const webTone = stats.webQueueCount > 0 ? Z.wa : Z.go;

  // Editorial pacing — green at 100, amber at 60-99, red below 60. Null = no issue.
  const edTone = stats.nextIssue?.edPct == null
    ? Z.tm
    : stats.nextIssue.edPct >= 100 ? Z.go
    : stats.nextIssue.edPct >= 60 ? Z.wa
    : Z.da;

  return (
    <SectionCard title="Editorial">
      {loading ? (
        <div style={{ padding: 16, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {tile(
            "Approval queue",
            stats.approvalQueueCount,
            stats.oldestApprovalDays != null
              ? `oldest ${stats.oldestApprovalDays}d`
              : stats.approvalQueueCount > 0 ? "in editing" : "all clear",
            approvalTone,
            () => onNavigate?.("editorial"),
          )}
          {tile(
            "Web queue",
            stats.webQueueCount,
            stats.webQueueCount > 0 ? "ready, not live" : "all live",
            webTone,
            () => onNavigate?.("editorial"),
          )}
          {tile(
            "Next press",
            stats.nextIssue?.edPct != null ? `${stats.nextIssue.edPct}%` : "—",
            stats.nextIssue
              ? `${stats.nextIssue.pubName} · ${stats.nextIssue.daysToPress}d out`
              : "no issue in window",
            edTone,
            () => stats.nextIssue?.id && onNavigate?.(`/layout?id=${stats.nextIssue.id}`),
          )}
        </div>
      )}
    </SectionCard>
  );
}
