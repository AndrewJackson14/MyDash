import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { computeClientStatus, CLIENT_STATUS_COLORS } from "../constants";

// Derives every read-only datum the ClientProfile renders. Pulls
// email_log + newsletter_drafts on mount; everything else is
// computed from props (sales / contracts / invoices / payments).
//
// Wave 2 — extracted from ClientProfile monolith. Returns one big bag
// rather than splitting into multiple hooks because the values are
// densely cross-referenced (timeline depends on contracts + sales +
// proposals; opportunity panel depends on monthlySpend + status +
// peers, etc.). Splitting would force the parent to re-pass them as
// props anyway.
export function useClientProfileData({
  clientId, vc, clients, sales, pubs, issues, proposals, contracts, invoices, payments,
  today,
}) {
  // email_log — Sent History feed in the right column
  const [emailLog, setEmailLog] = useState([]);
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("email_log")
        .select("id, type, direction, from_email, to_email, subject, status, error_message, sent_by, ref_type, ref_id, gmail_message_id, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) { console.error("email_log load error:", error); return; }
      if (!cancelled) setEmailLog(data || []);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  // Advertiser eBlasts (newsletter_drafts.draft_type='eblast')
  const [clientEblasts, setClientEblasts] = useState([]);
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("newsletter_drafts")
        .select("id, publication_id, subject, advertiser_name, status, sent_at, recipient_count, open_count, click_count, updated_at")
        .eq("draft_type", "eblast")
        .eq("client_id", clientId)
        .order("updated_at", { ascending: false });
      if (!cancelled) setClientEblasts(data || []);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (!vc) return null;

  const cS = sales.filter(s => s.clientId === vc.id);
  const closedCS = cS.filter(s => s.status === "Closed");
  const activeCS = cS.filter(s => s.status !== "Closed");
  const comms = (vc.comms || []).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const primaryContact = (vc.contacts || [])[0] || {};
  const daysSinceContact = comms.length > 0 ? Math.floor((new Date() - new Date(comms[0].date)) / 86400000) : null;
  const clientProposals = (proposals || []).filter(p => p.clientId === vc.id);

  // Revenue
  const revByPub = pubs.map(p => ({
    pub: p,
    rev: closedCS.filter(s => s.publication === p.id).reduce((sm, x) => sm + (x.amount || 0), 0),
    count: closedCS.filter(s => s.publication === p.id).length,
  })).filter(r => r.rev > 0).sort((a, b) => b.rev - a.rev);
  const maxPubRev = Math.max(...revByPub.map(r => r.rev), 1);
  const activePubIds = [...new Set(cS.map(s => s.publication))];
  const crossSellPubs = pubs.filter(p => !activePubIds.includes(p.id));
  const totalRevenue = closedCS.reduce((s, x) => s + (x.amount || 0), 0);
  const avgDeal = closedCS.length > 0 ? Math.round(totalRevenue / closedCS.length) : 0;

  // Key dates
  const lastAdDate = closedCS.sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0]?.date;
  const lastContractDate = clientProposals.filter(p => p.status === "Signed & Converted")
    .sort((a, b) => (b.closedAt || b.date || "").localeCompare(a.closedAt || a.date || ""))[0]?.closedAt?.slice(0, 10)
    || clientProposals.filter(p => p.status === "Signed & Converted")[0]?.date;
  const firstSaleDate = closedCS.sort((a, b) => (a.date || "").localeCompare(b.date || ""))[0]?.date;
  const yearsAsClient = firstSaleDate ? Math.max(1, Math.round((new Date() - new Date(firstSaleDate)) / (365.25 * 86400000) * 10) / 10) : 0;

  // Seasonal
  const monthlySpend = Array(12).fill(0);
  closedCS.forEach(s => { if (s.date) { const m = parseInt(s.date.slice(5, 7)) - 1; monthlySpend[m] += s.amount || 0; } });
  const maxMonthSpend = Math.max(...monthlySpend, 1);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const peakMonth = monthlySpend.indexOf(Math.max(...monthlySpend));
  const quietMonth = monthlySpend.indexOf(Math.min(...monthlySpend));

  // Product adoption
  const hasPrint = cS.some(s => !s.productType || s.productType === "display_print");
  const hasDigital = cS.some(s => s.productType === "web" || s.productType === "newsletter" || s.productType === "eblast");
  const hasSponsored = cS.some(s => s.productType === "sponsored_content" || s.productType === "advertorial");

  // Status
  const clientStatus = vc.status || computeClientStatus(vc.id, sales, issues);
  const stColor = CLIENT_STATUS_COLORS[clientStatus] || CLIENT_STATUS_COLORS.Renewal || CLIENT_STATUS_COLORS.Lead;

  // Industry benchmark
  const vcIndustries = vc.industries || [];
  const industryPeers = vcIndustries.length > 0
    ? clients.filter(c => c.id !== vc.id && (c.industries || []).some(ind => vcIndustries.includes(ind)))
    : [];
  const peerAvgSpend = industryPeers.length > 0
    ? Math.round(industryPeers.reduce((s, c) => s + (c.totalSpend || 0), 0) / industryPeers.length)
    : 0;
  const peerTopSpender = [...industryPeers].sort((a, b) => (b.totalSpend || 0) - (a.totalSpend || 0))[0];
  const peerTopSpend = peerTopSpender?.totalSpend || 0;

  // Surveys
  const surveys = (vc.surveys || []).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const avgScore = surveys.length > 0
    ? (surveys.reduce((s, x) => s + (x.overallScore || 0), 0) / surveys.length).toFixed(1)
    : null;

  // Contracts
  const clientContracts = (contracts || [])
    .filter(c => c.clientId === vc.id)
    .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
  const activeContracts = clientContracts.filter(c => c.status === "active");

  // Financial
  const clientInvoices = (invoices || []).filter(i => i.clientId === vc.id);
  const clientInvoiceIds = new Set(clientInvoices.map(i => i.id));
  const clientPayments = (payments || []).filter(p => clientInvoiceIds.has(p.invoiceId));
  const openInvoices = clientInvoices.filter(i => ["sent", "overdue", "partially_paid", "draft"].includes(i.status) && (i.balanceDue || 0) > 0);
  const paidInvoices = clientInvoices.filter(i => i.status === "paid");
  const currentBalance = openInvoices.reduce((s, i) => s + (i.balanceDue || 0), 0);
  const overdueBalance = openInvoices.filter(i => i.dueDate && i.dueDate < today).reduce((s, i) => s + (i.balanceDue || 0), 0);
  const lifetimeBilled = clientInvoices.reduce((s, i) => s + (i.total || 0), 0);
  const lifetimePaid = clientPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const clientDso = (() => {
    let totalDays = 0, totalAmt = 0;
    paidInvoices.forEach(i => {
      if (!i.issueDate || !i.total) return;
      const lastPay = clientPayments.filter(p => p.invoiceId === i.id)
        .sort((a, b) => (b.receivedAt || "").localeCompare(a.receivedAt || ""))[0];
      if (!lastPay?.receivedAt) return;
      const days = (new Date(lastPay.receivedAt.slice(0, 10)) - new Date(i.issueDate)) / 86400000;
      if (days < 0) return;
      totalDays += days * i.total;
      totalAmt += i.total;
    });
    return totalAmt > 0 ? Math.round(totalDays / totalAmt) : null;
  })();
  const lastPayment = [...clientPayments].sort((a, b) => (b.receivedAt || "").localeCompare(a.receivedAt || ""))[0];
  const oldestOpenInvoice = openInvoices.length > 0
    ? [...openInvoices].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))[0]
    : null;

  // Purchase timeline
  const timelineYears = (() => {
    const byYear = {};
    const ensureYear = (y) => {
      if (!byYear[y]) byYear[y] = { year: y, contracts: [], standaloneSales: [], proposals: [], total: 0, adCount: 0 };
      return byYear[y];
    };

    clientContracts.forEach(ct => {
      const y = (ct.startDate || ct.createdAt || "").slice(0, 4) || "Undated";
      const ads = closedCS.filter(s => s.contractId === ct.id).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      const fulfilled = ads.reduce((s, x) => s + (x.amount || 0), 0);
      const pct = ct.totalValue > 0 ? Math.min(100, Math.round((fulfilled / ct.totalValue) * 100)) : 0;
      ensureYear(y).contracts.push({ ...ct, ads, fulfilled, pct });
    });

    closedCS.filter(s => !s.contractId).forEach(s => {
      const y = (s.date || "").slice(0, 4) || "Undated";
      ensureYear(y).standaloneSales.push(s);
    });

    clientProposals.forEach(p => {
      const converted = p.status === "Signed & Converted";
      const linkedContract = converted && p.contractId ? clientContracts.find(c => c.id === p.contractId) : null;
      const contractCancelled = linkedContract && linkedContract.status === "cancelled";
      if (converted && !contractCancelled) return;
      const y = (p.date || p.closedAt || "").slice(0, 4) || "Undated";
      ensureYear(y).proposals.push({ ...p, _reappeared: contractCancelled });
    });

    Object.values(byYear).forEach(yr => {
      const contractAdTotal = yr.contracts.reduce((s, c) => s + c.fulfilled, 0);
      const contractAdCount = yr.contracts.reduce((s, c) => s + c.ads.length, 0);
      const standaloneTotal = yr.standaloneSales.reduce((s, x) => s + (x.amount || 0), 0);
      yr.total = contractAdTotal + standaloneTotal;
      yr.adCount = contractAdCount + yr.standaloneSales.length;
      yr.standaloneSales.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      yr.contracts.sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
    });

    return Object.values(byYear).sort((a, b) => b.year.localeCompare(a.year));
  })();

  return {
    emailLog, clientEblasts,
    cS, closedCS, activeCS, comms, primaryContact, daysSinceContact, clientProposals,
    revByPub, maxPubRev, crossSellPubs, totalRevenue, avgDeal,
    lastAdDate, lastContractDate, firstSaleDate, yearsAsClient,
    monthlySpend, maxMonthSpend, monthNames, peakMonth, quietMonth,
    hasPrint, hasDigital, hasSponsored,
    clientStatus, stColor,
    vcIndustries, industryPeers, peerAvgSpend, peerTopSpender, peerTopSpend,
    surveys, avgScore,
    clientContracts, activeContracts,
    clientInvoices, clientPayments, openInvoices, paidInvoices,
    currentBalance, overdueBalance, lifetimeBilled, lifetimePaid,
    clientDso, lastPayment, oldestOpenInvoice,
    timelineYears,
  };
}
