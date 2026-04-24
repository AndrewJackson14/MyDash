// ============================================================
// resolve-advertiser — email tier resolution for self-serve booking.
//
// Returns a 200 with one of three tiers:
//   exact  — email already on file (auto-link, no confirmation)
//   domain — business-domain match (show "Are you with X?" screen,
//            ONLY business_name disclosed; never rep / contacts / notes)
//   none   — unknown business; treat as new on booking
//
// Always returns 200 (never 404) so the response can't be used to
// enumerate which businesses we have on file. Sliding-window rate
// limit at 10 req/min per IP, backed by resolve_advertiser_log.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const RATE_LIMIT_PER_MIN = 10;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: cors });

const clientIp = (req: Request): string => {
  // x-forwarded-for is added by Supabase's gateway; first entry is the original client.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const ip = clientIp(req);

  // Rate limit: deny if >= RATE_LIMIT_PER_MIN requests from this IP in the last minute.
  const { count: recentCount } = await admin
    .from("resolve_advertiser_log")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());

  if ((recentCount || 0) >= RATE_LIMIT_PER_MIN) {
    return json(429, { error: "rate_limited", retry_after_seconds: 60 });
  }

  let body: { email?: string; site_id?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const email = (body.email || "").trim().toLowerCase();
  const siteId = (body.site_id || "").trim();
  if (!email || !email.includes("@") || !siteId) {
    return json(400, { error: "missing_email_or_site_id" });
  }

  let tier: "exact" | "domain" | "none" = "none";
  let advertiserId: string | null = null;
  let businessName: string | null = null;

  try {
    // 1. EXACT — primary_email
    const { data: primaryHit } = await admin
      .from("advertisers")
      .select("id")
      .eq("site_id", siteId)
      .ilike("primary_email", email)
      .limit(1)
      .maybeSingle();

    if (primaryHit) {
      tier = "exact";
      advertiserId = primaryHit.id;
    } else {
      // 1b. EXACT — advertiser_contacts
      const { data: contactHit } = await admin
        .from("advertiser_contacts")
        .select("advertiser_id, advertisers!inner(id, site_id)")
        .ilike("email", email)
        .eq("advertisers.site_id", siteId)
        .limit(1)
        .maybeSingle();

      if (contactHit) {
        tier = "exact";
        advertiserId = contactHit.advertiser_id;
      } else {
        // 2. DOMAIN — skip free email providers
        const domain = email.split("@")[1];
        const { data: free } = await admin
          .from("free_email_domains")
          .select("domain")
          .eq("domain", domain)
          .maybeSingle();

        if (!free) {
          const { data: domainHit } = await admin
            .from("advertisers")
            .select("id, business_name")
            .eq("site_id", siteId)
            .eq("business_domain", domain)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (domainHit) {
            tier = "domain";
            advertiserId = domainHit.id;
            businessName = domainHit.business_name; // safe: only field disclosed
          }
        }
      }
    }
  } catch (e) {
    // Don't leak DB errors; treat as none and log so abuse monitoring can see the spike.
    console.error("resolve-advertiser lookup error:", e);
  }

  // Log the call for rate-limit window + abuse monitoring. Fire and forget.
  admin.from("resolve_advertiser_log")
    .insert({ ip, email, tier })
    .then(() => {})
    .catch(() => {});

  return json(200, {
    tier,
    advertiser_id: advertiserId,
    business_name: businessName,
    requires_confirmation: tier === "domain",
  });
});
