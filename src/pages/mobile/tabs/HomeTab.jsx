// HomeTab — Spec 056 §3 "Daily Huddle"
//
// Adapted MVP: pulls directly from the existing tables (sales/clients/
// contracts/commission_ledger) without going through Spec 055's
// purpose-built RPCs. Sections render or hide based on data presence.
//
// Sections:
//   - Greeting + date
//   - Revenue strip (MTD closed · weighted pipeline · next payout)
//   - Quick actions (Upload contract, New opportunity)
//   - In review (contract imports awaiting review)
//   - Urgent (renewals expiring within 30d, no proposal yet)
//   - Today (sales whose nextActionDate ≤ today, assigned to me)
//   - Recent activity (last 5 events from activityLog if available)
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import MobileHeader from "../MobileHeader";
import { TOKENS, SURFACE, INK, ACCENT, GOLD, CARD, fmtMoney, fmtMoneyFull, fmtRelative, todayISO } from "../mobileTokens";
import { supabase } from "../../../lib/supabase";

const UploadContractModal = lazy(() => import("../UploadContractModal"));
const ContractReviewModal = lazy(() => import("../ContractReviewModal"));

export default function HomeTab({ appData, currentUser, jurisdiction, navTo }) {
  const today = todayISO();
  const sales = appData.sales || [];
  const clients = appData.clients || [];
  const contracts = appData.contracts || [];
  const ledger = appData.commissionLedger || [];

  const myId = currentUser?.id;
  const myFirstName = currentUser?.name?.split(" ")[0] || "there";

  // ── Contract imports ─────────────────────────────────────
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reviewImport, setReviewImport] = useState(null);
  const [imports, setImports] = useState([]);
  const [importsError, setImportsError] = useState(null);
  useEffect(() => {
    // No gate on currentUser/myId — RLS already filters per-user.
    // Earlier we waited on myId before loading, which silently dropped
    // the queue if currentUser took a beat to resolve from team lookup.
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from("contract_imports")
        .select("id, status, storage_paths, extracted_json, error_message, created_at, updated_at, uploaded_by, notes, client_id")
        .in("status", ["pending", "processing", "extracted", "failed"])
        .order("created_at", { ascending: false })
        .limit(10);
      if (cancelled) return;
      if (error) {
        setImportsError(error.message);
        return;
      }
      setImportsError(null);
      setImports(data || []);
    };
    load();
    // Realtime subscription so the row flips from pending → extracted
    // on its own once the parser finishes. Channel name is stable
    // ("contract_imports_self") rather than per-user — RLS handles
    // who-can-see-what at the data layer, no need to scope here.
    const channel = supabase
      .channel("contract_imports_self")
      .on("postgres_changes", { event: "*", schema: "public", table: "contract_imports" }, load)
      .subscribe();
    const interval = setInterval(load, 30000);  // belt-and-suspenders 30s poll
    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const importsExtracted = imports.filter(i => i.status === "extracted");
  const importsPending = imports.filter(i => i.status === "pending" || i.status === "processing");
  const importsFailed = imports.filter(i => i.status === "failed");

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

      {/* Top-of-page banner: extracted drafts ready for review.
          Sits above the revenue strip so it can't be missed. */}
      {importsExtracted.length > 0 && <button
        onClick={() => setReviewImport(importsExtracted[0])}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 14px", minHeight: 56,
          background: GOLD + "15", color: INK,
          border: `1px solid ${GOLD}50`, borderRadius: 12,
          textAlign: "left", cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <span style={{ fontSize: 22, lineHeight: 1 }}>📄</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>
            {importsExtracted.length} contract{importsExtracted.length === 1 ? "" : "s"} ready to review
          </div>
          <div style={{ fontSize: 12, color: TOKENS.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {importsExtracted.slice(0, 3).map(i => i.extracted_json?.client?.name || "Unknown").join(" · ")}
          </div>
        </div>
        <span style={{ color: GOLD, fontSize: 18, fontWeight: 700 }}>›</span>
      </button>}

      {importsError && <div style={{
        padding: "10px 14px", background: TOKENS.urgent + "12",
        borderRadius: 10, color: TOKENS.urgent, fontSize: 12,
      }}>Imports query: {importsError}</div>}

      {/* Revenue strip — 3 horizontally-scrollable cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        <KpiCard label="MTD Closed" primary={fmtMoney(kpis.closedMTD)} />
        <KpiCard label="Weighted Pipeline" primary={fmtMoney(kpis.weighted)} sub={`${kpis.pipelineCount} open`} />
        <KpiCard label="Pending $" primary={fmtMoney(kpis.pendingPayout)} sub="commission" />
      </div>

      {/* Quick actions — Upload Contract + jump-into-pipeline */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button onClick={() => setUploadOpen(true)} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "14px 12px", minHeight: 56,
          background: ACCENT, color: "#FFFFFF",
          border: "none", borderRadius: 12,
          fontSize: 14, fontWeight: 700, cursor: "pointer",
          fontFamily: "inherit",
        }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>📄</span>
          <span>Upload contract</span>
        </button>
        <button onClick={() => navTo("/mobile/pipeline")} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "14px 12px", minHeight: 56,
          background: SURFACE.elevated, color: INK,
          border: `1px solid ${TOKENS.rule}`, borderRadius: 12,
          fontSize: 14, fontWeight: 700, cursor: "pointer",
          fontFamily: "inherit",
        }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>↳</span>
          <span>Open pipeline</span>
        </button>
      </div>

      {/* In review — extracted contract drafts awaiting confirmation */}
      {importsExtracted.length > 0 && <Section title="In review" count={importsExtracted.length}>
        {importsExtracted.map(imp => {
          const ej = imp.extracted_json || {};
          const cn = ej.client?.name || "Unknown client";
          const total = ej.total_due || (Array.isArray(ej.line_items) ? ej.line_items.reduce((s, li) => s + (Number(li.rate) || 0), 0) : 0);
          return <Row
            key={imp.id}
            left={<DotIcon color={GOLD} />}
            title={cn}
            sub={`${(imp.storage_paths || []).length} photo${(imp.storage_paths || []).length === 1 ? "" : "s"}${total ? ` · ${fmtMoney(total)}` : ""} · ${fmtRelative(imp.updated_at)}`}
            highlight
            onTap={() => setReviewImport(imp)}
          />;
        })}
      </Section>}

      {/* Pending parser */}
      {importsPending.length > 0 && <Section title="Parser working…" count={importsPending.length}>
        {importsPending.map(imp => <div key={imp.id} style={{ ...CARD, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, opacity: 0.7 }}>
          <DotIcon color={ACCENT} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>{(imp.storage_paths || []).length} photo{(imp.storage_paths || []).length === 1 ? "" : "s"} uploaded</div>
            <div style={{ fontSize: 11, color: TOKENS.muted, marginTop: 2 }}>
              {imp.status === "processing" ? "Parsing now…" : "Queued — waiting for the parser"} · {fmtRelative(imp.created_at)}
            </div>
          </div>
        </div>)}
      </Section>}

      {/* Failed imports */}
      {importsFailed.length > 0 && <Section title="Parser problems" count={importsFailed.length}>
        {importsFailed.map(imp => <div key={imp.id} style={{ ...CARD, padding: "10px 14px", borderLeft: `3px solid ${TOKENS.urgent}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: TOKENS.urgent }}>Couldn't parse {(imp.storage_paths || []).length} photo{(imp.storage_paths || []).length === 1 ? "" : "s"}</div>
          <div style={{ fontSize: 12, color: TOKENS.muted, marginTop: 2 }}>{imp.error_message || "Unknown error"}</div>
        </div>)}
      </Section>}

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

    {uploadOpen && <Suspense fallback={null}>
      <UploadContractModal
        currentUser={currentUser}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => { /* realtime sub picks the new row up automatically */ }}
      />
    </Suspense>}

    {reviewImport && <Suspense fallback={null}>
      <ContractReviewModal
        importRow={reviewImport}
        currentUser={currentUser}
        appData={appData}
        onClose={() => setReviewImport(null)}
        onConverted={() => setReviewImport(null)}
      />
    </Suspense>}
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
