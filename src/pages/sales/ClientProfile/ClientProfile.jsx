import { useEffect, useCallback } from "react";
import { SaveStatusPill } from "../../../components/ui";
import EntityThread from "../../../components/EntityThread";
import { useNav } from "../../../hooks/useNav";
import { useAppData } from "../../../hooks/useAppData";
import { useSaveStatus } from "../../../hooks/useSaveStatus";
import { fmtDate } from "../../../lib/formatters";

import { useClientProfileData } from "./useClientProfileData";
import ViewAsCustomerLink from "./components/ViewAsCustomerLink";
import HeaderCard from "./sections/HeaderCard";
import Alerts from "./sections/Alerts";
import ActionBar from "./sections/ActionBar";
import PrimaryContactCard from "./sections/PrimaryContactCard";
import LeftColumn from "./sections/LeftColumn";
import RightColumn from "./sections/RightColumn";
import FinancialCard from "./sections/FinancialCard";
import EblastsCard from "./sections/EblastsCard";
import PurchaseTimelineCard from "./sections/PurchaseTimelineCard";

// ClientProfile orchestrator. Shells out the data derivation to
// useClientProfileData and the render to eight section components
// under sections/. The remaining body here is just plumbing: the
// save-status pill, mutator callbacks (addComm, updClient, updCt,
// flushCt), and stitching the prop bag together.
//
// Wave 2 — was a 1,453-line monolith with helper components inlined,
// data computations interleaved with JSX, and a sub-modal at the
// bottom. Now: ~150-line orchestrator + 5 helpers + hook + 8 sections.
export default function ClientProfile({
  clientId, clients, setClients, sales, setSales, pubs, issues, proposals, contracts,
  invoices, payments, team, currentUser,
  commForm, setCommForm, onBack, onNavTo, onNavigate, onOpenProposal, onSetViewPropId,
  onOpenEditClient, onOpenEmail, onOpenMeeting,
  bus, updateClientContact,
}) {
  const nav = useNav(onNavigate);
  const appData = useAppData();
  const save = useSaveStatus();

  // Mirrors the SalesCRM pattern (Sales Wave 1) — wraps every async write
  // in save.track so the SaveStatusPill flips through saving / saved /
  // error states. Swallow rejects so a single failure doesn't crash the
  // surrounding handler — the pill exposes retry on click.
  const persist = useCallback(async (factory, retryFactory) => {
    try {
      return await save.track(factory(), {
        retry: retryFactory ? () => save.track(retryFactory()) : undefined,
      });
    } catch (_) { return null; }
  }, [save]);

  // Lazy-load this client's full sales history (closed + active).
  useEffect(() => {
    if (clientId && appData?.loadSalesForClient) appData.loadSalesForClient(clientId);
  }, [clientId, appData]);

  const vc = (clients || []).find(x => x.id === clientId);
  const today = new Date().toISOString().slice(0, 10);
  // Wave 4 Task 4.2 — use the shared fmtDate so every Sales subview
  // renders dates the same way. Local alias keeps the prop signature
  // for sections that historically took a `fmtD` callback.
  const fmtD = fmtDate;
  const pn = id => (pubs || []).find(p => p.id === id)?.name || "—";

  const data = useClientProfileData({
    clientId, vc, clients, sales, pubs, issues, proposals, contracts, invoices, payments,
    today,
  });

  if (!vc || !data) return null;

  // Mutators — kept here because they cross-cut sections (header /
  // alerts / contacts all need them). Optimistic local update for
  // instant UI; appData calls write through to Supabase.
  const addComm = async () => {
    if (!commForm.note.trim()) return;
    const author = commForm.author || currentUser?.name || "Account Manager";
    await persist(() => appData.addComm(vc.id, {
      id: "cm" + Date.now(),
      type: commForm.type,
      author,
      date: today,
      note: commForm.note,
    }));
    setCommForm({ type: "Comment", author: commForm.author, note: "" });
  };
  const updClient = (f, v) => {
    setClients(cl => cl.map(c => c.id === vc.id ? { ...c, [f]: v } : c));
    persist(() => appData.updateClient(vc.id, { [f]: v }));
  };
  const updCt = (i, f, v) => {
    setClients(cl => cl.map(c => c.id === vc.id ? { ...c, contacts: c.contacts.map((ct, j) => j === i ? { ...ct, [f]: v } : ct) } : c));
  };
  const flushCt = (idx, patch) => {
    const ct = (vc.contacts || [])[idx];
    if (ct?.id) persist(() => appData.updateClientContact(vc.id, ct.id, patch));
  };

  const digitalSales = (sales || []).filter(s => s.clientId === clientId && s.digitalProductId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* SaveStatusPill — flips through saving / saved / error as the
          per-field updateClient + addComm + insertClientContact writes
          round-trip the DB (Sales Wave 1). Pill is hidden on idle. */}
      <div style={{ display: "flex", justifyContent: "flex-end", minHeight: 0 }}>
        <SaveStatusPill save={save} />
      </div>

      <HeaderCard
        vc={vc} primaryContact={data.primaryContact}
        clientStatus={data.clientStatus} stColor={data.stColor}
        vcIndustries={data.vcIndustries}
        daysSinceContact={data.daysSinceContact} comms={data.comms}
        pubs={pubs}
        setClients={setClients} persist={persist} appData={appData}
        fmtD={fmtD}
      />

      <Alerts
        vc={vc} clientStatus={data.clientStatus} activeContracts={data.activeContracts}
        setClients={setClients} persist={persist} appData={appData}
        onOpenProposal={onOpenProposal} fmtD={fmtD}
      />

      <ActionBar
        vc={vc} primaryContact={data.primaryContact}
        currentUser={currentUser} today={today}
        persist={persist} appData={appData}
        onOpenEmail={onOpenEmail} onOpenProposal={onOpenProposal} onOpenMeeting={onOpenMeeting}
      />

      <ViewAsCustomerLink clientId={vc.id} clientSlug={vc.slug} />

      <PrimaryContactCard vc={vc} primaryContact={data.primaryContact} onOpenEditClient={onOpenEditClient} />

      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16, alignItems: "start" }}>
        <LeftColumn
          vc={vc}
          closedCS={data.closedCS} activeCS={data.activeCS}
          avgDeal={data.avgDeal} yearsAsClient={data.yearsAsClient}
          lastAdDate={data.lastAdDate} lastContractDate={data.lastContractDate} firstSaleDate={data.firstSaleDate}
          monthlySpend={data.monthlySpend} maxMonthSpend={data.maxMonthSpend} monthNames={data.monthNames}
          peakMonth={data.peakMonth} quietMonth={data.quietMonth}
          hasPrint={data.hasPrint} hasDigital={data.hasDigital} hasSponsored={data.hasSponsored} cS={data.cS}
          revByPub={data.revByPub} maxPubRev={data.maxPubRev}
          surveys={data.surveys} avgScore={data.avgScore}
          appData={appData} persist={persist}
          updClient={updClient} updCt={updCt} flushCt={flushCt}
          onOpenEditClient={onOpenEditClient}
          fmtD={fmtD}
        />
        <RightColumn
          vc={vc}
          activeCS={data.activeCS} closedCS={data.closedCS} comms={data.comms}
          daysSinceContact={data.daysSinceContact} emailLog={data.emailLog}
          clientStatus={data.clientStatus} lastAdDate={data.lastAdDate}
          monthlySpend={data.monthlySpend} monthNames={data.monthNames} peakMonth={data.peakMonth}
          avgDeal={data.avgDeal} peerAvgSpend={data.peerAvgSpend}
          peerTopSpend={data.peerTopSpend} peerTopSpender={data.peerTopSpender}
          vcIndustries={data.vcIndustries} industryPeers={data.industryPeers}
          crossSellPubs={data.crossSellPubs}
          commForm={commForm} setCommForm={setCommForm} addComm={addComm}
          bus={bus} pn={pn} currentUser={currentUser}
          onOpenProposal={onOpenProposal}
        />
      </div>

      <FinancialCard
        clientId={clientId}
        clientInvoices={data.clientInvoices} clientPayments={data.clientPayments}
        currentBalance={data.currentBalance} overdueBalance={data.overdueBalance}
        lifetimeBilled={data.lifetimeBilled} lifetimePaid={data.lifetimePaid}
        clientDso={data.clientDso} lastPayment={data.lastPayment} oldestOpenInvoice={data.oldestOpenInvoice}
        digitalSales={digitalSales}
        clients={clients}
        today={today} fmtD={fmtD}
      />

      {/* Per-client discussion thread */}
      {clientId && (
        <div style={{ marginBottom: 12 }}>
          <EntityThread
            refType="client"
            refId={clientId}
            title={`Client: ${(clients.find(c => c.id === clientId) || {}).name || "Unknown"}`}
            team={team}
            height={320}
          />
        </div>
      )}

      <EblastsCard clientEblasts={data.clientEblasts} pn={pn} />

      <PurchaseTimelineCard
        vc={vc} sales={sales} setSales={setSales}
        timelineYears={data.timelineYears}
        clientProposals={data.clientProposals}
        closedCS={data.closedCS}
        clientContracts={data.clientContracts}
        totalRevenue={data.totalRevenue}
        pn={pn} nav={nav}
        onNavTo={onNavTo} onSetViewPropId={onSetViewPropId}
      />
    </div>
  );
}
