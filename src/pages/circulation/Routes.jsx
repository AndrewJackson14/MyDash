// Routes tab — route template list + edit modal. The driver roster
// lives in its own tab now (spec v1.1 §5.1). Functionally unchanged.
import { useState } from "react";
import { Z, COND, FS, FW, R, Ri } from "../../lib/theme";
import { Ic, Btn, Inp, Sel, TA, Modal, GlassCard, GlassStat } from "../../components/ui";
import { fmtCurrency } from "../../lib/formatters";
import { ROUTE_FREQS, pnFor } from "./constants";

export default function Routes({
  pubs,
  dropLocations,
  dropLocationPubs,
  drivers,
  driverRoutes, setDriverRoutes,
  routeStops, setRouteStops,
}) {
  const pn = pnFor(pubs);
  const drvs = drivers || [];
  const routes = driverRoutes || [];
  const stops = routeStops || [];
  const locs = dropLocations || [];
  const locPubs = dropLocationPubs || [];

  const [routeModal, setRouteModal] = useState(false);
  const blankRoute = { driverId: "", name: "", frequency: "weekly", publicationId: pubs[0]?.id || "", notes: "", stops: [] };
  const [routeForm, setRouteForm] = useState(blankRoute);

  const saveRoute = () => {
    if (!routeForm.name) return;
    const routeId = "rt-" + Date.now();
    setDriverRoutes(prev => [...(prev || []), { ...routeForm, id: routeId, stops: undefined, isActive: true, createdAt: new Date().toISOString() }]);
    if (routeForm.stops?.length > 0) {
      const newStops = routeForm.stops.map((locId, i) => ({ id: "rs-" + routeId + "-" + i, routeId, dropLocationId: locId, stopOrder: i }));
      setRouteStops(prev => [...(prev || []), ...newStops]);
    }
    setRouteModal(false);
    setRouteForm({ ...blankRoute });
  };

  return <>
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <Btn sm onClick={() => setRouteModal(true)}><Ic.plus size={13} /> New Route</Btn>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
      <GlassStat label="Active Routes" value={routes.filter(r => r.isActive).length} />
      <GlassStat label="Assigned Drivers" value={new Set(routes.filter(r => r.driverId).map(r => r.driverId)).size} />
    </div>

    <GlassCard>
      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Route Templates</div>
      {routes.length === 0
        ? <div style={{ fontSize: FS.base, color: Z.td, padding: "8px 0" }}>No routes yet</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {routes.map(r => {
              const driver = drvs.find(d => d.id === r.driverId);
              const rStops = stops.filter(s => s.routeId === r.id).slice().sort((a, b) => (a.stopOrder ?? 0) - (b.stopOrder ?? 0));
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

    {/* New Route modal */}
    <Modal open={routeModal} onClose={() => setRouteModal(false)} title="New Route" width={520} onSubmit={saveRoute}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Inp label="Route Name" value={routeForm.name} onChange={e => setRouteForm(f => ({ ...f, name: e.target.value }))} placeholder="Paso Robles Downtown" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Sel label="Driver" value={routeForm.driverId} onChange={e => setRouteForm(f => ({ ...f, driverId: e.target.value }))} options={[{ value: "", label: "Select driver..." }, ...drvs.map(d => ({ value: d.id, label: d.name }))]} />
          <Sel label="Frequency" value={routeForm.frequency} onChange={e => setRouteForm(f => ({ ...f, frequency: e.target.value }))} options={ROUTE_FREQS} />
        </div>
        <Sel label="Publication" value={routeForm.publicationId} onChange={e => setRouteForm(f => ({ ...f, publicationId: e.target.value }))} options={[{ value: "", label: "All publications" }, ...pubs.map(p => ({ value: p.id, label: p.name }))]} />

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
              }} style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: R, cursor: "pointer", background: selected ? Z.ac + "18" : "transparent" }}>
                {selected && <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.ac, background: Z.ss, borderRadius: Ri, minWidth: 18, textAlign: "center" }}>{idx + 1}</span>}
                <span style={{ fontSize: FS.base, fontWeight: selected ? 700 : 400, color: Z.tx }}>{loc.name}</span>
                <span style={{ fontSize: FS.xs, color: Z.td }}>{loc.city}</span>
              </div>;
            })}
          </div>
        </div>

        <TA label="Notes" value={routeForm.notes} onChange={e => setRouteForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="cancel" onClick={() => setRouteModal(false)}>Cancel</Btn>
          <Btn onClick={saveRoute} disabled={!routeForm.name}>Create Route</Btn>
        </div>
      </div>
    </Modal>
  </>;
}
