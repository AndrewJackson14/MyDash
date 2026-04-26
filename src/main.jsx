import React, { lazy, Suspense } from "react";
// ── Press Room font faces (self-hosted, Latin only) ────────
// Cormorant 600/700/600-italic — display only (≥28px, never accent).
// Geist + Geist Mono — variable axes for body, headers, mono.
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/700.css";
import "@fontsource/cormorant-garamond/600-italic.css";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
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
const isReportPage = window.location.pathname.startsWith("/r/");
const isTearsheetPage = window.location.pathname.startsWith("/tearsheet/");
const isAdsPortfolioPage = window.location.pathname.startsWith("/ads/");
const ProofApproval = isApprovalPage ? lazy(() => import("./pages/ProofApproval")) : null;
const ProposalSign = isSignPage ? lazy(() => import("./pages/ProposalSign")) : null;
const ClientPortal = isPortalPage ? lazy(() => import("./pages/ClientPortal")) : null;
const PayInvoice = isPayPage ? lazy(() => import("./pages/PayInvoice")) : null;
const ClientUpload = isUploadPage ? lazy(() => import("./pages/ClientUpload")) : null;
const MerchShop = isShopPage ? lazy(() => import("./pages/MerchShop")) : null;
const CampaignPublic = isReportPage ? lazy(() => import("./pages/CampaignPublic")) : null;
const TearsheetPortal = isTearsheetPage ? lazy(() => import("./pages/TearsheetPortal")) : null;
const ClientPortfolioPortal = isAdsPortfolioPage ? lazy(() => import("./pages/ClientPortfolioPortal")) : null;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* Public routes flagged data-surface="paper" per
        docs/ui-refresh/03-paper-surfaces.md — heritage register
        is correct for client-facing reading/sign/pay/upload pages.
        ClientPortal, MerchShop, ClientPortfolioPortal stay steel
        (dashboard / commerce / gallery shapes). */}
    {isApprovalPage ? (
      <div data-surface="paper" style={{ minHeight: "100vh" }}>
        <Suspense fallback={null}><ProofApproval /></Suspense>
      </div>
    ) : isSignPage ? (
      <div data-surface="paper" style={{ minHeight: "100vh" }}>
        <Suspense fallback={null}><ProposalSign /></Suspense>
      </div>
    ) : isPortalPage ? (
      <Suspense fallback={null}><ClientPortal /></Suspense>
    ) : isPayPage ? (
      <div data-surface="paper" style={{ minHeight: "100vh" }}>
        <Suspense fallback={null}><PayInvoice /></Suspense>
      </div>
    ) : isUploadPage ? (
      <div data-surface="paper" style={{ minHeight: "100vh" }}>
        <Suspense fallback={null}><ClientUpload /></Suspense>
      </div>
    ) : isShopPage ? (
      <Suspense fallback={null}><MerchShop /></Suspense>
    ) : isReportPage ? (
      <div data-surface="paper" style={{ minHeight: "100vh" }}>
        <Suspense fallback={null}><CampaignPublic /></Suspense>
      </div>
    ) : isTearsheetPage ? (
      <div data-surface="paper" style={{ minHeight: "100vh" }}>
        <Suspense fallback={null}><TearsheetPortal /></Suspense>
      </div>
    ) : isAdsPortfolioPage ? (
      <Suspense fallback={null}><ClientPortfolioPortal /></Suspense>
    ) : (
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    )}
  </React.StrictMode>
);
