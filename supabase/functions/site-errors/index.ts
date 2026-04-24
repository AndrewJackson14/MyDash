// ============================================================
// site-errors — ingest runtime errors from StellarPress public sites
// (POST), surface them in the MyDash dashboard (GET).
//
// POST is intentionally unauthenticated: WordPress error reporters can't
// hold a Supabase JWT. Defense-in-depth instead:
//   1. publication_id must match a row in `publications` (table lookup,
//      cached for 5 min). Stops random POSTs to arbitrary IDs.
//   2. Per-publication rate limit (60 inserts/minute by counting recent
//      site_errors rows). Rejects floods without paging anyone.
//   3. Body length cap so an attacker can't fill the table with 10MB
//      stack traces.
// GET requires an authenticated JWT (was open — exposed everyone's
// site error log).
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info, x-publication-id",
};

const RATE_LIMIT_PER_MIN = 60;
const MAX_MESSAGE_LEN = 4000;
const MAX_STACK_LEN = 8000;

function getAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

// 5-minute in-memory cache of valid publication IDs. Edge functions
// run in short-lived isolates, so this is best-effort — a cold start
// just re-fetches once.
const pubCache = { ids: new Set<string>(), at: 0 };
async function isKnownPublication(admin: any, id: string): Promise<boolean> {
  if (!id) return false;
  if (Date.now() - pubCache.at < 5 * 60_000 && pubCache.ids.size) {
    return pubCache.ids.has(id);
  }
  const { data } = await admin.from("publications").select("id").limit(1000);
  pubCache.ids = new Set((data || []).map((p: any) => String(p.id)));
  pubCache.at = Date.now();
  return pubCache.ids.has(id);
}

async function isRateLimited(admin: any, pubId: string): Promise<boolean> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from("site_errors")
    .select("id", { count: "exact", head: true })
    .eq("publication_id", pubId)
    .gte("created_at", since);
  return (count || 0) >= RATE_LIMIT_PER_MIN;
}

function authedRole(authHeader: string): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const payload = JSON.parse(atob(authHeader.slice(7).split(".")[1]));
    if (payload.role !== "authenticated" && payload.role !== "service_role") return null;
    return String(payload.role);
  } catch { return null; }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const admin = getAdmin();

  // ─── POST: Report an error from StellarPress site ───
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const pubId = req.headers.get("x-publication-id") || body.publication_id;

      if (!pubId) {
        return new Response(JSON.stringify({ error: "publication_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!(await isKnownPublication(admin, String(pubId)))) {
        return new Response(JSON.stringify({ error: "unknown publication_id" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (await isRateLimited(admin, String(pubId))) {
        return new Response(JSON.stringify({ error: "rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Accept single error or batch (capped at 50 per request).
      const errors = (Array.isArray(body.errors) ? body.errors : [body]).slice(0, 50);

      const rows = errors.map((e: any) => ({
        publication_id: pubId,
        url: String(e.url || "").slice(0, 1000),
        status_code: e.status_code || e.statusCode || null,
        error_type: String(e.error_type || e.type || "runtime").slice(0, 50),
        message: e.message ? String(e.message).slice(0, MAX_MESSAGE_LEN) : null,
        stack_trace: (e.stack_trace || e.stack) ? String(e.stack_trace || e.stack).slice(0, MAX_STACK_LEN) : null,
        user_agent: String(e.user_agent || req.headers.get("user-agent") || "").slice(0, 500) || null,
        ip_address: e.ip_address || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        metadata: e.metadata || {},
      }));

      const { data, error } = await admin.from("site_errors").insert(rows).select("id");

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ success: true, count: data?.length || 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // ─── GET: Fetch errors for dashboard (requires auth) ───
  if (req.method === "GET") {
    if (!authedRole(req.headers.get("Authorization") || "")) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const pubId = url.searchParams.get("publication_id");
    const resolved = url.searchParams.get("resolved") === "true";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 500);
    const errorType = url.searchParams.get("type");

    let query = admin.from("site_errors").select("*").order("created_at", { ascending: false }).limit(limit);

    if (pubId) query = query.eq("publication_id", pubId);
    query = query.eq("resolved", resolved);
    if (errorType) query = query.eq("error_type", errorType);

    const { data, error } = await query;

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ data, count: data?.length || 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
});
