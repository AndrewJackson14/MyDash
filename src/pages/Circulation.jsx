import { useState, memo } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../lib/theme";
import { Ic, Btn, Inp, Sel, TA, Card, SB, TB, Stat, Modal, FilterBar , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, DataTable, ListCard, ListDivider, ListGrid } from "../components/ui";
import { generateRenewalHtml, getRenewalSubject } from "../lib/renewalTemplate";
import { sendGmailEmail } from "../lib/gmail";

// ─── Constants ──────────────────────────────────────────────
const SUB_TYPES = [{ value: "print", label: "Print" }, { value: "digital", label: "Digital" }];
const SUB_STATUSES = [{ value: "active", label: "Active" }, { value: "expired", label: "Expired" }, { value: "cancelled", label: "Cancelled" }, { value: "pending", label: "Pending" }];
const SUB_STATUS_COLORS = { active: { bg: Z.ss, text: Z.su }, expired: { bg: Z.ws, text: Z.wa }, cancelled: { bg: Z.ds, text: Z.da }, pending: { bg: Z.sa, text: Z.tm } };
const LOC_TYPES = ["newsstand", "coffee_shop", "hotel", "business_center", "restaurant", "retail", "other"];
const ROUTE_FREQS = [{ value: "weekly", label: "Weekly" }, { value: "bi_weekly", label: "Bi-Weekly" }, { value: "monthly", label: "Monthly" }, { value: "per_issue", label: "Per Issue" }];

const today = new Date().toISOString().slice(0, 10);
const fmtDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const fmtCurrency = (n) => "$" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const StatusBadge = ({ status, map }) => {
  const c = (map || SUB_STATUS_COLORS)[status] || { bg: Z.sa, text: Z.tm };
  return <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: Ri, fontSize: FS.xs, fontWeight: FW.bold, background: c.bg, color: c.text, whiteSpace: "nowrap", textTransform: "capitalize" }}>{status}</span>;
};

