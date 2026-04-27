import { useEffect, useState, useCallback } from "react";
import { Z, FS, FW, Ri, R } from "../lib/theme";
import { Btn, Ic } from "./ui";
import { supabase, EDGE_FN_URL } from "../lib/supabase";

const AUTH_BASE = EDGE_FN_URL;

async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : "";
}

// Per-publication social accounts. X and Facebook own their own
// rows; Instagram is a derived destination of the Facebook row
// (one OAuth dance unlocks both per Meta's API model). LinkedIn
// stays disabled until M3.
const PROVIDERS = [
  { id: "x", label: "X", color: "#000000", live: true },
  { id: "facebook", label: "Facebook", color: "#1877F2", live: true },
  { id: "linkedin", label: "LinkedIn", color: "#0A66C2", live: false },
];

export function SocialAccountsSection({ pubId }) {
  const [xStatus, setXStatus] = useState({ connected: false, loading: true });
  const [fbStatus, setFbStatus] = useState({ connected: false, loading: true });

  const refreshX = useCallback(async () => {
    try {
      const auth = await getAuthHeader();
      if (!auth) { setXStatus({ connected: false, loading: false }); return; }
      const res = await fetch(`${AUTH_BASE}/social-x-auth?action=status&pubId=${pubId}`, { headers: { Authorization: auth } });
      const data = await res.json();
      setXStatus({ connected: !!data.connected, accountLabel: data.accountLabel, loading: false });
    } catch {
      setXStatus({ connected: false, loading: false });
    }
  }, [pubId]);

  const refreshFb = useCallback(async () => {
    try {
      const auth = await getAuthHeader();
      if (!auth) { setFbStatus({ connected: false, loading: false }); return; }
      const res = await fetch(`${AUTH_BASE}/social-facebook-auth?action=status&pubId=${pubId}`, { headers: { Authorization: auth } });
      const data = await res.json();
      setFbStatus({
        connected: !!data.connected,
        accountLabel: data.accountLabel,
        instagramLinked: !!data.instagramLinked,
        instagramLabel: data.instagramLabel,
        loading: false,
      });
    } catch {
      setFbStatus({ connected: false, loading: false });
    }
  }, [pubId]);

  useEffect(() => { refreshX(); refreshFb(); }, [refreshX, refreshFb]);

  // OAuth popup handshake: postMessage primary, localStorage storage event
  // fallback (for cross-origin redirects that strip window.opener). Both
  // providers share the same shape; route by message type to the right
  // refresh handler.
  useEffect(() => {
    const onMessage = (e) => {
      if (e.data?.pubId !== pubId) return;
      if (e.data?.type === "social-x-auth-success") refreshX();
      else if (e.data?.type === "social-facebook-auth-success") refreshFb();
    };
    const onStorage = (ev) => {
      const handlers = {
        "social-x-auth-result": refreshX,
        "social-facebook-auth-result": refreshFb,
      };
      const handler = handlers[ev.key];
      if (!handler || !ev.newValue) return;
      try {
        const data = JSON.parse(ev.newValue);
        if (Date.now() - data.ts < 30000 && data.pubId === pubId) handler();
        localStorage.removeItem(ev.key);
      } catch { /* ok */ }
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
    };
  }, [pubId, refreshX, refreshFb]);

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

  const connectFb = async () => {
    const auth = await getAuthHeader();
    const res = await fetch(`${AUTH_BASE}/social-facebook-auth?action=start&pubId=${pubId}`, { headers: { Authorization: auth } });
    const { url } = await res.json();
    if (url) window.open(url, "social-facebook-auth", "width=600,height=700,left=200,top=100");
  };

  const disconnectFb = async () => {
    const auth = await getAuthHeader();
    await fetch(`${AUTH_BASE}/social-facebook-auth?action=disconnect`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ pubId }),
    });
    setFbStatus({ connected: false, loading: false });
  };

  return (
    <div style={{ marginTop: 12, padding: 12, background: Z.bg, borderRadius: Ri, border: `1px solid ${Z.bd}` }}>
      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase", marginBottom: 8 }}>Social Accounts</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {PROVIDERS.map(p => {
          const isX = p.id === "x";
          const isFb = p.id === "facebook";
          const status = isX ? xStatus : isFb ? fbStatus : null;
          const connected = !!status?.connected;
          const loading = !!status?.loading;
          const connectFn = isX ? connectX : isFb ? connectFb : null;
          const disconnectFn = isX ? disconnectX : isFb ? disconnectFb : null;
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: Z.sa, borderRadius: Ri, border: `1px solid ${Z.bd}`, opacity: p.live ? 1 : 0.55 }}>
              <div style={{ width: 26, height: 26, borderRadius: R, background: p.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: FS.xs, fontWeight: FW.heavy, flexShrink: 0 }}>
                {p.label[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx }}>{p.label}</div>
                <div style={{ fontSize: FS.xs, color: Z.tm }}>
                  {!p.live ? "Coming soon" : loading ? "Checking…" : connected ? (status.accountLabel || "Connected") : "Not connected"}
                </div>
              </div>
              {p.live && !loading && (
                connected
                  ? <Btn sm v="cancel" onClick={disconnectFn}>Disconnect</Btn>
                  : <Btn sm onClick={connectFn}><Ic.plus size={12} /> Connect</Btn>
              )}
            </div>
          );
        })}

        {/* Instagram — derived from the Facebook row. We render it inline so
            the matrix shape is "X / FB / IG / LinkedIn" matching the
            destination toggles in the composer. Status follows the FB
            connection: if FB is connected and the Page has a linked IG
            Business account, IG shows as connected. Otherwise the row
            explains the fix-it path (link IG to Page in Meta Business
            Suite, then reconnect). */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: Z.sa, borderRadius: Ri, border: `1px solid ${Z.bd}` }}>
          <div style={{ width: 26, height: 26, borderRadius: R, background: "#E1306C", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: FS.xs, fontWeight: FW.heavy, flexShrink: 0 }}>
            I
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx }}>Instagram</div>
            <div style={{ fontSize: FS.xs, color: Z.tm }}>
              {fbStatus.loading
                ? "Checking…"
                : !fbStatus.connected
                  ? "Connect Facebook first"
                  : fbStatus.instagramLinked
                    ? (fbStatus.instagramLabel || "Connected via Facebook")
                    : "No IG Business account linked to this Page"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SocialAccountsSection;
