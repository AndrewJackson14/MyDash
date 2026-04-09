import { useState, useRef, useMemo, useEffect, memo } from "react";
import { Z, SC, COND, DISPLAY, FS, FW, Ri, CARD, R, INV } from "../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Card, SB, TB, Stat, Modal, Bar, FilterBar, SortHeader, BackBtn, ThemeToggle, GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, ListCard, ListDivider, ListGrid, glass, Pill } from "../components/ui";
import { COMPANY, CONTACT_ROLES, COMM_TYPES, COMM_AUTHORS, STORY_AUTHORS } from "../constants";
import { sendGmailEmail, initiateGmailAuth, buildProposalEmailHtml } from "../lib/gmail";
import { supabase } from "../lib/supabase";
import ClientList from "./sales/ClientList";
import ClientProfile from "./sales/ClientProfile";
import ClientSignals from "./sales/ClientSignals";
import Commissions from "./sales/Commissions";
import Outreach from "./sales/Outreach";
import { PIPELINE, PIPELINE_COLORS, STAGE_AUTO_ACTIONS, ACTION_TYPES, actInfo, INDUSTRIES, LEAD_SOURCES, computeClientStatus, CLIENT_STATUS_COLORS, getAutoTier, getAutoTermLabel } from "./sales/constants";

// Constants imported from ./sales/constants

