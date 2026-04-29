// ActivityEventCard.jsx — single event row in the Activity Stream.
// Pure presentation. Formatter does the headline/detail logic.

import { Z, COND, FS, FW, Ri } from "../../../lib/theme";
import { fmtTime, formatActivity } from "../lib/activityFormatters";

export default function ActivityEventCard({ row, ctx }) {
  const fmt = formatActivity(row, ctx || {});
  const headlineColor = fmt.isCritical ? Z.da : Z.tx;

  return (
    <div style={{
      padding: "10px 12px",
      borderBottom: `1px solid ${Z.bd}40`,
      display: "flex", flexDirection: "column", gap: 2,
    }}>
      <div style={{
        fontSize: FS.sm,
        color: headlineColor,
        fontStyle: fmt.isItalic ? "italic" : "normal",
        fontWeight: fmt.isItalic ? FW.semi : FW.semi,
        lineHeight: 1.35,
      }}>
        {/* Bold the actor name when it's the sentence prefix.
            Cheap heuristic: if headline starts with ctx.actorName + " ", split. */}
        {ctx?.actorName && fmt.headline.startsWith(ctx.actorName + " ") ? (
          <>
            <span style={{ fontWeight: FW.bold }}>{ctx.actorName}</span>
            {fmt.headline.slice(ctx.actorName.length)}
          </>
        ) : fmt.headline}
      </div>
      <div style={{ fontSize: 11, color: Z.tm, fontFamily: COND, display: "flex", gap: 8, alignItems: "center" }}>
        <span>{fmtTime(row.created_at || row.occurred_at)}</span>
        {fmt.detail && <span style={{ opacity: 0.7 }}>•</span>}
        {fmt.detail && <span>{fmt.detail}</span>}
      </div>
    </div>
  );
}
