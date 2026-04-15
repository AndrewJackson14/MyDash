// ============================================================
// SalesMetrics — lead→close, revenue mix, retention, per-rep
// breakdown. Rendered under Performance > Sales tab.
// ============================================================
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../../lib/theme";
import { GlassCard, GlassStat, DataTable } from "../../components/ui";
import { fmtCurrencyWhole } from "../../lib/formatters";
import { proximityColorKey } from "./deadlineProximity";

const colorFor = (key) => key === "green" ? Z.go : key === "amber" ? Z.wa : Z.da;

function MixBar({ existingPct, newPct }) {
  // Target 70/30 — draw a dashed line at the 70% mark over the stacked bar.
  return <div style={{ position: "relative", height: 18, borderRadius: Ri, background: Z.sa, overflow: "hidden" }}>
    <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${existingPct}%`, background: Z.ac, transition: "width 0.4s" }} />
    <div style={{ position: "absolute", top: 0, left: `${existingPct}%`, height: "100%", width: `${newPct}%`, background: Z.wa, transition: "width 0.4s" }} />
    {/* 70% target marker */}
    <div style={{ position: "absolute", top: -2, bottom: -2, left: "70%", width: 1, borderLeft: `2px dashed ${Z.tx}`, opacity: 0.6 }} />
    <div style={{ position: "absolute", right: 6, top: 2, fontSize: 9, color: Z.td, fontFamily: COND, fontWeight: FW.heavy }}>TARGET 70/30</div>
  </div>;
}

export default function SalesMetrics({ data, onNavigate }) {
  if (!data) return <GlassCard><div style={{ padding: 24, color: Z.td, textAlign: "center" }}>Loading sales metrics…</div></GlassCard>;

  const leadColor = colorFor(proximityColorKey(data.leadToClosePct));
  const deltaPositive = data.revenueDelta >= 0;

  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
      <GlassStat
        label="Lead → Close"
        value={`${Math.round(data.leadToClosePct)}%`}
        sub={`${data.closedInRange} closed of ${data.leadsInRange} leads`}
        color={leadColor}
      />
      <GlassStat
        label="Revenue (Period)"
        value={fmtCurrencyWhole(data.totalRev)}
        sub={`${deltaPositive ? "\u2191" : "\u2193"} ${Math.abs(Math.round(data.revenueDelta))}% vs prior`}
        color={deltaPositive ? Z.go : Z.da}
      />
      <GlassStat
        label="Existing Revenue"
        value={`${Math.round(data.existingPct)}%`}
        sub={fmtCurrencyWhole(data.existingRev)}
        color={data.existingPct >= 70 ? Z.go : Z.wa}
      />
      <GlassStat
        label="New Revenue"
        value={`${Math.round(data.newPct)}%`}
        sub={fmtCurrencyWhole(data.newRev)}
        color={data.newPct >= 30 ? Z.go : Z.wa}
      />
    </div>

    {/* Revenue mix bar with 70/30 target */}
    <GlassCard>
      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Revenue Mix — existing vs new clients (target 70 / 30)</div>
      <MixBar existingPct={data.existingPct} newPct={data.newPct} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS.xs, color: Z.tm, marginTop: 6 }}>
        <span>Existing ({Math.round(data.existingPct)}%)</span>
        <span>New ({Math.round(data.newPct)}%)</span>
      </div>
    </GlassCard>

    {/* Rolling retention */}
    <GlassCard>
      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Client Retention (rolling)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { label: "30 days", value: data.retention30 },
          { label: "60 days", value: data.retention60 },
          { label: "90 days", value: data.retention90 },
        ].map(r => {
          const color = colorFor(proximityColorKey(r.value));
          return <div key={r.label} style={{ padding: 14, background: Z.sa, borderRadius: R, borderLeft: `3px solid ${color}` }}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5 }}>{r.label}</div>
            <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginTop: 4 }}>{Math.round(r.value)}%</div>
            <div style={{ marginTop: 6, height: 5, background: Z.bg, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, r.value)}%`, height: "100%", background: color, transition: "width 0.4s" }} />
            </div>
          </div>;
        })}
      </div>
    </GlassCard>

    {/* Per-rep table */}
    <GlassCard style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, padding: "14px 16px 8px" }}>By Salesperson</div>
      <DataTable>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Rep</th>
            <th style={{ textAlign: "right" }}>Leads</th>
            <th style={{ textAlign: "right" }}>Closed</th>
            <th style={{ textAlign: "right" }}>Lead→Close</th>
            <th style={{ textAlign: "right" }}>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {data.perRep.length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: Z.td }}>No salesperson activity this period</td></tr>}
          {data.perRep.map(r => {
            const repColor = colorFor(proximityColorKey(r.leadToClose));
            return <tr key={r.id}>
              <td style={{ fontWeight: FW.bold, color: Z.tx }}>{r.name}</td>
              <td style={{ textAlign: "right", color: Z.tm }}>{r.leads}</td>
              <td style={{ textAlign: "right", color: Z.tm }}>{r.closed}</td>
              <td style={{ textAlign: "right", color: repColor, fontWeight: FW.bold }}>{Math.round(r.leadToClose)}%</td>
              <td style={{ textAlign: "right", fontWeight: FW.bold, color: Z.tx }}>{fmtCurrencyWhole(r.revenue)}</td>
            </tr>;
          })}
        </tbody>
      </DataTable>
    </GlassCard>
  </div>;
}
