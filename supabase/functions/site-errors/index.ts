import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info, x-publication-id",
};

function getAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

      // Accept single error or batch
      const errors = Array.isArray(body.errors) ? body.errors : [body];

      const rows = errors.map((e: any) => ({
        publication_id: pubId,
        url: e.url || "",
        status_code: e.status_code || e.statusCode || null,
        error_type: e.error_type || e.type || "runtime",
        message: e.message || null,
        stack_trace: e.stack_trace || e.stack || null,
        user_agent: e.user_agent || req.headers.get("user-agent") || null,
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
    const url = new URL(req.url);
    const pubId = url.searchParams.get("publication_id");
    const resolved = url.searchParams.get("resolved") === "true";
    const limit = parseInt(url.searchParams.get("limit") || "50");
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
