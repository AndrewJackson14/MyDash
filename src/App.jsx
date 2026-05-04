// ============================================================
// App.jsx — Application Shell
// Persistent pages (display:none), role-based nav, back button
// ============================================================
import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense, memo } from "react";
import { useAppData } from "./hooks/useAppData";
import { useAuth } from "./hooks/useAuth";
import { useJurisdiction } from "./hooks/useJurisdiction";
import { supabase, isOnline, EDGE_FN_URL } from "./lib/supabase";
import { Z, DARK, LIGHT, COND, BODY, FONT_URL, R, INV, ZI, PRESS, PRESS_LIGHT, PRESS_DARK } from "./lib/theme";
import { Ic, ThemeToggle, BackBtn, ErrorBoundary } from "./components/ui";
// Seed data is only used when isOnline() returns false (offline mode
// or boot timeout/failure fallback). Importing it statically would put
// ~12 KB of mock fixtures in every cold load. The lazy load below
// runs only when `online` flips false; online users never download it.
import { useCrossModuleWiring } from "./hooks/useCrossModuleWiring";

// Eagerly loaded (always needed on boot) — keep this list short.
// Sidebar + MetadataStrip frame every page; useGmailUnread runs at App
// scope for the unread badge count. Everything else moved to lazy()
// below to keep the critical-path bundle as thin as the chrome allows.
import { useGmailUnread } from "./hooks/useGmailUnread";
import Sidebar from "./components/layout/Sidebar";
import MetadataStrip from "./components/layout/MetadataStrip";

// Deferred chrome. These four render at App-root but aren't required
// for first paint — the user can interact with the page before any of
// them mounts. Wrapping each in Suspense fallback={null} means a
// loading state is invisible (they just appear when ready).
const NotificationPopover = lazy(() => import("./components/NotificationPopover").then(m => ({ default: m.NotificationPopover })));
const GmailNotifPopover   = lazy(() => import("./components/GmailNotifPopover").then(m => ({ default: m.GmailNotifPopover })));
const AmbientPressureLayer = lazy(() => import("./components/AmbientPressureLayer"));
const MyHelperLauncher     = lazy(() => import("./components/MyHelperLauncher"));
const QuickLogButton       = lazy(() => import("./components/QuickLogButton"));
import { getPageMeta } from "./data/pageMeta";
import { PageHeaderProvider } from "./contexts/PageHeaderContext";

// Lazy-loaded pages — auto-reload on chunk mismatch (stale deploy)
const lazyLoad = (fn) => lazy(() => fn().catch(() => { window.location.reload(); return fn(); }));
// DashboardV2 retired in favor of PublisherDashboard (build spec 2026-04-29).
// The page module remains in src/pages/DashboardV2.jsx for reference until
// confirmed orphaned across the codebase, then can be deleted.
const PublisherDashboard = lazyLoad(() => import("./modules/PublisherDashboard"));
const RoleDashboard = lazyLoad(() => import("./components/RoleDashboard"));
const RoleActivityStrip = lazy(() => import("./components/activity-log/RoleActivityStrip"));
const SupportAdminJournal = lazyLoad(() => import("./modules/SupportAdminJournal"));
const ActivityTargetsAdmin = lazyLoad(() => import("./modules/ActivityTargetsAdmin"));
const RoleKB = lazyLoad(() => import("./modules/RoleKB"));
const Publications = lazyLoad(() => import("./pages/Publications"));
const IssueSchedule = lazyLoad(() => import("./pages/IssueSchedule"));
const SalesCRM = lazyLoad(() => import("./pages/sales/SalesCRM/SalesCRM"));
const Contracts = lazyLoad(() => import("./pages/sales/Contracts"));
const CalendarPage = lazyLoad(() => import("./pages/CalendarPage"));
const EditorialDashboard = lazyLoad(() => import("./components/EditorialDashboard"));
const Flatplan = lazyLoad(() => import("./pages/Flatplan"));
const IssueLayoutConsole = lazyLoad(() => import("./pages/IssueLayoutConsole"));
const TearsheetCenter = lazyLoad(() => import("./pages/TearsheetCenter"));
const CollectionsCenter = lazyLoad(() => import("./pages/CollectionsCenter"));
const TeamModule = lazyLoad(() => import("./pages/TeamModule"));
const TeamMemberProfile = lazyLoad(() => import("./pages/TeamMemberProfile"));
const Analytics = lazyLoad(() => import("./pages/Analytics"));
const IntegrationsPage = lazyLoad(() => import("./pages/IntegrationsPage"));
const MySites = lazyLoad(() => import("./pages/MySites"));
const BookingsQueue = lazyLoad(() => import("./pages/BookingsQueue"));
const MediaLibrary = lazyLoad(() => import("./pages/MediaLibrary"));
const DataImport = lazyLoad(() => import("./pages/DataImport"));
const Billing = lazyLoad(() => import("./pages/Billing"));
const Circulation = lazyLoad(() => import("./pages/Circulation"));
const ServiceDesk = lazyLoad(() => import("./pages/ServiceDesk"));
const LegalNotices = lazyLoad(() => import("./pages/LegalNotices"));
const Performance = lazyLoad(() => import("./pages/Performance"));
// P2.27 — CreativeJobs sunset. Page kept in repo (creative_jobs
// data lives on for Performance reads) but removed from build path.
// const CreativeJobs = lazyLoad(() => import("./pages/CreativeJobs"));
const ClassifiedAds = lazyLoad(() => import("./pages/ClassifiedAds"));
const Merch = lazyLoad(() => import("./pages/Merch"));
const NewsletterPage = lazyLoad(() => import("./pages/NewsletterPage"));
const SocialComposer = lazyLoad(() => import("./pages/SocialComposer"));
const AdProjects = lazyLoad(() => import("./pages/AdProjects"));
const KnowledgeBase = lazyLoad(() => import("./pages/KnowledgeBase"));
const Messaging = lazyLoad(() => import("./pages/Messaging"));
const Permissions = lazy(() => import("./pages/Permissions"));
const IssueDetail = lazyLoad(() => import("./pages/IssueDetail"));
const EmailTemplates = lazyLoad(() => import("./pages/EmailTemplates"));
const Mail = lazy(() => import("./pages/Mail"));
const ProfilePanel = lazy(() => import("./pages/ProfilePanel"));
const DriverApp = lazy(() => import("./pages/driver/DriverApp"));
const MobileApp = lazy(() => import("./pages/mobile/MobileApp"));
// Dev surfaces — only loaded when the matching nav entry exists (DEV builds).
const DevTypography = lazy(() => import("./pages/dev/Typography"));

const LazyFallback = () => <div style={{ padding: 40, textAlign: "center", color: "#525E72", fontSize: 13 }}>Loading module...</div>;

