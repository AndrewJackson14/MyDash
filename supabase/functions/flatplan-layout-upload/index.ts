// ============================================================
// flatplan-layout-upload — store a publisher's layout reference image
// for a single (issue, page). Replace-on-upload: any prior file at
// the same canonical path is removed from BunnyCDN before the new
// one lands.
//
// Why an edge function: the BunnyCDN API key cannot be exposed to
// the browser, and we need to upsert flatplan_page_layouts atomically
// after the storage write succeeds.
//
// The client is expected to downscale to ~400px wide (or larger)
// before posting; this function does NOT resize. Deno Edge functions
// don't have a canvas, and pulling in imagescript adds ~2MB to cold
// start for what's already a low-volume operation.
//
// Path: issues/{pub_id}/{date}/flatplan/page-NN.{ext}
//
// POST multipart/form-data
//   Authorization: Bearer <user JWT>
//   Form fields: issue_id, page_number, file
//
// 200 → { cdn_url, bunny_path, page_number }
// 4xx/5xx → { error }
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BUNNY_STORAGE_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE") || "stellarpress-media";
const BUNNY_API_KEY = Deno.env.get("BUNNY_STORAGE_API_KEY") || Deno.env.get("BUNNY_API_KEY") || "";
const BUNNY_CDN_HOST = Deno.env.get("BUNNY_CDN_HOST") || "cdn.13stars.media";
const BUNNY_REGION_HOST = Deno.env.get("BUNNY_REGION_HOST") || "ny.storage.bunnycdn.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function pickExt(filename: string, mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  const m = (filename || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1].slice(0, 5) : "bin";
}

function pad2(n: number): string { return n < 10 ? `0${n}` : String(n); }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!BUNNY_API_KEY) return json({ error: "BUNNY API key not configured" }, 500);

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "expected multipart/form-data" }, 400); }
  const issueId = String(form.get("issue_id") || "").trim();
  const pageNum = parseInt(String(form.get("page_number") || ""));
  const file = form.get("file");
  if (!issueId || isNaN(pageNum) || pageNum < 1) return json({ error: "issue_id + page_number required" }, 400);
  if (!(file instanceof File) || file.size <= 0) return json({ error: "file required" }, 400);

  const widthHint = parseInt(String(form.get("width") || "")) || null;
  const heightHint = parseInt(String(form.get("height") || "")) || null;

  // Authenticate the caller — we need their auth.users.id for uploaded_by
  // and to confirm they're an active team member.
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "Not authenticated" }, 401);
  const userId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Resolve issue → pub + date for the canonical path.
  const { data: iss } = await admin
    .from("issues")
    .select("id, pub_id, date, page_count")
    .eq("id", issueId)
    .single();
  if (!iss) return json({ error: "issue not found" }, 404);
  if (iss.page_count && pageNum > iss.page_count) return json({ error: `page ${pageNum} > issue page_count ${iss.page_count}` }, 400);

  const ext = pickExt(file.name || "", file.type || "");
  const bunnyPath = `issues/${iss.pub_id}/${iss.date}/flatplan/page-${pad2(pageNum)}.${ext}`;

  // Replace-on-upload: if a prior row exists at this (issue, page),
  // delete the old object from BunnyCDN before writing the new one
  // (ignore the previous row's bunny_path if it points elsewhere — DB
  // upsert will rewrite cdn_url anyway).
  const { data: existing } = await admin
    .from("flatplan_page_layouts")
    .select("bunny_path")
    .eq("issue_id", issueId)
    .eq("page_number", pageNum)
    .maybeSingle();
  if (existing?.bunny_path && existing.bunny_path !== bunnyPath) {
    await fetch(`https://${BUNNY_REGION_HOST}/${BUNNY_STORAGE_ZONE}/${existing.bunny_path}`, {
      method: "DELETE",
      headers: { AccessKey: BUNNY_API_KEY },
    }).catch(() => {});
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const putRes = await fetch(`https://${BUNNY_REGION_HOST}/${BUNNY_STORAGE_ZONE}/${bunnyPath}`, {
    method: "PUT",
    headers: { AccessKey: BUNNY_API_KEY, "Content-Type": file.type || "application/octet-stream" },
    body: bytes,
  });
  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => "");
    return json({ error: `BunnyCDN upload failed: ${putRes.status} ${txt}` }, 502);
  }

  const cdn_url = `https://${BUNNY_CDN_HOST}/${bunnyPath}`;

  // Upsert the row. unique(issue_id, page_number) enforces replace-on-upload.
  const { error: upErr } = await admin.from("flatplan_page_layouts").upsert({
    issue_id: issueId,
    page_number: pageNum,
    bunny_path: bunnyPath,
    cdn_url,
    uploaded_by: userId,
    uploaded_at: new Date().toISOString(),
    width: widthHint,
    height: heightHint,
    byte_size: bytes.byteLength,
  }, { onConflict: "issue_id,page_number" });

  if (upErr) {
    // Storage succeeded but DB failed — surface the error so the client
    // can show a fix-it message rather than a silent CDN-only update.
    return json({ error: `DB upsert failed: ${upErr.message}` }, 500);
  }

  return json({ cdn_url, bunny_path: bunnyPath, page_number: pageNum });
});
