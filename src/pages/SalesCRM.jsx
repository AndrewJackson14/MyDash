import { useState, useRef, useMemo, useEffect, memo, lazy, Suspense } from "react";
import { useDialog } from "../hooks/useDialog";
import { Z, SC, COND, DISPLAY, FS, FW, Ri, CARD, R, INV, ACCENT } from "../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Card, SB, TB, Stat, Modal, Bar, FilterBar, SortHeader, BackBtn, ThemeToggle, GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, ListCard, ListDivider, ListGrid, glass, cardSurface, Pill, FilterPillStrip } from "../components/ui";
import FuzzyPicker from "../components/FuzzyPicker";
import { COMPANY, CONTACT_ROLES, COMM_TYPES, COMM_AUTHORS, STORY_AUTHORS } from "../constants";
import { sendGmailEmail } from "../lib/gmail";
import { generatePdf } from "../lib/pdf";
import { supabase } from "../lib/supabase";
import { generateContractHtml } from "../lib/contractTemplate";
import { generateInvoiceHtml } from "../lib/invoiceTemplate";
import { fmtTimeRelative } from "../lib/formatters";
import ClientList from "./sales/ClientList";
import EntityThread from "../components/EntityThread";
import ProposalWizard from "../components/proposal-wizard/ProposalWizard";
// Heavy sub-views — only load when the user opens the relevant tab/row
const ClientProfile = lazy(() => import("./sales/ClientProfile"));
const ClientSignals = lazy(() => import("./sales/ClientSignals"));
const Commissions = lazy(() => import("./sales/Commissions"));
const Outreach = lazy(() => import("./sales/Outreach"));
const SubFallback = () => <div style={{ padding: 40, textAlign: "center", color: "#525E72", fontSize: 13 }}>Loading…</div>;
import { PIPELINE, PIPELINE_COLORS, STAGE_AUTO_ACTIONS, ACTION_TYPES, actInfo, INDUSTRIES, LEAD_SOURCES, computeClientStatus, CLIENT_STATUS_COLORS } from "./sales/constants";
import { usePageHeader } from "../contexts/PageHeaderContext";

// Constants imported from ./sales/constants

