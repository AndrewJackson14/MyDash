// ============================================================
// MobileApp — top-level shell for the /mobile sales-rep PWA.
//
// Lives at /mobile in the existing MyDash React/Vite codebase.
// No desktop chrome (no Sidebar / TopBar / persistent pages).
// Mobile-first viewport, 5-tab bottom nav with elevated center
// Capture button per Spec 056 §2.
//
// Adapted Mobile MVP (per Andrew's call): we read directly from
// the existing schema (sales / clients / contracts / etc) instead
// of building Spec 055's separate opportunities/interactions
// tables. No Dexie offline-first layer for v1 — UI just talks to
// useAppData like the desktop pages do. Dexie + voice + push come
// in v2 once the IA is validated on real devices.
//
// Routing: pathname-driven (no react-router). Subpaths under
// /mobile resolve to tabs:
//   /mobile          → Home (default)
//   /mobile/home     → Home
//   /mobile/pipeline → Pipeline
//   /mobile/capture  → Capture (stubbed)
//   /mobile/clients  → Clients
//   /mobile/me       → Me
//   /mobile/clients/{id} → ClientDetail (drill-in from Clients)
// ============================================================
import { useEffect, useState, lazy, Suspense } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useAppData } from "../../hooks/useAppData";
import { useJurisdiction } from "../../hooks/useJurisdiction";
import { TOKENS, INK, SURFACE, ACCENT } from "./mobileTokens";

const HomeTab = lazy(() => import("./tabs/HomeTab"));
const PipelineTab = lazy(() => import("./tabs/PipelineTab"));
const ClientsTab = lazy(() => import("./tabs/ClientsTab"));
const ClientDetail = lazy(() => import("./tabs/ClientDetail"));
const MeTab = lazy(() => import("./tabs/MeTab"));
const CaptureModal = lazy(() => import("./CaptureModal"));

export default function MobileApp() {
  const { user, loading: authLoading, signIn, signInWithGoogle, signOut } = useAuth();
  const [path, setPath] = useState(window.location.pathname);
  const [captureOpen, setCaptureOpen] = useState(false);

  // Auth-required gate. Mobile shares the office Google SSO; rep
  // signs in once and the same auth_id maps to their team_member row.
  // Once signed in, useAppData below pulls their jurisdiction-scoped
  // data. We DON'T pull useAppData before auth — saves a no-op load.

  // Track pathname changes for back/forward + pushState navigation.
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Mobile-first viewport + light-mode color-scheme. Restore on
  // unmount so navigating BACK to desktop doesn't leave the meta
  // viewport stuck on mobile.
  useEffect(() => {
    const prevTheme = document.documentElement.style.colorScheme;
    document.documentElement.style.colorScheme = "light";
    document.body.style.background = SURFACE.alt;
    document.body.style.color = INK;
    document.body.style.margin = "0";
    let viewportTag = document.querySelector('meta[name="viewport"]');
    const prevViewport = viewportTag?.getAttribute("content") || "";
    if (!viewportTag) {
      viewportTag = document.createElement("meta");
      viewportTag.setAttribute("name", "viewport");
      document.head.appendChild(viewportTag);
    }
    viewportTag.setAttribute("content", "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no");

    // Inject PWA manifest + Apple meta so "Add to Home Screen" works.
    // Done client-side rather than baked into index.html so we only
    // advertise it on the /mobile tree, not the desktop shell.
    const manifestLink = document.createElement("link");
    manifestLink.rel = "manifest";
    manifestLink.href = "/mobile-manifest.json";
    document.head.appendChild(manifestLink);
    const appleMeta = document.createElement("meta");
    appleMeta.name = "apple-mobile-web-app-capable";
    appleMeta.content = "yes";
    document.head.appendChild(appleMeta);
    const appleStatusMeta = document.createElement("meta");
    appleStatusMeta.name = "apple-mobile-web-app-status-bar-style";
    appleStatusMeta.content = "default";
    document.head.appendChild(appleStatusMeta);
    const themeColorMeta = document.createElement("meta");
    themeColorMeta.name = "theme-color";
    themeColorMeta.content = "#0C447C";
    document.head.appendChild(themeColorMeta);

    return () => {
      document.documentElement.style.colorScheme = prevTheme;
      if (viewportTag) viewportTag.setAttribute("content", prevViewport);
      manifestLink.remove();
      appleMeta.remove();
      appleStatusMeta.remove();
      themeColorMeta.remove();
    };
  }, []);

  if (authLoading) {
    return <Splash text="Loading…" />;
  }

  // Sign-in screen — minimal, just Google SSO button. Same OAuth
  // path the desktop uses; the rep ends up with the same auth_id.
  if (!user) {
    return <Splash>
      <div style={{ padding: "60px 24px", maxWidth: 360, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: INK, marginBottom: 8, letterSpacing: -0.5 }}>MyDash</div>
        <div style={{ fontSize: 14, color: TOKENS.muted, marginBottom: 36, lineHeight: 1.5 }}>Sales rep mobile app — sign in to continue.</div>
        <button onClick={signInWithGoogle} style={{
          width: "100%", padding: "16px", minHeight: 56,
          background: ACCENT, color: "#FFFFFF",
          border: "none", borderRadius: 12,
          fontSize: 16, fontWeight: 700,
          cursor: "pointer",
        }}>Sign in with Google</button>
      </div>
    </Splash>;
  }

  // Authed: render the tab shell + active tab content.
  return <AuthedShell path={path} setPath={setPath} captureOpen={captureOpen} setCaptureOpen={setCaptureOpen} signOut={signOut} user={user} />;
}

