import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "./hooks/useAuth";
import AppRouter from "./AppRouter";

// Public routes (no auth required)
const isApprovalPage = window.location.pathname.startsWith("/approve/");
const ProofApproval = isApprovalPage ? lazy(() => import("./pages/ProofApproval")) : null;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isApprovalPage ? (
      <Suspense fallback={null}><ProofApproval /></Suspense>
    ) : (
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    )}
  </React.StrictMode>
);