// ─── Boot status banner ──────────────────────────────────────
// Renders a thin strip across the top of the main content column when
// the data layer landed in a degraded / timed-out / failed / offline
// state. Each state gets its own copy so the user knows what's wrong:
//
//   degraded — boot succeeded for some tables, failed for others. The
//              UI is using whatever loaded; the listed tables are stale
//              or empty. Reload to retry.
//   timeout  — none of the boot fetches finished within 5s. The UI is
//              showing seed/sample data. Writes will likely fail.
//   failed   — boot threw an unhandled exception. Worst case; reload.
//   offline  — isOnline() returned false at mount. Local-only mode.
//
// Quiet on 'ok' / 'loading' / undefined.
function BootStatusBanner({ status, failures }) {
  if (!status || status === "ok" || status === "loading") return null;

  const palette = {
    degraded: { bg: "var(--warn-soft, rgba(212,169,60,0.18))", fg: "var(--warn, #B8860B)", border: "var(--warn, #B8860B)" },
    timeout:  { bg: "var(--accent-soft, rgba(232,71,58,0.12))", fg: "var(--accent, #C8301E)", border: "var(--accent, #C8301E)" },
    failed:   { bg: "var(--accent-soft, rgba(232,71,58,0.12))", fg: "var(--accent, #C8301E)", border: "var(--accent, #C8301E)" },
    offline:  { bg: "var(--muted-soft, rgba(140,133,120,0.12))", fg: "var(--muted, #6B655A)", border: "var(--muted, #6B655A)" },
  }[status];

  const message = {
    degraded: failures && failures.length
      ? `Some data didn't load: ${failures.join(", ")}. The rest of the app is current.`
      : "Some data didn't load. Working from what we have.",
    timeout:  "Couldn't reach the server. Showing sample data — your edits won't save until reconnected.",
    failed:   "The data layer hit an unexpected error. Showing sample data — reload to retry.",
    offline:  "Offline mode. Showing sample data; reconnect to load live records.",
  }[status];

  if (!palette || !message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        flexShrink: 0,
        padding: "8px 16px",
        background: palette.bg,
        color: palette.fg,
        borderBottom: `1px solid ${palette.border}40`,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: COND,
        display: "flex", alignItems: "center", gap: 10,
      }}
    >
      <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>⚠</span>
      <span style={{ flex: 1 }}>{message}</span>
      {(status === "timeout" || status === "failed") && (
        <button
          onClick={() => window.location.reload()}
          style={{
            background: "transparent",
            border: `1px solid ${palette.border}`,
            color: palette.fg,
            borderRadius: 6,
            padding: "3px 10px",
            fontSize: 11,
            fontWeight: 700,
            fontFamily: COND,
            cursor: "pointer",
          }}
        >Reload</button>
      )}
    </div>
  );
}

// Stable empty-array fallback for optional hook outputs. `appData.foo ?? []`
// in JSX creates a new [] on every render, defeating React.memo on child
// components. Using this shared reference keeps prop identity stable when
// the underlying data is nullish. Audit finding P-4.
const EMPTY_ARR = Object.freeze([]);

