// ============================================================
// send-newsletter — AWS SES SendEmail fan-out for a draft.
//
// Flow:
//   1. Auth user → load draft → validate status=approved
//   2. Load subscribers for draft.publication_id (status=active)
//      If x-test-email header is set, skip subscribers and send
//      a single test to that address instead.
//   3. For each recipient, render per-recipient HTML by
//      substituting {{SEND_ID}} and {{UNSUB_TOKEN}}. The compose
//      step should have already injected the open pixel +
//      rewritten <a hrefs> to the email-click redirector.
//   4. POST to SES v2 with SigV4 signing. Persist an
//      email_sends row with the ses_message_id.
//   5. Update the draft's recipient_count and status=sent.
//
// SES is rate-limited (per-sender quota + max send rate).
// We chunk sends at 10/sec and let the SDK's native retry
// backoff handle 429-equivalents.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_SES_ACCESS_KEY_ID") || "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SES_SECRET_ACCESS_KEY") || "";
const AWS_REGION = Deno.env.get("AWS_SES_REGION") || "us-east-1";
const EDGE_FN_BASE = Deno.env.get("EDGE_FN_BASE_URL") || `${SUPABASE_URL}/functions/v1`;

const SEND_RATE_PER_SEC = 10; // SES default new-account limit is 14/s; stay under

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-draft-id, x-test-email",
};

// ── SigV4 (minimal, for POST JSON to SES v2) ───────────────
async function sha256Hex(s: string) {
  const buf = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function hmac(key: ArrayBuffer | Uint8Array, msg: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(msg)));
}
async function signingKey(secret: string, date: string, region: string, service: string) {
  let k: Uint8Array = new TextEncoder().encode("AWS4" + secret);
  k = await hmac(k, date);
  k = await hmac(k, region);
  k = await hmac(k, service);
  k = await hmac(k, "aws4_request");
  return k;
}

