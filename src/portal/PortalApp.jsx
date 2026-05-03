// PortalApp — top-level routing for portal.13stars.media.
//
// Phase B (this commit): scaffolding only. Real page bodies land in
// Phase C (auth flow) and Phase D (read surfaces). Each route below
// renders a placeholder so the build compiles and routing is testable.
//
// Spec: docs/specs/client-portal-spec.md.md §5
import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

const Login         = lazy(() => import("./pages/Login"));
const Setup         = lazy(() => import("./pages/Setup"));
const SetupSent     = lazy(() => import("./pages/SetupSent"));
const SetupComplete = lazy(() => import("./pages/SetupComplete"));
const ClientHome    = lazy(() => import("./pages/ClientHome"));
const NotFound      = lazy(() => import("./pages/NotFound"));

export default function PortalApp() {
  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route path="/"               element={<Navigate to="/login" replace />} />
        <Route path="/login"          element={<Login />} />
        <Route path="/setup"          element={<Setup />} />
        <Route path="/setup/sent"     element={<SetupSent />} />
        <Route path="/setup/complete" element={<SetupComplete />} />
        <Route path="/c/:slug/home"   element={<ClientHome />} />
        <Route path="*"               element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

function Splash() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      color: "#525e72", fontSize: 14,
    }}>Loading…</div>
  );
}
