// send-portal-setup-email — issues the Supabase magic-link email tied to
// a portal_setup_token. Called by:
//   • StellarPress self-serve post-submit handler (with the token returned
//     by submit_self_serve_proposal),
//   • Portal /setup page (with token from request_portal_setup_link),
//   • Portal Team-tab invite flow (with token from invite_client_contact).
//
// Body shape: { token_id: uuid, kind?: string }
//
// The redirect URL embeds the token so /setup/complete can call
// complete_portal_setup once the magic link has authenticated the user.
//
// We use Supabase Auth's `signInWithOtp` (admin SDK) which both creates
// the auth user (if needed) and dispatches the email through the
// project's configured SMTP provider.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PORTAL_BASE = Deno.env.get("PORTAL_BASE_URL") ?? "https://portal.13stars.media";

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { token_id } = await req.json().catch(() => ({}));
    if (!token_id) {
      return json({ error: "token_id_required" }, 400);
    }

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: token, error: tokenErr } = await supa
      .from("portal_setup_tokens")
      .select("id, intake_email, client_id, expires_at, consumed_at")
      .eq("id", token_id)
      .maybeSingle();

    if (tokenErr) {
      console.error("[send-portal-setup-email] lookup error:", tokenErr);
      return json({ error: "token_lookup_failed" }, 500);
    }
    if (!token)                               return json({ error: "token_not_found" },        404);
    if (token.consumed_at)                    return json({ error: "token_already_consumed" }, 410);
    if (new Date(token.expires_at) < new Date()) return json({ error: "token_expired" },       410);

    const redirectTo = `${PORTAL_BASE}/setup/complete?token=${token.id}`;

    const { error: otpErr } = await supa.auth.signInWithOtp({
      email: token.intake_email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    });
    if (otpErr) {
      console.error("[send-portal-setup-email] otp error:", otpErr);
      return json({ error: "send_failed", detail: otpErr.message }, 500);
    }

    return json({ success: true, sent_to: token.intake_email, redirect_to: redirectTo }, 200);
  } catch (err) {
    console.error("[send-portal-setup-email] unhandled:", err);
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
