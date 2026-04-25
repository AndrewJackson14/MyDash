// Efficiency tab inside the Route detail modal.
// Calls route-optimize (Mapbox Optimization v1 proxy) with the current
// stop order and shows how much the optimal order would save.
//
// Chunking: Mapbox caps Optimization at 12 stops per call. For longer
// routes (the ANM+PRM import at 114 stops is the driving case) we
// split into geographic chunks of ≤12 (sorted by lat so each chunk is
// a north-south slice), optimize each chunk independently, sum the
// savings, and stitch the recommended orders. The result is a good
// local-optimum approximation — not provably global-optimal, but
// surfaces the "is this route well-ordered" signal Cami needs.
//
// Caveats:
//   - Requires every stop to be geocoded (drop_locations.lat/lng both
//     non-null). Ungeocoded stops are excluded — surfaced inline.
//   - Chunked optimization doesn't optimize ACROSS chunk boundaries,
//     so the between-chunks transitions might still be suboptimal.
//     Fine for the daily use case; if we ever need global optimality
//     we'd switch to a real OR solver.
//   - Clicking "Apply optimized order" rewrites route_stops.stop_order
//     (and sort_order for legacy readers), writes an audit entry.
import { useEffect, useMemo, useState } from "react";
import { Z, COND, FS, FW, R, Ri } from "../../lib/theme";
import { Btn } from "../../components/ui";
import { supabase, EDGE_FN_URL } from "../../lib/supabase";

const CHUNK_SIZE = 12; // Mapbox Optimization v1 hard cap
const fmtMin  = (s) => s >= 60 ? `${Math.round(s / 60)} min` : `${s}s`;
const fmtMile = (m) => (m * 0.000621371).toFixed(1) + " mi";

