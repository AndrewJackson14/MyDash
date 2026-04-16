import React, { useState, useRef, useMemo, memo, useEffect, useCallback, Fragment } from "react";
import { Z, SC, COND, DISPLAY, FS, FW, Ri, R } from "../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Card, SB, TB, Stat, Modal, Bar, FilterBar, SortHeader , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, DataTable, ListCard, ListDivider, ListGrid, Pill, glass } from "../components/ui";
import { COMPANY } from "../constants";
import { generateInvoiceHtml } from "../lib/invoiceTemplate";
import { generatePdf } from "../lib/pdf";
import { sendGmailEmail } from "../lib/gmail";
import { supabase, EDGE_FN_URL } from "../lib/supabase";
import { useDialog } from "../hooks/useDialog";
import { fmtCurrency, fmtDate, daysBetween, fmtTimeRelative } from "../lib/formatters";
import BillsTab from "./BillsTab";

// ─── Invoice Status Colors ──────────────────────────────────
const INV_COLORS = {
  draft:          { bg: Z.sa, text: Z.tm },
  sent:           { bg: Z.ps, text: Z.pu },
  partially_paid: { bg: Z.ws, text: Z.wa },
  paid:           { bg: Z.ss, text: Z.su },
  overdue:        { bg: Z.ds, text: Z.da },
  void:           { bg: Z.sa, text: Z.td },
};

// Overdue is the default because that's the view that drives AR collections.
// "open" is a synthetic filter covering every unpaid invoice (sent,
// partially_paid, overdue) — handy for 'what still owes us money' without
// dropping to a single status. "draft" is shown as "Not Sent" in the tab
// strip so the label reads naturally to office staff while the DB column
// continues to store 'draft'.
const INV_STATUSES = ["overdue", "open", "draft", "paid", "sent", "void", "All"];
const INV_STATUS_LABELS = {
  overdue: "Overdue",
  open: "Open",
  draft: "Not Sent",
  paid: "Paid",
  sent: "Sent",
  void: "Void",
  All: "All",
};
const BILLING_SCHEDULES = [
  { value: "lump_sum", label: "Lump Sum" },
  { value: "per_issue", label: "Per Issue" },
  { value: "monthly_plan", label: "Monthly Plan" },
];
const PAYMENT_METHODS = [
  { value: "card", label: "Credit Card" },
  { value: "check", label: "Check" },
  { value: "ach", label: "ACH Transfer" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];


const today = new Date().toISOString().slice(0, 10);

const InvBadge = ({ status }) => {
  const c = INV_COLORS[status] || INV_COLORS.draft;
  const labels = { draft: "Draft", sent: "Sent", partially_paid: "Partial", paid: "Paid", overdue: "Overdue", void: "Void" };
  return <span style={{ display: "inline-flex", alignItems: "center", borderRadius: R, fontSize: FS.xs, fontWeight: FW.bold, background: c.bg, color: c.text, whiteSpace: "nowrap" }}>{labels[status] || status}</span>;
};

// ─── Payment Plan Card (extracted to avoid hooks-in-map) ────
const PaymentPlanCard = ({ plan: p, today, onRetry, onSuspend }) => {
  const [expanded, setExpanded] = useState(false);
  const chargeLabel = p.chargeDay === 15 ? "15th" : "1st";
  const creditBal = p.client.creditBalance || 0;

  return <GlassCard style={{ padding: 0, overflow: "hidden" }}>
    <div onClick={() => setExpanded(!expanded)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", cursor: "pointer", borderLeft: p.needsAction ? `3px solid ${Z.da}` : p.hasCard ? `3px solid ${Z.su}` : `3px solid ${Z.wa}` }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{p.client.name}</span>
          {p.hasCard && <span style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.su, background: Z.ss, padding: "1px 6px", borderRadius: Ri }}>{p.client.cardBrand} ···{p.client.cardLast4}</span>}
          {!p.hasCard && <span style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.wa, background: Z.wa + "15", padding: "1px 6px", borderRadius: Ri }}>No card</span>}
        </div>
        <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 2 }}>
          {fmtCurrency(p.monthlyAmount)}/mo on the {chargeLabel} · {p.openInvs.length} open invoices
          {creditBal > 0 && <span style={{ marginLeft: 6, color: Z.su, fontWeight: FW.bold }}>{fmtCurrency(creditBal)} credit</span>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {p.failedCharges > 0 && <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.da, background: Z.da + "12", padding: "2px 8px", borderRadius: Ri }}>Charge failed</span>}
        {p.overdueInvs.length > 0 && <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.da }}>{fmtCurrency(p.totalOverdue)} overdue</span>}
        <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: p.totalOutstanding > 0 ? Z.tx : Z.su }}>{fmtCurrency(p.totalOutstanding)}</div>
        <span style={{ fontSize: 10, color: Z.td, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>{"\u25BC"}</span>
      </div>
    </div>
    {expanded && <div style={{ borderTop: `1px solid ${Z.bd}`, padding: "12px 18px" }}>
      {/* Actions */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {p.hasCard && p.totalOutstanding > 0 && <Btn sm onClick={() => onRetry?.(p)}>Charge {fmtCurrency(p.monthlyAmount)} Now</Btn>}
        {!p.hasCard && <Btn sm v="secondary" disabled>No card on file</Btn>}
      </div>
      {/* Open invoices */}
      <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Open Invoices</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
        {p.openInvs.length === 0 ? <div style={{ fontSize: FS.sm, color: Z.tm, padding: 8 }}>No open invoices — payments will add to credit</div>
        : p.openInvs.map(inv => {
          const isOverdue = inv.dueDate && inv.dueDate < today;
          const isPartial = inv.status === "partially_paid";
          return <div key={inv.id} style={{ display: "grid", gridTemplateColumns: "90px 1fr 80px 70px 70px", gap: 6, padding: "5px 8px", background: isOverdue ? Z.da + "08" : Z.bg, borderRadius: Ri, alignItems: "center", fontSize: FS.sm }}>
            <span style={{ color: isOverdue ? Z.da : Z.tm, fontWeight: isOverdue ? FW.bold : FW.semi }}>{fmtDate(inv.dueDate)}</span>
            <span style={{ color: Z.tm }}>{inv.invoiceNumber}</span>
            <span style={{ fontWeight: FW.bold, color: Z.tx, textAlign: "right" }}>{fmtCurrency(inv.total)}</span>
            <span style={{ color: isPartial ? Z.wa : Z.da, textAlign: "right", fontWeight: FW.semi }}>{fmtCurrency(inv.balanceDue)}</span>
            <span style={{ textAlign: "right" }}><InvBadge status={inv.status} /></span>
          </div>;
        })}
      </div>
      {/* Paid invoices (collapsed) */}
      {p.paidInvs.length > 0 && <div style={{ fontSize: FS.xs, color: Z.tm }}>{p.paidInvs.length} paid invoices · {fmtCurrency(p.paidInvs.reduce((s, i) => s + (i.total || 0), 0))} collected</div>}
    </div>}
  </GlassCard>;
};

// ─── Billing Settings Tab ───────────────────────────────────
// Publisher-level billing automation config (stored in org_settings)
const BillingSettings = ({ dialog, generatePending }) => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("org_settings").select("*").limit(1).maybeSingle();
      setSettings(data || { auto_generate_magazine_invoices: false, auto_generate_newspaper_bulk: false, magazine_lead_days: 30 });
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("org_settings").update({
      auto_generate_magazine_invoices: settings.auto_generate_magazine_invoices,
      auto_generate_newspaper_bulk: settings.auto_generate_newspaper_bulk,
      magazine_lead_days: settings.magazine_lead_days,
      updated_at: new Date().toISOString(),
    }).eq("singleton", true);
    setSaving(false);
    if (error) { await dialog.alert("Failed to save: " + error.message); return; }
    await dialog.alert("Settings saved.");
  };

  if (loading) return <GlassCard><div style={{ padding: 24, textAlign: "center", color: Z.tm }}>Loading…</div></GlassCard>;

  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <GlassCard>
      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Invoice Generation Rules</div>
      <div style={{ fontSize: FS.xs, color: Z.tm, marginBottom: 14 }}>
        Invoices are generated when you click <strong style={{ color: Z.tx }}>Generate Invoices</strong> in the header. Automation toggles below let you run those rules on a schedule (coming soon).
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 12, alignItems: "center", padding: 12, background: Z.bg, borderRadius: R }}>
          <div>
            <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>Magazine Lead Days</div>
            <div style={{ fontSize: FS.xs, color: Z.tm }}>How many days before publication a magazine invoice is generated.</div>
          </div>
          <Inp type="number" min="1" max="90" value={settings.magazine_lead_days || 30} onChange={e => setSettings(s => ({ ...s, magazine_lead_days: Number(e.target.value) || 30 }))} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12, alignItems: "center", padding: 12, background: Z.bg, borderRadius: R }}>
          <div>
            <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>Auto-Generate Magazine Invoices</div>
            <div style={{ fontSize: FS.xs, color: Z.tm }}>When enabled, the rolling window regenerates daily. (Daily cron — requires setup)</div>
          </div>
          <div onClick={() => setSettings(s => ({ ...s, auto_generate_magazine_invoices: !s.auto_generate_magazine_invoices }))} style={{ cursor: "pointer", padding: "6px 12px", borderRadius: Ri, background: settings.auto_generate_magazine_invoices ? Z.su + "20" : Z.sa, color: settings.auto_generate_magazine_invoices ? Z.su : Z.tm, fontWeight: FW.bold, fontSize: FS.sm, textAlign: "center", border: `1px solid ${settings.auto_generate_magazine_invoices ? Z.su : Z.bd}` }}>
            {settings.auto_generate_magazine_invoices ? "ON" : "OFF"}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12, alignItems: "center", padding: 12, background: Z.bg, borderRadius: R }}>
          <div>
            <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>Auto-Generate Newspaper Monthly Bulk</div>
            <div style={{ fontSize: FS.xs, color: Z.tm }}>When enabled, runs on the 1st of each month and bundles all newspaper ads for the month. (Monthly cron — requires setup)</div>
          </div>
          <div onClick={() => setSettings(s => ({ ...s, auto_generate_newspaper_bulk: !s.auto_generate_newspaper_bulk }))} style={{ cursor: "pointer", padding: "6px 12px", borderRadius: Ri, background: settings.auto_generate_newspaper_bulk ? Z.su + "20" : Z.sa, color: settings.auto_generate_newspaper_bulk ? Z.su : Z.tm, fontWeight: FW.bold, fontSize: FS.sm, textAlign: "center", border: `1px solid ${settings.auto_generate_newspaper_bulk ? Z.su : Z.bd}` }}>
            {settings.auto_generate_newspaper_bulk ? "ON" : "OFF"}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <Btn sm onClick={generatePending}><Ic.invoice size={12} /> Run Now</Btn>
        <Btn sm v="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Settings"}</Btn>
      </div>
    </GlassCard>

    <GlassCard>
      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>How it works</div>
      <div style={{ fontSize: FS.sm, color: Z.tm, lineHeight: 1.6 }}>
        <p style={{ margin: "0 0 8px 0" }}><strong style={{ color: Z.tx }}>Magazines:</strong> One rolling invoice per client, covering all magazine ads publishing within the lead-days window. Append to the existing draft if it hasn't been sent or downloaded yet; otherwise a new one is created.</p>
        <p style={{ margin: "0 0 8px 0" }}><strong style={{ color: Z.tx }}>Newspapers:</strong> Monthly bulk per client per publication, due last day of month. Mid-month additions append to the draft until it's sent or downloaded.</p>
        <p style={{ margin: "0 0 8px 0" }}><strong style={{ color: Z.tx }}>Special Publications (annual guides):</strong> Invoice-on-sign, via the proposal flow — unchanged.</p>
        <p style={{ margin: 0 }}><strong style={{ color: Z.tx }}>Lump-sum &amp; monthly-plan contracts:</strong> Unchanged — still auto-invoice at contract signing.</p>
      </div>
    </GlassCard>
  </div>;
};

