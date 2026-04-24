// Circulation — shell + tab router.
//
// Spec v1.1 §5.1 split: Overview / Subscribers / Drop Locations /
// Routes / Route Instances (new) / Drivers / Messages (new).
// All real UI lives in ./circulation/*. This shell owns the tab state
// and the Overview → Subscribers cross-tab triggers for the printer
// mailing workflow buttons.
import { useState, useEffect, memo } from "react";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { TabRow, TB } from "../components/ui";

import CirculationOverview from "./circulation/CirculationOverview";
import Subscribers         from "./circulation/Subscribers";
import DropLocations       from "./circulation/DropLocations";
import Routes              from "./circulation/Routes";
import RouteInstances      from "./circulation/RouteInstances";
import Drivers             from "./circulation/Drivers";
import DriverMessages      from "./circulation/DriverMessages";

const TABS = [
  "Overview", "Subscribers", "Drop Locations",
  "Routes", "Route Instances", "Drivers", "Messages",
];

const Circulation = (props) => {
  const { isActive } = props;
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({ breadcrumb: [{ label: "Home" }, { label: "Circulation" }], title: "Circulation" });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);

  const [tab, setTab] = useState("Overview");

  // Overview has "Open Export" + "Export" buttons in the printer mailing
  // workflow section. Clicking them switches to the Subscribers tab and
  // opens its Export Mailing List modal. Same flag pattern applies if
  // we ever wire a "Send Renewals" shortcut on Overview.
  const [openExportOnSubs, setOpenExportOnSubs] = useState(false);
  const [openRenewalsOnSubs, setOpenRenewalsOnSubs] = useState(false);

  const handleOverviewExport = () => {
    setOpenExportOnSubs(true);
    setTab("Subscribers");
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <TabRow>
      <TB tabs={TABS} active={tab} onChange={setTab} />
    </TabRow>

    {tab === "Overview" && <CirculationOverview
      pubs={props.pubs}
      subscribers={props.subscribers}
      dropLocationPubs={props.dropLocationPubs}
      mailingLists={props.mailingLists}
      onOpenExport={handleOverviewExport}
    />}

    {tab === "Subscribers" && <Subscribers
      pubs={props.pubs}
      subscribers={props.subscribers}
      setSubscribers={props.setSubscribers}
      subscriptionPayments={props.subscriptionPayments}
      externalOpenExport={openExportOnSubs}
      externalOpenRenewals={openRenewalsOnSubs}
      onExternalConsumed={() => { setOpenExportOnSubs(false); setOpenRenewalsOnSubs(false); }}
    />}

    {tab === "Drop Locations" && <DropLocations
      pubs={props.pubs}
      dropLocations={props.dropLocations}
      setDropLocations={props.setDropLocations}
      dropLocationPubs={props.dropLocationPubs}
      setDropLocationPubs={props.setDropLocationPubs}
    />}

    {tab === "Routes" && <Routes
      pubs={props.pubs}
      dropLocations={props.dropLocations}
      dropLocationPubs={props.dropLocationPubs}
      drivers={props.drivers}
      driverRoutes={props.driverRoutes}
      setDriverRoutes={props.setDriverRoutes}
      routeStops={props.routeStops}
      setRouteStops={props.setRouteStops}
    />}

    {tab === "Route Instances" && <RouteInstances />}

    {tab === "Drivers" && <Drivers
      drivers={props.drivers}
      setDrivers={props.setDrivers}
      driverRoutes={props.driverRoutes}
    />}

    {tab === "Messages" && <DriverMessages />}
  </div>;
};

export default memo(Circulation);
