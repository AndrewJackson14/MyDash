// ============================================================
// App.jsx — Application Shell
// Persistent pages (display:none), role-based nav, back button
// ============================================================
import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense, memo } from "react";
import { useAppData } from "./hooks/useAppData";
import { useAuth } from "./hooks/useAuth";
import { useJurisdiction } from "./hooks/useJurisdiction";
import { supabase, isOnline } from "./lib/supabase";
import { Z, DARK, LIGHT, COND, BODY, FONT_URL, R, INV, ZI } from "./lib/theme";
import { Ic, ThemeToggle, BackBtn, ErrorBoundary } from "./components/ui";
import {
  INIT_PUBS, INIT_CLIENTS, INIT_TEAM,
  buildAllIssues, generateSampleSales, generateSampleProposals,
  INIT_NOTIFICATIONS,
} from "./data/seed";
import { useCrossModuleWiring } from "./hooks/useCrossModuleWiring";

// Eagerly loaded (always needed on boot)
import Dashboard from "./pages/Dashboard";
import { NotificationPopover } from "./components/NotificationPopover";
import AmbientPressureLayer from "./components/AmbientPressureLayer";
import DashboardV2 from "./pages/DashboardV2";
import IssueDetail from "./pages/IssueDetail";

// Lazy-loaded pages — auto-reload on chunk mismatch (stale deploy)
const lazyLoad = (fn) => lazy(() => fn().catch(() => { window.location.reload(); return fn(); }));
const Publications = lazyLoad(() => import("./pages/Publications"));
const IssueSchedule = lazyLoad(() => import("./pages/IssueSchedule"));
const SalesCRM = lazyLoad(() => import("./pages/SalesCRM"));
const Contracts = lazyLoad(() => import("./pages/sales/Contracts"));
const CalendarPage = lazyLoad(() => import("./pages/CalendarPage"));
const EditorialDashboard = lazyLoad(() => import("./components/EditorialDashboard"));
const Flatplan = lazyLoad(() => import("./pages/Flatplan"));
const TeamModule = lazyLoad(() => import("./pages/TeamModule"));
const TeamMemberProfile = lazyLoad(() => import("./pages/TeamMemberProfile"));
const Analytics = lazyLoad(() => import("./pages/Analytics"));
const IntegrationsPage = lazyLoad(() => import("./pages/IntegrationsPage"));
const SiteSettings = lazyLoad(() => import("./pages/SiteSettings"));
const MediaLibrary = lazyLoad(() => import("./pages/MediaLibrary"));
const DataImport = lazyLoad(() => import("./pages/DataImport"));
const Billing = lazyLoad(() => import("./pages/Billing"));
const Circulation = lazyLoad(() => import("./pages/Circulation"));
const ServiceDesk = lazyLoad(() => import("./pages/ServiceDesk"));
const LegalNotices = lazyLoad(() => import("./pages/LegalNotices"));
const Performance = lazyLoad(() => import("./pages/Performance"));
const CreativeJobs = lazyLoad(() => import("./pages/CreativeJobs"));
const NewsletterPage = lazyLoad(() => import("./pages/NewsletterPage"));
const AdProjects = lazyLoad(() => import("./pages/AdProjects"));
const Messaging = lazyLoad(() => import("./pages/Messaging"));
const Permissions = lazy(() => import("./pages/Permissions"));
const EmailTemplates = lazyLoad(() => import("./pages/EmailTemplates"));
const Mail = lazy(() => import("./pages/Mail"));
const ProfilePanel = lazy(() => import("./pages/ProfilePanel"));

const LazyFallback = () => <div style={{ padding: 40, textAlign: "center", color: "#525E72", fontSize: 13 }}>Loading module...</div>;

