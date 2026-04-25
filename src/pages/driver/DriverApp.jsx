// DriverApp — top-level shell for the /driver route tree.
//
// No MyDash chrome. Dark mode default. Mobile-first viewport. Routes
// are pathname-driven (no react-router dependency):
//   /driver/auth/{token}  → DriverLogin (PIN entry)
//   /driver/home          → DriverHome (today's routes)
//   /driver/route/{id}    → DriverRoute (Phase 7)
//   /driver/complete/{id} → DriverComplete (Phase 10)
// Anything else → DriverHome (which redirects to login if not authed).
//
// Phase 6 ships auth + home stub. Phase 7 fills in the route view.
import { useEffect, useState } from "react";
import { useDriverAuth } from "../../hooks/useDriverAuth";
import DriverLogin from "./DriverLogin";
import DriverHome from "./DriverHome";
import DriverRoute from "./DriverRoute";

const DARK_BG = "#0F1419";
const TEXT = "#E8EAED";
const MUTED = "#94A3B8";

export default function DriverApp() {
  const auth = useDriverAuth();
  const [path, setPath] = useState(window.location.pathname);

  // Track pathname changes so back/forward + pushState navigation work.
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Inject viewport meta + dark color-scheme. The MyDash shell's index.html
  // sets desktop viewport defaults; for the driver app we want mobile-first
  // and prevent zoom on input focus (16px font size handles that part).
  useEffect(() => {
    const prevTheme = document.documentElement.style.colorScheme;
    document.documentElement.style.colorScheme = "dark";
    document.body.style.background = DARK_BG;
    document.body.style.color = TEXT;
    let viewportTag = document.querySelector('meta[name="viewport"]');
    const prevViewport = viewportTag?.getAttribute("content") || "";
    if (!viewportTag) {
      viewportTag = document.createElement("meta");
      viewportTag.setAttribute("name", "viewport");
      document.head.appendChild(viewportTag);
    }
    viewportTag.setAttribute("content", "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no");
    return () => {
      document.documentElement.style.colorScheme = prevTheme;
      if (viewportTag) viewportTag.setAttribute("content", prevViewport);
    };
  }, []);

  if (!auth.bootstrapped) {
    return <Splash text="Loading…" />;
  }

  // Magic-link landing: /driver/auth/{token}
  if (path.startsWith("/driver/auth/")) {
    const token = path.replace("/driver/auth/", "").replace(/\/$/, "");
    if (token) {
      return <FullScreenContainer>
        <DriverLogin
          magicToken={token}
          onAuthed={() => {
            window.history.pushState({}, "", "/driver/home");
            setPath("/driver/home");
          }}
        />
      </FullScreenContainer>;
    }
  }

  // Everything else needs auth.
  if (!auth.isAuthed) {
    return <FullScreenContainer>
      <div style={{ padding: "60px 32px", textAlign: "center", color: MUTED }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, marginBottom: 12 }}>13 Stars Delivery</div>
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>
          You need a magic-link SMS from the office to sign in.<br />
          Call Cami if you didn't receive one.
        </div>
      </div>
    </FullScreenContainer>;
  }

  // Authed routing.
  if (path.startsWith("/driver/route/")) {
    const instanceId = path.replace("/driver/route/", "").replace(/\/$/, "");
    return <FullScreenContainer>
      <DriverRoute
        instanceId={instanceId}
        driverId={auth.driverId}
        onBack={() => {
          window.history.pushState({}, "", "/driver/home");
          setPath("/driver/home");
        }}
        onComplete={(id) => {
          const next = `/driver/complete/${id}`;
          window.history.pushState({}, "", next);
          setPath(next);
        }}
      />
    </FullScreenContainer>;
  }
  if (path.startsWith("/driver/complete/")) {
    const instanceId = path.replace("/driver/complete/", "").replace(/\/$/, "");
    return <FullScreenContainer>
      <Stub title="Complete route (Phase 10)" detail={`Instance: ${instanceId || "(none)"}`} onSignOut={auth.signOut} />
    </FullScreenContainer>;
  }

  // Default: home.
  return <FullScreenContainer>
    <DriverHome
      driverId={auth.driverId}
      onSignOut={auth.signOut}
      onOpenRoute={(instanceId) => {
        const next = `/driver/route/${instanceId}`;
        window.history.pushState({}, "", next);
        setPath(next);
      }}
    />
  </FullScreenContainer>;
}

function FullScreenContainer({ children }) {
  return <div style={{
    minHeight: "100vh",
    background: DARK_BG,
    color: TEXT,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 16,
    WebkitFontSmoothing: "antialiased",
  }}>{children}</div>;
}

function Splash({ text }) {
  return <FullScreenContainer>
    <div style={{ padding: 60, textAlign: "center", color: MUTED, fontSize: 14 }}>{text}</div>
  </FullScreenContainer>;
}

function Stub({ title, detail, onSignOut }) {
  return <div style={{ padding: "32px 24px", maxWidth: 480, margin: "0 auto" }}>
    <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, marginBottom: 8 }}>{title}</div>
    <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.5 }}>{detail}</div>
    <div style={{ marginTop: 32 }}>
      <button onClick={onSignOut} style={{
        background: "transparent", border: `1px solid ${MUTED}`, color: MUTED,
        padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14,
      }}>Sign out</button>
    </div>
  </div>;
}
