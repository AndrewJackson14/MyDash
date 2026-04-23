// ============================================================
// notify-mention — fire email alerts when one team member @-tags
// another in a Discussion / message thread.
//
// Called from ChatPanel right after the mention notification rows
// are written to the `notifications` table. Keeping the in-app
// side separate (done client-side) and the email side here means
// a transient SES failure doesn't drop the bell-badge alert.
//
// Request body: {
//   mentionedUserIds: string[],   // team_members.id
//   senderName:       string,     // "Cami Martin"
//   body:             string,     // raw message text (with @[name](id) tokens)
//   contextLabel?:    string,     // e.g. "Story: Lida M. Lucas 1937-…"
//   contextUrl?:      string,     // absolute link back to the thread
// }
//
// Env: AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY,
//      AWS_SES_REGION (defaults us-east-1),
//      MENTION_FROM_EMAIL (defaults "MyDash <publisher@pasoroblespress.com>"),
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//
// If AWS creds are missing the function exits 200 with { skipped: true }
// rather than 500 — mention alerts degrade gracefully to in-app only.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_SES_ACCESS_KEY_ID") || "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SES_SECRET_ACCESS_KEY") || "";
const AWS_REGION = Deno.env.get("AWS_SES_REGION") || "us-east-1";
const FROM_HEADER = Deno.env.get("MENTION_FROM_EMAIL") || "MyDash <publisher@pasoroblespress.com>";
const APP_URL = Deno.env.get("PUBLIC_APP_URL") || "https://mydash.media";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
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

async function sesSendEmail(params: { from: string; to: string; subject: string; html: string; }): Promise<{ messageId: string }> {
  const host = `email.${AWS_REGION}.amazonaws.com`;
  const path = "/v2/email/outbound-emails";
  const body = JSON.stringify({
    FromEmailAddress: params.from,
    Destination: { ToAddresses: [params.to] },
    Content: { Simple: {
      Subject: { Data: params.subject, Charset: "UTF-8" },
      Body: { Html: { Data: params.html, Charset: "UTF-8" } },
    } },
  });
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(body);
  const canonical = ["POST", path, "",
    "content-type:application/json", `host:${host}`,
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

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]!));
}

// Strip @[name](id) tokens down to @name for the email preview.
function stripTokens(body: string) {
  return body.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Silent skip if SES isn't configured — in-app notifications still
  // fired client-side, so nothing breaks for the user.
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    return json({ skipped: true, reason: "SES creds missing" });
  }

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const ids: string[] = Array.isArray(payload.mentionedUserIds) ? payload.mentionedUserIds.filter(Boolean) : [];
  const senderName: string = String(payload.senderName || "Someone");
  const body: string = String(payload.body || "");
  const contextLabel: string = String(payload.contextLabel || "a discussion");
  const contextUrl: string = String(payload.contextUrl || APP_URL);
  if (!ids.length) return json({ sent: 0 });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: members } = await admin
    .from("team_members")
    .select("id, name, email, is_active")
    .in("id", ids);

  const targets = (members || []).filter(m => m.email && m.is_active !== false);
  if (!targets.length) return json({ sent: 0 });

  const preview = stripTokens(body).slice(0, 400);
  const subject = `${senderName} mentioned you in ${contextLabel}`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px 20px;color:#222;">
      <div style="font-size:13px;color:#666;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;margin-bottom:4px;">MyDash mention</div>
      <h2 style="font-size:18px;font-weight:700;margin:0 0 12px;color:#111;">${escapeHtml(senderName)} tagged you in ${escapeHtml(contextLabel)}</h2>
      <div style="padding:14px 16px;background:#f6f7f9;border-left:3px solid #3b82f6;border-radius:3px;font-size:14px;line-height:1.5;color:#333;white-space:pre-wrap;margin-bottom:18px;">${escapeHtml(preview)}</div>
      <a href="${escapeHtml(contextUrl)}" style="display:inline-block;padding:9px 18px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:20px;font-size:13px;font-weight:700;">Open in MyDash</a>
      <div style="font-size:11px;color:#888;margin-top:24px;">You received this because you were mentioned in a MyDash discussion.</div>
    </div>
  `.trim();

  const results: any[] = [];
  for (const t of targets) {
    try {
      const r = await sesSendEmail({ from: FROM_HEADER, to: t.email, subject, html });
      results.push({ user_id: t.id, ok: true, messageId: r.messageId });
    } catch (e: any) {
      results.push({ user_id: t.id, ok: false, error: String(e?.message || e) });
    }
  }

  return json({ sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results });
});
