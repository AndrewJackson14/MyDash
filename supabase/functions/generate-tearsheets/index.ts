// ============================================================
// generate-tearsheets — Anthony Phase 5c. Splits a print_run's
// master PDF into per-page tearsheet PDFs and stores the resulting
// CDN URLs back on print_runs.tearsheets (jsonb array).
//
// Trigger: client-fired POST after the printer confirms (or any
// time post-press). Idempotent — re-running regenerates tearsheets
// only if missing or if force=true.
//
// Why an edge function: BunnyCDN API key cannot be exposed
// client-side, and pdf-lib's split-by-page cost is heavier than
// we want in the browser even on dial-up press-day connections.
//
// Why pdf-lib (vs pdf.js): pdf-lib runs server-side in Deno via
// esm.sh with no canvas dependency. It gives us page-level copy
// (one source page → one new PDF) without rasterising. Thumbnails
// would need pdf.js + a canvas shim — deferred to 5c.5.
//
// POST application/json
//   Authorization: Bearer <user JWT>
//   Body: { print_run_id, force?: boolean }
//
// 200 → { print_run_id, tearsheets: [{page, pdf_url, byte_size}], generated, skipped }
// 4xx/5xx → { error }
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const BUNNY_STORAGE_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE") || "stellarpress-media";
const BUNNY_API_KEY = Deno.env.get("BUNNY_STORAGE_API_KEY") || Deno.env.get("BUNNY_API_KEY") || "";
const BUNNY_CDN_HOST = Deno.env.get("BUNNY_CDN_HOST") || "cdn.13stars.media";
const BUNNY_REGION_HOST = Deno.env.get("BUNNY_REGION_HOST") || "ny.storage.bunnycdn.com";

// Anthony's biggest issue (Malibu Magazine Spring) is 96 pages.
// Each tearsheet is the size of one page's content (a few hundred KB
// to a few MB depending on the master). Cap at 200 pages so a
// runaway upload can't pin the function for an hour.
const MAX_PAGES = 200;
const ALLOWED_ROLES = ["Layout Designer", "Graphic Designer", "Production Manager", "Publisher"];

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

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const printRunId = String(body?.print_run_id || "").trim();
  const force = !!body?.force;
  if (!printRunId) return json({ error: "print_run_id required" }, 400);

  // Auth — reuse the same role gate as send-to-press
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
  if (!ALLOWED_ROLES.includes(tm.role || "")) return json({ error: "role not permitted" }, 403);

  const { data: run, error: runErr } = await admin
    .from("print_runs")
    .select("id, issue_id, pdf_url, bunny_path, tearsheets")
    .eq("id", printRunId)
    .single();
  if (runErr || !run) return json({ error: "print_run not found" }, 404);
  if (!run.pdf_url) return json({ error: "no pdf_url on this run" }, 400);

  // Idempotency — if tearsheets already exist and not forcing, return them.
  if (!force && Array.isArray(run.tearsheets) && run.tearsheets.length > 0) {
    return json({ print_run_id: run.id, tearsheets: run.tearsheets, generated: 0, skipped: run.tearsheets.length });
  }

  const { data: iss } = await admin
    .from("issues").select("id, pub_id, date").eq("id", run.issue_id).single();
  if (!iss) return json({ error: "issue not found" }, 404);

  // Fetch master PDF — same CDN we wrote it to. If the file moved
  // (BunnyCDN cleanup? manual delete?) we surface a clear 502.
  let masterBytes: Uint8Array;
  try {
    const r = await fetch(run.pdf_url);
    if (!r.ok) throw new Error(`master_fetch_${r.status}`);
    masterBytes = new Uint8Array(await r.arrayBuffer());
  } catch (err) {
    return json({ error: `master pdf fetch failed: ${(err as Error).message}` }, 502);
  }

  // Split with pdf-lib. copyPages does a clean per-page extraction
  // — annotations, links, embedded fonts come along; thumbnails do
  // NOT (those need pdf.js / canvas, deferred).
  let srcPdf: any;
  try {
    srcPdf = await PDFDocument.load(masterBytes, { ignoreEncryption: true });
  } catch (err) {
    return json({ error: `pdf parse failed: ${(err as Error).message}` }, 500);
  }
  const numPages = srcPdf.getPageCount();
  if (numPages > MAX_PAGES) return json({ error: `pdf has ${numPages} pages, cap is ${MAX_PAGES}` }, 413);

  // Canonical tearsheet path keeps each page's URL stable across
  // regenerations — same path, same CDN URL, just newer bytes.
  const baseFolder = `issues/${iss.pub_id}/${iss.date}/tearsheets/${run.id}`;

  const tearsheets: { page: number; pdf_url: string; bunny_path: string; byte_size: number }[] = [];
  for (let i = 0; i < numPages; i++) {
    const pageNum = i + 1;
    try {
      const newDoc = await PDFDocument.create();
      const [page] = await newDoc.copyPages(srcPdf, [i]);
      newDoc.addPage(page);
      const pdfBytes = await newDoc.save();

      const bunnyPath = `${baseFolder}/page-${pad3(pageNum)}.pdf`;
      const putRes = await fetch(`https://${BUNNY_REGION_HOST}/${BUNNY_STORAGE_ZONE}/${bunnyPath}`, {
        method: "PUT",
        headers: { AccessKey: BUNNY_API_KEY, "Content-Type": "application/pdf" },
        body: pdfBytes,
      });
      if (!putRes.ok) {
        // Skip the page rather than failing the whole batch — partial
        // tearsheet coverage is better than none.
        console.error(`page ${pageNum} upload failed: ${putRes.status}`);
        continue;
      }
      tearsheets.push({
        page: pageNum,
        pdf_url: `https://${BUNNY_CDN_HOST}/${bunnyPath}`,
        bunny_path: bunnyPath,
        byte_size: pdfBytes.byteLength,
      });
    } catch (err) {
      console.error(`page ${pageNum} split failed:`, err);
    }
  }

  // Persist the manifest.
  const { error: upErr } = await admin
    .from("print_runs")
    .update({ tearsheets })
    .eq("id", run.id);
  if (upErr) return json({ error: `persist failed: ${upErr.message}` }, 500);

  return json({
    print_run_id: run.id,
    tearsheets,
    generated: tearsheets.length,
    skipped: numPages - tearsheets.length,
  });
});
