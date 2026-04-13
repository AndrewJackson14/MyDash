import { useState, useMemo, useEffect, useRef } from "react";
import { Z, COND, DISPLAY, FS, FW, R, Ri, INV, ACCENT, ZI } from "../lib/theme";
import { Ic, Btn, GlassCard, Modal, glass } from "../components/ui";
import { fmtCurrencyWhole as fmtCurrency, initials as ini } from "../lib/formatters";
import { useSignalFeed } from "../hooks/useSignalFeed";
import TeamMemberPanel from "../components/TeamMemberPanel";
import { supabase, isOnline } from "../lib/supabase";

// ============================================================
// DashboardV2 — Publisher signal-first command center.
//
// Pulls every metric from useSignalFeed, lays them out as:
//   [ ambient pressure glow background ]
//   [ greeting + global pressure read    ]
//   [ DOSE wins strip (pop on change)    ]
//   [ 4 department tiles with heat bars  ]
//   [ central "Now" feed (focus items)   ]
//   [ team presence strip                ]
//
// Feature-flagged from App.jsx via ?v=2 or localStorage.
// Salesperson / team member dashboards still use Dashboard.jsx.
// ============================================================

const DEPT_META = {
  sales: { label: "Sales", icon: Ic.sale },
  editorial: { label: "Editorial", icon: Ic.story },
  production: { label: "Production", icon: Ic.flat },
  admin: { label: "Admin", icon: Ic.lock },
};

// Heat (0–100) → semantic color. Single source so tiles, bars, and
// labels all agree.
const heatColor = (h) => {
  if (h < 25) return "#3B82F6"; // blue — calm
  if (h < 50) return "#10B981"; // green — steady
  if (h < 75) return "#F59E0B"; // amber — warming
  return "#EF4444";             // red — hot
};
const heatLabel = (h) => h < 25 ? "Calm" : h < 50 ? "Steady" : h < 75 ? "Heating up" : "Needs you";

// Right-hand team member detection (Cami, Camille per the vision discussion).
const RIGHT_HAND_FIRST_NAMES = new Set(["Cami", "Camille"]);

// Live countdown label — re-evaluates each render, driven by the
// 30s tick in DashboardV2 so the numbers tick down in real time.
function liveCountdown(dateStr) {
  if (!dateStr) return "";
  // Use end of day as the deadline cutoff so "today" stays "today" all day
  const target = new Date(dateStr + "T17:00:00").getTime();
  const diff = target - Date.now();
  if (diff <= 0) return "OVERDUE";
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours < 24) return `${hours}h ${minutes}m`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return `${days}d ${remH}h`;
}

// Streak counter — persistent across sessions via localStorage.
// Bumps once per local calendar day when the dashboard sees a "winning"
// state (no overdue deadlines AND at least one DOSE win). Resets on a
// "needs you" day (any deadline alerts).
function useStreakCounter(doseWins, deadlineAlerts) {
  const [streak, setStreak] = useState(() => {
    try { return parseInt(localStorage.getItem("mydash-streak") || "0", 10) || 0; } catch (e) { return 0; }
  });

  useEffect(() => {
    if (!doseWins) return;
    let lastDay; try { lastDay = localStorage.getItem("mydash-streak-day") || ""; } catch (e) {}
    const today = new Date().toISOString().slice(0, 10);
    if (lastDay === today) return; // already counted today
    const winsCount = (doseWins.closedThisMonth?.count || 0) + (doseWins.teamEdited || 0);
    const winning = deadlineAlerts.length === 0 && winsCount > 0;
    if (winning) {
      // If yesterday's day was streak day, increment. If gap > 1 day, reset to 1.
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const next = (lastDay === yesterday) ? streak + 1 : 1;
      try {
        localStorage.setItem("mydash-streak", String(next));
        localStorage.setItem("mydash-streak-day", today);
      } catch (e) {}
      setStreak(next);
    } else if (deadlineAlerts.length > 0) {
      // Hot day — break the streak
      try {
        localStorage.setItem("mydash-streak", "0");
        localStorage.setItem("mydash-streak-day", today);
      } catch (e) {}
      setStreak(0);
    }
  }, [doseWins, deadlineAlerts, streak]);

  return streak;
}

