// ActivityStream.jsx — sticky right-column event feed.
// Today by default; toggle to extend to last 24h.
//
// Layout: SectionCard (shared column chrome) wrapped in a sticky aside.
// The aside holds position:sticky; the SectionCard handles the look.

import { Z, COND, FS, FW, Ri } from "../../../lib/theme";
import SectionCard from "./SectionCard";
import ActivityEventCard from "./ActivityEventCard";

export default function ActivityStream({
  events = [],
  scope,                 // 'today' | 'yesterday'
  onScopeChange,
  resolveActor,          // (actor_id) => actorName
  resolveClient,         // (client_id, fallback) => clientName
  resolvePublication,    // (publication_id) => publicationName
  loading = false,
  onLoadMore,
  hasMore = false,
}) {
  const scopeToggle = (
    <button
      onClick={() => onScopeChange?.(scope === "today" ? "yesterday" : "today")}
      style={{
        background: "transparent",
        border: `1px solid ${Z.bd}`,
        color: Z.tm,
        fontSize: FS.micro,
        fontWeight: FW.bold,
        fontFamily: COND,
        padding: "3px 8px",
        borderRadius: Ri,
        cursor: "pointer",
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
      {scope === "today" ? "Show yesterday" : "Today only"}
    </button>
  );

  return (
    <aside
      style={{
        position: "sticky",
        top: 0,
        alignSelf: "start",
        width: "100%",
        minWidth: 0,
        minHeight: 280,
        maxHeight: "calc(100vh - 80px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <SectionCard
        title="Activity"
        controls={scopeToggle}
        data-glass="true"
        style={{ flex: 1, overflow: "hidden" }}
        bodyStyle={{ overflowY: "auto", margin: "0 -4px" }}
      >
        {loading && events.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>
            Loading…
          </div>
        )}
        {!loading && events.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>
            Quiet so far today.
          </div>
        )}
        {events.map(row => {
          const actorName =
            row.actor_name
            || resolveActor?.(row.actor_id)
            || row.client_name
            || "Someone";
          const ctx = {
            actorName,
            clientName: resolveClient?.(row.client_id, row.client_name) || row.client_name,
            publicationName: resolvePublication?.(row.publication_id) || null,
          };
          return <ActivityEventCard key={row.id} row={row} ctx={ctx} />;
        })}
        {hasMore && (
          <div style={{ padding: "10px 12px" }}>
            <button
              onClick={onLoadMore}
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
            >
              Load more
            </button>
          </div>
        )}
      </SectionCard>
    </aside>
  );
}
