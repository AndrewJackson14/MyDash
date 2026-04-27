// ============================================================
// social-facebook-auth — Edge Function for per-publication
// Facebook Page + linked Instagram OAuth.
//
// Pattern follows social-x-auth: action ∈ {start, callback,
// status, disconnect}, popup window flow, postMessage +
// localStorage fallback.
//
// Meta's flow differs from X in three meaningful ways:
//   1. No PKCE — confidential client with App Secret is enough.
//   2. The user authorizes our app and we get a User Access Token.
//      To post as a Page, we then call /me/accounts and pull each
//      Page's Page Access Token. We store that, not the user
//      token. Page tokens don't expire as long as the user stays
//      a Page admin, so we leave token_expiry NULL.
//   3. Instagram is a derived destination of the FB row. We hit
//      /{page_id}?fields=instagram_business_account on the chosen
//      Page; if linked, we record the IG account id + label on
//      the same social_accounts row (instagram_account_id +
//      instagram_account_label). The matrix UI synthesizes the
//      IG card from the FB row's instagram_linked flag.
//
// First-page-wins for v1. If the user admins multiple Pages, we
// take the first returned by /me/accounts and let the user
// disconnect-and-reconnect from a different FB account if they
// want a different Page. A real picker is M2 polish.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_ID = Deno.env.get("META_APP_ID") || "";
const APP_SECRET = Deno.env.get("META_APP_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/social-facebook-auth?action=callback`;

// Graph API version. Pin so behavior doesn't shift under us when
// Meta promotes a new minor. Bump deliberately during maintenance.
const GRAPH_VERSION = "v22.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const FB_DIALOG_BASE = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

// Scopes:
//   pages_show_list / pages_read_engagement / pages_manage_posts —
//     needed to list user's Pages and post to them
//   instagram_basic / instagram_content_publish — IG content publishing
//     (granted via the linked IG Business account on the Page)
//   business_management — required to read business-owned Pages
const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
].join(",");

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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] as string
  ));
}

