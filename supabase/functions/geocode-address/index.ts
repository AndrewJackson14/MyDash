// ============================================================
// geocode-address — thin Mapbox Geocoding proxy for the Circulation
// module. Keeps MAPBOX_SERVER_TOKEN server-side so we don't ship a
// write-scope token in the browser bundle.
//
// Called from:
//   - DropLocationCSVImport.jsx step 4 (background geocode pass during
//     CSV import)
//   - Driver add-stop flow (spec §6.5) — reverse geocode not implemented
//     here yet, just forward
//
// Request:  POST { address, city, state, zip }
// Response: { status: "success", lat, lng, confidence }
//        |  { status: "failed",  reason }
//
// Auth: require an authenticated (staff) JWT. CSV import fires from the
// Circulation module, which only authed team_members can open anyway.
// The driver app has a separate driver-JWT path (introduced in Phase 6).
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const MAPBOX_TOKEN = Deno.env.get("MAPBOX_SERVER_TOKEN") || "";
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://mydash.media,http://localhost:5173,http://localhost:4173").split(",");

function corsFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
    "Vary": "Origin",
  };
}

function authedSub(authHeader: string): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const payload = JSON.parse(atob(authHeader.slice(7).split(".")[1]));
    if (payload.role !== "authenticated" && payload.role !== "service_role") return null;
    return String(payload.sub || "");
  } catch { return null; }
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const cors = corsFor(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ status: "failed", reason: "POST only" }, 405, cors);

  if (!authedSub(req.headers.get("Authorization") || "")) {
    return json({ status: "failed", reason: "Not authenticated" }, 401, cors);
  }

  if (!MAPBOX_TOKEN) {
    return json({ status: "failed", reason: "MAPBOX_SERVER_TOKEN not configured" }, 500, cors);
  }

  let body: { address?: string; city?: string; state?: string; zip?: string };
  try { body = await req.json(); } catch { return json({ status: "failed", reason: "bad json" }, 400, cors); }

  const { address, city, state, zip } = body;
  if (!address) return json({ status: "failed", reason: "address required" }, 400, cors);

  // Build the query: "123 Main St, Paso Robles, CA 93446"
  const parts = [address, city, state, zip].filter(Boolean).join(", ");
  const query = encodeURIComponent(parts);

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&country=US&limit=1`;
    const r = await fetch(url);
    if (!r.ok) {
      const text = await r.text();
      return json({ status: "failed", reason: `Mapbox ${r.status}: ${text.slice(0, 200)}` }, 200, cors);
    }
    const data = await r.json();
    const feature = data.features?.[0];
    if (!feature) return json({ status: "failed", reason: "no match" }, 200, cors);

    return json({
      status: "success",
      lat: feature.center[1],
      lng: feature.center[0],
      confidence: feature.relevance,
    }, 200, cors);
  } catch (err) {
    return json({ status: "failed", reason: String(err?.message ?? err).slice(0, 200) }, 200, cors);
  }
});
