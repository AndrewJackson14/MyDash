// ============================================================
// send-portfolio — Anthony Phase 5h. One-click branded email to a
// client with a link to their full tearsheet portfolio (every issue
// they've ever advertised in). Counterpart to send-tearsheet (P5f),
// which sends a single-page link.
//
// Sales reps fire this at onboarding ("here's every tearsheet you've
// ever earned with us") or annual review. The portfolio URL itself
// is /ads/<client.portfolio_token> — public, no auth, auto-updates
// as new tearsheets generate.
//
// POST application/json
//   Authorization: Bearer <user JWT>
//   Body: { client_id, recipient_email, cc_emails?, custom_message? }
//
// 200 → { ok, gmail_message_id, portal_url }
// 4xx/5xx → { error }
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

async function sendGmail(accessToken: string, opts: { to: string; cc?: string[]; subject: string; html: string }) {
  const ccLine = opts.cc?.length ? `Cc: ${opts.cc.join(", ")}\r\n` : "";
  const raw = btoa(
    `To: ${opts.to}\r\n${ccLine}Subject: ${opts.subject}\r\n` +
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
  clientName: string;
  contactName: string | null;
  portalUrl: string;
  tearsheetCount: number;
  pubCount: number;
  customMessage: string | null;
  senderName: string;
}) {
  const greeting = opts.contactName ? `Hi ${opts.contactName.split(" ")[0]},` : "Hello,";
  const noteBlock = opts.customMessage
    ? `<div style="margin:20px 0;padding:14px 16px;background:#FFF8E1;border-left:3px solid #D97706;border-radius:6px;font-size:14px;color:#1A1A1A;line-height:1.5;white-space:pre-wrap;">${esc(opts.customMessage)}</div>`
    : "";
  const stats = opts.tearsheetCount > 0
    ? `<div style="margin:18px 0;padding:14px 16px;background:#F5F5F3;border-radius:6px;font-size:14px;color:#2C2C2A;line-height:1.6;">
        <strong>${opts.tearsheetCount}</strong> tearsheet${opts.tearsheetCount === 1 ? "" : "s"}
        ${opts.pubCount > 0 ? ` across <strong>${opts.pubCount}</strong> publication${opts.pubCount === 1 ? "" : "s"}` : ""}
      </div>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F5F5F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1A1A;">
    <div style="max-width:560px;margin:0 auto;padding:32px 24px;background:#FFFFFF;border:1px solid #E6E5DE;border-radius:12px;margin-top:24px;">
      <div style="font-size:20px;font-weight:700;color:#0C447C;letter-spacing:-0.3px;">13 Stars Media</div>
      <div style="font-size:11px;font-weight:700;color:#5F5E5A;letter-spacing:1px;text-transform:uppercase;margin-top:4px;">Tearsheet portfolio · ${esc(opts.clientName)}</div>

      <p style="font-size:16px;line-height:1.5;margin:24px 0 8px;">${greeting}</p>
      <p style="font-size:15px;line-height:1.55;margin:0 0 16px;color:#2C2C2A;">
        Bookmark this link — it's your permanent tearsheet archive. Every ad you've ever run with us is here, and every new ad will appear automatically the day it goes to press.
      </p>

      ${stats}
      ${noteBlock}

      <p style="margin:28px 0;">
        <a href="${opts.portalUrl}" style="display:inline-block;background:#0C447C;color:#FFFFFF;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;">View your portfolio &rarr;</a>
      </p>

      <p style="font-size:13px;color:#5F5E5A;line-height:1.5;margin:0;">If the button doesn't work, copy this URL into your browser:<br/><a href="${opts.portalUrl}" style="color:#0C447C;word-break:break-all;">${opts.portalUrl}</a></p>

      <p style="font-size:13px;color:#2C2C2A;line-height:1.55;margin:24px 0 0;">
        Thank you for advertising with us — ${esc(opts.senderName)}
      </p>

      <hr style="border:none;border-top:1px solid #E6E5DE;margin:24px 0 16px;" />
      <p style="font-size:11px;color:#5F5E5A;line-height:1.5;margin:0;">13 Stars Media &middot; 5860 El Camino Real, Suite C, Atascadero, CA 93422 &middot; 805&#8209;464&#8209;2900</p>
    </div>
  </body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const clientId = String(body?.client_id || "").trim();
  const recipientEmail = String(body?.recipient_email || "").trim();
  const ccRaw = body?.cc_emails;
  const ccEmails = Array.isArray(ccRaw) ? ccRaw.map((e: any) => String(e).trim()).filter(isEmail)
                  : typeof ccRaw === "string" ? ccRaw.split(",").map(s => s.trim()).filter(isEmail)
                  : [];
  const customMessage = String(body?.custom_message || "").trim() || null;

  if (!clientId) return json({ error: "client_id required" }, 400);
  if (!isEmail(recipientEmail)) return json({ error: "valid recipient_email required" }, 400);

  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "Not authenticated" }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: tm } = await admin.from("team_members")
    .select("id, name").eq("auth_id", userData.user.id).maybeSingle();
  const senderName = tm?.name || "13 Stars Media";

  const { data: client } = await admin.from("clients")
    .select("id, name, contacts, portfolio_token").eq("id", clientId).maybeSingle();
  if (!client) return json({ error: "client not found" }, 404);
  if (!client.portfolio_token) return json({ error: "no portfolio_token (re-run migration 152)" }, 500);

  // Best-effort contact name lookup against client.contacts
  const contacts = Array.isArray(client.contacts) ? client.contacts : [];
  const matchedContact = contacts.find((c: any) => (c?.email || "").toLowerCase() === recipientEmail.toLowerCase());
  const contactName = matchedContact?.name || null;

  // Quick portfolio stats — count and pub diversity. Bounded by
  // closed sales with a page; same filter as get_client_portfolio.
  const { data: salesRows } = await admin.from("sales")
    .select("id, issue_id")
    .eq("client_id", client.id)
    .eq("status", "Closed")
    .not("page", "is", null);
  const tearsheetCount = (salesRows || []).length;
  let pubCount = 0;
  if (tearsheetCount > 0) {
    const issueIds = [...new Set((salesRows || []).map(r => r.issue_id).filter(Boolean))];
    if (issueIds.length > 0) {
      const { data: issueRows } = await admin.from("issues").select("pub_id").in("id", issueIds);
      pubCount = new Set((issueRows || []).map(r => r.pub_id).filter(Boolean)).size;
    }
  }

  const portalUrl = `${PUBLIC_APP_URL}/ads/${client.portfolio_token}`;

  const tokenRes = await pullGmailToken(admin);
  if (!tokenRes) return json({ error: "no_gmail_tokens", detail: "Connect a Gmail account in Integrations to enable portfolio sends." }, 500);

  const html = buildEmail({
    clientName: client.name || "",
    contactName,
    portalUrl,
    tearsheetCount,
    pubCount,
    customMessage,
    senderName,
  });
  const subject = `Your tearsheet portfolio — ${client.name || ""}`;

  const result = await sendGmail(tokenRes.accessToken, {
    to: recipientEmail,
    cc: ccEmails.length ? ccEmails : undefined,
    subject,
    html,
  });
  if (!result.ok) return json({ error: "send_failed", detail: result.reason }, 500);

  await admin.from("email_log").insert({
    type: "outbound",
    direction: "outbound",
    from_email: userData.user.email || null,
    to_email: recipientEmail,
    subject,
    status: "sent",
    client_id: client.id,
    gmail_message_id: result.messageId || null,
    created_at: new Date().toISOString(),
    ref_type: "portfolio",
    ref_id: client.id,
  });

  return json({ ok: true, gmail_message_id: result.messageId, portal_url: portalUrl });
});
