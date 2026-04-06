import { useState, useEffect } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../lib/theme";
import { Ic, Btn, Inp, Card, glass } from "../components/ui";
import { supabase } from "../lib/supabase";

const ProfilePanel = ({ user, team, pubs, onClose }) => {
  const [gmailStatus, setGmailStatus] = useState(null); // null = loading, { connected, email } = loaded
  const [gmailLoading, setGmailLoading] = useState(false);

  const me = user || {};
  const myPubs = (pubs || []).filter(p => !me.pubs || me.pubs.includes("all") || me.pubs.includes(p.id));
  const triggerLabels = { issue_published: "When Issue Publishes", invoice_paid: "When Invoice Paid", both: "Both (Issue + Invoice)" };

  // Check Gmail connection status
  useEffect(() => {
    if (!me.id || !supabase) return;
    supabase.from("gmail_tokens").select("email, token_expiry").eq("team_member_id", me.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setGmailStatus({ connected: true, email: data.email, expires: data.token_expiry });
        } else {
          setGmailStatus({ connected: false });
        }
      });
  }, [me.id]);

  const connectGmail = async () => {
    if (!supabase) { alert("Supabase not connected"); return; }
    setGmailLoading(true);
    try {
      const res = await fetch(`https://hqywacyhpllapdwccmaw.supabase.co/functions/v1/gmail-auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_member_id: me.id }),
      });
      if (!res.ok) {
        const errText = await res.text();
        alert(`Gmail auth failed (${res.status}): ${errText}`);
        setGmailLoading(false);
        return;
      }
      const result = await res.json();
      if (result.error) {
        alert(`Gmail auth error: ${result.error}`);
        setGmailLoading(false);
        return;
      }
      if (!result.auth_url) {
        alert(`No auth URL returned. Response: ${JSON.stringify(result)}`);
        setGmailLoading(false);
        return;
      }
      if (result.auth_url) {
        const popup = window.open(result.auth_url, "gmail-auth", "width=500,height=600,left=200,top=200");
        if (!popup) {
          alert("Popup blocked — please allow popups for this site and try again.");
          setGmailLoading(false);
          return;
        }
        // Poll for popup close
        const interval = setInterval(async () => {
          if (popup.closed) {
            clearInterval(interval);
            // Re-check Gmail token status
            const { data: token } = await supabase.from("gmail_tokens").select("email, token_expiry").eq("team_member_id", me.id).maybeSingle();
            if (token) {
              setGmailStatus({ connected: true, email: token.email, expires: token.token_expiry });
            }
            setGmailLoading(false);
          }
        }, 1000);
        // Failsafe: stop polling after 2 minutes
        setTimeout(() => { clearInterval(interval); setGmailLoading(false); }, 120000);
      } else {
        alert("Failed to get Gmail authorization URL.");
        setGmailLoading(false);
      }
    } catch (err) {
      console.error("Gmail auth error:", err);
      alert(`Gmail connection error: ${err.message}`);
      setGmailLoading(false);
    }
  };

  const disconnectGmail = async () => {
    if (!confirm("Disconnect Gmail? You won't be able to send emails from MyDash until you reconnect.")) return;
    await supabase.from("gmail_tokens").delete().eq("team_member_id", me.id);
    setGmailStatus({ connected: false });
  };

  return <>
    {/* Backdrop */}
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 998 }} />

    {/* Panel */}
    <div style={{
      position: "fixed", left: 0, top: 0, bottom: 0, width: 360, zIndex: 999,
      background: Z.sf, borderRight: `1px solid ${Z.bd}`,
      boxShadow: "4px 0 24px rgba(0,0,0,0.3)", overflowY: "auto",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ padding: "20px 24px", borderBottom: `1px solid ${Z.bd}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>My Profile</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm }}><Ic.close size={18} /></button>
      </div>

      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Avatar + Name */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: R, background: Z.sa, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: FW.black, color: Z.tm }}>
            {(me.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: FS.lg, fontWeight: FW.heavy, color: Z.tx }}>{me.name}</div>
            <div style={{ fontSize: FS.sm, color: Z.tm }}>{me.role}</div>
          </div>
        </div>

        {/* Contact Info */}
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Contact</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Ic.mail size={13} color={Z.tm} />
              <span style={{ fontSize: FS.base, color: Z.tx }}>{me.email || "—"}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Ic.phone size={13} color={Z.tm} />
              <span style={{ fontSize: FS.base, color: Z.tx }}>{me.phone || "—"}</span>
            </div>
          </div>
        </div>

        {/* Gmail Connection */}
        <div style={{ ...glass(), borderRadius: R, padding: 16 }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Gmail Connection</div>
          {gmailStatus === null ? (
            <div style={{ fontSize: FS.sm, color: Z.tm }}>Checking...</div>
          ) : gmailStatus.connected ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: Z.go }} />
                <span style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx }}>Connected</span>
              </div>
              <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 10 }}>{gmailStatus.email}</div>
              <Btn sm v="ghost" onClick={disconnectGmail}>Disconnect</Btn>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: Z.da }} />
                <span style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tm }}>Not connected</span>
              </div>
              <div style={{ fontSize: FS.sm, color: Z.td, marginBottom: 10 }}>Connect Gmail to send proposals and outreach emails directly from MyDash.</div>
              <Btn sm onClick={connectGmail} disabled={gmailLoading}>{gmailLoading ? "Connecting..." : "Connect Gmail"}</Btn>
            </div>
          )}
        </div>

        {/* Publications */}
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>My Publications</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {myPubs.length === 0 ? <span style={{ fontSize: FS.sm, color: Z.td }}>No publications assigned</span> :
              myPubs.map(p => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: Ri, background: Z.bg }}>
                  <div style={{ width: 4, height: 20, borderRadius: 2, background: p.color || Z.ac, flexShrink: 0 }} />
                  <span style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx }}>{p.name}</span>
                  <span style={{ fontSize: FS.sm, color: Z.td, marginLeft: "auto" }}>{p.type}</span>
                </div>
              ))
            }
          </div>
        </div>

        {/* Commission Settings (Sales roles only) */}
        {["Sales Manager", "Salesperson"].includes(me.role) && <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Commission Settings</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", borderRadius: R, background: Z.bg }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: FS.sm, color: Z.tm }}>Default Rate</span>
              <span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx }}>{me.commissionDefaultRate || 20}%</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: FS.sm, color: Z.tm }}>Earning Trigger</span>
              <span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx }}>{triggerLabels[me.commissionTrigger] || "Both"}</span>
            </div>
          </div>
          <div style={{ fontSize: FS.sm, color: Z.td, marginTop: 4 }}>Contact publisher to change commission settings.</div>
        </div>}

        {/* Notification Preferences */}
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Notifications</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {["New sales", "Proposals", "Deadlines", "Billing alerts", "Team updates"].map(pref => {
              const isOn = !(me.alerts || []).includes("mute_" + pref.toLowerCase().replace(/ /g, "_"));
              return <div key={pref} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderRadius: Ri, background: Z.bg }}>
                <span style={{ fontSize: FS.base, color: Z.tx }}>{pref}</span>
                <div style={{ width: 36, height: 20, borderRadius: 10, background: isOn ? Z.go : Z.sa, cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
                  <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: isOn ? 18 : 2, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                </div>
              </div>;
            })}
          </div>
        </div>

        {/* Permissions (read-only) */}
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Permissions</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {(me.permissions || []).map(p => (
              <span key={p} style={{ padding: "3px 8px", borderRadius: Ri, fontSize: FS.sm, fontWeight: FW.semi, background: Z.sa, color: Z.tm }}>{p}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  </>;
};

export default ProfilePanel;
