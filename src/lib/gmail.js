// lib/gmail.js — Gmail send/draft utility via gmail-api edge function
import { supabase, EDGE_FN_URL } from "./supabase";

// Encode string to base64url (Gmail API format)
function toBase64Url(str) {
  // Convert string to Uint8Array to handle all characters
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// RFC 2047 encode subject for non-ASCII characters
function encodeSubject(subject) {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject; // pure ASCII, no encoding needed
  return "=?UTF-8?B?" + btoa(unescape(encodeURIComponent(subject))) + "?=";
}

// Build RFC 2822 message and base64url encode it
function buildRawMessage({ to, subject, htmlBody, from }) {
  const boundary = "boundary_" + Date.now();
  const raw = [
    `From: ${from || "me"}`,
    `To: ${Array.isArray(to) ? to.join(", ") : to}`,
    `Subject: ${encodeSubject(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    "",
    htmlBody,
    `--${boundary}--`,
  ].join("\r\n");
  return toBase64Url(raw);
}

export async function sendGmailEmail({ teamMemberId, to, subject, htmlBody, mode = "draft", emailType = "other", clientId = null, refId = null, refType = null }) {
  // Get current session token for auth
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { success: false, needs_auth: true, error: "Not authenticated" };
  }

  const raw = buildRawMessage({ to, subject, htmlBody });
  const action = mode === "send" ? "send" : "create-draft";
  const body = action === "send"
    ? { raw }
    : { message: { raw } };

  const recipients = Array.isArray(to) ? to : [to];

  try {
    const res = await fetch(`${EDGE_FN_URL}/gmail-api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "x-action": action,
      },
      body: JSON.stringify(body),
    });

    if (res.status === 401 || res.status === 403) {
      logEmail({ recipients, subject, status: "failed", error: "Gmail not connected", emailType, teamMemberId, clientId, refId, refType });
      return { success: false, needs_auth: true, error: "Gmail not connected" };
    }

    const result = await res.json();

    if (result.error) {
      logEmail({ recipients, subject, status: "failed", error: result.error, emailType, teamMemberId, clientId, refId, refType });
      if (result.error.includes("not connected") || result.error.includes("refresh token")) {
        return { success: false, needs_auth: true, error: result.error };
      }
      return { success: false, error: result.error };
    }

    logEmail({ recipients, subject, status: mode === "draft" ? "draft" : "sent", emailType, teamMemberId, clientId, refId, refType, gmailMessageId: result.id });
    return { success: true, data: result };
  } catch (err) {
    logEmail({ recipients, subject, status: "failed", error: err.message, emailType, teamMemberId, clientId, refId, refType });
    return { success: false, error: err.message || "Failed to send email" };
  }
}

// Log email to email_log table (fire-and-forget)
function logEmail({ recipients, subject, status, error, emailType, teamMemberId, clientId, refId, refType, gmailMessageId }) {
  const rows = (recipients || []).map(email => ({
    type: emailType || "other",
    to_email: email,
    subject: subject || "",
    status,
    error_message: error || null,
    sent_by: teamMemberId || null,
    client_id: clientId || null,
    ref_id: refId || null,
    ref_type: refType || null,
    gmail_message_id: gmailMessageId || null,
  }));
  supabase.from("email_log").insert(rows).then(() => {}).catch(() => {});
}

export async function initiateGmailAuth(teamMemberId) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${EDGE_FN_URL}/gmail-auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session?.access_token || ""}`,
    },
    body: JSON.stringify({ team_member_id: teamMemberId, action: "start" }),
  });
  const result = await res.json();
  if (result.auth_url) {
    const popup = window.open(result.auth_url, "gmail-auth", "width=500,height=600,left=200,top=200");
    return { popup, authUrl: result.auth_url };
  }
  return { error: result.error || "Failed to get auth URL" };
}

export function buildProposalEmailHtml({ message, lineItems, total }) {
  const lineRows = lineItems.map(li =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${li.pubName}</td>` +
    `<td style="padding:6px 12px;border-bottom:1px solid #eee">${li.adSize}</td>` +
    `<td style="padding:6px 12px;border-bottom:1px solid #eee">${li.issueLabel}</td>` +
    `<td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">$${(li.price || 0).toLocaleString()}</td></tr>`
  ).join("");

  return `<div style="font-family:Arial,sans-serif;max-width:600px">
    <p>${(message || "").replace(/\n/g, "<br>")}</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0">
      <thead><tr style="background:#f5f5f5">
        <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#666">Publication</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#666">Ad Size</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#666">Issue</th>
        <th style="padding:8px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#666">Rate</th>
      </tr></thead>
      <tbody>${lineRows}</tbody>
      <tfoot><tr><td colspan="3" style="padding:10px 12px;font-weight:bold">Total</td>
        <td style="padding:10px 12px;text-align:right;font-weight:bold;font-size:18px">$${(total || 0).toLocaleString()}</td>
      </tr></tfoot>
    </table>
  </div>`;
}
