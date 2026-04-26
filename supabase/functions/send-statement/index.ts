// ============================================================
// send-statement — Cami P3. One-click branded statement email
// summarizing all open invoices for a client with per-invoice
// "Pay now" links to /pay/<invoice_number>. Fired from the
// Collections Center; mirrors the send-tearsheet / send-portfolio
// pattern for Gmail OAuth + email_log audit.
//
// POST application/json
//   Authorization: Bearer <user JWT>
//   Body: { client_id, recipient_email, cc_emails?, custom_message?,
//           include_paid_recent? }
//
// 200 → { ok, gmail_message_id, invoice_count, total_due }
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
function fmtMoney(n: number) { return "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(s: string | null) {
  if (!s) return "—";
  try { return new Date(s + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return s; }
}

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
  invoices: Array<{ invoice_number: string; issue_date: string | null; due_date: string | null; total: number; balance_due: number; pay_url: string; overdue_days: number }>;
  totalDue: number;
  customMessage: string | null;
  senderName: string;
  todayStr: string;
}) {
  const greeting = opts.contactName ? `Hi ${opts.contactName.split(" ")[0]},` : "Hello,";
  const noteBlock = opts.customMessage
    ? `<div style="margin:20px 0;padding:14px 16px;background:#FFF8E1;border-left:3px solid #D97706;border-radius:6px;font-size:14px;color:#1A1A1A;line-height:1.5;white-space:pre-wrap;">${esc(opts.customMessage)}</div>`
    : "";
  const rows = opts.invoices.map(inv => {
    const overdueLabel = inv.overdue_days > 0
      ? `<span style="color:#DC2626;font-weight:700;">${inv.overdue_days}d overdue</span>`
      : `<span style="color:#5F5E5A;">Due ${esc(fmtDate(inv.due_date))}</span>`;
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #E6E5DE;font-size:13px;color:#1A1A1A;">
        <div style="font-weight:700;">#${esc(inv.invoice_number)}</div>
        <div style="font-size:11px;color:#5F5E5A;margin-top:2px;">Issued ${esc(fmtDate(inv.issue_date))} · ${overdueLabel}</div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #E6E5DE;font-size:13px;color:#1A1A1A;text-align:right;font-weight:700;white-space:nowrap;">
        ${esc(fmtMoney(inv.balance_due))}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #E6E5DE;text-align:right;">
        <a href="${inv.pay_url}" style="display:inline-block;background:#0C447C;color:#FFFFFF;text-decoration:none;padding:8px 14px;border-radius:6px;font-weight:700;font-size:12px;">Pay now</a>
      </td>
    </tr>`;
  }).join("");

  return `<!doctype html><html><body style="margin:0;background:#F5F5F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1A1A;">
    <div style="max-width:620px;margin:0 auto;padding:32px 24px;background:#FFFFFF;border:1px solid #E6E5DE;border-radius:12px;margin-top:24px;">
      <div style="font-size:20px;font-weight:700;color:#0C447C;letter-spacing:-0.3px;">13 Stars Media</div>
      <div style="font-size:11px;font-weight:700;color:#5F5E5A;letter-spacing:1px;text-transform:uppercase;margin-top:4px;">Account Statement · ${esc(opts.clientName)}</div>
      <div style="font-size:11px;color:#5F5E5A;margin-top:2px;">${esc(opts.todayStr)}</div>

      <p style="font-size:16px;line-height:1.5;margin:24px 0 8px;">${greeting}</p>
      <p style="font-size:15px;line-height:1.55;margin:0 0 16px;color:#2C2C2A;">
        Below is a summary of your open balance. Each invoice has a "Pay now" link that takes you straight to a secure checkout.
      </p>

      ${noteBlock}

      <div style="margin:18px 0;padding:14px 16px;background:#F5F5F3;border-radius:6px;font-size:14px;color:#2C2C2A;display:flex;justify-content:space-between;">
        <span><strong>Total due:</strong></span>
        <span style="font-weight:700;font-size:18px;color:#0C447C;">${esc(fmtMoney(opts.totalDue))}</span>
      </div>

      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        ${rows}
      </table>

      <p style="font-size:13px;color:#5F5E5A;line-height:1.5;margin:0;">
        Questions about your statement? Reply to this email or call us at <strong>805&#8209;464&#8209;2900</strong>.
      </p>

      <p style="font-size:13px;color:#2C2C2A;line-height:1.55;margin:18px 0 0;">— ${esc(opts.senderName)}</p>

      <hr style="border:none;border-top:1px solid #E6E5DE;margin:24px 0 16px;" />
      <p style="font-size:11px;color:#5F5E5A;line-height:1.5;margin:0;">13 Stars Media &middot; 5860 El Camino Real, Suite C, Atascadero, CA 93422</p>
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

  const { data: tm } = await admin.from("team_members").select("id, name").eq("auth_id", userData.user.id).maybeSingle();
  const senderName = tm?.name || "13 Stars Media";

  const { data: client } = await admin.from("clients").select("id, name, contacts, billing_email").eq("id", clientId).maybeSingle();
  if (!client) return json({ error: "client not found" }, 404);

  const contacts = Array.isArray(client.contacts) ? client.contacts : [];
  const matched = contacts.find((c: any) => (c?.email || "").toLowerCase() === recipientEmail.toLowerCase());
  const contactName = matched?.name || null;

  // Pull every open invoice for this client. balance_due > 0 + status
  // not paid/void/cancelled. Sorted oldest-due first so the email
  // table reads as a dunning ladder.
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: invs } = await admin
    .from("invoices")
    .select("invoice_number, issue_date, due_date, total, balance_due, status")
    .eq("client_id", clientId)
    .gt("balance_due", 0)
    .not("status", "in", "(paid,void,cancelled)")
    .order("due_date", { ascending: true })
    .limit(50);

  if (!invs || invs.length === 0) {
    return json({ error: "no open invoices for this client" }, 400);
  }

  const todayDate = new Date(todayStr);
  const enriched = invs.map(inv => {
    const due = inv.due_date ? new Date(inv.due_date) : null;
    const overdue_days = due ? Math.max(0, Math.round((todayDate.getTime() - due.getTime()) / 86400000)) : 0;
    return {
      invoice_number: inv.invoice_number || "—",
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      total: Number(inv.total || 0),
      balance_due: Number(inv.balance_due || 0),
      pay_url: `${PUBLIC_APP_URL}/pay/${encodeURIComponent(inv.invoice_number || "")}`,
      overdue_days,
    };
  });
  const totalDue = enriched.reduce((s, i) => s + (i.balance_due || 0), 0);

  const tokenRes = await pullGmailToken(admin);
  if (!tokenRes) return json({ error: "no_gmail_tokens", detail: "Connect a Gmail account in Integrations to enable statement sends." }, 500);

  const html = buildEmail({
    clientName: client.name || "",
    contactName,
    invoices: enriched,
    totalDue,
    customMessage,
    senderName,
    todayStr: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
  });
  const subject = `${client.name || "Account"} statement — ${enriched.length} open invoice${enriched.length === 1 ? "" : "s"} · ${fmtMoney(totalDue)}`;

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
    ref_type: "statement",
    ref_id: client.id,
  });

  return json({
    ok: true,
    gmail_message_id: result.messageId,
    invoice_count: enriched.length,
    total_due: totalDue,
  });
});
