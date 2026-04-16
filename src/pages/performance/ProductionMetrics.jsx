// ============================================================
// ProductionMetrics — two lanes, Layout Designer (stories past
// Ready) and Ad Designer (ad_projects lifecycle). Each lane has
// its own deadline proximity score + on-track %. Ad lane also
// tracks average revision count (quality metric — lower wins).
// ============================================================
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../../lib/theme";
import { GlassCard, GlassStat, DataTable } from "../../components/ui";
import { proximityColorKey } from "./deadlineProximity";

const colorFor = (key) => key === "green" ? Z.go : key === "amber" ? Z.wa : Z.da;

function LaneStats({ title, agg }) {
  const onTrackColor = colorFor(proximityColorKey(agg.onTrackPct));
  const avgLabel = agg.avgScore >= 0 ? `+${Math.round(agg.avgScore)}` : `${Math.round(agg.avgScore)}`;
  return <div>
    <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{title}</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
      <GlassStat
        label="On Track"
        value={`${Math.round(agg.onTrackPct)}%`}
        sub={`${agg.onTrack || 0} of ${agg.count || 0}`}
        color={onTrackColor}
      />
      <GlassStat
        label="Avg Proximity"
        value={avgLabel}
        sub="Stage % − Time %"
        color={agg.avgScore >= 0 ? Z.go : Z.da}
      />
      <GlassStat
        label="Items Tracked"
        value={agg.count || 0}
      />
      <GlassStat
        label="Behind Pace"
        value={agg.behind || 0}
        color={agg.behind > 0 ? Z.da : Z.go}
      />
    </div>
  </div>;
}

export default function ProductionMetrics({ data, onNavigate }) {
  if (!data) return <GlassCard><div style={{ padding: 24, color: Z.td, textAlign: "center" }}>Loading production metrics…</div></GlassCard>;

  const ads = data.ads || { count: 0, onTrackPct: 0, avgScore: 0, avgRevisions: 0 };
  const layout = data.layout || { count: 0, onTrackPct: 0, avgScore: 0 };

  return <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
    <LaneStats title="Layout Designer — Stories Ready → On Page" agg={layout} />
    <LaneStats title="Ad Designer — Ad Projects Brief → Placed" agg={ads} />

    <GlassCard>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1 }}>Revision Quality</span>
        <span style={{ fontSize: FS.xs, color: Z.td, fontFamily: COND }}>Lower is better</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: FS.xxl, fontWeight: FW.black, color: ads.avgRevisions <= 1 ? Z.go : ads.avgRevisions <= 2 ? Z.wa : Z.da, fontFamily: DISPLAY }}>
          {ads.avgRevisions.toFixed(1)}
        </span>
        <span style={{ fontSize: FS.sm, color: Z.tm }}>
          avg rounds / ad · {ads.revisionTotal || 0} total across {ads.count || 0} ads
        </span>
      </div>
    </GlassCard>

    {/* Per-designer table — ad lane only */}
    <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>By Designer</div>
    <DataTable>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Designer</th>
            <th style={{ textAlign: "left" }}>Role</th>
            <th style={{ textAlign: "right" }}>Ads</th>
            <th style={{ textAlign: "right" }}>On Track</th>
            <th style={{ textAlign: "right" }}>Avg Revisions</th>
          </tr>
        </thead>
        <tbody>
          {(!data.perDesigner || data.perDesigner.length === 0) && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: Z.td }}>No production activity in this window</td></tr>}
          {(data.perDesigner || []).map(dz => {
            const dzColor = colorFor(proximityColorKey(dz.onTrackPct));
            return <tr key={dz.id} onClick={() => onNavigate?.("adprojects", { designer: dz.id })} style={{ cursor: onNavigate ? "pointer" : "default" }}>
              <td style={{ fontWeight: FW.bold, color: Z.ac }}>{dz.name}</td>
              <td style={{ color: Z.tm }}>{dz.role}</td>
              <td style={{ textAlign: "right", color: Z.tm }}>{dz.count}</td>
              <td style={{ textAlign: "right", color: dzColor, fontWeight: FW.bold }}>{Math.round(dz.onTrackPct)}%</td>
              <td style={{ textAlign: "right", color: dz.avgRevisions <= 1 ? Z.go : dz.avgRevisions <= 2 ? Z.wa : Z.da, fontWeight: FW.bold }}>{dz.avgRevisions.toFixed(1)}</td>
            </tr>;
          })}
        </tbody>
      </DataTable>
  </div>;
}
