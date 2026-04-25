// ============================================================
// route-instance-cron — daily job that creates upcoming
// route_instance rows 48 hours before each scheduled delivery.
//
// Multi-pub aware (migration 131): for each active template, look at
// the full pub set from driver_route_pubs, find any issue across those
// pubs in the next 48h, and create ONE instance per (template, date)
// — so a route that delivers PRP + AN + SYV on the same Wednesday
// dispatches one run, not three. The anchor issue_id is the earliest
// matching issue for the primary pub (falls back to any pub).
//
// Invoked from pg_cron (migration 128) at 06:00 PT daily.
// Service_role JWT required.
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
  const lookaheadEnd = new Date(now.getTime() + 48 * 3600_000).toISOString().slice(0, 10);

  // 1. Active templates. We don't filter by publication_id on the
  //    template anymore — driver_route_pubs is the source of truth.
  const { data: templates, error: tplErr } = await admin
    .from("driver_routes")
    .select("id, publication_id, default_driver_id")
    .eq("is_active", true);
  if (tplErr) return json({ error: tplErr.message }, 500, cors);

  const results: any[] = [];
  for (const tpl of (templates || [])) {
    // 2. This template's full pub set. Empty set = ad-hoc only, skip.
    const { data: pubLinks } = await admin
      .from("driver_route_pubs")
      .select("publication_id, is_primary")
      .eq("route_id", tpl.id);
    const pubIds: string[] = (pubLinks || []).map((r: any) => r.publication_id);
    if (pubIds.length === 0) continue;
    const primaryPubId = (pubLinks || []).find((r: any) => r.is_primary)?.publication_id || pubIds[0];

    // 3. All issues across any pub in the set, in the window.
    //    Group by date so we dispatch once per calendar day even if
    //    multiple pubs publish same day.
    const { data: issues } = await admin
      .from("issues")
      .select("id, pub_id, date")
      .in("pub_id", pubIds)
      .gte("date", today)
      .lte("date", lookaheadEnd)
      .order("date");

    const byDate = new Map<string, any[]>();
    for (const iss of (issues || [])) {
      if (!byDate.has(iss.date)) byDate.set(iss.date, []);
      byDate.get(iss.date)!.push(iss);
    }

    for (const [date, dayIssues] of byDate.entries()) {
      // 4. Skip if an instance already exists for (template, date).
      const { data: existing } = await admin
        .from("route_instances")
        .select("id")
        .eq("route_template_id", tpl.id)
        .eq("scheduled_for", date)
        .maybeSingle();
      if (existing) continue;

      // 5. Anchor issue_id: pick the primary pub's issue if that pub
      //    publishes that day, else first of the day.
      const anchorIssue = dayIssues.find((i: any) => i.pub_id === primaryPubId) || dayIssues[0];

      const { count: stopCount } = await admin
        .from("route_stops")
        .select("id", { count: "exact", head: true })
        .eq("route_id", tpl.id);

      const { data: inserted, error: insErr } = await admin.from("route_instances").insert({
        route_template_id: tpl.id,
        issue_id: anchorIssue.id,
        publication_id: anchorIssue.pub_id,
        driver_id: tpl.default_driver_id || null,
        scheduled_for: date,
        status: "scheduled",
        total_stops: stopCount || 0,
      }).select("id").single();

      if (insErr) { results.push({ template_id: tpl.id, error: insErr.message }); continue; }

      await admin.from("location_audit_log").insert({
        entity_type: "route_template",
        entity_id: tpl.id,
        action: "created",
        actor_type: "system",
        context: {
          route_id: tpl.id,
          issue_id: anchorIssue.id,
          pubs: pubIds,
          reason: pubIds.length > 1 ? "Auto-cron created multi-pub scheduled instance" : "Auto-cron created scheduled instance",
          instance_id: inserted.id,
        },
      });

      results.push({ template_id: tpl.id, instance_id: inserted.id, scheduled_for: date, pubs: pubIds });
    }
  }

  return json({ created: results.filter(r => r.instance_id).length, results }, 200, cors);
});
