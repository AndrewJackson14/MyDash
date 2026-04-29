// ActivityStream.jsx — sticky right-column event feed.
// Today by default; toggle to extend to last 24h.

import { useState } from "react";
import { Z, COND, FS, FW, R, Ri } from "../../../lib/theme";
import ActivityEventCard from "./ActivityEventCard";

export default function ActivityStream({
  events = [],
  scope,                 // 'today' | 'yesterday'
  onScopeChange,
  resolveActor,          // (user_id) => actorName
  resolveClient,         // (client_id, fallback) => clientName
  resolvePublication,    // (publication_id) => publicationName
  loading = false,
  onLoadMore,
  hasMore = false,
}) {
  return (
    <aside
      data-glass="true"
      style={{
        position: "sticky",
        top: 0,
        alignSelf: "start",
        background: Z.sa,
        border: `1px solid ${Z.bd}`,
        borderRadius: R,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxHeight: "calc(100vh - 80px)",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px" }}>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>
          Activity
        </div>
        <button
          onClick={() => onScopeChange?.(scope === "today" ? "yesterday" : "today")}
          style={{
            background: "transparent",
            border: `1px solid ${Z.bd}`,
            color: Z.tm,
            fontSize: 10,
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
      </div>

      <div style={{ flex: 1, overflowY: "auto", margin: "0 -4px" }}>
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
          // Prefer the denormalized actor_name written by log_activity RPC;
          // fall back to a team_members lookup via actor_id; final fall-
          // back is the row's own client_name (gives "Someone" only on
          // truly orphaned rows).
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
      </div>
    </aside>
  );
}
