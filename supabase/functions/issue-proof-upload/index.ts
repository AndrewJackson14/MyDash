// ============================================================
// issue-proof-upload — store an issue's proof PDF and record the
// versioned issue_proofs row. Each upload increments version,
// supersedes any prior 'review' rows for the same issue (so reviewers
// always see the latest version under review), and records the
// uploader's team_members.id.
//
// Why an edge function: the BunnyCDN API key cannot be exposed to the
// browser, and we need to upsert + supersede atomically against the
// service role so RLS doesn't fight us during the version bump.
//
// Mirrors flatplan-layout-upload's contract:
//   POST multipart/form-data
//     Authorization: Bearer <user JWT>
//     Form fields: issue_id, file [, notes]
//
// 200 → { id, version, pdf_url, bunny_path }
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

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 MB — single-issue PDFs run ~100 MB

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function pad3(n: number): string { return n < 10 ? `00${n}` : n < 100 ? `0${n}` : String(n); }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!BUNNY_API_KEY) return json({ error: "BUNNY API key not configured" }, 500);

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "expected multipart/form-data" }, 400); }

  const issueId = String(form.get("issue_id") || "").trim();
  const notes = String(form.get("notes") || "").trim();
  const file = form.get("file");
  if (!issueId) return json({ error: "issue_id required" }, 400);
  if (!(file instanceof File) || file.size <= 0) return json({ error: "file required" }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: "file too large" }, 413);
  if (!(file.type === "application/pdf" || /\.pdf$/i.test(file.name || ""))) {
    return json({ error: "PDF only" }, 400);
  }

  // Authenticate the caller and resolve their team_members.id
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return json({ error: "Not authenticated" }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: tm } = await admin
    .from("team_members")
    .select("id, role")
    .eq("auth_id", userData.user.id)
    .maybeSingle();
  if (!tm) return json({ error: "team member not found" }, 403);
  if (!["Layout Designer", "Graphic Designer", "Production Manager", "Publisher", "Editor-in-Chief"].includes(tm.role || "")) {
    return json({ error: "role not permitted to upload proofs" }, 403);
  }

  // Resolve issue → pub + date for the canonical bunny path
  const { data: iss } = await admin
    .from("issues")
    .select("id, pub_id, date")
    .eq("id", issueId)
    .single();
  if (!iss) return json({ error: "issue not found" }, 404);

  // Compute next version + supersede any prior under-review rows so
  // reviewers only see the freshest version. Approved + revising rows
  // are left intact for history.
  const { data: latest } = await admin
    .from("issue_proofs")
    .select("version")
    .eq("issue_id", issueId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = ((latest?.version) || 0) + 1;

  await admin
    .from("issue_proofs")
    .update({ status: "superseded" })
    .eq("issue_id", issueId)
    .eq("status", "review");

  // Upload to BunnyCDN. Versioned filename so old PDFs stay
  // downloadable from the history list.
  const bunnyPath = `issues/${iss.pub_id}/${iss.date}/proofs/v${pad3(nextVersion)}.pdf`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const putRes = await fetch(`https://${BUNNY_REGION_HOST}/${BUNNY_STORAGE_ZONE}/${bunnyPath}`, {
    method: "PUT",
    headers: { AccessKey: BUNNY_API_KEY, "Content-Type": "application/pdf" },
    body: bytes,
  });
  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => "");
    return json({ error: `BunnyCDN upload failed: ${putRes.status} ${txt}` }, 502);
  }

  const cdn_url = `https://${BUNNY_CDN_HOST}/${bunnyPath}`;

  const { data: row, error: insErr } = await admin
    .from("issue_proofs")
    .insert({
      issue_id: issueId,
      version: nextVersion,
      pdf_url: cdn_url,
      pdf_filename: file.name || `v${nextVersion}.pdf`,
      bunny_path: bunnyPath,
      byte_size: bytes.byteLength,
      uploaded_by: tm.id,
      uploaded_at: new Date().toISOString(),
      notes: notes || null,
      status: "review",
    })
    .select()
    .single();

  if (insErr || !row) {
    return json({ error: `DB insert failed: ${insErr?.message || "unknown"}` }, 500);
  }

  return json({
    id: row.id,
    version: row.version,
    pdf_url: row.pdf_url,
    bunny_path: row.bunny_path,
    page_count: row.page_count,
  });
});
