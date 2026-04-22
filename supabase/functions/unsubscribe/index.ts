// ============================================================
// unsubscribe — public GET/POST endpoint for the unsubscribe
// link embedded in every newsletter email. Takes the opaque
// token from the query string, flips the subscriber to status
// 'unsubscribed', and returns a plain-HTML confirmation page.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const page = (title: string, body: string) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:440px;margin:60px auto;padding:32px;color:#1a1a1a;background:#f7f7f5;border-radius:12px;line-height:1.5}h1{font-size:22px;margin:0 0 12px}p{margin:0 0 12px;color:#555}</style></head><body>${body}</body></html>`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const url = new URL(req.url);
  const token = url.searchParams.get("t") || url.searchParams.get("token");
  if (!token) return html(page("Unsubscribe", `<h1>Missing token</h1><p>This link is incomplete. Please use the unsubscribe link from your most recent email.</p>`), 400);

  const { data: sub, error } = await admin
    .from("newsletter_subscribers")
    .select("id, email, status")
    .eq("unsubscribe_token", token)
    .single();

  if (error || !sub) {
    return html(page("Unsubscribe", `<h1>Link not recognized</h1><p>We couldn't match that unsubscribe link. If you're still receiving emails, reply to any newsletter and we'll remove you manually.</p>`), 404);
  }

  if (sub.status !== "unsubscribed") {
    await admin.from("newsletter_subscribers").update({
      status: "unsubscribed",
      unsubscribed_at: new Date().toISOString(),
    }).eq("id", sub.id);
  }

  return html(page("Unsubscribed", `<h1>You're unsubscribed</h1><p><strong>${escapeHtml(sub.email)}</strong> has been removed from our newsletter list. You won't receive further emails. If this was a mistake, reply to any previous email and we'll re-enable your subscription.</p>`));
});

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { ...cors, "Content-Type": "text/html; charset=utf-8" } });
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
