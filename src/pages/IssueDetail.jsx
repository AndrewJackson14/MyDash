// ============================================================
// IssueDetail.jsx — Issue command center
// Shows ad sales, editorial, production, revenue for one issue
// ============================================================
import { Z, DARK, COND, DISPLAY, R, Ri, FS, FW, ACCENT, INV } from "../lib/theme";
import { Ic, Btn, Badge, GlassCard, glass } from "../components/ui";
import { fmtCurrencyWhole as fmtCurrency, fmtDateShort as fmtDate, daysUntil } from "../lib/formatters";

const IssueDetail = ({ issueId, pubs, issues, sales, stories, clients, onBack, onNavigate }) => {
  const issue = issues.find(i => i.id === issueId);
  if (!issue) return <div style={{ padding: 40, color: Z.td }}>Issue not found. <Btn sm v="ghost" onClick={onBack}>← Back</Btn></div>;

  const pub = pubs.find(p => p.id === issue.pubId);
  const cn = id => clients.find(c => c.id === id)?.name || "—";
  const today = new Date().toISOString().slice(0, 10);
  const isDark = Z.bg === DARK.bg;

  // ─── Data ─────────────────────────────────────────────
  const issSales = (sales || []).filter(s => s.issueId === issueId);
  const closedAds = issSales.filter(s => s.status === "Closed");
  const pipelineAds = issSales.filter(s => s.status !== "Closed");
  const adSlotRatio = pub?.adSlotRatio || 0.4;
  const totalSlots = Math.floor((pub?.pageCount || pub?.defaultPageCount || 24) * adSlotRatio);
  const openSlots = Math.max(0, totalSlots - closedAds.length);
  const adPct = totalSlots > 0 ? Math.min(100, Math.round((closedAds.length / totalSlots) * 100)) : 0;

  const adRev = closedAds.reduce((s, x) => s + (x.amount || 0), 0);
  const pipelineRev = pipelineAds.reduce((s, x) => s + (x.amount || 0), 0);
  const revGoal = issue.revenueGoal || pub?.defaultRevenueGoal || 0;
  const revPct = revGoal > 0 ? Math.min(100, Math.round((adRev / revGoal) * 100)) : 0;

  // Stories: filter by issueId first, fall back to publication if no issue assignment
  const issStories = (stories || []).filter(s => s.issueId === issueId || (s.publication === issue.pubId && !s.issueId));
  const storyGroups = [
    { label: "Approved / On Page", items: issStories.filter(s => ["Approved", "On Page", "Published", "Sent to Web"].includes(s.status)), color: Z.go },
    { label: "In Editing", items: issStories.filter(s => ["Edited"].includes(s.status)), color: ACCENT.blue },
    { label: "Needs Work", items: issStories.filter(s => ["Draft", "Needs Editing", "Assigned"].includes(s.status)), color: Z.wa },
  ].filter(g => g.items.length > 0);
  const editPct = issStories.length > 0 ? Math.round(issStories.filter(s => ["Approved", "On Page", "Published", "Sent to Web", "Edited"].includes(s.status)).length / issStories.length * 100) : 0;

  // ─── Deadline badge helper ────────────────────────────
  const DeadlineBadge = ({ label, date, baseColor }) => {
    if (!date) return null;
    const d = daysUntil(date);
    const isPast = d < 0;
    const color = isPast ? Z.da : d <= 3 ? Z.wa : baseColor;
    const text = isPast ? `${Math.abs(d)}d overdue` : d === 0 ? "Today" : d === 1 ? "Tomorrow" : `${d}d`;
    return (
      <div style={{ padding: "8px 14px", background: color + "10", border: `1px solid ${color}25`, borderRadius: R, textAlign: "center", minWidth: 90 }}>
        <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: FW.black, color, fontFamily: DISPLAY, marginTop: 2 }}>{text}</div>
        {isPast && <div style={{ fontSize: 9, fontWeight: FW.bold, color: Z.da, textTransform: "uppercase", marginTop: 1 }}>PAST DUE</div>}
      </div>
    );
  };

  // ─── Progress bar helper ──────────────────────────────
  const ProgressBar = ({ pct, color, height = 6 }) => (
    <div style={{ height, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", borderRadius: height / 2 }}>
      <div style={{ height, borderRadius: height / 2, width: `${Math.min(pct, 100)}%`, background: color || (pct >= 80 ? Z.go : pct >= 50 ? Z.wa : Z.da), transition: "width 0.4s" }} />
    </div>
  );

  // ─── Blockers ─────────────────────────────────────────
  const blockers = [];
  if (issue.adDeadline && daysUntil(issue.adDeadline) < 0 && openSlots > 0)
    blockers.push({ text: `Ad deadline passed — ${openSlots} slots still open`, color: Z.da, action: "Alert Sales", page: "sales", priority: 0 });
  else if (openSlots > 0)
    blockers.push({ text: `${openSlots} open ad slot${openSlots > 1 ? "s" : ""} remaining`, color: Z.wa, action: "Sell This Issue", page: "sales", priority: 1 });
  if (issue.edDeadline && daysUntil(issue.edDeadline) < 0) {
    const stuck = issStories.filter(s => ["Draft", "Needs Editing"].includes(s.status));
    if (stuck.length > 0) blockers.push({ text: `Ed deadline passed — ${stuck.length} stor${stuck.length > 1 ? "ies" : "y"} still in editing`, color: Z.da, action: "Editorial", page: "editorial", priority: 0 });
  }
  issStories.filter(s => s.dueDate && s.dueDate < today && ["Draft", "Needs Editing"].includes(s.status)).forEach(s =>
    blockers.push({ text: `"${s.title}" overdue — ${s.status}`, color: Z.da, action: "Open Story", page: "editorial", priority: 1 })
  );
  if (issStories.length === 0)
    blockers.push({ text: "No stories assigned to this issue", color: Z.tm, action: "Assign Stories", page: "stories", priority: 2 });
  blockers.sort((a, b) => a.priority - b.priority);

  // ─── Render ───────────────────────────────────────────
  return <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 20, height: "calc(100vh - 100px)", overflow: "auto" }}>

    {/* ═══ HEADER ═══ */}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Btn sm v="ghost" onClick={onBack}><Ic.back size={14} /> Back</Btn>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>
            {pub?.name} <span style={{ color: Z.tm, fontWeight: FW.semi }}>— {issue.label}</span>
          </h2>
          <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND, marginTop: 2 }}>Publishes {fmtDate(issue.date)}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <DeadlineBadge label="Ad Close" date={issue.adDeadline} baseColor={Z.da} />
        <DeadlineBadge label="Ed Close" date={issue.edDeadline} baseColor={ACCENT.indigo} />
        <DeadlineBadge label="Publish" date={issue.date} baseColor={Z.ac} />
        <Btn sm onClick={() => onNavigate("flatplan")}>Flatplan</Btn>
      </div>
    </div>

    {/* ═══ PROGRESS STRIP — 4 equal cards ═══ */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
      {/* Ads */}
      <div onClick={() => onNavigate("sales")} style={{ ...glass(), borderRadius: R, padding: "14px 18px", cursor: "pointer", borderBottom: `2px solid ${adPct >= 80 ? Z.go : adPct >= 50 ? Z.wa : Z.tm}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND }}>Ads Sold</span>
          <span style={{ fontSize: FS.sm, fontWeight: FW.black, color: adPct >= 80 ? Z.go : adPct >= 50 ? Z.wa : Z.tx }}>{closedAds.length}/{totalSlots}</span>
        </div>
        <ProgressBar pct={adPct} />
        {openSlots > 0 && <div style={{ fontSize: 10, color: Z.wa, marginTop: 4 }}>{openSlots} slot{openSlots > 1 ? "s" : ""} available</div>}
      </div>

      {/* Editorial */}
      <div onClick={() => onNavigate("editorial")} style={{ ...glass(), borderRadius: R, padding: "14px 18px", cursor: "pointer", borderBottom: `2px solid ${editPct >= 80 ? Z.go : editPct >= 50 ? ACCENT.blue : Z.wa}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND }}>Editorial</span>
          <span style={{ fontSize: FS.sm, fontWeight: FW.black, color: editPct >= 80 ? Z.go : ACCENT.blue }}>{issStories.filter(s => !["Draft", "Needs Editing"].includes(s.status)).length}/{issStories.length}</span>
        </div>
        <ProgressBar pct={editPct} />
      </div>

      {/* Revenue vs Goal */}
      <div onClick={() => onNavigate("sales")} style={{ ...glass(), borderRadius: R, padding: "14px 18px", cursor: "pointer", borderBottom: `2px solid ${revPct >= 80 ? Z.go : revPct >= 50 ? Z.wa : Z.da}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND }}>Revenue</span>
          <span style={{ fontSize: FS.sm, fontWeight: FW.black, color: Z.go }}>{fmtCurrency(adRev)}</span>
        </div>
        {revGoal > 0 ? <>
          <ProgressBar pct={revPct} color={revPct >= 80 ? Z.go : revPct >= 50 ? Z.wa : Z.da} />
          <div style={{ fontSize: 10, color: Z.tm, marginTop: 4 }}>{revPct}% of {fmtCurrency(revGoal)} goal</div>
        </> : <div style={{ fontSize: 10, color: Z.td, marginTop: 4 }}>No goal set</div>}
      </div>

      {/* Pipeline */}
      <div onClick={() => onNavigate("sales")} style={{ ...glass(), borderRadius: R, padding: "14px 18px", cursor: "pointer", borderBottom: `2px solid ${Z.wa}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND }}>Pipeline</span>
          <span style={{ fontSize: FS.sm, fontWeight: FW.black, color: Z.wa }}>{fmtCurrency(pipelineRev)}</span>
        </div>
        <div style={{ fontSize: FS.sm, color: Z.tm }}>{pipelineAds.length} deal{pipelineAds.length !== 1 ? "s" : ""} in progress</div>
      </div>
    </div>

    {/* ═══ BLOCKERS — auto-hides when clear ═══ */}
    {blockers.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {blockers.map((b, i) => (
        <div key={i} onClick={() => onNavigate(b.page)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: b.color + "10", borderLeft: `3px solid ${b.color}`, borderRadius: Ri, cursor: "pointer" }}>
          <Ic.clock size={13} color={b.color} />
          <span style={{ flex: 1, fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx }}>{b.text}</span>
          <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: b.color, fontFamily: COND }}>{b.action} →</span>
        </div>
      ))}
    </div>}

    {/* ═══ TWO COLUMNS ═══ */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, flex: 1, minHeight: 0 }}>

      {/* ════ LEFT: Ad Sales ════ */}
      <GlassCard style={{ overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>
            Ad Sales ({closedAds.length + pipelineAds.length})
          </span>
          {openSlots > 0 && <Btn sm v="secondary" onClick={() => onNavigate("sales")}>Sell This Issue</Btn>}
        </div>

        {/* Closed */}
        {closedAds.length > 0 && <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: FW.bold, color: Z.go, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Confirmed ({closedAds.length})</div>
          {closedAds.map(s => (
            <div key={s.id} onClick={() => onNavigate("sales")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: Z.bg, borderRadius: Ri, marginBottom: 2, cursor: "pointer", borderLeft: `2px solid ${Z.go}` }}>
              <div>
                <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx }}>{cn(s.clientId)}</div>
                <div style={{ fontSize: FS.xs, color: Z.tm }}>{s.adSize || s.type || "Ad"}</div>
              </div>
              <span style={{ fontSize: FS.sm, fontWeight: FW.black, color: Z.go }}>{fmtCurrency(s.amount)}</span>
            </div>
          ))}
        </div>}

        {/* Pipeline */}
        {pipelineAds.length > 0 && <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: FW.bold, color: Z.wa, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>In Pipeline ({pipelineAds.length})</div>
          {pipelineAds.map(s => (
            <div key={s.id} onClick={() => onNavigate("sales")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: Z.bg, borderRadius: Ri, marginBottom: 2, cursor: "pointer", borderLeft: `2px solid ${Z.wa}` }}>
              <div>
                <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx }}>{cn(s.clientId)}</div>
                <div style={{ fontSize: FS.xs, color: Z.tm }}>{s.status} · {s.adSize || s.type || "Ad"}</div>
              </div>
              <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.wa }}>{fmtCurrency(s.amount)}</span>
            </div>
          ))}
        </div>}

        {/* Empty state */}
        {closedAds.length === 0 && pipelineAds.length === 0 && (
          <div style={{ padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: FS.sm, color: Z.td, marginBottom: 8 }}>{totalSlots} ad slots available</div>
            <Btn sm onClick={() => onNavigate("sales")}>Start Selling →</Btn>
          </div>
        )}
      </GlassCard>

      {/* ════ RIGHT: Editorial + Production ════ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, overflow: "auto" }}>
        <GlassCard>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>
              Editorial ({issStories.length})
            </span>
            {issStories.length === 0 && <Btn sm v="secondary" onClick={() => onNavigate("stories")}>Assign Stories</Btn>}
          </div>

          {storyGroups.map(g => (
            <div key={g.label} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: FW.bold, color: g.color, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{g.label} ({g.items.length})</div>
              {g.items.map(s => (
                <div key={s.id} onClick={() => onNavigate("stories")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: Z.bg, borderRadius: Ri, marginBottom: 2, cursor: "pointer", borderLeft: `2px solid ${g.color}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                    <div style={{ fontSize: FS.xs, color: Z.tm }}>{s.author || "—"}{s.dueDate ? ` · due ${fmtDate(s.dueDate)}` : ""}</div>
                  </div>
                  <Badge status={s.status} small />
                </div>
              ))}
            </div>
          ))}

          {issStories.length === 0 && <div style={{ padding: 20, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No stories assigned</div>}
        </GlassCard>

        <GlassCard>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Design & Production</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ padding: "10px 12px", background: Z.bg, borderRadius: Ri, textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{pub?.pageCount || 0}</div>
              <div style={{ fontSize: 10, color: Z.td, textTransform: "uppercase" }}>Pages</div>
            </div>
            <div style={{ padding: "10px 12px", background: Z.bg, borderRadius: Ri, textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: FW.black, color: closedAds.length > 0 ? ACCENT.indigo : Z.td, fontFamily: DISPLAY }}>{closedAds.length}</div>
              <div style={{ fontSize: 10, color: Z.td, textTransform: "uppercase" }}>Ads to Place</div>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  </div>;
};

export default IssueDetail;
