// ============================================================
// discussion-attachment-upload — proxy a Discussion attachment to
// BunnyCDN and return the public URL the client should store.
//
// Why server-side: the BunnyCDN API key cannot be exposed to the
// browser. The function takes the raw file bytes + a thread_id, looks
// up the thread's ref_type/ref_id, resolves to issue + publication +
// date, builds the canonical path, and PUTs the bytes through to
// BunnyCDN storage.
//
// Path format (matches editorial→production spec §6.2):
//   For issue thread:
//     issues/{pub_id}/{issue_date}/discussions/issue/{uuid}_{filename}
//   For story thread:
//     issues/{pub_id}/{issue_date}/discussions/story/{story_id}/{uuid}_{filename}
//
// Request:
//   POST multipart/form-data
//   Headers: Authorization (user JWT)
//   Form fields:
//     thread_id       — uuid of the message_threads row
//     kind            — 'image' | 'pdf' | 'file'
//     file            — binary blob
//
// Response 200: { cdn_url, bunny_path, filename, byte_size, kind, width?, height? }
// Response 4xx/5xx: { error }
//
// Note on resize: the server does NOT resize images. The client should
// downscale to ~2000px on the long edge before posting (saves CDN egress
// and keeps requests under the Edge Function body limit). Width/height
// are taken from form fields if the client probes them.
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

// Strip filename to a safe slug — keeps the extension, drops nasties.
function safeFilename(name: string): string {
  const base = (name || "file").trim();
  // Split off extension first so we don't slugify dots in the middle
  const lastDot = base.lastIndexOf(".");
  const stem = lastDot > 0 ? base.slice(0, lastDot) : base;
  const ext = lastDot > 0 ? base.slice(lastDot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const safeStem = stem
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80) || "file";
  return ext ? `${safeStem}.${ext}` : safeStem;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!BUNNY_API_KEY) return json({ error: "BUNNY API key not configured" }, 500);

  // Body parse
  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "expected multipart/form-data" }, 400); }
  const threadId = String(form.get("thread_id") || "").trim();
  const kindRaw = String(form.get("kind") || "file").trim();
  const kind = (kindRaw === "image" || kindRaw === "pdf") ? kindRaw : "file";
  const file = form.get("file");
  if (!threadId) return json({ error: "thread_id required" }, 400);
  if (!(file instanceof File)) return json({ error: "file required" }, 400);
  if (file.size <= 0) return json({ error: "empty file" }, 400);

  const widthHint = parseInt(String(form.get("width") || "")) || null;
  const heightHint = parseInt(String(form.get("height") || "")) || null;

  // Service-role client to look up the thread + downstream issue/pub.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: thread, error: tErr } = await admin
    .from("message_threads")
    .select("id, ref_type, ref_id")
    .eq("id", threadId)
    .single();
  if (tErr || !thread) return json({ error: "thread not found" }, 404);
  if (!thread.ref_type || !thread.ref_id) return json({ error: "thread has no ref binding" }, 400);

  // Resolve the issue + publication + date that owns this thread so we
  // can build the canonical path.
  let issueId: string | null = null;
  let pubId: string | null = null;
  let issueDate: string | null = null;
  let storyIdForPath: string | null = null;

  if (thread.ref_type === "issue") {
    issueId = thread.ref_id;
  } else if (thread.ref_type === "story") {
    const { data: s } = await admin
      .from("stories")
      .select("id, print_issue_id, publication_id")
      .eq("id", thread.ref_id)
      .single();
    if (!s) return json({ error: "story not found" }, 404);
    issueId = s.print_issue_id;
    pubId = s.publication_id;
    storyIdForPath = s.id;
  } else {
    // Other ref_types fall back to a per-ref folder under generic/
    issueId = null;
  }

  if (issueId) {
    const { data: iss } = await admin
      .from("issues")
      .select("id, pub_id, date")
      .eq("id", issueId)
      .single();
    if (iss) {
      pubId = pubId || iss.pub_id;
      issueDate = iss.date; // already YYYY-MM-DD
    }
  }

  // Build the path. Fallback for non-issue/story threads goes to a
  // generic/ folder so attachments still upload from e.g. ad_project
  // discussions without breaking on missing issue context.
  const fileName = safeFilename(file.name);
  const fileUuid = crypto.randomUUID();
  let bunnyPath: string;
  if (thread.ref_type === "issue" && pubId && issueDate) {
    bunnyPath = `issues/${pubId}/${issueDate}/discussions/issue/${fileUuid}_${fileName}`;
  } else if (thread.ref_type === "story" && pubId && issueDate && storyIdForPath) {
    bunnyPath = `issues/${pubId}/${issueDate}/discussions/story/${storyIdForPath}/${fileUuid}_${fileName}`;
  } else {
    bunnyPath = `discussions/${thread.ref_type}/${thread.ref_id}/${fileUuid}_${fileName}`;
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = file.type || (kind === "image" ? "application/octet-stream" : "application/octet-stream");

  const putRes = await fetch(`https://${BUNNY_REGION_HOST}/${BUNNY_STORAGE_ZONE}/${bunnyPath}`, {
    method: "PUT",
    headers: { AccessKey: BUNNY_API_KEY, "Content-Type": contentType },
    body: bytes,
  });
  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => "");
    return json({ error: `BunnyCDN upload failed: ${putRes.status} ${txt}` }, 502);
  }

  const cdn_url = `https://${BUNNY_CDN_HOST}/${bunnyPath}`;
  return json({
    cdn_url,
    bunny_path: bunnyPath,
    filename: fileName,
    byte_size: bytes.byteLength,
    kind,
    width: widthHint,
    height: heightHint,
  });
});