const DashboardV2 = (props) => {
  const {
    pubs, stories, clients, sales, issues, team,
    invoices, payments, subscribers, tickets, legalNotices, creativeJobs,
    salespersonPubAssignments, commissionGoals,
    jurisdiction, currentUser, userName, onNavigate, setIssueDetailId,
  } = props;

  const feed = useSignalFeed({
    pubs, stories, clients, sales, issues, team,
    invoices, payments, subscribers, tickets, legalNotices, creativeJobs,
    salespersonPubAssignments, commissionGoals,
    jurisdiction,
  });
  const {
    focusItems, deadlineAlerts, doseWins,
    departmentPressure, globalPressure,
    teamStatus, needsDir,
  } = feed;

  const [filterDept, setFilterDept] = useState("all");
  const [openMember, setOpenMember] = useState(null);
  const [drilledDept, setDrilledDept] = useState(null);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [rightHandNotes, setRightHandNotes] = useState([]);

  // Live tick — updates every 30s so countdown labels stay fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // ── Right-hand auto-pin ──────────────────────────────────
  // Fetch any team_notes from Cami / Camille from the last 24h.
  // Surfaced in a banner above the central feed so messages from
  // your right hands never get buried.
  useEffect(() => {
    if (!isOnline()) return;
    const rightHands = (team || []).filter(t => RIGHT_HAND_FIRST_NAMES.has((t.name || "").split(" ")[0]) && t.authId);
    if (rightHands.length === 0) { setRightHandNotes([]); return; }
    const ids = rightHands.map(t => t.authId);
    const since = new Date(Date.now() - 24 * 3600000).toISOString();
    let cancelled = false;
    supabase.from("team_notes")
      .select("*")
      .in("from_user", ids)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (cancelled) return;
        const enriched = (data || []).map(n => {
          const sender = rightHands.find(t => t.authId === n.from_user);
          return { ...n, senderName: sender?.name || "", senderObj: sender };
        });
        setRightHandNotes(enriched);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team]);

  // Streak counter — persistent across sessions. Increments by 1
  // each calendar day where there are zero deadline alerts AND at
  // least one DOSE win. Resets on a "needs you" day.
  const streak = useStreakCounter(doseWins, deadlineAlerts);

  // ── Greeting ─────────────────────────────────────────────
  const hour = new Date().getHours();
  const firstName = (userName || "").split(" ")[0] || "there";
  const greeting = hour < 12 ? `Good morning, ${firstName}` : hour < 17 ? `Good afternoon, ${firstName}` : `Good evening, ${firstName}`;

  // ── Ambient pressure glow ────────────────────────────────
  // Sits absolute behind everything in this view, tinted by
  // globalPressure. Calm = blue, neutral = green, hot = red.
  // Transitions slowly so changes feel like the room reacting.
  const ambientTint = useMemo(() => {
    if (globalPressure < 25) return { color: "rgba(59,130,246,0.14)", label: "Calm" };
    if (globalPressure < 50) return { color: "rgba(16,185,129,0.10)", label: "Steady" };
    if (globalPressure < 75) return { color: "rgba(245,158,11,0.13)", label: "Warming up" };
    return { color: "rgba(239,68,68,0.16)", label: "Hot — needs you" };
  }, [globalPressure]);

  // ── Combined feed (deadlines + focus items, sorted by heat) ──
  // Note: deadline rows store the raw date so FeedRow can recompute
  // the live countdown each render (driven by the 30s tick above).
  const combinedFeed = useMemo(() => {
    const deadlineRows = deadlineAlerts.map(d => ({
      id: d.id,
      kind: "deadline",
      title: d.label,
      deadlineDate: d.date,
      dept: d.type === "ed" ? "editorial" : "production",
      color: d.color,
      priority: d.days <= 0 ? 0 : d.days === 1 ? 1 : 2,
      page: d.type === "ed" ? "editorial" : "schedule",
      rawId: d.id,
    }));
    const focusRows = focusItems.map(f => ({ ...f, kind: "focus", rawId: f.id }));
    const all = [...deadlineRows, ...focusRows];
    if (filterDept !== "all") return all.filter(r => r.dept === filterDept).sort((a, b) => a.priority - b.priority);
    return all.sort((a, b) => a.priority - b.priority);
  }, [deadlineAlerts, focusItems, filterDept]);

  const totalSignals = focusItems.length + deadlineAlerts.length;

  const switchToV1 = () => {
    try { localStorage.setItem("mydash-dashboard-v2", "false"); } catch (e) {}
    const url = new URL(window.location.href);
    url.searchParams.delete("v");
    window.location.href = url.toString();
  };

  return <div style={{ position: "relative", padding: "28px 28px 60px", minHeight: "100%" }}>
    {/* Inline keyframes — hot pulse on hot tiles, calm drift on win
        pills, and winPop on pills whose count just changed. */}
    <style>{`
      @keyframes hotPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.0); }
        50% { box-shadow: 0 0 0 6px rgba(239,68,68,0.15); }
      }
      @keyframes calmDrift {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-1px); }
      }
      @keyframes winPop {
        0% { transform: scale(0.85); opacity: 0; }
        40% { transform: scale(1.12); opacity: 1; }
        70% { transform: scale(0.97); }
        100% { transform: scale(1); }
      }
      @keyframes overduePop {
        0% { transform: scale(1); }
        15% { transform: scale(1.04) translateY(-2px); }
        30% { transform: scale(0.99) translateY(0); }
        45% { transform: scale(1.02); }
        60% { transform: scale(1); }
        100% { transform: scale(1); }
      }
    `}</style>

    {/* Ambient pressure glow */}
    <div aria-hidden style={{
      position: "absolute",
      inset: -120,
      background: `radial-gradient(ellipse 80% 60% at 50% 30%, ${ambientTint.color}, transparent 70%)`,
      pointerEvents: "none",
      transition: "background 2s ease",
      zIndex: 0,
    }} />

    <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 18 }}>

      {/* ── Header: greeting + global pressure + V1 toggle ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: FS.title || 32, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, letterSpacing: -0.5 }}>{greeting}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, background: heatColor(globalPressure) + "18", border: `1px solid ${heatColor(globalPressure)}40` }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: heatColor(globalPressure), boxShadow: globalPressure >= 75 ? `0 0 8px ${heatColor(globalPressure)}` : "none" }} />
              <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: heatColor(globalPressure), textTransform: "uppercase", letterSpacing: 0.6 }}>{ambientTint.label}</span>
            </div>
            <span style={{ fontSize: FS.sm, color: Z.tm }}>
              {totalSignals === 0 ? "All clear ✓" : `${totalSignals} signal${totalSignals === 1 ? "" : "s"} need you`}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn sm v="secondary" onClick={() => setBriefingOpen(true)}>Morning Briefing</Btn>
          <Btn sm v="ghost" onClick={switchToV1}>← Classic Dashboard</Btn>
        </div>
      </div>

      {/* ── DOSE wins strip ──────────────────────────────── */}
      <DoseWinsStrip wins={doseWins} streak={streak} />

      {/* ── Department tiles ─────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {Object.entries(departmentPressure).map(([dept, data]) => {
          const meta = DEPT_META[dept];
          const Icon = meta.icon;
          const color = heatColor(data.heat);
          const isActive = filterDept === dept;
          const isHot = data.heat >= 75;
          return <GlassCard key={dept}
            onClick={() => setDrilledDept(dept)}
            style={{
              position: "relative",
              borderTop: `2px solid ${color}`,
              background: `linear-gradient(180deg, ${color}14 0%, transparent 60%), ${glass().background}`,
              transform: isActive ? "translateY(-2px)" : undefined,
              boxShadow: isActive ? `0 8px 24px ${color}30, 0 0 0 1px ${color}60` : undefined,
              animation: isHot ? "hotPulse 2s ease-in-out infinite" : undefined,
              padding: "16px 18px",
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              {Icon && <Icon size={13} color={color} />}
              <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>{meta.label}</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, letterSpacing: -1, lineHeight: 1 }}>
              {data.count}
            </div>
            <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 4, minHeight: 16 }}>
              {dept === "sales" && (data.pctToGoal != null ? `${data.pctToGoal}% to goal` : `${fmtCurrency(data.pipelineValue || 0)} pipeline`)}
              {dept === "editorial" && `${data.stuckStories || 0} stuck · ${data.editDeadlines || 0} deadlines`}
              {dept === "production" && `${data.adDeadlines || 0} ad deadlines · ${data.overdueJobs || 0} overdue`}
              {dept === "admin" && `${data.openTickets || 0} tickets · ${data.overdueInvCount || 0} overdue inv`}
            </div>
            <div style={{ marginTop: 12, height: 4, background: Z.bd, borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${data.heat}%`, height: "100%", background: color, transition: "width 0.6s ease, background 1.5s ease" }} />
            </div>
            <div style={{ fontSize: FS.micro, color: color, marginTop: 4, fontWeight: FW.heavy, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {heatLabel(data.heat)}
            </div>
          </GlassCard>;
        })}
      </div>

      {/* ── Right-hand auto-pin (Cami / Camille) ─────────── */}
      {rightHandNotes.length > 0 && <GlassCard style={{
        borderLeft: `3px solid ${ACCENT.amber || "#F59E0B"}`,
        background: `linear-gradient(180deg, ${(ACCENT.amber || "#F59E0B")}10 0%, transparent 60%), ${glass().background}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Ic.star size={13} color={ACCENT.amber || "#F59E0B"} />
            <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: ACCENT.amber || "#F59E0B", textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>From your right hand</span>
          </div>
          <span style={{ fontSize: FS.micro, color: Z.td }}>{rightHandNotes.length} note{rightHandNotes.length === 1 ? "" : "s"} · last 24h</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rightHandNotes.slice(0, 4).map(n => {
            const minsAgo = Math.floor((Date.now() - new Date(n.created_at).getTime()) / 60000);
            const ago = minsAgo < 60 ? `${minsAgo}m ago` : minsAgo < 1440 ? `${Math.floor(minsAgo / 60)}h ago` : `${Math.floor(minsAgo / 1440)}d ago`;
            return <div key={n.id} onClick={() => n.senderObj && setOpenMember(n.senderObj)} style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "8px 12px",
              background: Z.bg === "#08090D" ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.6)",
              borderRadius: Ri,
              cursor: "pointer",
              transition: "background 0.15s ease, transform 0.15s ease",
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: ACCENT.amber || "#F59E0B" }}>{(n.senderName || "").split(" ")[0]}</span>
                  <span style={{ fontSize: FS.micro, color: Z.td }}>· {ago}</span>
                  {n.context_type === "task" && <span style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.wa, background: Z.wa + "15", padding: "1px 6px", borderRadius: 8 }}>TASK</span>}
                </div>
                <div style={{ fontSize: FS.sm, color: Z.tx, lineHeight: 1.4 }}>{n.message}</div>
              </div>
            </div>;
          })}
        </div>
      </GlassCard>}

      {/* ── Central "Now" feed ───────────────────────────── */}
      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Now</div>
            <div style={{ fontSize: 22, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginTop: 2 }}>
              {filterDept === "all" ? "Where you're needed" : `${DEPT_META[filterDept].label} signals`}
            </div>
          </div>
          {filterDept !== "all" && <Btn sm v="ghost" onClick={() => setFilterDept("all")}>Clear filter</Btn>}
        </div>

        {combinedFeed.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✨</div>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>All clear</div>
            <div style={{ fontSize: FS.sm, color: Z.td, marginTop: 4 }}>Take a breath. Nothing needs you right now.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {combinedFeed.map(item => <FeedRow key={item.id} item={item} onNavigate={onNavigate} setIssueDetailId={setIssueDetailId} />)}
          </div>
        )}
      </GlassCard>

      {/* ── Team presence strip ──────────────────────────── */}
      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Team</div>
            <div style={{ fontSize: 20, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginTop: 2 }}>
              {needsDir.length === 0 ? "Everyone's flowing" : `${needsDir.length} need direction`}
            </div>
          </div>
          <Btn sm v="ghost" onClick={() => onNavigate?.("team")}>View all</Btn>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {teamStatus.filter(t => t.isActive !== false && !t.isHidden).slice(0, 12).map(t => <TeamChip key={t.id} member={t} onClick={() => setOpenMember(t)} />)}
        </div>
      </GlassCard>

    </div>

    {/* Team member messenger slide-in */}
    <TeamMemberPanel member={openMember} onClose={() => setOpenMember(null)} currentUser={currentUser} />

    {/* Department drill-in modal */}
    {drilledDept && <DeptDrillIn
      dept={drilledDept}
      pressure={departmentPressure[drilledDept]}
      meta={DEPT_META[drilledDept]}
      color={heatColor(departmentPressure[drilledDept]?.heat || 0)}
      focusItems={focusItems.filter(f => f.dept === drilledDept)}
      deadlineAlerts={deadlineAlerts.filter(d => (d.type === "ed" ? "editorial" : "production") === drilledDept)}
      onClose={() => setDrilledDept(null)}
      onNavigate={onNavigate}
      setIssueDetailId={setIssueDetailId}
    />}

    {/* Morning briefing modal */}
    <Modal open={briefingOpen} onClose={() => setBriefingOpen(false)} title="Morning Briefing" width={680}>
      <BriefingContent
        firstName={firstName}
        feed={feed}
        stories={stories}
        subscribers={subscribers}
        onClose={() => setBriefingOpen(false)}
      />
    </Modal>
  </div>;
};

// ============================================================
// FeedRow — one row in the central "Now" feed.
// Deadline rows compute live countdown each render so the
// numbers tick down in real time (parent re-renders every 30s).
// When a deadline row transitions into OVERDUE, a one-shot
// pop animation fires.
// ============================================================
const FeedRow = ({ item, onNavigate, setIssueDetailId }) => {
  const meta = DEPT_META[item.dept] || {};
  const Icon = meta.icon;
  const accent = item.color || "#9CA3AF";

  // Deadline rows: live tick. Other rows: static sub.
  const subLabel = item.kind === "deadline" ? liveCountdown(item.deadlineDate) : item.sub;
  const isOverdue = item.kind === "deadline" && subLabel === "OVERDUE";

  // Detect overdue transition for one-shot pop animation
  const wasOverdueRef = useRef(false);
  const [justWentOverdue, setJustWentOverdue] = useState(false);
  useEffect(() => {
    if (isOverdue && !wasOverdueRef.current) {
      setJustWentOverdue(true);
      const t = setTimeout(() => setJustWentOverdue(false), 1500);
      wasOverdueRef.current = true;
      return () => clearTimeout(t);
    }
    if (!isOverdue) wasOverdueRef.current = false;
  }, [isOverdue]);

  const handleClick = () => {
    if (item.kind === "deadline" && item.id?.startsWith("ad-") && setIssueDetailId) {
      setIssueDetailId(item.id.replace("ad-", ""));
      return;
    }
    if (item.issueId && setIssueDetailId) {
      setIssueDetailId(item.issueId);
      return;
    }
    if (item.page && onNavigate) onNavigate(item.page);
  };

  return <div onClick={handleClick}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "12px 14px",
      background: Z.bg === "#08090D" ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.55)",
      borderRadius: Ri,
      borderLeft: `3px solid ${isOverdue ? "#EF4444" : accent}`,
      cursor: "pointer",
      transition: "background 0.15s ease, transform 0.15s ease, border-color 0.15s ease",
      animation: justWentOverdue ? "overduePop 0.7s ease-out" : undefined,
      boxShadow: justWentOverdue ? "0 0 22px rgba(239,68,68,0.5)" : undefined,
    }}
    onMouseEnter={e => {
      e.currentTarget.style.transform = "translateY(-1px)";
      e.currentTarget.style.background = Z.bg === "#08090D" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.78)";
    }}
    onMouseLeave={e => {
      e.currentTarget.style.transform = "translateY(0)";
      e.currentTarget.style.background = Z.bg === "#08090D" ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.55)";
    }}>
    {Icon && <Icon size={14} color={isOverdue ? "#EF4444" : accent} />}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: FS.md, fontWeight: FW.semi, color: Z.tx, fontFamily: COND, lineHeight: 1.35 }}>{item.title}</div>
      {subLabel && <div style={{ fontSize: FS.xs, color: isOverdue ? "#EF4444" : Z.tm, marginTop: 2, fontWeight: isOverdue ? FW.heavy : FW.normal, fontVariantNumeric: item.kind === "deadline" ? "tabular-nums" : "normal" }}>{subLabel}</div>}
    </div>
    <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: COND, padding: "3px 8px", background: Z.sa, borderRadius: 10 }}>
      {meta.label || item.dept}
    </span>
  </div>;
};

// ============================================================
// TeamChip — single team member presence dot with right-hand
// star accent for Cami / Camille.
// ============================================================
const TeamChip = ({ member, onClick }) => {
  const firstName = member.name?.split(" ")[0] || "";
  const isRightHand = RIGHT_HAND_FIRST_NAMES.has(firstName);
  const hue = Math.abs([...(member.name || "")].reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)) % 360;
  const statusColor = member.needsDirection
    ? (member.overdueCount > 2 ? "#EF4444" : "#F59E0B")
    : "#10B981";

  return <div onClick={onClick}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 14px 8px 8px",
      background: Z.bg === "#08090D" ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.55)",
      borderRadius: 22,
      cursor: "pointer",
      border: isRightHand ? `1px solid ${ACCENT.amber || "#F59E0B"}50` : "1px solid transparent",
      transition: "transform 0.15s ease, background 0.15s ease",
    }}
    onMouseEnter={e => {
      e.currentTarget.style.transform = "translateY(-1px)";
      e.currentTarget.style.background = Z.bg === "#08090D" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.78)";
    }}
    onMouseLeave={e => {
      e.currentTarget.style.transform = "translateY(0)";
      e.currentTarget.style.background = Z.bg === "#08090D" ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.55)";
    }}>
    <div style={{ position: "relative" }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: `hsl(${hue}, 40%, 38%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: FW.black, color: INV.light || "#fff",
      }}>{ini(member.name)}</div>
      <div style={{
        position: "absolute", bottom: -1, right: -1,
        width: 10, height: 10, borderRadius: "50%",
        background: statusColor,
        border: `2px solid ${Z.bg === "#08090D" ? "#0E1018" : "#fff"}`,
      }} />
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, display: "flex", alignItems: "center", gap: 4 }}>
        {firstName}
        {isRightHand && <Ic.star size={9} color={ACCENT.amber || "#F59E0B"} />}
      </div>
      <div style={{ fontSize: FS.micro, color: Z.tm, lineHeight: 1.2 }}>{member.role}</div>
    </div>
  </div>;
};

