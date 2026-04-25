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
import { supabase, EDGE_FN_URL } from "../lib/supabase";

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
    const res = await fetch(`${EDGE_FN_URL}/driver-auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", magic_token: magicToken, pin }),
    });
    const json = await res.json();
    if (!res.ok || !json.jwt) {
      return { ok: false, error: json.error, attempts_remaining: json.attempts_remaining, message: json.message };
    }
    const next = {
      jwt: json.jwt,
      driver_id: json.driver_id,
      exp: Math.floor(Date.now() / 1000) + (json.expires_in || 8 * 3600),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    await supabase.auth.setSession({ access_token: next.jwt, refresh_token: "driver-no-refresh" });
    setAuth(next);
    return { ok: true };
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
    signOut,
  };
}
