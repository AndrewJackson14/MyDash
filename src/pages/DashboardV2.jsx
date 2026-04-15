import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Z, COND, DISPLAY, FS, FW, R, Ri, INV, ACCENT, ZI } from "../lib/theme";
import { Ic, Btn, GlassCard, Modal, glass } from "../components/ui";
import { fmtCurrencyWhole as fmtCurrency, initials as ini } from "../lib/formatters";
import { useSignalFeed } from "../hooks/useSignalFeed";
import TeamMemberPanel from "../components/TeamMemberPanel";
import SignalThreadPanel from "../components/SignalThreadPanel";
import { supabase, isOnline } from "../lib/supabase";
import { useEventBus } from "../hooks/useEventBus";

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

// Department → role match. Each tile shows mini-avatars of the team
// members assigned to that dept based on their role.
const DEPT_ROLES = {
  sales: new Set(["Sales Manager", "Salesperson"]),
  editorial: new Set(["Editor", "Copy Editor", "Managing Editor", "Content Editor", "Editor-in-Chief", "Writer/Reporter"]),
  production: new Set(["Graphic Designer", "Photo Editor", "Layout Designer", "Production Manager"]),
  admin: new Set(["Office Manager", "Office Administrator"]),
};

const membersForDept = (team, dept, limit = Infinity) => {
  const roles = DEPT_ROLES[dept];
  if (!roles) return [];
  const filtered = (team || []).filter(t => roles.has(t.role) && t.isActive !== false && !t.isHidden);
  return Number.isFinite(limit) ? filtered.slice(0, limit) : filtered;
};

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
    _sales, _clients, _issues, _pubs, _stories, _inv, _tickets, _legal, _jobs,
  } = feed;

  // Push newsroom heat up to the app shell so the ambient background layer
  // can tint/animate across every page, not just the dashboard.
  useEffect(() => {
    if (props.onPressureChange) props.onPressureChange(globalPressure);
  }, [globalPressure, props.onPressureChange]);

  const [openMember, setOpenMember] = useState(null);
  const [openSignal, setOpenSignal] = useState(null);
  const [drilledDept, setDrilledDept] = useState(null);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [rightHandNotes, setRightHandNotes] = useState([]);
  // Rolling activity feed for the DOSE banner — newest on the right,
  // oldest slides off the left when the ring buffer overflows.
  const [activity, setActivity] = useState([]);

  // ── Activity stream: in-process bus + cross-tab Supabase realtime ──
  // Two paths feed the activity feed via a shared fireWin helper that
  // dedupes by event id, so a sale closed by Hayley in one tab and a
  // sale closed by Cami from her laptop both show up here — and
  // neither shows up twice.
  const bus = useEventBus();
  const seenEventIdsRef = useRef(new Set());
  const fireWin = useCallback((id, win) => {
    if (!id || seenEventIdsRef.current.has(id)) return;
    seenEventIdsRef.current.add(id);
    // Trim the set if it gets huge (>500 entries) to avoid a leak
    if (seenEventIdsRef.current.size > 500) {
      const keep = Array.from(seenEventIdsRef.current).slice(-300);
      seenEventIdsRef.current = new Set(keep);
    }
    setActivity(prev => {
      const next = [...prev, { ...win, id, addedAt: Date.now() }];
      // Ring buffer — drop the oldest when we exceed 10 items
      return next.length > 10 ? next.slice(next.length - 10) : next;
    });
  }, []);

  // Path 1: in-process event bus (actions taken in this tab)
  useEffect(() => {
    const unsubs = [];
    unsubs.push(bus.on("sale.closed", (p) => fireWin(`sale-${p.saleId}`, {
      kind: "sale", emoji: "💰", title: "Deal closed",
      body: `${p.clientName || "Client"} · ${fmtCurrency(p.amount || 0)}${p.publication ? ` for ${p.publication}` : ""}`,
    })));
    unsubs.push(bus.on("proposal.signed", (p) => fireWin(`proposal-${p.proposalId}`, {
      kind: "proposal", emoji: "✍️", title: "Proposal signed",
      body: `${p.clientName || "Client"} · ${fmtCurrency(p.totalAmount || 0)}${p.lineCount ? ` · ${p.lineCount} items` : ""}`,
    })));
    unsubs.push(bus.on("payment.received", (p) => {
      const cl = (clients || []).find(c => c.id === p.clientId);
      fireWin(`pay-${p.paymentId}`, {
        kind: "payment", emoji: "💵", title: "Payment received",
        body: `${fmtCurrency(p.amount || 0)}${cl ? ` from ${cl.name}` : ""}`,
      });
    }));
    unsubs.push(bus.on("legal.published", (p) => fireWin(`legal-${p.noticeId}`, {
      kind: "legal", emoji: "⚖️", title: "Legal notice published",
      body: `${p.contactName || ""} · ${fmtCurrency(p.totalAmount || 0)}`,
    })));
    unsubs.push(bus.on("job.complete", (p) => fireWin(`job-${p.jobId}`, {
      kind: "job", emoji: "🎨", title: "Creative job complete",
      body: `${p.clientName || "Client"} · ${p.title || ""}`,
    })));
    unsubs.push(bus.on("story.status", (p) => {
      if (p.newStatus === "Sent to Web") fireWin(`story-${p.storyId}`, {
        kind: "story", emoji: "📰", title: "Story published",
        body: `"${p.title}" is live`,
      });
    }));
    return () => unsubs.forEach(u => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, fireWin]);

  // Path 2: Supabase realtime — cross-tab / cross-user wins.
  // Watches the underlying tables directly so a deal closed by
  // anyone on the team pops on this dashboard within a second.
  useEffect(() => {
    if (!isOnline()) return;
    const channel = supabase.channel("dashboard-v2-realtime");

    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "sales" }, (payload) => {
      const row = payload.new;
      const prev = payload.old;
      // sales has REPLICA IDENTITY FULL, so payload.old is reliable.
      // Only pop on the actual transition INTO Closed.
      if (!row || row.status !== "Closed" || prev?.status === "Closed") return;
      const client = (clients || []).find(c => c.id === row.client_id);
      const pub = (pubs || []).find(p => p.id === row.publication_id);
      fireWin(`sale-${row.id}`, {
        kind: "sale", emoji: "💰", title: "Deal closed",
        body: `${client?.name || "Client"} · ${fmtCurrency(Number(row.amount) || 0)}${pub ? ` for ${pub.name}` : ""}`,
      });
    });
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "sales" }, (payload) => {
      const row = payload.new;
      if (!row || row.status !== "Closed") return;
      const client = (clients || []).find(c => c.id === row.client_id);
      const pub = (pubs || []).find(p => p.id === row.publication_id);
      fireWin(`sale-${row.id}`, {
        kind: "sale", emoji: "💰", title: "Deal closed",
        body: `${client?.name || "Client"} · ${fmtCurrency(Number(row.amount) || 0)}${pub ? ` for ${pub.name}` : ""}`,
      });
    });
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "payments" }, (payload) => {
      const row = payload.new;
      if (!row) return;
      const inv = (invoices || []).find(i => i.id === row.invoice_id);
      const client = inv ? (clients || []).find(c => c.id === inv.clientId) : null;
      fireWin(`pay-${row.id}`, {
        kind: "payment", emoji: "💵", title: "Payment received",
        body: `${fmtCurrency(Number(row.amount) || 0)}${client ? ` from ${client.name}` : ""}`,
      });
    });
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "stories" }, (payload) => {
      const row = payload.new;
      if (!row || row.status !== "Sent to Web") return;
      fireWin(`story-${row.id}`, {
        kind: "story", emoji: "📰", title: "Story published",
        body: `"${row.title}" is live`,
      });
    });

    // Right-hand team notes: prepend live when Cami or Camille writes
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "team_notes" }, (payload) => {
      const row = payload.new;
      if (!row) return;
      const rightHands = (team || []).filter(t => RIGHT_HAND_FIRST_NAMES.has((t.name || "").split(" ")[0]) && t.authId);
      const sender = rightHands.find(t => t.authId === row.from_user);
      if (!sender) return;
      const enriched = { ...row, senderName: sender.name, senderObj: sender };
      setRightHandNotes(prev => {
        if (prev.find(n => n.id === row.id)) return prev;
        return [enriched, ...prev].slice(0, 10);
      });
    });

    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clients, pubs, invoices, team, fireWin]);

  // Live tick — updates every 30s so countdown labels stay fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // ── Right-hand auto-pin ──────────────────────────────────
  // Fetch UNREAD team_notes from Cami / Camille (last 7 days).
  // Surfaced in a banner above the central feed so messages from
  // your right hands never get buried. Click → marks read and the
  // note disappears from the banner.
  useEffect(() => {
    if (!isOnline()) return;
    const rightHands = (team || []).filter(t => RIGHT_HAND_FIRST_NAMES.has((t.name || "").split(" ")[0]) && t.authId);
    if (rightHands.length === 0) { setRightHandNotes([]); return; }
    const ids = rightHands.map(t => t.authId);
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    let cancelled = false;
    supabase.from("team_notes")
      .select("*")
      .in("from_user", ids)
      .gte("created_at", since)
      .or("is_read.is.null,is_read.eq.false")
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

  const markRightHandNoteRead = async (noteId) => {
    setRightHandNotes(prev => prev.filter(n => n.id !== noteId)); // optimistic
    try {
      await supabase.from("team_notes").update({ is_read: true }).eq("id", noteId);
    } catch (e) { /* swallow — banner stays cleared even if write fails */ }
  };

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

  const totalSignals = focusItems.length + deadlineAlerts.length;

  const switchToV1 = () => {
    try { localStorage.setItem("mydash-dashboard-v2", "false"); } catch (e) {}
    const url = new URL(window.location.href);
    url.searchParams.delete("v");
    window.location.href = url.toString();
  };

  return <div style={{ position: "relative", padding: "48px 48px 80px", minHeight: "100%", maxWidth: 1400, margin: "0 auto" }}>
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
      @keyframes activitySlideIn {
        0% { transform: translateX(40px) scale(0.8); opacity: 0; }
        60% { transform: translateX(-4px) scale(1.04); opacity: 1; }
        100% { transform: translateX(0) scale(1); opacity: 1; }
      }
      @keyframes floatDrift {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
      }
      @keyframes tileSplash {
        0% { transform: scale(1); opacity: 0.8; }
        60% { transform: scale(1.12); opacity: 0.4; }
        100% { transform: scale(1.25); opacity: 0; }
      }
    `}</style>

    {/* Ambient pressure glow used to live here as a page-local radial
        gradient. Removed — the global AmbientPressureLayer at the App
        shell level now covers every page. */}

    <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 44 }}>

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

      {/* ── Activity banner (streak + live event feed) ───── */}
      <ActivityBanner activity={activity} streak={streak} allClear={doseWins?.allDeadlinesMet} />

      {/* ── Department tiles ─────────────────────────────── */}
      {/* Floating, urgency-responsive tiles in a 2x2 grid whose
          template columns + rows animate on hover so the hovered
          tile physically pushes its siblings aside via margin,
          not just visual transform. 0=Sales 1=Editorial 2=Production 3=Admin. */}
      <DeptGrid
        departmentPressure={departmentPressure}
        team={team}
        onOpen={(dept) => setDrilledDept(dept)}
        onOpenMember={(m) => setOpenMember(m)}
        onNavigate={onNavigate}
      />

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
            return <div key={n.id} style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "8px 12px",
              background: Z.bg === "#08090D" ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.6)",
              borderRadius: Ri,
              transition: "background 0.15s ease, transform 0.15s ease",
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}>
              <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => n.senderObj && setOpenMember(n.senderObj)}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: ACCENT.amber || "#F59E0B" }}>{(n.senderName || "").split(" ")[0]}</span>
                  <span style={{ fontSize: FS.micro, color: Z.td }}>· {ago}</span>
                  {n.context_type === "task" && <span style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.wa, background: Z.wa + "15", padding: "1px 6px", borderRadius: 8 }}>TASK</span>}
                </div>
                <div style={{ fontSize: FS.sm, color: Z.tx, lineHeight: 1.4 }}>{n.message}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); markRightHandNoteRead(n.id); }} title="Mark read"
                style={{ background: "none", border: "none", color: Z.td, cursor: "pointer", padding: "2px 6px", fontSize: FS.sm, fontWeight: FW.heavy, opacity: 0.6, transition: "opacity 0.15s ease, color 0.15s ease" }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "#10B981"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "0.6"; e.currentTarget.style.color = Z.td; }}>
                ✓
              </button>
            </div>;
          })}
        </div>
      </GlassCard>}

      {/* ── Team presence ────────────────────────────────── */}
      {/* Now the primary surface below the dept tiles. Grouped by
          who needs direction vs. who's flowing, with bigger chips. */}
      {(() => {
        const active = teamStatus.filter(t => t.isActive !== false && !t.isHidden);
        const needsDirection = active.filter(t => t.needsDirection).sort((a, b) => b.overdueCount - a.overdueCount);
        const flowing = active.filter(t => !t.needsDirection);
        return <GlassCard style={{ padding: "32px 36px", marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Team</div>
              <div style={{ fontSize: 24, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginTop: 4, letterSpacing: -0.5 }}>
                {needsDirection.length === 0 ? "Everyone's flowing" : `${needsDirection.length} need direction`}
              </div>
            </div>
            <Btn sm v="ghost" onClick={() => onNavigate?.("team")}>View all →</Btn>
          </div>

          {needsDirection.length > 0 && <div style={{ marginBottom: flowing.length > 0 ? 18 : 0 }}>
            <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: "#F59E0B", textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND, marginBottom: 8 }}>Needs you</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
              {needsDirection.map(t => <TeamChip key={t.id} member={t} onClick={() => setOpenMember(t)} />)}
            </div>
          </div>}

          {flowing.length > 0 && <div>
            {needsDirection.length > 0 && <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: "#10B981", textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND, marginBottom: 8 }}>Flowing</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
              {flowing.map(t => <TeamChip key={t.id} member={t} onClick={() => setOpenMember(t)} />)}
            </div>
          </div>}

          {active.length === 0 && <div style={{ padding: 24, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No team members loaded yet</div>}
        </GlassCard>;
      })()}

    </div>

    {/* Team member messenger slide-in */}
    <TeamMemberPanel
      member={openMember}
      onClose={() => setOpenMember(null)}
      currentUser={currentUser}
      onOpenProfile={props.onOpenMemberProfile}
      onNavigate={onNavigate}
      setIssueDetailId={setIssueDetailId}
      data={{
        sales: _sales,
        clients: _clients,
        issues: _issues,
        stories: _stories,
        invoices: _inv,
        tickets: _tickets,
        legalNotices: _legal,
        creativeJobs: _jobs,
        proposals: props.proposals || [],
        salesToGoal: feed.salesToGoal,
        pubs: _pubs,
      }}
    />

    {/* Signal thread messenger — opens when a focus item is clicked */}
    <SignalThreadPanel signal={openSignal} onClose={() => setOpenSignal(null)} currentUser={currentUser} onNavigate={onNavigate} setIssueDetailId={setIssueDetailId} />

    {/* Department drill-in modal */}
    {drilledDept && <DeptDrillIn
      dept={drilledDept}
      pressure={departmentPressure[drilledDept]}
      meta={DEPT_META[drilledDept]}
      color={heatColor(departmentPressure[drilledDept]?.heat || 0)}
      focusItems={focusItems.filter(f => f.dept === drilledDept)}
      deadlineAlerts={deadlineAlerts.filter(d => (d.type === "ed" ? "editorial" : "production") === drilledDept)}
      team={team}
      onOpenMember={(m) => { setDrilledDept(null); setOpenMember(m); }}
      onClose={() => setDrilledDept(null)}
      onNavigate={onNavigate}
      setIssueDetailId={setIssueDetailId}
    />}

    {/* Morning briefing modal */}
    <Modal open={briefingOpen} onClose={() => setBriefingOpen(false)} title="Morning Briefing" width={820}>
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
// DeptTile — a department tile that breathes, grows with urgency,
// and splashes on click. The hot-heat math drives almost every
// dimension so Sales at heat 90 is visibly bigger than Admin at
// heat 10. Idle float uses a delay derived from the grid index
// so adjacent tiles never sync up.
// ============================================================
// ============================================================
// DeptGrid — 2x2 CSS Grid with each cell holding a centered
// DeptTile. Cells are equal (1fr 1fr) and stable; growth happens
// entirely inside each tile via center-origin transform, so a
// hovered card swells in place without pushing its neighbors.
// Cards have a fixed max-width/max-height so they float in their
// own breathing space inside each cell.
// ============================================================
const DeptGrid = ({ departmentPressure, team, onOpen, onOpenMember, onNavigate }) => {
  return <div style={{
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 80,
    padding: "24px 16px",
    justifyItems: "center",
    alignItems: "center",
  }}>
    {Object.entries(departmentPressure).map(([dept, data], idx) => (
      <DeptTile
        key={dept}
        dept={dept}
        data={data}
        team={team}
        idx={idx}
        onOpen={() => onOpen(dept)}
        onOpenMember={onOpenMember}
        onNavigate={onNavigate}
      />
    ))}
  </div>;
};

// Where each dept's click-through data points live. "primary" is
// the landing page for the dept as a whole; the sub-metric keys
// route the individual clickable pieces of the sub text.
const DEPT_ROUTES = {
  sales: { primary: "sales" },
  editorial: { primary: "editorial", stuck: "editorial", deadlines: "schedule" },
  production: { primary: "creativejobs", adDeadlines: "schedule", overdue: "creativejobs" },
  admin: { primary: "servicedesk", tickets: "servicedesk", invoices: "billing" },
};

const DeptTile = ({ dept, data, team, idx, onOpen, onOpenMember, onNavigate }) => {
  const meta = DEPT_META[dept] || {};
  const Icon = meta.icon;
  const color = heatColor(data.heat);
  const isHot = data.heat >= 75;
  const deptMembers = membersForDept(team, dept, 3);
  const dark = Z.bg === "#08090D";

  // Urgency-responsive sizing via a single scale transform, anchored
  // to the tile's CENTER so the card grows outward in both axes
  // without shifting its position in the grid. Tight range so the
  // at-rest grid feels balanced but heat still reads.
  const t = Math.min(100, Math.max(0, data.heat)) / 100;
  const heatScale = 0.96 + t * 0.12; // 0.96 → 1.08

  const [pressed, setPressed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const handleClick = () => {
    setPressed(true);
    setTimeout(() => {
      onOpen();
      setTimeout(() => setPressed(false), 350);
    }, 180);
  };

  // Interaction scale on top of heat scale. Pure center-origin so
  // the card grows equally in all directions from its own midpoint.
  const interactionScale = pressed ? 1.06 : isHovered ? 1.05 : 1;
  const innerTransform = `scale(${(heatScale * interactionScale).toFixed(3)})`;

  // Three-layer structure so idle float, interaction scale, and
  // GlassCard's own hover don't fight for `transform`:
  //   outer  = floatDrift (translateY)
  //   middle = click + enter/leave + scale transform (center-origin)
  //   inner  = static GlassCard visuals (NO onClick → no stomp)
  // Each card has a hard max-width + max-height so it floats in the
  // middle of its grid cell with real breathing room around it.
  return <div style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: 420,
    animation: `floatDrift ${8 + idx * 0.7}s ease-in-out infinite`,
    animationDelay: `${idx * 0.6}s`,
    willChange: "transform",
  }}>
    <div
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: "100%",
        transform: innerTransform,
        transformOrigin: "center center",
        transition: "transform 0.55s cubic-bezier(0.34, 1.3, 0.64, 1)",
        cursor: "pointer",
      }}>
    <GlassCard
      style={{
        position: "relative",
        width: "100%",
        maxHeight: 260,
        boxSizing: "border-box",
        borderTop: `2px solid ${color}`,
        background: `linear-gradient(180deg, ${color}${isHot ? "22" : "14"} 0%, transparent ${isHot ? 70 : 60}%), ${glass().background}`,
        padding: "20px 24px",
        minHeight: 150,
        transition: "box-shadow 0.35s ease, background 0.8s ease",
        animation: isHot ? "hotPulse 2s ease-in-out infinite" : undefined,
        boxShadow: isHovered
          ? `0 24px 60px ${color}40, 0 0 0 1px ${color}55, inset 0 1px 0 rgba(255,255,255,${dark ? 0.08 : 0.9})`
          : pressed
            ? `0 0 60px ${color}60, 0 0 0 2px ${color}70`
            : `0 4px 18px rgba(0,0,0,${dark ? 0.22 : 0.04})`,
      }}>
      {/* Splash ring — expands outward on press */}
      {pressed && <div aria-hidden style={{
        position: "absolute", inset: 0,
        borderRadius: R,
        border: `2px solid ${color}`,
        animation: "tileSplash 0.55s ease-out forwards",
        pointerEvents: "none",
      }} />}

      {/* Mini-avatar stack — top right. Each avatar is individually
          clickable → opens that member's TeamMemberPanel. */}
      {deptMembers.length > 0 && <DeptAvatarStack members={deptMembers} onOpenMember={onOpenMember} />}

      {/* Dept label / icon — click-through to the dept's primary page */}
      <div
        onClick={(e) => { e.stopPropagation(); onNavigate?.(DEPT_ROUTES[dept]?.primary); }}
        style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, cursor: "pointer", alignSelf: "flex-start" }}
      >
        {Icon && <Icon size={14} color={color} />}
        <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1.2, fontFamily: COND }}>{meta.label}</span>
      </div>

      {/* Big count — click-through to primary page */}
      <div
        onClick={(e) => { e.stopPropagation(); onNavigate?.(DEPT_ROUTES[dept]?.primary); }}
        style={{ fontSize: 36, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, letterSpacing: -1.2, lineHeight: 0.95, cursor: "pointer", display: "inline-block", transition: "color 0.15s ease" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = color; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = Z.tx; }}
      >
        {data.count}
      </div>

      {/* Sub text — individual metrics are their own click-throughs */}
      <div style={{ fontSize: 12, color: Z.tm, marginTop: 6, minHeight: 16, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {dept === "sales" && (
          data.pctToGoal != null
            ? <SubLink onClick={() => onNavigate?.(DEPT_ROUTES.sales.primary)}>{data.pctToGoal}% to goal</SubLink>
            : <SubLink onClick={() => onNavigate?.(DEPT_ROUTES.sales.primary)}>{fmtCurrency(data.pipelineValue || 0)} pipeline</SubLink>
        )}
        {dept === "editorial" && <>
          <SubLink onClick={() => onNavigate?.(DEPT_ROUTES.editorial.stuck)}>{data.stuckStories || 0} stuck</SubLink>
          <span style={{ opacity: 0.5 }}>·</span>
          <SubLink onClick={() => onNavigate?.(DEPT_ROUTES.editorial.deadlines)}>{data.editDeadlines || 0} deadlines</SubLink>
        </>}
        {dept === "production" && <>
          <SubLink onClick={() => onNavigate?.(DEPT_ROUTES.production.adDeadlines)}>{data.adDeadlines || 0} ad deadlines</SubLink>
          <span style={{ opacity: 0.5 }}>·</span>
          <SubLink onClick={() => onNavigate?.(DEPT_ROUTES.production.overdue)}>{data.overdueJobs || 0} overdue</SubLink>
        </>}
        {dept === "admin" && <>
          <SubLink onClick={() => onNavigate?.(DEPT_ROUTES.admin.tickets)}>{data.openTickets || 0} tickets</SubLink>
          <span style={{ opacity: 0.5 }}>·</span>
          <SubLink onClick={() => onNavigate?.(DEPT_ROUTES.admin.invoices)}>{data.overdueInvCount || 0} overdue inv</SubLink>
        </>}
      </div>

      <div style={{ marginTop: 18, height: 7, background: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{
          width: `${data.heat}%`,
          height: "100%",
          background: color,
          boxShadow: isHot ? `0 0 12px ${color}80` : "none",
          transition: "width 0.8s ease, background 1.5s ease, box-shadow 0.8s ease",
        }} />
      </div>

      {/* Heat label — click opens the drill-in (same as empty card area) */}
      <div
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
        style={{ fontSize: FS.micro, color, marginTop: 6, fontWeight: FW.heavy, textTransform: "uppercase", letterSpacing: 0.6, cursor: "pointer", display: "inline-block", alignSelf: "flex-start" }}
      >
        {heatLabel(data.heat)}
      </div>
    </GlassCard>
    </div>
  </div>;
};

// ============================================================
// TeamChip — single team member presence card with right-hand
// star accent for Cami / Camille. Now the primary surface
// below the dept tiles, so bigger and shows real status text.
// ============================================================
const TeamChip = ({ member, onClick }) => {
  const firstName = member.name?.split(" ")[0] || "";
  const isRightHand = RIGHT_HAND_FIRST_NAMES.has(firstName);
  const hue = Math.abs([...(member.name || "")].reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)) % 360;
  const dark = Z.bg === "#08090D";
  const ringBg = dark ? "#0E1018" : "#fff";
  const statusColor = member.needsDirection
    ? (member.overdueCount > 2 ? "#EF4444" : "#F59E0B")
    : "#10B981";
  const statusText = member.needsDirection
    ? `${member.overdueCount} overdue`
    : member.status || "On track";

  return <div onClick={onClick}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "12px 16px 12px 12px",
      background: dark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.6)",
      borderRadius: 14,
      cursor: "pointer",
      border: isRightHand ? `1px solid ${ACCENT.amber || "#F59E0B"}55` : `1px solid ${Z.bd}`,
      boxShadow: isRightHand ? `0 0 0 1px ${ACCENT.amber || "#F59E0B"}25, 0 4px 16px ${ACCENT.amber || "#F59E0B"}12` : "none",
      transition: "transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease",
    }}
    onMouseEnter={e => {
      e.currentTarget.style.transform = "translateY(-2px)";
      e.currentTarget.style.background = dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.85)";
      e.currentTarget.style.boxShadow = isRightHand
        ? `0 0 0 1px ${ACCENT.amber || "#F59E0B"}55, 0 8px 24px ${ACCENT.amber || "#F59E0B"}25`
        : `0 6px 18px ${statusColor}25`;
    }}
    onMouseLeave={e => {
      e.currentTarget.style.transform = "translateY(0)";
      e.currentTarget.style.background = dark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.6)";
      e.currentTarget.style.boxShadow = isRightHand ? `0 0 0 1px ${ACCENT.amber || "#F59E0B"}25, 0 4px 16px ${ACCENT.amber || "#F59E0B"}12` : "none";
    }}>
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div style={{
        width: 44, height: 44, borderRadius: "50%",
        background: `hsl(${hue}, 40%, 38%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, fontWeight: FW.black, color: INV.light || "#fff",
        border: isRightHand ? `2px solid ${ACCENT.amber || "#F59E0B"}` : "none",
      }}>{ini(member.name)}</div>
      <div style={{
        position: "absolute", bottom: -1, right: -1,
        width: 13, height: 13, borderRadius: "50%",
        background: statusColor,
        border: `2px solid ${ringBg}`,
        boxShadow: member.needsDirection && member.overdueCount > 2 ? `0 0 6px ${statusColor}` : "none",
      }} />
    </div>
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, display: "flex", alignItems: "center", gap: 5, fontFamily: COND }}>
        {firstName}
        {isRightHand && <Ic.star size={11} color={ACCENT.amber || "#F59E0B"} />}
      </div>
      <div style={{ fontSize: FS.xs, color: Z.tm, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{member.role}</div>
      <div style={{ fontSize: FS.micro, color: statusColor, fontWeight: FW.heavy, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.4 }}>{statusText}</div>
    </div>
  </div>;
};

// ============================================================
// ActivityBanner — anchor pills on the left (streak, all-clear)
// + a live activity feed flowing in from the right. Newest
// events enter with a slide+fade, push older events leftward,
// and the ring buffer caps at 8 visible items.
// ============================================================
const KIND_COLOR = {
  sale: "#10B981",
  proposal: "#10B981",
  payment: "#10B981",
  legal: "#F59E0B",
  job: "#6366F1",
  story: "#3B82F6",
};

// Compact label for each event kind — short enough to fit in a pill.
const compactBody = (item) => {
  // Strip "for Publication Name" tail if present to keep pills short.
  const body = item.body || "";
  return body.length > 50 ? body.slice(0, 48) + "…" : body;
};

const ActivityBanner = ({ activity, streak, allClear }) => {
  // Render newest-on-the-right. Activity is stored oldest-first, which
  // matches flex rendering order. Anchors (streak + all-clear) sit on
  // the far left as static chips.
  const anchors = [];
  if (streak > 0) anchors.push({ key: "streak", emoji: "🔥", text: `${streak}-day streak`, color: "#F97316" });
  if (allClear) anchors.push({ key: "clear", emoji: "✨", text: "All clear", color: "#10B981" });

  return <div style={{
    display: "flex",
    alignItems: "center",
    gap: 8,
    overflow: "hidden",
    minHeight: 32,
  }}>
    {/* Anchors */}
    {anchors.map(a => (
      <ActivityPill key={a.key} emoji={a.emoji} text={a.text} color={a.color} anchor />
    ))}

    {/* Separator between anchors and stream */}
    {anchors.length > 0 && activity.length > 0 && (
      <div style={{ width: 1, height: 20, background: Z.bd, opacity: 0.5, flexShrink: 0 }} />
    )}

    {/* Live activity stream — each pill animates in on mount */}
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      flex: 1,
      overflow: "hidden",
      minWidth: 0,
    }}>
      {activity.map(item => {
        const c = KIND_COLOR[item.kind] || "#10B981";
        return <ActivityPill
          key={item.id}
          emoji={item.emoji}
          text={compactBody(item)}
          color={c}
          fresh
        />;
      })}
    </div>
  </div>;
};

