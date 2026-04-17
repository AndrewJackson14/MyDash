import React, { lazy, Suspense } from "react";
import "./styles/global.css";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "./hooks/useAuth";
import AppRouter from "./AppRouter";

// Public routes (separate from main app auth)
const isApprovalPage = window.location.pathname.startsWith("/approve/");
const isSignPage = window.location.pathname.startsWith("/sign/");
const isPortalPage = window.location.pathname.startsWith("/portal");
const isPayPage = window.location.pathname.startsWith("/pay/");
const isUploadPage = window.location.pathname.startsWith("/upload/");
const isShopPage = window.location.pathname.startsWith("/shop/");
const ProofApproval = isApprovalPage ? lazy(() => import("./pages/ProofApproval")) : null;
const ProposalSign = isSignPage ? lazy(() => import("./pages/ProposalSign")) : null;
const ClientPortal = isPortalPage ? lazy(() => import("./pages/ClientPortal")) : null;
const PayInvoice = isPayPage ? lazy(() => import("./pages/PayInvoice")) : null;
const ClientUpload = isUploadPage ? lazy(() => import("./pages/ClientUpload")) : null;
const MerchShop = isShopPage ? lazy(() => import("./pages/MerchShop")) : null;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isApprovalPage ? (
      <Suspense fallback={null}><ProofApproval /></Suspense>
    ) : isSignPage ? (
      <Suspense fallback={null}><ProposalSign /></Suspense>
    ) : isPortalPage ? (
      <Suspense fallback={null}><ClientPortal /></Suspense>
    ) : isPayPage ? (
      <Suspense fallback={null}><PayInvoice /></Suspense>
    ) : isUploadPage ? (
      <Suspense fallback={null}><ClientUpload /></Suspense>
    ) : isShopPage ? (
      <Suspense fallback={null}><MerchShop /></Suspense>
    ) : (
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    )}
  </React.StrictMode>
);
