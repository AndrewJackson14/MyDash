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

// Anthropic Claude is the primary vision provider (better handwriting
// recognition + much higher rate limits than Gemini free tier). If
// ANTHROPIC_API_KEY isn't set we fall back to Gemini.
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const CLAUDE_MODEL = Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-4-5-20250929";
const CLAUDE_ENDPOINT = "https://api.anthropic.com/v1/messages";

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

// Inputs to the parser dispatch: prompt text + N photos (base64).
type ParserInput = { prompt: string; photos: { mime: string; data: string }[]; reviewerHint?: string | null };

async function callClaude(input: ParserInput): Promise<string> {
  // Claude Vision via Messages API. Order matters — image content
  // first, then the question, mirrors Anthropic's recommendation
  // for OCR-style tasks.
  const content: any[] = [];
  for (const p of input.photos) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: p.mime, data: p.data },
    });
  }
  content.push({
    type: "text",
    text: input.prompt + (input.reviewerHint ? `\n\nReviewer hint: ${input.reviewerHint}` : ""),
  });

  const res = await fetch(CLAUDE_ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      temperature: 0,
      // We tell Claude to prefill its response with `{` so it's
      // guaranteed to start a JSON object — matches the prompt's
      // "STRICTLY this JSON shape" rule and saves a parse retry.
      messages: [
        { role: "user", content },
        { role: "assistant", content: "{" },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`claude ${res.status}: ${text.slice(0, 300)}`);
  }
  const body = await res.json();
  const block = body?.content?.[0];
  if (!block?.text) throw new Error(`claude empty response: ${JSON.stringify(body).slice(0, 300)}`);
  // Re-attach the assistant prefill since we asked Claude to start with `{`.
  return "{" + block.text;
}

async function callGemini(input: ParserInput): Promise<string> {
  const parts: any[] = [{ text: input.prompt }];
  for (const p of input.photos) {
    parts.push({ inlineData: { mimeType: p.mime, data: p.data } });
  }
  if (input.reviewerHint) parts.push({ text: `\nReviewer hint: ${input.reviewerHint}` });

  const url = `${GEMINI_ENDPOINT}?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.1,
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

// Dispatch: prefer Claude when the key's set; fall back to Gemini.
// On any Claude error we DON'T retry on Gemini — better to surface
// the real error than to mask it with a fallback that might also
// fail and hide what actually went wrong.
async function callParser(input: ParserInput): Promise<{ provider: string; text: string }> {
  if (ANTHROPIC_API_KEY) {
    return { provider: "claude", text: await callClaude(input) };
  }
  if (GEMINI_API_KEY) {
    return { provider: "gemini", text: await callGemini(input) };
  }
  throw new Error("no parser key configured (set ANTHROPIC_API_KEY or GEMINI_API_KEY in Edge Function secrets)");
}

// ── Process one row (assumed already in 'processing' state) ────
async function processRow(admin: any, row: any) {
  console.log(`[contract-importer] processing ${row.id} (${(row.storage_paths || []).length} photos)`);
  try {
    const photos = await Promise.all((row.storage_paths || []).map((p: string) => downloadAsBase64(admin, p)));
    if (photos.length === 0) throw new Error("no photos attached");

    const { provider, text } = await callParser({
      prompt: EXTRACTION_PROMPT,
      photos,
      reviewerHint: row.notes || null,
    });
    const parsed = tryParseJson(text);

    if (!parsed) {
      await admin.from("contract_imports").update({
        status: "failed",
        error_message: `${provider} returned non-JSON (first 500 chars): ${text.slice(0, 500)}`,
        worker_finished_at: new Date().toISOString(),
      }).eq("id", row.id);
      console.error(`[contract-importer] ${row.id} JSON parse failed (provider=${provider})`);
      return { ok: false, reason: "non_json", provider };
    }

    await admin.from("contract_imports").update({
      status: "extracted",
      extracted_json: { ...parsed, _provider: provider },
      worker_finished_at: new Date().toISOString(),
      error_message: null,
    }).eq("id", row.id);
    console.log(`[contract-importer] ${row.id} → extracted (provider=${provider}, confidence ${parsed.confidence ?? "?"})`);
    return { ok: true, confidence: parsed.confidence, provider };
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

  if (!ANTHROPIC_API_KEY && !GEMINI_API_KEY) {
    return json({
      error: "no_parser_key",
      detail: "Set ANTHROPIC_API_KEY (preferred) or GEMINI_API_KEY in Supabase Edge Function secrets.",
    }, 500);
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
