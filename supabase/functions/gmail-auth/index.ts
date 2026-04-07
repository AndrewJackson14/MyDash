import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/gmail-auth?action=callback`;

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-action",
};

function getSupabaseAdmin() {
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
    // ── START: Generate Google OAuth URL ─────────────────────
    if (action === "start") {
      const user = await getUserFromAuth(req);
      if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const state = btoa(JSON.stringify({ userId: user.id }));
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", SCOPES);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("state", state);

      return new Response(JSON.stringify({ url: authUrl.toString() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CALLBACK: Exchange code for tokens ───────────────────
    if (action === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        return new Response(`<html><body><script>window.opener?.postMessage({type:'google-auth-error',error:'${error}'},'*');window.close();</script>Auth failed: ${error}</body></html>`, {
          headers: { "Content-Type": "text/html" },
        });
      }

      if (!code || !state) {
        return new Response("Missing code or state", { status: 400 });
      }

      let userId: string;
      try {
        const parsed = JSON.parse(atob(state));
        userId = parsed.userId;
      } catch {
        return new Response("Invalid state", { status: 400 });
      }

      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });

      const tokens = await tokenRes.json();
      if (!tokenRes.ok || !tokens.access_token) {
        return new Response(`<html><body><script>window.opener?.postMessage({type:'google-auth-error',error:'Token exchange failed'},'*');window.close();</script>Token exchange failed</body></html>`, {
          headers: { "Content-Type": "text/html" },
        });
      }

      // Get user's email
      const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = await profileRes.json();
      const email = profile.email || "";

      // Store tokens in Supabase
      const admin = getSupabaseAdmin();
      const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

      await admin.from("google_tokens").upsert({
        user_id: userId,
        email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || "",
        token_expiry: expiresAt,
        scopes: SCOPES.split(" "),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      // Close popup and notify opener
      const safeEmail = email.replace(/'/g, "\\'");
      return new Response(`<html><body><script>
try { localStorage.setItem('google-auth-result', JSON.stringify({type:'google-auth-success',email:'${safeEmail}',ts:Date.now()})); } catch(e) {}
try { window.opener?.postMessage({type:'google-auth-success',email:'${safeEmail}'},'*'); } catch(e) {}
setTimeout(function(){ window.close(); }, 500);
</script>Connected! This window will close automatically.</body></html>`, {
        headers: { "Content-Type": "text/html" },
      });
    }

    // ── STATUS: Check if user has connected Google ───────────
    if (action === "status") {
      const user = await getUserFromAuth(req);
      if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const admin = getSupabaseAdmin();
      const { data } = await admin.from("google_tokens").select("email, scopes, updated_at").eq("user_id", user.id).single();

      return new Response(JSON.stringify({
        connected: !!data,
        email: data?.email || null,
        scopes: data?.scopes || [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── DISCONNECT: Remove Google tokens ─────────────────────
    if (action === "disconnect") {
      const user = await getUserFromAuth(req);
      if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const admin = getSupabaseAdmin();
      await admin.from("google_tokens").delete().eq("user_id", user.id);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("gmail-auth error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
