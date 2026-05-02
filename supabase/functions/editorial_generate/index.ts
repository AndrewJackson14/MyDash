// ============================================================
// editorial_generate — Story Update Agent (v2)
//
// Two modes:
//
//   in_place (default — existing v1 behavior):
//     Revises the body of the currently-open story. Voice profile
//     resolved from the target story's author_id. story_id required.
//
//   new_draft (v2):
//     Generates revised HTML to seed a brand-new draft from a published
//     source story. The CLIENT performs the actual stories INSERT after
//     the user accepts the preview — this function just returns the
//     revised HTML. Voice profile resolved from the CURRENT USER (the
//     author of the new draft, not the source author). source_story_id
//     required; story_id ignored.
//
// Architecture: direct Edge Function → Anthropic Claude. The
// editorial_check function proxies to a Mac Mini FastAPI; this one
// stands alone.
//
// Env vars (set via `supabase secrets set`):
//   ANTHROPIC_API_KEY         required
//   SUPABASE_URL              auto-set by Supabase
//   SUPABASE_SERVICE_ROLE_KEY auto-set by Supabase
//   ALLOWED_ORIGINS           comma-separated CORS allowlist
//   VOICE_KB_BASE             optional; defaults to GitHub raw of this repo
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = (
  Deno.env.get("ALLOWED_ORIGINS") ||
  "https://mydash.media,http://localhost:5173,http://localhost:4173"
).split(",");

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL") || "";
const SERVICE_ROLE =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SERVICE_ROLE_KEY") || "";

const VOICE_KB_BASE =
  Deno.env.get("VOICE_KB_BASE") ||
  "https://raw.githubusercontent.com/AndrewJackson14/MyDash/main/docs/knowledge-base/voices";

const VOICE_PROFILE_SLUGS = new Set([
  "camille-devaul",
  "hayley-mattson",
  "nic-mattson",
]);

const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_MAX_TOKENS = 8000;
const ANTHROPIC_TIMEOUT_MS = 90_000;


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

async function sbSelect(table: string, query: string): Promise<any[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      "apikey":        SERVICE_ROLE,
      "Authorization": `Bearer ${SERVICE_ROLE}`,
      "Accept":        "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`supabase ${res.status}: ${await res.text()}`);
  }
  return await res.json();
}

