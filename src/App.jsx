// ============================================================
// App.jsx — Application Shell
// Persistent pages (display:none), role-based nav, back button
// ============================================================
import { useState, useEffect, lazy, Suspense, memo } from "react";
import { useAppData } from "./hooks/useAppData";
import { useAuth } from "./hooks/useAuth";
import { useJurisdiction } from "./hooks/useJurisdiction";
import { isOnline } from "./lib/supabase";
import { Z, DARK, LIGHT, COND, BODY, FONT_URL, R } from "./lib/theme";
import { Ic, ThemeToggle, BackBtn } from "./components/ui";
import {
  INIT_PUBS, INIT_CLIENTS, INIT_TEAM,
  buildAllIssues, generateSampleSales, generateSampleProposals,
  INIT_NOTIFICATIONS,
} from "./data/seed";

// Eagerly loaded (always needed on boot)
import Dashboard from "./pages/Dashboard";
import IssueDetail from "./pages/IssueDetail";

// Lazy-loaded pages (split into separate chunks)
const Publications = lazy(() => import("./pages/Publications"));
const IssueSchedule = lazy(() => import("./pages/IssueSchedule"));
const SalesCRM = lazy(() => import("./pages/SalesCRM"));
const Contracts = lazy(() => import("./pages/sales/Contracts"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const StoriesModule = lazy(() => import("./pages/StoriesModule"));
const EditorialDashboard = lazy(() => import("./components/EditorialDashboard"));
const Flatplan = lazy(() => import("./pages/Flatplan"));
const TeamModule = lazy(() => import("./pages/TeamModule"));
const Analytics = lazy(() => import("./pages/Analytics"));
const IntegrationsPage = lazy(() => import("./pages/IntegrationsPage"));
const SiteSettings = lazy(() => import("./pages/SiteSettings"));
const MediaLibrary = lazy(() => import("./pages/MediaLibrary"));
const DataImport = lazy(() => import("./pages/DataImport"));
const Billing = lazy(() => import("./pages/Billing"));
const Circulation = lazy(() => import("./pages/Circulation"));
const ServiceDesk = lazy(() => import("./pages/ServiceDesk"));
const LegalNotices = lazy(() => import("./pages/LegalNotices"));
const CreativeJobs = lazy(() => import("./pages/CreativeJobs"));
const Permissions = lazy(() => import("./pages/Permissions"));
const EditionManager = lazy(() => import("./pages/EditionManager"));
const Mail = lazy(() => import("./pages/Mail"));
const ProfilePanel = lazy(() => import("./pages/ProfilePanel"));

import { useCrossModuleWiring } from "./hooks/useCrossModuleWiring";

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

  // ─── Cross-Module Event Bus ─────────────────────────────
  const bus = useCrossModuleWiring({ setNotifications, setInvoices, invoices, clients, pubs, issues, sales });

  // ─── Navigation State ───────────────────────────────────
  const [pg, setPg] = useState("dashboard");
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

  const toggleSection = (key) => setCollapsedSections(s => ({ ...s, [key]: !s[key] }));

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
      }
      return;
    }
    setDeepLink(null);
    if (newPg !== pg) {
      setPgHistory(h => [...h, pg]);
      setPg(newPg);
      setIssueDetailId(null);
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
    if (pg === 'billing') loads.push(appData.loadBilling?.());
    if (pg === 'editorial' || pg === 'stories' || pg === 'flatplan') { loads.push(appData.loadStories?.(), appData.loadFullSales?.()); }
    if (pg === 'circulation') loads.push(appData.loadCirculation?.(true));
    if (pg === 'servicedesk') { loads.push(appData.loadTickets?.(), appData.loadCirculation?.()); }
    if (pg === 'legalnotices') loads.push(appData.loadLegals?.());
    if (pg === 'creativejobs') loads.push(appData.loadCreative?.());
    if (pg === 'editions') loads.push(appData.loadEditions?.());
    if (loads.length > 0) Promise.all(loads.filter(Boolean));
  }, [pg, online]);

  const goBack = () => {
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
    const handler = () => { handleNav("billing"); };
    bus.on("invoice.create", handler);
    return () => bus.off("invoice.create", handler);
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

  // ─── Nav Config (with permission keys) ────────────────
  // Map nav IDs to module permission keys
  const NAV_PERM_MAP = {
    dashboard: 'dashboard', sales: 'sales', contracts: 'sales', billing: 'billing',
    stories: 'stories', editorial: 'stories', flatplan: 'flatplan',
    circulation: 'circulation', servicedesk: 'service_desk',
    legalnotices: 'legal_notices', creativejobs: 'creative_jobs',
    calendar: 'calendar', team: 'team', publications: 'publications',
    schedule: 'publications', analytics: 'analytics', integrations: 'integrations',
    permissions: 'permissions', dataimport: 'integrations',
    medialibrary: 'stories',
    editions: 'publications',
    sitesettings: 'publications',
  };

  // Get current user's module permissions (from impersonated user or real user)
  const userModules = currentUser?.module_permissions || currentUser?.modulePermissions || [];
  const hasModule = (navId) => {
    if (isAdmin && !impersonating) return true; // real admin sees everything
    const perm = NAV_PERM_MAP[navId];
    return !perm || userModules.includes(perm);
  };

  const NAV = [
    { id: "dashboard", label: "My Dash", icon: Ic.dash },
    { id: "calendar", label: "Calendar", icon: Ic.cal },
    { id: "mail", label: "Mail", icon: Ic.mail },
    { id: "_revenue", section: true, label: "Revenue" },
    { id: "sales", label: "Sales", icon: Ic.sale, badge: (salesActive || 0) + (newInquiries || 0) || null, badgeColor: newInquiries > 0 ? Z.ac : null },
    { id: "contracts", label: "Contracts", icon: Ic.sign },
    { id: "billing", label: "Billing", icon: Ic.invoice, badge: overdueInvoices || null, badgeColor: overdueInvoices > 0 ? Z.da : null },
    { id: "_content", section: true, label: "Content" },
    { id: "stories", label: "Stories", icon: Ic.story, badge: storiesInEdit || null },
    { id: "editorial", label: "Editorial", icon: Ic.list },
    { id: "flatplan", label: "Flatplan", icon: Ic.flat },
    { id: "editions", label: "Editions", icon: Ic.pub },
    { id: "sitesettings", label: "MyWebsites", icon: Ic.globe },
    { id: "medialibrary", label: "Media Library", icon: Ic.flat },
    { id: "_operations", section: true, label: "Operations" },
    { id: "circulation", label: "Circulation", icon: Ic.pub, badge: subExpiring || null },
    { id: "servicedesk", label: "Service Desk", icon: Ic.chat, badge: openTickets || null, badgeColor: escalatedTickets > 0 ? Z.da : null },
    { id: "legalnotices", label: "Legal Notices", icon: Ic.gavel, badge: activeLegal || null },
    { id: "creativejobs", label: "Creative Services", icon: Ic.paintbrush, badge: activeJobs || null },
    { id: "_system", section: true, label: "System" },
    { id: "team", label: "Team", icon: Ic.user },
    { id: "publications", label: "Publications", icon: Ic.pub },
    { id: "schedule", label: "Schedule", icon: Ic.story },
    { id: "analytics", label: "Analytics", icon: Ic.barChart },
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
  const [visited, setVisited] = useState(new Set(["dashboard"]));
  useEffect(() => { setVisited(prev => { if (prev.has(pg)) return prev; const n = new Set(prev); n.add(pg); return n; }); }, [pg]);
  const vis = (pageId) => ({ display: pg === pageId ? "block" : "none" });
  const show = (pageId) => visited.has(pageId);

  const isDark = Z.bg === DARK.bg;

  // ─── Render ─────────────────────────────────────────────
  return <div style={{ display: "flex", height: "100vh", background: Z.bg, color: Z.tx, fontFamily: BODY }}>
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
                {isCollapsed && sectionBadgeTotal > 0 && <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: Z.tx, borderRadius: 3, padding: "0 4px", minWidth: 14, textAlign: "center", lineHeight: "16px" }}>{sectionBadgeTotal}</span>}
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
                  fontSize: 9, fontWeight: 800, color: "#fff",
                  background: n.badgeColor || Z.tx, borderRadius: 3,
                  padding: "0 5px", minWidth: 16, textAlign: "center", lineHeight: "16px",
                }}>{n.badge}</span>}
                {col && n.badge && <div style={{ position: "relative", width: 0, height: 0 }}>
                  <span style={{ position: "absolute", top: -14, right: -6, fontSize: 8, fontWeight: 900, color: "#fff", background: n.badgeColor || Z.tx, borderRadius: 3, padding: "0 3px", lineHeight: "14px" }}>{n.badge}</span>
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

      {/* ── Top Bar — hidden on dashboard ─────────────── */}
      {pg !== "dashboard" && <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "6px 20px", borderBottom: `1px solid ${Z.bd}`, background: isDark ? "rgba(14,16,24,0.7)" : "rgba(246,247,249,0.7)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", flexShrink: 0 }}>
        <div>
          <button onClick={goBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: Z.tm, fontSize: 12, fontWeight: 600, padding: "4px 8px", borderRadius: 3 }}
            onMouseOver={e => e.currentTarget.style.color = Z.tx}
            onMouseOut={e => e.currentTarget.style.color = Z.tm}
          ><Ic.back size={14} /> Back</button>
        </div>
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowNotifs(s => !s)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.tm, padding: 4 }}>
            <Ic.clock size={18} />
            {unreadCount > 0 && <span style={{ position: "absolute", top: -2, right: -4, background: Z.da, color: "#fff", fontSize: 9, fontWeight: 900, borderRadius: 3, padding: "1px 4px" }}>{unreadCount}</span>}
          </button>
          {showNotifs && <div onClick={() => setShowNotifs(false)} style={{ position: "fixed", inset: 0, zIndex: 98 }} />}
          {showNotifs && <div style={{ position: "absolute", right: 0, top: 34, width: 320, maxHeight: 400, overflowY: "auto", background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: 3, zIndex: 99, boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${Z.bd}` }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: Z.tx }}>My Alerts</span>
              {unreadCount > 0 && <button onClick={markAllRead} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: Z.tx, textDecoration: "underline", textUnderlineOffset: 3 }}>Mark all read</button>}
            </div>
            {[...(notifications || [])].sort((a, b) => a.read === b.read ? 0 : a.read ? 1 : -1).slice(0, 12).map(n => <div key={n.id} onClick={() => { setNotifications(ns => ns.map(x => x.id === n.id ? { ...x, read: !x.read } : x)); if (n.route && !n.read) { handleNav(n.route); setShowNotifs(false); } }} style={{ padding: "10px 16px", borderBottom: `1px solid ${Z.bd}`, cursor: n.route ? "pointer" : "default", background: n.read ? "transparent" : Z.as }}><div style={{ fontSize: 13, color: n.read ? Z.td : Z.tx, fontWeight: n.read ? 400 : 700 }}>{n.text}</div><div style={{ fontSize: 11, color: Z.td, marginTop: 3 }}>{n.time}</div></div>)}
          </div>}
        </div>
      </header>}

      {/* ── Page Content ──────────────────────────────────── */}
      <main data-main style={{ flex: 1, overflow: "auto", padding: pg === "dashboard" ? 0 : 28, background: "transparent" }}>

        {/* Dashboard — special handling for issue detail overlay */}
        <div style={vis("dashboard")}>
          {!online && <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Waiting for data...</div>}
          {online && !clients.length && <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Loading clients...</div>}
          {online && clients.length > 0 && (issueDetailId
            ? <IssueDetail issueId={issueDetailId} pubs={pubs} issues={issues} sales={sales} stories={stories} clients={clients} onBack={() => setIssueDetailId(null)} onNavigate={handleNav} />
            : <Dashboard pubs={pubs} stories={stories} clients={clients} sales={sales} issues={issues} proposals={proposals} team={team} invoices={invoices} payments={payments} subscribers={subscribers} dropLocations={dropLocations} dropLocationPubs={dropLocationPubs} tickets={tickets} legalNotices={legalNotices} creativeJobs={creativeJobs} onNavigate={handleNav} setIssueDetailId={setIssueDetailId} userName={currentUser?.name} currentUser={currentUser} salespersonPubAssignments={appData.salespersonPubAssignments} jurisdiction={jurisdiction} myPriorities={appData.myPriorities} priorityHelpers={{ addPriority: appData.addPriority, removePriority: appData.removePriority, highlightPriority: appData.highlightPriority, autoRemoveClosedPriorities: appData.autoRemoveClosedPriorities }} />
          )}
        </div>

        {/* All other pages — lazy-mounted on first visit, hidden when not active, code-split */}
        <Suspense fallback={<LazyFallback />}>
        {show("publications") && <div style={vis("publications")}><Publications pubs={pubs} setPubs={setPubs} issues={issues} setIssues={setIssues} sales={sales} insertIssuesBatch={appData.insertIssuesBatch} insertPublication={appData.insertPublication} updatePublication={appData.updatePublication} insertAdSizes={appData.insertAdSizes} updatePubGoal={appData.updatePubGoal} updateIssueGoal={appData.updateIssueGoal} /></div>}
        {show("schedule") && <div style={vis("schedule")}><IssueSchedule pubs={pubs} issues={issues} setIssues={setIssues} sales={sales} /></div>}
        {show("stories") && <div style={vis("stories")}><StoriesModule stories={stories} setStories={setStories} pubs={pubs} issues={issues} globalPageStories={globalPageStories} setGlobalPageStories={setGlobalPageStories} /></div>}
        {show("sales") && <div style={vis("sales")}><SalesCRM jurisdiction={jurisdiction} clients={clients} setClients={setClients} sales={sales} setSales={setSales} pubs={pubs} issues={issues} proposals={proposals} setProposals={setProposals} notifications={notifications} setNotifications={setNotifications} bus={bus} team={team} currentUser={currentUser} contracts={appData.contracts || []} insertClient={appData.insertClient} updateClient={appData.updateClient} insertProposal={appData.insertProposal} updateProposal={appData.updateProposal} convertProposal={appData.convertProposal} commissionLedger={appData.commissionLedger} commissionPayouts={appData.commissionPayouts} commissionGoals={appData.commissionGoals} commissionRates={appData.commissionRates} salespersonPubAssignments={appData.salespersonPubAssignments} commissionHelpers={{ upsertPubAssignment: appData.upsertPubAssignment, deletePubAssignment: appData.deletePubAssignment, upsertCommissionRate: appData.upsertCommissionRate, deleteCommissionRate: appData.deleteCommissionRate, upsertIssueGoal: appData.upsertIssueGoal, calculateSaleCommission: appData.calculateSaleCommission, recalculateAllCommissions: appData.recalculateAllCommissions, markCommissionsPaid: appData.markCommissionsPaid, updateTeamMember: appData.updateTeamMember }} outreachCampaigns={appData.outreachCampaigns} outreachEntries={appData.outreachEntries} myPriorities={appData.myPriorities} priorityHelpers={{ addPriority: appData.addPriority, removePriority: appData.removePriority, highlightPriority: appData.highlightPriority }} outreachHelpers={{ insertCampaign: appData.insertCampaign, updateCampaign: appData.updateCampaign, insertOutreachEntries: appData.insertOutreachEntries, updateOutreachEntry: appData.updateOutreachEntry }} adInquiries={appData.adInquiries} loadInquiries={appData.loadInquiries} inquiriesLoaded={appData.inquiriesLoaded} updateInquiry={appData.updateInquiry} deepLink={deepLink} /></div>}
        {show("contracts") && <div style={vis("contracts")}><Contracts contracts={appData.contracts || []} clients={clients} pubs={pubs} sales={sales} team={team} onNavigate={handleNav} loadContracts={appData.loadContracts} contractsLoaded={appData.contractsLoaded} /></div>}
        {show("billing") && <div style={vis("billing")}><Billing jurisdiction={jurisdiction} clients={clients} sales={sales} pubs={pubs} issues={issues} proposals={proposals} invoices={invoices} setInvoices={setInvoices} payments={payments} setPayments={setPayments} bus={bus} /></div>}
        {show("calendar") && <div style={vis("calendar")}><CalendarPage clients={clients} sales={sales} issues={issues} pubs={pubs} onNavigate={handleNav} /></div>}
        {show("flatplan") && <div style={vis("flatplan")}><Flatplan jurisdiction={jurisdiction} pubs={pubs} issues={issues} setIssues={setIssues} sales={sales} setSales={setSales} updateSale={appData.updateSale} clients={clients} stories={stories} globalPageStories={globalPageStories} setGlobalPageStories={setGlobalPageStories} lastIssue={lastFlatplanIssue} lastPub={lastFlatplanPub} onSelectionChange={(p, i) => { setLastFlatplanPub(p); setLastFlatplanIssue(i); }} /></div>}
        {show("editorial") && <div style={vis("editorial")}><EditorialDashboard stories={stories} setStories={setStories} pubs={pubs} issues={issues} team={team} bus={bus} editorialPermissions={jurisdiction} currentUser={currentUser} publishStory={publishStory} unpublishStory={unpublishStory} /></div>}
        {show("analytics") && <div style={vis("analytics")}><Analytics pubs={pubs} sales={sales} clients={clients} issues={issues} stories={stories} invoices={invoices} payments={payments} subscribers={subscribers} legalNotices={legalNotices} creativeJobs={creativeJobs} dropLocations={dropLocations} dropLocationPubs={dropLocationPubs} drivers={drivers} /></div>}
        {show("medialibrary") && <div style={vis("medialibrary")}><MediaLibrary pubs={pubs} /></div>}
        {show("mail") && <div style={vis("mail")}><Mail /></div>}
        {show("editions") && <div style={vis("editions")}><EditionManager pubs={pubs} editions={appData.editions || []} setEditions={appData.setEditions} /></div>}
        {show("sitesettings") && <div style={vis("sitesettings")}><SiteSettings pubs={pubs} setPubs={setPubs} /></div>}
        {show("integrations") && <div style={vis("integrations")}><IntegrationsPage pubs={pubs} /></div>}
        {show("dataimport") && <div style={vis("dataimport")}><DataImport onClose={() => handleNav("integrations")} /></div>}
        {show("permissions") && <div style={vis("permissions")}><Permissions team={team} updateTeamMember={appData.updateTeamMember} /></div>}
        {show("team") && <div style={vis("team")}><TeamModule team={team} setTeam={setTeam} sales={sales} stories={stories} tickets={tickets} subscribers={subscribers} legalNotices={legalNotices} creativeJobs={creativeJobs} pubs={pubs} clients={clients} updateTeamMember={appData.updateTeamMember} /></div>}
        {show("circulation") && <div style={vis("circulation")}><Circulation pubs={pubs} issues={issues} subscribers={subscribers} setSubscribers={setSubscribers} subscriptions={appData.subscriptions || []} setSubscriptions={appData.setSubscriptions} subscriptionPayments={appData.subscriptionPayments || []} mailingLists={appData.mailingLists || []} setMailingLists={appData.setMailingLists} dropLocations={dropLocations} setDropLocations={setDropLocations} dropLocationPubs={dropLocationPubs} setDropLocationPubs={setDropLocationPubs} drivers={drivers} setDrivers={setDrivers} driverRoutes={driverRoutes} setDriverRoutes={setDriverRoutes} routeStops={routeStops} setRouteStops={setRouteStops} bus={bus} team={team} currentUser={currentUser} /></div>}
        {show("servicedesk") && <div style={vis("servicedesk")}><ServiceDesk tickets={tickets} setTickets={setTickets} ticketComments={ticketComments} setTicketComments={setTicketComments} clients={clients} subscribers={subscribers} pubs={pubs} issues={issues} team={team} bus={bus} /></div>}
        {show("legalnotices") && <div style={vis("legalnotices")}><LegalNotices legalNotices={legalNotices} setLegalNotices={setLegalNotices} legalNoticeIssues={legalNoticeIssues} setLegalNoticeIssues={setLegalNoticeIssues} pubs={pubs} issues={issues} team={team} bus={bus} /></div>}
        {show("creativejobs") && <div style={vis("creativejobs")}><CreativeJobs jurisdiction={jurisdiction} creativeJobs={creativeJobs} setCreativeJobs={setCreativeJobs} clients={clients} team={team} bus={bus} /></div>}
        </Suspense>
      </main>
    </div>

    {/* Profile Panel */}
    {showProfile && <Suspense fallback={null}><ProfilePanel user={currentUser} team={team} pubs={pubs} onClose={() => setShowProfile(false)} /></Suspense>}
  </div>;
}
