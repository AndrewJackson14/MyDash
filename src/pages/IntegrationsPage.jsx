import { useState, useEffect } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, CARD, R } from "../lib/theme";
import { Ic, Btn, Inp, Sel, TA, Card, TB, Stat, Modal, GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, ListCard, ListDivider, ListGrid, glass } from "../components/ui";
import { usePageHeader } from "../contexts/PageHeaderContext";
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
const IntegrationsPage = ({ pubs, isActive }) => {
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({ breadcrumb: [{ label: "Home" }, { label: "Integrations" }], title: "Integrations" });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);
  const [tab, setTab] = useState("Overview");

  // ─── QuickBooks Status ─────────────────────────────────
  const [qbStatus, setQbStatus] = useState("disconnected");
  const [qbCompany, setQbCompany] = useState("");

  // ─── Integration Health ───────────────────────────────
  const [health, setHealth] = useState(null);
  const loadHealth = async () => {
    const [qbRes, gmailRes, gcalRes, stripeRes] = await Promise.all([
      supabase.from("quickbooks_tokens").select("company_name, token_expiry, updated_at").limit(1).maybeSingle(),
      supabase.from("gmail_tokens").select("email, token_expiry").order("token_expiry", { ascending: true }),
      supabase.from("google_tokens").select("email, token_expiry").order("token_expiry", { ascending: true }),
      supabase.from("clients").select("id", { count: "exact", head: true }).not("stripe_customer_id", "is", null),
    ]);
    setHealth({
      qb: qbRes.data ? { name: qbRes.data.company_name, expiry: qbRes.data.token_expiry, updated: qbRes.data.updated_at } : null,
      gmail: { count: gmailRes.data?.length || 0, expiry: gmailRes.data?.[0]?.token_expiry },
      gcal: { count: gcalRes.data?.length || 0, expiry: gcalRes.data?.[0]?.token_expiry },
      stripe: { count: stripeRes.count || 0 },
    });
  };
  useEffect(() => { loadHealth(); }, []);

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

    // The OAuth popup writes auth-result keys to localStorage as a fallback when
    // it can't postMessage back (e.g. after a cross-origin redirect strips opener).
    // Use the storage event instead of polling — fires synchronously on the next
    // tick after the popup writes, so there's no perceived latency, and there's
    // no idle CPU spend when the page is backgrounded.
    const onStorage = (ev) => {
      try {
        if (ev.key === "qb-auth-result" && ev.newValue) {
          const data = JSON.parse(ev.newValue);
          if (Date.now() - data.ts < 30000) { setQbStatus("connected"); setQbCompany(data.company || ""); }
          localStorage.removeItem("qb-auth-result");
        }
        if (ev.key === "google-auth-result" && ev.newValue) {
          const data = JSON.parse(ev.newValue);
          if (Date.now() - data.ts < 30000) { setGoogleStatus("connected"); setGoogleEmail(data.email || ""); }
          localStorage.removeItem("google-auth-result");
        }
      } catch { /* ok */ }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("message", handler);
      window.removeEventListener("storage", onStorage);
    };
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
    {/* Title moved to TopBar via usePageHeader; no inline header needed. */}

    <TabRow><TB tabs={["Overview", "QuickBooks", "Google Workspace", "Social", "StellarPress", "Database"]} active={tab} onChange={setTab} /></TabRow>

    {/* ════════ OVERVIEW ════════ */}
    {tab === "Overview" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <Stat label="Connected" value={connectedCount} sub="of 4 integrations" />
        <Stat label="QuickBooks" value={qbStatus === "connected" ? "\u2713" : "\u2014"} sub={qbStatus === "connected" ? qbCompany : "Not connected"} color={qbStatus === "connected" ? Z.su : Z.da} />
        <Stat label="Google" value={googleStatus === "connected" ? "\u2713" : "\u2014"} sub={googleStatus === "connected" ? googleEmail : "Not connected"} color={googleStatus === "connected" ? Z.su : Z.da} />
        <Stat label="Database" value={sbConnected ? "Online" : "Offline"} sub={sbConnected ? "Supabase connected" : "Running locally"} color={sbConnected ? Z.su : Z.wa} />
      </div>

      {/* ── Integration Health Panel ─── */}
      {health && (
        <GlassCard>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1 }}>Token Health</span>
            <Btn sm v="ghost" onClick={loadHealth}>Refresh</Btn>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
            {[
              { name: "QuickBooks", ok: !!health.qb, detail: health.qb?.name || "Not connected", expiry: health.qb?.expiry },
              { name: "Gmail", ok: health.gmail.count > 0, detail: `${health.gmail.count} account${health.gmail.count !== 1 ? "s" : ""}`, expiry: health.gmail.expiry },
              { name: "Google Cal", ok: health.gcal.count > 0, detail: `${health.gcal.count} account${health.gcal.count !== 1 ? "s" : ""}`, expiry: health.gcal.expiry },
              { name: "Stripe", ok: health.stripe.count > 0, detail: `${health.stripe.count} client${health.stripe.count !== 1 ? "s" : ""} with cards`, expiry: null },
              { name: "StellarPress", ok: true, detail: "Shared database", expiry: null },
            ].map(int => {
              const expiryDate = int.expiry ? new Date(int.expiry) : null;
              const hoursLeft = expiryDate ? (expiryDate.getTime() - Date.now()) / 3600000 : null;
              const expiring = hoursLeft != null && hoursLeft > 0 && hoursLeft < 24;
              const expired = hoursLeft != null && hoursLeft <= 0;
              const statusColor = !int.ok ? Z.da : expired ? Z.da : expiring ? Z.wa : Z.su;
              const statusLabel = !int.ok ? "Disconnected" : expired ? "Expired" : expiring ? "Expiring" : "Connected";
              return (
                <div key={int.name} style={{ padding: "10px 12px", background: Z.bg, borderRadius: Ri, borderTop: `3px solid ${statusColor}` }}>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tx, marginBottom: 4 }}>{int.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor }} />
                    <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: statusColor }}>{statusLabel}</span>
                  </div>
                  <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND }}>{int.detail}</div>
                  {expiryDate && !expired && <div style={{ fontSize: 9, color: expiring ? Z.wa : Z.td, fontFamily: COND, marginTop: 2 }}>Token: {hoursLeft < 1 ? `${Math.round(hoursLeft * 60)}m left` : `${Math.round(hoursLeft)}h left`}</div>}
                  {expired && <div style={{ fontSize: 9, color: Z.da, fontWeight: FW.bold, fontFamily: COND, marginTop: 2 }}>Token expired — reconnect</div>}
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

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
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tx }}>{googleEmail}</div>
                  <div style={{ fontSize: FS.sm, color: Z.go, fontWeight: FW.semi, fontFamily: COND }}>Connected</div>
                </div>
                <Btn sm v="ghost" onClick={disconnectGoogle} style={{ color: Z.da, fontSize: FS.xs }}>Disconnect</Btn>
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

            {/* Disconnect moved inline next to Connected status */}
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

    {/* ════════ SOCIAL TAB ════════ */}
    {tab === "Social" && <SocialIntegrationsTab pubs={pubs} />}

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

