// ============================================================
// social-publish — Edge Function for posting drafts to social
// networks. M1 scope: X (Twitter) immediate posting only.
//
// Trigger paths (only the first is wired in M1):
//   1. Immediate — POST { postId } when composer's "Post Now"
//      clicks. Reads social_posts row, processes targets serially.
//   2. Scheduled — future cron worker scans status='scheduled'
//      AND scheduled_for <= now(). Same processing path.
//
// Per-post flow (M1 — X only):
//   • Set status='publishing'
//   • For each enabled target with destination='x':
//       - X spend-cap check via x_spend_this_month()
//       - POST /2/tweets with body_text
//       - On 401 → refresh token → retry once
//       - On refresh fail → mark account 'expired', skip
//       - Insert social_post_results row (success/failed)
//       - Bump provider_usage with $0.015
//   • Aggregate parent status: published / partial / failed
//
// FB/IG/LinkedIn paths land in M2/M3. Targets with those
// destinations short-circuit to status='skipped' with a
// clear error so the History tab shows them visibly.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const X_CLIENT_ID = Deno.env.get("X_CLIENT_ID") || "";
const X_CLIENT_SECRET = Deno.env.get("X_CLIENT_SECRET") || "";
const X_MONTHLY_BUDGET_USD = Number(Deno.env.get("X_MONTHLY_BUDGET_USD") || "100");
const X_PER_TWEET_COST_USD = 0.015;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
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

type AccountRow = {
  id: string;
  pub_id: string;
  provider: string;
  external_id: string;
  access_token: string;
  refresh_token: string | null;
  token_expiry: string | null;
  status: string;
};

