// AlertBanner.jsx — conditional banner. Renders nothing when alerts is empty.
// Click to expand into a list of items, each linking to its source.

import { useState } from "react";
import { Z, COND, FS, FW, Ri } from "../../../lib/theme";
import { ALERT_SEVERITY } from "../constants";

export default function AlertBanner({ alerts = [], onClickAlert }) {
  const [expanded, setExpanded] = useState(false);
  if (!alerts || alerts.length === 0) return null;

  const hasCritical = alerts.some(a => a.severity === ALERT_SEVERITY.CRITICAL);
  const palette = hasCritical
    ? { bg: Z.da + "18", border: Z.da, text: Z.da }
    : { bg: Z.wa + "18", border: Z.wa, text: Z.wa };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: palette.bg,
        borderLeft: `3px solid ${palette.border}`,
        borderRadius: Ri,
        padding: "10px 14px",
        display: "flex", flexDirection: "column", gap: 8,
      }}
    >
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
      >
        <span aria-hidden style={{ fontSize: 14 }}>⚠</span>
        <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: palette.text, fontFamily: COND, flex: 1 }}>
          {alerts.length} item{alerts.length === 1 ? "" : "s"} need{alerts.length === 1 ? "s" : ""} your attention
        </span>
        <span style={{ fontSize: 10, color: palette.text, fontFamily: COND, opacity: 0.7 }}>
          {expanded ? "Hide" : "Show"}
        </span>
      </div>

      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 24 }}>
          {alerts.map((a, i) => (
            <div
              key={`${a.alert_type}-${a.source_id}-${i}`}
              onClick={() => onClickAlert?.(a)}
              style={{
                fontSize: FS.sm, color: Z.tx, fontFamily: COND,
                padding: "6px 10px", borderRadius: Ri,
                background: Z.bg,
                cursor: onClickAlert ? "pointer" : "default",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <span style={{
                fontSize: 9, fontWeight: FW.heavy, textTransform: "uppercase", letterSpacing: 0.5,
                padding: "2px 6px", borderRadius: 999,
                background: a.severity === ALERT_SEVERITY.CRITICAL ? Z.da + "25" : Z.wa + "25",
                color: a.severity === ALERT_SEVERITY.CRITICAL ? Z.da : Z.wa,
              }}>
                {a.severity}
              </span>
              <span style={{ flex: 1 }}>{a.summary}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
