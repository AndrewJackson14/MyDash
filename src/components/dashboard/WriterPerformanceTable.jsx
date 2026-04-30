// ============================================================
// WriterPerformanceTable — aggregated stats per writer Camille has
// edited from in the last 30 days. Surfaces coaching conversations
// (who's late, who's getting better) instead of leaving them in her
// head.
//
// Columns:
//   - Writer
//   - Stories this month (submitted, defined as reaching post-draft status)
//   - On-time rate (submitted by dueDate)
//   - Avg days from assigned → submitted (blank if we lack timestamps)
//   - "Needs support" flag if 2+ stories missed deadline
//
// Revision-count coaching (story_activity) is a follow-up — it needs
// a separate query and isn't already loaded on the client.
// ============================================================
import { useMemo } from "react";
import { Z, FS, FW, COND } from "../../lib/theme";
import DashboardModule from "./DashboardModule";

const DAY_MS = 86400000;
const POST_DRAFT = new Set(["Edited", "Approved", "Ready", "Needs Editing", "On Page", "Published", "Web Published"]);

export default function WriterPerformanceTable({
  stories, team,
  userId, onOpenMember,
}) {
  const rows = useMemo(() => {
    const cutoff = Date.now() - 30 * DAY_MS;
    const byAuthor = new Map();

    (stories || []).forEach(s => {
      const key = s.author || s.assigned_to;
      if (!key) return;
      if (!POST_DRAFT.has(s.status)) return;
      const submittedAt = s.submittedAt || s.submitted_at || s.updatedAt || s.updated_at;
      if (!submittedAt || new Date(submittedAt).getTime() < cutoff) return;

      if (!byAuthor.has(key)) {
        byAuthor.set(key, {
          key, stories: [], onTime: 0, late: 0, durations: [],
        });
      }
      const bucket = byAuthor.get(key);
      bucket.stories.push(s);

      const due = s.dueDate ? new Date(s.dueDate + "T23:59:59").getTime() : null;
      const subbed = new Date(submittedAt).getTime();
      if (due !== null) {
        if (subbed <= due) bucket.onTime++;
        else bucket.late++;
      }

      if (s.assignedAt && submittedAt) {
        const dur = (subbed - new Date(s.assignedAt).getTime()) / DAY_MS;
        if (dur >= 0 && dur < 60) bucket.durations.push(dur);
      }
    });

    // Resolve team member for each author key. Author may be a name
    // string OR an assigned_to uuid — we try both lookups.
    const memberByKey = new Map();
    (team || []).forEach(t => {
      memberByKey.set(t.id, t);
      if (t.name) memberByKey.set(t.name, t);
    });

    return Array.from(byAuthor.values()).map(b => {
      const member = memberByKey.get(b.key);
      const total = b.stories.length;
      const rated = b.onTime + b.late;
      const onTimePct = rated > 0 ? b.onTime / rated : null;
      const avgDur = b.durations.length
        ? b.durations.reduce((s, d) => s + d, 0) / b.durations.length
        : null;
      return {
        key: b.key,
        member,
        displayName: member?.name || b.key,
        total,
        onTimePct,
        lateCount: b.late,
        avgDur,
        needsSupport: b.late >= 2,
      };
    }).sort((a, b) => {
      // Needs-support first, then total volume descending.
      if (a.needsSupport !== b.needsSupport) return a.needsSupport ? -1 : 1;
      return b.total - a.total;
    });
  }, [stories, team]);

  const needsSupportCount = rows.filter(r => r.needsSupport).length;

  return (
    <DashboardModule
      id="writer-performance"
      userId={userId}
      title="Writer performance (30d)"
      subtitle={`${rows.length} writer${rows.length === 1 ? "" : "s"} · ${needsSupportCount} need support`}
      empty={rows.length === 0}
      emptyText="No writer activity in the last 30 days."
    >
      <div style={{
        display: "grid",
        gridTemplateColumns: "1.5fr 0.6fr 0.8fr 0.8fr 40px",
        gap: 8,
        padding: "4px 10px 6px",
        fontSize: FS.micro, fontWeight: FW.heavy,
        color: Z.tm, fontFamily: COND,
        textTransform: "uppercase", letterSpacing: 0.6,
        borderBottom: `1px solid ${Z.bd}`,
      }}>
        <div>Writer</div>
        <div style={{ textAlign: "right" }}>Stories</div>
        <div style={{ textAlign: "right" }}>On-time</div>
        <div style={{ textAlign: "right" }}>Avg days</div>
        <div />
      </div>

      {rows.map(r => {
        const onTimeColor = r.onTimePct === null ? Z.tm
          : r.onTimePct >= 0.9 ? Z.go
          : r.onTimePct >= 0.7 ? Z.wa : Z.da;
        return (
          <div
            key={r.key}
            onClick={() => { if (r.member && onOpenMember) onOpenMember(r.member.id); }}
            style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 0.6fr 0.8fr 0.8fr 40px",
              gap: 8,
              padding: "8px 10px",
              alignItems: "center",
              borderBottom: `1px solid ${Z.bd}`,
              fontSize: FS.sm,
              cursor: (r.member && onOpenMember) ? "pointer" : "default",
              transition: "background 0.12s",
            }}
            onMouseOver={e => { if (r.member && onOpenMember) e.currentTarget.style.background = Z.sa; }}
            onMouseOut={e => { e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{
              color: Z.tx, fontWeight: FW.semi,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{r.displayName}</div>
            <div style={{ color: Z.tx, fontFamily: COND, textAlign: "right" }}>{r.total}</div>
            <div style={{
              color: onTimeColor, fontFamily: COND, fontWeight: FW.bold,
              textAlign: "right",
            }}>
              {r.onTimePct === null ? "—" : `${Math.round(r.onTimePct * 100)}%`}
            </div>
            <div style={{ color: Z.tm, fontFamily: COND, textAlign: "right" }}>
              {r.avgDur === null ? "—" : r.avgDur.toFixed(1)}
            </div>
            <div style={{ textAlign: "right" }}>
              {r.needsSupport && (
                <span title="2+ late stories — consider a check-in" style={{
                  fontSize: FS.micro, fontWeight: FW.heavy,
                  padding: "1px 6px", borderRadius: 10,
                  background: Z.da + "22", color: Z.da,
                  fontFamily: COND,
                }}>!</span>
              )}
            </div>
          </div>
        );
      })}
    </DashboardModule>
  );
}
