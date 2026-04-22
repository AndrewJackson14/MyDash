import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-action, x-message-id, x-label-id, x-query, x-page-token, x-max-results, x-label-ids, x-add-labels, x-remove-labels, x-thread-id, x-draft-id, x-format, x-attachment-id",
};

function getAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

// Get user ID from Supabase auth token
async function getUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "");
  const { data: { user } } = await supabase.auth.getUser(token);
  return user?.id || null;
}

// Get valid access token, refreshing if expired
async function getAccessToken(userId: string): Promise<string> {
  const admin = getAdmin();
  const { data, error } = await admin.from("google_tokens").select("*").eq("user_id", userId).single();
  if (error || !data) throw new Error("Google account not connected");

  // Check if token is expired (with 5min buffer)
  const expiry = new Date(data.token_expiry);
  if (expiry.getTime() - Date.now() > 300_000) {
    return data.access_token;
  }

  // Refresh the token
  if (!data.refresh_token) throw new Error("No refresh token available — reconnect Google account");

  const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const tokens = await refreshRes.json();
  if (!refreshRes.ok || !tokens.access_token) {
    // If refresh fails, delete the stored tokens so user re-authenticates
    await admin.from("google_tokens").delete().eq("user_id", userId);
    throw new Error("Token refresh failed — please reconnect Google account");
  }

  const newExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
  await admin.from("google_tokens").update({
    access_token: tokens.access_token,
    token_expiry: newExpiry,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);

  return tokens.access_token;
}

// Proxy a request to Gmail API
async function gmailFetch(accessToken: string, path: string, options: RequestInit = {}) {
  const url = path.startsWith("http") ? path : `${GMAIL_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gmail API error: ${res.status}`);
  }
  return res.json();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const userId = await getUserId(req);
  if (!userId) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const action = req.headers.get("x-action") || "";
  const h = (name: string) => req.headers.get(name) || "";

  try {
    const token = await getAccessToken(userId);

    // ── LIST MESSAGES ────────────────────────────────────────
    if (action === "list") {
      const q = h("x-query");
      const labelIds = h("x-label-ids");
      const pageToken = h("x-page-token");
      const maxResults = h("x-max-results") || "25";

      const params = new URLSearchParams({ maxResults });
      if (q) params.set("q", q);
      if (labelIds) params.set("labelIds", labelIds);
      if (pageToken) params.set("pageToken", pageToken);

      const data = await gmailFetch(token, `/messages?${params}`);
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── GET MESSAGE ──────────────────────────────────────────
    if (action === "get") {
      const msgId = h("x-message-id");
      if (!msgId) throw new Error("Missing x-message-id");
      const format = h("x-format") || "full";
      const data = await gmailFetch(token, `/messages/${msgId}?format=${format}`);
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── GET THREAD ───────────────────────────────────────────
    if (action === "get-thread") {
      const threadId = h("x-thread-id");
      if (!threadId) throw new Error("Missing x-thread-id");
      const format = h("x-format") || "full";
      const data = await gmailFetch(token, `/threads/${threadId}?format=${format}`);
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── SEND MESSAGE ─────────────────────────────────────────
    if (action === "send") {
      const body = await req.json();
      // body.raw = base64url-encoded RFC 2822 message
      const data = await gmailFetch(token, "/messages/send", { method: "POST", body: JSON.stringify(body) });
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── MODIFY MESSAGE (labels, read/unread, star, archive) ──
    if (action === "modify") {
      const msgId = h("x-message-id");
      if (!msgId) throw new Error("Missing x-message-id");
      const body = await req.json();
      // body = { addLabelIds: [...], removeLabelIds: [...] }
      const data = await gmailFetch(token, `/messages/${msgId}/modify`, { method: "POST", body: JSON.stringify(body) });
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── BATCH MODIFY (multiple messages) ─────────────────────
    if (action === "batch-modify") {
      const body = await req.json();
      // body = { ids: [...], addLabelIds: [...], removeLabelIds: [...] }
      await gmailFetch(token, "/messages/batchModify", { method: "POST", body: JSON.stringify(body) });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── TRASH MESSAGE ────────────────────────────────────────
    if (action === "trash") {
      const msgId = h("x-message-id");
      if (!msgId) throw new Error("Missing x-message-id");
      const data = await gmailFetch(token, `/messages/${msgId}/trash`, { method: "POST" });
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── UNTRASH MESSAGE ──────────────────────────────────────
    if (action === "untrash") {
      const msgId = h("x-message-id");
      if (!msgId) throw new Error("Missing x-message-id");
      const data = await gmailFetch(token, `/messages/${msgId}/untrash`, { method: "POST" });
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── DELETE MESSAGE (permanent) ───────────────────────────
    if (action === "delete") {
      const msgId = h("x-message-id");
      if (!msgId) throw new Error("Missing x-message-id");
      await fetch(`${GMAIL_BASE}/messages/${msgId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── LIST LABELS ──────────────────────────────────────────
    if (action === "labels") {
      const data = await gmailFetch(token, "/labels");
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── GET ATTACHMENT ───────────────────────────────────────
    if (action === "attachment") {
      const msgId = h("x-message-id");
      const attachId = h("x-attachment-id");
      if (!msgId || !attachId) throw new Error("Missing x-message-id or x-attachment-id");
      const data = await gmailFetch(token, `/messages/${msgId}/attachments/${attachId}`);
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── CREATE DRAFT ─────────────────────────────────────────
    if (action === "create-draft") {
      const body = await req.json();
      const data = await gmailFetch(token, "/drafts", { method: "POST", body: JSON.stringify(body) });
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── UPDATE DRAFT ─────────────────────────────────────────
    if (action === "update-draft") {
      const draftId = h("x-draft-id");
      if (!draftId) throw new Error("Missing x-draft-id");
      const body = await req.json();
      const data = await gmailFetch(token, `/drafts/${draftId}`, { method: "PUT", body: JSON.stringify(body) });
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── LIST DRAFTS ──────────────────────────────────────────
    if (action === "list-drafts") {
      const maxResults = h("x-max-results") || "25";
      const pageToken = h("x-page-token");
      const params = new URLSearchParams({ maxResults });
      if (pageToken) params.set("pageToken", pageToken);
      const data = await gmailFetch(token, `/drafts?${params}`);
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── DELETE DRAFT ─────────────────────────────────────────
    if (action === "delete-draft") {
      const draftId = h("x-draft-id");
      if (!draftId) throw new Error("Missing x-draft-id");
      await fetch(`${GMAIL_BASE}/drafts/${draftId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── SEND DRAFT ───────────────────────────────────────────
    if (action === "send-draft") {
      const body = await req.json();
      const data = await gmailFetch(token, "/drafts/send", { method: "POST", body: JSON.stringify(body) });
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── GET PROFILE (email, unread count) ────────────────────
    if (action === "profile") {
      const data = await gmailFetch(token, "/profile");
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action: " + action }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const status = err.message?.includes("not connected") || err.message?.includes("reconnect") ? 403 : 500;
    return new Response(JSON.stringify({ error: err.message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