// ─── Billing Module ─────────────────────────────────────────
const Billing = ({ clients, sales, pubs, issues, proposals, invoices, setInvoices, payments, setPayments, bus, jurisdiction, team, subscribers, subscriptionPayments, contracts, billingLoaded, loadInvoiceLines, bills, insertBill, updateBill, deleteBill, onNavigate }) => {
  const dialog = useDialog();
  const [tab, setTab] = useState("Overview");
  const [showAllPlans, setShowAllPlans] = useState(false);
  const [sr, setSr] = useState("");
  const [statusFilter, setStatusFilter] = useState("overdue");
  const [invModal, setInvModal] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [viewInvId, setViewInvId] = useState(null);
  const [sortCol, setSortCol] = useState("issue_date");
  const [sortDir, setSortDir] = useState("desc");
  const [reportView, setReportView] = useState("revenue");
  const [reportPeriod, setReportPeriod] = useState("mtd");
  const [reportPub, setReportPub] = useState("all");
  // AR by Client (Receivables tab)
  const [arClientSearch, setArClientSearch] = useState("");
  const [arClientSort, setArClientSort] = useState({ key: "total", dir: "desc" });
  const [arClientFilter, setArClientFilter] = useState("all");
  const [arClientRep, setArClientRep] = useState("all");
  const [arExpandedClient, setArExpandedClient] = useState(null);
  // AR Aging flat report (Reports tab)
  const [agingReportSort, setAgingReportSort] = useState({ key: "total", dir: "desc" });

  // New invoice form
  const [invForm, setInvForm] = useState({
    clientId: "", billingSchedule: "lump_sum", lines: [],
    dueDate: "", notes: "", monthlyAmount: 0, planMonths: 0,
  });

  // New payment form
  const [payForm, setPayForm] = useState({
    invoiceId: "", amount: 0, method: "card", lastFour: "", notes: "",
  });

  // ─── Credit Memos ──────────────────────────────────────────
  const [creditMemoModal, setCreditMemoModal] = useState(false);
  const [creditMemos, setCreditMemos] = useState([]);
  const [cmForm, setCmForm] = useState({ clientId: "", saleId: "", invoiceId: "", amount: 0, reasonCode: "make_good", reason: "", notes: "" });
  const REASON_CODES = [{ value: "make_good", label: "Make-good (ad ran wrong)" }, { value: "credit", label: "Credit" }, { value: "refund", label: "Refund" }, { value: "writeoff", label: "Write-off" }, { value: "other", label: "Other" }];

  useEffect(() => {
    if (!billingLoaded) return;
    supabase.from("credit_memos").select("*").order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => { if (data) setCreditMemos(data); });
  }, [billingLoaded]);

  const createCreditMemo = async () => {
    if (!cmForm.clientId || !cmForm.amount || !cmForm.reason) return;
    const { data, error } = await supabase.from("credit_memos").insert({
      client_id: cmForm.clientId, sale_id: cmForm.saleId || null,
      invoice_id: cmForm.invoiceId || null, amount: cmForm.amount,
      reason: cmForm.reason, reason_code: cmForm.reasonCode,
      notes: cmForm.notes || null, status: "pending",
    }).select().single();
    if (error) { await dialog.alert("Error: " + error.message); return; }
    if (data) {
      setCreditMemos(prev => [data, ...prev]);
      // Add to client credit balance
      const client = (clients || []).find(c => c.id === cmForm.clientId);
      if (client) {
        const newBal = (client.creditBalance || 0) + cmForm.amount;
        await supabase.from("clients").update({ credit_balance: newBal }).eq("id", cmForm.clientId);
      }
      setCreditMemoModal(false);
      setCmForm({ clientId: "", saleId: "", invoiceId: "", amount: 0, reasonCode: "make_good", reason: "", notes: "" });
    }
  };

  // ─── Sync invoice to QuickBooks ─────────────────────────────
  const [qbSyncing, setQbSyncing] = useState(null);
  const syncInvoiceToQB = async (inv) => {
    setQbSyncing(inv.id);
    try {
      const client = (clients || []).find(c => c.id === inv.clientId);
      if (!client) throw new Error("Client not found");

      // 1. Find or create QB customer
      const findRes = await supabase.functions.invoke("qb-api", { headers: { "x-action": "find-customer" }, body: { name: client.name } });
      let qbCustomerId = findRes.data?.customers?.[0]?.Id;
      if (!qbCustomerId) {
        const createRes = await supabase.functions.invoke("qb-api", {
          headers: { "x-action": "create-customer" },
          body: { DisplayName: client.name, PrimaryEmailAddr: client.billingEmail ? { Address: client.billingEmail } : undefined },
        });
        qbCustomerId = createRes.data?.Customer?.Id;
      }
      if (!qbCustomerId) throw new Error("Could not find or create QB customer");

      // 2. Build invoice lines
      const invLines = (inv.lines || []).filter(l => l.description || l.total);
      const qbLines = invLines.length > 0
        ? invLines.map((l, i) => ({
            Amount: Number(l.total || 0), DetailType: "SalesItemLineDetail",
            Description: l.description || `Line ${i + 1}`,
            SalesItemLineDetail: { Qty: l.quantity || 1, UnitPrice: Number(l.unitPrice || l.total || 0) },
          }))
        : [{ Amount: Number(inv.total || 0), DetailType: "SalesItemLineDetail", Description: `Invoice ${inv.invoiceNumber}`, SalesItemLineDetail: { Qty: 1, UnitPrice: Number(inv.total || 0) } }];

      // 3. Create invoice in QB
      const invRes = await supabase.functions.invoke("qb-api", {
        headers: { "x-action": "create-invoice" },
        body: { CustomerRef: { value: qbCustomerId }, Line: qbLines, DueDate: inv.dueDate, DocNumber: inv.invoiceNumber },
      });
      const qbId = invRes.data?.Invoice?.Id;
      if (!qbId) throw new Error(invRes.data?.error || "QB invoice creation failed");

      // 4. Save sync status
      await supabase.from("invoices").update({ quickbooks_id: qbId, quickbooks_synced_at: new Date().toISOString(), quickbooks_sync_error: null }).eq("id", inv.id);
      setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, quickbooksId: qbId, quickbooksSyncedAt: new Date().toISOString(), quickbooksSyncError: null } : i));
    } catch (err) {
      const msg = err.message || "Unknown error";
      await supabase.from("invoices").update({ quickbooks_sync_error: msg }).eq("id", inv.id);
      setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, quickbooksSyncError: msg } : i));
      await dialog.alert("QB sync failed: " + msg);
    }
    setQbSyncing(null);
  };

  // ─── Listen for invoice.create events from other modules ──
  const openNewInvoiceRef = useRef(null);
  useEffect(() => {
    if (!bus) return;
    return bus.on("invoice.create", ({ clientId }) => {
      if (openNewInvoiceRef.current) openNewInvoiceRef.current(clientId);
    });
  }, [bus]);

  // ─── Invoice send log — one query pulls every email_log row with
  //     ref_type='invoice'; we index the latest per invoice id so each row
  //     can show a "Sent" pill + tooltip without per-row queries.
  // Hydrate full invoice lines on demand when the detail modal opens.
  // loadBilling only fetches skinny line columns (sale_id, publication_id)
  // so the rest of the invoice fields lazy-load here.
  useEffect(() => {
    if (viewInvId && loadInvoiceLines) loadInvoiceLines(viewInvId);
  }, [viewInvId, loadInvoiceLines]);

  const [invoiceSendMap, setInvoiceSendMap] = useState({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("email_log")
        .select("id, ref_id, to_email, status, error_message, created_at")
        .eq("ref_type", "invoice")
        .order("created_at", { ascending: false });
      if (error) { console.error("invoice email_log load error:", error); return; }
      if (cancelled) return;
      const map = {};
      for (const row of data || []) {
        if (!row.ref_id) continue;
        const prev = map[row.ref_id];
        if (!prev) map[row.ref_id] = { ...row, count: 1 };
        else map[row.ref_id] = { ...prev, count: prev.count + 1 };
      }
      setInvoiceSendMap(map);
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Helpers ────────────────────────────────────────────
  const cn = (cid) => clients.find(c => c.id === cid)?.name || "Unknown";
  const pn = (pid) => pubs.find(p => p.id === pid)?.name || "";

  // Auto-mark overdue. Memoized so it doesn't churn a new array reference every
  // render — that would invalidate every downstream useMemo (uninvoicedSales,
  // openNewInvoice, etc.) on every render.
  const processedInvoices = useMemo(() => (invoices || []).map(inv => {
    if (inv.status === "sent" && inv.dueDate && inv.dueDate < today) {
      return { ...inv, status: "overdue" };
    }
    return inv;
  }), [invoices, today]);

  // ─── Computed Stats ─────────────────────────────────────
  const totalOutstanding = processedInvoices.filter(i => ["sent", "partially_paid", "overdue"].includes(i.status)).reduce((s, i) => s + (i.balanceDue || 0), 0);
  const totalOverdue = processedInvoices.filter(i => i.status === "overdue").reduce((s, i) => s + (i.balanceDue || 0), 0);
  const totalPaidThisMonth = processedInvoices.filter(i => i.status === "paid" && i.issueDate?.startsWith(today.slice(0, 7))).reduce((s, i) => s + (i.total || 0), 0);
  const totalDraftValue = processedInvoices.filter(i => i.status === "draft").reduce((s, i) => s + (i.total || 0), 0);
  const overdueCount = processedInvoices.filter(i => i.status === "overdue").length;

  // Closed sales without invoices (candidates for invoice generation)
  const uninvoicedSales = useMemo(() => {
    const invoicedSaleIds = new Set();
    processedInvoices.forEach(inv => inv.lines?.forEach(l => { if (l.saleId) invoicedSaleIds.add(l.saleId); }));
    return sales.filter(s => s.status === "Closed" && !invoicedSaleIds.has(s.id));
  }, [sales, processedInvoices]);

  // Billing-module-wide rule: we only care about the rolling ±30 day
  // window for uninvoiced sales. Older sales that missed invoicing stay
  // visible so nothing silently drops off, and sales more than 30 days in
  // the future are hidden because they're not ready to bill yet. Client
  // Profile pages are the exception — they still show the full uninvoiced
  // list for that client.
  const filteredUninvoiced = useMemo(() => {
    const past = new Date(); past.setDate(past.getDate() - 30);
    const future = new Date(); future.setDate(future.getDate() + 30);
    const lo = past.toISOString().slice(0, 10);
    const hi = future.toISOString().slice(0, 10);
    return uninvoicedSales.filter(s => s.date && s.date >= lo && s.date <= hi);
  }, [uninvoicedSales]);

  // Pre-aggregated uninvoiced by client (for the Overview display)
  const uninvoicedByClient = useMemo(() => {
    const map = {};
    filteredUninvoiced.forEach(s => {
      if (!map[s.clientId]) map[s.clientId] = { clientId: s.clientId, total: 0, count: 0 };
      map[s.clientId].total += s.amount || 0;
      map[s.clientId].count++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredUninvoiced]);

  // Aging buckets — standard 4-bucket aging:
  // Current (not past due), 30 (1-30), 60 (31-60), 90+ (61+).
  const agingBuckets = { current: 0, "30": 0, "60": 0, "90+": 0 };
  processedInvoices.filter(i => ["sent", "partially_paid", "overdue"].includes(i.status)).forEach(inv => {
    const bal = inv.balanceDue || 0;
    const due = inv.dueDate || inv.issueDate;
    if (!due || due >= today) { agingBuckets.current += bal; return; }
    const daysLate = daysBetween(due, today);
    if (daysLate <= 30) agingBuckets["30"] += bal;
    else if (daysLate <= 60) agingBuckets["60"] += bal;
    else agingBuckets["90+"] += bal;
  });
  const agingTotal = agingBuckets.current + agingBuckets["30"] + agingBuckets["60"] + agingBuckets["90+"];

  // ─── Invoice Generation ─────────────────────────────────
  const openNewInvoice = useCallback((clientId) => {
    const clientSales = uninvoicedSales.filter(s => !clientId || s.clientId === clientId);
    const cid = clientId || clientSales[0]?.clientId || clients[0]?.id || "";
    const cSales = uninvoicedSales.filter(s => s.clientId === cid);
    const due = new Date(); due.setDate(due.getDate() + 30);

    setInvForm({
      clientId: cid,
      billingSchedule: "lump_sum",
      lines: cSales.map(s => {
        const iss = issues.find(i => i.id === s.issueId);
        const pubName = pn(s.publication);
        const adSize = s.size || s.type || "Ad";
        const desc = adSize.includes(pubName) ? `${adSize}` : `${adSize}`;
        return {
          saleId: s.id, pubId: s.publication, pubName,
          description: desc, issueLabel: iss?.label || "TBD",
          date: s.date || "",
          productType: s.productType || "display_print",
          quantity: 1, unitPrice: s.amount || 0, total: s.amount || 0,
          selected: true,
        };
      }).sort((a, b) => a.pubName.localeCompare(b.pubName) || a.date.localeCompare(b.date)),
      dueDate: due.toISOString().slice(0, 10),
      notes: "", monthlyAmount: 0, planMonths: 0,
    });
    setInvModal(true);
  }, [uninvoicedSales, clients, issues, pubs]);
  openNewInvoiceRef.current = openNewInvoice;

  const toggleLine = (idx) => {
    setInvForm(f => ({
      ...f,
      lines: f.lines.map((l, i) => i === idx ? { ...l, selected: !l.selected } : l),
    }));
  };

  const updateLinePrice = (idx, price) => {
    setInvForm(f => ({
      ...f,
      lines: f.lines.map((l, i) => i === idx ? { ...l, unitPrice: Number(price) || 0, total: (Number(price) || 0) * l.quantity } : l),
    }));
  };

  const addManualLine = () => {
    setInvForm(f => ({
      ...f,
      lines: [...f.lines, { saleId: null, description: "", productType: "display_print", quantity: 1, unitPrice: 0, total: 0, selected: true }],
    }));
  };

  const selectedLines = invForm.lines.filter(l => l.selected);
  const invSubtotal = selectedLines.reduce((s, l) => s + l.total, 0);
  const invTotal = invSubtotal; // Could add tax/discount here

  const changeInvClient = (cid) => {
    const cSales = uninvoicedSales.filter(s => s.clientId === cid);
    setInvForm(f => ({
      ...f,
      clientId: cid,
      lines: cSales.map(s => ({
        saleId: s.id,
        description: `${pn(s.publication)} — ${s.type} (${issues.find(i => i.id === s.issueId)?.label || "TBD"})`,
        productType: "display_print",
        quantity: 1,
        unitPrice: s.amount || 0,
        total: s.amount || 0,
        selected: true,
      })),
    }));
  };

  const saveInvoice = async () => {
    if (!invForm.clientId || selectedLines.length === 0) return;
    // Invoice numbers are minted by the next_invoice_number() RPC so the
    // format stays consistent with auto-generated invoices (Flatplan,
    // generate_pending_invoices). Fallback only if the RPC is unreachable.
    let invNum;
    try {
      const { data, error } = await supabase.rpc("next_invoice_number");
      if (error) throw error;
      invNum = data;
    } catch (err) {
      console.error("next_invoice_number RPC failed:", err);
      invNum = `13XX-${String((invoices?.length || 0) + 13001).padStart(5, "0")}`;
    }
    const monthly = invForm.billingSchedule === "monthly_plan" && invForm.planMonths > 0
      ? Math.round((invTotal / invForm.planMonths) * 100) / 100 : 0;

    const newInv = {
      id: "inv-" + Date.now(),
      invoiceNumber: invNum,
      clientId: invForm.clientId,
      status: "draft",
      billingSchedule: invForm.billingSchedule,
      subtotal: invSubtotal,
      discountPct: 0,
      discountAmount: 0,
      tax: 0,
      total: invTotal,
      amountPaid: 0,
      balanceDue: invTotal,
      monthlyAmount: monthly,
      planMonths: invForm.planMonths,
      issueDate: today,
      dueDate: invForm.dueDate,
      notes: invForm.notes,
      lines: selectedLines,
      createdAt: new Date().toISOString(),
    };

    setInvoices(prev => [...(prev || []), newInv]);
    setInvModal(false);
  };

  // Lock an invoice — once sent or downloaded, it leaves containment and the
  // auto-generator cannot append new lines to it.
  const lockInvoice = async (invId) => {
    const lockedAt = new Date().toISOString();
    setInvoices(prev => (prev || []).map(i => i.id === invId ? { ...i, lockedAt } : i));
    try { await supabase.from("invoices").update({ locked_at: lockedAt }).eq("id", invId); }
    catch (err) { console.error("lockInvoice error:", err); }
  };

  const sendInvoice = async (invId) => {
    const inv = processedInvoices.find(i => i.id === invId);
    if (!inv) return;
    const lockedAt = new Date().toISOString();
    setInvoices(prev => (prev || []).map(i => i.id === invId ? { ...i, status: "sent", lockedAt } : i));
    try { await supabase.from("invoices").update({ status: "sent", locked_at: lockedAt }).eq("id", invId); }
    catch (err) { console.error("sendInvoice DB error:", err); }
    if (bus) bus.emit("invoice.sent", { invoiceId: invId, clientId: inv.clientId });

    // Generate and send invoice email
    // Recipient priority: client.billingEmail > primary client_contacts row >
    // first local-state contact. CCs come from client.billingCcEmails (up to 2).
    const client = (clients || []).find(c => c.id === inv.clientId);
    const { data: contactRows } = await supabase.from("client_contacts").select("email").eq("client_id", inv.clientId).limit(1);
    const fallbackEmail = contactRows?.[0]?.email || client?.contacts?.[0]?.email;
    const clientEmail = (client?.billingEmail || "").trim() || fallbackEmail;
    const ccEmails = (client?.billingCcEmails || []).filter(Boolean).slice(0, 2);
    if (clientEmail) {
      const htmlBody = generateInvoiceHtml({
        invoice: inv,
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
      try {
        await sendGmailEmail({
          teamMemberId: null,
          to: [clientEmail],
          cc: ccEmails,
          subject: `Invoice ${inv.invoiceNumber} — 13 Stars Media Group`,
          htmlBody,
          mode: "send",
          emailType: "invoice", clientId: inv.clientId, refId: inv.id, refType: "invoice",
        });
      } catch (err) { console.error("Invoice email error:", err); }
    }
  };

  const downloadInvoice = async (invId) => {
    generatePdf("invoice", invId);
    // Lock — once downloaded, the invoice has left containment
    const inv = processedInvoices.find(i => i.id === invId);
    if (inv && !inv.lockedAt) await lockInvoice(invId);
  };

  const generatePending = async () => {
    try {
      const { data, error } = await supabase.rpc("generate_pending_invoices", { p_mode: "all" });
      if (error) throw error;
      await dialog.alert(`Generated ${data.invoices_created || 0} new invoices, updated ${data.invoices_updated || 0}, added ${data.lines_added || 0} lines totaling $${Number(data.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Refresh to see them.`);
    } catch (err) {
      console.error("generate_pending_invoices error:", err);
      await dialog.alert("Failed to generate: " + err.message);
    }
  };

  const voidInvoice = (invId) => {
    setInvoices(prev => (prev || []).map(i => i.id === invId ? { ...i, status: "void", balanceDue: 0 } : i));
  };

  // ─── Payment Recording ──────────────────────────────────
  const openPayment = (invId) => {
    const inv = processedInvoices.find(i => i.id === invId);
    setPayForm({
      invoiceId: invId,
      amount: inv?.balanceDue || 0,
      method: "card",
      lastFour: "",
      notes: "",
    });
    setPayModal(true);
  };

  const savePayment = () => {
    if (!payForm.invoiceId || !payForm.amount) return;
    const newPay = {
      id: "pay-" + Date.now(),
      invoiceId: payForm.invoiceId,
      amount: Number(payForm.amount) || 0,
      method: payForm.method,
      lastFour: payForm.lastFour,
      notes: payForm.notes,
      receivedAt: new Date().toISOString(),
    };

    setPayments(prev => [...(prev || []), newPay]);

    // Emit event
    const inv = processedInvoices.find(i => i.id === payForm.invoiceId);
    if (bus && inv) bus.emit("payment.received", { paymentId: newPay.id, invoiceId: payForm.invoiceId, clientId: inv.clientId, amount: newPay.amount });

    // Update invoice
    setInvoices(prev => (prev || []).map(inv => {
      if (inv.id !== payForm.invoiceId) return inv;
      const totalPaid = (inv.amountPaid || 0) + newPay.amount;
      const balance = Math.max(0, (inv.total || 0) - totalPaid);
      return {
        ...inv,
        amountPaid: totalPaid,
        balanceDue: balance,
        status: balance <= 0 ? "paid" : "partially_paid",
      };
    }));
    setPayModal(false);
  };

  // ─── Filtering & Sorting ────────────────────────────────
  let filtered = processedInvoices;
  if (statusFilter === "open") {
    filtered = filtered.filter(i => ["sent", "partially_paid", "overdue"].includes(i.status));
  } else if (statusFilter !== "All") {
    filtered = filtered.filter(i => i.status === statusFilter);
  }
  if (sr) {
    const q = sr.toLowerCase();
    filtered = filtered.filter(i => cn(i.clientId).toLowerCase().includes(q) || i.invoiceNumber?.toLowerCase().includes(q));
  }

  const doSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  filtered = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortCol === "client") return dir * cn(a.clientId).localeCompare(cn(b.clientId));
    if (sortCol === "total") return dir * ((a.total || 0) - (b.total || 0));
    if (sortCol === "balance") return dir * ((a.balanceDue || 0) - (b.balanceDue || 0));
    if (sortCol === "due_date") return dir * (a.dueDate || "").localeCompare(b.dueDate || "");
    return dir * (a.issueDate || "").localeCompare(b.issueDate || "");
  });

  // ─── Invoice Detail View ────────────────────────────────
  const viewInv = processedInvoices.find(i => i.id === viewInvId);
  const invPayments = (payments || []).filter(p => p.invoiceId === viewInvId);

  if (viewInv) {
    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button onClick={() => setViewInvId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.ac, fontSize: FS.base, fontWeight: FW.bold, fontFamily: COND, textAlign: "left", padding: 0 }}>← Back to Invoices</button>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{viewInv.invoiceNumber}</h2>
          <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tm }}>{cn(viewInv.clientId)}</div>
          <div style={{ fontSize: FS.sm, color: Z.td, marginTop: 2 }}>Issued {fmtDate(viewInv.issueDate)} · Due {fmtDate(viewInv.dueDate)}</div>
          {viewInv.billingSchedule === "monthly_plan" && <div style={{ fontSize: FS.sm, color: Z.pu, marginTop: 2 }}>Monthly Plan: {fmtCurrency(viewInv.monthlyAmount)}/mo × {viewInv.planMonths} months</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <InvBadge status={viewInv.status} />
          <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.tx, marginTop: 8, fontFamily: DISPLAY }}>{fmtCurrency(viewInv.total)}</div>
          {viewInv.balanceDue > 0 && viewInv.balanceDue < viewInv.total && <div style={{ fontSize: FS.md, color: Z.da, fontWeight: FW.bold, marginTop: 2 }}>Balance: {fmtCurrency(viewInv.balanceDue)}</div>}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        {viewInv.status === "draft" && <Btn onClick={() => sendInvoice(viewInv.id)}>
          <Ic.send size={13} /> Send Invoice
        </Btn>}
        {["sent", "partially_paid", "overdue"].includes(viewInv.status) && <Btn onClick={() => openPayment(viewInv.id)}>
          <Ic.check size={13} /> Record Payment
        </Btn>}
        {viewInv.status !== "void" && viewInv.status !== "paid" && <Btn v="ghost" onClick={() => { voidInvoice(viewInv.id); setViewInvId(null); }}>Void</Btn>}
        <Btn v="secondary" onClick={() => downloadInvoice(viewInv.id)}><Ic.download size={13} /> Download PDF</Btn>
      </div>

      {/* Line Items */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Line Items</div>
        <DataTable>
          <thead>
            <tr style={{ borderBottom: `1px solid ${Z.bd}` }}>
              <th style={{ textAlign: "left", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Description</th>
              <th style={{ textAlign: "right", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", width: 60 }}>Qty</th>
              <th style={{ textAlign: "right", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", width: 100 }}>Unit Price</th>
              <th style={{ textAlign: "right", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", width: 100 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {!viewInv.linesHydrated && <tr><td colSpan={4} style={{ padding: 16, textAlign: "center", color: Z.td, fontSize: FS.sm, fontStyle: "italic" }}>Loading line items…</td></tr>}
            {viewInv.linesHydrated && (viewInv.lines || []).map((l, i) => <tr key={l.id || i} style={{ borderBottom: `1px solid ${Z.bd}` }}>
              <td style={{ fontSize: FS.base, color: Z.tx }}>{l.description}</td>
              <td style={{ fontSize: FS.base, color: Z.tm, textAlign: "right" }}>{l.quantity}</td>
              <td style={{ fontSize: FS.base, color: Z.tm, textAlign: "right" }}>{fmtCurrency(l.unitPrice)}</td>
              <td style={{ fontSize: FS.md, color: Z.tx, fontWeight: FW.bold, textAlign: "right" }}>{fmtCurrency(l.total)}</td>
            </tr>)}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, textAlign: "right" }}>Total</td>
              <td style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.su, textAlign: "right" }}>{fmtCurrency(viewInv.total)}</td>
            </tr>
          </tfoot>
        </DataTable>
      </GlassCard>

      {/* Payment History */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Payment History</div>
        {invPayments.length === 0
          ? <div style={{ fontSize: FS.base, color: Z.td, padding: "12px 0" }}>No payments recorded</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {invPayments.map(p => <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: Z.bg, borderRadius: R }}>
                <div>
                  <div style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{fmtCurrency(p.amount)}</div>
                  <div style={{ fontSize: FS.xs, color: Z.td }}>{PAYMENT_METHODS.find(m => m.value === p.method)?.label || p.method}{p.lastFour ? ` ···${p.lastFour}` : ""}</div>
                </div>
                <div style={{ fontSize: FS.sm, color: Z.tm }}>{fmtDate(p.receivedAt?.slice(0, 10))}</div>
              </div>)}
            </div>}
      </GlassCard>

      {viewInv.notes && <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Notes</div>
        <div style={{ fontSize: FS.base, color: Z.tm }}>{viewInv.notes}</div>
      </GlassCard>}
    </div>;
  }

  // ─── Main Render ────────────────────────────────────────
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="Billing">
      {tab === "Invoices" && <SB value={sr} onChange={setSr} placeholder="Search invoices..." />}
      <Btn sm v="secondary" onClick={generatePending}><Ic.invoice size={13} /> Generate Invoices</Btn>
      <Btn sm onClick={() => openNewInvoice(null)}><Ic.plus size={13} /> New Invoice</Btn>
    </PageHeader>

    <TabRow><TB tabs={["Overview", "Invoices", "Bills", "Payment Plans", "Receivables", "Reports", "Settings"]} active={tab} onChange={setTab} />{tab === "Invoices" && <><TabPipe /><TB tabs={INV_STATUSES.map(s => INV_STATUS_LABELS[s])} active={INV_STATUS_LABELS[statusFilter] || "Overdue"} onChange={v => { const entry = Object.entries(INV_STATUS_LABELS).find(([, l]) => l === v); setStatusFilter(entry ? entry[0] : "overdue"); }} /></>}</TabRow>

    {/* ════════ OVERVIEW TAB ════════ */}
    {tab === "Overview" && <>
      {/* Stats Row — show "—" until billingLoaded so the cards don't flash zeros */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <GlassStat label="Outstanding" value={billingLoaded ? fmtCurrency(totalOutstanding) : "—"} sub={billingLoaded ? `${processedInvoices.filter(i => ["sent", "partially_paid", "overdue"].includes(i.status)).length} invoices` : "Loading…"} />
        <GlassStat label="Overdue" value={billingLoaded ? fmtCurrency(totalOverdue) : "—"} sub={billingLoaded ? (overdueCount > 0 ? `${overdueCount} invoice${overdueCount > 1 ? "s" : ""} past due` : "None") : "Loading…"} color={Z.da} />
        <GlassStat label="Collected This Month" value={billingLoaded ? fmtCurrency(totalPaidThisMonth) : "—"} />
        <GlassStat label="Drafts" value={billingLoaded ? fmtCurrency(totalDraftValue) : "—"} sub={billingLoaded ? "Pending send" : "Loading…"} />
      </div>

      {/* Uninvoiced Sales — primary action area.
          Hidden until billingLoaded so we don't show every closed sale as
          "uninvoiced" in the brief window before invoices finish loading. */}
      {!billingLoaded ? <GlassCard style={{ borderLeft: `3px solid ${Z.bd}` }}>
        <div style={{ padding: 24, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>
          Loading invoice data…
        </div>
      </GlassCard>
      : uninvoicedSales.length > 0 && <GlassCard style={{ borderLeft: `3px solid ${Z.wa}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>
              {fmtCurrency(filteredUninvoiced.reduce((s, x) => s + (x.amount || 0), 0))}
            </div>
            <div style={{ fontSize: FS.sm, color: Z.tm }}>
              {filteredUninvoiced.length} closed sales across {uninvoicedByClient.length} clients need invoices
            </div>
          </div>
          <Btn onClick={() => openNewInvoice(null)}>Generate Invoices</Btn>
        </div>
        <div style={{ marginBottom: 10, fontSize: FS.micro, color: Z.td, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Rolling window: 30 days back &middot; 30 days forward. Client Profile shows the full uninvoiced list.
        </div>
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS.sm, fontFamily: COND }}>
            <thead><tr style={{ borderBottom: `1px solid ${Z.bd}` }}>
              <th style={{ padding: "6px 10px", textAlign: "left", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Client</th>
              <th style={{ padding: "6px 10px", textAlign: "right", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Amount</th>
              <th style={{ padding: "6px 10px", textAlign: "center", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Sales</th>
              <th style={{ padding: "6px 10px", textAlign: "right", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}></th>
            </tr></thead>
            <tbody>
              {uninvoicedByClient.slice(0, 50).map(uc => (
                <tr key={uc.clientId} style={{ borderBottom: `1px solid ${Z.bd}15` }}>
                  <td style={{ padding: "6px 10px", fontWeight: FW.semi, color: Z.tx }}>
                    {onNavigate ? (
                      <a
                        href={`/sales?tab=clients&id=${uc.clientId}`}
                        onClick={e => { e.preventDefault(); onNavigate(`/sales?tab=clients&id=${uc.clientId}`); }}
                        style={{ color: Z.tx, textDecoration: "none", borderBottom: `1px dotted ${Z.tm}`, cursor: "pointer" }}
                      >{cn(uc.clientId)}</a>
                    ) : cn(uc.clientId)}
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: FW.heavy, color: Z.tx }}>{fmtCurrency(uc.total)}</td>
                  <td style={{ padding: "6px 10px", textAlign: "center", color: Z.tm }}>{uc.count}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right" }}><Btn sm v="secondary" onClick={() => openNewInvoice(uc.clientId)}>Invoice</Btn></td>
                </tr>
              ))}
            </tbody>
          </table>
          {uninvoicedByClient.length > 50 && <div style={{ padding: 8, textAlign: "center", fontSize: FS.sm, color: Z.td }}>Showing top 50 of {uninvoicedByClient.length} clients</div>}
        </div>
      </GlassCard>}

      {/* Aging Chart */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Accounts Receivable Aging</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {[
            { label: "Current", value: agingBuckets.current, color: Z.su },
            { label: "30", value: agingBuckets["30"], color: Z.wa },
            { label: "60", value: agingBuckets["60"], color: Z.or || Z.wa },
            { label: "90+", value: agingBuckets["90+"], color: Z.da },
            { label: "Total", value: agingTotal, color: Z.tx },
          ].map(b => <div key={b.label} style={{ textAlign: "center", padding: 16, background: Z.bg, borderRadius: R, borderLeft: b.label === "Total" ? `2px solid ${Z.bd}` : undefined }}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>{b.label === "Total" ? "Total" : b.label === "Current" ? "Current" : `${b.label} past due`}</div>
            <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: b.value > 0 ? b.color : Z.td, fontFamily: DISPLAY }}>{fmtCurrency(b.value)}</div>
          </div>)}
        </div>
      </GlassCard>

      {/* Recent Invoices */}
      <GlassCard>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1 }}>Recent Invoices</div>
          <button onClick={() => setTab("Invoices")} style={{ background: "none", border: "none", cursor: "pointer", color: Z.ac, fontSize: FS.sm, fontWeight: FW.bold }}>View all →</button>
        </div>
        {processedInvoices.length === 0
          ? <div style={{ fontSize: FS.base, color: Z.td, textAlign: "center" }}>No invoices yet. Create one from closed sales above.</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[...processedInvoices].sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || "")).slice(0, 8).map(inv => <div key={inv.id} onClick={() => setViewInvId(inv.id)} style={{ display: "grid", gridTemplateColumns: "100px 1fr 100px 80px 60px", gap: 10, alignItems: "center", borderRadius: R, cursor: "pointer", background: "transparent", transition: "background 0.1s" }}>
                <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.ac, fontFamily: COND }}>{inv.invoiceNumber}</span>
                <span style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx }}>
                  {onNavigate ? (
                    <a
                      href={`/sales?tab=clients&id=${inv.clientId}`}
                      onClick={e => { e.stopPropagation(); e.preventDefault(); onNavigate(`/sales?tab=clients&id=${inv.clientId}`); }}
                      style={{ color: Z.tx, textDecoration: "none", borderBottom: `1px dotted ${Z.tm}`, cursor: "pointer" }}
                    >{cn(inv.clientId)}</a>
                  ) : cn(inv.clientId)}
                </span>
                <span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx, textAlign: "right" }}>{fmtCurrency(inv.total)}</span>
                <span style={{ fontSize: FS.xs, color: Z.td, textAlign: "right" }}>{fmtDate(inv.dueDate)}</span>
                <span style={{ textAlign: "right" }}><InvBadge status={inv.status} /></span>
              </div>)}
            </div>}
      </GlassCard>
    </>}

    {/* ════════ INVOICES TAB ════════ */}
    {tab === "Invoices" && <>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn sm v="secondary" onClick={() => setCreditMemoModal(true)}>+ Credit Memo</Btn>
        {creditMemos.filter(cm => cm.status === "pending").length > 0 && (
          <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.wa, alignSelf: "center" }}>{creditMemos.filter(cm => cm.status === "pending").length} pending credit{creditMemos.filter(cm => cm.status === "pending").length !== 1 ? "s" : ""}</span>
        )}
      </div>
      <GlassCard style={{ padding: 0, overflow: "hidden" }}>
        <DataTable>
          <thead>
            <tr>
              {[
                { key: "invoice", label: "Invoice" },
                { key: "client", label: "Client" },
                { key: "issue_date", label: "Issued" },
                { key: "due_date", label: "Due" },
                { key: "total", label: "Total" },
                { key: "balance", label: "Balance" },
                { key: "status", label: "Status" },
                { key: "actions", label: "" },
              ].map(h => <th key={h.key} onClick={() => h.key !== "actions" && doSort(h.key)} style={{ textAlign: h.key === "total" || h.key === "balance" ? "right" : "left", fontWeight: FW.heavy, color: Z.tm, fontSize: FS.xs, textTransform: "uppercase", cursor: h.key !== "actions" ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap" }}>
                {h.label}{sortCol === h.key && <span style={{ marginLeft: 3, fontSize: 9 }}>{sortDir === "asc" ? "▲" : "▼"}</span>}
              </th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0
              ? <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: Z.td, fontSize: FS.base }}>No invoices match your filters</td></tr>
              : filtered.map(inv => {
                const send = invoiceSendMap[inv.id];
                const sendOk = send && send.status === "sent";
                const sendFailed = send && send.status === "failed";
                const sendTitle = send
                  ? `${sendOk ? "Emailed" : sendFailed ? "Send failed" : send.status} ${fmtTimeRelative(send.created_at)} \u2192 ${send.to_email}${send.count > 1 ? ` (${send.count}x)` : ""}${send.error_message ? `\n${send.error_message}` : ""}`
                  : null;
                return <tr key={inv.id} onClick={() => setViewInvId(inv.id)} style={{ cursor: "pointer" }}>
                  <td style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.ac, fontFamily: COND }}>{inv.invoiceNumber}</td>
                  <td style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx }}>{cn(inv.clientId)}</td>
                  <td style={{ fontSize: FS.sm, color: Z.tm }}>{fmtDate(inv.issueDate)}</td>
                  <td style={{ fontSize: FS.sm, color: inv.status === "overdue" ? Z.da : Z.tm, fontWeight: inv.status === "overdue" ? 700 : 400 }}>{fmtDate(inv.dueDate)}</td>
                  <td style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx, textAlign: "right" }}>{fmtCurrency(inv.total)}</td>
                  <td style={{ fontSize: FS.base, fontWeight: FW.bold, color: inv.balanceDue > 0 ? Z.da : Z.su, textAlign: "right" }}>{fmtCurrency(inv.balanceDue)}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <InvBadge status={inv.status} />
                      {send && <span
                        title={sendTitle}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 3,
                          padding: "2px 7px", borderRadius: 10,
                          fontSize: FS.micro, fontWeight: FW.heavy, fontFamily: COND,
                          textTransform: "uppercase", letterSpacing: 0.4,
                          background: sendOk ? Z.ss : sendFailed ? Z.ds : Z.ws,
                          color: sendOk ? Z.go : sendFailed ? Z.da : Z.wa,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {sendOk ? "\u2714 Sent" : sendFailed ? "\u26A0 Failed" : "Draft"} {fmtTimeRelative(send.created_at)}
                      </span>}
                    </div>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      {inv.status === "draft" && <Btn sm v="secondary" onClick={e => { e.stopPropagation(); sendInvoice(inv.id); }}>Send</Btn>}
                      {["sent", "partially_paid", "overdue"].includes(inv.status) && <Btn sm v="secondary" onClick={e => { e.stopPropagation(); openPayment(inv.id); }}>Pay</Btn>}
                      {inv.quickbooksId
                        ? <span title={"QB ID: " + inv.quickbooksId} style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.go }}>QB ✓</span>
                        : inv.quickbooksSyncError
                          ? <span title={inv.quickbooksSyncError} style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.da, cursor: "pointer" }} onClick={e => { e.stopPropagation(); syncInvoiceToQB(inv); }}>QB ✕</span>
                          : inv.status !== "draft" && inv.status !== "void" && <Btn sm v="ghost" disabled={qbSyncing === inv.id} onClick={e => { e.stopPropagation(); syncInvoiceToQB(inv); }} style={{ fontSize: FS.micro, padding: "2px 6px" }}>{qbSyncing === inv.id ? "…" : "QB"}</Btn>
                      }
                    </div>
                  </td>
                </tr>;
              })}
          </tbody>
        </DataTable>
      </GlassCard>
    </>}

    {/* ════════ BILLS TAB ════════ */}
    {tab === "Bills" && <BillsTab bills={bills || []} pubs={pubs} insertBill={insertBill} updateBill={updateBill} deleteBill={deleteBill} />}

    {/* ════════ RECEIVABLES TAB — AR by Client ════════ */}
    {tab === "Receivables" && (() => {
      // Compute per-client AR with aging buckets + rep + last payment
      const payByClient = {};
      (payments || []).forEach(p => {
        const inv = processedInvoices.find(i => i.id === p.invoiceId);
        if (!inv) return;
        if (!payByClient[inv.clientId]) payByClient[inv.clientId] = { total: 0, last: null };
        payByClient[inv.clientId].total += p.amount || 0;
        const rAt = p.receivedAt?.slice(0, 10);
        if (rAt && (!payByClient[inv.clientId].last || rAt > payByClient[inv.clientId].last)) {
          payByClient[inv.clientId].last = rAt;
        }
      });

      const byClient = {};
      processedInvoices.filter(i => ["sent", "partially_paid", "overdue"].includes(i.status) && (i.balanceDue || 0) > 0).forEach(inv => {
        const cid = inv.clientId;
        if (!byClient[cid]) {
          const c = clients.find(x => x.id === cid);
          byClient[cid] = {
            clientId: cid,
            clientName: c?.name || "Unknown",
            repId: c?.repId || null,
            repName: (team || []).find(t => t.id === c?.repId)?.name || "—",
            current: 0, d30: 0, d60: 0, over90: 0,
            total: 0, count: 0,
            oldestDue: inv.dueDate,
            invoices: [],
            lastPaymentDate: payByClient[cid]?.last || null,
            lifetimePaid: payByClient[cid]?.total || 0,
          };
        }
        const bucket = byClient[cid];
        const due = inv.dueDate || inv.issueDate;
        const bal = inv.balanceDue || 0;
        if (!due || due >= today) bucket.current += bal;
        else {
          const daysLate = daysBetween(due, today);
          if (daysLate <= 30) bucket.d30 += bal;
          else if (daysLate <= 60) bucket.d60 += bal;
          else bucket.over90 += bal;
        }
        bucket.total += bal;
        bucket.count++;
        bucket.invoices.push(inv);
        if (due && (!bucket.oldestDue || due < bucket.oldestDue)) bucket.oldestDue = due;
      });

      let rows = Object.values(byClient);
      if (arClientSearch) rows = rows.filter(r => r.clientName.toLowerCase().includes(arClientSearch.toLowerCase()));
      if (arClientRep !== "all") rows = rows.filter(r => r.repId === arClientRep);
      if (arClientFilter === "chase") rows = rows.filter(r => r.d60 > 0 || r.over90 > 0);
      if (arClientFilter === "overdue") rows = rows.filter(r => r.d30 + r.d60 + r.over90 > 0);
      if (arClientFilter === "neverContacted") rows = rows.filter(r => !r.lastPaymentDate || daysBetween(r.lastPaymentDate, today) > 60);

      // Sort
      const dir = arClientSort.dir === "asc" ? 1 : -1;
      rows.sort((a, b) => {
        const k = arClientSort.key;
        if (k === "client") return a.clientName.localeCompare(b.clientName) * dir;
        if (k === "oldest") return ((a.oldestDue || "9") < (b.oldestDue || "9") ? -1 : 1) * dir;
        if (k === "lastPay") return ((a.lastPaymentDate || "") < (b.lastPaymentDate || "") ? -1 : 1) * dir;
        return ((a[k] || 0) - (b[k] || 0)) * dir;
      });

      const totals = rows.reduce((acc, r) => ({
        current: acc.current + r.current,
        d30: acc.d30 + r.d30, d60: acc.d60 + r.d60, over90: acc.over90 + r.over90,
        total: acc.total + r.total, count: acc.count + r.count,
      }), { current: 0, d30: 0, d60: 0, over90: 0, total: 0, count: 0 });

      // CSV export
      const exportCsv = () => {
        const header = ["Client","Rep","Invoices","Current","30","60","90+","Total","Oldest Due","Last Payment"].join(",");
        const lines = rows.map(r => [
          JSON.stringify(r.clientName), JSON.stringify(r.repName), r.count,
          r.current.toFixed(2), r.d30.toFixed(2), r.d60.toFixed(2), r.over90.toFixed(2), r.total.toFixed(2),
          r.oldestDue || "", r.lastPaymentDate || "",
        ].join(","));
        const blob = new Blob([header + "\n" + lines.join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `ar-by-client-${today}.csv`; a.click();
        URL.revokeObjectURL(url);
      };

      const SortTh = ({ label, col, align = "left" }) => (
        <th onClick={() => setArClientSort({ key: col, dir: arClientSort.key === col && arClientSort.dir === "desc" ? "asc" : "desc" })}
          style={{ padding: "8px 10px", textAlign: align, fontSize: FS.micro, fontWeight: FW.heavy, color: arClientSort.key === col ? Z.ac : Z.td, textTransform: "uppercase", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
          {label}{arClientSort.key === col && <span style={{ marginLeft: 3, fontSize: 9 }}>{arClientSort.dir === "asc" ? "▲" : "▼"}</span>}
        </th>
      );

      return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
          <GlassStat label="Current" value={fmtCurrency(totals.current)} color={Z.su} />
          <GlassStat label="30" value={fmtCurrency(totals.d30)} color={Z.wa} />
          <GlassStat label="60" value={fmtCurrency(totals.d60)} color={Z.or || Z.wa} />
          <GlassStat label="90+" value={fmtCurrency(totals.over90)} color={Z.da} />
          <GlassStat label="Total AR" value={fmtCurrency(totals.total)} sub={`${rows.length} client${rows.length === 1 ? "" : "s"} · ${totals.count} invoices`} color={Z.ac} />
        </div>

        {/* Filters */}
        <GlassCard>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <SB value={arClientSearch} onChange={setArClientSearch} placeholder="Search client..." style={{ minWidth: 200 }} />
            <Sel value={arClientRep} onChange={e => setArClientRep(e.target.value)} options={[
              { value: "all", label: "All Reps" },
              ...(team || []).filter(t => t.permissions?.includes("sales") || t.permissions?.includes("admin")).map(t => ({ value: t.id, label: t.name })),
            ]} />
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {[
                { k: "all", l: "All Open" },
                { k: "overdue", l: "All Past Due" },
                { k: "chase", l: "60+ Days (Chase)" },
                { k: "neverContacted", l: "Stale (60d no payment)" },
              ].map(opt => <Pill key={opt.k} label={opt.l} active={arClientFilter === opt.k} onClick={() => setArClientFilter(opt.k)} />)}
            </div>
            <div style={{ flex: 1 }} />
            <Btn sm v="secondary" onClick={exportCsv}><Ic.download size={12} /> Export CSV</Btn>
          </div>
        </GlassCard>

        {/* Table */}
        <GlassCard style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS.sm, fontFamily: COND }}>
            <thead style={{ background: Z.sa }}>
              <tr style={{ borderBottom: `1px solid ${Z.bd}` }}>
                <SortTh label="Client" col="client" />
                <SortTh label="Rep" col="repName" />
                <SortTh label="# Invs" col="count" align="right" />
                <SortTh label="Current" col="current" align="right" />
                <SortTh label="30" col="d30" align="right" />
                <SortTh label="60" col="d60" align="right" />
                <SortTh label="90+" col="over90" align="right" />
                <SortTh label="Total" col="total" align="right" />
                <SortTh label="Oldest Due" col="oldest" align="right" />
                <SortTh label="Last Pmt" col="lastPay" align="right" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={10} style={{ padding: 24, textAlign: "center", color: Z.td, fontSize: FS.base }}>No open receivables match filters</td></tr>
              : rows.slice(0, 500).map(r => <React.Fragment key={r.clientId}>
                <tr onClick={() => setArExpandedClient(e => e === r.clientId ? null : r.clientId)} style={{ borderBottom: `1px solid ${Z.bd}15`, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = Z.sa}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "7px 10px", fontWeight: FW.bold, color: Z.tx }}>{r.clientName}</td>
                  <td style={{ padding: "7px 10px", color: Z.tm, fontSize: FS.xs }}>{r.repName}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", color: Z.tm }}>{r.count}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", color: r.current > 0 ? Z.su : Z.td }}>{r.current > 0 ? fmtCurrency(r.current) : "—"}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", color: r.d30 > 0 ? Z.wa : Z.td }}>{r.d30 > 0 ? fmtCurrency(r.d30) : "—"}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", color: r.d60 > 0 ? Z.or || Z.wa : Z.td }}>{r.d60 > 0 ? fmtCurrency(r.d60) : "—"}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: r.over90 > 0 ? FW.bold : FW.regular, color: r.over90 > 0 ? Z.da : Z.td }}>{r.over90 > 0 ? fmtCurrency(r.over90) : "—"}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: FW.heavy, color: Z.tx, borderLeft: `2px solid ${Z.bd}30` }}>{fmtCurrency(r.total)}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", color: Z.tm, fontSize: FS.xs }}>{r.oldestDue ? fmtDate(r.oldestDue) : "—"}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", color: r.lastPaymentDate ? Z.tm : Z.da, fontSize: FS.xs }}>{r.lastPaymentDate ? `${daysBetween(r.lastPaymentDate, today)}d ago` : "never"}</td>
                </tr>
                {arExpandedClient === r.clientId && <tr>
                  <td colSpan={10} style={{ padding: "10px 16px", background: Z.bg, borderBottom: `1px solid ${Z.bd}15` }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {r.invoices.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || "")).map(inv => <div key={inv.id} onClick={e => { e.stopPropagation(); setViewInvId(inv.id); }} style={{ display: "grid", gridTemplateColumns: "120px 1fr 100px 100px 80px 60px", gap: 10, alignItems: "center", padding: "5px 8px", background: Z.sf, borderRadius: Ri, cursor: "pointer", fontSize: FS.xs }}>
                        <span style={{ fontWeight: FW.bold, color: Z.ac, fontFamily: COND }}>{inv.invoiceNumber}</span>
                        <span style={{ color: Z.tm }}>{inv.notes?.slice(0, 60) || "—"}</span>
                        <span style={{ color: Z.tm, textAlign: "right" }}>{fmtDate(inv.issueDate)}</span>
                        <span style={{ color: inv.dueDate < today ? Z.da : Z.tm, fontWeight: inv.dueDate < today ? FW.bold : FW.regular, textAlign: "right" }}>{fmtDate(inv.dueDate)}</span>
                        <span style={{ fontWeight: FW.heavy, color: Z.tx, textAlign: "right" }}>{fmtCurrency(inv.balanceDue)}</span>
                        <span style={{ textAlign: "right" }}><InvBadge status={inv.status} /></span>
                      </div>)}
                    </div>
                  </td>
                </tr>}
              </React.Fragment>)}
            </tbody>
          </table>
          {rows.length > 500 && <div style={{ padding: 8, textAlign: "center", fontSize: FS.xs, color: Z.td }}>Showing top 500 of {rows.length}</div>}
        </GlassCard>
      </div>;
    })()}

    {/* ════════ PAYMENT PLANS TAB ════════ */}
    {tab === "Payment Plans" && (() => {
      const monthlyContracts = (contracts || []).filter(c => c.paymentTerms === "monthly" && c.status === "active");
      const planClientIds = [...new Set(monthlyContracts.map(c => c.clientId))];

      const plans = planClientIds.map(cid => {
        const client = (clients || []).find(c => c.id === cid);
        if (!client) return null;
        const clientContracts = monthlyContracts.filter(c => c.clientId === cid);
        const monthlyAmount = clientContracts.reduce((s, c) => s + (c.monthlyAmount || 0), 0) || clientContracts[0]?.totalValue / 12 || 0;
        const chargeDay = clientContracts[0]?.chargeDay || 1;
        const clientInvs = processedInvoices.filter(i => i.clientId === cid);
        const openInvs = clientInvs.filter(i => ["draft", "sent", "overdue", "partially_paid"].includes(i.status) && (i.balanceDue || 0) > 0).sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
        const paidInvs = clientInvs.filter(i => i.status === "paid");
        const overdueInvs = openInvs.filter(i => i.dueDate && i.dueDate < today);
        const totalOutstanding = openInvs.reduce((s, i) => s + (i.balanceDue || 0), 0);
        const totalOverdue = overdueInvs.reduce((s, i) => s + (i.balanceDue || 0), 0);
        const hasCard = !!client.cardLast4;
        const failedCharges = openInvs.filter(i => i.chargeError).length;
        const needsAction = failedCharges > 0 || (!hasCard && totalOutstanding > 0) || overdueInvs.length > 0;

        return { client, monthlyAmount, chargeDay, openInvs, paidInvs, overdueInvs, totalOutstanding, totalOverdue, hasCard, failedCharges, needsAction };
      }).filter(Boolean).sort((a, b) => {
        if (a.needsAction !== b.needsAction) return a.needsAction ? -1 : 1;
        return (a.client.name || "").localeCompare(b.client.name || "");
      });

      const actionPlans = plans.filter(p => p.needsAction);
      const okPlans = plans.filter(p => !p.needsAction);
      const totalOutstandingAll = plans.reduce((s, p) => s + p.totalOutstanding, 0);
      const totalOverdueAll = plans.reduce((s, p) => s + p.totalOverdue, 0);
      const clientsWithCards = plans.filter(p => p.hasCard).length;
      const totalCredits = plans.reduce((s, p) => s + (p.client.creditBalance || 0), 0);

      const handleRetry = async (plan) => {
        // Charge the monthly amount via stripe-card edge function
        try {
          const res = await fetch(`${EDGE_FN_URL}/stripe-card`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "charge_invoice", invoice_id: plan.openInvs[0]?.id }),
          });
          const data = await res.json();
          if (data.success) { window.location.reload(); }
          else { console.error("Charge failed:", data.error); }
        } catch (err) { console.error("Charge error:", err); }
      };

      return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <GlassStat label="Active Plans" value={plans.length} color={Z.ac} />
          <GlassStat label="Outstanding" value={"$" + Math.round(totalOutstandingAll).toLocaleString()} color={totalOverdueAll > 0 ? Z.da : Z.su} />
          <GlassStat label="Needs Attention" value={actionPlans.length} color={actionPlans.length > 0 ? Z.da : Z.su} />
          <GlassStat label="Client Credits" value={"$" + Math.round(totalCredits).toLocaleString()} color={Z.su} />
        </div>

        {/* Needs Attention */}
        {actionPlans.length > 0 && <>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.da, textTransform: "uppercase", letterSpacing: 1 }}>Needs Attention ({actionPlans.length})</div>
          {actionPlans.map(p => <PaymentPlanCard key={p.client.id} plan={p} today={today} onRetry={handleRetry} />)}
        </>}

        {/* All OK */}
        {showAllPlans && okPlans.length > 0 && <>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1 }}>Active Plans ({okPlans.length})</div>
          {okPlans.map(p => <PaymentPlanCard key={p.client.id} plan={p} today={today} onRetry={handleRetry} />)}
        </>}

        {actionPlans.length === 0 && !showAllPlans && <GlassCard><div style={{ padding: 24, textAlign: "center", color: Z.su, fontSize: FS.md, fontWeight: FW.bold }}>All payment plans are current</div></GlassCard>}

        {okPlans.length > 0 && <Btn sm v={showAllPlans ? "primary" : "ghost"} onClick={() => setShowAllPlans(s => !s)}>{showAllPlans ? `Hide ${okPlans.length} current plans` : `Show all ${plans.length} plans`}</Btn>}
      </div>;
    })()}

    {/* ════════ REPORTS TAB (Sec 6.1–6.3) ════════ */}
    {tab === "Reports" && (() => {
      const _sales = sales || [];
      const _payments = payments || [];
      const _subs = subscribers || [];
      const _subPay = subscriptionPayments || [];
      const _team = team || [];
      const thisMonth = today.slice(0, 7);
      const thisYear = today.slice(0, 4);
      const thisQ = `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;

      // Period filter helper
      const inPeriod = (dateStr) => {
        if (!dateStr) return false;
        if (reportPeriod === "mtd") return dateStr.startsWith(thisMonth);
        if (reportPeriod === "qtd") { const m = new Date().getMonth(); const qStart = new Date(new Date().getFullYear(), Math.floor(m / 3) * 3, 1).toISOString().slice(0, 10); return dateStr >= qStart; }
        if (reportPeriod === "ytd") return dateStr.startsWith(thisYear);
        return true;
      };
      const pubMatch = (pid) => reportPub === "all" || pid === reportPub;

      // Filtered data
      const periodSales = _sales.filter(s => s.status === "Closed" && inPeriod(s.date || s.closedAt) && pubMatch(s.publication));
      const periodAdRev = periodSales.reduce((s, x) => s + (x.amount || 0), 0);
      const periodSubPay = _subPay.filter(p => inPeriod(p.paymentDate));
      const periodSubRev = periodSubPay.reduce((s, p) => s + (p.amount || 0), 0);

      return <>
        {/* Report selector + period filter */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {[
              { k: "revenue", l: "Revenue" },
              { k: "aging", l: "AR Aging" },
              { k: "uninvoiced", l: "Uninvoiced" },
              { k: "performance", l: "Sales Perf" },
              { k: "collections", l: "Rep Collections" },
              { k: "methods", l: "Payment Methods" },
              { k: "writeoffs", l: "Write-offs / Credits" },
            ].map(r => (
              <Pill key={r.k} label={r.l} active={reportView === r.k} onClick={() => setReportView(r.k)} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Sel value={reportPeriod} onChange={e => setReportPeriod(e.target.value)} options={[
              { value: "mtd", label: "Month to Date" }, { value: "qtd", label: "Quarter to Date" },
              { value: "ytd", label: "Year to Date" }, { value: "all", label: "All Time" },
            ]} />
            <Sel value={reportPub} onChange={e => setReportPub(e.target.value)} options={[
              { value: "all", label: "All Publications" }, ...(pubs || []).map(p => ({ value: p.id, label: p.name })),
            ]} />
          </div>
        </div>

        {/* ── Revenue Summary (Sec 6.3.1) ── */}
        {reportView === "revenue" && <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            <GlassStat label="Total Revenue" value={fmtCurrency(periodAdRev + periodSubRev)} color={Z.go} />
            <GlassStat label="Ad Revenue" value={fmtCurrency(periodAdRev)} sub={`${periodSales.length} sales`} />
            <GlassStat label="Sub Revenue" value={fmtCurrency(periodSubRev)} sub={`${periodSubPay.length} payments`} />
          </div>

          {/* By publication */}
          <GlassCard>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Revenue by Publication</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {(pubs || []).map(p => {
                const pubRev = _sales.filter(s => s.status === "Closed" && inPeriod(s.date || s.closedAt) && s.publication === p.id).reduce((s, x) => s + (x.amount || 0), 0);
                const goalObj = issues?.filter(i => i.pubId === p.id && inPeriod(i.date));
                const issueGoal = (goalObj || []).reduce((s, iss) => s + (iss.revenueGoal || p.defaultRevenueGoal || 0), 0);
                const pct = issueGoal > 0 ? Math.min(100, Math.round((pubRev / issueGoal) * 100)) : 0;
                if (reportPub !== "all" && p.id !== reportPub) return null;
                return <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 1fr 60px", gap: 10, alignItems: "center", background: Z.bg, borderRadius: R, padding: "8px 12px" }}>
                  <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>{p.name}</div>
                  <div style={{ textAlign: "right", fontSize: FS.md, fontWeight: FW.heavy, color: Z.su }}>{fmtCurrency(pubRev)}</div>
                  <div style={{ textAlign: "right", fontSize: FS.sm, color: Z.td }}>{issueGoal > 0 ? `of ${fmtCurrency(issueGoal)}` : "No goal"}</div>
                  <div style={{ height: 6, background: Z.sa, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: pct >= 80 ? Z.go : pct >= 50 ? Z.wa : Z.da, borderRadius: 3, transition: "width 0.5s" }} />
                  </div>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: pct >= 80 ? Z.go : pct >= 50 ? Z.wa : Z.da, textAlign: "right" }}>{pct}%</div>
                </div>;
              }).filter(Boolean)}
            </div>
          </GlassCard>

          {/* By salesperson */}
          <GlassCard>
            <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Revenue by Salesperson</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {_team.filter(t => ["Sales Manager", "Salesperson"].includes(t.role) && t.isActive !== false).map(sp => {
                const myClients = new Set((clients || []).filter(c => c.repId === sp.id).map(c => c.id));
                const spRev = periodSales.filter(s => myClients.has(s.clientId)).reduce((s2, x) => s2 + (x.amount || 0), 0);
                const dealCount = periodSales.filter(s => myClients.has(s.clientId)).length;
                return <div key={sp.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px", gap: 10, alignItems: "center", background: Z.bg, borderRadius: R, padding: "8px 12px" }}>
                  <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>{sp.name}</div>
                  <div style={{ textAlign: "right", fontSize: FS.md, fontWeight: FW.heavy, color: Z.su }}>{fmtCurrency(spRev)}</div>
                  <div style={{ textAlign: "right", fontSize: FS.sm, color: Z.td }}>{dealCount} deal{dealCount !== 1 ? "s" : ""}</div>
                </div>;
              })}
            </div>
          </GlassCard>
        </>}

        {/* ── AR Aging Report — flat one-row-per-client table ── */}
        {reportView === "aging" && (() => {
          // Only include invoices with a real open balance. A zero-balance
          // overdue/sent row would show a client with a $0 total, which is
          // never what the report is meant to surface.
          const openInv = processedInvoices.filter(i =>
            ["sent", "partially_paid", "overdue"].includes(i.status)
            && (i.balanceDue || 0) > 0
            && (reportPub === "all" || i.lines?.some(l => l.publication === reportPub))
          );

          // One row per client with 4-bucket + total
          const byClient = {};
          openInv.forEach(inv => {
            const cid = inv.clientId;
            if (!byClient[cid]) {
              byClient[cid] = { clientId: cid, clientName: cn(cid), current: 0, d30: 0, d60: 0, over90: 0, total: 0 };
            }
            const row = byClient[cid];
            const bal = inv.balanceDue || 0;
            const due = inv.dueDate || inv.issueDate;
            if (!due || due >= today) row.current += bal;
            else {
              const daysLate = daysBetween(due, today);
              if (daysLate <= 30) row.d30 += bal;
              else if (daysLate <= 60) row.d60 += bal;
              else row.over90 += bal;
            }
            row.total += bal;
          });

          // Belt and suspenders: drop any synthesized row whose open balances
          // cancel to zero (shouldn't happen, but the report is defined as
          // clients with open balances only).
          const rows = Object.values(byClient).filter(r => r.total > 0);
          const sortDir = agingReportSort.dir === "asc" ? 1 : -1;
          rows.sort((a, b) => {
            const k = agingReportSort.key;
            if (k === "client") return a.clientName.localeCompare(b.clientName) * sortDir;
            return ((a[k] || 0) - (b[k] || 0)) * sortDir;
          });
          const totals = rows.reduce((acc, r) => ({
            current: acc.current + r.current,
            d30: acc.d30 + r.d30,
            d60: acc.d60 + r.d60,
            over90: acc.over90 + r.over90,
            total: acc.total + r.total,
          }), { current: 0, d30: 0, d60: 0, over90: 0, total: 0 });

          // CSV export — same flat shape
          const exportCsv = () => {
            const header = ["Client","Current","30","60","90+","Total"].join(",");
            const lines = rows.map(r => [
              JSON.stringify(r.clientName),
              r.current.toFixed(2), r.d30.toFixed(2), r.d60.toFixed(2), r.over90.toFixed(2), r.total.toFixed(2),
            ].join(","));
            const footer = ["Total",
              totals.current.toFixed(2), totals.d30.toFixed(2), totals.d60.toFixed(2), totals.over90.toFixed(2), totals.total.toFixed(2),
            ].join(",");
            const blob = new Blob([header + "\n" + lines.join("\n") + "\n" + footer], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `ar-aging-${today}.csv`; a.click();
            URL.revokeObjectURL(url);
          };

          const Th = ({ children, align = "left", col }) => {
            const active = agingReportSort.key === col;
            const toggle = () => setAgingReportSort(prev => ({
              key: col,
              dir: prev.key === col && prev.dir === "desc" ? "asc" : "desc",
            }));
            // For the client (text) column, "asc" = A→Z, "desc" = Z→A.
            // For numeric columns, "asc" = low→high, "desc" = high→low.
            const arrow = active ? (col === "client"
              ? (agingReportSort.dir === "asc" ? " A→Z" : " Z→A")
              : (agingReportSort.dir === "asc" ? " ▲" : " ▼")) : "";
            return <th onClick={toggle}
              style={{ padding: "10px 14px", textAlign: align, fontSize: FS.xs, fontWeight: FW.heavy, color: active ? Z.ac : Z.td, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `2px solid ${Z.bd}`, whiteSpace: "nowrap", background: Z.sa, cursor: "pointer", userSelect: "none" }}>
              {children}{arrow}
            </th>;
          };
          const Td = ({ children, align = "left", bold = false, color, borderLeft = false }) => (
            <td style={{ padding: "8px 14px", textAlign: align, fontSize: FS.sm, fontWeight: bold ? FW.heavy : FW.regular, color: color || Z.tx, borderBottom: `1px solid ${Z.bd}15`, borderLeft: borderLeft ? `2px solid ${Z.bd}30` : undefined, fontFamily: COND }}>{children}</td>
          );

          return <GlassCard style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${Z.bd}` }}>
              <div>
                <div style={{ fontSize: FS.md, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>AR Aging — {fmtDate(today)}</div>
                <div style={{ fontSize: FS.xs, color: Z.tm }}>{rows.length} client{rows.length === 1 ? "" : "s"} with open balance · {fmtCurrency(totals.total)} total</div>
              </div>
              <Btn sm v="secondary" onClick={exportCsv}><Ic.download size={12} /> Export CSV</Btn>
            </div>
            <div style={{ maxHeight: "70vh", overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: COND }}>
                <thead>
                  <tr>
                    <Th col="client">Client</Th>
                    <Th col="current" align="right">Current</Th>
                    <Th col="d30" align="right">30</Th>
                    <Th col="d60" align="right">60</Th>
                    <Th col="over90" align="right">90+</Th>
                    <Th col="total" align="right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: Z.td }}>No open receivables</td></tr>
                  : rows.map(r => <tr key={r.clientId} onClick={() => { setArExpandedClient(r.clientId); setTab("Receivables"); }} style={{ cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = Z.sa}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <Td bold>{r.clientName}</Td>
                      <Td align="right" color={r.current > 0 ? Z.su : Z.td}>{r.current > 0 ? fmtCurrency(r.current) : "—"}</Td>
                      <Td align="right" color={r.d30 > 0 ? Z.wa : Z.td}>{r.d30 > 0 ? fmtCurrency(r.d30) : "—"}</Td>
                      <Td align="right" color={r.d60 > 0 ? (Z.or || Z.wa) : Z.td}>{r.d60 > 0 ? fmtCurrency(r.d60) : "—"}</Td>
                      <Td align="right" bold={r.over90 > 0} color={r.over90 > 0 ? Z.da : Z.td}>{r.over90 > 0 ? fmtCurrency(r.over90) : "—"}</Td>
                      <Td align="right" bold borderLeft>{fmtCurrency(r.total)}</Td>
                    </tr>)}
                </tbody>
                {rows.length > 0 && <tfoot>
                  <tr style={{ background: Z.sa, position: "sticky", bottom: 0 }}>
                    <td style={{ padding: "12px 14px", fontSize: FS.sm, fontWeight: FW.black, color: Z.tx, textTransform: "uppercase", letterSpacing: 0.5, borderTop: `2px solid ${Z.bd}`, fontFamily: COND }}>TOTAL</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontSize: FS.sm, fontWeight: FW.black, color: Z.su, borderTop: `2px solid ${Z.bd}`, fontFamily: COND }}>{fmtCurrency(totals.current)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontSize: FS.sm, fontWeight: FW.black, color: Z.wa, borderTop: `2px solid ${Z.bd}`, fontFamily: COND }}>{fmtCurrency(totals.d30)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontSize: FS.sm, fontWeight: FW.black, color: Z.or || Z.wa, borderTop: `2px solid ${Z.bd}`, fontFamily: COND }}>{fmtCurrency(totals.d60)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontSize: FS.sm, fontWeight: FW.black, color: Z.da, borderTop: `2px solid ${Z.bd}`, fontFamily: COND }}>{fmtCurrency(totals.over90)}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontSize: FS.md, fontWeight: FW.black, color: Z.tx, borderTop: `2px solid ${Z.bd}`, borderLeft: `2px solid ${Z.bd}30`, fontFamily: DISPLAY }}>{fmtCurrency(totals.total)}</td>
                  </tr>
                </tfoot>}
              </table>
            </div>
          </GlassCard>;
        })()}

        {/* ── Uninvoiced Contracts (Sec 6.2) ── */}
        {reportView === "uninvoiced" && (() => {
          const invSaleIds = new Set();
          processedInvoices.forEach(inv => inv.lines?.forEach(l => { if (l.saleId) invSaleIds.add(l.saleId); }));
          // Billing-module rolling window: 30 days back → 30 days forward.
          // Older or further-out uninvoiced sales are only visible on the
          // Client Profile, not on any Billing tab view.
          const cutoffPast30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
          const cutoff30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
          const uninv = _sales.filter(s => {
            if (s.status !== "Closed" || invSaleIds.has(s.id)) return false;
            if (reportPub !== "all" && s.publication !== reportPub) return false;
            const iss = (issues || []).find(i => i.id === s.issueId);
            const issDate = iss?.date;
            if (!issDate) return false;
            return issDate >= cutoffPast30 && issDate <= cutoff30;
          }).sort((a, b) => {
            const issA = (issues || []).find(i => i.id === a.issueId);
            const issB = (issues || []).find(i => i.id === b.issueId);
            return (issA?.date || "9").localeCompare(issB?.date || "9");
          });
          const published = uninv.filter(s => { const iss = (issues || []).find(i => i.id === s.issueId); return iss && iss.date && iss.date < today; });
          const upcoming = uninv.filter(s => { const iss = (issues || []).find(i => i.id === s.issueId); return iss && iss.date && iss.date >= today && iss.date <= cutoff30; });
          const totalUninv = uninv.reduce((s, x) => s + (x.amount || 0), 0);

          return <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              <GlassStat label="Total Uninvoiced" value={fmtCurrency(totalUninv)} color={totalUninv > 0 ? Z.wa : Z.go} sub={`${uninv.length} sales`} />
              <GlassStat label="Published Issues" value={fmtCurrency(published.reduce((s, x) => s + (x.amount || 0), 0))} sub={`${published.length} — ready to invoice`} color={Z.da} />
              <GlassStat label="Upcoming 30d" value={fmtCurrency(upcoming.reduce((s, x) => s + (x.amount || 0), 0))} sub={`${upcoming.length} — publishing soon`} />
            </div>

            {published.length > 0 && <GlassCard>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.da, textTransform: "uppercase", letterSpacing: 1 }}>Published — Ready to Invoice</div>
                <Btn sm onClick={() => alert(`Batch invoice for ${published.length} sales — coming soon`)}>Invoice All Published</Btn>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {published.map(s => {
                  const iss = (issues || []).find(i => i.id === s.issueId);
                  return <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px 80px 80px", gap: 10, alignItems: "center", background: Z.bg, borderRadius: R, padding: "6px 10px" }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{cn(s.clientId)}</div>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.su }}>{fmtCurrency(s.amount)}</div>
                    <div style={{ fontSize: FS.xs, color: Z.tm }}>{iss ? `${pn(iss.pubId)} ${iss.label}` : "—"}</div>
                    <div style={{ fontSize: FS.xs, color: Z.td }}>{fmtDate(iss?.date)}</div>
                    <Btn sm v="secondary" onClick={() => { /* pre-fill invoice from sale */ }}>Invoice</Btn>
                  </div>;
                })}
              </div>
            </GlassCard>}

            {upcoming.length > 0 && <GlassCard>
              <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Upcoming — Publishing Within 30 Days</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {upcoming.map(s => {
                  const iss = (issues || []).find(i => i.id === s.issueId);
                  return <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px 80px", gap: 10, alignItems: "center", background: Z.bg, borderRadius: R, padding: "6px 10px" }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{cn(s.clientId)}</div>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.su }}>{fmtCurrency(s.amount)}</div>
                    <div style={{ fontSize: FS.xs, color: Z.tm }}>{iss ? `${pn(iss.pubId)} ${iss.label}` : "—"}</div>
                    <div style={{ fontSize: FS.xs, color: Z.wa }}>{iss ? `${daysBetween(today, iss.date)}d` : "—"}</div>
                  </div>;
                })}
              </div>
            </GlassCard>}
          </>;
        })()}

        {/* ── Sales Performance (Sec 6.3.4) ── */}
        {reportView === "performance" && (() => {
          const salespeople = _team.filter(t => ["Sales Manager", "Salesperson"].includes(t.role) && t.isActive !== false);
          return <>
            <GlassCard>
              <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Salesperson Performance</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {salespeople.map(sp => {
                  const myClients = new Set((clients || []).filter(c => c.repId === sp.id).map(c => c.id));
                  const closed = periodSales.filter(s => myClients.has(s.clientId));
                  const closedRev = closed.reduce((s2, x) => s2 + (x.amount || 0), 0);
                  const dealCount = closed.length;
                  const avgDeal = dealCount > 0 ? closedRev / dealCount : 0;
                  const lost = _sales.filter(s => s.status === "Follow-up" && inPeriod(s.date) && myClients.has(s.clientId)).length;
                  const winRate = (dealCount + lost) > 0 ? Math.round((dealCount / (dealCount + lost)) * 100) : 0;
                  const pipeline = _sales.filter(s => s.status !== "Closed" && myClients.has(s.clientId));
                  const pipelineVal = pipeline.reduce((s2, x) => s2 + (x.amount || 0), 0);

                  return <div key={sp.id} style={{ background: Z.bg, borderRadius: R, padding: "14px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontSize: FS.md, fontWeight: FW.black, color: Z.tx }}>{sp.name}</div>
                      <div style={{ fontSize: 20, fontWeight: FW.black, color: Z.su }}>{fmtCurrency(closedRev)}</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                      <div><div style={{ fontSize: 16, fontWeight: FW.black, color: Z.tx }}>{dealCount}</div><div style={{ fontSize: FS.xs, color: Z.td }}>Deals Closed</div></div>
                      <div><div style={{ fontSize: 16, fontWeight: FW.black, color: Z.tx }}>{fmtCurrency(avgDeal)}</div><div style={{ fontSize: FS.xs, color: Z.td }}>Avg Deal</div></div>
                      <div><div style={{ fontSize: 16, fontWeight: FW.black, color: winRate >= 50 ? Z.go : Z.wa }}>{winRate}%</div><div style={{ fontSize: FS.xs, color: Z.td }}>Win Rate</div></div>
                      <div><div style={{ fontSize: 16, fontWeight: FW.black, color: Z.wa }}>{fmtCurrency(pipelineVal)}</div><div style={{ fontSize: FS.xs, color: Z.td }}>Pipeline</div></div>
                    </div>
                  </div>;
                })}
              </div>
            </GlassCard>
          </>;
        })()}

        {/* ── Rep Collections (closed vs collected) ── */}
        {reportView === "collections" && (() => {
          const salespeople = _team.filter(t => t.permissions?.includes("sales") || t.permissions?.includes("admin"));
          const periodClosed = _sales.filter(s => s.status === "Closed" && inPeriod(s.date || s.closedAt));

          const rows = salespeople.map(sp => {
            const myClients = new Set((clients || []).filter(c => c.repId === sp.id).map(c => c.id));
            const myClosed = periodClosed.filter(s => myClients.has(s.clientId));
            const closedAmt = myClosed.reduce((s, x) => s + (x.amount || 0), 0);
            const myInvs = processedInvoices.filter(i => myClients.has(i.clientId) && inPeriod(i.issueDate));
            const invoiced = myInvs.reduce((s, i) => s + (i.total || 0), 0);
            const openBal = myInvs.filter(i => ["sent","overdue","partially_paid","draft"].includes(i.status)).reduce((s, i) => s + (i.balanceDue || 0), 0);
            const collected = invoiced - openBal;
            const collectRate = invoiced > 0 ? Math.round((collected / invoiced) * 100) : 0;
            // DSO for this rep's paid invoices
            const paid = myInvs.filter(i => i.status === "paid" && i.issueDate);
            let totalDays = 0, dsoCount = 0;
            paid.forEach(i => {
              const lastPay = (payments || []).filter(p => p.invoiceId === i.id).sort((a,b) => (b.receivedAt || "").localeCompare(a.receivedAt || ""))[0]?.receivedAt?.slice(0,10);
              if (lastPay) { totalDays += daysBetween(i.issueDate, lastPay); dsoCount++; }
            });
            const dso = dsoCount > 0 ? Math.round(totalDays / dsoCount) : null;
            return { sp, closedAmt, closedCount: myClosed.length, invoiced, collected, openBal, collectRate, dso };
          }).filter(r => r.closedAmt > 0 || r.invoiced > 0).sort((a, b) => b.closedAmt - a.closedAmt);

          return <>
            <GlassCard>
              <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Rep Performance — Closed vs. Collected</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS.sm, fontFamily: COND }}>
                <thead><tr style={{ borderBottom: `1px solid ${Z.bd}` }}>
                  <th style={{ padding: "6px 8px", textAlign: "left", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Rep</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Deals</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Closed</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Invoiced</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Collected</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Open</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Collect %</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>DSO</th>
                </tr></thead>
                <tbody>
                  {rows.map(r => <tr key={r.sp.id} style={{ borderBottom: `1px solid ${Z.bd}15` }}>
                    <td style={{ padding: "8px", fontWeight: FW.bold, color: Z.tx }}>{r.sp.name}</td>
                    <td style={{ padding: "8px", textAlign: "right", color: Z.tm }}>{r.closedCount}</td>
                    <td style={{ padding: "8px", textAlign: "right", fontWeight: FW.heavy, color: Z.su }}>{fmtCurrency(r.closedAmt)}</td>
                    <td style={{ padding: "8px", textAlign: "right", color: Z.tm }}>{fmtCurrency(r.invoiced)}</td>
                    <td style={{ padding: "8px", textAlign: "right", fontWeight: FW.heavy, color: Z.go }}>{fmtCurrency(r.collected)}</td>
                    <td style={{ padding: "8px", textAlign: "right", color: r.openBal > 0 ? Z.da : Z.td }}>{fmtCurrency(r.openBal)}</td>
                    <td style={{ padding: "8px", textAlign: "right", fontWeight: FW.bold, color: r.collectRate >= 80 ? Z.go : r.collectRate >= 50 ? Z.wa : Z.da }}>{r.collectRate}%</td>
                    <td style={{ padding: "8px", textAlign: "right", color: Z.tm }}>{r.dso != null ? `${r.dso}d` : "—"}</td>
                  </tr>)}
                </tbody>
              </table>
              {rows.length === 0 && <div style={{ padding: 24, textAlign: "center", color: Z.td }}>No rep data for this period</div>}
            </GlassCard>
          </>;
        })()}

        {/* ── Payment Method Mix ── */}
        {reportView === "methods" && (() => {
          const periodPayments = _payments.filter(p => {
            const d = p.receivedAt?.slice(0, 10);
            return d && inPeriod(d);
          });

          // Aggregate by MyDash method enum (extract original from notes if present)
          const methodTotals = {};
          periodPayments.forEach(p => {
            // Extract the raw NM method from notes if present (e.g., "NM: Visa | ...")
            let label = PAYMENT_METHODS.find(m => m.value === p.method)?.label || p.method || "Other";
            const nmMatch = /^NM:\s*([^|]+)/.exec(p.notes || "");
            if (nmMatch) label = nmMatch[1].trim();
            if (!methodTotals[label]) methodTotals[label] = { amount: 0, count: 0 };
            methodTotals[label].amount += p.amount || 0;
            methodTotals[label].count++;
          });
          const totalAmt = Object.values(methodTotals).reduce((s, x) => s + x.amount, 0);
          const sorted = Object.entries(methodTotals).sort((a, b) => b[1].amount - a[1].amount);

          // Trend: group by month for the last 12 months
          const now = new Date();
          const months = [];
          for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push(d.toISOString().slice(0, 7));
          }
          const monthlyMix = months.map(m => {
            const row = { month: m, total: 0 };
            _payments.forEach(p => {
              if (!p.receivedAt || !p.receivedAt.startsWith(m)) return;
              row.total += p.amount || 0;
              const method = p.method || "other";
              row[method] = (row[method] || 0) + (p.amount || 0);
            });
            return row;
          });

          return <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              <GlassStat label="Total Collected" value={fmtCurrency(totalAmt)} sub={`${periodPayments.length} payments`} color={Z.go} />
              <GlassStat label="Top Method" value={sorted[0]?.[0] || "—"} sub={sorted[0] ? fmtCurrency(sorted[0][1].amount) : ""} />
              <GlassStat label="Methods Used" value={sorted.length} />
            </div>
            <GlassCard>
              <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Payment Method Breakdown</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {sorted.map(([label, data]) => {
                  const pct = totalAmt > 0 ? Math.round((data.amount / totalAmt) * 100) : 0;
                  return <div key={label} style={{ display: "grid", gridTemplateColumns: "160px 120px 70px 1fr 40px", gap: 10, alignItems: "center", background: Z.bg, borderRadius: R, padding: "8px 12px" }}>
                    <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>{label}</div>
                    <div style={{ textAlign: "right", fontSize: FS.md, fontWeight: FW.heavy, color: Z.su }}>{fmtCurrency(data.amount)}</div>
                    <div style={{ textAlign: "right", fontSize: FS.sm, color: Z.td }}>{data.count}</div>
                    <div style={{ height: 6, background: Z.sa, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: Z.ac, borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, textAlign: "right" }}>{pct}%</div>
                  </div>;
                })}
              </div>
            </GlassCard>
            <GlassCard>
              <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Last 12 Months Trend</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 140 }}>
                {monthlyMix.map(m => {
                  const max = Math.max(...monthlyMix.map(x => x.total), 1);
                  const h = m.total > 0 ? Math.max(4, (m.total / max) * 110) : 2;
                  return <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ fontSize: FS.micro, color: Z.td }}>{m.total > 0 ? `$${Math.round(m.total / 1000)}K` : ""}</div>
                    <div style={{ width: "80%", height: h, background: Z.ac, borderRadius: 2 }} />
                    <div style={{ fontSize: FS.micro, color: Z.tm, fontWeight: FW.bold }}>{m.month.slice(5)}</div>
                  </div>;
                })}
              </div>
            </GlassCard>
          </>;
        })()}

        {/* ── Write-offs & Credit Memos ── */}
        {reportView === "writeoffs" && (() => {
          // Filter payments by original NM method being Credit Memo, Write Off, or Barter
          const adjustments = _payments.filter(p => {
            const nmMatch = /^NM:\s*([^|]+)/.exec(p.notes || "");
            const rawMethod = nmMatch ? nmMatch[1].trim() : "";
            return /credit memo|write.?off|barter|invoice credit/i.test(rawMethod);
          });
          const periodAdj = adjustments.filter(p => {
            const d = p.receivedAt?.slice(0, 10);
            return d && inPeriod(d);
          });

          const byType = {};
          periodAdj.forEach(p => {
            const nmMatch = /^NM:\s*([^|]+)/.exec(p.notes || "");
            const type = nmMatch ? nmMatch[1].trim() : "Other";
            if (!byType[type]) byType[type] = { amount: 0, count: 0, rows: [] };
            byType[type].amount += p.amount || 0;
            byType[type].count++;
            byType[type].rows.push(p);
          });

          return <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              <GlassStat label="Total Adjustments" value={fmtCurrency(periodAdj.reduce((s, p) => s + (p.amount || 0), 0))} sub={`${periodAdj.length} records`} color={Z.wa} />
              <GlassStat label="Write-offs" value={fmtCurrency((byType["Write Off"]?.amount || 0))} sub={`${byType["Write Off"]?.count || 0} records`} color={Z.da} />
              <GlassStat label="Credit Memos" value={fmtCurrency((byType["Credit Memo"]?.amount || 0))} sub={`${byType["Credit Memo"]?.count || 0} records`} color={Z.pu} />
            </div>
            {Object.entries(byType).sort((a, b) => b[1].amount - a[1].amount).map(([type, data]) => (
              <GlassCard key={type}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1 }}>{type} — {fmtCurrency(data.amount)} · {data.count} records</div>
                </div>
                <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                  {data.rows.sort((a, b) => (b.receivedAt || "").localeCompare(a.receivedAt || "")).slice(0, 100).map(p => {
                    const inv = processedInvoices.find(i => i.id === p.invoiceId);
                    const memoMatch = /Memo:\s*([^|]+)/.exec(p.notes || "");
                    return <div key={p.id} onClick={() => inv && setViewInvId(inv.id)} style={{ display: "grid", gridTemplateColumns: "100px 1fr 120px 100px", gap: 10, alignItems: "center", background: Z.bg, borderRadius: R, padding: "6px 10px", cursor: inv ? "pointer" : "default" }}>
                      <div style={{ fontSize: FS.xs, color: Z.tm }}>{fmtDate(p.receivedAt?.slice(0, 10))}</div>
                      <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{inv ? cn(inv.clientId) : "—"}</div>
                      <div style={{ fontSize: FS.xs, color: Z.td }}>{memoMatch ? memoMatch[1].trim() : ""}</div>
                      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.wa, textAlign: "right" }}>{fmtCurrency(p.amount)}</div>
                    </div>;
                  })}
                </div>
              </GlassCard>
            ))}
            {periodAdj.length === 0 && <GlassCard><div style={{ padding: 24, textAlign: "center", color: Z.td }}>No write-offs or credit memos in this period</div></GlassCard>}
          </>;
        })()}
      </>;
    })()}

    {/* ════════ SETTINGS TAB ════════ */}
    {tab === "Settings" && <BillingSettings dialog={dialog} generatePending={generatePending} />}

    {/* ════════ CREATE INVOICE MODAL ════════ */}
    <Modal open={invModal} onClose={() => setInvModal(false)} title={`Invoice — ${cn(invForm.clientId)}`} width={720} onSubmit={saveInvoice}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Billing schedule */}
        <Sel label="Billing Schedule" value={invForm.billingSchedule} onChange={e => setInvForm(f => ({ ...f, billingSchedule: e.target.value }))}
          options={BILLING_SCHEDULES} />

        {invForm.billingSchedule === "monthly_plan" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Plan Months" type="number" min="1" value={invForm.planMonths || ""} onChange={e => setInvForm(f => ({ ...f, planMonths: Number(e.target.value) || 0 }))} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Monthly Amount</label>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.su, padding: "8px 0" }}>
              {invForm.planMonths > 0 ? fmtCurrency(invTotal / invForm.planMonths) : "—"}
            </div>
          </div>
        </div>}

        {/* Smart selection buttons */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <label style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>
              Line Items — {selectedLines.length} of {invForm.lines.length} selected
            </label>
            <button onClick={addManualLine} style={{ background: "none", border: "none", cursor: "pointer", color: Z.ac, fontSize: FS.sm, fontWeight: FW.bold }}>+ Add line</button>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            <Pill label="Select All" icon={Ic.checkAll} onClick={() => setInvForm(f => ({ ...f, lines: f.lines.map(l => ({ ...l, selected: true })) }))} />
            <Pill label="Deselect All" icon={Ic.close} onClick={() => setInvForm(f => ({ ...f, lines: f.lines.map(l => ({ ...l, selected: false })) }))} />
            {(() => { const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 30); const c30 = cutoff.toISOString().slice(0, 10); return <Pill label="Next 30 Days" icon={Ic.clock} onClick={() => setInvForm(f => ({ ...f, lines: f.lines.map(l => ({ ...l, selected: l.date && l.date <= c30 })) }))} />; })()}
            {/* Per-publication select buttons */}
            {[...new Set(invForm.lines.map(l => l.pubId))].filter(Boolean).map(pid => {
              const name = pn(pid);
              const short = name.length > 18 ? name.slice(0, 16) + "…" : name;
              return <Pill key={pid} label={short} icon={Ic.pub} onClick={() => setInvForm(f => ({ ...f, lines: f.lines.map(l => ({ ...l, selected: l.pubId === pid })) }))} />;
            })}
          </div>

          {/* Line items grouped by publication */}
          {invForm.lines.length === 0
            ? <div style={{ padding: 16, textAlign: "center", color: Z.td, fontSize: FS.base, background: Z.bg, borderRadius: R }}>No closed sales found for this client</div>
            : <div style={{ maxHeight: 340, overflowY: "auto", border: `1px solid ${Z.bd}`, borderRadius: R }}>
                {(() => {
                  // Group lines by publication
                  const groups = {};
                  invForm.lines.forEach((l, i) => {
                    const key = l.pubId || "_manual";
                    if (!groups[key]) groups[key] = { pubName: l.pubName || "Manual", lines: [] };
                    groups[key].lines.push({ ...l, _idx: i });
                  });
                  return Object.entries(groups).map(([pid, g]) => {
                    const groupTotal = g.lines.filter(l => l.selected).reduce((s, l) => s + l.total, 0);
                    const groupSelected = g.lines.filter(l => l.selected).length;
                    return <div key={pid}>
                      {/* Publication header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: Z.sa, borderBottom: `1px solid ${Z.bd}`, position: "sticky", top: 0, zIndex: 1 }}>
                        <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tx }}>{g.pubName}</span>
                        <span style={{ fontSize: FS.sm, color: Z.tm }}>{groupSelected}/{g.lines.length} · {fmtCurrency(groupTotal)}</span>
                      </div>
                      {/* Lines */}
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS.sm, fontFamily: COND }}>
                        <tbody>
                          {g.lines.map(l => (
                            <tr key={l._idx} onClick={() => toggleLine(l._idx)} style={{ borderBottom: `1px solid ${Z.bd}10`, opacity: l.selected ? 1 : 0.35, cursor: "pointer" }}
                              onMouseEnter={e => e.currentTarget.style.background = Z.sa}
                              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                              <td style={{ width: 28, padding: "5px 6px" }}><input type="checkbox" checked={l.selected} readOnly style={{ pointerEvents: "none" }} /></td>
                              <td style={{ padding: "5px 8px", color: Z.tx }}>{l.description}</td>
                              <td style={{ padding: "5px 8px", color: Z.tm, fontSize: FS.sm, whiteSpace: "nowrap" }}>{l.issueLabel || (l.date ? fmtDate(l.date) : "")}</td>
                              <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: FW.heavy, color: l.total > 0 ? Z.tx : Z.td, whiteSpace: "nowrap" }}>{l.total > 0 ? fmtCurrency(l.total) : "No Charge"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>;
                  });
                })()}
              </div>}
        </div>

        <Inp label="Due Date" type="date" value={invForm.dueDate} onChange={e => setInvForm(f => ({ ...f, dueDate: e.target.value }))} />
        <TA label="Notes" value={invForm.notes} onChange={e => setInvForm(f => ({ ...f, notes: e.target.value }))} rows={2} />

        {/* Total */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: Z.sa, borderRadius: R }}>
          <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{selectedLines.length} items</span>
          <span style={{ fontSize: 22, fontWeight: FW.black, color: Z.su, fontFamily: DISPLAY }}>{fmtCurrency(invTotal)}</span>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn v="secondary" onClick={() => setInvModal(false)}>Cancel</Btn>
          <Btn onClick={saveInvoice} disabled={!invForm.clientId || selectedLines.length === 0}>Create Invoice — {fmtCurrency(invTotal)}</Btn>
        </div>
      </div>
    </Modal>

    {/* ════════ RECORD PAYMENT MODAL ════════ */}
    <Modal open={payModal} onClose={() => setPayModal(false)} title="Record Payment" width={420} onSubmit={savePayment}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {(() => {
          const inv = processedInvoices.find(i => i.id === payForm.invoiceId);
          if (!inv) return null;
          return <div style={{ padding: 16, background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{inv.invoiceNumber} — {cn(inv.clientId)}</div>
            <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 2 }}>Balance due: <span style={{ fontWeight: FW.heavy, color: Z.da }}>{fmtCurrency(inv.balanceDue)}</span></div>
          </div>;
        })()}

        <Inp label="Amount" type="number" step="0.01" value={payForm.amount || ""} onChange={e => setPayForm(f => ({ ...f, amount: Number(e.target.value) || 0 }))} />

        <Sel label="Payment Method" value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))} options={PAYMENT_METHODS} />

        {payForm.method === "card" && <Inp label="Last 4 Digits" maxLength={4} value={payForm.lastFour} onChange={e => setPayForm(f => ({ ...f, lastFour: e.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="1234" />}

        <TA label="Notes" value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} rows={2} />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn v="secondary" onClick={() => setPayModal(false)}>Cancel</Btn>
          <Btn onClick={savePayment} disabled={!payForm.amount}>Record Payment</Btn>
        </div>
      </div>
    </Modal>

    {/* ════════ CREDIT MEMO MODAL ════════ */}
    <Modal open={creditMemoModal} onClose={() => setCreditMemoModal(false)} title="New Credit Memo" width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Sel label="Client" value={cmForm.clientId} onChange={e => setCmForm(f => ({ ...f, clientId: e.target.value }))} options={[{ value: "", label: "Select client..." }, ...(clients || []).map(c => ({ value: c.id, label: c.name }))]} />
        <Sel label="Reason" value={cmForm.reasonCode} onChange={e => setCmForm(f => ({ ...f, reasonCode: e.target.value }))} options={REASON_CODES} />
        <Inp label="Amount ($)" type="number" min={0} value={cmForm.amount} onChange={e => setCmForm(f => ({ ...f, amount: Number(e.target.value) }))} />
        <Inp label="Reason Detail" value={cmForm.reason} onChange={e => setCmForm(f => ({ ...f, reason: e.target.value }))} placeholder="What happened and why the credit is issued..." />
        <TA label="Notes" value={cmForm.notes} onChange={e => setCmForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="secondary" onClick={() => setCreditMemoModal(false)}>Cancel</Btn>
          <Btn onClick={createCreditMemo} disabled={!cmForm.clientId || !cmForm.amount || !cmForm.reason}>Create Credit Memo</Btn>
        </div>
      </div>
    </Modal>
  </div>;
};

export default memo(Billing);
