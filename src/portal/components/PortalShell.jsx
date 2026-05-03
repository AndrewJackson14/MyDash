// PortalShell — chrome wrapping every /c/<slug>/* page.
// Top bar: 13 Stars logo (neutral) on the left, account picker
// in the middle, sign-out on the right. Per spec §6.2 the chrome
// stays brand-neutral; per-pub theming applies inside content cards
// only (Phase D2+ when proposals/ad-projects render with publication
// theme tokens).
import { Outlet } from "react-router-dom";
import { usePortal } from "../lib/portalContext";
import { C } from "../lib/portalUi";
import AccountPicker from "./AccountPicker";

export default function PortalShell() {
  const { signOut, session } = usePortal();
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: "inherit" }}>
      <header style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "#fff", borderBottom: `1px solid ${C.rule}`,
        padding: "10px 20px",
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <a href="/" style={{
          textDecoration: "none", color: C.ink,
          fontWeight: 800, fontSize: 13, letterSpacing: 1,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span aria-hidden style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 22, height: 22, borderRadius: 4,
            background: C.ac, color: "#fff",
            fontSize: 11, fontWeight: 800,
          }}>13</span>
          <span>STARS MEDIA</span>
        </a>

        <div style={{ flex: 1 }}>
          <AccountPicker />
        </div>

        <button
          onClick={signOut}
          style={{
            fontSize: 12, fontWeight: 600, color: C.muted,
            background: "transparent", border: "none",
            cursor: "pointer", padding: "8px 4px",
            fontFamily: "inherit",
          }}
          title={session?.user?.email || ""}
        >
          Sign out
        </button>
      </header>
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "20px 16px 60px" }}>
        <Outlet />
      </main>
    </div>
  );
}
