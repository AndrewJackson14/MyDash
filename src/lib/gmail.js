// lib/gmail.js — Gmail send/draft utility via gmail-api edge function
import { supabase } from "./supabase";

const SUPABASE_URL = "https://hqywacyhpllapdwccmaw.supabase.co";

// Build RFC 2822 message and base64url encode it
function buildRawMessage({ to, subject, htmlBody, from }) {
  const boundary = "boundary_" + Date.now();
  const lines = [
    `From: ${from || "me"}`,
    `To: ${Array.isArray(to) ? to.join(", ") : to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    "",
    btoa(unescape(encodeURIComponent(htmlBody))),
    `--${boundary}--`,
  ];
  const raw = lines.join("\r\n");
  // base64url encode (no padding, +→-, /→_)
  return btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sendGmailEmail({ teamMemberId, to, subject, htmlBody, mode = "draft" }) {
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

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gmail-api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "x-action": action,
      },
      body: JSON.stringify(body),
    });

    if (res.status === 401 || res.status === 403) {
      return { success: false, needs_auth: true, error: "Gmail not connected" };
    }

    const result = await res.json();

    if (result.error) {
      // Token expired or not connected
      if (result.error.includes("not connected") || result.error.includes("refresh token")) {
        return { success: false, needs_auth: true, error: result.error };
      }
      return { success: false, error: result.error };
    }

    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message || "Failed to send email" };
  }
}

export async function initiateGmailAuth(teamMemberId) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/gmail-auth`, {
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
