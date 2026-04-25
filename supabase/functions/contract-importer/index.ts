// ============================================================
// contract-importer — turns mobile-uploaded paper-contract photos
// into a structured proposal draft via Gemini Vision.
//
// Runs in Supabase Edge Functions (Deno) so it doesn't depend on
// the Wednesday Agent Station Mac Mini being awake. Replaces the
// scripts/wednesday-station/contract-importer LaunchAgent.
//
// Two invocation modes:
//
//   1. Trigger fan-in (preferred). A row insert on contract_imports
//      fires a Postgres trigger that calls pg_net.http_post against
//      this function with { id }. We process that single row.
//
//   2. Drain mode. POST { drain: true } and we walk every pending
//      row. Used as a safety net (cron'd) in case a trigger drop or
//      cold-start eats an event.
//
// Auth: service_role only. The trigger uses the service role key,
// drain calls use it too. No anonymous access.
//
// Idempotency: claim_pending_contract_import RPC (FOR UPDATE SKIP
// LOCKED) so concurrent invocations can't double-process a row.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";

const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Cap per drain call. A trigger-fired call always processes 1 row,
// so this only matters for the safety-net cron drain.
const DRAIN_CAP = 10;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}

// ── Prompt (mirrors the Mac Mini worker so the contract format
// stays the source of truth in one place) ─────────────────────
const EXTRACTION_PROMPT = `You are reading photos of a paper sales contract for 13 Stars Media's OpenDoor Directories.

The form has these fields (handwriting is messy — be conservative):
- Top-left: PO box number, client/company name, address, phone, email, website
- Right column: rep info (Christie Coyes), date
- Middle table: rows of section / category / ad size / rate / "design" toggle
- Bottom: total due, paid amount, check number, payment method, pickup vs camera-ready, notes

Return STRICTLY this JSON shape and nothing else (no markdown, no commentary):

{
  "publication_hint": "OpenDoor Directories",
  "client": {
    "name": string,
    "phone": string|null,
    "email": string|null,
    "website": string|null,
    "address": string|null,
    "contact_name": string|null,
    "contact_phone": string|null,
    "contact_email": string|null
  },
  "line_items": [
    {
      "section": string|null,
      "category": string|null,
      "ad_size": string|null,
      "rate": number|null,
      "design": "we_design" | "camera_ready" | null
    }
  ],
  "total_due": number|null,
  "paid_amount": number|null,
  "check_number": string|null,
  "payment_method": "cc" | "check" | "bill" | "paid" | null,
  "pickup_or_camera_ready": "pick_up" | "camera_ready" | null,
  "notes": string|null,
  "confidence": number
}

Rules:
- If a field is unreadable, return null — don't guess.
- "rate" must be a number in dollars (no currency symbols).
- "line_items" must be an array; one entry per row in the table that has data.
- "confidence" should reflect how legible the photos are. Rough guide: 0.9+ if clean handwriting, 0.6-0.8 if messy but readable, <0.5 if you're really not sure.`;

// ── Helpers ─────────────────────────────────────────────────────
function tryParseJson(text: string): any | null {
  const trimmed = text.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "");
  try { return JSON.parse(trimmed); } catch { return null; }
}

function mimeFor(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "image/jpeg";
}

async function downloadAsBase64(admin: any, path: string): Promise<{ mime: string; data: string }> {
  const { data, error } = await admin.storage.from("contract-imports").download(path);
  if (error) throw new Error(`download ${path}: ${error.message}`);
  const ab = await data.arrayBuffer();
  const bytes = new Uint8Array(ab);
  // btoa wants binary string; base64 in chunks to avoid stack blowups on big images.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return { mime: mimeFor(path), data: btoa(binary) };
}

