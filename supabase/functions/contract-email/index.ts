import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signature_id, html_body, subject, to_email } = await req.json();
    if (!signature_id || !html_body || !to_email) throw new Error("Missing required fields");

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get the signature record to find the salesperson
    const { data: sig } = await admin.from("proposal_signatures").select("*, proposal_id").eq("id", signature_id).single();
    if (!sig) throw new Error("Signature not found");

    // Get the proposal to find salesperson
    const { data: proposal } = await admin.from("proposals").select("assigned_to, client_id").eq("id", sig.proposal_id).single();

    // Get salesperson's Google tokens
    let salespersonAuthId = null;
    if (proposal?.assigned_to) {
      const { data: sp } = await admin.from("team_members").select("auth_id").eq("id", proposal.assigned_to).single();
      salespersonAuthId = sp?.auth_id;
    }

    // Try to send via salesperson's Gmail, fall back to notification
    if (salespersonAuthId) {
      const { data: tokens } = await admin.from("google_tokens").select("*").eq("user_id", salespersonAuthId).single();

      if (tokens?.access_token) {
        // Refresh token if needed
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

        // Build RFC 2822 message
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
          return new Response(
            JSON.stringify({ success: true, method: "gmail", message: "Contract confirmation sent" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Fallback: just log it — salesperson can send manually
    await admin.from("notifications").insert({
      title: `Contract signed — email to ${to_email} needs manual send`,
      type: "system",
      link: "/sales?tab=Closed",
    });

    return new Response(
      JSON.stringify({ success: true, method: "queued", message: "Contract signed — email queued for salesperson" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
