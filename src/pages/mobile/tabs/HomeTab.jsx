// HomeTab — Spec 056 §3 "Daily Huddle"
//
// Adapted MVP: pulls directly from the existing tables (sales/clients/
// contracts/commission_ledger) without going through Spec 055's
// purpose-built RPCs. Sections render or hide based on data presence.
//
// Sections:
//   - Greeting + date
//   - Revenue strip (MTD closed · weighted pipeline · next payout)
//   - Urgent (renewals expiring within 30d, no proposal yet)
//   - Today (sales whose nextActionDate ≤ today, assigned to me)
//   - Recent activity (last 5 events from activityLog if available)
import { useMemo } from "react";
import MobileHeader from "../MobileHeader";
import { TOKENS, SURFACE, INK, ACCENT, GOLD, CARD, fmtMoney, fmtMoneyFull, fmtRelative, todayISO } from "../mobileTokens";

export default function HomeTab({ appData, currentUser, jurisdiction, navTo }) {
  const today = todayISO();
  const sales = appData.sales || [];
  const clients = appData.clients || [];
  const contracts = appData.contracts || [];
  const ledger = appData.commissionLedger || [];

  const myId = currentUser?.id;
  const myFirstName = currentUser?.name?.split(" ")[0] || "there";

  // ── Revenue strip ────────────────────────────────────────
  const kpis = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStartISO = monthStart.toISOString().slice(0, 10);

    const myClosedMTD = sales.filter(s => s.status === "Closed"
      && s.assignedTo === myId
      && (s.date || "") >= monthStartISO)
      .reduce((sum, s) => sum + (s.amount || 0), 0);

    // Weighted pipeline: probability-by-stage * amount
    const STAGE_WEIGHTS = { Discovery: 0.1, Presentation: 0.3, Proposal: 0.5, Negotiation: 0.8 };
    const myPipeline = sales.filter(s => myId && s.assignedTo === myId && STAGE_WEIGHTS[s.status] != null);
    const weighted = myPipeline.reduce((sum, s) => sum + (s.amount || 0) * STAGE_WEIGHTS[s.status], 0);

    // Pending commission = unpaid ledger entries for me
    const pendingPayout = ledger
      .filter(l => l.salesperson_id === myId && (l.status === "earned" || l.status === "pending"))
      .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

    return { closedMTD: myClosedMTD, weighted, pendingPayout, pipelineCount: myPipeline.length };
  }, [sales, ledger, myId]);

  // ── Urgent: renewals + stuck deals ────────────────────────
  const urgent = useMemo(() => {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 30);
    const horizonISO = horizon.toISOString().slice(0, 10);
    const out = [];
    for (const c of clients) {
      if (!myId || c.repId !== myId) continue;
      if ((c.status === "Renewal" || c.status === "Lapsed")
          && c.contractEndDate
          && c.contractEndDate <= horizonISO) {
        const daysLeft = Math.round((new Date(c.contractEndDate).getTime() - Date.now()) / 86400000);
        out.push({ id: c.id, kind: "renewal", clientName: c.name, daysLeft, status: c.status });
      }
    }
    out.sort((a, b) => a.daysLeft - b.daysLeft);
    return out.slice(0, 3);
  }, [clients, myId]);

  // ── Today: sales with action due today/overdue ────────────
  const todayActions = useMemo(() => {
    return sales.filter(s => myId && s.assignedTo === myId
      && s.nextActionDate
      && s.nextActionDate <= today
      && s.status !== "Closed"
      && s.status !== "Lost")
      .sort((a, b) => (a.nextActionDate || "").localeCompare(b.nextActionDate || ""))
      .slice(0, 6);
  }, [sales, myId, today]);

  // ── Recent activity from activityLog ──────────────────────
  const activity = useMemo(() => {
    return (appData.activityLog || [])
      .filter(a => !myId || !a.salespersonId || a.salespersonId === myId)
      .slice(0, 5);
  }, [appData.activityLog, myId]);

  const cn = (id) => clients.find(c => c.id === id)?.name || "—";

  return <>
    <MobileHeader
      title={`Good morning, ${myFirstName}`}
      sub={new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
    />

    <div style={{ padding: "14px 14px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Revenue strip — 3 horizontally-scrollable cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        <KpiCard label="MTD Closed" primary={fmtMoney(kpis.closedMTD)} />
        <KpiCard label="Weighted Pipeline" primary={fmtMoney(kpis.weighted)} sub={`${kpis.pipelineCount} open`} />
        <KpiCard label="Pending $" primary={fmtMoney(kpis.pendingPayout)} sub="commission" />
      </div>

      {/* Urgent */}
      {urgent.length > 0 && <Section title="Urgent" count={urgent.length} action={{ label: "All renewals", onClick: () => navTo("/mobile/clients?filter=renewal") }}>
        {urgent.map(u => <Row
          key={u.id}
          left={<DotIcon color={u.daysLeft <= 7 ? TOKENS.urgent : TOKENS.warn} />}
          title={u.clientName}
          sub={u.daysLeft >= 0 ? `Ends in ${u.daysLeft} day${u.daysLeft === 1 ? "" : "s"} · ${u.status}` : `Overdue ${Math.abs(u.daysLeft)}d · ${u.status}`}
          onTap={() => navTo(`/mobile/clients/${u.id}`)}
        />)}
      </Section>}

      {/* Today */}
      <Section title="Today" count={todayActions.length} empty="You're clear for today.">
        {todayActions.map(s => {
          const overdue = s.nextActionDate < today;
          return <Row
            key={s.id}
            left={<ActionIcon type={s.nextAction?.type || "follow_up"} />}
            title={cn(s.clientId)}
            sub={`${s.nextAction?.label || "Follow up"}${overdue ? ` · OVERDUE` : ""}`}
            right={s.amount > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: TOKENS.muted }}>{fmtMoney(s.amount)}</span>}
            highlight={overdue}
            onTap={() => navTo(`/mobile/clients/${s.clientId}`)}
          />;
        })}
      </Section>

      {/* Recent activity */}
      {activity.length > 0 && <Section title="Recent activity" count={activity.length}>
        {activity.map(a => <Row
          key={a.id}
          left={<DotIcon color={ACCENT} />}
          title={a.clientName || a.text?.slice(0, 60) || "Activity"}
          sub={`${a.text || ""} · ${fmtRelative(a.created_at || a.createdAt || Date.now())}`}
          onTap={a.clientId ? () => navTo(`/mobile/clients/${a.clientId}`) : undefined}
        />)}
      </Section>}

    </div>
  </>;
}

