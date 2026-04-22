// ============================================================
// send-newsletter — AWS SES SendEmail fan-out for a draft.
//
// v7 notes:
//  - Subscriber query paginates in 1000-row chunks (Supabase
//    default cap silently truncated the 5,340-row Malibu list).
//  - Re-send is allowed past status='sent' if remaining>0, so a
//    resumable retry can clear the tail.
//  - Advertiser analytics email (share link) only fires when
//    the campaign has genuinely reached every active subscriber.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_SES_ACCESS_KEY_ID") || "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SES_SECRET_ACCESS_KEY") || "";
const AWS_REGION = Deno.env.get("AWS_SES_REGION") || "us-east-1";
const PUBLIC_APP_URL = Deno.env.get("PUBLIC_APP_URL") || "https://mydash.media";

const SEND_RATE_PER_SEC = 25;
const PROGRESS_EVERY = 50;
const SUB_PAGE_SIZE = 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-draft-id, x-test-email",
};

async function sha256Hex(s: string) {
  const buf = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function hmac(key: ArrayBuffer | Uint8Array, msg: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(msg)));
}
async function signingKey(secret: string, date: string, region: string, service: string) {
  let k: Uint8Array = new TextEncoder().encode("AWS4" + secret);
  k = await hmac(k, date); k = await hmac(k, region); k = await hmac(k, service); k = await hmac(k, "aws4_request");
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
    Content: { Simple: {
      Subject: { Data: params.subject, Charset: "UTF-8" },
      Body: { Html: { Data: params.html, Charset: "UTF-8" } },
    } },
    ...(params.replyTo ? { ReplyToAddresses: [params.replyTo] } : {}),
  });
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(body);

  const canonical = ["POST", path, "",
    `content-type:application/json`, `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`, `x-amz-date:${amzDate}`, "",
    "content-type;host;x-amz-content-sha256;x-amz-date", payloadHash,
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
      "Content-Type": "application/json", "Host": host,
      "X-Amz-Date": amzDate, "X-Amz-Content-Sha256": payloadHash,
      "Authorization": auth,
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SES ${res.status}: ${text}`);
  return { messageId: JSON.parse(text).MessageId };
}

// Paginate past Supabase's default 1000-row cap. Without this, the
// 5,340-subscriber Malibu list was silently truncated to the first
// 1,000, which is why the Wings campaign stopped at 1,107.
async function loadAllActiveSubscribers(admin: any, pubId: string) {
  const all: any[] = [];
  for (let from = 0; ; from += SUB_PAGE_SIZE) {
    const { data, error } = await admin
      .from("newsletter_subscribers")
      .select("id, email, unsubscribe_token")
      .eq("publication_id", pubId).eq("status", "active")
      .order("id")
      .range(from, from + SUB_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data || [];
    all.push(...page);
    if (page.length < SUB_PAGE_SIZE) break;
  }
  return all;
}

// Advertiser analytics email — one shot, only when the campaign has
// reached every active subscriber. client_id points at a clients row
// whose billing_email we email; silently no-ops if either is missing.
async function maybeEmailAdvertiserReport(admin: any, draft: any, fromHeader: string, replyTo?: string) {
  if (!draft.client_id) return;
  const { data: client } = await admin
    .from("clients").select("name, billing_email").eq("id", draft.client_id).single();
  if (!client?.billing_email) return;

  const url = `${PUBLIC_APP_URL}/r/${draft.share_token}`;
  const subject = `Your ${draft.subject || "campaign"} performance report`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:24px auto;padding:28px;background:#f7f7f5;border-radius:12px;color:#1a1a1a;line-height:1.55">
      <h1 style="font-size:22px;margin:0 0 12px;font-weight:700">Your campaign is out</h1>
      <p style="margin:0 0 12px">Hi ${client.name ? String(client.name).replace(/[&<>"']/g, "") : "there"},</p>
      <p style="margin:0 0 12px">
        Your message — <strong>${String(draft.subject || "").replace(/[&<>"']/g, "")}</strong> — has been delivered to our
        newsletter subscribers. Opens and clicks are tracked live and you can
        revisit the report any time.
      </p>
      <p style="margin:20px 0">
        <a href="${url}" style="display:inline-block;padding:12px 22px;background:#1B3A5C;color:#fff;text-decoration:none;border-radius:6px;font-weight:700">View your report</a>
      </p>
      <p style="margin:0 0 12px;font-size:13px;color:#555">
        Or copy this link: <a href="${url}">${url}</a>
      </p>
      <p style="margin:20px 0 0;font-size:12px;color:#888">
        — 13 Stars Media
      </p>
    </div>`;

  try {
    await sesSendEmail({ from: fromHeader, replyTo, to: client.billing_email, subject, html });
    await admin.from("newsletter_drafts").update({ advertiser_notified_at: new Date().toISOString() }).eq("id", draft.id);
  } catch (e: any) {
    console.error("advertiser report email failed:", e?.message || e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

  const { data: draft, error: draftErr } = await admin
    .from("newsletter_drafts").select("*").eq("id", draftId).single();
  if (draftErr || !draft) return json({ error: "Draft not found" }, 404);

  // v7: allow sending from any status as long as recipients remain
  // after dedup — this lets the user resume a campaign whose prior
  // waitUntil was killed mid-loop without manually unsticking.
  // Test sends bypass all status gating.
  if (!testEmail && draft.status === "draft") {
    return json({ error: "Approve the draft before sending." }, 400);
  }

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

  await admin.from("newsletter_drafts").update({ status: "sending", last_error: null }).eq("id", draftId);

  type Rec = { id: string | null; email: string; token: string };
  let recipients: Rec[] = [];
  if (testEmail) {
    recipients = [{ id: null, email: testEmail, token: "test" }];
  } else {
    const allSubs = await loadAllActiveSubscribers(admin, draft.publication_id);

    // Dedup against already-delivered recipients. Paginated because
    // email_sends can also exceed 1000 for big lists.
    const sentSet = new Set<string>();
    for (let from = 0; ; from += SUB_PAGE_SIZE) {
      const { data } = await admin
        .from("email_sends").select("recipient_email")
        .eq("draft_id", draftId).in("status", ["sent", "delivered"])
        .range(from, from + SUB_PAGE_SIZE - 1);
      const page = data || [];
      for (const r of page) sentSet.add((r.recipient_email || "").toLowerCase());
      if (page.length < SUB_PAGE_SIZE) break;
    }

    recipients = allSubs
      .filter(s => !sentSet.has((s.email || "").toLowerCase()))
      .map(s => ({ id: s.id, email: s.email, token: s.unsubscribe_token }));
  }

  if (recipients.length === 0) {
    // Everyone already got it — finalize + advertiser email if not yet notified.
    const totalActive = (await loadAllActiveSubscribers(admin, draft.publication_id)).length;
    await admin.from("newsletter_drafts").update({
      status: "sent",
      recipient_count: totalActive,
      last_error: null,
    }).eq("id", draftId);
    const { data: fresh } = await admin.from("newsletter_drafts").select("*").eq("id", draftId).single();
    if (fresh && !fresh.advertiser_notified_at) {
      await maybeEmailAdvertiserReport(admin, fresh, fromHeader, replyTo);
    }
    return json({ queued: false, sent: 0, failed: 0, complete: true, message: "All active subscribers already received this draft." });
  }

  const runSend = async () => {
    let sent = 0, failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];
      if (i > 0 && i % SEND_RATE_PER_SEC === 0) {
        await new Promise(res => setTimeout(res, 1000));
      }

      let sendRowId: string | null = null;
      if (!testEmail && r.id) {
        const { data: sendRow } = await admin.from("email_sends").insert({
          draft_id: draftId, subscriber_id: r.id, recipient_email: r.email, status: "queued",
        }).select("id").single();
        sendRowId = sendRow?.id || null;
      }

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

      if (!testEmail && (sent + failed) % PROGRESS_EVERY === 0) {
        const { count: cumulative } = await admin
          .from("email_sends").select("id", { count: "exact", head: true })
          .eq("draft_id", draftId).in("status", ["sent", "delivered"]);
        await admin.from("newsletter_drafts").update({ recipient_count: cumulative ?? sent }).eq("id", draftId);
      }
    }

    if (!testEmail) {
      const { count: allTimeSent } = await admin
        .from("email_sends").select("id", { count: "exact", head: true })
        .eq("draft_id", draftId).in("status", ["sent", "delivered"]);

      const totalActive = (await loadAllActiveSubscribers(admin, draft.publication_id)).length;
      const reachedEveryone = (allTimeSent || 0) >= totalActive;

      await admin.from("newsletter_drafts").update({
        // Only call it 'sent' if everyone got it. Otherwise 'approved'
        // so the Send button remains actionable for the user to click
        // again and resume.
        status: reachedEveryone ? "sent" : (sent === 0 ? "failed" : "approved"),
        sent_at: reachedEveryone ? new Date().toISOString() : null,
        recipient_count: allTimeSent ?? sent,
        last_error: errors.length ? errors.slice(0, 5).join(" | ") : null,
      }).eq("id", draftId);

      if (reachedEveryone) {
        const { data: fresh } = await admin.from("newsletter_drafts").select("*").eq("id", draftId).single();
        if (fresh && !fresh.advertiser_notified_at) {
          await maybeEmailAdvertiserReport(admin, fresh, fromHeader, replyTo);
        }
      }
    } else {
      await admin.from("newsletter_drafts").update({ status: "approved" }).eq("id", draftId);
    }

    return { sent, failed, errors };
  };

  const isBulk = !testEmail && recipients.length > 1;
  const SYNC_THRESHOLD = 10;
  // @ts-ignore
  const waitUntil: ((p: Promise<any>) => void) | undefined = (globalThis as any).EdgeRuntime?.waitUntil;

  if (isBulk && recipients.length > SYNC_THRESHOLD && typeof waitUntil === "function") {
    const totalActive = (await loadAllActiveSubscribers(admin, draft.publication_id)).length;
    waitUntil(runSend().catch(async (err) => {
      await admin.from("newsletter_drafts").update({
        status: "approved",
        last_error: String(err?.message || err).slice(0, 500),
      }).eq("id", draftId);
    }));
    return json({
      queued: true,
      total: totalActive,
      remaining: recipients.length,
      message: "Send started in background",
    }, 202);
  }

  const result = await runSend();
  return json({
    queued: false,
    sent: result.sent,
    failed: result.failed,
    errors: result.errors.slice(0, 20),
  }, result.failed === 0 ? 200 : 207);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
