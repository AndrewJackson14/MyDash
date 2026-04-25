// ============================================================
// route-optimize — proxy over Mapbox Optimization v1.
//
// Input:  { stops: [{id, lat, lng, name?}, ...], start?: {lat,lng} }
// Output: {
//   status: "success",
//   current:   { duration_s, distance_m, order: [ids in input order] },
//   optimized: { duration_s, distance_m, order: [ids in optimal order] },
//   savings:   { duration_s, distance_m, pct_time, pct_distance }
// } | { status: "failed", reason }
//
// Used by:
//   - Route detail modal → Efficiency tab (office-side, audit view of
//     a template; start omitted, stops taken in sort order from
//     route_stops joined to drop_locations.lat/lng)
//   - Driver app (Phase 8) → "Optimize from here" button (start = GPS
//     blue dot, stops = remaining un-delivered)
//
// Mapbox call: Optimization v1 supports 2-12 coordinates per request.
// We submit stops once in input order to get baseline duration/distance
// (via Directions), then once more with roundtrip=false for the
// optimized order. The optimization API also returns the waypoint
// indices in their optimized order so we can map back to input IDs.
//
// Cost at 13 Stars scale (~100 runs/month): pennies.
//
// Auth: authenticated staff JWT required. The driver-app version will
// call via the driver JWT path (policies don't change — the function
// only proxies Mapbox, it doesn't touch Supabase tables).
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const MAPBOX_TOKEN = Deno.env.get("MAPBOX_SERVER_TOKEN") || "";
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://mydash.media,http://localhost:5173,http://localhost:4173").split(",");

const MIN_STOPS = 2;
const MAX_STOPS = 12; // Mapbox Optimization v1 hard cap

function corsFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
    "Vary": "Origin",
  };
}

function authed(authHeader: string): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  try {
    const payload = JSON.parse(atob(authHeader.slice(7).split(".")[1]));
    return payload.role === "authenticated" || payload.role === "service_role";
  } catch { return false; }
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Format a coordinate list for Mapbox: "lng1,lat1;lng2,lat2;..."
function coordsToMapbox(points: Array<{ lat: number; lng: number }>): string {
  return points.map(p => `${p.lng},${p.lat}`).join(";");
}

async function mapboxDirections(points: Array<{ lat: number; lng: number }>) {
  // Directions API for driving profile — gives total duration + distance
  // along the caller-supplied order. Used as the "current" baseline.
  const coords = coordsToMapbox(points);
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${MAPBOX_TOKEN}&overview=false&geometries=geojson`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Directions ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const route = data.routes?.[0];
  if (!route) throw new Error("No directions route returned");
  return { duration_s: route.duration, distance_m: route.distance };
}

async function mapboxOptimize(points: Array<{ lat: number; lng: number }>) {
  // Optimization v1 returns the solved TSP order + total duration/distance.
  // roundtrip=false means the route ends at the last waypoint (don't
  // force returning to start). source=first / destination=last pins
  // endpoints — useful when the driver starts at a depot.
  const coords = coordsToMapbox(points);
  const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coords}?access_token=${MAPBOX_TOKEN}&roundtrip=false&source=first&destination=last&overview=false`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Optimization ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const trip = data.trips?.[0];
  if (!trip) throw new Error("No optimized trip returned");
  // waypoints: array of { waypoint_index, trips_index, name, location }
  // waypoint_index is the position in the INPUT; we want the input-indices
  // in visit order, which comes from sorting waypoints by trips_index.
  const waypoints = [...(data.waypoints || [])].sort((a, b) => a.waypoint_index - b.waypoint_index);
  // Map each input coordinate position to its trips_index (order position).
  const tripOrder = waypoints
    .map((wp: any, inputIdx: number) => ({ inputIdx, tripsIndex: wp.trips_index }))
    .sort((a, b) => a.tripsIndex - b.tripsIndex)
    .map(x => x.inputIdx);
  return { duration_s: trip.duration, distance_m: trip.distance, order: tripOrder };
}

serve(async (req) => {
  const cors = corsFor(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ status: "failed", reason: "POST only" }, 405, cors);

  if (!authed(req.headers.get("Authorization") || "")) {
    return json({ status: "failed", reason: "Not authenticated" }, 401, cors);
  }
  if (!MAPBOX_TOKEN) {
    return json({ status: "failed", reason: "MAPBOX_SERVER_TOKEN not configured" }, 500, cors);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ status: "failed", reason: "bad json" }, 400, cors); }

  const stops: Array<{ id: string; lat: number; lng: number; name?: string }> = Array.isArray(body.stops) ? body.stops : [];
  const validStops = stops.filter(s => s && s.id && typeof s.lat === "number" && typeof s.lng === "number");
  if (validStops.length < MIN_STOPS) {
    return json({ status: "failed", reason: `Need at least ${MIN_STOPS} geocoded stops` }, 200, cors);
  }
  if (validStops.length > MAX_STOPS) {
    return json({ status: "failed", reason: `Mapbox Optimization is limited to ${MAX_STOPS} stops per request. Split long routes into legs.` }, 200, cors);
  }

  // Optional start point (driver GPS) goes first in the coords list.
  const start = body.start && typeof body.start.lat === "number" ? body.start : null;
  const points: Array<{ lat: number; lng: number }> = start
    ? [start, ...validStops]
    : [...validStops];

  try {
    const [current, optimized] = await Promise.all([
      mapboxDirections(points),
      mapboxOptimize(points),
    ]);

    // optimized.order is indices into `points`. If start was prepended,
    // index 0 is the start; strip it and rebase so we return indices
    // into the caller's `stops` array (not our padded points).
    const visitOrderStopIndices = optimized.order
      .filter(i => !start || i !== 0)
      .map(i => start ? i - 1 : i);

    const currentOrder = validStops.map(s => s.id);
    const optimizedOrder = visitOrderStopIndices.map(i => validStops[i].id);

    const timeSaved = Math.max(0, current.duration_s - optimized.duration_s);
    const distSaved = Math.max(0, current.distance_m - optimized.distance_m);

    return json({
      status: "success",
      current: {
        duration_s: Math.round(current.duration_s),
        distance_m: Math.round(current.distance_m),
        order: currentOrder,
      },
      optimized: {
        duration_s: Math.round(optimized.duration_s),
        distance_m: Math.round(optimized.distance_m),
        order: optimizedOrder,
      },
      savings: {
        duration_s: Math.round(timeSaved),
        distance_m: Math.round(distSaved),
        pct_time: current.duration_s > 0 ? Math.round((timeSaved / current.duration_s) * 1000) / 10 : 0,
        pct_distance: current.distance_m > 0 ? Math.round((distSaved / current.distance_m) * 1000) / 10 : 0,
      },
    }, 200, cors);
  } catch (err: any) {
    return json({ status: "failed", reason: String(err?.message ?? err).slice(0, 240) }, 200, cors);
  }
});
