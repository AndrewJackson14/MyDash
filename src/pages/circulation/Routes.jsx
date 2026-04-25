// Routes tab — route template list + edit modal + per-route detail
// drawer with Stops/Audit tabs, "Activate Now" ad-hoc dispatch, and
// per-stop expected_qty + access_notes (spec v1.1 §5.3).
//
// Multi-pub aware (migration 131): each template carries a pub SET
// rather than a single pub. UI uses a checkbox list with a primary-pub
// toggle. Persisted to driver_route_pubs; the legacy single
// driver_routes.publication_id column is kept in sync by DB trigger.
//
// Stops list uses @dnd-kit drag-handles for reorder (replaces the
// prior up/down arrow buttons).
import { useState, useEffect, useMemo } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  const [routePubsMap, setRoutePubsMap] = useState(new Map()); // route_id → [{pub_id, is_primary}]

  // Route template form. Stops are tracked as an ordered array of
  // { dropLocationId, expected_qty, access_notes } objects so the
  // Phase-1 route_stops fields land on insert.
  // pub_ids is an ordered list of publication ids; the FIRST id in the
  // list is the primary pub (used as the cron anchor + UI label).
  const blankStop = (locId) => ({ dropLocationId: locId, expected_qty: 0, access_notes: "" });
  const blankRoute = {
    driverId: "", name: "", frequency: "weekly",
    pub_ids: pubs[0] ? [pubs[0].id] : [],
    flat_fee: 0, notes: "", stops: [],
  };
  const [routeForm, setRouteForm] = useState(blankRoute);

  // ── Load per-route summary stats (last instance + next scheduled) ──
  const loadInstances = async () => {
    const { data } = await supabase
      .from("route_instances")
      .select("id, route_template_id, status, scheduled_for, completed_at, total_stops, completed_stops, skipped_stops")
      .order("scheduled_for", { ascending: false })
      .limit(500);
    setInstances(data || []);
  };
  // Load the pub set per route so cards can render multi-pub badges.
  const loadRoutePubs = async () => {
    const { data } = await supabase
      .from("driver_route_pubs")
      .select("route_id, publication_id, is_primary")
      .limit(2000);
    const m = new Map();
    for (const r of (data || [])) {
      if (!m.has(r.route_id)) m.set(r.route_id, []);
      m.get(r.route_id).push({ pub_id: r.publication_id, is_primary: r.is_primary });
    }
    setRoutePubsMap(m);
  };
  useEffect(() => { loadInstances(); loadRoutePubs(); }, []);

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

  // ── Persist route + stops + pubs to Supabase ─────────────────────
  const saveRoute = async () => {
    if (!routeForm.name || routeForm.pub_ids.length === 0) return;
    const primaryPubId = routeForm.pub_ids[0];

    const { data: routeRow, error: routeErr } = await supabase.from("driver_routes").insert({
      driver_id: routeForm.driverId || null,
      name: routeForm.name,
      frequency: routeForm.frequency,
      publication_id: primaryPubId, // legacy column; trigger keeps in sync
      default_driver_id: routeForm.driverId || null,
      flat_fee: Number(routeForm.flat_fee) || null,
      notes: routeForm.notes,
      is_active: true,
    }).select().single();
    if (routeErr) { console.error("Route insert failed:", routeErr); return; }

    // Insert pub set. Primary flag matches the ordered list's first item.
    const pubRows = routeForm.pub_ids.map(pid => ({
      route_id: routeRow.id,
      publication_id: pid,
      is_primary: pid === primaryPubId,
    }));
    await supabase.from("driver_route_pubs").insert(pubRows);

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
    setRoutePubsMap(prev => {
      const next = new Map(prev);
      next.set(routeRow.id, routeForm.pub_ids.map(pid => ({ pub_id: pid, is_primary: pid === primaryPubId })));
      return next;
    });

    await supabase.from("location_audit_log").insert({
      entity_type: "route_template",
      entity_id: routeRow.id,
      action: "created",
      actor_type: "office",
      actor_team_member_id: currentUser?.id || null,
      context: { route_id: routeRow.id, name: routeRow.name, pubs: routeForm.pub_ids },
    });

    setRouteModal(false);
    setRouteForm({ ...blankRoute });
  };

  // ── "Activate Now": create a scheduled route_instance for today ──
  const activateNow = async (route) => {
    const rStops = stops.filter(s => s.routeId === route.id);
    const pubSet = routePubsMap.get(route.id) || [];
    const primaryPub = pubSet.find(p => p.is_primary)?.pub_id || route.publicationId;
    const { data, error } = await supabase.from("route_instances").insert({
      route_template_id: route.id,
      publication_id: primaryPub || null,
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
              const pubSet = routePubsMap.get(r.id) || (r.publicationId ? [{ pub_id: r.publicationId, is_primary: true }] : []);
              return <GlassCard key={r.id} style={{ padding: 12, cursor: "pointer" }} onClick={() => setDetailRouteId(r.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: FW.heavy, color: Z.tx }}>{r.name}</div>
                    <div style={{ fontSize: FS.sm, color: Z.tm }}>
                      {driver?.name || "Unassigned"} · {ROUTE_FREQS.find(f => f.value === r.frequency)?.label || r.frequency}
                      {r.flatFee ? ` · ${fmtCurrency(r.flatFee)}/route` : ""}
                    </div>
                    {pubSet.length > 0 && <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                      {pubSet.map(p => <span key={p.pub_id} style={{
                        fontSize: FS.micro, fontWeight: FW.heavy, color: p.is_primary ? Z.ac : Z.tm,
                        background: p.is_primary ? Z.ac + "18" : Z.sa, padding: "2px 6px", borderRadius: Ri,
                        fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5,
                      }}>{pn(p.pub_id)}</span>)}
                    </div>}
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
    <Modal open={routeModal} onClose={() => setRouteModal(false)} title="New Route" width={680} onSubmit={saveRoute}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Inp label="Route Name" value={routeForm.name} onChange={e => setRouteForm(f => ({ ...f, name: e.target.value }))} placeholder="Paso Robles Downtown" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Sel label="Driver" value={routeForm.driverId} onChange={e => setRouteForm(f => ({ ...f, driverId: e.target.value }))} options={[{ value: "", label: "Select driver..." }, ...drvs.filter(d => d.isActive).map(d => ({ value: d.id, label: d.name }))]} />
          <Sel label="Frequency" value={routeForm.frequency} onChange={e => setRouteForm(f => ({ ...f, frequency: e.target.value }))} options={ROUTE_FREQS} />
          <Inp label="Flat Fee" type="number" step="0.01" value={routeForm.flat_fee || ""} onChange={e => setRouteForm(f => ({ ...f, flat_fee: Number(e.target.value) || 0 }))} />
        </div>

        {/* Publications — multi-select. First in list = primary. */}
        <div>
          <label style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>
            Publications {routeForm.pub_ids.length > 0 && <span style={{ color: Z.ac }}>· first is primary</span>}
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {pubs.map(p => {
              const idx = routeForm.pub_ids.indexOf(p.id);
              const selected = idx >= 0;
              const primary = idx === 0;
              return <button
                key={p.id}
                type="button"
                onClick={() => setRouteForm(f => {
                  const list = [...f.pub_ids];
                  const i = list.indexOf(p.id);
                  if (i >= 0) list.splice(i, 1);
                  else list.push(p.id);
                  return { ...f, pub_ids: list };
                })}
                onContextMenu={e => {
                  // Right-click to promote to primary.
                  e.preventDefault();
                  if (!selected) return;
                  setRouteForm(f => ({ ...f, pub_ids: [p.id, ...f.pub_ids.filter(x => x !== p.id)] }));
                }}
                title={selected ? "Click to remove · right-click to set primary" : "Click to add"}
                style={{
                  padding: "5px 10px", fontSize: FS.sm, fontWeight: FW.bold, cursor: "pointer",
                  borderRadius: Ri, border: "none",
                  background: primary ? Z.ac : selected ? Z.ac + "30" : Z.bg,
                  color: primary ? "#fff" : selected ? Z.ac : Z.tm,
                }}
              >
                {primary && "★ "}{pn(p.id)}
              </button>;
            })}
          </div>
          {routeForm.pub_ids.length === 0 && <div style={{ fontSize: FS.micro, color: Z.da, marginTop: 4 }}>Select at least one publication.</div>}
        </div>

        {/* Stops — drag-and-drop reorderable via @dnd-kit */}
        <div>
          <label style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>
            Stops {routeForm.stops.length > 0 && <span style={{ color: Z.ac }}>· drag to reorder</span>}
          </label>
          <div style={{ marginTop: 6, maxHeight: 300, overflowY: "auto" }}>
            <StopsList
              stops={routeForm.stops}
              locs={locs}
              onChange={(nextStops) => setRouteForm(f => ({ ...f, stops: nextStops }))}
            />
            <div style={{ marginTop: 8, fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Add a stop</div>
            <div style={{ maxHeight: 120, overflowY: "auto" }}>
              {locs.filter(l => l.isActive && !routeForm.stops.some(s => s.dropLocationId === l.id)).slice(0, 40).map(loc =>
                <div
                  key={loc.id}
                  onClick={() => setRouteForm(f => ({ ...f, stops: [...f.stops, blankStop(loc.id)] }))}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 6px", borderRadius: Ri, cursor: "pointer" }}
                  onMouseOver={e => e.currentTarget.style.background = Z.sa}
                  onMouseOut={e => e.currentTarget.style.background = "transparent"}
                >
                  <span style={{ fontSize: FS.sm, color: Z.tx }}>+ {loc.name}</span>
                  <span style={{ fontSize: FS.micro, color: Z.td }}>{loc.city}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <TA label="Notes" value={routeForm.notes} onChange={e => setRouteForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="cancel" onClick={() => setRouteModal(false)}>Cancel</Btn>
          <Btn onClick={saveRoute} disabled={!routeForm.name || routeForm.pub_ids.length === 0}>Create Route</Btn>
        </div>
      </div>
    </Modal>

    {/* Route detail drawer */}
    {detailRouteId && <RouteDetailModal
      route={routes.find(r => r.id === detailRouteId)}
      stops={stops.filter(s => s.routeId === detailRouteId).slice().sort((a, b) => (a.stopOrder ?? 0) - (b.stopOrder ?? 0))}
      locs={locs}
      team={team || []}
      routePubs={routePubsMap.get(detailRouteId) || []}
      pn={pn}
      onClose={() => setDetailRouteId(null)}
    />}
  </>;
}

// ── Sortable stops list (dnd-kit) ──────────────────────────────────
function StopsList({ stops, locs, onChange }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDragEnd = (ev) => {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const oldIdx = stops.findIndex(s => s.dropLocationId === active.id);
    const newIdx = stops.findIndex(s => s.dropLocationId === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onChange(arrayMove(stops, oldIdx, newIdx));
  };
  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
    <SortableContext items={stops.map(s => s.dropLocationId)} strategy={verticalListSortingStrategy}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {stops.map((s, i) => {
          const loc = locs.find(l => l.id === s.dropLocationId);
          if (!loc) return null;
          return <SortableStopRow
            key={s.dropLocationId}
            id={s.dropLocationId}
            index={i}
            stop={s}
            loc={loc}
            onQtyChange={(q) => onChange(stops.map((x, idx) => idx === i ? { ...x, expected_qty: q } : x))}
            onNotesChange={(n) => onChange(stops.map((x, idx) => idx === i ? { ...x, access_notes: n } : x))}
            onRemove={() => onChange(stops.filter((_, idx) => idx !== i))}
          />;
        })}
      </div>
    </SortableContext>
  </DndContext>;
}

function SortableStopRow({ id, index, stop, loc, onQtyChange, onNotesChange, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return <div ref={setNodeRef} style={{
    ...style,
    display: "grid", gridTemplateColumns: "24px 24px 1fr 80px 1fr 30px",
    gap: 8, alignItems: "center", padding: "4px 6px",
    background: Z.ac + "12", borderRadius: Ri,
  }}>
    <span {...attributes} {...listeners} style={{ cursor: "grab", color: Z.tm, fontSize: 14, textAlign: "center" }}>⋮⋮</span>
    <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.ac, textAlign: "center" }}>{index + 1}</span>
    <div>
      <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{loc.name}</div>
      <div style={{ fontSize: FS.micro, color: Z.td }}>{loc.city}</div>
    </div>
    <input type="number" min="0" value={stop.expected_qty || ""} placeholder="qty"
      onChange={e => onQtyChange(Number(e.target.value) || 0)}
      style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, color: Z.tx, fontSize: FS.sm, padding: "3px 6px", outline: "none" }} />
    <input type="text" value={stop.access_notes || ""} placeholder="Access notes"
      onChange={e => onNotesChange(e.target.value)}
      style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, color: Z.tx, fontSize: FS.sm, padding: "3px 6px", outline: "none" }} />
    <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: Z.da, fontSize: 13 }}>×</button>
  </div>;
}

// ── Route detail modal with Stops / Audit tabs ─────────────────────
function RouteDetailModal({ route, stops, locs, team, routePubs, pn, onClose }) {
  const [tab, setTab] = useState("Stops");
  if (!route) return null;
  return <Modal open={true} onClose={onClose} title={route.name} width={660}>
    {routePubs.length > 0 && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
      {routePubs.map(p => <span key={p.pub_id} style={{
        fontSize: FS.micro, fontWeight: FW.heavy, color: p.is_primary ? Z.ac : Z.tm,
        background: p.is_primary ? Z.ac + "18" : Z.sa, padding: "2px 8px", borderRadius: Ri,
        fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5,
      }}>{p.is_primary && "★ "}{pn(p.pub_id)}</span>)}
    </div>}
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
