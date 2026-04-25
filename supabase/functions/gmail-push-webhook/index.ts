// ============================================================
// gmail-push-webhook — endpoint for Google Pub/Sub pushes from
// a Gmail users.watch() subscription.
//
// Pub/Sub pushes a POST with an OIDC token in the Authorization
// header (iss=accounts.google.com, email=<configured SA>). We
// verify the JWT signature against Google's JWKS, check the
// email claim matches the expected service account, decode the
// base64 data payload ({ emailAddress, historyId }), locate the
// matching gmail_watches row, and broadcast a realtime event
// on channel gmail_inbox_<user_id> so the client refreshes
// immediately instead of waiting for the 60s poll.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify, createRemoteJWKSet } from "https://esm.sh/jose@5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// The service account Pub/Sub uses to sign OIDC tokens when
// pushing to us. Anything not signed by this SA is rejected.
const EXPECTED_PUSH_SA = Deno.env.get("GMAIL_PUSH_OIDC_SA")
  || "wednesday-agent-station@spatial-path-239705.iam.gserviceaccount.com";

// Google rotates JWKS signing keys every few days; createRemoteJWKSet
// caches by key-id and auto-refetches on cache miss.
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  // ── 1. Verify OIDC token ───────────────────────────────
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response("Missing bearer token", { status: 401 });
  }
  const token = authHeader.slice(7).trim();
  let claims: Record<string, any>;
  try {
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
    });
    claims = payload;
  } catch (err) {
    console.warn("gmail-push-webhook: JWT verify failed:", (err as Error).message);
    return new Response("Invalid token", { status: 401 });
  }

  if (claims.email !== EXPECTED_PUSH_SA) {
    console.warn(`gmail-push-webhook: wrong signer email ${claims.email}`);
    return new Response("Unauthorized signer", { status: 403 });
  }

  // ── 2. Decode the Pub/Sub envelope ─────────────────────
  // Shape: { message: { data: <base64-json>, messageId, publishTime, attributes? }, subscription }
  let envelope: any;
  try { envelope = await req.json(); }
  catch { return new Response("Bad JSON", { status: 400 }); }

  const messageData = envelope?.message?.data;
  if (!messageData) {
    // Pub/Sub can send lifecycle/heartbeat messages without a data
    // field; ack them silently.
    return new Response("ok", { status: 200 });
  }

  let data: { emailAddress?: string; historyId?: number | string };
  try {
    const json = atob(messageData);
    data = JSON.parse(json);
  } catch {
    console.error("gmail-push-webhook: base64 decode failed");
    return new Response("Bad payload", { status: 400 });
  }

  const email = (data.emailAddress || "").toLowerCase();
  if (!email) {
    // Nothing to route — ack so Pub/Sub doesn't retry.
    return new Response("ok", { status: 200 });
  }

  // ── 3. Find the owning user ────────────────────────────
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: watch } = await admin
    .from("gmail_watches")
    .select("user_id, history_id")
    .ilike("email_address", email)
    .single();

  if (!watch) {
    // Not a user we know — ack quietly rather than 404; Pub/Sub
    // would otherwise retry and dead-letter.
    return new Response("ok", { status: 200 });
  }

  // ── 4. Bump activity counters ──────────────────────────
  await admin.from("gmail_watches").update({
    last_push_at: new Date().toISOString(),
    push_count: (watch.push_count || 0) + 1,
    history_id: data.historyId ? String(data.historyId) : watch.history_id,
  }).eq("user_id", watch.user_id);

  // ── 5. Broadcast realtime event ────────────────────────
  // The client's useGmailUnread hook subscribes to this channel and
  // re-fetches the unread list on any event. We deliberately don't
  // include message contents in the broadcast — the client uses its
  // own OAuth creds to fetch, keeping the push payload boring.
  const channel = admin.channel(`gmail_inbox_${watch.user_id}`);
  try {
    await channel.send({
      type: "broadcast",
      event: "inbox_changed",
      payload: { at: new Date().toISOString() },
    });
  } catch (e) {
    console.error("broadcast failed:", e);
  }
  try { await admin.removeChannel(channel); } catch {}

  // ── 6. Trigger inbound ingest (fire-and-forget) ───────
  // Calls gmail-ingest-inbound which fetches new INBOX messages
  // since last_ingested_history_id, fuzzy-matches sender against
  // client_contacts.email, and writes inbound rows to email_log.
  // We don't await — Pub/Sub needs a fast 200 ack and the ingest
  // function self-recovers on the next push if it fails here.
  fetch(`${SUPABASE_URL}/functions/v1/gmail-ingest-inbound`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ user_id: watch.user_id }),
  }).catch(e => console.warn("ingest dispatch failed:", e));

  return new Response("ok", { status: 200 });
});
