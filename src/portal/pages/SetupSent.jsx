// /setup/sent — "check your email" landing after /setup or after a
// fresh self-serve submit. Static; reads `?email=` for display only.
//
// Spec: client-portal-spec.md.md §9.3.
import { useSearchParams } from "react-router-dom";
import { sx, C } from "../lib/portalUi";

export default function SetupSent() {
  const [params] = useSearchParams();
  const email = params.get("email");

  return (
    <div style={sx.page}>
      <div style={sx.card}>
        <div style={sx.brand}>13 STARS MEDIA · CUSTOMER PORTAL</div>
        <div style={sx.h1}>Check your email</div>
        <div style={sx.sub}>
          {email ? (
            <>We sent a sign-in link to <strong style={{ color: C.ink }}>{email}</strong>.<br />
              Click the link in your inbox to continue.</>
          ) : (
            <>We sent you a sign-in link. Click it to continue.</>
          )}
        </div>
        <div style={{ ...sx.sub, fontSize: 12 }}>
          Didn't get the email? Check your spam folder, or{" "}
          <a style={sx.link} href="/setup">request another link</a>.
        </div>
      </div>
    </div>
  );
}
