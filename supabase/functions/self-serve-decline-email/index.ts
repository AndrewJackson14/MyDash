// ============================================================
// self-serve-decline-email — sends the rep's decline reason to the
// advertiser when a self-serve proposal is moved Awaiting Review →
// Declined. Mirrors the send-statement Gmail OAuth + email_log
// pattern; fired from the Decline button in the SalesCRM proposal
// detail panel.
//
// POST application/json
//   Authorization: Bearer <user JWT>
//   Body: { proposal_id }
//
// 200 → { ok, gmail_message_id, recipient }
// 4xx/5xx → { error, detail? }
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const PUBLIC_APP_URL = Deno.env.get("PUBLIC_APP_URL") || "https://mydash.media";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function isEmail(s: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
function esc(s: string) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

async function pullGmailToken(admin: any): Promise<{ accessToken: string } | null> {
  const { data: members } = await admin.from("team_members").select("auth_id").not("auth_id", "is", null).limit(20);
  for (const a of (members || [])) {
    const { data: t } = await admin.from("google_tokens").select("*").eq("user_id", a.auth_id).maybeSingle();
    if (!t?.access_token) continue;
    let accessToken = t.access_token;
    const expiry = t.token_expiry ? new Date(t.token_expiry) : new Date(0);
    if (expiry.getTime() - Date.now() < 300_000 && t.refresh_token) {
      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: t.refresh_token,
          grant_type: "refresh_token",
        }),
      });
      const refreshData = await refreshRes.json();
      if (refreshData.access_token) {
        accessToken = refreshData.access_token;
        await admin.from("google_tokens").update({
          access_token: accessToken,
          token_expiry: new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString(),
        }).eq("user_id", a.auth_id);
      }
    }
    return { accessToken };
  }
  return null;
}

async function sendGmail(accessToken: string, opts: { to: string; subject: string; html: string }) {
  const raw = btoa(
    `To: ${opts.to}\r\nSubject: ${opts.subject}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: text/html; charset="UTF-8"\r\n\r\n` +
    opts.html
  ).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const res = await fetch(`${GMAIL_BASE}/messages/send`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false as const, reason: `gmail_${res.status}: ${text.slice(0, 200)}` };
  }
  const body = await res.json();
  return { ok: true as const, messageId: body?.id };
}

function buildEmail(opts: {
  businessName: string;
  reason: string | null;
  pubName: string | null;
  senderName: string;
  proposalUrl: string | null;
}) {
  const reasonBlock = opts.reason
    ? `<div style="margin:20px 0;padding:14px 16px;background:#FFF8E1;border-left:3px solid #D97706;border-radius:6px;font-size:14px;color:#1A1A1A;line-height:1.5;white-space:pre-wrap;">${esc(opts.reason)}</div>`
    : "";
  const linkBlock = opts.proposalUrl
    ? `<p style="margin:16px 0 0;font-size:14px;color:#444;">You can view the full status at <a href="${esc(opts.proposalUrl)}" style="color:#0a84ff;">this link</a> any time.</p>`
    : "";
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F4F4F0;font-family:'Geist','Helvetica Neue',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F0;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;border:1px solid #E5E5E0;overflow:hidden;">
        <tr><td style="padding:28px 32px 8px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#888;">13 Stars Media</div>
          <h1 style="margin:8px 0 12px;font-size:22px;font-weight:600;color:#111;">About your ${esc(opts.pubName || "advertising")} request</h1>
          <p style="margin:0 0 12px;font-size:15px;color:#222;line-height:1.5;">Hi ${esc(opts.businessName)},</p>
          <p style="margin:0 0 8px;font-size:15px;color:#222;line-height:1.5;">Thank you for submitting your advertising request. After review, we're not able to move forward with this submission as-is.</p>
          ${reasonBlock}
          <p style="margin:0;font-size:15px;color:#222;line-height:1.5;">If you'd like to discuss alternatives or revise the request, just reply to this email and ${esc(opts.senderName)} will follow up directly.</p>
          ${linkBlock}
        </td></tr>
        <tr><td style="padding:16px 32px 28px;border-top:1px solid #EEE;font-size:12px;color:#888;">
          — ${esc(opts.senderName)}, 13 Stars Media
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const proposalId = String(body?.proposal_id || "").trim();
  if (!proposalId) return json({ error: "proposal_id required" }, 400);

  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "Not authenticated" }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Pull the proposal + its first line's pub name. Validate it's a
  // declined self-serve proposal — don't email for any other state.
  const { data: prop } = await admin
    .from("proposals")
    .select("id, source, status, intake_email, notes, self_serve_token, client_id")
    .eq("id", proposalId)
    .maybeSingle();
  if (!prop) return json({ error: "proposal_not_found" }, 404);
  if (prop.source !== "self_serve") return json({ error: "not_self_serve" }, 400);
  if (prop.status !== "Declined") return json({ error: "wrong_status", detail: `status=${prop.status}` }, 400);

  const recipient = String(prop.intake_email || "").trim().toLowerCase();
  if (!isEmail(recipient)) return json({ error: "no_intake_email" }, 400);

  // Sender name + business name
  const { data: tm } = await admin.from("team_members").select("id, name").eq("auth_id", userData.user.id).maybeSingle();
  const senderName = tm?.name || "13 Stars Media";

  const { data: client } = await admin.from("clients").select("id, name").eq("id", prop.client_id).maybeSingle();
  const businessName = client?.name || "there";

  // First line's pub name (best-effort)
  const { data: line } = await admin
    .from("proposal_lines")
    .select("pub_name")
    .eq("proposal_id", proposalId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const pubName = line?.pub_name || null;

  const tokenRes = await pullGmailToken(admin);
  if (!tokenRes) return json({ error: "no_gmail_tokens", detail: "Connect a Gmail account in Integrations." }, 500);

  const proposalUrl = prop.self_serve_token
    ? `${PUBLIC_APP_URL}/advertise/self-serve/proposal/${prop.self_serve_token}`
    : null;

  const html = buildEmail({
    businessName,
    reason: prop.notes || null,
    pubName,
    senderName,
    proposalUrl,
  });
  const subject = pubName
    ? `About your ${pubName} ad request`
    : "About your ad request";

  const result = await sendGmail(tokenRes.accessToken, { to: recipient, subject, html });
  if (!result.ok) return json({ error: "send_failed", detail: result.reason }, 500);

  await admin.from("email_log").insert({
    type: "outbound",
    direction: "outbound",
    from_email: userData.user.email || null,
    to_email: recipient,
    subject,
    status: "sent",
    client_id: prop.client_id,
    gmail_message_id: result.messageId || null,
    created_at: new Date().toISOString(),
    ref_type: "self_serve_decline",
    ref_id: proposalId,
  });

  return json({ ok: true, gmail_message_id: result.messageId, recipient });
});
