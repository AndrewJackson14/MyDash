// Route Instances tab (spec v1.1 §5.4). Cami's daily ops view.
//
// Three sub-views via a segmented control:
//   Today    — card grid grouped by status (Scheduled / In Progress / Complete / Abandoned)
//   Upcoming — next 7 days, grouped by date then publication
//   History  — searchable table with date range + filters + CSV export
//
// Each card / row opens a detail drawer with:
//   - Stop-by-stop confirmation list (status + delivered_qty + photo)
//   - GPS map plot (Phase 7 wires Mapbox; here we just list coordinates)
//   - Message thread (Phase 9 wires realtime; here we show existing rows)
//   - Resend SMS button on Scheduled cards (Phase 6 wires Twilio)
import { useState, useEffect, useMemo } from "react";
import { Z, COND, FS, FW, R, Ri } from "../../lib/theme";
import { Btn, Sel, Modal, SB, TabRow, TB, GlassCard, GlassStat } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { fmtDate, fmtCurrency } from "../../lib/formatters";
import { pnFor, todayIso } from "./constants";

const STATUS_LABELS = {
  scheduled:   { label: "Scheduled",    color: "#3B82F6" },
  sms_sent:    { label: "SMS Sent",     color: "#8B5CF6" },
  in_progress: { label: "In Progress",  color: "#F59E0B" },
  complete:    { label: "Complete",     color: "#10B981" },
  abandoned:   { label: "Abandoned",    color: "#EF4444" },
};

export default function RouteInstances({ pubs, drivers, driverRoutes, dropLocations }) {
  const pn = pnFor(pubs || []);
  const today = todayIso();
  const [view, setView] = useState("Today");
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);

  const loadInstances = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("route_instances")
      .select("*")
      .order("scheduled_for", { ascending: false })
      .limit(1000);
    setInstances(data || []);
    setLoading(false);
  };
  useEffect(() => { loadInstances(); }, []);

  const byDate = useMemo(() => {
    const m = new Map();
    for (const ri of instances) {
      const d = ri.scheduled_for;
      if (!m.has(d)) m.set(d, []);
      m.get(d).push(ri);
    }
    return m;
  }, [instances]);

  const todayInstances = byDate.get(today) || [];

  const nextWeekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const upcoming = instances.filter(i => i.scheduled_for > today && i.scheduled_for <= nextWeekEnd);
  const upcomingByDate = useMemo(() => {
    const m = new Map();
    for (const ri of upcoming.sort((a, b) => (a.scheduled_for || "").localeCompare(b.scheduled_for || ""))) {
      if (!m.has(ri.scheduled_for)) m.set(ri.scheduled_for, []);
      m.get(ri.scheduled_for).push(ri);
    }
    return m;
  }, [upcoming]);

  const detail = instances.find(i => i.id === detailId);

  return <>
    <TabRow>
      <TB tabs={["Today", "Upcoming", "History"]} active={view} onChange={setView} />
    </TabRow>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
      <GlassStat label="Scheduled Today" value={todayInstances.filter(i => i.status === "scheduled" || i.status === "sms_sent").length} />
      <GlassStat label="In Progress" value={todayInstances.filter(i => i.status === "in_progress").length} />
      <GlassStat label="Complete Today" value={todayInstances.filter(i => i.status === "complete").length} />
      <GlassStat label="Next 7 Days" value={upcoming.length} />
    </div>

    {loading && <div style={{ padding: "20px 0", color: Z.tm, fontSize: FS.sm, textAlign: "center" }}>Loading instances…</div>}

    {!loading && view === "Today" && <TodayView
      instances={todayInstances} pubs={pubs} drivers={drivers} routes={driverRoutes} pn={pn}
      onOpen={setDetailId} onRefresh={loadInstances}
    />}

    {!loading && view === "Upcoming" && <UpcomingView
      byDate={upcomingByDate} pubs={pubs} drivers={drivers} routes={driverRoutes} pn={pn}
      onOpen={setDetailId}
    />}

    {!loading && view === "History" && <HistoryView
      instances={instances.filter(i => i.status === "complete" || i.status === "abandoned")}
      pubs={pubs} drivers={drivers} routes={driverRoutes} pn={pn}
      onOpen={setDetailId}
    />}

    {detail && <InstanceDetailModal
      instance={detail}
      pubs={pubs} drivers={drivers} routes={driverRoutes} dropLocations={dropLocations} pn={pn}
      onClose={() => setDetailId(null)}
      onChanged={loadInstances}
    />}
  </>;
}

