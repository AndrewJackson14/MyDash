// ============================================================
// send-proof — emails an ad proof to the client (Jen P0.2).
//
// Replaces the old clipboard hack: copyApprovalLink() silently
// copied a /approve/{token} URL with no toast, no DB stamp, no
// thread message. Jen had no way to know if the link was sent or
// when. This function:
//
//   1. Validates the proof + project + recipient.
//   2. Pulls a Gmail access token from any admin's google_tokens
//      row (same pattern contract-email + driver-auth use).
//   3. Sends a branded HTML email with a CTA → /approve/{token}.
//   4. Stamps ad_proofs.sent_to_client_at / sent_to_client_by.
//   5. Posts a system message to the project thread so the
//      designer + sales rep can see the timeline.
//
// Service-role only. Called from AdProjects.jsx via supabase
// client (which threads the user's JWT — we still verify role).
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const PUBLIC_APP_URL = Deno.env.get("PUBLIC_APP_URL") || "https://mydash.media";
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

// ── Gmail send (mirrors contract-email pattern) ────────────────
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

async function sendGmail(accessToken: string, opts: { to: string; cc?: string[]; subject: string; html: string }): Promise<{ ok: boolean; reason?: string; messageId?: string }> {
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
    return { ok: false, reason: `gmail_${res.status}: ${text.slice(0, 200)}` };
  }
  const body = await res.json();
  return { ok: true, messageId: body?.id };
}

// ── Email template ─────────────────────────────────────────────
function buildProofEmail(opts: {
  pubName: string;
  clientName: string;
  contactName: string | null;
  adSize: string | null;
  issueLabel: string | null;
  approvalUrl: string;
  proofVersion: number;
  freeRevisionsRemaining: number | null;
}) {
  const greeting = opts.contactName ? `Hi ${opts.contactName.split(" ")[0]},` : "Hello,";
  const fineprint = opts.freeRevisionsRemaining != null
    ? `<p style="margin:24px 0 0;font-size:12px;color:#5F5E5A;line-height:1.5;">Revision ${opts.proofVersion}. ${opts.freeRevisionsRemaining > 0 ? `${opts.freeRevisionsRemaining} free ${opts.freeRevisionsRemaining === 1 ? "revision" : "revisions"} remaining; additional revisions are $25 each.` : "Additional revisions are $25 each."}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F5F5F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1A1A;">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px;background:#FFFFFF;border:1px solid #E6E5DE;border-radius:12px;margin-top:24px;">
      <div style="font-size:20px;font-weight:700;color:#0C447C;letter-spacing:-0.3px;">${opts.pubName}</div>
      <div style="font-size:11px;font-weight:700;color:#5F5E5A;letter-spacing:1px;text-transform:uppercase;margin-top:4px;">Ad Proof Ready · ${opts.clientName}</div>

      <p style="font-size:16px;line-height:1.5;margin:24px 0 8px;">${greeting}</p>
      <p style="font-size:15px;line-height:1.55;margin:0 0 20px;color:#2C2C2A;">
        Your ad proof for <strong>${opts.pubName}${opts.issueLabel ? ` &mdash; ${opts.issueLabel}` : ""}</strong>${opts.adSize ? ` (${opts.adSize})` : ""} is ready for your review. Click below to approve or request changes.
      </p>

      <p style="margin:28px 0;">
        <a href="${opts.approvalUrl}" style="display:inline-block;background:#0C447C;color:#FFFFFF;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;">Review proof &amp; approve &rarr;</a>
      </p>

      <p style="font-size:13px;color:#5F5E5A;line-height:1.5;margin:0;">If the button doesn't work, copy this URL into your browser:<br/><a href="${opts.approvalUrl}" style="color:#0C447C;word-break:break-all;">${opts.approvalUrl}</a></p>

      ${fineprint}

      <hr style="border:none;border-top:1px solid #E6E5DE;margin:24px 0 16px;" />
      <p style="font-size:11px;color:#5F5E5A;line-height:1.5;margin:0;">13 Stars Media · 5860 El Camino Real, Suite C, Atascadero, CA 93422 · 805&#8209;464&#8209;2900</p>
    </div>
  </body></html>`;
}

