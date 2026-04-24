// ============================================================
// ai-proxy — minimal proxy to Anthropic. Requires authenticated
// caller (was open; cost-DoS via key drain). CORS locked to
// production origin.
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://mydash.media,http://localhost:5173,http://localhost:4173").split(",");

function corsFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function authedUserId(authHeader: string): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const payload = JSON.parse(atob(authHeader.slice(7).split(".")[1]));
    if (!payload?.sub) return null;
    if (payload.role !== "authenticated" && payload.role !== "service_role") return null;
    return String(payload.sub);
  } catch { return null; }
}
function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
  if (!authedUserId(req.headers.get("Authorization") || "")) return json({ error: "Not authenticated" }, 401, cors);

  try {
    const { system, prompt, max_tokens } = await req.json();
    if (!system || !prompt) return json({ error: "system and prompt are required" }, 400, cors);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500, cors);

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: Math.min(Number(max_tokens) || 1024, 4096),
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      return json({ error: `Anthropic API error: ${anthropicRes.status} ${err}` }, 502, cors);
    }
    const result = await anthropicRes.json();
    const text = result.content?.[0]?.text || "";
    return json({ text }, 200, cors);
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500, cors);
  }
});