// ── Today view ──────────────────────────────────────────────────
function TodayView({ instances, pubs, drivers, routes, pn, onOpen, onRefresh }) {
  const groups = {
    scheduled:   instances.filter(i => i.status === "scheduled" || i.status === "sms_sent"),
    in_progress: instances.filter(i => i.status === "in_progress"),
    complete:    instances.filter(i => i.status === "complete"),
    abandoned:   instances.filter(i => i.status === "abandoned"),
  };
  if (instances.length === 0) {
    return <GlassCard><div style={{ padding: "20px 16px", textAlign: "center", color: Z.tm, fontSize: FS.sm }}>
      No instances scheduled today. Cron runs at 06:00 PT; ad-hoc ones can be created from the Routes tab via "Activate Now".
    </div></GlassCard>;
  }
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    {Object.entries(groups).map(([status, list]) => list.length === 0 ? null : (
      <GlassCard key={status}>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: STATUS_LABELS[status]?.color, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
          {STATUS_LABELS[status]?.label} ({list.length})
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
          {list.map(ri => <InstanceCard key={ri.id} ri={ri} pubs={pubs} drivers={drivers} routes={routes} pn={pn} onOpen={onOpen} />)}
        </div>
      </GlassCard>
    ))}
  </div>;
}

// ── Upcoming view ───────────────────────────────────────────────
function UpcomingView({ byDate, pubs, drivers, routes, pn, onOpen }) {
  if (byDate.size === 0) return <GlassCard><div style={{ padding: "20px 16px", textAlign: "center", color: Z.tm, fontSize: FS.sm }}>
    No instances scheduled in the next 7 days.
  </div></GlassCard>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    {[...byDate.entries()].map(([date, list]) => (
      <GlassCard key={date}>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tx, marginBottom: 8 }}>{fmtDate(date)} <span style={{ color: Z.td, fontWeight: FW.semi }}>· {list.length} route{list.length !== 1 ? "s" : ""}</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
          {list.map(ri => <InstanceCard key={ri.id} ri={ri} pubs={pubs} drivers={drivers} routes={routes} pn={pn} onOpen={onOpen} />)}
        </div>
      </GlassCard>
    ))}
  </div>;
}

