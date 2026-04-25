// ============================================================
// driver-auth — magic-link + PIN auth for non-staff drivers.
//
// Two actions:
//
//   action: "issue"
//     Caller: authenticated team_member (Cami clicking Send Magic Link)
//     Body:   { action: "issue", driver_id: UUID }
//     Effect: generate 32-char magic_token + 6-digit PIN, hash PIN,
//             INSERT driver_sessions row (8h expiry). If Twilio creds
//             are configured + driver has SMS consent, send the SMS;
//             else skip (return PIN to Cami's screen for manual delivery).
//     Reply:  { magic_link, pin, sms_sent: boolean, reason? }
//
//   action: "verify"
//     Caller: anonymous (driver doesn't have JWT yet)
//     Body:   { action: "verify", magic_token: string, pin: string }
//     Effect: look up session by token, compare PIN. On 5 wrong attempts
//             the session locks. On success, sign a Supabase-compatible
//             JWT with role='authenticated' + custom driver_id claim,
//             using the ambient SUPABASE_JWT_SECRET. Return JWT.
//     Reply:  { jwt, driver_id, expires_in } | { error, attempts_remaining? }
//
// Critical: the JWT MUST be signed with SUPABASE_JWT_SECRET (HS256)
// — Supabase's PostgREST verifies every incoming JWT against that key.
// A separately-generated DRIVER_JWT_SECRET would 401 every driver
// API call. This is the gotcha spec v1.1 §0.4 calls out in bold.
//
// PIN hashing: HMAC-SHA256(magic_token, pin). The magic_token is
// session-scoped 128-bit random, sufficient salt; bcrypt-level cost
// isn't needed because the PIN is short-lived (8h max), 5-attempt
// locked, and the magic_token itself is the primary secret.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// JWT_SECRET (no SUPABASE_ prefix — Supabase reserves that prefix for
// ambient secrets and rejects manual ones starting with it). Fallback
// reads kept for any existing deployments that already used the prefix.
const JWT_SECRET = Deno.env.get("JWT_SECRET")
  || Deno.env.get("SUPABASE_JWT_SECRET")
  || "";
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const TWILIO_FROM = Deno.env.get("TWILIO_FROM_NUMBER") || "";
const PUBLIC_APP_URL = Deno.env.get("PUBLIC_APP_URL") || "https://mydash.media";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://mydash.media,http://localhost:5173,http://localhost:4173").split(",");

const SESSION_TTL_HOURS = 8;
const MAX_PIN_ATTEMPTS = 5;

function corsFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ── Auth helpers ────────────────────────────────────────────────
function authedRole(authHeader: string): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const payload = JSON.parse(atob(authHeader.slice(7).split(".")[1]));
    return payload.role || null;
  } catch { return null; }
}

// ── Crypto ──────────────────────────────────────────────────────
function genMagicToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
function genPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
async function hashPin(pin: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(salt), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(pin));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// Constant-time compare to avoid timing leaks on PIN verification.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── JWT signing (HS256, Supabase-compatible) ────────────────────
function b64url(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlBytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function signSupabaseJwt(driverId: string): Promise<{ jwt: string; exp: number }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + SESSION_TTL_HOURS * 3600;
  const header = { alg: "HS256", typ: "JWT" };
  // Supabase RLS only fires when role='authenticated' (or service_role).
  // The custom driver_id claim is what migration 127 policies read.
  const payload = {
    iss: "supabase",
    sub: driverId,                  // PostgREST will set auth.uid() from this
    role: "authenticated",
    aud: "authenticated",
    iat: now,
    exp,
    driver_id: driverId,            // RLS gate: current_setting('request.jwt.claims', true)::json->>'driver_id'
  };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"],
  );
  const sigBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  return { jwt: `${data}.${b64urlBytes(sigBytes)}`, exp };
}

