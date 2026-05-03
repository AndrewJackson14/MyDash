import { Suspense, lazy } from "react";
import { FS } from "../../../../lib/theme";
import ClientList from "../../ClientList";
import SalesErrorBoundary from "../../../../components/sales/SalesErrorBoundary";

// Heavy sub-views — only mount when needed.
const ClientProfile = lazy(() => import("../../ClientProfile/ClientProfile"));
const ClientSignals = lazy(() => import("../../ClientSignals"));

const SubFallback = () => (
  <div style={{ padding: 40, textAlign: "center", color: "#525E72", fontSize: FS.base }}>Loading…</div>
);

// Clients tab dispatcher — three modes selected by viewClientId/clientView:
//   1. "signals" — opportunity heatmap (default landing)
//   2. "list" — flat client list
//   3. profile — viewClientId present, opens ClientProfile
//
// Wave 2: extracted from SalesCRM monolith. Profile mode passes through a
// thick prop bag because ClientProfile depends on most of the parent's
// state (clients/sales setters, the comm form, navigation callbacks).
export default function ClientsTab({
  viewClientId, clientView,
  jurisdiction, clients, sales, pubs, issues, proposals,
  contracts, invoices, payments, currentUser,
  myPriorities, priorityHelpers,
  navTo, sr, setSr, fPub,
  // Profile-only props
  setClients, setSales, team, commForm, setCommForm,
  goBack, openProposal, setViewPropId, bus, updateClientContact,
  onNavigate, openEditClient, openEmail, openMeeting,
}) {
  if (!viewClientId && clientView === "signals") {
    return (
      <Suspense fallback={<SubFallback />}>
        <ClientSignals
          clients={jurisdiction?.isSalesperson ? jurisdiction.myClients : clients}
          sales={jurisdiction?.isSalesperson ? jurisdiction.mySales : sales}
          pubs={pubs}
          issues={issues}
          proposals={proposals}
          currentUser={currentUser}
          jurisdiction={jurisdiction}
          myPriorities={myPriorities}
          priorityHelpers={priorityHelpers}
          onSelectClient={(cId) => navTo("Clients", cId)}
        />
      </Suspense>
    );
  }

  if (!viewClientId && clientView === "list") {
    return (
      <ClientList
        clients={jurisdiction?.isSalesperson ? jurisdiction.myClients : clients}
        sales={jurisdiction?.isSalesperson ? jurisdiction.mySales : sales}
        pubs={pubs}
        issues={issues}
        proposals={proposals}
        sr={sr}
        setSr={setSr}
        fPub={fPub}
        onSelectClient={(cId) => navTo("Clients", cId)}
      />
    );
  }

  if (viewClientId) {
    return (
      <Suspense fallback={<SubFallback />}>
        <SalesErrorBoundary>
          <ClientProfile
            clientId={viewClientId}
            clients={clients}
            setClients={setClients}
            sales={sales}
            setSales={setSales}
            pubs={pubs}
            issues={issues}
            proposals={proposals}
            contracts={contracts}
            invoices={invoices}
            payments={payments}
            team={team}
            currentUser={currentUser}
            commForm={commForm}
            setCommForm={setCommForm}
            onBack={goBack}
            onNavTo={navTo}
            onNavigate={onNavigate}
            onOpenProposal={openProposal}
            onSetViewPropId={setViewPropId}
            bus={bus}
            updateClientContact={updateClientContact}
            onOpenEditClient={openEditClient}
            onOpenEmail={openEmail}
            onOpenMeeting={openMeeting}
          />
        </SalesErrorBoundary>
      </Suspense>
    );
  }

  return null;
}