// ─── Module ─────────────────────────────────────────────────
const Circulation = ({ pubs, issues, subscribers, setSubscribers, subscriptions, setSubscriptions, subscriptionPayments, mailingLists, setMailingLists, dropLocations, setDropLocations, dropLocationPubs, setDropLocationPubs, drivers, setDrivers, driverRoutes, setDriverRoutes, routeStops, setRouteStops, bus, team, currentUser }) => {
  const [tab, setTab] = useState("Overview");
  const [sr, setSr] = useState("");
  const [subFilter, setSubFilter] = useState("all");
  const [subType, setSubType] = useState("print");
  const [pubFilter, setPubFilter] = useState("all");
  const [subModal, setSubModal] = useState(false);
  const [locModal, setLocModal] = useState(false);
  const [driverModal, setDriverModal] = useState(false);
  const [routeModal, setRouteModal] = useState(false);
  const [editSub, setEditSub] = useState(null);
  const [editLoc, setEditLoc] = useState(null);
  const [dropPubFilter, setDropPubFilter] = useState([]);
  const [exportModal, setExportModal] = useState(false);
  const [renewalModal, setRenewalModal] = useState(false);
  const [subDetailId, setSubDetailId] = useState(null);

  // Export mailing list state
  const EXPORT_COLUMNS = [
    { key: "firstName", label: "First Name" }, { key: "lastName", label: "Last Name" },
    { key: "addressLine1", label: "Address" }, { key: "addressLine2", label: "Address 2" },
    { key: "city", label: "City" }, { key: "state", label: "State" }, { key: "zip", label: "ZIP" },
    { key: "phone", label: "Phone" }, { key: "email", label: "Email" },
    { key: "publicationId", label: "Publication" }, { key: "type", label: "Type" },
    { key: "status", label: "Status" }, { key: "expiryDate", label: "Expiry" },
    { key: "startDate", label: "Start Date" }, { key: "renewalDate", label: "Renewal Date" },
    { key: "amountPaid", label: "Amount Paid" }, { key: "source", label: "Source" }, { key: "notes", label: "Notes" },
  ];
  const PRINTER_PRESET = ["firstName", "lastName", "addressLine1", "addressLine2", "city", "state", "zip"];
  const [exportCols, setExportCols] = useState(PRINTER_PRESET);
  const [exportPub, setExportPub] = useState("all");
  const [exportStatus, setExportStatus] = useState("active");
  const [exportFormat, setExportFormat] = useState("csv");
  const [exportSort, setExportSort] = useState("lastName");

  // ─── Form state ─────────────────────────────────────────
  const blankSub = { type: "print", status: "active", firstName: "", lastName: "", email: "", phone: "", addressLine1: "", addressLine2: "", city: "", state: "CA", zip: "", publicationId: pubs[0]?.id || "", startDate: today, expiryDate: "", renewalDate: "", amountPaid: 0, source: "", notes: "" };
  const blankLoc = { name: "", locationType: "newsstand", address: "", city: "", state: "CA", zip: "", contactName: "", contactPhone: "", notes: "", isActive: true, pubs: {} };
  const blankDriver = { name: "", phone: "", email: "", flatFee: 0, notes: "" };
  const blankRoute = { driverId: "", name: "", frequency: "weekly", publicationId: pubs[0]?.id || "", notes: "", stops: [] };

  const [subForm, setSubForm] = useState(blankSub);
  const [locForm, setLocForm] = useState(blankLoc);
  const [driverForm, setDriverForm] = useState(blankDriver);
  const [routeForm, setRouteForm] = useState(blankRoute);

  const pn = (pid) => { const n = pubs.find(p => p.id === pid)?.name || ""; return n.replace(/^The /, ""); };
  const pubColor = (pid) => Z.tm;

  // ─── Computed Stats ─────────────────────────────────────
  const subs = subscribers || [];
  const locs = dropLocations || [];
  const locPubs = dropLocationPubs || [];
  const drvs = drivers || [];
  const routes = driverRoutes || [];
  const stops = routeStops || [];

  const activePrint = subs.filter(s => s.type === "print" && s.status === "active");
  const activeDigital = subs.filter(s => s.type === "digital" && s.status === "active");
  const expiringNext30 = subs.filter(s => s.status === "active" && s.renewalDate && s.renewalDate <= new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().slice(0, 10) && s.renewalDate >= today);
  const totalDropCopies = locPubs.reduce((s, lp) => s + (lp.quantity || 0), 0);
  const activeLocCount = locs.filter(l => l.isActive).length;

  // Per-pub subscriber counts
  const pubSubCounts = pubs.map(p => ({
    pub: p,
    print: subs.filter(s => s.publicationId === p.id && s.type === "print" && s.status === "active").length,
    digital: subs.filter(s => s.publicationId === p.id && s.type === "digital" && s.status === "active").length,
    drops: locPubs.filter(lp => lp.publicationId === p.id).reduce((s, lp) => s + (lp.quantity || 0), 0),
  }));

  // ─── CRUD: Subscribers ──────────────────────────────────
  const openSubModal = (sub) => {
    if (sub) {
      setEditSub(sub);
      setSubForm({ ...sub });
    } else {
      setEditSub(null);
      setSubForm({ ...blankSub });
    }
    setSubModal(true);
  };

  const saveSub = () => {
    if (!subForm.firstName || !subForm.lastName) return;
    if (editSub) {
      setSubscribers(prev => (prev || []).map(s => s.id === editSub.id ? { ...s, ...subForm } : s));
    } else {
      setSubscribers(prev => [...(prev || []), { ...subForm, id: "sub-" + Date.now(), createdAt: new Date().toISOString() }]);
    }
    setSubModal(false);
  };

  const cancelSub = (subId) => {
    setSubscribers(prev => (prev || []).map(s => s.id === subId ? { ...s, status: "cancelled" } : s));
  };

  // ─── CRUD: Drop Locations ───────────────────────────────
  const openLocModal = (loc) => {
    if (loc) {
      setEditLoc(loc);
      const pubMap = {};
      locPubs.filter(lp => lp.dropLocationId === loc.id).forEach(lp => { pubMap[lp.publicationId] = lp.quantity; });
      setLocForm({ ...loc, pubs: pubMap });
    } else {
      setEditLoc(null);
      setLocForm({ ...blankLoc });
    }
    setLocModal(true);
  };

  const saveLoc = () => {
    if (!locForm.name || !locForm.address) return;
    const locId = editLoc ? editLoc.id : "loc-" + Date.now();
    if (editLoc) {
      setDropLocations(prev => (prev || []).map(l => l.id === locId ? { ...l, ...locForm, pubs: undefined } : l));
    } else {
      setDropLocations(prev => [...(prev || []), { ...locForm, id: locId, pubs: undefined, createdAt: new Date().toISOString() }]);
    }
    // Update pub quantities
    const newPubs = Object.entries(locForm.pubs || {}).filter(([, q]) => q > 0).map(([pid, qty]) => ({
      id: "lp-" + locId + "-" + pid,
      dropLocationId: locId,
      publicationId: pid,
      quantity: Number(qty) || 0,
    }));
    setDropLocationPubs(prev => [...(prev || []).filter(lp => lp.dropLocationId !== locId), ...newPubs]);
    setLocModal(false);
  };

  // ─── CRUD: Drivers ──────────────────────────────────────
  const saveDriver = () => {
    if (!driverForm.name) return;
    setDrivers(prev => [...(prev || []), { ...driverForm, id: "drv-" + Date.now(), isActive: true, createdAt: new Date().toISOString() }]);
    setDriverModal(false);
    setDriverForm({ ...blankDriver });
  };

  // ─── CRUD: Routes ───────────────────────────────────────
  const saveRoute = () => {
    if (!routeForm.name) return;
    const routeId = "rt-" + Date.now();
    setDriverRoutes(prev => [...(prev || []), { ...routeForm, id: routeId, stops: undefined, isActive: true, createdAt: new Date().toISOString() }]);
    // Save stops
    if (routeForm.stops?.length > 0) {
      const newStops = routeForm.stops.map((locId, i) => ({ id: "rs-" + routeId + "-" + i, routeId, dropLocationId: locId, stopOrder: i }));
      setRouteStops(prev => [...(prev || []), ...newStops]);
    }
    setRouteModal(false);
    setRouteForm({ ...blankRoute });
  };

  // ─── Filtering ──────────────────────────────────────────
  let filteredSubs = subs;
  if (tab === "Subscribers") filteredSubs = filteredSubs.filter(s => subType === "print" ? (s.type === "print" || !s.type) : s.type === "digital");
  if (subFilter !== "all") filteredSubs = filteredSubs.filter(s => s.status === subFilter);
  if (pubFilter !== "all") filteredSubs = filteredSubs.filter(s => s.publicationId === pubFilter);
  if (sr) {
    const q = sr.toLowerCase();
    filteredSubs = filteredSubs.filter(s => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.city?.toLowerCase().includes(q) || s.zip?.includes(q));
  }

  // ─── Render ─────────────────────────────────────────────
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="Circulation">
      {(tab === "Subscribers" || tab === "Drop Locations") && <SB value={sr} onChange={setSr} placeholder={tab === "Subscribers" ? "Search subscribers..." : "Search locations..."} />}
      {tab === "Subscribers" && <Sel value={pubFilter} onChange={e => setPubFilter(e.target.value)} options={[{ value: "all", label: "All Publications" }, ...pubs.map(p => ({ value: p.id, label: pn(p.id) }))]} />}
      {tab === "Subscribers" && <><Btn sm v="secondary" onClick={() => setExportModal(true)}>Export List</Btn><Btn sm v="secondary" onClick={() => setRenewalModal(true)}>Send Renewals</Btn><Btn sm onClick={() => openSubModal(null)}><Ic.plus size={13} /> New Subscriber</Btn></>}
      {tab === "Drop Locations" && <Btn sm onClick={() => openLocModal(null)}><Ic.plus size={13} /> New Location</Btn>}
      {tab === "Routes" && <><Btn sm v="secondary" onClick={() => setDriverModal(true)}><Ic.plus size={13} /> New Driver</Btn><Btn sm onClick={() => setRouteModal(true)}><Ic.plus size={13} /> New Route</Btn></>}
    </PageHeader>

    <TabRow>
      <TB tabs={["Overview", "Subscribers", "Drop Locations", "Routes"]} active={tab} onChange={setTab} />
      {tab === "Subscribers" && <><TabPipe /><TB tabs={["Print", "Digital"]} active={subType === "print" ? "Print" : "Digital"} onChange={v => setSubType(v === "Print" ? "print" : "digital")} /><TabPipe /><TB tabs={["All", ...SUB_STATUSES.map(s => s.label)]} active={subFilter === "all" ? "All" : SUB_STATUSES.find(s => s.value === subFilter)?.label || "All"} onChange={v => setSubFilter(v === "All" ? "all" : SUB_STATUSES.find(s => s.label === v)?.value || "all")} /></>}
    </TabRow>

    {/* ════════ OVERVIEW ════════ */}
    {tab === "Overview" && <>
      {/* Per-publication subscriber stats */}
      {(() => {
        const activePubs = pubs.filter(p => subs.some(s => s.publicationId === p.id && s.status === "active"));
        return <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(activePubs.length + (activeDigital.length > 0 ? 1 : 0), 5)}, 1fr)`, gap: 12 }}>
          {activePubs.map(p => {
            const ct = subs.filter(s => s.publicationId === p.id && s.type === "print" && s.status === "active").length;
            return <GlassStat key={p.id} label={pn(p.id)} value={ct.toLocaleString()} sub="Print subscribers" color={Z.tm} />;
          })}
          {activeDigital.length > 0 && <GlassStat label="Digital (All)" value={activeDigital.length.toLocaleString()} sub="Newsletter subscribers" />}
        </div>;
      })()}

      {/* Renewals due */}
      {(() => {
        const renewalsByPub = pubs.filter(p => subs.some(s => s.publicationId === p.id && s.status === "active")).map(p => ({
          pub: p,
          count: subs.filter(s => s.publicationId === p.id && s.status === "active" && s.renewalDate && s.renewalDate <= new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().slice(0, 10) && s.renewalDate >= today).length,
        }));
        const totalRenewals = renewalsByPub.reduce((s, r) => s + r.count, 0);
        return totalRenewals > 0 ? <GlassCard style={{ borderLeft: `3px solid ${Z.wa}` }}>
          <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, marginBottom: 10 }}>Renewals Due — Next 30 Days</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(renewalsByPub.length, 5)}, 1fr)`, gap: 10 }}>
            {renewalsByPub.map(r => <div key={r.pub.id} style={{ textAlign: "center", padding: 10, background: Z.bg, borderRadius: R }}>
              <div style={{ fontSize: 22, fontWeight: FW.black, color: r.count > 0 ? Z.wa : Z.su, fontFamily: DISPLAY }}>{r.count}</div>
              <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.tx }}>{pn(r.pub.id)}</div>
            </div>)}
          </div>
        </GlassCard> : <GlassCard><div style={{ padding: 10, textAlign: "center", color: Z.su, fontSize: FS.md, fontWeight: FW.bold }}>No renewals due in the next 30 days</div></GlassCard>;
      })()}

      {/* Per-publication breakdown */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Circulation by Publication</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {pubSubCounts.filter(p => p.print + p.digital + p.drops > 0).map(p => {
            const total = p.print + p.drops;
            return <div key={p.pub.id} style={{ display: "grid", gridTemplateColumns: "12px 1fr 90px 90px 90px 90px", gap: 10, alignItems: "center", background: Z.bg, borderRadius: R }}>
              <div style={{ width: 10, height: 10, borderRadius: Ri, background: Z.tm }} />
              <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>{pn(p.pub.id)}</div>
              <div style={{ textAlign: "right" }}><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{p.print}</div><div style={{ fontSize: FS.micro, color: Z.td }}>PRINT</div></div>
              <div style={{ textAlign: "right" }}><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{p.digital}</div><div style={{ fontSize: FS.micro, color: Z.td }}>DIGITAL</div></div>
              <div style={{ textAlign: "right" }}><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{p.drops}</div><div style={{ fontSize: FS.micro, color: Z.td }}>DROPS</div></div>
              <div style={{ textAlign: "right" }}><div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.su }}>{total.toLocaleString()}</div><div style={{ fontSize: FS.micro, color: Z.td }}>TOTAL PRINT</div></div>
            </div>;
          })}
        </div>
      </GlassCard>

      {/* Renewals list */}
      {expiringNext30.length > 0 && <GlassCard>
        <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, marginBottom: 8 }}>Subscribers Expiring Soon</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {expiringNext30.slice(0, 8).map(s => <div key={s.id} style={{ display: "flex", justifyContent: "space-between", background: Z.bg, borderRadius: R, fontSize: FS.base }}>
            <span style={{ fontWeight: FW.semi, color: Z.tx }}>{s.firstName} {s.lastName}</span>
            <span style={{ color: Z.tm }}>{pn(s.publicationId)}</span>
            <span style={{ color: Z.wa, fontWeight: FW.bold }}>Renews {fmtDate(s.renewalDate)}</span>
          </div>)}
        </div>
      </GlassCard>}

      {/* Printer Mailing Workflow (Sec 5.4) */}
      <GlassCard>
        <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, marginBottom: 12 }}>Printer Mailing Workflow</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { step: 1, label: "Filter subscribers", desc: "Select publication and status, choose columns", action: "Open Export", onClick: () => setExportModal(true) },
            { step: 2, label: "Download list", desc: "Export as CSV or Excel for printer", action: "Export", onClick: () => setExportModal(true) },
            { step: 3, label: "Email to printer", desc: "Attach list and send to print partner", action: "Coming Soon", onClick: null },
          ].map(s => (
            <div key={s.step} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: Z.bg, borderRadius: Ri }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: Z.ac + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.sm, fontWeight: FW.black, color: Z.ac, flexShrink: 0 }}>{s.step}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{s.label}</div>
                <div style={{ fontSize: FS.xs, color: Z.td }}>{s.desc}</div>
              </div>
              <Btn sm v="secondary" onClick={s.onClick} disabled={!s.onClick}>{s.action}</Btn>
            </div>
          ))}
        </div>
        {(() => {
          const lastExport = (mailingLists || []).sort((a, b) => (b.exportedAt || "").localeCompare(a.exportedAt || ""))[0];
          return lastExport ? <div style={{ marginTop: 10, fontSize: FS.xs, color: Z.td }}>Last export: {fmtDate(lastExport.exportedAt)} — {lastExport.subscriberCount || "?"} subscribers</div> : null;
        })()}
      </GlassCard>
    </>}

    {/* ════════ SUBSCRIBERS ════════ */}
    {tab === "Subscribers" && <>
      <div style={{ fontSize: FS.sm, color: Z.td }}>{filteredSubs.length} subscriber{filteredSubs.length !== 1 ? "s" : ""}</div>

      <GlassCard style={{ padding: 0, overflow: "hidden" }}>
        <DataTable>
          <thead>
            <tr>
              {["Name", "Publication", "City/Zip", "Start", "Renewal", "Status", ""].map(h =>
                <th key={h} style={{ textAlign: "left", fontWeight: FW.heavy, color: Z.tm, fontSize: FS.xs, textTransform: "uppercase" }}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filteredSubs.length === 0
              ? <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: Z.td, fontSize: FS.base }}>No subscribers found</td></tr>
              : filteredSubs.sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`)).map(s => <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => setSubDetailId(s.id)}>
                <td style={{ padding: "8px 10px" }}>
                  <div style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{s.firstName} {s.lastName}</div>
                  {s.email && <div style={{ fontSize: FS.xs, color: Z.td }}>{s.email}</div>}
                </td>
                <td style={{ padding: "8px 10px" }}><span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: pubColor(s.publicationId), fontFamily: COND }}>{pn(s.publicationId)}</span></td>
                <td style={{ fontSize: FS.sm, color: Z.tm }}>{s.city}{s.city && s.zip ? ", " : ""}{s.zip}</td>
                <td style={{ fontSize: FS.sm, color: Z.tm }}>{fmtDate(s.startDate)}</td>
                <td style={{ fontSize: FS.sm, color: s.renewalDate && s.renewalDate <= today ? Z.da : Z.tm }}>{fmtDate(s.renewalDate)}</td>
                <td style={{ padding: "8px 10px" }}><StatusBadge status={s.status} /></td>
                <td style={{ padding: "8px 10px" }}>
                  {s.status === "active" && <Btn sm v="ghost" onClick={e => { e.stopPropagation(); cancelSub(s.id); }}>Cancel</Btn>}
                </td>
              </tr>)}
          </tbody>
        </DataTable>
      </GlassCard>
    </>}

    {/* ════════ DROP LOCATIONS ════════ */}
    {tab === "Drop Locations" && <>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <GlassStat label="Active Locations" value={activeLocCount} />
        <GlassStat label="Total Drop Copies" value={totalDropCopies.toLocaleString()} />
        <GlassStat label="Cities Covered" value={[...new Set(locs.filter(l => l.isActive).map(l => l.city).filter(Boolean))].length} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {locs.filter(l => {
          if (sr) { const q = sr.toLowerCase(); if (!(l.name.toLowerCase().includes(q) || l.city?.toLowerCase().includes(q) || l.address?.toLowerCase().includes(q))) return false; }
          if (dropPubFilter.length > 0) { const lpIds = locPubs.filter(lp => lp.dropLocationId === l.id).map(lp => lp.publicationId); if (!dropPubFilter.some(pid => lpIds.includes(pid))) return false; }
          return true;
        }).sort((a, b) => a.name.localeCompare(b.name)).map(loc => {
          const lpubs = locPubs.filter(lp => lp.dropLocationId === loc.id);
          const totalQ = lpubs.reduce((s, lp) => s + (lp.quantity || 0), 0);
          return <GlassCard key={loc.id} style={{ padding: 12, opacity: loc.isActive ? 1 : 0.5, cursor: "pointer" }} onClick={() => openLocModal(loc)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 15, fontWeight: FW.heavy, color: Z.tx }}>{loc.name}</div>
                  <span style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", background: Z.sa, borderRadius: Ri }}>{loc.locationType?.replace("_", " ")}</span>
                </div>
                <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 2 }}>{loc.address}{loc.city ? `, ${loc.city}` : ""}{loc.state ? ` ${loc.state}` : ""} {loc.zip}</div>
                {loc.contactName && <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 2 }}>{loc.contactName}{loc.contactPhone ? ` · ${loc.contactPhone}` : ""}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.su }}>{totalQ}</div>
                <div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase" }}>copies</div>
              </div>
            </div>
            {lpubs.length > 0 && <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {lpubs.map(lp => <span key={lp.publicationId} style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.tx, background: Z.sa, borderRadius: Ri }}>{pn(lp.publicationId)} × {lp.quantity}</span>)}
            </div>}
          </GlassCard>;
        })}
        {locs.length === 0 && <GlassCard><div style={{ padding: 16, textAlign: "center", color: Z.td, fontSize: FS.base }}>No drop locations yet. Add your first location above.</div></GlassCard>}
      </div>
    </>}

    {/* ════════ ROUTES ════════ */}
    {tab === "Routes" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <GlassStat label="Active Drivers" value={drvs.filter(d => d.isActive).length} />
        <GlassStat label="Active Routes" value={routes.filter(r => r.isActive).length} />
        <GlassStat label="Weekly Driver Cost" value={fmtCurrency(drvs.filter(d => d.isActive).reduce((s, d) => s + (d.flatFee || 0), 0))} />
      </div>

      {/* Drivers */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Drivers</div>
        {drvs.length === 0
          ? <div style={{ fontSize: FS.base, color: Z.td, padding: "8px 0" }}>No drivers yet</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {drvs.map(d => {
                const dRoutes = routes.filter(r => r.driverId === d.id);
                return <div key={d.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px 1fr", gap: 10, alignItems: "center", background: Z.bg, borderRadius: R }}>
                  <div>
                    <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>{d.name}</div>
                    {d.phone && <div style={{ fontSize: FS.xs, color: Z.td }}>{d.phone}</div>}
                  </div>
                  <div style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.su, textAlign: "right" }}>{fmtCurrency(d.flatFee)}/route</div>
                  <div style={{ fontSize: FS.sm, color: Z.tm, textAlign: "right" }}>{dRoutes.length} route{dRoutes.length !== 1 ? "s" : ""}</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {dRoutes.map(r => <span key={r.id} style={{ fontSize: FS.xs, fontWeight: FW.semi, color: Z.ac, background: Z.as, borderRadius: Ri }}>{r.name}</span>)}
                  </div>
                </div>;
              })}
            </div>}
      </GlassCard>

      {/* Routes */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Routes</div>
        {routes.length === 0
          ? <div style={{ fontSize: FS.base, color: Z.td, padding: "8px 0" }}>No routes yet</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {routes.map(r => {
                const driver = drvs.find(d => d.id === r.driverId);
                const rStops = stops.filter(s => s.routeId === r.id).sort((a, b) => a.stopOrder - b.stopOrder);
                const stopLocs = rStops.map(s => locs.find(l => l.id === s.dropLocationId)).filter(Boolean);
                const totalCopies = rStops.reduce((s, rs) => {
                  const lpubs = locPubs.filter(lp => lp.dropLocationId === rs.dropLocationId);
                  return s + lpubs.reduce((ss, lp) => ss + (lp.quantity || 0), 0);
                }, 0);
                return <GlassCard key={r.id} style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: FW.heavy, color: Z.tx }}>{r.name}</div>
                      <div style={{ fontSize: FS.sm, color: Z.tm }}>{driver?.name || "Unassigned"} · {ROUTE_FREQS.find(f => f.value === r.frequency)?.label || r.frequency}{r.publicationId ? ` · ${pn(r.publicationId)}` : ""}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{stopLocs.length} stops</div>
                      <div style={{ fontSize: FS.sm, color: Z.su }}>{totalCopies} copies</div>
                    </div>
                  </div>
                  {stopLocs.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 8 }}>
                    {stopLocs.map((loc, i) => <div key={loc.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: FS.sm, color: Z.tm }}>
                      <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, background: Z.sa, borderRadius: Ri, minWidth: 20, textAlign: "center" }}>{i + 1}</span>
                      <span style={{ fontWeight: FW.semi, color: Z.tx }}>{loc.name}</span>
                      <span style={{ color: Z.td }}>{loc.city}</span>
                    </div>)}
                  </div>}
                </GlassCard>;
              })}
            </div>}
      </GlassCard>
    </>}

    {/* ════════ SUBSCRIBER MODAL ════════ */}
    <Modal open={subModal} onClose={() => setSubModal(false)} title={editSub ? "Edit Subscriber" : "New Subscriber"} width={560} onSubmit={saveSub}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Sel label="Type" value={subForm.type} onChange={e => setSubForm(f => ({ ...f, type: e.target.value }))} options={SUB_TYPES} />
          <Sel label="Publication" value={subForm.publicationId} onChange={e => setSubForm(f => ({ ...f, publicationId: e.target.value }))} options={pubs.map(p => ({ value: p.id, label: p.name }))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="First Name" value={subForm.firstName} onChange={e => setSubForm(f => ({ ...f, firstName: e.target.value }))} />
          <Inp label="Last Name" value={subForm.lastName} onChange={e => setSubForm(f => ({ ...f, lastName: e.target.value }))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Email" type="email" value={subForm.email} onChange={e => setSubForm(f => ({ ...f, email: e.target.value }))} />
          <Inp label="Phone" value={subForm.phone} onChange={e => setSubForm(f => ({ ...f, phone: e.target.value }))} />
        </div>
        {subForm.type === "print" && <>
          <Inp label="Address Line 1" value={subForm.addressLine1} onChange={e => setSubForm(f => ({ ...f, addressLine1: e.target.value }))} />
          <Inp label="Address Line 2" value={subForm.addressLine2} onChange={e => setSubForm(f => ({ ...f, addressLine2: e.target.value }))} />
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
            <Inp label="City" value={subForm.city} onChange={e => setSubForm(f => ({ ...f, city: e.target.value }))} />
            <Inp label="State" value={subForm.state} onChange={e => setSubForm(f => ({ ...f, state: e.target.value }))} />
            <Inp label="Zip" value={subForm.zip} onChange={e => setSubForm(f => ({ ...f, zip: e.target.value }))} />
          </div>
        </>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Inp label="Start Date" type="date" value={subForm.startDate} onChange={e => setSubForm(f => ({ ...f, startDate: e.target.value }))} />
          <Inp label="Expiry Date" type="date" value={subForm.expiryDate} onChange={e => setSubForm(f => ({ ...f, expiryDate: e.target.value }))} />
          <Inp label="Renewal Date" type="date" value={subForm.renewalDate} onChange={e => setSubForm(f => ({ ...f, renewalDate: e.target.value }))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Amount Paid" type="number" step="0.01" value={subForm.amountPaid || ""} onChange={e => setSubForm(f => ({ ...f, amountPaid: Number(e.target.value) || 0 }))} />
          <Inp label="Source" value={subForm.source} onChange={e => setSubForm(f => ({ ...f, source: e.target.value }))} placeholder="Website, phone, event..." />
        </div>
        <TA label="Notes" value={subForm.notes} onChange={e => setSubForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="secondary" onClick={() => setSubModal(false)}>Cancel</Btn>
          <Btn onClick={saveSub} disabled={!subForm.firstName || !subForm.lastName}>{editSub ? "Save Changes" : "Add Subscriber"}</Btn>
        </div>
      </div>
    </Modal>

    {/* ════════ DROP LOCATION MODAL ════════ */}
    <Modal open={locModal} onClose={() => setLocModal(false)} title={editLoc ? "Edit Location" : "New Drop Location"} width={560} onSubmit={saveLoc}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <Inp label="Location Name" value={locForm.name} onChange={e => setLocForm(f => ({ ...f, name: e.target.value }))} placeholder="Coffee Bean & Tea Leaf" />
          <Sel label="Type" value={locForm.locationType} onChange={e => setLocForm(f => ({ ...f, locationType: e.target.value }))} options={LOC_TYPES.map(t => ({ value: t, label: t.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase()) }))} />
        </div>
        <Inp label="Address" value={locForm.address} onChange={e => setLocForm(f => ({ ...f, address: e.target.value }))} />
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
          <Inp label="City" value={locForm.city} onChange={e => setLocForm(f => ({ ...f, city: e.target.value }))} />
          <Inp label="State" value={locForm.state} onChange={e => setLocForm(f => ({ ...f, state: e.target.value }))} />
          <Inp label="Zip" value={locForm.zip} onChange={e => setLocForm(f => ({ ...f, zip: e.target.value }))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Contact Name" value={locForm.contactName} onChange={e => setLocForm(f => ({ ...f, contactName: e.target.value }))} />
          <Inp label="Contact Phone" value={locForm.contactPhone} onChange={e => setLocForm(f => ({ ...f, contactPhone: e.target.value }))} />
        </div>

        {/* Publication quantities */}
        <div>
          <label style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Copies per Publication</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            {pubs.map(p => <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: Ri, background: Z.tm }} />
              <span style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx, flex: 1 }}>{p.name}</span>
              <input type="number" min="0" value={locForm.pubs?.[p.id] || ""} onChange={e => setLocForm(f => ({ ...f, pubs: { ...f.pubs, [p.id]: Number(e.target.value) || 0 } }))} placeholder="0" style={{ width: 70, background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, color: Z.tx, fontSize: FS.base, textAlign: "right", outline: "none" }} />
            </div>)}
          </div>
        </div>

        <TA label="Notes" value={locForm.notes} onChange={e => setLocForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="secondary" onClick={() => setLocModal(false)}>Cancel</Btn>
          <Btn onClick={saveLoc} disabled={!locForm.name || !locForm.address}>{editLoc ? "Save Changes" : "Add Location"}</Btn>
        </div>
      </div>
    </Modal>

    {/* ════════ DRIVER MODAL ════════ */}
    <Modal open={driverModal} onClose={() => setDriverModal(false)} title="New Driver" width={420} onSubmit={saveDriver}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Inp label="Name" value={driverForm.name} onChange={e => setDriverForm(f => ({ ...f, name: e.target.value }))} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Phone" value={driverForm.phone} onChange={e => setDriverForm(f => ({ ...f, phone: e.target.value }))} />
          <Inp label="Flat Fee per Route" type="number" step="0.01" value={driverForm.flatFee || ""} onChange={e => setDriverForm(f => ({ ...f, flatFee: Number(e.target.value) || 0 }))} />
        </div>
        <Inp label="Email" type="email" value={driverForm.email} onChange={e => setDriverForm(f => ({ ...f, email: e.target.value }))} />
        <TA label="Notes" value={driverForm.notes} onChange={e => setDriverForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="secondary" onClick={() => setDriverModal(false)}>Cancel</Btn>
          <Btn onClick={saveDriver} disabled={!driverForm.name}>Add Driver</Btn>
        </div>
      </div>
    </Modal>

    {/* ════════ ROUTE MODAL ════════ */}
    <Modal open={routeModal} onClose={() => setRouteModal(false)} title="New Route" width={520} onSubmit={saveRoute}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Inp label="Route Name" value={routeForm.name} onChange={e => setRouteForm(f => ({ ...f, name: e.target.value }))} placeholder="Paso Robles Downtown" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Sel label="Driver" value={routeForm.driverId} onChange={e => setRouteForm(f => ({ ...f, driverId: e.target.value }))} options={[{ value: "", label: "Select driver..." }, ...drvs.map(d => ({ value: d.id, label: d.name }))]} />
          <Sel label="Frequency" value={routeForm.frequency} onChange={e => setRouteForm(f => ({ ...f, frequency: e.target.value }))} options={ROUTE_FREQS} />
        </div>
        <Sel label="Publication" value={routeForm.publicationId} onChange={e => setRouteForm(f => ({ ...f, publicationId: e.target.value }))} options={[{ value: "", label: "All publications" }, ...pubs.map(p => ({ value: p.id, label: p.name }))]} />

        {/* Stop selection */}
        <div>
          <label style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Stops (select locations in order)</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, maxHeight: 200, overflowY: "auto" }}>
            {locs.filter(l => l.isActive).map(loc => {
              const idx = routeForm.stops?.indexOf(loc.id);
              const selected = idx >= 0;
              return <div key={loc.id} onClick={() => {
                setRouteForm(f => {
                  const s = [...(f.stops || [])];
                  if (selected) s.splice(idx, 1);
                  else s.push(loc.id);
                  return { ...f, stops: s };
                });
              }} style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: R, cursor: "pointer", background: selected ? Z.as : Z.bg, border: `1px solid ${selected ? Z.ac : Z.bd}` }}>
                {selected && <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.ac, background: Z.ss, borderRadius: Ri, minWidth: 18, textAlign: "center" }}>{idx + 1}</span>}
                <span style={{ fontSize: FS.base, fontWeight: selected ? 700 : 400, color: Z.tx }}>{loc.name}</span>
                <span style={{ fontSize: FS.xs, color: Z.td }}>{loc.city}</span>
              </div>;
            })}
          </div>
        </div>

        <TA label="Notes" value={routeForm.notes} onChange={e => setRouteForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="secondary" onClick={() => setRouteModal(false)}>Cancel</Btn>
          <Btn onClick={saveRoute} disabled={!routeForm.name}>Create Route</Btn>
        </div>
      </div>
    </Modal>

    {/* ═══ EXPORT MAILING LIST MODAL (Sec 5.5) ═══ */}
    <Modal open={exportModal} onClose={() => setExportModal(false)} title="Export Mailing List" width={640}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Filters */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Publication</div>
            <Sel value={exportPub} onChange={e => setExportPub(e.target.value)} options={[{ value: "all", label: "All Publications" }, ...pubs.map(p => ({ value: p.id, label: p.name }))]} />
          </div>
          <div>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Status</div>
            <Sel value={exportStatus} onChange={e => setExportStatus(e.target.value)} options={[{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "expired", label: "Expired" }]} />
          </div>
        </div>
        {/* Column picker */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Columns</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setExportCols(EXPORT_COLUMNS.map(c => c.key))} style={{ fontSize: FS.xs, color: Z.ac, background: "none", border: "none", cursor: "pointer", fontWeight: FW.bold }}>Select All</button>
              <button onClick={() => setExportCols([])} style={{ fontSize: FS.xs, color: Z.tm, background: "none", border: "none", cursor: "pointer", fontWeight: FW.bold }}>Clear</button>
              <button onClick={() => setExportCols([...PRINTER_PRESET])} style={{ fontSize: FS.xs, color: Z.go, background: "none", border: "none", cursor: "pointer", fontWeight: FW.bold }}>Printer Preset</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            {EXPORT_COLUMNS.map(col => (
              <label key={col.key} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: Ri, background: exportCols.includes(col.key) ? Z.as : Z.bg, cursor: "pointer", fontSize: FS.sm }}>
                <input type="checkbox" checked={exportCols.includes(col.key)} onChange={() => setExportCols(prev => prev.includes(col.key) ? prev.filter(c => c !== col.key) : [...prev, col.key])} />
                <span style={{ color: Z.tx }}>{col.label}</span>
              </label>
            ))}
          </div>
        </div>
        {/* Format + Sort */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Format</div>
            <div style={{ display: "flex", gap: 6 }}>
              {["csv", "xlsx"].map(f => <Btn key={f} sm v={exportFormat === f ? "primary" : "secondary"} onClick={() => setExportFormat(f)}>{f.toUpperCase()}</Btn>)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Sort By</div>
            <Sel value={exportSort} onChange={e => setExportSort(e.target.value)} options={[
              { value: "lastName", label: "Last Name" }, { value: "zip", label: "ZIP Code" },
              { value: "city", label: "City" }, { value: "expiryDate", label: "Expiry Date" },
              { value: "publicationId", label: "Publication" },
            ]} />
          </div>
        </div>
        {/* Preview */}
        {(() => {
          let rows = subs.filter(s => s.type === "print");
          if (exportPub !== "all") rows = rows.filter(s => s.publicationId === exportPub);
          if (exportStatus !== "all") rows = rows.filter(s => s.status === exportStatus);
          return <div style={{ padding: "8px 12px", background: Z.bg, borderRadius: Ri, fontSize: FS.sm, color: Z.tm }}>
            {rows.length} subscriber{rows.length !== 1 ? "s" : ""} · {exportCols.length} column{exportCols.length !== 1 ? "s" : ""} · {exportFormat.toUpperCase()}
          </div>;
        })()}
        {/* Download */}
        <Btn onClick={() => {
          let rows = subs.filter(s => s.type === "print");
          if (exportPub !== "all") rows = rows.filter(s => s.publicationId === exportPub);
          if (exportStatus !== "all") rows = rows.filter(s => s.status === exportStatus);
          rows.sort((a, b) => (a[exportSort] || "").localeCompare(b[exportSort] || ""));
          const header = exportCols.map(k => EXPORT_COLUMNS.find(c => c.key === k)?.label || k);
          const csvRows = rows.map(s => exportCols.map(k => k === "publicationId" ? pn(s[k]) : (s[k] ?? "")).map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
          const csv = [header.join(","), ...csvRows].join("\n");
          const blob = new Blob([csv], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href = url; a.download = `mailing-list-${exportPub === "all" ? "all" : exportPub}-${today}.csv`; a.click();
          URL.revokeObjectURL(url);
          setExportModal(false);
        }}>Download {exportFormat.toUpperCase()}</Btn>
      </div>
    </Modal>

    {/* ═══ RENEWAL NOTICES MODAL (Sec 5.7) ═══ */}
    <Modal open={renewalModal} onClose={() => setRenewalModal(false)} title="Send Renewal Notices" width={560}>
      {(() => {
        const d30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        const expiring = subs.filter(s => s.status === "active" && s.type === "print" && s.renewalDate && s.renewalDate >= today && s.renewalDate <= d30);
        const byPub = {};
        expiring.forEach(s => { const pk = s.publicationId || "other"; if (!byPub[pk]) byPub[pk] = []; byPub[pk].push(s); });
        return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: "10px 14px", background: Z.bg, borderRadius: Ri }}>
            <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>{expiring.length} subscriber{expiring.length !== 1 ? "s" : ""} expiring within 30 days</div>
          </div>
          {Object.entries(byPub).map(([pubId, subList]) => (
            <div key={pubId}>
              <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>{pn(pubId) || "Other"} ({subList.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 200, overflowY: "auto" }}>
                {subList.map(s => <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: Z.bg, borderRadius: Ri, fontSize: FS.sm }}>
                  <span style={{ fontWeight: FW.semi, color: Z.tx }}>{s.firstName} {s.lastName}</span>
                  <span style={{ color: Z.wa, fontSize: FS.xs }}>{fmtDate(s.renewalDate)}</span>
                </div>)}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn v="secondary" onClick={() => setRenewalModal(false)}>Cancel</Btn>
            <Btn onClick={async () => {
              let sent = 0;
              for (const sub of expiring) {
                if (!sub.email) continue;
                const daysToExpiry = Math.ceil((new Date(sub.renewalDate + "T12:00:00") - new Date()) / 86400000);
                const touch = daysToExpiry <= 7 ? "third" : daysToExpiry <= 14 ? "second" : "first";
                const pubName = pn(sub.publicationId) || "your publication";
                const htmlBody = generateRenewalHtml({
                  subscriberName: `${sub.firstName} ${sub.lastName}`.trim(),
                  publicationName: pubName,
                  expiryDate: sub.renewalDate,
                  renewalAmount: sub.amountPaid || 0,
                  renewLink: "",
                  touch,
                });
                try {
                  await sendGmailEmail({ teamMemberId: null, to: [sub.email], subject: getRenewalSubject(pubName, touch), htmlBody, mode: "send" });
                  sent++;
                } catch (err) { console.error("Renewal email error:", err); }
              }
              setRenewalModal(false);
              alert(`${sent} renewal notice${sent !== 1 ? "s" : ""} sent.`);
            }}>Send Notices ({expiring.length})</Btn>
          </div>
        </div>;
      })()}
    </Modal>

    {/* ═══ SUBSCRIBER DETAIL MODAL (Sec 5.3) ═══ */}
    {subDetailId && (() => {
      const sub = subs.find(s => s.id === subDetailId);
      if (!sub) return null;
      const subPayments = (subscriptionPayments || []).filter(p => p.subscriberId === sub.id).sort((a, b) => (b.paymentDate || "").localeCompare(a.paymentDate || ""));
      return <Modal open={!!subDetailId} onClose={() => setSubDetailId(null)} title={`${sub.firstName} ${sub.lastName}`} width={520}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ padding: "10px 14px", background: Z.bg, borderRadius: Ri }}>
              <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Publication</div>
              <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>{pn(sub.publicationId)}</div>
            </div>
            <div style={{ padding: "10px 14px", background: Z.bg, borderRadius: Ri }}>
              <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Status</div>
              <StatusBadge status={sub.status} />
            </div>
          </div>
          {sub.addressLine1 && <div style={{ padding: "10px 14px", background: Z.bg, borderRadius: Ri }}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Mailing Address</div>
            <div style={{ fontSize: FS.sm, color: Z.tx, lineHeight: 1.5 }}>
              {sub.addressLine1}<br />{sub.addressLine2 && <>{sub.addressLine2}<br /></>}{sub.city}, {sub.state} {sub.zip}
            </div>
          </div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {sub.email && <div><div style={{ fontSize: FS.xs, color: Z.td }}>Email</div><div style={{ fontSize: FS.sm, color: Z.tx }}>{sub.email}</div></div>}
            {sub.phone && <div><div style={{ fontSize: FS.xs, color: Z.td }}>Phone</div><div style={{ fontSize: FS.sm, color: Z.tx }}>{sub.phone}</div></div>}
            <div><div style={{ fontSize: FS.xs, color: Z.td }}>Type</div><div style={{ fontSize: FS.sm, color: Z.tx }}>{sub.type}</div></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div><div style={{ fontSize: FS.xs, color: Z.td }}>Start</div><div style={{ fontSize: FS.sm, color: Z.tx }}>{fmtDate(sub.startDate)}</div></div>
            <div><div style={{ fontSize: FS.xs, color: Z.td }}>Expiry</div><div style={{ fontSize: FS.sm, color: Z.tx }}>{fmtDate(sub.expiryDate)}</div></div>
            <div><div style={{ fontSize: FS.xs, color: Z.td }}>Renewal</div><div style={{ fontSize: FS.sm, color: sub.renewalDate && sub.renewalDate < today ? Z.da : Z.tx }}>{fmtDate(sub.renewalDate)}</div></div>
          </div>
          {/* Payment History */}
          <div>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 6 }}>Payment History</div>
            {subPayments.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No payments recorded</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 200, overflowY: "auto" }}>
              {subPayments.map(p => <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: Z.bg, borderRadius: Ri, fontSize: FS.sm }}>
                <span style={{ color: Z.tx }}>{fmtDate(p.paymentDate)}</span>
                <span style={{ color: Z.tm }}>{p.method || "—"}</span>
                <span style={{ fontWeight: FW.bold, color: Z.go }}>{fmtCurrency(p.amount)}</span>
              </div>)}
            </div>}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn sm v="secondary" onClick={() => { setSubDetailId(null); openSubModal(sub); }}>Edit</Btn>
            <Btn sm onClick={() => setSubDetailId(null)}>Close</Btn>
          </div>
        </div>
      </Modal>;
    })()}
  </div>;
};

export default memo(Circulation);