const ActivityPill = ({ emoji, text, color, fresh, anchor }) => (
  <div style={{
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 14px",
    background: color + "14",
    border: `1px solid ${color}40`,
    borderRadius: 20,
    flexShrink: 0,
    whiteSpace: "nowrap",
    maxWidth: 320,
    overflow: "hidden",
    textOverflow: "ellipsis",
    animation: fresh
      ? "activitySlideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)"
      : anchor
        ? "calmDrift 4s ease-in-out infinite"
        : undefined,
  }}>
    <span style={{ fontSize: 13 }}>{emoji}</span>
    <span style={{
      fontSize: FS.xs,
      fontWeight: FW.bold,
      color,
      fontVariantNumeric: "tabular-nums",
      overflow: "hidden",
      textOverflow: "ellipsis",
    }}>{text}</span>
  </div>
);

const DeptDrillIn = ({ dept, pressure, meta, color, focusItems, deadlineAlerts, team, onOpenMember, onClose, onNavigate, setIssueDetailId }) => {
  if (!pressure || !meta) return null;
  const Icon = meta.icon;

  // Close drill-in then navigate — used by every clickable element
  // inside this modal so the user isn't left with a modal hovering
  // over the destination page.
  const navigateAndClose = (page) => {
    onClose();
    if (page) onNavigate?.(page);
  };

  // Team: dept members first, then admin (Cami/office) on every card
  // except admin itself, so Hayley can look-click-act without hunting.
  // De-duped by id in case any member is mapped to multiple buckets.
  const deptMembers = membersForDept(team, dept);
  const adminMembers = dept === "admin" ? [] : membersForDept(team, "admin");
  const seen = new Set();
  const allMembers = [...deptMembers, ...adminMembers].filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
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
      width: "min(1100px, 100%)", maxHeight: "90vh",
      ...glass(),
      borderRadius: R,
      borderTop: `3px solid ${color}`,
      padding: "32px 36px",
      display: "flex", flexDirection: "column", gap: 22,
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

      {/* Department-specific stats — every card clicks through to
          where that data point actually lives. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        {dept === "sales" && <>
          <DrillStat label="Pipeline" value={fmtCurrency(pressure.pipelineValue || 0)} onClick={() => navigateAndClose("sales")} />
          <DrillStat label="To monthly goal" value={`${pressure.pctToGoal ?? 0}%`} onClick={() => navigateAndClose("sales")} />
        </>}
        {dept === "editorial" && <>
          <DrillStat label="Stories stuck" value={pressure.stuckStories || 0} onClick={() => navigateAndClose("editorial")} />
          <DrillStat label="Editorial deadlines" value={pressure.editDeadlines || 0} onClick={() => navigateAndClose("schedule")} />
        </>}
        {dept === "production" && <>
          <DrillStat label="Ad deadlines" value={pressure.adDeadlines || 0} onClick={() => navigateAndClose("schedule")} />
          <DrillStat label="Overdue jobs" value={pressure.overdueJobs || 0} onClick={() => navigateAndClose("creativejobs")} />
        </>}
        {dept === "admin" && <>
          <DrillStat label="Open tickets" value={pressure.openTickets || 0} onClick={() => navigateAndClose("servicedesk")} />
          <DrillStat label="Overdue invoices" value={pressure.overdueInvCount || 0} onClick={() => navigateAndClose("billing")} />
        </>}
      </div>

      {/* Team — look / click / act. Dept members + admin always visible. */}
      {allMembers.length > 0 && <div>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 12 }}>Team</div>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          {allMembers.map(m => <DrillMember key={m.id} member={m} onOpen={onOpenMember} />)}
        </div>
      </div>}

      {/* Items needing attention — card grid (2 columns) */}
      <div>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 12 }}>Items needing you</div>
        {(focusItems.length === 0 && deadlineAlerts.length === 0)
          ? <div style={{ padding: 36, textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>✨</div>
              <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>Nothing pending</div>
              <div style={{ fontSize: FS.sm, color: Z.td, marginTop: 4 }}>Take the win.</div>
            </div>
          : <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
              {deadlineAlerts.map(d => <DrillCard
                key={d.id}
                accent={d.color}
                icon={Ic.clock}
                kind="DEADLINE"
                title={d.label}
                meta={liveCountdown(d.date)}
                metaColor={d.color}
                onClick={() => { onClose(); if (d.id?.startsWith("ad-") && setIssueDetailId) setIssueDetailId(d.id.replace("ad-", "")); else onNavigate?.(d.type === "ed" ? "editorial" : "schedule"); }}
              />)}
              {focusItems.map(f => <DrillCard
                key={f.id}
                accent={color}
                icon={meta.icon}
                kind={(f.dept || "").toUpperCase()}
                title={f.title}
                meta={f.sub}
                metaColor={Z.tm}
                action={f.action}
                onClick={() => { onClose(); if (f.issueId && setIssueDetailId) setIssueDetailId(f.issueId); else if (f.page) onNavigate?.(f.page); }}
              />)}
            </div>}
      </div>
    </div>
  </div>;
};

// DrillCard — bigger rectangular tile used inside the drill-in modal
// instead of a horizontal row. Title, sub, action button.
const DrillCard = ({ accent, icon: Icon, kind, title, meta, metaColor, action, onClick }) => (
  <div onClick={onClick} style={{
    padding: "16px 18px",
    background: Z.bg === "#08090D" ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.65)",
    border: `1px solid ${Z.bd}`,
    borderTop: `3px solid ${accent}`,
    borderRadius: R,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minHeight: 110,
    transition: "transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease",
  }}
    onMouseEnter={e => {
      e.currentTarget.style.transform = "translateY(-2px)";
      e.currentTarget.style.background = Z.bg === "#08090D" ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.85)";
      e.currentTarget.style.boxShadow = `0 8px 24px ${accent}25`;
    }}
    onMouseLeave={e => {
      e.currentTarget.style.transform = "translateY(0)";
      e.currentTarget.style.background = Z.bg === "#08090D" ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.65)";
      e.currentTarget.style.boxShadow = "none";
    }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {Icon && <Icon size={13} color={accent} />}
      <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: accent, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND }}>{kind}</span>
    </div>
    <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx, fontFamily: COND, lineHeight: 1.35, flex: 1 }}>{title}</div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      {meta && <div style={{ fontSize: FS.xs, color: metaColor, fontWeight: FW.semi, fontVariantNumeric: "tabular-nums" }}>{meta}</div>}
      {action && <Btn sm v="secondary">{action} →</Btn>}
    </div>
  </div>
);