// ============================================================
// DoseWinsStrip — horizontal pill row of today's wins.
// Pops (scale + glow) when a pill's text actually changes
// (e.g., "2 deals closed" → "3 deals closed").
// ============================================================
const DoseWinsStrip = ({ wins, streak }) => {
  // Track previous pill texts so we can flag the ones that changed
  // and pop those instead of all of them every render.
  const prevTextsRef = useRef([]);

  const pills = [];
  if (streak > 0) pills.push({ key: "streak", icon: "🔥", text: `${streak}-day streak`, color: "#F97316" });
  if (wins?.closedThisMonth?.count > 0) pills.push({ key: "closed", icon: "💰", text: `${wins.closedThisMonth.count} deals closed MTD · ${fmtCurrency(wins.closedThisMonth.total)}`, color: "#10B981" });
  if (wins?.topSeller && wins.topSeller.monthlyTotal > 0) pills.push({ key: "top", icon: "⭐", text: `${(wins.topSeller.sp.name || "").split(" ")[0]}: ${fmtCurrency(wins.topSeller.monthlyTotal)} MTD`, color: "#F59E0B" });
  if (wins?.teamEdited > 0) pills.push({ key: "edit", icon: "📝", text: `${wins.teamEdited} stories edited this month`, color: "#3B82F6" });
  if (wins?.allDeadlinesMet) pills.push({ key: "clear", icon: "✨", text: "All deadlines met", color: "#10B981" });

  // Diff: which pill texts changed since last render?
  const changedKeys = new Set();
  pills.forEach(p => {
    const prev = prevTextsRef.current.find(x => x.key === p.key);
    if (!prev || prev.text !== p.text) changedKeys.add(p.key);
  });
  // First render shouldn't pop everything (would feel like spam)
  const isFirstRender = prevTextsRef.current.length === 0;
  useEffect(() => {
    prevTextsRef.current = pills.map(p => ({ key: p.key, text: p.text }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pills.map(p => `${p.key}:${p.text}`).join("|")]);

  if (pills.length === 0) return null;

  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    {pills.map((p, i) => {
      const popping = !isFirstRender && changedKeys.has(p.key);
      return <div key={p.key} style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 14px",
        background: p.color + "14",
        border: `1px solid ${p.color}40`,
        borderRadius: 20,
        animation: popping ? "winPop 0.6s ease-out" : "calmDrift 4s ease-in-out infinite",
        animationDelay: popping ? "0s" : `${i * 0.5}s`,
        boxShadow: popping ? `0 0 20px ${p.color}60` : "none",
      }}>
        <span style={{ fontSize: 13 }}>{p.icon}</span>
        <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: p.color, fontVariantNumeric: "tabular-nums" }}>{p.text}</span>
      </div>;
    })}
  </div>;
};

