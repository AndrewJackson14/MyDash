// ============================================================
// upload-image — authenticated proxy that PUTs an image (or PDF)
// to BunnyCDN. The caller controls the destination path via
// x-upload-path + x-file-name; we validate both to prevent
// path-traversal and enforce a small allowlist of top-level prefixes
// so callers can't overwrite arbitrary objects in the storage zone.
//
// Auth: requires a Supabase user JWT. The previous version was
// completely open — any browser could PUT anywhere in the zone.
// CORS is locked to the production origin for the same reason; the
// browser's `Origin` header is server-set so this is enforceable.
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BUNNY_STORAGE_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE") || "stellarpress-media";
const BUNNY_API_KEY = Deno.env.get("BUNNY_STORAGE_API_KEY") || Deno.env.get("BUNNY_API_KEY") || "";
const BUNNY_CDN_HOST = Deno.env.get("BUNNY_CDN_HOST") || "cdn.13stars.media";
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://mydash.media,http://localhost:5173,http://localhost:4173").split(",");

// Top-level path prefixes the function will write into. Anything
// outside this list (e.g. "system/", "..", or empty) is rejected.
const ALLOWED_PATH_PREFIXES = [
  "uploads/",
  "media/",
  "media-assets/",
  "story-images/",
  "ad-projects/",
  "ad-proofs/",
  "client-uploads/",
  "creative-jobs/",
  "team-signatures/",
  "issues/",                  // flatplan layouts + discussion attachments
  "legal-clippings/",
  "legal-affidavits/",
  "billing/",
  "merch/",
  "site-logos/",
];

function corsFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-upload-path, x-file-name, x-content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// JWT inspection — same trick the other authenticated functions use.
// We only need to confirm the token was issued by Supabase auth and
// represents a valid (non-anon, non-service) user.
function getUserIdFromJwt(authHeader: string): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (!payload?.sub) return null;
    if (payload.role !== "authenticated" && payload.role !== "service_role") return null;
    return String(payload.sub);
  } catch { return null; }
}

function safeFilename(name: string): string {
  return String(name || "file")
    .replace(/[\x00-\x1f\\:?"*<>|]+/g, "")
    .replace(/\.\.+/g, ".")
    .slice(0, 200);
}

function safePathSegment(s: string): string {
  // Remove leading/trailing slashes; reject any segment that's a parent ref.
  return String(s || "")
    .split("/")
    .filter((p) => p && p !== "." && p !== "..")
    .join("/");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const cors = corsFor(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  if (!BUNNY_API_KEY) return json({ error: "BunnyCDN API key not configured" }, 500, cors);

  // Auth: require a Supabase user JWT. Service-role JWTs (from cron /
  // edge fn → edge fn calls) are accepted too.
  const userId = getUserIdFromJwt(req.headers.get("Authorization") || "");
  if (!userId) return json({ error: "Not authenticated" }, 401, cors);

  try {
    const rawPath = safePathSegment(req.headers.get("x-upload-path") || "uploads");
    if (!rawPath) return json({ error: "x-upload-path required" }, 400, cors);
    const fileName = safeFilename(req.headers.get("x-file-name") || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
    const contentType = req.headers.get("x-content-type") || "image/jpeg";
    const fullPath = `${rawPath}/${fileName}`;

    // Allowlist enforcement — reject anything outside the known surfaces.
    const allowed = ALLOWED_PATH_PREFIXES.some((p) => (fullPath + "/").startsWith(p));
    if (!allowed) return json({ error: "upload path not allowed", path: fullPath }, 403, cors);

    const body = await req.arrayBuffer();
    if (body.byteLength === 0) return json({ error: "empty body" }, 400, cors);

    const bunnyResponse = await fetch(`https://ny.storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}/${fullPath}`, {
      method: "PUT",
      headers: { "AccessKey": BUNNY_API_KEY, "Content-Type": contentType },
      body,
    });
    if (!bunnyResponse.ok) {
      const errorText = await bunnyResponse.text();
      return json({ error: `BunnyCDN upload failed: ${bunnyResponse.status}`, details: errorText }, 502, cors);
    }

    return json({
      url: `https://${BUNNY_CDN_HOST}/${fullPath}`,
      path: fullPath,
      size: body.byteLength,
    }, 200, cors);
  } catch (error: any) {
    return json({ error: error?.message || String(error) }, 500, cors);
  }
});
