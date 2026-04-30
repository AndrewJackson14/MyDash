// ActivityFeedCard — chronological event feed for any role's
// dashboard or sidebar. Thin wrapper around useActivityFeed; renders
// a simple list of events with timestamps + summaries.

import { Z, COND, FS, FW, R, Ri } from "../../lib/theme";
import { useActivityFeed } from "./useActivityFeed";

const fmtTime = (ts) => {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

export default function ActivityFeedCard({
  actorId,
  scope = "today",
  categories,
  title = "Today's Activity",
  emptyText = "Nothing logged yet today.",
  height = 320,
}) {
  const { rows, loading, hasMore, loadMore } = useActivityFeed({
    actorId,
    scope,
    categories,
  });

  return (
    <div style={{
      background: Z.sa,
      border: `1px solid ${Z.bd}`,
      borderRadius: R,
      padding: 12,
      display: "flex", flexDirection: "column", gap: 8,
      minHeight: 0,
    }}>
      <div style={{
        fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td,
        textTransform: "uppercase", letterSpacing: 1, fontFamily: COND,
        padding: "0 4px",
      }}>
        {title}
      </div>

      <div style={{ overflowY: "auto", maxHeight: height, margin: "0 -4px" }}>
        {loading && rows.length === 0 && (
          <div style={{ padding: 16, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>Loading…</div>
        )}
        {!loading && rows.length === 0 && (
          <div style={{ padding: 16, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>{emptyText}</div>
        )}
        {rows.map(r => (
          <div key={r.id} style={{
            padding: "8px 10px",
            borderBottom: `1px solid ${Z.bd}40`,
          }}>
            <div style={{
              fontSize: FS.sm, color: r.event_category === "escalation" ? Z.da : Z.tx,
              fontStyle: r.event_category === "comment" ? "italic" : "normal",
              lineHeight: 1.35,
            }}>
              {r.summary || r.detail || r.type}
            </div>
            <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND, marginTop: 2 }}>
              {fmtTime(r.created_at)}
              {r.client_name && <> · {r.client_name}</>}
            </div>
          </div>
        ))}
        {hasMore && (
          <div style={{ padding: 8 }}>
            <button
              onClick={loadMore}
              style={{
                width: "100%",
                background: Z.bg,
                border: `1px solid ${Z.bd}`,
                color: Z.tm,
                fontSize: FS.xs,
                fontWeight: FW.bold,
                fontFamily: COND,
                padding: "6px 10px",
                borderRadius: Ri,
                cursor: "pointer",
              }}
            >Load more</button>
          </div>
        )}
      </div>
    </div>
  );
}
