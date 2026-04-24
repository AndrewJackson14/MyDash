// Routes tab — route template list + edit modal + per-route detail
// drawer with Stops/Audit tabs, "Activate Now" ad-hoc dispatch, and
// per-stop expected_qty + access_notes (spec v1.1 §5.3).
import { useState, useEffect, useMemo } from "react";
import { Z, COND, DISPLAY, FS, FW, R, Ri } from "../../lib/theme";
import { Ic, Btn, Inp, Sel, TA, Modal, GlassCard, GlassStat, TabRow, TB } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { fmtDate, fmtCurrency } from "../../lib/formatters";
import { ROUTE_FREQS, pnFor, todayIso } from "./constants";
import RouteAuditLog from "./RouteAuditLog";

export default function Routes({
  pubs,
  dropLocations,
  dropLocationPubs,
  drivers,
  driverRoutes, setDriverRoutes,
  routeStops, setRouteStops,
  team,
  currentUser,
}) {
  const pn = pnFor(pubs);
  const today = todayIso();
  const drvs = drivers || [];
  const routes = driverRoutes || [];
  const stops = routeStops || [];
  const locs = dropLocations || [];
  const locPubs = dropLocationPubs || [];

  const [routeModal, setRouteModal] = useState(false);
  const [detailRouteId, setDetailRouteId] = useState(null);
  const [instances, setInstances] = useState([]);

  // Route template form. Stops are tracked as an ordered array of
  // { dropLocationId, expected_qty, access_notes } objects so the
  // Phase-1 route_stops fields land on insert.
  const blankStop = (locId) => ({ dropLocationId: locId, expected_qty: 0, access_notes: "" });
  const blankRoute = { driverId: "", name: "", frequency: "weekly", publicationId: pubs[0]?.id || "", flat_fee: 0, notes: "", stops: [] };
  const [routeForm, setRouteForm] = useState(blankRoute);

  // ── Load per-route summary stats (last instance + next scheduled) ──
  // One fetch on mount + after mutations. Small table for now; upgrade
  // to keyset when it saturates.
  const loadInstances = async () => {
    const { data } = await supabase
      .from("route_instances")
      .select("id, route_template_id, status, scheduled_for, completed_at, total_stops, completed_stops, skipped_stops")
      .order("scheduled_for", { ascending: false })
      .limit(500);
    setInstances(data || []);
  };
  useEffect(() => { loadInstances(); }, []);

  const statsByRoute = useMemo(() => {
    const m = new Map();
    for (const r of routes) {
      const mine = instances.filter(i => i.route_template_id === r.id);
      const completed = mine.filter(i => i.status === "complete").sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""))[0];
      const upcoming  = mine.filter(i => i.status === "scheduled" || i.status === "sms_sent").sort((a, b) => (a.scheduled_for || "").localeCompare(b.scheduled_for || ""))[0];
      const completionPct = completed && completed.total_stops > 0
        ? Math.round((completed.completed_stops / completed.total_stops) * 100)
        : null;
      m.set(r.id, { completionPct, nextScheduledFor: upcoming?.scheduled_for || null });
    }
    return m;
  }, [routes, instances]);

  // ── Persist route + stops to Supabase (fixes pre-existing local-only bug) ──
  const saveRoute = async () => {
    if (!routeForm.name) return;
    const { data: routeRow, error: routeErr } = await supabase.from("driver_routes").insert({
      driver_id: routeForm.driverId || null,
      name: routeForm.name,
      frequency: routeForm.frequency,
      publication_id: routeForm.publicationId || null,
      default_driver_id: routeForm.driverId || null,
      flat_fee: Number(routeForm.flat_fee) || null,
      notes: routeForm.notes,
      is_active: true,
    }).select().single();
    if (routeErr) { console.error("Route insert failed:", routeErr); return; }

    if (routeForm.stops?.length > 0) {
      const rows = routeForm.stops.map((s, i) => ({
        route_id: routeRow.id,
        drop_location_id: s.dropLocationId,
        sort_order: i,
        stop_order: i,
        expected_qty: Number(s.expected_qty) || 0,
        access_notes: s.access_notes || null,
      }));
      const { data: stopRows } = await supabase.from("route_stops").insert(rows).select();
      if (stopRows) setRouteStops(prev => [...(prev || []), ...stopRows.map(sr => ({
        id: sr.id, routeId: sr.route_id, dropLocationId: sr.drop_location_id,
        stopOrder: sr.stop_order, expected_qty: sr.expected_qty, access_notes: sr.access_notes,
      }))]);
    }

    setDriverRoutes(prev => [...(prev || []), {
      id: routeRow.id, driverId: routeRow.driver_id, name: routeRow.name,
      frequency: routeRow.frequency, publicationId: routeRow.publication_id,
      notes: routeRow.notes, isActive: routeRow.is_active,
      defaultDriverId: routeRow.default_driver_id, flatFee: routeRow.flat_fee,
      createdAt: routeRow.created_at,
    }]);

    // Audit entry (office actor).
    await supabase.from("location_audit_log").insert({
      entity_type: "route_template",
      entity_id: routeRow.id,
      action: "created",
      actor_type: "office",
      actor_team_member_id: currentUser?.id || null,
      context: { route_id: routeRow.id, name: routeRow.name },
    });

    setRouteModal(false);
    setRouteForm({ ...blankRoute });
  };

  // ── "Activate Now": create a scheduled route_instance for today ──
  const activateNow = async (route) => {
    const rStops = stops.filter(s => s.routeId === route.id);
    const { data, error } = await supabase.from("route_instances").insert({
      route_template_id: route.id,
      publication_id: route.publicationId || null,
      driver_id: route.defaultDriverId || route.driverId || null,
      scheduled_for: today,
      status: "scheduled",
      total_stops: rStops.length,
      notes: "Activated manually from Routes tab",
    }).select().single();
    if (error) { console.error("Activate Now failed:", error); return; }
    setInstances(prev => [data, ...prev]);
    await supabase.from("location_audit_log").insert({
      entity_type: "route_template",
      entity_id: route.id,
      action: "updated",
      actor_type: "office",
      actor_team_member_id: currentUser?.id || null,
      context: { route_id: route.id, reason: "Activated ad-hoc instance", instance_id: data.id },
    });
  };

  return <>
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <Btn sm onClick={() => setRouteModal(true)}><Ic.plus size={13} /> New Route</Btn>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
      <GlassStat label="Active Routes" value={routes.filter(r => r.isActive).length} />
      <GlassStat label="Assigned Drivers" value={new Set(routes.filter(r => r.driverId || r.defaultDriverId).map(r => r.driverId || r.defaultDriverId)).size} />
      <GlassStat label="Instances Today" value={instances.filter(i => i.scheduled_for === today).length} />
    </div>

    <GlassCard>
      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Route Templates</div>
      {routes.length === 0
        ? <div style={{ fontSize: FS.base, color: Z.td, padding: "8px 0" }}>No routes yet</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {routes.map(r => {
              const driver = drvs.find(d => d.id === (r.driverId || r.defaultDriverId));
              const rStops = stops.filter(s => s.routeId === r.id).slice().sort((a, b) => (a.stopOrder ?? 0) - (b.stopOrder ?? 0));
              const stopLocs = rStops.map(s => locs.find(l => l.id === s.dropLocationId)).filter(Boolean);
              const totalCopies = rStops.reduce((sum, rs) => sum + (rs.expected_qty || 0), 0)
                || rStops.reduce((sum, rs) => {
                  const lpubs = locPubs.filter(lp => lp.dropLocationId === rs.dropLocationId);
                  return sum + lpubs.reduce((ss, lp) => ss + (lp.quantity || 0), 0);
                }, 0);
              const st = statsByRoute.get(r.id) || {};
              return <GlassCard key={r.id} style={{ padding: 12, cursor: "pointer" }} onClick={() => setDetailRouteId(r.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: FW.heavy, color: Z.tx }}>{r.name}</div>
                    <div style={{ fontSize: FS.sm, color: Z.tm }}>
                      {driver?.name || "Unassigned"} · {ROUTE_FREQS.find(f => f.value === r.frequency)?.label || r.frequency}
                      {r.publicationId ? ` · ${pn(r.publicationId)}` : ""}
                      {r.flatFee ? ` · ${fmtCurrency(r.flatFee)}/route` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{stopLocs.length} stops</div>
                    <div style={{ fontSize: FS.sm, color: Z.su }}>{totalCopies} copies</div>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                  <div style={{ display: "flex", gap: 14, fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
                    {st.completionPct !== null && st.completionPct !== undefined
                      ? <span>Last run: <b style={{ color: st.completionPct >= 90 ? Z.go : st.completionPct >= 60 ? Z.wa : Z.da }}>{st.completionPct}%</b></span>
                      : <span style={{ color: Z.td }}>No runs yet</span>}
                    {st.nextScheduledFor && <span>Next: <b style={{ color: Z.tx }}>{fmtDate(st.nextScheduledFor)}</b></span>}
                  </div>
                  <Btn sm v="secondary" onClick={e => { e.stopPropagation(); activateNow(r); }}>Activate Now</Btn>
                </div>
                {stopLocs.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 10 }}>
                  {stopLocs.slice(0, 5).map((loc, i) => <div key={loc.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: FS.sm, color: Z.tm }}>
                    <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, background: Z.sa, borderRadius: Ri, minWidth: 20, textAlign: "center" }}>{i + 1}</span>
                    <span style={{ fontWeight: FW.semi, color: Z.tx }}>{loc.name}</span>
                    <span style={{ color: Z.td }}>{loc.city}</span>
                    {rStops[i]?.expected_qty > 0 && <span style={{ marginLeft: "auto", color: Z.ac, fontWeight: FW.bold }}>{rStops[i].expected_qty}</span>}
                  </div>)}
                  {stopLocs.length > 5 && <div style={{ fontSize: FS.xs, color: Z.td, paddingLeft: 28 }}>+ {stopLocs.length - 5} more</div>}
                </div>}
              </GlassCard>;
            })}
          </div>}
    </GlassCard>

    {/* New Route modal */}
    <Modal open={routeModal} onClose={() => setRouteModal(false)} title="New Route" width={620} onSubmit={saveRoute}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Inp label="Route Name" value={routeForm.name} onChange={e => setRouteForm(f => ({ ...f, name: e.target.value }))} placeholder="Paso Robles Downtown" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Sel label="Driver" value={routeForm.driverId} onChange={e => setRouteForm(f => ({ ...f, driverId: e.target.value }))} options={[{ value: "", label: "Select driver..." }, ...drvs.map(d => ({ value: d.id, label: d.name }))]} />
          <Sel label="Frequency" value={routeForm.frequency} onChange={e => setRouteForm(f => ({ ...f, frequency: e.target.value }))} options={ROUTE_FREQS} />
          <Inp label="Flat Fee" type="number" step="0.01" value={routeForm.flat_fee || ""} onChange={e => setRouteForm(f => ({ ...f, flat_fee: Number(e.target.value) || 0 }))} />
        </div>
        <Sel label="Publication" value={routeForm.publicationId} onChange={e => setRouteForm(f => ({ ...f, publicationId: e.target.value }))} options={[{ value: "", label: "All publications" }, ...pubs.map(p => ({ value: p.id, label: p.name }))]} />

        <div>
          <label style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Stops (click to add in order; edit qty + notes inline)</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, maxHeight: 260, overflowY: "auto" }}>
            {/* Selected stops at the top with inputs */}
            {routeForm.stops.map((s, i) => {
              const loc = locs.find(l => l.id === s.dropLocationId);
              if (!loc) return null;
              return <div key={s.dropLocationId} style={{ display: "grid", gridTemplateColumns: "24px 1fr 80px 1fr 80px", gap: 8, alignItems: "center", padding: "4px 6px", background: Z.ac + "12", borderRadius: Ri }}>
                <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.ac, textAlign: "center" }}>{i + 1}</span>
                <div>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{loc.name}</div>
                  <div style={{ fontSize: FS.micro, color: Z.td }}>{loc.city}</div>
                </div>
                <input type="number" min="0" value={s.expected_qty || ""} placeholder="qty"
                  onChange={e => setRouteForm(f => ({ ...f, stops: f.stops.map((x, idx) => idx === i ? { ...x, expected_qty: Number(e.target.value) || 0 } : x) }))}
                  style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, color: Z.tx, fontSize: FS.sm, padding: "3px 6px", outline: "none" }} />
                <input type="text" value={s.access_notes} placeholder="Access notes"
                  onChange={e => setRouteForm(f => ({ ...f, stops: f.stops.map((x, idx) => idx === i ? { ...x, access_notes: e.target.value } : x) }))}
                  style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, color: Z.tx, fontSize: FS.sm, padding: "3px 6px", outline: "none" }} />
                <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                  <button onClick={() => setRouteForm(f => {
                    if (i === 0) return f;
                    const arr = [...f.stops]; [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; return { ...f, stops: arr };
                  })} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, fontSize: 11 }}>▲</button>
                  <button onClick={() => setRouteForm(f => {
                    if (i === f.stops.length - 1) return f;
                    const arr = [...f.stops]; [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; return { ...f, stops: arr };
                  })} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, fontSize: 11 }}>▼</button>
                  <button onClick={() => setRouteForm(f => ({ ...f, stops: f.stops.filter((_, idx) => idx !== i) }))} style={{ background: "none", border: "none", cursor: "pointer", color: Z.da, fontSize: 11, marginLeft: 4 }}>×</button>
                </div>
              </div>;
            })}
            {/* Add more from the unselected locs */}
            <div style={{ marginTop: 8, fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Add a stop</div>
            {locs.filter(l => l.isActive && !routeForm.stops.some(s => s.dropLocationId === l.id)).slice(0, 30).map(loc =>
              <div key={loc.id} onClick={() => setRouteForm(f => ({ ...f, stops: [...f.stops, blankStop(loc.id)] }))}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 6px", borderRadius: Ri, cursor: "pointer" }}
                onMouseOver={e => e.currentTarget.style.background = Z.sa}
                onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ fontSize: FS.sm, color: Z.tx }}>+ {loc.name}</span>
                <span style={{ fontSize: FS.micro, color: Z.td }}>{loc.city}</span>
              </div>
            )}
          </div>
        </div>

        <TA label="Notes" value={routeForm.notes} onChange={e => setRouteForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="cancel" onClick={() => setRouteModal(false)}>Cancel</Btn>
          <Btn onClick={saveRoute} disabled={!routeForm.name}>Create Route</Btn>
        </div>
      </div>
    </Modal>

    {/* Route detail drawer */}
    {detailRouteId && <RouteDetailModal
      route={routes.find(r => r.id === detailRouteId)}
      stops={stops.filter(s => s.routeId === detailRouteId).slice().sort((a, b) => (a.stopOrder ?? 0) - (b.stopOrder ?? 0))}
      locs={locs}
      team={team || []}
      onClose={() => setDetailRouteId(null)}
    />}
  </>;
}

