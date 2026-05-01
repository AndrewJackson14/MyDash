// ============================================================
// editorial_check — bridges MyDash StoryEditor to the Editorial
// Assistant FastAPI server on the Mac Mini.
//
// Flow:
//   StoryEditor.jsx
//     → POST /functions/v1/editorial_check  (with user JWT)
//   editorial_check
//     → verify Bearer JWT (authenticated user only)
//     → forward POST to ${EDITORIAL_HOST_URL}/check
//          + X-Mydash-Token header (shared secret with FastAPI)
//     → stream JSON response back to client
//
// Why a server-side bridge: the FastAPI server isn't internet-exposed
// for the editor, and we don't want the shared MYDASH_TOKEN sitting
// in a frontend bundle. The Edge Function holds the token; the
// browser only ever sees its own user JWT.
//
// Env vars:
//   EDITORIAL_HOST_URL   e.g. http://192.168.0.65:8765 (LAN) or the
//                        port-forwarded WAN URL once that lands.
//                        Falls back to a local dev URL.
//   MYDASH_TOKEN         shared secret with the FastAPI server.
//                        Must match server.py's MYDASH_TOKEN env.
//   ALLOWED_ORIGINS      comma-separated CORS allowlist.
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = (
  Deno.env.get("ALLOWED_ORIGINS") ||
  "https://mydash.media,http://localhost:5173,http://localhost:4173"
).split(",");

// FastAPI server host. Set at deploy time:
//   supabase secrets set EDITORIAL_HOST_URL=http://<wan-or-lan>:8765
const EDITORIAL_HOST_URL =
  Deno.env.get("EDITORIAL_HOST_URL") || "http://127.0.0.1:8765";

// Shared bearer token. Set the SAME value on the Mac Mini in the
// editorial-assistant/.env (MYDASH_TOKEN). Generate fresh:
//   openssl rand -hex 32
const MYDASH_TOKEN = Deno.env.get("MYDASH_TOKEN") || "";

// Generous upstream timeout — wall-clock for a four-skill check is
// ~3-6 seconds (parallel inside FastAPI), but cold-cache profile
// fetch + slowest single Gemini call can stretch this out. 60s
// matches the longest single Gemini call.
const UPSTREAM_TIMEOUT_MS = 60_000;

const SKILLS_ALLOWED = ["ap_style", "voice_match", "headline", "attribution"];


function corsFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin":  allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary":                         "Origin",
  };
}

function authedUserId(authHeader: string): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const payload = JSON.parse(atob(authHeader.slice(7).split(".")[1]));
    if (!payload?.sub) return null;
    if (payload.role !== "authenticated" && payload.role !== "service_role") return null;
    return String(payload.sub);
  } catch {
    return null;
  }
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}


Deno.serve(async (req: Request) => {
  const cors = corsFor(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405, cors);

  // Auth: real user JWT must be present + valid. The Edge Function
  // is the only thing standing between the public internet and the
  // FastAPI server, so this is load-bearing.
  const userId = authedUserId(req.headers.get("Authorization") || "");
  if (!userId) return json({ error: "Not authenticated" }, 401, cors);

  // Body validation. Cheap shape check before we burn an upstream call.
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400, cors);
  }

  if (!body?.story_id || typeof body.story_id !== "string") {
    return json({ error: "story_id required" }, 400, cors);
  }
  if (typeof body.body !== "string") {
    return json({ error: "body (string) required" }, 400, cors);
  }
  if (!Array.isArray(body.skills) || body.skills.length === 0) {
    return json({ error: "skills (non-empty array) required" }, 400, cors);
  }
  const unknown = body.skills.filter((s: unknown) => !SKILLS_ALLOWED.includes(String(s)));
  if (unknown.length) {
    return json({
      error: "unknown_skill",
      skills: unknown,
      available: SKILLS_ALLOWED,
    }, 400, cors);
  }

  if (!MYDASH_TOKEN) {
    return json({
      error: "server_misconfigured",
      detail: "MYDASH_TOKEN not set on Edge Function",
    }, 500, cors);
  }

  // Forward to FastAPI. Pass the JSON body through unchanged — the
  // server validates shape on its side as well. Bound the upstream
  // call with AbortController so a hung Mac Mini doesn't tie up the
  // Edge Function past the user's patience window.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstreamRes = await fetch(`${EDITORIAL_HOST_URL}/check`, {
      method: "POST",
      headers: {
        "Content-Type":   "application/json",
        "X-Mydash-Token": MYDASH_TOKEN,
      },
      body:   JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await upstreamRes.text();

    // Pass through the upstream's status + body. If FastAPI returned
    // 4xx (bad skill list, etc.) we want the editor to see that
    // shape, not a generic 500.
    return new Response(text, {
      status:  upstreamRes.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    if (e?.name === "AbortError") {
      return json({
        error:  "upstream_timeout",
        detail: `Editorial server did not respond within ${UPSTREAM_TIMEOUT_MS}ms`,
      }, 504, cors);
    }
    return json({
      error:  "upstream_error",
      detail: e?.message || String(e),
    }, 502, cors);
  } finally {
    clearTimeout(timeoutId);
  }
});
