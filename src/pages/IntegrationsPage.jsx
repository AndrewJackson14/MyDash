import { useState, useEffect } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, CARD, R } from "../lib/theme";
import { Ic, Btn, Inp, Sel, TA, Card, TB, Stat, Modal, GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, ListCard, ListDivider, ListGrid, glass } from "../components/ui";
import { SITES } from "../constants";
import { supabase, EDGE_FN_URL } from "../lib/supabase";

const AUTH_BASE = EDGE_FN_URL;

// ─── Integration status helpers ─────────────────────────────
const STATUS = { connected: { label: "Connected", color: Z.su }, disconnected: { label: "Not Connected", color: Z.da }, configured: { label: "Configured", color: Z.wa }, syncing: { label: "Syncing...", color: Z.pu } };
const StatusDot = ({ status }) => {
  const s = STATUS[status] || STATUS.disconnected;
  return <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <div style={{ width: 8, height: 8, borderRadius: R, background: s.color, boxShadow: status === "connected" ? `0 0 6px ${s.color}` : "none" }} />
    <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: s.color }}>{s.label}</span>
  </div>;
};

async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : "";
}

// ─── Module ─────────────────────────────────────────────────
const IntegrationsPage = ({ pubs }) => {
  const [tab, setTab] = useState("Overview");

  // ─── QuickBooks Status ─────────────────────────────────
  const [qbStatus, setQbStatus] = useState("disconnected");
  const [qbCompany, setQbCompany] = useState("");

  // ─── Google Status ─────────────────────────────────────
  const [googleStatus, setGoogleStatus] = useState("disconnected");
  const [googleEmail, setGoogleEmail] = useState("");

  // ─── StellarPress Config ─────────────────────────────────
  const spConnected = SITES.length > 0;

  // ─── Supabase Status ────────────────────────────────────
  const sbUrl = typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPABASE_URL : null;
  const sbConnected = !!sbUrl;

  // ─── Load connection statuses ──────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const auth = await getAuthHeader();
        if (!auth) return;
        // QB status
        const qbRes = await fetch(`${AUTH_BASE}/qb-auth?action=status`, { headers: { Authorization: auth } });
        const qbData = await qbRes.json();
        if (qbData.connected) { setQbStatus("connected"); setQbCompany(qbData.companyName || ""); }
        // Google status
        const gRes = await fetch(`${AUTH_BASE}/gmail-auth?action=status`, { headers: { Authorization: auth } });
        const gData = await gRes.json();
        if (gData.connected) { setGoogleStatus("connected"); setGoogleEmail(gData.email || ""); }
      } catch { /* ok */ }
    })();
  }, []);

  // ─── Listen for OAuth popup callbacks (postMessage + localStorage fallback) ──
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === "qb-auth-success") { setQbStatus("connected"); setQbCompany(e.data.company || ""); }
      if (e.data?.type === "google-auth-success") { setGoogleStatus("connected"); setGoogleEmail(e.data.email || ""); }
    };
    window.addEventListener("message", handler);

    // Poll localStorage as fallback (popup may lose opener reference after OAuth redirect)
    const poll = setInterval(() => {
      try {
        const qbResult = localStorage.getItem("qb-auth-result");
        if (qbResult) {
          const data = JSON.parse(qbResult);
          if (Date.now() - data.ts < 30000) { setQbStatus("connected"); setQbCompany(data.company || ""); }
          localStorage.removeItem("qb-auth-result");
        }
        const gResult = localStorage.getItem("google-auth-result");
        if (gResult) {
          const data = JSON.parse(gResult);
          if (Date.now() - data.ts < 30000) { setGoogleStatus("connected"); setGoogleEmail(data.email || ""); }
          localStorage.removeItem("google-auth-result");
        }
      } catch { /* ok */ }
    }, 1000);

    return () => { window.removeEventListener("message", handler); clearInterval(poll); };
  }, []);

  // ─── Connect handlers ─────────────────────────────────
  const connectQB = async () => {
    const auth = await getAuthHeader();
    const res = await fetch(`${AUTH_BASE}/qb-auth?action=start`, { headers: { Authorization: auth } });
    const { url } = await res.json();
    window.open(url, "qb-auth", "width=600,height=700,left=200,top=100");
  };

  const disconnectQB = async () => {
    const auth = await getAuthHeader();
    await fetch(`${AUTH_BASE}/qb-auth?action=disconnect`, { method: "POST", headers: { Authorization: auth, "x-action": "disconnect" } });
    setQbStatus("disconnected"); setQbCompany("");
  };

  const connectGoogle = async () => {
    const auth = await getAuthHeader();
    const res = await fetch(`${AUTH_BASE}/gmail-auth?action=start`, { headers: { Authorization: auth } });
    const { url } = await res.json();
    window.open(url, "google-auth", "width=500,height=700,left=200,top=100");
  };

  const disconnectGoogle = async () => {
    const auth = await getAuthHeader();
    await fetch(`${AUTH_BASE}/gmail-auth?action=disconnect`, { method: "POST", headers: { Authorization: auth, "x-action": "disconnect" } });
    setGoogleStatus("disconnected"); setGoogleEmail("");
  };

  const connectedCount = [
    qbStatus === "connected" ? 1 : 0,
    googleStatus === "connected" ? 1 : 0,
    spConnected ? 1 : 0,
    sbConnected ? 1 : 0,
  ].reduce((s, x) => s + x, 0);

  // ─── Render ─────────────────────────────────────────────
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="Integrations" />

    <TabRow><TB tabs={["Overview", "QuickBooks", "Google Workspace", "StellarPress", "Database"]} active={tab} onChange={setTab} /></TabRow>

    {/* ════════ OVERVIEW ════════ */}
    {tab === "Overview" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <Stat label="Connected" value={connectedCount} sub="of 4 integrations" />
        <Stat label="QuickBooks" value={qbStatus === "connected" ? "\u2713" : "\u2014"} sub={qbStatus === "connected" ? qbCompany : "Not connected"} color={qbStatus === "connected" ? Z.su : Z.da} />
        <Stat label="Google" value={googleStatus === "connected" ? "\u2713" : "\u2014"} sub={googleStatus === "connected" ? googleEmail : "Not connected"} color={googleStatus === "connected" ? Z.su : Z.da} />
        <Stat label="Database" value={sbConnected ? "Online" : "Offline"} sub={sbConnected ? "Supabase connected" : "Running locally"} color={sbConnected ? Z.su : Z.wa} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* QuickBooks */}
        <GlassCard style={{ borderLeft: `3px solid ${qbStatus === "connected" ? Z.su : Z.da}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: FS.lg, fontWeight: FW.heavy, color: Z.tx }}>QuickBooks Online</div>
              <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 2 }}>Invoicing & payment sync</div>
            </div>
            <StatusDot status={qbStatus} />
          </div>
          <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 10 }}>
            {qbStatus === "connected" ? `Connected to ${qbCompany}` : "Connect QuickBooks to push invoices and payments from Billing."}
          </div>
          <Btn sm onClick={() => setTab("QuickBooks")}>{qbStatus === "connected" ? "Manage" : "Connect"}</Btn>
        </GlassCard>

        {/* Google Workspace */}
        <GlassCard style={{ borderLeft: `3px solid ${googleStatus === "connected" ? Z.su : Z.da}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: FS.lg, fontWeight: FW.heavy, color: Z.tx }}>Google Workspace</div>
              <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 2 }}>Gmail & Calendar</div>
            </div>
            <StatusDot status={googleStatus} />
          </div>
          <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 10 }}>
            {googleStatus === "connected" ? `Connected as ${googleEmail}` : "Connect your Google account for Mail and Calendar."}
          </div>
          <Btn sm onClick={() => setTab("Google Workspace")}>{googleStatus === "connected" ? "Manage" : "Connect"}</Btn>
        </GlassCard>

        {/* StellarPress */}
        <GlassCard style={{ borderLeft: `3px solid ${spConnected ? Z.su : Z.da}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: FS.lg, fontWeight: FW.heavy, color: Z.tx }}>StellarPress</div>
              <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 2 }}>{SITES.length} publication sites</div>
            </div>
            <StatusDot status={spConnected ? "connected" : "disconnected"} />
          </div>
          <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 10 }}>Publish stories directly to StellarPress via shared Supabase database.</div>
          <Btn sm onClick={() => setTab("StellarPress")}>Details</Btn>
        </GlassCard>

        {/* Supabase */}
        <GlassCard style={{ borderLeft: `3px solid ${sbConnected ? Z.su : Z.wa}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: FS.lg, fontWeight: FW.heavy, color: Z.tx }}>Supabase Database</div>
              <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 2 }}>Data persistence & auth</div>
            </div>
            <StatusDot status={sbConnected ? "connected" : "disconnected"} />
          </div>
          <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 10 }}>{sbConnected ? "Connected to Supabase cloud database." : "Running in offline mode."}</div>
          <Btn sm onClick={() => setTab("Database")}>Details</Btn>
        </GlassCard>
      </div>
    </>}

    {/* ════════ QUICKBOOKS TAB ════════ */}
    {tab === "QuickBooks" && <>
      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: FW.heavy, color: Z.tx }}>QuickBooks Online</div>
            <div style={{ fontSize: FS.sm, color: Z.tm }}>One-way sync: push invoices and payments from MyDash Billing to QuickBooks</div>
          </div>
          <StatusDot status={qbStatus} />
        </div>

        {qbStatus === "connected" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ padding: CARD.pad, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: R, background: Z.go + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{"\u2713"}</div>
                <div>
                  <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tx }}>{qbCompany || "QuickBooks Company"}</div>
                  <div style={{ fontSize: FS.sm, color: Z.go, fontWeight: FW.semi, fontFamily: COND }}>Connected</div>
                </div>
              </div>
            </div>

            <div style={{ padding: CARD.pad, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}` }}>
              <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>What Gets Synced</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { label: "Invoices", desc: "When you create an invoice in Billing, it gets pushed to QuickBooks" },
                  { label: "Payments", desc: "When a payment is recorded in MyDash, it's synced to QuickBooks" },
                  { label: "Customers", desc: "Client records are auto-created in QuickBooks when needed" },
                ].map(item => (
                  <div key={item.label} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", borderRadius: Ri, background: Z.sa }}>
                    <span style={{ color: Z.go, fontSize: FS.sm, fontWeight: FW.bold }}>{"\u2713"}</span>
                    <div>
                      <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{item.label}</div>
                      <div style={{ fontSize: FS.xs, color: Z.tm }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Btn sm v="danger" onClick={disconnectQB}>Disconnect QuickBooks</Btn>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ padding: 40, textAlign: "center", background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}` }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>{"\ud83d\udcb1"}</div>
              <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tx, marginBottom: 8 }}>Connect QuickBooks Online</div>
              <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 20, maxWidth: 400, margin: "0 auto 20px" }}>
                Sign in with your Intuit account to enable one-way sync of invoices and payments from MyDash Billing to QuickBooks.
              </div>
              <Btn onClick={connectQB}>Connect to QuickBooks</Btn>
            </div>

            <div style={{ padding: CARD.pad, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}` }}>
              <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>How It Works</div>
              <div style={{ fontSize: FS.base, color: Z.tm, lineHeight: 1.6 }}>
                MyDash pushes data to QuickBooks — never the other way. When you create an invoice in Billing, it creates a matching invoice in QuickBooks. When a payment is recorded, QuickBooks is updated. Client records are auto-matched or created as needed. Your bookkeeper sees everything in QuickBooks without manual data entry.
              </div>
            </div>
          </div>
        )}
      </GlassCard>
    </>}

    {/* ════════ GOOGLE WORKSPACE TAB ════════ */}
    {tab === "Google Workspace" && <>
      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: FW.heavy, color: Z.tx }}>Google Workspace</div>
            <div style={{ fontSize: FS.sm, color: Z.tm }}>Gmail, Calendar, and Contacts — connected via your Google account</div>
          </div>
          <StatusDot status={googleStatus} />
        </div>

        {googleStatus === "connected" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ padding: CARD.pad, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: R, background: Z.go + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{"\u2713"}</div>
                <div>
                  <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tx }}>{googleEmail}</div>
                  <div style={{ fontSize: FS.sm, color: Z.go, fontWeight: FW.semi, fontFamily: COND }}>Connected</div>
                </div>
              </div>
            </div>

            <div style={{ padding: CARD.pad, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}` }}>
              <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Connected Services</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { label: "Gmail", desc: "Read, compose, and manage email from the Mail page", icon: "\u2709" },
                  { label: "Google Calendar", desc: "Sync events and deadlines (Calendar revamp coming soon)", icon: "\ud83d\udcc5" },
                ].map(item => (
                  <div key={item.label} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", borderRadius: Ri, background: Z.sa }}>
                    <span style={{ fontSize: FS.md }}>{item.icon}</span>
                    <div>
                      <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{item.label}</div>
                      <div style={{ fontSize: FS.xs, color: Z.tm }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Btn sm v="danger" onClick={disconnectGoogle}>Disconnect Google Account</Btn>
          </div>
        ) : (
          <div style={{ padding: 40, textAlign: "center", background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}` }}>
            <Ic.mail size={48} color={Z.tm} />
            <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tx, marginTop: 12, marginBottom: 8 }}>Connect Google Workspace</div>
            <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 20, maxWidth: 400, margin: "0 auto 20px" }}>
              Sign in with your Google account to enable Gmail and Calendar integration in MyDash.
            </div>
            <Btn onClick={connectGoogle}>Connect Google Account</Btn>
          </div>
        )}
      </GlassCard>
    </>}

    {/* ════════ STELLARPRESS TAB ════════ */}
    {tab === "StellarPress" && <>
      <div style={{ fontSize: FS.base, color: Z.tm, marginBottom: 4 }}>StellarPress is connected via the shared Supabase database. Stories published in MyDash Editorial are instantly available on StellarPress public sites.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {SITES.map(site => <GlassCard key={site.id} style={{ borderLeft: `3px solid ${Z.su}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: FW.heavy, color: Z.tx }}>{site.name}</div>
              <div style={{ fontSize: FS.sm, color: Z.ac }}>{site.domain}</div>
            </div>
            <StatusDot status="connected" />
          </div>
        </GlassCard>)}
      </div>
    </>}

    {/* ════════ DATABASE TAB ════════ */}
    {tab === "Database" && <>
      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: FW.heavy, color: Z.tx }}>Supabase Database</div>
            <div style={{ fontSize: FS.sm, color: Z.tm }}>PostgreSQL with real-time subscriptions and row-level security</div>
          </div>
          <StatusDot status={sbConnected ? "connected" : "disconnected"} />
        </div>
        <div style={{ padding: CARD.pad, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Status</div>
              <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: sbConnected ? Z.su : Z.wa, marginTop: 2 }}>{sbConnected ? "Connected" : "Offline Mode"}</div>
            </div>
            <div>
              <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>URL</div>
              <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 2, wordBreak: "break-all" }}>{sbUrl || "Not configured"}</div>
            </div>
          </div>
        </div>
      </GlassCard>
    </>}
  </div>;
};

export default IntegrationsPage;
