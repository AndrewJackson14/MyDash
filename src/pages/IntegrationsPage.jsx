import { useState } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, CARD, R } from "../lib/theme";
import { Ic, Btn, Inp, Sel, TA, Card, TB, Stat, Modal , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, ListCard, ListDivider, ListGrid, glass } from "../components/ui";
import { SITES } from "../constants";

// ─── Integration status helpers ─────────────────────────────
const STATUS = { connected: { label: "Connected", color: Z.su }, disconnected: { label: "Not Connected", color: Z.da }, configured: { label: "Configured", color: Z.wa }, syncing: { label: "Syncing...", color: Z.pu } };
const StatusDot = ({ status }) => {
  const s = STATUS[status] || STATUS.disconnected;
  return <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
    <div style={{ width: 8, height: 8, borderRadius: R, background: s.color, boxShadow: status === "connected" ? `0 0 6px ${s.color}` : "none" }} />
    <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: s.color }}>{s.label}</span>
  </div>;
};

// ─── Module ─────────────────────────────────────────────────
const IntegrationsPage = ({ pubs }) => {
  const [tab, setTab] = useState("Overview");
  const [qbModal, setQbModal] = useState(false);
  const [wpModal, setWpModal] = useState(false);
  const [gcModal, setGcModal] = useState(false);

  // ─── QuickBooks Config ──────────────────────────────────
  const [qbConfig, setQbConfig] = useState({
    clientId: "", clientSecret: "", companyId: "", redirectUri: "",
    status: "disconnected", lastSync: null,
    syncInvoices: true, syncPayments: true, syncExpenses: false,
  });

  // ─── StellarPress Config ─────────────────────────────────
  const spConnected = SITES.length > 0;

  // ─── Google Calendar Config ─────────────────────────────
  const [gcConfig, setGcConfig] = useState({
    clientId: "", apiKey: "", calendarId: "",
    status: "disconnected", lastSync: null,
    syncEvents: true, syncDeadlines: true,
  });

  // ─── Supabase Status ────────────────────────────────────
  const sbUrl = typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPABASE_URL : null;
  const sbConnected = !!sbUrl;

  // ─── Handlers ───────────────────────────────────────────
  const testQbConnection = () => {
    if (!qbConfig.clientId || !qbConfig.clientSecret) return;
    setQbConfig(c => ({ ...c, status: "syncing" }));
    // Simulate connection test
    setTimeout(() => setQbConfig(c => ({ ...c, status: "configured", lastSync: new Date().toISOString() })), 1500);
  };


  const testGcConnection = () => {
    if (!gcConfig.clientId) return;
    setGcConfig(c => ({ ...c, status: "syncing" }));
    setTimeout(() => setGcConfig(c => ({ ...c, status: "configured", lastSync: new Date().toISOString() })), 1200);
  };

  const connectedCount = [
    qbConfig.status !== "disconnected" ? 1 : 0,
    spConnected ? 1 : 0,
    gcConfig.status !== "disconnected" ? 1 : 0,
    sbConnected ? 1 : 0,
  ].reduce((s, x) => s + x, 0);

  // ─── Render ─────────────────────────────────────────────
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="My Integrations" />

    <TabRow><TB tabs={["Overview", "QuickBooks", "StellarPress", "Calendar", "Database"]} active={tab} onChange={setTab} /></TabRow>

    {/* ════════ OVERVIEW ════════ */}
    {tab === "Overview" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <Stat label="Connected" value={connectedCount} sub="of 4 integrations" />
        <Stat label="QuickBooks" value={qbConfig.status === "disconnected" ? "—" : "✓"} sub={STATUS[qbConfig.status]?.label} color={STATUS[qbConfig.status]?.color} />
        <Stat label="StellarPress" value={spConnected ? "✓" : "—"} sub={`${SITES.length} sites`} color={spConnected ? Z.su : Z.da} />
        <Stat label="Database" value={sbConnected ? "Online" : "Offline"} sub={sbConnected ? "Supabase connected" : "Running locally"} color={sbConnected ? Z.su : Z.wa} />
      </div>

      {/* Integration cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

        {/* QuickBooks */}
        <GlassCard style={{ borderLeft: `3px solid ${STATUS[qbConfig.status]?.color || Z.da}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: FS.lg, fontWeight: FW.heavy, color: Z.tx }}>QuickBooks Online</div>
              <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 2 }}>Invoicing, payments, merchant services</div>
            </div>
            <StatusDot status={qbConfig.status} />
          </div>
          <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 10 }}>
            {qbConfig.status === "disconnected"
              ? "Connect QuickBooks to send invoices, process card payments, and sync financial data."
              : `Last sync: ${qbConfig.lastSync ? new Date(qbConfig.lastSync).toLocaleString() : "Never"}`}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn sm onClick={() => { setTab("QuickBooks"); }}>{qbConfig.status === "disconnected" ? "Configure" : "Settings"}</Btn>
            {qbConfig.status !== "disconnected" && <Btn sm v="secondary" onClick={testQbConnection}>Test Connection</Btn>}
          </div>
          <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 8 }}>
            Capabilities: Invoice sync · Card processing · Payment recording · Expense tracking
          </div>
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
          <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 10 }}>
            Publish stories directly from MyDash Editorial to StellarPress public sites via shared Supabase database.
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn sm onClick={() => setTab("StellarPress")}>Details</Btn>
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
            {SITES.map(s => <span key={s.id} style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.su, background: Z.ss, padding: "2px 6px", borderRadius: Ri }}>{s.name.split(" ").map(w => w[0]).join("")}</span>)}
          </div>
        </GlassCard>

        {/* Google Calendar */}
        <GlassCard style={{ borderLeft: `3px solid ${STATUS[gcConfig.status]?.color || Z.da}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: FS.lg, fontWeight: FW.heavy, color: Z.tx }}>Google Calendar</div>
              <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 2 }}>Team scheduling & deadlines</div>
            </div>
            <StatusDot status={gcConfig.status} />
          </div>
          <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 10 }}>
            Sync calendar events, ad deadlines, and editorial deadlines with Google Calendar.
          </div>
          <Btn sm onClick={() => setTab("Calendar")}>{gcConfig.status === "disconnected" ? "Configure" : "Settings"}</Btn>
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
          <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 10 }}>
            {sbConnected ? "Connected to Supabase. All data persists to the cloud database." : "Running in offline mode. Data is stored locally in browser memory and will not persist."}
          </div>
          <Btn sm onClick={() => setTab("Database")}>{sbConnected ? "Details" : "Configure"}</Btn>
        </GlassCard>
      </div>
    </>}

    {/* ════════ QUICKBOOKS TAB ════════ */}
    {tab === "QuickBooks" && <>
      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: FW.heavy, color: Z.tx }}>QuickBooks Online</div>
            <div style={{ fontSize: FS.sm, color: Z.tm }}>Connect your QuickBooks account to enable invoice sync and payment processing</div>
          </div>
          <StatusDot status={qbConfig.status} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: CARD.pad, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}` }}>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>API Credentials</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Inp label="Client ID" value={qbConfig.clientId} onChange={e => setQbConfig(c => ({ ...c, clientId: e.target.value }))} placeholder="Enter QuickBooks Client ID" />
              <Inp label="Client Secret" type="password" value={qbConfig.clientSecret} onChange={e => setQbConfig(c => ({ ...c, clientSecret: e.target.value }))} placeholder="Enter Client Secret" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <Inp label="Company ID" value={qbConfig.companyId} onChange={e => setQbConfig(c => ({ ...c, companyId: e.target.value }))} placeholder="Your QuickBooks Company ID" />
              <Inp label="Redirect URI" value={qbConfig.redirectUri} onChange={e => setQbConfig(c => ({ ...c, redirectUri: e.target.value }))} placeholder="https://mydash.13stars.media/auth/qb" />
            </div>
          </div>

          <div style={{ padding: CARD.pad, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}` }}>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Sync Settings</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { key: "syncInvoices", label: "Sync Invoices", desc: "Send invoices from MyDash Billing to QuickBooks for delivery and tracking" },
                { key: "syncPayments", label: "Sync Payments", desc: "Record payments in QuickBooks when received through MyDash" },
                { key: "syncExpenses", label: "Pull Expenses (Read-Only)", desc: "Display QuickBooks expense data in MyDash P&L reports" },
              ].map(opt => <label key={opt.key} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: R, cursor: "pointer", background: "transparent" }}>
                <input type="checkbox" checked={qbConfig[opt.key]} onChange={e => setQbConfig(c => ({ ...c, [opt.key]: e.target.checked }))} style={{ marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{opt.label}</div>
                  <div style={{ fontSize: FS.xs, color: Z.tm }}>{opt.desc}</div>
                </div>
              </label>)}
            </div>
          </div>

          <div style={{ padding: CARD.pad, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}` }}>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>How It Works</div>
            <div style={{ fontSize: FS.base, color: Z.tm, lineHeight: 1.6 }}>
              MyDash acts as the command center. When you create an invoice in My Billing and click "Send," MyDash creates the invoice in QuickBooks via API, and QuickBooks delivers it to the client. When a card payment is processed through MyDash, QuickBooks handles the merchant services transaction and MyDash records the result. Expense data flows one-way from QuickBooks into MyDash for the P&L reports — MyDash never creates expenses.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={testQbConnection} disabled={!qbConfig.clientId || !qbConfig.clientSecret}>
              {qbConfig.status === "syncing" ? "Testing..." : qbConfig.status === "disconnected" ? "Connect to QuickBooks" : "Reconnect"}
            </Btn>
            {qbConfig.status !== "disconnected" && <Btn v="ghost" onClick={() => setQbConfig(c => ({ ...c, status: "disconnected", lastSync: null }))}>Disconnect</Btn>}
          </div>
        </div>
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

      <GlassCard style={{ background: Z.bg }}>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>StellarPress Publishing Workflow</div>
        <div style={{ fontSize: FS.base, color: Z.tm, lineHeight: 1.6 }}>
          When a story reaches "Approved" status in the editorial workflow, an editor can publish it to the web through the "Publish to Web" button. This sets the story status to "Published," generates a URL slug, and populates the category, excerpt, and SEO fields. The story immediately appears on the corresponding StellarPress public site — no API calls needed, since both MyDash and StellarPress share the same Supabase database.
        </div>
      </GlassCard>
    </>}

    {/* ════════ CALENDAR TAB ════════ */}
    {tab === "Calendar" && <>
      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: FW.heavy, color: Z.tx }}>Google Calendar</div>
            <div style={{ fontSize: FS.sm, color: Z.tm }}>Sync MyDash events and deadlines with Google Calendar</div>
          </div>
          <StatusDot status={gcConfig.status} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: CARD.pad, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}` }}>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>API Credentials</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Inp label="Client ID" value={gcConfig.clientId} onChange={e => setGcConfig(c => ({ ...c, clientId: e.target.value }))} placeholder="Google OAuth Client ID" />
              <Inp label="API Key" value={gcConfig.apiKey} onChange={e => setGcConfig(c => ({ ...c, apiKey: e.target.value }))} placeholder="Google API Key" />
            </div>
            <div style={{ marginTop: 10 }}>
              <Inp label="Calendar ID" value={gcConfig.calendarId} onChange={e => setGcConfig(c => ({ ...c, calendarId: e.target.value }))} placeholder="primary or calendar@group.calendar.google.com" />
            </div>
          </div>

          <div style={{ padding: CARD.pad, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}` }}>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Sync Options</div>
            {[
              { key: "syncEvents", label: "Sync Calendar Events", desc: "Push MyDash calendar events (calls, meetings, tasks) to Google Calendar" },
              { key: "syncDeadlines", label: "Sync Deadlines", desc: "Push ad deadlines and editorial deadlines as all-day events" },
            ].map(opt => <label key={opt.key} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: R, cursor: "pointer", background: "transparent" }}>
              <input type="checkbox" checked={gcConfig[opt.key]} onChange={e => setGcConfig(c => ({ ...c, [opt.key]: e.target.checked }))} style={{ marginTop: 2 }} />
              <div>
                <div style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{opt.label}</div>
                <div style={{ fontSize: FS.xs, color: Z.tm }}>{opt.desc}</div>
              </div>
            </label>)}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={testGcConnection} disabled={!gcConfig.clientId}>
              {gcConfig.status === "syncing" ? "Testing..." : gcConfig.status === "disconnected" ? "Connect" : "Reconnect"}
            </Btn>
            {gcConfig.status !== "disconnected" && <Btn v="ghost" onClick={() => setGcConfig(c => ({ ...c, status: "disconnected", lastSync: null }))}>Disconnect</Btn>}
          </div>
        </div>
      </GlassCard>
    </>}

    {/* ════════ DATABASE TAB ════════ */}
    {tab === "Database" && <>
      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: FW.heavy, color: Z.tx }}>Supabase Database</div>
            <div style={{ fontSize: FS.sm, color: Z.tm }}>PostgreSQL database with real-time subscriptions and row-level security</div>
          </div>
          <StatusDot status={sbConnected ? "connected" : "disconnected"} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: CARD.pad, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}` }}>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Connection</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Status</div>
                <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: sbConnected ? Z.su : Z.wa, marginTop: 2 }}>{sbConnected ? "Connected" : "Offline Mode"}</div>
              </div>
              <div>
                <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>URL</div>
                <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 2, wordBreak: "break-all" }}>{sbUrl || "Not configured — set VITE_SUPABASE_URL in .env"}</div>
              </div>
            </div>
          </div>

          <div style={{ padding: CARD.pad, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}` }}>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Configuration</div>
            <div style={{ fontSize: FS.base, color: Z.tm, lineHeight: 1.6 }}>
              To connect to Supabase, create a <code style={{ background: Z.sa, padding: "1px 4px", borderRadius: R }}>.env</code> file in the project root with:
            </div>
            <pre style={{ background: Z.sa, padding: 16, borderRadius: R, fontSize: FS.sm, color: Z.ac, marginTop: 8, lineHeight: 1.5, overflow: "auto" }}>{`VITE_SUPABASE_URL=https://your-project.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-key-here`}</pre>
            <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 8 }}>
              Then run the schema migrations in <code style={{ background: Z.sa, padding: "1px 4px", borderRadius: R }}>supabase/migrations/</code> in order (001 through 004) in the Supabase SQL editor.
            </div>
          </div>

          <div style={{ padding: CARD.pad, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}` }}>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Schema Status</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[
                { label: "001 — Initial Schema", tables: "publications, issues, team, clients, sales, proposals, stories, calendar, flatplan" },
                { label: "002 — Seed Data", tables: "Sample publications, clients, stories" },
                { label: "003 — Realistic Seed", tables: "Production-realistic sample data" },
                { label: "004 — Phase 2 Expansion", tables: "invoices, payments, subscribers, tickets, legal_notices, creative_jobs, + 14 more" },
              ].map(m => <div key={m.label} style={{ padding: 10, ...glass(), borderRadius: R, border: `1px solid ${Z.bd}` }}>
                <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{m.label}</div>
                <div style={{ fontSize: FS.micro, color: Z.td, marginTop: 2 }}>{m.tables}</div>
              </div>)}
            </div>
          </div>
        </div>
      </GlassCard>
    </>}
  </div>;
};

export default IntegrationsPage;
