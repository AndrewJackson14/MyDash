// useDriverAuth — manages the driver app's auth state.
//
// Storage: localStorage key 'driver_auth_v1' holds {jwt, driver_id,
// exp}. JWT comes back from /functions/v1/driver-auth verify;
// supabase.auth.setSession() makes the same instance use it for all
// subsequent reads/writes (RLS policies in migration 127 see the
// driver_id custom claim).
//
// Lifecycle:
//   - bootstrap: on mount, read localStorage, if present + not
//     expired, call supabase.auth.setSession(jwt). The session sticks
//     for the lifetime of this supabase instance.
//   - verify: takes magic_token + pin, calls driver-auth, on success
//     stores + sets the session.
//   - signOut: clears localStorage + supabase.auth.signOut().
//
// The driver-app shell uses isAuthed to gate route rendering.
import { useState, useEffect, useCallback } from "react";
import { supabase, EDGE_FN_URL, SUPABASE_ANON_KEY } from "../lib/supabase";

// Anonymous calls (verify, self_issue) still need the anon key in the
// Authorization + apikey headers — the Supabase API gateway rejects any
// /functions/v1 request that doesn't carry one, before the function
// even runs. Anon key is a public key, safe to ship in client code.
const ANON_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_ANON_KEY,
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
};

const STORAGE_KEY = "driver_auth_v1";

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.jwt || !obj.driver_id || !obj.exp) return null;
    if (obj.exp * 1000 < Date.now()) return null; // expired
    return obj;
  } catch { return null; }
}

export function useDriverAuth() {
  const [auth, setAuth] = useState(() => loadStored());
  const [bootstrapped, setBootstrapped] = useState(false);

  // Set the supabase session on mount if we have a stored JWT. The
  // refresh_token slot is just a placeholder — we never refresh; the
  // driver re-PINs after 8h.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (auth) {
        try {
          await supabase.auth.setSession({ access_token: auth.jwt, refresh_token: "driver-no-refresh" });
        } catch (e) {
          console.warn("driver auth: failed to set supabase session", e);
        }
      }
      if (!cancelled) setBootstrapped(true);
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const verify = useCallback(async (magicToken, pin) => {
    // Defensive shape: any thrown error along the way returns
    // { ok: false, error } so the caller's setSubmitting(false) always
    // runs. Without this, a non-JSON 500 body (e.g. "Internal Server
    // Error") used to throw at res.json() and leave the UI stuck on
    // "Verifying…".
    try {
      const res = await fetch(`${EDGE_FN_URL}/driver-auth`, {
        method: "POST",
        headers: ANON_HEADERS,
        body: JSON.stringify({ action: "verify", magic_token: magicToken, pin }),
      });
      let json;
      try { json = await res.json(); }
      catch { return { ok: false, error: `server_${res.status}`, message: `Server returned ${res.status} with no JSON body` }; }
      if (!res.ok || !json.jwt) {
        return {
          ok: false, error: json.error,
          attempts_remaining: json.attempts_remaining,
          message: json.message || json.detail,
        };
      }
      const next = {
        jwt: json.jwt,
        driver_id: json.driver_id,
        exp: Math.floor(Date.now() / 1000) + (json.expires_in || 8 * 3600),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      try {
        await supabase.auth.setSession({ access_token: next.jwt, refresh_token: "driver-no-refresh" });
      } catch (e) {
        // Supabase rejected the JWT — usually means the signing secret
        // is wrong. Don't leave the UI hanging; surface the error.
        localStorage.removeItem(STORAGE_KEY);
        return { ok: false, error: "session_set_failed", message: String(e?.message ?? e) };
      }
      setAuth(next);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: "network_error", message: String(e?.message ?? e) };
    }
  }, []);

  const selfIssue = useCallback(async (email) => {
    try {
      const res = await fetch(`${EDGE_FN_URL}/driver-auth`, {
        method: "POST",
        headers: ANON_HEADERS,
        body: JSON.stringify({ action: "self_issue", email }),
      });
      let json;
      try { json = await res.json(); }
      catch { return { ok: false, error: `server_${res.status}`, message: `Server returned ${res.status}` }; }
      if (!res.ok) {
        return { ok: false, error: json.error, message: json.message || json.detail };
      }
      return { ok: true, message: json.message };
    } catch (e) {
      return { ok: false, error: "network_error", message: String(e?.message ?? e) };
    }
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem(STORAGE_KEY);
    try { await supabase.auth.signOut(); } catch { /* ok */ }
    setAuth(null);
  }, []);

  return {
    bootstrapped,
    isAuthed: !!auth,
    driverId: auth?.driver_id || null,
    expiresAt: auth?.exp || null,
    verify,
    selfIssue,
    signOut,
  };
}
