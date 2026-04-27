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
  // Populated for the Facebook row when its Page has a linked IG
  // Business account. The Instagram destination reads this to find
  // its IG id without needing a separate social_accounts row.
  instagram_account_id?: string | null;
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

// ── X media upload ────────────────────────────────────────
// X's media upload endpoint lives under api.x.com (the modernized
// host for what was the v1.1 media API). Endpoint accepts a single
// multipart file per call and returns { media_id, media_id_string }.
// We download each composer-attached image from BunnyCDN, then push
// it through to X with the user's OAuth2 bearer token.
//
// Returns the array of media_id_string to attach to the tweet, or
// an error string on the first failure (we don't ship a partial
// media set — easier to surface "image 2 of 3 failed" cleanly).
async function uploadXMedia(token: string, mediaUrls: string[]): Promise<{
  ok: boolean;
  media_ids?: string[];
  error?: string;
}> {
  const ids: string[] = [];
  for (const url of mediaUrls) {
    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) return { ok: false, error: `Failed to fetch image: ${url}` };
      const blob = await imgRes.blob();
      // Filename derivation — X's multipart parser is fussier than most
      // and rejects fields without a filename. Pull from the URL's
      // last segment, fall back to a synthetic one.
      const urlPath = url.split("?")[0];
      const filename = urlPath.substring(urlPath.lastIndexOf("/") + 1) || `media_${Date.now()}.jpg`;
      // Use the per-tweet image category up front. media_category is
      // technically optional but X's v2 endpoint sometimes 400s without
      // it depending on tier — passing it explicitly is harmless when
      // not required and fixes the case when it is.
      const form = new FormData();
      form.append("media", blob, filename);
      form.append("media_category", "tweet_image");
      const upRes = await fetch("https://api.x.com/2/media/upload", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: form,
      });
      if (!upRes.ok) {
        const status = upRes.status;
        // Capture the full body — X returns errors in inconsistent
        // shapes (errors[], detail, title, plain text) so we want to
        // see whatever comes back rather than guess one field.
        const raw = await upRes.text().catch(() => "");
        let detail = raw.slice(0, 400) || `HTTP ${status}`;
        try {
          const j = JSON.parse(raw);
          if (Array.isArray(j.errors) && j.errors[0]) detail = j.errors[0].message || j.errors[0].detail || JSON.stringify(j.errors[0]);
          else if (j.detail) detail = j.detail;
          else if (j.title) detail = `${j.title}: ${j.detail || ""}`;
        } catch { /* fall back to raw text */ }
        return { ok: false, error: `X media upload failed (${status}): ${detail}` };
      }
      const j = await upRes.json();
      const id = j?.data?.id || j?.media_id_string || j?.media_id;
      if (!id) return { ok: false, error: "X media upload returned no id" };
      ids.push(String(id));
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  return { ok: true, media_ids: ids };
}

// ── X tweet POST with optional media + one-shot 401 retry on refresh ──
async function postToX(account: AccountRow, body: string, mediaUrls: string[]): Promise<{
  ok: boolean;
  external_id?: string;
  external_url?: string;
  error?: string;
}> {
  const send = async (token: string) => {
    let media_ids: string[] | undefined;
    if (mediaUrls.length > 0) {
      const up = await uploadXMedia(token, mediaUrls);
      if (!up.ok) return { mediaErr: up.error } as const;
      media_ids = up.media_ids;
    }
    const tweetBody: Record<string, unknown> = { text: body };
    if (media_ids && media_ids.length) tweetBody.media = { media_ids };
    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tweetBody),
    });
    return { res } as const;
  };

  let attempt = await send(account.access_token);
  if ("mediaErr" in attempt) return { ok: false, error: attempt.mediaErr };
  let res = attempt.res;

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
    const retry = await send(fresh);
    if ("mediaErr" in retry) return { ok: false, error: retry.mediaErr };
    res = retry.res;
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

// ── Meta Graph helper — capture errors uniformly ──────────
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

const META_GRAPH = "https://graph.facebook.com/v22.0";

