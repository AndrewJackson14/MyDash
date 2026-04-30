// ClientDetail — Spec 056 §5.2 mobile client drill-in.
//
// Tabbed: Overview / Activity / Financial / Proposals.
// Action row (5 buttons): Call / Email / Charge / Log / Nav.
// Edit basics via pencil in header; New Opportunity via FAB at the
// bottom of Overview. Charge Card opens the Stripe Elements sheet
// (with iOS card-scan via the system keyboard).
//
// Read directly from the existing tables — no Spec 055 view layer.
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import MobileHeader from "../MobileHeader";
import { Ic } from "../../../components/ui";
import { TOKENS, SURFACE, INK, ACCENT, GOLD, CARD, fmtRelative, fmtMoneyFull, todayISO } from "../mobileTokens";
import { supabase } from "../../../lib/supabase";

const ChargeCardModal = lazy(() => import("../ChargeCardModal"));
const EditClientModal = lazy(() => import("../EditClientModal"));
const NewOpportunityModal = lazy(() => import("../NewOpportunityModal"));
const UploadContractModal = lazy(() => import("../UploadContractModal"));
const MobileProposalWizard = lazy(() => import("../MobileProposalWizard"));

const TABS = ["Overview", "Activity", "Financial", "Proposals"];

export default function ClientDetail({ clientId, appData, currentUser, jurisdiction, navTo }) {
  const clients = appData.clients || [];
  const sales = appData.sales || [];
  const contracts = appData.contracts || [];
  const proposals = appData.proposals || [];
  const invoices = appData.invoices || [];
  const payments = appData.payments || [];
  const pubs = appData.pubs || appData.allPubs || [];

  const client = clients.find(c => c.id === clientId);
  const [tab, setTab] = useState("Overview");
  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeSale, setChargeSale] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [newOppOpen, setNewOppOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);

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
  const myProposals = useMemo(() => proposals.filter(p => p.clientId === clientId || p.client_id === clientId)
    .sort((a, b) => (b.sent_at || b.sentAt || b.date || "").localeCompare(a.sent_at || a.sentAt || a.date || "")), [proposals, clientId]);

  // Reverse-link contract_imports → proposal so the proposal card can
  // surface the photos that produced it. Indexed in DB; cheap query.
  const [importsByProposalId, setImportsByProposalId] = useState({});
  useEffect(() => {
    if (myProposals.length === 0) { setImportsByProposalId({}); return; }
    let cancelled = false;
    (async () => {
      const ids = myProposals.map(p => p.id);
      const { data } = await supabase
        .from("contract_imports")
        .select("id, proposal_id, storage_paths")
        .in("proposal_id", ids);
      if (cancelled) return;
      const map = {};
      for (const r of (data || [])) {
        if (r.proposal_id) map[r.proposal_id] = r;
      }
      setImportsByProposalId(map);
    })();
    return () => { cancelled = true; };
  }, [myProposals]);
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
    // Bumped from 40×40 / 18px glyph to 48×48 / 26px glyph. The
    // header tap target is the only edit affordance from the client
    // page, and at 18px the pencil read as a footnote rather than
    // an action. 48×48 also clears Apple HIG's 44pt minimum with
    // headroom for fat-finger taps.
    width: 48, height: 48, minWidth: 48, minHeight: 48,
    background: SURFACE.alt, border: `1px solid ${TOKENS.rule}`,
    borderRadius: 12,
    cursor: "pointer", color: ACCENT,
    fontSize: 26, fontWeight: 600,
    padding: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
  }} aria-label="Edit client basics" title="Edit client">✎</button>;

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
        <ActionButton href={callHref} label="Call" Icon={Ic.phone} disabled={!callHref} />
        <ActionButton href={emailHref} label="Email" Icon={Ic.mail} disabled={!emailHref} />
        <ActionButton onClick={() => { setChargeSale(null); setChargeOpen(true); }} label="Charge" Icon={Ic.card} highlight />
        <ActionButton onClick={() => alert("Use the + button at the bottom of the screen to log a call/note.")} label="Log" Icon={Ic.edit} />
        <ActionButton href={navHref} target="_blank" label="Nav" Icon={Ic.mapPin} disabled={!navHref} />
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button onClick={() => setUploadOpen(true)} style={{
            padding: "14px 12px", minHeight: 52,
            background: ACCENT, color: "#FFFFFF",
            border: "none", borderRadius: 12,
            fontSize: 14, fontWeight: 700, cursor: "pointer",
            fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}><Ic.up size={18} color="#FFFFFF" /><span>Upload contract</span></button>
          <button onClick={() => setNewOppOpen(true)} style={{
            padding: "14px 12px", minHeight: 52,
            background: GOLD, color: "#FFFFFF",
            border: "none", borderRadius: 12,
            fontSize: 14, fontWeight: 700, cursor: "pointer",
            fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}><Ic.plus size={18} color="#FFFFFF" /><span>Opportunity</span></button>
        </div>

        <button onClick={() => setProposalOpen(true)} style={{
          padding: "14px 16px", minHeight: 56,
          background: ACCENT, color: "#FFFFFF",
          border: "none", borderRadius: 12,
          fontSize: 15, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          fontFamily: "inherit",
        }}>
          <Ic.plus size={18} color="#FFFFFF" />
          <span>Proposal</span>
        </button>
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
        ) : <Section title={`Proposals (${myProposals.length})`} action={{ label: "New (desktop)", onClick: () => window.open(`/?desktop=1#client=${clientId}`, "_blank") }}>
          {myProposals.map(p => <ProposalCard
            key={p.id}
            proposal={p}
            sourceImport={importsByProposalId[p.id]}
            convertProposal={appData?.convertProposal}
            onConverted={(result) => {
              // Optimistic local flip: status pill updates without a refetch.
              if (typeof appData?.setProposals === "function") {
                appData.setProposals(ps => (ps || []).map(x => x.id === p.id ? { ...x, status: "Signed & Converted", converted_at: new Date().toISOString() } : x));
              }
            }}
          />)}
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

    {uploadOpen && <Suspense fallback={null}>
      <UploadContractModal
        currentUser={currentUser}
        prefillClient={client}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => { /* Home tab realtime sub catches the new row + parser fires */ }}
      />
    </Suspense>}

    {proposalOpen && <Suspense fallback={null}>
      <MobileProposalWizard
        mode="new"
        clientId={clientId}
        appData={appData}
        currentUser={currentUser}
        onClose={() => setProposalOpen(false)}
        onSent={() => setProposalOpen(false)}
      />
    </Suspense>}
  </>;
}