// ── Main ───────────────────────────────────────────────────────
serve(async (req) => {
  const cors = corsFor(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, cors);

  // Auth: any authenticated team_member can call this.
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "missing_bearer" }, 401, cors);
  const token = authHeader.slice(7).trim();
  let callerAuthId: string | null = null;
  if (token === SUPABASE_SERVICE_ROLE_KEY) {
    callerAuthId = null; // service role
  } else {
    try {
      const payload = JSON.parse(atob(token.split(".")[1] || ""));
      callerAuthId = payload?.sub || null;
      if (!callerAuthId) return json({ error: "invalid_token" }, 401, cors);
    } catch { return json({ error: "invalid_token" }, 401, cors); }
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400, cors); }
  const { proofId, recipientEmail, ccEmails } = body || {};
  if (!proofId) return json({ error: "proofId required" }, 400, cors);
  if (!recipientEmail) return json({ error: "recipientEmail required" }, 400, cors);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Pull proof + project + publication context ──────────────
  const { data: proof, error: pErr } = await admin.from("ad_proofs")
    .select("id, project_id, version, access_token, internal_status")
    .eq("id", proofId).single();
  if (pErr || !proof) return json({ error: "proof_not_found", detail: pErr?.message }, 404, cors);

  const { data: project } = await admin.from("ad_projects")
    .select("id, ad_size, publication_id, issue_id, client_id, client_contact_name, client_contact_email, thread_id, designer_id, sale_id, revision_count")
    .eq("id", proof.project_id).single();
  if (!project) return json({ error: "project_not_found" }, 404, cors);

  const { data: pub } = await admin.from("publications").select("name").eq("id", project.publication_id).maybeSingle();
  const { data: client } = await admin.from("clients").select("name").eq("id", project.client_id).maybeSingle();
  const { data: issue } = project.issue_id
    ? await admin.from("issues").select("label").eq("id", project.issue_id).maybeSingle()
    : { data: null };

  // Resolve caller team_member (for sent_to_client_by stamp).
  let senderTeamId: string | null = null;
  if (callerAuthId) {
    const { data: tm } = await admin.from("team_members").select("id").eq("auth_id", callerAuthId).maybeSingle();
    senderTeamId = tm?.id || null;
  }

  // ── Send the email ──────────────────────────────────────────
  const tokenRes = await pullGmailToken(admin);
  if (!tokenRes) return json({ error: "no_gmail_tokens", detail: "No team_member has connected Gmail. Connect one in Integrations to enable proof sends." }, 500, cors);

  const approvalUrl = `${PUBLIC_APP_URL}/approve/${proof.access_token}`;
  const html = buildProofEmail({
    pubName: pub?.name || "13 Stars Media",
    clientName: client?.name || "",
    contactName: project.client_contact_name || null,
    adSize: project.ad_size || null,
    issueLabel: issue?.label || null,
    approvalUrl,
    proofVersion: proof.version || 1,
    freeRevisionsRemaining: Math.max(0, 3 - (project.revision_count || 0)),
  });
  const subject = `${pub?.name || "13 Stars Media"}: Your ad proof is ready — ${client?.name || ""}`;

  const sendResult = await sendGmail(tokenRes.accessToken, {
    to: recipientEmail,
    cc: ccEmails && ccEmails.length ? ccEmails : undefined,
    subject,
    html,
  });
  if (!sendResult.ok) return json({ error: "send_failed", detail: sendResult.reason }, 500, cors);

  // ── Stamp + post system message ─────────────────────────────
  await admin.from("ad_proofs").update({
    sent_to_client_at: new Date().toISOString(),
    sent_to_client_by: senderTeamId,
    internal_status: "sent_to_client",
  }).eq("id", proof.id);

  // Mirror sale-side updates so the project shell reflects the
  // sent state too (project_status read paths use ad_projects.status,
  // not ad_proofs.internal_status; only update if currently designing
  // or proof-pending so we don't override revising/approved states).
  if (project) {
    await admin.from("ad_projects").update({
      // only update timestamp; status stays under designer control
      updated_at: new Date().toISOString(),
    }).eq("id", project.id);
  }

  if (project.thread_id) {
    await admin.from("messages").insert({
      thread_id: project.thread_id,
      sender_name: "System",
      body: `📨 Proof v${proof.version || 1} sent to ${project.client_contact_name || ""} <${recipientEmail}>`,
      is_system: true,
    });
  }

  return json({
    ok: true,
    sent_at: new Date().toISOString(),
    recipient: recipientEmail,
    gmail_message_id: sendResult.messageId || null,
  }, 200, cors);
});
