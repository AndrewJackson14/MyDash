// ============================================================
// social-x-auth — Edge Function for per-publication X (Twitter)
// OAuth 2.0 + PKCE flow.
//
// Pattern follows gmail-auth: action ∈ {start, callback, status,
// disconnect}, popup window flow, postMessage + localStorage
// fallback for the parent.
//
// X requires PKCE for all clients regardless of public vs.
// confidential. We're confidential (client_secret in env), so the
// verifier-in-state shortcut is acceptable — the token exchange
// is also protected by the client_secret. Logged in DECISIONS.md.
//
// Tokens stored per-publication: UNIQUE (pub_id, 'x') in
// social_accounts. State carries { userId, pubId, codeVerifier }.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLIENT_ID = Deno.env.get("X_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("X_CLIENT_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/social-x-auth?action=callback`;

// media.write is required for the v2 media upload endpoint
// (api.x.com/2/media/upload). Without it, media uploads return 403
// even on tiers that otherwise allow them. Tokens minted before this
// scope was added need to reconnect to pick it up.
const SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"].join(" ");

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

// PKCE — generate a 64-char URL-safe verifier and its SHA-256 challenge.
function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeCodeVerifier(): string {
  // 32 bytes → 43 base64url characters; X requires 43–128.
  return base64UrlEncode(randomBytes(32));
}

async function makeCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

// HTML escape for attacker-controlled query params surfaced in the
// callback page body. See gmail-auth for the same defensive pattern.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] as string
  ));
}