// DeptAvatarStack — overlapping circle avatars in the top-right
// corner of a dept tile. Shows up to 3 team members, with the
// right-hand (Cami / Camille) getting an amber ring.
const DeptAvatarStack = ({ members, onOpenMember }) => {
  const dark = Z.bg === "#08090D";
  const ring = dark ? "#0E1018" : "#fff";
  return <div style={{
    position: "absolute",
    top: 14, right: 14,
    display: "flex",
    flexDirection: "row-reverse",
  }}>
    {members.slice(0, 3).map((m, i) => {
      const firstName = (m.name || "").split(" ")[0];
      const isRightHand = RIGHT_HAND_FIRST_NAMES.has(firstName);
      const hue = Math.abs([...(m.name || "")].reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)) % 360;
      return <div
        key={m.id}
        title={m.name}
        onClick={(e) => { e.stopPropagation(); onOpenMember?.(m); }}
        style={{
          width: 26, height: 26, borderRadius: "50%",
          background: `hsl(${hue}, 40%, 38%)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: FW.black, color: INV.light || "#fff",
          border: `2px solid ${isRightHand ? (ACCENT.amber || "#F59E0B") : ring}`,
          marginLeft: i === 0 ? 0 : -9,
          zIndex: members.length - i,
          boxShadow: isRightHand ? `0 0 0 1px ${ACCENT.amber || "#F59E0B"}40` : "none",
          cursor: onOpenMember ? "pointer" : "default",
          transition: "transform 0.15s ease, z-index 0s 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.15) translateY(-2px)";
          e.currentTarget.style.zIndex = members.length + 10;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1) translateY(0)";
          e.currentTarget.style.zIndex = members.length - i;
        }}
      >{ini(m.name)}</div>;
    })}
  </div>;
};

// SubLink — a tiny clickable chunk inside a dept tile's sub text.
// Underlines on hover to hint at interactivity without cluttering
// the at-rest visual. Stops propagation so the card's main onClick
// (drill-in) doesn't also fire.
const SubLink = ({ onClick, children }) => {
  const [hover, setHover] = useState(false);
  return <span
    onClick={(e) => { e.stopPropagation(); onClick?.(); }}
    onMouseEnter={() => setHover(true)}
    onMouseLeave={() => setHover(false)}
    style={{
      cursor: "pointer",
      color: hover ? Z.tx : Z.tm,
      textDecoration: hover ? "underline" : "none",
      textDecorationColor: Z.bd,
      textUnderlineOffset: 3,
      transition: "color 0.15s ease",
    }}
  >{children}</span>;
};

// DrillMember — small clickable avatar in the drill-in modal's
// team row. Name + initials only, no extra info. Click opens
// the TeamMemberPanel for that member.
const DrillMember = ({ member, onOpen }) => {
  const firstName = (member.name || "").split(" ")[0] || "";
  const isRightHand = RIGHT_HAND_FIRST_NAMES.has(firstName);
  const hue = Math.abs([...(member.name || "")].reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)) % 360;
  const amber = ACCENT.amber || "#F59E0B";
  return <div onClick={() => onOpen?.(member)}
    style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      cursor: "pointer",
      transition: "transform 0.15s ease",
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; }}
    onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}>
    <div style={{
      width: 46, height: 46, borderRadius: "50%",
      background: `hsl(${hue}, 40%, 38%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 14, fontWeight: FW.black, color: INV.light || "#fff",
      border: isRightHand ? `2px solid ${amber}` : "none",
      boxShadow: isRightHand ? `0 0 0 1px ${amber}30, 0 4px 14px ${amber}20` : "0 2px 8px rgba(0,0,0,0.2)",
    }}>{ini(member.name)}</div>
    <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.tx, fontFamily: COND, display: "flex", alignItems: "center", gap: 3 }}>
      {firstName}
      {isRightHand && <Ic.star size={8} color={amber} />}
    </div>
  </div>;
};

const DrillStat = ({ label, value, onClick }) => {
  const [hover, setHover] = useState(false);
  const dark = Z.bg === "#08090D";
  const base = dark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.55)";
  const hot = dark ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.82)";
  return <div
    onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
    onMouseEnter={() => setHover(true)}
    onMouseLeave={() => setHover(false)}
    style={{
      padding: "14px 16px",
      background: hover && onClick ? hot : base,
      borderRadius: Ri,
      border: `1px solid ${hover && onClick ? Z.bd : "transparent"}`,
      cursor: onClick ? "pointer" : "default",
      transform: hover && onClick ? "translateY(-2px)" : "translateY(0)",
      boxShadow: hover && onClick ? "0 6px 16px rgba(0,0,0,0.08)" : "none",
      transition: "transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease",
    }}>
    <div style={{ fontSize: 9, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginTop: 4 }}>{value}</div>
  </div>;
};