// ============================================================
// DeptDrillIn — modal-style overlay that expands when a
// department tile is clicked. Shows the department's full
// breakdown: heat ring, items, deadlines, key stats. Click
// outside or X to dismiss.
// ============================================================
const DeptDrillIn = ({ dept, pressure, meta, color, focusItems, deadlineAlerts, onClose, onNavigate, setIssueDetailId }) => {
  if (!pressure || !meta) return null;
  const Icon = meta.icon;
  return <div onClick={onClose} style={{
    position: "fixed", inset: 0,
    zIndex: ZI?.top || 9999,
    background: "rgba(0,0,0,0.55)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 40,
    animation: "drillFadeIn 0.25s ease-out",
  }}>
    <style>{`
      @keyframes drillFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes drillScaleIn {
        from { transform: scale(0.92); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
    `}</style>
    <div onClick={e => e.stopPropagation()} style={{
      width: "min(720px, 100%)", maxHeight: "85vh",
      ...glass(),
      borderRadius: R,
      borderTop: `3px solid ${color}`,
      padding: "28px 32px",
      display: "flex", flexDirection: "column", gap: 18,
      animation: "drillScaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
      overflow: "auto",
      boxShadow: `0 24px 64px rgba(0,0,0,0.4), 0 0 0 1px ${color}40`,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            {Icon && <Icon size={18} color={color} />}
            <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1.2, fontFamily: COND }}>{meta.label}</span>
          </div>
          <h2 style={{ margin: 0, fontSize: 32, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, letterSpacing: -0.5 }}>{heatLabel(pressure.heat)}</h2>
          <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 4 }}>{pressure.count} item{pressure.count === 1 ? "" : "s"} · pressure {pressure.heat}/100</div>
        </div>
        <Btn sm v="ghost" onClick={onClose}>&times;</Btn>
      </div>

      {/* Heat bar */}
      <div>
        <div style={{ height: 6, background: Z.bd, borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${pressure.heat}%`, height: "100%", background: color, transition: "width 0.6s ease" }} />
        </div>
      </div>

      {/* Department-specific stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        {dept === "sales" && <>
          <DrillStat label="Pipeline" value={fmtCurrency(pressure.pipelineValue || 0)} />
          <DrillStat label="To monthly goal" value={`${pressure.pctToGoal ?? 0}%`} />
        </>}
        {dept === "editorial" && <>
          <DrillStat label="Stories stuck" value={pressure.stuckStories || 0} />
          <DrillStat label="Editorial deadlines" value={pressure.editDeadlines || 0} />
        </>}
        {dept === "production" && <>
          <DrillStat label="Ad deadlines" value={pressure.adDeadlines || 0} />
          <DrillStat label="Overdue jobs" value={pressure.overdueJobs || 0} />
        </>}
        {dept === "admin" && <>
          <DrillStat label="Open tickets" value={pressure.openTickets || 0} />
          <DrillStat label="Overdue invoices" value={pressure.overdueInvCount || 0} />
        </>}
      </div>

      {/* Items needing attention */}
      <div>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Items needing you</div>
        {(focusItems.length === 0 && deadlineAlerts.length === 0)
          ? <div style={{ padding: 18, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>Nothing pending here. Take the win.</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {deadlineAlerts.map(d => <div key={d.id} onClick={() => { onClose(); if (d.id?.startsWith("ad-") && setIssueDetailId) setIssueDetailId(d.id.replace("ad-", "")); else onNavigate?.(d.type === "ed" ? "editorial" : "schedule"); }} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px",
                background: Z.bg === "#08090D" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.55)",
                borderRadius: Ri,
                borderLeft: `3px solid ${d.color}`,
                cursor: "pointer",
              }}>
                <Ic.clock size={13} color={d.color} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{d.label}</div>
                  <div style={{ fontSize: FS.xs, color: d.color, fontWeight: FW.bold, fontVariantNumeric: "tabular-nums" }}>{liveCountdown(d.date)}</div>
                </div>
              </div>)}
              {focusItems.map(f => <div key={f.id} onClick={() => { onClose(); if (f.issueId && setIssueDetailId) setIssueDetailId(f.issueId); else if (f.page) onNavigate?.(f.page); }} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px",
                background: Z.bg === "#08090D" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.55)",
                borderRadius: Ri,
                borderLeft: `3px solid ${color}`,
                cursor: "pointer",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{f.title}</div>
                  {f.sub && <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 2 }}>{f.sub}</div>}
                </div>
                {f.action && <Btn sm v="secondary">{f.action}</Btn>}
              </div>)}
            </div>}
      </div>
    </div>
  </div>;
};

const DrillStat = ({ label, value }) => (
  <div style={{ padding: "14px 16px", background: Z.bg === "#08090D" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.55)", borderRadius: Ri }}>
    <div style={{ fontSize: 9, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginTop: 4 }}>{value}</div>
  </div>
);

// ============================================================
// BriefingContent — text-based morning briefing with a copy-to-
// clipboard escape hatch. Uses the signal feed plus the raw
// stories/subscribers props to fill in editorial pipeline + sub
// stats which the hook doesn't pre-aggregate.
// ============================================================
const BriefingContent = ({ firstName, feed, stories, subscribers, onClose }) => {
  const { revenueCommand, issueCountdown, focusItems, doseWins, deadlineAlerts, _stories, _subs, pn } = feed;
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const briefingText = useMemo(() => {
    const l = [`13 STARS MEDIA — DAILY BRIEFING for ${firstName}`, dateStr, ""];
    l.push("═══ REVENUE ═══");
    l.push(`Ad Revenue MTD (closed): ${fmtCurrency(revenueCommand.adRevMTD)}`);
    l.push(`Issue Revenue (publishing this month): ${fmtCurrency(revenueCommand.issueRevThisMonth)}`);
    l.push(`Outstanding AR: ${fmtCurrency(revenueCommand.outstandingAR)}${revenueCommand.overdueInvCount > 0 ? ` (${revenueCommand.overdueInvCount} overdue)` : ""}`);
    l.push(`Pipeline: ${fmtCurrency(revenueCommand.pipelineValue)} (${revenueCommand.pipelineCount} deals)`);
    if (revenueCommand.uninvoicedContracts > 0) l.push(`Uninvoiced contracts (next 30d): ${fmtCurrency(revenueCommand.uninvoicedContracts)}`);
    l.push("");

    if (issueCountdown.length > 0) {
      l.push("═══ PUBLISHING ═══");
      issueCountdown.slice(0, 6).forEach(iss => l.push(`${pn(iss.pubId)} ${iss.label} — ${iss.daysOut}d — ${fmtCurrency(iss.rev)}/${fmtCurrency(iss.goal)} (${iss.pct}%)`));
      l.push("");
    }

    const storyStatuses = {};
    (_stories || stories || []).forEach(s => { storyStatuses[s.status] = (storyStatuses[s.status] || 0) + 1; });
    const editStages = ["Draft", "Needs Editing", "Edited", "Approved", "On Page"];
    if (editStages.some(st => storyStatuses[st] > 0)) {
      l.push("═══ EDITORIAL ═══");
      editStages.forEach(st => { if (storyStatuses[st]) l.push(`${st}: ${storyStatuses[st]}`); });
      l.push("");
    }

    const activeSubs = (_subs || subscribers || []).filter(s => s.status === "active").length;
    if (activeSubs > 0) {
      l.push("═══ SUBSCRIPTIONS ═══");
      l.push(`Active: ${activeSubs}`);
      l.push("");
    }

    if (deadlineAlerts.length > 0) {
      l.push("═══ DEADLINES (next 48h) ═══");
      deadlineAlerts.forEach(d => l.push(`• ${d.label} (${d.days <= 0 ? "TODAY" : d.days === 1 ? "TOMORROW" : d.days + "d"})`));
      l.push("");
    }

    if (focusItems.length > 0) {
      l.push("═══ PRIORITIES ═══");
      focusItems.forEach((fi, i) => l.push(`${i + 1}. [${(fi.dept || "").toUpperCase()}] ${fi.title}${fi.sub ? ` — ${fi.sub}` : ""}`));
    }

    if (focusItems.length === 0 && deadlineAlerts.length === 0) {
      l.push("✨ All clear. Take a breath, then prospect or work renewals.");
    }

    return l.join("\n");
  }, [firstName, dateStr, revenueCommand, issueCountdown, focusItems, doseWins, deadlineAlerts, _stories, _subs, stories, subscribers, pn]);

  const copy = () => { try { navigator.clipboard?.writeText(briefingText); } catch (e) {} };

  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Btn sm v="secondary" onClick={copy}>Copy to Clipboard</Btn>
      <Btn sm onClick={() => { copy(); onClose(); }}>Copy & Close</Btn>
    </div>
    <pre style={{
      background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: R,
      padding: 18, fontSize: FS.sm, color: Z.tx, lineHeight: 1.6,
      whiteSpace: "pre-wrap", fontFamily: "'Source Sans 3', monospace",
      maxHeight: 500, overflowY: "auto", margin: 0,
    }}>{briefingText}</pre>
  </div>;
};

export default DashboardV2;
