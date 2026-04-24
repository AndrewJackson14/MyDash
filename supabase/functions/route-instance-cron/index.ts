// ============================================================
// route-instance-cron — daily job that creates upcoming
// route_instance rows 48 hours before each scheduled delivery.
//
// Spec v1.1 §7.1 sketches the cron using a non-existent
// publications.schedule_pattern column. The real schema already has
// generated issues with publication dates, so this simpler variant
// joins driver_routes → issues (by publication_id) and inserts an
// instance for any issue in the next 48h that doesn't already have
// one.
//
// Invoked from pg_cron (migration 107 pattern) at 06:00 PT daily.
// Also callable manually via POST {force: true} to backfill.
//
// Auth: service_role JWT required (same pattern as scheduled-tasks).
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

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

// Service-role only — pg_cron uses the Vault-stored key; manual calls
// use the same. No user JWT path (would be a DoS vector).
function isServiceRole(authHeader: string): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  try {
    const payload = JSON.parse(atob(authHeader.slice(7).split(".")[1]));
    return payload.role === "service_role";
  } catch { return false; }
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

serve(async (req) => {
  const cors = corsFor(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (!isServiceRole(req.headers.get("Authorization") || "")) {
    return json({ error: "service_role required" }, 401, cors);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  // Window: today through today+2 days (48h lookahead).
  const lookaheadEnd = new Date(now.getTime() + 48 * 3600_000).toISOString().slice(0, 10);

  // 1. Active templates with a publication set (routes without a pub
  //    can't auto-schedule — they're ad-hoc only, activated via the
  //    Routes tab "Activate Now" button).
  const { data: templates, error: tplErr } = await admin
    .from("driver_routes")
    .select("id, publication_id, default_driver_id")
    .eq("is_active", true)
    .not("publication_id", "is", null);
  if (tplErr) return json({ error: tplErr.message }, 500, cors);

  const results: any[] = [];
  for (const tpl of (templates || [])) {
    // 2. Find next issue(s) for this publication in the window.
    const { data: issues } = await admin
      .from("issues")
      .select("id, pub_id, date")
      .eq("pub_id", tpl.publication_id)
      .gte("date", today)
      .lte("date", lookaheadEnd)
      .order("date");

    for (const iss of (issues || [])) {
      // 3. Skip if an instance already exists for this template + date.
      const { data: existing } = await admin
        .from("route_instances")
        .select("id")
        .eq("route_template_id", tpl.id)
        .eq("scheduled_for", iss.date)
        .maybeSingle();
      if (existing) continue;

      // 4. Total stops from the template.
      const { count: stopCount } = await admin
        .from("route_stops")
        .select("id", { count: "exact", head: true })
        .eq("route_id", tpl.id);

      const { data: inserted, error: insErr } = await admin.from("route_instances").insert({
        route_template_id: tpl.id,
        issue_id: iss.id,
        publication_id: tpl.publication_id,
        driver_id: tpl.default_driver_id || null,
        scheduled_for: iss.date,
        status: "scheduled",
        total_stops: stopCount || 0,
      }).select("id").single();

      if (insErr) { results.push({ template_id: tpl.id, error: insErr.message }); continue; }

      // 5. Audit trail so the Routes tab's log shows the cron creation.
      await admin.from("location_audit_log").insert({
        entity_type: "route_template",
        entity_id: tpl.id,
        action: "created",
        actor_type: "system",
        context: { route_id: tpl.id, issue_id: iss.id, reason: "Auto-cron created scheduled instance", instance_id: inserted.id },
      });

      results.push({ template_id: tpl.id, instance_id: inserted.id, scheduled_for: iss.date });
    }
  }

  return json({ created: results.filter(r => r.instance_id).length, results }, 200, cors);
});
