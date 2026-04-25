// ============================================================
// send-asset-request — emails a client a "drop your assets here"
// link tied to an ad_projects.client_upload_token (Jen P0.4).
//
// Pairs with the existing public ClientUpload.jsx page that
// resolves the token and writes uploads to the project's media
// folder. Until now there was no UI to send the link, so the
// upload page was effectively unused.
//
// Service-role / authenticated callers only. Mirrors send-proof's
// Gmail-token pattern; same branded HTML email shape.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://mydash.media,http://localhost:5173,http://localhost:4173").split(",");

function corsFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function pullGmailToken(admin: any): Promise<{ accessToken: string; userId: string } | null> {
  const { data: admins } = await admin.from("team_members")
    .select("auth_id").not("auth_id", "is", null).limit(20);
  for (const a of (admins || [])) {
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
    return { accessToken, userId: a.auth_id };
  }
  return null;
}

async function sendGmail(accessToken: string, opts: { to: string; subject: string; html: string }): Promise<{ ok: boolean; reason?: string; messageId?: string }> {
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
    return { ok: false, reason: `gmail_${res.status}: ${text.slice(0, 200)}` };
  }
  const body = await res.json();
  return { ok: true, messageId: body?.id };
}

function buildAssetRequestEmail(opts: {
  pubName: string;
  contactName: string | null;
  adSize: string | null;
  uploadUrl: string;
}) {
  const greeting = opts.contactName ? `Hi ${opts.contactName.split(" ")[0]},` : "Hello,";
  return `<!doctype html><html><body style="margin:0;background:#F5F5F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1A1A;">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px;background:#FFFFFF;border:1px solid #E6E5DE;border-radius:12px;margin-top:24px;">
      <div style="font-size:20px;font-weight:700;color:#0C447C;letter-spacing:-0.3px;">${opts.pubName}</div>
      <div style="font-size:11px;font-weight:700;color:#5F5E5A;letter-spacing:1px;text-transform:uppercase;margin-top:4px;">Asset Upload Request</div>

      <p style="font-size:16px;line-height:1.5;margin:24px 0 8px;">${greeting}</p>
      <p style="font-size:15px;line-height:1.55;margin:0 0 20px;color:#2C2C2A;">
        We're getting started on your ${opts.adSize ? `<strong>${opts.adSize}</strong> ` : ""}ad for <strong>${opts.pubName}</strong>. Please drop any logos, images, copy, or reference files at the link below — files upload directly to our designer, no account needed.
      </p>

      <p style="margin:28px 0;">
        <a href="${opts.uploadUrl}" style="display:inline-block;background:#0C447C;color:#FFFFFF;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;">Upload your files &rarr;</a>
      </p>

      <p style="font-size:13px;color:#5F5E5A;line-height:1.5;margin:0;">If the button doesn't work, copy this URL into your browser:<br/><a href="${opts.uploadUrl}" style="color:#0C447C;word-break:break-all;">${opts.uploadUrl}</a></p>

      <p style="margin:24px 0 0;font-size:12px;color:#5F5E5A;line-height:1.5;">Have questions about formats or specs? Just reply to this email.</p>

      <hr style="border:none;border-top:1px solid #E6E5DE;margin:24px 0 16px;" />
      <p style="font-size:11px;color:#5F5E5A;line-height:1.5;margin:0;">13 Stars Media · 5860 El Camino Real, Suite C, Atascadero, CA 93422 · 805&#8209;464&#8209;2900</p>
    </div>
  </body></html>`;
}

serve(async (req) => {
  const cors = corsFor(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, cors);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "missing_bearer" }, 401, cors);
  const token = authHeader.slice(7).trim();
  if (token !== SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1] || ""));
      if (!payload?.sub) return json({ error: "invalid_token" }, 401, cors);
    } catch { return json({ error: "invalid_token" }, 401, cors); }
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400, cors); }
  const { projectId, recipientEmail, recipientName, uploadUrl, adSize, pubName } = body || {};
  if (!projectId) return json({ error: "projectId required" }, 400, cors);
  if (!recipientEmail) return json({ error: "recipientEmail required" }, 400, cors);
  if (!uploadUrl) return json({ error: "uploadUrl required" }, 400, cors);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const tokenRes = await pullGmailToken(admin);
  if (!tokenRes) return json({ error: "no_gmail_tokens", detail: "No team_member has connected Gmail. Connect one in Integrations to enable asset-request emails." }, 500, cors);

  const html = buildAssetRequestEmail({
    pubName: pubName || "13 Stars Media",
    contactName: recipientName || null,
    adSize: adSize || null,
    uploadUrl,
  });
  const subject = `${pubName || "13 Stars Media"}: Please upload your files`;

  const sendResult = await sendGmail(tokenRes.accessToken, {
    to: recipientEmail,
    subject,
    html,
  });
  if (!sendResult.ok) return json({ error: "send_failed", detail: sendResult.reason }, 500, cors);

  // Optional: stamp project so the UI can show "Last requested {when}"
  await admin.from("ad_projects").update({
    asset_request_sent_at: new Date().toISOString(),
  }).eq("id", projectId);

  return json({
    ok: true,
    sent_at: new Date().toISOString(),
    recipient: recipientEmail,
    gmail_message_id: sendResult.messageId || null,
  }, 200, cors);
});
