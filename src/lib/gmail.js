// lib/gmail.js — Shared Gmail send utility via Supabase Edge Functions
const SUPABASE_URL = 'https://hqywacyhpllapdwccmaw.supabase.co';

export async function sendGmailEmail({ teamMemberId, to, subject, htmlBody, mode = 'draft' }) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/gmail-send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team_member_id: teamMemberId, to, subject, html_body: htmlBody, mode }),
  });
  const result = await res.json();
  return result;
}

export async function initiateGmailAuth(teamMemberId) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/gmail-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team_member_id: teamMemberId }),
  });
  const result = await res.json();
  if (result.auth_url) {
    const popup = window.open(result.auth_url, 'gmail-auth', 'width=500,height=600,left=200,top=200');
    return { popup, authUrl: result.auth_url };
  }
  return { error: result.error || 'Failed to get auth URL' };
}

export function buildProposalEmailHtml({ message, lineItems, total }) {
  const lineRows = lineItems.map(li =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${li.pubName}</td>` +
    `<td style="padding:6px 12px;border-bottom:1px solid #eee">${li.adSize}</td>` +
    `<td style="padding:6px 12px;border-bottom:1px solid #eee">${li.issueLabel}</td>` +
    `<td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">$${(li.price || 0).toLocaleString()}</td></tr>`
  ).join('');

  return `<div style="font-family:Arial,sans-serif;max-width:600px">
    <p>${message.replace(/\n/g, '<br>')}</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0">
      <thead><tr style="background:#f5f5f5">
        <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#666">Publication</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#666">Ad Size</th>
        <th style="padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#666">Issue</th>
        <th style="padding:8px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#666">Rate</th>
      </tr></thead>
      <tbody>${lineRows}</tbody>
      <tfoot><tr><td colspan="3" style="padding:10px 12px;font-weight:bold">Total</td>
        <td style="padding:10px 12px;text-align:right;font-weight:bold;font-size:18px">$${total.toLocaleString()}</td>
      </tr></tfoot>
    </table>
  </div>`;
}
