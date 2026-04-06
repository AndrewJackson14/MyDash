import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const BUNNY_API_KEY = Deno.env.get("BUNNY_STORAGE_API_KEY") || Deno.env.get("BUNNY_API_KEY") || "";
const STORAGE_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE") || "stellarpress-media";
const BUNNY_BASE = `https://storage.bunnycdn.com/${STORAGE_ZONE}`;
const CDN_BASE = "https://cdn.13stars.media";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-action, x-path, x-filename",
};

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const action = req.headers.get("x-action") || "list";
  const path = req.headers.get("x-path") || "";
  const filename = req.headers.get("x-filename") || "";

  try {
    // LIST — GET files/folders in a path
    if (action === "list") {
      const url = `${BUNNY_BASE}/${path}${path && !path.endsWith("/") ? "/" : ""}`;
      console.log("BunnyCDN LIST:", url, "zone:", STORAGE_ZONE, "keyLen:", BUNNY_API_KEY.length);
      const res = await fetch(url, {
        method: "GET",
        headers: { AccessKey: BUNNY_API_KEY, Accept: "application/json" },
      });
      if (!res.ok) {
        const text = await res.text();
        return new Response(JSON.stringify({ error: `BunnyCDN list error: ${res.status}`, detail: text }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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

    // UPLOAD — PUT a file
    if (action === "upload") {
      const body = await req.arrayBuffer();
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
        const text = await res.text();
        return new Response(JSON.stringify({ error: `Upload failed: ${res.status}`, detail: text }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
        const text = await res.text();
        return new Response(JSON.stringify({ error: `Delete failed: ${res.status}`, detail: text }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action: " + action }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
