// TargetProgressCard — at-a-glance progress against the active
// activity_targets for a given role, scoped to one actor.
//
// Renders one row per target: label + actual / target + a thin progress
// bar colored by completion. Pacing-curve targets (designers) are
// excluded — those need usePacingProgress + their own visual.

import { Z, COND, DISPLAY, FS, FW, R, Ri } from "../../lib/theme";
import { useTargetProgress } from "./useTargetProgress";

const PRETTY_LABELS = {
  phone_calls:        "Calls",
  emails_sent:        "Emails",
  meetings_held:      "Meetings",
  proposals_sent:     "Proposals sent",
  contracts_signed:   "Contracts signed",
  pipeline_value_added: "Pipeline added",
  stories_edited:     "Stories edited",
  stories_published:  "Stories published",
  invoices_issued_within_24h_of_issue_close: "On-time invoicing",
  ar_followups_completed: "A/R follow-ups",
  subscriptions_processed: "Subs processed",
};

function toneFromPct(pct) {
  if (pct == null) return Z.tm;
  if (pct >= 100) return Z.go;
  if (pct >= 60)  return Z.wa;
  return Z.da;
}

function fmtUSD(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(n) || 0);
}

export default function TargetProgressCard({ role, actorId, title = "Today's Targets" }) {
  const { progress, targets, loading } = useTargetProgress({ role, actorId });

  // Exclude pacing-curve targets from this card (rendered separately by
  // PacingProgressCard for designers).
  const rows = (targets || [])
    .filter(t => t.target_type !== "queue_pacing_curve")
    .map(t => ({
      metric_name: t.metric_name,
      label: PRETTY_LABELS[t.metric_name] || t.metric_name,
      ...progress[t.metric_name],
    }));

  return (
    <div style={{
      background: Z.sa,
      border: `1px solid ${Z.bd}`,
      borderRadius: R,
      padding: 12,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{
        fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td,
        textTransform: "uppercase", letterSpacing: 1, fontFamily: COND,
        padding: "0 4px",
      }}>
        {title}
      </div>
      {loading && rows.length === 0 && (
        <div style={{ padding: 8, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>Loading…</div>
      )}
      {!loading && rows.length === 0 && (
        <div style={{ padding: 8, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No targets configured.</div>
      )}
      {rows.map(r => {
        const isMoney = r.type === "pipeline_dollars";
        const tone = toneFromPct(r.pct);
        const barFill = Math.min(100, Math.max(0, r.pct ?? 0));
        return (
          <div key={r.metric_name} style={{ padding: "0 4px" }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              marginBottom: 4,
            }}>
              <span style={{ fontSize: FS.sm, color: Z.tx, fontFamily: COND, fontWeight: FW.semi }}>
                {r.label}
              </span>
              <span style={{ fontSize: FS.sm, color: tone, fontFamily: DISPLAY, fontWeight: FW.heavy }}>
                {r.actual == null ? "—" : isMoney ? fmtUSD(r.actual) : r.actual}
                {r.target != null && (
                  <span style={{ color: Z.tm, fontWeight: FW.semi, fontSize: FS.xs, marginLeft: 4 }}>
                    / {isMoney ? fmtUSD(r.target) : r.target}
                  </span>
                )}
              </span>
            </div>
            <div style={{ height: 4, background: Z.bg, borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                width: `${barFill}%`,
                height: "100%",
                background: tone,
                transition: "width 250ms ease-out",
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