const SalesCRM = (props) => {
  const { clients, setClients, sales, setSales, updateSale, insertSale, pubs, issues, proposals, setProposals, notifications, setNotifications, bus, contracts, setContracts, loadContracts, contractsLoaded, invoices, payments, insertClient, updateClient, insertProposal, updateProposal, convertProposal, loadProposalHistory, commissionLedger, commissionPayouts, commissionGoals, commissionRates, salespersonPubAssignments, commissionHelpers, outreachCampaigns, outreachEntries, outreachHelpers, jurisdiction, myPriorities, priorityHelpers, adInquiries, loadInquiries, inquiriesLoaded, updateInquiry, retainInquiriesRealtime, digitalAdProducts, loadDigitalAdProducts, digitalAdProductsLoaded, onNavigate, registerSubBack, isActive } = props;

  // Publish TopBar header while this module is the active page. Gated on
  // isActive because App.jsx keeps modules mounted after first visit.
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({
        breadcrumb: [{ label: "Home" }, { label: "Sales" }],
        title: "Sales",
      });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);

  // Keep ad_inquiries realtime channel open while this module is mounted.
  useEffect(() => retainInquiriesRealtime?.(), [retainInquiriesRealtime]);
  // Fetch ad_products once so we can show names (not just IDs) when an
  // inquirer picks specific catalog items.
  const [adProductMap, setAdProductMap] = useState({});
  useEffect(() => {
    supabase.from("ad_products").select("id, name").then(({ data }) => {
      const m = {};
      (data || []).forEach(p => { m[p.id] = p.name; });
      setAdProductMap(m);
    });
  }, []);
  const dialog = useDialog();
  // Publications for dropdowns: filtered by jurisdiction for salespeople, all for admins
  const dropdownPubs = jurisdiction?.myPubs || pubs;
  const [tab, setTab] = useState("Pipeline");
  const [prevTab, setPrevTab] = useState("Pipeline");
  const [proofReadyMap, setProofReadyMap] = useState({}); // { contractId: true }

  // Load proof-ready signal: ad_projects where designer signed off but salesperson hasn't
  useEffect(() => {
    supabase.from("ad_projects").select("source_contract_id")
      .eq("designer_signoff", true).eq("salesperson_signoff", false)
      .not("source_contract_id", "is", null)
      .then(({ data }) => {
        const m = {};
        (data || []).forEach(p => { if (p.source_contract_id) m[p.source_contract_id] = true; });
        setProofReadyMap(m);
      });
  }, []);
  const [commTab, setCommTab] = useState("Overview");
  const [clientView, setClientView] = useState("signals");
  const [sr, setSr] = useState("");
  const [fClientPub, setFClientPub] = useState("all");
  const [fPub, setFPub] = useState("all");
  const [myPipeline, setMyPipeline] = useState(true); // default: show only my deals
  const [cmo, setCmo] = useState(false);
  // wizardState — null when wizard is closed; { mode, clientId, proposalId?,
  // pendingSaleId?, initialPrefill? } when open. Replaces the legacy propMo
  // boolean + ~20 prop* useState calls (proposal-wizard-spec.md §4).
  const [wizardState, setWizardState] = useState(null);
  const [oppMo, setOppMo] = useState(false);
  const [oppSendKit, setOppSendKit] = useState(false);
  const [oppKitPubs, setOppKitPubs] = useState([]);
  const [oppKitMsg, setOppKitMsg] = useState("");
  const [oppKitSent, setOppKitSent] = useState(false);
  const [ec, setEc] = useState(null);
  const [cf, setCf] = useState({ name: "", industries: [], leadSource: "", interestedPubs: [], contacts: [{ name: "", email: "", phone: "", role: "Business Owner" }], notes: "", billingEmail: "", billingCcEmails: ["", ""], billingAddress: "", billingAddress2: "", billingCity: "", billingState: "", billingZip: "" });
  const [viewClientId, setViewClientId] = useState(null);
  const [commForm, setCommForm] = useState({ type: "Comment", author: "Account Manager", note: "" });
  const [profFYear, setProfFYear] = useState("all");
  const [profFPub, setProfFPub] = useState("all");
  const [pipeView, setPipeView] = useState("actions");
  const [dragSaleId, setDragSaleId] = useState(null);
  // Issue picker modal — fires when a sale is moved to Closed without an
  // issueId. Required by migration 028's CHECK constraint on display_print
  // sales.
  const [closeIssueModal, setCloseIssueModal] = useState(null); // { saleId, pubId } | null
  const [closeIssueChoice, setCloseIssueChoice] = useState("");
  const [editOppId, setEditOppId] = useState(null);
  const [opp, setOpp] = useState({ company: "", contact: "", email: "", phone: "", source: "Referral", notes: "", nextAction: "Send media kit", nextActionDate: "" });
  const OPP_SOURCES = ["Referral", "Cold Call", "Walk-in", "Event", "Website Inquiry", "Social Media", "Existing Client"];
  const [viewPropId, setViewPropId] = useState(null);
  const [emailMo, setEmailMo] = useState(false);
  const [calMo, setCalMo] = useState(false);
  const [calSaleId, setCalSaleId] = useState(null);
  const [schEvent, setSchEvent] = useState(() => ({ title: "", date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), time: "10:00", duration: 30, clientId: "", type: "call", notes: "" }));
  const [emailTo, setEmailTo] = useState("");
  const [emailSubj, setEmailSubj] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSaleId, setEmailSaleId] = useState(null);
  const [nextStepMo, setNextStepMo] = useState(false);
  const [nextStepSaleId, setNextStepSaleId] = useState(null);
  const [nextStepAction, setNextStepAction] = useState(null);
  const [activityLog, setActivityLog] = useState([
    { id: "al1", text: "Moved to Closed", time: "9:15 AM", type: "pipeline", clientId: "c16", clientName: "Conejo Hardwoods" },
    { id: "al2", text: "Proposal sent — $3,600", time: "8:42 AM", type: "proposal", clientId: "c47", clientName: "UCLA Health" },
    { id: "al3", text: "New opportunity via Referral", time: "Yesterday", type: "opp", clientId: "c22", clientName: "Five Star Rain Gutters" },
  ]);
  const [actFilter, setActFilter] = useState("all");
  const [closedSort, setClosedSort] = useState({ key: "date", dir: "desc" });
  const [viewContractId, setViewContractId] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("contract") || null; } catch (e) { return null; }
  });
  // Two-way URL sync: `?contract=<id>` deep-links into the contract modal.
  // Mutates window.history directly so the back button still works.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (viewContractId) url.searchParams.set("contract", viewContractId);
      else url.searchParams.delete("contract");
      window.history.replaceState(null, "", url.toString());
    } catch (e) {}
  }, [viewContractId]);
  const [closedSearch, setClosedSearch] = useState("");
  const [closedRep, setClosedRep] = useState("all");
  const [showCancelled, setShowCancelled] = useState(false);
  const [propSearch, setPropSearch] = useState("");
  const [propStatus, setPropStatus] = useState("all");
  const [renewalCelebrated, setRenewalCelebrated] = useState(null);
  const [actExpanded, setActExpanded] = useState(null);

  // Deep-link handling from notifications + cross-page client jumps.
  // Accepts both the legacy `id` param (kept for existing callers) and the
  // new `clientId` / `saleId` params issued by useNav helpers.
  useEffect(() => {
    const dl = props.deepLink;
    if (!dl) return;
    if (dl.tab === "inquiries") {
      setTab("Inquiries");
      if (loadInquiries && !inquiriesLoaded) loadInquiries();
      return;
    }
    if (dl.tab === "clients") {
      const cid = dl.clientId || dl.id;
      setTab("Clients");
      if (cid) setViewClientId(cid);
      return;
    }
    if (dl.tab === "pipeline" && dl.saleId) {
      setTab("Pipeline");
      // Sale-row highlight handled inline by Pipeline rendering via
      // props.deepLink.saleId — no extra state needed here.
      return;
    }
  }, [props.deepLink]);

  // Build lookup maps for O(1) name resolution
  const clientMap = useMemo(() => { const m = {}; (clients || []).forEach(c => { m[c.id] = c.name; }); return m; }, [clients]);
  const pubMap = useMemo(() => { const m = {}; (pubs || []).forEach(p => { m[p.id] = p.name; }); return m; }, [pubs]);
  const issueMap = useMemo(() => { const m = {}; (issues || []).forEach(i => { m[i.id] = i; }); return m; }, [issues]);
  const cn = id => clientMap[id] || "—";
  const pn = id => pubMap[id] || "—";
  const issLabel = id => issueMap[id]?.label || "—";
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  // Issues whose publish date is within the last 5 days — Follow-up column
  // shows sales attached to these (clients whose ad ran very recently).
  const recentPublishedIssueIds = new Set((issues || []).filter(i => i.date && i.date >= fiveDaysAgo && i.date <= today).map(i => i.id));
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const addNotif = (t) => { if (setNotifications) setNotifications(n => [...n, { id: "n" + Date.now(), text: t, time: new Date().toLocaleTimeString(), read: false }]); };
  const logActivity = (t, type, cId, cName) => setActivityLog(a => [{ id: "al" + Date.now(), text: t, time: new Date().toLocaleTimeString(), type, clientId: cId, clientName: cName }, ...a].slice(0, 50));
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const dateColor = (d) => { if (!d) return Z.td; if (d < today) return Z.da; if (d === today) return Z.wa; if (d <= nextWeek) return Z.su; return Z.td; };
  const stageRevenue = (st) => sales.filter(s => s.status === st).reduce((sm, s) => sm + s.amount, 0);
  const navTo = (t, cId) => { setPrevTab(tab + (viewClientId ? `:${viewClientId}` : "")); setTab(t); setViewClientId(cId || null); };
  const goBack = () => { const [t, c] = (prevTab || "Pipeline").split(":"); setTab(t); setViewClientId(c || null); };
  const propPubNames = (p) => [...new Set(p.lines.map(l => l.pubName))].join(", ");
  const hasProposal = (saleId) => { const s = sales.find(x => x.id === saleId); return s?.proposalId || proposals.some(p => p.clientId === s?.clientId && (p.status === "Sent" || p.status === "Signed & Converted" || p.status === "Draft")); };
  const getClientProposal = (cid) => proposals.find(p => p.clientId === cid && (p.status === "Sent" || p.status === "Signed & Converted"));
  const actLabel = (s) => { const a = actInfo(s.nextAction); return a ? a.label : ""; };
  const actIcon = (s) => { const a = actInfo(s.nextAction); return a?.icon || "→"; };
  const actVerb = (s) => { const a = actInfo(s.nextAction); return a?.verb || "Act"; };

  const currentUser = props.currentUser;

  // Register sub-view back handler with global back button
  useEffect(() => {
    if (!registerSubBack) return;
    registerSubBack(() => {
      if (viewPropId) { setViewPropId(null); return true; }
      if (viewContractId) { setViewContractId(null); return true; }
      if (viewClientId) { setViewClientId(null); return true; }
      return false;
    });
    return () => registerSubBack(null);
  }, [registerSubBack, viewPropId, viewContractId, viewClientId]);
  // Proposal history (JSONB activity log) lazy-loads when the detail view opens.
  useEffect(() => {
    if (viewPropId && loadProposalHistory) loadProposalHistory(viewPropId);
  }, [viewPropId, loadProposalHistory]);
  const myClientIds = new Set((clients || []).filter(c => c.repId === currentUser?.id).map(c => c.id));
  const activeSales = sales.filter(s => { if (myPipeline && currentUser?.id && !myClientIds.has(s.clientId)) return false; if (fPub !== "all" && s.publication !== fPub) return false; if (sr && !cn(s.clientId).toLowerCase().includes(sr.toLowerCase())) return false; return true; });
  const actionSales = activeSales.filter(s => s.nextAction && s.status !== "Closed" && s.status !== "Follow-up").sort((a, b) => (a.nextActionDate || "9").localeCompare(b.nextActionDate || "9"));
  const todaysActions = activeSales.filter(s => s.nextAction && (s.nextActionDate <= today || !s.nextActionDate) && s.status !== "Closed" && s.status !== "Follow-up").sort((a, b) => (a.nextActionDate || "9").localeCompare(b.nextActionDate || "9"));
  const closedSales = sales.filter(s => s.status === "Closed").sort((a, b) => b.date.localeCompare(a.date));
  // Renewals: group closed sales by client, show one entry per client with most recent sale
  // Renewals: clients whose status is 'Renewal' (contract expiring within 45 days or ad-hoc buyer)
  // Plus top Lapsed clients sorted by total spend for re-engagement
  const renewalsDue = useMemo(() => {
    // Build per-client sales aggregates
    const salesByClient = {};
    sales.filter(s => s.status === "Closed").forEach(s => {
      if (!salesByClient[s.clientId]) salesByClient[s.clientId] = { totalSpend: 0, saleCount: 0, pubs: new Set(), lastDate: s.date, lastSale: s };
      const c = salesByClient[s.clientId];
      c.totalSpend += s.amount;
      c.saleCount++;
      if (s.publication) c.pubs.add(s.publication);
      if (s.date > c.lastDate) { c.lastDate = s.date; c.lastSale = s; }
    });

    // Get renewal clients (status === 'Renewal') and lapsed clients
    const renewalClients = (clients || []).filter(c => c.status === "Renewal" || c.status === "Lapsed");

    return renewalClients
      .map(c => {
        const agg = salesByClient[c.id] || { totalSpend: 0, saleCount: 0, pubs: new Set(), lastDate: "", lastSale: {} };
        return {
          clientId: c.id,
          clientStatus: c.status,
          contractEndDate: c.contractEndDate,
          totalSpend: agg.totalSpend,
          saleCount: agg.saleCount,
          pubCount: agg.pubs.size,
          lastDate: agg.lastDate || c.lastAdDate || "",
          amount: agg.totalSpend,
          publication: agg.lastSale?.publication,
          id: c.id,
        };
      })
      .filter(c => c.totalSpend > 0)
      .sort((a, b) => b.totalSpend - a.totalSpend);
  }, [sales, clients]);

  const saveC = async () => {
    if (!cf.name) return;
    const cleanCc = (cf.billingCcEmails || []).map(e => (e || "").trim()).filter(Boolean).slice(0, 2);
    const billingEmail = (cf.billingEmail || "").trim() || null;
    const billingAddress = (cf.billingAddress || "").trim() || null;
    const billingAddress2 = (cf.billingAddress2 || "").trim() || null;
    const billingCity = (cf.billingCity || "").trim() || null;
    const billingState = (cf.billingState || "").trim() || null;
    const billingZip = (cf.billingZip || "").trim() || null;
    if (ec) {
      // Edit existing client
      if (updateClient) {
        await updateClient(ec.id, { name: cf.name, industries: cf.industries, leadSource: cf.leadSource, interestedPubs: cf.interestedPubs, contacts: cf.contacts, notes: cf.notes, billingEmail, billingCcEmails: cleanCc, billingAddress, billingAddress2, billingCity, billingState, billingZip });
      } else {
        setClients(cl => cl.map(c => c.id === ec.id ? { ...c, name: cf.name, industries: cf.industries, leadSource: cf.leadSource, interestedPubs: cf.interestedPubs, contacts: cf.contacts, notes: cf.notes, billingEmail, billingCcEmails: cleanCc, billingAddress, billingAddress2, billingCity, billingState, billingZip } : c));
      }
    } else {
      // Create new client — persists to Supabase with real UUID
      if (insertClient) {
        // New client — default ownership to whoever is creating the
        // record (same philosophy as Convert to Lead). Admin can
        // reassign from the client profile later.
        const newClient = await insertClient({ name: cf.name, status: "Lead", totalSpend: 0, industries: cf.industries, leadSource: cf.leadSource, interestedPubs: cf.interestedPubs, contacts: cf.contacts, notes: cf.notes, repId: currentUser?.id || null, billingEmail, billingCcEmails: cleanCc, billingAddress, billingAddress2, billingCity, billingState, billingZip });
        if (newClient?.id) {
          logActivity(`New client: ${cf.name}`, "pipeline", newClient.id, cf.name);
          addNotif(`Client "${cf.name}" created`);
        }
      } else {
        setClients(cl => [...cl, { ...cf, id: "c" + Date.now(), totalSpend: 0, status: "Lead", comms: [] }]);
      }
    }
    setCmo(false);
  };

  // Finalize a Closed transition once we know the sale has an issue. Persists
  // status + issueId to Supabase via updateSale (the only path in SalesCRM
  // that actually writes to the DB right now), then runs the existing local
  // bookkeeping: notifications, comms log, bus event, Lead→Active promotion.
  const finalizeClose = (saleId, issueIdOverride) => {
    const s = sales.find(x => x.id === saleId);
    if (!s) return;
    const autoAct = STAGE_AUTO_ACTIONS["Closed"] || null;
    const nextDue = new Date(today); nextDue.setDate(nextDue.getDate() + 3);
    const nextActDate = autoAct ? nextDue.toISOString().slice(0, 10) : "";
    const finalIssueId = issueIdOverride || s.issueId;
    if (updateSale) {
      updateSale(saleId, {
        status: "Closed",
        issueId: finalIssueId,
        closedAt: new Date().toISOString(),
        nextAction: autoAct,
        nextActionDate: nextActDate,
      });
    } else {
      // Fallback if updateSale isn't wired (offline or older harness)
      setSales(sl => sl.map(x => x.id === saleId ? { ...x, status: "Closed", issueId: finalIssueId, nextAction: autoAct, nextActionDate: nextActDate } : x));
    }
    logActivity(`→ Closed`, "pipeline", s.clientId, cn(s.clientId));
    addNotif(`${cn(s.clientId)} → Closed`);
    setClients(cl => cl.map(c => c.id === s.clientId ? { ...c, comms: [...(c.comms || []), { id: "cm" + Date.now(), type: "Comment", author: "Account Manager", date: today, note: `→ Closed` }] } : c));
    if (bus) bus.emit("sale.closed", { saleId, clientId: s.clientId, clientName: cn(s.clientId), amount: s.amount, publication: pn(s.publication) });
    const client = clients.find(c => c.id === s.clientId);
    if (client) {
      const updates = {};
      if (client.status === "Lead") updates.status = "Active";
      if (!client.repId && currentUser?.id) updates.repId = currentUser.id;
      if (Object.keys(updates).length && updateClient) updateClient(client.id, updates);
    }
  };

  const moveToStage = (saleId, ns) => {
    const s = sales.find(x => x.id === saleId);
    if (["Proposal", "Negotiation", "Closed", "Follow-up"].includes(ns) && !hasProposal(saleId)) {
      setWizardState({
        mode: "new",
        clientId: s?.clientId || clients[0]?.id || "",
        pendingSaleId: saleId,
      });
      setViewPropId(null);
      if (loadDigitalAdProducts) loadDigitalAdProducts();
      return;
    }
    if (ns === "Negotiation") {
      const sentProp = proposals.find(p => p.clientId === s?.clientId && (p.status === "Sent" || p.status === "Signed & Converted"));
      if (!sentProp) {
        const draftProp = proposals.find(p => p.clientId === s?.clientId && p.status === "Draft");
        if (draftProp) { editProposal(draftProp.id); } else { openProposal(s?.clientId); }
        return;
      }
    }
    // Closed transition needs an issue_id (DB CHECK constraint). If the sale
    // doesn't have one yet, open the picker — finalizeClose runs after the
    // user confirms.
    if (ns === "Closed") {
      if (!s) return;
      if (!s.issueId) {
        setCloseIssueChoice("");
        setCloseIssueModal({ saleId, pubId: s.publication });
        return;
      }
      finalizeClose(saleId);
      return;
    }
    const autoAct = STAGE_AUTO_ACTIONS[ns] || null;
    const nextDue = new Date(today); nextDue.setDate(nextDue.getDate() + 3);
    setSales(sl => sl.map(x => x.id === saleId ? { ...x, status: ns, nextAction: autoAct, nextActionDate: autoAct ? nextDue.toISOString().slice(0, 10) : "" } : x));
    if (s) { logActivity(`→ ${ns}`, "pipeline", s.clientId, cn(s.clientId)); addNotif(`${cn(s.clientId)} → ${ns}`); setClients(cl => cl.map(c => c.id === s.clientId ? { ...c, comms: [...(c.comms || []), { id: "cm" + Date.now(), type: "Comment", author: "Account Manager", date: today, note: `→ ${ns}` }] } : c)); }
  };

  const handleAct = (saleId) => {
    const s = sales.find(x => x.id === saleId);
    if (!s?.nextAction) return;
    const aType = typeof s.nextAction === "string" ? "task" : s.nextAction.type;
    const client = clients.find(c => c.id === s.clientId);
    switch (aType) {
      case "call":
      case "meeting":
        setCalMo(true); setSchEvent({ title: `${aType === "meeting" ? "Meeting" : "Call"}: ${client?.name || ""}`, date: s.nextActionDate || tomorrow, time: "10:00", duration: 30, clientId: s.clientId, type: aType, notes: actLabel(s.nextAction) }); setCalSaleId(saleId);
        break;
      case "email":
      case "follow_up":
        setEmailSaleId(saleId); setEmailTo(client?.contacts?.[0]?.email || ""); setEmailSubj(`Following up — ${client?.name || ""}`); setEmailBody(`Hi ${client?.contacts?.[0]?.name || ""},\n\nI wanted to follow up on our conversation about advertising with 13 Stars Media.\n\nBest,\n${COMPANY.sales.name}\n${COMPANY.sales.phone}`); setEmailMo(true);
        break;
      case "send_kit":
        setEditOppId(saleId); setOpp({ company: client?.name || "", contact: client?.contacts?.[0]?.name || "", email: client?.contacts?.[0]?.email || "", phone: client?.contacts?.[0]?.phone || "", source: "Existing Client", notes: "", nextAction: s.nextAction?.label || "", nextActionDate: s.nextActionDate || "" });
        setOppSendKit(true); setOppKitPubs([]); setOppKitMsg(`Hi ${client?.contacts?.[0]?.name || ""},\n\nAttached are rate cards.\n\nBest,\n${COMPANY.sales.name}`); setOppKitSent(false); setOppMo(true);
        break;
      case "send_proposal": openProposal(s.clientId); break;
      case "review_proposal":
        const ep = getClientProposal(s.clientId);
        if (ep) { setViewPropId(ep.id); navTo("Proposals"); } else openProposal(s.clientId);
        break;
      default:
        completeAction(saleId, actLabel(s));
    }
  };

  const completeAction = (saleId, note) => {
    const s = sales.find(x => x.id === saleId);
    setSales(sl => sl.map(x => x.id === saleId ? { ...x, nextAction: null, nextActionDate: "" } : x));
    if (s) { setClients(cl => cl.map(c => c.id === s.clientId ? { ...c, comms: [...(c.comms || []), { id: "cm" + Date.now(), type: "Comment", author: "Account Manager", date: today, note: `Done: ${note}` }] } : c)); logActivity(`Done: ${note}`, "comm", s.clientId, cn(s.clientId)); }
    if (s) { setEditOppId(saleId); const cl = clients.find(c => c.id === s.clientId); setOpp({ company: cl?.name || "", contact: cl?.contacts?.[0]?.name || "", email: cl?.contacts?.[0]?.email || "", phone: cl?.contacts?.[0]?.phone || "", source: "Existing Client", notes: "", nextAction: "", nextActionDate: "" }); setOppSendKit(false); setOppKitSent(false); setOppMo(true); }
  };
  const saveNextStep = () => {
    if (nextStepSaleId && nextStepAction) {
      const nd = new Date(today); nd.setDate(nd.getDate() + 3);
      setSales(sl => sl.map(s => s.id === nextStepSaleId ? { ...s, nextAction: nextStepAction, nextActionDate: nd.toISOString().slice(0, 10) } : s));
    }
    setNextStepMo(false); setNextStepSaleId(null);
  };
  const clearAction = () => {
    if (nextStepSaleId) setSales(sl => sl.map(s => s.id === nextStepSaleId ? { ...s, nextAction: null, nextActionDate: "" } : s));
    setNextStepMo(false); setNextStepSaleId(null);
  };
  const sendEmail = () => {
    if (!emailSaleId) return;
    const s = sales.find(x => x.id === emailSaleId);
    if (s) { setClients(cl => cl.map(c => c.id === s.clientId ? { ...c, comms: [...(c.comms || []), { id: "cm" + Date.now(), type: "Email", author: "Account Manager", date: today, note: `To: ${emailTo}\nSubject: ${emailSubj}\n${emailBody.slice(0, 100)}...` }] } : c)); logActivity(`Email sent: ${emailSubj}`, "comm", s.clientId, cn(s.clientId)); }
    setEmailMo(false);
    completeAction(emailSaleId, `Sent: ${emailSubj}`);
  };

  const cloneSale = (s) => { const ni = issues.find(i => i.pubId === s.publication && i.date > s.date); if (!ni) return; setSales(sl => [...sl, { ...s, id: "sl" + Date.now(), issueId: ni.id, date: ni.date, status: "Discovery", page: null, pagePos: null, proposalId: null, nextAction: STAGE_AUTO_ACTIONS.Discovery, nextActionDate: today, oppNotes: [] }]); logActivity(`Repeat → ${pn(s.publication)}`, "opp", s.clientId, cn(s.clientId)); };

  const handleCardClick = (s) => {
    if (s.status === "Discovery" || s.status === "Presentation") { setEditOppId(s.id); const cl = clients.find(c => c.id === s.clientId); setOpp({ company: cl?.name || "", contact: cl?.contacts?.[0]?.name || "", email: cl?.contacts?.[0]?.email || "", phone: cl?.contacts?.[0]?.phone || "", source: "Existing Client", notes: "", nextAction: actLabel(s), nextActionDate: s.nextActionDate || "" }); setOppSendKit(false); setOppKitSent(false); setOppMo(true); }
    else if (s.status === "Proposal" || s.status === "Negotiation") {
      const draft = proposals.find(p => p.clientId === s.clientId && p.status === "Draft");
      const sent = proposals.find(p => p.clientId === s.clientId && (p.status === "Sent" || p.status === "Signed & Converted"));
      if (sent) { setViewPropId(sent.id); navTo("Proposals"); }
      else if (draft) { editProposal(draft.id); }
      else openProposal(s.clientId);
    }
    else { navTo("Clients", s.clientId); }
  };

  const openOpp = () => { setEditOppId(null); setOpp({ company: "", contact: "", email: "", phone: "", source: "Referral", notes: "", nextAction: "Send media kit", nextActionDate: tomorrow }); setOppSendKit(false); setOppKitPubs([]); setOppKitMsg(""); setOppKitSent(false); setOppMo(true); setTimeout(() => { const el = document.querySelector("[data-opp-company]"); if (el) el.focus(); }, 100); };
  const saveOpp = (close = true) => {
    if (!opp.company.trim()) return; let cid = clients.find(c => (c.name || "").toLowerCase() === opp.company.toLowerCase())?.id; if (!cid) { cid = "c" + Date.now(); setClients(cl => [...cl, { id: cid, name: opp.company, status: "Lead", totalSpend: 0, contacts: [{ name: opp.contact, email: opp.email, phone: opp.phone, role: "Business Owner" }], comms: [] }]); } if (opp.notes.trim()) setClients(cl => cl.map(c => c.id === cid ? { ...c, comms: [...(c.comms || []), { id: "cm" + Date.now(), type: "Comment", author: "Account Manager", date: today, note: opp.notes }] } : c)); if (editOppId) { setSales(sl => sl.map(s => s.id === editOppId ? { ...s, nextAction: typeof s.nextAction === "object" ? s.nextAction : { type: "task", label: opp.nextAction }, nextActionDate: opp.nextActionDate, oppNotes: [...(s.oppNotes || []), ...(opp.notes.trim() ? [{ id: "on" + Date.now(), text: opp.notes, time: new Date().toLocaleTimeString(), date: today }] : [])] } : s)); } else { setSales(sl => [...sl, { id: "sl" + Date.now(), clientId: cid, publication: pubs[0]?.id || "", issueId: "", type: "TBD", size: "", adW: 0, adH: 0, amount: 0, status: "Discovery", date: today, page: null, pagePos: null, nextAction: STAGE_AUTO_ACTIONS.Discovery, nextActionDate: opp.nextActionDate || tomorrow, proposalId: null, oppNotes: opp.notes.trim() ? [{ id: "on" + Date.now(), text: opp.notes, time: new Date().toLocaleTimeString(), date: today }] : [] }]); logActivity(`New opportunity via ${opp.source}`, "opp", cid, opp.company); } if (close && !oppSendKit) { setOppMo(false); setOpp(x => ({ ...x, notes: "" })); } };
  const sendKit = () => { saveOpp(false); setOppKitSent(true); const cid = clients.find(c => (c.name || "").toLowerCase() === opp.company.toLowerCase())?.id; logActivity(`Rate cards sent`, "comm", cid, opp.company); if (cid) { setClients(cl => cl.map(c => c.id === cid ? { ...c, comms: [...(c.comms || []), { id: "cm" + Date.now(), type: "Email", author: "Account Manager", date: today, note: `Sent rate cards: ${oppKitPubs.map(pid => pn(pid)).join(", ")}` }] } : c)); setSales(sl => sl.map(s => s.clientId === cid && s.status === "Discovery" ? { ...s, status: "Presentation", nextAction: STAGE_AUTO_ACTIONS.Presentation, nextActionDate: opp.nextActionDate } : s)); } };
  const oppToProposal = () => { saveOpp(false); const cid = clients.find(c => (c.name || "").toLowerCase() === opp.company.toLowerCase())?.id || (editOppId && sales.find(s => s.id === editOppId)?.clientId); if (cid) setSales(sl => sl.map(s => s.clientId === cid && (s.status === "Discovery" || s.status === "Presentation") ? { ...s, status: "Proposal" } : s)); setOppMo(false); openProposal(cid); };

  // ─── Proposal wizard entry points ────────────────────────
  // proposal-wizard-spec.md §4 — wizardState replaces ~20 prop* useState
  // calls. The wizard owns its own state via useProposalWizard; SalesCRM
  // only owns these three setter wrappers + the closeWizard handler.
  const openProposal = (clientId) => {
    setWizardState({
      mode: "new",
      clientId: clientId || clients[0]?.id || "",
    });
    setViewPropId(null);
    if (loadDigitalAdProducts) loadDigitalAdProducts();
  };

  const editProposal = (propId) => {
    const p = proposals.find(x => x.id === propId);
    if (!p) return;
    setWizardState({
      mode: "edit",
      clientId: p.clientId,
      proposalId: propId,
    });
    setViewPropId(null);
    if (loadDigitalAdProducts) loadDigitalAdProducts();
  };

  // Renewal: pre-fill wizard state from prior closed sales for this client.
  // Picks the most-frequent ad size per pub and selects the next 12 issues.
  const openRenewalProposal = (clientId) => {
    const cid = clientId || clients[0]?.id || "";
    const clientName = cn(cid);
    const clientSales = sales.filter(s => s.clientId === cid && s.status === "Closed");
    const pubGroups = {};
    clientSales.forEach(s => {
      if (!pubGroups[s.publication]) pubGroups[s.publication] = { pubId: s.publication, sizes: {} };
      const sizeKey = s.size || s.type || "Ad";
      pubGroups[s.publication].sizes[sizeKey] = (pubGroups[s.publication].sizes[sizeKey] || 0) + 1;
    });
    const pubsArr = [];
    const issuesByPub = {};
    const defaultSizeByPub = {};
    Object.values(pubGroups).forEach(pg => {
      const pub = pubs.find(p => p.id === pg.pubId);
      if (!pub) return;
      const topSize = Object.entries(pg.sizes).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
      const idx = (pub.adSizes || []).findIndex(a => a.name === topSize);
      const defaultIdx = idx >= 0 ? idx : 0;
      defaultSizeByPub[pg.pubId] = defaultIdx;
      const futureIssues = issues.filter(i => i.pubId === pg.pubId && i.date >= today).slice(0, 12);
      pubsArr.push({ pubId: pg.pubId, formats: { print: true, digital: false } });
      issuesByPub[pg.pubId] = futureIssues.map(iss => ({ issueId: iss.id, adSizeIdx: defaultIdx }));
    });

    setWizardState({
      mode: "renewal",
      clientId: cid,
      initialPrefill: {
        clientId: cid,
        proposalName: `${clientName} — Renewal ${new Date().toLocaleDateString()}`,
        pubs: pubsArr,
        issuesByPub,
        defaultSizeByPub,
      },
    });
    setViewPropId(null);
    if (loadDigitalAdProducts) loadDigitalAdProducts();
  };

  const closeWizard = () => {
    // Mirror the legacy closePropMo pipeline-revert: when openProposal was
    // launched mid-pipeline (via setPropPending), Cancel reverts to the
    // prior stage. wizardState.pendingSaleId carries that sale id.
    if (wizardState?.pendingSaleId) {
      setSales(sl => sl.map(s => s.id === wizardState.pendingSaleId ? { ...s, status: "Presentation" } : s));
      const s = sales.find(s2 => s2.id === wizardState.pendingSaleId);
      logActivity("Proposal cancelled — back to Presentation", "pipeline", s?.clientId, cn(s?.clientId));
    }
    setWizardState(null);
  };

  const signProposal = async (propId) => {
    const p = proposals.find(x => x.id === propId);
    if (!p) return;
    // Convert to contract + sales orders via database function
    if (!convertProposal) return;
    const result = await convertProposal(propId);
    if (!result?.success) {
      logActivity(`"${p.name}" signed but conversion failed: ${result?.error || 'unknown'}`, "pipeline", p.clientId, cn(p.clientId));
      return;
    }
    logActivity(`"${p.name}" signed! ${result.sales_created} sales created`, "pipeline", p.clientId, cn(p.clientId));
    addNotif(`Contract created from "${p.name}" — ${result.sales_created} orders`);
    if (bus) bus.emit("proposal.signed", { proposalId: propId, clientId: p.clientId, clientName: cn(p.clientId), totalAmount: p.total, lineCount: result.sales_created });

    // ── Auto-sequence: send signed contract → send first invoice ──
    // Contract goes to the primary contact. Invoice prefers client.billingEmail
    // if set, otherwise falls back to the primary contact. CCs come from
    // client.billingCcEmails.
    const client = clients.find(c => c.id === p.clientId);
    const { data: contactRows } = await supabase.from("client_contacts").select("email").eq("client_id", p.clientId).limit(1);
    const primaryEmail = contactRows?.[0]?.email || client?.contacts?.[0]?.email;
    const clientEmail = primaryEmail;
    const billingEmail = (client?.billingEmail || "").trim() || primaryEmail;
    const billingCc = (client?.billingCcEmails || []).filter(Boolean).slice(0, 2);
    if (!clientEmail && !billingEmail) {
      addNotif(`${cn(p.clientId)} — no contact email on file, contract + invoice not sent`);
      return;
    }

    // 1) Signed contract email
    try {
      const salesperson = (props.team || []).find(t => t.id === p.assignedTo) || currentUser;
      const contractHtml = generateContractHtml({
        proposal: p,
        signature: { signatureUrl: p.signatureUrl, signedAt: p.signedAt || new Date().toISOString() },
        salesperson,
        pubs,
      });
      await sendGmailEmail({
        teamMemberId: currentUser?.id || null,
        to: [clientEmail],
        subject: `Signed Contract — ${p.name || "Advertising Agreement"}`,
        htmlBody: contractHtml,
        mode: "send",
        emailType: "contract", clientId: p.clientId, refId: result.contract_id, refType: "contract",
      });
      addNotif(`Signed contract sent to ${cn(p.clientId)}`);
    } catch (err) { console.error("Signed contract email error:", err); addNotif(`Contract email failed: ${err.message}`); }

    // 2) First invoice email. Find the earliest invoice created for this
    // client after the proposal signed timestamp (the RPC already created it
    // and convertProposal pulled it into local state).
    try {
      const { data: firstInvRow } = await supabase.from("invoices")
        .select("*")
        .eq("client_id", p.clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (firstInvRow) {
        const { data: lineRows } = await supabase.from("invoice_lines").select("*").eq("invoice_id", firstInvRow.id);
        const mapped = {
          id: firstInvRow.id, invoiceNumber: firstInvRow.invoice_number, clientId: firstInvRow.client_id,
          status: firstInvRow.status, subtotal: Number(firstInvRow.subtotal), total: Number(firstInvRow.total),
          amountPaid: Number(firstInvRow.total) - Number(firstInvRow.balance_due), balanceDue: Number(firstInvRow.balance_due),
          issueDate: firstInvRow.issue_date, dueDate: firstInvRow.due_date, notes: firstInvRow.notes || "",
          lines: (lineRows || []).map(l => ({ id: l.id, description: l.description, quantity: l.quantity, unitPrice: Number(l.unit_price), total: Number(l.total) })),
        };
        const invoiceHtml = generateInvoiceHtml({
          invoice: mapped,
          clientName: client?.name || "",
          clientCode: client?.clientCode || "",
          billingAddress: {
            line1: client?.billingAddress || client?.address || "",
            line2: client?.billingAddress2 || "",
            city: client?.billingCity || client?.city || "",
            state: client?.billingState || client?.state || "",
            zip: client?.billingZip || client?.zip || "",
          },
        });
        await sendGmailEmail({
          teamMemberId: currentUser?.id || null,
          to: [billingEmail],
          cc: billingCc,
          subject: `Invoice ${mapped.invoiceNumber} — ${COMPANY.name || "13 Stars Media Group"}`,
          htmlBody: invoiceHtml,
          mode: "send",
          emailType: "invoice", clientId: p.clientId, refId: mapped.id, refType: "invoice",
        });
        // Mark the invoice as sent in supabase; local state catches up on next
        // Billing navigation via the lazy load hydration.
        await supabase.from("invoices").update({ status: "sent" }).eq("id", mapped.id);
        addNotif(`First invoice sent to ${cn(p.clientId)}`);
      }
    } catch (err) { console.error("First invoice email error:", err); addNotif(`Invoice email failed: ${err.message}`); }
  };

  const actColors = { pipeline: Z.ac, proposal: Z.pu, opp: Z.su, comm: Z.wa };

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {/* Action row — title moved to TopBar via usePageHeader above. Keep
        only the tab-aware controls (search, filters, + buttons) here. */}
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      {(tab === "Pipeline" || (tab === "Clients" && !viewClientId && clientView === "list")) && <><SB value={sr} onChange={setSr} placeholder="Search..." /><Sel value={fPub} onChange={e => setFPub(e.target.value)} options={[{ value: "all", label: "All Pubs" }, ...pubs.map(p => ({ value: p.id, label: p.name }))]} /></>}
      {tab === "Clients" && !viewClientId && <Btn sm onClick={() => { setEc(null); setCf({ name: "", industries: [], leadSource: "", interestedPubs: [], contacts: [{ name: "", email: "", phone: "", role: "Business Owner" }], notes: "", billingEmail: "", billingCcEmails: ["", ""], billingAddress: "", billingAddress2: "", billingCity: "", billingState: "", billingZip: "" }); setCmo(true); }}><Ic.plus size={13} /> Client</Btn>}
      {tab === "Pipeline" && <Btn sm onClick={openOpp}><Ic.plus size={13} /> New Opportunity</Btn>}
      {tab === "Proposals" && <><SB value={propSearch} onChange={setPropSearch} placeholder="Search..." /><Sel value={propStatus} onChange={e => setPropStatus(e.target.value)} options={[{ value: "all", label: "All Statuses" }, { value: "Draft", label: "Draft" }, { value: "Sent", label: "Sent" }, { value: "Signed & Converted", label: "Signed & Converted" }, { value: "Cancelled", label: "Cancelled" }]} /><Btn sm onClick={() => openProposal()}><Ic.plus size={13} /> Proposal</Btn></>}
      {tab === "Closed" && <><SB value={closedSearch} onChange={setClosedSearch} placeholder="Search..." /><Sel value={fPub} onChange={e => setFPub(e.target.value)} options={[{ value: "all", label: "All Publications" }, ...pubs.map(p => ({ value: p.id, label: p.name }))]} /><Sel value={closedRep} onChange={e => setClosedRep(e.target.value)} options={[{ value: "all", label: "All Salespeople" }, ...(props.team || []).filter(t => t.permissions?.includes("sales") || t.permissions?.includes("admin")).map(t => ({ value: t.id, label: t.name }))]} /><Btn sm v={showCancelled ? "primary" : "ghost"} onClick={() => setShowCancelled(s => !s)}>{showCancelled ? "Showing Cancelled" : "Show Cancelled"}</Btn></>}
    </div>

    <TabRow><TB tabs={["Pipeline", "Inquiries", "Clients", "Proposals", "Closed", "Renewals", "Outreach", "Commissions"]} active={tab} onChange={t => { if (t === "Inquiries" && loadInquiries && !inquiriesLoaded) loadInquiries(); navTo(t); }} />{tab === "Pipeline" && !jurisdiction?.isSalesperson && <><TabPipe /><TB tabs={["All", "By Rep"]} active={myPipeline ? "By Rep" : "All"} onChange={v => setMyPipeline(v === "By Rep")} /></>}{tab === "Clients" && !viewClientId && <><TabPipe /><TB tabs={["Signals", "All Clients"]} active={clientView === "signals" ? "Signals" : "All Clients"} onChange={v => setClientView(v === "Signals" ? "signals" : "list")} /></>}</TabRow>

    {/* PIPELINE */}
    {tab === "Pipeline" && <>
      {/* Salesperson Goal Progress */}
      {(() => {
        const myAssignments = (salespersonPubAssignments || []).filter(a => a.isActive);
        if (!myAssignments.length) return null;
        // Calculate goals from upcoming issues
        const goalRows = dropdownPubs.map(pub => {
          const assignment = myAssignments.find(a => a.publicationId === pub.id);
          if (!assignment) return null;
          const ni = issues.find(i => i.pubId === pub.id && i.date >= today);
          if (!ni) return null;
          const pubGoal = ni.revenueGoal != null ? ni.revenueGoal : (pub.defaultRevenueGoal || 0);
          if (!pubGoal) return null;
          const myPct = Number(assignment.percentage || 0) / 100;
          const myGoal = Math.round(pubGoal * myPct);
          const myRev = sales.filter(s => s.issueId === ni.id && s.status === "Closed").reduce((sum, s) => sum + (s.amount || 0), 0);
          const pct = myGoal > 0 ? Math.min(100, Math.round((myRev / myGoal) * 100)) : 0;
          return { pub, issue: ni, myGoal, myRev, pct, myPct };
        }).filter(Boolean);
        if (!goalRows.length) return null;
        return <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          {goalRows.map(g => <div key={g.pub.id} style={{ flex: "1 1 120px", padding: "8px 12px", background: Z.bg === "#08090D" ? "rgba(140,150,165,0.06)" : "rgba(255,255,255,0.25)", backdropFilter: "blur(16px)", borderRadius: R, border: `1px solid ${Z.bd}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tx, fontFamily: COND, marginBottom: 4 }}><span>{g.pub.name.replace(/^The /, "").split(" ").slice(0, 2).join(" ")}</span><span style={{ color: g.pct > 100 ? ACCENT.blue : g.pct >= 80 ? Z.go : g.pct >= 50 ? Z.wa : Z.da }}>{g.pct}%</span></div>
            <div style={{ height: 4, background: Z.sa, borderRadius: Ri, marginBottom: 3 }}><div style={{ height: "100%", borderRadius: Ri, width: `${Math.min(g.pct, 100)}%`, background: g.pct > 100 ? ACCENT.blue : g.pct >= 80 ? Z.go : g.pct >= 50 ? Z.wa : Z.da, transition: "width 0.3s" }} /></div>
            <div style={{ fontSize: FS.micro, color: Z.td }}>${Math.round(g.myRev / 1000)}K / ${Math.round(g.myGoal / 1000)}K goal</div>
          </div>)}
        </div>;
      })()}
      {/* Inquiries + Renewals inline alerts */}
      {(() => {
        const newInqs = (adInquiries || []).filter(i => i.status === "new");
        const urgentRens = (clients || []).filter(c => (c.status === "Renewal" || c.status === "Lapsed") && c.contractEndDate && c.contractEndDate <= new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
        if (newInqs.length === 0 && urgentRens.length === 0) return null;
        return <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {newInqs.length > 0 && <div onClick={() => { if (loadInquiries && !inquiriesLoaded) loadInquiries(); setTab("Inquiries"); }} style={{ flex: 1, padding: "8px 14px", background: Z.da + "10", borderRadius: Ri, cursor: "pointer" }}>
            <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.da }}>{newInqs.length} new inquir{newInqs.length > 1 ? "ies" : "y"}</span>
            <span style={{ fontSize: FS.xs, color: Z.tm, marginLeft: 8 }}>Hot leads — respond now</span>
          </div>}
          {urgentRens.length > 0 && <div onClick={() => navTo("Renewals")} style={{ flex: 1, padding: "8px 14px", background: Z.wa + "10", borderLeft: `3px solid ${Z.wa}`, borderRadius: Ri, cursor: "pointer" }} title="Open Renewals tab">
            <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.wa }}>{urgentRens.length} renewal{urgentRens.length > 1 ? "s" : ""} expiring soon</span>
            <span style={{ fontSize: FS.xs, color: Z.tm, marginLeft: 8 }}>{urgentRens.slice(0, 3).map(c => c.name).join(", ")} · click to open Renewals →</span>
          </div>}
        </div>;
      })()}

      {activeSales.length === 0 ? <div style={{ padding: "40px 20px", textAlign: "center", background: Z.sf, borderRadius: R, border: `1px solid ${Z.bd}` }}>
        <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx, marginBottom: 8 }}>Pipeline is clear</div>
        <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 16 }}>Time to prospect — find your next deal.</div>
        <Btn onClick={openOpp}><Ic.plus size={13} /> New Opportunity</Btn>
      </div> :
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
        {PIPELINE.map(stage => {
          // Closed column renders one card per contract, not per sale. Group
          // active sales by contractId, join with the contracts array, and show
          // one card per contract. Click → Contracts page.
          if (stage === "Closed") {
            const contractSaleMap = {};
            activeSales.forEach(s => {
              if (s.contractId) {
                if (!contractSaleMap[s.contractId]) contractSaleMap[s.contractId] = [];
                contractSaleMap[s.contractId].push(s);
              }
            });
            const closedContracts = (contracts || [])
              .filter(c => contractSaleMap[c.id])
              .map(c => ({
                contract: c,
                sales: contractSaleMap[c.id],
                orderCount: contractSaleMap[c.id].length,
                totalValue: c.totalValue || contractSaleMap[c.id].reduce((s, x) => s + (x.amount || 0), 0),
              }))
              .sort((a, b) => (b.contract.startDate || "").localeCompare(a.contract.startDate || ""));
            const stRev = closedContracts.reduce((sm, x) => sm + (x.totalValue || 0), 0);
            return <div key={stage} style={{ background: Z.bg === "#08090D" ? "rgba(140,150,165,0.06)" : "rgba(255,255,255,0.25)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRadius: R, padding: CARD.pad, border: `1px solid ${Z.bd}`, display: "flex", flexDirection: "column", minHeight: 100 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 4px 6px", borderBottom: `2px solid ${PIPELINE_COLORS[stage]}` }}>
                <span style={{ fontSize: FS.sm, fontWeight: FW.black, color: PIPELINE_COLORS[stage] }}>{stage}</span>
                <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td }}>{closedContracts.length}{stRev > 0 ? ` · $${(stRev / 1000).toFixed(0)}K` : ""}</span>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, marginTop: 8, overflowY: "auto", maxHeight: 420 }}>
                {closedContracts.slice(0, 8).map(({ contract: c, orderCount, totalValue }) => (
                  <div key={c.id} onClick={() => onNavigate?.("contracts")} style={{ ...cardSurface(), borderRadius: R, padding: CARD.pad, cursor: "pointer" }} title="Open Contracts page">
                    <div style={{ fontWeight: FW.semi, color: Z.ac, fontSize: FS.md, marginBottom: 2, fontFamily: COND }}>{cn(c.clientId)}</div>
                    <div style={{ color: Z.tm, fontSize: FS.sm, marginBottom: 2 }}>{c.name || "Contract"}</div>
                    <div style={{ fontWeight: FW.black, color: Z.su, fontSize: FS.base }}>${Number(totalValue || 0).toLocaleString()}</div>
                    <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 2 }}>{orderCount} order{orderCount > 1 ? "s" : ""}{c.startDate ? ` · ${c.startDate}` : ""}</div>
                  </div>
                ))}
                {closedContracts.length > 8 && <div style={{ fontSize: FS.xs, color: Z.td, textAlign: "center", padding: 4 }}>+ {closedContracts.length - 8} more</div>}
              </div>
            </div>;
          }
          const ss = activeSales.filter(s => {
            if (stage === "Follow-up") return s.status === "Closed" && s.issueId && recentPublishedIssueIds.has(s.issueId);
            return s.status === stage;
          });
          const stRev = ss.reduce((s, x) => s + (x.amount || 0), 0);
          return <div key={stage} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragSaleId) { moveToStage(dragSaleId, stage); setDragSaleId(null); } }} style={{ background: Z.bg === "#08090D" ? "rgba(140,150,165,0.06)" : "rgba(255,255,255,0.25)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRadius: R, padding: CARD.pad, border: `1px solid ${Z.bd}`, display: "flex", flexDirection: "column", minHeight: 100 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 4px 6px", borderBottom: `2px solid ${PIPELINE_COLORS[stage]}` }}><span style={{ fontSize: FS.sm, fontWeight: FW.black, color: PIPELINE_COLORS[stage] }}>{stage}</span><span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td }}>{ss.length}{stRev > 0 ? ` · $${(stRev / 1000).toFixed(0)}K` : ""}</span></div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, marginTop: 8, overflowY: "auto", maxHeight: 420 }}>
              {ss.slice(0, 8).map(s => <div key={s.id} draggable onDragStart={() => setDragSaleId(s.id)} onClick={() => handleCardClick(s)} style={{ ...cardSurface(), borderRadius: R, padding: CARD.pad, cursor: "grab" }}>
                <div onClick={e => { e.stopPropagation(); navTo("Clients", s.clientId); }} style={{ fontWeight: FW.semi, color: Z.ac, fontSize: FS.md, cursor: "pointer", marginBottom: 2, fontFamily: COND }} title="Go to profile">{cn(s.clientId)}</div>
                {s.type !== "TBD" && <div style={{ color: Z.tm, fontSize: FS.sm, marginBottom: 2 }}>{pn(s.publication)} · {s.type}</div>}
                {s.amount > 0 && <div style={{ fontWeight: FW.black, color: Z.su, fontSize: FS.base }}>${s.amount.toLocaleString()}</div>}
                {s.contractId && proofReadyMap[s.contractId] && <div onClick={e => { e.stopPropagation(); onNavigate?.("adprojects"); }} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, padding: "3px 8px", background: Z.wa + "12", border: `1px solid ${Z.wa}30`, borderRadius: Ri, cursor: "pointer" }}><span style={{ fontSize: 10, fontWeight: FW.bold, color: Z.wa }}>Proof Ready — Sign Off</span></div>}
                {s.nextAction && <div onClick={e => { e.stopPropagation(); handleAct(s.id); }} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, padding: "4px 6px", background: `${actInfo(s.nextAction)?.color || Z.ac}10`, border: `1px solid ${actInfo(s.nextAction)?.color || Z.ac}25`, borderRadius: Ri, cursor: "pointer" }}>
                  <span style={{ fontSize: FS.sm }}>{actIcon(s)}</span>
                  <span style={{ fontSize: FS.sm, color: actInfo(s.nextAction)?.color || Z.ac, fontWeight: FW.bold, flex: 1 }}>{actLabel(s)}</span>
                  {s.nextActionDate && <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: dateColor(s.nextActionDate) }}>{s.nextActionDate.slice(5)}</span>}
                </div>}
                <div style={{ display: "flex", gap: 3, marginTop: 3 }}>
                  {stage !== "Closed" && stage !== "Follow-up" && <>
                    <button onClick={async e => { e.stopPropagation(); const note = await dialog.prompt(`Log call — ${cn(s.clientId)}`, "Connected"); if (note === null) return; const txt = note.trim() || "Connected"; logActivity(`Called ${cn(s.clientId)}: ${txt}`, "comm", s.clientId, cn(s.clientId)); const nd = new Date(); nd.setDate(nd.getDate() + 3); setSales(sl => sl.map(x => x.id === s.id ? { ...x, nextAction: { type: "call", label: "Follow up call" }, nextActionDate: nd.toISOString().slice(0, 10), oppNotes: [...(x.oppNotes || []), { id: "n" + Date.now(), text: `Call: ${txt}`, date: today }] } : x)); setClients(cl => cl.map(c => c.id === s.clientId ? { ...c, comms: [...(c.comms || []), { id: "cm" + Date.now(), type: "Call", author: "Account Manager", date: today, note: txt }] } : c)); addNotif(`Call logged — ${cn(s.clientId)}`); }} style={{ padding: "3px 5px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sa, cursor: "pointer", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.tm }} title="Log call (writes to client comms)">📞</button>
                    <button onClick={async e => { e.stopPropagation(); const note = await dialog.prompt(`Log email — ${cn(s.clientId)}`, "Sent follow-up"); if (note === null) return; const txt = note.trim() || "Sent email"; logActivity(`Emailed ${cn(s.clientId)}: ${txt}`, "comm", s.clientId, cn(s.clientId)); const nd = new Date(); nd.setDate(nd.getDate() + 5); setSales(sl => sl.map(x => x.id === s.id ? { ...x, nextAction: { type: "email", label: "Follow up email" }, nextActionDate: nd.toISOString().slice(0, 10), oppNotes: [...(x.oppNotes || []), { id: "n" + Date.now(), text: `Email: ${txt}`, date: today }] } : x)); setClients(cl => cl.map(c => c.id === s.clientId ? { ...c, comms: [...(c.comms || []), { id: "cm" + Date.now(), type: "Email", author: "Account Manager", date: today, note: txt }] } : c)); addNotif(`Email logged — ${cn(s.clientId)}`); }} style={{ padding: "3px 5px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sa, cursor: "pointer", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.tm }} title="Log email (writes to client comms)">✉️</button>
                    <button onClick={e => { e.stopPropagation(); const nd = new Date(); nd.setDate(nd.getDate() + 7); setSales(sl => sl.map(x => x.id === s.id ? { ...x, nextActionDate: nd.toISOString().slice(0, 10) } : x)); addNotif(`Snoozed 7d — ${cn(s.clientId)}`); }} style={{ padding: "3px 5px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sa, cursor: "pointer", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.tm }} title="Snooze 7 days">💤</button>
                  </>}
                  {stage !== "Follow-up" && <button onClick={e => { e.stopPropagation(); moveToStage(s.id, PIPELINE[Math.min(PIPELINE.indexOf(stage) + 1, 5)]); }} style={{ flex: 1, padding: "3px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sa, cursor: "pointer", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.tm }}>→ {PIPELINE[Math.min(PIPELINE.indexOf(stage) + 1, 5)]}</button>}
                  {stage !== "Closed" && stage !== "Follow-up" && <button onClick={async e => { e.stopPropagation(); const REASONS = ["Budget cut", "Chose competitor", "Timing not right", "No response", "Bad fit", "Price too high", "Other"]; const reason = await dialog.prompt("Why was this deal lost?", { options: REASONS }); if (!reason) return; await updateSale(s.id, { status: "Lost", lost_reason: reason, nextAction: null, nextActionDate: null }); logActivity(`Lost: ${reason}`, "pipeline", s.clientId, cn(s.clientId)); addNotif(`Deal lost — ${cn(s.clientId)}: ${reason}`); }} style={{ padding: "3px 5px", borderRadius: Ri, border: `1px solid ${Z.da}40`, background: Z.da + "08", cursor: "pointer", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.da }} title="Mark deal as lost">✕</button>}
                  {(stage === "Closed" || stage === "Follow-up") && <button onClick={e => { e.stopPropagation(); cloneSale(s); }} style={{ padding: "3px 5px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sa, cursor: "pointer", fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tm }}>⟳</button>}
                  {stage === "Closed" && onNavigate && <button onClick={e => { e.stopPropagation(); onNavigate("adprojects"); }} style={{ padding: "3px 5px", borderRadius: Ri, border: `1px solid ${Z.pu}40`, background: Z.pu + "10", cursor: "pointer", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.pu }} title="Start ad design project">🎨</button>}
                </div>
              </div>)}
            </div>
          </div>; })}
      </div>}
      {/* TODAY'S ACTIONS + ACTIVITY */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <GlassCard><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><h4 style={{ margin: 0, fontSize: FS.md, fontWeight: FW.black, color: Z.tx }}>My Actions</h4><span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: todaysActions.length > 0 ? Z.da : Z.su }}>{todaysActions.length}</span></div>{todaysActions.length === 0 ? <div style={{ padding: 16, textAlign: "center", color: Z.su, fontSize: FS.base }}>All caught up!</div> : <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 240, overflowY: "auto" }}>{todaysActions.slice(0, 10).map(s => <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: Z.bg, borderRadius: Ri }}><div style={{ flex: 1 }}><div style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{cn(s.clientId)}</div><div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: FS.sm, color: Z.tx }}><span>{actIcon(s)}</span><span style={{ fontWeight: FW.semi }}>{actLabel(s)}</span>{s.nextActionDate < today && <span style={{ color: Z.da, fontWeight: FW.heavy }}>ACTION NEEDED</span>}</div></div><button onClick={() => handleAct(s.id)} style={{ padding: "6px 12px", borderRadius: Ri, border: `1px solid ${(actInfo(s.nextAction)?.color || Z.ac)}40`, background: `${actInfo(s.nextAction)?.color || Z.ac}10`, cursor: "pointer", fontSize: FS.sm, fontWeight: FW.heavy, color: actInfo(s.nextAction)?.color || Z.ac }}>{actVerb(s)}</button></div>)}</div>}</GlassCard>
        <GlassCard>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND, marginBottom: 6 }}>Recent Activity</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {activityLog.slice(0, 4).map(a => (
              <div key={a.id} onClick={() => { if (a.clientId) navTo("Clients", a.clientId); }} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${Z.bd}15`, cursor: a.clientId ? "pointer" : "default" }}>
                <div><div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{a.clientName}</div><div style={{ fontSize: FS.xs, color: Z.tm }}>{a.text}</div></div>
                <span style={{ fontSize: FS.xs, color: Z.td, flexShrink: 0 }}>{a.time}</span>
              </div>
            ))}
            {activityLog.length === 0 && <div style={{ padding: 12, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No recent activity</div>}
          </div>
        </GlassCard>
      </div>
    </>}

    {/* CLIENTS + PROFILE (abbreviated — same structure as before) */}
    {tab === "Clients" && !viewClientId && clientView === "signals" && <Suspense fallback={<SubFallback />}><ClientSignals clients={jurisdiction?.isSalesperson ? jurisdiction.myClients : clients} sales={jurisdiction?.isSalesperson ? jurisdiction.mySales : sales} pubs={pubs} issues={issues} proposals={proposals} currentUser={currentUser} jurisdiction={jurisdiction} myPriorities={myPriorities} priorityHelpers={priorityHelpers} onSelectClient={(cId) => navTo("Clients", cId)} /></Suspense>}
    {tab === "Clients" && !viewClientId && clientView === "list" && <ClientList clients={jurisdiction?.isSalesperson ? jurisdiction.myClients : clients} sales={jurisdiction?.isSalesperson ? jurisdiction.mySales : sales} pubs={pubs} issues={issues} proposals={proposals} sr={sr} setSr={setSr} fPub={fPub} onSelectClient={(cId) => navTo("Clients", cId)} />}
    {tab === "Clients" && viewClientId && <Suspense fallback={<SubFallback />}><ClientProfile
      clientId={viewClientId} clients={clients} setClients={setClients}
      sales={sales} setSales={setSales} pubs={pubs} issues={issues} proposals={proposals}
      contracts={contracts} invoices={invoices} payments={payments}
      team={props.team} commForm={commForm} setCommForm={setCommForm}
      onBack={goBack} onNavTo={navTo} onNavigate={props.onNavigate}
      onOpenProposal={openProposal} onSetViewPropId={setViewPropId}
      bus={bus} updateClientContact={props.updateClientContact}
      onOpenEditClient={(vc) => { setEc(vc); setCf({ name: vc.name, industries: vc.industries || [], leadSource: vc.leadSource || "", interestedPubs: vc.interestedPubs || [], contacts: vc.contacts || [], notes: vc.notes || "", billingEmail: vc.billingEmail || "", billingCcEmails: [...(vc.billingCcEmails || []), "", ""].slice(0, 2), billingAddress: vc.billingAddress || "", billingAddress2: vc.billingAddress2 || "", billingCity: vc.billingCity || "", billingState: vc.billingState || "", billingZip: vc.billingZip || "" }); setCmo(true); }}
      onOpenEmail={(client) => {
        // Mirrors the per-pipeline-card email handler at line 392 — pre-fills To with the
        // primary contact's email, drops a generic "following up" body Dana usually edits.
        setEmailSaleId(null);
        setEmailTo(client?.contacts?.[0]?.email || "");
        setEmailSubj(`Following up — ${client?.name || ""}`);
        setEmailBody(`Hi ${client?.contacts?.[0]?.name || ""},\n\nI wanted to follow up on our conversation about advertising with 13 Stars Media.\n\nBest,\n${COMPANY.sales.name}\n${COMPANY.sales.phone}`);
        setEmailMo(true);
      }}
      onOpenMeeting={(client) => {
        // Same pattern as the existing scheduling action — defaults to a meeting
        // tomorrow @ 10am, 30min, with the client preset. No saleId because this
        // entry-point comes from the client header, not a specific opportunity.
        setCalSaleId(null);
        setSchEvent({
          title: `Meeting: ${client?.name || ""}`,
          date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          time: "10:00",
          duration: 30,
          clientId: client?.id || "",
          type: "meeting",
          notes: "",
        });
        setCalMo(true);
      }}
    /></Suspense>}

    {/* PROPOSALS */}
    {tab === "Proposals" && !viewPropId && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* METRICS BAR */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 4 }}>
        {[
          ["Proposed", "$" + (proposals.filter(p => p.status === "Sent" || p.status === "Under Review").reduce((s,p) => s + (p.total||0), 0)/1000).toFixed(0) + "K", Z.wa],
          ["Signed", "$" + (proposals.filter(p => p.status === "Signed & Converted").reduce((s,p) => s + (p.total||0), 0)/1000).toFixed(0) + "K", Z.ac],
          ["Conversion", Math.round(proposals.filter(p => p.status === "Signed & Converted").length / Math.max(1, proposals.filter(p => p.status !== "Draft").length) * 100) + "%", Z.pu],
          ["Avg Deal", "$" + Math.round(proposals.filter(p => p.total > 0).reduce((s,p) => s + p.total, 0) / Math.max(1, proposals.filter(p => p.total > 0).length)).toLocaleString(), Z.or],
        ].map(([l, v, c]) => <div key={l} style={{ ...cardSurface(), borderRadius: R, padding: "10px 14px" }}><div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{v}</div></div>)}
      </div>
      {(() => {
        let fp = [...proposals].sort((a, b) => (b.date || b.sentAt || "").localeCompare(a.date || a.sentAt || ""));
        if (propStatus === "all") fp = fp.filter(p => p.status !== "Cancelled");
        else fp = fp.filter(p => p.status === propStatus);
        if (propSearch) { const q = propSearch.toLowerCase(); fp = fp.filter(p => (p.name || "").toLowerCase().includes(q) || cn(p.clientId).toLowerCase().includes(q) || propPubNames(p).toLowerCase().includes(q)); }
        return fp.length === 0 ? <GlassCard style={{ textAlign: "center", padding: 24, color: Z.td }}>No proposals match filters</GlassCard> : fp.map(p => <div key={p.id} onClick={() => setViewPropId(p.id)} style={{ ...cardSurface(), borderRadius: R, padding: 16, cursor: "pointer" }}><div style={{ display: "flex", justifyContent: "space-between" }}><div><span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{p.name}</span><div style={{ fontSize: FS.sm, color: Z.tm }}>{cn(p.clientId)} · {p.lines.length} items</div><div style={{ fontSize: FS.sm, color: Z.ac }}>{propPubNames(p)}</div></div><div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.su }}>${p.total.toLocaleString()}</span><Badge status={p.status} small />
        {p.sentAt && <span
          title={`Sent ${new Date(p.sentAt).toLocaleString()}${p.sentTo?.length ? `\nTo: ${p.sentTo.join(", ")}` : ""}`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            padding: "2px 7px", borderRadius: 10,
            fontSize: FS.micro, fontWeight: FW.heavy, fontFamily: COND,
            textTransform: "uppercase", letterSpacing: 0.4,
            background: Z.ss, color: Z.go, whiteSpace: "nowrap",
          }}
        >{`\u2714 Sent ${fmtTimeRelative(p.sentAt)}`}</span>}
      </div></div></div>);
      })()}</div>}
    {tab === "Proposals" && viewPropId && (() => { const p = proposals.find(x => x.id === viewPropId); if (!p) return null; const grouped = {}; p.lines.forEach(li => { if (!grouped[li.pubName]) grouped[li.pubName] = []; grouped[li.pubName].push(li); });
      return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}><div style={{ display: "flex", justifyContent: "space-between" }}><div><h2 style={{ margin: "0 0 4px", fontSize: FS.xl, fontWeight: FW.black, color: Z.tx }}>{p.name}</h2><div style={{ fontSize: FS.base, color: Z.tm }}>{cn(p.clientId)} · {p.term} · {p.date}</div><div style={{ fontSize: FS.sm, color: Z.tx, marginTop: 3 }}>{propPubNames(p)}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: 22, fontWeight: FW.black, color: Z.tx }}>${p.total.toLocaleString()}</div><Badge status={p.status} />{p.closedAt && <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 2 }}>Closed: {new Date(p.closedAt).toLocaleDateString()}</div>}</div></div>{Object.entries(grouped).map(([pub, lines]) => <GlassCard key={pub}><h4 style={{ margin: "0 0 8px", fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{pub}</h4><div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{lines.map((li, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 6, padding: "5px 8px", background: Z.bg, borderRadius: R }}><span style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{li.issueLabel}</span><span style={{ fontSize: FS.sm, color: Z.tm }}>{li.adSize}</span><span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx, textAlign: "right" }}>${li.price.toLocaleString()}</span></div>)}</div></GlassCard>)}<div style={{ background: Z.sa, borderRadius: R, padding: 12, border: `1px solid ${Z.bd}`, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}><div><div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm, textTransform: "uppercase" }}>Items</div><div style={{ fontSize: FS.lg, fontWeight: FW.heavy, color: Z.tx }}>{p.lines.length}</div></div><div><div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm, textTransform: "uppercase" }}>Tier</div><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{p.term}</div></div><div><div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm, textTransform: "uppercase" }}>Contract</div><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{p.termMonths} months</div></div><div><div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm, textTransform: "uppercase" }}>{p.payPlan ? "Monthly" : "Payment"}</div><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{p.payPlan ? `$${p.monthly?.toLocaleString()}/mo` : `$${p.total.toLocaleString()}`}</div></div></div>
      {p.sentTo?.length > 0 && <div style={{ fontSize: FS.sm, color: Z.tm }}>Sent to: {p.sentTo.join(", ")}</div>}
      {p.renewalDate && <div style={{ fontSize: FS.sm, color: Z.wa }}>Renewal: {p.renewalDate}</div>}
      {/* Actions */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {p.status === "Sent" && <Btn v="success" onClick={async () => { await signProposal(p.id); setViewPropId(null); }}>Client Signed → Contract</Btn>}
        {(p.status === "Sent" || p.status === "Draft") && <Btn v="secondary" onClick={() => editProposal(p.id)}><Ic.edit size={12} /> {p.status === "Draft" ? "Edit Draft" : "Edit & Resend"}</Btn>}
        {p.status === "Signed & Converted" && <span style={{ fontSize: FS.sm, color: Z.su, fontWeight: FW.bold }}>✓ Signed & Converted</span>}
        {(p.status === "Signed & Converted" || p.status === "Cancelled") && <Btn v="secondary" onClick={async () => {
          // Create copy: duplicate proposal without past-published issues
          const today = new Date().toISOString().slice(0, 10);
          const futureLines = (p.lines || []).filter(l => !l.issueDate || l.issueDate >= today);
          if (futureLines.length === 0) { await dialog.alert("No future issues to copy — all issues have already published."); return; }
          const newTotal = futureLines.reduce((s, l) => s + (l.price || 0), 0);
          const copy = { ...p, name: p.name + " (Copy)", status: "Draft", lines: futureLines, total: newTotal, date: today, sentAt: null, signedAt: null, convertedAt: null, contractId: null };
          delete copy.id; delete copy.history;
          const result = await insertProposal(copy);
          if (result?.id) { await dialog.alert(`Copy created with ${futureLines.length} future items ($${newTotal.toLocaleString()}). ${(p.lines || []).length - futureLines.length} past issues removed.`); setViewPropId(result.id); }
        }}><Ic.file size={12} /> Create Copy</Btn>}
        {p.status !== "Signed & Converted" && p.status !== "Cancelled" && <Btn v="ghost" onClick={async () => { if (!await dialog.confirm("Cancel this proposal? It will be archived.")) return; await updateProposal(p.id, { status: "Cancelled" }); setViewPropId(null); }} style={{ color: Z.da }}>Cancel Proposal</Btn>}
        {p.status === "Cancelled" && <span style={{ fontSize: FS.sm, color: Z.da, fontWeight: FW.bold }}>Cancelled</span>}
      </div>

      {/* History Timeline */}
      {p.history?.length > 0 && <GlassCard>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>History</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {(p.history || []).map((h, i) => <div key={i} style={{ display: "flex", gap: 10, padding: "4px 0", borderBottom: i < p.history.length - 1 ? `1px solid ${Z.bd}15` : "none" }}>
            <span style={{ fontSize: FS.xs, color: Z.tm, minWidth: 90 }}>{h.date ? new Date(h.date).toLocaleDateString() : ""}</span>
            <span style={{ fontSize: FS.sm, color: Z.tx }}>{h.detail || h.event}</span>
          </div>)}
        </div>
      </GlassCard>}
      </div>; })()}

    {/* CLOSED — RECENT WINS (quick view, deep research on Contracts page) */}
    {tab === "Closed" && (() => {
      // Load contracts on first visit
      if (!contractsLoaded && loadContracts) loadContracts();

      const repName = (tid) => (props.team || []).find(t => t.id === tid)?.name || "\u2014";
      const d30s = new Date(Date.now() - 30 * 86400000).toISOString().slice(0,10);

      // Build deal list from contracts with closed date + pub abbreviations
      const deals = (contracts || []).map(c => {
        const pubIds = [...new Set((c.lines || []).map(l => l.pubId))];
        const pubAbbrevs = pubIds.map(pid => { const n = pn(pid); return n.length > 15 ? n.split(" ").map(w => w[0]).join("") : n; }).join(", ");
        const closedDate = c.startDate || "";
        return { ...c, pubAbbrevs, pubIds, closedDate };
      });

      // Filter: hide cancelled unless toggled, last 30 days + pub + rep + search
      let filtered = showCancelled ? deals : deals.filter(c => c.status !== "cancelled");
      filtered = filtered.filter(c => (c.closedDate || "") >= d30s);
      if (fPub !== "all") filtered = filtered.filter(c => c.pubIds.includes(fPub));
      if (closedRep !== "all") filtered = filtered.filter(c => c.assignedTo === closedRep);
      if (closedSearch) {
        const q = closedSearch.toLowerCase();
        filtered = filtered.filter(c => cn(c.clientId).toLowerCase().includes(q) || c.pubAbbrevs.toLowerCase().includes(q) || (c.name || "").toLowerCase().includes(q));
      }

      // Sort
      const sortDir = closedSort.dir === "asc" ? 1 : -1;
      const getSortVal = (c) => {
        if (closedSort.key === "client") return cn(c.clientId);
        if (closedSort.key === "amount") return c.totalValue || 0;
        if (closedSort.key === "date") return c.closedDate || "";
        if (closedSort.key === "rep") return repName(c.assignedTo);
        if (closedSort.key === "pubs") return c.pubAbbrevs || "";
        return "";
      };
      filtered.sort((a, b) => {
        const av = getSortVal(a), bv = getSortVal(b);
        if (typeof av === "number") return (av - bv) * sortDir;
        return String(av).localeCompare(String(bv)) * sortDir;
      });

      const totalRev = filtered.reduce((s, c) => s + (c.totalValue || 0), 0);
      const repRevs = {}; filtered.forEach(c => { if (c.assignedTo) { const rn = repName(c.assignedTo); repRevs[rn] = (repRevs[rn] || 0) + (c.totalValue || 0); } });
      const topRep = Object.entries(repRevs).sort((a,b) => b[1] - a[1])[0];

      // Contract detail — now renders as a modal alongside the table,
      // so the underlying table keeps its sort/filter/scroll state.
      const viewContract = viewContractId ? (contracts || []).find(c => c.id === viewContractId) : null;
      const contractSales = viewContract ? closedSales.filter(s => s.contractId === viewContract.id) : [];
      const pubGroups = {};
      if (viewContract) (viewContract.lines || []).forEach(l => { const pk = l.pubId || "other"; if (!pubGroups[pk]) pubGroups[pk] = []; pubGroups[pk].push(l); });

      return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* STATS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {[
          ["Revenue", "$" + (totalRev >= 1000 ? (totalRev/1000).toFixed(0) + "K" : totalRev.toLocaleString()), Z.go],
          ["Deals Closed", String(filtered.length), Z.ac],
          ["Avg Deal", "$" + Math.round(totalRev / Math.max(1, filtered.length)).toLocaleString(), Z.wa],
          ["Top Seller", topRep ? topRep[0].split(" ")[0] : "\u2014", Z.ac],
        ].map(([l, v]) => <div key={l} style={{ ...cardSurface(), borderRadius: R, padding: "12px 16px" }}><div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{v}</div>{l === "Top Seller" && topRep && <div style={{ fontSize: FS.xs, color: Z.tm }}>${(topRep[1]/1000).toFixed(0)}K revenue</div>}</div>)}
      </div>
      {!contractsLoaded && <div style={{ padding: 16, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>Loading...</div>}
      {/* TABLE */}
      <GlassCard style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS.sm, fontFamily: COND }}>
          <thead><tr style={{ borderBottom: `1px solid ${Z.bd}` }}>
            {[["Client","client"],["Publications","pubs"],["Value","amount"],["Closed","date"],["Salesperson","rep"]].map(([label, key]) => <th key={label} onClick={() => setClosedSort(prev => ({ key, dir: prev.key === key && prev.dir === "asc" ? "desc" : "asc" }))} style={{ padding: "8px 12px", textAlign: label === "Value" ? "right" : "left", fontSize: FS.xs, fontWeight: FW.heavy, color: closedSort.key === key ? Z.ac : Z.td, textTransform: "uppercase", cursor: "pointer", userSelect: "none" }}>{label}{closedSort.key === key ? (closedSort.dir === "asc" ? " \u25B2" : " \u25BC") : ""}</th>)}
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: Z.td }}>No deals in this period</td></tr>
            : filtered.slice(0, 100).map(c => <tr key={c.id} onClick={() => setViewContractId(c.id)} style={{ cursor: "pointer", borderBottom: `1px solid ${Z.bd}15` }}
              onMouseEnter={e => e.currentTarget.style.background = Z.sa} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <td style={{ padding: "8px 12px", fontWeight: FW.semi, color: Z.tx }}>{cn(c.clientId)}</td>
              <td style={{ padding: "8px 12px", color: Z.tm, fontSize: FS.xs }}>{c.pubAbbrevs}</td>
              <td style={{ padding: "8px 12px", fontWeight: FW.bold, color: Z.tx, textAlign: "right" }}>${(c.totalValue || 0).toLocaleString()}</td>
              <td style={{ padding: "8px 12px", color: Z.tm }}>{c.closedDate}</td>
              <td style={{ padding: "8px 12px", color: Z.tm }}>{c.assignedTo ? repName(c.assignedTo) : "\u2014"}</td>
            </tr>)}
          </tbody>
        </table>
        {filtered.length > 100 && <div style={{ padding: 8, textAlign: "center", fontSize: FS.xs, color: Z.td }}>Showing 100 of {filtered.length}</div>}
      </GlassCard>

      {/* CONTRACT DETAIL MODAL */}
      <Modal
        open={!!viewContract}
        onClose={() => setViewContractId(null)}
        title={viewContract ? `${cn(viewContract.clientId)} — ${viewContract.name || "Contract"}` : ""}
        width={1100}
        actions={viewContract ? <>
          <Btn sm v="secondary" onClick={async () => {
            try { await generatePdf("contract", viewContract.id); }
            catch (err) { console.error("Contract PDF failed:", err); await dialog.alert(`PDF download failed: ${err.message || "Unknown error"}`); }
          }}><Ic.download size={12} /> Download PDF</Btn>
          {viewContract.status === "active" && <Btn sm v="ghost" onClick={async () => {
            const reason = await dialog.prompt("Cancellation reason:");
            if (!reason) return;
            // Check for invoiced orders that haven't gone to press
            const contractSales = (sales || []).filter(s => s.contractId === viewContract.id && s.status === "Closed");
            const invoicedSaleIds = new Set((invoices || []).filter(inv => inv.status !== "void" && inv.status !== "paid").flatMap(inv => inv.saleId ? [inv.saleId] : []));
            const unpressedInvoiced = contractSales.filter(s => {
              if (!invoicedSaleIds.has(s.id)) return false;
              const iss = (issues || []).find(i => i.id === s.issueId);
              return !iss?.sentToPressAt;
            });
            if (unpressedInvoiced.length > 0) {
              const ok = await dialog.confirm(`${unpressedInvoiced.length} order${unpressedInvoiced.length > 1 ? "s have" : " has"} been invoiced but not sent to press. Cancelling will void ${unpressedInvoiced.length === 1 ? "this invoice" : "these invoices"}. Are you sure you want to delete the invoiced order${unpressedInvoiced.length > 1 ? "s" : ""}?`);
              if (!ok) return;
            }
            const { data, error } = await supabase.rpc("cancel_contract", { p_contract_id: viewContract.id, p_reason: reason });
            if (error) { await dialog.alert("Error: " + error.message); return; }
            if (data?.error) { await dialog.alert(data.error); return; }
            if (setContracts) setContracts(prev => prev.map(c => c.id === viewContract.id ? { ...c, status: "cancelled" } : c));
            setSales(prev => prev.map(s => s.contractId === viewContract.id && s.status === "Closed" ? { ...s, status: "Cancelled" } : s));
            await dialog.alert(`Contract cancelled. ${data.sales_cancelled} sales, ${data.projects_cancelled} ad projects, ${data.invoices_voided} invoices, ${data.commissions_reversed || 0} commissions reversed.`);
            setViewContractId(null);
          }} style={{ color: Z.da }}>Cancel Contract</Btn>}
          {viewContract.status === "cancelled" && <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.da }}>Cancelled</span>}
          <Btn sm v="ghost" onClick={() => setViewContractId(null)}>Close</Btn>
        </> : null}
      >
        {viewContract && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
            {[
              ["Client", cn(viewContract.clientId)],
              ["Status", (viewContract.status || "").charAt(0).toUpperCase() + (viewContract.status || "").slice(1)],
              ["Term", `${viewContract.startDate || "?"} \u2192 ${viewContract.endDate || "?"}`],
              ["Value", `$${(viewContract.totalValue || 0).toLocaleString()}`],
              ["Salesperson", viewContract.assignedTo ? repName(viewContract.assignedTo) : "\u2014"],
            ].map(([l, v]) => <div key={l} style={{ ...cardSurface(), borderRadius: R, padding: 12 }}>
              <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5 }}>{l}</div>
              <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx, marginTop: 4 }}>{v}</div>
            </div>)}
          </div>
          {Object.entries(pubGroups).map(([pubId, lines]) => <GlassCard key={pubId}>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{pn(pubId) || pubId}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {lines.map((l, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 60px 80px", gap: 6, padding: "5px 8px", background: Z.bg, borderRadius: R }}>
                <span style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{l.adSize}</span>
                <span style={{ fontSize: FS.sm, color: Z.tm, textAlign: "center" }}>{"\u00D7"}{l.quantity || 1}</span>
                <span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx, textAlign: "right" }}>${(l.lineTotal || l.rate || 0).toLocaleString()}</span>
              </div>)}
            </div>
          </GlassCard>)}
          {contractSales.length > 0 && <GlassCard>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Sales Orders ({contractSales.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {contractSales.sort((a, b) => (a.date || "").localeCompare(b.date || "")).map(s => <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 80px", gap: 6, padding: "4px 8px", background: Z.bg, borderRadius: R, fontSize: FS.sm }}>
                <span style={{ color: Z.tm }}>{pn(s.publication)}</span>
                <span style={{ color: Z.tm }}>{s.size || s.type}</span>
                <span style={{ color: Z.tm }}>{s.date}</span>
                <span style={{ fontWeight: FW.bold, color: Z.tx, textAlign: "right" }}>${(s.amount || 0).toLocaleString()}</span>
              </div>)}
            </div>
          </GlassCard>}
          {/* Per-contract discussion thread */}
          <EntityThread
            refType="contract"
            refId={viewContract.id}
            title={`Contract: ${cn(viewContract.client_id) || viewContract.id}`}
            team={team}
            height={320}
          />
        </div>}
      </Modal>
      </div>; })()}
    {tab === "Renewals" && (() => {
      const calcScore = (s) => {
        let score = 50;
        // Renewal status clients get a boost (they have contract or recent ad)
        if (s.clientStatus === "Renewal") score += 25;
        // Sales volume
        if (s.saleCount > 6) score += 15; else if (s.saleCount > 2) score += 5;
        // Revenue
        if (s.totalSpend > 5000) score += 15; else if (s.totalSpend > 1000) score += 5;
        // Multi-pub buyers
        if (s.pubCount > 1) score += 10;
        // Recency
        const daysSince = s.lastDate ? Math.floor((new Date() - new Date(s.lastDate)) / 86400000) : 999;
        if (daysSince < 60) score += 10; else if (daysSince > 180) score -= 15; else if (daysSince > 365) score -= 30;
        return Math.min(100, Math.max(0, score));
      };
      const scored = renewalsDue.map(s => ({ ...s, score: calcScore(s) }));
      const ready = scored.filter(s => s.score >= 80).slice(0, 25);
      const warm = scored.filter(s => s.score >= 40 && s.score < 80).slice(0, 25);
      const atRisk = scored.filter(s => s.score < 40).slice(0, 25);
      const totalRenewRev = scored.reduce((s,x) => s + (x.totalSpend || x.amount || 0), 0);
      const totalReady = scored.filter(s => s.score >= 80).length;
      const totalWarm = scored.filter(s => s.score >= 40 && s.score < 80).length;
      const totalAtRisk = scored.filter(s => s.score < 40).length;
      return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* SCOREBOARD */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {[
          ["Renewal Revenue", "$" + (totalRenewRev/1000).toFixed(0) + "K", Z.ac],
          ["Ready", String(totalReady), Z.ac],
          ["Warm Up", String(totalWarm), Z.wa],
          ["At Risk", String(totalAtRisk), totalAtRisk > 0 ? Z.da : Z.ac],
        ].map(([l, v, c]) => <div key={l} style={{ ...cardSurface(), borderRadius: R, padding: "10px 14px" }}><div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{v}</div></div>)}
      </div>
      {scored.length === 0 && <GlassCard style={{ textAlign: "center", padding: 20, color: Z.ac, fontSize: FS.lg, fontWeight: FW.bold }}>All caught up — no renewals due</GlassCard>}
      {/* THREE LANES */}
      {[{ label: "Ready to Renew", items: ready, total: totalReady, color: Z.ac, action: "Send Renewal" }, { label: "Warm Up Needed", items: warm, total: totalWarm, color: Z.wa, action: "Schedule Check-in" }, { label: "At Risk", items: atRisk, total: totalAtRisk, color: Z.da, action: "Review Account" }].map(lane => lane.items.length === 0 ? null : <div key={lane.label}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0 4px", borderBottom: `2px solid ${lane.color}` }}><span style={{ fontSize: FS.lg, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{lane.label}</span><span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: INV.light, background: lane.color, padding: "1px 7px", borderRadius: R }}>{lane.items.length}{lane.total > lane.items.length ? ` of ${lane.total}` : ""}</span></div>
        {lane.items.slice(0, 25).map(s => <div key={s.clientId || s.id} style={{ ...cardSurface(), borderRadius: R, padding: 16, marginTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><span style={{ fontSize: FS.lg, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{cn(s.clientId)}</span><div style={{ fontSize: FS.sm, color: Z.tm }}>${(s.totalSpend || s.amount || 0).toLocaleString()} total · {s.saleCount || 1} orders · {s.pubCount || 1} pub{(s.pubCount || 1) > 1 ? "s" : ""}</div><div style={{ fontSize: FS.xs, color: Z.td }}>Last: {s.lastDate || s.date}</div></div>
            <div style={{ textAlign: "right" }}><div style={{ fontSize: FS.xl, fontWeight: FW.black, color: lane.color }}>{s.score}</div><div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase" }}>score</div></div>
          </div>
          {/* Upsell intelligence */}
          {(() => {
            const clientSales = sales.filter(x => x.clientId === s.clientId && x.status === "Closed");
            const activePubs = [...new Set(clientSales.map(x => x.publication))];
            const otherPubs = pubs.filter(p => !activePubs.includes(p.id));
            return otherPubs.length > 0 ? <div style={{ marginTop: 4, padding: "6px 10px", background: Z.bg, borderRadius: Ri, fontSize: FS.xs, color: Z.tm }}>
              Cross-sell: {otherPubs.slice(0,3).map(p => p.name).join(", ")}
            </div> : null;
          })()}
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            <Btn sm onClick={() => openRenewalProposal(s.clientId)}>{lane.action}</Btn>
            <Btn sm v="secondary" onClick={() => navTo("Clients", s.clientId)}>Profile</Btn>
          </div>
        </div>)}
      </div>)}
      </div>; })()}

    {/* COMMISSIONS */}
    {tab === "Commissions" && <Suspense fallback={<SubFallback />}><Commissions sales={sales} clients={clients} pubs={pubs} issues={issues} team={props.team || []} commissionRates={commissionRates || []} commissionLedger={commissionLedger || []} commissionPayouts={commissionPayouts || []} commissionGoals={commissionGoals || []} salespersonPubAssignments={salespersonPubAssignments || []} helpers={commissionHelpers || {}} tab={commTab} setTab={setCommTab} /></Suspense>}
    {tab === "Outreach" && <Suspense fallback={<SubFallback />}><Outreach sales={sales} clients={clients} pubs={pubs} issues={issues} team={props.team || []} campaigns={outreachCampaigns || []} entries={outreachEntries || []} helpers={outreachHelpers || {}} navTo={navTo} currentUser={currentUser} /></Suspense>}

    {/* INQUIRIES */}
    {tab === "Inquiries" && (() => {
      const inquiries = adInquiries || [];
      const newCount = inquiries.filter(i => i.status === "new").length;
      const contactedCount = inquiries.filter(i => i.status === "contacted").length;
      const convertedCount = inquiries.filter(i => i.status === "converted").length;
      const statusColors = { new: Z.ac || "var(--action)", contacted: Z.wa || "#f59e0b", converted: Z.su || "#22c55e", dismissed: Z.tm || "#9ca3af" };
      const confidenceBadge = (conf, reason) => {
        if (conf === "none") return null;
        const color = conf === "exact" ? (Z.su || "#22c55e") : (Z.wa || "#f59e0b");
        return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: color + "18", color, fontFamily: COND, textTransform: "uppercase" }}>{conf} — {reason}</span>;
      };
      // SLA aging — only meaningful while still "new". Hot leads die in queue.
      // Audit I-2: 🟢 <30min, 🟡 30min-2hr, 🔴 >2hr.
      const slaBadge = (inq) => {
        if (inq.status !== "new") return null;
        const ageMin = (Date.now() - new Date(inq.created_at).getTime()) / 60000;
        let color, label;
        if (ageMin < 30) { color = Z.su || "#22c55e"; label = "FRESH"; }
        else if (ageMin < 120) { color = Z.wa || "#f59e0b"; label = `${Math.round(ageMin)}m`; }
        else if (ageMin < 1440) { color = Z.da || "#ef4444"; label = `${Math.round(ageMin / 60)}h LATE`; }
        else { color = Z.da || "#ef4444"; label = `${Math.round(ageMin / 1440)}d LATE`; }
        return <span title={`Inquiry age — respond within 30 min for best conversion. Created ${new Date(inq.created_at).toLocaleString()}`} style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: color + "22", color, fontFamily: COND, letterSpacing: 0.5 }}>● {label}</span>;
      };
      // Sort: new inquiries by age (oldest first — they're the most at risk),
      // then everything else by created_at desc. Keeps hot leads at the top.
      const sortedInquiries = [...inquiries].sort((a, b) => {
        const aNew = a.status === "new" ? 0 : 1;
        const bNew = b.status === "new" ? 0 : 1;
        if (aNew !== bNew) return aNew - bNew;
        if (a.status === "new") return new Date(a.created_at) - new Date(b.created_at);
        return new Date(b.created_at) - new Date(a.created_at);
      });
      return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Stats */}
        <div style={{ display: "flex", gap: 12 }}>
          <GlassStat label="New" value={newCount} color={statusColors.new} />
          <GlassStat label="Contacted" value={contactedCount} color={statusColors.contacted} />
          <GlassStat label="Signed" value={convertedCount} color={statusColors.converted} />
          <GlassStat label="Total" value={inquiries.length} />
        </div>

        {/* Inquiry list */}
        {!inquiriesLoaded ? (
          <div style={{ padding: 40, textAlign: "center", color: Z.tm, fontSize: FS.sm, fontFamily: COND }}>Loading inquiries...</div>
        ) : inquiries.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: Z.tm, fontSize: FS.sm, fontFamily: COND }}>No inquiries yet. Inquiries from your website's Advertise page will appear here.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sortedInquiries.map(inq => {
              const matchedClient = inq.client_id ? (clients || []).find(c => c.id === inq.client_id) : null;
              const rep = matchedClient?.repId ? (props.team || []).find(t => t.id === matchedClient.repId) : null;
              return <div key={inq.id} style={{ ...cardSurface(), padding: CARD.pad, borderRadius: R, border: "1px solid " + Z.bd, display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Header row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>{inq.business_name || inq.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 3, background: (statusColors[inq.status] || Z.tm) + "18", color: statusColors[inq.status] || Z.tm, fontFamily: COND, textTransform: "uppercase" }}>{inq.status}</span>
                      {slaBadge(inq)}
                      {confidenceBadge(inq.match_confidence, inq.match_reason)}
                      {matchedClient && !inq.confirmed && inq.match_confidence !== "none" && (
                        <span style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => updateInquiry(inq.id, { confirmed: true })} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 3, background: (Z.su || "#22c55e") + "18", color: Z.su || "#22c55e", border: "none", cursor: "pointer", fontFamily: COND }}>Confirm Match</button>
                          <button onClick={() => updateInquiry(inq.id, { client_id: null, match_confidence: "none", match_reason: "" })} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 3, background: (Z.da || "#ef4444") + "18", color: Z.da || "#ef4444", border: "none", cursor: "pointer", fontFamily: COND }}>Reject</button>
                        </span>
                      )}
                      {inq.confirmed && <span style={{ fontSize: 10, fontWeight: 700, color: Z.su || "#22c55e", fontFamily: COND }}>&#10003; Confirmed</span>}
                    </div>
                    <div style={{ fontSize: FS.sm, color: Z.tm, fontFamily: COND, marginTop: 2 }}>
                      {inq.name} &middot; {inq.email}{inq.phone ? " \u00b7 " + inq.phone : ""}{inq.website ? " \u00b7 " + inq.website : ""}
                    </div>
                    {matchedClient && <div style={{ fontSize: 11, color: Z.ac, fontFamily: COND, marginTop: 2, cursor: "pointer" }} onClick={() => navTo("Clients", matchedClient.id)}>Linked to: {matchedClient.name}{rep ? " (Rep: " + rep.name + ")" : ""}</div>}
                  </div>
                  <div style={{ fontSize: 11, color: Z.tm, fontFamily: COND, whiteSpace: "nowrap" }}>
                    {new Date(inq.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </div>

                {/* Details row */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12, color: Z.tx, fontFamily: COND }}>
                  {inq.ad_types?.length > 0 && <div><span style={{ color: Z.tm, fontWeight: 600 }}>Types:</span> {inq.ad_types.join(", ")}</div>}
                  {inq.preferred_zones?.length > 0 && <div><span style={{ color: Z.tm, fontWeight: 600 }}>Zones:</span> {inq.preferred_zones.join(", ")}</div>}
                  {inq.interested_product_ids?.length > 0 && (
                    <div title={inq.interested_product_ids.map(id => adProductMap[id] || id).join(", ")}>
                      <span style={{ color: Z.tm, fontWeight: 600 }}>Products:</span>{" "}
                      {inq.interested_product_ids
                        .map(id => adProductMap[id])
                        .filter(Boolean)
                        .join(", ") || `${inq.interested_product_ids.length} selected`}
                    </div>
                  )}
                  {inq.budget_range && <div><span style={{ color: Z.tm, fontWeight: 600 }}>Budget:</span> {inq.budget_range}</div>}
                  {inq.desired_start && <div><span style={{ color: Z.tm, fontWeight: 600 }}>Start:</span> {new Date(inq.desired_start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>}
                  {inq.how_heard && <div><span style={{ color: Z.tm, fontWeight: 600 }}>Source:</span> {inq.how_heard}</div>}
                </div>

                {inq.message && <div style={{ fontSize: 12, color: Z.tx, fontFamily: COND, background: Z.sa, padding: "6px 10px", borderRadius: Ri, borderLeft: "3px solid " + Z.bd }}>{inq.message}</div>}

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                  {inq.email && <Btn sm v="primary" onClick={() => {
                    // Reply opens the email modal pre-filled from the inquiry.
                    // On send, the existing emailMo handler logs to client.comms
                    // (when client_id is set) and stamps Gmail send via SES.
                    setEmailSaleId(null);
                    setEmailTo(inq.email);
                    setEmailSubj(`Re: Your inquiry about advertising with 13 Stars Media`);
                    setEmailBody(`Hi ${inq.name || ""},\n\nThanks for reaching out about advertising with 13 Stars Media. ${inq.message ? `\n\nYou wrote:\n> ${inq.message.split("\n").join("\n> ")}\n` : ""}\nI'd love to set up a quick call to learn more about your business and recommend the right fit. What works for you this week?\n\nBest,\n${COMPANY?.sales?.name || ""}\n${COMPANY?.sales?.phone || ""}`);
                    setEmailMo(true);
                    if (inq.status === "new") updateInquiry(inq.id, { status: "contacted", updated_at: new Date().toISOString() });
                  }}>Reply</Btn>}
                  {inq.status === "new" && <Btn sm onClick={() => updateInquiry(inq.id, { status: "contacted", updated_at: new Date().toISOString() })}>Mark Contacted</Btn>}
                  {(inq.status === "new" || inq.status === "contacted") && !inq.converted_sale_id && (
                    <Btn sm v="primary" onClick={async () => {
                      // Convert to Draft Sale: ensure client, create a Discovery
                      // sale pre-filled from inquiry data, link inquiry -> sale,
                      // jump to the pipeline so the rep sees it. Spec Phase 3.
                      let clientId = inq.client_id;
                      if (!clientId) {
                        const nc = await insertClient({
                          name: inq.business_name || inq.name,
                          status: "Lead",
                          leadSource: "Website Inquiry",
                          contacts: [{ name: inq.name, email: inq.email, phone: inq.phone || "", role: "Business Owner" }],
                          notes: "From ad inquiry: " + (inq.message || ""),
                          repId: currentUser?.id || null,
                        });
                        clientId = nc?.id;
                        if (!clientId) return;
                      }
                      const startDate = inq.desired_start || new Date().toISOString().slice(0, 10);
                      const newSale = await insertSale({
                        clientId,
                        publication: inq.site_id || null,
                        productType: "web_ad",
                        date: startDate,
                        status: "Discovery",
                        assignedTo: currentUser?.id || null,
                        flightStartDate: inq.desired_start || null,
                        oppNotes: inq.message ? [{ text: inq.message, time: inq.created_at, source: "inquiry" }] : [],
                      });
                      if (newSale?.id) {
                        await updateInquiry(inq.id, {
                          status: "contacted",
                          client_id: clientId,
                          converted_sale_id: newSale.id,
                          converted_by: currentUser?.id || null,
                          converted_at: new Date().toISOString(),
                          updated_at: new Date().toISOString(),
                        });
                        setTab("Pipeline");
                      }
                    }}>Create Draft Sale</Btn>
                  )}
                  {(inq.status === "new" || inq.status === "contacted") && inq.converted_sale_id && (
                    <Btn sm v="ghost" onClick={() => setTab("Pipeline")}>View Sale &rarr;</Btn>
                  )}
                  {(inq.status === "new" || inq.status === "contacted") && (
                    <Btn sm v="success" onClick={() => {
                      if (!inq.client_id) {
                        // Create a new client from this inquiry. Ownership
                        // defaults to the salesperson who converted it —
                        // natural since they worked the inquiry. Admin
                        // can reassign from the client profile later.
                        const newClient = {
                          name: inq.business_name || inq.name,
                          status: "Lead",
                          leadSource: "Website Inquiry",
                          contacts: [{ name: inq.name, email: inq.email, phone: inq.phone || "", role: "Business Owner" }],
                          notes: "From ad inquiry: " + (inq.message || ""),
                          repId: currentUser?.id || null,
                        };
                        insertClient(newClient).then(nc => {
                          if (nc?.id) updateInquiry(inq.id, { status: "converted", client_id: nc.id, updated_at: new Date().toISOString() });
                        });
                      } else {
                        updateInquiry(inq.id, { status: "converted", updated_at: new Date().toISOString() });
                      }
                    }}>Convert to Lead</Btn>
                  )}
                  {(inq.status === "new" || inq.status === "contacted") && <Btn sm v="ghost" onClick={() => updateInquiry(inq.id, { status: "dismissed", updated_at: new Date().toISOString() })}>Dismiss</Btn>}
                </div>
              </div>;
            })}
          </div>
        )}
      </div>;
    })()}

    {/* CLOSE-TIME ISSUE PICKER: every display_print sale must belong to an
        issue (DB CHECK constraint). When a sale is moved to Closed without
        one, this modal forces the salesperson to pick. */}
    <Modal open={!!closeIssueModal} onClose={() => setCloseIssueModal(null)} title="Pick an issue to close into" width={480}>
      {closeIssueModal && (() => {
        const targetSale = sales.find(x => x.id === closeIssueModal.saleId);
        const pubName = pn(closeIssueModal.pubId);
        const candidateIssues = (issues || [])
          .filter(i => i.pubId === closeIssueModal.pubId && i.date >= today)
          .sort((a, b) => a.date.localeCompare(b.date));
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: FS.sm, color: Z.tm }}>
              {targetSale ? `${cn(targetSale.clientId)} — ${pubName} ${targetSale.size || ""}` : pubName}
            </div>
            {candidateIssues.length === 0 ? (
              <div style={{ padding: 12, background: Z.bg, borderRadius: Ri, color: Z.tm, fontSize: FS.sm }}>
                No upcoming issues for {pubName}. Add one in Publications first, then come back to close this sale.
              </div>
            ) : (
              <Sel
                label="Issue"
                value={closeIssueChoice}
                onChange={e => setCloseIssueChoice(e.target.value)}
                options={[
                  { value: "", label: "Select an issue..." },
                  ...candidateIssues.map(i => ({ value: i.id, label: `${i.label} — ${i.date}` })),
                ]}
              />
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn v="cancel" sm onClick={() => setCloseIssueModal(null)}>Cancel</Btn>
              <Btn
                sm
                disabled={!closeIssueChoice}
                onClick={() => {
                  const saleId = closeIssueModal.saleId;
                  const issueId = closeIssueChoice;
                  setCloseIssueModal(null);
                  finalizeClose(saleId, issueId);
                }}
              >Close into issue</Btn>
            </div>
          </div>
        );
      })()}
    </Modal>

    {/* MODALS: Client, Opportunity, Proposal, Email Compose, Next Step */}
    <Modal open={cmo} onClose={() => setCmo(false)} title={ec ? "Edit Client" : "New Client"} width={640}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Interested Publications — prominent at top */}
        <div style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: R, padding: CARD.pad }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Interested In</div>
          <FilterPillStrip
            multi
            gap={8}
            value={cf.interestedPubs || []}
            onChange={next => setCf(x => ({ ...x, interestedPubs: next }))}
            options={pubs.map(p => ({ value: p.id, label: p.name, icon: Ic.pub }))}
          />
        </div>

        {/* Company + Lead Source */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
          <Inp label="Company Name" value={cf.name} onChange={e => setCf(x => ({ ...x, name: e.target.value }))} placeholder="Business name" />
          <Sel label="Lead Source" value={cf.leadSource} onChange={e => setCf(x => ({ ...x, leadSource: e.target.value }))} options={[{ value: "", label: "Select source..." }, ...LEAD_SOURCES.map(s => ({ value: s, label: s }))]} />
        </div>

        {/* Industry Categories — multi-select chips */}
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Industry</div>
          <FilterPillStrip
            multi
            maxHeight={100}
            value={cf.industries || []}
            onChange={next => setCf(x => ({ ...x, industries: next }))}
            options={INDUSTRIES.map(ind => ({ value: ind, label: ind, icon: Ic.tag }))}
          />
        </div>

        {/* Primary Contact — with breathing room */}
        <div style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: R, padding: CARD.pad }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Primary Contact</div>
          {(cf.contacts || []).map((ct, i) => <div key={i} style={{ marginBottom: i < (cf.contacts || []).length - 1 ? 10 : 0, paddingBottom: i < (cf.contacts || []).length - 1 ? 10 : 0, borderBottom: i < (cf.contacts || []).length - 1 ? `1px solid ${Z.bd}` : "none" }}>
            {i > 0 && <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 6 }}>Contact #{i + 1}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
              <Inp label="Name" value={ct.name} onChange={e => setCf(x => ({ ...x, contacts: x.contacts.map((c, j) => j === i ? { ...c, name: e.target.value } : c) }))} placeholder="Full name" />
              <Sel label="Role" value={ct.role} onChange={e => setCf(x => ({ ...x, contacts: x.contacts.map((c, j) => j === i ? { ...c, role: e.target.value } : c) }))} options={CONTACT_ROLES.map(r => ({ value: r, label: r }))} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Inp label="Email" type="email" value={ct.email} onChange={e => setCf(x => ({ ...x, contacts: x.contacts.map((c, j) => j === i ? { ...c, email: e.target.value } : c) }))} placeholder="email@company.com" />
              <Inp label="Phone" value={ct.phone} onChange={e => setCf(x => ({ ...x, contacts: x.contacts.map((c, j) => j === i ? { ...c, phone: e.target.value } : c) }))} placeholder="(805) 555-0000" />
            </div>
          </div>)}
          <Btn v="ghost" onClick={() => setCf(x => ({ ...x, contacts: [...(x.contacts || []), { name: "", email: "", phone: "", role: "Other" }] }))}>+ Add Another Contact</Btn>
        </div>

        {/* Billing — overrides the proposal recipient when invoices are sent */}
        <div style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: R, padding: CARD.pad }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Billing</div>
          <div style={{ fontSize: FS.micro, color: Z.td, marginBottom: 8 }}>When set, every invoice goes here instead of the proposal recipient. CC fields add up to two additional recipients.</div>
          <Inp label="Billing Email" type="email" value={cf.billingEmail || ""} onChange={e => setCf(x => ({ ...x, billingEmail: e.target.value }))} placeholder="billing@company.com" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
            <Inp label="CC #1" type="email" value={(cf.billingCcEmails || ["", ""])[0] || ""} onChange={e => setCf(x => { const cc = [...((x.billingCcEmails || ["", ""]))]; cc[0] = e.target.value; return { ...x, billingCcEmails: cc }; })} placeholder="ap@company.com" />
            <Inp label="CC #2" type="email" value={(cf.billingCcEmails || ["", ""])[1] || ""} onChange={e => setCf(x => { const cc = [...((x.billingCcEmails || ["", ""]))]; cc[1] = e.target.value; return { ...x, billingCcEmails: cc }; })} placeholder="accountant@company.com" />
          </div>
          <div style={{ fontSize: FS.micro, color: Z.td, marginTop: 12, marginBottom: 6, fontWeight: FW.heavy, textTransform: "uppercase", letterSpacing: 0.5 }}>Billing Address (for the invoice template + mailed invoices)</div>
          <Inp label="Street" value={cf.billingAddress || ""} onChange={e => setCf(x => ({ ...x, billingAddress: e.target.value }))} placeholder="123 Main St" />
          <div style={{ marginTop: 8 }}>
            <Inp label="Line 2 (Suite, Floor, ATTN)" value={cf.billingAddress2 || ""} onChange={e => setCf(x => ({ ...x, billingAddress2: e.target.value }))} placeholder="Attn: Accounts Payable" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 120px", gap: 10, marginTop: 8 }}>
            <Inp label="City" value={cf.billingCity || ""} onChange={e => setCf(x => ({ ...x, billingCity: e.target.value }))} placeholder="Paso Robles" />
            <Inp label="State" value={cf.billingState || ""} onChange={e => setCf(x => ({ ...x, billingState: e.target.value }))} placeholder="CA" maxLength={2} />
            <Inp label="ZIP" value={cf.billingZip || ""} onChange={e => setCf(x => ({ ...x, billingZip: e.target.value }))} placeholder="93446" />
          </div>
        </div>

        {/* Notes */}
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Notes</div>
          <textarea value={cf.notes || ""} onChange={e => setCf(x => ({ ...x, notes: e.target.value }))} placeholder="First impressions, how you met, what they're looking for, any context for the team..." rows={3} style={{ width: "100%", background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: R, padding: CARD.pad, color: Z.tx, fontSize: FS.base, outline: "none", resize: "vertical", fontFamily: "'Source Sans 3',sans-serif", lineHeight: 1.5, boxSizing: "border-box" }} />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn v="cancel" onClick={() => setCmo(false)}>Cancel</Btn>
          <Btn onClick={saveC} disabled={!cf.name}>{ec ? "Save Changes" : "Create Client"}</Btn>
        </div>
      </div>
    </Modal>

    <Modal open={oppMo} onClose={() => setOppMo(false)} title={oppKitSent ? "Sent!" : oppSendKit ? "Send Rate Cards" : editOppId ? "Opportunity" : "New Opportunity"} width={560}>
      {oppKitSent ? <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", padding: 16 }}><Ic.check size={28} color={Z.su} /><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>Sent to {opp.company}!</div><Btn v="secondary" onClick={() => setOppMo(false)}>Close</Btn></div>
      : oppSendKit ? <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 5 }}>{dropdownPubs.map(p => <button key={p.id} onClick={() => setOppKitPubs(k => k.includes(p.id) ? k.filter(x => x !== p.id) : [...k, p.id])} style={{ padding: "10px 14px", borderRadius: Ri, border: `1px solid ${Z.bg === "#08090D" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.5)"}`, background: oppKitPubs.includes(p.id) ? Z.as : Z.bg, cursor: "pointer", textAlign: "left" }}><div style={{ fontSize: FS.base, fontWeight: FW.bold, color: oppKitPubs.includes(p.id) ? Z.ac : Z.tx }}>{p.name}</div></button>)}</div><TA label="Message" value={oppKitMsg} onChange={e => setOppKitMsg(e.target.value)} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Btn v="secondary" onClick={() => setOppSendKit(false)}>Back</Btn><Btn disabled={oppKitPubs.length === 0} onClick={sendKit}><Ic.mail size={12} /> Send</Btn></div></div>
      : <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><Inp label="Company" data-opp-company value={opp.company} onChange={e => setOpp(x => ({ ...x, company: e.target.value }))} />{!editOppId && opp.company.length > 1 && clients.filter(c => (c.name || "").toLowerCase().includes(opp.company.toLowerCase())).slice(0, 3).map(c => <button key={c.id} onClick={() => setOpp(x => ({ ...x, company: c.name, contact: c.contacts?.[0]?.name || "", email: c.contacts?.[0]?.email || "", phone: c.contacts?.[0]?.phone || "" }))} style={{ padding: "6px 12px", background: Z.sa, border: `1px solid ${Z.bd}`, borderRadius: Ri, cursor: "pointer", fontSize: FS.sm, color: Z.ac, fontWeight: FW.bold, textAlign: "left" }}>→ {c.name}</button>)}<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}><Inp label="Contact" value={opp.contact} onChange={e => setOpp(x => ({ ...x, contact: e.target.value }))} />
        <Sel label="Source" value={opp.source} onChange={e => setOpp(x => ({ ...x, source: e.target.value }))} options={OPP_SOURCES} />
        </div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}><Inp label="Email" value={opp.email} onChange={e => setOpp(x => ({ ...x, email: e.target.value }))} />
        <Inp label="Phone" value={opp.phone} onChange={e => setOpp(x => ({ ...x, phone: e.target.value }))} />
        </div>{editOppId && (() => { const s = sales.find(x => x.id === editOppId); const n = s?.oppNotes || []; return n.length > 0 && <div style={{ background: Z.bg, borderRadius: Ri, border: `1px solid ${Z.bd}`, padding: 16, maxHeight: 90, overflowY: "auto" }}><div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Activity Log</div>{n.slice().reverse().map(x => <div key={x.id} style={{ padding: "3px 0", fontSize: FS.sm, color: Z.tx, borderBottom: `1px solid ${Z.bd}` }}>{x.text} <span style={{ color: Z.td }}>{x.date}</span></div>)}</div>; })()}<TA label="Add Note" value={opp.notes} onChange={e => setOpp(x => ({ ...x, notes: e.target.value }))} placeholder="Notes..." />
        <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}><Btn v="cancel" onClick={() => setOppMo(false)}>Cancel</Btn><Btn v="cancel" onClick={() => { if (!opp.company) return; setOppSendKit(true); setOppKitMsg(`Hi ${opp.contact},\n\nRate cards attached.\n\nBest,\n${COMPANY.sales.name}`); }}><Ic.mail size={12} /> Rate Cards</Btn><Btn v="cancel" onClick={oppToProposal}><Ic.send size={12} /> Create Proposal</Btn><Btn onClick={() => saveOpp()}>{editOppId ? "Save" : "Create"}</Btn></div></div>}
    </Modal>

    {/* PROPOSAL WIZARD — replaces the legacy single-modal builder.
        See proposal-wizard-spec.md and src/components/proposal-wizard/. */}
    {wizardState && (
      <ProposalWizard
        mode={wizardState.mode}
        clientId={wizardState.clientId}
        proposalId={wizardState.proposalId}
        pendingSaleId={wizardState.pendingSaleId}
        initialPrefill={wizardState.initialPrefill}
        clients={clients}
        pubs={pubs}
        issues={issues}
        digitalAdProducts={digitalAdProducts}
        proposals={proposals}
        team={props.team}
        currentUser={currentUser}
        insertProposal={insertProposal}
        updateProposal={updateProposal}
        loadDigitalAdProducts={loadDigitalAdProducts}
        onClose={closeWizard}
        onSent={(propId) => {
          setSales(sl => sl.map(s =>
            s.clientId === wizardState.clientId && (s.status === "Discovery" || s.status === "Presentation")
              ? { ...s, status: "Proposal", nextAction: STAGE_AUTO_ACTIONS.Proposal }
              : s
          ));
          if (wizardState.pendingSaleId) {
            setSales(sl => sl.map(s => s.id === wizardState.pendingSaleId
              ? { ...s, proposalId: propId, status: "Proposal" }
              : s));
          }
          logActivity(`Proposal sent`, "proposal", wizardState.clientId, cn(wizardState.clientId));
          addNotif(`Proposal sent`);
        }}
        onSignedFromConfirm={async (propId) => {
          await signProposal(propId);
          setWizardState(null);
        }}
      />
    )}

    {/* EMAIL COMPOSE MODAL */}
    <Modal open={emailMo} onClose={() => setEmailMo(false)} title="Compose Email" width={600}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Inp label="To" value={emailTo} onChange={e => setEmailTo(e.target.value)} />
        <Inp label="Subject" value={emailSubj} onChange={e => setEmailSubj(e.target.value)} />
        <TA label="Body" value={emailBody} onChange={e => setEmailBody(e.target.value)} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="cancel" onClick={() => setEmailMo(false)}>Cancel</Btn>
          <Btn onClick={sendEmail}><Ic.send size={12} /> Send Email</Btn>
        </div>
      </div>
    </Modal>

    {/* CALENDAR SCHEDULER MODAL */}
    <Modal open={calMo} onClose={() => setCalMo(false)} title="📅 Schedule" width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Inp label="Title" value={schEvent.title} onChange={e => setSchEvent(x => ({ ...x, title: e.target.value }))} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <Inp label="Date" type="date" value={schEvent.date} onChange={e => setSchEvent(x => ({ ...x, date: e.target.value }))} />
          <Inp label="Time" type="time" value={schEvent.time} onChange={e => setSchEvent(x => ({ ...x, time: e.target.value }))} />
          <Sel label="Duration" value={schEvent.duration} onChange={e => setSchEvent(x => ({ ...x, duration: +e.target.value }))} options={[{value:15,label:"15 min"},{value:30,label:"30 min"},{value:60,label:"1 hour"}]} />
        </div>
        <TA label="Notes" value={schEvent.notes} onChange={e => setSchEvent(x => ({ ...x, notes: e.target.value }))} placeholder="Agenda..." />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="cancel" onClick={() => setCalMo(false)}>Cancel</Btn>
          <Btn onClick={() => { if (calSaleId) { const s = sales.find(x => x.id === calSaleId); if (s) { setClients(cl => cl.map(c => c.id === s.clientId ? { ...c, comms: [...(c.comms || []), { id: "cm" + Date.now(), type: "Comment", author: "Account Manager", date: today, note: `Scheduled: ${schEvent.title} on ${schEvent.date} at ${schEvent.time}` }] } : c)); completeAction(calSaleId, `Scheduled: ${schEvent.title} ${schEvent.date}`); } } setCalMo(false); }}>Schedule</Btn>
        </div>
      </div>
    </Modal>

    {/* NEXT STEP PROMPT */}
    <Modal open={nextStepMo} onClose={() => clearAction()} title="What's Next?" width={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: FS.base, color: Z.tm }}>Action completed! What should the next step be?</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
          {Object.entries(ACTION_TYPES).map(([key, at]) => <button key={key} onClick={() => setNextStepAction({ type: key, label: at.label })} style={{ padding: "8px 4px", borderRadius: Ri, border: `1px solid ${nextStepAction?.type === key ? at.color : Z.bd}`, background: nextStepAction?.type === key ? `${at.color}15` : Z.bg, cursor: "pointer", textAlign: "center" }}><div style={{ fontSize: FS.lg }}>{at.icon}</div><div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: nextStepAction?.type === key ? at.color : Z.tm }}>{at.label}</div></button>)}
        </div>
        {nextStepAction && <Inp label="Description" value={nextStepAction.label} onChange={e => setNextStepAction(a => ({ ...a, label: e.target.value }))} />}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="secondary" onClick={clearAction}>No Next Step</Btn>
          <Btn onClick={saveNextStep} disabled={!nextStepAction}><Ic.check size={12} /> Set Next Step</Btn>
        </div>
      </div>
    </Modal>

  </div>;
};

export default memo(SalesCRM);