async function callGemini(parts: any[]): Promise<string> {
  const url = `${GEMINI_ENDPOINT}?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.1,           // OCR/extraction wants determinism
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`gemini ${res.status}: ${text.slice(0, 300)}`);
  }
  const body = await res.json();
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`gemini empty response: ${JSON.stringify(body).slice(0, 300)}`);
  return text;
}

// ── Process one row (assumed already in 'processing' state) ────
async function processRow(admin: any, row: any) {
  console.log(`[contract-importer] processing ${row.id} (${(row.storage_paths || []).length} photos)`);
  try {
    const photos = await Promise.all((row.storage_paths || []).map((p: string) => downloadAsBase64(admin, p)));
    if (photos.length === 0) throw new Error("no photos attached");

    const parts: any[] = [
      { text: EXTRACTION_PROMPT },
      ...photos.map(p => ({ inlineData: { mimeType: p.mime, data: p.data } })),
    ];
    if (row.notes) parts.push({ text: `\nReviewer hint: ${row.notes}` });

    const text = await callGemini(parts);
    const parsed = tryParseJson(text);

    if (!parsed) {
      await admin.from("contract_imports").update({
        status: "failed",
        error_message: `Parser returned non-JSON (first 500 chars): ${text.slice(0, 500)}`,
        worker_finished_at: new Date().toISOString(),
      }).eq("id", row.id);
      console.error(`[contract-importer] ${row.id} JSON parse failed`);
      return { ok: false, reason: "non_json" };
    }

    await admin.from("contract_imports").update({
      status: "extracted",
      extracted_json: parsed,
      worker_finished_at: new Date().toISOString(),
      error_message: null,
    }).eq("id", row.id);
    console.log(`[contract-importer] ${row.id} → extracted (confidence ${parsed.confidence ?? "?"})`);
    return { ok: true, confidence: parsed.confidence };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 500);
    console.error(`[contract-importer] ${row.id} failed:`, msg);
    await admin.from("contract_imports").update({
      status: "failed",
      error_message: msg,
      worker_finished_at: new Date().toISOString(),
    }).eq("id", row.id);
    return { ok: false, reason: msg };
  }
}

// ── Main ─────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "missing_bearer" }, 401);
  const token = auth.slice(7).trim();
  if (token !== SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1] || ""));
      if (payload?.role !== "service_role") return json({ error: "service_role_required" }, 403);
    } catch {
      return json({ error: "service_role_required" }, 403);
    }
  }

  if (!GEMINI_API_KEY) {
    return json({ error: "missing_gemini_key", detail: "GEMINI_API_KEY not set in Edge Function secrets." }, 500);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Mode 1: process a specific row by id (trigger-fired path).
  if (body?.id) {
    // Atomic claim — only proceed if we successfully transition the row
    // from pending → processing. If another invocation already grabbed
    // it, the UPDATE returns no rows and we exit cleanly.
    const { data: claimed, error: claimErr } = await admin
      .from("contract_imports")
      .update({ status: "processing", worker_started_at: new Date().toISOString() })
      .eq("id", body.id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (claimErr) return json({ error: "claim_failed", detail: claimErr.message }, 500);
    if (!claimed) return json({ ok: true, skipped: "not_pending_or_already_claimed" });

    const result = await processRow(admin, claimed);
    return json({ ok: result.ok, id: body.id, ...result });
  }

  // Mode 2: drain. Walk every pending row up to DRAIN_CAP. Used as the
  // pg_cron safety net or for manual catch-up.
  if (body?.drain) {
    const results: any[] = [];
    for (let i = 0; i < DRAIN_CAP; i++) {
      const { data: claimed } = await admin.rpc("claim_pending_contract_import");
      if (!claimed || (Array.isArray(claimed) && claimed.length === 0)) break;
      const row = Array.isArray(claimed) ? claimed[0] : claimed;
      if (!row?.id) break;
      const r = await processRow(admin, row);
      results.push({ id: row.id, ...r });
    }
    return json({ ok: true, drained: results.length, results });
  }

  return json({ error: "specify { id } or { drain: true }" }, 400);
});
