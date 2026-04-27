// ============================================================
// social-cron — scheduled-post worker.
//
// Triggered by pg_cron every minute (see migration 165). Scans
// social_posts for rows where status='scheduled' AND
// scheduled_for <= NOW(), then invokes social-publish for each
// one with the service-role token. The actual publishing logic
// (token refresh, X spend cap, per-destination result rows,
// usage bumps) lives in social-publish — this function is purely
// a fan-out.
//
// Concurrency safety: social-publish flips status to 'publishing'
// before any network I/O via an idempotent guard, so even if two
// cron firings race against the same row, only the first one
// actually sends.
//
// Auth: invoked via the cron's service-role JWT. We don't expose
// any client surface — the function 401s without a service-role
// token, so manual curls from elsewhere are blocked.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// How many scheduled posts to process per cron tick. The publish
// step does sequential network I/O per destination; capping this
// keeps any single tick well under the function timeout. Anything
// remaining gets picked up on the next tick a minute later.
const MAX_PER_TICK = 25;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function isServiceRole(authHeader: string | null): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Lock down: only the cron job (service role) may invoke this. A
  // public-facing scheduled worker is an open invitation to abuse.
  if (!isServiceRole(req.headers.get("Authorization"))) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Pull the next batch of due posts. The partial index on
  // (status, scheduled_for) WHERE status='scheduled' (mig 162) makes
  // this scan tiny + always hot.
  const { data: due, error } = await admin
    .from("social_posts")
    .select("id, scheduled_for")
    .eq("status", "scheduled")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(MAX_PER_TICK);

  if (error) {
    console.error("social-cron query failed:", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!due || due.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fan out — fire social-publish for each, in parallel. social-publish
  // owns the lock-then-publish guard via the status='publishing' flip,
  // so racing cron ticks against the same row is safe (the second one
  // hits the "already publishing" guard and bails).
  const results = await Promise.allSettled(
    due.map((p) =>
      fetch(`${SUPABASE_URL}/functions/v1/social-publish`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ postId: p.id }),
      }).then((r) => r.ok)
    ),
  );

  const ok = results.filter((r) => r.status === "fulfilled" && r.value).length;
  const failed = results.length - ok;

  return new Response(JSON.stringify({
    ok: true,
    processed: results.length,
    succeeded: ok,
    failed,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
