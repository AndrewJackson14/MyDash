// Placeholder for the Route Instances tab (spec v1.1 §5.4).
// Phase 5 replaces this with the daily ops view (Today / Upcoming /
// History segmented control, detail drawer, Activate Now button,
// auto-cron-generated instances).
import { Z, FS, Ri } from "../../lib/theme";
import { GlassCard } from "../../components/ui";

export default function RouteInstances() {
  return <GlassCard>
    <div style={{ padding: "24px 20px", color: Z.tm, fontSize: FS.sm, lineHeight: 1.6 }}>
      <div style={{ fontSize: FS.md, fontWeight: 700, color: Z.tx, marginBottom: 6 }}>Route Instances</div>
      Cami's daily ops view — scheduled / in-progress / completed /
      abandoned route instances, filterable by publication and driver.
      Lands in Phase 5 once the auto-cron Edge Function writes instances
      48 hours before each scheduled delivery.
    </div>
  </GlassCard>;
}
