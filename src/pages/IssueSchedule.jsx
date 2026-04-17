// ============================================================
// IssueSchedule.jsx — Informational issue health at-a-glance
// Publisher-focused, drill-in only (no executive actions)
// ============================================================
import { useState, useMemo, useEffect } from "react";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { Z, COND, DISPLAY, FS, FW, R, Ri, ACCENT } from "../lib/theme";
import { Ic, Btn, Sel, Badge, GlassCard, PageHeader, glass } from "../components/ui";
import { fmtCurrencyWhole as fmtCurrency, fmtDateShort as fmtDate, daysUntil } from "../lib/formatters";

// ─── Small helpers ────────────────────────────────────────────
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const statusFor = (iss, { adPct, revPct, edPct, hasAnyStories }) => {
  // Published/sent-to-press — terminal, returns early
  if (iss.status === "Published" || iss.status === "Packaged for Publishing" || iss.sent_to_press_at) return "Published";

  const today = new Date().toISOString().slice(0, 10);
  const adOverdue = iss.adDeadline && iss.adDeadline < today;
  const edOverdue = iss.edDeadline && iss.edDeadline < today;
  const pubOverdue = iss.date && iss.date < today;

  if (pubOverdue || adOverdue || edOverdue) {
    // Overdue chips — publish date trumps ad/ed
    if (pubOverdue) return "Overdue";
    if (adOverdue && adPct < 100) return "At Risk";
    if (edOverdue && edPct < 80) return "At Risk";
  }

  // Behind goal: <75% revenue with ad deadline within 3 days
  if (iss.adDeadline) {
    const d = daysUntil(iss.adDeadline);
    if (d >= 0 && d <= 3 && revPct < 75) return "Behind Goal";
  }

  return "On Track";
};

const CHIP_COLORS = {
  "Overdue": Z.da,
  "At Risk": Z.da,
  "Behind Goal": Z.wa,
  "On Track": Z.go,
  "Published": Z.tm,
};

const StatusChip = ({ status }) => {
  const color = CHIP_COLORS[status] || Z.tm;
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: Ri,
      background: color + "1a", color, fontSize: 10, fontWeight: FW.heavy,
      textTransform: "uppercase", letterSpacing: 0.6, fontFamily: COND, whiteSpace: "nowrap",
    }}>{status}</span>
  );
};

const ProgressBar = ({ pct, color, height = 5 }) => (
  <div style={{ height, background: "rgba(127,127,127,0.15)", borderRadius: height / 2 }}>
    <div style={{
      height, borderRadius: height / 2,
      width: `${clamp(pct, 0, 100)}%`,
      background: color || (pct >= 80 ? Z.go : pct >= 50 ? Z.wa : Z.da),
      transition: "width 0.4s",
    }} />
  </div>
);

// ─── Deadline countdown text (days until / past) ──────────────
const Countdown = ({ date }) => {
  if (!date) return <span style={{ color: Z.td }}>—</span>;
  const d = daysUntil(date);
  const color = d < 0 ? Z.da : d <= 2 ? Z.wa : Z.tm;
  const label = d < 0 ? `${Math.abs(d)}d past` : d === 0 ? "Today" : d === 1 ? "Tomorrow" : `${d}d`;
  return <span style={{ color, fontWeight: FW.semi }}>{label}</span>;
};

// ─── Calculate issue metrics — single source of truth ────────
function useIssueMetrics(iss, pub, sales, stories) {
  const issSales = (sales || []).filter(s => s.issueId === iss.id);
  const closedAds = issSales.filter(s => s.status === "Closed");

  // Page capacity from publication target — derived from flatplan in future
  const adSlotRatio = pub?.adSlotRatio || 0.4;
  const totalSlots = Math.floor((iss.pageCount || pub?.defaultPageCount || 24) * adSlotRatio);
  const openSlots = Math.max(0, totalSlots - closedAds.length);
  const adPct = totalSlots > 0 ? Math.round((closedAds.length / totalSlots) * 100) : 0;

  const revenue = closedAds.reduce((s, x) => s + (x.amount || 0), 0);
  const revGoal = iss.revenueGoal || pub?.defaultRevenueGoal || 0;
  const revPct = revGoal > 0 ? Math.round((revenue / revGoal) * 100) : 0;

  const issStories = (stories || []).filter(s => s.issueId === iss.id || (s.publication === iss.pubId && !s.issueId));
  const storiesReady = issStories.filter(s => ["Approved", "On Page", "Published", "Sent to Web"].includes(s.status)).length;
  const storiesPlanned = issStories.length;
  const edPct = storiesPlanned > 0 ? Math.round((storiesReady / storiesPlanned) * 100) : 0;

  return {
    closedAdCount: closedAds.length, totalSlots, openSlots, adPct,
    revenue, revGoal, revPct,
    storiesReady, storiesPlanned, edPct,
    hasAnyStories: storiesPlanned > 0,
  };
}

