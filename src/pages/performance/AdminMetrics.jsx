// ============================================================
// AdminMetrics — tickets + subscription KPIs for the Office
// Administrator. Data comes from a live Supabase query inside
// usePerformanceData (service_tickets, ticket_comments,
// subscribers) since tickets aren't always in preloaded state.
// ============================================================
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../../lib/theme";
import { GlassCard, GlassStat } from "../../components/ui";
import { fmtCurrencyWhole } from "../../lib/formatters";
import { proximityColorKey } from "./deadlineProximity";

const colorFor = (key) => key === "green" ? Z.go : key === "amber" ? Z.wa : Z.da;

function formatHours(h) {
  if (!h && h !== 0) return "\u2014";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

// Target inversions — lower is better for response + resolution times, so
// the color key flips: ≤ target hours = green, 2x target = amber, beyond = red.
function timeColor(value, targetHours) {
  if (value == null) return Z.td;
  if (value <= targetHours) return Z.go;
  if (value <= targetHours * 2) return Z.wa;
  return Z.da;
}

export default function AdminMetrics({ data, loading }) {
  if (loading) return <GlassCard><div style={{ padding: 24, color: Z.td, textAlign: "center" }}>Loading admin metrics…</div></GlassCard>;
  if (!data) return <GlassCard><div style={{ padding: 24, color: Z.td, textAlign: "center" }}>No data</div></GlassCard>;

  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    {/* Ticket KPIs */}
    <div>
      <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Service Tickets</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <GlassStat
          label="First Response"
          value={formatHours(data.avgFirstResponseHours)}
          sub="Target ≤ 1h"
          color={timeColor(data.avgFirstResponseHours, 1)}
        />
        <GlassStat
          label="Resolution"
          value={formatHours(data.avgResolutionHours)}
          sub="Target ≤ 48h"
          color={timeColor(data.avgResolutionHours, 48)}
        />
        <GlassStat
          label="Opened"
          value={data.ticketsOpened}
          sub="This period"
        />
        <GlassStat
          label="Closed vs Opened"
          value={`${data.volumeCleared >= 0 ? "+" : ""}${data.volumeCleared}`}
          sub={`${data.ticketsClosed} closed / ${data.ticketsOpened} opened`}
          color={data.volumeCleared >= 0 ? Z.go : Z.da}
        />
      </div>
    </div>

    {/* Subscription KPIs */}
    <div>
      <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Subscriptions</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <GlassStat
          label="Net Subscribers"
          value={`${data.netSubs >= 0 ? "+" : ""}${data.netSubs}`}
          sub={`${data.newSubs} new · ${data.cancelledSubs} lost`}
          color={data.netSubs >= 0 ? Z.go : Z.da}
        />
        <GlassStat
          label="Churn Rate"
          value={`${data.churnRate.toFixed(1)}%`}
          sub="Of active base"
          color={data.churnRate <= 2 ? Z.go : data.churnRate <= 5 ? Z.wa : Z.da}
        />
        <GlassStat
          label="Renewal Rate"
          value={`${Math.round(data.renewalRate)}%`}
          sub="Of expiring subs"
          color={colorFor(proximityColorKey(data.renewalRate))}
        />
        <GlassStat
          label="Subscription Revenue"
          value={fmtCurrencyWhole(data.subRevenue)}
          sub="Collected in period"
        />
      </div>
    </div>
  </div>;
}
