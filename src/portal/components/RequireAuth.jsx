// RequireAuth — gate for /c/<slug>/* routes.
// 1. If no session → /login
// 2. If session but no contact rows → "no portal access" message
// 3. If session + slug not in accessibleClients → 404 (slug invalid or revoked)
// 4. Else render children with PortalProvider in scope
import { Navigate, useParams } from "react-router-dom";
import { PortalProvider, usePortal } from "../lib/portalContext";
import { sx, C } from "../lib/portalUi";

export default function RequireAuth({ children }) {
  return (
    <PortalProvider>
      <Gate>{children}</Gate>
    </PortalProvider>
  );
}

function Gate({ children }) {
  const { slug } = useParams();
  const { session, accessibleClients, activeClient, loading, error } = usePortal();

  if (loading) {
    return <div style={sx.page}><div style={{ color: C.muted }}>Loading…</div></div>;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (error) {
    return <ErrorCard title="Couldn't load your accounts" body={error} />;
  }
  if (accessibleClients.length === 0) {
    return <ErrorCard
      title="No portal access yet"
      body="Your sign-in worked, but no client accounts are linked to your email. Contact your sales rep to get access."
    />;
  }
  if (slug && !activeClient) {
    return <ErrorCard
      title="Account not found"
      body={`You don't have access to “${slug}”, or that account doesn't exist.`}
    />;
  }
  return children;
}

function ErrorCard({ title, body }) {
  return (
    <div style={sx.page}>
      <div style={sx.card}>
        <div style={sx.brand}>13 STARS MEDIA · CUSTOMER PORTAL</div>
        <div style={sx.h1}>{title}</div>
        <div style={sx.sub}>{body}</div>
        <a style={{ ...sx.btn(false), display: "block", textAlign: "center", textDecoration: "none" }} href="/login">
          Back to sign in
        </a>
      </div>
    </div>
  );
}
