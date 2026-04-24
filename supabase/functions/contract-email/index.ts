// ============================================================
// contract-email — fire the contract-confirmation email when a
// client signs a proposal on the public ProposalSign page.
//
// Cannot require JWT auth — the signer is an unauthenticated client.
// Defense in depth instead:
//   1. CORS lock to mydash.media + dev hosts.
//   2. Force `to_email = signer_email` from the DB row (request value
//      is ignored). Stops the open-relay-to-arbitrary-address attack.
//   3. Require `signed_at` within the last 10 minutes — bounds abuse
//      to the brief window right after a real signature posts. After
//      that the function 410s the request.
//   4. Server-side subject (request value ignored).
//
// html_body is still accepted from the request because the contract
// HTML is rendered client-side from the proposal snapshot. Within the
// 10-minute window an attacker could only re-fire their own contract
// email to themselves — acceptable trade-off.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://mydash.media,http://localhost:5173,http://localhost:4173").split(",");

function corsFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
    "Vary": "Origin",
  };
}

const SIGNATURE_FRESHNESS_MS = 10 * 60 * 1000;

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

serve(async (req: Request) => {
  const cors = corsFor(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, cors);

  let body: any;
  try { body = await req.json(); } catch { return json({ success: false, error: "bad json" }, 400, cors); }
  const { signature_id, html_body } = body || {};
  if (!signature_id || !html_body) return json({ success: false, error: "Missing required fields" }, 400, cors);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: sig } = await admin
    .from("proposal_signatures")
    .select("id, proposal_id, signer_email, signed_at")
    .eq("id", signature_id)
    .single();
  if (!sig) return json({ success: false, error: "Signature not found" }, 404, cors);

  // Recent-signature window. signed_at is set the moment a client posts
  // their signature; outside the window we refuse to fire anything.
  const signedAt = sig.signed_at ? new Date(sig.signed_at).getTime() : 0;
  if (!signedAt || Date.now() - signedAt > SIGNATURE_FRESHNESS_MS) {
    return json({ success: false, error: "Signature window expired" }, 410, cors);
  }

  // Force destination to the row's signer — never trust request value.
  const to_email = sig.signer_email || "";
  if (!to_email) return json({ success: false, error: "No signer email on record" }, 400, cors);

  const { data: proposal } = await admin
    .from("proposals")
    .select("assigned_to, client_id, name")
    .eq("id", sig.proposal_id)
    .single();

  const subject = `Contract Confirmed — ${proposal?.name || ""}`.trim();

  // Pick a salesperson with Gmail tokens; fall back to any admin.
  let salespersonAuthId: string | null = null;
  if (proposal?.assigned_to) {
    const { data: sp } = await admin.from("team_members").select("auth_id").eq("id", proposal.assigned_to).single();
    salespersonAuthId = sp?.auth_id || null;
  }
  if (!salespersonAuthId) {
    const { data: admins } = await admin.from("team_members")
      .select("auth_id").not("auth_id", "is", null).limit(5);
    for (const a of (admins || [])) {
      const { data: t } = await admin.from("google_tokens").select("user_id").eq("user_id", a.auth_id).single();
      if (t) { salespersonAuthId = a.auth_id; break; }
    }
  }

  if (salespersonAuthId) {
    const { data: tokens } = await admin.from("google_tokens").select("*").eq("user_id", salespersonAuthId).single();

    if (tokens?.access_token) {
      let accessToken = tokens.access_token;
      const expiry = new Date(tokens.token_expiry);
      if (expiry.getTime() - Date.now() < 300_000 && tokens.refresh_token) {
        const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: tokens.refresh_token,
            grant_type: "refresh_token",
          }),
        });
        const refreshData = await refreshRes.json();
        if (refreshData.access_token) {
          accessToken = refreshData.access_token;
          await admin.from("google_tokens").update({
            access_token: accessToken,
            token_expiry: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
          }).eq("user_id", salespersonAuthId);
        }
      }

      const raw = btoa(
        `To: ${to_email}\r\n` +
        `Subject: ${subject}\r\n` +
        `MIME-Version: 1.0\r\n` +
        `Content-Type: text/html; charset="UTF-8"\r\n\r\n` +
        html_body
      ).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

      const sendRes = await fetch(`${GMAIL_BASE}/messages/send`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });

      if (sendRes.ok) {
        const sendData = await sendRes.json().catch(() => ({}));
        await admin.from("email_log").insert({
          type: "contract", to_email, subject, status: "sent",
          ref_type: "proposal_signature", ref_id: signature_id,
          client_id: proposal?.client_id || null,
          gmail_message_id: sendData.id || null,
        });
        return json({ success: true, method: "gmail", message: "Contract confirmation sent" }, 200, cors);
      } else {
        await admin.from("email_log").insert({
          type: "contract", to_email, subject, status: "failed",
          error_message: "Gmail returned " + sendRes.status,
          ref_type: "proposal_signature", ref_id: signature_id,
          client_id: proposal?.client_id || null,
        });
      }
    }
  }

  await admin.from("email_log").insert({
    type: "contract", to_email, subject, status: "failed",
    error_message: "No Gmail tokens available — queued for manual send",
    ref_type: "proposal_signature", ref_id: signature_id,
    client_id: proposal?.client_id || null,
  });
  await admin.from("notifications").insert({
    title: `Contract signed — email to ${to_email} needs manual send`,
    type: "system",
    link: "/sales?tab=Closed",
  });

  return json({ success: true, method: "queued", message: "Contract signed — email queued for salesperson" }, 200, cors);
});
