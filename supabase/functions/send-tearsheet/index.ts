// ============================================================
// send-tearsheet — Anthony Phase 5f. One-click branded email to a
// client with a link to their tearsheet portal page. Anthony or
// the sales rep fires this from the Layout Console (or anywhere
// that has a sale_id with a tearsheet_token).
//
// The tearsheet portal at /tearsheet/<token> is itself public and
// stateless — this function just generates a styled email so the
// client doesn't have to receive a raw URL pasted into Gmail.
//
// POST application/json
//   Authorization: Bearer <user JWT>
//   Body: { sale_id, recipient_email, cc_emails?, custom_message? }
//
// 200 → { ok, gmail_message_id }
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
  pubName: string;
  pubLogoUrl: string | null;
  pubPrimaryColor: string | null;
  clientName: string;
  contactName: string | null;
  issueLabel: string;
  pageNumber: number;
  portalUrl: string;
  customMessage: string | null;
  senderName: string;
}) {
  const greeting = opts.contactName ? `Hi ${opts.contactName.split(" ")[0]},` : "Hello,";
  const accent = opts.pubPrimaryColor || "#0C447C";
  const noteBlock = opts.customMessage
    ? `<div style="margin:20px 0;padding:14px 16px;background:#FFF8E1;border-left:3px solid #D97706;border-radius:6px;font-size:14px;color:#1A1A1A;line-height:1.5;white-space:pre-wrap;">${esc(opts.customMessage)}</div>`
    : "";
  const logoBlock = opts.pubLogoUrl
    ? `<img src="${opts.pubLogoUrl}" alt="${esc(opts.pubName)}" style="height:36px;max-width:160px;object-fit:contain;display:block;margin-bottom:8px;" />`
    : `<div style="font-size:20px;font-weight:700;color:${accent};letter-spacing:-0.3px;">${esc(opts.pubName)}</div>`;

  return `<!doctype html><html><body style="margin:0;background:#F5F5F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1A1A;">
    <div style="max-width:560px;margin:0 auto;padding:32px 24px;background:#FFFFFF;border:1px solid #E6E5DE;border-radius:12px;margin-top:24px;">
      ${logoBlock}
      <div style="font-size:11px;font-weight:700;color:#5F5E5A;letter-spacing:1px;text-transform:uppercase;margin-top:4px;">Tearsheet · ${esc(opts.clientName)}</div>

      <p style="font-size:16px;line-height:1.5;margin:24px 0 8px;">${greeting}</p>
      <p style="font-size:15px;line-height:1.55;margin:0 0 20px;color:#2C2C2A;">
        Your ad ran on <strong>page ${opts.pageNumber}</strong> of <strong>${esc(opts.pubName)} &mdash; ${esc(opts.issueLabel)}</strong>. Click below to view or download your tearsheet.
      </p>

      ${noteBlock}

      <p style="margin:28px 0;">
        <a href="${opts.portalUrl}" style="display:inline-block;background:${accent};color:#FFFFFF;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;">View tearsheet &rarr;</a>
      </p>

      <p style="font-size:13px;color:#5F5E5A;line-height:1.5;margin:0;">If the button doesn't work, copy this URL into your browser:<br/><a href="${opts.portalUrl}" style="color:${accent};word-break:break-all;">${opts.portalUrl}</a></p>

      <p style="font-size:13px;color:#2C2C2A;line-height:1.55;margin:24px 0 0;">
        Thank you for advertising with us &mdash; ${esc(opts.senderName)}
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

  const saleId = String(body?.sale_id || "").trim();
  const recipientEmail = String(body?.recipient_email || "").trim();
  const ccRaw = body?.cc_emails;
  const ccEmails = Array.isArray(ccRaw) ? ccRaw.map((e: any) => String(e).trim()).filter(isEmail)
                  : typeof ccRaw === "string" ? ccRaw.split(",").map(s => s.trim()).filter(isEmail)
                  : [];
  const customMessage = String(body?.custom_message || "").trim() || null;

  if (!saleId) return json({ error: "sale_id required" }, 400);
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

  // Resolve sale → token + branding context. We re-do the join
  // here (instead of calling get_tearsheet) so we can also pull the
  // contact name for the email greeting; the public RPC strips
  // contact info to keep portal payload minimal.
  const { data: sale } = await admin.from("sales")
    .select("id, client_id, issue_id, page, ad_size, status, tearsheet_token")
    .eq("id", saleId).maybeSingle();
  if (!sale) return json({ error: "sale not found" }, 404);
  if (sale.status !== "Closed") return json({ error: "sale not closed" }, 400);
  if (!sale.page) return json({ error: "sale has no page assignment" }, 400);
  if (!sale.tearsheet_token) return json({ error: "no tearsheet_token (re-run migration 151)" }, 500);

  const { data: client } = await admin.from("clients").select("id, name, contacts").eq("id", sale.client_id).maybeSingle();
  if (!client) return json({ error: "client not found" }, 404);

  // Best-effort contact name lookup. Match recipient against any
  // contacts array entry; falls through to null if unmatched.
  const contacts = Array.isArray(client.contacts) ? client.contacts : [];
  const matchedContact = contacts.find((c: any) => (c?.email || "").toLowerCase() === recipientEmail.toLowerCase());
  const contactName = matchedContact?.name || null;

  const { data: iss } = await admin.from("issues").select("label, pub_id").eq("id", sale.issue_id).maybeSingle();
  const { data: pub } = iss?.pub_id
    ? await admin.from("publications").select("name, logo_url, primary_color").eq("id", iss.pub_id).maybeSingle()
    : { data: null };

  const portalUrl = `${PUBLIC_APP_URL}/tearsheet/${sale.tearsheet_token}`;

  const tokenRes = await pullGmailToken(admin);
  if (!tokenRes) return json({ error: "no_gmail_tokens", detail: "Connect a Gmail account in Integrations to enable tearsheet sends." }, 500);

  const html = buildEmail({
    pubName: pub?.name || "13 Stars Media",
    pubLogoUrl: pub?.logo_url || null,
    pubPrimaryColor: pub?.primary_color || null,
    clientName: client.name || "",
    contactName,
    issueLabel: iss?.label || "your issue",
    pageNumber: sale.page,
    portalUrl,
    customMessage,
    senderName,
  });
  const subject = `${pub?.name || "13 Stars Media"}: Your tearsheet — ${client.name || ""} · Page ${sale.page}`;

  const result = await sendGmail(tokenRes.accessToken, {
    to: recipientEmail,
    cc: ccEmails.length ? ccEmails : undefined,
    subject,
    html,
  });
  if (!result.ok) return json({ error: "send_failed", detail: result.reason }, 500);

  // Audit trail
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
    ref_type: "tearsheet",
    ref_id: sale.id,
  });

  return json({ ok: true, gmail_message_id: result.messageId, portal_url: portalUrl });
});
