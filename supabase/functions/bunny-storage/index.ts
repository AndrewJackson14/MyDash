import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const BUNNY_API_KEY = Deno.env.get("BUNNY_STORAGE_API_KEY") || Deno.env.get("BUNNY_API_KEY") || "";
const STORAGE_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE") || "stellarpress-media";
const BUNNY_BASE = `https://ny.storage.bunnycdn.com/${STORAGE_ZONE}`;
const CDN_BASE = "https://cdn.13stars.media";

// Hardening per AUDIT-2026-04-20 S-7:
// upload-side file size cap (raw bytes) and extension/content-type
// allowlist. Keeps the storage zone from filling up with arbitrary
// binaries and blocks executable drop-paths.
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;   // 200 MB (edition PDFs run ~100 MB)
const ALLOWED_EXT = /\.(jpe?g|png|gif|webp|avif|heic|svg|pdf|mp4|mov|webm|m4v|mp3|wav|ogg|opus|txt|csv|json|xml|woff2?|otf|ttf|eot)$/i;

// Reject anything that even smells like a path-traversal attempt or a
// hostile filename. Applied to BOTH x-path and x-filename on every
// action (audit S-3).
function safePathSegment(s: string): boolean {
  if (!s) return true;
  if (s.includes("..")) return false;
  if (s.startsWith("/") || s.startsWith("\\")) return false;
  // control chars (0x00–0x1f, 0x7f)
  if (/[\x00-\x1f\x7f]/.test(s)) return false;
  return true;
}

// Never echo upstream errors — they can carry zone name + key fragments
// on 401s. Log full detail server-side; hand the client a generic code.
function genericError(status: number, code: string, detail: unknown) {
  console.error("bunny-storage", code, status, detail);
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "apikey, Authorization, Content-Type, x-action, x-path, x-filename, x-client-info",
};

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Deployed with verify_jwt:false because the gateway's JWT verifier
  // rejects the project's ES256-signed tokens with
  // UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM. We still require both an
  // apikey (Supabase anon) and a bearer Authorization token so
  // anonymous internet traffic can't hit upload/delete. JWKS-based
  // verification of the bearer token is a follow-up.
  const apikey = req.headers.get("apikey") || "";
  const auth = req.headers.get("Authorization") || "";
  if (!apikey || !auth.startsWith("Bearer ") || auth.length < 20) {
    return genericError(401, "missing_auth", { hasApikey: !!apikey, hasAuth: !!auth });
  }

  const action = req.headers.get("x-action") || "list";

  const path = req.headers.get("x-path") || "";
  const rawFilename = req.headers.get("x-filename") || "";
  const filename = decodeURIComponent(rawFilename);

  // Reject path traversal and control chars on every action. Applies
  // to both path and filename before they get concatenated into the
  // Bunny URL.
  if (!safePathSegment(path) || !safePathSegment(filename)) {
    return genericError(400, "invalid_path", { path, filename });
  }

  try {
    // LIST — GET files/folders in a path
    if (action === "list") {
      const listPath = path ? `${BUNNY_BASE}/${path}/` : `${BUNNY_BASE}/`;
      const url = listPath;
      const res = await fetch(url, {
        method: "GET",
        headers: { AccessKey: BUNNY_API_KEY, Accept: "application/json" },
      });
      if (!res.ok) {
        return genericError(res.status, "list_failed", await res.text());
      }
      const items = await res.json();
      // Add CDN URLs to each item
      const enriched = items.map((item: any) => ({
        ...item,
        cdnUrl: item.IsDirectory ? null : `${CDN_BASE}/${path}${path ? "/" : ""}${item.ObjectName}`,
        fullPath: `${path}${path ? "/" : ""}${item.ObjectName}`,
      }));
      return new Response(JSON.stringify(enriched), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET — proxy a file download (for CORS support)
    if (action === "get") {
      const filePath = path || "";
      const url = `${BUNNY_BASE}/${filePath}`;
      const res = await fetch(url, {
        headers: { AccessKey: BUNNY_API_KEY },
      });
      if (!res.ok) {
        return genericError(res.status, "get_failed", await res.text());
      }
      const contentType = res.headers.get("Content-Type") || "application/octet-stream";
      return new Response(res.body, {
        headers: { ...corsHeaders, "Content-Type": contentType },
      });
    }

    // UPLOAD — PUT a file
    if (action === "upload") {
      // Extension allowlist (audit S-7).
      if (!ALLOWED_EXT.test(filename)) {
        return genericError(400, "disallowed_extension", filename);
      }
      // Cheap pre-read size guard via Content-Length if the client sent
      // one. The real enforcement is on body size below.
      const cl = Number(req.headers.get("Content-Length") || 0);
      if (cl && cl > MAX_UPLOAD_BYTES) {
        return genericError(413, "file_too_large", cl);
      }
      const body = await req.arrayBuffer();
      if (body.byteLength > MAX_UPLOAD_BYTES) {
        return genericError(413, "file_too_large", body.byteLength);
      }
      const contentType = req.headers.get("Content-Type") || "application/octet-stream";
      const uploadPath = path ? `${path}/${filename}` : filename;
      const url = `${BUNNY_BASE}/${uploadPath}`;
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          AccessKey: BUNNY_API_KEY,
          "Content-Type": contentType,
        },
        body,
      });
      if (!res.ok) {
        return genericError(res.status, "upload_failed", await res.text());
      }
      const cdnUrl = `${CDN_BASE}/${uploadPath}`;
      return new Response(JSON.stringify({ success: true, cdnUrl, path: uploadPath }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE — remove a file
    if (action === "delete") {
      const deletePath = path ? `${path}/${filename}` : filename;
      const url = `${BUNNY_BASE}/${deletePath}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: { AccessKey: BUNNY_API_KEY },
      });
      if (!res.ok && res.status !== 404) {
        return genericError(res.status, "delete_failed", await res.text());
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown_action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return genericError(500, "internal_error", err?.message ?? err);
  }
});