// ── X token refresh ────────────────────────────────────────
// X access tokens last ~2h; refresh_token rotates on every use.
// Returns the new access_token or null on failure (account expired).
async function refreshXToken(account: AccountRow): Promise<string | null> {
  if (!account.refresh_token) return null;
  const basic = btoa(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`);
  const res = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
      client_id: X_CLIENT_ID,
    }),
  });
  if (!res.ok) {
    console.warn("[social-publish] X refresh failed:", res.status);
    return null;
  }
  const tokens = await res.json();
  if (!tokens.access_token) return null;

  const admin = getAdmin();
  await admin.from("social_accounts").update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || account.refresh_token,
    token_expiry: tokens.expires_in
      ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
      : null,
    status: "connected",
    updated_at: new Date().toISOString(),
  }).eq("id", account.id);

  return tokens.access_token as string;
}

// ── X tweet POST with one-shot 401 retry on refresh ────────
async function postToX(account: AccountRow, body: string): Promise<{
  ok: boolean;
  external_id?: string;
  external_url?: string;
  error?: string;
}> {
  const send = async (token: string) => {
    return await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: body }),
    });
  };

  let res = await send(account.access_token);

  if (res.status === 401) {
    const fresh = await refreshXToken(account);
    if (!fresh) {
      // Mark account expired so the user sees a reconnect prompt.
      const admin = getAdmin();
      await admin.from("social_accounts")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", account.id);
      return { ok: false, error: "Token expired — reconnect required" };
    }
    res = await send(fresh);
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const j = await res.json(); detail = j.detail || j.title || JSON.stringify(j).slice(0, 300); } catch { /* ok */ }
    return { ok: false, error: detail };
  }

  const data = await res.json();
  const id = data?.data?.id as string | undefined;
  return {
    ok: true,
    external_id: id,
    external_url: id ? `https://twitter.com/i/web/status/${id}` : undefined,
  };
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

  try {
    const user = await getUserFromAuth(req);
    if (!user) return new Response(
      JSON.stringify({ error: "Not authenticated" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

    const body = await req.json().catch(() => ({}));
    const postId = body?.postId as string | undefined;
    if (!postId) return new Response(
      JSON.stringify({ error: "Missing postId" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

    const admin = getAdmin();

    // Load post + targets. Reject if already past draft/scheduled to keep
    // the operation idempotent (re-clicks of "Post Now" can't double-send).
    const { data: post, error: postErr } = await admin
      .from("social_posts")
      .select("id, pub_id, body_text, targets, status")
      .eq("id", postId)
      .maybeSingle();

    if (postErr || !post) return new Response(
      JSON.stringify({ error: "Post not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

    if (!["draft", "scheduled"].includes(post.status)) return new Response(
      JSON.stringify({ error: `Post already ${post.status}` }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

    // Lock the post so concurrent triggers don't both publish.
    await admin.from("social_posts")
      .update({ status: "publishing", updated_at: new Date().toISOString() })
      .eq("id", postId);

    const targets = Array.isArray(post.targets) ? post.targets : [];
    const enabled = targets.filter((t: { destination: string; enabled: boolean }) => t.enabled);

    if (enabled.length === 0) {
      await admin.from("social_posts")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", postId);
      return new Response(JSON.stringify({ error: "No targets enabled" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ destination: string; ok: boolean }> = [];

    for (const target of enabled) {
      const dest = target.destination as string;

      // ── X path ────────────────────────────────────────────
      if (dest === "x") {
        // Spend cap — read live before each publish so a sibling worker
        // can't drive us past the cap by racing.
        const { data: spendRow } = await admin.rpc("x_spend_this_month");
        const spend = Number(spendRow || 0);
        if (spend >= X_MONTHLY_BUDGET_USD) {
          await admin.from("social_post_results").insert({
            post_id: postId,
            destination: "x",
            status: "failed",
            error_message: "Monthly X budget reached — see Integrations → Social",
          });
          results.push({ destination: "x", ok: false });
          continue;
        }

        const { data: account } = await admin
          .from("social_accounts")
          .select("id, pub_id, provider, external_id, access_token, refresh_token, token_expiry, status")
          .eq("pub_id", post.pub_id)
          .eq("provider", "x")
          .maybeSingle();

        if (!account || account.status !== "connected") {
          await admin.from("social_post_results").insert({
            post_id: postId,
            destination: "x",
            status: "failed",
            error_message: account ? `X account ${account.status}` : "X account not connected",
          });
          results.push({ destination: "x", ok: false });
          continue;
        }

        const out = await postToX(account as AccountRow, post.body_text);

        if (out.ok) {
          await admin.from("social_post_results").insert({
            post_id: postId,
            destination: "x",
            status: "success",
            external_post_id: out.external_id || null,
            external_url: out.external_url || null,
            posted_at: new Date().toISOString(),
          });
          await admin.rpc("bump_provider_usage", {
            p_provider: "x",
            p_pub_id: post.pub_id,
            p_writes: 1,
            p_cost_usd: X_PER_TWEET_COST_USD,
          });
          results.push({ destination: "x", ok: true });
        } else {
          await admin.from("social_post_results").insert({
            post_id: postId,
            destination: "x",
            status: "failed",
            error_message: out.error || "Unknown failure",
          });
          results.push({ destination: "x", ok: false });
        }

        // Polite delay between destinations (currently no-op since X is the
        // only live destination, but kept so adding FB/IG/LinkedIn doesn't
        // need to revisit timing). 200ms per spec.
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      // ── FB / IG / LinkedIn — M2/M3 ──────────────────────
      // Mark these skipped so users see them in History rather than silent
      // success. Once each provider's adapter lands, swap the branch.
      await admin.from("social_post_results").insert({
        post_id: postId,
        destination: dest,
        status: "skipped",
        error_message: `${dest} support not yet enabled (M2/M3)`,
      });
      results.push({ destination: dest, ok: false });
    }

    // Aggregate — every enabled destination contributed one result row.
    // Treat 'skipped' as not-success for aggregation (so a post with only
    // M2 destinations enabled lands in 'failed', flagging the operator).
    const successCount = results.filter((r) => r.ok).length;
    const finalStatus = successCount === results.length
      ? "published"
      : successCount === 0
        ? "failed"
        : "partial";

    await admin.from("social_posts").update({
      status: finalStatus,
      published_at: successCount > 0 ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("id", postId);

    return new Response(JSON.stringify({
      ok: successCount > 0,
      status: finalStatus,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("social-publish error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