export default function App() {
  const appData = useAppData();
  const { teamMember: realUser } = useAuth();
  
  // Admin impersonation
  const [impersonating, setImpersonating] = useState(null);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const isAdmin = !!(realUser?.permissions?.includes?.('admin') || realUser?.permissions?.indexOf?.('admin') >= 0);
  const currentUser = impersonating || realUser;

  // ─── Data State ─────────────────────────────────────────
  const [_pubs, _setPubs] = useState(INIT_PUBS);
  const [_issues, _setIssues] = useState(() => buildAllIssues(INIT_PUBS));
  const [_stories, _setStories] = useState([]);
  const [_clients, _setClients] = useState(INIT_CLIENTS);
  const [_sales, _setSales] = useState(() => generateSampleSales(INIT_PUBS, buildAllIssues(INIT_PUBS), INIT_CLIENTS));
  const [_proposals, _setProposals] = useState(() => generateSampleProposals(INIT_PUBS, buildAllIssues(INIT_PUBS), INIT_CLIENTS));
  const [_team, _setTeam] = useState(INIT_TEAM);
  const [_notifications, _setNotifications] = useState(INIT_NOTIFICATIONS);
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

  // Resolve: Supabase when available, local otherwise
  const online = appData.loaded && isOnline();
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
  const [col, setCol] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
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
    Object.assign(Z, isDark ? LIGHT : DARK);
    try { localStorage.setItem("mydash-theme", isDark ? "light" : "dark"); } catch (e) { }
    forceRender(n => n + 1);
  };

  const handleNav = (newPg) => {
    // Parse path-style routes from notifications (e.g. "/sales?tab=inquiries&id=xxx")
    if (newPg && newPg.startsWith("/")) {
      const url = new URL(newPg, "https://x");
      const pageName = url.pathname.replace("/", "");
      const params = Object.fromEntries(url.searchParams);
      setDeepLink(params);
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
    if (pg === 'circulation') loads.push(appData.loadCirculation?.(true));
    if (pg === 'servicedesk') { loads.push(appData.loadTickets?.(), appData.loadCirculation?.()); }
    if (pg === 'legalnotices') loads.push(appData.loadLegals?.());
    if (pg === 'creativejobs') loads.push(appData.loadCreative?.());
    if (pg === 'editorial') loads.push(appData.loadEditions?.());
    if (pg === 'analytics') loads.push(appData.loadBilling?.(), appData.loadBills?.(), appData.loadCommissions?.(), appData.loadFullSales?.(), appData.loadCirculation?.(), appData.loadLegals?.(), appData.loadCreative?.(), appData.loadStories?.());
    if (loads.length > 0) Promise.all(loads.filter(Boolean));
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

  const unreadCount = (notifications || []).filter(n => !n.read).length;
  const markAllRead = () => setNotifications(n => n.map(x => ({ ...x, read: true })));

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
    const ch = supabase.channel(`unread_dms_${meId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_notes" }, async () => {
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

  // ─── Nav Config (with permission keys) ────────────────
  // Map nav IDs to module permission keys
  // Each nav item is its own permission — granular control
  const userModules = currentUser?.module_permissions || currentUser?.modulePermissions || [];
  const hasModule = (navId) => {
    if (isAdmin && !impersonating) return true;
    // Always visible
    if (["messaging", "mail"].includes(navId)) return true;
    return userModules.includes(navId);
  };

  const NAV = [
    { id: "dashboard", label: "My Dash", icon: Ic.dash },
    { id: "calendar", label: "Calendar", icon: Ic.cal },
    { id: "messaging", label: "Messages", icon: Ic.chat, badge: unreadDMs || null, badgeColor: unreadDMs > 0 ? Z.ac : null },
    { id: "mail", label: "Mail", icon: Ic.mail },
    { id: "_revenue", section: true, label: "Revenue" },
    { id: "sales", label: "Sales", icon: Ic.sale, badge: (salesActive || 0) + (newInquiries || 0) || null, badgeColor: newInquiries > 0 ? Z.ac : null },
    { id: "contracts", label: "Contracts", icon: Ic.sign },
    { id: "billing", label: "Billing", icon: Ic.invoice, badge: overdueInvoices || null, badgeColor: overdueInvoices > 0 ? Z.da : null },
    { id: "_content", section: true, label: "Content" },
    { id: "editorial", label: "Editorial", icon: Ic.list, badge: storiesInEdit || null },
    { id: "flatplan", label: "Flatplan", icon: Ic.flat },
    { id: "newsletters", label: "Newsletters", icon: Ic.mail },
    { id: "sitesettings", label: "MyWebsites", icon: Ic.globe },
    { id: "adprojects", label: "Design Studio", icon: Ic.paintbrush },
    { id: "medialibrary", label: "Media Library", icon: Ic.image },
    { id: "_operations", section: true, label: "Operations" },
    { id: "circulation", label: "Circulation", icon: Ic.pub, badge: subExpiring || null },
    { id: "servicedesk", label: "Service Desk", icon: Ic.bell, badge: openTickets || null, badgeColor: escalatedTickets > 0 ? Z.da : null },
    { id: "legalnotices", label: "Legal Notices", icon: Ic.gavel, badge: activeLegal || null },
    { id: "performance", label: "Performance", icon: Ic.barChart },
    { id: "_revenue_analytics", section: true, label: "Revenue" },
    { id: "analytics", label: "Analytics", icon: Ic.barChart },
    { id: "_systems", section: true, label: "Systems" },
    { id: "team", label: "Team", icon: Ic.user },
    { id: "publications", label: "Publications", icon: Ic.pub },
    { id: "schedule", label: "Schedule", icon: Ic.story },
    { id: "emailtemplates", label: "Email Templates", icon: Ic.file },
    { id: "integrations", label: "Integrations", icon: Ic.puzzle },
    { id: "dataimport", label: "Data Import", icon: Ic.up },
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

  // Dashboard V2 feature flag: ?v=2 in URL, or localStorage opt-in.
  // ?v=1 forces back to V1. Persists between visits via localStorage.
  const useDashboardV2 = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("v");
      if (q === "2") { try { localStorage.setItem("mydash-dashboard-v2", "true"); } catch (e) {} return true; }
      if (q === "1") { try { localStorage.setItem("mydash-dashboard-v2", "false"); } catch (e) {} return false; }
      return localStorage.getItem("mydash-dashboard-v2") === "true";
    } catch (e) { return false; }
  })();

  // Ambient overlay (just the gradient highlights — the wallpaper itself
  // lives on its own fixed, permanently blurred layer below).
  const ambientOverlay = isDark
    ? "radial-gradient(ellipse at 15% 10%, rgba(120,130,180,0.10), transparent 55%), radial-gradient(ellipse at 85% 90%, rgba(200,150,100,0.06), transparent 55%)"
    : "radial-gradient(ellipse at 15% 10%, rgba(180,190,230,0.35), transparent 55%), radial-gradient(ellipse at 85% 90%, rgba(255,220,180,0.25), transparent 55%)";

  // ─── Render ─────────────────────────────────────────────
  return <>
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
    {orgSettings.global_pressure_enabled !== false && (
      <AmbientPressureLayer pressure={globalPressure} serenityColor={orgSettings.serenity_color || "blue"} />
    )}
    {/* macOS-style notification popover — fixed top-right, subscribes to
        team_notes INSERTs for the current user and stacks incoming messages. */}
    <NotificationPopover currentUser={currentUser} team={team} onOpenMemberProfile={openTeamMemberProfile} />
    <div style={{ display: "flex", height: "100vh", color: Z.tx, fontFamily: BODY, position: "relative", zIndex: 1 }}>
    <link href={FONT_URL} rel="stylesheet" />

    {/* ── Sidebar Nav ──────────────────────────────────── */}
    <nav style={{ width: col ? 54 : 200, flexShrink: 0, background: isDark ? "rgba(14,16,24,0.6)" : "rgba(255,255,255,0.5)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRight: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, display: "flex", flexDirection: "column", transition: "width 0.25s", overflow: "hidden" }}>

      {/* Logo */}
      <div style={{ padding: col ? "10px 8px" : "10px 14px", borderBottom: `1px solid ${Z.bd}`, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setCol(c => !c)}>
        <div style={{ width: 26, height: 26, borderRadius: 3, background: Z.tx, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, color: Z.bg, flexShrink: 0 }}>13</div>
        {!col && <div><div style={{ fontSize: 12, fontWeight: 900, letterSpacing: -0.3, whiteSpace: "nowrap" }}>13 Stars Media</div><div style={{ fontSize: 13, color: Z.td }}>MyDash</div></div>}
      </div>

      {/* Nav Items */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "4px 0" }}>
        {navSections.map(sec => {
          const isCollapsed = collapsedSections[sec.key];
          const sectionHasActive = sec.items.some(n => n.id === pg);
          const sectionBadgeTotal = sec.items.reduce((s, n) => s + (n.badge || 0), 0);

          return <div key={sec.key}>
            {sec.label && !col && <div onClick={() => toggleSection(sec.key)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px 3px", cursor: "pointer", userSelect: "none" }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: sectionHasActive ? Z.tx : Z.td, letterSpacing: 1.2, textTransform: "uppercase" }}>{sec.label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {isCollapsed && sectionBadgeTotal > 0 && <span style={{ fontSize: 9, fontWeight: 800, color: INV.light, background: Z.tx, borderRadius: 3, padding: "0 4px", minWidth: 14, textAlign: "center", lineHeight: "16px" }}>{sectionBadgeTotal}</span>}
                <span style={{ fontSize: 9, color: Z.td, transition: "transform 0.2s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0)" }}>▼</span>
              </div>
            </div>}
            {col && sec.label && <div style={{ height: 1, background: Z.bd, margin: "4px 8px" }} />}

            {(!isCollapsed || col) && sec.items.map(n => {
              const a = pg === n.id;
              return <button key={n.id} onClick={() => handleNav(n.id)} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: col ? "6px 0" : "5px 14px", margin: col ? "1px 4px" : "1px 4px",
                borderRadius: 3, border: "none", cursor: "pointer",
                fontSize: a ? 13 : 12.5, fontWeight: a ? 700 : 500,
                fontFamily: a ? COND : "inherit",
                background: a ? Z.sa : "transparent",
                color: a ? Z.tx : Z.tm,
                whiteSpace: "nowrap",
                justifyContent: col ? "center" : "flex-start",
                textAlign: "left",
                borderLeft: a ? `2px solid ${Z.tx}` : "2px solid transparent",
                width: col ? "auto" : "calc(100% - 8px)",
                transition: "background 0.1s",
              }} title={n.label}
                onMouseOver={e => { if (!a) e.currentTarget.style.background = Z.sa; }}
                onMouseOut={e => { if (!a) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ flexShrink: 0, width: 16, display: "flex", alignItems: "center", justifyContent: "center" }}><n.icon size={14} /></span>
                {!col && <span style={{ flex: 1 }}>{n.label}</span>}
                {!col && n.badge && <span style={{
                  fontSize: 9, fontWeight: 800, color: INV.light,
                  background: n.badgeColor || Z.tx, borderRadius: 3,
                  padding: "0 5px", minWidth: 16, textAlign: "center", lineHeight: "16px",
                }}>{n.badge}</span>}
                {col && n.badge && <div style={{ position: "relative", width: 0, height: 0 }}>
                  <span style={{ position: "absolute", top: -14, right: -6, fontSize: 8, fontWeight: 900, color: INV.light, background: n.badgeColor || Z.tx, borderRadius: 3, padding: "0 3px", lineHeight: "14px" }}>{n.badge}</span>
                </div>}
              </button>;
            })}
          </div>;
        })}
      </div>

      {/* Theme toggle + Logout */}
      <div style={{ borderTop: `1px solid ${Z.bd}`, padding: "6px 8px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {!col && <ThemeToggle onToggle={handleThemeToggle} />}
        {!col && <button onClick={() => {}} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 3, border: "none", cursor: "pointer", background: "transparent", color: Z.td, fontSize: 12, fontWeight: 500, width: "100%", textAlign: "left" }}
          onMouseOver={e => e.currentTarget.style.color = Z.da}
          onMouseOut={e => e.currentTarget.style.color = Z.td}
        ><Ic.logout size={13} /> Logout</button>}
      </div>

      {/* User + Admin Switcher */}
      <div style={{ padding: "8px 4px", borderTop: `1px solid ${Z.bd}`, flexShrink: 0 }}>
        <div onClick={() => setShowProfile(p => !p)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", justifyContent: col ? "center" : "flex-start", cursor: "pointer", borderRadius: 3 }}
          onMouseEnter={e => e.currentTarget.style.background = Z.sa}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <div style={{ width: 22, height: 22, borderRadius: 3, background: impersonating ? Z.wa + "30" : Z.sa, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: impersonating ? `1px solid ${Z.wa}` : "none" }}><Ic.user size={11} color={impersonating ? Z.wa : Z.tm} /></div>
          {!col && <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: impersonating ? Z.wa : Z.tm }}>{currentUser?.name || "User"}</div>
            <div style={{ fontSize: 11, color: Z.td }}>{currentUser?.role || ""}</div>
          </div>}
          {isAdmin && <button onClick={() => setShowSwitcher(s => !s)} style={{ background: "none", border: "none", cursor: "pointer", color: showSwitcher ? Z.wa : Z.td, fontSize: 14, padding: 2 }} title="Switch role view">⚙</button>}
        </div>
        {/* Admin Role Switcher Panel */}
        {showSwitcher && isAdmin && !col && <div style={{ margin: "6px 4px 2px", padding: 8, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}`, maxHeight: 240, overflowY: "auto" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, fontFamily: COND }}>View As</div>
          {/* Reset to self */}
          {impersonating && <button onClick={() => { setImpersonating(null); setShowSwitcher(false); }} style={{ display: "block", width: "100%", padding: "5px 8px", marginBottom: 4, borderRadius: 3, border: `1px solid ${Z.go}`, background: Z.go + "15", cursor: "pointer", fontSize: 11, fontWeight: 700, color: Z.go, textAlign: "left", fontFamily: COND }}>↩ Back to Admin</button>}
          {/* Team members */}
          {(team || []).filter(t => t.email !== realUser?.email).map(t => <button key={t.id} onClick={() => { setImpersonating(t); setShowSwitcher(false); }} style={{ display: "block", width: "100%", padding: "5px 8px", marginBottom: 2, borderRadius: 3, border: "none", background: impersonating?.id === t.id ? Z.wa + "20" : "transparent", cursor: "pointer", fontSize: 11, fontWeight: 600, color: impersonating?.id === t.id ? Z.wa : Z.tm, textAlign: "left", fontFamily: COND }}
            onMouseEnter={e => e.currentTarget.style.background = Z.sa}
            onMouseLeave={e => e.currentTarget.style.background = impersonating?.id === t.id ? Z.wa + "20" : "transparent"}
          >{t.name} <span style={{ color: Z.td, fontWeight: 400 }}>· {t.role}</span></button>)}
        </div>}
      </div>
    </nav>

    {/* ── Main Content ─────────────────────────────────── */}
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Top Bar — always visible so the notification bell stays in
          the same place across every page. Back button hides on the
          dashboard since there's nowhere to go back to. */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "6px 20px", borderBottom: pg === "dashboard" ? "none" : `1px solid ${Z.bd}`, background: isDark ? "rgba(14,16,24,0.7)" : "rgba(246,247,249,0.7)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", flexShrink: 0, position: "relative", zIndex: ZI.top }}>
        <div>
          {pg !== "dashboard" && <button onClick={goBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: Z.tm, fontSize: 12, fontWeight: 600, padding: "4px 8px", borderRadius: 3 }}
            onMouseOver={e => e.currentTarget.style.color = Z.tx}
            onMouseOut={e => e.currentTarget.style.color = Z.tm}
          ><Ic.back size={14} /> Back</button>}
        </div>
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowNotifs(s => !s)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, padding: 4 }}>
            <Ic.clock size={18} />
            {unreadCount > 0 && <span style={{ position: "absolute", top: -2, right: -4, background: Z.da, color: INV.light, fontSize: 9, fontWeight: 900, borderRadius: 3, padding: "1px 4px" }}>{unreadCount}</span>}
          </button>
          {showNotifs && <div onClick={() => setShowNotifs(false)} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />}
          {showNotifs && <div style={{ position: "fixed", right: 20, top: 44, width: 320, maxHeight: 400, overflowY: "auto", background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: 6, zIndex: 9999, boxShadow: "0 12px 40px rgba(0,0,0,0.35)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${Z.bd}` }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: Z.tx }}>My Alerts</span>
              {unreadCount > 0 && <button onClick={markAllRead} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: Z.tx, textDecoration: "underline", textUnderlineOffset: 3 }}>Mark all read</button>}
            </div>
            {[...(notifications || [])].sort((a, b) => a.read === b.read ? 0 : a.read ? 1 : -1).slice(0, 12).map(n => <div key={n.id} onClick={() => { setNotifications(ns => ns.map(x => x.id === n.id ? { ...x, read: !x.read } : x)); if (n.route && !n.read) { handleNav(n.route); setShowNotifs(false); } }} style={{ padding: "10px 16px", borderBottom: `1px solid ${Z.bd}`, cursor: n.route ? "pointer" : "default", background: n.read ? "transparent" : Z.as }}><div style={{ fontSize: 13, color: n.read ? Z.td : Z.tx, fontWeight: n.read ? 400 : 700 }}>{n.text}</div><div style={{ fontSize: 11, color: Z.td, marginTop: 3 }}>{n.time}</div></div>)}
          </div>}
        </div>
      </header>

      {/* ── Page Content ──────────────────────────────────── */}
      <main data-main style={{ flex: 1, overflow: "auto", padding: pg === "dashboard" ? 0 : 28, background: "transparent" }}>

        {/* Dashboard — special handling for issue detail overlay */}
        <div style={vis("dashboard")}>
          {!online && <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Waiting for data...</div>}
          {online && !clients.length && <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Loading clients...</div>}
          {online && clients.length > 0 && (issueDetailId
            ? <IssueDetail issueId={issueDetailId} pubs={pubs} issues={jIssues} sales={jSales} stories={jStories} clients={jClients} onBack={() => setIssueDetailId(null)} onNavigate={handleNav} />
            : (useDashboardV2
              ? <DashboardV2 pubs={pubs} stories={jStories} setStories={setStories} clients={jClients} sales={jSales} issues={jIssues} proposals={jProposals} team={team} invoices={jInvoices} payments={payments} subscribers={subscribers} dropLocations={dropLocations} dropLocationPubs={dropLocationPubs} tickets={tickets} legalNotices={legalNotices} creativeJobs={jJobs} adProjects={appData.adProjects || []} loadAdProjects={appData.loadAdProjects} onNavigate={handleNav} setIssueDetailId={setIssueDetailId} userName={currentUser?.name} currentUser={currentUser} salespersonPubAssignments={appData.salespersonPubAssignments} jurisdiction={jurisdiction} commissionGoals={appData.commissionGoals || []} onOpenMemberProfile={openTeamMemberProfile} onPressureChange={setGlobalPressure} />
              : <Dashboard pubs={pubs} stories={jStories} setStories={setStories} clients={jClients} sales={jSales} issues={jIssues} proposals={jProposals} team={team} invoices={jInvoices} payments={payments} subscribers={subscribers} dropLocations={dropLocations} dropLocationPubs={dropLocationPubs} tickets={tickets} legalNotices={legalNotices} creativeJobs={jJobs} onNavigate={handleNav} setIssueDetailId={setIssueDetailId} userName={currentUser?.name} currentUser={currentUser} salespersonPubAssignments={appData.salespersonPubAssignments} jurisdiction={jurisdiction} myPriorities={appData.myPriorities} priorityHelpers={{ addPriority: appData.addPriority, removePriority: appData.removePriority, highlightPriority: appData.highlightPriority, autoRemoveClosedPriorities: appData.autoRemoveClosedPriorities }} outreachCampaigns={appData.outreachCampaigns || []} outreachEntries={appData.outreachEntries || []} commissionGoals={appData.commissionGoals || []} billingLoaded={appData.billingLoaded} onOpenMemberProfile={openTeamMemberProfile} onPressureChange={setGlobalPressure} />)
          )}
        </div>

        {/* All other pages — lazy-mounted on first visit, hidden when not active, code-split */}
        <ErrorBoundary name="page">
        <Suspense fallback={<LazyFallback />}>
        {show("publications") && <div style={vis("publications")}><Publications pubs={appData.allPubs || pubs} setPubs={setPubs} issues={jIssues} setIssues={setIssues} sales={jSales} insertIssuesBatch={appData.insertIssuesBatch} insertPublication={appData.insertPublication} updatePublication={appData.updatePublication} insertAdSizes={appData.insertAdSizes} updatePubGoal={appData.updatePubGoal} updateIssueGoal={appData.updateIssueGoal} /></div>}
        {show("schedule") && <div style={vis("schedule")}><IssueSchedule pubs={pubs} issues={jIssues} sales={jSales} stories={jStories} onNavigate={handleNav} onOpenIssue={setIssueDetailId} /></div>}
        {show("sales") && <div style={vis("sales")}><SalesCRM jurisdiction={jurisdiction} clients={jClients} setClients={setClients} sales={jSales} setSales={setSales} pubs={pubs} issues={jIssues} proposals={jProposals} setProposals={setProposals} notifications={notifications} setNotifications={setNotifications} bus={bus} team={team} currentUser={currentUser} contracts={appData.contracts || []} setContracts={appData.setContracts} loadContracts={appData.loadContracts} contractsLoaded={appData.contractsLoaded} invoices={invoices} payments={payments} insertClient={appData.insertClient} updateClient={appData.updateClient} insertProposal={appData.insertProposal} updateProposal={appData.updateProposal} convertProposal={appData.convertProposal} commissionLedger={appData.commissionLedger} commissionPayouts={appData.commissionPayouts} commissionGoals={appData.commissionGoals} commissionRates={appData.commissionRates} salespersonPubAssignments={appData.salespersonPubAssignments} commissionHelpers={{ upsertPubAssignment: appData.upsertPubAssignment, deletePubAssignment: appData.deletePubAssignment, upsertCommissionRate: appData.upsertCommissionRate, deleteCommissionRate: appData.deleteCommissionRate, upsertIssueGoal: appData.upsertIssueGoal, calculateSaleCommission: appData.calculateSaleCommission, recalculateAllCommissions: appData.recalculateAllCommissions, markCommissionsPaid: appData.markCommissionsPaid, updateTeamMember: appData.updateTeamMember }} outreachCampaigns={appData.outreachCampaigns} outreachEntries={appData.outreachEntries} myPriorities={appData.myPriorities} priorityHelpers={{ addPriority: appData.addPriority, removePriority: appData.removePriority, highlightPriority: appData.highlightPriority }} outreachHelpers={{ insertCampaign: appData.insertCampaign, updateCampaign: appData.updateCampaign, insertOutreachEntries: appData.insertOutreachEntries, updateOutreachEntry: appData.updateOutreachEntry }} adInquiries={appData.adInquiries} loadInquiries={appData.loadInquiries} inquiriesLoaded={appData.inquiriesLoaded} updateInquiry={appData.updateInquiry} deepLink={deepLink} onNavigate={handleNav} registerSubBack={registerSubBack} /></div>}
        {show("contracts") && <div style={vis("contracts")}><Contracts contracts={appData.contracts || []} clients={jClients} pubs={pubs} sales={jSales} team={team} jurisdiction={jurisdiction} currentUser={currentUser} onNavigate={handleNav} loadContracts={appData.loadAllContracts} contractsLoaded={appData.allContractsLoaded} deleteContract={appData.deleteContract} bus={bus} /></div>}
        {show("billing") && <div style={vis("billing")}><Billing jurisdiction={jurisdiction} clients={jClients} sales={jSales} pubs={pubs} issues={jIssues} proposals={jProposals} invoices={jInvoices} setInvoices={setInvoices} payments={payments} setPayments={setPayments} bus={bus} team={team} subscribers={subscribers} subscriptionPayments={appData.subscriptionPayments || []} contracts={appData.contracts || []} loadContracts={appData.loadContracts} billingLoaded={appData.billingLoaded} bills={bills} insertBill={appData.insertBill} updateBill={appData.updateBill} deleteBill={appData.deleteBill} /></div>}
        {show("calendar") && <div style={vis("calendar")}><CalendarPage clients={jClients} sales={jSales} issues={jIssues} pubs={pubs} team={team} currentUser={currentUser} stories={jStories} bus={bus} onNavigate={handleNav} /></div>}
        {show("flatplan") && <div style={vis("flatplan")}><Flatplan jurisdiction={jurisdiction} pubs={pubs} issues={jIssues} setIssues={setIssues} sales={jSales} setSales={setSales} updateSale={appData.updateSale} clients={jClients} contracts={appData.contracts || []} stories={jStories} globalPageStories={globalPageStories} setGlobalPageStories={setGlobalPageStories} lastIssue={lastFlatplanIssue} lastPub={lastFlatplanPub} onSelectionChange={(p, i) => { setLastFlatplanPub(p); setLastFlatplanIssue(i); }} /></div>}
        {show("editorial") && <div style={vis("editorial")}><EditorialDashboard stories={jStories} setStories={setStories} pubs={pubs} issues={jIssues} team={team} bus={bus} editorialPermissions={jurisdiction} currentUser={currentUser} publishStory={publishStory} unpublishStory={unpublishStory} editions={appData.editions || []} setEditions={appData.setEditions} /></div>}
        {show("analytics") && <div style={vis("analytics")}><Analytics pubs={pubs} sales={jSales} clients={jClients} issues={jIssues} stories={jStories} invoices={jInvoices} payments={payments} subscribers={subscribers} legalNotices={legalNotices} creativeJobs={jJobs} dropLocations={dropLocations} dropLocationPubs={dropLocationPubs} drivers={drivers} bills={bills} commissionPayouts={appData.commissionPayouts || []} /></div>}
        {show("medialibrary") && <div style={vis("medialibrary")}><MediaLibrary pubs={pubs} allPubs={appData.allPubs || pubs} currentUser={currentUser} mediaAssets={appData.mediaAssets || []} mediaAssetsLoaded={appData.mediaAssetsLoaded} loadMediaAssets={appData.loadMediaAssets} pushMediaAsset={appData.pushMediaAsset} removeMediaAsset={appData.removeMediaAsset} /></div>}
        {show("messaging") && <div style={vis("messaging")}><Messaging team={team} currentUser={currentUser} /></div>}
        {show("mail") && <div style={vis("mail")}><Mail /></div>}
        {show("newsletters") && <div style={vis("newsletters")}><NewsletterPage pubs={pubs} currentUser={currentUser} /></div>}
        {show("sitesettings") && <div style={vis("sitesettings")}><SiteSettings pubs={pubs} setPubs={setPubs} /></div>}
        {show("emailtemplates") && <div style={vis("emailtemplates")}><EmailTemplates pubs={pubs} currentUser={currentUser} /></div>}
        {show("integrations") && <div style={vis("integrations")}><IntegrationsPage pubs={pubs} /></div>}
        {show("dataimport") && <div style={vis("dataimport")}><DataImport onClose={() => handleNav("integrations")} /></div>}
        {show("permissions") && <div style={vis("permissions")}><Permissions team={team} updateTeamMember={appData.updateTeamMember} /></div>}
        {show("team") && <div style={vis("team")}><TeamModule team={team} setTeam={setTeam} sales={jSales} stories={jStories} tickets={tickets} subscribers={subscribers} legalNotices={legalNotices} creativeJobs={jJobs} pubs={pubs} clients={jClients} updateTeamMember={appData.updateTeamMember} deleteTeamMember={appData.deleteTeamMember} onOpenMemberProfile={openTeamMemberProfile} /></div>}
        {show("team-member") && <div style={vis("team-member")}><TeamMemberProfile memberId={selectedTeamMemberId} team={team} pubs={pubs} clients={jClients} sales={jSales} stories={jStories} setStories={setStories} issues={jIssues} payments={payments} subscribers={subscribers} tickets={tickets} legalNotices={legalNotices} creativeJobs={jJobs} invoices={jInvoices} updateTeamMember={appData.updateTeamMember} deleteTeamMember={appData.deleteTeamMember} salespersonPubAssignments={appData.salespersonPubAssignments || []} upsertPubAssignment={appData.upsertPubAssignment} deletePubAssignment={appData.deletePubAssignment} commissionRates={appData.commissionRates || []} upsertCommissionRate={appData.upsertCommissionRate} currentUser={currentUser} onNavigate={handleNav} setIssueDetailId={setIssueDetailId} /></div>}
        {show("circulation") && <div style={vis("circulation")}><Circulation pubs={pubs} issues={jIssues} subscribers={subscribers} setSubscribers={setSubscribers} subscriptions={appData.subscriptions || []} setSubscriptions={appData.setSubscriptions} subscriptionPayments={appData.subscriptionPayments || []} mailingLists={appData.mailingLists || []} setMailingLists={appData.setMailingLists} dropLocations={dropLocations} setDropLocations={setDropLocations} dropLocationPubs={dropLocationPubs} setDropLocationPubs={setDropLocationPubs} drivers={drivers} setDrivers={setDrivers} driverRoutes={driverRoutes} setDriverRoutes={setDriverRoutes} routeStops={routeStops} setRouteStops={setRouteStops} bus={bus} team={team} currentUser={currentUser} /></div>}
        {show("servicedesk") && <div style={vis("servicedesk")}><ServiceDesk tickets={tickets} setTickets={setTickets} ticketComments={ticketComments} setTicketComments={setTicketComments} clients={jClients} subscribers={subscribers} pubs={pubs} issues={jIssues} team={team} bus={bus} /></div>}
        {show("performance") && <div style={vis("performance")}><Performance sales={jSales} clients={jClients} stories={jStories} issues={jIssues} adProjects={appData.adProjects || []} loadAdProjects={appData.loadAdProjects} team={team} onNavigate={handleNav} /></div>}
        {show("legalnotices") && <div style={vis("legalnotices")}><LegalNotices legalNotices={legalNotices} setLegalNotices={setLegalNotices} legalNoticeIssues={legalNoticeIssues} setLegalNoticeIssues={setLegalNoticeIssues} pubs={pubs} issues={jIssues} team={team} bus={bus} clients={jClients} currentUser={currentUser} insertClient={appData.insertClient} insertInvoice={appData.insertInvoice} insertLegalNotice={appData.insertLegalNotice} /></div>}
        {show("adprojects") && <div style={vis("adprojects")}><AdProjects pubs={pubs} clients={jClients} sales={jSales} issues={jIssues} team={team} currentUser={currentUser} /></div>}
        {show("creativejobs") && <div style={vis("creativejobs")}><CreativeJobs jurisdiction={jurisdiction} creativeJobs={jJobs} setCreativeJobs={setCreativeJobs} clients={jClients} team={team} bus={bus} /></div>}
        </Suspense>
        </ErrorBoundary>
      </main>
    </div>

    {/* Profile Panel */}
    {showProfile && <Suspense fallback={null}><ProfilePanel user={currentUser} team={team} pubs={pubs} onClose={() => setShowProfile(false)} /></Suspense>}
    </div>
  </>;
}