// ── History view ────────────────────────────────────────────────
function HistoryView({ instances, pubs, drivers, routes, pn, onOpen }) {
  const [q, setQ] = useState("");
  const [driverFilter, setDriverFilter] = useState("all");
  const [pubFilter, setPubFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filtered = instances.filter(i => {
    if (driverFilter !== "all" && i.driver_id !== driverFilter) return false;
    if (pubFilter !== "all" && i.publication_id !== pubFilter) return false;
    if (fromDate && i.scheduled_for < fromDate) return false;
    if (toDate && i.scheduled_for > toDate) return false;
    if (q) {
      const route = routes.find(r => r.id === i.route_template_id);
      const driver = drivers.find(d => d.id === i.driver_id);
      const hay = `${route?.name || ""} ${driver?.name || ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const exportCsv = () => {
    const header = ["Date", "Route", "Driver", "Publication", "Status", "Completed stops", "Skipped stops", "Total stops", "Completion %", "Pay", "Pay status"];
    const rows = filtered.map(i => {
      const route = routes.find(r => r.id === i.route_template_id);
      const driver = drivers.find(d => d.id === i.driver_id);
      const pct = i.total_stops > 0 ? Math.round((i.completed_stops / i.total_stops) * 100) : 0;
      return [
        i.scheduled_for, route?.name || "", driver?.name || "",
        pn(i.publication_id), i.status,
        i.completed_stops, i.skipped_stops, i.total_stops, `${pct}%`,
        i.driver_pay_amount ?? "", i.driver_pay_status || "",
      ];
    });
    const csv = [header.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `route-instances-${todayIso()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return <>
    <GlassCard>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 90px", gap: 8, marginBottom: 10 }}>
        <SB value={q} onChange={setQ} placeholder="Search route or driver" />
        <Sel value={driverFilter} onChange={e => setDriverFilter(e.target.value)} options={[{ value: "all", label: "All drivers" }, ...drivers.map(d => ({ value: d.id, label: d.name }))]} />
        <Sel value={pubFilter} onChange={e => setPubFilter(e.target.value)} options={[{ value: "all", label: "All pubs" }, ...pubs.map(p => ({ value: p.id, label: p.name }))]} />
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, color: Z.tx, padding: "4px 8px", fontSize: FS.sm }} />
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, color: Z.tx, padding: "4px 8px", fontSize: FS.sm }} />
        <Btn sm v="secondary" onClick={exportCsv} disabled={filtered.length === 0}>Export</Btn>
      </div>
      <div style={{ fontSize: FS.xs, color: Z.td, marginBottom: 8 }}>{filtered.length} instance{filtered.length !== 1 ? "s" : ""}</div>
      <div style={{ maxHeight: 480, overflowY: "auto" }}>
        <table style={{ width: "100%", fontSize: FS.xs, borderCollapse: "collapse" }}>
          <thead style={{ position: "sticky", top: 0, background: Z.bg, zIndex: 1 }}>
            <tr>
              {["Date", "Route", "Driver", "Pub", "Status", "Completion", "Pay"].map(h =>
                <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: Z.tm, fontWeight: FW.heavy, textTransform: "uppercase", fontSize: FS.micro, borderBottom: `1px solid ${Z.bd}` }}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map(i => {
              const route = routes.find(r => r.id === i.route_template_id);
              const driver = drivers.find(d => d.id === i.driver_id);
              const pct = i.total_stops > 0 ? Math.round((i.completed_stops / i.total_stops) * 100) : 0;
              const pctColor = pct >= 90 ? Z.go : pct >= 60 ? Z.wa : Z.da;
              return <tr key={i.id} onClick={() => onOpen(i.id)} style={{ cursor: "pointer" }}>
                <td style={{ padding: "6px 8px", color: Z.tx, whiteSpace: "nowrap", borderBottom: `1px solid ${Z.bd}` }}>{fmtDate(i.scheduled_for)}</td>
                <td style={{ padding: "6px 8px", color: Z.tx, fontWeight: FW.semi, borderBottom: `1px solid ${Z.bd}` }}>{route?.name || "—"}</td>
                <td style={{ padding: "6px 8px", color: Z.tm, borderBottom: `1px solid ${Z.bd}` }}>{driver?.name || "—"}</td>
                <td style={{ padding: "6px 8px", color: Z.tm, fontFamily: COND, borderBottom: `1px solid ${Z.bd}` }}>{pn(i.publication_id)}</td>
                <td style={{ padding: "6px 8px", color: STATUS_LABELS[i.status]?.color || Z.tm, fontWeight: FW.bold, borderBottom: `1px solid ${Z.bd}` }}>{STATUS_LABELS[i.status]?.label || i.status}</td>
                <td style={{ padding: "6px 8px", color: pctColor, fontWeight: FW.bold, borderBottom: `1px solid ${Z.bd}` }}>{i.completed_stops}/{i.total_stops} ({pct}%)</td>
                <td style={{ padding: "6px 8px", color: i.driver_pay_status === "paid" ? Z.go : Z.tm, borderBottom: `1px solid ${Z.bd}` }}>
                  {i.driver_pay_amount ? `${fmtCurrency(i.driver_pay_amount)} · ${i.driver_pay_status || "pending"}` : "—"}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  </>;
}

// ── Instance card ───────────────────────────────────────────────
function InstanceCard({ ri, pubs, drivers, routes, pn, onOpen }) {
  const route = routes.find(r => r.id === ri.route_template_id);
  const driver = drivers.find(d => d.id === ri.driver_id);
  const pct = ri.total_stops > 0 ? Math.round((ri.completed_stops / ri.total_stops) * 100) : 0;
  const s = STATUS_LABELS[ri.status] || { label: ri.status, color: Z.tm };
  return <div onClick={() => onOpen(ri.id)} style={{
    padding: "10px 12px", background: Z.bg, borderLeft: `3px solid ${s.color}`,
    borderRadius: Ri, cursor: "pointer",
  }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{route?.name || "Route"}</div>
      <div style={{ fontSize: FS.micro, color: s.color, fontWeight: FW.heavy, textTransform: "uppercase" }}>{s.label}</div>
    </div>
    <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 2 }}>
      {driver?.name || <span style={{ color: Z.da }}>No driver assigned</span>}
      {ri.publication_id && <> · <span style={{ fontFamily: COND }}>{pn(ri.publication_id)}</span></>}
    </div>
    {ri.total_stops > 0 && <div style={{ marginTop: 6, height: 4, background: Z.bd, borderRadius: 2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: s.color, transition: "width 0.3s" }} />
    </div>}
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: FS.micro, color: Z.td, fontFamily: COND }}>
      <span>{ri.completed_stops}/{ri.total_stops} stops</span>
      {ri.skipped_stops > 0 && <span style={{ color: Z.wa }}>{ri.skipped_stops} skipped</span>}
    </div>
  </div>;
}

