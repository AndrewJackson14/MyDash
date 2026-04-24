// ============================================================
// discussion-purge-cron — daily sweep of expired discussions.
//
// Selects message_threads with expires_at < now() (set by the
// set_thread_expiry_on_press trigger 45 days after press date),
// deletes their attachments from BunnyCDN, then DELETEs the thread
// rows (messages + attachments cascade out via FK).
//
// Idempotent — missing BunnyCDN objects are treated as
// already-deleted. Per-thread errors are logged and skipped, not
// fatal to the rest of the batch.
//
// Auth: must be invoked with the service role key (OR with the cron
// shared-secret if we ever flip JWT verification off). Default JWT
// verification stays on; the pg_cron job uses the service role.
//
// Response: { purged_threads, deleted_attachments, bytes_freed,
//             errors: [{ thread_id, error }] }
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BUNNY_STORAGE_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE") || "stellarpress-media";
const BUNNY_API_KEY = Deno.env.get("BUNNY_STORAGE_API_KEY") || Deno.env.get("BUNNY_API_KEY") || "";
const BUNNY_REGION_HOST = Deno.env.get("BUNNY_REGION_HOST") || "ny.storage.bunnycdn.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function deleteFromBunny(path: string): Promise<{ ok: boolean; status: number }> {
  if (!BUNNY_API_KEY) return { ok: false, status: 0 };
  const res = await fetch(`https://${BUNNY_REGION_HOST}/${BUNNY_STORAGE_ZONE}/${path}`, {
    method: "DELETE",
    headers: { AccessKey: BUNNY_API_KEY },
  });
  // 404 is treated as already-deleted (idempotent).
  return { ok: res.ok || res.status === 404, status: res.status };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Pull expired threads.
  const { data: due, error: dueErr } = await admin
    .from("message_threads")
    .select("id, ref_type, ref_id, expires_at")
    .lt("expires_at", new Date().toISOString())
    .limit(500);
  if (dueErr) return json({ error: dueErr.message }, 500);
  if (!due?.length) return json({ purged_threads: 0, deleted_attachments: 0, bytes_freed: 0, errors: [] });

  let purged = 0;
  let deletedAtts = 0;
  let bytesFreed = 0;
  const errors: Array<{ thread_id: string; error: string }> = [];

  for (const t of due) {
    try {
      // Pull attachments for storage cleanup.
      const { data: atts } = await admin
        .from("message_attachments")
        .select("id, bunny_path, byte_size")
        .eq("thread_id", t.id);
      if (atts?.length) {
        for (const a of atts) {
          if (!a.bunny_path) continue;
          const r = await deleteFromBunny(a.bunny_path);
          if (r.ok) { deletedAtts++; bytesFreed += Number(a.byte_size || 0); }
        }
      }
      // Delete the thread — cascade clears messages + attachment rows.
      const { error: delErr } = await admin.from("message_threads").delete().eq("id", t.id);
      if (delErr) {
        errors.push({ thread_id: t.id, error: delErr.message });
        continue;
      }
      purged++;
    } catch (e: any) {
      errors.push({ thread_id: t.id, error: String(e?.message || e) });
    }
  }

  return json({ purged_threads: purged, deleted_attachments: deletedAtts, bytes_freed: bytesFreed, errors });
});
