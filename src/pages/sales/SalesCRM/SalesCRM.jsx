import { useState, useMemo, useRef, useEffect, useCallback, memo, lazy, Suspense } from "react";
import { useDialog } from "../../../hooks/useDialog";
import { useSaveStatus } from "../../../hooks/useSaveStatus";
import { Z, FS, FW, Ri } from "../../../lib/theme";
import { Ic, Btn, Sel, SB, TB, TabRow, TabPipe, SaveStatusPill } from "../../../components/ui";
import { COMPANY } from "../../../constants";
import { sendGmailEmail, initiateGmailAuth } from "../../../lib/gmail";
import { supabase } from "../../../lib/supabase";
import { generateContractHtml } from "../../../lib/contractTemplate";
import { generateInvoiceHtml } from "../../../lib/invoiceTemplate";
import ProposalWizard from "../../../components/proposal-wizard/ProposalWizard";
import SalesErrorBoundary from "../../../components/sales/SalesErrorBoundary";
import RenewalsTab from "./tabs/RenewalsTab";
import InquiriesTab from "./tabs/InquiriesTab";
import ClosedTab from "./tabs/ClosedTab";
import ProposalsTab from "./tabs/ProposalsTab";
import ProposalDetail from "./tabs/ProposalDetail";
import PipelineTab from "./tabs/PipelineTab";
import ClientsTab from "./tabs/ClientsTab";
import CloseIssueModal from "./modals/CloseIssueModal";
import ClientFormModal from "./modals/ClientFormModal";
import OpportunityModal from "./modals/OpportunityModal";
import EmailComposeModal from "./modals/EmailComposeModal";
import CalendarSchedulerModal from "./modals/CalendarSchedulerModal";
import NextStepModal from "./modals/NextStepModal";
import { useSalesCRM } from "./useSalesCRM";
// Heavy sub-views — only load when the user opens the relevant tab/row.
// ClientProfile + ClientSignals are lazy-loaded inside ClientsTab.
const Commissions = lazy(() => import("../Commissions"));
const Outreach = lazy(() => import("../Outreach"));
const SubFallback = () => <div style={{ padding: 40, textAlign: "center", color: "#525E72", fontSize: FS.base }}>Loading…</div>;
import { PIPELINE, STAGE_AUTO_ACTIONS, actInfo } from "../constants";
import { usePageHeader } from "../../../contexts/PageHeaderContext";

// Constants imported from ./sales/constants

