// /setup/complete?token=<uuid> — magic-link landing.
//
// Supabase's detectSessionInUrl extracts the access_token from the URL
// hash and writes the session to localStorage; we then call
// complete_portal_setup(p_token) to bind the auth user to the
// matching client_contacts rows and resolve the active client slug.
//
// Spec: client-portal-spec.md.md §5.3.
//
// Auth-state race: the magic-link landing arrives before
// detectSessionInUrl finishes. We listen for the `SIGNED_IN` event
// AND poll getSession() so we redeem as soon as either path resolves.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { sx, C } from "../lib/portalUi";

const ACTIVE_SLUG_KEY = "mydash:active_client_slug";

export default function SetupComplete() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");
  const redeemedRef = useRef(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) { setError("missing_token"); return; }

    // The redemption races: getSession() may return null on first
    // call before detectSessionInUrl has run. Guard with a single-fire
    // ref so the listener and the manual check don't double-call.
    const tryRedeem = async () => {
      if (redeemedRef.current) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      redeemedRef.current = true;
      const { data, error: rpcErr } = await supabase.rpc("complete_portal_setup", {
        p_token: token,
      });
      if (rpcErr) { setError(rpcErr.message || "redemption_failed"); return; }
      if (data?.active_client_slug) {
        try { localStorage.setItem(ACTIVE_SLUG_KEY, data.active_client_slug); } catch {}
        nav(`/c/${data.active_client_slug}/home`, { replace: true });
      } else {
        // Fallback: no slug came back — drop them at /login which
        // will resolve their first available client.
        nav("/login", { replace: true });
      }
    };

    // Listen first (covers the case where Supabase resolves the URL
    // hash *after* this effect runs).
    const { data: sub } = supabase.auth.onAuthStateChange((evt) => {
      if (evt === "SIGNED_IN" || evt === "INITIAL_SESSION") tryRedeem();
    });
    // Also call once now in case detectSessionInUrl already finished.
    tryRedeem();

    // Hard timeout — if nothing resolves in 8s, surface an error.
    const t = setTimeout(() => {
      if (!redeemedRef.current) setError("not_authenticated");
    }, 8000);

    return () => { sub?.subscription?.unsubscribe?.(); clearTimeout(t); };
  }, [token, nav]);

  if (!error) {
    return <div style={sx.page}><div style={{ color: C.muted }}>Finishing setup…</div></div>;
  }

  const isExpired   = ["token_not_found", "token_expired", "token_already_consumed"].includes(error);
  const isMismatch  = error === "email_mismatch";
  const isMissing   = error === "missing_token";
  const isNotAuthed = error === "not_authenticated";

  return (
    <div style={sx.page}>
      <div style={sx.card}>
        <div style={sx.brand}>13 STARS MEDIA · CUSTOMER PORTAL</div>
        <div style={sx.h1}>
          {isMissing   ? "Invalid link"
          : isExpired  ? "Link expired"
          : isMismatch ? "Email mismatch"
          : isNotAuthed ? "Sign-in needed"
          : "Setup failed"}
        </div>
        <div style={sx.sub}>
          {isMissing   ? "This setup link is missing its token. Request a new one below."
          : isExpired  ? "This sign-in link is no longer valid. Request a fresh one and we'll send you a new email."
          : isMismatch ? "The email you signed in with doesn't match the one this link was sent to. Sign out and try again with the original email."
          : isNotAuthed ? "We couldn't read your sign-in. Please request a new link."
          : "We hit an unexpected error. Try requesting a new link."}
        </div>
        {isMismatch ? (
          <button
            style={sx.btn(false)}
            onClick={async () => { await supabase.auth.signOut(); nav("/setup", { replace: true }); }}
          >
            Sign out and try again
          </button>
        ) : (
          <a style={{ ...sx.btn(false), display: "block", textAlign: "center", textDecoration: "none" }} href="/setup">
            Request a new link
          </a>
        )}
      </div>
    </div>
  );
}
