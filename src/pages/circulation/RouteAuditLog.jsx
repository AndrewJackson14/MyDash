// Placeholder for the audit drawer used inside the Routes tab's
// route-detail modal (spec v1.1 §5.3). Phase 4 wires it to the
// location_audit_log table — this stub keeps the import path stable.
import { Z, FS } from "../../lib/theme";

export default function RouteAuditLog({ routeId }) {
  return <div style={{ padding: "16px 18px", color: Z.tm, fontSize: FS.sm, lineHeight: 1.6 }}>
    Audit log — every edit to stops and ordering for route{" "}
    <code style={{ background: Z.bg, padding: "1px 6px", borderRadius: 3 }}>{routeId || "(unspecified)"}</code>.
    Populates in Phase 4.
  </div>;
}
