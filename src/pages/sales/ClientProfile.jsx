import { useState, useEffect, useRef } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R, INV } from "../../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Card, SB, Modal, EntityLink } from "../../components/ui";
import { useNav } from "../../hooks/useNav";
import AssetPanel from "../../components/AssetPanel";
import EntityThread from "../../components/EntityThread";
import { CONTACT_ROLES, COMM_TYPES, COMM_AUTHORS } from "../../constants";
import { computeClientStatus, CLIENT_STATUS_COLORS, INDUSTRIES, actInfo } from "./constants";
import { useAppData } from "../../hooks/useAppData";
import { supabase, EDGE_FN_URL } from "../../lib/supabase";
import SendTearsheetModal from "../../components/SendTearsheetModal";
import { fmtTimeRelative } from "../../lib/formatters";

// Shared style for the four header action buttons (Call · Email ·
// Proposal · Meeting). Tinted by the verb's accent color so the
// row reads as four distinct surfaces, not a quartet of grey boxes.
function actionBtnStyle(enabled, accent) {
  return {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 6, padding: "12px 4px", minHeight: 64,
    background: enabled ? `${accent}10` : Z.sa,
    color: enabled ? accent : Z.td,
    border: `1px solid ${enabled ? `${accent}40` : Z.bd}`,
    borderRadius: Ri,
    fontSize: FS.xs, fontWeight: FW.heavy,
    fontFamily: COND, letterSpacing: 0.5, textTransform: "uppercase",
    textDecoration: "none",
    cursor: enabled ? "pointer" : "not-allowed",
    opacity: enabled ? 1 : 0.5,
  };
}