const SalesCRM = (props) => {
  const { clients, setClients, sales, setSales, updateSale, insertSale, pubs, issues, proposals, setProposals, notifications, setNotifications, bus, contracts, setContracts, loadContracts, contractsLoaded, invoices, payments, insertClient, updateClient, addComm, currentUser, insertProposal, updateProposal, convertProposal, loadProposalHistory, commissionLedger, commissionPayouts, commissionGoals, commissionRates, salespersonPubAssignments, commissionHelpers, outreachCampaigns, outreachEntries, outreachHelpers, jurisdiction, myPriorities, priorityHelpers, adInquiries, loadInquiries, inquiriesLoaded, updateInquiry, retainInquiriesRealtime, digitalAdProducts, loadDigitalAdProducts, digitalAdProductsLoaded, industries = [], onNavigate, registerSubBack, isActive } = props;

  // Sales Wave 1 — every CRM write flows through this so RLS rejections,
  // network failures, and 0-rows-affected results show up as a visible
  // pill with retry instead of disappearing into console.error. The
  // wrapper swallows the rejection because save.error already surfaces it.
  const save = useSaveStatus();
  const persist = useCallback(async (factory, retryFactory) => {
    try {
      return await save.track(factory(), { retry: retryFactory ? () => save.track(retryFactory()) : undefined });
    } catch (_) {
      return null;
    }
  }, [save]);

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

  // Wave 3 Task 3.9 — ref tracks previous inquiry count so the
  // notification effect (declared later, after addNotif/tab) can fire
  // only on actual new arrivals.
  const prevInquiryCountRef = useRef(null);
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

  // Wave 2 — keep proofReadyMap live via the bus instead of one-shot
  // fetch. Designer sign-off in AdProjects flips the badge on; salesperson
  // sign-off (or bulk) flips it off. No round-trip; the rep sees the
  // change instantly.
  useEffect(() => {
    if (!bus) return;
    const offD = bus.on?.("proof.designerSignoff", ({ contractId }) => {
      if (!contractId) return;
      setProofReadyMap(m => (m[contractId] ? m : { ...m, [contractId]: true }));
    });
    const offS = bus.on?.("proof.salespersonSignoff", ({ contractId }) => {
      if (!contractId) return;
      setProofReadyMap(m => {
        if (!m[contractId]) return m;
        const { [contractId]: _gone, ...rest } = m;
        return rest;
      });
    });
    return () => { offD?.(); offS?.(); };
  }, [bus]);
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
  // OPP_SOURCES lives in SalesCRM.constants.js — consumed by OpportunityModal directly.
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
  // Wave 3 — activityLog is derived from sales/clients/proposals via
  // useSalesCRM. The legacy useState mock seed (Conejo Hardwoods /
  // UCLA Health / Five Star) used to leak into a fresh DB.
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
  // Wave 3 Task 3.2 — clicking a lost-reason chip on the Closed tab
  // narrows the deal table by that reason. null = no narrowing.
  const [lostReasonFilter, setLostReasonFilter] = useState(null);
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

  // Wave 3 Task 3.9 — fire a notification when a new inquiry lands
  // while the rep is on a different tab. realtime channel (above)
  // pushes rows into adInquiries; we watch length for increase. Ref
  // avoids a false positive on initial load by seeding only after
  // inquiriesLoaded flips true.
  useEffect(() => {
    if (!inquiriesLoaded) return;
    const count = (adInquiries || []).length;
    if (prevInquiryCountRef.current === null) {
      prevInquiryCountRef.current = count;
      return;
    }
    if (count > prevInquiryCountRef.current && tab !== "Inquiries") {
      const arrived = count - prevInquiryCountRef.current;
      addNotif(`${arrived} new inquir${arrived > 1 ? "ies" : "y"} — Pipeline → Inquiries`);
    }
    prevInquiryCountRef.current = count;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adInquiries?.length, inquiriesLoaded, tab]);
  // Local-state activity strip + parallel mirror to the global
  // activity_log RPC for selected pipeline events. The strip serves
  // the in-page UX (50-row rolling feed); the RPC feeds Hayley's
  // publisher stream + Sales Rep target progress. Heuristic mapping
  // below — soft fail (a missed mapping just means that one transition
  // doesn't surface in the team-wide feed).
  const logActivity = (t, type, cId, cName) => {
    // Wave 3 — local strip is now derived from sales/clients/proposals
    // in useSalesCRM. The strip recomputes on the next render after
    // the optimistic state mutation lands. RPC mirror to Hayley's
    // team-wide feed continues below.
    // Pipeline transitions are the events worth Hayley's attention.
    // Effort events (calls / emails) are intentionally NOT mirrored
    // here — they're already covered (calls via QuickLogButton, emails
    // via the email_log → activity_log trigger from migration 171).
    if (type !== "pipeline" && type !== "opp") return;
    let eventType = null;
    let eventCategory = "transition";
    if (t.startsWith("→ Closed"))           { eventType = "deal_closed";       eventCategory = "outcome";    }
    else if (t.startsWith("Lost:"))         { eventType = "deal_lost";         eventCategory = "outcome";    }
    else if (t.startsWith("→ "))            { eventType = "deal_advanced";                                     }
    else if (t.startsWith("New client:"))   { eventType = "client_created";                                    }
    else if (t.startsWith("New opportunity")) { eventType = "opportunity_created";                              }
    else if (t.startsWith("Repeat → "))     { eventType = "opportunity_created";                                }
    if (!eventType) return;
    supabase.rpc("log_activity", {
      p_event_type:     eventType,
      p_summary:        t,
      p_event_category: eventCategory,
      p_event_source:   "mydash",
      p_client_id:      cId || null,
      p_client_name:    cName || null,
      p_visibility:     "team",
    }).then(r => { if (r.error) console.warn("[salescrm logActivity rpc]", r.error.message); });
  };
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const dateColor = (d) => { if (!d) return Z.td; if (d < today) return Z.da; if (d === today) return Z.wa; if (d <= nextWeek) return Z.su; return Z.td; };
  const stageRevenue = (st) => sales.filter(s => s.status === st).reduce((sm, s) => sm + s.amount, 0);
  const navTo = (t, cId) => { setPrevTab(tab + (viewClientId ? `:${viewClientId}` : "")); setTab(t); setViewClientId(cId || null); };
  const goBack = () => { const [t, c] = (prevTab || "Pipeline").split(":"); setTab(t); setViewClientId(c || null); };
  const hasProposal = (saleId) => { const s = sales.find(x => x.id === saleId); return s?.proposalId || proposals.some(p => p.clientId === s?.clientId && (p.status === "Sent" || p.status === "Signed & Converted" || p.status === "Draft")); };
  const getClientProposal = (cid) => proposals.find(p => p.clientId === cid && (p.status === "Sent" || p.status === "Signed & Converted"));
  const actLabel = (s) => { const a = actInfo(s.nextAction); return a ? a.label : ""; };
  const actIcon = (s) => { const a = actInfo(s.nextAction); return a?.icon || "→"; };
  const actVerb = (s) => { const a = actInfo(s.nextAction); return a?.verb || "Act"; };

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
  // Pipeline-tab derived arrays + lookup maps — extracted to useSalesCRM
  // so this orchestrator stays focused on event handlers and JSX. Returns
  // deferred copies of the filter inputs for debounced filtering.
  const {
    clientMap, myClientIds,
    activeSales, todaysActions, closedSales, renewalsDue, activityLog,
    clientsByIdLocal, salesByStatusLocal,
    closedSearchDeferred, propSearchDeferred,
  } = useSalesCRM({
    clients, sales, proposals, currentUser,
    sr, closedSearch, propSearch,
    fPub, myPipeline,
    today,
  });

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
      await persist(() => updateClient(ec.id, { name: cf.name, industries: cf.industries, leadSource: cf.leadSource, interestedPubs: cf.interestedPubs, contacts: cf.contacts, notes: cf.notes, billingEmail, billingCcEmails: cleanCc, billingAddress, billingAddress2, billingCity, billingState, billingZip }));
    } else {
      // New client — default ownership to whoever is creating the record
      // (same philosophy as Convert to Lead). Admin can reassign from the
      // client profile later.
      const newClient = await persist(() => insertClient({ name: cf.name, status: "Lead", totalSpend: 0, industries: cf.industries, leadSource: cf.leadSource, interestedPubs: cf.interestedPubs, contacts: cf.contacts, notes: cf.notes, repId: currentUser?.id || null, billingEmail, billingCcEmails: cleanCc, billingAddress, billingAddress2, billingCity, billingState, billingZip }));
      if (newClient?.id) {
        logActivity(`New client: ${cf.name}`, "pipeline", newClient.id, cf.name);
        addNotif(`Client "${cf.name}" created`);
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
    persist(() => updateSale(saleId, {
      status: "Closed",
      issueId: finalIssueId,
      closedAt: new Date().toISOString(),
      nextAction: autoAct,
      nextActionDate: nextActDate,
    }));
    logActivity(`→ Closed`, "pipeline", s.clientId, cn(s.clientId));
    addNotif(`${cn(s.clientId)} → Closed`);
    persist(() => addComm(s.clientId, { id: "cm" + Date.now(), type: "Comment", author: currentUser?.name || "Account Manager", date: today, note: `→ Closed` }));
    if (bus) bus.emit("sale.closed", { saleId, clientId: s.clientId, clientName: cn(s.clientId), amount: s.amount, publication: pn(s.publication) });
    const client = clients.find(c => c.id === s.clientId);
    if (client) {
      const updates = {};
      if (client.status === "Lead") updates.status = "Active";
      if (!client.repId && currentUser?.id) updates.repId = currentUser.id;
      if (Object.keys(updates).length && updateClient) persist(() => updateClient(client.id, updates));
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
    persist(() => updateSale(saleId, { status: ns, nextAction: autoAct, nextActionDate: autoAct ? nextDue.toISOString().slice(0, 10) : null }));
    if (s) {
      logActivity(`→ ${ns}`, "pipeline", s.clientId, cn(s.clientId));
      addNotif(`${cn(s.clientId)} → ${ns}`);
      persist(() => addComm(s.clientId, { id: "cm" + Date.now(), type: "Comment", author: currentUser?.name || "Account Manager", date: today, note: `→ ${ns}` }));
    }
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
    persist(() => updateSale(saleId, { nextAction: null, nextActionDate: null }));
    if (s) {
      persist(() => addComm(s.clientId, { id: "cm" + Date.now(), type: "Comment", author: currentUser?.name || "Account Manager", date: today, note: `Done: ${note}` }));
      logActivity(`Done: ${note}`, "comm", s.clientId, cn(s.clientId));
    }
    if (s) { setEditOppId(saleId); const cl = clients.find(c => c.id === s.clientId); setOpp({ company: cl?.name || "", contact: cl?.contacts?.[0]?.name || "", email: cl?.contacts?.[0]?.email || "", phone: cl?.contacts?.[0]?.phone || "", source: "Existing Client", notes: "", nextAction: "", nextActionDate: "" }); setOppSendKit(false); setOppKitSent(false); setOppMo(true); }
  };
  const saveNextStep = () => {
    if (nextStepSaleId && nextStepAction) {
      const nd = new Date(today); nd.setDate(nd.getDate() + 3);
      persist(() => updateSale(nextStepSaleId, { nextAction: nextStepAction, nextActionDate: nd.toISOString().slice(0, 10) }));
    }
    setNextStepMo(false); setNextStepSaleId(null);
  };
  const clearAction = () => {
    if (nextStepSaleId) persist(() => updateSale(nextStepSaleId, { nextAction: null, nextActionDate: null }));
    setNextStepMo(false); setNextStepSaleId(null);
  };
  // Wave 3 Task 3.3 — actually send via Gmail. Pre-Wave-3 this only
  // logged a comm locally, which mismatched the elaborate compose UI
  // (rep typed a long message and nothing left their machine). Now:
  //   1. POST through sendGmailEmail (mode="send")
  //   2. needs_auth → prompt the rep to connect Gmail, abort send
  //   3. other failures → surface via dialog.alert, don't close modal
  //   4. success → log comm + activity + complete the action with a
  //      5-day "follow up on email" next-action so the deal doesn't
  //      go stale waiting on a reply
  const sendEmail = async () => {
    if (!emailSaleId) return;
    const s = sales.find(x => x.id === emailSaleId);
    // Plaintext body → minimal HTML wrapping. White-space preserved
    // so multi-paragraph drafts read correctly in Gmail.
    const htmlBody = `<div style="font-family:-apple-system,sans-serif;white-space:pre-wrap;line-height:1.5">${(emailBody || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    }</div>`;

    const result = await sendGmailEmail({
      teamMemberId: currentUser?.id || null,
      to: [emailTo],
      subject: emailSubj,
      htmlBody,
      mode: "send",
      emailType: "rep_email",
      clientId: s?.clientId || null,
      refId: s?.id || null,
      refType: "sale",
    });

    if (result?.needs_auth) {
      const ok = await dialog.confirm("Gmail isn't connected for your account. Connect now?");
      if (ok) await initiateGmailAuth(currentUser?.id || null);
      return;
    }
    if (result?.error || result?.success === false) {
      await dialog.alert(`Email failed: ${result?.error || "Unknown error"}`);
      return;
    }

    if (s) {
      persist(() => addComm(s.clientId, {
        id: "cm" + Date.now(), type: "Email",
        author: currentUser?.name || "Account Manager",
        date: today,
        note: `To: ${emailTo}\nSubject: ${emailSubj}\n${(emailBody || "").slice(0, 200)}${(emailBody || "").length > 200 ? "…" : ""}`,
      }));
      logActivity(`Email sent: ${emailSubj}`, "comm", s.clientId, cn(s.clientId));
      // 5-day follow-up so the deal surfaces back into actions if the
      // recipient hasn't replied. Mirrors the Outreach module's cadence.
      const nd = new Date(); nd.setDate(nd.getDate() + 5);
      persist(() => updateSale(s.id, {
        nextAction: { type: "follow_up", label: "Follow up on email" },
        nextActionDate: nd.toISOString().slice(0, 10),
      }));
    }
    setEmailMo(false);
    addNotif(`Email sent — ${cn(s?.clientId)}`);
  };

  const cloneSale = async (s) => {
    const ni = issues.find(i => i.pubId === s.publication && i.date > s.date);
    if (!ni) return;
    await persist(() => insertSale({
      clientId: s.clientId, publication: s.publication, issueId: ni.id,
      type: s.type, size: s.size, adW: s.adW, adH: s.adH, amount: s.amount,
      status: "Discovery", date: ni.date, page: null, pagePos: null,
      proposalId: null, nextAction: STAGE_AUTO_ACTIONS.Discovery,
      nextActionDate: today, oppNotes: [],
    }));
    logActivity(`Repeat → ${pn(s.publication)}`, "opp", s.clientId, cn(s.clientId));
  };

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

  // SaleCard dispatcher (Wave 2). One stable callback the memo'd card can
  // bind once; the switch maps action kind → existing handler. Keeps the
  // card render cheap (no new fn identities per render) while letting the
  // parent own all the side-effect logic.
  const onCardAction = useCallback((kind, s, extra) => {
    switch (kind) {
      case "dragStart":
        setDragSaleId(s.id);
        break;
      case "click":
        handleCardClick(s);
        break;
      case "client":
        navTo("Clients", s.clientId);
        break;
      case "action":
        handleAct(s.id);
        break;
      case "proof":
        onNavigate?.("adprojects");
        break;
      case "logCall": {
        (async () => {
          const note = await dialog.prompt(`Log call — ${cn(s.clientId)}`, "Connected");
          if (note === null) return;
          const txt = note.trim() || "Connected";
          logActivity(`Called ${cn(s.clientId)}: ${txt}`, "comm", s.clientId, cn(s.clientId));
          const nd = new Date(); nd.setDate(nd.getDate() + 3);
          const ndStr = nd.toISOString().slice(0, 10);
          persist(() => updateSale(s.id, {
            nextAction: { type: "call", label: "Follow up call" },
            nextActionDate: ndStr,
            oppNotes: [...(s.oppNotes || []), { id: "n" + Date.now(), text: `Call: ${txt}`, date: today }],
          }));
          persist(() => addComm(s.clientId, {
            id: "cm" + Date.now(), type: "Call",
            author: currentUser?.name || "Account Manager",
            date: today, note: txt,
          }));
          addNotif(`Call logged — ${cn(s.clientId)}`);
        })();
        break;
      }
      case "logEmail": {
        (async () => {
          const note = await dialog.prompt(`Log email — ${cn(s.clientId)}`, "Sent follow-up");
          if (note === null) return;
          const txt = note.trim() || "Sent email";
          logActivity(`Emailed ${cn(s.clientId)}: ${txt}`, "comm", s.clientId, cn(s.clientId));
          const nd = new Date(); nd.setDate(nd.getDate() + 5);
          const ndStr = nd.toISOString().slice(0, 10);
          persist(() => updateSale(s.id, {
            nextAction: { type: "email", label: "Follow up email" },
            nextActionDate: ndStr,
            oppNotes: [...(s.oppNotes || []), { id: "n" + Date.now(), text: `Email: ${txt}`, date: today }],
          }));
          persist(() => addComm(s.clientId, {
            id: "cm" + Date.now(), type: "Email",
            author: currentUser?.name || "Account Manager",
            date: today, note: txt,
          }));
          addNotif(`Email logged — ${cn(s.clientId)}`);
        })();
        break;
      }
      case "snooze": {
        const nd = new Date(); nd.setDate(nd.getDate() + 7);
        const ndStr = nd.toISOString().slice(0, 10);
        persist(() => updateSale(s.id, { nextActionDate: ndStr }));
        addNotif(`Snoozed 7d — ${cn(s.clientId)}`);
        break;
      }
      case "moveStage":
        moveToStage(s.id, extra);
        break;
      case "markLost": {
        (async () => {
          const REASONS = ["Budget cut", "Chose competitor", "Timing not right", "No response", "Bad fit", "Price too high", "Other"];
          const reason = await dialog.prompt("Why was this deal lost?", { options: REASONS });
          if (!reason) return;
          await updateSale(s.id, { status: "Lost", lost_reason: reason, nextAction: null, nextActionDate: null });
          logActivity(`Lost: ${reason}`, "pipeline", s.clientId, cn(s.clientId));
          addNotif(`Deal lost — ${cn(s.clientId)}: ${reason}`);
        })();
        break;
      }
      case "clone":
        cloneSale(s);
        break;
      case "adProject":
        onNavigate?.("adprojects");
        break;
      default:
        // Unknown kind — likely a bug. Surface in dev only.
        if (import.meta.env.DEV) console.warn("[onCardAction] unknown kind:", kind);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, sales, currentUser, today, dialog, persist, updateSale, addComm, navTo, onNavigate, moveToStage]);
  // Returns the resolved client id (existing or newly inserted), or null
  // if validation failed. Callers downstream (sendKit, oppToProposal)
  // need that id to chain follow-up writes.
  const saveOpp = async (close = true) => {
    if (!opp.company.trim()) return null;
    let cid = clients.find(c => (c.name || "").toLowerCase() === opp.company.toLowerCase())?.id;
    if (!cid) {
      const created = await persist(() => insertClient({
        name: opp.company, status: "Lead", totalSpend: 0,
        contacts: [{ name: opp.contact, email: opp.email, phone: opp.phone, role: "Business Owner" }],
        repId: currentUser?.id || null,
      }));
      cid = created?.id;
      if (!cid) return null;
    }
    if (opp.notes.trim()) {
      await persist(() => addComm(cid, {
        id: "cm" + Date.now(), type: "Comment",
        author: currentUser?.name || "Account Manager",
        date: today, note: opp.notes,
      }));
    }
    if (editOppId) {
      const existing = sales.find(s => s.id === editOppId);
      const noteArr = [
        ...(existing?.oppNotes || []),
        ...(opp.notes.trim() ? [{ id: "on" + Date.now(), text: opp.notes, time: new Date().toLocaleTimeString(), date: today }] : []),
      ];
      const nextAction = typeof existing?.nextAction === "object"
        ? existing.nextAction
        : { type: "task", label: opp.nextAction };
      await persist(() => updateSale(editOppId, {
        nextAction,
        nextActionDate: opp.nextActionDate || null,
        oppNotes: noteArr,
      }));
    } else {
      await persist(() => insertSale({
        clientId: cid, publication: pubs[0]?.id || "", issueId: "",
        type: "TBD", size: "", adW: 0, adH: 0, amount: 0,
        status: "Discovery", date: today,
        nextAction: STAGE_AUTO_ACTIONS.Discovery,
        nextActionDate: opp.nextActionDate || tomorrow,
        proposalId: null,
        oppNotes: opp.notes.trim()
          ? [{ id: "on" + Date.now(), text: opp.notes, time: new Date().toLocaleTimeString(), date: today }]
          : [],
      }));
      logActivity(`New opportunity via ${opp.source}`, "opp", cid, opp.company);
    }
    if (close && !oppSendKit) { setOppMo(false); setOpp(x => ({ ...x, notes: "" })); }
    return cid;
  };
  const sendKit = async () => {
    const cid = await saveOpp(false);
    setOppKitSent(true);
    if (!cid) return;
    logActivity(`Rate cards sent`, "comm", cid, opp.company);
    await persist(() => addComm(cid, {
      id: "cm" + Date.now(), type: "Email",
      author: currentUser?.name || "Account Manager",
      date: today,
      note: `Sent rate cards: ${oppKitPubs.map(pid => pn(pid)).join(", ")}`,
    }));
    const targets = sales.filter(s => s.clientId === cid && s.status === "Discovery");
    for (const s of targets) {
      await persist(() => updateSale(s.id, {
        status: "Presentation",
        nextAction: STAGE_AUTO_ACTIONS.Presentation,
        nextActionDate: opp.nextActionDate || null,
      }));
    }
  };
  const oppToProposal = async () => {
    const created = await saveOpp(false);
    const cid = created || (editOppId && sales.find(s => s.id === editOppId)?.clientId);
    if (cid) {
      const targets = sales.filter(s => s.clientId === cid && (s.status === "Discovery" || s.status === "Presentation"));
      for (const s of targets) {
        await persist(() => updateSale(s.id, { status: "Proposal" }));
      }
    }
    setOppMo(false);
    openProposal(cid);
  };

  // ─── Proposal wizard entry points ────────────────────────
  // proposal-wizard-spec.md §4 — wizardState replaces ~20 prop* useState
  // calls. The wizard owns its own state via useProposalWizard; SalesCRM
  // only owns these three setter wrappers + the closeWizard handler.
  const openProposal = (clientId) => {
    // No default client when launched from the CRM-wide "New Proposal"
    // button — rep should explicitly pick one. Only seed clientId when
    // openProposal is called from a specific client/sale context.
    setWizardState({
      mode: "new",
      clientId: clientId || "",
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
      const s = sales.find(s2 => s2.id === wizardState.pendingSaleId);
      persist(() => updateSale(wizardState.pendingSaleId, { status: "Presentation" }));
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

  return <SalesErrorBoundary><div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {/* Action row — title moved to TopBar via usePageHeader above. Keep
        only the tab-aware controls (search, filters, + buttons) here.
        SaveStatusPill at the front announces every persisted write —
        critical now that pipeline drags / call logs / opp creates round-trip
        the DB instead of mutating local state. */}
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      <SaveStatusPill save={save} />
      {(tab === "Pipeline" || (tab === "Clients" && !viewClientId && clientView === "list")) && <><SB value={sr} onChange={setSr} placeholder="Search..." /><Sel value={fPub} onChange={e => setFPub(e.target.value)} options={[{ value: "all", label: "All Pubs" }, ...pubs.map(p => ({ value: p.id, label: p.name }))]} /></>}
      {tab === "Clients" && !viewClientId && <Btn sm onClick={() => { setEc(null); setCf({ name: "", industries: [], leadSource: "", interestedPubs: [], contacts: [{ name: "", email: "", phone: "", role: "Business Owner" }], notes: "", billingEmail: "", billingCcEmails: ["", ""], billingAddress: "", billingAddress2: "", billingCity: "", billingState: "", billingZip: "" }); setCmo(true); }}><Ic.plus size={13} /> Client</Btn>}
      {tab === "Pipeline" && <Btn sm onClick={openOpp}><Ic.plus size={13} /> New Opportunity</Btn>}
      {tab === "Proposals" && (() => {
        const awaitingCount = proposals.filter(p => p.status === "Awaiting Review").length;
        const awaitingLabel = awaitingCount > 0 ? `Awaiting Review (${awaitingCount})` : "Awaiting Review";
        return <><SB value={propSearch} onChange={setPropSearch} placeholder="Search..." /><Sel value={propStatus} onChange={e => setPropStatus(e.target.value)} options={[{ value: "all", label: "All Statuses" }, { value: "Awaiting Review", label: awaitingLabel }, { value: "Draft", label: "Draft" }, { value: "Sent", label: "Sent" }, { value: "Signed & Converted", label: "Signed & Converted" }, { value: "Declined", label: "Declined" }, { value: "Cancelled", label: "Cancelled" }]} /><Btn sm onClick={() => openProposal()}><Ic.plus size={13} /> Proposal</Btn></>;
      })()}
      {tab === "Closed" && <>
        <SB value={closedSearch} onChange={setClosedSearch} placeholder="Search..." />
        <Sel value={fPub} onChange={e => setFPub(e.target.value)} options={[{ value: "all", label: "All Publications" }, ...pubs.map(p => ({ value: p.id, label: p.name }))]} />
        <Sel value={closedRep} onChange={e => setClosedRep(e.target.value)} options={[{ value: "all", label: "All Salespeople" }, ...(props.team || []).filter(t => t.permissions?.includes("sales") || t.permissions?.includes("admin")).map(t => ({ value: t.id, label: t.name }))]} />
        <Btn sm v={showCancelled ? "primary" : "ghost"} onClick={() => setShowCancelled(s => !s)}>{showCancelled ? "Showing Cancelled" : "Show Cancelled"}</Btn>
        {(closedSearch || fPub !== "all" || closedRep !== "all" || showCancelled || lostReasonFilter) && (
          <Btn sm v="ghost" onClick={() => { setClosedSearch(""); setFPub("all"); setClosedRep("all"); setShowCancelled(false); setLostReasonFilter(null); }} title="Clear all Closed-tab filters"><Ic.x size={11} /> Clear filters</Btn>
        )}
      </>}
    </div>

    <TabRow><TB tabs={["Pipeline", "Inquiries", "Clients", "Proposals", "Closed", "Renewals", "Outreach", "Commissions"]} active={tab} onChange={t => { if (t === "Inquiries" && loadInquiries && !inquiriesLoaded) loadInquiries(); navTo(t); }} />{tab === "Pipeline" && !jurisdiction?.isSalesperson && <><TabPipe /><TB tabs={["All", "By Rep"]} active={myPipeline ? "By Rep" : "All"} onChange={v => setMyPipeline(v === "By Rep")} /></>}{tab === "Clients" && !viewClientId && <><TabPipe /><TB tabs={["Signals", "All Clients"]} active={clientView === "signals" ? "Signals" : "All Clients"} onChange={v => setClientView(v === "Signals" ? "signals" : "list")} /></>}</TabRow>

    {/* PIPELINE */}
    {tab === "Pipeline" && (
      <PipelineTab
        activeSales={activeSales}
        sales={sales}
        contracts={contracts}
        clients={clients}
        issues={issues}
        pubs={pubs}
        salespersonPubAssignments={salespersonPubAssignments}
        dropdownPubs={dropdownPubs}
        adInquiries={adInquiries}
        recentPublishedIssueIds={recentPublishedIssueIds}
        todaysActions={todaysActions}
        activityLog={activityLog}
        proofReadyMap={proofReadyMap}
        dragSaleId={dragSaleId}
        setDragSaleId={setDragSaleId}
        clientsById={clientsByIdLocal}
        today={today}
        dateColor={dateColor}
        actIcon={actIcon}
        actVerb={actVerb}
        onCardAction={onCardAction}
        openOpp={openOpp}
        moveToStage={moveToStage}
        handleAct={handleAct}
        navTo={navTo}
        setTab={setTab}
        onNavigate={onNavigate}
        loadInquiries={loadInquiries}
        inquiriesLoaded={inquiriesLoaded}
      />
    )}

    {/* CLIENTS + PROFILE */}
    {tab === "Clients" && (
      <ClientsTab
        viewClientId={viewClientId}
        clientView={clientView}
        jurisdiction={jurisdiction}
        clients={clients}
        sales={sales}
        pubs={pubs}
        issues={issues}
        proposals={proposals}
        contracts={contracts}
        invoices={invoices}
        payments={payments}
        currentUser={currentUser}
        myPriorities={myPriorities}
        priorityHelpers={priorityHelpers}
        navTo={navTo}
        sr={sr}
        setSr={setSr}
        fPub={fPub}
        setClients={setClients}
        setSales={setSales}
        team={props.team}
        commForm={commForm}
        setCommForm={setCommForm}
        goBack={goBack}
        openProposal={openProposal}
        setViewPropId={setViewPropId}
        bus={bus}
        updateClientContact={props.updateClientContact}
        onNavigate={props.onNavigate}
        openEditClient={(vc) => { setEc(vc); setCf({ name: vc.name, industries: vc.industries || [], leadSource: vc.leadSource || "", interestedPubs: vc.interestedPubs || [], contacts: vc.contacts || [], notes: vc.notes || "", billingEmail: vc.billingEmail || "", billingCcEmails: [...(vc.billingCcEmails || []), "", ""].slice(0, 2), billingAddress: vc.billingAddress || "", billingAddress2: vc.billingAddress2 || "", billingCity: vc.billingCity || "", billingState: vc.billingState || "", billingZip: vc.billingZip || "" }); setCmo(true); }}
        openEmail={(client) => {
          setEmailSaleId(null);
          setEmailTo(client?.contacts?.[0]?.email || "");
          setEmailSubj(`Following up — ${client?.name || ""}`);
          setEmailBody(`Hi ${client?.contacts?.[0]?.name || ""},\n\nI wanted to follow up on our conversation about advertising with 13 Stars Media.\n\nBest,\n${COMPANY.sales.name}\n${COMPANY.sales.phone}`);
          setEmailMo(true);
        }}
        openMeeting={(client) => {
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
      />
    )}

    {/* PROPOSALS */}
    {tab === "Proposals" && !viewPropId && (
      <ProposalsTab
        proposals={proposals}
        propStatus={propStatus}
        propSearch={propSearchDeferred}
        clientsById={clientsByIdLocal}
        setViewPropId={setViewPropId}
        openProposal={openProposal}
      />
    )}
    {tab === "Proposals" && viewPropId && (
      <ProposalDetail
        proposal={proposals.find(x => x.id === viewPropId)}
        clients={clients}
        clientsById={clientsByIdLocal}
        pubs={pubs}
        team={props.team}
        currentUser={currentUser}
        dialog={dialog}
        updateProposal={updateProposal}
        insertProposal={insertProposal}
        signProposal={signProposal}
        editProposal={editProposal}
        setViewPropId={setViewPropId}
      />
    )}

    {/* CLOSED — RECENT WINS (quick view, deep research on Contracts page) */}
    {tab === "Closed" && (
      <ClosedTab
        contracts={contracts}
        contractsLoaded={contractsLoaded}
        loadContracts={loadContracts}
        sales={sales}
        closedSales={closedSales}
        invoices={invoices}
        issues={issues}
        pubs={pubs}
        clientsById={clientsByIdLocal}
        team={props.team}
        setContracts={setContracts}
        setSales={setSales}
        setViewContractId={setViewContractId}
        viewContractId={viewContractId}
        fPub={fPub}
        closedRep={closedRep}
        closedSearch={closedSearchDeferred}
        closedSort={closedSort}
        setClosedSort={setClosedSort}
        showCancelled={showCancelled}
        lostReasonFilter={lostReasonFilter}
        setLostReasonFilter={setLostReasonFilter}
        dialog={dialog}
      />
    )}
    {tab === "Renewals" && (
      <RenewalsTab
        renewalsDue={renewalsDue}
        sales={sales}
        pubs={pubs}
        team={props.team}
        clientsById={clientsByIdLocal}
        navTo={navTo}
        openRenewalProposal={openRenewalProposal}
      />
    )}

    {/* COMMISSIONS */}
    {tab === "Commissions" && <Suspense fallback={<SubFallback />}><Commissions sales={sales} clients={clients} pubs={pubs} issues={issues} team={props.team || []} commissionRates={commissionRates || []} commissionLedger={commissionLedger || []} commissionPayouts={commissionPayouts || []} commissionGoals={commissionGoals || []} salespersonPubAssignments={salespersonPubAssignments || []} helpers={commissionHelpers || {}} tab={commTab} setTab={setCommTab} /></Suspense>}
    {tab === "Outreach" && <Suspense fallback={<SubFallback />}><Outreach sales={sales} clients={clients} pubs={pubs} issues={issues} team={props.team || []} campaigns={outreachCampaigns || []} entries={outreachEntries || []} helpers={outreachHelpers || {}} navTo={navTo} currentUser={currentUser} /></Suspense>}

    {/* INQUIRIES */}
    {tab === "Inquiries" && (
      <InquiriesTab
        adInquiries={adInquiries}
        inquiriesLoaded={inquiriesLoaded}
        clients={clients}
        team={props.team}
        adProductMap={adProductMap}
        currentUser={currentUser}
        updateInquiry={updateInquiry}
        insertClient={insertClient}
        insertSale={insertSale}
        setTab={setTab}
        navTo={navTo}
        openEmailModal={({ to, subject, body, saleId = null }) => {
          setEmailSaleId(saleId);
          setEmailTo(to);
          setEmailSubj(subject);
          setEmailBody(body);
          setEmailMo(true);
        }}
      />
    )}

    <CloseIssueModal
      closeIssueModal={closeIssueModal}
      setCloseIssueModal={setCloseIssueModal}
      closeIssueChoice={closeIssueChoice}
      setCloseIssueChoice={setCloseIssueChoice}
      sales={sales}
      issues={issues}
      today={today}
      clientsById={clientsByIdLocal}
      pubs={pubs}
      team={props.team}
      finalizeClose={finalizeClose}
    />

    <ClientFormModal
      open={cmo}
      onClose={() => setCmo(false)}
      ec={ec}
      cf={cf}
      setCf={setCf}
      pubs={pubs}
      industries={industries}
      saveC={saveC}
    />

    <OpportunityModal
      open={oppMo}
      onClose={() => setOppMo(false)}
      opp={opp}
      setOpp={setOpp}
      oppSendKit={oppSendKit}
      setOppSendKit={setOppSendKit}
      oppKitSent={oppKitSent}
      oppKitPubs={oppKitPubs}
      setOppKitPubs={setOppKitPubs}
      oppKitMsg={oppKitMsg}
      setOppKitMsg={setOppKitMsg}
      editOppId={editOppId}
      sales={sales}
      clients={clients}
      dropdownPubs={dropdownPubs}
      saveOpp={saveOpp}
      sendKit={sendKit}
      oppToProposal={oppToProposal}
    />

    <EmailComposeModal
      open={emailMo}
      onClose={() => setEmailMo(false)}
      emailTo={emailTo}
      setEmailTo={setEmailTo}
      emailSubj={emailSubj}
      setEmailSubj={setEmailSubj}
      emailBody={emailBody}
      setEmailBody={setEmailBody}
      sendEmail={sendEmail}
    />

    <CalendarSchedulerModal
      open={calMo}
      onClose={() => setCalMo(false)}
      schEvent={schEvent}
      setSchEvent={setSchEvent}
      calSaleId={calSaleId}
      sales={sales}
      persist={persist}
      addComm={addComm}
      today={today}
      currentUser={currentUser}
      completeAction={completeAction}
    />

    <NextStepModal
      open={nextStepMo}
      onClose={() => clearAction()}
      nextStepAction={nextStepAction}
      setNextStepAction={setNextStepAction}
      saveNextStep={saveNextStep}
      clearAction={clearAction}
    />

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
        loadClientDetails={props.loadClientDetails}
        onClose={closeWizard}
        onSent={async (propId) => {
          const targets = sales.filter(s =>
            s.clientId === wizardState.clientId &&
            (s.status === "Discovery" || s.status === "Presentation")
          );
          for (const s of targets) {
            await persist(() => updateSale(s.id, {
              status: "Proposal",
              nextAction: STAGE_AUTO_ACTIONS.Proposal,
            }));
          }
          if (wizardState.pendingSaleId) {
            await persist(() => updateSale(wizardState.pendingSaleId, {
              proposalId: propId,
              status: "Proposal",
            }));
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


  </div></SalesErrorBoundary>;
};

export default memo(SalesCRM);