// Wraps the close-popup + postMessage + localStorage handshake into a
// single helper so success and error paths render the same shape.
function popupResponse(opts: {
  ok: boolean;
  type: "social-x-auth-success" | "social-x-auth-error";
  payload?: Record<string, unknown>;
  errorText?: string;
}) {
  const body = JSON.stringify({ type: opts.type, ts: Date.now(), ...opts.payload });
  const errJs = opts.errorText ? JSON.stringify(opts.errorText) : "''";
  return new Response(
    `<html><body><script>
try { localStorage.setItem('social-x-auth-result', ${JSON.stringify(body)}); } catch(e) {}
try { window.opener?.postMessage(${body}, '*'); } catch(e) {}
setTimeout(function(){ window.close(); }, ${opts.ok ? 500 : 1500});
</script>${opts.ok
      ? "Connected! This window will close automatically."
      : `Auth failed: ${opts.errorText ? escapeHtml(opts.errorText) : "unknown error"}`}</body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || req.headers.get("x-action") || "";

  try {
    // ── START: build the X authorize URL with PKCE ──────────
    if (action === "start") {
      const user = await getUserFromAuth(req);
      if (!user) return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );

      // pubId is required — X tokens key per (pub_id, 'x'). Caller
      // posts JSON with { pubId } or appends ?pubId=<id>.
      let pubId = url.searchParams.get("pubId") || "";
      if (!pubId && req.method === "POST") {
        try {
          const body = await req.json();
          pubId = body.pubId || "";
        } catch { /* ignore */ }
      }
      if (!pubId) return new Response(
        JSON.stringify({ error: "Missing pubId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );

      const codeVerifier = makeCodeVerifier();
      const codeChallenge = await makeCodeChallenge(codeVerifier);
      const state = btoa(JSON.stringify({ userId: user.id, pubId, codeVerifier }));

      const authUrl = new URL("https://twitter.com/i/oauth2/authorize");
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("scope", SCOPES);
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      return new Response(JSON.stringify({ url: authUrl.toString() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CALLBACK: exchange code for tokens, fetch profile, upsert ──
    if (action === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description") || "";

      if (error) {
        return popupResponse({
          ok: false,
          type: "social-x-auth-error",
          errorText: `${error}: ${errorDescription}`.slice(0, 500),
        });
      }
      if (!code || !state) {
        return new Response("Missing code or state", { status: 400 });
      }

      let userId: string, pubId: string, codeVerifier: string;
      try {
        const parsed = JSON.parse(atob(state));
        userId = parsed.userId;
        pubId = parsed.pubId;
        codeVerifier = parsed.codeVerifier;
        if (!userId || !pubId || !codeVerifier) throw new Error("Incomplete state");
      } catch {
        return new Response("Invalid state", { status: 400 });
      }

      // Token exchange — X uses Basic auth (client_id:client_secret base64) plus
      // body params. Verifier proves we're the same client that started the flow.
      const basic = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
      const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${basic}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
          code_verifier: codeVerifier,
          client_id: CLIENT_ID,
        }),
      });

      const tokens = await tokenRes.json();
      if (!tokenRes.ok || !tokens.access_token) {
        console.error("[social-x-auth] token exchange failed:", tokenRes.status, tokens);
        return popupResponse({
          ok: false,
          type: "social-x-auth-error",
          errorText: tokens.error_description || tokens.error || "Token exchange failed",
        });
      }

      // Fetch the X user profile (id + handle for the account_label).
      const profRes = await fetch("https://api.twitter.com/2/users/me?user.fields=username", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const prof = await profRes.json();
      if (!profRes.ok || !prof?.data?.id) {
        console.error("[social-x-auth] profile fetch failed:", profRes.status, prof);
        return popupResponse({
          ok: false,
          type: "social-x-auth-error",
          errorText: "Profile fetch failed",
        });
      }

      const externalId = prof.data.id as string;
      const handle = prof.data.username as string;
      const accountLabel = `@${handle}`;

      // Upsert into social_accounts. UNIQUE (pub_id, provider) makes this
      // a swap-in-place when reconnecting the same publication.
      const admin = getSupabaseAdmin();
      const expiresAt = tokens.expires_in
        ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
        : null;

      const { error: upsertErr } = await admin.from("social_accounts").upsert({
        pub_id: pubId,
        provider: "x",
        account_label: accountLabel,
        external_id: externalId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_expiry: expiresAt,
        scopes: SCOPES.split(" "),
        status: "connected",
        connected_by: userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "pub_id,provider" });

      if (upsertErr) {
        console.error("[social-x-auth] upsert failed:", upsertErr);
        return popupResponse({
          ok: false,
          type: "social-x-auth-error",
          errorText: "Failed to save account",
        });
      }

      return popupResponse({
        ok: true,
        type: "social-x-auth-success",
        payload: { pubId, accountLabel, handle },
      });
    }

    // ── STATUS: { connected, accountLabel, status, instagramLinked? } per pubId ──
    if (action === "status") {
      const user = await getUserFromAuth(req);
      if (!user) return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );

      const pubId = url.searchParams.get("pubId") || "";
      if (!pubId) return new Response(
        JSON.stringify({ error: "Missing pubId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );

      const admin = getSupabaseAdmin();
      const { data } = await admin
        .from("social_accounts")
        .select("account_label, external_id, status, connected_by, updated_at")
        .eq("pub_id", pubId)
        .eq("provider", "x")
        .maybeSingle();

      return new Response(JSON.stringify({
        connected: !!data && data.status === "connected",
        accountLabel: data?.account_label || null,
        externalId: data?.external_id || null,
        status: data?.status || "disconnected",
        connectedBy: data?.connected_by || null,
        updatedAt: data?.updated_at || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── DISCONNECT: revoke + delete the row ─────────────────
    // Best-effort revocation against X — if the token's already expired
    // the API call fails, which is fine. Always delete locally.
    if (action === "disconnect") {
      const user = await getUserFromAuth(req);
      if (!user) return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );

      let pubId = url.searchParams.get("pubId") || "";
      if (!pubId && req.method === "POST") {
        try {
          const body = await req.json();
          pubId = body.pubId || "";
        } catch { /* ignore */ }
      }
      if (!pubId) return new Response(
        JSON.stringify({ error: "Missing pubId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );

      const admin = getSupabaseAdmin();
      const { data: row } = await admin
        .from("social_accounts")
        .select("access_token")
        .eq("pub_id", pubId)
        .eq("provider", "x")
        .maybeSingle();

      if (row?.access_token) {
        // Best-effort revocation — ignore failures.
        try {
          const basic = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
          await fetch("https://api.twitter.com/2/oauth2/revoke", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Authorization": `Basic ${basic}`,
            },
            body: new URLSearchParams({
              token: row.access_token,
              token_type_hint: "access_token",
            }),
          });
        } catch (e) {
          console.warn("[social-x-auth] revoke failed (non-fatal):", e);
        }
      }

      await admin
        .from("social_accounts")
        .delete()
        .eq("pub_id", pubId)
        .eq("provider", "x");

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("social-x-auth error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