// Anthony P5i — per-sale tearsheet upload cell. Inline file picker
// hits the upload-tearsheet edge function, then optimistically
// updates the parent sales array via setSales so the row's status
// flips to ✓ Uploaded immediately. Resilient to no-setSales callers
// — falls back to a no-op (the page reload will pick up the new
// tearsheet_url).
function TearsheetCell({ sale, client, setSales }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [sendOpen, setSendOpen] = useState(false);
  const inputRef = useRef(null);
  const hasTearsheet = !!sale.tearsheetUrl;
  const isImage = sale.tearsheetKind === "image"
    || (hasTearsheet && /\.(jpe?g|png|webp|gif|avif|heic)(\?|$)/i.test(sale.tearsheetUrl));

  const onPick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    upload(file);
  };

  const upload = async (file) => {
    if (uploading) return;
    setUploading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("not signed in");
      const form = new FormData();
      form.append("sale_id", sale.id);
      form.append("file", file);
      const res = await fetch(`${EDGE_FN_URL}/upload-tearsheet`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out?.error || `upload failed: ${res.status}`);
      if (typeof setSales === "function") {
        setSales(prev => prev.map(s => s.id === sale.id ? {
          ...s,
          tearsheetUrl: out.tearsheet_url,
          tearsheetFilename: out.filename,
          tearsheetKind: out.kind,
          tearsheetUploadedAt: new Date().toISOString(),
        } : s));
      }
    } catch (err) {
      console.error("Tearsheet upload failed:", err);
      setError(err.message || "upload failed");
      setTimeout(() => setError(null), 3000);
    }
    setUploading(false);
  };

  const triggerPick = () => {
    if (inputRef.current) inputRef.current.click();
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*,.pdf,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic"
        onChange={onPick}
        style={{ display: "none" }}
      />
      {hasTearsheet ? (
        <>
          <a
            href={sale.tearsheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open tearsheet · ${isImage ? "image" : "PDF"}${sale.tearsheetFilename ? ` · ${sale.tearsheetFilename}` : ""}`}
            style={{ fontSize: 10, color: Z.go, fontFamily: COND, fontWeight: FW.bold, padding: "1px 6px", background: Z.go + "12", borderRadius: 999, textDecoration: "none" }}
          >
            ✓ Tearsheet
          </a>
          <button
            onClick={() => setSendOpen(true)}
            title="Email tearsheet link to client"
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: Z.ac, fontSize: 11, fontFamily: COND }}
          >
            ✉
          </button>
          <button
            onClick={triggerPick}
            disabled={uploading}
            title="Replace tearsheet"
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: Z.tm, fontSize: 11, fontFamily: COND }}
          >
            {uploading ? "…" : "↺"}
          </button>
        </>
      ) : (
        <button
          onClick={triggerPick}
          disabled={uploading}
          title="Upload tearsheet (PDF or image)"
          style={{ background: "transparent", border: `1px dashed ${Z.bd}`, borderRadius: 999, padding: "1px 8px", cursor: "pointer", color: Z.tm, fontSize: 10, fontFamily: COND }}
        >
          {uploading ? "Uploading…" : "⤴ Tearsheet"}
        </button>
      )}
      {error && <span style={{ fontSize: 9, color: Z.da, fontFamily: COND }}>{error.slice(0, 40)}</span>}
      {sendOpen && (
        <SendTearsheetModal client={client} sale={sale} onClose={() => setSendOpen(false)} />
      )}
    </span>
  );
}

// Anthony P5g+P5h — paired button: copy the public portfolio URL
// (🔗) or open a send modal that emails it to a contact (✉).
// The portal is /ads/<portfolio_token> rendering ClientPortfolioPortal.
function PortfolioLinkButton({ client }) {
  const [copied, setCopied] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const token = client?.portfolioToken;
  const url = token ? `${window.location.origin}/ads/${token}` : "";
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };
  if (!token) return null;
  return (
    <>
      <span style={{
        display: "inline-flex", alignItems: "stretch",
        background: copied ? Z.go + "15" : Z.sf,
        border: `1px solid ${copied ? Z.go : Z.bd}`,
        borderRadius: Ri,
        overflow: "hidden",
        height: 26,
      }}>
        <button
          onClick={copy}
          title={`Copy ${url}`}
          style={{ background: "transparent", border: "none", padding: "0 10px", cursor: "pointer", color: copied ? Z.go : Z.tx, fontSize: 11, fontFamily: COND, fontWeight: FW.semi, letterSpacing: 0.5, textTransform: "uppercase" }}
        >
          {copied ? "✓ Copied" : "🔗 Tearsheet portfolio"}
        </button>
        <button
          onClick={() => setSendOpen(true)}
          title="Send portfolio link to client"
          style={{ background: "transparent", border: "none", borderLeft: `1px solid ${Z.bd}`, padding: "0 10px", cursor: "pointer", color: Z.ac, fontSize: 12, fontFamily: COND }}
        >
          ✉
        </button>
      </span>
      {sendOpen && (
        <SendPortfolioModal client={client} onClose={() => setSendOpen(false)} />
      )}
    </>
  );
}

// Anthony P5h — modal that calls the send-portfolio edge function.
function SendPortfolioModal({ client, onClose }) {
  const contacts = Array.isArray(client?.contacts) ? client.contacts : [];
  const [recipient, setRecipient] = useState(contacts[0]?.email || "");
  const [cc, setCc] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const send = async () => {
    if (sending || !recipient.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("not signed in");
      const res = await fetch(`${EDGE_FN_URL}/send-portfolio`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: client.id,
          recipient_email: recipient.trim(),
          cc_emails: cc.trim() || undefined,
          custom_message: message.trim() || undefined,
        }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out?.error || `send failed: ${res.status}`);
      setResult({ ok: true });
      setTimeout(onClose, 1200);
    } catch (err) {
      setResult({ error: err.message || "send failed" });
    }
    setSending(false);
  };

  return (
    <div onClick={() => !sending && onClose()} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: Z.sf, borderRadius: R, padding: 24, width: 460, maxWidth: "94vw",
        border: `1px solid ${Z.bd}`,
      }}>
        <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 4 }}>Send tearsheet portfolio</div>
        <div style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 14 }}>To {client?.name || "client"} — full archive of every tearsheet</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: COND, marginBottom: 4 }}>Recipient *</div>
            <input
              type="email"
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              placeholder="client@example.com"
              style={{ width: "100%", padding: "8px 10px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }}
            />
            {contacts.length > 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {contacts.slice(0, 5).map((c, i) => c?.email && (
                  <button
                    key={i}
                    onClick={() => setRecipient(c.email)}
                    style={{ background: "transparent", border: `1px solid ${Z.bd}`, borderRadius: 999, padding: "2px 8px", cursor: "pointer", fontSize: 10, color: Z.tm, fontFamily: COND }}
                  >
                    {(c.name || c.email).slice(0, 26)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: COND, marginBottom: 4 }}>CC (comma-separated)</div>
            <input
              type="text"
              value={cc}
              onChange={e => setCc(e.target.value)}
              placeholder="optional"
              style={{ width: "100%", padding: "8px 10px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }}
            />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: COND, marginBottom: 4 }}>Custom note (optional)</div>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Bookmark this — it's your permanent tearsheet archive."
              rows={3}
              style={{ width: "100%", padding: "8px 10px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", boxSizing: "border-box", outline: "none", resize: "vertical" }}
            />
          </div>

          {result?.error && <div style={{ fontSize: FS.xs, color: Z.da }}>{result.error}</div>}
          {result?.ok && <div style={{ fontSize: FS.xs, color: Z.go }}>✓ Portfolio sent</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 4 }}>
            <Btn sm v="secondary" onClick={onClose} disabled={sending}>Cancel</Btn>
            <Btn sm onClick={send} disabled={sending || !recipient.trim() || result?.ok}>
              {sending ? "Sending…" : result?.ok ? "Sent" : "Send portfolio"}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

const ClientProfile = ({
  clientId, clients, setClients, sales, setSales, pubs, issues, proposals, contracts,
  invoices, payments, team,
  commForm, setCommForm, onBack, onNavTo, onNavigate, onOpenProposal, onSetViewPropId,
  onOpenEditClient, onOpenEmail, onOpenMeeting,
  bus, updateClientContact,
}) => {
  const nav = useNav(onNavigate);
  const appData = useAppData();
  useEffect(() => {
    if (clientId && appData?.loadSalesForClient) appData.loadSalesForClient(clientId);
  }, [clientId, appData]);

  // Sent History — pulls from email_log so the user can see every outbound
  // proposal / contract / invoice / renewal that hit this client, with
  // delivery status. Lives alongside the relationship timeline.
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

  // Advertiser eBlasts attached to this client (newsletter_drafts with
  // draft_type='eblast' and client_id=us). Surfaces the campaign status
  // + open/click performance right on the client profile.
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

  const vc = (clients || []).find(x => x.id === clientId);
  if (!vc) return null;

  const pn = id => (pubs || []).find(p => p.id === id)?.name || "—";
  const cn = id => (clients || []).find(c => c.id === id)?.name || "—";
  const today = new Date().toISOString().slice(0, 10);
  const serif = "'Playfair Display',Georgia,serif";

  const cS = sales.filter(s => s.clientId === vc.id);
  const closedCS = cS.filter(s => s.status === "Closed");
  const activeCS = cS.filter(s => s.status !== "Closed");
  const comms = (vc.comms || []).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const primaryContact = (vc.contacts || [])[0] || {};
  const daysSinceContact = comms.length > 0 ? Math.floor((new Date() - new Date(comms[0].date)) / 86400000) : null;
  const clientProposals = (proposals || []).filter(p => p.clientId === vc.id);

  // Revenue computations
  const revByPub = pubs.map(p => ({ pub: p, rev: closedCS.filter(s => s.publication === p.id).reduce((sm, x) => sm + (x.amount || 0), 0), count: closedCS.filter(s => s.publication === p.id).length })).filter(r => r.rev > 0).sort((a, b) => b.rev - a.rev);
  const maxPubRev = Math.max(...revByPub.map(r => r.rev), 1);
  const activePubIds = [...new Set(cS.map(s => s.publication))];
  const crossSellPubs = pubs.filter(p => !activePubIds.includes(p.id));
  const totalRevenue = closedCS.reduce((s, x) => s + (x.amount || 0), 0);
  const avgDeal = closedCS.length > 0 ? Math.round(totalRevenue / closedCS.length) : 0;

  // Key dates
  const lastAdDate = closedCS.sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0]?.date;
  const lastContractDate = clientProposals.filter(p => p.status === "Signed & Converted").sort((a, b) => (b.closedAt || b.date || "").localeCompare(a.closedAt || a.date || ""))[0]?.closedAt?.slice(0, 10) || clientProposals.filter(p => p.status === "Signed & Converted")[0]?.date;
  const firstSaleDate = closedCS.sort((a, b) => (a.date || "").localeCompare(b.date || ""))[0]?.date;
  const yearsAsClient = firstSaleDate ? Math.max(1, Math.round((new Date() - new Date(firstSaleDate)) / (365.25 * 86400000) * 10) / 10) : 0;

  // Seasonal spending
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

  // Auto status
  const clientStatus = vc.status || computeClientStatus(vc.id, sales, issues);
  const stColor = CLIENT_STATUS_COLORS[clientStatus] || CLIENT_STATUS_COLORS.Renewal || CLIENT_STATUS_COLORS.Lead;

  // Industry benchmarks
  const vcIndustries = vc.industries || [];
  const industryPeers = vcIndustries.length > 0 ? clients.filter(c => c.id !== vc.id && (c.industries || []).some(ind => vcIndustries.includes(ind))) : [];
  const peerAvgSpend = industryPeers.length > 0 ? Math.round(industryPeers.reduce((s, c) => s + (c.totalSpend || 0), 0) / industryPeers.length) : 0;
  const peerTopSpender = [...industryPeers].sort((a, b) => (b.totalSpend || 0) - (a.totalSpend || 0))[0];
  const peerTopSpend = peerTopSpender?.totalSpend || 0;

  // Surveys
  const surveys = (vc.surveys || []).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const avgScore = surveys.length > 0 ? (surveys.reduce((s, x) => s + (x.overallScore || 0), 0) / surveys.length).toFixed(1) : null;

  // Contracts for this client
  const clientContracts = (contracts || []).filter(c => c.clientId === vc.id).sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
  const activeContracts = clientContracts.filter(c => c.status === "active");

  // ─── Financial: invoices & payments for this client ─────────
  const clientInvoices = (invoices || []).filter(i => i.clientId === vc.id);
  const clientInvoiceIds = new Set(clientInvoices.map(i => i.id));
  const clientPayments = (payments || []).filter(p => clientInvoiceIds.has(p.invoiceId));
  const openInvoices = clientInvoices.filter(i => ["sent","overdue","partially_paid","draft"].includes(i.status) && (i.balanceDue || 0) > 0);
  const paidInvoices = clientInvoices.filter(i => i.status === "paid");
  const currentBalance = openInvoices.reduce((s, i) => s + (i.balanceDue || 0), 0);
  const overdueBalance = openInvoices.filter(i => i.dueDate && i.dueDate < today).reduce((s, i) => s + (i.balanceDue || 0), 0);
  const lifetimeBilled = clientInvoices.reduce((s, i) => s + (i.total || 0), 0);
  const lifetimePaid = clientPayments.reduce((s, p) => s + (p.amount || 0), 0);
  // DSO for this client's paid invoices
  const clientDso = (() => {
    let totalDays = 0, totalAmt = 0;
    paidInvoices.forEach(i => {
      if (!i.issueDate || !i.total) return;
      const lastPay = clientPayments.filter(p => p.invoiceId === i.id).sort((a, b) => (b.receivedAt || "").localeCompare(a.receivedAt || ""))[0];
      if (!lastPay?.receivedAt) return;
      const days = (new Date(lastPay.receivedAt.slice(0, 10)) - new Date(i.issueDate)) / 86400000;
      if (days < 0) return;
      totalDays += days * i.total;
      totalAmt += i.total;
    });
    return totalAmt > 0 ? Math.round(totalDays / totalAmt) : null;
  })();
  const lastPayment = [...clientPayments].sort((a, b) => (b.receivedAt || "").localeCompare(a.receivedAt || ""))[0];
  const oldestOpenInvoice = openInvoices.length > 0 ? [...openInvoices].sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))[0] : null;

  const [finTab, setFinTab] = useState("invoices"); // invoices | payments | reports

  // Phase 7: delivery reports + cadence schedules. Loaded lazily when the
  // Reports tab is opened — typically empty, no point boot-fetching for
  // every client. Reports list view + a per-campaign cadence-change modal.
  const [deliveryReports, setDeliveryReports] = useState([]);
  const [deliverySchedules, setDeliverySchedules] = useState([]);
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [viewReportId, setViewReportId] = useState(null);
  const [cadenceModalSchedule, setCadenceModalSchedule] = useState(null);
  const digitalSales = (sales || []).filter(s => s.clientId === clientId && s.digitalProductId);
  useEffect(() => {
    if (finTab !== "reports" || reportsLoaded || !clientId) return;
    let cancelled = false;
    setReportsLoading(true);
    (async () => {
      const [{ data: reports }, { data: schedules }] = await Promise.all([
        supabase.from("delivery_reports").select("*").eq("client_id", clientId).order("period_end", { ascending: false }),
        digitalSales.length > 0
          ? supabase.from("delivery_report_schedules").select("*").in("sale_id", digitalSales.map(s => s.id))
          : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;
      setDeliveryReports(reports || []);
      setDeliverySchedules(schedules || []);
      setReportsLoaded(true);
      setReportsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [finTab, reportsLoaded, clientId, digitalSales.length]);

  // Purchase Timeline — group contracts, standalone sales, and orphan proposals by year.
  // A proposal is shown only if it did not convert to a contract, or if the contract it
  // became was later cancelled (so there's unfulfilled commitment to revisit).
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
      if (converted && !contractCancelled) return; // hide — rolled into the contract row
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
  const currentYear = new Date().toISOString().slice(0, 4);
  const [expandedYears, setExpandedYears] = useState(() => new Set([currentYear]));
  const [expandedContracts, setExpandedContracts] = useState(() => new Set());
  const toggleYear = (y) => setExpandedYears(s => { const n = new Set(s); n.has(y) ? n.delete(y) : n.add(y); return n; });
  const toggleContract = (id) => setExpandedContracts(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Helpers
  const addComm = () => { if (!commForm.note.trim()) return; setClients(cl => cl.map(c => c.id === vc.id ? { ...c, comms: [...(c.comms || []), { id: "cm" + Date.now(), type: commForm.type, author: commForm.author, date: today, note: commForm.note }] } : c)); setCommForm({ type: "Comment", author: "Account Manager", note: "" }); };
  const updClient = (f, v) => setClients(cl => cl.map(c => c.id === vc.id ? { ...c, [f]: v } : c));
  const updCt = (i, f, v) => setClients(cl => cl.map(c => c.id === vc.id ? { ...c, contacts: c.contacts.map((ct, j) => j === i ? { ...ct, [f]: v } : ct) } : c));
  const cc = t => ({ Email: Z.tx, Phone: Z.tx, Text: Z.tx, Comment: Z.tm, Survey: Z.tm, Result: Z.tm })[t] || Z.tm;
  const fmtD = d => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

    {/* ── HEADER ── */}
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div style={{ width: 56, height: 56, borderRadius: Ri, background: `hsl(${Math.abs([...(vc.name || "")].reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)) % 360}, 45%, 40%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: FW.black, color: INV.light, flexShrink: 0 }}>{(vc.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2)}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: FS.xxl, fontWeight: FW.black, color: Z.tx, fontFamily: serif }}>{primaryContact.name || vc.name}</h2>
          <span style={{ display: "inline-flex", padding: "3px 10px", borderRadius: Ri, fontSize: FS.xs, fontWeight: FW.heavy, background: stColor.bg, color: stColor.text, letterSpacing: 0.5, textTransform: "uppercase" }}>{clientStatus}</span>
          {/* Credit Hold toggle — sits alongside the status badge. Red
              solid when active, subtle outline when off. Click always
              routes through the same reason-prompt modal flow. */}
          <button
            type="button"
            onClick={async () => {
              const hold = !vc.creditHold;
              let reason = null;
              if (hold) {
                reason = window.prompt("Credit hold reason (e.g. 60+ days past due, bounced payment):");
                if (reason === null) return; // cancelled
              }
              setClients(cl => cl.map(c => c.id === vc.id ? { ...c, creditHold: hold, creditHoldReason: reason } : c));
              if (appData?.updateClient) appData.updateClient(vc.id, { creditHold: hold, creditHoldReason: reason });
            }}
            title={vc.creditHold ? (vc.creditHoldReason ? `Credit Hold — ${vc.creditHoldReason}. Click to release.` : "Credit Hold Active — click to release") : "Toggle Credit Hold"}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 10px", borderRadius: Ri, cursor: "pointer",
              fontSize: FS.xs, fontWeight: FW.heavy, fontFamily: COND,
              letterSpacing: 0.5, textTransform: "uppercase",
              background: vc.creditHold ? Z.da : "transparent",
              color: vc.creditHold ? INV.light : Z.td,
              border: `1px solid ${vc.creditHold ? Z.da : Z.bd}`,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            Credit Hold
          </button>
        </div>
        <div style={{ fontSize: 15, fontWeight: FW.semi, color: Z.tm, fontFamily: COND, marginTop: 1 }}>{vc.name}{primaryContact.name ? ` · ${primaryContact.role || "Contact"}` : ""}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
          {vcIndustries.length > 0 && vcIndustries.map(ind => <span key={ind} style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.pu, background: Z.pu + "14", padding: "2px 8px", borderRadius: Ri }}>{ind}</span>)}
          {vcIndustries.length === 0 && <span style={{ fontSize: FS.micro, fontWeight: FW.semi, color: Z.td, background: Z.sa, padding: "2px 8px", borderRadius: Ri }}>No industry set</span>}
          {vc.leadSource && <span style={{ fontSize: FS.micro, fontWeight: FW.semi, color: Z.tm, background: Z.sa, padding: "2px 8px", borderRadius: Ri }}>via {vc.leadSource}</span>}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
          {vc.totalSpend > 0 && <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.ac }}>Lifetime: ${vc.totalSpend?.toLocaleString()}</span>}
          {daysSinceContact !== null && <span style={{ fontSize: FS.base, color: daysSinceContact > 14 ? Z.da : daysSinceContact > 7 ? Z.wa : Z.ac, fontWeight: FW.bold }}>Last touch: {daysSinceContact === 0 ? "today" : daysSinceContact + "d ago"} ({comms[0]?.type})</span>}
          {daysSinceContact === null && <span style={{ fontSize: FS.base, color: Z.da, fontWeight: FW.bold }}>No contact logged</span>}
        </div>
        {(vc.interestedPubs || []).length > 0 && <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 6 }}>
          <span style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginRight: 2 }}>Interested:</span>
          {(vc.interestedPubs || []).map(pid => { const pub = pubs.find(p => p.id === pid); return pub ? <span key={pid} style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.tx, background: Z.sa, padding: "2px 6px", borderRadius: Ri }}>{pub.name.split(" ").map(w => w[0]).join("")}</span> : null; })}
        </div>}
        {/* Flag status — out of business / moved / etc. hides the client from active lists */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Flag:</span>
          <select
            value={vc.lapsedReason || ""}
            onChange={e => { const v = e.target.value || null; setClients(cl => cl.map(c => c.id === vc.id ? { ...c, lapsedReason: v } : c)); if (appData?.updateClient) appData.updateClient(vc.id, { lapsedReason: v }); }}
            style={{ background: vc.lapsedReason ? Z.wa + "15" : Z.bg, border: `1px solid ${vc.lapsedReason ? Z.wa : Z.bd}`, borderRadius: Ri, padding: "3px 8px", color: vc.lapsedReason ? Z.wa : Z.td, fontSize: FS.xs, fontWeight: FW.semi, fontFamily: COND, cursor: "pointer", outline: "none" }}
          >
            <option value="">Not flagged</option>
            <option value="out_of_business">Out of Business</option>
            <option value="moved">Moved Out of Area</option>
            <option value="out_of_market">Out of Market</option>
            <option value="duplicate">Duplicate</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
    </div>

    {/* ── CREDIT HOLD ALERT ── */}
    {vc.creditHold && <div style={{ padding: "12px 16px", background: `${Z.da}12`, border: `1px solid ${Z.da}40`, borderRadius: R, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <div>
        <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.da }}>Credit Hold Active</div>
        <div style={{ fontSize: FS.sm, color: Z.tm }}>
          {vc.creditHoldReason || "Production is blocked for this client."} Ad projects will not auto-create on sale close. Flatplan placement will warn.
        </div>
      </div>
      <Btn sm v="secondary" onClick={() => { setClients(cl => cl.map(c => c.id === vc.id ? { ...c, creditHold: false, creditHoldReason: null } : c)); if (appData?.updateClient) appData.updateClient(vc.id, { creditHold: false, creditHoldReason: null }); }}>Clear Hold</Btn>
    </div>}

    {/* ── RENEWAL ALERT ── */}
    {clientStatus === "Renewal" && <div style={{ padding: "12px 16px", background: `${Z.wa}15`, border: `1px solid ${Z.wa}40`, borderRadius: R, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <div>
        <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.wa }}>Renewal Due</div>
        <div style={{ fontSize: FS.sm, color: Z.tm }}>
          {vc.contractEndDate ? `Contract expires ${fmtD(vc.contractEndDate)}` : "This client is due for renewal."}
          {activeContracts.length > 0 && ` · Current: ${activeContracts[0].name} ($${(activeContracts[0].totalValue || 0).toLocaleString()})`}
        </div>
      </div>
      <Btn sm onClick={() => { if (onOpenProposal) onOpenProposal(vc.id); }}>Create Renewal Proposal</Btn>
    </div>}

    {/* ── ACTION BAR — Tier 2 CP-3. Four most-frequent verbs in
         thumb (or click) reach instead of scattered down the page:
         Call, Email, Proposal, Meeting. All four pre-fill the right
         modal/link and write to client.comms / activityLog as
         appropriate. Hidden when the client has no primary contact
         on file (Call/Email rely on it). */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
      <a
        href={primaryContact.phone ? `tel:${primaryContact.phone.replace(/[^0-9+]/g, "")}` : undefined}
        onClick={(e) => {
          if (!primaryContact.phone) { e.preventDefault(); return; }
          // Drop a Call comm immediately so the timeline reflects the
          // attempt even if the rep doesn't loop back to log a result.
          setClients(cl => cl.map(c => c.id === vc.id ? { ...c, comms: [...(c.comms || []), { id: "cm" + Date.now(), type: "Call", author: "Account Manager", date: today, note: `Tapped to call ${primaryContact.phone}` }] } : c));
        }}
        style={actionBtnStyle(primaryContact.phone, Z.ac)}
        title={primaryContact.phone || "No phone on file"}
      >
        <span style={{ fontSize: 20, lineHeight: 1 }}>📞</span>
        <span>Call</span>
      </a>
      <button
        type="button"
        onClick={() => onOpenEmail?.(vc)}
        disabled={!primaryContact.email || !onOpenEmail}
        style={actionBtnStyle(primaryContact.email && onOpenEmail, Z.ac)}
        title={primaryContact.email || "No email on file"}
      >
        <span style={{ fontSize: 20, lineHeight: 1 }}>✉️</span>
        <span>Email</span>
      </button>
      <button
        type="button"
        onClick={() => onOpenProposal?.(vc.id)}
        disabled={!onOpenProposal}
        style={actionBtnStyle(!!onOpenProposal, Z.go)}
        title="Build a proposal pre-filled for this client"
      >
        <span style={{ fontSize: 20, lineHeight: 1 }}>📄</span>
        <span>Proposal</span>
      </button>
      <button
        type="button"
        onClick={() => onOpenMeeting?.(vc)}
        disabled={!onOpenMeeting}
        style={actionBtnStyle(!!onOpenMeeting, Z.pu)}
        title="Schedule a meeting with this client"
      >
        <span style={{ fontSize: 20, lineHeight: 1 }}>📅</span>
        <span>Meeting</span>
      </button>
    </div>

    {/* ── PRIMARY CONTACT — surfaces the main contact's full details
         (name, role, email, phone, notes) at the top so a rep can reach
         them immediately without scrolling to the Contacts card. When
         there is no primary contact logged, prompts the user to add one. */}
    <Card style={{ borderLeft: `3px solid ${Z.ac}`, marginBottom: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Primary Contact</div>
          {primaryContact.name ? <>
            <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, fontFamily: serif }}>{primaryContact.name}</div>
            {primaryContact.role && <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tm, fontFamily: COND, marginTop: 2 }}>{primaryContact.role}</div>}
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
              {primaryContact.email && <a href={`mailto:${primaryContact.email}`} style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.ac, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}><Ic.mail size={12} /> {primaryContact.email}</a>}
              {primaryContact.phone && <a href={`tel:${primaryContact.phone}`} style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.ac, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}><Ic.phone size={12} /> {primaryContact.phone}</a>}
              {!primaryContact.email && !primaryContact.phone && <span style={{ fontSize: FS.sm, color: Z.td, fontStyle: "italic" }}>No email or phone set</span>}
            </div>
          </> : <div style={{ fontSize: FS.sm, color: Z.td, fontStyle: "italic" }}>No primary contact set. Add one in the Contacts card below.</div>}
        </div>
        {onOpenEditClient && <Btn sm v="ghost" onClick={() => onOpenEditClient(vc)}>Edit</Btn>}
      </div>
    </Card>

    {/* ── TWO-COLUMN LAYOUT ── */}
    <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16, alignItems: "start" }}>

      {/* ══ LEFT COLUMN ══ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Relationship Notes */}
        <Card style={{ borderLeft: `3px solid ${Z.wa}` }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Relationship Notes</div>
          <textarea value={vc.notes || ""} onChange={e => updClient("notes", e.target.value)} placeholder="Personal notes — preferences, interests, family, best time to call, how they like to be contacted, what matters to them..." style={{ width: "100%", minHeight: 120, background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: 10, color: Z.tx, fontSize: FS.md, outline: "none", resize: "vertical", fontFamily: "'Source Sans 3',sans-serif", lineHeight: 1.5, boxSizing: "border-box" }} />
        </Card>

        {/* Client Intelligence */}
        <Card>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Client Intelligence</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
            {[{ label: "Total Ads", value: closedCS.length }, { label: "Avg Deal", value: `$${avgDeal.toLocaleString()}` }, { label: "Years", value: yearsAsClient > 0 ? yearsAsClient : "New" }, { label: "Active Deals", value: activeCS.length }].map(m => <div key={m.label} style={{ textAlign: "center", padding: 16, background: Z.bg, borderRadius: Ri }}>
              <div style={{ fontSize: 18, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{m.value}</div>
              <div style={{ fontSize: 9, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5 }}>{m.label}</div>
            </div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
            {[{ label: "Last Ad Placed", value: fmtD(lastAdDate) }, { label: "Last Contract Signed", value: fmtD(lastContractDate) }, { label: "First Purchase", value: fmtD(firstSaleDate) }].map(d => <div key={d.label} style={{ padding: 16, background: Z.bg, borderRadius: Ri }}>
              <div style={{ fontSize: 9, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>{d.label}</div>
              <div style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx, marginTop: 2 }}>{d.value}</div>
            </div>)}
          </div>
          {closedCS.length > 0 && <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 6 }}>Spending Pattern</div>
            <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 50 }}>
              {monthlySpend.map((v, i) => <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ width: "100%", background: v > 0 ? (i === peakMonth ? Z.ac : Z.as) : Z.bg, borderRadius: Ri, height: `${Math.max(4, (v / maxMonthSpend) * 40)}px`, transition: "height 0.3s" }} />
                <span style={{ fontSize: 8, color: i === peakMonth ? Z.ac : Z.td, fontWeight: i === peakMonth ? 800 : 400 }}>{monthNames[i]}</span>
              </div>)}
            </div>
            <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 4 }}>Peak: <span style={{ fontWeight: FW.bold, color: Z.ac }}>{monthNames[peakMonth]}</span>{monthlySpend[quietMonth] === 0 && <span> · Quiet: <span style={{ fontWeight: FW.bold, color: Z.wa }}>{monthNames[quietMonth]}</span></span>}</div>
          </div>}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 6 }}>Product Adoption</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[{ label: "Print Ads", active: hasPrint }, { label: "Digital/Web", active: hasDigital }, { label: "Sponsored Content", active: hasSponsored }, { label: "Newsletter", active: cS.some(s => s.productType === "newsletter") }, { label: "E-Blast", active: cS.some(s => s.productType === "eblast") }, { label: "Creative Services", active: cS.some(s => s.productType === "creative") }].map(p => <span key={p.label} style={{ fontSize: FS.xs, fontWeight: FW.bold, padding: "3px 10px", borderRadius: Ri, background: p.active ? Z.as : Z.bg, color: p.active ? Z.ac : Z.td, border: `1px solid ${p.active ? Z.ac : Z.bd}` }}>{p.active ? "✓ " : ""}{p.label}</span>)}
            </div>
          </div>
          {revByPub.length > 0 && <div>
            <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 6 }}>Revenue by Publication</div>
            {revByPub.map(r => <div key={r.pub.id} style={{ marginBottom: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{r.pub.name}</span><span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.ac }}>${r.rev.toLocaleString()}</span></div>
              <div style={{ height: 4, background: Z.bg, borderRadius: Ri, marginTop: 2 }}><div style={{ height: "100%", borderRadius: Ri, width: `${(r.rev / maxPubRev) * 100}%`, background: Z.tm }} /></div>
            </div>)}
          </div>}
        </Card>

        {/* Client Satisfaction */}
        <Card style={{ borderLeft: `3px solid ${avgScore && avgScore >= 4 ? Z.su : avgScore && avgScore >= 3 ? Z.wa : avgScore ? Z.da : Z.bd}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Client Satisfaction</div>
            {avgScore && <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 22, fontWeight: FW.black, color: avgScore >= 4 ? Z.su : avgScore >= 3 ? Z.wa : Z.da, fontFamily: DISPLAY }}>{avgScore}</span>
              <span style={{ fontSize: FS.xs, color: Z.td }}>/5 avg ({surveys.length} survey{surveys.length !== 1 ? "s" : ""})</span>
            </div>}
          </div>
          {surveys.length === 0
            ? <div style={{ padding: 16, textAlign: "center", color: Z.td, fontSize: FS.base, background: Z.bg, borderRadius: Ri }}>No survey responses yet. Surveys auto-send 7 days after ad publication.</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {surveys.slice(0, 5).map((sv, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: Z.bg, borderRadius: Ri }}>
                <div><div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx }}>{sv.publication} — {sv.issue || "Ad Survey"}</div><div style={{ fontSize: FS.xs, color: Z.tm }}>{fmtD(sv.date)}</div></div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>{[1, 2, 3, 4, 5].map(n => <span key={n} style={{ fontSize: FS.md, color: n <= (sv.overallScore || 0) ? Z.tx : Z.bd }}>★</span>)}</div>
              </div>)}
            </div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: FS.sm, color: Z.tm, cursor: "pointer" }}>
              <input type="checkbox" checked={vc.surveyAutoSend !== false} onChange={e => updClient("surveyAutoSend", e.target.checked)} />
              Auto-send surveys (7 days after pub)
            </label>
          </div>
        </Card>

        {/* Contacts */}
        <Card style={{ borderLeft: `3px solid ${Z.ac}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Contacts</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={() => setClients(cl => cl.map(c => c.id === vc.id ? { ...c, contacts: [...(c.contacts || []), { name: "", email: "", phone: "", role: "Other" }] } : c))} style={{ background: "none", border: `1px solid ${Z.bd}`, borderRadius: Ri, cursor: "pointer", color: Z.ac, fontSize: FS.sm, fontWeight: FW.bold, padding: "2px 8px" }}>+ Add</button>
              {onOpenEditClient && <button onClick={() => onOpenEditClient(vc)} style={{ background: "none", border: `1px solid ${Z.bd}`, borderRadius: Ri, cursor: "pointer", color: Z.tm, fontSize: FS.sm, fontWeight: FW.semi, padding: "2px 8px" }}>Edit</button>}
            </div>
          </div>
          {(vc.contacts || []).map((ct, idx) => <div key={ct.id || idx} style={{ background: Z.bg, borderRadius: R, padding: 16, marginBottom: 4 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
              <Sel value={ct.role} onChange={e => updCt(idx, "role", e.target.value)} options={CONTACT_ROLES.map(r => ({ value: r, label: r }))} style={{ padding: "2px 24px 2px 6px", textTransform: "uppercase" }} />
              {idx === 0 && <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.wa, background: Z.ws, padding: "1px 5px", borderRadius: Ri }}>PRIMARY</span>}
            </div>
            <input value={ct.name} onChange={e => updCt(idx, "name", e.target.value)} placeholder="Name" style={{ display: "block", width: "100%", background: "none", border: "none", color: Z.tx, fontSize: FS.md, fontWeight: FW.semi, fontFamily: COND, outline: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 10, fontSize: FS.sm, color: Z.tm }}><span>{ct.email}</span>{ct.phone && <span>· {ct.phone}</span>}</div>
            {/* Per-contact Relationship Notes — distinct from the
                account-level notes above. Persists on blur so the
                textarea isn't chatty over the wire. Unsaved new
                contacts (no ct.id yet) save locally only; the user's
                next full-save via the Edit Client modal flushes them. */}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Relationship Notes</div>
              <textarea
                value={ct.notes || ""}
                onChange={e => updCt(idx, "notes", e.target.value)}
                onBlur={e => { if (ct.id && updateClientContact) updateClientContact(vc.id, ct.id, { notes: e.target.value }); }}
                placeholder="Preferred channel, family, interests, best time to call…"
                style={{ width: "100%", minHeight: 56, background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: 8, color: Z.tx, fontSize: FS.sm, outline: "none", resize: "vertical", fontFamily: "'Source Sans 3',sans-serif", lineHeight: 1.4, boxSizing: "border-box" }}
              />
            </div>
          </div>)}
        </Card>
      </div>

      {/* ══ RIGHT COLUMN (sticky) ══ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 20, maxHeight: "calc(100vh - 120px)", overflow: "hidden" }}>

        {/* Action Center */}
        <Card style={{ borderLeft: `3px solid ${daysSinceContact > 7 ? Z.da : Z.ac}`, background: daysSinceContact > 14 ? Z.ds : Z.sf }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Next Step</div>
          {activeCS.length > 0 ? <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx, fontFamily: COND, marginBottom: 8 }}>{activeCS[0].nextAction ? (typeof activeCS[0].nextAction === "string" ? activeCS[0].nextAction : activeCS[0].nextAction?.label || "Follow up") : "Follow up on active deal"}{activeCS[0].nextActionDate ? ` — ${activeCS[0].nextActionDate}` : ""}</div>
            : <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tm, fontFamily: COND, marginBottom: 8 }}>No active deals — time to reach out?</div>}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <Btn sm onClick={() => onOpenProposal(vc.id)}><Ic.send size={11} /> Draft Proposal</Btn>
            {closedCS.length > 0 && <Btn sm v="secondary" onClick={() => { if (bus) bus.emit("invoice.create", { clientId: vc.id, clientName: vc.name }); }}><Ic.invoice size={11} /> Create Invoice</Btn>}
            <Btn sm v="secondary" onClick={() => setCommForm({ type: "Phone", author: "Account Manager", note: "" })}>Log Call</Btn>
            <Btn sm v="secondary" onClick={() => setCommForm({ type: "Email", author: "Account Manager", note: "" })}>Log Email</Btn>
            {/* Anthony P5g/P5h — copy + send public tearsheet portfolio link */}
            {vc.portfolioToken && <PortfolioLinkButton client={vc} />}
          </div>
        </Card>

        {/* Communication Timeline */}
        <Card style={{ borderLeft: `3px solid ${Z.pu}`, display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Relationship Timeline ({comms.length})</div>
          <div style={{ background: Z.bg === "#08090D" ? "rgba(140,150,165,0.06)" : "rgba(255,255,255,0.25)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRadius: Ri, padding: 6, marginBottom: 6, border: `1px solid ${Z.bd}` }}>
            <div style={{ display: "flex", gap: 3, marginBottom: 3 }}>
              <Sel value={commForm.type} onChange={e => setCommForm(x => ({ ...x, type: e.target.value }))} options={[...COMM_TYPES, "Result", "Survey"].map(t => ({ value: t, label: t }))} style={{ padding: "3px 24px 3px 6px", flex: 1 }} />
              <Sel value={commForm.author} onChange={e => setCommForm(x => ({ ...x, author: e.target.value }))} options={COMM_AUTHORS.map(a => ({ value: a, label: a }))} style={{ padding: "3px 24px 3px 6px", flex: 1 }} />
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              <input value={commForm.note} onChange={e => setCommForm(x => ({ ...x, note: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") addComm(); }} placeholder="What happened..." style={{ flex: 1, background: Z.sa, border: "none", borderRadius: Ri, padding: "5px 8px", color: Z.tx, fontSize: FS.base, outline: "none" }} />
              <Btn sm onClick={addComm}>Log</Btn>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
            {comms.map(cm => <div key={cm.id} style={{ padding: "10px 14px", borderLeft: `3px solid ${cc(cm.type)}`, background: Z.bg, borderRadius: "0 2px 2px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: cc(cm.type) }}>{cm.type}</span><span style={{ fontSize: FS.xs, color: Z.td }}>{cm.date} · {cm.author}</span></div>
              <div style={{ fontSize: FS.base, color: Z.tx, lineHeight: 1.4, marginTop: 2 }}>{cm.note}</div>
            </div>)}
            {comms.length === 0 && <div style={{ padding: 16, textAlign: "center", color: Z.td, fontSize: FS.base }}>No communication logged yet</div>}
          </div>
        </Card>

        {/* Email History — both directions: outbound sends from us +
            inbound replies auto-ingested from Gmail (audit M-1). */}
        <Card style={{ borderLeft: `3px solid ${Z.ac}`, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Email History ({emailLog.length})</span>
            {emailLog.length > 0 && <span style={{ fontSize: FS.micro, color: Z.td, fontFamily: COND }}>Newest first</span>}
          </div>
          {emailLog.length === 0 ? (
            <div style={{ padding: 12, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No emails yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 220, overflowY: "auto" }}>
              {emailLog.map(e => {
                const isInbound = e.direction === "inbound";
                const statusColor = isInbound ? (Z.ac || "var(--action)")
                  : e.status === "sent" ? Z.go
                  : e.status === "failed" ? Z.da
                  : e.status === "draft" ? Z.wa
                  : Z.td;
                const typeLabel = isInbound ? "← inbound" : (e.type || "email").replace(/_/g, " ");
                const counterparty = isInbound ? (e.from_email || "(unknown sender)") : e.to_email;
                return <div key={e.id} style={{ padding: "7px 10px", background: isInbound ? (Z.ac || "var(--action)") + "08" : Z.bg, borderRadius: Ri, borderLeft: `2px solid ${statusColor}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: statusColor, textTransform: "uppercase", letterSpacing: 0.5 }}>{typeLabel}</span>
                    <span style={{ fontSize: FS.micro, color: Z.td }}>{fmtTimeRelative(e.created_at)}</span>
                  </div>
                  <div style={{ fontSize: FS.sm, color: Z.tx, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.subject || "(no subject)"}</div>
                  <div style={{ fontSize: FS.micro, color: Z.tm, marginTop: 1 }}>
                    {isInbound ? "from " : ""}{counterparty}
                    {!isInbound && e.status && e.status !== "sent" && <span style={{ color: statusColor, fontWeight: FW.bold, marginLeft: 6, textTransform: "uppercase" }}>· {e.status}</span>}
                  </div>
                  {e.error_message && <div style={{ fontSize: FS.micro, color: Z.da, marginTop: 2 }}>{e.error_message}</div>}
                </div>;
              })}
            </div>
          )}
        </Card>

        {/* Opportunity */}
        <Card style={{ borderLeft: `3px solid ${Z.or || Z.wa}`, flexShrink: 0 }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Opportunity</div>
          {(() => {
            const signals = [];
            if (clientStatus === "Renewal") signals.push({ text: "Last ordered ad runs within 30 days — renewal conversation is now", color: Z.da, icon: "🔥" });
            if (clientStatus === "Lapsed") { const daysSinceLast = lastAdDate ? Math.floor((new Date() - new Date(lastAdDate)) / 86400000) : null; signals.push({ text: `No future ads ordered${daysSinceLast ? ` · last ad ${daysSinceLast}d ago` : ""} — re-engage`, color: Z.wa, icon: "⏰" }); }
            if (closedCS.length > 0 && monthlySpend[peakMonth] > 0) { const now = new Date().getMonth(); const monthsUntilPeak = (peakMonth - now + 12) % 12; if (monthsUntilPeak > 0 && monthsUntilPeak <= 2) signals.push({ text: `Peak spending month (${monthNames[peakMonth]}) approaching — pitch now`, color: Z.ac, icon: "📈" }); }
            if (avgDeal > 0 && avgDeal < peerAvgSpend * 0.6 && peerAvgSpend > 0) signals.push({ text: `Spending below industry avg — room to grow`, color: Z.wa, icon: "💡" });
            return signals.length > 0 ? <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
              {signals.map((sig, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 14px", background: sig.color + "10", borderRadius: Ri, border: `1px solid ${sig.color}30` }}>
                <span style={{ flexShrink: 0 }}>{sig.icon}</span>
                <span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: sig.color, lineHeight: 1.3 }}>{sig.text}</span>
              </div>)}
            </div> : null;
          })()}
          {vcIndustries.length > 0 && industryPeers.length > 0 && <div style={{ padding: 16, background: Z.bg, borderRadius: Ri, marginBottom: 10 }}>
            <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Industry Benchmark ({vcIndustries[0]})</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><div style={{ fontSize: 9, color: Z.td, textTransform: "uppercase" }}>Peer Avg Spend</div><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: (vc.totalSpend || 0) >= peerAvgSpend ? Z.su : Z.wa }}>${peerAvgSpend.toLocaleString()}</div></div>
              <div><div style={{ fontSize: 9, color: Z.td, textTransform: "uppercase" }}>Top in Category</div><div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.ac }}>${peerTopSpend.toLocaleString()}</div>{peerTopSpender && <div style={{ fontSize: FS.micro, color: Z.tm }}>{peerTopSpender.name}</div>}</div>
            </div>
            <div style={{ fontSize: FS.xs, color: (vc.totalSpend || 0) >= peerAvgSpend ? Z.su : Z.wa, fontWeight: FW.bold, marginTop: 4 }}>{(vc.totalSpend || 0) >= peerAvgSpend ? "Above industry average" : `$${(peerAvgSpend - (vc.totalSpend || 0)).toLocaleString()} below average`}</div>
          </div>}
          {activeCS.length > 0 && <div style={{ marginBottom: 8 }}><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Active Pipeline ({activeCS.length})</div>{activeCS.map(s => <div key={s.id} style={{ padding: "4px 0", borderBottom: `1px solid ${Z.bd}` }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{pn(s.publication)} · {s.type}</span><span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.ac }}>${(s.amount || 0).toLocaleString()}</span></div></div>)}</div>}
          {crossSellPubs.length > 0 && <div style={{ marginBottom: 8 }}><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Not Yet Advertising In</div>{crossSellPubs.slice(0, 4).map(p => <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}><div style={{ width: 4, height: 14, borderRadius: Ri, background: Z.tm }} /><span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{p.name}</span><span style={{ fontSize: FS.micro, color: Z.tm }}>{p.circ?.toLocaleString()}</span></div>)}</div>}
        </Card>
        {/* Client Asset Library */}
        {vc?.clientCode && <Card style={{ marginTop: 10 }}>
          <AssetPanel path={`clients/${vc.clientCode}/assets`} title="Asset Library" clientId={vc.id} category="client_logo" />
        </Card>}
      </div>
    </div>
    {/* ── FINANCIAL — AR at-a-glance, invoices, payments ── */}
    {(clientInvoices.length > 0 || clientPayments.length > 0) && <Card style={{ borderLeft: `3px solid ${Z.pu}`, marginBottom: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Financial</span>
        <span style={{ fontSize: FS.xs, color: Z.td }}>{clientInvoices.length} invoice{clientInvoices.length === 1 ? "" : "s"} · {clientPayments.length} payment{clientPayments.length === 1 ? "" : "s"}</span>
      </div>
      {/* At-a-glance */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 12 }}>
        <div style={{ background: Z.bg, borderRadius: Ri, padding: "10px 12px" }}>
          <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Current Balance</div>
          <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: currentBalance > 0 ? (overdueBalance > 0 ? Z.da : Z.wa) : Z.su, fontFamily: DISPLAY }}>${currentBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          {overdueBalance > 0 && <div style={{ fontSize: FS.micro, color: Z.da, fontWeight: FW.bold }}>${overdueBalance.toLocaleString()} overdue</div>}
        </div>
        <div style={{ background: Z.bg, borderRadius: Ri, padding: "10px 12px" }}>
          <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Lifetime Billed</div>
          <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>${Math.round(lifetimeBilled).toLocaleString()}</div>
        </div>
        <div style={{ background: Z.bg, borderRadius: Ri, padding: "10px 12px" }}>
          <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Lifetime Paid</div>
          <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.go, fontFamily: DISPLAY }}>${Math.round(lifetimePaid).toLocaleString()}</div>
        </div>
        <div style={{ background: Z.bg, borderRadius: Ri, padding: "10px 12px" }}>
          <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Last Payment</div>
          {lastPayment ? <>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>${Math.round(lastPayment.amount).toLocaleString()}</div>
            <div style={{ fontSize: FS.micro, color: Z.tm }}>{fmtD(lastPayment.receivedAt?.slice(0, 10))}</div>
          </> : <div style={{ fontSize: FS.sm, color: Z.td, fontStyle: "italic" }}>Never</div>}
        </div>
        <div style={{ background: Z.bg, borderRadius: Ri, padding: "10px 12px" }}>
          <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>DSO</div>
          <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: clientDso == null ? Z.td : clientDso <= 30 ? Z.go : clientDso <= 60 ? Z.wa : Z.da, fontFamily: DISPLAY }}>{clientDso != null ? `${clientDso}d` : "—"}</div>
          {oldestOpenInvoice && <div style={{ fontSize: FS.micro, color: Z.tm }}>Oldest: {fmtD(oldestOpenInvoice.dueDate)}</div>}
        </div>
      </div>
      {/* Tabs: Invoices / Payments / Reports */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        <button onClick={() => setFinTab("invoices")} style={{ padding: "4px 12px", borderRadius: Ri, border: `1px solid ${finTab === "invoices" ? Z.ac : Z.bd}`, background: finTab === "invoices" ? Z.ac + "15" : "transparent", color: finTab === "invoices" ? Z.ac : Z.tm, cursor: "pointer", fontSize: FS.xs, fontWeight: FW.heavy, fontFamily: COND, textTransform: "uppercase" }}>Invoices ({clientInvoices.length})</button>
        <button onClick={() => setFinTab("payments")} style={{ padding: "4px 12px", borderRadius: Ri, border: `1px solid ${finTab === "payments" ? Z.ac : Z.bd}`, background: finTab === "payments" ? Z.ac + "15" : "transparent", color: finTab === "payments" ? Z.ac : Z.tm, cursor: "pointer", fontSize: FS.xs, fontWeight: FW.heavy, fontFamily: COND, textTransform: "uppercase" }}>Payments ({clientPayments.length})</button>
        {digitalSales.length > 0 && <button onClick={() => setFinTab("reports")} style={{ padding: "4px 12px", borderRadius: Ri, border: `1px solid ${finTab === "reports" ? Z.ac : Z.bd}`, background: finTab === "reports" ? Z.ac + "15" : "transparent", color: finTab === "reports" ? Z.ac : Z.tm, cursor: "pointer", fontSize: FS.xs, fontWeight: FW.heavy, fontFamily: COND, textTransform: "uppercase" }}>Reports{reportsLoaded ? ` (${deliveryReports.length})` : ""}</button>}
      </div>
      {/* Invoices list */}
      {finTab === "invoices" && <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${Z.bd}`, borderRadius: Ri }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "140px 100px 100px 100px 100px 80px", gap: 10, alignItems: "center", padding: "8px 10px", background: Z.sa, borderBottom: `1px solid ${Z.bd}`, fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, position: "sticky", top: 0, zIndex: 1 }}>
          <span>Invoice #</span>
          <span>Issued</span>
          <span>Due</span>
          <span style={{ textAlign: "right" }}>Total</span>
          <span style={{ textAlign: "right" }}>Paid</span>
          <span style={{ textAlign: "right" }}>Status</span>
        </div>
        {clientInvoices.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No invoices</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: 4 }}>
          {[...clientInvoices].sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || "")).slice(0, 100).map(inv => {
            // Derive paid amount from invoice.total − balanceDue (authoritative).
            // Falls back to zero only when total is missing.
            const total = Number(inv.total || 0);
            const balance = Number(inv.balanceDue || 0);
            const invPaid = Math.max(0, total - balance);
            const isOverdue = inv.dueDate && inv.dueDate < today && balance > 0;
            return <div key={inv.id} style={{ display: "grid", gridTemplateColumns: "140px 100px 100px 100px 100px 80px", gap: 10, alignItems: "center", padding: "5px 10px", background: Z.bg, borderRadius: Ri, fontSize: FS.sm }}>
              <span style={{ fontWeight: FW.bold, color: Z.ac, fontFamily: COND }}>{inv.invoiceNumber}</span>
              <span style={{ color: Z.tm, fontSize: FS.xs }}>{fmtD(inv.issueDate)}</span>
              <span style={{ color: isOverdue ? Z.da : Z.tm, fontWeight: isOverdue ? FW.bold : FW.regular, fontSize: FS.xs }}>{fmtD(inv.dueDate)}</span>
              <span style={{ textAlign: "right", fontWeight: FW.heavy, color: Z.tx }}>${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              <span style={{ textAlign: "right", color: invPaid > 0 ? Z.go : Z.td, fontWeight: FW.bold }}>{invPaid > 0 ? `$${invPaid.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : "—"}</span>
              <span style={{ textAlign: "right" }}>
                <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: Ri, fontSize: FS.micro, fontWeight: FW.heavy, background: inv.status === "paid" ? Z.go + "20" : inv.status === "overdue" ? Z.da + "20" : inv.status === "partially_paid" ? Z.wa + "20" : Z.ac + "20", color: inv.status === "paid" ? Z.go : inv.status === "overdue" ? Z.da : inv.status === "partially_paid" ? Z.wa : Z.ac, textTransform: "uppercase" }}>
                  {inv.status === "partially_paid" ? "Partial" : inv.status}
                </span>
              </span>
            </div>;
          })}
          {clientInvoices.length > 100 && <div style={{ padding: 6, textAlign: "center", fontSize: FS.micro, color: Z.td }}>Showing 100 of {clientInvoices.length}</div>}
        </div>}
      </div>}
      {/* Payments list */}
      {finTab === "payments" && <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${Z.bd}`, borderRadius: Ri }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "100px 100px 120px 140px 1fr 100px", gap: 10, alignItems: "center", padding: "8px 10px", background: Z.sa, borderBottom: `1px solid ${Z.bd}`, fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, position: "sticky", top: 0, zIndex: 1 }}>
          <span>Date</span>
          <span>Amount</span>
          <span>Method</span>
          <span>Invoice #</span>
          <span>Memo</span>
          <span style={{ textAlign: "right" }}>Ref</span>
        </div>
        {clientPayments.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No payments recorded</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: 4 }}>
          {[...clientPayments].sort((a, b) => (b.receivedAt || "").localeCompare(a.receivedAt || "")).slice(0, 100).map(p => {
            const inv = clientInvoices.find(i => i.id === p.invoiceId);
            const nmMatch = /^NM:\s*([^|]+)/.exec(p.notes || "");
            const methodLabel = nmMatch ? nmMatch[1].trim() : (p.method || "other");
            const memoMatch = /Memo:\s*([^|]+)/.exec(p.notes || "");
            return <div key={p.id} style={{ display: "grid", gridTemplateColumns: "100px 100px 120px 140px 1fr 100px", gap: 10, alignItems: "center", padding: "5px 10px", background: Z.bg, borderRadius: Ri, fontSize: FS.sm }}>
              <span style={{ color: Z.tm, fontSize: FS.xs }}>{fmtD(p.receivedAt?.slice(0, 10))}</span>
              <span style={{ fontWeight: FW.heavy, color: Z.go }}>${(p.amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              <span style={{ fontSize: FS.xs, color: Z.tm }}>{methodLabel}</span>
              <span style={{ fontSize: FS.xs, color: Z.ac, fontFamily: COND }}>{inv?.invoiceNumber || "—"}</span>
              <span style={{ fontSize: FS.xs, color: Z.td, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{memoMatch ? memoMatch[1].trim() : ""}</span>
              <span style={{ textAlign: "right", fontSize: FS.micro, color: Z.td }}>{p.referenceNumber || ""}</span>
            </div>;
          })}
          {clientPayments.length > 100 && <div style={{ padding: 6, textAlign: "center", fontSize: FS.micro, color: Z.td }}>Showing 100 of {clientPayments.length}</div>}
        </div>}
      </div>}
      {/* Reports tab — delivery reports + per-campaign cadence schedule.
           Each digital sale shows its current cadence + Manage button (opens
           cadence modal). Below: list of delivery_reports rows, click View
           to render the html_snapshot inline. */}
      {finTab === "reports" && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {reportsLoading ? <div style={{ padding: 16, textAlign: "center", color: Z.td, fontSize: FS.sm }}>Loading reports...</div>
        : <>
          {/* Active campaigns + cadence */}
          {digitalSales.length > 0 && <div style={{ border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: 8 }}>
            <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontFamily: COND }}>Digital Campaigns</div>
            {digitalSales.map(s => {
              const sched = deliverySchedules.find(d => d.sale_id === s.id);
              return <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px auto", gap: 8, alignItems: "center", padding: "5px 6px", background: Z.bg, borderRadius: Ri, fontSize: FS.sm }}>
                <span style={{ fontWeight: FW.bold, color: Z.tx }}>{s.size || "Digital"}{s.flightStartDate ? ` — ${fmtD(s.flightStartDate)} → ${fmtD(s.flightEndDate)}` : ""}</span>
                <span style={{ fontSize: FS.xs, color: sched?.is_active ? Z.go : Z.tm, fontWeight: FW.heavy, textTransform: "uppercase" }}>{sched ? (sched.is_active ? sched.cadence : "paused") : "no schedule"}</span>
                <span style={{ fontSize: FS.xs, color: Z.tm }}>{sched?.next_run_at ? `Next ${fmtD(sched.next_run_at.slice(0, 10))}` : "—"}</span>
                <Btn sm v="ghost" onClick={() => setCadenceModalSchedule(sched ? { ...sched, _saleLabel: s.size || "Digital" } : { _newForSale: s, sale_id: s.id, cadence: "monthly", is_active: true, _saleLabel: s.size || "Digital" })}>Manage</Btn>
              </div>;
            })}
          </div>}

          {/* Reports list */}
          <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${Z.bd}`, borderRadius: Ri }}>
            <div style={{ display: "grid", gridTemplateColumns: "120px 70px 70px 60px 80px 70px", gap: 10, alignItems: "center", padding: "8px 10px", background: Z.sa, borderBottom: `1px solid ${Z.bd}`, fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, position: "sticky", top: 0, zIndex: 1 }}>
              <span>Period</span><span style={{ textAlign: "right" }}>Imp</span><span style={{ textAlign: "right" }}>Clicks</span><span style={{ textAlign: "right" }}>CTR</span><span>Status</span><span style={{ textAlign: "right" }}>Action</span>
            </div>
            {deliveryReports.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No reports yet — they generate on the campaign cadence.</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: 4 }}>
              {deliveryReports.map(r => <div key={r.id} style={{ display: "grid", gridTemplateColumns: "120px 70px 70px 60px 80px 70px", gap: 10, alignItems: "center", padding: "5px 10px", background: Z.bg, borderRadius: Ri, fontSize: FS.sm }}>
                <span style={{ color: Z.tm, fontSize: FS.xs }}>{fmtD(r.period_start)} → {fmtD(r.period_end)}</span>
                <span style={{ textAlign: "right", fontWeight: FW.heavy, color: Z.tx }}>{(Number(r.impressions) || 0).toLocaleString()}</span>
                <span style={{ textAlign: "right", color: Z.tx }}>{(Number(r.clicks) || 0).toLocaleString()}</span>
                <span style={{ textAlign: "right", color: Z.tm, fontSize: FS.xs }}>{Number(r.ctr || 0).toFixed(2)}%</span>
                <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: r.status === "sent" ? Z.go : r.status === "failed" ? Z.da : Z.tm, textTransform: "uppercase" }}>{r.status}</span>
                <span style={{ textAlign: "right" }}><Btn sm v="ghost" onClick={() => setViewReportId(r.id)}>View</Btn></span>
              </div>)}
            </div>}
          </div>
        </>}
      </div>}
    </Card>}

    {/* View report modal — renders the saved html_snapshot in an iframe so
         report styles can't leak into the host page. */}
    {viewReportId && (() => {
      const r = deliveryReports.find(x => x.id === viewReportId);
      if (!r) return null;
      return <Modal open={true} onClose={() => setViewReportId(null)} title={`Delivery Report — ${fmtD(r.period_start)} → ${fmtD(r.period_end)}`} width={800}>
        {r.html_snapshot
          ? <iframe srcDoc={r.html_snapshot} title="Report" style={{ width: "100%", height: "70vh", border: "none", background: "#fff", borderRadius: 4 }} />
          : <div style={{ padding: 24, color: Z.td, fontSize: FS.sm }}>No HTML snapshot saved on this report.</div>}
      </Modal>;
    })()}

    {/* Cadence modal — change cadence / recipient / pause for a campaign's
         delivery_report_schedules row. If the campaign has no schedule yet,
         creates one (rare — usually the convert RPC seeds it). */}
    {cadenceModalSchedule && <CadenceModal
      schedule={cadenceModalSchedule}
      contacts={(clients.find(c => c.id === clientId)?.contacts || []).filter(c => c.email)}
      onClose={() => setCadenceModalSchedule(null)}
      onSaved={(updated) => {
        setDeliverySchedules(prev => {
          const idx = prev.findIndex(s => s.id === updated.id);
          if (idx >= 0) return prev.map((s, i) => i === idx ? updated : s);
          return [...prev, updated];
        });
        setCadenceModalSchedule(null);
      }}
    />}

    {/* Per-client discussion — lazy thread, team all see it */}
    {clientId && (
      <div style={{ marginBottom: 12 }}>
        <EntityThread
          refType="client"
          refId={clientId}
          title={`Client: ${(clients.find(c => c.id === clientId) || {}).name || "Unknown"}`}
          team={team}
          height={320}
        />
      </div>
    )}

    {/* ── eBLAST CAMPAIGNS — newsletter_drafts linked to this client ── */}
    {clientEblasts.length > 0 && <Card style={{ borderLeft: `3px solid ${Z.pu}`, marginBottom: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>eBlast Campaigns</span>
        <span style={{ fontSize: FS.xs, color: Z.td }}>{clientEblasts.length} campaign{clientEblasts.length !== 1 ? "s" : ""}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {clientEblasts.map(e => {
          const openRate = e.recipient_count > 0 ? Math.round((e.open_count / e.recipient_count) * 100) : 0;
          const clickRate = e.recipient_count > 0 ? Math.round((e.click_count / e.recipient_count) * 100) : 0;
          const statusColor = e.status === "sent" ? Z.su : e.status === "failed" ? Z.da : e.status === "approved" ? Z.ac : Z.tm;
          return <div key={e.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 90px 90px 90px", gap: 10, alignItems: "center", padding: "6px 10px", background: Z.bg, borderRadius: Ri, fontSize: FS.sm }}>
            <div>
              <div style={{ fontWeight: FW.bold, color: Z.tx }}>{e.subject || "(no subject)"}</div>
              <div style={{ fontSize: FS.xs, color: Z.td }}>{pn(e.publication_id)}{e.sent_at ? ` · ${e.sent_at.slice(0, 10)}` : ""}</div>
            </div>
            <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: statusColor, textTransform: "uppercase", fontFamily: COND }}>{e.status}</span>
            <span style={{ fontSize: FS.xs, color: Z.tm }}>{(e.recipient_count || 0).toLocaleString()} sent</span>
            <span style={{ fontSize: FS.xs, color: Z.tm }}>{e.status === "sent" ? `${openRate}% open` : "—"}</span>
            <span style={{ fontSize: FS.xs, color: Z.tm }}>{e.status === "sent" ? `${clickRate}% click` : "—"}</span>
          </div>;
        })}
      </div>
    </Card>}

    {/* ── PURCHASE TIMELINE — contracts, standalone ads, orphan proposals grouped by year ── */}
    {(timelineYears.length > 0 || clientProposals.length > 0) && <Card style={{ borderLeft: `3px solid ${Z.ac}`, marginBottom: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Purchase Timeline</span>
        <span style={{ fontSize: FS.xs, color: Z.td }}>{closedCS.length} ad{closedCS.length !== 1 ? "s" : ""} · {clientContracts.length} contract{clientContracts.length !== 1 ? "s" : ""} · ${totalRevenue.toLocaleString()} lifetime</span>
      </div>
      {timelineYears.length === 0 && <div style={{ padding: 12, textAlign: "center", color: Z.td, fontSize: FS.sm, background: Z.bg, borderRadius: Ri }}>No purchase history yet</div>}
      {timelineYears.map(yr => {
        const open = expandedYears.has(yr.year);
        return <div key={yr.year} style={{ marginBottom: 8 }}>
          <button onClick={() => toggleYear(yr.year)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, cursor: "pointer", textAlign: "left" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: Z.tm, width: 10, display: "inline-block" }}>{open ? "▼" : "▶"}</span>
              <span style={{ fontSize: FS.md, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{yr.year}</span>
              <span style={{ fontSize: FS.xs, color: Z.td, marginLeft: 8 }}>
                {yr.contracts.length > 0 && `${yr.contracts.length} contract${yr.contracts.length !== 1 ? "s" : ""} · `}
                {yr.adCount} ad{yr.adCount !== 1 ? "s" : ""}
                {yr.proposals.length > 0 && ` · ${yr.proposals.length} proposal${yr.proposals.length !== 1 ? "s" : ""}`}
              </span>
            </span>
            <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.ac, fontFamily: DISPLAY }}>${yr.total.toLocaleString()}</span>
          </button>

          {open && <div style={{ padding: "8px 0 0 18px", display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Contracts */}
            {yr.contracts.map(ct => {
              const ctOpen = expandedContracts.has(ct.id);
              const stColor = ct.status === "active" ? (Z.su || "#22C55E") : ct.status === "cancelled" ? Z.da : Z.tm;
              return <div key={ct.id} style={{ background: Z.bg, border: `1px solid ${ct.status === "active" ? stColor + "40" : Z.bd}`, borderRadius: Ri, overflow: "hidden" }}>
                <button onClick={() => toggleContract(ct.id)}
                  style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left", color: Z.tx }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 10, color: Z.tm, width: 10 }}>{ctOpen ? "▼" : "▶"}</span>
                      <Ic.handshake size={11} color={Z.tm} />
                      <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>{ct.name}</span>
                      <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: stColor, background: stColor + "15", padding: "1px 6px", borderRadius: Ri, textTransform: "uppercase", letterSpacing: 0.3 }}>{ct.status}</span>
                    </div>
                    <div style={{ fontSize: FS.xs, color: Z.tm, marginLeft: 27 }}>{ct.startDate || "?"} → {ct.endDate || "?"}{ct.lines?.length > 0 && ` · ${ct.lines.map(ln => `${pn(ln.pubId)} ${ln.adSize}×${ln.quantity}`).join(" · ")}`}</div>
                    {ct.totalValue > 0 && <div style={{ marginTop: 6, marginLeft: 27, marginRight: 0 }}>
                      <div style={{ height: 5, background: Z.sa, borderRadius: Ri, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${ct.pct}%`, background: ct.pct >= 100 ? (Z.su || "#22C55E") : ct.status === "cancelled" ? Z.da : Z.ac, transition: "width 0.3s" }} />
                      </div>
                      <div style={{ fontSize: FS.micro, color: Z.td, marginTop: 2 }}>${ct.fulfilled.toLocaleString()} of ${(ct.totalValue || 0).toLocaleString()} delivered · {ct.pct}%</div>
                    </div>}
                  </div>
                  <div style={{ textAlign: "right", paddingLeft: 10 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>${(ct.totalValue || 0).toLocaleString()}</div>
                  </div>
                </button>
                {ctOpen && ct.ads.length > 0 && <div style={{ padding: "0 14px 10px 41px", display: "flex", flexDirection: "column", gap: 2, borderTop: `1px solid ${Z.bd}` }}>
                  <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, padding: "6px 0 2px" }}>Ads under this contract ({ct.ads.length})</div>
                  {ct.ads.map(a => <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: FS.xs, color: Z.tm, borderBottom: `1px solid ${Z.bd}20` }}>
                    <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ color: Z.td, width: 72 }}>
                        {a.issueId && a.publication
                          ? <EntityLink onClick={nav.toFlatplan(a.publication, a.issueId)} muted>{a.date || "—"}</EntityLink>
                          : (a.date || "—")}
                      </span>
                      <span style={{ color: Z.tx, fontWeight: FW.semi }}>
                        {a.publication
                          ? <EntityLink onClick={nav.toIssueDesign(a.publication, a.issueId)}>{pn(a.publication)}</EntityLink>
                          : pn(a.publication)}
                      </span>
                      <span>
                        <EntityLink onClick={nav.toAdProjectForSale(a.id)} muted noUnderline>{a.size || a.type || "Ad"}</EntityLink>
                      </span>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <TearsheetCell sale={a} client={vc} setSales={setSales} />
                      <span style={{ fontWeight: FW.heavy, color: Z.tx, minWidth: 70, textAlign: "right" }}>${(a.amount || 0).toLocaleString()}</span>
                    </span>
                  </div>)}
                </div>}
                {ctOpen && ct.ads.length === 0 && <div style={{ padding: "4px 14px 10px 41px", fontSize: FS.micro, color: Z.td, borderTop: `1px solid ${Z.bd}` }}>No ads fulfilled yet against this contract.</div>}
              </div>;
            })}

            {/* Standalone ads (not tied to any contract) */}
            {yr.standaloneSales.length > 0 && <div style={{ marginTop: yr.contracts.length > 0 ? 4 : 0 }}>
              <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, paddingLeft: 4 }}>Standalone Ad Orders ({yr.standaloneSales.length})</div>
              <div style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "4px 10px" }}>
                {yr.standaloneSales.map(a => <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", fontSize: FS.xs, borderBottom: `1px solid ${Z.bd}20` }}>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Ic.tag size={10} color={Z.td} />
                    <span style={{ color: Z.td, width: 72 }}>
                      {a.issueId && a.publication
                        ? <EntityLink onClick={nav.toFlatplan(a.publication, a.issueId)} muted>{a.date || "—"}</EntityLink>
                        : (a.date || "—")}
                    </span>
                    <span style={{ color: Z.tx, fontWeight: FW.semi }}>
                      {a.publication
                        ? <EntityLink onClick={nav.toIssueDesign(a.publication, a.issueId)}>{pn(a.publication)}</EntityLink>
                        : pn(a.publication)}
                    </span>
                    <span style={{ color: Z.tm }}>
                      <EntityLink onClick={nav.toAdProjectForSale(a.id)} muted noUnderline>{a.size || a.type || "Ad"}</EntityLink>
                    </span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <TearsheetCell sale={a} setSales={setSales} />
                    <span style={{ fontWeight: FW.heavy, color: Z.tx, minWidth: 70, textAlign: "right" }}>${(a.amount || 0).toLocaleString()}</span>
                  </span>
                </div>)}
              </div>
            </div>}

            {/* Orphan / reappeared proposals */}
            {yr.proposals.length > 0 && <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, paddingLeft: 4 }}>Proposals ({yr.proposals.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {yr.proposals.map(p => <div key={p.id} onClick={() => { if (onNavTo) onNavTo("Proposals"); if (onSetViewPropId) setTimeout(() => onSetViewPropId(p.id), 50); }}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: p.status === "Draft" ? Z.wa + "10" : Z.bg, border: `1px solid ${p.status === "Draft" ? Z.wa + "40" : Z.bd}`, borderRadius: Ri, cursor: "pointer" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                    <Ic.file size={11} color={Z.tm} />
                    <span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                    <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase" }}>{p.status}</span>
                    {p._reappeared && <span style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.da, background: Z.da + "15", padding: "1px 6px", borderRadius: Ri }}>Contract cancelled</span>}
                  </div>
                  <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.ac }}>${(p.total || 0).toLocaleString()}</span>
                </div>)}
              </div>
            </div>}
          </div>}
        </div>;
      })}
    </Card>}

      </div>;
};