const SalesCRM = (props) => {
  const { clients, setClients, sales, setSales, pubs, issues, proposals, setProposals, notifications, setNotifications, bus, contracts, insertClient, updateClient, insertProposal, updateProposal, convertProposal, commissionLedger, commissionPayouts, commissionGoals, commissionRates, salespersonPubAssignments, commissionHelpers, outreachCampaigns, outreachEntries, outreachHelpers, jurisdiction, myPriorities, priorityHelpers, adInquiries, loadInquiries, inquiriesLoaded, updateInquiry, onNavigate } = props;
  // Publications for dropdowns: filtered by jurisdiction for salespeople, all for admins
  const dropdownPubs = jurisdiction?.myPubs || pubs;
  const [tab, setTab] = useState("Pipeline");
  const [prevTab, setPrevTab] = useState("Pipeline");
  const [commTab, setCommTab] = useState("Overview");
  const [clientView, setClientView] = useState(jurisdiction?.isSalesperson ? "signals" : "list");
  const [sr, setSr] = useState("");
  const [fClientPub, setFClientPub] = useState("all");
  const [fPub, setFPub] = useState("all");
  const [myPipeline, setMyPipeline] = useState(true); // default: show only my deals
  const [cmo, setCmo] = useState(false);
  const [propMo, setPropMo] = useState(false);
  const [propPending, setPropPending] = useState(null);
  const [oppMo, setOppMo] = useState(false);
  const [oppSendKit, setOppSendKit] = useState(false);
  const [oppKitPubs, setOppKitPubs] = useState([]);
  const [oppKitMsg, setOppKitMsg] = useState("");
  const [oppKitSent, setOppKitSent] = useState(false);
  const [ec, setEc] = useState(null);
  const [cf, setCf] = useState({ name: "", industries: [], leadSource: "", interestedPubs: [], contacts: [{ name: "", email: "", phone: "", role: "Business Owner" }], notes: "" });
  const [viewClientId, setViewClientId] = useState(null);
  const [commForm, setCommForm] = useState({ type: "Comment", author: "Account Manager", note: "" });
  const [profFYear, setProfFYear] = useState("all");
  const [profFPub, setProfFPub] = useState("all");
  const [pipeView, setPipeView] = useState("actions");
  const [dragSaleId, setDragSaleId] = useState(null);
  const [editOppId, setEditOppId] = useState(null);
  const [opp, setOpp] = useState({ company: "", contact: "", email: "", phone: "", source: "Referral", notes: "", nextAction: "Send media kit", nextActionDate: "" });
  const OPP_SOURCES = ["Referral", "Cold Call", "Walk-in", "Event", "Website Inquiry", "Social Media", "Existing Client"];
  const [propClient, setPropClient] = useState("");
  const [propPayPlan, setPropPayPlan] = useState(false);
  const [propStep, setPropStep] = useState("build");
  const [propName, setPropName] = useState("");
  const [editPropId, setEditPropId] = useState(null);
  const [propPubs, setPropPubs] = useState([]);
  const [propAddPubId, setPropAddPubId] = useState("");
  const [propExpandedPub, setPropExpandedPub] = useState(null);
  const [propEmailRecipients, setPropEmailRecipients] = useState([]);
  const [propEmailMsg, setPropEmailMsg] = useState("");
  const [propSending, setPropSending] = useState(false);
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
  const [closedRange, setClosedRange] = useState("30days");
  const [renewalCelebrated, setRenewalCelebrated] = useState(null);
  const [actExpanded, setActExpanded] = useState(null);

  // Deep-link handling from notifications
  useEffect(() => {
    if (props.deepLink?.tab === "inquiries") {
      setTab("Inquiries");
      if (loadInquiries && !inquiriesLoaded) loadInquiries();
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
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const addNotif = (t) => { if (setNotifications) setNotifications(n => [...n, { id: "n" + Date.now(), text: t, time: new Date().toLocaleTimeString(), read: false }]); };
  const logActivity = (t, type, cId, cName) => setActivityLog(a => [{ id: "al" + Date.now(), text: t, time: new Date().toLocaleTimeString(), type, clientId: cId, clientName: cName }, ...a].slice(0, 50));
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const dateColor = (d) => { if (!d) return Z.td; if (d < today) return Z.da; if (d === today) return Z.wa; if (d <= nextWeek) return Z.su; return Z.td; };
  const stageRevenue = (st) => sales.filter(s => s.status === st).reduce((sm, s) => sm + s.amount, 0);
  const navTo = (t, cId) => { setPrevTab(tab + (viewClientId ? `:${viewClientId}` : "")); setTab(t); setViewClientId(cId || null); };
  const goBack = () => { const [t, c] = (prevTab || "Pipeline").split(":"); setTab(t); setViewClientId(c || null); };
  const propPubNames = (p) => [...new Set(p.lines.map(l => l.pubName))].join(", ");
  const hasProposal = (saleId) => { const s = sales.find(x => x.id === saleId); return s?.proposalId || proposals.some(p => p.clientId === s?.clientId && (p.status === "Sent" || p.status === "Approved/Signed" || p.status === "Draft")); };
  const getClientProposal = (cid) => proposals.find(p => p.clientId === cid && (p.status === "Sent" || p.status === "Approved/Signed"));
  const actLabel = (s) => { const a = actInfo(s.nextAction); return a ? a.label : ""; };
  const actIcon = (s) => { const a = actInfo(s.nextAction); return a?.icon || "→"; };
  const actVerb = (s) => { const a = actInfo(s.nextAction); return a?.verb || "Act"; };

  const currentUser = props.currentUser;
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
    if (ec) {
      // Edit existing client
      if (updateClient) {
        await updateClient(ec.id, { name: cf.name, industries: cf.industries, leadSource: cf.leadSource, interestedPubs: cf.interestedPubs, contacts: cf.contacts, notes: cf.notes });
      } else {
        setClients(cl => cl.map(c => c.id === ec.id ? { ...c, name: cf.name, industries: cf.industries, leadSource: cf.leadSource, interestedPubs: cf.interestedPubs, contacts: cf.contacts, notes: cf.notes } : c));
      }
    } else {
      // Create new client — persists to Supabase with real UUID
      if (insertClient) {
        const newClient = await insertClient({ name: cf.name, status: "Lead", totalSpend: 0, industries: cf.industries, leadSource: cf.leadSource, interestedPubs: cf.interestedPubs, contacts: cf.contacts, notes: cf.notes });
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

  const moveToStage = (saleId, ns) => {
    const s = sales.find(x => x.id === saleId);
    if (["Proposal", "Negotiation", "Closed", "Follow-up"].includes(ns) && !hasProposal(saleId)) {
      setPropPending(saleId); openProposal(s?.clientId); return;
    }
    if (ns === "Negotiation") {
      const sentProp = proposals.find(p => p.clientId === s?.clientId && (p.status === "Sent" || p.status === "Approved/Signed"));
      if (!sentProp) {
        const draftProp = proposals.find(p => p.clientId === s?.clientId && p.status === "Draft");
        if (draftProp) { editProposal(draftProp.id); } else { openProposal(s?.clientId); }
        return;
      }
    }
    const autoAct = STAGE_AUTO_ACTIONS[ns] || null;
    const nextDue = new Date(today); nextDue.setDate(nextDue.getDate() + 3);
    setSales(sl => sl.map(x => x.id === saleId ? { ...x, status: ns, nextAction: autoAct, nextActionDate: autoAct ? nextDue.toISOString().slice(0, 10) : "" } : x));
    if (s) { logActivity(`→ ${ns}`, "pipeline", s.clientId, cn(s.clientId)); addNotif(`${cn(s.clientId)} → ${ns}`); setClients(cl => cl.map(c => c.id === s.clientId ? { ...c, comms: [...(c.comms || []), { id: "cm" + Date.now(), type: "Comment", author: "Account Manager", date: today, note: `→ ${ns}` }] } : c)); }
    if (ns === "Closed" && s && bus) bus.emit("sale.closed", { saleId, clientId: s.clientId, clientName: cn(s.clientId), amount: s.amount, publication: pn(s.publication) });
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
      const sent = proposals.find(p => p.clientId === s.clientId && (p.status === "Sent" || p.status === "Approved/Signed"));
      if (sent) { setViewPropId(sent.id); navTo("Proposals"); }
      else if (draft) { editProposal(draft.id); }
      else openProposal(s.clientId);
    }
    else { navTo("Clients", s.clientId); }
  };

  const openOpp = () => { setEditOppId(null); setOpp({ company: "", contact: "", email: "", phone: "", source: "Referral", notes: "", nextAction: "Send media kit", nextActionDate: tomorrow }); setOppSendKit(false); setOppKitPubs([]); setOppKitMsg(""); setOppKitSent(false); setOppMo(true); setTimeout(() => { const el = document.querySelector("[data-opp-company]"); if (el) el.focus(); }, 100); };
  const saveOpp = (close = true) => {
    if (!opp.company.trim()) return; let cid = clients.find(c => c.name.toLowerCase() === opp.company.toLowerCase())?.id; if (!cid) { cid = "c" + Date.now(); setClients(cl => [...cl, { id: cid, name: opp.company, status: "Lead", totalSpend: 0, contacts: [{ name: opp.contact, email: opp.email, phone: opp.phone, role: "Business Owner" }], comms: [] }]); } if (opp.notes.trim()) setClients(cl => cl.map(c => c.id === cid ? { ...c, comms: [...(c.comms || []), { id: "cm" + Date.now(), type: "Comment", author: "Account Manager", date: today, note: opp.notes }] } : c)); if (editOppId) { setSales(sl => sl.map(s => s.id === editOppId ? { ...s, nextAction: typeof s.nextAction === "object" ? s.nextAction : { type: "task", label: opp.nextAction }, nextActionDate: opp.nextActionDate, oppNotes: [...(s.oppNotes || []), ...(opp.notes.trim() ? [{ id: "on" + Date.now(), text: opp.notes, time: new Date().toLocaleTimeString(), date: today }] : [])] } : s)); } else { setSales(sl => [...sl, { id: "sl" + Date.now(), clientId: cid, publication: pubs[0]?.id || "", issueId: "", type: "TBD", size: "", adW: 0, adH: 0, amount: 0, status: "Discovery", date: today, page: null, pagePos: null, nextAction: STAGE_AUTO_ACTIONS.Discovery, nextActionDate: opp.nextActionDate || tomorrow, proposalId: null, oppNotes: opp.notes.trim() ? [{ id: "on" + Date.now(), text: opp.notes, time: new Date().toLocaleTimeString(), date: today }] : [] }]); logActivity(`New opportunity via ${opp.source}`, "opp", cid, opp.company); } if (close && !oppSendKit) { setOppMo(false); setOpp(x => ({ ...x, notes: "" })); } };
  const sendKit = () => { saveOpp(false); setOppKitSent(true); const cid = clients.find(c => c.name.toLowerCase() === opp.company.toLowerCase())?.id; logActivity(`Rate cards sent`, "comm", cid, opp.company); if (cid) { setClients(cl => cl.map(c => c.id === cid ? { ...c, comms: [...(c.comms || []), { id: "cm" + Date.now(), type: "Email", author: "Account Manager", date: today, note: `Sent rate cards: ${oppKitPubs.map(pid => pn(pid)).join(", ")}` }] } : c)); setSales(sl => sl.map(s => s.clientId === cid && s.status === "Discovery" ? { ...s, status: "Presentation", nextAction: STAGE_AUTO_ACTIONS.Presentation, nextActionDate: opp.nextActionDate } : s)); } };
  const oppToProposal = () => { saveOpp(false); const cid = clients.find(c => c.name.toLowerCase() === opp.company.toLowerCase())?.id || (editOppId && sales.find(s => s.id === editOppId)?.clientId); if (cid) setSales(sl => sl.map(s => s.clientId === cid && (s.status === "Discovery" || s.status === "Presentation") ? { ...s, status: "Proposal" } : s)); setOppMo(false); openProposal(cid); };

  const openProposal = (clientId) => { const cid = clientId || clients[0]?.id || ""; const clientName = cn(cid); setPropClient(cid); setPropPubs([]); setPropPayPlan(false); setPropStep("build"); setPropName(`${clientName} \u2014 Proposal ${new Date().toLocaleDateString()}`); setEditPropId(null); setPropAddPubId(pubs[0]?.id || ""); setPropExpandedPub(null); setPropEmailRecipients([]); setPropEmailMsg(""); setViewPropId(null); setPropMo(true); };
  // Open renewal proposal pre-populated from client's previous closed sales
  const openRenewalProposal = (clientId) => {
    const cid = clientId || clients[0]?.id || "";
    const clientName = cn(cid);
    // Get client's closed sales grouped by publication + ad size
    const clientSales = sales.filter(s => s.clientId === cid && s.status === "Closed");
    const pubGroups = {};
    clientSales.forEach(s => {
      if (!pubGroups[s.publication]) pubGroups[s.publication] = { pubId: s.publication, adSizes: {} };
      const sizeKey = s.size || s.type || "Ad";
      pubGroups[s.publication].adSizes[sizeKey] = (pubGroups[s.publication].adSizes[sizeKey] || 0) + 1;
    });
    // Build proposal pubs with upcoming issues, using the most common ad size
    const renewPubs = Object.values(pubGroups).map(pg => {
      const pub = pubs.find(p => p.id === pg.pubId);
      if (!pub) return null;
      const topSize = Object.entries(pg.adSizes).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
      const adSizeIdx = (pub.adSizes || []).findIndex(a => a.name === topSize);
      const futureIssues = issues.filter(i => i.pubId === pg.pubId && i.date >= today).slice(0, 12);
      return { pubId: pg.pubId, issues: futureIssues.map(iss => ({ issueId: iss.id, adSizeIdx: adSizeIdx >= 0 ? adSizeIdx : 0 })) };
    }).filter(Boolean);
    setPropClient(cid); setPropPubs(renewPubs); setPropPayPlan(false); setPropStep("build");
    setPropName(`${clientName} \u2014 Renewal ${new Date().toLocaleDateString()}`);
    setEditPropId(null); setPropAddPubId(pubs[0]?.id || "");
    setPropExpandedPub(renewPubs[0]?.pubId || null);
    setPropEmailRecipients([]); setPropEmailMsg(""); setViewPropId(null); setPropMo(true);
  };
  const closePropMo = () => { if (propPending && propStep === "build") { setSales(sl => sl.map(s => s.id === propPending ? { ...s, status: "Presentation" } : s)); logActivity("Proposal cancelled — back to Presentation", "pipeline", sales.find(s => s.id === propPending)?.clientId, cn(sales.find(s => s.id === propPending)?.clientId)); } setPropPending(null); setPropMo(false); };
  const editProposal = (propId) => { const p = proposals.find(x => x.id === propId); if (!p) return; setPropClient(p.clientId); setPropName(p.name); setEditPropId(propId); setPropPayPlan(p.payPlan); setPropStep("build"); setViewPropId(null); const grouped = {}; p.lines.forEach(li => { if (!grouped[li.pubId]) grouped[li.pubId] = { pubId: li.pubId, issues: [] }; const pub = pubs.find(x => x.id === li.pubId); const ai = (pub?.adSizes || []).findIndex(a => a.name === li.adSize); grouped[li.pubId].issues.push({ issueId: li.issueId, adSizeIdx: ai >= 0 ? ai : 0 }); }); setPropPubs(Object.values(grouped)); setPropExpandedPub(Object.keys(grouped)[0] || null); setPropMo(true); };
  const addPropPub = () => { if (!propAddPubId || propPubs.some(pp => pp.pubId === propAddPubId)) return; setPropPubs(pp => [...pp, { pubId: propAddPubId, issues: [] }]); setPropExpandedPub(propAddPubId); };
  const removePropPub = (pubId) => { setPropPubs(pp => pp.filter(p => p.pubId !== pubId)); };
  const togglePropIssue = (pi, iid) => { setPropPubs(pp => pp.map((p, i) => { if (i !== pi) return p; const ex = p.issues.find(x => x.issueId === iid); if (ex) return { ...p, issues: p.issues.filter(x => x.issueId !== iid) }; return { ...p, issues: [...p.issues, { issueId: iid, adSizeIdx: p.issues[p.issues.length - 1]?.adSizeIdx || 0 }] }; })); };
  const setIssueAdSize = (pi, iid, ai) => { setPropPubs(pp => pp.map((p, i) => i !== pi ? p : { ...p, issues: p.issues.map(x => x.issueId === iid ? { ...x, adSizeIdx: ai } : x) })); };
  const applyAdSizeBelow = (pi, iid, ai) => { setPropPubs(pp => pp.map((p, i) => { if (i !== pi) return p; const idx = p.issues.findIndex(x => x.issueId === iid); return { ...p, issues: p.issues.map((x, j) => j >= idx ? { ...x, adSizeIdx: ai } : x) }; })); };
  const selectIssueRange = (pi, mo) => { const pp = propPubs[pi]; if (!pp) return; const cut = new Date(today); cut.setMonth(cut.getMonth() + mo); const cs = cut.toISOString().slice(0, 10); const pubIss = issues.filter(i => i.pubId === pp.pubId && i.date >= today && i.date <= cs); const ds = pp.issues[0]?.adSizeIdx || 0; setPropPubs(pps => pps.map((p, i) => i !== pi ? p : { ...p, issues: pubIss.map(iss => ({ issueId: iss.id, adSizeIdx: ds })) })); };
  const totalInsertions = propPubs.reduce((s, pp) => s + pp.issues.length, 0);
  const autoTier = getAutoTier(totalInsertions); const autoTermLabel = getAutoTermLabel(totalInsertions);
  const allIssueDates = propPubs.flatMap(pp => pp.issues.map(iss => issues.find(i => i.id === iss.issueId)?.date)).filter(Boolean).sort();
  const monthSpan = allIssueDates.length >= 2 ? Math.max(1, Math.ceil((new Date(allIssueDates[allIssueDates.length - 1]) - new Date(allIssueDates[0])) / (30.44 * 86400000)) + 1) : 1;
  const propLineItems = propPubs.flatMap(pp => { const pub = pubs.find(p => p.id === pp.pubId); return pp.issues.map(iss => { const ad = pub?.adSizes?.[iss.adSizeIdx]; return { pubId: pp.pubId, pubName: pub?.name, adSize: ad?.name, dims: ad?.dims, adW: ad?.w, adH: ad?.h, issueId: iss.issueId, issueLabel: issLabel(iss.issueId), price: ad?.[autoTier] || ad?.rate || 0 }; }); });
  const pTotal = propLineItems.reduce((s, li) => s + li.price, 0);
  const pMonthly = monthSpan > 1 ? Math.ceil(pTotal / monthSpan) : pTotal;
  const pubSummary = (pp) => { const pub = pubs.find(p => p.id === pp.pubId); const t = pp.issues.reduce((s, iss) => { const ad = pub?.adSizes?.[iss.adSizeIdx]; return s + (ad?.[autoTier] || ad?.rate || 0); }, 0); return `${pp.issues.length} issues · $${t.toLocaleString()}`; };
  const goToEmailStep = () => { if (propLineItems.length === 0) return; const cl = clients.find(c => c.id === propClient); setPropEmailRecipients((cl?.contacts || []).filter(c => c.email).map(c => c.email)); setPropEmailMsg(`Dear ${cl?.contacts?.[0]?.name || ""},\n\nPlease find the attached proposal.\n\nTotal: $${pTotal.toLocaleString()}\n\nBest,\n${COMPANY.sales.name}`); setPropStep("email"); };
  const toggleRecipient = (email) => setPropEmailRecipients(r => r.includes(email) ? r.filter(e => e !== email) : [...r, email]);
  const submitProposal = async () => {
    if (!propClient || propLineItems.length === 0 || propEmailRecipients.length === 0) return;
    let renewalDate = null;
    if (monthSpan > 1) { const rd = new Date(today); rd.setMonth(rd.getMonth() + monthSpan); renewalDate = rd.toISOString().slice(0, 10); }
    const propData = {
      clientId: propClient, name: propName, term: autoTermLabel, termMonths: monthSpan,
      lines: propLineItems.map(li => ({ ...li, issueDate: issueMap[li.issueId]?.date || null })),
      total: pTotal, payPlan: propPayPlan, monthly: pMonthly,
      status: "Sent", date: today, renewalDate, sentTo: propEmailRecipients, sentAt: new Date().toISOString(),
    };
    if (editPropId) {
      await updateProposal(editPropId, { ...propData, status: "Sent", sentAt: new Date().toISOString() });
    } else {
      const result = await insertProposal(propData);
      if (result?.id && propPending) {
        setSales(sl => sl.map(s => s.id === propPending ? { ...s, proposalId: result.id, status: "Proposal" } : s));
        setPropPending(null);
      }
    }
    setSales(sl => sl.map(s => s.clientId === propClient && (s.status === "Discovery" || s.status === "Presentation") ? { ...s, status: "Proposal", nextAction: STAGE_AUTO_ACTIONS.Proposal } : s));
    setPropStep("sent");
    logActivity(`Proposal "${propName}" — $${pTotal.toLocaleString()}`, "proposal", propClient, cn(propClient));
    addNotif(`Proposal "${propName}" sent`);
  };

  // Send proposal email via Gmail Edge Function
  const sendProposalEmail = async (mode) => {
    if (!propClient || propLineItems.length === 0 || propEmailRecipients.length === 0) return;
    setPropSending(true);
    try {
      // Save the proposal
      let renewalDate = null;
      if (monthSpan > 1) { const rd = new Date(today); rd.setMonth(rd.getMonth() + monthSpan); renewalDate = rd.toISOString().slice(0, 10); }
      const propData = {
        clientId: propClient, name: propName, term: autoTermLabel, termMonths: monthSpan,
        lines: propLineItems.map(li => ({ ...li, issueDate: issueMap[li.issueId]?.date || null })),
        total: pTotal, payPlan: propPayPlan, monthly: pMonthly,
        status: "Sent", date: today, renewalDate, sentTo: propEmailRecipients, sentAt: new Date().toISOString(),
      };
      let proposalId = editPropId;
      if (editPropId) {
        await updateProposal(editPropId, { ...propData, status: "Sent", sentAt: new Date().toISOString() });
      } else {
        const result = await insertProposal(propData);
        if (result?.id) proposalId = result.id;
      }

      // Create signature record with proposal snapshot
      const cl = clients.find(c => c.id === propClient);
      const primaryContact = (cl?.contacts || []).find(c => c.email) || {};
      let signLink = "";
      if (proposalId) {
        const snapshot = { ...propData, clientName: cn(propClient) };
        const { data: sigData } = await supabase.from("proposal_signatures").insert({
          proposal_id: proposalId,
          signer_name: primaryContact.name || cn(propClient),
          signer_email: propEmailRecipients[0] || primaryContact.email || "",
          proposal_snapshot: snapshot,
        }).select("access_token").single();
        if (sigData?.access_token) signLink = `${window.location.origin}/sign/${sigData.access_token}`;
      }

      // Build branded HTML email with sign link
      const clientName = cn(propClient);
      const teamMember = currentUser || (props.team || []).find(t => t.permissions?.includes("admin")) || props.team?.[0];
      if (!teamMember) throw new Error("No team member found");

      const lineItemsHtml = propLineItems.map(li =>
        `<tr><td style="padding:8px 14px;border-bottom:1px solid #eee;font-size:13px">${li.pubName}</td>` +
        `<td style="padding:8px 14px;border-bottom:1px solid #eee;font-size:13px">${li.adSize}</td>` +
        `<td style="padding:8px 14px;border-bottom:1px solid #eee;font-size:13px">${li.issueLabel}</td>` +
        `<td style="padding:8px 14px;border-bottom:1px solid #eee;font-size:13px;text-align:right;font-weight:700">$${(li.price || 0).toLocaleString()}</td></tr>`
      ).join("");

      const htmlBody = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
        <div style="border-bottom:2px solid #1a1a2e;padding-bottom:16px;margin-bottom:24px;display:flex;justify-content:space-between">
          <div><div style="font-size:20px;font-weight:900;color:#1a1a2e">13 Stars Media Group</div>
          <div style="font-size:11px;color:#666;margin-top:2px">P.O. Box 427, Paso Robles, CA 93447 · (805) 237-6060</div></div>
        </div>
        <div style="margin-bottom:8px;font-size:11px;color:#666">
          <strong>${teamMember.name}</strong> · ${teamMember.email}${teamMember.phone ? ` · ${teamMember.phone}` : ""}
        </div>
        <div style="margin-bottom:20px;font-size:14px;color:#1a1a2e;line-height:1.6;white-space:pre-wrap">${(propEmailMsg || "").replace(/\n/g, "<br>")}</div>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
          <thead><tr style="background:#f5f5f5">
            <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;color:#666;font-weight:700">Publication</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;color:#666;font-weight:700">Ad Size</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;color:#666;font-weight:700">Issue</th>
            <th style="padding:10px 14px;text-align:right;font-size:11px;text-transform:uppercase;color:#666;font-weight:700">Rate</th>
          </tr></thead>
          <tbody>${lineItemsHtml}</tbody>
          <tfoot><tr style="border-top:2px solid #1a1a2e"><td colspan="3" style="padding:12px 14px;font-weight:700;font-size:14px">Total</td>
            <td style="padding:12px 14px;text-align:right;font-weight:800;font-size:20px;color:#1a1a2e">$${pTotal.toLocaleString()}</td>
          </tr></tfoot>
        </table>
        ${propPayPlan && monthSpan > 1 ? `<div style="padding:10px 14px;background:#f0f4ff;border-radius:6px;margin-bottom:20px;font-size:13px;color:#1a1a2e">Payment Plan: ${monthSpan} months × $${pMonthly.toLocaleString()}/month</div>` : ""}
        ${signLink ? `<div style="text-align:center;margin:32px 0"><a href="${signLink}" style="display:inline-block;padding:14px 40px;background:#16A34A;color:#fff;font-size:16px;font-weight:800;text-decoration:none;border-radius:8px">Click to Review & Sign</a><div style="font-size:11px;color:#999;margin-top:8px">This link expires in 30 days</div></div>` : ""}
        <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center">13 Stars Media Group · Paso Robles, CA · 13stars.media</div>
      </div>`;

      const result = await sendGmailEmail({
        teamMemberId: teamMember.id,
        to: propEmailRecipients,
        subject: `Proposal: ${propName} \u2014 ${clientName}`,
        htmlBody, mode,
      });

      if (result.needs_auth) {
        const auth = await initiateGmailAuth(teamMember.id);
        if (auth.error) addNotif(`Gmail auth error: ${auth.error}`);
        else addNotif("Connect your Gmail account in the popup, then click Send again.");
        setPropSending(false);
        return;
      } else if (result.success) {
        addNotif(mode === "send" ? `Proposal emailed to ${propEmailRecipients.join(", ")}` : `Gmail draft created — check your drafts`);
        logActivity(`Proposal "${propName}" — $${pTotal.toLocaleString()} (${mode === "send" ? "emailed" : "draft"})`, "proposal", propClient, cn(propClient));
        setPropStep("sent");
      } else {
        addNotif(`Email failed: ${result.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error("sendProposalEmail error:", err);
      addNotif(`Email error: ${err.message}`);
    }
    setPropSending(false);
  };

  const signProposal = async (propId) => {
    const p = proposals.find(x => x.id === propId);
    if (!p) return;
    // First mark as Approved/Signed
    await updateProposal(propId, { status: "Approved/Signed", signedAt: new Date().toISOString() });
    // Then convert to contract + sales orders via database function
    if (convertProposal) {
      const result = await convertProposal(propId);
      if (result?.success) {
        logActivity(`"${p.name}" signed! ${result.sales_created} sales created`, "pipeline", p.clientId, cn(p.clientId));
        addNotif(`Contract created from "${p.name}" — ${result.sales_created} orders`);
        if (bus) bus.emit("proposal.signed", { proposalId: propId, clientId: p.clientId, clientName: cn(p.clientId), totalAmount: p.total, lineCount: result.sales_created });
      } else {
        logActivity(`"${p.name}" signed but conversion failed: ${result?.error || 'unknown'}`, "pipeline", p.clientId, cn(p.clientId));
      }
    }
  };

  const actColors = { pipeline: Z.ac, proposal: Z.pu, opp: Z.su, comm: Z.wa };

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="My Sales">
      {(tab === "Pipeline" || (tab === "Clients" && !viewClientId && clientView === "list")) && <><SB value={sr} onChange={setSr} placeholder="Search..." /><Sel value={fPub} onChange={e => setFPub(e.target.value)} options={[{ value: "all", label: "All Pubs" }, ...pubs.map(p => ({ value: p.id, label: p.name }))]} /></>}
      {tab === "Clients" && !viewClientId && <Btn sm onClick={() => { setEc(null); setCf({ name: "", industries: [], leadSource: "", interestedPubs: [], contacts: [{ name: "", email: "", phone: "", role: "Business Owner" }], notes: "" }); setCmo(true); }}><Ic.plus size={13} /> Client</Btn>}
      {tab === "Pipeline" && <Btn sm onClick={openOpp}><Ic.plus size={13} /> New Opportunity</Btn>}
      {tab === "Proposals" && <Btn sm onClick={() => openProposal()}><Ic.plus size={13} /> Proposal</Btn>}
    </PageHeader>

    <TabRow><TB tabs={["Pipeline", "Clients", "Proposals", "Closed", "Renewals", "Outreach", "Commissions", "Inquiries"]} active={tab} onChange={t => { if (t === "Inquiries" && loadInquiries && !inquiriesLoaded) loadInquiries(); navTo(t); }} />{tab === "Pipeline" && <><TabPipe /><TB tabs={["My Pipeline", "All Pipeline"]} active={myPipeline ? "My Pipeline" : "All Pipeline"} onChange={v => setMyPipeline(v === "My Pipeline")} /><TabPipe /><TB tabs={["My Actions", "Full Pipeline"]} active={pipeView === "actions" ? "My Actions" : "Full Pipeline"} onChange={v => setPipeView(v === "My Actions" ? "actions" : "all")} /></>}{tab === "Clients" && !viewClientId && <><TabPipe /><TB tabs={["Signals", "All Clients"]} active={clientView === "signals" ? "Signals" : "All Clients"} onChange={v => setClientView(v === "Signals" ? "signals" : "list")} /></>}{tab === "Closed" && <><TabPipe /><TB tabs={["Past 7 Days", "Past 30 Days", "This Month", "This Quarter", "This Year", "All Time"]} active={{"7days":"Past 7 Days","30days":"Past 30 Days","month":"This Month","quarter":"This Quarter","year":"This Year","all":"All Time"}[closedRange]} onChange={v => setClosedRange({"Past 7 Days":"7days","Past 30 Days":"30days","This Month":"month","This Quarter":"quarter","This Year":"year","All Time":"all"}[v])} /></>}{tab === "Commissions" && <><TabPipe /><TB tabs={["Overview", "Rate Tables", "Goals", "Assignments"]} active={commTab} onChange={setCommTab} /></>}</TabRow>

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
          {goalRows.map(g => <div key={g.pub.id} style={{ flex: "1 1 120px", padding: "8px 12px", background: Z.bg === "#08090D" ? "rgba(14,16,24,0.3)" : "rgba(255,255,255,0.25)", backdropFilter: "blur(16px)", borderRadius: R, border: `1px solid ${Z.bd}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tx, fontFamily: COND, marginBottom: 4 }}><span>{g.pub.name}</span><span style={{ color: g.pct >= 80 ? Z.go : g.pct >= 50 ? Z.wa : Z.da }}>{g.pct}%</span></div>
            <div style={{ height: 4, background: Z.sa, borderRadius: Ri, marginBottom: 3 }}><div style={{ height: "100%", borderRadius: Ri, width: `${g.pct}%`, background: g.pct >= 80 ? Z.go : g.pct >= 50 ? Z.wa : Z.da, transition: "width 0.3s" }} /></div>
            <div style={{ fontSize: FS.micro, color: Z.td }}>${Math.round(g.myRev / 1000)}K / ${Math.round(g.myGoal / 1000)}K goal</div>
          </div>)}
        </div>;
      })()}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
        {PIPELINE.map(stage => { const ss = (pipeView === "actions" ? actionSales : activeSales).filter(s => {
          if (stage === "Closed") return s.status === "Closed" && s.date >= sevenDaysAgo;
          if (stage === "Follow-up") return s.status === "Follow-up" || (s.status === "Closed" && s.date < sevenDaysAgo);
          return s.status === stage;
        }); const stRev = ss.reduce((s, x) => s + (x.amount || 0), 0);
          return <div key={stage} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragSaleId) { moveToStage(dragSaleId, stage); setDragSaleId(null); } }} style={{ background: Z.bg === "#08090D" ? "rgba(14,16,24,0.3)" : "rgba(255,255,255,0.25)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRadius: R, padding: CARD.pad, border: `1px solid ${Z.bd}`, display: "flex", flexDirection: "column", minHeight: 100 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 4px 6px", borderBottom: `2px solid ${PIPELINE_COLORS[stage]}` }}><span style={{ fontSize: FS.sm, fontWeight: FW.black, color: PIPELINE_COLORS[stage] }}>{stage}</span><span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td }}>{ss.length}{stRev > 0 ? ` · $${(stRev / 1000).toFixed(0)}K` : ""}</span></div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, marginTop: 8, overflowY: "auto", maxHeight: 420 }}>
              {ss.slice(0, 8).map(s => <div key={s.id} draggable onDragStart={() => setDragSaleId(s.id)} onClick={() => handleCardClick(s)} style={{ ...glass(), borderRadius: R, padding: CARD.pad, cursor: "grab" }}>
                <div onClick={e => { e.stopPropagation(); navTo("Clients", s.clientId); }} style={{ fontWeight: FW.semi, color: Z.ac, fontSize: FS.md, cursor: "pointer", marginBottom: 2, fontFamily: COND }} title="Go to profile">{cn(s.clientId)}</div>
                {s.type !== "TBD" && <div style={{ color: Z.tm, fontSize: FS.sm, marginBottom: 2 }}>{pn(s.publication)} · {s.type}</div>}
                {s.amount > 0 && <div style={{ fontWeight: FW.black, color: Z.su, fontSize: FS.base }}>${s.amount.toLocaleString()}</div>}
                {s.nextAction && <div onClick={e => { e.stopPropagation(); handleAct(s.id); }} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, padding: "4px 6px", background: `${actInfo(s.nextAction)?.color || Z.ac}10`, border: `1px solid ${actInfo(s.nextAction)?.color || Z.ac}25`, borderRadius: Ri, cursor: "pointer" }}>
                  <span style={{ fontSize: FS.sm }}>{actIcon(s)}</span>
                  <span style={{ fontSize: FS.sm, color: actInfo(s.nextAction)?.color || Z.ac, fontWeight: FW.bold, flex: 1 }}>{actLabel(s)}</span>
                  {s.nextActionDate && <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: dateColor(s.nextActionDate) }}>{s.nextActionDate.slice(5)}</span>}
                </div>}
                <div style={{ display: "flex", gap: 3, marginTop: 3 }}>
                  {stage !== "Closed" && stage !== "Follow-up" && <>
                    <button onClick={e => { e.stopPropagation(); logActivity(`Called ${cn(s.clientId)}`, "comm", s.clientId, cn(s.clientId)); const nd = new Date(); nd.setDate(nd.getDate() + 3); setSales(sl => sl.map(x => x.id === s.id ? { ...x, nextAction: { type: "call", label: "Follow up call" }, nextActionDate: nd.toISOString().slice(0, 10), oppNotes: [...(x.oppNotes || []), { id: "n" + Date.now(), text: "Logged call", date: today }] } : x)); addNotif(`Call logged — ${cn(s.clientId)}`); }} style={{ padding: "3px 5px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sa, cursor: "pointer", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.tm }} title="Log call">📞</button>
                    <button onClick={e => { e.stopPropagation(); logActivity(`Emailed ${cn(s.clientId)}`, "comm", s.clientId, cn(s.clientId)); const nd = new Date(); nd.setDate(nd.getDate() + 5); setSales(sl => sl.map(x => x.id === s.id ? { ...x, nextAction: { type: "email", label: "Follow up email" }, nextActionDate: nd.toISOString().slice(0, 10), oppNotes: [...(x.oppNotes || []), { id: "n" + Date.now(), text: "Logged email", date: today }] } : x)); addNotif(`Email logged — ${cn(s.clientId)}`); }} style={{ padding: "3px 5px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sa, cursor: "pointer", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.tm }} title="Log email">✉️</button>
                    <button onClick={e => { e.stopPropagation(); const nd = new Date(); nd.setDate(nd.getDate() + 7); setSales(sl => sl.map(x => x.id === s.id ? { ...x, nextActionDate: nd.toISOString().slice(0, 10) } : x)); addNotif(`Snoozed 7d — ${cn(s.clientId)}`); }} style={{ padding: "3px 5px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sa, cursor: "pointer", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.tm }} title="Snooze 7 days">💤</button>
                  </>}
                  {stage !== "Follow-up" && <button onClick={e => { e.stopPropagation(); moveToStage(s.id, PIPELINE[Math.min(PIPELINE.indexOf(stage) + 1, 5)]); }} style={{ flex: 1, padding: "3px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sa, cursor: "pointer", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.tm }}>→ {PIPELINE[Math.min(PIPELINE.indexOf(stage) + 1, 5)]}</button>}
                  {(stage === "Closed" || stage === "Follow-up") && <button onClick={e => { e.stopPropagation(); cloneSale(s); }} style={{ padding: "3px 5px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sa, cursor: "pointer", fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tm }}>⟳</button>}
                  {stage === "Closed" && onNavigate && <button onClick={e => { e.stopPropagation(); onNavigate("adprojects"); }} style={{ padding: "3px 5px", borderRadius: Ri, border: `1px solid ${Z.pu}40`, background: Z.pu + "10", cursor: "pointer", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.pu }} title="Start ad design project">🎨</button>}
                </div>
              </div>)}
            </div>
          </div>; })}
      </div>
      {/* TODAY'S ACTIONS + ACTIVITY */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <GlassCard><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><h4 style={{ margin: 0, fontSize: FS.md, fontWeight: FW.black, color: Z.tx }}>My Actions</h4><span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: todaysActions.length > 0 ? Z.da : Z.su }}>{todaysActions.length}</span></div>{todaysActions.length === 0 ? <div style={{ padding: 16, textAlign: "center", color: Z.su, fontSize: FS.base }}>All caught up!</div> : <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 240, overflowY: "auto" }}>{todaysActions.slice(0, 10).map(s => <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: Z.bg, borderRadius: Ri }}><div style={{ flex: 1 }}><div style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{cn(s.clientId)}</div><div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: FS.sm, color: Z.tx }}><span>{actIcon(s)}</span><span style={{ fontWeight: FW.semi }}>{actLabel(s)}</span>{s.nextActionDate < today && <span style={{ color: Z.da, fontWeight: FW.heavy }}>ACTION NEEDED</span>}</div></div><button onClick={() => handleAct(s.id)} style={{ padding: "6px 12px", borderRadius: Ri, border: `1px solid ${(actInfo(s.nextAction)?.color || Z.ac)}40`, background: `${actInfo(s.nextAction)?.color || Z.ac}10`, cursor: "pointer", fontSize: FS.sm, fontWeight: FW.heavy, color: actInfo(s.nextAction)?.color || Z.ac }}>{actVerb(s)}</button></div>)}</div>}</GlassCard>
        <GlassCard><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><h4 style={{ margin: 0, fontSize: FS.md, fontWeight: FW.black, color: Z.tx }}>My Activity</h4>
          <div style={{ display: "flex", gap: 3 }}>{[["all","All"],["pipeline","Pipeline"],["proposal","Proposals"],["opp","Opps"],["comm","Comms"]].map(([k,l]) => <button key={k} onClick={() => setActFilter(k)} style={{ padding: "3px 6px", borderRadius: Ri, border: "none", background: actFilter === k ? Z.sa : "transparent", cursor: "pointer", fontSize: FS.sm, fontWeight: FW.bold, color: actFilter === k ? Z.tx : Z.td }}>{l}</button>)}</div></div>{(() => { const fl = actFilter === "all" ? activityLog : activityLog.filter(a => a.type === actFilter); const gr = {}; fl.forEach(a => { const k = a.clientName || "?"; if (!gr[k]) gr[k] = { clientId: a.clientId, clientName: k, entries: [] }; gr[k].entries.push(a); }); return <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 240, overflowY: "auto" }}>{Object.values(gr).slice(0, 8).map(g => { const lt = g.entries[0]; const io = actExpanded === g.clientName; return <div key={g.clientName}>
          <div onClick={() => setActExpanded(io ? null : g.clientName)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: Ri, cursor: "pointer", background: io ? Z.sa : "transparent" }}><div style={{ width: 6, height: 6, borderRadius: Ri, background: actColors[lt.type] || Z.tm, flexShrink: 0 }} />
          <div style={{ flex: 1 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx }}>{g.clientName}</span><span style={{ fontSize: FS.sm, color: Z.tm }}>{io ? "▾" : "▸"}</span></div><div style={{ fontSize: FS.sm, color: actColors[lt.type], fontWeight: FW.semi }}>{lt.text}</div></div></div>{io && <div style={{ marginLeft: 18, borderLeft: `2px solid ${Z.bd}`, paddingLeft: 10, marginBottom: 4 }}>{g.entries.slice(0, 5).map(a => <div key={a.id} onClick={e => { e.stopPropagation(); if (a.type === "proposal") navTo("Proposals"); else if (a.clientId) navTo("Clients", a.clientId); }} style={{ display: "flex", gap: 5, padding: "3px 5px", cursor: "pointer", borderRadius: Ri }} onMouseEnter={e => e.currentTarget.style.background = Z.bg} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><span style={{ fontSize: FS.sm, color: Z.tx, flex: 1 }}>{a.text}</span><span style={{ fontSize: FS.sm, color: Z.td }}>{a.time}</span></div>)}</div>}</div>; })}</div>; })()}</GlassCard>
      </div>
    </>}

    {/* CLIENTS + PROFILE (abbreviated — same structure as before) */}
    {tab === "Clients" && !viewClientId && clientView === "signals" && <ClientSignals clients={jurisdiction?.isSalesperson ? jurisdiction.myClients : clients} sales={jurisdiction?.isSalesperson ? jurisdiction.mySales : sales} pubs={pubs} issues={issues} currentUser={currentUser} jurisdiction={jurisdiction} myPriorities={myPriorities} priorityHelpers={priorityHelpers} onSelectClient={(cId) => navTo("Clients", cId)} />}
    {tab === "Clients" && !viewClientId && clientView === "list" && <ClientList clients={jurisdiction?.isSalesperson ? jurisdiction.myClients : clients} sales={jurisdiction?.isSalesperson ? jurisdiction.mySales : sales} pubs={pubs} issues={issues} proposals={proposals} sr={sr} setSr={setSr} fPub={fPub} onSelectClient={(cId) => navTo("Clients", cId)} />}
    {tab === "Clients" && viewClientId && <ClientProfile clientId={viewClientId} clients={clients} setClients={setClients} sales={sales} pubs={pubs} issues={issues} proposals={proposals} contracts={contracts} commForm={commForm} setCommForm={setCommForm} onBack={goBack} onNavTo={navTo} onOpenProposal={openProposal} onSetViewPropId={setViewPropId} bus={bus} onOpenEditClient={(vc) => { setEc(vc); setCf({ name: vc.name, industries: vc.industries || [], leadSource: vc.leadSource || "", interestedPubs: vc.interestedPubs || [], contacts: vc.contacts || [], notes: vc.notes || "" }); setCmo(true); }} />}

    {/* PROPOSALS */}
    {tab === "Proposals" && !viewPropId && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* METRICS BAR */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 4 }}>
        {[
          ["Proposed", "$" + (proposals.filter(p => p.status === "Sent" || p.status === "Under Review").reduce((s,p) => s + (p.total||0), 0)/1000).toFixed(0) + "K", Z.wa],
          ["Signed", "$" + (proposals.filter(p => p.status === "Approved/Signed" || p.status === "Converted").reduce((s,p) => s + (p.total||0), 0)/1000).toFixed(0) + "K", Z.ac],
          ["Conversion", Math.round(proposals.filter(p => p.status === "Approved/Signed" || p.status === "Converted").length / Math.max(1, proposals.filter(p => p.status !== "Draft").length) * 100) + "%", Z.pu],
          ["Avg Deal", "$" + Math.round(proposals.filter(p => p.total > 0).reduce((s,p) => s + p.total, 0) / Math.max(1, proposals.filter(p => p.total > 0).length)).toLocaleString(), Z.or],
        ].map(([l, v, c]) => <div key={l} style={{ ...glass(), borderRadius: R, padding: "10px 14px" }}><div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{v}</div></div>)}
      </div>
      {proposals.length === 0 ? <GlassCard style={{ textAlign: "center", padding: 24, color: Z.td }}>No proposals yet</GlassCard> : proposals.map(p => <div key={p.id} onClick={() => setViewPropId(p.id)} style={{ ...glass(), borderRadius: R, padding: 16, cursor: "pointer" }}><div style={{ display: "flex", justifyContent: "space-between" }}><div><span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{p.name}</span><div style={{ fontSize: FS.sm, color: Z.tm }}>{cn(p.clientId)} · {p.lines.length} items</div><div style={{ fontSize: FS.sm, color: Z.ac }}>{propPubNames(p)}</div></div><div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.su }}>${p.total.toLocaleString()}</span><Badge status={p.status} small />
      </div></div></div>)}</div>}
    {tab === "Proposals" && viewPropId && (() => { const p = proposals.find(x => x.id === viewPropId); if (!p) return null; const grouped = {}; p.lines.forEach(li => { if (!grouped[li.pubName]) grouped[li.pubName] = []; grouped[li.pubName].push(li); });
      return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}><Btn sm v="ghost" onClick={() => setViewPropId(null)}>← Back</Btn><div style={{ display: "flex", justifyContent: "space-between" }}><div><h2 style={{ margin: "0 0 4px", fontSize: FS.xl, fontWeight: FW.black, color: Z.tx }}>{p.name}</h2><div style={{ fontSize: FS.base, color: Z.tm }}>{cn(p.clientId)} · {p.term} · {p.date}</div><div style={{ fontSize: FS.sm, color: Z.tx, marginTop: 3 }}>{propPubNames(p)}</div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: 22, fontWeight: FW.black, color: Z.tx }}>${p.total.toLocaleString()}</div><Badge status={p.status} />{p.closedAt && <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 2 }}>Closed: {new Date(p.closedAt).toLocaleDateString()}</div>}</div></div>{Object.entries(grouped).map(([pub, lines]) => <GlassCard key={pub}><h4 style={{ margin: "0 0 8px", fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{pub}</h4><div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{lines.map((li, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 6, padding: "5px 8px", background: Z.bg, borderRadius: R }}><span style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{li.issueLabel}</span><span style={{ fontSize: FS.sm, color: Z.tm }}>{li.adSize}</span><span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx, textAlign: "right" }}>${li.price.toLocaleString()}</span></div>)}</div></GlassCard>)}<div style={{ background: Z.sa, borderRadius: R, padding: 12, border: `1px solid ${Z.bd}`, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}><div><div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm, textTransform: "uppercase" }}>Items</div><div style={{ fontSize: FS.lg, fontWeight: FW.heavy, color: Z.tx }}>{p.lines.length}</div></div><div><div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm, textTransform: "uppercase" }}>Tier</div><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{p.term}</div></div><div><div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm, textTransform: "uppercase" }}>Contract</div><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{p.termMonths} months</div></div><div><div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm, textTransform: "uppercase" }}>{p.payPlan ? "Monthly" : "Payment"}</div><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{p.payPlan ? `$${p.monthly?.toLocaleString()}/mo` : `$${p.total.toLocaleString()}`}</div></div></div>
      {p.sentTo?.length > 0 && <div style={{ fontSize: FS.sm, color: Z.tm }}>Sent to: {p.sentTo.join(", ")}</div>}
      {p.renewalDate && <div style={{ fontSize: FS.sm, color: Z.wa }}>Renewal: {p.renewalDate}</div>}
      <div style={{ display: "flex", gap: 5 }}>{p.status === "Sent" && <Btn v="success" onClick={async () => { await signProposal(p.id); setViewPropId(null); }}>Client Signed → Contract</Btn>}{(p.status === "Sent" || p.status === "Draft") && <Btn v="secondary" onClick={() => editProposal(p.id)}><Ic.edit size={12} /> {p.status === "Draft" ? "Edit Draft" : "Edit & Resend"}</Btn>}{p.status === "Converted" && <span style={{ fontSize: FS.sm, color: Z.su, fontWeight: FW.bold }}>✓ Converted to Contract</span>}</div></div>; })()}

    {/* CLOSED + RENEWALS */}
    {tab === "Closed" && (() => {
      const now = new Date(); const thisMonth = now.toISOString().slice(0,7); const thisYear = now.toISOString().slice(0,4);
      const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth()/3)*3, 1).toISOString().slice(0,10);
      const d7 = new Date(now); d7.setDate(d7.getDate() - 7); const d7s = d7.toISOString().slice(0,10);
      const d30 = new Date(now); d30.setDate(d30.getDate() - 30); const d30s = d30.toISOString().slice(0,10);
      let filtered = closedSales.filter(s => { if (closedRange === "7days") return s.date >= d7s; if (closedRange === "30days") return s.date >= d30s; if (closedRange === "month") return s.date?.startsWith(thisMonth); if (closedRange === "quarter") return s.date >= qStart; if (closedRange === "year") return s.date?.startsWith(thisYear); return true; });
      if (fPub !== "all") filtered = filtered.filter(s => s.publication === fPub);
      const filtRev = filtered.reduce((s,x) => s + x.amount, 0);
      const repName = (cid) => { const c = clients.find(x => x.id === cid); return c?.repId ? ((team || []).find(x => x.id === c.repId)?.name || "\u2014") : "\u2014"; };
      const repRevs = {}; filtered.forEach(s => { const rn = repName(s.clientId); repRevs[rn] = (repRevs[rn] || 0) + (s.amount || 0); });
      const topRep = Object.entries(repRevs).sort((a,b) => b[1] - a[1])[0];
      return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* STATS CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {[
          ["Revenue", "$" + (filtRev >= 1000 ? (filtRev/1000).toFixed(0) + "K" : filtRev.toLocaleString()), Z.go],
          ["Deals Closed", String(filtered.length), Z.ac],
          ["Avg Deal Size", "$" + Math.round(filtRev / Math.max(1, filtered.length)).toLocaleString(), Z.wa],
          ["Top Salesperson", topRep ? topRep[0].split(" ")[0] : "\u2014", Z.ac],
        ].map(([l, v, c]) => <div key={l} style={{ ...glass(), borderRadius: R, padding: "12px 16px" }}><div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{v}</div>{l === "Top Salesperson" && topRep && <div style={{ fontSize: FS.xs, color: Z.tm }}>${(topRep[1]/1000).toFixed(0)}K revenue</div>}</div>)}
      </div>
      {/* TABLE */}
      <GlassCard style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS.sm, fontFamily: COND }}>
          <thead><tr style={{ borderBottom: `1px solid ${Z.bd}` }}>
            {["Client", "Publication", "Ad Size", "Amount", "Date", "Salesperson"].map(h => <th key={h} style={{ padding: "8px 12px", textAlign: h === "Amount" ? "right" : "left", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {filtered.slice(0, 100).map(s => <tr key={s.id} onClick={() => navTo("Clients", s.clientId)} style={{ cursor: "pointer", borderBottom: `1px solid ${Z.bd}15` }}
              onMouseEnter={e => e.currentTarget.style.background = Z.sa} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <td style={{ padding: "8px 12px", fontWeight: FW.semi, color: Z.tx }}>{cn(s.clientId)}</td>
              <td style={{ padding: "8px 12px", color: Z.tm }}>{pn(s.publication)}</td>
              <td style={{ padding: "8px 12px", color: Z.tm }}>{s.size || s.type || "\u2014"}</td>
              <td style={{ padding: "8px 12px", fontWeight: FW.bold, color: Z.tx, textAlign: "right" }}>${(s.amount || 0).toLocaleString()}</td>
              <td style={{ padding: "8px 12px", color: Z.tm }}>{s.date}</td>
              <td style={{ padding: "8px 12px", color: Z.tm }}>{repName(s.clientId)}</td>
            </tr>)}
          </tbody>
        </table>
        {filtered.length > 100 && <div style={{ padding: 8, textAlign: "center", fontSize: FS.xs, color: Z.td }}>Showing 100 of {filtered.length}</div>}
      </GlassCard>
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
        ].map(([l, v, c]) => <div key={l} style={{ ...glass(), borderRadius: R, padding: "10px 14px" }}><div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{v}</div></div>)}
      </div>
      {scored.length === 0 && <GlassCard style={{ textAlign: "center", padding: 20, color: Z.ac, fontSize: FS.lg, fontWeight: FW.bold }}>All caught up — no renewals due</GlassCard>}
      {/* THREE LANES */}
      {[{ label: "Ready to Renew", items: ready, total: totalReady, color: Z.ac, action: "Send Renewal" }, { label: "Warm Up Needed", items: warm, total: totalWarm, color: Z.wa, action: "Schedule Check-in" }, { label: "At Risk", items: atRisk, total: totalAtRisk, color: Z.da, action: "Review Account" }].map(lane => lane.items.length === 0 ? null : <div key={lane.label}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0 4px", borderBottom: `2px solid ${lane.color}` }}><span style={{ fontSize: FS.lg, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{lane.label}</span><span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: INV.light, background: lane.color, padding: "1px 7px", borderRadius: R }}>{lane.items.length}{lane.total > lane.items.length ? ` of ${lane.total}` : ""}</span></div>
        {lane.items.slice(0, 25).map(s => <div key={s.clientId || s.id} style={{ ...glass(), borderRadius: R, padding: 16, marginTop: 4 }}>
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
    {tab === "Commissions" && <Commissions sales={sales} clients={clients} pubs={pubs} issues={issues} team={props.team || []} commissionRates={commissionRates || []} commissionLedger={commissionLedger || []} commissionPayouts={commissionPayouts || []} commissionGoals={commissionGoals || []} salespersonPubAssignments={salespersonPubAssignments || []} helpers={commissionHelpers || {}} tab={commTab} setTab={setCommTab} />}
    {tab === "Outreach" && <Outreach sales={sales} clients={clients} pubs={pubs} issues={issues} team={props.team || []} campaigns={outreachCampaigns || []} entries={outreachEntries || []} helpers={outreachHelpers || {}} navTo={navTo} />}

    {/* INQUIRIES */}
    {tab === "Inquiries" && (() => {
      const inquiries = adInquiries || [];
      const newCount = inquiries.filter(i => i.status === "new").length;
      const contactedCount = inquiries.filter(i => i.status === "contacted").length;
      const convertedCount = inquiries.filter(i => i.status === "converted").length;
      const statusColors = { new: Z.ac || "#3b82f6", contacted: Z.wa || "#f59e0b", converted: Z.su || "#22c55e", dismissed: Z.tm || "#9ca3af" };
      const confidenceBadge = (conf, reason) => {
        if (conf === "none") return null;
        const color = conf === "exact" ? (Z.su || "#22c55e") : (Z.wa || "#f59e0b");
        return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: color + "18", color, fontFamily: COND, textTransform: "uppercase" }}>{conf} — {reason}</span>;
      };
      return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Stats */}
        <div style={{ display: "flex", gap: 12 }}>
          <GlassStat label="New" value={newCount} color={statusColors.new} />
          <GlassStat label="Contacted" value={contactedCount} color={statusColors.contacted} />
          <GlassStat label="Converted" value={convertedCount} color={statusColors.converted} />
          <GlassStat label="Total" value={inquiries.length} />
        </div>

        {/* Inquiry list */}
        {!inquiriesLoaded ? (
          <div style={{ padding: 40, textAlign: "center", color: Z.tm, fontSize: FS.sm, fontFamily: COND }}>Loading inquiries...</div>
        ) : inquiries.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: Z.tm, fontSize: FS.sm, fontFamily: COND }}>No inquiries yet. Inquiries from your website's Advertise page will appear here.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {inquiries.map(inq => {
              const matchedClient = inq.client_id ? (clients || []).find(c => c.id === inq.client_id) : null;
              const rep = matchedClient?.repId ? (props.team || []).find(t => t.id === matchedClient.repId) : null;
              return <div key={inq.id} style={{ ...glass(), padding: CARD.pad, borderRadius: R, border: "1px solid " + Z.bd, display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Header row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>{inq.business_name || inq.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 3, background: (statusColors[inq.status] || Z.tm) + "18", color: statusColors[inq.status] || Z.tm, fontFamily: COND, textTransform: "uppercase" }}>{inq.status}</span>
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
                  {inq.budget_range && <div><span style={{ color: Z.tm, fontWeight: 600 }}>Budget:</span> {inq.budget_range}</div>}
                  {inq.desired_start && <div><span style={{ color: Z.tm, fontWeight: 600 }}>Start:</span> {new Date(inq.desired_start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>}
                  {inq.how_heard && <div><span style={{ color: Z.tm, fontWeight: 600 }}>Source:</span> {inq.how_heard}</div>}
                </div>

                {inq.message && <div style={{ fontSize: 12, color: Z.tx, fontFamily: COND, background: Z.sa, padding: "6px 10px", borderRadius: Ri, borderLeft: "3px solid " + Z.bd }}>{inq.message}</div>}

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                  {inq.status === "new" && <Btn sm onClick={() => updateInquiry(inq.id, { status: "contacted", updated_at: new Date().toISOString() })}>Mark Contacted</Btn>}
                  {(inq.status === "new" || inq.status === "contacted") && (
                    <Btn sm v="success" onClick={() => {
                      if (!inq.client_id) {
                        // Create a new client from this inquiry
                        const newClient = { name: inq.business_name || inq.name, status: "Lead", leadSource: "Website Inquiry", contacts: [{ name: inq.name, email: inq.email, phone: inq.phone || "", role: "Business Owner" }], notes: "From ad inquiry: " + (inq.message || "") };
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

    {/* MODALS: Client, Opportunity, Proposal, Email Compose, Next Step */}
    <Modal open={cmo} onClose={() => setCmo(false)} title={ec ? "Edit Client" : "New Client"} width={640}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Interested Publications — prominent at top */}
        <div style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: R, padding: CARD.pad }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Interested In</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {pubs.map(p => {
              const active = (cf.interestedPubs || []).includes(p.id);
              return <Pill key={p.id} label={p.name} icon={Ic.pub} active={active} color={Z.tm} onClick={() => setCf(x => ({ ...x, interestedPubs: active ? (x.interestedPubs || []).filter(id => id !== p.id) : [...(x.interestedPubs || []), p.id] }))} />;
            })}
          </div>
        </div>

        {/* Company + Lead Source */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
          <Inp label="Company Name" value={cf.name} onChange={e => setCf(x => ({ ...x, name: e.target.value }))} placeholder="Business name" />
          <Sel label="Lead Source" value={cf.leadSource} onChange={e => setCf(x => ({ ...x, leadSource: e.target.value }))} options={[{ value: "", label: "Select source..." }, ...LEAD_SOURCES.map(s => ({ value: s, label: s }))]} />
        </div>

        {/* Industry Categories — multi-select chips */}
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Industry</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxHeight: 100, overflowY: "auto", padding: 2 }}>
            {INDUSTRIES.map(ind => {
              const active = (cf.industries || []).includes(ind);
              return <Pill key={ind} label={ind} icon={Ic.tag} active={active} onClick={() => setCf(x => ({ ...x, industries: active ? (x.industries || []).filter(i => i !== ind) : [...(x.industries || []), ind] }))} />;
            })}
          </div>
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

        {/* Notes */}
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Notes</div>
          <textarea value={cf.notes || ""} onChange={e => setCf(x => ({ ...x, notes: e.target.value }))} placeholder="First impressions, how you met, what they're looking for, any context for the team..." rows={3} style={{ width: "100%", background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: R, padding: CARD.pad, color: Z.tx, fontSize: FS.base, outline: "none", resize: "vertical", fontFamily: "'Source Sans 3',sans-serif", lineHeight: 1.5, boxSizing: "border-box" }} />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn v="secondary" onClick={() => setCmo(false)}>Cancel</Btn>
          <Btn onClick={saveC} disabled={!cf.name}>{ec ? "Save Changes" : "Create Client"}</Btn>
        </div>
      </div>
    </Modal>

    <Modal open={oppMo} onClose={() => setOppMo(false)} title={oppKitSent ? "Sent!" : oppSendKit ? "Send Rate Cards" : editOppId ? "Opportunity" : "New Opportunity"} width={560}>
      {oppKitSent ? <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", padding: 16 }}><Ic.check size={28} color={Z.su} /><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>Sent to {opp.company}!</div><Btn v="secondary" onClick={() => setOppMo(false)}>Close</Btn></div>
      : oppSendKit ? <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 5 }}>{dropdownPubs.map(p => <button key={p.id} onClick={() => setOppKitPubs(k => k.includes(p.id) ? k.filter(x => x !== p.id) : [...k, p.id])} style={{ padding: "10px 14px", borderRadius: Ri, border: `1px solid ${Z.bg === "#08090D" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.5)"}`, background: oppKitPubs.includes(p.id) ? Z.as : Z.bg, cursor: "pointer", textAlign: "left" }}><div style={{ fontSize: FS.base, fontWeight: FW.bold, color: oppKitPubs.includes(p.id) ? Z.ac : Z.tx }}>{p.name}</div></button>)}</div><TA label="Message" value={oppKitMsg} onChange={e => setOppKitMsg(e.target.value)} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Btn v="secondary" onClick={() => setOppSendKit(false)}>Back</Btn><Btn disabled={oppKitPubs.length === 0} onClick={sendKit}><Ic.mail size={12} /> Send</Btn></div></div>
      : <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><Inp label="Company" data-opp-company value={opp.company} onChange={e => setOpp(x => ({ ...x, company: e.target.value }))} />{!editOppId && opp.company.length > 1 && clients.filter(c => c.name.toLowerCase().includes(opp.company.toLowerCase())).slice(0, 3).map(c => <button key={c.id} onClick={() => setOpp(x => ({ ...x, company: c.name, contact: c.contacts?.[0]?.name || "", email: c.contacts?.[0]?.email || "", phone: c.contacts?.[0]?.phone || "" }))} style={{ padding: "6px 12px", background: Z.sa, border: `1px solid ${Z.bd}`, borderRadius: Ri, cursor: "pointer", fontSize: FS.sm, color: Z.ac, fontWeight: FW.bold, textAlign: "left" }}>→ {c.name}</button>)}<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}><Inp label="Contact" value={opp.contact} onChange={e => setOpp(x => ({ ...x, contact: e.target.value }))} />
        <Sel label="Source" value={opp.source} onChange={e => setOpp(x => ({ ...x, source: e.target.value }))} options={OPP_SOURCES} />
        </div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}><Inp label="Email" value={opp.email} onChange={e => setOpp(x => ({ ...x, email: e.target.value }))} />
        <Inp label="Phone" value={opp.phone} onChange={e => setOpp(x => ({ ...x, phone: e.target.value }))} />
        </div>{editOppId && (() => { const s = sales.find(x => x.id === editOppId); const n = s?.oppNotes || []; return n.length > 0 && <div style={{ background: Z.bg, borderRadius: Ri, border: `1px solid ${Z.bd}`, padding: 16, maxHeight: 90, overflowY: "auto" }}><div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Activity Log</div>{n.slice().reverse().map(x => <div key={x.id} style={{ padding: "3px 0", fontSize: FS.sm, color: Z.tx, borderBottom: `1px solid ${Z.bd}` }}>{x.text} <span style={{ color: Z.td }}>{x.date}</span></div>)}</div>; })()}<TA label="Add Note" value={opp.notes} onChange={e => setOpp(x => ({ ...x, notes: e.target.value }))} placeholder="Notes..." />
        <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}><Btn v="secondary" onClick={() => setOppMo(false)}>Cancel</Btn><Btn v="secondary" onClick={() => { if (!opp.company) return; setOppSendKit(true); setOppKitMsg(`Hi ${opp.contact},\n\nRate cards attached.\n\nBest,\n${COMPANY.sales.name}`); }}><Ic.mail size={12} /> Rate Cards</Btn><Btn v="secondary" onClick={oppToProposal}><Ic.send size={12} /> Create Proposal</Btn><Btn onClick={() => saveOpp()}>{editOppId ? "Save" : "Create"}</Btn></div></div>}
    </Modal>

    {/* PROPOSAL BUILDER */}
    <Modal open={propMo} onClose={closePropMo} title={propStep === "sent" ? "Sent!" : propStep === "email" ? `Send Proposal \u2014 ${cn(propClient)}` : `Build Proposal \u2014 ${cn(propClient)}`} width={1100}>
      {propStep === "sent" ? <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", padding: 16 }}><Ic.check size={28} color={Z.su} /><div style={{ fontSize: FS.base, color: Z.tm }}>Proposal sent — {propLineItems.length} items · <b style={{ color: Z.su }}>${pTotal.toLocaleString()}</b></div><div style={{ fontSize: FS.sm, color: Z.td, maxWidth: 340, textAlign: "center" }}>When the client signs, this will convert to a contract and create confirmed sales orders.</div><div style={{ display: "flex", gap: 6, marginTop: 4 }}><Btn v="success" onClick={async () => { await signProposal(editPropId || proposals[proposals.length - 1]?.id); setPropMo(false); setPropPending(null); }}>Client Signed → Convert to Contract</Btn><Btn v="secondary" onClick={() => { setPropMo(false); setPropPending(null); }}>Close</Btn></div></div>
      : propStep === "email" ? <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "60vh" }}><div><label style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.tm, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Recipients</label><div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{(clients.find(c => c.id === propClient)?.contacts || []).filter(c => c.email).map(ct => <button key={ct.email} onClick={() => toggleRecipient(ct.email)} style={{ padding: "5px 10px", borderRadius: R, border: `1px solid ${propEmailRecipients.includes(ct.email) ? Z.go : Z.bd}`, background: propEmailRecipients.includes(ct.email) ? Z.go : Z.bg, cursor: "pointer" }}><span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: propEmailRecipients.includes(ct.email) ? INV.light : Z.tx }}>{ct.name}</span><div style={{ fontSize: FS.sm, color: propEmailRecipients.includes(ct.email) ? INV.light + "b3" : Z.tm }}>{ct.email}</div></button>)}</div></div><div style={{ flex: 1, display: "flex", flexDirection: "column" }}><label style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.tm, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Message</label><textarea value={propEmailMsg} onChange={e => setPropEmailMsg(e.target.value)} style={{ flex: 1, width: "100%", padding: "12px 14px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.base, fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box" }} /></div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}><Btn v="secondary" onClick={() => setPropStep("build")}>Back</Btn><Btn v="secondary" disabled={propEmailRecipients.length === 0 || propSending} onClick={() => sendProposalEmail("draft")}>{propSending ? "Creating..." : "Save Gmail Draft"}</Btn><Btn disabled={propEmailRecipients.length === 0 || propSending} onClick={() => sendProposalEmail("send")}><Ic.send size={12} /> {propSending ? "Sending..." : "Send Now"}</Btn></div></div>
      : <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: "45vh" }}><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}><Sel label="Client" value={propClient} onChange={e => setPropClient(e.target.value)} options={clients.map(c => ({ value: c.id, label: c.name }))} /><Inp label="Proposal Name" value={propName} onChange={e => setPropName(e.target.value)} /></div><div style={{ display: "flex", gap: 5, alignItems: "flex-end" }}><div style={{ flex: 1 }}><Sel label="Add Publication" data-prop-pub value={propAddPubId} onChange={e => setPropAddPubId(e.target.value)} options={dropdownPubs.map(p => ({ value: p.id, label: p.name }))} /></div><Btn onClick={addPropPub} disabled={propPubs.some(pp => pp.pubId === propAddPubId)}><Ic.plus size={12} /> Add</Btn></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 320, overflowY: "auto" }}>{propPubs.map((pp, pi) => { const pub = pubs.find(p => p.id === pp.pubId); const isExp = propExpandedPub === pp.pubId; if (!isExp) return <button key={pp.pubId} onClick={() => setPropExpandedPub(pp.pubId)} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", ...glass(), borderRadius: Ri, cursor: "pointer", width: "100%" }}><span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx }}>{pub?.name} ▸</span><span style={{ fontSize: FS.sm, color: Z.su, fontWeight: FW.bold }}>{pubSummary(pp)}</span></button>; const pI = issues.filter(i => i.pubId === pp.pubId && i.date >= today).slice(0, 24); return <div key={pp.pubId} style={{ background: Z.bg, border: `1px solid ${Z.ac}40`, borderRadius: R, padding: CARD.pad }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span onClick={() => setPropExpandedPub(null)} style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, cursor: "pointer" }}>{pub?.name} ▾</span>
          <button onClick={() => removePropPub(pp.pubId)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.da, fontSize: FS.md, fontWeight: FW.black }}>×</button></div>
          <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>{[3,6,12].map(m => <button key={m} onClick={() => selectIssueRange(pi, m)} style={{ padding: "3px 10px", borderRadius: R, border: `1px solid ${Z.bd}`, background: Z.sa, cursor: "pointer", fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{m}mo</button>)}<button onClick={() => setPropPubs(pps => pps.map((p, i) => i !== pi ? p : { ...p, issues: [] }))} style={{ padding: "3px 10px", borderRadius: R, border: `1px solid ${Z.bd}`, background: Z.sa, cursor: "pointer", fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm }}>Clear</button></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>{pI.map(iss => { const sel = pp.issues.some(x => x.issueId === iss.id); return <button key={iss.id} onClick={() => togglePropIssue(pi, iss.id)} style={{ padding: "4px 8px", borderRadius: R, border: `1px solid ${sel ? Z.go : Z.bd}`, background: sel ? Z.go : "transparent", cursor: "pointer", fontSize: FS.sm, fontWeight: FW.bold, color: sel ? INV.light : Z.tm }}>{iss.label}</button>; })}</div>{pp.issues.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{pp.issues.map(iss => { const ad = pub?.adSizes?.[iss.adSizeIdx]; return <div key={iss.issueId} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 60px 24px", gap: 5, padding: "4px 6px", background: Z.sa, borderRadius: R }}><span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{issLabel(iss.issueId)}</span><select value={iss.adSizeIdx} onChange={e => setIssueAdSize(pi, iss.issueId, +e.target.value)} style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: R, padding: "3px", color: Z.tx, fontSize: FS.sm, outline: "none" }}>{(pub?.adSizes || []).map((a, ai) => <option key={ai} value={ai}>{a.name}</option>)}</select><span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx, textAlign: "right" }}>${(ad?.[autoTier] || 0).toLocaleString()}</span><button onClick={() => applyAdSizeBelow(pi, iss.issueId, iss.adSizeIdx)} title="Apply below" style={{ background: "none", border: `1px solid ${Z.bd}`, borderRadius: R, cursor: "pointer", fontSize: FS.sm, color: Z.tx, fontWeight: FW.heavy }}>↓</button></div>; })}</div>}</div>; })}</div>
        {propLineItems.length > 0 && <div style={{ background: Z.sa, borderRadius: R, padding: CARD.pad, border: `1px solid ${Z.bd}` }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: FS.sm, color: Z.tm }}>{totalInsertions} insertions · {autoTermLabel}</span><span style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.su }}>${pTotal.toLocaleString()}</span></div>{monthSpan > 1 && <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}><input type="checkbox" checked={propPayPlan} onChange={e => setPropPayPlan(e.target.checked)} style={{ accentColor: Z.ac }} /><span style={{ fontSize: FS.sm, color: Z.tx }}>Payment: {monthSpan}mo × ${pMonthly.toLocaleString()}/mo</span></div>}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Btn v="secondary" onClick={closePropMo}>Cancel</Btn><Btn v="secondary" disabled={propLineItems.length === 0 || propSending} onClick={async () => { setPropSending(true); try { const dp = { clientId: propClient, name: propName, term: autoTermLabel, termMonths: monthSpan, lines: propLineItems.map(li => ({ ...li, issueDate: issueMap[li.issueId]?.date || null })), total: pTotal, payPlan: propPayPlan, monthly: pMonthly, status: "Draft", date: today, renewalDate: null, sentTo: [] }; if (editPropId) { await updateProposal(editPropId, dp); } else { const result = await insertProposal(dp); if (result?.id && propPending) { setSales(sl => sl.map(s => s.id === propPending ? { ...s, proposalId: result.id, status: "Proposal" } : s)); setPropPending(null); } } setPropMo(false); } finally { setPropSending(false); } }}>{propSending ? "Saving..." : "Save Draft"}</Btn><Btn disabled={propLineItems.length === 0 || propSending} onClick={goToEmailStep}><Ic.send size={12} /> Next: Send</Btn></div>
      </div>}
    </Modal>

    {/* EMAIL COMPOSE MODAL */}
    <Modal open={emailMo} onClose={() => setEmailMo(false)} title="Compose Email" width={600}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Inp label="To" value={emailTo} onChange={e => setEmailTo(e.target.value)} />
        <Inp label="Subject" value={emailSubj} onChange={e => setEmailSubj(e.target.value)} />
        <TA label="Body" value={emailBody} onChange={e => setEmailBody(e.target.value)} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="secondary" onClick={() => setEmailMo(false)}>Cancel</Btn>
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
          <Btn v="secondary" onClick={() => setCalMo(false)}>Cancel</Btn>
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