// ── Twilio ──────────────────────────────────────────────────────
async function sendTwilioSms(to: string, body: string): Promise<{ ok: boolean; reason?: string }> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
    return { ok: false, reason: "twilio_not_configured" };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const params = new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, reason: `twilio_${res.status}: ${text.slice(0, 160)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `twilio_fetch_failed: ${String(e?.message ?? e).slice(0, 160)}` };
  }
}

// ── Main handler ────────────────────────────────────────────────
serve(async (req) => {
  const cors = corsFor(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, cors);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400, cors); }

  const action = body?.action;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── ISSUE ──────────────────────────────────────────────────
  if (action === "issue") {
    // Staff JWT (or service_role for cron-resend later).
    const role = authedRole(req.headers.get("Authorization") || "");
    if (role !== "authenticated" && role !== "service_role") {
      return json({ error: "Not authenticated" }, 401, cors);
    }
    const driverId = body.driver_id;
    if (!driverId) return json({ error: "driver_id required" }, 400, cors);

    const { data: driver, error: dErr } = await admin
      .from("drivers")
      .select("id, name, sms_phone, phone, sms_consent_at, is_active")
      .eq("id", driverId).single();
    if (dErr || !driver) return json({ error: "Driver not found" }, 404, cors);
    if (driver.is_active === false) return json({ error: "Driver is deactivated" }, 400, cors);
    const phone = driver.sms_phone || driver.phone || "";
    if (!phone) return json({ error: "Driver has no phone on file" }, 400, cors);

    const magicToken = genMagicToken();
    const pin = genPin();
    const pinHash = await hashPin(pin, magicToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000).toISOString();

    const { error: sessErr } = await admin.from("driver_sessions").insert({
      driver_id: driverId,
      magic_token: magicToken,
      pin_hash: pinHash,
      pin_attempts: 0,
      expires_at: expiresAt,
    });
    if (sessErr) return json({ error: sessErr.message }, 500, cors);

    const magicLink = `${PUBLIC_APP_URL}/driver/auth/${magicToken}`;
    const smsBody = `13 Stars: Tap to start your route ${magicLink}\nYour PIN: ${pin}`;

    let smsSent = false;
    let smsReason: string | undefined;
    if (driver.sms_consent_at) {
      const r = await sendTwilioSms(phone, smsBody);
      smsSent = r.ok;
      smsReason = r.reason;
    } else {
      smsReason = "no_sms_consent";
    }

    return json({
      magic_link: magicLink,
      pin,                  // Returned to Cami's screen so she can read it manually if SMS fails
      sms_sent: smsSent,
      reason: smsReason,
      expires_at: expiresAt,
    }, 200, cors);
  }

  // ── VERIFY ─────────────────────────────────────────────────
  if (action === "verify") {
    // Anonymous — driver doesn't have a JWT yet.
    const { magic_token, pin } = body;
    if (!magic_token || !pin) return json({ error: "magic_token + pin required" }, 400, cors);

    const { data: session } = await admin
      .from("driver_sessions")
      .select("id, driver_id, magic_token, pin_hash, pin_attempts, expires_at, verified_at")
      .eq("magic_token", magic_token)
      .maybeSingle();
    if (!session) return json({ error: "invalid_token" }, 400, cors);

    if (new Date(session.expires_at) < new Date()) {
      return json({ error: "expired" }, 410, cors);
    }
    if (session.pin_attempts >= MAX_PIN_ATTEMPTS) {
      return json({ error: "locked", message: "Too many wrong attempts. Call Cami." }, 403, cors);
    }
    if (session.verified_at) {
      // Reject re-use of a previously-verified session: forces fresh
      // magic-link issuance, which is the intended one-shot semantic.
      return json({ error: "already_used" }, 400, cors);
    }

    const expectedHash = await hashPin(String(pin), session.magic_token);
    if (!safeEqual(expectedHash, session.pin_hash)) {
      const newAttempts = session.pin_attempts + 1;
      await admin.from("driver_sessions").update({ pin_attempts: newAttempts }).eq("id", session.id);
      return json({
        error: "wrong_pin",
        attempts_remaining: Math.max(0, MAX_PIN_ATTEMPTS - newAttempts),
      }, 401, cors);
    }

    // PIN matches: stamp verified_at + sign JWT.
    await admin.from("driver_sessions").update({
      verified_at: new Date().toISOString(),
      ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      user_agent: req.headers.get("user-agent") || null,
    }).eq("id", session.id);

    if (!JWT_SECRET) {
      // Surface a clean diagnostic instead of a 500 from crypto.subtle.
      return json({
        error: "jwt_sign_failed",
        detail: "JWT_SECRET (or legacy SUPABASE_JWT_SECRET) not set in Edge Function secrets. Get it from Supabase Dashboard → Settings → API → JWT Secret, then add it as an Edge Function secret named JWT_SECRET (no SUPABASE_ prefix — that's reserved).",
      }, 500, cors);
    }
    let jwt: string, exp: number;
    try {
      ({ jwt, exp } = await signSupabaseJwt(session.driver_id));
    } catch (e) {
      return json({
        error: "jwt_sign_failed",
        detail: String(e?.message ?? e),
      }, 500, cors);
    }
    return json({
      jwt,
      driver_id: session.driver_id,
      expires_in: exp - Math.floor(Date.now() / 1000),
    }, 200, cors);
  }

  return json({ error: "unknown_action" }, 400, cors);
});