export default function RouteEfficiencyTab({ route, stops, locs, currentUser }) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);
  const [chunkProgress, setChunkProgress] = useState({ done: 0, total: 0 });

  const { geocoded, ungeocoded } = useMemo(() => {
    const g = []; const u = [];
    for (const s of stops) {
      const loc = locs.find(l => l.id === s.dropLocationId);
      if (!loc) continue;
      if (typeof loc.lat === "number" && typeof loc.lng === "number") g.push({ stop: s, loc });
      else u.push({ stop: s, loc });
    }
    return { geocoded: g, ungeocoded: u };
  }, [stops, locs]);

  // Split geocoded stops into chunks. Sort north-south by lat within
  // each chunk so the chunk itself is a spatially coherent leg rather
  // than a random sample. This keeps the stitched order locally sane.
  const chunks = useMemo(() => {
    if (geocoded.length <= CHUNK_SIZE) return [geocoded];
    const sorted = [...geocoded].sort((a, b) => b.loc.lat - a.loc.lat);
    const out = [];
    for (let i = 0; i < sorted.length; i += CHUNK_SIZE) out.push(sorted.slice(i, i + CHUNK_SIZE));
    return out;
  }, [geocoded]);

  const runAudit = async () => {
    setLoading(true); setError(null); setResult(null); setChunkProgress({ done: 0, total: chunks.length });
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("Sign in required");

      const chunkResults = [];
      for (const chunk of chunks) {
        if (chunk.length < 2) { chunkResults.push(null); continue; }
        const r = await fetch(`${EDGE_FN_URL}/route-optimize`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: supabase.supabaseKey || "" },
          body: JSON.stringify({
            stops: chunk.map(g => ({ id: g.stop.id, lat: g.loc.lat, lng: g.loc.lng, name: g.loc.name })),
          }),
        });
        const json = await r.json();
        if (json.status !== "success") throw new Error(json.reason || "Chunk optimization failed");
        chunkResults.push(json);
        setChunkProgress(p => ({ ...p, done: p.done + 1 }));
      }

      // Aggregate: sum current/optimized durations + distances across chunks,
      // concat orders. The "current" order is just geocoded in its input
      // order (which was CSV/stop_order); the "optimized" order is each
      // chunk's optimal sequence stitched together.
      const current = chunkResults.reduce((acc, c) => c ? {
        duration_s: acc.duration_s + c.current.duration_s,
        distance_m: acc.distance_m + c.current.distance_m,
      } : acc, { duration_s: 0, distance_m: 0 });
      const optimized = chunkResults.reduce((acc, c) => c ? {
        duration_s: acc.duration_s + c.optimized.duration_s,
        distance_m: acc.distance_m + c.optimized.distance_m,
      } : acc, { duration_s: 0, distance_m: 0 });
      const currentOrder = chunks.flatMap(c => c.map(g => g.stop.id));
      const optimizedOrder = chunkResults.flatMap((c, i) => c ? c.optimized.order : chunks[i].map(g => g.stop.id));

      const timeSaved = Math.max(0, current.duration_s - optimized.duration_s);
      const distSaved = Math.max(0, current.distance_m - optimized.distance_m);

      setResult({
        chunked: chunks.length > 1,
        chunkCount: chunks.length,
        current: { ...current, order: currentOrder },
        optimized: { ...optimized, order: optimizedOrder },
        savings: {
          duration_s: timeSaved, distance_m: distSaved,
          pct_time:     current.duration_s > 0 ? Math.round((timeSaved / current.duration_s) * 1000) / 10 : 0,
          pct_distance: current.distance_m > 0 ? Math.round((distSaved / current.distance_m) * 1000) / 10 : 0,
        },
      });
    } catch (e) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (geocoded.length >= 2) runAudit();
    else setLoading(false);
  }, [route?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyOptimized = async () => {
    if (!result?.optimized?.order) return;
    setApplying(true);
    try {
      const updates = result.optimized.order.map((stopId, newIdx) => ({
        id: stopId, stop_order: newIdx, sort_order: newIdx,
      }));
      for (const u of updates) {
        await supabase.from("route_stops")
          .update({ stop_order: u.stop_order, sort_order: u.sort_order })
          .eq("id", u.id);
      }
      await supabase.from("location_audit_log").insert({
        entity_type: "route_template",
        entity_id: route.id,
        action: "reordered",
        actor_type: "office",
        actor_team_member_id: currentUser?.id || null,
        field_changes: {
          optimization: {
            saved_seconds: result.savings.duration_s,
            saved_meters: result.savings.distance_m,
            pct_time: result.savings.pct_time,
            chunked: result.chunked,
            chunk_count: result.chunkCount,
          },
        },
        context: {
          route_id: route.id,
          reason: result.chunked
            ? `Applied Mapbox-optimized stop order (chunked across ${result.chunkCount} legs)`
            : "Applied Mapbox-optimized stop order",
        },
      });
      setApplying(false);
      await runAudit();
    } catch (e) {
      setError(String(e?.message ?? e));
      setApplying(false);
    }
  };

  if (geocoded.length < 2) {
    return <div style={{ padding: "20px 16px", color: Z.tm, fontSize: FS.sm, lineHeight: 1.6 }}>
      Efficiency audit needs at least 2 geocoded stops.
      {ungeocoded.length > 0 && <div style={{ marginTop: 8, color: Z.wa }}>
        {ungeocoded.length} stop{ungeocoded.length === 1 ? "" : "s"} missing lat/lng — import the CSV again or edit locations to add coordinates.
      </div>}
    </div>;
  }

  return <div style={{ marginTop: 12 }}>
    {chunks.length > 1 && !result && <div style={{
      padding: "8px 12px", background: Z.ac + "12", borderRadius: Ri, fontSize: FS.xs, color: Z.tm, marginBottom: 10,
    }}>
      Long route: splitting {geocoded.length} stops into {chunks.length} chunks of ≤{CHUNK_SIZE} (Mapbox Optimization v1 cap). Optimizing within each chunk and stitching — global order may miss inter-chunk optima.
    </div>}

    {loading && <div style={{ padding: "16px 12px", color: Z.tm, fontSize: FS.sm }}>
      Running Mapbox optimization… {chunkProgress.total > 1 && `(${chunkProgress.done}/${chunkProgress.total} chunks)`}
    </div>}
    {error && <div style={{ padding: "10px 14px", background: Z.da + "18", color: Z.da, borderRadius: Ri, fontSize: FS.sm, marginBottom: 12 }}>{error}</div>}

    {result && <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        <SavingsStat label="Time saved" value={fmtMin(result.savings.duration_s)} pct={result.savings.pct_time} color={result.savings.pct_time > 0 ? Z.go : Z.tm} />
        <SavingsStat label="Distance saved" value={fmtMile(result.savings.distance_m)} pct={result.savings.pct_distance} color={result.savings.pct_distance > 0 ? Z.go : Z.tm} />
        <div style={{ padding: "10px 14px", background: Z.bg, borderRadius: Ri, textAlign: "center" }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase", letterSpacing: 0.5 }}>Per run</div>
          <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, marginTop: 2 }}>{fmtMin(result.current.duration_s)}</div>
          <div style={{ fontSize: FS.micro, color: Z.td, fontFamily: COND }}>current route total</div>
        </div>
      </div>

      {result.chunked && <div style={{
        padding: "6px 10px", background: Z.sa, borderRadius: Ri, fontSize: FS.micro, color: Z.tm, marginBottom: 12,
      }}>
        Analyzed across {result.chunkCount} chunks of ≤{CHUNK_SIZE} stops. Inter-chunk transitions are not optimized — actual savings may be higher with a global solver.
      </div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <OrderColumn label="Current order" order={result.current.order} geocoded={geocoded} color={Z.tm} />
        <OrderColumn label="Optimized order" order={result.optimized.order} geocoded={geocoded} color={Z.ac} highlight />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14, alignItems: "center" }}>
        {result.savings.pct_time > 0
          ? <>
              <span style={{ fontSize: FS.xs, color: Z.tm }}>Rewrites stop_order on all {result.optimized.order.length} stops</span>
              <Btn onClick={applyOptimized} disabled={applying}>
                {applying ? "Applying…" : `Apply optimized order (−${result.savings.pct_time}%)`}
              </Btn>
            </>
          : <span style={{ fontSize: FS.sm, color: Z.go, fontWeight: FW.bold }}>✓ Route is already optimal</span>}
      </div>

      {ungeocoded.length > 0 && <div style={{ marginTop: 12, padding: "8px 12px", background: Z.wa + "18", color: Z.wa, borderRadius: Ri, fontSize: FS.xs }}>
        {ungeocoded.length} stop{ungeocoded.length === 1 ? "" : "s"} excluded from the audit (missing lat/lng): {ungeocoded.map(u => u.loc.name).join(", ")}
      </div>}
    </>}
  </div>;
}

