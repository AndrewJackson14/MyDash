import { useState, memo } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../lib/theme";
import { Ic, Btn, Inp, Sel, TA, Card, SB, TB, Stat, Modal, FilterBar , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, DataTable, ListCard, ListDivider, ListGrid } from "../components/ui";

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
  return <span style={{ display: "inline-flex", borderRadius: Ri, fontSize: FS.xs, fontWeight: FW.bold, background: c.bg, color: c.text, whiteSpace: "nowrap" }}>{status}</span>;
};

// ─── Module ─────────────────────────────────────────────────
const Circulation = ({ pubs, issues, subscribers, setSubscribers, dropLocations, setDropLocations, dropLocationPubs, setDropLocationPubs, drivers, setDrivers, driverRoutes, setDriverRoutes, routeStops, setRouteStops, bus }) => {
  const [tab, setTab] = useState("Overview");
  const [sr, setSr] = useState("");
  const [subFilter, setSubFilter] = useState("all");
  const [pubFilter, setPubFilter] = useState("all");
  const [subModal, setSubModal] = useState(false);
  const [locModal, setLocModal] = useState(false);
  const [driverModal, setDriverModal] = useState(false);
  const [routeModal, setRouteModal] = useState(false);
  const [editSub, setEditSub] = useState(null);
  const [editLoc, setEditLoc] = useState(null);
  const [dropPubFilter, setDropPubFilter] = useState([]);

  // ─── Form state ─────────────────────────────────────────
  const blankSub = { type: "print", status: "active", firstName: "", lastName: "", email: "", phone: "", addressLine1: "", addressLine2: "", city: "", state: "CA", zip: "", publicationId: pubs[0]?.id || "", startDate: today, expiryDate: "", renewalDate: "", amountPaid: 0, source: "", notes: "" };
  const blankLoc = { name: "", locationType: "newsstand", address: "", city: "", state: "CA", zip: "", contactName: "", contactPhone: "", notes: "", isActive: true, pubs: {} };
  const blankDriver = { name: "", phone: "", email: "", flatFee: 0, notes: "" };
  const blankRoute = { driverId: "", name: "", frequency: "weekly", publicationId: pubs[0]?.id || "", notes: "", stops: [] };

  const [subForm, setSubForm] = useState(blankSub);
  const [locForm, setLocForm] = useState(blankLoc);
  const [driverForm, setDriverForm] = useState(blankDriver);
  const [routeForm, setRouteForm] = useState(blankRoute);

  const pn = (pid) => pubs.find(p => p.id === pid)?.name || "";
  const pubColor = (pid) => pubs.find(p => p.id === pid)?.color || Z.ac;

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
  // Filter by print/digital based on active tab
  if (tab === "Print Subscribers") filteredSubs = filteredSubs.filter(s => s.type === "print" || !s.type);
  if (tab === "Digital Subscribers") filteredSubs = filteredSubs.filter(s => s.type === "digital");
  if (subFilter !== "all") filteredSubs = filteredSubs.filter(s => s.status === subFilter);
  if (pubFilter !== "all") filteredSubs = filteredSubs.filter(s => s.publicationId === pubFilter);
  if (sr) {
    const q = sr.toLowerCase();
    filteredSubs = filteredSubs.filter(s => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.city?.toLowerCase().includes(q) || s.zip?.includes(q));
  }

  // ─── Render ─────────────────────────────────────────────
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="My Circulation">
      {(tab === "Print Subscribers" || tab === "Digital Subscribers" || tab === "Drop Locations") && <SB value={sr} onChange={setSr} placeholder={tab.includes("Subscribers") ? "Search subscribers..." : "Search locations..."} />}
      {(tab === "Print Subscribers" || tab === "Digital Subscribers") && <Sel value={pubFilter} onChange={e => setPubFilter(e.target.value)} options={[{ value: "all", label: "All Publications" }, ...pubs.map(p => ({ value: p.id, label: p.name }))]} />}
      {(tab === "Print Subscribers" || tab === "Digital Subscribers") && <Btn sm onClick={() => openSubModal(null)}><Ic.plus size={13} /> New Subscriber</Btn>}
      {tab === "Drop Locations" && <Btn sm onClick={() => openLocModal(null)}><Ic.plus size={13} /> New Location</Btn>}
      {tab === "Routes" && <><Btn sm v="secondary" onClick={() => setDriverModal(true)}><Ic.plus size={13} /> New Driver</Btn><Btn sm onClick={() => setRouteModal(true)}><Ic.plus size={13} /> New Route</Btn></>}
    </PageHeader>

    <TabRow><TB tabs={["Overview", "Print Subscribers", "Digital Subscribers", "Drop Locations", "Routes"]} active={tab} onChange={setTab} />{(tab === "Print Subscribers" || tab === "Digital Subscribers") && <><TabPipe /><TB tabs={["All", ...SUB_STATUSES.map(s => s.label)]} active={subFilter === "all" ? "All" : SUB_STATUSES.find(s => s.value === subFilter)?.label || "All"} onChange={v => setSubFilter(v === "All" ? "all" : SUB_STATUSES.find(s => s.label === v)?.value || "all")} /></>}</TabRow>

    {/* ════════ OVERVIEW ════════ */}
    {tab === "Overview" && <>
      {/* Newspaper print subscribers broken out */}
      {(() => {
        const newspapers = pubs.filter(p => p.type === "Newspaper");
        return <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(newspapers.length + 1, 5)}, 1fr)`, gap: 12 }}>
          {newspapers.map(p => {
            const ct = subs.filter(s => s.publicationId === p.id && s.type === "print" && s.status === "active").length;
            return <GlassStat key={p.id} label={p.name} value={ct.toLocaleString()} sub="Print subscribers" color={p.color} />;
          })}
          <GlassStat label="Digital (All)" value={activeDigital.length.toLocaleString()} sub="Newsletter subscribers" />
        </div>;
      })()}

      {/* Renewals due per newspaper */}
      {(() => {
        const newspapers = pubs.filter(p => p.type === "Newspaper");
        const renewalsByPub = newspapers.map(p => ({
          pub: p,
          count: subs.filter(s => s.publicationId === p.id && s.status === "active" && s.renewalDate && s.renewalDate <= new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().slice(0, 10) && s.renewalDate >= today).length,
        }));
        const totalRenewals = renewalsByPub.reduce((s, r) => s + r.count, 0);
        return totalRenewals > 0 ? <GlassCard style={{ borderLeft: `3px solid ${Z.wa}` }}>
          <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, marginBottom: 10 }}>Renewals Due — Next 30 Days</div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(renewalsByPub.length, 5)}, 1fr)`, gap: 10 }}>
            {renewalsByPub.map(r => <div key={r.pub.id} style={{ textAlign: "center", padding: 10, background: Z.bg, borderRadius: R }}>
              <div style={{ fontSize: 22, fontWeight: FW.black, color: r.count > 0 ? Z.wa : Z.su, fontFamily: DISPLAY }}>{r.count}</div>
              <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: r.pub.color }}>{r.pub.name}</div>
            </div>)}
          </div>
        </GlassCard> : <GlassCard><div style={{ padding: 10, textAlign: "center", color: Z.su, fontSize: FS.md, fontWeight: FW.bold }}>No renewals due in the next 30 days</div></GlassCard>;
      })()}

      {/* Per-publication breakdown */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Circulation by Publication</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {pubSubCounts.map(p => {
            const total = p.print + p.drops;
            return <div key={p.pub.id} style={{ display: "grid", gridTemplateColumns: "12px 1fr 90px 90px 90px 90px", gap: 10, alignItems: "center", background: Z.bg, borderRadius: R }}>
              <div style={{ width: 10, height: 10, borderRadius: Ri, background: p.pub.color }} />
              <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>{p.pub.name}</div>
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
    </>}

    {/* ════════ SUBSCRIBERS ════════ */}
    {(tab === "Print Subscribers" || tab === "Digital Subscribers") && <>
      <div style={{ fontSize: FS.sm, color: Z.td }}>{filteredSubs.length} subscriber{filteredSubs.length !== 1 ? "s" : ""}</div>

      <GlassCard style={{ padding: 0, overflow: "hidden" }}>
        <DataTable>
          <thead>
            <tr>
              {["Name", "Type", "Publication", "City/Zip", "Renewal", "Status", ""].map(h =>
                <th key={h} style={{ textAlign: "left", fontWeight: FW.heavy, color: Z.tm, fontSize: FS.xs, textTransform: "uppercase" }}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filteredSubs.length === 0
              ? <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: Z.td, fontSize: FS.base }}>No subscribers found</td></tr>
              : filteredSubs.sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`)).map(s => <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => openSubModal(s)}>
                <td style={{ padding: "8px 10px" }}>
                  <div style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{s.firstName} {s.lastName}</div>
                  {s.email && <div style={{ fontSize: FS.xs, color: Z.td }}>{s.email}</div>}
                </td>
                <td style={{ fontSize: FS.sm, fontWeight: FW.semi, color: s.type === "print" ? Z.ac : Z.pu }}>{s.type === "print" ? "Print" : "Digital"}</td>
                <td style={{ padding: "8px 10px" }}><span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: pubColor(s.publicationId), fontFamily: COND }}>{pn(s.publicationId)}</span></td>
                <td style={{ fontSize: FS.sm, color: Z.tm }}>{s.city}{s.city && s.zip ? ", " : ""}{s.zip}</td>
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
              {lpubs.map(lp => <span key={lp.publicationId} style={{ fontSize: FS.xs, fontWeight: FW.bold, color: pubColor(lp.publicationId), background: pubColor(lp.publicationId) + "18", borderRadius: Ri }}>{pn(lp.publicationId)} × {lp.quantity}</span>)}
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
              <div style={{ width: 10, height: 10, borderRadius: Ri, background: p.color }} />
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
  </div>;
};

export default memo(Circulation);