async function fetchVoiceProfile(slug: string): Promise<string> {
  try {
    const res = await fetch(`${VOICE_KB_BASE}/${slug}.md`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return "";
    const text = await res.text();
    if (text.startsWith("---")) {
      const end = text.indexOf("\n---", 3);
      if (end >= 0) return text.slice(end + 4).replace(/^\n+/, "");
    }
    return text;
  } catch {
    return "";
  }
}

function buildPrompt(opts: {
  sourceBodyHtml: string;
  updatesText: string;
  authorName: string;
  voiceProfile: string;
  hasNamedVoice: boolean;
}): string {
  const { sourceBodyHtml, updatesText, authorName, voiceProfile, hasNamedVoice } = opts;

  const voiceBlock = hasNamedVoice && voiceProfile
    ? `\n## VOICE PROFILE — ${authorName}\n\n${voiceProfile}\n\nWrite in this author's voice. Match cadence, vocabulary, and structural habits.`
    : voiceProfile
      ? `\n## DEFAULT VOICE GUIDANCE\n\n${voiceProfile}\n\nMatch the tone of the source body above. Don't impose a personality the source doesn't already have.`
      : `\nMatch the tone of the source body above. Don't impose a personality the source doesn't already have.`;

  return `You are a newsroom editor revising a previously published story for a new event cycle.

## YOUR TASK

Take the source body below and produce an updated version that folds in the new facts. Keep the same structure, lede style, paragraph rhythm, and section ordering as the source. Update only what the new facts require: dates, times, names, quotes, year references, locations, and any factual details the new info contradicts.

Output **HTML only** — no markdown, no preamble, no explanatory commentary. Use the same HTML element vocabulary as the source (typically <p>, <h2>, <h3>, <em>, <strong>, <a>, <ul>, <ol>, <li>). If the source has a pull quote or callout structure, preserve it.

## SOURCE BODY

\`\`\`html
${sourceBodyHtml}
\`\`\`

## NEW FACTS TO INCORPORATE

${updatesText}
${voiceBlock}

## RULES

- Replace stale dates and years throughout. If the source said "2025" and the new event is 2026, update every occurrence.
- Replace stale quotes with new ones if provided. If a new quote replaces an old one, drop the old one — don't keep both unless explicitly told to.
- Preserve quoted speakers' titles and identifying parentheticals on their first mention (e.g. "Mayor Heather Moreno"), even if the quote text changes.
- Where the source mentions a name or detail the new facts don't contradict, keep it as-is.
- Do not invent details. If the new facts are silent on something the source covered, keep the source's version. If the source is silent and the new facts add something, add it.
- Do not include the title in the body — only the article body.
- Do not include a byline in the body.

Output the revised HTML body now, nothing else:`;
}

async function callClaude(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      ANTHROPIC_MODEL,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        messages: [
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`anthropic ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const block = (data?.content || []).find((b: any) => b?.type === "text");
    const text = String(block?.text || "").trim();

    return text
      .replace(/^```(?:html)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
  } finally {
    clearTimeout(timeoutId);
  }
}


Deno.serve(async (req: Request) => {
  const cors = corsFor(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST")    return json({ error: "method_not_allowed" }, 405, cors);

  const userId = authedUserId(req.headers.get("Authorization") || "");
  if (!userId) return json({ error: "not_authenticated" }, 401, cors);

  if (!ANTHROPIC_API_KEY) {
    return json({
      error:  "server_misconfigured",
      detail: "ANTHROPIC_API_KEY not set",
    }, 500, cors);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({
      error:  "server_misconfigured",
      detail: "SUPABASE_URL or SERVICE_ROLE_KEY not set",
    }, 500, cors);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400, cors);
  }

  // Mode defaults to in_place for backward compatibility with v1 callers.
  const mode = body?.mode === "new_draft" ? "new_draft" : "in_place";

  // story_id required for in_place; source_story_id required for new_draft.
  if (mode === "in_place") {
    if (!body?.story_id || typeof body.story_id !== "string") {
      return json({ error: "story_id_required" }, 400, cors);
    }
  } else {
    if (!body?.source_story_id || typeof body.source_story_id !== "string") {
      return json({ error: "source_story_id_required" }, 400, cors);
    }
  }

  if (typeof body.source_body !== "string" || body.source_body.trim().length < 50) {
    return json({ error: "source_body_required", detail: "Source body must be at least 50 characters." }, 400, cors);
  }
  if (body.source_body.length > 100_000) {
    return json({ error: "source_body_too_long", max: 100_000 }, 400, cors);
  }
  if (typeof body.updates_text !== "string" || body.updates_text.trim().length === 0) {
    return json({ error: "updates_text_required" }, 400, cors);
  }
  if (body.updates_text.length > 10_000) {
    return json({ error: "updates_text_too_long", max: 10_000 }, 400, cors);
  }

  // Permission check: Content Editor / Publisher / admin only.
  let viewerRole = "";
  let viewerIsAdmin = false;
  let viewerPersonId: string | null = null;
  try {
    const viewer = await sbSelect("people", `auth_id=eq.${userId}&select=id,role,permissions,global_role`);
    if (viewer.length === 0) {
      return json({ error: "no_people_row" }, 403, cors);
    }
    viewerRole = viewer[0].role || "";
    viewerIsAdmin = (viewer[0].permissions || []).includes?.("admin")
      || viewer[0].global_role === "super_admin";
    viewerPersonId = viewer[0].id || null;
  } catch (e: any) {
    return json({ error: "viewer_lookup_failed", detail: e?.message }, 500, cors);
  }
  const ALLOWED_ROLES = new Set(["Publisher", "Support Admin", "Content Editor", "Editor-in-Chief", "Managing Editor"]);
  if (!viewerIsAdmin && !ALLOWED_ROLES.has(viewerRole)) {
    return json({ error: "permission_denied", role: viewerRole }, 403, cors);
  }

  // ── Resolve author voice profile ──
  // in_place: voice from the current story's author_id.
  // new_draft: voice from the current user (they'll be the new draft's author).
  let voiceProfile = "";
  let hasNamedVoice = false;
  let authorName = "";
  let voiceSlug: string | null = null;

  try {
    let authorPerson: any = null;

    if (mode === "new_draft") {
      // Re-query so we get display_name + slug + labels (the permission
      // query above only fetched id/role/permissions/global_role).
      if (viewerPersonId) {
        const rows = await sbSelect("people", `id=eq.${viewerPersonId}&select=display_name,slug,labels,status`);
        authorPerson = rows[0] || null;
      }
    } else {
      const targetRows = await sbSelect("stories", `id=eq.${body.story_id}&select=author_id,author`);
      const targetAuthorId = targetRows[0]?.author_id || null;
      authorName = targetRows[0]?.author || "";
      if (targetAuthorId) {
        const people = await sbSelect("people", `id=eq.${targetAuthorId}&select=display_name,slug,labels,status`);
        authorPerson = people[0] || null;
      }
    }

    if (authorPerson) {
      if (!authorName) authorName = authorPerson.display_name || "";
      const labels: string[] = Array.isArray(authorPerson.labels) ? authorPerson.labels : [];
      const isWireOrBot = labels.includes("wire") || labels.includes("bot");
      if (!isWireOrBot && authorPerson.slug && VOICE_PROFILE_SLUGS.has(authorPerson.slug)) {
        voiceProfile = await fetchVoiceProfile(authorPerson.slug);
        if (voiceProfile) {
          hasNamedVoice = true;
          voiceSlug = authorPerson.slug;
        }
      }
    }

    // Fallback: generic voice guidance from _default.md.
    if (!voiceProfile) {
      voiceProfile = await fetchVoiceProfile("_default");
    }
  } catch {
    // Non-fatal — generation can proceed without voice guidance.
  }

  // ── Build prompt + call Claude ──
  const prompt = buildPrompt({
    sourceBodyHtml: body.source_body,
    updatesText:    body.updates_text.trim(),
    authorName:     authorName || "the author",
    voiceProfile,
    hasNamedVoice,
  });

  let revisedHtml = "";
  try {
    revisedHtml = await callClaude(prompt);
  } catch (e: any) {
    if (e?.name === "AbortError") {
      return json({ error: "upstream_timeout" }, 504, cors);
    }
    return json({ error: "llm_call_failed", detail: e?.message || String(e) }, 502, cors);
  }

  if (!revisedHtml || revisedHtml.length < 50) {
    return json({ error: "empty_response" }, 502, cors);
  }

  return json({
    revised_html:       revisedHtml,
    voice_profile_used: hasNamedVoice ? "named" : (voiceProfile ? "default" : "none"),
    voice_profile_slug: voiceSlug,
    model:              ANTHROPIC_MODEL,
  }, 200, cors);
});
