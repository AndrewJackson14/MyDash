// DriverHome — today's assigned route_instances.
//
// Phase 6 ships the list view. Phase 7 adds the route view that
// each card opens into. Reads come through the driver JWT so RLS
// migration 127 scopes results to this driver only.
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { fmtDate } from "../../lib/formatters";

const TEXT = "#E8EAED";
const MUTED = "#94A3B8";
const GOLD = "#B8893A";
const GREEN = "#2F855A";
const AMBER = "#B7791F";
const PANEL_BG = "#1A1F2E";
const PANEL_BD = "#2D3548";

const STATUS_LABEL = {
  scheduled:   { label: "Scheduled",   color: AMBER },
  sms_sent:    { label: "Ready",       color: AMBER },
  in_progress: { label: "In progress", color: GOLD },
  complete:    { label: "Done",        color: GREEN },
};

export default function DriverHome({ driverId, onSignOut, onOpenRoute }) {
  const [instances, setInstances] = useState([]);
  const [driverName, setDriverName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    const today = new Date().toISOString().slice(0, 10);
    // RLS already scopes route_instances to driver_id == JWT claim.
    // We further filter by date so home is always "today only".
    const [iRes, dRes] = await Promise.all([
      supabase
        .from("route_instances")
        .select("id, route_template_id, status, scheduled_for, total_stops, completed_stops, skipped_stops")
        .eq("scheduled_for", today)
        .order("scheduled_for"),
      supabase.from("drivers").select("name").eq("id", driverId).maybeSingle(),
    ]);
    if (iRes.error) setError(iRes.error.message);
    setInstances(iRes.data || []);
    setDriverName(dRes.data?.name?.split(" ")[0] || "Driver");
    setLoading(false);
  };

  useEffect(() => { load(); }, [driverId]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px 80px" }}>
    {/* Header */}
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      marginBottom: 20,
    }}>
      <div>
        <div style={{ fontSize: 12, color: MUTED, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>13 Stars</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: TEXT, marginTop: 2 }}>Hi, {driverName}</div>
      </div>
      <button onClick={load} style={{
        background: PANEL_BG, color: MUTED, border: `1px solid ${PANEL_BD}`,
        padding: "8px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer",
      }}>Refresh</button>
    </div>

    <div style={{ fontSize: 12, color: MUTED, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 10 }}>
      Today · {fmtDate(new Date().toISOString().slice(0, 10))}
    </div>

    {loading && <div style={{ padding: "32px 0", textAlign: "center", color: MUTED, fontSize: 14 }}>Loading routes…</div>}
    {error && <div style={{
      padding: "12px 14px", background: "#C5303018", color: "#F87171",
      borderRadius: 10, fontSize: 13, marginBottom: 12,
    }}>{error}</div>}

    {!loading && instances.length === 0 && <div style={{
      padding: "40px 24px", textAlign: "center",
      background: PANEL_BG, borderRadius: 12, color: MUTED, fontSize: 14, lineHeight: 1.5,
    }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
      No routes scheduled today.<br />
      Cami will text you when one is ready.
    </div>}

    {!loading && instances.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {instances.map(ri => {
        const s = STATUS_LABEL[ri.status] || { label: ri.status, color: MUTED };
        const pct = ri.total_stops > 0 ? Math.round((ri.completed_stops / ri.total_stops) * 100) : 0;
        const isDone = ri.status === "complete";
        return <button key={ri.id}
          onClick={() => !isDone && onOpenRoute?.(ri.id)}
          disabled={isDone}
          style={{
            background: PANEL_BG, color: TEXT,
            border: `1px solid ${PANEL_BD}`,
            borderLeft: `4px solid ${s.color}`,
            borderRadius: 12, padding: "14px 16px",
            textAlign: "left", cursor: isDone ? "default" : "pointer",
            opacity: isDone ? 0.6 : 1,
            display: "flex", flexDirection: "column", gap: 8,
            minHeight: 80,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>Route #{ri.id.slice(0, 6)}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: s.color, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
          </div>
          <div style={{ fontSize: 13, color: MUTED }}>
            {ri.total_stops} stops
            {ri.completed_stops > 0 && <> · {ri.completed_stops} delivered{ri.skipped_stops > 0 ? ` · ${ri.skipped_stops} skipped` : ""} ({pct}%)</>}
          </div>
          {ri.total_stops > 0 && ri.status === "in_progress" && <div style={{
            height: 4, background: PANEL_BD, borderRadius: 2, overflow: "hidden",
          }}>
            <div style={{ height: "100%", width: `${pct}%`, background: s.color, transition: "width 0.3s" }} />
          </div>}
        </button>;
      })}
    </div>}

    <div style={{ marginTop: 32, textAlign: "center" }}>
      <button onClick={onSignOut} style={{
        background: "transparent", border: `1px solid ${PANEL_BD}`, color: MUTED,
        padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13,
      }}>Sign out</button>
    </div>
  </div>;
}
