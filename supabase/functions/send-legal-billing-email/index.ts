// ============================================================
// send-legal-billing-email — Cami P4. Two-mode email sender for the
// legal-notice billing workflow:
//
//   mode = "invoice"   — fired at notice creation (or back-fill).
//                        Branded email with invoice summary +
//                        per-invoice "Pay now" link.
//                        Stamps legal_notices.invoice_sent_at.
//
//   mode = "affidavit" — fired after publication runs complete +
//                        affidavit is uploaded. Same branded email
//                        BUT includes the affidavit PDF download
//                        link AND the current invoice balance.
//                        Stamps legal_notices.affidavit_sent_at.
//
// In both modes we look up the linked invoice via legal_notices.
// invoice_id (or fallback to the most recent invoice line with
// legal_notice_id set), so the recipient sees one consolidated
// view of "what was billed + the affidavit proving it ran".
//
// POST application/json
//   Authorization: Bearer <user JWT>
//   Body: { notice_id, mode: "invoice"|"affidavit",
//           recipient_email, cc_emails?, custom_message? }
//
// 200 → { ok, gmail_message_id, mode, invoice_number?, affidavit_url? }
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
  mode: "invoice" | "affidavit";
  clientName: string;
  contactName: string | null;
  noticeTitle: string;
  noticeNumber: string | null;
  fileNumber: string | null;
  pubName: string;
  runDates: string[];
  invoiceNumber: string | null;
  invoiceTotal: number;
  invoiceBalance: number;
  invoiceDueDate: string | null;
  payUrl: string | null;
  affidavitUrl: string | null;
  customMessage: string | null;
  senderName: string;
  todayStr: string;
}) {
  const greeting = opts.contactName ? `Hi ${opts.contactName.split(" ")[0]},` : "Hello,";
  const noteBlock = opts.customMessage
    ? `<div style="margin:20px 0;padding:14px 16px;background:#FFF8E1;border-left:3px solid #D97706;border-radius:6px;font-size:14px;color:#1A1A1A;line-height:1.5;white-space:pre-wrap;">${esc(opts.customMessage)}</div>`
    : "";
  const isPaid = opts.invoiceBalance <= 0 && opts.invoiceTotal > 0;

  const headline = opts.mode === "invoice"
    ? "Your legal notice has been booked"
    : "Your legal notice has run — affidavit attached";
  const intro = opts.mode === "invoice"
    ? `Your legal notice is booked${opts.runDates.length > 0 ? ` for ${opts.runDates.length} run${opts.runDates.length === 1 ? "" : "s"}` : ""}. Invoice details and payment link below.`
    : `Your legal notice has finished its publication runs in <strong>${esc(opts.pubName)}</strong>. The signed affidavit of publication is attached below for your records${isPaid ? "." : ", along with the remaining invoice balance and pay link."}`;

  // Notice meta block
  const metaRows = [
    ["Notice", opts.noticeTitle],
    opts.noticeNumber ? ["Notice #", opts.noticeNumber] : null,
    opts.fileNumber ? ["File #", opts.fileNumber] : null,
    ["Publication", opts.pubName],
    opts.runDates.length > 0 ? ["Run dates", opts.runDates.map(fmtDate).join(", ")] : null,
  ].filter(Boolean) as Array<[string, string]>;
  const metaTable = `<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:13px;">
    ${metaRows.map(([k, v]) => `<tr>
      <td style="padding:4px 8px 4px 0;color:#5F5E5A;width:110px;vertical-align:top;">${esc(k)}</td>
      <td style="padding:4px 0;color:#1A1A1A;font-weight:600;">${esc(v)}</td>
    </tr>`).join("")}
  </table>`;

  // Invoice block
  const invoiceBlock = opts.invoiceNumber
    ? `<div style="margin:18px 0;padding:14px 16px;background:#F5F5F3;border-radius:6px;font-size:14px;color:#2C2C2A;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:11px;color:#5F5E5A;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Invoice</div>
            <div style="font-size:15px;font-weight:700;color:#1A1A1A;margin-top:2px;">#${esc(opts.invoiceNumber)}${opts.invoiceDueDate ? ` · due ${esc(fmtDate(opts.invoiceDueDate))}` : ""}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:18px;font-weight:700;color:${isPaid ? "#16A34A" : "#0C447C"};">${esc(fmtMoney(opts.invoiceBalance))}</div>
            <div style="font-size:10px;color:#5F5E5A;text-transform:uppercase;letter-spacing:0.4px;">${isPaid ? "Paid in full" : "Balance due"}</div>
          </div>
        </div>
      </div>`
    : "";

  // Action buttons — Pay (when balance) + Affidavit (when affidavit mode)
  const buttons: string[] = [];
  if (!isPaid && opts.payUrl) {
    buttons.push(`<a href="${opts.payUrl}" style="display:inline-block;background:#0C447C;color:#FFFFFF;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;margin:4px;">Pay invoice &rarr;</a>`);
  }
  if (opts.mode === "affidavit" && opts.affidavitUrl) {
    buttons.push(`<a href="${opts.affidavitUrl}" style="display:inline-block;background:#16A34A;color:#FFFFFF;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;margin:4px;">Download affidavit (PDF) &rarr;</a>`);
  }
  const buttonRow = buttons.length > 0
    ? `<p style="margin:24px 0;text-align:center;">${buttons.join("")}</p>`
    : "";

  // Plaintext URL block for accessibility
  const plaintextUrls: string[] = [];
  if (!isPaid && opts.payUrl) plaintextUrls.push(`Pay invoice: <a href="${opts.payUrl}" style="color:#0C447C;word-break:break-all;">${opts.payUrl}</a>`);
  if (opts.mode === "affidavit" && opts.affidavitUrl) plaintextUrls.push(`Affidavit PDF: <a href="${opts.affidavitUrl}" style="color:#16A34A;word-break:break-all;">${opts.affidavitUrl}</a>`);
  const plaintextBlock = plaintextUrls.length > 0
    ? `<p style="font-size:12px;color:#5F5E5A;line-height:1.5;margin:0;">If the buttons don't work:<br/>${plaintextUrls.join("<br/>")}</p>`
    : "";

  return `<!doctype html><html><body style="margin:0;background:#F5F5F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1A1A;">
    <div style="max-width:620px;margin:0 auto;padding:32px 24px;background:#FFFFFF;border:1px solid #E6E5DE;border-radius:12px;margin-top:24px;">
      <div style="font-size:20px;font-weight:700;color:#0C447C;letter-spacing:-0.3px;">13 Stars Media</div>
      <div style="font-size:11px;font-weight:700;color:#5F5E5A;letter-spacing:1px;text-transform:uppercase;margin-top:4px;">Legal Notice · ${esc(opts.clientName)}</div>
      <div style="font-size:11px;color:#5F5E5A;margin-top:2px;">${esc(opts.todayStr)}</div>

      <h1 style="font-size:18px;font-weight:700;color:#1A1A1A;margin:20px 0 8px;">${esc(headline)}</h1>
      <p style="font-size:16px;line-height:1.5;margin:8px 0;">${greeting}</p>
      <p style="font-size:15px;line-height:1.55;margin:8px 0 16px;color:#2C2C2A;">${intro}</p>

      ${metaTable}
      ${invoiceBlock}
      ${noteBlock}
      ${buttonRow}
      ${plaintextBlock}

      <p style="font-size:13px;color:#5F5E5A;line-height:1.5;margin:20px 0 0;">
        Questions? Reply to this email or call us at <strong>805&#8209;464&#8209;2900</strong>.
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

  const noticeId = String(body?.notice_id || "").trim();
  const mode = String(body?.mode || "invoice").trim();
  const recipientEmail = String(body?.recipient_email || "").trim();
  const ccRaw = body?.cc_emails;
  const ccEmails = Array.isArray(ccRaw) ? ccRaw.map((e: any) => String(e).trim()).filter(isEmail)
                  : typeof ccRaw === "string" ? ccRaw.split(",").map(s => s.trim()).filter(isEmail)
                  : [];
  const customMessage = String(body?.custom_message || "").trim() || null;

  if (!noticeId) return json({ error: "notice_id required" }, 400);
  if (mode !== "invoice" && mode !== "affidavit") return json({ error: "mode must be invoice or affidavit" }, 400);
  if (!isEmail(recipientEmail)) return json({ error: "valid recipient_email required" }, 400);

  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "Not authenticated" }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: tm } = await admin.from("team_members").select("id, name").eq("auth_id", userData.user.id).maybeSingle();
  const senderName = tm?.name || "13 Stars Media";

  const { data: notice } = await admin.from("legal_notices")
    .select("id, title, notice_number, file_number, client_id, contact_name, contact_email, run_dates, total_amount, invoice_id, affidavit_pdf_url, affidavit_status, status")
    .eq("id", noticeId)
    .maybeSingle();
  if (!notice) return json({ error: "notice not found" }, 404);

  if (mode === "affidavit" && !notice.affidavit_pdf_url) {
    return json({ error: "no affidavit_pdf_url on this notice" }, 400);
  }

  // Resolve linked invoice — prefer the cached invoice_id, fallback
  // to invoice_lines.legal_notice_id (most recent matching line).
  let invoice: any = null;
  if (notice.invoice_id) {
    const { data } = await admin.from("invoices")
      .select("id, invoice_number, total, balance_due, due_date, status")
      .eq("id", notice.invoice_id).maybeSingle();
    invoice = data;
  }
  if (!invoice) {
    const { data: line } = await admin.from("invoice_lines")
      .select("invoice_id")
      .eq("legal_notice_id", noticeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (line?.invoice_id) {
      const { data } = await admin.from("invoices")
        .select("id, invoice_number, total, balance_due, due_date, status")
        .eq("id", line.invoice_id).maybeSingle();
      invoice = data;
      if (invoice && !notice.invoice_id) {
        await admin.from("legal_notices").update({ invoice_id: invoice.id }).eq("id", notice.id);
      }
    }
  }

  // Pub name
  const { data: client } = notice.client_id
    ? await admin.from("clients").select("name, contacts").eq("id", notice.client_id).maybeSingle()
    : { data: null };
  const clientName = client?.name || notice.contact_name || "Client";
  const contacts = Array.isArray(client?.contacts) ? client.contacts : [];
  const matched = contacts.find((c: any) => (c?.email || "").toLowerCase() === recipientEmail.toLowerCase());
  const contactName = matched?.name || notice.contact_name || null;

  // Pub name from publications via legal_notice_issues → issues
  const { data: lni } = await admin.from("legal_notice_issues")
    .select("issue_id").eq("legal_notice_id", noticeId).limit(1).maybeSingle();
  let pubName = "your local newspaper";
  if (lni?.issue_id) {
    const { data: iss } = await admin.from("issues").select("pub_id").eq("id", lni.issue_id).maybeSingle();
    if (iss?.pub_id) {
      const { data: pub } = await admin.from("publications").select("name").eq("id", iss.pub_id).maybeSingle();
      if (pub?.name) pubName = pub.name;
    }
  }

  const payUrl = invoice?.invoice_number
    ? `${PUBLIC_APP_URL}/pay/${encodeURIComponent(invoice.invoice_number)}`
    : null;

  const tokenRes = await pullGmailToken(admin);
  if (!tokenRes) return json({ error: "no_gmail_tokens", detail: "Connect a Gmail account in Integrations." }, 500);

  const html = buildEmail({
    mode: mode as "invoice" | "affidavit",
    clientName,
    contactName,
    noticeTitle: notice.title || "Legal Notice",
    noticeNumber: notice.notice_number || null,
    fileNumber: notice.file_number || null,
    pubName,
    runDates: Array.isArray(notice.run_dates) ? notice.run_dates : [],
    invoiceNumber: invoice?.invoice_number || null,
    invoiceTotal: Number(invoice?.total || notice.total_amount || 0),
    invoiceBalance: Number(invoice?.balance_due ?? invoice?.total ?? notice.total_amount ?? 0),
    invoiceDueDate: invoice?.due_date || null,
    payUrl,
    affidavitUrl: mode === "affidavit" ? notice.affidavit_pdf_url : null,
    customMessage,
    senderName,
    todayStr: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
  });

  const subject = mode === "invoice"
    ? `Legal notice booked: ${notice.title || "your notice"}${invoice?.invoice_number ? ` — invoice #${invoice.invoice_number}` : ""}`
    : `Affidavit ready: ${notice.title || "your notice"}${invoice?.invoice_number ? ` — invoice #${invoice.invoice_number}` : ""}`;

  const result = await sendGmail(tokenRes.accessToken, {
    to: recipientEmail,
    cc: ccEmails.length ? ccEmails : undefined,
    subject,
    html,
  });
  if (!result.ok) return json({ error: "send_failed", detail: result.reason }, 500);

  // Stamp the corresponding sent timestamp on the notice + log
  const now = new Date().toISOString();
  const stamp = mode === "invoice"
    ? { invoice_sent_at: now, invoice_sent_by: tm?.id || null }
    : { affidavit_sent_at: now, affidavit_sent_by: tm?.id || null };
  await admin.from("legal_notices").update(stamp).eq("id", notice.id);

  await admin.from("email_log").insert({
    type: "outbound",
    direction: "outbound",
    from_email: userData.user.email || null,
    to_email: recipientEmail,
    subject,
    status: "sent",
    client_id: notice.client_id,
    gmail_message_id: result.messageId || null,
    created_at: now,
    ref_type: mode === "invoice" ? "legal_invoice" : "legal_affidavit",
    ref_id: notice.id,
  });

  return json({
    ok: true,
    gmail_message_id: result.messageId,
    mode,
    invoice_number: invoice?.invoice_number || null,
    affidavit_url: mode === "affidavit" ? notice.affidavit_pdf_url : null,
  });
});