export default function App() {
  // Hard pathname check for the driver-app route tree. Drivers never
  // see MyDash chrome — totally different shell, different auth model
  // (custom JWT via driver-auth Edge Function), mobile-first viewport.
  // Branch happens BEFORE useAppData so we don't pull the heavy office
  // data layer for a driver session.
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/driver")) {
    return <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0F1419" }} />}>
      <DriverApp />
    </Suspense>;
  }

  // Phone-first auto-redirect: a sales rep opening MyDash on a phone
  // gets bumped to the mobile shell instead of the desktop chrome.
  // Synchronous so the desktop frame never flashes. Skip if they
  // explicitly opted into desktop via ?desktop=1 (debugging escape).
  if (typeof window !== "undefined"
      && window.location.pathname === "/"
      && window.innerWidth < 768
      && !window.location.search.includes("desktop=1")) {
    window.history.replaceState({}, "", "/mobile");
  }

  // Mobile sales app — separate /mobile route tree. Reads the same
  // tables as desktop (useAppData runs inside MobileApp), but no
  // desktop chrome, mobile-first viewport, 5-tab bottom nav.
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/mobile")) {
    return <Suspense fallback={<div style={{ minHeight: "100vh", background: "#FFFFFF" }} />}>
      <MobileApp />
    </Suspense>;
  }

  const appData = useAppData();
  const { teamMember: realUser, signOut } = useAuth();
  
  // Admin impersonation
  const [impersonating, setImpersonating] = useState(null);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const isAdmin = !!(realUser?.permissions?.includes?.('admin') || realUser?.permissions?.indexOf?.('admin') >= 0);
  const currentUser = impersonating || realUser;

  // ─── Data State ─────────────────────────────────────────
  // Initial values are empty arrays — seed fixtures get lazy-loaded by
  // the effect below if/when `online` resolves false. For online users
  // (the common case) these stay empty, the appData branch wins via the
  // `online ? appData.* : _*` resolvers, and seed.js never downloads.
  const [_pubs, _setPubs] = useState([]);
  const [_issues, _setIssues] = useState([]);
  const [_stories, _setStories] = useState([]);
  const [_clients, _setClients] = useState([]);
  const [_sales, _setSales] = useState([]);
  const [_proposals, _setProposals] = useState([]);
  const [_team, _setTeam] = useState([]);
  const [_notifications, _setNotifications] = useState([]);
  const [_invoices, _setInvoices] = useState([]);
  const [_payments, _setPayments] = useState([]);
  const [_subscribers, _setSubscribers] = useState([]);
  const [_dropLocations, _setDropLocations] = useState([]);
  const [_dropLocationPubs, _setDropLocationPubs] = useState([]);
  const [_drivers, _setDrivers] = useState([]);
  const [_driverRoutes, _setDriverRoutes] = useState([]);
  const [_routeStops, _setRouteStops] = useState([]);
  const [_tickets, _setTickets] = useState([]);
  const [_ticketComments, _setTicketComments] = useState([]);
  const [_legalNotices, _setLegalNotices] = useState([]);
  const [_legalNoticeIssues, _setLegalNoticeIssues] = useState([]);
  const [_creativeJobs, _setCreativeJobs] = useState([]);

  // Resolve: Supabase when available, local otherwise. bootStatus gates
  // the fall-through — if the boot timed out or threw, we drop back to
  // seed data so the UI isn't empty AND the banner above tells the user
  // why. 'degraded' (partial load) still goes to appData since some
  // real data is better than seed.
  const bootHealthy = !appData.bootStatus
    || appData.bootStatus === "ok"
    || appData.bootStatus === "loading"
    || appData.bootStatus === "degraded";
  const online = appData.loaded && isOnline() && bootHealthy;

  // Lazy-import the seed fixtures the first time `online` resolves false.
  // Online users never trip this. Offline users / users whose boot timed
  // out / failed see the BootStatusBanner immediately, then this effect
  // fires and populates the underscore states with mock data so the UI
  // has something to render. seedLoadedRef gates against re-imports if
  // online flips back and forth.
  const seedLoadedRef = useRef(false);
  useEffect(() => {
    if (online) return;
    if (seedLoadedRef.current) return;
    seedLoadedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const seed = await import("./data/seed");
        if (cancelled) return;
        _setPubs(seed.INIT_PUBS);
        _setClients(seed.INIT_CLIENTS);
        _setTeam(seed.INIT_TEAM);
        _setNotifications(seed.INIT_NOTIFICATIONS);
        const allIssues = seed.buildAllIssues(seed.INIT_PUBS);
        _setIssues(allIssues);
        _setSales(seed.generateSampleSales(seed.INIT_PUBS, allIssues, seed.INIT_CLIENTS));
        _setProposals(seed.generateSampleProposals(seed.INIT_PUBS, allIssues, seed.INIT_CLIENTS));
      } catch (err) {
        // Seed import failure is unlikely (it's a static module) but if
        // it happens, just log — the empty arrays the UI already has are
        // a defensible fallback.
        console.error("[App] Failed to load offline seed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [online]);

  const pubs = online ? (appData.pubs || []) : _pubs;
  const setPubs = online ? appData.setPubs : _setPubs;
  const issues = online ? (appData.issues || []) : _issues;
  const setIssues = online ? appData.setIssues : _setIssues;
  const stories = online ? (appData.stories || []) : _stories;
  const setStories = online ? appData.setStories : _setStories;
  const clients = online ? (appData.clients || []) : _clients;
  const setClients = online ? appData.setClients : _setClients;
  const sales = online ? (appData.sales || []) : _sales;
  const setSales = online ? appData.setSales : _setSales;
  const proposals = online ? (appData.proposals || []) : _proposals;
  const setProposals = online ? appData.setProposals : _setProposals;
  const team = online ? (appData.team || []) : _team;
  const setTeam = online ? appData.setTeam : _setTeam;
  const notifications = online ? (appData.notifications || []) : _notifications;
  const setNotifications = online ? appData.setNotifications : _setNotifications;
  const invoices = online ? (appData.invoices || []) : _invoices; const setInvoices = online ? appData.setInvoices : _setInvoices;
  const payments = online ? (appData.payments || []) : _payments; const setPayments = online ? appData.setPayments : _setPayments;
  const bills = online ? (appData.bills || []) : []; const setBills = online ? appData.setBills : (() => {});
  const subscribers = online ? (appData.subscribers || []) : _subscribers; const setSubscribers = online ? appData.setSubscribers : _setSubscribers;
  const dropLocations = online ? (appData.dropLocations || []) : _dropLocations; const setDropLocations = online ? appData.setDropLocations : _setDropLocations;
  const dropLocationPubs = online ? (appData.dropLocationPubs || []) : _dropLocationPubs; const setDropLocationPubs = online ? appData.setDropLocationPubs : _setDropLocationPubs;
  const drivers = online ? (appData.drivers || []) : _drivers; const setDrivers = online ? appData.setDrivers : _setDrivers;
  const driverRoutes = online ? (appData.driverRoutes || []) : _driverRoutes; const setDriverRoutes = online ? appData.setDriverRoutes : _setDriverRoutes;
  const routeStops = online ? (appData.routeStops || []) : _routeStops; const setRouteStops = online ? appData.setRouteStops : _setRouteStops;
  const tickets = online ? (appData.tickets || []) : _tickets; const setTickets = online ? appData.setTickets : _setTickets;
  const ticketComments = online ? (appData.ticketComments || []) : _ticketComments; const setTicketComments = online ? appData.setTicketComments : _setTicketComments;
  const legalNotices = online ? (appData.legalNotices || []) : _legalNotices; const setLegalNotices = online ? appData.setLegalNotices : _setLegalNotices;
  const legalNoticeIssues = online ? (appData.legalNoticeIssues || []) : _legalNoticeIssues; const setLegalNoticeIssues = online ? appData.setLegalNoticeIssues : _setLegalNoticeIssues;
  const creativeJobs = online ? (appData.creativeJobs || []) : _creativeJobs; const setCreativeJobs = online ? appData.setCreativeJobs : _setCreativeJobs;
  const publishStory = online ? appData.publishStory : null;
  const unpublishStory = online ? appData.unpublishStory : null;

  // ─── Jurisdiction Filtering ────────────────────────────
  const jurisdiction = useJurisdiction(currentUser, { pubs, clients, sales, issues, stories, creativeJobs });

  // Centralized filtered data — all pages receive jurisdiction-scoped data
  // Admins see everything, salespeople see their clients/sales, editors see their pubs
  const jPubs = jurisdiction.isAdmin ? pubs : jurisdiction.myPubs;
  const jClients = jurisdiction.isAdmin ? clients : jurisdiction.myClients;
  const jSales = jurisdiction.isAdmin ? sales : jurisdiction.mySales;
  const jIssues = jurisdiction.isAdmin ? issues : jurisdiction.myIssues;
  const jStories = jurisdiction.isAdmin ? stories : jurisdiction.myStories;
  const jJobs = jurisdiction.isAdmin ? creativeJobs : jurisdiction.myJobs;
  // Invoices: filter by client for salespeople
  const jInvoices = useMemo(() => {
    if (jurisdiction.isAdmin || !jurisdiction.isSalesperson) return invoices;
    const myClientIds = new Set(jClients.map(c => c.id));
    return (invoices || []).filter(i => myClientIds.has(i.clientId));
  }, [invoices, jClients, jurisdiction.isAdmin, jurisdiction.isSalesperson]);
  // Proposals: filter by client for salespeople
  const jProposals = useMemo(() => {
    if (jurisdiction.isAdmin || !jurisdiction.isSalesperson) return proposals;
    const myClientIds = new Set(jClients.map(c => c.id));
    return (proposals || []).filter(p => myClientIds.has(p.clientId));
  }, [proposals, jClients, jurisdiction.isAdmin, jurisdiction.isSalesperson]);

  // ─── Cross-Module Event Bus ─────────────────────────────
  const bus = useCrossModuleWiring({ setNotifications, setInvoices, invoices, clients, pubs, issues, sales, upsertAdProject: appData.upsertAdProject });

  // ─── Navigation State ───────────────────────────────────
  // Persist current page across hard refresh — read from localStorage on
  // first mount, write whenever pg changes. Team-member and issue detail
  // sub-views also persist so a mid-flow refresh lands you where you left off.
  const [pg, setPg] = useState(() => {
    try { return localStorage.getItem("mydash-pg") || "dashboard"; } catch (e) { return "dashboard"; }
  });
  const [pgHistory, setPgHistory] = useState([]);
  const [lastFlatplanIssue, setLastFlatplanIssue] = useState(null);
  const [globalPageStories, setGlobalPageStories] = useState({});
  const [issueDetailId, setIssueDetailId] = useState(null);
  const [lastFlatplanPub, setLastFlatplanPub] = useState(null);
  const [, forceRender] = useState(0);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [deepLink, setDeepLink] = useState(null);
  const [selectedTeamMemberId, setSelectedTeamMemberId] = useState(() => {
    try { return localStorage.getItem("mydash-team-member-id") || null; } catch (e) { return null; }
  });

  // Persist pg + selectedTeamMemberId whenever they change so refreshing
  // lands back on the same page/sub-view.
  useEffect(() => {
    try { localStorage.setItem("mydash-pg", pg); } catch (e) { }
  }, [pg]);
  useEffect(() => {
    try {
      if (selectedTeamMemberId) localStorage.setItem("mydash-team-member-id", selectedTeamMemberId);
      else localStorage.removeItem("mydash-team-member-id");
    } catch (e) { }
  }, [selectedTeamMemberId]);
  // Global "newsroom pressure" — 0 (calm blue) → 100 (hot red). Dashboard /
  // DashboardV2 compute this via useSignalFeed and push it up so the ambient
  // background layer can tint/animate the whole app, not just the dashboard.
  const [globalPressure, setGlobalPressure] = useState(20);

  // Org-wide appearance settings: pressure toggle, serenity color,
  // custom background image + opacity. Loaded once on mount and refreshed
  // whenever the settings panel saves (via a custom event).
  const [orgSettings, setOrgSettings] = useState({
    global_pressure_enabled: true,
    serenity_color: "blue",
    background_image_url: null,
    background_image_opacity: 0.30,
  });
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await supabase.from("org_settings").select("*").limit(1).maybeSingle();
        if (error) { console.error("org_settings load error:", error); return; }
        if (!cancelled && data) {
          setOrgSettings(prev => ({
            ...prev,
            global_pressure_enabled: data.global_pressure_enabled ?? true,
            serenity_color: data.serenity_color || "blue",
            background_image_url: data.background_image_url || null,
            background_image_opacity: Number(data.background_image_opacity ?? 0.3),
          }));
        }
      } catch (err) { console.error("org_settings load threw:", err); }
    };
    load();
    const handler = () => load();
    window.addEventListener("org-settings-updated", handler);
    return () => { cancelled = true; window.removeEventListener("org-settings-updated", handler); };
  }, []);

  const toggleSection = (key) => setCollapsedSections(s => ({ ...s, [key]: !s[key] }));

  // Navigate to a team member's profile page — used by Dashboard Team Direction
  // (via the Quick Chat slideout) and the Team page cards.
  const openTeamMemberProfile = (memberId) => {
    setSelectedTeamMemberId(memberId);
    setPgHistory(h => [...h, pg]);
    setPg("team-member");
  };

  const handleThemeToggle = () => {
    const isDark = Z.bg === DARK.bg;
    const next = isDark ? "light" : "dark";
    Object.assign(Z, isDark ? LIGHT : DARK);
    Object.assign(PRESS, isDark ? PRESS_LIGHT : PRESS_DARK);
    // Press Room CSS vars (--ink / --paper / etc.) read from data-theme
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("mydash-theme", next); } catch (e) { }
    forceRender(n => n + 1);
  };

  const handleNav = (newPg) => {
    // Parse path-style routes from notifications (e.g. "/sales?tab=inquiries&id=xxx")
    if (newPg && newPg.startsWith("/")) {
      const url = new URL(newPg, "https://x");
      const pageName = url.pathname.replace("/", "");
      const params = Object.fromEntries(url.searchParams);
      // URL fragment lands as `anchor` in deepLink so consumers like
      // RoleKB can scroll to the right heading. URL.hash includes the
      // leading `#`; strip it.
      if (url.hash) params.anchor = url.hash.replace(/^#/, "");
      setDeepLink(params);
      // Team-member page reads member id from selectedTeamMemberId state, not
      // deepLink. Bridge the two so nav.toTeamMember(id) actually opens the
      // right profile instead of the last-viewed one.
      if (pageName === "team-member" && params.memberId) {
        setSelectedTeamMemberId(params.memberId);
      }
      if (pageName !== pg) {
        setPgHistory(h => [...h, pg]);
        setPg(pageName);
        setIssueDetailId(null);
        try { localStorage.setItem("mydash-pg", pageName); } catch (e) { }
      }
      return;
    }
    setDeepLink(null);
    if (newPg !== pg) {
      setPgHistory(h => [...h, pg]);
      setPg(newPg);
      setIssueDetailId(null);
      try { localStorage.setItem("mydash-pg", newPg); } catch (e) { }
    }
  };

  // ─── Lazy load module data on first navigation (parallelized) ──────────
  useEffect(() => {
    if (!online) return;
    const loads = [];
    if (pg === 'dashboard' || pg === 'sales') {
      loads.push(appData.loadPriorities?.());
    }
    if (pg === 'sales' || pg === 'contracts') {
      loads.push(appData.loadFullSales?.(), appData.loadClientDetails?.(), appData.loadProposals?.(), appData.loadCommissions?.(), appData.loadOutreach?.(), appData.loadInquiries?.());
    }
    if (pg === 'team-member' || pg === 'team') {
      loads.push(appData.loadCommissions?.());
    }
    if (pg === 'medialibrary') {
      loads.push(appData.loadMediaAssets?.());
    }
    if (pg === 'billing') { loads.push(appData.loadBilling?.()); loads.push(appData.loadContracts?.()); loads.push(appData.loadBills?.()); }
    if (pg === 'editorial' || pg === 'stories' || pg === 'flatplan') { loads.push(appData.loadStories?.(), appData.loadFullSales?.()); }
    if (pg === 'schedule') { loads.push(appData.loadStories?.(), appData.loadFullSales?.()); }
    if (pg === 'sales' || pg === 'sitesettings') loads.push(appData.loadIndustries?.());
    if (pg === 'circulation') loads.push(appData.loadCirculation?.(true));
    if (pg === 'servicedesk') { loads.push(appData.loadTickets?.(), appData.loadCirculation?.()); }
    if (pg === 'legalnotices') loads.push(appData.loadLegals?.());
    if (pg === 'creativejobs') loads.push(appData.loadCreative?.());
    if (pg === 'editorial') loads.push(appData.loadEditions?.());
    if (pg === 'analytics') loads.push(appData.loadBilling?.(), appData.loadBills?.(), appData.loadCommissions?.(), appData.loadFullSales?.(), appData.loadCirculation?.(), appData.loadLegals?.(), appData.loadCreative?.(), appData.loadStories?.());
    if (loads.length > 0) {
      Promise.all(loads.filter(Boolean)).catch(err => {
        console.error('[page-change loader]', pg, err);
      });
    }
  }, [pg, online]);

  // Sub-view back handler — modules register their "close sub-view" function
  const subBackRef = useRef(null);
  const registerSubBack = useCallback((fn) => { subBackRef.current = fn; }, []);

  const goBack = () => {
    // First: close any open sub-view within the current module
    if (subBackRef.current) {
      const handled = subBackRef.current();
      if (handled) return;
    }
    // Then: navigate back to previous module
    if (pgHistory.length > 0) {
      const prev = pgHistory[pgHistory.length - 1];
      setPgHistory(h => h.slice(0, -1));
      setPg(prev);
      setIssueDetailId(null);
    }
  };

  // Navigate to billing when invoice.create is emitted from sales
  useEffect(() => {
    if (!bus) return;
    const unsub = bus.on("invoice.create", () => { handleNav("billing"); });
    return unsub;
  }, [bus, pg]);

  // ─── Badge Counts ───────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const salesActive = (sales || []).filter(s => !["Closed", "Follow-up"].includes(s.status)).length;
  const newInquiries = (appData.adInquiries || []).filter(i => i.status === "new").length;
  const overdueInvoices = (invoices || []).filter(i => i.status === "overdue" || (i.status === "sent" && i.dueDate && i.dueDate < today)).length;
  const openTickets = (tickets || []).filter(t => ["open", "in_progress", "escalated"].includes(t.status)).length;
  const escalatedTickets = (tickets || []).filter(t => t.status === "escalated").length;
  const activeLegal = (legalNotices || []).filter(n => !["published", "billed"].includes(n.status)).length;
  const activeJobs = (creativeJobs || []).filter(j => !["complete", "billed"].includes(j.status)).length;
  const storiesInEdit = (stories || []).filter(s => ["Draft", "Needs Editing"].includes(s.status)).length;
  const subExpiringCutoff = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const subExpiring = (subscribers || []).filter(s => s.status === "active" && s.renewalDate && s.renewalDate <= subExpiringCutoff && s.renewalDate >= today).length;

  // ─── Unread DM count (for the Messages nav badge) ────
  // Counts unread team_notes sent TO me that are not tied to an ad project
  // or other context thread. Loads once and stays live via realtime.
  const [unreadDMs, setUnreadDMs] = useState(0);
  useEffect(() => {
    const meId = currentUser?.id;
    if (!meId) { setUnreadDMs(0); return; }
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("team_notes")
        .select("*", { count: "exact", head: true })
        .eq("to_user", meId)
        .eq("is_read", false)
        .is("context_type", null);
      if (!cancelled) setUnreadDMs(count || 0);
    })();
    // Filter server-side to this user's notes — otherwise Supabase sends
    // every team_notes row-change event to every client and each one
    // triggers a round-trip count query.
    const ch = supabase.channel(`unread_dms_${meId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_notes", filter: `to_user=eq.${meId}` }, async () => {
        const { count } = await supabase
          .from("team_notes")
          .select("*", { count: "exact", head: true })
          .eq("to_user", meId)
          .eq("is_read", false)
          .is("context_type", null);
        if (!cancelled) setUnreadDMs(count || 0);
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [currentUser?.id]);

  // ─── Gmail unread (realtime push + 60s fallback) ───
  // The userId arg subscribes the hook to the gmail_inbox_<userId>
  // realtime channel that gmail-push-webhook broadcasts on.
  const gmailUserId = currentUser?.authId || currentUser?.id || null;
  const { unreadCount: gmailUnread, connected: gmailConnected, onNewUnread: onNewGmail } = useGmailUnread(!!currentUser, gmailUserId);

  // Fire gmail-watch-init once per session the first time we see the
  // user has a connected Gmail account. Idempotent on the server side
  // (users.watch upserts by user_id, so re-running just refreshes
  // the expiration).
  const watchInitFired = useRef(false);
  useEffect(() => {
    if (watchInitFired.current || !gmailConnected || !gmailUserId) return;
    watchInitFired.current = true;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) return;
        const res = await fetch(`${EDGE_FN_URL}/gmail-watch-init`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": supabase.supabaseKey || "",
            "Authorization": "Bearer " + token,
          },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.warn("gmail-watch-init failed:", res.status, body);
        }
      } catch (e) { console.warn("gmail-watch-init failed:", e); }
    })();
  }, [gmailConnected, gmailUserId]);

  // ─── Nav Config (with permission keys) ────────────────
  // Map nav IDs to module permission keys
  // Each nav item is its own permission — granular control
  const userModules = currentUser?.module_permissions || currentUser?.modulePermissions || [];
  const hasModule = (navId) => {
    if (isAdmin && !impersonating) return true;
    // Always visible
    if (["messaging", "mail", "rolekb"].includes(navId)) return true;
    // Dev surfaces (UI-refresh sample routes) are visible to anyone in DEV.
    if (navId.startsWith("dev-") && import.meta.env.DEV) return true;
    // Support-admin journal — Nic-only by role; private RLS on the
    // backing table handles data isolation regardless of who else's
    // sidebar happens to show this entry.
    if (navId === "journal") {
      const r = currentUser?.role;
      return r === "Editor" || r === "Editor-in-Chief";
    }
    // Activity targets admin — Publisher only. RLS on the table also
    // gates writes; this just hides the nav entry from non-publishers.
    if (navId === "targets") {
      return currentUser?.role === "Publisher";
    }
    return userModules.includes(navId);
  };

  const NAV = [
    { id: "dashboard", label: "My Dash", icon: Ic.dash },
    { id: "calendar", label: "Calendar", icon: Ic.cal },
    { id: "messaging", label: "Messages", icon: Ic.chat, badge: unreadDMs || null, badgeColor: unreadDMs > 0 ? Z.ac : null },
    { id: "mail", label: "Mail", icon: Ic.mail, badge: gmailUnread || null, badgeColor: gmailUnread > 0 ? Z.ac : null },
    { id: "_revenue", section: true, label: "Revenue" },
    { id: "sales", label: "Sales", icon: Ic.sale, badge: (salesActive || 0) + (newInquiries || 0) || null, badgeColor: newInquiries > 0 ? Z.ac : null },
    { id: "contracts", label: "Contracts", icon: Ic.sign },
    { id: "billing", label: "Billing", icon: Ic.invoice, badge: overdueInvoices || null, badgeColor: overdueInvoices > 0 ? Z.da : null },
    { id: "_content", section: true, label: "Content" },
    { id: "editorial", label: "Production", icon: Ic.news, badge: storiesInEdit || null },
    { id: "adprojects", label: "Design Studio", icon: Ic.palette },
    { id: "medialibrary", label: "Media Library", icon: Ic.image },
    { id: "flatplan", label: "Flatplan", icon: Ic.flat },
    { id: "layout", label: "Layout Console", icon: Ic.book },
    { id: "tearsheets", label: "Tearsheet Center", icon: Ic.image },
    { id: "collections", label: "Collections", icon: Ic.invoice },
    { id: "newsletters", label: "Newsletters", icon: Ic.send },
    { id: "social-composer", label: "Social Composer", icon: Ic.send },
    { id: "sitesettings", label: "MySites", icon: Ic.globe },
    { id: "knowledgebase", label: "Knowledge Base", icon: Ic.book },
    { id: "rolekb", label: "Role Docs", icon: Ic.book },
    { id: "journal", label: "Journal", icon: Ic.book },
    { id: "_advertising", section: true, label: "Advertising" },
    { id: "bookings-queue", label: "Booking Queue", icon: Ic.bell },
    { id: "classifieds", label: "Classifieds", icon: Ic.megaphone },
    { id: "merch", label: "Merch", icon: Ic.bag },
    { id: "_operations", section: true, label: "Operations" },
    { id: "circulation", label: "Circulation", icon: Ic.truck, badge: subExpiring || null },
    { id: "servicedesk", label: "Service Desk", icon: Ic.bell, badge: openTickets || null, badgeColor: escalatedTickets > 0 ? Z.da : null },
    { id: "legalnotices", label: "Legal Notices", icon: Ic.scroll, badge: activeLegal || null },
    { id: "performance", label: "Performance", icon: Ic.activity },
    { id: "_revenue_analytics", section: true, label: "Revenue" },
    { id: "analytics", label: "Reports", icon: Ic.barChart },
    { id: "_systems", section: true, label: "Systems" },
    { id: "team", label: "Team", icon: Ic.user },
    { id: "publications", label: "Publications", icon: Ic.pub },
    { id: "schedule", label: "Schedule", icon: Ic.clock },
    { id: "emailtemplates", label: "Email Templates", icon: Ic.template },
    { id: "integrations", label: "Integrations", icon: Ic.puzzle },
    { id: "dataimport", label: "Data Import", icon: Ic.up },
    { id: "targets", label: "Activity Targets", icon: Ic.activity },
    // Dev surfaces — only show in DEV builds. Phase 3 of the UI refresh
    // adds the typography route; future phases may add color-, motion-,
    // or component-showcase surfaces under the same section.
    ...(import.meta.env.DEV ? [
      { id: "_dev", section: true, label: "Dev" },
      { id: "dev-typography", label: "Typography", icon: Ic.book },
    ] : []),
  ].filter(n => n.section || hasModule(n.id));

  // Group nav items by section
  const navSections = [];
  let currentSection = { key: "_top", label: "", items: [] };
  NAV.forEach(n => {
    if (n.section) {
      if (currentSection.items.length > 0) navSections.push(currentSection);
      currentSection = { key: n.id, label: n.label, items: [] };
    } else {
      currentSection.items.push(n);
    }
  });
  if (currentSection.items.length > 0) navSections.push(currentSection);

  // Helper: lazy-mount pages — only mount a page when first visited, then keep mounted
  // Seed visited with both "dashboard" and the persisted pg so a refresh
  // on a non-default page renders immediately without a one-frame flash
  // back to the dashboard.
  const [visited, setVisited] = useState(() => new Set(["dashboard", pg].filter(Boolean)));
  useEffect(() => { setVisited(prev => { if (prev.has(pg)) return prev; const n = new Set(prev); n.add(pg); return n; }); }, [pg]);
  const vis = (pageId) => ({ display: pg === pageId ? "block" : "none" });
  const show = (pageId) => visited.has(pageId);

  const isDark = Z.bg === DARK.bg;

  // Ambient overlay (just the gradient highlights — the wallpaper itself
  // lives on its own fixed, permanently blurred layer below).
  const ambientOverlay = isDark
    ? "radial-gradient(ellipse at 15% 10%, rgba(120,130,180,0.10), transparent 55%), radial-gradient(ellipse at 85% 90%, rgba(200,150,100,0.06), transparent 55%)"
    : "radial-gradient(ellipse at 15% 10%, rgba(180,190,230,0.35), transparent 55%), radial-gradient(ellipse at 85% 90%, rgba(255,220,180,0.25), transparent 55%)";

  // ─── Render ─────────────────────────────────────────────
  return <PageHeaderProvider>
    {/* Base wallpaper — the default blurred backdrop. Sits at the very
        bottom of the stack, below any publisher-set background image. */}
    <div aria-hidden style={{
      position: "fixed",
      inset: "-80px",
      backgroundImage: `url('/${isDark ? "bg-dark.webp" : "bg-light.webp"}')`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: Z.bg,
      filter: "blur(48px) saturate(120%)",
      transform: "translateZ(0)",
      zIndex: 0,
      pointerEvents: "none",
    }} />
    {/* Publisher-set custom background image, layered above the base
        wallpaper at the configured opacity and below the pressure layer. */}
    {orgSettings.background_image_url && (
      <div aria-hidden style={{
        position: "fixed",
        inset: 0,
        backgroundImage: `url('${orgSettings.background_image_url}')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        opacity: Number(orgSettings.background_image_opacity ?? 0.3),
        zIndex: 0,
        pointerEvents: "none",
      }} />
    )}
    {/* Global ambient pressure tint — tracks with the newsroom heat map.
        Publisher can disable this from Org Appearance settings. */}
    {/* Each chrome island gets its own ErrorBoundary so a render error
        in (say) NotificationPopover doesn't blank the whole shell. The
        boundaries are silent for decorative/optional pieces (the user
        sees nothing instead of a crashed app); chrome with a real role
        gets a small fallback placeholder so the absence is noticed. */}
    <ErrorBoundary name="ambient-pressure" silent>
      <Suspense fallback={null}>
        {orgSettings.global_pressure_enabled !== false && (
          <AmbientPressureLayer pressure={globalPressure} serenityColor={orgSettings.serenity_color || "blue"} />
        )}
      </Suspense>
    </ErrorBoundary>
    {/* macOS-style notification popover — fixed top-right, subscribes to
        team_notes INSERTs for the current user and stacks incoming messages. */}
    <ErrorBoundary name="notifications" silent>
      <Suspense fallback={null}>
        <NotificationPopover currentUser={currentUser} team={team} onOpenMemberProfile={openTeamMemberProfile} />
      </Suspense>
    </ErrorBoundary>
    {/* Gmail inbox notifications — polls every 60s via useGmailUnread,
        fires a toast for newly-arrived unread messages. Click jumps to Mail. */}
    <ErrorBoundary name="gmail-notif" silent>
      <Suspense fallback={null}>
        <GmailNotifPopover onNewUnread={onNewGmail} onOpenMail={() => setPg("mail")} />
      </Suspense>
    </ErrorBoundary>
    <div style={{ display: "flex", height: "100vh", color: Z.tx, fontFamily: BODY, position: "relative", zIndex: 1 }}>
    {/* Press Room fonts are self-hosted via @fontsource imports in
        src/main.jsx. Legacy <link href={FONT_URL}> dropped in the
        Phase 3 typography commit. */}

    {/* ── Sidebar ──────────────────────────────────────── */}
    <ErrorBoundary
      name="sidebar"
      fallback={
        <div style={{ width: 64, flexShrink: 0, background: Z.bgChrome || Z.sa, borderRight: `1px solid ${Z.bd}`, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 24, color: Z.tm, fontSize: 11, fontFamily: COND }}>
          ⚠
        </div>
      }
    >
      <Sidebar
        navSections={navSections}
        collapsedSections={collapsedSections}
        toggleSection={toggleSection}
        pg={pg}
        handleNav={handleNav}
        handleThemeToggle={handleThemeToggle}
        currentUser={currentUser}
        realUser={realUser}
        team={team}
        isAdmin={isAdmin}
        impersonating={impersonating}
        setImpersonating={setImpersonating}
        showSwitcher={showSwitcher}
        setShowSwitcher={setShowSwitcher}
        onSignOut={signOut}
      />
    </ErrorBoundary>

    {/* ── Main Content ─────────────────────────────────── */}
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Boot-status banner — surfaces when the data layer is degraded
          so users don't accidentally trust seed/partial data. Renders
          above the header so it's the first thing the eye lands on. */}
      <BootStatusBanner status={appData.bootStatus} failures={appData.bootFailures} />

      {/* ── Single header — Press Room metadata strip carrying
          Back (left), the galley-proof line (center), and the
          notification bell (right). Andrew override 2026-04-26:
          the legacy <TopBar> is gone — this strip IS the header. */}
      {(() => {
        const meta = getPageMeta(pg);
        return (
          <ErrorBoundary
            name="metadata-strip"
            fallback={
              <div style={{ height: 40, padding: "0 16px", display: "flex", alignItems: "center", borderBottom: `1px solid ${Z.bd}`, color: Z.tm, fontSize: 11, fontFamily: COND }}>
                Header unavailable
              </div>
            }
          >
            <MetadataStrip
              page={meta.label}
              department={meta.department}
              onBack={pg !== "dashboard" ? goBack : null}
              notifications={notifications}
              setNotifications={setNotifications}
              onMarkAllRead={appData.markAllNotificationsRead}
              onNavigate={handleNav}
            />
          </ErrorBoundary>
        );
      })()}

      {/* ── Page Content ──────────────────────────────────── */}
      <main data-main style={{ flex: 1, overflow: "auto", padding: pg === "dashboard" ? 0 : 28, background: "transparent" }}>

        {/* Dashboard — special handling for issue detail overlay */}
        <div style={vis("dashboard")}>
          {!online && <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Waiting for data...</div>}
          {online && !clients.length && <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Loading clients...</div>}
          {online && clients.length > 0 && (issueDetailId
            ? <Suspense fallback={<LazyFallback />}><IssueDetail issueId={issueDetailId} pubs={pubs} issues={jIssues} sales={jSales} stories={jStories} clients={jClients} onBack={() => setIssueDetailId(null)} onNavigate={handleNav} /></Suspense>
            : (currentUser?.role === "Publisher"
              ? <Suspense fallback={<LazyFallback />}><PublisherDashboard team={team} currentUser={currentUser} onNavigate={handleNav} /></Suspense>
              : <Suspense fallback={<LazyFallback />}>
                  <RoleDashboard role={currentUser?.role} currentUser={currentUser} pubs={pubs} stories={jStories} setStories={setStories} clients={jClients} sales={jSales} issues={jIssues} team={team} invoices={jInvoices} payments={payments} subscribers={subscribers} tickets={tickets} legalNotices={legalNotices} creativeJobs={jJobs} adInquiries={appData.adInquiries || EMPTY_ARR} loadInquiries={appData.loadInquiries} loadClientDetails={appData.loadClientDetails} updateInquiry={appData.updateInquiry} onNavigate={handleNav} setIssueDetailId={setIssueDetailId} />
                  <RoleActivityStrip currentUser={currentUser} />
                </Suspense>
            )
          )}
        </div>

        {/* All other pages — lazy-mounted on first visit, hidden when not active, code-split */}
        <ErrorBoundary name="page">
        <Suspense fallback={<LazyFallback />}>
        {show("publications") && <div style={vis("publications")}><ErrorBoundary name="page:publications"><Publications isActive={pg === "publications"} pubs={appData.allPubs || pubs} setPubs={setPubs} issues={jIssues} setIssues={setIssues} sales={jSales} insertIssuesBatch={appData.insertIssuesBatch} insertPublication={appData.insertPublication} updatePublication={appData.updatePublication} insertAdSizes={appData.insertAdSizes} updatePubGoal={appData.updatePubGoal} updateIssueGoal={appData.updateIssueGoal} commissionGoals={appData.commissionGoals} salespersonPubAssignments={appData.salespersonPubAssignments} team={team} deepLink={deepLink} /></ErrorBoundary></div>}
        {show("schedule") && <div style={vis("schedule")}><ErrorBoundary name="page:schedule"><IssueSchedule isActive={pg === "schedule"} pubs={pubs} issues={jIssues} sales={jSales} stories={jStories} publicHolidays={appData.publicHolidays || EMPTY_ARR} loadHolidays={appData.loadHolidays} onNavigate={handleNav} onOpenIssue={setIssueDetailId} /></ErrorBoundary></div>}
        {show("sales") && <div style={vis("sales")}><ErrorBoundary name="page:sales"><SalesCRM isActive={pg === "sales"} jurisdiction={jurisdiction} clients={jClients} setClients={setClients} sales={jSales} setSales={setSales} updateSale={appData.updateSale} insertSale={appData.insertSale} pubs={pubs} issues={jIssues} proposals={jProposals} setProposals={setProposals} notifications={notifications} setNotifications={setNotifications} bus={bus} team={team} currentUser={currentUser} contracts={appData.contracts || []} setContracts={appData.setContracts} loadContracts={appData.loadContracts} contractsLoaded={appData.contractsLoaded} invoices={invoices} payments={payments} insertClient={appData.insertClient} updateClient={appData.updateClient} updateClientContact={appData.updateClientContact} insertProposal={appData.insertProposal} updateProposal={appData.updateProposal} convertProposal={appData.convertProposal} loadProposalHistory={appData.loadProposalHistory} commissionLedger={appData.commissionLedger} commissionPayouts={appData.commissionPayouts} commissionGoals={appData.commissionGoals} commissionRates={appData.commissionRates} salespersonPubAssignments={appData.salespersonPubAssignments} commissionHelpers={{ upsertPubAssignment: appData.upsertPubAssignment, deletePubAssignment: appData.deletePubAssignment, upsertCommissionRate: appData.upsertCommissionRate, deleteCommissionRate: appData.deleteCommissionRate, upsertIssueGoal: appData.upsertIssueGoal, calculateSaleCommission: appData.calculateSaleCommission, recalculateAllCommissions: appData.recalculateAllCommissions, markCommissionsPaid: appData.markCommissionsPaid, updateTeamMember: appData.updateTeamMember }} outreachCampaigns={appData.outreachCampaigns} outreachEntries={appData.outreachEntries} myPriorities={appData.myPriorities} priorityHelpers={{ addPriority: appData.addPriority, removePriority: appData.removePriority, highlightPriority: appData.highlightPriority }} outreachHelpers={{ insertCampaign: appData.insertCampaign, updateCampaign: appData.updateCampaign, insertOutreachEntries: appData.insertOutreachEntries, updateOutreachEntry: appData.updateOutreachEntry }} adInquiries={appData.adInquiries} loadInquiries={appData.loadInquiries} inquiriesLoaded={appData.inquiriesLoaded} updateInquiry={appData.updateInquiry} retainInquiriesRealtime={appData.retainInquiriesRealtime} digitalAdProducts={appData.digitalAdProducts} loadDigitalAdProducts={appData.loadDigitalAdProducts} digitalAdProductsLoaded={appData.digitalAdProductsLoaded} industries={appData.industries} loadClientDetails={appData.loadClientDetails} deepLink={deepLink} onNavigate={handleNav} registerSubBack={registerSubBack} /></ErrorBoundary></div>}
        {show("contracts") && <div style={vis("contracts")}><ErrorBoundary name="page:contracts"><Contracts isActive={pg === "contracts"} contracts={appData.contracts || []} clients={jClients} pubs={pubs} sales={jSales} team={team} jurisdiction={jurisdiction} currentUser={currentUser} onNavigate={handleNav} loadContracts={appData.loadAllContracts} contractsLoaded={appData.allContractsLoaded} deleteContract={appData.deleteContract} bus={bus} adProjects={appData.adProjects || []} adProjectBySaleId={appData.adProjectBySaleId} loadAdProjects={appData.loadAdProjects} adProjectsLoaded={appData.adProjectsLoaded} /></ErrorBoundary></div>}
        {show("billing") && <div style={vis("billing")}><ErrorBoundary name="page:billing"><Billing isActive={pg === "billing"} jurisdiction={jurisdiction} clients={jClients} sales={jSales} pubs={pubs} issues={jIssues} proposals={jProposals} invoices={jInvoices} setInvoices={setInvoices} payments={payments} setPayments={setPayments} bus={bus} team={team} subscribers={subscribers} subscriptionPayments={appData.subscriptionPayments || []} contracts={appData.contracts || []} loadContracts={appData.loadContracts} billingLoaded={appData.billingLoaded} loadInvoiceLines={appData.loadInvoiceLines} loadPaidInvoices={appData.loadPaidInvoices} loadAllPaymentsForClient={appData.loadAllPaymentsForClient} bills={bills} insertBill={appData.insertBill} updateBill={appData.updateBill} deleteBill={appData.deleteBill} onNavigate={handleNav} deepLink={deepLink} /></ErrorBoundary></div>}
        {show("calendar") && <div style={vis("calendar")}><ErrorBoundary name="page:calendar"><CalendarPage isActive={pg === "calendar"} clients={jClients} sales={jSales} issues={jIssues} pubs={pubs} team={team} currentUser={currentUser} stories={jStories} bus={bus} onNavigate={handleNav} /></ErrorBoundary></div>}
        {show("flatplan") && <div style={vis("flatplan")}><ErrorBoundary name="page:flatplan"><Flatplan isActive={pg === "flatplan"} jurisdiction={jurisdiction} pubs={pubs} issues={jIssues} setIssues={setIssues} sales={jSales} setSales={setSales} updateSale={appData.updateSale} clients={jClients} contracts={appData.contracts || []} stories={jStories} globalPageStories={globalPageStories} setGlobalPageStories={setGlobalPageStories} lastIssue={lastFlatplanIssue} lastPub={lastFlatplanPub} onSelectionChange={(p, i) => { setLastFlatplanPub(p); setLastFlatplanIssue(i); }} currentUser={currentUser} onNavigate={handleNav} /></ErrorBoundary></div>}
        {show("layout") && <div style={vis("layout")}><ErrorBoundary name="page:layout"><IssueLayoutConsole isActive={pg === "layout"} deepLink={deepLink} currentUser={currentUser} pubs={pubs} issues={issues} team={team} sales={sales} stories={stories} clients={clients} setStories={setStories} onNavigate={handleNav} /></ErrorBoundary></div>}
        {show("tearsheets") && <div style={vis("tearsheets")}><ErrorBoundary name="page:tearsheets"><TearsheetCenter isActive={pg === "tearsheets"} currentUser={currentUser} sales={jSales} setSales={setSales} clients={jClients} pubs={pubs} issues={jIssues} /></ErrorBoundary></div>}
        {show("collections") && <div style={vis("collections")}><ErrorBoundary name="page:collections"><CollectionsCenter isActive={pg === "collections"} currentUser={currentUser} invoices={jInvoices} clients={jClients} payments={payments} team={team} /></ErrorBoundary></div>}
        {show("editorial") && <div style={vis("editorial")}><ErrorBoundary name="page:editorial"><EditorialDashboard isActive={pg === "editorial"} stories={jStories} setStories={setStories} loadStoriesArchive={appData.loadStoriesArchive} pubs={pubs} issues={jIssues} setIssues={setIssues} team={team} bus={bus} editorialPermissions={jurisdiction} currentUser={currentUser} publishStory={publishStory} unpublishStory={unpublishStory} editions={appData.editions || []} setEditions={appData.setEditions} deepLink={deepLink} jurisdiction={jurisdiction} sales={jSales} setSales={setSales} updateSale={appData.updateSale} clients={jClients} contracts={appData.contracts || []} globalPageStories={globalPageStories} setGlobalPageStories={setGlobalPageStories} lastFlatplanIssue={lastFlatplanIssue} lastFlatplanPub={lastFlatplanPub} onFlatplanSelectionChange={(p, i) => { setLastFlatplanPub(p); setLastFlatplanIssue(i); }} onNavigate={handleNav} /></ErrorBoundary></div>}
        {show("analytics") && <div style={vis("analytics")}><ErrorBoundary name="page:analytics"><Analytics isActive={pg === "analytics"} pubs={pubs} sales={jSales} clients={jClients} issues={jIssues} stories={jStories} invoices={jInvoices} payments={payments} subscribers={subscribers} legalNotices={legalNotices} creativeJobs={jJobs} dropLocations={dropLocations} dropLocationPubs={dropLocationPubs} drivers={drivers} bills={bills} commissionPayouts={appData.commissionPayouts || []} adProjects={appData.adProjects || []} loadAdProjects={appData.loadAdProjects} onNavigate={handleNav} deepLink={deepLink} /></ErrorBoundary></div>}
        {show("medialibrary") && <div style={vis("medialibrary")}><ErrorBoundary name="page:medialibrary"><MediaLibrary isActive={pg === "medialibrary"} pubs={pubs} allPubs={appData.allPubs || pubs} currentUser={currentUser} mediaAssets={appData.mediaAssets || []} mediaAssetsLoaded={appData.mediaAssetsLoaded} loadMediaAssets={appData.loadMediaAssets} pushMediaAsset={appData.pushMediaAsset} removeMediaAsset={appData.removeMediaAsset} /></ErrorBoundary></div>}
        {show("messaging") && <div style={vis("messaging")}><ErrorBoundary name="page:messaging"><Messaging isActive={pg === "messaging"} team={team} currentUser={currentUser} /></ErrorBoundary></div>}
        {show("mail") && <div style={vis("mail")}><ErrorBoundary name="page:mail"><Mail isActive={pg === "mail"} /></ErrorBoundary></div>}
        {show("newsletters") && <div style={vis("newsletters")}><ErrorBoundary name="page:newsletters"><NewsletterPage isActive={pg === "newsletters"} pubs={pubs} currentUser={currentUser} /></ErrorBoundary></div>}
        {show("social-composer") && <div style={vis("social-composer")}><ErrorBoundary name="page:social-composer"><SocialComposer isActive={pg === "social-composer"} pubs={pubs} currentUser={currentUser} onNavigate={handleNav} /></ErrorBoundary></div>}
        {show("sitesettings") && <div style={vis("sitesettings")}><ErrorBoundary name="page:sitesettings"><MySites isActive={pg === "sitesettings"} pubs={pubs} setPubs={setPubs} sales={jSales} clients={jClients} digitalAdProducts={appData.digitalAdProducts} loadDigitalAdProducts={appData.loadDigitalAdProducts} onNavigate={handleNav} /></ErrorBoundary></div>}
        {show("bookings-queue") && <div style={vis("bookings-queue")}><ErrorBoundary name="page:bookings-queue"><BookingsQueue isActive={pg === "bookings-queue"} pubs={pubs} /></ErrorBoundary></div>}
        {show("emailtemplates") && <div style={vis("emailtemplates")}><ErrorBoundary name="page:emailtemplates"><EmailTemplates isActive={pg === "emailtemplates"} pubs={pubs} currentUser={currentUser} /></ErrorBoundary></div>}
        {show("integrations") && <div style={vis("integrations")}><ErrorBoundary name="page:integrations"><IntegrationsPage isActive={pg === "integrations"} pubs={pubs} /></ErrorBoundary></div>}
        {show("dataimport") && <div style={vis("dataimport")}><ErrorBoundary name="page:dataimport"><DataImport isActive={pg === "dataimport"} onClose={() => handleNav("integrations")} /></ErrorBoundary></div>}
        {show("targets") && <div style={vis("targets")}><ErrorBoundary name="page:targets"><ActivityTargetsAdmin isActive={pg === "targets"} /></ErrorBoundary></div>}
        {show("dev-typography") && <div style={vis("dev-typography")}><ErrorBoundary name="page:dev-typography"><DevTypography isActive={pg === "dev-typography"} /></ErrorBoundary></div>}
        {show("permissions") && <div style={vis("permissions")}><ErrorBoundary name="page:permissions"><Permissions isActive={pg === "permissions"} team={team} updateTeamMember={appData.updateTeamMember} /></ErrorBoundary></div>}
        {show("team") && <div style={vis("team")}><ErrorBoundary name="page:team"><TeamModule isActive={pg === "team"} team={team} setTeam={setTeam} sales={jSales} stories={jStories} tickets={tickets} subscribers={subscribers} legalNotices={legalNotices} creativeJobs={jJobs} pubs={pubs} clients={jClients} updateTeamMember={appData.updateTeamMember} deleteTeamMember={appData.deleteTeamMember} onOpenMemberProfile={openTeamMemberProfile} /></ErrorBoundary></div>}
        {show("team-member") && <div style={vis("team-member")}><ErrorBoundary name="page:team-member"><TeamMemberProfile isActive={pg === "team-member"} memberId={selectedTeamMemberId} team={team} pubs={pubs} clients={jClients} sales={jSales} stories={jStories} setStories={setStories} issues={jIssues} payments={payments} subscribers={subscribers} tickets={tickets} legalNotices={legalNotices} creativeJobs={jJobs} invoices={jInvoices} updateTeamMember={appData.updateTeamMember} deleteTeamMember={appData.deleteTeamMember} salespersonPubAssignments={appData.salespersonPubAssignments || []} upsertPubAssignment={appData.upsertPubAssignment} deletePubAssignment={appData.deletePubAssignment} commissionRates={appData.commissionRates || []} upsertCommissionRate={appData.upsertCommissionRate} currentUser={currentUser} onNavigate={handleNav} setIssueDetailId={setIssueDetailId} /></ErrorBoundary></div>}
        {show("circulation") && <div style={vis("circulation")}><ErrorBoundary name="page:circulation"><Circulation isActive={pg === "circulation"} pubs={pubs} issues={jIssues} subscribers={subscribers} setSubscribers={setSubscribers} subscriptions={appData.subscriptions || []} setSubscriptions={appData.setSubscriptions} subscriptionPayments={appData.subscriptionPayments || []} mailingLists={appData.mailingLists || []} setMailingLists={appData.setMailingLists} dropLocations={dropLocations} setDropLocations={setDropLocations} dropLocationPubs={dropLocationPubs} setDropLocationPubs={setDropLocationPubs} drivers={drivers} setDrivers={setDrivers} driverRoutes={driverRoutes} setDriverRoutes={setDriverRoutes} routeStops={routeStops} setRouteStops={setRouteStops} bus={bus} team={team} currentUser={currentUser} /></ErrorBoundary></div>}
        {show("servicedesk") && <div style={vis("servicedesk")}><ErrorBoundary name="page:servicedesk"><ServiceDesk isActive={pg === "servicedesk"} tickets={tickets} setTickets={setTickets} ticketComments={ticketComments} setTicketComments={setTicketComments} clients={jClients} subscribers={subscribers} pubs={pubs} issues={jIssues} team={team} bus={bus} currentUser={currentUser} insertTicket={appData.insertTicket} updateTicket={appData.updateTicket} insertTicketComment={appData.insertTicketComment} onNavigate={handleNav} /></ErrorBoundary></div>}
        {show("performance") && <div style={vis("performance")}><ErrorBoundary name="page:performance"><Performance isActive={pg === "performance"} sales={jSales} clients={jClients} stories={jStories} issues={jIssues} adProjects={appData.adProjects || []} loadAdProjects={appData.loadAdProjects} team={team} onNavigate={handleNav} /></ErrorBoundary></div>}
        {show("legalnotices") && <div style={vis("legalnotices")}><ErrorBoundary name="page:legalnotices"><LegalNotices isActive={pg === "legalnotices"} legalNotices={legalNotices} setLegalNotices={setLegalNotices} legalNoticeIssues={legalNoticeIssues} setLegalNoticeIssues={setLegalNoticeIssues} pubs={pubs} issues={jIssues} team={team} bus={bus} clients={jClients} currentUser={currentUser} insertClient={appData.insertClient} insertInvoice={appData.insertInvoice} insertLegalNotice={appData.insertLegalNotice} onNavigate={handleNav} /></ErrorBoundary></div>}
        {show("adprojects") && <div style={vis("adprojects")}><ErrorBoundary name="page:adprojects"><AdProjects isActive={pg === "adprojects"} pubs={pubs} clients={jClients} sales={jSales} issues={jIssues} team={team} currentUser={currentUser} deepLink={deepLink} onNavigate={handleNav} digitalAdProducts={appData.digitalAdProducts} loadDigitalAdProducts={appData.loadDigitalAdProducts} bus={bus} /></ErrorBoundary></div>}
        {show("knowledgebase") && <div style={vis("knowledgebase")}><ErrorBoundary name="page:knowledgebase"><KnowledgeBase isActive={pg === "knowledgebase"} team={team} currentUser={currentUser} /></ErrorBoundary></div>}
        {show("rolekb") && <div style={vis("rolekb")}><ErrorBoundary name="page:rolekb"><RoleKB isActive={pg === "rolekb"} deepLink={deepLink} /></ErrorBoundary></div>}
        {show("journal") && <div style={vis("journal")}><ErrorBoundary name="page:journal"><SupportAdminJournal isActive={pg === "journal"} /></ErrorBoundary></div>}
        {/* P2.27 — CreativeJobs sunset. Module retired in favor of
            AdProjects. Lazy import + sidebar entry removed; data
            kept in the table for historical Performance reads. */}
        {show("classifieds") && <div style={vis("classifieds")}><ErrorBoundary name="page:classifieds"><ClassifiedAds isActive={pg === "classifieds"} pubs={pubs} clients={jClients} issues={jIssues} /></ErrorBoundary></div>}
        {show("merch") && <div style={vis("merch")}><ErrorBoundary name="page:merch"><Merch isActive={pg === "merch"} clients={jClients} /></ErrorBoundary></div>}
        </Suspense>
        </ErrorBoundary>
      </main>
    </div>

    {/* Profile Panel */}
    {showProfile && <Suspense fallback={null}><ProfilePanel user={currentUser} team={team} pubs={pubs} onClose={() => setShowProfile(false)} /></Suspense>}

    {/* MyHelper — floating bot launcher in bottom-right of every page */}
    <ErrorBoundary name="myhelper" silent>
      <Suspense fallback={null}>
        <MyHelperLauncher currentUser={currentUser} team={team} pg={pg} deepLink={deepLink} />
      </Suspense>
    </ErrorBoundary>
    {/* QuickLog — floating ⌘L launcher for activity_log entries.
        Sales reps log calls, office admins log ad-hoc tasks/help. */}
    <ErrorBoundary name="quicklog" silent>
      <Suspense fallback={null}>
        <QuickLogButton currentUser={currentUser} />
      </Suspense>
    </ErrorBoundary>
    </div>
  </PageHeaderProvider>;
}
