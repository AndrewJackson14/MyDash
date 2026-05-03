// PortalApp — top-level routing for portal.13stars.media.
//
// Public routes (Phase C): /login, /setup, /setup/sent, /setup/complete
// Authed routes  (Phase D): /c/:slug/* — wrapped in RequireAuth + PortalShell
//
// Spec: docs/specs/client-portal-spec.md.md §5
import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import RequireAuth from "./components/RequireAuth";
import PortalShell from "./components/PortalShell";

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

        {/* Authed surface: PortalProvider lives in RequireAuth so
            child routes can call usePortal() directly. PortalShell
            renders the chrome; nested <Outlet/> brings the page in. */}
        <Route path="/c/:slug" element={<RequireAuth><PortalShell /></RequireAuth>}>
          <Route index            element={<Navigate to="home" replace />} />
          <Route path="home"      element={<ClientHome />} />
        </Route>

        <Route path="*" element={<NotFound />} />
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