// ── AuthedShell: appData lives here so we don't pull it pre-auth ─
function AuthedShell({ path, setPath, captureOpen, setCaptureOpen, signOut, user }) {
  const appData = useAppData();
  const team = appData.team || [];
  const currentUser = team.find(t => t.auth_id === user?.id);
  const jurisdiction = useJurisdiction(currentUser, {
    pubs: appData.pubs || appData.allPubs || [],
    clients: appData.clients || [],
    sales: appData.sales || [],
    issues: appData.issues || [],
    stories: appData.stories || [],
    creativeJobs: appData.creativeJobs || [],
  });

  const navTo = (next) => {
    if (next === "/mobile" + path.replace(/^\/mobile/, "")) return;
    window.history.pushState({}, "", next);
    setPath(next);
  };

  const sub = path.replace(/^\/mobile/, "").replace(/^\/+/, "").replace(/\/+$/, "");
  const [activeTab, ...rest] = sub.split("/");
  const drilldownId = rest.join("/") || null;

  const tab = activeTab || "home";

  return <FullScreen>
    <div style={{
      maxWidth: 480, margin: "0 auto", minHeight: "100vh",
      paddingBottom: "calc(72px + env(safe-area-inset-bottom))", // tab bar height
      background: SURFACE.alt,
    }}>
      <Suspense fallback={<Splash text="Loading…" embedded />}>
        {tab === "home" && <HomeTab appData={appData} currentUser={currentUser} jurisdiction={jurisdiction} navTo={navTo} />}
        {tab === "pipeline" && <PipelineTab appData={appData} currentUser={currentUser} jurisdiction={jurisdiction} navTo={navTo} />}
        {tab === "clients" && !drilldownId && <ClientsTab appData={appData} currentUser={currentUser} jurisdiction={jurisdiction} navTo={navTo} />}
        {tab === "clients" && drilldownId && <ClientDetail clientId={drilldownId} appData={appData} currentUser={currentUser} jurisdiction={jurisdiction} navTo={navTo} />}
        {tab === "me" && <MeTab appData={appData} currentUser={currentUser} signOut={signOut} navTo={navTo} />}
        {tab === "capture" && <CaptureStubScreen navTo={navTo} />}
      </Suspense>
    </div>

    {/* Bottom tab bar — fixed, with elevated center Capture button */}
    <TabBar
      active={tab}
      onTab={(t) => navTo(`/mobile/${t}`)}
      onCapture={() => setCaptureOpen(true)}
    />

    {captureOpen && <Suspense fallback={null}>
      <CaptureModal onClose={() => setCaptureOpen(false)} />
    </Suspense>}
  </FullScreen>;
}

// ── Bottom tab bar ────────────────────────────────────────────
function TabBar({ active, onTab, onCapture }) {
  const item = (key, label, icon) => {
    const isActive = active === key;
    return <button onClick={() => onTab(key)} style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 2, padding: "8px 0", minHeight: 56,
      background: "transparent", border: "none", cursor: "pointer",
      color: isActive ? ACCENT : TOKENS.muted,
      fontFamily: "inherit",
    }}>
      <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>{label}</span>
    </button>;
  };

  return <div style={{
    position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
    paddingBottom: "env(safe-area-inset-bottom)",
    background: SURFACE.elevated,
    borderTop: `1px solid ${TOKENS.rule}`,
    boxShadow: "0 -2px 16px rgba(0,0,0,0.04)",
  }}>
    <div style={{
      maxWidth: 480, margin: "0 auto", height: 56,
      display: "flex", alignItems: "center",
      position: "relative",
    }}>
      {item("home", "Home", "△")}
      {item("pipeline", "Pipeline", "↳")}
      <div style={{ flex: 1, position: "relative" }}>
        <button onClick={onCapture} aria-label="Capture interaction" style={{
          position: "absolute", left: "50%", top: -22,
          transform: "translateX(-50%)",
          width: 56, height: 56, borderRadius: 28,
          background: ACCENT, color: "#FFFFFF",
          border: `3px solid ${SURFACE.elevated}`,
          boxShadow: "0 4px 12px rgba(12,68,124,0.35)",
          fontSize: 28, fontWeight: 800, lineHeight: 1,
          cursor: "pointer", padding: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>+</button>
      </div>
      {item("clients", "Clients", "◌")}
      {item("me", "Me", "▤")}
    </div>
  </div>;
}

// ── Helpers ────────────────────────────────────────────────────
function FullScreen({ children }) {
  return <div style={{
    minHeight: "100vh",
    background: SURFACE.alt,
    color: INK,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 16,
    WebkitFontSmoothing: "antialiased",
  }}>{children}</div>;
}

function Splash({ text, embedded, children }) {
  if (children) return <FullScreen>{children}</FullScreen>;
  return <FullScreen>
    <div style={{
      padding: 60, textAlign: "center",
      color: TOKENS.muted, fontSize: 14,
      ...(embedded ? {} : { minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }),
    }}>{text}</div>
  </FullScreen>;
}

function CaptureStubScreen({ navTo }) {
  // Tapping the Capture *tab* (not the elevated +) shouldn't really
  // happen — the + button opens the modal. But for completeness,
  // route them back to Home with a hint.
  useEffect(() => { navTo("/mobile/home"); }, [navTo]);
  return null;
}
