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
      <SelfIssueLanding
        selfIssue={auth.selfIssue}
        onPasteToken={(token) => {
          const next = `/driver/auth/${token}`;
          window.history.pushState({}, "", next);
          setPath(next);
        }}
      />
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

function SelfIssueLanding({ selfIssue, onPasteToken }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [linkInput, setLinkInput] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (sending || !email.trim()) return;
    setSending(true);
    setResult(null);
    const r = await selfIssue(email.trim());
    setSending(false);
    setResult(r);
  };

  const submitLink = (e) => {
    e.preventDefault();
    const raw = linkInput.trim();
    if (!raw) return;
    // Accept either a full URL ("https://mydash.media/driver/auth/abc")
    // or just the bare token. Strip query/fragment along the way.
    const m = raw.match(/\/driver\/auth\/([^/?#\s]+)/);
    const token = m ? m[1] : raw.replace(/[?#].*$/, "").replace(/[/\s]+$/, "");
    if (token) onPasteToken?.(token);
  };

  return <div style={{ padding: "60px 24px", maxWidth: 420, margin: "0 auto", textAlign: "center", color: MUTED }}>
    <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, marginBottom: 8 }}>13 Stars Delivery</div>
    <div style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 28 }}>
      Enter the email on file with the office to get a fresh sign-in link.
    </div>

    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="you@example.com"
        disabled={sending || result?.ok}
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "14px 16px", minHeight: 52,
          fontSize: 16, color: TEXT,
          background: "#1A1F2E", border: "1px solid #2D3548", borderRadius: 10,
          outline: "none",
        }}
      />
      <button
        type="submit"
        disabled={sending || !email.trim() || result?.ok}
        style={{
          width: "100%", padding: "14px", minHeight: 52,
          background: result?.ok ? "#2F855A" : "#B8893A",
          color: "#0F1419", border: "none", borderRadius: 10,
          fontSize: 16, fontWeight: 800,
          cursor: sending || !email.trim() || result?.ok ? "not-allowed" : "pointer",
          opacity: sending || (!email.trim() && !result?.ok) ? 0.6 : 1,
        }}
      >{sending ? "Sending…" : result?.ok ? "Sent ✓" : "Email me a sign-in link"}</button>
    </form>

    {result?.ok && <div style={{ marginTop: 20, fontSize: 13, lineHeight: 1.5, color: "#94A3B8" }}>
      {result.message || "Check your email."} Open the link on this phone, then enter the 6-digit PIN.
    </div>}
    {result && !result.ok && <div style={{ marginTop: 20, fontSize: 13, lineHeight: 1.5, color: "#C53030" }}>
      Couldn't send: {result.message || result.error || "unknown error"}. Call Cami if it keeps failing.
    </div>}

    <div style={{
      marginTop: 32, paddingTop: 24,
      borderTop: "1px solid #1F2937",
      textAlign: "left",
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 8 }}>
        Already have a sign-in link?
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 12, lineHeight: 1.5 }}>
        Paste it here if the page didn't load — works with the full URL or just the code.
      </div>
      <form onSubmit={submitLink} style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={linkInput}
          onChange={e => setLinkInput(e.target.value)}
          placeholder="mydash.media/driver/auth/…"
          style={{
            flex: 1, boxSizing: "border-box",
            padding: "12px 14px", minHeight: 48,
            fontSize: 14, color: TEXT,
            background: "#1A1F2E", border: "1px solid #2D3548", borderRadius: 8,
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={!linkInput.trim()}
          style={{
            padding: "12px 16px", minHeight: 48,
            background: "transparent", color: linkInput.trim() ? TEXT : MUTED,
            border: `1px solid ${linkInput.trim() ? TEXT : "#2D3548"}`, borderRadius: 8,
            fontSize: 14, fontWeight: 700,
            cursor: linkInput.trim() ? "pointer" : "not-allowed",
          }}
        >Open</button>
      </form>
    </div>

    <div style={{ marginTop: 24, fontSize: 12, color: "#64748B", lineHeight: 1.5, textAlign: "center" }}>
      No email on file? Call Cami to get one set up.
    </div>
  </div>;
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
