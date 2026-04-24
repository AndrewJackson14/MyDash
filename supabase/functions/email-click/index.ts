// ============================================================
// email-click — 302 redirector that records a click before
// forwarding the reader to the real URL. Query params:
//   s = email_sends.id
//   u = absolute destination URL (urlencoded)
// Unknown/malformed requests still redirect to the URL if one
// was supplied so no reader ever gets a dead link.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const cors = { "Access-Control-Allow-Origin": "*" };

serve(async (req) => {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const url = new URL(req.url);
  const sendId = url.searchParams.get("s");
  const dest = url.searchParams.get("u");

  if (!dest) return new Response("Missing destination", { status: 400, headers: cors });

  // Only allow http/https redirects — refuse javascript:, data:, etc.
  let safeDest = dest;
  try {
    const parsed = new URL(dest);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return new Response("Bad destination", { status: 400, headers: cors });
    }
    safeDest = parsed.toString();
  } catch {
    return new Response("Malformed destination", { status: 400, headers: cors });
  }

  if (sendId && sendId !== "test") {
    try {
      const { data: row } = await admin.from("email_sends")
        .select("id, draft_id, click_count, first_clicked_at")
        .eq("id", sendId).single();
      if (row) {
        const now = new Date().toISOString();
        const wasFirstClick = !row.first_clicked_at;
        await admin.from("email_sends").update({
          first_clicked_at: row.first_clicked_at || now,
          last_clicked_at: now,
          click_count: (row.click_count || 0) + 1,
        }).eq("id", row.id);
        if (wasFirstClick) {
          // Atomic increment via RPC — read-then-update raced under burst
          // traffic and silently dropped clicks.
          await admin.rpc("increment_draft_click_count", { p_draft_id: row.draft_id }).then(() => {}).catch(async () => {
            const { data: d } = await admin.from("newsletter_drafts").select("click_count").eq("id", row.draft_id).single();
            await admin.from("newsletter_drafts").update({ click_count: (d?.click_count || 0) + 1 }).eq("id", row.draft_id);
          });
        }
      }
    } catch { /* tracking must not block the redirect */ }
  }

  return new Response(null, { status: 302, headers: { ...cors, "Location": safeDest } });
});
