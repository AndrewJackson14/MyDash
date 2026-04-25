// ============================================================
// gmail-ingest-inbound — pulls new INBOX messages for a user
// since their last-seen historyId, fuzzy-matches each sender
// against client_contacts.email, and writes a row to email_log
// with direction='inbound' + client_id when a match lands.
//
// Triggered server-side after every Gmail Pub/Sub push (see
// gmail-push-webhook). The webhook fires with no message body —
// it only carries { emailAddress, historyId } — so this function
// handles the actual Gmail API History fetch on a user's behalf
// using their stored OAuth refresh token.
//
// Auth: service_role only. Not exposed to anonymous callers; the
// push webhook + cron back-fills are the sole producers.
//
// Idempotency: dedupe by gmail_message_id. Re-running the function
// for the same range is safe and writes nothing new.
//
// Scope (Tier 1 audit M-1, Dana's Tuesday Walkthrough): gives the
// client profile a unified two-way email timeline. Outbound rows
// have always been written by the existing send paths
// (contract-email, sendGmailEmail RPC). Inbound was the gap.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

// Cap how many message metadata fetches we do per invocation. Gmail
// allows ~250 quota units / user / second; metadata=5 units, so 50
// messages = 250 units = ~1s. A push that lands during a busy hour
// might cover dozens of new messages; anything beyond MAX_MESSAGES
// is skipped this call and picked up on the next push (or by the
// 60s poll the client already runs).
const MAX_MESSAGES = 60;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}