function popupResponse(opts: {
  ok: boolean;
  type: "social-facebook-auth-success" | "social-facebook-auth-error";
  payload?: Record<string, unknown>;
  errorText?: string;
}) {
  const body = JSON.stringify({ type: opts.type, ts: Date.now(), ...opts.payload });
  return new Response(
    `<html><body><script>
try { localStorage.setItem('social-facebook-auth-result', ${JSON.stringify(body)}); } catch(e) {}
try { window.opener?.postMessage(${body}, '*'); } catch(e) {}
setTimeout(function(){ window.close(); }, ${opts.ok ? 500 : 2000});
</script>${opts.ok
      ? "Connected! This window will close automatically."
      : `Auth failed: ${opts.errorText ? escapeHtml(opts.errorText) : "unknown error"}`}</body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}

// Capture full Meta error response — Graph API returns shapes like
// { error: { message, type, code, error_subcode, fbtrace_id } } and
// occasional plain text. Pull the human-readable message when we can.
async function pickMetaError(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  try {
    const j = JSON.parse(raw);
    if (j.error?.message) return `${j.error.message}${j.error.code ? ` (code ${j.error.code})` : ""}`;
    if (j.error_description) return j.error_description;
    if (j.error) return typeof j.error === "string" ? j.error : JSON.stringify(j.error);
  } catch { /* fall through */ }
  return raw.slice(0, 400) || `HTTP ${res.status}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || req.headers.get("x-action") || "";

  try {
    // ── START: build the FB authorize URL ─────────────────
    if (action === "start") {
      const user = await getUserFromAuth(req);
      if (!user) return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );

      let pubId = url.searchParams.get("pubId") || "";
      if (!pubId && req.method === "POST") {
        try { pubId = (await req.json())?.pubId || ""; } catch { /* ignore */ }
      }
      if (!pubId) return new Response(
        JSON.stringify({ error: "Missing pubId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );

      // State carries everything we need at callback time —
      // base64url-encoded JSON. Meta's state param is opaque to them.
      const state = btoa(JSON.stringify({ userId: user.id, pubId }));

      const authUrl = new URL(FB_DIALOG_BASE);
      authUrl.searchParams.set("client_id", APP_ID);
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("scope", SCOPES);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("state", state);

      return new Response(JSON.stringify({ url: authUrl.toString() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CALLBACK: code → user token → page token + IG ────
    if (action === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      const errorDesc = url.searchParams.get("error_description") || "";

      if (error) {
        return popupResponse({
          ok: false,
          type: "social-facebook-auth-error",
          errorText: `${error}: ${errorDesc}`.slice(0, 500),
        });
      }
      if (!code || !state) return new Response("Missing code or state", { status: 400 });

      let userId: string, pubId: string;
      try {
        const parsed = JSON.parse(atob(state));
        userId = parsed.userId;
        pubId = parsed.pubId;
        if (!userId || !pubId) throw new Error("Incomplete state");
      } catch {
        return new Response("Invalid state", { status: 400 });
      }

      // Step 1 — exchange code for short-lived user access token.
      const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
      tokenUrl.searchParams.set("client_id", APP_ID);
      tokenUrl.searchParams.set("client_secret", APP_SECRET);
      tokenUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      tokenUrl.searchParams.set("code", code);

      const tokRes = await fetch(tokenUrl.toString());
      if (!tokRes.ok) {
        const detail = await pickMetaError(tokRes);
        console.error("[social-facebook-auth] token exchange failed:", detail);
        return popupResponse({
          ok: false,
          type: "social-facebook-auth-error",
          errorText: `Token exchange: ${detail}`,
        });
      }
      const tokJson = await tokRes.json();
      const userToken = tokJson.access_token as string;
      if (!userToken) return popupResponse({
        ok: false,
        type: "social-facebook-auth-error",
        errorText: "No user access_token returned",
      });

      // Step 2 — exchange short-lived for long-lived user token (60 days).
      // Page tokens derived from a long-lived user token persist for as
      // long as the user remains a Page admin (effectively never expire).
      const longUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
      longUrl.searchParams.set("grant_type", "fb_exchange_token");
      longUrl.searchParams.set("client_id", APP_ID);
      longUrl.searchParams.set("client_secret", APP_SECRET);
      longUrl.searchParams.set("fb_exchange_token", userToken);

      const longRes = await fetch(longUrl.toString());
      const longJson = longRes.ok ? await longRes.json() : null;
      const longUserToken = longJson?.access_token || userToken;

      // Step 3 — list Pages the user administers. Returns each Page's
      // own Page Access Token (the one we'll actually post with).
      const pagesUrl = new URL(`${GRAPH_BASE}/me/accounts`);
      pagesUrl.searchParams.set("access_token", longUserToken);
      pagesUrl.searchParams.set("fields", "id,name,access_token,category");
      pagesUrl.searchParams.set("limit", "100");

      const pagesRes = await fetch(pagesUrl.toString());
      if (!pagesRes.ok) {
        const detail = await pickMetaError(pagesRes);
        return popupResponse({
          ok: false,
          type: "social-facebook-auth-error",
          errorText: `Pages fetch: ${detail}`,
        });
      }
      const pagesJson = await pagesRes.json();
      const pages = Array.isArray(pagesJson.data) ? pagesJson.data : [];
      if (pages.length === 0) return popupResponse({
        ok: false,
        type: "social-facebook-auth-error",
        errorText: "No Facebook Pages found for this account. Make sure you administer at least one Page.",
      });

      // First-page-wins. If the user admins multiple Pages they can
      // disconnect and reconnect from a different FB account or hit a
      // future "switch Page" flow. Logged in DECISIONS.md.
      const page = pages[0] as { id: string; name: string; access_token: string };
      const pageId = page.id;
      const pageToken = page.access_token;
      const pageName = page.name;

      // Step 4 — discover linked Instagram Business account, if any.
      const igUrl = new URL(`${GRAPH_BASE}/${pageId}`);
      igUrl.searchParams.set("fields", "instagram_business_account{id,username}");
      igUrl.searchParams.set("access_token", pageToken);

      let instagramAccountId: string | null = null;
      let instagramAccountLabel: string | null = null;
      try {
        const igRes = await fetch(igUrl.toString());
        if (igRes.ok) {
          const igJson = await igRes.json();
          if (igJson.instagram_business_account?.id) {
            instagramAccountId = igJson.instagram_business_account.id as string;
            const handle = igJson.instagram_business_account.username;
            instagramAccountLabel = handle ? `@${handle}` : null;
          }
        }
      } catch (e) {
        console.warn("[social-facebook-auth] IG discovery failed (non-fatal):", e);
      }

      // Step 5 — upsert into social_accounts. UNIQUE (pub_id, provider)
      // makes this a swap-in-place when reconnecting.
      const admin = getSupabaseAdmin();
      const { error: upsertErr } = await admin.from("social_accounts").upsert({
        pub_id: pubId,
        provider: "facebook",
        account_label: pageName,
        external_id: pageId,
        access_token: pageToken,
        refresh_token: null,           // FB Page tokens don't refresh
        token_expiry: null,            // and don't expire on the admin path
        scopes: SCOPES.split(","),
        instagram_account_id: instagramAccountId,
        instagram_account_label: instagramAccountLabel,
        status: "connected",
        connected_by: userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "pub_id,provider" });

      if (upsertErr) {
        console.error("[social-facebook-auth] upsert failed:", upsertErr);
        return popupResponse({
          ok: false,
          type: "social-facebook-auth-error",
          errorText: "Failed to save account",
        });
      }

      return popupResponse({
        ok: true,
        type: "social-facebook-auth-success",
        payload: {
          pubId,
          pageId,
          pageName,
          instagramLinked: !!instagramAccountId,
          instagramLabel: instagramAccountLabel,
          additionalPages: pages.length - 1,
        },
      });
    }

    // ── STATUS ───────────────────────────────────────────
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

      // Read from social_accounts_safe (token-stripped view) — the
      // same surface the Composer uses, so behavior matches everywhere.
      const admin = getSupabaseAdmin();
      const { data } = await admin
        .from("social_accounts_safe")
        .select("account_label, external_id, status, connected_by, updated_at, instagram_account_id, instagram_account_label, instagram_linked")
        .eq("pub_id", pubId)
        .eq("provider", "facebook")
        .maybeSingle();

      return new Response(JSON.stringify({
        connected: !!data && data.status === "connected",
        accountLabel: data?.account_label || null,
        externalId: data?.external_id || null,
        status: data?.status || "disconnected",
        instagramLinked: !!data?.instagram_linked,
        instagramAccountId: data?.instagram_account_id || null,
        instagramLabel: data?.instagram_account_label || null,
        connectedBy: data?.connected_by || null,
        updatedAt: data?.updated_at || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── DISCONNECT ───────────────────────────────────────
    // Best-effort revoke against Graph API + delete the row. FB
    // doesn't have a token revocation endpoint per se; the closest
    // is /{user-id}/permissions DELETE which removes ALL scopes for
    // the app on that user. We don't want to nuke the user's other
    // Page connections (other publications), so we just delete the
    // row locally — the Page Access Token becomes orphaned but
    // that's harmless.
    if (action === "disconnect") {
      const user = await getUserFromAuth(req);
      if (!user) return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );

      let pubId = url.searchParams.get("pubId") || "";
      if (!pubId && req.method === "POST") {
        try { pubId = (await req.json())?.pubId || ""; } catch { /* ignore */ }
      }
      if (!pubId) return new Response(
        JSON.stringify({ error: "Missing pubId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );

      const admin = getSupabaseAdmin();
      await admin.from("social_accounts").delete()
        .eq("pub_id", pubId)
        .eq("provider", "facebook");

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("social-facebook-auth error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
