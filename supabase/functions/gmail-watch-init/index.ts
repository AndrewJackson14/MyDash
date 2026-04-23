// ============================================================
// gmail-watch-init — starts or renews a Gmail users.watch()
// subscription for the caller.
//
// Two callers:
//   1. Frontend (authenticated user JWT) — fires when the Mail
//      page mounts the first time after connect, so push is
//      live by the time they next receive email.
//   2. Cron (service-role JWT) — daily, with body={renew_all:true}.
//      Renews any watch expiring within 36 hours. Gmail caps
//      watch lifetime at 7 days; without renewal, push silently
//      stops.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TOPIC_NAME = Deno.env.get("GMAIL_PUSH_TOPIC") || "projects/spatial-path-239705/topics/gmail-push-mydash";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

function getJwtRole(token: string): string | null {
  try { return JSON.parse(atob(token.split(".")[1])).role || null; } catch { return null; }
}

// Fetches (and refreshes if needed) a user's Google access token
// from the google_tokens table. Same logic as gmail-api/gmail-auth.
async function getGoogleAccessToken(admin: any, userId: string): Promise<string> {
  const { data: row } = await admin.from("google_tokens").select("*").eq("user_id", userId).single();
  if (!row) throw new Error("No connected Google account");

  const expiry = new Date(row.token_expiry).getTime();
  if (expiry - Date.now() > 300_000) return row.access_token;

  if (!row.refresh_token) throw new Error("No refresh token — please reconnect Gmail");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const tokens = await res.json();
  if (!res.ok) throw new Error("Token refresh failed: " + JSON.stringify(tokens));

  const newExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
  await admin.from("google_tokens").update({
    access_token: tokens.access_token,
    token_expiry: newExpiry,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  return tokens.access_token;
}

async function startWatchForUser(admin: any, userId: string): Promise<{ email: string; expiration: Date; historyId: string }> {
  const accessToken = await getGoogleAccessToken(admin, userId);

  // Fetch the user's email from Gmail profile so we can store it on
  // the watch row (the push payload gives us an email, not a user_id).
  const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) throw new Error(`Gmail profile fetch failed: ${profileRes.status}`);
  const profile = await profileRes.json();
  const email = String(profile.emailAddress || "").toLowerCase();

  // users.watch: subscribe INBOX label changes to the Pub/Sub topic.
  // labelFilterAction=include + labelIds=[INBOX] narrows pushes to
  // inbox events only (no Sent / Drafts / Label changes that don't
  // matter for notifications).
  const watchRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topicName: TOPIC_NAME,
      labelIds: ["INBOX"],
      labelFilterAction: "include",
    }),
  });
  const watchText = await watchRes.text();
  if (!watchRes.ok) throw new Error(`Gmail watch failed: ${watchRes.status} ${watchText}`);
  const watch = JSON.parse(watchText);
  // Gmail returns expiration as millis-since-epoch string
  const expiration = new Date(Number(watch.expiration));
  const historyId = String(watch.historyId);

  await admin.from("gmail_watches").upsert({
    user_id: userId,
    email_address: email,
    history_id: historyId,
    expiration_at: expiration.toISOString(),
    last_renewed_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  return { email, expiration, historyId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) return json({ error: "Not authenticated" }, 401);
  const token = authHeader.replace("Bearer ", "");
  const isServiceRole = getJwtRole(token) === "service_role";

  // ── Cron path: renew all watches expiring within 36h ───
  if (isServiceRole) {
    const body = await req.json().catch(() => ({}));
    if (body.renew_all) {
      const cutoff = new Date(Date.now() + 36 * 3600_000).toISOString();
      const { data: due } = await admin
        .from("gmail_watches")
        .select("user_id")
        .or(`expiration_at.is.null,expiration_at.lte.${cutoff}`);
      const results: any[] = [];
      for (const w of (due || [])) {
        try {
          const r = await startWatchForUser(admin, w.user_id);
          results.push({ user_id: w.user_id, ok: true, expiration: r.expiration.toISOString() });
        } catch (err: any) {
          results.push({ user_id: w.user_id, ok: false, error: String(err?.message || err) });
        }
      }
      return json({ renewed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results });
    }
  }

  // ── User path: start/renew my own watch ────────────────
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "Not authenticated" }, 401);

  try {
    const result = await startWatchForUser(admin, userData.user.id);
    return json({
      ok: true,
      email: result.email,
      expiration_at: result.expiration.toISOString(),
      history_id: result.historyId,
    });
  } catch (err: any) {
    return json({ error: String(err?.message || err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
