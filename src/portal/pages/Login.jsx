// /login — magic-link primary, password collapsed-by-default.
// Spec: client-portal-spec.md.md §5.1.
//
// If the user already has an active session, this page short-circuits
// to /c/<slug>/home where slug is resolved from their first non-revoked
// client_contacts row. The portal_clients_read RLS policy lets us
// query clients for that slug.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { sx, C, isValidEmail } from "../lib/portalUi";

export default function Login() {
  const nav = useNavigate();
  const [email,         setEmail]         = useState("");
  const [password,      setPassword]      = useState("");
  const [showPwd,       setShowPwd]       = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [sentTo,        setSentTo]        = useState(null);
  const [error,         setError]         = useState(null);
  const [resolvingAuth, setResolvingAuth] = useState(true);

  // If already signed in, jump straight to the user's home.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) { setResolvingAuth(false); return; }
      const slug = await resolveActiveClientSlug();
      if (cancelled) return;
      if (slug) nav(`/c/${slug}/home`, { replace: true });
      else      setResolvingAuth(false);
    })();
    return () => { cancelled = true; };
  }, [nav]);

  const sendMagicLink = async () => {
    setError(null);
    if (!isValidEmail(email)) { setError("Please enter a valid email."); return; }
    setSubmitting(true);
    const redirectTo = `${window.location.origin}/setup/complete`;
    const { error: e } = await supabase.auth.signInWithOtp({
      email: email.trim(), options: { emailRedirectTo: redirectTo },
    });
    setSubmitting(false);
    if (e) { setError(e.message || "Couldn't send the sign-in link. Try again."); return; }
    setSentTo(email.trim());
  };

  const signInWithPassword = async () => {
    setError(null);
    if (!isValidEmail(email)) { setError("Please enter a valid email."); return; }
    if (!password)            { setError("Enter your password."); return; }
    setSubmitting(true);
    const { error: e } = await supabase.auth.signInWithPassword({
      email: email.trim(), password,
    });
    setSubmitting(false);
    if (e) { setError(e.message || "Sign-in failed."); return; }
    const slug = await resolveActiveClientSlug();
    nav(slug ? `/c/${slug}/home` : "/setup", { replace: true });
  };

  if (resolvingAuth) {
    return <div style={sx.page}><div style={{ color: C.muted }}>Loading…</div></div>;
  }

  if (sentTo) {
    return (
      <div style={sx.page}>
        <div style={sx.card}>
          <div style={sx.brand}>13 STARS MEDIA · CUSTOMER PORTAL</div>
          <div style={sx.h1}>Check your email</div>
          <div style={sx.sub}>
            We sent a sign-in link to <strong style={{ color: C.ink }}>{sentTo}</strong>.
            Click it to continue.
          </div>
          <button style={sx.btnGhost} onClick={() => { setSentTo(null); setEmail(""); }}>
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={sx.page}>
      <div style={sx.card}>
        <div style={sx.brand}>13 STARS MEDIA · CUSTOMER PORTAL</div>
        <div style={sx.h1}>Sign in to your account</div>
        <div style={sx.sub}>We'll email you a one-time sign-in link.</div>

        {error && <div style={sx.err}>{error}</div>}

        <label style={sx.label}>Email</label>
        <input
          type="email" value={email} autoFocus autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (showPwd ? signInWithPassword() : sendMagicLink())}
          style={{ ...sx.input, marginBottom: 16 }}
          placeholder="you@example.com"
        />

        {!showPwd ? (
          <>
            <button
              style={sx.btn(submitting || !email)}
              disabled={submitting || !email}
              onClick={sendMagicLink}
            >
              {submitting ? "Sending…" : "Send sign-in link"}
            </button>
            <button
              style={{ ...sx.link, display: "block", margin: "16px auto 0" }}
              onClick={() => setShowPwd(true)}
            >
              or sign in with password
            </button>
          </>
        ) : (
          <>
            <label style={sx.label}>Password</label>
            <input
              type="password" value={password} autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && signInWithPassword()}
              style={{ ...sx.input, marginBottom: 16 }}
            />
            <button
              style={sx.btn(submitting || !email || !password)}
              disabled={submitting || !email || !password}
              onClick={signInWithPassword}
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <button style={sx.link} onClick={() => setShowPwd(false)}>
                ← magic link
              </button>
              <button style={sx.link} onClick={() => { setShowPwd(false); sendMagicLink(); }}>
                Forgot password?
              </button>
            </div>
          </>
        )}

        <div style={sx.footer}>
          New here? <a href="https://13stars.media" style={sx.link} rel="noopener">
            Browse our publications →
          </a>
        </div>
      </div>
    </div>
  );
}

// Returns the slug of any client this auth user is an active contact at.
// First-active wins; the home page handles full multi-client picker.
//
// Filtering by auth_user_id explicitly: RLS would already permit only
// rows at clients we can access, but a single contact-row per
// (auth_user_id, client_id) means we want OUR row, not a co-worker's
// row at the same client.
async function resolveActiveClientSlug() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;
  const { data, error } = await supabase
    .from("client_contacts")
    .select("client_id, clients(slug)")
    .eq("auth_user_id", session.user.id)
    .is("portal_revoked_at", null)
    .limit(1);
  if (error || !data?.length) return null;
  return data[0]?.clients?.slug || null;
}
