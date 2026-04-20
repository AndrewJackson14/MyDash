// ============================================================
// WebPublishingQueue — stories that are edited and ready to push
// to StellarPress, surfaced on the dashboard so the content editor
// doesn't have to navigate to Editorial → Web Queue to publish.
//
// Match rule is the same as EditorialDashboard's Web Queue:
//   status === "Ready" AND NOT (sent_to_web || sentToWeb)
// ...plus a pub filter. Listed oldest-edit-first so stale edits
// don't sit indefinitely.
// ============================================================
import { useMemo, useState } from "react";
import { Z, FS, FW, COND } from "../../lib/theme";
import { Btn } from "../ui";
import DashboardModule from "./DashboardModule";

const DAY_MS = 86400000;
const AGE = (t) => t ? Math.floor((Date.now() - new Date(t).getTime()) / DAY_MS) : null;

export default function WebPublishingQueue({
  stories, pubs,
  userId,
  onPublish,        // (storyId) => void  — caller wires to publishStory
  onOpenStory,
  onOpenWebQueue,
}) {
  const [pubFilter, setPubFilter] = useState("all");

  const queue = useMemo(() => {
    return (stories || [])
      .filter(s => s.status === "Ready" && !(s.sent_to_web || s.sentToWeb))
      .filter(s => pubFilter === "all" || (s.publication || s.publication_id) === pubFilter)
      .sort((a, b) => {
        const ta = a.updatedAt || a.updated_at || "";
        const tb = b.updatedAt || b.updated_at || "";
        return ta.localeCompare(tb); // oldest first
      });
  }, [stories, pubFilter]);

  const publishedThisWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * DAY_MS;
    return (stories || []).filter(s => {
      const pa = new Date(s.publishedAt || s.published_at || 0).getTime();
      return (s.sent_to_web || s.sentToWeb) && pa >= weekAgo;
    }).length;
  }, [stories]);

  const pubOptions = useMemo(() => ([
    { value: "all", label: "All publications" },
    ...(pubs || []).map(p => ({ value: p.id, label: p.name })),
  ]), [pubs]);

  const pubName = (id) => (pubs || []).find(p => p.id === id)?.name || id;

  return (
    <DashboardModule
      id="web-publishing-queue"
      userId={userId}
      title="Web publishing queue"
      subtitle={`${queue.length} ready to push · ${publishedThisWeek} published this week`}
      action={onOpenWebQueue ? <Btn sm v="ghost" onClick={onOpenWebQueue}>Web Queue</Btn> : null}
      empty={queue.length === 0}
      emptyText="Nothing edited and waiting — web is current."
    >
      {/* Pub filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <select
          value={pubFilter}
          onChange={e => setPubFilter(e.target.value)}
          style={{
            padding: "6px 10px", borderRadius: 6,
            border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx,
            fontSize: FS.xs, fontFamily: COND, cursor: "pointer",
          }}
        >
          {pubOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" }}>
        {queue.map(s => {
          const age = AGE(s.updatedAt || s.updated_at);
          const stale = age !== null && age >= 2;
          return (
            <div
              key={s.id}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", borderRadius: 6,
                background: Z.sa,
                borderLeft: stale ? `2px solid ${Z.wa}` : `2px solid ${Z.bd}`,
              }}
            >
              <div style={{ flex: 1, minWidth: 0, cursor: onOpenStory ? "pointer" : "default" }}
                onClick={() => onOpenStory?.(s.id)}
              >
                <div style={{
                  fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{s.title || "Untitled"}</div>
                <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
                  {pubName(s.publication || s.publication_id)} · {s.author || "—"}
                  {age !== null && <> · <span style={{ color: stale ? Z.wa : Z.tm, fontWeight: stale ? FW.bold : FW.normal }}>
                    {age === 0 ? "today" : age === 1 ? "1d waiting" : `${age}d waiting`}
                  </span></>}
                </div>
              </div>
              {onPublish && (
                <Btn sm v="secondary" onClick={() => onPublish(s.id)}>Publish</Btn>
              )}
            </div>
          );
        })}
      </div>
    </DashboardModule>
  );
}