// ══════════════════════════════════════════════════════════════
// THIS WEEK CARD — Big action-leaning card per publication
// ══════════════════════════════════════════════════════════════
const ThisWeekCard = ({ iss, pub, sales, stories, onOpenIssue, onNavigate }) => {
  const m = useIssueMetrics(iss, pub, sales, stories);
  const status = statusFor(iss, m);
  const color = pub?.color || Z.ac;

  const Row = ({ label, pct, value, sub, onClick, barColor }) => (
    <div onClick={(e) => { e.stopPropagation(); onClick?.(); }} style={{
      cursor: onClick ? "pointer" : "default", padding: "8px 0",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: COND }}>{label}</span>
        <span style={{ fontSize: FS.sm, fontWeight: FW.black, color: Z.tx, fontFamily: COND }}>{value}</span>
      </div>
      <ProgressBar pct={pct} color={barColor} />
      {sub && <div style={{ fontSize: 10, color: Z.tm, marginTop: 3, fontFamily: COND }}>{sub}</div>}
    </div>
  );

  return (
    <div onClick={() => onOpenIssue(iss.id)} style={{
      ...glass(), borderRadius: R, padding: 16, cursor: "pointer",
      borderLeft: `3px solid ${color}`, display: "flex", flexDirection: "column", gap: 6,
      transition: "transform 0.15s",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND }}>{pub?.name}</div>
          <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginTop: 1 }}>{iss.label}</div>
        </div>
        <StatusChip status={status} />
      </div>

      {/* Deadlines */}
      <div style={{ display: "flex", gap: 10, padding: "6px 0", fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>
        <span>Ad close <Countdown date={iss.adDeadline} /></span>
        <span style={{ color: Z.border }}>·</span>
        <span>Ed close <Countdown date={iss.edDeadline} /></span>
        <span style={{ color: Z.border }}>·</span>
        <span>Publish <Countdown date={iss.date} /></span>
      </div>

      {/* Progress rows */}
      <Row
        label="Revenue"
        pct={m.revPct}
        value={m.revGoal > 0 ? `${fmtCurrency(m.revenue)} / ${fmtCurrency(m.revGoal)}` : fmtCurrency(m.revenue)}
        sub={m.revGoal > 0 ? `${m.revPct}% of goal` : "No goal set"}
        onClick={() => onNavigate("sales")}
        barColor={m.revPct >= 80 ? Z.go : m.revPct >= 50 ? Z.wa : Z.da}
      />
      <Row
        label="Ads"
        pct={m.adPct}
        value={`${m.closedAdCount} / ${m.totalSlots} sold`}
        sub={m.openSlots > 0 ? `${m.openSlots} slot${m.openSlots !== 1 ? "s" : ""} open` : "All slots sold"}
        onClick={() => onOpenIssue(iss.id)}
      />
      <Row
        label="Stories"
        pct={m.edPct}
        value={m.storiesPlanned > 0 ? `${m.storiesReady} / ${m.storiesPlanned} ready` : "No stories"}
        sub={m.storiesPlanned > 0 ? `${m.edPct}% ready` : "Nothing assigned"}
        onClick={() => onNavigate("editorial")}
      />
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// COMPACT ROW — Upcoming/Past list
// ══════════════════════════════════════════════════════════════
const CompactRow = ({ iss, pub, sales, stories, onOpenIssue, onNavigate }) => {
  const m = useIssueMetrics(iss, pub, sales, stories);
  const status = statusFor(iss, m);

  return (
    <div onClick={() => onOpenIssue(iss.id)} style={{
      display: "grid", gridTemplateColumns: "220px 110px 1fr 1fr 1fr 100px",
      gap: 12, alignItems: "center", padding: "10px 14px",
      borderBottom: `1px solid ${Z.bd}`, cursor: "pointer",
    }}>
      {/* Publication + label */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: pub?.color || Z.tm, display: "inline-block" }} />
          <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tx, fontFamily: COND }}>{pub?.name}</span>
        </div>
        <div style={{ fontSize: 11, color: Z.tm, fontFamily: COND, marginTop: 1 }}>{iss.label}</div>
      </div>

      {/* Publish date */}
      <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>
        {fmtDate(iss.date)}
      </div>

      {/* Ad progress */}
      <div onClick={(e) => { e.stopPropagation(); onOpenIssue(iss.id); }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
          <span style={{ fontSize: 9, color: Z.td, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5 }}>Ads</span>
          <span style={{ fontSize: 10, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>{m.closedAdCount}/{m.totalSlots}</span>
        </div>
        <ProgressBar pct={m.adPct} height={4} />
      </div>

      {/* Revenue progress */}
      <div onClick={(e) => { e.stopPropagation(); onNavigate("sales"); }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
          <span style={{ fontSize: 9, color: Z.td, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5 }}>Revenue</span>
          <span style={{ fontSize: 10, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>
            {m.revGoal > 0 ? `${fmtCurrency(m.revenue)} / ${fmtCurrency(m.revGoal)}` : fmtCurrency(m.revenue)}
          </span>
        </div>
        <ProgressBar pct={m.revPct} height={4} color={m.revPct >= 80 ? Z.go : m.revPct >= 50 ? Z.wa : Z.da} />
      </div>

      {/* Stories progress */}
      <div onClick={(e) => { e.stopPropagation(); onNavigate("editorial"); }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
          <span style={{ fontSize: 9, color: Z.td, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5 }}>Stories</span>
          <span style={{ fontSize: 10, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>
            {m.storiesPlanned > 0 ? `${m.storiesReady}/${m.storiesPlanned}` : "—"}
          </span>
        </div>
        <ProgressBar pct={m.edPct} height={4} color={ACCENT.blue || Z.ac} />
      </div>

      {/* Status */}
      <div><StatusChip status={status} /></div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════
const IssueSchedule = ({ pubs, issues, sales, stories, onNavigate, onOpenIssue, isActive }) => {
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({ breadcrumb: [{ label: "Home" }, { label: "Schedule" }], title: "Issue Schedule" });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);
  const [selPub, setSelPub] = useState("all");
  const [tab, setTab] = useState("thisweek"); // thisweek | upcoming | past

  const today = new Date().toISOString().slice(0, 10);

  const openIssue = (id) => {
    if (onOpenIssue) onOpenIssue(id);
    else if (onNavigate) onNavigate("flatplan"); // fallback
  };

  const nav = (page) => { onNavigate?.(page); };

  // Filter + sort
  const filtered = useMemo(() => {
    return (issues || []).filter(i => selPub === "all" || i.pubId === selPub);
  }, [issues, selPub]);

  const thisWeekEnd = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }, []);

  const published = (iss) => iss.status === "Published" || iss.status === "Packaged for Publishing" || iss.sent_to_press_at;

  // This Week: upcoming in next 7 days, not yet published — one per publication (earliest)
  const thisWeekIssues = useMemo(() => {
    const candidates = filtered.filter(i => !published(i) && i.date >= today && i.date <= thisWeekEnd);
    // Keep earliest per publication
    const byPub = {};
    candidates.sort((a, b) => a.date.localeCompare(b.date)).forEach(i => {
      if (!byPub[i.pubId]) byPub[i.pubId] = i;
    });
    return Object.values(byPub);
  }, [filtered, today, thisWeekEnd]);

  // Upcoming: anything in the future beyond this week, or overdue-not-published
  const upcomingIssues = useMemo(() => {
    return filtered
      .filter(i => !published(i) && (i.date > thisWeekEnd || i.date < today))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered, today, thisWeekEnd]);

  const pastIssues = useMemo(() => {
    return filtered
      .filter(i => published(i) || (i.date < today && !published(i) && !thisWeekIssues.includes(i) && !upcomingIssues.includes(i)))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);
  }, [filtered, today, thisWeekIssues, upcomingIssues]);

  // Cross-publication alerts: anything past ad deadline and not published
  const alerts = useMemo(() => {
    return filtered.filter(i => !published(i) && i.adDeadline && i.adDeadline < today)
      .sort((a, b) => a.adDeadline.localeCompare(b.adDeadline))
      .slice(0, 5);
  }, [filtered, today]);

  const pubFor = (id) => pubs.find(p => p.id === id);

  // ─── Tab counts ─────────────────────────────────────────
  const tabs = [
    { id: "thisweek", label: "This Week", count: thisWeekIssues.length },
    { id: "upcoming", label: "Upcoming", count: upcomingIssues.length },
    { id: "past", label: "Past", count: pastIssues.length },
  ];

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {/* Action row — title moved to TopBar via usePageHeader. */}
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <Sel value={selPub} onChange={e => setSelPub(e.target.value)} options={[{ value: "all", label: "All Publications" }, ...pubs.map(p => ({ value: p.id, label: p.name }))]} />
    </div>

    {/* Alert bar */}
    {alerts.length > 0 && (
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        background: Z.da + "18", borderLeft: `3px solid ${Z.da}`, borderRadius: Ri,
      }}>
        <Ic.clock size={14} color={Z.da} />
        <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.da, fontFamily: COND }}>
          {alerts.length} issue{alerts.length !== 1 ? "s" : ""} past ad deadline
        </span>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
          {alerts.map(i => {
            const p = pubFor(i.pubId);
            return (
              <button key={i.id} onClick={() => openIssue(i.id)} style={{
                background: "transparent", border: `1px solid ${Z.da}40`, borderRadius: Ri,
                padding: "3px 10px", fontSize: 11, fontWeight: FW.bold, color: Z.da,
                cursor: "pointer", fontFamily: COND,
              }}>{p?.name} — {i.label}</button>
            );
          })}
        </div>
      </div>
    )}

    {/* Tabs */}
    <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${Z.bd}` }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{
          padding: "8px 16px", background: "transparent",
          border: "none", borderBottom: tab === t.id ? `2px solid ${Z.ac}` : "2px solid transparent",
          color: tab === t.id ? Z.ac : Z.tm, fontSize: FS.sm, fontWeight: FW.heavy,
          fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.6, cursor: "pointer",
        }}>
          {t.label} <span style={{ opacity: 0.6, marginLeft: 4 }}>{t.count}</span>
        </button>
      ))}
    </div>

    {/* This Week — big cards */}
    {tab === "thisweek" && (
      <>
        {thisWeekIssues.length === 0 ? (
          <GlassCard>
            <div style={{ textAlign: "center", padding: 30, color: Z.tm, fontFamily: COND }}>
              No issues publishing in the next 7 days.
            </div>
          </GlassCard>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 14 }}>
            {thisWeekIssues.map(iss => (
              <ThisWeekCard key={iss.id} iss={iss} pub={pubFor(iss.pubId)} sales={sales} stories={stories}
                onOpenIssue={openIssue} onNavigate={nav} />
            ))}
          </div>
        )}
      </>
    )}

    {/* Upcoming — compact list */}
    {tab === "upcoming" && (
      <GlassCard>
        {upcomingIssues.length === 0 ? (
          <div style={{ textAlign: "center", padding: 30, color: Z.tm, fontFamily: COND }}>
            No upcoming issues.
          </div>
        ) : (
          <div>
            {upcomingIssues.map(iss => (
              <CompactRow key={iss.id} iss={iss} pub={pubFor(iss.pubId)} sales={sales} stories={stories}
                onOpenIssue={openIssue} onNavigate={nav} />
            ))}
          </div>
        )}
      </GlassCard>
    )}

    {/* Past — compact list */}
    {tab === "past" && (
      <GlassCard>
        {pastIssues.length === 0 ? (
          <div style={{ textAlign: "center", padding: 30, color: Z.tm, fontFamily: COND }}>
            No past issues.
          </div>
        ) : (
          <div>
            {pastIssues.map(iss => (
              <CompactRow key={iss.id} iss={iss} pub={pubFor(iss.pubId)} sales={sales} stories={stories}
                onOpenIssue={openIssue} onNavigate={nav} />
            ))}
          </div>
        )}
      </GlassCard>
    )}
  </div>;
};

export default IssueSchedule;
