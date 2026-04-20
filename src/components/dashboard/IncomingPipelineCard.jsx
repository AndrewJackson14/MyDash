// ============================================================
// IncomingPipelineCard — 7-day forecast of what's heading into
// Camille's edit queue. Lets the content editor plan capacity
// instead of reacting to whatever shows up.
//
// Stories are classified into three arrival buckets:
//   • In draft     — author is writing; arrival estimated from the
//                    author's median time-from-assigned-to-draft.
//   • Not started  — assigned but still in "Needs Writing" status.
//                    Flagged stale if past the expected start date.
//   • Needs photo  — ready for edit but waiting on visuals; blocked
//                    on Photo Editor before Camille can take it.
// ============================================================
import { useMemo } from "react";
import { Z, FS, FW, COND } from "../../lib/theme";
import { Btn } from "../ui";
import DashboardModule from "./DashboardModule";

const DAY_MS = 86400000;

// Consider a story "incoming" (not yet in the edit queue) based on
// these statuses. "Draft" = being written; we look upstream of
// "Needs Editing" which is where Camille's current queue view starts.
const DRAFT_STATUSES = new Set(["Draft", "Writing", "In Progress"]);
const NOT_STARTED_STATUSES = new Set(["Needs Writing", "Assigned", "Pitched"]);
const AWAITING_MEDIA = (s) => !!s.needsPhoto || s.photoStatus === "pending" || s.photo_status === "pending";

// Median helper — used to estimate per-author draft duration from
// completed stories. Tiny samples still beat a blind 7-day guess.
const median = (xs) => {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export default function IncomingPipelineCard({
  stories, team,
  userId, onOpenStory,
}) {
  const data = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekOut = new Date(today.getTime() + 7 * DAY_MS);

    // Per-author median draft duration (in days) from recently completed
    // stories. Falls back to 4 days if we haven't seen enough from them.
    const authorMedian = {};
    const completedByAuthor = {};
    (stories || []).forEach(s => {
      const key = s.author || s.assigned_to;
      if (!key) return;
      if (["Edited", "Approved", "Ready", "Published", "Web Published"].includes(s.status)) {
        if (s.assignedAt && s.submittedAt) {
          const dur = (new Date(s.submittedAt) - new Date(s.assignedAt)) / DAY_MS;
          if (dur > 0 && dur < 60) {
            completedByAuthor[key] = completedByAuthor[key] || [];
            completedByAuthor[key].push(dur);
          }
        }
      }
    });
    Object.keys(completedByAuthor).forEach(k => {
      authorMedian[k] = median(completedByAuthor[k]);
    });
    const estimate = (key) => authorMedian[key] || 4;

    const drafts = [];
    const notStarted = [];
    const needsPhoto = [];

    (stories || []).forEach(s => {
      const status = s.status || "";
      const authorKey = s.author || s.assigned_to;
      if (DRAFT_STATUSES.has(status)) {
        const assignedAt = s.assignedAt ? new Date(s.assignedAt) : null;
        const expectedAt = assignedAt
          ? new Date(assignedAt.getTime() + estimate(authorKey) * DAY_MS)
          : new Date(today.getTime() + 3 * DAY_MS);
        if (expectedAt <= weekOut) drafts.push({ story: s, expectedAt });
      } else if (NOT_STARTED_STATUSES.has(status)) {
        const due = s.dueDate ? new Date(s.dueDate + "T12:00:00") : null;
        const late = due && due < today;
        notStarted.push({ story: s, due, late });
      } else if (status === "Needs Editing" && AWAITING_MEDIA(s)) {
        needsPhoto.push(s);
      }
    });

    // Sort drafts by expected arrival, not-started by due date.
    drafts.sort((a, b) => a.expectedAt - b.expectedAt);
    notStarted.sort((a, b) => (a.due || Infinity) - (b.due || Infinity));

    const staleCount = notStarted.filter(x => x.late).length;
    const total = drafts.length + notStarted.length + needsPhoto.length;
    return { drafts, notStarted, needsPhoto, staleCount, total };
  }, [stories]);

  return (
    <DashboardModule
      id="incoming-pipeline"
      userId={userId}
      title="Incoming pipeline"
      subtitle={`${data.total} landing this week · ${data.staleCount} past expected start`}
      empty={data.total === 0}
      emptyText="No stories heading into the queue this week."
    >
      {data.drafts.length > 0 && (
        <Section label={`In draft (${data.drafts.length})`}>
          {data.drafts.slice(0, 6).map(({ story, expectedAt }) => (
            <Row
              key={story.id}
              story={story}
              meta={`arrives ~${expectedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
              onClick={() => onOpenStory?.(story.id)}
            />
          ))}
        </Section>
      )}

      {data.notStarted.length > 0 && (
        <Section label={`Not started (${data.notStarted.length})`}>
          {data.notStarted.slice(0, 6).map(({ story, due, late }) => (
            <Row
              key={story.id}
              story={story}
              meta={due
                ? (late
                  ? <span style={{ color: Z.da, fontWeight: FW.bold }}>late — due {due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  : `due ${due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`)
                : "no due date"}
              onClick={() => onOpenStory?.(story.id)}
            />
          ))}
        </Section>
      )}

      {data.needsPhoto.length > 0 && (
        <Section label={`Needs photo (${data.needsPhoto.length})`}>
          {data.needsPhoto.slice(0, 6).map(story => (
            <Row
              key={story.id}
              story={story}
              meta="blocked on photo editor"
              onClick={() => onOpenStory?.(story.id)}
            />
          ))}
        </Section>
      )}
    </DashboardModule>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: FS.micro, fontWeight: FW.heavy, color: Z.tm,
        fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.6,
        marginBottom: 4,
      }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ story, meta, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "6px 10px", borderRadius: 6,
        background: Z.sa,
        cursor: onClick ? "pointer" : "default",
        fontSize: FS.sm,
      }}
    >
      <span style={{
        color: Z.tx, fontWeight: FW.semi, flex: 1, minWidth: 0,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{story.title || "Untitled"}</span>
      <span style={{ color: Z.tm, fontFamily: COND, fontSize: FS.xs, marginLeft: 8, flexShrink: 0 }}>
        {story.author || story.assigned_to_name || "—"} · {meta}
      </span>
    </div>
  );
}
