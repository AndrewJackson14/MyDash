// ============================================================
// upload-tearsheet — Anthony Phase 5i. Manual tearsheet upload.
// Anthony doesn't ship PDFs to printers via MyDash (each printer
// has its own FTP), so the auto-split path from P5c rarely fires.
// Sales reps + Cami curate tearsheets case-by-case per sale: drop
// a PDF or JPG, the file lands on BunnyCDN, sales.tearsheet_url
// is rewritten, and the public portals (P5e + P5g) prefer it.
//
// Replace-on-upload: if the sale already has a tearsheet_url, the
// previous BunnyCDN object is deleted before the new one is written.
//
// POST multipart/form-data
//   Authorization: Bearer <user JWT>
//   Form: sale_id, file
//
// 200 → { sale_id, tearsheet_url, kind, byte_size, filename }
// 4xx/5xx → { error }
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const BUNNY_STORAGE_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE") || "stellarpress-media";
const BUNNY_API_KEY = Deno.env.get("BUNNY_STORAGE_API_KEY") || Deno.env.get("BUNNY_API_KEY") || "";
const BUNNY_CDN_HOST = Deno.env.get("BUNNY_CDN_HOST") || "cdn.13stars.media";
const BUNNY_REGION_HOST = Deno.env.get("BUNNY_REGION_HOST") || "ny.storage.bunnycdn.com";

// Tearsheets are per-page artifacts — even a 2-page magazine spread
// rarely exceeds 30 MB. 50 MB cap is comfortable headroom.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
// Sales rep / Cami / production all need write. Keep gate broad
// since this is a per-sale curatorial action, not a press handoff.
const ALLOWED_ROLES = [
  "Salesperson", "Sales Manager",
  "Office Administrator", "Office Manager",
  "Layout Designer", "Graphic Designer", "Production Manager",
  "Publisher", "Editor-in-Chief",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function pickKind(filename: string, mime: string): "pdf" | "image" | null {
  if (mime === "application/pdf" || /\.pdf$/i.test(filename)) return "pdf";
  if (/^image\//.test(mime)) return "image";
  if (/\.(jpe?g|png|webp|gif|avif|heic)$/i.test(filename)) return "image";
  return null;
}

function pickExt(filename: string, mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/avif") return "avif";
  if (mime === "image/heic") return "heic";
  const m = (filename || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1].slice(0, 5) : "bin";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!BUNNY_API_KEY) return json({ error: "BUNNY API key not configured" }, 500);

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "expected multipart/form-data" }, 400); }

  const saleId = String(form.get("sale_id") || "").trim();
  const file = form.get("file");
  if (!saleId) return json({ error: "sale_id required" }, 400);
  if (!(file instanceof File) || file.size <= 0) return json({ error: "file required" }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: "file too large (50 MB max)" }, 413);

  const kind = pickKind(file.name || "", file.type || "");
  if (!kind) return json({ error: "PDF or image only" }, 400);

  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "Not authenticated" }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: tm } = await admin.from("team_members")
    .select("id, role").eq("auth_id", userData.user.id).maybeSingle();
  if (!tm) return json({ error: "team member not found" }, 403);
  if (!ALLOWED_ROLES.includes(tm.role || "")) return json({ error: "role not permitted" }, 403);

  // Resolve sale → client + issue + pub for the canonical bunny path.
  // Also pull existing tearsheet_bunny_path for replace-on-upload.
  const { data: sale } = await admin.from("sales")
    .select("id, client_id, issue_id, page, tearsheet_bunny_path")
    .eq("id", saleId).maybeSingle();
  if (!sale) return json({ error: "sale not found" }, 404);

  const { data: iss } = await admin.from("issues")
    .select("pub_id, date").eq("id", sale.issue_id).maybeSingle();

  const ext = pickExt(file.name || "", file.type || "");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const pubSegment = iss?.pub_id || "_unassigned";
  const dateSegment = iss?.date || "no-date";
  const pageSegment = sale.page ? `page-${sale.page}` : "page-?";
  const bunnyPath = `tearsheets/${pubSegment}/${dateSegment}/${sale.id}/${ts}.${ext}`;

  // Replace-on-upload: nuke previous artifact (different filename
  // because of timestamp). Failure to delete is non-fatal — the new
  // upload still wins on sales.tearsheet_url.
  if (sale.tearsheet_bunny_path && sale.tearsheet_bunny_path !== bunnyPath) {
    await fetch(`https://${BUNNY_REGION_HOST}/${BUNNY_STORAGE_ZONE}/${sale.tearsheet_bunny_path}`, {
      method: "DELETE",
      headers: { AccessKey: BUNNY_API_KEY },
    }).catch(() => {});
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const putRes = await fetch(`https://${BUNNY_REGION_HOST}/${BUNNY_STORAGE_ZONE}/${bunnyPath}`, {
    method: "PUT",
    headers: {
      AccessKey: BUNNY_API_KEY,
      "Content-Type": file.type || (kind === "pdf" ? "application/pdf" : "application/octet-stream"),
    },
    body: bytes,
  });
  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => "");
    return json({ error: `BunnyCDN upload failed: ${putRes.status} ${txt}` }, 502);
  }

  const cdnUrl = `https://${BUNNY_CDN_HOST}/${bunnyPath}`;

  const { error: upErr } = await admin.from("sales").update({
    tearsheet_url: cdnUrl,
    tearsheet_filename: file.name || `tearsheet.${ext}`,
    tearsheet_kind: kind,
    tearsheet_byte_size: bytes.byteLength,
    tearsheet_uploaded_at: new Date().toISOString(),
    tearsheet_uploaded_by: tm.id,
    tearsheet_bunny_path: bunnyPath,
  }).eq("id", sale.id);

  if (upErr) {
    return json({ error: `DB update failed: ${upErr.message}` }, 500);
  }

  return json({
    sale_id: sale.id,
    tearsheet_url: cdnUrl,
    bunny_path: bunnyPath,
    kind,
    byte_size: bytes.byteLength,
    filename: file.name,
  });
});
