// /setup — public token-redemption landing for users who don't yet
// have an active session. Calls request_portal_setup_link RPC + the
// send-portal-setup-email Edge Function, then redirects to /setup/sent.
//
// Spec: client-portal-spec.md.md §5.2.
//
// Email-enumeration note: request_portal_setup_link returns
// {success:true, eligible:false} for unknown emails so the UI shows
// "check your email" regardless of whether a contact exists. We only
// invoke send-portal-setup-email when eligible:true.
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { sx, C, isValidEmail } from "../lib/portalUi";

export default function Setup() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const prefilled = params.get("intake_email") || "";
  const [email,      setEmail]      = useState(prefilled);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);

  // If the user is already signed in, /setup makes no sense; bounce
  // them to /login (which will hand off to /c/<slug>/home).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled && session) nav("/login", { replace: true });
    })();
    return () => { cancelled = true; };
  }, [nav]);

  const submit = async () => {
    setError(null);
    const e = email.trim().toLowerCase();
    if (!isValidEmail(e)) { setError("Please enter a valid email."); return; }
    setSubmitting(true);

    // Issue (or refresh) a portal_setup_token for this email.
    const { data, error: rpcErr } = await supabase.rpc("request_portal_setup_link", { p_email: e });
    if (rpcErr) {
      setSubmitting(false);
      setError(rpcErr.message || "Something went wrong. Try again.");
      return;
    }

    // Eligible → trigger Edge Function. Fire-and-forget per locked
    // decision D5 (see spec §13). No-eligibility path still routes
    // to /setup/sent so the UI doesn't reveal account existence.
    if (data?.eligible && data?.token_id) {
      try {
        await supabase.functions.invoke("send-portal-setup-email", {
          body: { token_id: data.token_id, kind: "self_request" },
        });
      } catch (err) {
        // Don't block — log only.
        console.warn("[setup] send-portal-setup-email failed:", err);
      }
    }

    nav(`/setup/sent?email=${encodeURIComponent(e)}`, { replace: true });
  };

  return (
    <div style={sx.page}>
      <div style={sx.card}>
        <div style={sx.brand}>13 STARS MEDIA · CUSTOMER PORTAL</div>
        <div style={sx.h1}>Set up your account</div>
        <div style={sx.sub}>
          Enter the email address you used with your sales rep or your
          self-serve submission. We'll send you a sign-in link.
        </div>

        {error && <div style={sx.err}>{error}</div>}

        <label style={sx.label}>Email</label>
        <input
          type="email" value={email} autoFocus autoComplete="email"
          onChange={(ev) => setEmail(ev.target.value)}
          onKeyDown={(ev) => ev.key === "Enter" && submit()}
          style={{ ...sx.input, marginBottom: 16 }}
          placeholder="you@example.com"
        />

        <button
          style={sx.btn(submitting || !email)}
          disabled={submitting || !email}
          onClick={submit}
        >
          {submitting ? "Sending…" : "Send sign-in link"}
        </button>

        <div style={sx.footer}>
          Already have an account?{" "}
          <a style={sx.link} href="/login">Sign in →</a>
        </div>
      </div>
    </div>
  );
}