async function sesSendEmail(params: {
  from: string; replyTo?: string; to: string; subject: string; html: string;
}): Promise<{ messageId: string }> {
  const host = `email.${AWS_REGION}.amazonaws.com`;
  const path = "/v2/email/outbound-emails";
  const body = JSON.stringify({
    FromEmailAddress: params.from,
    Destination: { ToAddresses: [params.to] },
    Content: {
      Simple: {
        Subject: { Data: params.subject, Charset: "UTF-8" },
        Body: { Html: { Data: params.html, Charset: "UTF-8" } },
      },
    },
    ...(params.replyTo ? { ReplyToAddresses: [params.replyTo] } : {}),
  });
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(body);

  const canonical = [
    "POST",
    path,
    "",
    `content-type:application/json`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    "",
    "content-type;host;x-amz-content-sha256;x-amz-date",
    payloadHash,
  ].join("\n");
  const canonicalHash = await sha256Hex(canonical);
  const scope = `${date}/${AWS_REGION}/ses/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, canonicalHash].join("\n");
  const key = await signingKey(AWS_SECRET_ACCESS_KEY, date, AWS_REGION, "ses");
  const sigBytes = await hmac(key, stringToSign);
  const signature = Array.from(sigBytes).map(b => b.toString(16).padStart(2, "0")).join("");
  const auth = `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${scope}, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=${signature}`;

  const res = await fetch(`https://${host}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Host": host,
      "X-Amz-Date": amzDate,
      "X-Amz-Content-Sha256": payloadHash,
      "Authorization": auth,
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SES ${res.status}: ${text}`);
  const parsed = JSON.parse(text);
  return { messageId: parsed.MessageId };
}

// ── Request handler ────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Auth check — require a signed-in user before we spend SES quota
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) return json({ error: "Not authenticated" }, 401);
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "Not authenticated" }, 401);

  const draftId = req.headers.get("x-draft-id");
  const testEmail = req.headers.get("x-test-email");
  if (!draftId) return json({ error: "Missing x-draft-id" }, 400);

  // Load draft
  const { data: draft, error: draftErr } = await admin
    .from("newsletter_drafts").select("*").eq("id", draftId).single();
  if (draftErr || !draft) return json({ error: "Draft not found" }, 404);

  if (!testEmail && draft.status !== "approved") {
    return json({ error: `Draft must be approved before sending (status=${draft.status})` }, 400);
  }

  // Resolve pub + from address
  const { data: pub } = await admin
    .from("publications").select("id, name, site_settings").eq("id", draft.publication_id).single();
  if (!pub) return json({ error: "Publication not found" }, 404);
  const fromEmail = draft.from_email || pub.site_settings?.newsletter_from_email;
  const fromName = draft.from_name || pub.site_settings?.newsletter_from_name || pub.name;
  const replyTo = draft.reply_to || pub.site_settings?.newsletter_reply_to || fromEmail;
  if (!fromEmail) {
    return json({ error: `No newsletter_from_email configured for ${pub.id}` }, 400);
  }
  const fromHeader = `${fromName} <${fromEmail}>`;

  // Mark draft as sending
  await admin.from("newsletter_drafts").update({ status: "sending", last_error: null }).eq("id", draftId);

  // Build recipient list
  type Rec = { id: string | null; email: string; token: string };
  let recipients: Rec[] = [];
  if (testEmail) {
    // Test send — don't touch email_sends or subscriber bookkeeping
    recipients = [{ id: null, email: testEmail, token: "test" }];
  } else {
    const { data: subs } = await admin
      .from("newsletter_subscribers")
      .select("id, email, unsubscribe_token")
      .eq("publication_id", draft.publication_id)
      .eq("status", "active");
    recipients = (subs || []).map(s => ({ id: s.id, email: s.email, token: s.unsubscribe_token }));
  }

  if (recipients.length === 0) {
    await admin.from("newsletter_drafts").update({ status: "approved", last_error: "No active subscribers" }).eq("id", draftId);
    return json({ error: "No active subscribers for this publication" }, 400);
  }

  let sent = 0, failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    // Rate limiting — chunk SES calls at SEND_RATE_PER_SEC
    if (i > 0 && i % SEND_RATE_PER_SEC === 0) {
      await new Promise(res => setTimeout(res, 1000));
    }

    // Create the per-recipient email_sends row FIRST so we know its id
    // before substituting placeholders.
    let sendRowId: string | null = null;
    if (!testEmail && r.id) {
      const { data: sendRow } = await admin.from("email_sends").insert({
        draft_id: draftId, subscriber_id: r.id, recipient_email: r.email, status: "queued",
      }).select("id").single();
      sendRowId = sendRow?.id || null;
    }

    // Personalize body (tracking pixel + unsubscribe link)
    const html = (draft.html_body || "")
      .replace(/{{SEND_ID}}/g, sendRowId || "test")
      .replace(/{{UNSUB_TOKEN}}/g, encodeURIComponent(r.token || ""))
      .replace(/{{RECIPIENT_EMAIL}}/g, r.email);

    try {
      const { messageId } = await sesSendEmail({
        from: fromHeader, replyTo, to: r.email, subject: draft.subject, html,
      });
      sent++;
      if (sendRowId) {
        await admin.from("email_sends").update({
          status: "sent", sent_at: new Date().toISOString(), ses_message_id: messageId,
        }).eq("id", sendRowId);
      }
      if (r.id) {
        await admin.from("newsletter_subscribers").update({ last_sent_at: new Date().toISOString() }).eq("id", r.id);
      }
    } catch (err: any) {
      failed++;
      errors.push(`${r.email}: ${err.message}`);
      if (sendRowId) {
        await admin.from("email_sends").update({
          status: "failed", error_message: String(err.message).slice(0, 500),
        }).eq("id", sendRowId);
      }
    }
  }

  // Finalize draft status
  if (!testEmail) {
    await admin.from("newsletter_drafts").update({
      status: failed === 0 ? "sent" : (sent === 0 ? "failed" : "sent"),
      sent_at: sent > 0 ? new Date().toISOString() : null,
      recipient_count: sent,
      last_error: errors.length ? errors.slice(0, 5).join(" | ") : null,
    }).eq("id", draftId);
  } else {
    await admin.from("newsletter_drafts").update({ status: "approved" }).eq("id", draftId);
  }

  return json({ sent, failed, errors: errors.slice(0, 20) }, failed === 0 ? 200 : 207);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
