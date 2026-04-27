import { useEffect, useState, useCallback } from "react";
import { Z, FS, FW, Ri, R } from "../lib/theme";
import { Btn, Ic } from "./ui";
import { supabase, EDGE_FN_URL } from "../lib/supabase";

const AUTH_BASE = EDGE_FN_URL;

async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : "";
}

// Per-publication social accounts. M1 = X only; FB/IG/LinkedIn slots are
// rendered disabled so the matrix shape is visible from day one.
const PROVIDERS = [
  { id: "x", label: "X", color: "#000000", live: true },
  { id: "facebook", label: "Facebook", color: "#1877F2", live: false },
  { id: "instagram", label: "Instagram", color: "#E1306C", live: false },
  { id: "linkedin", label: "LinkedIn", color: "#0A66C2", live: false },
];

export function SocialAccountsSection({ pubId }) {
  const [xStatus, setXStatus] = useState({ connected: false, loading: true });

  const refreshX = useCallback(async () => {
    try {
      const auth = await getAuthHeader();
      if (!auth) { setXStatus({ connected: false, loading: false }); return; }
      const res = await fetch(`${AUTH_BASE}/social-x-auth?action=status&pubId=${pubId}`, { headers: { Authorization: auth } });
      const data = await res.json();
      setXStatus({ connected: !!data.connected, accountLabel: data.accountLabel, externalId: data.externalId, loading: false });
    } catch {
      setXStatus({ connected: false, loading: false });
    }
  }, [pubId]);

  useEffect(() => { refreshX(); }, [refreshX]);

  // OAuth popup handshake: postMessage primary, localStorage storage event
  // fallback (for cross-origin redirects that strip window.opener).
  useEffect(() => {
    const onMessage = (e) => {
      if (e.data?.type === "social-x-auth-success" && e.data.pubId === pubId) refreshX();
    };
    const onStorage = (ev) => {
      if (ev.key === "social-x-auth-result" && ev.newValue) {
        try {
          const data = JSON.parse(ev.newValue);
          if (Date.now() - data.ts < 30000 && data.pubId === pubId) refreshX();
          localStorage.removeItem("social-x-auth-result");
        } catch { /* ok */ }
      }
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
    };
  }, [pubId, refreshX]);

  const connectX = async () => {
    const auth = await getAuthHeader();
    const res = await fetch(`${AUTH_BASE}/social-x-auth?action=start&pubId=${pubId}`, { headers: { Authorization: auth } });
    const { url } = await res.json();
    if (url) window.open(url, "social-x-auth", "width=600,height=700,left=200,top=100");
  };

  const disconnectX = async () => {
    const auth = await getAuthHeader();
    await fetch(`${AUTH_BASE}/social-x-auth?action=disconnect`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ pubId }),
    });
    setXStatus({ connected: false, loading: false });
  };

  return (
    <div style={{ marginTop: 12, padding: 12, background: Z.bg, borderRadius: Ri, border: `1px solid ${Z.bd}` }}>
      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase", marginBottom: 8 }}>Social Accounts</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {PROVIDERS.map(p => {
          const isX = p.id === "x";
          const connected = isX && xStatus.connected;
          const loading = isX && xStatus.loading;
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: Z.sa, borderRadius: Ri, border: `1px solid ${Z.bd}`, opacity: p.live ? 1 : 0.55 }}>
              <div style={{ width: 26, height: 26, borderRadius: R, background: p.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: FS.xs, fontWeight: FW.heavy, flexShrink: 0 }}>
                {p.label[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx }}>{p.label}</div>
                <div style={{ fontSize: FS.xs, color: Z.tm }}>
                  {!p.live ? "Coming soon" : loading ? "Checking…" : connected ? (xStatus.accountLabel || "Connected") : "Not connected"}
                </div>
              </div>
              {p.live && !loading && (
                connected
                  ? <Btn sm v="cancel" onClick={disconnectX}>Disconnect</Btn>
                  : <Btn sm onClick={connectX}><Ic.plus size={12} /> Connect</Btn>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SocialAccountsSection;
