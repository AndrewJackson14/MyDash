import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLIENT_ID = Deno.env.get("QB_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("QB_CLIENT_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/qb-auth?action=callback`;

// Intuit OAuth2 endpoints (production)
const AUTH_BASE = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

const SCOPES = "com.intuit.quickbooks.accounting com.intuit.quickbooks.payment";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-action",
};

function getAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function getUserFromAuth(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "");
  const { data: { user } } = await supabase.auth.getUser(token);
  return user;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || req.headers.get("x-action") || "";

  try {
    // ── START: Generate Intuit OAuth URL ─────────────────────
    if (action === "start") {
      const user = await getUserFromAuth(req);
      if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const state = btoa(JSON.stringify({ userId: user.id }));
      const authUrl = new URL(AUTH_BASE);
      authUrl.searchParams.set("client_id", CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", SCOPES);
      authUrl.searchParams.set("state", state);

      return new Response(JSON.stringify({ url: authUrl.toString() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CALLBACK: Exchange code for tokens ───────────────────
    if (action === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const realmId = url.searchParams.get("realmId");
      const error = url.searchParams.get("error");

      if (error) {
        return new Response(`<html><body><script>window.opener?.postMessage({type:'qb-auth-error',error:'${error}'},'*');window.close();</script>Auth failed: ${error}</body></html>`, {
          headers: { "Content-Type": "text/html" },
        });
      }

      if (!code || !state || !realmId) {
        return new Response("Missing code, state, or realmId", { status: 400 });
      }

      let userId: string;
      try {
        const parsed = JSON.parse(atob(state));
        userId = parsed.userId;
      } catch {
        return new Response("Invalid state", { status: 400 });
      }

      // Exchange code for tokens
      const basicAuth = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
      const tokenRes = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: new URLSearchParams({
          code,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });

      const tokens = await tokenRes.json();
      if (!tokenRes.ok || !tokens.access_token) {
        console.error("QB token exchange failed:", tokens);
        return new Response(`<html><body><script>window.opener?.postMessage({type:'qb-auth-error',error:'Token exchange failed'},'*');window.close();</script>Token exchange failed</body></html>`, {
          headers: { "Content-Type": "text/html" },
        });
      }

      // Get company info
      let companyName = "";
      try {
        const infoRes = await fetch(`https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`, {
          headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" },
        });
        const info = await infoRes.json();
        companyName = info.CompanyInfo?.CompanyName || "";
      } catch { /* ok */ }

      // Store tokens
      const admin = getAdmin();
      const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

      await admin.from("quickbooks_tokens").upsert({
        realm_id: realmId,
        company_name: companyName,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry: expiresAt,
        connected_by: userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "realm_id" });

      const safeCompany = companyName.replace(/'/g, "\\'").replace(/"/g, "&quot;");
      return new Response(`<html><body><script>
try { localStorage.setItem('qb-auth-result', JSON.stringify({type:'qb-auth-success',company:'${safeCompany}',realmId:'${realmId}',ts:Date.now()})); } catch(e) {}
try { window.opener?.postMessage({type:'qb-auth-success',company:'${safeCompany}',realmId:'${realmId}'},'*'); } catch(e) {}
setTimeout(function(){ window.close(); }, 500);
</script>Connected to ${safeCompany}! This window will close automatically.</body></html>`, {
        headers: { "Content-Type": "text/html" },
      });
    }

    // ── STATUS: Check QB connection ──────────────────────────
    if (action === "status") {
      const admin = getAdmin();
      const { data } = await admin.from("quickbooks_tokens").select("realm_id, company_name, updated_at").limit(1).single();

      return new Response(JSON.stringify({
        connected: !!data,
        realmId: data?.realm_id || null,
        companyName: data?.company_name || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── DISCONNECT ───────────────────────────────────────────
    if (action === "disconnect") {
      const user = await getUserFromAuth(req);
      if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const admin = getAdmin();
      await admin.from("quickbooks_tokens").delete().neq("realm_id", "");

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("qb-auth error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
