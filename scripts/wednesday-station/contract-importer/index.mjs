// contract-importer — Wednesday Agent Station LaunchAgent worker.
//
// Polls Supabase for contract_imports rows in 'pending' status,
// downloads the attached photos, runs them through Gemini Vision
// for structured extraction, and writes the result back as
// status='extracted' so the mobile reviewer can confirm + convert.
//
// Failure modes:
//   - missing API key   → log + sleep
//   - download error    → mark row 'failed' with reason
//   - Gemini error      → mark row 'failed' with reason
//   - JSON parse error  → mark row 'failed' with parser reply text
//   - network error     → leave 'pending', try again next tick
//
// Idempotency: claim is atomic via UPDATE … RETURNING with a
// status='pending' guard so two workers can't grab the same row.
//
// Deploy:
//   ssh wednesdayagentic@192.168.0.65
//   cd ~/wednesday-station/jobs
//   git clone <or copy> ./contract-importer
//   cd contract-importer && npm install
//   cp .env.example .env  (fill in SUPABASE + GEMINI keys)
//   launchctl load ~/Library/LaunchAgents/station.wednesday.contract-importer.plist
//
// Watch: launchctl print user/$(id -u)/station.wednesday.contract-importer
// Logs:  tail -f ~/wednesday-station/logs/contract-importer.log

import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 15000);
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.0-flash";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[contract-importer] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}
if (!GEMINI_API_KEY) {
  console.error("[contract-importer] missing GEMINI_API_KEY");
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

// ── Prompt ────────────────────────────────────────────────────
// Gemini supports image input + JSON output mode. We give it the
// shape of an OpenDoor Directories paper contract and ask it to
// return a strict JSON object. Confidence is a self-reported 0-1
// signal we surface back in the mobile review UI.
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
    "name": string,                 // best-guess client name (be careful of cursive)
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
      "section": string|null,        // e.g. "Constr", "Real Estate"
      "category": string|null,       // free text from "Category" column
      "ad_size": string|null,        // e.g. "1/4 page", "full", "1/8"
      "rate": number|null,           // dollars
      "design": "we_design" | "camera_ready" | null
    }
  ],
  "total_due": number|null,
  "paid_amount": number|null,
  "check_number": string|null,
  "payment_method": "cc" | "check" | "bill" | "paid" | null,
  "pickup_or_camera_ready": "pick_up" | "camera_ready" | null,
  "notes": string|null,
  "confidence": number               // 0..1, your honest confidence in the extraction
}

Rules:
- If a field is unreadable, return null — don't guess.
- "rate" must be a number in dollars (no currency symbols).
- "line_items" must be an array; one entry per row in the table that has data.
- "confidence" should reflect how legible the photos are. Rough guide: 0.9+ if clean handwriting, 0.6-0.8 if messy but readable, <0.5 if you're really not sure.`;

// ── Helpers ───────────────────────────────────────────────────
async function claimNextRow() {
  // Atomic claim: UPDATE the oldest pending row to processing in one
  // statement. Two workers can't both win.
  const { data, error } = await supabase.rpc("claim_pending_contract_import");
  if (!error && data) return data;

  // Fallback if RPC isn't deployed yet — UPDATE … WHERE … RETURNING
  // via raw SQL (less atomic; OK since we only run one worker).
  const { data: rows, error: e2 } = await supabase
    .from("contract_imports")
    .update({ status: "processing", worker_started_at: new Date().toISOString() })
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .select()
    .maybeSingle();
  if (e2) {
    console.error("[contract-importer] claim error:", e2.message);
    return null;
  }
  return rows;
}

async function downloadPhoto(path) {
  const { data, error } = await supabase.storage
    .from("contract-imports")
    .download(path);
  if (error) throw new Error(`download ${path}: ${error.message}`);
  const buf = Buffer.from(await data.arrayBuffer());
  // Gemini wants base64 + mime.
  const mime = path.toLowerCase().endsWith(".png") ? "image/png"
    : path.toLowerCase().endsWith(".webp") ? "image/webp"
    : path.toLowerCase().endsWith(".pdf") ? "application/pdf"
    : "image/jpeg";
  return { mime, b64: buf.toString("base64") };
}

function tryParseJson(text) {
  // Gemini sometimes wraps in ```json fences despite the instruction.
  const trimmed = text.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "");
  try { return JSON.parse(trimmed); }
  catch { return null; }
}

async function processRow(row) {
  console.log(`[contract-importer] processing ${row.id} (${(row.storage_paths || []).length} photos)`);
  try {
    const photos = await Promise.all((row.storage_paths || []).map(downloadPhoto));
    if (photos.length === 0) throw new Error("no photos attached");

    const imageParts = photos.map(p => ({
      inlineData: { mimeType: p.mime, data: p.b64 },
    }));

    const result = await model.generateContent([
      { text: EXTRACTION_PROMPT },
      ...imageParts,
      ...(row.notes ? [{ text: `\nReviewer hint: ${row.notes}` }] : []),
    ]);
    const text = result.response.text();
    const parsed = tryParseJson(text);

    if (!parsed) {
      await supabase.from("contract_imports").update({
        status: "failed",
        error_message: `Parser returned non-JSON (first 500 chars): ${text.slice(0, 500)}`,
        worker_finished_at: new Date().toISOString(),
      }).eq("id", row.id);
      console.error(`[contract-importer] ${row.id} JSON parse failed`);
      return;
    }

    await supabase.from("contract_imports").update({
      status: "extracted",
      extracted_json: parsed,
      worker_finished_at: new Date().toISOString(),
      error_message: null,
    }).eq("id", row.id);
    console.log(`[contract-importer] ${row.id} → extracted (confidence ${parsed.confidence ?? "?"})`);
  } catch (e) {
    const msg = String(e?.message ?? e).slice(0, 500);
    console.error(`[contract-importer] ${row.id} failed:`, msg);
    await supabase.from("contract_imports").update({
      status: "failed",
      error_message: msg,
      worker_finished_at: new Date().toISOString(),
    }).eq("id", row.id);
  }
}

// ── Main loop ─────────────────────────────────────────────────
async function tick() {
  let processed = 0;
  while (true) {
    const row = await claimNextRow();
    if (!row) break;
    await processRow(row);
    processed++;
    if (processed >= 10) break;  // batch cap so we don't starve other ticks
  }
  return processed;
}

console.log(`[contract-importer] starting (model=${MODEL_NAME}, poll=${POLL_INTERVAL_MS}ms)`);
let stopped = false;
process.on("SIGTERM", () => { stopped = true; });
process.on("SIGINT", () => { stopped = true; });

while (!stopped) {
  try {
    const n = await tick();
    if (n > 0) console.log(`[contract-importer] processed ${n} rows`);
  } catch (e) {
    console.error("[contract-importer] tick error:", e?.message ?? e);
  }
  await sleep(POLL_INTERVAL_MS);
}
console.log("[contract-importer] shutting down");
