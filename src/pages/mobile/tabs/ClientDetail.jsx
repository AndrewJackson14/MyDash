// ClientDetail — Spec 056 §5.2 mobile client drill-in.
//
// Tabbed: Overview / Activity / Financial / Proposals.
// Action row (5 buttons): Call / Email / Charge / Log / Nav.
// Edit basics via pencil in header; New Opportunity via FAB at the
// bottom of Overview. Charge Card opens the Stripe Elements sheet
// (with iOS card-scan via the system keyboard).
//
// Read directly from the existing tables — no Spec 055 view layer.
import { lazy, Suspense, useMemo, useState } from "react";
import MobileHeader from "../MobileHeader";
import { TOKENS, SURFACE, INK, ACCENT, GOLD, CARD, fmtRelative, fmtMoneyFull, todayISO } from "../mobileTokens";
import { supabase } from "../../../lib/supabase";

const ChargeCardModal = lazy(() => import("../ChargeCardModal"));
const EditClientModal = lazy(() => import("../EditClientModal"));
const NewOpportunityModal = lazy(() => import("../NewOpportunityModal"));

const TABS = ["Overview", "Activity", "Financial", "Proposals"];

export default function ClientDetail({ clientId, appData, currentUser, jurisdiction, navTo }) {
  const clients = appData.clients || [];
  const sales = appData.sales || [];
  const contracts = appData.contracts || [];
  const proposals = appData.proposals || [];
  const invoices = appData.invoices || [];
  const payments = appData.payments || [];
  const pubs = appData.publications || [];

  const client = clients.find(c => c.id === clientId);
  const [tab, setTab] = useState("Overview");
  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeSale, setChargeSale] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [newOppOpen, setNewOppOpen] = useState(false);

  if (!client) {
    return <>
      <MobileHeader title="Client not found" onBack={() => navTo("/mobile/clients")} />
      <div style={{ padding: 24, textAlign: "center", color: TOKENS.muted }}>This client may have been removed or you don't have access.</div>
    </>;
  }

  const primaryContact = (client.contacts || [])[0];
  const callHref = primaryContact?.phone ? `tel:${primaryContact.phone.replace(/[^0-9+]/g, "")}` : null;
  const emailHref = primaryContact?.email ? `mailto:${primaryContact.email}` : null;
  const navHref = client.billing_address || client.billingAddress
    ? `https://maps.apple.com/?q=${encodeURIComponent([client.billing_address || client.billingAddress, client.billing_city || client.billingCity, client.billing_state || client.billingState, client.billing_zip || client.billingZip].filter(Boolean).join(", "))}`
    : null;

  const myOpps = useMemo(() => sales.filter(s => s.clientId === clientId && s.status !== "Closed" && s.status !== "Lost")
    .sort((a, b) => (a.nextActionDate || "9999").localeCompare(b.nextActionDate || "9999")), [sales, clientId]);
  const closedSales = useMemo(() => sales.filter(s => s.clientId === clientId && s.status === "Closed"), [sales, clientId]);
  const totalSpend = closedSales.reduce((sum, s) => sum + (s.amount || 0), 0);
  const lastSale = closedSales.sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
  const myContracts = useMemo(() => contracts.filter(c => c.clientId === clientId), [contracts, clientId]);
  const myProposals = useMemo(() => proposals.filter(p => p.clientId === clientId)
    .sort((a, b) => (b.sentAt || b.date || "").localeCompare(a.sentAt || a.date || "")), [proposals, clientId]);
  const myInvoices = useMemo(() => invoices.filter(i => i.client_id === clientId || i.clientId === clientId), [invoices, clientId]);
  const myPayments = useMemo(() => payments.filter(p => p.client_id === clientId), [payments, clientId]);

  const openBalance = myInvoices.reduce((sum, i) => sum + (Number(i.balance_due) || 0), 0);
  const lifetimePaid = myPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const comms = useMemo(() => (Array.isArray(client.comms) ? client.comms : [])
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || "")), [client.comms]);

  const intel = useMemo(() => {
    const parts = [];
    if (closedSales.length > 0) parts.push(`${closedSales.length} closed deal${closedSales.length === 1 ? "" : "s"} · ${fmtMoneyFull(totalSpend)} lifetime`);
    if (lastSale?.date) parts.push(`Last ad ${fmtRelative(lastSale.date)}`);
    if (myOpps.length > 0) parts.push(`${myOpps.length} open opportunity${myOpps.length === 1 ? "" : "s"}`);
    if (client.status === "Renewal") parts.push("Renewal status — push hard");
    if (client.status === "Lapsed") parts.push("Lapsed — re-engage");
    if (openBalance > 0) parts.push(`${fmtMoneyFull(openBalance)} open balance`);
    return parts.join(" · ");
  }, [closedSales, totalSpend, lastSale, myOpps, client.status, openBalance]);

  // Persist a client edit via the existing useAppData updater path
  // if exposed; otherwise hit Supabase directly.
  const persistClientUpdate = async (changes) => {
    if (typeof appData.updateClient === "function") {
      await appData.updateClient(clientId, changes);
    } else {
      const { error } = await supabase.from("clients").update(changes).eq("id", clientId);
      if (error) throw error;
      if (typeof appData.setClients === "function") {
        appData.setClients(cl => cl.map(c => c.id === clientId ? { ...c, ...changes } : c));
      }
    }
  };

  const persistNewOpp = async (newOpp) => {
    if (typeof appData.insertSale === "function") {
      await appData.insertSale(newOpp);
    } else {
      const { data, error } = await supabase.from("sales").insert(newOpp).select().single();
      if (error) throw error;
      if (typeof appData.setSales === "function") appData.setSales(sl => [...sl, data || newOpp]);
    }
  };

  const editPencil = <button onClick={() => setEditOpen(true)} style={{
    width: 40, height: 40, background: "transparent", border: "none",
    cursor: "pointer", color: ACCENT, fontSize: 18, padding: 0,
  }} aria-label="Edit basics">✎</button>;

  return <>
    <MobileHeader
      title={client.name}
      sub={`${client.status || "—"}${primaryContact?.name ? ` · ${primaryContact.name}` : ""}`}
      onBack={() => navTo("/mobile/clients")}
      right={editPencil}
    />

    <div style={{ padding: "12px 14px 0", display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Action row — 5 thumb-reach buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
        <ActionButton href={callHref} label="Call" icon="📞" disabled={!callHref} />
        <ActionButton href={emailHref} label="Email" icon="✉️" disabled={!emailHref} />
        <ActionButton onClick={() => { setChargeSale(null); setChargeOpen(true); }} label="Charge" icon="💳" highlight />
        <ActionButton onClick={() => alert("Use the + button at the bottom of the screen to log a call/note.")} label="Log" icon="📝" />
        <ActionButton href={navHref} target="_blank" label="Nav" icon="🧭" disabled={!navHref} />
      </div>

      {/* Saved card pill (if any) */}
      {client.card_last4 && <div style={{
        ...CARD, padding: "10px 14px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>Card on file</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: INK, marginTop: 2 }}>
            {(client.card_brand || "card").charAt(0).toUpperCase() + (client.card_brand || "").slice(1)} ····{client.card_last4}
            {client.card_exp && <span style={{ fontWeight: 500, color: TOKENS.muted, marginLeft: 8 }}>exp {client.card_exp}</span>}
          </div>
        </div>
      </div>}

      {/* Intel one-liner */}
      {intel && <div style={{ ...CARD, padding: "12px 14px", background: SURFACE.soft }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>Intel</div>
        <div style={{ fontSize: 14, lineHeight: 1.45, color: INK }}>{intel}</div>
      </div>}
    </div>

    {/* Sticky tab strip */}
    <div style={{
      position: "sticky", top: "calc(env(safe-area-inset-top) + 52px)", zIndex: 9,
      background: SURFACE.alt,
      paddingTop: 8,
    }}>
      <div style={{
        display: "flex", gap: 4, padding: "4px 10px",
        background: SURFACE.elevated, borderTop: `1px solid ${TOKENS.rule}`, borderBottom: `1px solid ${TOKENS.rule}`,
        overflowX: "auto", WebkitOverflowScrolling: "touch",
      }}>
        {TABS.map(t => {
          const isActive = tab === t;
          return <button key={t} onClick={() => setTab(t)} style={{
            padding: "10px 12px", borderRadius: 8,
            border: "none", background: "transparent",
            color: isActive ? ACCENT : TOKENS.muted,
            fontSize: 13, fontWeight: isActive ? 700 : 500,
            cursor: "pointer", whiteSpace: "nowrap",
            borderBottom: isActive ? `2px solid ${ACCENT}` : "2px solid transparent",
          }}>{t}</button>;
        })}
      </div>
    </div>

    <div style={{ padding: "14px 14px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

      {tab === "Overview" && <>
        {myOpps.length > 0 && <Section title={`Open opportunities (${myOpps.length})`}>
          {myOpps.map(s => <OppCard key={s.id} sale={s} onCharge={() => { setChargeSale(s); setChargeOpen(true); }} />)}
        </Section>}

        {comms.slice(0, 3).length > 0 && <Section title="Recent activity" action={comms.length > 3 ? { label: "View all", onClick: () => setTab("Activity") } : undefined}>
          {comms.slice(0, 3).map(c => <CommCard key={c.id} comm={c} />)}
        </Section>}

        <button onClick={() => setNewOppOpen(true)} style={{
          padding: "14px", minHeight: 52,
          background: GOLD, color: "#FFFFFF",
          border: "none", borderRadius: 12,
          fontSize: 15, fontWeight: 700, cursor: "pointer",
          fontFamily: "inherit",
        }}>+ New opportunity</button>

        <a href={`/?desktop=1#client=${clientId}`} target="_blank" rel="noreferrer" style={{
          ...CARD, padding: "12px 14px", textDecoration: "none",
          color: ACCENT, display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>Build a proposal on desktop</div>
          <span style={{ fontSize: 18, fontWeight: 600 }}>↗</span>
        </a>
      </>}

      {tab === "Activity" && <>
        {comms.length === 0 ? (
          <div style={{ ...CARD, textAlign: "center", color: TOKENS.muted, fontSize: 14, padding: "32px 14px" }}>
            No activity logged yet. Tap the <strong>+</strong> at the bottom to log a call.
          </div>
        ) : <Section title={`Activity (${comms.length})`}>
          {comms.map(c => <CommCard key={c.id} comm={c} />)}
        </Section>}
      </>}

      {tab === "Financial" && <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Stat label="Lifetime paid" value={fmtMoneyFull(lifetimePaid)} color={TOKENS.good} />
          <Stat label="Open balance" value={fmtMoneyFull(openBalance)} color={openBalance > 0 ? TOKENS.urgent : TOKENS.muted} />
        </div>

        {myContracts.length > 0 && <Section title={`Contracts (${myContracts.length})`}>
          {myContracts.slice(0, 5).map(c => <div key={c.id} style={{ ...CARD, padding: "10px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{c.name || "Contract"}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{fmtMoneyFull(c.totalValue || 0)}</div>
            </div>
            <div style={{ fontSize: 12, color: TOKENS.muted, marginTop: 2 }}>
              {(c.startDate || "?")} → {(c.endDate || "?")} · {c.status}
            </div>
          </div>)}
        </Section>}

        {myInvoices.length > 0 && <Section title={`Invoices (${myInvoices.length})`}>
          {myInvoices.slice(0, 8).map(i => {
            const balanceDue = Number(i.balance_due) || 0;
            const isPaid = i.status === "paid" || balanceDue === 0;
            return <div key={i.id} style={{ ...CARD, padding: "10px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{i.invoice_number || i.id?.slice(0, 8)}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: isPaid ? TOKENS.good : TOKENS.urgent }}>{fmtMoneyFull(Number(i.total) || 0)}</div>
              </div>
              <div style={{ fontSize: 12, color: TOKENS.muted, marginTop: 2 }}>
                {i.due_date ? `Due ${i.due_date}` : ""} · <span style={{ fontWeight: 600, textTransform: "uppercase" }}>{i.status || "open"}</span>
                {!isPaid && balanceDue > 0 && ` · ${fmtMoneyFull(balanceDue)} due`}
              </div>
            </div>;
          })}
        </Section>}

        {myPayments.length > 0 && <Section title={`Payments (${myPayments.length})`}>
          {myPayments.slice(0, 8).map(p => <div key={p.id} style={{ ...CARD, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{p.method || "Payment"}{p.reference ? ` · ${p.reference}` : ""}</div>
              <div style={{ fontSize: 12, color: TOKENS.muted, marginTop: 2 }}>{p.payment_date}</div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: TOKENS.good }}>{fmtMoneyFull(Number(p.amount) || 0)}</div>
          </div>)}
        </Section>}

        {myInvoices.length === 0 && myContracts.length === 0 && myPayments.length === 0 && <div style={{ ...CARD, textAlign: "center", color: TOKENS.muted, fontSize: 14, padding: "32px 14px" }}>
          Nothing billed yet for this client.
        </div>}
      </>}

      {tab === "Proposals" && <>
        {myProposals.length === 0 ? (
          <div style={{ ...CARD, textAlign: "center", color: TOKENS.muted, fontSize: 14, padding: "24px 14px" }}>
            <div style={{ marginBottom: 12 }}>No proposals yet.</div>
            <a href={`/?desktop=1#client=${clientId}`} target="_blank" rel="noreferrer" style={{
              display: "inline-block", padding: "10px 18px",
              background: ACCENT, color: "#FFFFFF", borderRadius: 8,
              fontWeight: 700, fontSize: 14, textDecoration: "none",
            }}>Build one on desktop ↗</a>
          </div>
        ) : <Section title={`Proposals (${myProposals.length})`} action={{ label: "+ New (desktop)", onClick: () => window.open(`/?desktop=1#client=${clientId}`, "_blank") }}>
          {myProposals.map(p => <ProposalCard key={p.id} proposal={p} />)}
        </Section>}
      </>}

    </div>

    {chargeOpen && <Suspense fallback={null}>
      <ChargeCardModal
        client={client}
        sale={chargeSale}
        onClose={() => { setChargeOpen(false); setChargeSale(null); }}
        onSuccess={() => { /* webhook-driven refresh handles the rest */ }}
      />
    </Suspense>}

    {editOpen && <Suspense fallback={null}>
      <EditClientModal
        client={client}
        onClose={() => setEditOpen(false)}
        onSave={persistClientUpdate}
      />
    </Suspense>}

    {newOppOpen && <Suspense fallback={null}>
      <NewOpportunityModal
        client={client}
        pubs={pubs}
        onClose={() => setNewOppOpen(false)}
        onSave={persistNewOpp}
      />
    </Suspense>}
  </>;
}

// ── Bits ──────────────────────────────────────────────────────
function ActionButton({ href, target, onClick, label, icon, disabled, highlight }) {
  const baseStyle = {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 4, padding: "10px 4px", minHeight: 64,
    background: highlight ? GOLD + "12" : (disabled ? SURFACE.alt : SURFACE.elevated),
    color: highlight ? GOLD : (disabled ? TOKENS.muted : INK),
    border: `1px solid ${highlight ? GOLD + "40" : TOKENS.rule}`, borderRadius: 10,
    fontSize: 11, fontWeight: 700,
    textDecoration: "none", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    fontFamily: "inherit",
  };
  if (disabled || !href) {
    return <button onClick={disabled ? undefined : onClick} disabled={disabled} style={baseStyle}>
      <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
      <span>{label}</span>
    </button>;
  }
  return <a href={href} target={target} style={baseStyle}>
    <span style={{ fontSize: 22, lineHeight: 1 }}>{icon}</span>
    <span>{label}</span>
  </a>;
}

function Section({ title, action, children }) {
  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 4px 6px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: TOKENS.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>{title}</div>
      {action && <button onClick={action.onClick} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: ACCENT, padding: 4 }}>{action.label} ›</button>}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
  </div>;
}

function Stat({ label, value, color }) {
  return <div style={{ ...CARD, padding: "10px 12px" }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: TOKENS.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
  </div>;
}

function OppCard({ sale, onCharge }) {
  return <div style={{ ...CARD, padding: "10px 14px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{sale.name || sale.status}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: GOLD }}>{fmtMoneyFull(sale.amount || 0)}</div>
    </div>
    <div style={{ fontSize: 12, color: TOKENS.muted }}>
      {sale.status} · {sale.nextAction?.label || "No next action"}{sale.nextActionDate ? ` · ${sale.nextActionDate.slice(5)}` : ""}
    </div>
    {(sale.amount || 0) > 0 && <button onClick={onCharge} style={{
      marginTop: 8, width: "100%", padding: "8px 12px", minHeight: 36,
      background: "transparent", color: ACCENT,
      border: `1px solid ${ACCENT}40`, borderRadius: 8,
      fontSize: 13, fontWeight: 600, cursor: "pointer",
      fontFamily: "inherit",
    }}>Charge {fmtMoneyFull(sale.amount || 0)} 💳</button>}
  </div>;
}

function CommCard({ comm }) {
  return <div style={{ ...CARD, padding: "10px 14px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: 0.4 }}>{comm.type || "Note"}</span>
      <span style={{ fontSize: 11, color: TOKENS.muted }}>{fmtRelative(comm.date)}</span>
    </div>
    <div style={{ fontSize: 14, color: INK, lineHeight: 1.4 }}>{comm.note || comm.text || "(no detail)"}</div>
    {comm.author && <div style={{ fontSize: 11, color: TOKENS.muted, marginTop: 4 }}>— {comm.author}</div>}
  </div>;
}

function ProposalCard({ proposal }) {
  const status = proposal.status || "Draft";
  const statusColor = status === "Signed & Converted" ? TOKENS.good
    : status === "Sent" ? ACCENT
    : status === "Cancelled" ? TOKENS.urgent
    : TOKENS.muted;
  return <div style={{ ...CARD, padding: "10px 14px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: INK, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proposal.name || "Proposal"}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: GOLD }}>{fmtMoneyFull(proposal.total || 0)}</div>
    </div>
    <div style={{ fontSize: 12, color: TOKENS.muted, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ color: statusColor, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, fontSize: 10 }}>{status}</span>
      <span>{proposal.sentAt ? `Sent ${fmtRelative(proposal.sentAt)}` : (proposal.date || "")}</span>
    </div>
  </div>;
}