// CadenceModal — edit a delivery_report_schedules row. Used from the
// Reports tab. If the schedule has no id (a sale that somehow lost its
// schedule), inserts on save instead of updating.
function CadenceModal({ schedule, contacts, onClose, onSaved }) {
  const [cadence, setCadence] = useState(schedule.cadence || "monthly");
  const [contactId, setContactId] = useState(schedule.contact_id || "");
  const [isActive, setIsActive] = useState(schedule.is_active !== false);
  const [saving, setSaving] = useState(false);

  // next_run_at recompute on cadence change. Mirrors the convert RPC math.
  const nextRunForCadence = (c) => {
    const base = new Date();
    if (c === "weekly") base.setUTCDate(base.getUTCDate() + 7);
    else if (c === "monthly") base.setUTCMonth(base.getUTCMonth() + 1);
    else if (c === "annual") base.setUTCFullYear(base.getUTCFullYear() + 1);
    else if (c === "end_of_flight") return null;
    return base.toISOString();
  };

  const save = async () => {
    setSaving(true);
    const next_run_at = nextRunForCadence(cadence);
    const updates = {
      cadence,
      contact_id: contactId || null,
      is_active: isActive,
      ...(next_run_at ? { next_run_at } : {}),
      updated_at: new Date().toISOString(),
    };
    if (schedule.id) {
      const { data } = await supabase.from("delivery_report_schedules").update(updates).eq("id", schedule.id).select().single();
      onSaved(data || { ...schedule, ...updates });
    } else {
      const { data } = await supabase.from("delivery_report_schedules").insert({
        sale_id: schedule.sale_id, ...updates,
        next_run_at: next_run_at || new Date().toISOString(),
      }).select().single();
      if (data) onSaved(data);
      else onClose();
    }
    setSaving(false);
  };

  return <Modal open={true} onClose={onClose} title={`Delivery Cadence — ${schedule._saleLabel || "Campaign"}`} width={460}>
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: Z.td, textTransform: "uppercase", display: "block", marginBottom: 6, fontFamily: COND }}>Frequency</label>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {[["weekly", "Weekly"], ["monthly", "Monthly"], ["end_of_flight", "End of flight only"], ["annual", "Annual"]].map(([v, l]) => (
            <button key={v} onClick={() => setCadence(v)} style={{ padding: "5px 12px", borderRadius: 4, border: `1px solid ${cadence === v ? Z.go : Z.bd}`, background: cadence === v ? Z.go + "20" : "transparent", cursor: "pointer", fontSize: 13, fontWeight: cadence === v ? 700 : 600, color: cadence === v ? Z.go : Z.tm, fontFamily: COND }}>{l}</button>
          ))}
        </div>
      </div>
      <Sel label="Send To" value={contactId} onChange={e => setContactId(e.target.value)} options={[{ value: "", label: "— Profile only (no email) —" }, ...contacts.map(c => ({ value: c.id || c.email, label: `${c.name} <${c.email}>` }))]} />
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: Z.tx }}>
        <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
        Active (uncheck to pause report generation)
      </label>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn v="cancel" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Btn>
      </div>
    </div>
  </Modal>;
}

export default ClientProfile;