// ─── SocialIntegrationsTab ─────────────────────────────────────
// Org-wide view of every publication's per-network status plus a
// month-to-date X usage panel. Reads from social_accounts_safe (token
// columns elided) so this is safe for any authenticated user.
// Instagram column shows "via FB" because we don't post to IG directly —
// Meta's native Page → IG cross-post (configured in Business Suite)
// mirrors every FB post automatically. Status column tracks FB but
// labels it as "via FB" so users understand the model.
const PROVIDERS_M = [
  { id: "x", label: "X", live: true },
  { id: "facebook", label: "Facebook", live: true },
  { id: "instagram", label: "Instagram", live: true, viaFacebook: true },
  { id: "linkedin", label: "LinkedIn", live: false },
];
const X_BUDGET_USD = 100;

const SocialIntegrationsTab = ({ pubs = [] }) => {
  const activePubs = (pubs || []).filter((p) => !p.dormant);
  const [accounts, setAccounts] = useState([]);
  const [usage, setUsage] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // social_accounts_safe is the token-stripped view — this gives us
      // pub_id, provider, status, account_label without ever exposing
      // tokens to the client. (Direct social_accounts SELECTs return
      // zero rows for authenticated users by RLS design.)
      const { data: accs } = await supabase
        .from("social_accounts_safe")
        .select("pub_id, provider, status, account_label, instagram_linked");
      const period = new Date().toISOString().slice(0, 7); // YYYY-MM (UTC)
      const { data: us } = await supabase
        .from("provider_usage")
        .select("provider, pub_id, period, writes_count, estimated_cost_usd")
        .eq("period", period);
      if (!cancelled) {
        setAccounts(accs || []);
        setUsage(us || []);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Build pub_id → { provider → row } lookup once for the matrix.
  // Instagram column is synthesized from the facebook row regardless of
  // instagram_linked — Meta's cross-post handles the mirror, so any
  // connected FB Page implies an IG-reachable destination.
  const byPubProvider = {};
  for (const a of accounts) {
    if (!byPubProvider[a.pub_id]) byPubProvider[a.pub_id] = {};
    byPubProvider[a.pub_id][a.provider] = a;
    if (a.provider === "facebook") {
      byPubProvider[a.pub_id]["instagram"] = { ...a, provider: "instagram" };
    }
  }

  const expired = accounts.filter((a) => a.status === "expired");

  // X usage aggregate. Sum across pubs because the X spend cap is org-wide.
  const xUsage = usage.filter((u) => u.provider === "x");
  const xWrites = xUsage.reduce((s, u) => s + (u.writes_count || 0), 0);
  const xSpend = xUsage.reduce((s, u) => s + Number(u.estimated_cost_usd || 0), 0);
  const xRemaining = Math.max(0, X_BUDGET_USD - xSpend);
  const xPct = Math.min(100, (xSpend / X_BUDGET_USD) * 100);

  return <>
    {/* ── X usage panel ────────────────────────────────── */}
    <GlassCard>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1 }}>X Usage — Month to Date</span>
        <span style={{ fontSize: FS.xs, color: Z.tm }}>Cap: ${X_BUDGET_USD}/mo (set in X dev console)</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 12 }}>
        <Stat label="Posts" value={xWrites} sub="this month" />
        <Stat label="Estimated Spend" value={`$${xSpend.toFixed(2)}`} sub={`of $${X_BUDGET_USD}`} color={xPct >= 80 ? Z.wa : Z.su} />
        <Stat label="Remaining" value={`$${xRemaining.toFixed(2)}`} sub={`${(100 - xPct).toFixed(0)}% left`} color={xPct >= 80 ? Z.wa : Z.su} />
      </div>
      {/* Budget progress bar */}
      <div style={{ height: 8, background: Z.bg, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${xPct}%`, height: "100%", background: xPct >= 80 ? Z.wa : Z.su, transition: "width 240ms ease" }} />
      </div>
      {xPct >= 80 && <div style={{ marginTop: 8, fontSize: FS.xs, color: Z.wa, fontWeight: FW.heavy }}>⚠ Approaching budget cap. The publish worker will halt X posts once estimated spend reaches ${X_BUDGET_USD}.</div>}
    </GlassCard>

    {/* ── Tokens needing reconnection ──────────────────── */}
    {expired.length > 0 && (
      <GlassCard style={{ borderLeft: `3px solid ${Z.da}` }}>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Tokens Needing Reconnection</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {expired.map((a, i) => {
            const pub = activePubs.find((p) => p.id === a.pub_id);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: Z.bg, borderRadius: Ri, border: `1px solid ${Z.bd}` }}>
                <div>
                  <div style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx }}>{pub?.name || a.pub_id} · {a.provider.toUpperCase()}</div>
                  <div style={{ fontSize: FS.xs, color: Z.tm }}>{a.account_label}</div>
                </div>
                <span style={{ fontSize: FS.xs, color: Z.da, fontWeight: FW.heavy }}>Open Publications → {pub?.name || ""} to reconnect</span>
              </div>
            );
          })}
        </div>
      </GlassCard>
    )}

    {/* ── Publication × Network matrix ─────────────────── */}
    <GlassCard noPad>
      <div style={{ padding: "16px 22px 8px" }}>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1 }}>Publication × Network</div>
        <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 4 }}>X and Facebook are live. Instagram mirrors via Meta's native FB → IG cross-post (configure per Page in Business Suite). LinkedIn is M3.</div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS.sm }}>
          <thead>
            <tr style={{ background: Z.bg }}>
              <th style={{ textAlign: "left", padding: "10px 22px", color: Z.tm, fontWeight: FW.heavy, textTransform: "uppercase", fontSize: FS.xs, letterSpacing: 1 }}>Publication</th>
              {PROVIDERS_M.map((p) => (
                <th key={p.id} style={{ textAlign: "center", padding: "10px 14px", color: Z.tm, fontWeight: FW.heavy, textTransform: "uppercase", fontSize: FS.xs, letterSpacing: 1, opacity: p.live ? 1 : 0.55 }}>
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activePubs.map((pub) => {
              const row = byPubProvider[pub.id] || {};
              return (
                <tr key={pub.id} style={{ borderTop: `1px solid ${Z.bd}` }}>
                  <td style={{ padding: "10px 22px", color: Z.tx, fontWeight: FW.heavy }}>{pub.name}</td>
                  {PROVIDERS_M.map((p) => {
                    const acc = row[p.id];
                    const status = !p.live ? "disconnected" : acc?.status === "connected" ? "connected" : acc?.status === "expired" ? "configured" : "disconnected";
                    return (
                      <td key={p.id} style={{ padding: "10px 14px", textAlign: "center", opacity: p.live ? 1 : 0.55 }}>
                        <div style={{ display: "inline-flex" }}><StatusDot status={status} /></div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {activePubs.length === 0 && (
              <tr><td colSpan={1 + PROVIDERS_M.length} style={{ padding: 20, textAlign: "center", color: Z.tm }}>No active publications.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </GlassCard>
  </>;
};