// ── Bits ──────────────────────────────────────────────────────
function ActionButton({ href, target, onClick, label, Icon, disabled, highlight }) {
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
  const iconNode = Icon ? <Icon size={22} /> : null;
  if (disabled || !href) {
    return <button onClick={disabled ? undefined : onClick} disabled={disabled} style={baseStyle}>
      {iconNode}
      <span>{label}</span>
    </button>;
  }
  return <a href={href} target={target} style={baseStyle}>
    {iconNode}
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
      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    }}><Ic.card size={14} color={ACCENT} /><span>Charge {fmtMoneyFull(sale.amount || 0)}</span></button>}
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

function ProposalCard({ proposal, sourceImport, convertProposal, onConverted }) {
  const status = proposal.status || "Draft";
  const statusColor = status === "Signed & Converted" ? TOKENS.good
    : status === "Sent" ? ACCENT
    : status === "Cancelled" ? TOKENS.urgent
    : TOKENS.muted;
  const sentAt = proposal.sent_at || proposal.sentAt;
  const [photos, setPhotos] = useState([]);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState(null);

  // Lazily resolve signed URLs for the source contract photos when
  // the proposal card has an attached import. ~10min TTL is plenty —
  // Christie reviews and either converts or moves on quickly.
  useEffect(() => {
    if (!sourceImport?.storage_paths?.length) return;
    let cancelled = false;
    (async () => {
      const urls = [];
      for (const path of sourceImport.storage_paths) {
        const { data } = await supabase.storage.from("contract-imports").createSignedUrl(path, 600);
        if (data?.signedUrl) urls.push(data.signedUrl);
      }
      if (!cancelled) setPhotos(urls);
    })();
    return () => { cancelled = true; };
  }, [sourceImport]);

  const onConvert = async () => {
    if (!convertProposal || converting) return;
    if (!confirm("Mark this proposal as signed and create the contract? This will generate sales orders and the first invoice.")) return;
    setConverting(true);
    setConvertError(null);
    try {
      const result = await convertProposal(proposal.id);
      if (!result?.success) throw new Error(result?.error || "Conversion failed");
      onConverted?.(result);
    } catch (e) {
      setConvertError(String(e?.message ?? e));
    } finally {
      setConverting(false);
    }
  };

  return <div style={{ ...CARD, padding: "10px 14px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: INK, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proposal.name || "Proposal"}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: GOLD }}>{fmtMoneyFull(proposal.total || 0)}</div>
    </div>
    <div style={{ fontSize: 12, color: TOKENS.muted, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ color: statusColor, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, fontSize: 10 }}>{status}</span>
      <span>{sentAt ? `Sent ${fmtRelative(sentAt)}` : (proposal.date || "")}</span>
    </div>

    {/* Source contract photos — only when this proposal came from a paper-contract import */}
    {photos.length > 0 && <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: TOKENS.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>Source contract ({photos.length})</div>
      <div style={{ position: "relative", aspectRatio: "4 / 3", background: SURFACE.alt, borderRadius: 8, overflow: "hidden" }}>
        <img src={photos[photoIdx]} alt={`Source ${photoIdx + 1}`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        {photos.length > 1 && <div style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4, padding: "3px 8px", borderRadius: 999, background: "rgba(0,0,0,0.55)" }}>
          {photos.map((_, i) => <button key={i} onClick={(e) => { e.stopPropagation(); setPhotoIdx(i); }} style={{
            width: 6, height: 6, borderRadius: 3,
            background: i === photoIdx ? "#FFFFFF" : "rgba(255,255,255,0.45)",
            border: "none", cursor: "pointer", padding: 0,
          }} />)}
        </div>}
      </div>
    </div>}

    {convertError && <div style={{ marginTop: 8, padding: "8px 10px", background: TOKENS.urgent + "12", borderRadius: 6, color: TOKENS.urgent, fontSize: 12 }}>{convertError}</div>}

    {/* Mark Signed → Convert to Contract */}
    {status === "Sent" && convertProposal && <button
      onClick={onConvert}
      disabled={converting}
      style={{
        marginTop: 10, width: "100%",
        padding: "10px 14px", minHeight: 40,
        background: converting ? TOKENS.rule : TOKENS.good,
        color: converting ? TOKENS.muted : "#FFFFFF",
        border: "none", borderRadius: 8,
        fontSize: 13, fontWeight: 700, cursor: converting ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      }}
    >{converting ? <span>Creating contract…</span> : <><Ic.checkAll size={16} color="#FFFFFF" /><span>Mark Signed → Convert to Contract</span></>}</button>}

    {status === "Signed & Converted" && <div style={{ marginTop: 8, padding: "6px 10px", background: TOKENS.good + "10", borderRadius: 6, fontSize: 12, color: TOKENS.good, fontWeight: 600, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
      <Ic.check size={14} color={TOKENS.good} /><span>Contract created</span>
    </div>}
  </div>;
}