// ============================================================
// BriefingContent — visual morning briefing.
// Stat tiles + ranked sections instead of a wall of monospaced
// text. Still has a "Copy as text" escape hatch so the snapshot
// can be pasted into Slack / email / a meeting.
// ============================================================
const STAGE_COLORS = { Draft: "#9CA3AF", "Needs Editing": "#EF4444", Edited: "#3B82F6", Approved: "#10B981", "On Page": "#6366F1" };
const STAGE_ORDER = ["Draft", "Needs Editing", "Edited", "Approved", "On Page"];

const BriefingContent = ({ firstName, feed, stories, subscribers, onClose }) => {
  const { revenueCommand, issueCountdown, focusItems, deadlineAlerts, _stories, _subs, pn } = feed;
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  // Aggregate editorial pipeline counts
  const stageCounts = useMemo(() => {
    const out = {};
    (_stories || stories || []).forEach(s => { out[s.status] = (out[s.status] || 0) + 1; });
    return out;
  }, [_stories, stories]);
  const totalStories = STAGE_ORDER.reduce((s, k) => s + (stageCounts[k] || 0), 0);
  const activeSubs = (_subs || subscribers || []).filter(s => s.status === "active").length;

  const stats = [
    { label: "Revenue MTD", value: fmtCurrency(revenueCommand.adRevMTD), color: "#10B981" },
    { label: "This Month's Issues", value: fmtCurrency(revenueCommand.issueRevThisMonth), color: "#3B82F6" },
    { label: "AR 60+ Days", value: fmtCurrency(revenueCommand.overdueBalance), color: revenueCommand.overdueInvCount > 0 ? "#EF4444" : "#22C55E", sub: revenueCommand.overdueInvCount > 0 ? `${revenueCommand.overdueInvCount} past 60 days` : "All current" },
    { label: "Pipeline", value: fmtCurrency(revenueCommand.pipelineValue), color: "#6366F1", sub: `${revenueCommand.pipelineCount} deals` },
  ];

  // Text version (still copyable)
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
    if (totalStories > 0) {
      l.push("═══ EDITORIAL ═══");
      STAGE_ORDER.forEach(st => { if (stageCounts[st]) l.push(`${st}: ${stageCounts[st]}`); });
      l.push("");
    }
    if (activeSubs > 0) { l.push("═══ SUBSCRIPTIONS ═══"); l.push(`Active: ${activeSubs}`); l.push(""); }
    if (deadlineAlerts.length > 0) {
      l.push("═══ DEADLINES (next 48h) ═══");
      deadlineAlerts.forEach(d => l.push(`• ${d.label} (${d.days <= 0 ? "TODAY" : d.days === 1 ? "TOMORROW" : d.days + "d"})`));
      l.push("");
    }
    if (focusItems.length > 0) {
      l.push("═══ PRIORITIES ═══");
      focusItems.forEach((fi, i) => l.push(`${i + 1}. [${(fi.dept || "").toUpperCase()}] ${fi.title}${fi.sub ? ` — ${fi.sub}` : ""}`));
    }
    if (focusItems.length === 0 && deadlineAlerts.length === 0) l.push("✨ All clear. Take a breath, then prospect or work renewals.");
    return l.join("\n");
  }, [firstName, dateStr, revenueCommand, issueCountdown, focusItems, deadlineAlerts, stageCounts, totalStories, activeSubs, pn]);

  const copy = () => { try { navigator.clipboard?.writeText(briefingText); } catch (e) {} };

  return <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
    {/* Date pill */}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>{dateStr}</div>
        <div style={{ fontSize: 22, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginTop: 4 }}>Good morning, {firstName}</div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Btn sm v="secondary" onClick={copy}>Copy text</Btn>
        <Btn sm onClick={() => { copy(); onClose(); }}>Copy & Close</Btn>
      </div>
    </div>

    {/* Revenue stat tiles */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
      {stats.map(s => (
        <div key={s.label} style={{
          padding: "14px 16px",
          background: Z.bg === "#08090D" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.55)",
          borderRadius: R,
          borderTop: `2px solid ${s.color}`,
        }}>
          <div style={{ fontSize: 9, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>{s.label}</div>
          <div style={{ fontSize: 22, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginTop: 4, letterSpacing: -0.5 }}>{s.value}</div>
          {s.sub && <div style={{ fontSize: FS.micro, color: s.color, fontWeight: FW.bold, marginTop: 2 }}>{s.sub}</div>}
        </div>
      ))}
    </div>

    {/* Publishing */}
    {issueCountdown.length > 0 && <BriefingSection title="Publishing">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {issueCountdown.slice(0, 5).map(iss => {
          const ringColor = iss.pct >= 80 ? "#10B981" : iss.pct >= 50 ? "#F59E0B" : "#EF4444";
          const daysColor = iss.daysOut <= 3 ? "#EF4444" : iss.daysOut <= 7 ? "#F59E0B" : Z.td;
          return <div key={iss.id} style={{
            display: "grid", gridTemplateColumns: "1fr 100px 60px 50px", gap: 12, alignItems: "center",
            padding: "10px 14px",
            background: Z.bg === "#08090D" ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.55)",
            borderRadius: Ri,
          }}>
            <div>
              <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>{pn(iss.pubId)} {iss.label}</div>
              <div style={{ fontSize: FS.xs, color: Z.tm }}>{fmtCurrency(iss.rev)} of {fmtCurrency(iss.goal)}</div>
            </div>
            <div style={{ height: 6, background: Z.bd, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${iss.pct}%`, height: "100%", background: ringColor }} />
            </div>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: ringColor, textAlign: "right" }}>{iss.pct}%</div>
            <div style={{ fontSize: FS.md, fontWeight: FW.black, color: daysColor, textAlign: "right", fontFamily: DISPLAY }}>{iss.daysOut}d</div>
          </div>;
        })}
      </div>
    </BriefingSection>}

    {/* Editorial pipeline */}
    {totalStories > 0 && <BriefingSection title="Editorial Pipeline">
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGE_ORDER.length}, 1fr)`, gap: 8 }}>
        {STAGE_ORDER.map(stage => {
          const count = stageCounts[stage] || 0;
          const c = STAGE_COLORS[stage];
          return <div key={stage} style={{
            padding: "12px 10px",
            background: Z.bg === "#08090D" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.55)",
            borderRadius: R,
            borderTop: `2px solid ${c}`,
            textAlign: "center",
            opacity: count === 0 ? 0.4 : 1,
          }}>
            <div style={{ fontSize: 24, fontWeight: FW.black, color: c, fontFamily: DISPLAY }}>{count}</div>
            <div style={{ fontSize: 9, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: COND, marginTop: 2 }}>{stage}</div>
          </div>;
        })}
      </div>
    </BriefingSection>}

    {/* Deadlines */}
    {deadlineAlerts.length > 0 && <BriefingSection title="Next 48 Hours">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {deadlineAlerts.map(d => <div key={d.id} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 14px",
          background: d.color + "12",
          borderLeft: `3px solid ${d.color}`,
          borderRadius: Ri,
        }}>
          <Ic.clock size={13} color={d.color} />
          <span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, flex: 1, fontFamily: COND }}>{d.label}</span>
          <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: d.color }}>{d.days <= 0 ? "TODAY" : d.days === 1 ? "TOMORROW" : `${d.days}d`}</span>
        </div>)}
      </div>
    </BriefingSection>}

    {/* Priorities */}
    {focusItems.length > 0 && <BriefingSection title={`Priorities (${focusItems.length})`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {focusItems.map((fi, i) => <div key={fi.id} style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "8px 14px",
          background: Z.bg === "#08090D" ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.55)",
          borderRadius: Ri,
        }}>
          <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, fontFamily: DISPLAY, width: 14 }}>{i + 1}.</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{fi.title}</div>
            {fi.sub && <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 2 }}>{fi.sub}</div>}
          </div>
          <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, padding: "2px 8px", background: Z.sa, borderRadius: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{fi.dept}</span>
        </div>)}
      </div>
    </BriefingSection>}

    {/* All-clear empty state */}
    {focusItems.length === 0 && deadlineAlerts.length === 0 && <div style={{
      padding: 32, textAlign: "center",
      background: Z.bg === "#08090D" ? "rgba(16,185,129,0.06)" : "rgba(16,185,129,0.08)",
      border: `1px solid #10B98140`,
      borderRadius: R,
    }}>
      <div style={{ fontSize: 36 }}>✨</div>
      <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: "#10B981", fontFamily: DISPLAY, marginTop: 4 }}>All clear</div>
      <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 4 }}>Take a breath, then prospect or work renewals.</div>
    </div>}
  </div>;
};

const BriefingSection = ({ title, children }) => (
  <div>
    <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>{title}</div>
    {children}
  </div>
);

export default DashboardV2;