// ── Components ─────────────────────────────────────────────────
function KpiCard({ label, primary, sub }) {
  return <div style={{ ...CARD, padding: "10px 12px" }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: TOKENS.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 800, color: INK, marginTop: 4, letterSpacing: -0.3 }}>{primary}</div>
    {sub && <div style={{ fontSize: 11, color: TOKENS.muted, marginTop: 1 }}>{sub}</div>}
  </div>;
}

function Section({ title, count, action, empty, children }) {
  const hasChildren = !!children && (Array.isArray(children) ? children.length > 0 : true);
  return <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: INK, textTransform: "uppercase", letterSpacing: 0.4 }}>{title}</span>
        {count > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: TOKENS.muted }}>· {count}</span>}
      </div>
      {action && <button onClick={action.onClick} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: ACCENT, padding: 4 }}>{action.label} ›</button>}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {hasChildren ? children : (empty && <div style={{ ...CARD, textAlign: "center", color: TOKENS.muted, fontSize: 14, padding: "16px 14px" }}>{empty}</div>)}
    </div>
  </div>;
}

function Row({ left, title, sub, right, onTap, highlight }) {
  return <div onClick={onTap} style={{
    ...CARD,
    padding: "12px 14px", minHeight: 56,
    display: "flex", alignItems: "center", gap: 12,
    cursor: onTap ? "pointer" : "default",
    borderLeft: highlight ? `3px solid ${TOKENS.urgent}` : CARD.border,
  }}>
    {left}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
      {sub && <div style={{ fontSize: 13, color: TOKENS.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
    </div>
    {right}
    {onTap && <span style={{ color: TOKENS.muted, fontSize: 18, fontWeight: 600 }}>›</span>}
  </div>;
}

function DotIcon({ color }) {
  return <span style={{ width: 10, height: 10, borderRadius: 5, background: color, flexShrink: 0 }} />;
}

function ActionIcon({ type }) {
  const map = { call: "📞", email: "✉️", meeting: "🗓", proposal: "📄", follow_up: "↻" };
  return <span style={{ fontSize: 18, lineHeight: 1, width: 24, textAlign: "center" }}>{map[type] || "↻"}</span>;
}