// ── Route detail modal with Stops / Audit tabs ─────────────────────
function RouteDetailModal({ route, stops, locs, team, onClose }) {
  const [tab, setTab] = useState("Stops");
  if (!route) return null;
  return <Modal open={true} onClose={onClose} title={route.name} width={640}>
    <TabRow>
      <TB tabs={["Stops", "Audit Log"]} active={tab} onChange={setTab} />
    </TabRow>
    {tab === "Stops" && <div style={{ marginTop: 12, maxHeight: 360, overflowY: "auto" }}>
      {stops.length === 0
        ? <div style={{ padding: "18px 16px", color: Z.tm, fontSize: FS.sm }}>No stops yet.</div>
        : stops.map((s, i) => {
          const loc = locs.find(l => l.id === s.dropLocationId);
          if (!loc) return null;
          return <div key={s.id} style={{ display: "grid", gridTemplateColumns: "28px 1fr 60px 1fr", gap: 8, padding: "8px 10px", borderBottom: `1px solid ${Z.bd}`, fontSize: FS.sm }}>
            <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.ac, textAlign: "center" }}>{i + 1}</span>
            <div>
              <div style={{ fontWeight: FW.bold, color: Z.tx }}>{loc.name}</div>
              <div style={{ fontSize: FS.micro, color: Z.td }}>{loc.address}, {loc.city}</div>
            </div>
            <div style={{ textAlign: "right", color: Z.ac, fontWeight: FW.bold }}>{s.expected_qty || 0}</div>
            <div style={{ fontSize: FS.micro, color: Z.tm }}>{s.access_notes || "—"}</div>
          </div>;
        })}
    </div>}
    {tab === "Audit Log" && <div style={{ marginTop: 12 }}>
      <RouteAuditLog routeId={route.id} team={team} />
    </div>}
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
      <Btn onClick={onClose}>Close</Btn>
    </div>
  </Modal>;
}
