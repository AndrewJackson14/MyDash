// MeTab — Spec 056 §7 mobile profile + commission summary.
//
// MVP shape: rep card up top, This Period commission card, This Year
// rolled-up totals, sign-out. No queue UI (offline-first deferred to
// v2), no notification prefs (defer to v2 push), no diagnostics
// triple-tap easter egg.
import { useMemo } from "react";
import MobileHeader from "../MobileHeader";
import { TOKENS, SURFACE, INK, ACCENT, GOLD, CARD, fmtMoneyFull } from "../mobileTokens";

export default function MeTab({ appData, currentUser, signOut, navTo }) {
  const ledger = appData.commissionLedger || [];
  const myId = currentUser?.id;

  const stats = useMemo(() => {
    const mine = ledger.filter(l => l.salesperson_id === myId);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
    const monthStartISO = monthStart.toISOString().slice(0, 10);

    const period = mine.filter(l => (l.earned_at || l.created_at || "").slice(0, 10) >= monthStartISO);
    const ytd = mine.filter(l => (l.earned_at || l.created_at || "").slice(0, 10) >= yearStart);

    const sumAmount = (rows) => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    return {
      periodEarned: sumAmount(period.filter(r => r.status === "earned")),
      periodPending: sumAmount(period.filter(r => r.status === "pending")),
      periodPaid: sumAmount(period.filter(r => r.status === "paid")),
      ytdTotal: sumAmount(ytd),
      ytdPaid: sumAmount(ytd.filter(r => r.status === "paid")),
    };
  }, [ledger, myId]);

  return <>
    <MobileHeader title="Me" />

    <div style={{ padding: "14px 14px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Rep identity card */}
      <div style={{ ...CARD, padding: "16px 14px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 24,
          background: ACCENT, color: "#FFFFFF",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, fontWeight: 700,
        }}>{(currentUser?.name || "?").charAt(0).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: INK }}>{currentUser?.name || "Unknown rep"}</div>
          <div style={{ fontSize: 13, color: TOKENS.muted }}>{currentUser?.role || ""} · {currentUser?.email || ""}</div>
        </div>
      </div>

      {/* This period card */}
      <div style={{ ...CARD, padding: "16px 14px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>This Period (MTD)</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 12 }}>
          <span style={{ fontSize: 32, fontWeight: 800, color: GOLD, letterSpacing: -1 }}>{fmtMoneyFull(stats.periodEarned + stats.periodPending)}</span>
          <span style={{ fontSize: 13, color: TOKENS.muted, fontWeight: 600 }}>earned + pending</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <SubStat label="Earned" value={stats.periodEarned} color={GOLD} />
          <SubStat label="Pending" value={stats.periodPending} color={TOKENS.muted} />
          <SubStat label="Paid" value={stats.periodPaid} color={TOKENS.good} />
        </div>
      </div>

      {/* YTD card */}
      <div style={{ ...CARD, padding: "16px 14px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>This Year</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: INK, letterSpacing: -0.5 }}>{fmtMoneyFull(stats.ytdTotal)}</div>
            <div style={{ fontSize: 12, color: TOKENS.muted, marginTop: 2 }}>total commissioned</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: TOKENS.good }}>{fmtMoneyFull(stats.ytdPaid)}</div>
            <div style={{ fontSize: 12, color: TOKENS.muted, marginTop: 2 }}>paid</div>
          </div>
        </div>
      </div>

      {/* Continue on desktop helper */}
      <a href="/?desktop=1" target="_blank" rel="noreferrer" style={{ ...CARD, padding: "12px 14px", textDecoration: "none", color: ACCENT, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>Continue on desktop</div>
          <div style={{ fontSize: 12, color: TOKENS.muted, marginTop: 2 }}>Open MyDash full version in a new tab</div>
        </div>
        <span style={{ fontSize: 18, fontWeight: 600 }}>↗</span>
      </a>

      {/* Sign out */}
      <button onClick={signOut} style={{
        padding: "14px", minHeight: 52,
        background: "transparent",
        color: TOKENS.urgent,
        border: `1px solid ${TOKENS.rule}`,
        borderRadius: 10,
        fontSize: 15, fontWeight: 600,
        cursor: "pointer",
        marginTop: 8,
      }}>Sign out</button>

      <div style={{ fontSize: 11, color: TOKENS.muted, textAlign: "center", marginTop: 4 }}>
        MyDash Mobile · v1 (MVP)
      </div>
    </div>
  </>;
}

function SubStat({ label, value, color }) {
  return <div style={{ background: SURFACE.alt, borderRadius: 8, padding: "8px 10px" }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: TOKENS.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 700, color, marginTop: 2 }}>{fmtMoneyFull(value)}</div>
  </div>;
}
