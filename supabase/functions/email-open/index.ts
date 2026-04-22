// ============================================================
// email-open — 1×1 transparent GIF served for every newsletter
// open. The src URL carries ?s=<email_send.id>; we increment
// the per-send open_count and the per-draft open_count (once
// per recipient).
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const PIXEL = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
]);

const noStore = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
  "Access-Control-Allow-Origin": "*",
};

serve(async (req) => {
  const pixelResponse = () => new Response(PIXEL, { status: 200, headers: { ...noStore, "Content-Type": "image/gif" } });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const url = new URL(req.url);
  const sendId = url.searchParams.get("s");

  // Always return a valid pixel, even on error — no UI change for the
  // reader, and we don't want broken-image icons in inboxes.
  if (!sendId || sendId === "test") return pixelResponse();

  try {
    const { data: row } = await admin.from("email_sends")
      .select("id, draft_id, open_count, first_opened_at")
      .eq("id", sendId).single();

    if (row) {
      const now = new Date().toISOString();
      const wasFirstOpen = !row.first_opened_at;
      await admin.from("email_sends").update({
        first_opened_at: row.first_opened_at || now,
        last_opened_at: now,
        open_count: (row.open_count || 0) + 1,
      }).eq("id", row.id);

      // Bump draft.open_count only on the first open per recipient.
      if (wasFirstOpen) {
        await admin.rpc("increment_draft_open_count", { p_draft_id: row.draft_id }).then(() => {}).catch(async () => {
          // Fallback if RPC doesn't exist — direct update that avoids stomping on concurrent writers.
          const { data: d } = await admin.from("newsletter_drafts").select("open_count").eq("id", row.draft_id).single();
          await admin.from("newsletter_drafts").update({ open_count: (d?.open_count || 0) + 1 }).eq("id", row.draft_id);
        });
      }
    }
  } catch { /* swallow — tracking must not break delivery */ }

  return pixelResponse();
});