// ── Facebook Page post ─────────────────────────────────────
// account.access_token = Page Access Token, account.external_id = page id.
// Posts:
//   • Text-only → POST /{page_id}/feed with message
//   • Single image → POST /{page_id}/photos with url + message (ships
//     directly to the timeline, no two-step needed)
//   • Multi-image → upload each image as unpublished /{page_id}/photos
//     (published=false), collect ids, then POST /{page_id}/feed with
//     attached_media[{media_fbid:id},...] and the message
async function postToFacebook(account: AccountRow, body: string, mediaUrls: string[]): Promise<{
  ok: boolean;
  external_id?: string;
  external_url?: string;
  error?: string;
}> {
  const pageId = account.external_id;
  const token = account.access_token;

  // Text-only or single-image: one call. The single-image path uses
  // /photos with a public URL — Meta fetches it server-side, no need
  // for us to upload bytes ourselves.
  if (mediaUrls.length === 0) {
    const res = await fetch(`${META_GRAPH}/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: body, access_token: token }),
    });
    if (!res.ok) return { ok: false, error: `Facebook post: ${await pickMetaError(res)}` };
    const j = await res.json();
    const id = j.id as string;
    return {
      ok: true,
      external_id: id,
      external_url: id ? `https://www.facebook.com/${id}` : undefined,
    };
  }

  if (mediaUrls.length === 1) {
    const res = await fetch(`${META_GRAPH}/${pageId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: mediaUrls[0], message: body, access_token: token }),
    });
    if (!res.ok) return { ok: false, error: `Facebook photo: ${await pickMetaError(res)}` };
    const j = await res.json();
    const id = (j.post_id || j.id) as string;
    return {
      ok: true,
      external_id: id,
      external_url: id ? `https://www.facebook.com/${id}` : undefined,
    };
  }

  // Multi-image: upload each as unpublished photo to get an attachment
  // id, then build a single feed post that references them. FB limits
  // multi-photo posts to 10 attachments.
  const attachedIds: string[] = [];
  for (const url of mediaUrls.slice(0, 10)) {
    const res = await fetch(`${META_GRAPH}/${pageId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, published: false, access_token: token }),
    });
    if (!res.ok) return { ok: false, error: `Facebook photo upload: ${await pickMetaError(res)}` };
    const j = await res.json();
    if (j.id) attachedIds.push(j.id);
  }
  if (attachedIds.length === 0) return { ok: false, error: "Facebook: no images uploaded" };

  const attached_media = attachedIds.map((id) => ({ media_fbid: id }));
  const res = await fetch(`${META_GRAPH}/${pageId}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: body, attached_media, access_token: token }),
  });
  if (!res.ok) return { ok: false, error: `Facebook feed: ${await pickMetaError(res)}` };
  const j = await res.json();
  const id = j.id as string;
  return {
    ok: true,
    external_id: id,
    external_url: id ? `https://www.facebook.com/${id}` : undefined,
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
      .select("id, pub_id, body_text, targets, media, status")
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

    const results: Array<{ destination: string; ok: boolean; error?: string }> = [];

    for (const target of enabled) {
      const dest = target.destination as string;

      // ── X path ────────────────────────────────────────────
      if (dest === "x") {
        // Spend cap — read live before each publish so a sibling worker
        // can't drive us past the cap by racing.
        const { data: spendRow } = await admin.rpc("x_spend_this_month");
        const spend = Number(spendRow || 0);
        if (spend >= X_MONTHLY_BUDGET_USD) {
          const msg = "Monthly X budget reached — see Integrations → Social";
          await admin.from("social_post_results").insert({
            post_id: postId,
            destination: "x",
            status: "failed",
            error_message: msg,
          });
          results.push({ destination: "x", ok: false, error: msg });
          continue;
        }

        const { data: account } = await admin
          .from("social_accounts")
          .select("id, pub_id, provider, external_id, access_token, refresh_token, token_expiry, status")
          .eq("pub_id", post.pub_id)
          .eq("provider", "x")
          .maybeSingle();

        if (!account || account.status !== "connected") {
          const msg = account ? `X account ${account.status}` : "X account not connected";
          await admin.from("social_post_results").insert({
            post_id: postId,
            destination: "x",
            status: "failed",
            error_message: msg,
          });
          results.push({ destination: "x", ok: false, error: msg });
          continue;
        }

        const mediaUrls = (Array.isArray(post.media) ? post.media : [])
          .map((m: { url?: string; type?: string }) => (m?.type === "image" || !m?.type) && m?.url ? m.url : null)
          .filter((u: string | null): u is string => !!u)
          .slice(0, 4); // X cap

        const out = await postToX(account as AccountRow, post.body_text, mediaUrls);

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
          const msg = out.error || "Unknown failure";
          await admin.from("social_post_results").insert({
            post_id: postId,
            destination: "x",
            status: "failed",
            error_message: msg,
          });
          results.push({ destination: "x", ok: false, error: msg });
        }

        // Polite delay between destinations (currently no-op since X is the
        // only live destination, but kept so adding FB/IG/LinkedIn doesn't
        // need to revisit timing). 200ms per spec.
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      // ── Facebook path ───────────────────────────────────
      // Instagram is NOT posted to directly — Meta's native Page → IG
      // cross-post handles the mirror as a side-effect of every FB
      // post. So we only have a 'facebook' destination here.
      if (dest === "facebook") {
        const { data: fbAccount } = await admin
          .from("social_accounts")
          .select("id, pub_id, provider, external_id, access_token, refresh_token, token_expiry, status")
          .eq("pub_id", post.pub_id)
          .eq("provider", "facebook")
          .maybeSingle();

        if (!fbAccount || fbAccount.status !== "connected") {
          const msg = fbAccount ? `Facebook account ${fbAccount.status}` : "Facebook account not connected";
          await admin.from("social_post_results").insert({
            post_id: postId,
            destination: "facebook",
            status: "failed",
            error_message: msg,
          });
          results.push({ destination: "facebook", ok: false, error: msg });
          continue;
        }

        const allMedia = (Array.isArray(post.media) ? post.media : [])
          .map((m: { url?: string; type?: string }) => (m?.type === "image" || !m?.type) && m?.url ? m.url : null)
          .filter((u: string | null): u is string => !!u);

        const out = await postToFacebook(fbAccount as AccountRow, post.body_text, allMedia);

        if (out.ok) {
          await admin.from("social_post_results").insert({
            post_id: postId,
            destination: "facebook",
            status: "success",
            external_post_id: out.external_id || null,
            external_url: out.external_url || null,
            posted_at: new Date().toISOString(),
          });
          // Meta API is free for our scale. Track writes for analytics
          // but estimated_cost_usd stays at 0 — no spend cap.
          await admin.rpc("bump_provider_usage", {
            p_provider: "facebook",
            p_pub_id: post.pub_id,
            p_writes: 1,
            p_cost_usd: 0,
          });
          results.push({ destination: "facebook", ok: true });
        } else {
          const msg = out.error || "Unknown failure";
          await admin.from("social_post_results").insert({
            post_id: postId,
            destination: "facebook",
            status: "failed",
            error_message: msg,
          });
          results.push({ destination: "facebook", ok: false, error: msg });
        }

        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      // ── Instagram — explicit no-op ──────────────────────
      // Old social_posts rows might have IG enabled (from when the
      // composer offered it). Don't try to publish — Meta's native
      // cross-post handles IG. Mark skipped with a clear note.
      if (dest === "instagram") {
        const msg = "Instagram is auto cross-posted from Facebook — no direct publish";
        await admin.from("social_post_results").insert({
          post_id: postId,
          destination: "instagram",
          status: "skipped",
          error_message: msg,
        });
        results.push({ destination: "instagram", ok: false, error: msg });
        continue;
      }

      // ── LinkedIn — M3 ──────────────────────────────────
      const msg = `${dest} support not yet enabled (M3)`;
      await admin.from("social_post_results").insert({
        post_id: postId,
        destination: dest,
        status: "skipped",
        error_message: msg,
      });
      results.push({ destination: dest, ok: false, error: msg });
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
