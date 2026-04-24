// ============================================================
// IssueReadinessStrip — horizontal readiness tiles for weekly
// newspapers + magazines, one tile per pub, showing the next issue
// at a glance.
//
// Hayley Apr 24 decision: two visually distinct sections in one strip
// (weeklies on top, magazines below), so she can read the paper-cadence
// pulse without context-switching.
//
// Data source: useSignalFeed.issueReadiness — each row is already
// bucketed by `cadence` ("weekly" | "magazine") so this component only
// splits the array and renders.
// ============================================================
import { Z, COND, FS, FW, Ri } from "../../lib/theme";
import DashboardModule from "./DashboardModule";

export default function IssueReadinessStrip({ readiness = [], userId, onOpenIssue }) {
  const rows = readiness.filter(r => r.issue); // drop pubs with no upcoming issue
  const weeklies = rows.filter(r => r.cadence === "weekly");
  const magazines = rows.filter(r => r.cadence === "magazine");

  const isEmpty = weeklies.length === 0 && magazines.length === 0;
  const subtitle = isEmpty
    ? "No upcoming issues in the readiness window"
    : `${weeklies.length} weekl${weeklies.length === 1 ? "y" : "ies"} · ${magazines.length} magazine${magazines.length === 1 ? "" : "s"}`;

  return (
    <DashboardModule
      id="issue-readiness"
      userId={userId}
      title="Issue Readiness"
      subtitle={subtitle}
      empty={isEmpty}
      emptyText="No issues scheduled."
    >
      {weeklies.length > 0 && (
        <Section label="Weekly Newspapers" rows={weeklies} onOpenIssue={onOpenIssue} />
      )}
      {weeklies.length > 0 && magazines.length > 0 && (
        <div style={{ height: 1, background: Z.bd, margin: "12px 0" }} />
      )}
      {magazines.length > 0 && (
        <Section label="Magazines" rows={magazines} onOpenIssue={onOpenIssue} />
      )}
    </DashboardModule>
  );
}

function Section({ label, rows, onOpenIssue }) {
  return (
    <div>
      <div style={{
        fontSize: FS.micro, fontWeight: FW.heavy, color: Z.tm,
        fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.6,
        marginBottom: 8,
      }}>{label}</div>
      <div style={{
        display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4,
      }}>
        {rows.map(row => (
          <Tile key={row.pub.id} row={row} onClick={() => onOpenIssue?.(row.issue.id)} />
        ))}
      </div>
    </div>
  );
}

function Tile({ row, onClick }) {
  const { pub, issue, daysOut, editorialPct, adPct, blended } = row;
  const pubName = pub.shortName || pub.code || pub.name || "—";
  const issueLabel = issue.label || issue.date || "";
  const daysCopy = daysOut <= 0
    ? "Due today"
    : daysOut === 1
    ? "1 day out"
    : `${daysOut} days out`;
  const barColor = blended >= 75 ? Z.go : blended >= 40 ? Z.wa : Z.da;

  return (
    <div
      onClick={onClick}
      style={{
        flex: "0 0 180px", minWidth: 180,
        padding: "10px 12px",
        borderRadius: Ri,
        background: Z.sa,
        border: `1px solid ${Z.bd}`,
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
      onMouseOver={e => { e.currentTarget.style.borderColor = Z.ac; }}
      onMouseOut={e => { e.currentTarget.style.borderColor = Z.bd; }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <div style={{ fontSize: FS.sm, fontWeight: FW.black, color: Z.tx, fontFamily: COND }}>{pubName}</div>
        <div style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND }}>{daysCopy}</div>
      </div>
      <div style={{
        fontSize: FS.micro, color: Z.tm, fontFamily: COND,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        marginBottom: 8,
      }}>{issueLabel}</div>
      <div style={{
        height: 6, borderRadius: 3, background: Z.bd, overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${Math.max(0, Math.min(100, blended))}%`,
          background: barColor,
          transition: "width 0.3s ease",
        }} />
      </div>
      <div style={{
        display: "flex", justifyContent: "space-between",
        marginTop: 6, fontSize: FS.micro, color: Z.tm, fontFamily: COND,
      }}>
        <span>Ed {editorialPct}%</span>
        <span>Ad {adPct}%</span>
      </div>
    </div>
  );
}