function SavingsStat({ label, value, pct, color }) {
  return <div style={{ padding: "10px 14px", background: color + "18", borderRadius: Ri, textAlign: "center" }}>
    <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
    <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, marginTop: 2 }}>{value}</div>
    <div style={{ fontSize: FS.micro, color, fontFamily: COND, fontWeight: FW.bold }}>
      {pct > 0 ? `−${pct}%` : pct < 0 ? `+${Math.abs(pct)}%` : "no change"}
    </div>
  </div>;
}

function OrderColumn({ label, order, geocoded, color, highlight }) {
  return <div>
    <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color, textTransform: "uppercase", marginBottom: 6, letterSpacing: 0.5 }}>{label}</div>
    <div style={{
      border: `1px solid ${highlight ? color + "55" : Z.bd}`,
      borderRadius: Ri,
      background: highlight ? color + "08" : "transparent",
      maxHeight: 360, overflowY: "auto",
    }}>
      {order.map((stopId, i) => {
        const g = geocoded.find(x => x.stop.id === stopId);
        if (!g) return null;
        return <div key={stopId + "_" + i} style={{
          display: "grid", gridTemplateColumns: "28px 1fr",
          gap: 8, padding: "6px 10px", borderBottom: `1px solid ${Z.bd}`,
          fontSize: FS.sm,
        }}>
          <span style={{ fontWeight: FW.heavy, color, textAlign: "center" }}>{i + 1}</span>
          <div>
            <div style={{ fontWeight: FW.semi, color: Z.tx }}>{g.loc.name}</div>
            <div style={{ fontSize: FS.micro, color: Z.td }}>{g.loc.city}</div>
          </div>
        </div>;
      })}
    </div>
  </div>;
}