// ── Instance detail modal ───────────────────────────────────────
function InstanceDetailModal({ instance, pubs, drivers, routes, dropLocations, pn, onClose, onChanged }) {
  const [confirms, setConfirms] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignModal, setAssignModal] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState(instance.driver_id || "");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [confRes, msgRes] = await Promise.all([
        supabase.from("stop_confirmations").select("*").eq("route_instance_id", instance.id).order("stop_order"),
        supabase.from("driver_messages").select("*").eq("route_instance_id", instance.id).order("created_at"),
      ]);
      if (cancelled) return;
      setConfirms(confRes.data || []);
      setMessages(msgRes.data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [instance.id]);

  const route  = routes.find(r => r.id === instance.route_template_id);
  const driver = drivers.find(d => d.id === instance.driver_id);
  const s = STATUS_LABELS[instance.status] || { label: instance.status, color: Z.tm };

  const assign = async () => {
    await supabase.from("route_instances").update({ driver_id: selectedDriverId || null, updated_at: new Date().toISOString() }).eq("id", instance.id);
    setAssignModal(false);
    onChanged?.();
    onClose();
  };

  const resendSms = async () => {
    // Phase 6 wiring: call driver-auth Edge Function with action='issue'.
    alert("Resend SMS: Phase 6 wiring (driver-auth + Twilio). Instance id: " + instance.id);
  };

  return <Modal open={true} onClose={onClose} title={route?.name || "Route Instance"} width={720}>
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
        <Field label="Date" value={fmtDate(instance.scheduled_for)} />
        <Field label="Driver" value={driver?.name || "Unassigned"} valueColor={driver ? Z.tx : Z.da} />
        <Field label="Publication" value={pn(instance.publication_id) || "—"} />
        <Field label="Status" value={s.label} valueColor={s.color} />
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        {(instance.status === "scheduled" || instance.status === "sms_sent") && <>
          <Btn sm v="secondary" onClick={() => setAssignModal(true)}>Assign Driver</Btn>
          {driver && <Btn sm v="secondary" onClick={resendSms}>Resend SMS</Btn>}
        </>}
      </div>

      {loading
        ? <div style={{ padding: "16px 0", color: Z.tm, fontSize: FS.sm }}>Loading stops…</div>
        : <>
          {/* Stop list with confirmations */}
          <div>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", marginBottom: 6 }}>Stops ({instance.completed_stops}/{instance.total_stops})</div>
            <div style={{ maxHeight: 220, overflowY: "auto", border: `1px solid ${Z.bd}`, borderRadius: Ri }}>
              {confirms.length === 0
                ? <div style={{ padding: "14px 12px", color: Z.td, fontSize: FS.sm, textAlign: "center" }}>No confirmations yet. Driver updates populate this list in realtime (Phase 7+).</div>
                : confirms.map(c => {
                  const loc = dropLocations.find(l => l.id === c.drop_location_id);
                  return <div key={c.id} style={{ display: "grid", gridTemplateColumns: "28px 1fr 70px 60px 60px", gap: 8, padding: "6px 10px", borderBottom: `1px solid ${Z.bd}`, fontSize: FS.xs, alignItems: "center" }}>
                    <span style={{ color: Z.tm, fontWeight: FW.heavy, textAlign: "center" }}>{c.stop_order}</span>
                    <div>
                      <div style={{ color: Z.tx, fontWeight: FW.bold }}>{loc?.name || "—"}</div>
                      {c.notes && <div style={{ color: Z.tm, fontSize: FS.micro }}>{c.notes}</div>}
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: FW.heavy, color: "#fff",
                      background: c.status === "delivered" ? Z.go : c.status === "skipped" ? Z.da : c.status === "partial" ? Z.wa : Z.tm,
                      padding: "2px 6px", borderRadius: Ri, textAlign: "center", textTransform: "uppercase",
                    }}>{c.status}</span>
                    <span style={{ color: Z.tx, fontWeight: FW.bold, textAlign: "right" }}>{c.delivered_qty ?? "—"}/{c.expected_qty}</span>
                    <span style={{ color: Z.tm, fontSize: FS.micro, textAlign: "right" }}>
                      {c.photo_url ? <a href={c.photo_url} target="_blank" rel="noreferrer" style={{ color: Z.ac }}>Photo</a> : c.gps_lat ? "GPS ✓" : "—"}
                    </span>
                  </div>;
                })}
            </div>
          </div>

          {/* Message thread */}
          {messages.length > 0 && <div>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", marginBottom: 6 }}>Messages ({messages.length})</div>
            <div style={{ maxHeight: 140, overflowY: "auto", border: `1px solid ${Z.bd}`, borderRadius: Ri }}>
              {messages.map(m => <div key={m.id} style={{ padding: "6px 10px", fontSize: FS.xs, borderBottom: `1px solid ${Z.bd}` }}>
                <span style={{ fontWeight: FW.heavy, color: m.sender === "driver" ? "#B8893A" : "#3B82F6" }}>{m.sender === "driver" ? "Driver" : "Office"}</span>
                <span style={{ color: Z.tx, marginLeft: 8 }}>{m.body}</span>
              </div>)}
            </div>
          </div>}
        </>}
    </div>

    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
      <Btn onClick={onClose}>Close</Btn>
    </div>

    {/* Assign driver modal */}
    {assignModal && <Modal open={true} onClose={() => setAssignModal(false)} title="Assign Driver" width={380}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: FS.sm, color: Z.tm }}>
          Overrides the template's default driver for this instance only.
        </div>
        <Sel value={selectedDriverId} onChange={e => setSelectedDriverId(e.target.value)}
          options={[{ value: "", label: "Unassigned" }, ...drivers.filter(d => d.isActive).map(d => ({ value: d.id, label: d.name }))]}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="cancel" onClick={() => setAssignModal(false)}>Cancel</Btn>
          <Btn onClick={assign}>Save</Btn>
        </div>
      </div>
    </Modal>}
  </Modal>;
}

function Field({ label, value, valueColor }) {
  return <div style={{ padding: "8px 10px", background: Z.bg, borderRadius: Ri }}>
    <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: valueColor || Z.tx, marginTop: 2 }}>{value}</div>
  </div>;
}
