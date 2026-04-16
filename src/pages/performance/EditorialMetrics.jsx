// ============================================================
// EditorialMetrics — deadline-relative progress across stories
// inside issues whose ed_deadline falls in the selected window.
// Content Editor = 70% weight, Copy Editor = 30% per the spec.
// ============================================================
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../../lib/theme";
import { GlassCard, GlassStat, DataTable } from "../../components/ui";
import { proximityColorKey } from "./deadlineProximity";

const colorFor = (key) => key === "green" ? Z.go : key === "amber" ? Z.wa : Z.da;

const ROLE_WEIGHT = { "Content Editor": 0.7, "Copy Editor": 0.3 };

export default function EditorialMetrics({ data, onNavigate }) {
  if (!data) return <GlassCard><div style={{ padding: 24, color: Z.td, textAlign: "center" }}>Loading editorial metrics…</div></GlassCard>;

  const onTrackColor = colorFor(proximityColorKey(data.onTrackPct));
  const avgLabel = data.avgScore >= 0 ? `+${Math.round(data.avgScore)}` : `${Math.round(data.avgScore)}`;

  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
      <GlassStat
        label="Team On-Track"
        value={`${Math.round(data.onTrackPct)}%`}
        sub={`${data.onTrack || 0} of ${data.count || 0} stories`}
        color={onTrackColor}
      />
      <GlassStat
        label="Avg Proximity"
        value={avgLabel}
        sub="Stage % − Time %"
        color={data.avgScore >= 0 ? Z.go : Z.da}
      />
      <GlassStat
        label="Stories Tracked"
        value={data.count || 0}
        sub={`${(data.issuesInRange || []).length} issues in window`}
      />
      <GlassStat
        label="Behind Pace"
        value={data.behind || 0}
        sub="Needs attention"
        color={data.behind > 0 ? Z.da : Z.go}
      />
    </div>

    {/* Per-editor table */}
    <GlassCard style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, padding: "14px 16px 8px" }}>By Editor</div>
      <DataTable>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Editor</th>
            <th style={{ textAlign: "left" }}>Role</th>
            <th style={{ textAlign: "right" }}>Stories</th>
            <th style={{ textAlign: "right" }}>On Track</th>
            <th style={{ textAlign: "right" }}>Weight</th>
          </tr>
        </thead>
        <tbody>
          {(!data.perEditor || data.perEditor.length === 0) && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: Z.td }}>No editorial activity in this window</td></tr>}
          {(data.perEditor || []).map(ed => {
            const edColor = colorFor(proximityColorKey(ed.onTrackPct));
            const weight = ROLE_WEIGHT[ed.role] || 0;
            return <tr key={ed.id} onClick={() => onNavigate?.("editorial", { assignee: ed.id })} style={{ cursor: onNavigate ? "pointer" : "default" }}>
              <td style={{ fontWeight: FW.bold, color: Z.ac }}>{ed.name}</td>
              <td style={{ color: Z.tm }}>{ed.role}</td>
              <td style={{ textAlign: "right", color: Z.tm }}>{ed.count}</td>
              <td style={{ textAlign: "right", color: edColor, fontWeight: FW.bold }}>{Math.round(ed.onTrackPct)}%</td>
              <td style={{ textAlign: "right", color: Z.tm }}>{Math.round(weight * 100)}%</td>
            </tr>;
          })}
        </tbody>
      </DataTable>
    </GlassCard>
  </div>;
}
