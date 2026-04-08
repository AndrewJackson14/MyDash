import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const BUNNY_STORAGE_ZONE = Deno.env.get("BUNNY_STORAGE_ZONE") || "stellarpress-media";
const BUNNY_API_KEY = Deno.env.get("BUNNY_STORAGE_API_KEY") || Deno.env.get("BUNNY_API_KEY") || "";
const BUNNY_CDN_HOST = Deno.env.get("BUNNY_CDN_HOST") || "cdn.13stars.media";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-upload-path, x-file-name, x-content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
Deno.serve(async (req)=>{
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({
      error: "Method not allowed"
    }), {
      status: 405,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
  if (!BUNNY_API_KEY) {
    return new Response(JSON.stringify({
      error: "BunnyCDN API key not configured"
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
  try {
    const uploadPath = req.headers.get("x-upload-path") || "uploads";
    const fileName = req.headers.get("x-file-name") || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const contentType = req.headers.get("x-content-type") || "image/jpeg";
    const fullPath = `${uploadPath}/${fileName}`;
    const body = await req.arrayBuffer();
    // Upload to BunnyCDN Storage
    const bunnyResponse = await fetch(`https://ny.storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}/${fullPath}`, {
      method: "PUT",
      headers: {
        "AccessKey": BUNNY_API_KEY,
        "Content-Type": contentType
      },
      body: body
    });
    if (!bunnyResponse.ok) {
      const errorText = await bunnyResponse.text();
      return new Response(JSON.stringify({
        error: `BunnyCDN upload failed: ${bunnyResponse.status}`,
        details: errorText
      }), {
        status: 502,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const cdnUrl = `https://${BUNNY_CDN_HOST}/${fullPath}`;
    return new Response(JSON.stringify({
      url: cdnUrl,
      path: fullPath,
      size: body.byteLength
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
