// Placeholder for the Driver Messages tab (spec v1.1 §5.6).
// Phase 9 replaces this with the thread-per-driver chat UI, realtime
// Supabase channel subscription, and attachment upload.
import { Z, FS } from "../../lib/theme";
import { GlassCard } from "../../components/ui";

export default function DriverMessages() {
  return <GlassCard>
    <div style={{ padding: "24px 20px", color: Z.tm, fontSize: FS.sm, lineHeight: 1.6 }}>
      <div style={{ fontSize: FS.md, fontWeight: 700, color: Z.tx, marginBottom: 6 }}>Messages</div>
      Thread-per-driver office chat. Left rail lists drivers sorted by most
      recent message; right pane shows the thread with a route-instance
      context strip on top. Lands in Phase 9.
    </div>
  </GlassCard>;
}
