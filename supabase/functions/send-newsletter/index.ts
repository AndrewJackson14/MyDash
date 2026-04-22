// ============================================================
// send-newsletter — AWS SES SendEmail fan-out for a draft.
//
// v8 notes:
//  - Accepts draft_id from body.draft_id in addition to the
//    x-draft-id header so pg_cron can invoke via the shared
//    cron_invoke_edge_function helper.
//  - Accepts service_role JWT auth (role=service_role) without
//    requiring a user session — that's how the cron path calls in.
//  - When a draft has recurrence set, the final successful send
//    clones the draft and schedules the next occurrence via a
//    new row with status=scheduled + scheduled_at=<next firing>.
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
      <p style="margin:20px 0 0;font-size:12px;color:#888">— 13 Stars Media</p>
    </div>`;
  try {
    await sesSendEmail({ from: fromHeader, replyTo, to: client.billing_email, subject, html });
    await admin.from("newsletter_drafts").update({ advertiser_notified_at: new Date().toISOString() }).eq("id", draft.id);
  } catch (e: any) {
    console.error("advertiser report email failed:", e?.message || e);
  }
}

// ─── Recurrence: compute next firing UTC timestamp ───────────
// Inputs are all in the rule's own timezone (default LA). We build
// the next firing in local time, then convert to UTC for storage.
// Implementation uses a canonical "wall-clock builder" that doesn't
// rely on Temporal API or date-fns-tz — Deno edge runtime has
// Intl.DateTimeFormat which is enough to discover TZ offset.
function computeNextRunAt(rule: any, fromUtc: Date = new Date()): Date | null {
  if (!rule || !rule.type) return null;
  const tz = rule.timezone || "America/Los_Angeles";
  const hour = Number.isInteger(rule.hour) ? rule.hour : 8;
  const minute = Number.isInteger(rule.minute) ? rule.minute : 0;

  // Represent "now" in the target timezone so we can reason about wall time.
  const localNow = new Date(fromUtc.toLocaleString("en-US", { timeZone: tz }));

  const buildLocal = (y: number, m: number, d: number) =>
    new Date(new Date(Date.UTC(y, m, d, hour, minute, 0))
      .toLocaleString("en-US", { timeZone: tz }) === ""
        ? Date.UTC(y, m, d, hour, minute, 0)
        : Date.UTC(y, m, d, hour, minute, 0));
  // Simpler: build a local-wall Date, then use the IANA offset at that moment
  // to subtract back to UTC. The offset-finder handles DST transitions.
  const toUtcWithTz = (y: number, m: number, d: number) => {
    // A Date constructed with locale fields is local-time on the server.
    // We want: "what UTC moment has wall time y-m-d h:mm in `tz`?"
    // Trick: probe the offset by formatting a trial UTC time and comparing.
    const trial = new Date(Date.UTC(y, m, d, hour, minute, 0));
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric",
      hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(trial).map(p => [p.type, p.value]));
    const actualLocal = new Date(
      `${parts.year}-${String(parts.month).padStart(2,"0")}-${String(parts.day).padStart(2,"0")}T` +
      `${String(parts.hour).padStart(2,"0")}:${String(parts.minute).padStart(2,"0")}:${String(parts.second).padStart(2,"0")}Z`
    );
    const offsetMs = actualLocal.getTime() - trial.getTime();
    return new Date(trial.getTime() - offsetMs);
  };

  if (rule.type === "daily") {
    let y = localNow.getFullYear(), m = localNow.getMonth(), d = localNow.getDate();
    let cand = toUtcWithTz(y, m, d);
    if (cand <= fromUtc) {
      cand = toUtcWithTz(y, m, d + 1);
    }
    return cand;
  }

  if (rule.type === "weekly") {
    const days: number[] = Array.isArray(rule.days) && rule.days.length ? rule.days : [1];
    for (let offset = 0; offset < 14; offset++) {
      const probe = new Date(localNow.getTime() + offset * 86400000);
      // JS getDay: 0=Sun..6=Sat — convert to ISO 1=Mon..7=Sun.
      const iso = probe.getDay() === 0 ? 7 : probe.getDay();
      if (!days.includes(iso)) continue;
      const cand = toUtcWithTz(probe.getFullYear(), probe.getMonth(), probe.getDate());
      if (cand > fromUtc) return cand;
    }
    return null;
  }

  if (rule.type === "monthly") {
    const targetDay = Math.min(Math.max(1, Number(rule.day) || 1), 28); // cap at 28 for simplicity
    for (let offset = 0; offset < 2; offset++) {
      const probe = new Date(localNow.getFullYear(), localNow.getMonth() + offset, targetDay);
      const cand = toUtcWithTz(probe.getFullYear(), probe.getMonth(), probe.getDate());
      if (cand > fromUtc) return cand;
    }
    return null;
  }

  return null;
}

// Clone a just-sent draft and schedule the next occurrence. Strips
// per-send fields so the new row starts clean.
async function rescheduleRecurring(admin: any, draft: any) {
  const next = computeNextRunAt(draft.recurrence);
  if (!next) return;
  const {
    id, share_token, sent_at, advertiser_notified_at, last_error,
    recipient_count, delivered_count, bounce_count, complaint_count,
    open_count, click_count, created_at, updated_at, status,
    ...cloneable
  } = draft;

  await admin.from("newsletter_drafts").insert({
    ...cloneable,
    status: "scheduled",
    scheduled_at: next.toISOString(),
    recipient_count: 0,
    delivered_count: 0, bounce_count: 0, complaint_count: 0,
    open_count: 0, click_count: 0,
    last_error: null,
  });
}

function getJwtRole(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role || null;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) return json({ error: "Not authenticated" }, 401);
  const token = authHeader.replace("Bearer ", "");
  const isServiceRole = getJwtRole(token) === "service_role";

  if (!isServiceRole) {
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Not authenticated" }, 401);
  }

  // Body may carry draft_id / test_email for the service-role cron path.
  let body: any = {};
  try { body = await req.clone().json(); } catch {}

  const draftId = req.headers.get("x-draft-id") || body.draft_id || null;
  const testEmail = req.headers.get("x-test-email") || body.test_email || null;
  if (!draftId) return json({ error: "Missing x-draft-id" }, 400);

  const { data: draft, error: draftErr } = await admin
    .from("newsletter_drafts").select("*").eq("id", draftId).single();
  if (draftErr || !draft) return json({ error: "Draft not found" }, 404);

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
    if (fresh?.recurrence) await rescheduleRecurring(admin, fresh);
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
        if (fresh?.recurrence) await rescheduleRecurring(admin, fresh);
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