// ── Token refresh (mirrors gmail-api/getAccessToken) ──────────────
async function getAccessToken(admin: any, userId: string): Promise<string> {
  const { data, error } = await admin.from("google_tokens").select("*").eq("user_id", userId).single();
  if (error || !data) throw new Error("no_google_tokens");

  const expiry = new Date(data.token_expiry);
  if (expiry.getTime() - Date.now() > 300_000) return data.access_token;
  if (!data.refresh_token) throw new Error("no_refresh_token");

  const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const tokens = await refreshRes.json();
  if (!refreshRes.ok || !tokens.access_token) {
    throw new Error(`refresh_failed: ${tokens.error || refreshRes.status}`);
  }
  await admin.from("google_tokens").update({
    access_token: tokens.access_token,
    token_expiry: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  return tokens.access_token;
}

// ── Header parsing ────────────────────────────────────────────────
// Pulls "Bob Smith <bob@example.com>" or just "bob@example.com" and
// returns { email, name }. Lowercased email for case-insensitive match.
function parseAddress(raw: string | null | undefined): { email: string; name: string } {
  if (!raw) return { email: "", name: "" };
  const m = raw.match(/^\s*(?:"?([^"<]+?)"?\s*)?<([^>]+)>\s*$/) || raw.match(/^\s*([^\s<>]+@[^\s<>]+)\s*$/);
  if (!m) return { email: "", name: "" };
  if (m.length === 3 && m[2]) return { email: m[2].toLowerCase().trim(), name: (m[1] || "").trim() };
  return { email: (m[1] || "").toLowerCase().trim(), name: "" };
}

function headerValue(headers: any[] | undefined, name: string): string {
  if (!Array.isArray(headers)) return "";
  const h = headers.find(x => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

// ── Main ──────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "missing_bearer" }, 401);
  const token = auth.slice(7).trim();
  // Only service_role tokens (or the SR key itself) may call this.
  // Anyone else gets 403 — no anonymous ingest.
  if (token !== SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1] || ""));
      if (payload?.role !== "service_role") return json({ error: "service_role_required" }, 403);
    } catch {
      return json({ error: "service_role_required" }, 403);
    }
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const userId = body?.user_id;
  if (!userId) return json({ error: "user_id required" }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Get user's last-seen historyId from gmail_watches ────────
  const { data: watch } = await admin
    .from("gmail_watches")
    .select("history_id, last_ingested_history_id, email_address")
    .eq("user_id", userId)
    .maybeSingle();
  if (!watch) return json({ error: "no_gmail_watch" }, 404);

  const startHistoryId = watch.last_ingested_history_id || watch.history_id;
  if (!startHistoryId) {
    // First push for this user — store current historyId as our high
    // water mark. We deliberately DON'T back-fill the entire mailbox
    // here; the cost would be huge and most messages aren't relevant.
    await admin.from("gmail_watches").update({ last_ingested_history_id: watch.history_id }).eq("user_id", userId);
    return json({ ok: true, message: "initialized_high_water_mark" });
  }

  // ── Get a fresh access token ─────────────────────────────────
  let accessToken: string;
  try {
    accessToken = await getAccessToken(admin, userId);
  } catch (e) {
    return json({ error: "token", detail: String((e as Error).message) }, 500);
  }

  // ── List history since last_ingested_history_id ──────────────
  // historyTypes=messageAdded keeps the response small. labelId=INBOX
  // filters to incoming messages (Gmail also fires history events for
  // sent + drafts; we don't want those — outbound is already logged
  // by the send code path).
  const histUrl = `${GMAIL_BASE}/history?startHistoryId=${encodeURIComponent(String(startHistoryId))}&historyTypes=messageAdded&labelId=INBOX`;
  const histRes = await fetch(histUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!histRes.ok) {
    const text = await histRes.text();
    // 404 from history.list usually means the historyId is stale (>7d).
    // Reset the high water mark to current so future pushes resume.
    if (histRes.status === 404 && watch.history_id) {
      await admin.from("gmail_watches").update({ last_ingested_history_id: watch.history_id }).eq("user_id", userId);
      return json({ ok: false, error: "history_too_old_reset", detail: text.slice(0, 200) });
    }
    return json({ error: "history_list_failed", status: histRes.status, detail: text.slice(0, 200) }, 500);
  }
  const histData = await histRes.json();
  const newHistoryId = histData.historyId || watch.history_id;

  // Collect unique message IDs, capped.
  const messageIds: string[] = [];
  const seen = new Set<string>();
  for (const h of (histData.history || [])) {
    for (const ma of (h.messagesAdded || [])) {
      const id = ma?.message?.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      messageIds.push(id);
      if (messageIds.length >= MAX_MESSAGES) break;
    }
    if (messageIds.length >= MAX_MESSAGES) break;
  }

  if (messageIds.length === 0) {
    await admin.from("gmail_watches").update({ last_ingested_history_id: newHistoryId }).eq("user_id", userId);
    return json({ ok: true, processed: 0, matched: 0 });
  }

  // ── Dedup against email_log ──────────────────────────────────
  const { data: existing } = await admin
    .from("email_log")
    .select("gmail_message_id")
    .in("gmail_message_id", messageIds);
  const alreadyLogged = new Set((existing || []).map(r => r.gmail_message_id));
  const fresh = messageIds.filter(id => !alreadyLogged.has(id));

  // ── Pre-load client_contacts.email → client_id for fuzzy match ─
  // Cheap because clients/contacts is bounded (~1500 contacts max).
  // We lowercase + trim to match parsed sender addresses.
  const { data: contactRows } = await admin
    .from("clients")
    .select("id, contacts");
  const emailToClientId = new Map<string, string>();
  for (const row of (contactRows || [])) {
    const contacts = Array.isArray(row.contacts) ? row.contacts : [];
    for (const c of contacts) {
      const e = (c?.email || "").toLowerCase().trim();
      if (e) emailToClientId.set(e, row.id);
    }
  }

  // ── Fetch + match each new message ───────────────────────────
  let matched = 0;
  let processed = 0;
  for (const msgId of fresh) {
    try {
      const mRes = await fetch(`${GMAIL_BASE}/messages/${msgId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=To`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!mRes.ok) continue;
      const m = await mRes.json();
      processed++;

      // Skip messages that don't have INBOX label (defensive — the
      // history filter should already exclude them, but Gmail can
      // race with label changes).
      const labels: string[] = m.labelIds || [];
      if (!labels.includes("INBOX")) continue;
      // Skip drafts and chat messages.
      if (labels.includes("DRAFT") || labels.includes("CHAT")) continue;

      const headers = m?.payload?.headers || [];
      const fromRaw = headerValue(headers, "From");
      const toRaw = headerValue(headers, "To");
      const subject = headerValue(headers, "Subject");
      const dateRaw = headerValue(headers, "Date");
      const { email: fromEmail } = parseAddress(fromRaw);
      const { email: toEmail } = parseAddress(toRaw);
      if (!fromEmail) continue;

      // Only log if the sender matches a known client contact. The
      // alternative (log every inbound) would flood the timeline
      // with noise. Future iteration: also log unmatched into a
      // separate "unlinked inbox" view for manual triage.
      const clientId = emailToClientId.get(fromEmail);
      if (!clientId) continue;

      const occurredAt = dateRaw ? new Date(dateRaw).toISOString() : new Date().toISOString();
      const { error: insErr } = await admin.from("email_log").insert({
        type: "inbound",
        direction: "inbound",
        from_email: fromEmail,
        to_email: toEmail || watch.email_address || "",
        subject: subject || "(no subject)",
        status: "received",
        client_id: clientId,
        gmail_message_id: msgId,
        created_at: occurredAt,
        ref_type: "gmail_inbound",
      });
      if (!insErr) matched++;
    } catch (_e) {
      // Per-message failures shouldn't block the whole batch.
    }
  }

  // ── Advance the high water mark ──────────────────────────────
  await admin.from("gmail_watches").update({ last_ingested_history_id: newHistoryId }).eq("user_id", userId);

  return json({ ok: true, processed, matched, fresh: fresh.length, total: messageIds.length, capped: messageIds.length >= MAX_MESSAGES });
});
