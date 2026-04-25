// ============================================================
// send-to-press — Anthony Phase 5. Final-issue PDF handoff to the
// printer. Receives a multipart upload (issue_id, printer_id,
// quantity, file, optional press_notes), uploads the PDF to BunnyCDN,
// creates a print_runs row, and emails the printer's contact_email +
// any extra recipients with a download link.
//
// Why an edge function:
//   1. BunnyCDN API key cannot be exposed client-side.
//   2. Printer's delivery_config (CC list, future SFTP creds) shouldn't
//      ship to the browser.
//   3. We need a single audit-trail for who fired the press handoff,
//      with the actual UUID (not currentUser.name string) — closes G22
//      definitively for the press path.
//
// Mirrors flatplan-layout-upload + send-proof patterns. Service role
// for DB writes; user JWT for caller auth + role gate.
//
// POST multipart/form-data
//   Authorization: Bearer <user JWT>
//   Form: issue_id, printer_id, file, [quantity], [press_notes],
//         [recipient_override], [cc_extra]
//
// 200 → { print_run_id, pdf_url, gmail_message_id }
// 4xx/5xx → { error }
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const BUNNY_STORAGE_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE") || "stellarpress-media";
const BUNNY_API_KEY = Deno.env.get("BUNNY_STORAGE_API_KEY") || Deno.env.get("BUNNY_API_KEY") || "";
const BUNNY_CDN_HOST = Deno.env.get("BUNNY_CDN_HOST") || "cdn.13stars.media";
const BUNNY_REGION_HOST = Deno.env.get("BUNNY_REGION_HOST") || "ny.storage.bunnycdn.com";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const MAX_UPLOAD_BYTES = 250 * 1024 * 1024; // 250 MB — final issue PDFs run 100-200 MB
const ALLOWED_ROLES = ["Layout Designer", "Graphic Designer", "Production Manager", "Publisher"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function isEmail(s: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
function safeFilename(name: string) { return String(name || "issue.pdf").replace(/[^A-Za-z0-9._-]+/g, "-"); }

// Pull a Gmail access token from any admin's google_tokens row
// (mirrors send-proof). Returns null if no team member has connected
// Gmail — the caller falls back to logging the run without a send.
async function pullGmailToken(admin: any): Promise<{ accessToken: string } | null> {
  const { data: members } = await admin.from("team_members")
    .select("auth_id").not("auth_id", "is", null).limit(20);
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

function buildPressEmail(opts: {
  printerName: string;
  contactName: string | null;
  pubName: string;
  issueLabel: string;
  pdfUrl: string;
  filename: string;
  byteSize: number;
  pressNotes: string | null;
  senderName: string;
}) {
  const greeting = opts.contactName ? `Hi ${opts.contactName.split(" ")[0]},` : "Hello,";
  const sizeMb = (opts.byteSize / 1048576).toFixed(1);
  const notesBlock = opts.pressNotes
    ? `<div style="margin:20px 0;padding:14px 16px;background:#FFF8E1;border-left:3px solid #D97706;border-radius:6px;"><div style="font-size:11px;font-weight:700;color:#5F5E5A;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Press notes</div><div style="font-size:14px;color:#1A1A1A;line-height:1.5;white-space:pre-wrap;">${opts.pressNotes.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c))}</div></div>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F5F5F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1A1A;">
    <div style="max-width:560px;margin:0 auto;padding:32px 24px;background:#FFFFFF;border:1px solid #E6E5DE;border-radius:12px;margin-top:24px;">
      <div style="font-size:20px;font-weight:700;color:#0C447C;letter-spacing:-0.3px;">13 Stars Media</div>
      <div style="font-size:11px;font-weight:700;color:#5F5E5A;letter-spacing:1px;text-transform:uppercase;margin-top:4px;">Issue ready for press</div>

      <p style="font-size:16px;line-height:1.5;margin:24px 0 8px;">${greeting}</p>
      <p style="font-size:15px;line-height:1.55;margin:0 0 16px;color:#2C2C2A;">
        Final PDF for <strong>${opts.pubName} &mdash; ${opts.issueLabel}</strong> is ready. ${opts.senderName} sent it to the press handoff just now.
      </p>

      <div style="margin:18px 0;padding:14px 16px;background:#F5F5F3;border-radius:6px;font-size:14px;color:#2C2C2A;">
        <div style="margin-bottom:4px;"><strong>File:</strong> ${opts.filename} &middot; ${sizeMb} MB</div>
        <div><strong>Printer:</strong> ${opts.printerName}</div>
      </div>

      <p style="margin:24px 0;">
        <a href="${opts.pdfUrl}" style="display:inline-block;background:#0C447C;color:#FFFFFF;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;">Download PDF &rarr;</a>
      </p>

      <p style="font-size:13px;color:#5F5E5A;line-height:1.5;margin:0;">If the button doesn't work, copy this URL into your browser:<br/><a href="${opts.pdfUrl}" style="color:#0C447C;word-break:break-all;">${opts.pdfUrl}</a></p>

      ${notesBlock}

      <p style="font-size:13px;color:#2C2C2A;line-height:1.55;margin:24px 0 0;">
        Reply to this email once you've received and verified the file, or reach us at <strong>805&#8209;464&#8209;2900</strong>.
      </p>

      <hr style="border:none;border-top:1px solid #E6E5DE;margin:24px 0 16px;" />
      <p style="font-size:11px;color:#5F5E5A;line-height:1.5;margin:0;">13 Stars Media &middot; 5860 El Camino Real, Suite C, Atascadero, CA 93422</p>
    </div>
  </body></html>`;
}

function pad2(n: number) { return n < 10 ? `0${n}` : String(n); }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!BUNNY_API_KEY) return json({ error: "BUNNY API key not configured" }, 500);

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "expected multipart/form-data" }, 400); }

  const issueId = String(form.get("issue_id") || "").trim();
  const printerId = String(form.get("printer_id") || "").trim();
  const file = form.get("file");
  const quantityRaw = String(form.get("quantity") || "").trim();
  const quantity = quantityRaw ? parseInt(quantityRaw) : null;
  const pressNotes = String(form.get("press_notes") || "").trim() || null;
  const recipientOverride = String(form.get("recipient_override") || "").trim();
  const ccExtraRaw = String(form.get("cc_extra") || "").trim();
  const ccExtra = ccExtraRaw ? ccExtraRaw.split(",").map(s => s.trim()).filter(isEmail) : [];

  if (!issueId) return json({ error: "issue_id required" }, 400);
  if (!printerId) return json({ error: "printer_id required" }, 400);
  if (!(file instanceof File) || file.size <= 0) return json({ error: "file required" }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: "file too large" }, 413);
  if (!(file.type === "application/pdf" || /\.pdf$/i.test(file.name || ""))) {
    return json({ error: "PDF only" }, 400);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "Not authenticated" }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: tm } = await admin
    .from("team_members")
    .select("id, role, name")
    .eq("auth_id", userData.user.id)
    .maybeSingle();
  if (!tm) return json({ error: "team member not found" }, 403);
  if (!ALLOWED_ROLES.includes(tm.role || "")) return json({ error: "role not permitted" }, 403);

  // Resolve issue + pub for the canonical bunny path
  const { data: iss } = await admin
    .from("issues").select("id, pub_id, date, label, sent_to_press_at").eq("id", issueId).single();
  if (!iss) return json({ error: "issue not found" }, 404);

  const { data: pub } = await admin.from("publications").select("id, name").eq("id", iss.pub_id).maybeSingle();

  // Resolve printer + delivery config
  const { data: printer } = await admin
    .from("printers")
    .select("id, name, contact_name, contact_email, delivery_method, delivery_config, is_active")
    .eq("id", printerId).maybeSingle();
  if (!printer) return json({ error: "printer not found" }, 404);
  if (printer.is_active === false) return json({ error: "printer is inactive" }, 400);

  const recipient = recipientOverride && isEmail(recipientOverride) ? recipientOverride : printer.contact_email;
  if (!recipient || !isEmail(recipient)) return json({ error: "no valid printer email" }, 400);

  // Upload PDF to BunnyCDN. Stamp date so we never overwrite an old
  // run's PDF — every send-to-press is a fresh artifact, not an
  // upsert.
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const cleanName = safeFilename(file.name || `${iss.id}.pdf`);
  const bunnyPath = `issues/${iss.pub_id}/${iss.date}/press/${ts}-${cleanName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const putRes = await fetch(`https://${BUNNY_REGION_HOST}/${BUNNY_STORAGE_ZONE}/${bunnyPath}`, {
    method: "PUT",
    headers: { AccessKey: BUNNY_API_KEY, "Content-Type": "application/pdf" },
    body: bytes,
  });
  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => "");
    return json({ error: `BunnyCDN upload failed: ${putRes.status} ${txt}` }, 502);
  }
  const cdnUrl = `https://${BUNNY_CDN_HOST}/${bunnyPath}`;

  // Pull config defaults — config.cc_emails is an optional jsonb array
  // of additional recipients per printer (e.g. press-room CC). Merge
  // with caller-supplied cc_extra.
  const configCc = Array.isArray(printer.delivery_config?.cc_emails) ? printer.delivery_config.cc_emails.filter((e: any) => typeof e === "string" && isEmail(e)) : [];
  const cc = [...new Set([...configCc, ...ccExtra])];

  // Insert print_runs row first so we have an id to email about, even
  // if Gmail send fails downstream.
  const now = new Date().toISOString();
  const { data: run, error: runErr } = await admin.from("print_runs").insert({
    issue_id: issueId,
    printer_id: printerId,
    quantity: quantity || null,
    pdf_url: cdnUrl,
    pdf_filename: cleanName,
    pdf_size_bytes: bytes.byteLength,
    bunny_path: bunnyPath,
    shipped_by: tm.id,
    shipped_at: now,
    press_notes: pressNotes,
    delivery_method: printer.delivery_method || "email",
    status: "shipped",
  }).select().single();
  if (runErr || !run) {
    return json({ error: `print_run insert failed: ${runErr?.message || "unknown"}` }, 500);
  }

  // Stamp the issue itself — this closes G22 (the literal "publisher"
  // string bug fixed in P1) AND surfaces "shipped" state on the
  // dashboard's From Press card.
  await admin.from("issues").update({
    sent_to_press_at: now,
    sent_to_press_by: tm.id,
  }).eq("id", issueId);

  // Email the printer. Don't fail the whole send if Gmail's misconfigured —
  // surface the reason and let the UI prompt for manual handoff.
  let gmailResult: { ok: boolean; reason?: string; messageId?: string } = { ok: false, reason: "no_gmail_token" };
  if (printer.delivery_method === "email" || !printer.delivery_method) {
    const tokenRes = await pullGmailToken(admin);
    if (tokenRes) {
      const html = buildPressEmail({
        printerName: printer.name,
        contactName: printer.contact_name,
        pubName: pub?.name || "Publication",
        issueLabel: iss.label || iss.date,
        pdfUrl: cdnUrl,
        filename: cleanName,
        byteSize: bytes.byteLength,
        pressNotes,
        senderName: tm.name || "Production",
      });
      gmailResult = await sendGmail(tokenRes.accessToken, {
        to: recipient,
        cc,
        subject: `Press handoff: ${pub?.name || "Issue"} — ${iss.label || iss.date}`,
        html,
      });
      if (gmailResult.ok && gmailResult.messageId) {
        await admin.from("print_runs").update({ gmail_message_id: gmailResult.messageId }).eq("id", run.id);
      }
    }
  }

  return json({
    print_run_id: run.id,
    pdf_url: cdnUrl,
    bunny_path: bunnyPath,
    delivery_method: printer.delivery_method || "email",
    email_sent: gmailResult.ok,
    email_reason: gmailResult.ok ? null : gmailResult.reason,
  });
});
