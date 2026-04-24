// Audit log drawer used inside the route detail modal (spec v1.1 §5.3).
// Pulls from location_audit_log filtered by the route (entity_type =
// 'route_template' or 'route_stop' with entity_id on this route, plus
// 'drop_location' entries tied via context.route_id).
import { useEffect, useState } from "react";
import { Z, FS, FW, Ri, COND } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import { fmtDate } from "../../lib/formatters";

const ACTION_LABEL = {
  created:     "created",
  updated:     "updated",
  reordered:   "reordered stops",
  deleted:     "deleted",
  reactivated: "reactivated",
};
const ACTION_COLOR = {
  created:     { tag: "new" },
  updated:     { tag: "chg" },
  reordered:   { tag: "ord" },
  deleted:     { tag: "rm"  },
  reactivated: { tag: "on"  },
};

export default function RouteAuditLog({ routeId, team = [] }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!routeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Match rows directly on the template, on any stop under it, or
      // on a drop_location edit whose context.route_id references this
      // route. One query + client-side filter avoids a second round-trip.
      const { data } = await supabase
        .from("location_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      const rows = (data || []).filter(r =>
        (r.entity_type === "route_template" && r.entity_id === routeId) ||
        (r.entity_type === "route_stop"     && r.context?.route_id === routeId) ||
        (r.entity_type === "drop_location"  && r.context?.route_id === routeId)
      );
      setEntries(rows);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [routeId]);

  const actorName = (e) => {
    if (e.actor_type === "system") return "System";
    if (e.actor_type === "driver") return "Driver";
    const tm = team.find(t => t.id === e.actor_team_member_id);
    return tm?.name || "Staff";
  };

  if (loading) return <div style={{ padding: "18px 16px", color: Z.tm, fontSize: FS.sm }}>Loading audit log…</div>;
  if (entries.length === 0) return <div style={{ padding: "18px 16px", color: Z.tm, fontSize: FS.sm }}>No audit entries yet. Actions on this route will appear here.</div>;

  return <div style={{ maxHeight: 320, overflowY: "auto" }}>
    {entries.map(e => {
      const tag = ACTION_COLOR[e.action]?.tag || "·";
      const summary = summarize(e);
      return <div key={e.id} style={{
        display: "grid",
        gridTemplateColumns: "44px 1fr 90px",
        gap: 8,
        padding: "8px 10px",
        borderBottom: `1px solid ${Z.bd}`,
        fontSize: FS.xs,
        alignItems: "start",
      }}>
        <span style={{
          fontSize: 9, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase",
          background: Z.bg, padding: "2px 6px", borderRadius: Ri, textAlign: "center",
          alignSelf: "start",
        }}>{tag}</span>
        <div>
          <div style={{ color: Z.tx, fontWeight: FW.semi }}>{actorName(e)} {ACTION_LABEL[e.action] || e.action} {e.entity_type.replace("_", " ")}</div>
          {summary && <div style={{ color: Z.tm, marginTop: 2 }}>{summary}</div>}
        </div>
        <div style={{ color: Z.td, fontFamily: COND, textAlign: "right", fontSize: FS.micro }}>
          {fmtDate(e.created_at?.slice(0, 10))}
        </div>
      </div>;
    })}
  </div>;
}

function summarize(e) {
  const c = e.field_changes || {};
  const parts = Object.entries(c).slice(0, 3).map(([k, v]) => {
    if (v && typeof v === "object" && "from" in v) return `${k}: ${v.from} → ${v.to}`;
    return `${k}: ${String(v).slice(0, 40)}`;
  });
  if (parts.length) return parts.join(" · ");
  if (e.context?.reason) return e.context.reason;
  return "";
}
