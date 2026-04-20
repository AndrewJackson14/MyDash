// ============================================================
// IssueAtRiskFeed — upcoming issues in the next 14 days with three
// traffic-light indicators (Editorial · Sales · Production) so Hayley
// can see at a glance which issues are in trouble.
//
// Replaces the old "Upcoming Issues (7 days)" panel with a wider
// window and a risk read layered on top of the countdown.
// ============================================================
import { useMemo } from "react";
import { Z, FS, FW, COND } from "../../lib/theme";
import { Btn } from "../ui";
import DashboardModule from "./DashboardModule";

const DAY_MS = 86400000;
const WINDOW_DAYS = 14;

// Editorial "ready" statuses — everything else counts as at-risk.
const STORY_READY = new Set(["Approved", "Edited", "Published", "Web Published"]);
// Production "ready" statuses for ad projects.
const AD_READY = new Set(["approved", "signed_off", "placed"]);

const lightColor = (level) => level === "red" ? Z.da : level === "amber" ? Z.wa : Z.go;
const lightLabel = (level) => level === "red" ? "At risk" : level === "amber" ? "Watch" : "On pace";

// Worst of the three.
const overallLevel = (e, s, p) => {
  const order = { green: 0, amber: 1, red: 2 };
  const worst = [e, s, p].reduce((w, c) => order[c] > order[w] ? c : w, "green");
  return worst;
};

export default function IssueAtRiskFeed({
  issues, stories, sales, adProjects, pubs, commissionGoals,
  userId, onOpenIssue,
}) {
  const rows = useMemo(() => {
    const today = new Date();
    const end = new Date(today.getTime() + WINDOW_DAYS * DAY_MS);

    const upcoming = (issues || []).filter(iss => {
      const d = new Date((iss.date || iss.publishDate || iss.publish_date || "") + "T12:00:00");
      return d >= new Date(today.getFullYear(), today.getMonth(), today.getDate()) && d <= end;
    });

    const goalById = new Map();
    (commissionGoals || []).forEach(g => {
      if (g.issueId) goalById.set(g.issueId, Number(g.goal) || 0);
    });

    return upcoming.map(iss => {
      const d = new Date((iss.date || iss.publishDate || iss.publish_date || "") + "T12:00:00");
      const daysTo = Math.ceil((d - today) / DAY_MS);

      // Editorial
      const issueStories = (stories || []).filter(st => st.issueId === iss.id);
      const storiesTotal = issueStories.length;
      const storiesLate = issueStories.filter(st => !STORY_READY.has(st.status)).length;
      const lateRatio = storiesTotal > 0 ? storiesLate / storiesTotal : 0;
      const edLevel = storiesTotal === 0 ? "green"
        : lateRatio > 0.4 || (daysTo <= 3 && storiesLate >= 2) ? "red"
        : lateRatio > 0.2 ? "amber" : "green";

      // Sales — issue revenue vs goal, if we have a goal to compare.
      const issueRev = (sales || [])
        .filter(s => s.issueId === iss.id && s.status === "Closed")
        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
      const goal = goalById.get(iss.id) || 0;
      const salesPct = goal > 0 ? issueRev / goal : null;
      const salLevel = salesPct === null ? "green"
        : salesPct < 0.5 && daysTo <= 7 ? "red"
        : salesPct < 0.75 ? "amber" : "green";

      // Production — ad projects not yet approved.
      const issueAds = (adProjects || []).filter(a => a.issueId === iss.id);
      const adsPending = issueAds.filter(a => !AD_READY.has(a.status)).length;
      const prodLevel = issueAds.length === 0 ? "green"
        : adsPending === 0 ? "green"
        : (daysTo <= 2 && adsPending >= 1) || adsPending >= 3 ? "red"
        : adsPending >= 1 ? "amber" : "green";

      // Biggest risk sub-line
      const risks = [];
      if (edLevel !== "green") risks.push(`${storiesLate} ${storiesLate === 1 ? "story" : "stories"} not ready`);
      if (salLevel !== "green") risks.push(`${Math.round((salesPct || 0) * 100)}% of goal`);
      if (prodLevel !== "green") risks.push(`${adsPending} ${adsPending === 1 ? "ad" : "ads"} pending`);

      const pub = (pubs || []).find(p => p.id === (iss.pubId || iss.publicationId));

      return {
        iss, pub, daysTo,
        edLevel, salLevel, prodLevel,
        overall: overallLevel(edLevel, salLevel, prodLevel),
        risks,
      };
    }).sort((a, b) => a.daysTo - b.daysTo);
  }, [issues, stories, sales, adProjects, pubs, commissionGoals]);

  const atRiskCount = rows.filter(r => r.overall !== "green").length;

  return (
    <DashboardModule
      id="issue-at-risk"
      userId={userId}
      title="Upcoming issues"
      subtitle={`${rows.length} in next ${WINDOW_DAYS} days · ${atRiskCount} at risk`}
      empty={rows.length === 0}
      emptyText={`No issues publishing in the next ${WINDOW_DAYS} days.`}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map(r => (
          <div
            key={r.iss.id}
            onClick={() => onOpenIssue?.(r.iss.id)}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: Z.sa,
              cursor: onOpenIssue ? "pointer" : "default",
              border: `1px solid ${r.overall === "red" ? Z.da + "55" : r.overall === "amber" ? Z.wa + "55" : Z.bd}`,
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseOver={e => { if (onOpenIssue) e.currentTarget.style.borderColor = lightColor(r.overall); }}
            onMouseOut={e => { if (onOpenIssue) e.currentTarget.style.borderColor = r.overall === "red" ? Z.da + "55" : r.overall === "amber" ? Z.wa + "55" : Z.bd; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {r.pub?.name || r.iss.pubId || "—"} · {r.iss.label || r.iss.name || ""}
                </div>
                <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
                  {r.daysTo === 0 ? "Today" : r.daysTo === 1 ? "Tomorrow" : `${r.daysTo} days`}
                  {r.risks.length > 0 && <> · <span style={{ color: lightColor(r.overall) }}>{r.risks.join(" · ")}</span></>}
                </div>
              </div>
              <Light label="Ed" level={r.edLevel} />
              <Light label="Ad" level={r.salLevel} />
              <Light label="Pr" level={r.prodLevel} />
            </div>
          </div>
        ))}
      </div>
    </DashboardModule>
  );
}

function Light({ label, level }) {
  const c = lightColor(level);
  return (
    <div
      title={`${label}: ${lightLabel(level)}`}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 2, minWidth: 24,
      }}
    >
      <div style={{
        width: 8, height: 8, borderRadius: "50%", background: c,
        boxShadow: level === "red" ? `0 0 8px ${c}` : "none",
      }} />
      <div style={{
        fontSize: 9, fontWeight: FW.heavy, color: Z.tm,
        fontFamily: COND, letterSpacing: 0.5,
      }}>{label}</div>
    </div>
  );
}
