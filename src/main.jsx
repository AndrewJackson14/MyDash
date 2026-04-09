import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "./hooks/useAuth";
import AppRouter from "./AppRouter";

// Public routes (no auth required)
const isApprovalPage = window.location.pathname.startsWith("/approve/");
const isSignPage = window.location.pathname.startsWith("/sign/");
const ProofApproval = isApprovalPage ? lazy(() => import("./pages/ProofApproval")) : null;
const ProposalSign = isSignPage ? lazy(() => import("./pages/ProposalSign")) : null;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isApprovalPage ? (
      <Suspense fallback={null}><ProofApproval /></Suspense>
    ) : isSignPage ? (
      <Suspense fallback={null}><ProposalSign /></Suspense>
    ) : (
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    )}
  </React.StrictMode>
);
