import { useState, useRef, useMemo, memo, useEffect, useCallback } from "react";
import { Z, SC, COND, DISPLAY, FS, FW, Ri, R } from "../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Card, SB, TB, Stat, Modal, Bar, FilterBar, SortHeader , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, DataTable, ListCard, ListDivider, ListGrid, Pill, glass } from "../components/ui";
import { COMPANY } from "../constants";
import { generateInvoiceHtml } from "../lib/invoiceTemplate";
import { sendGmailEmail } from "../lib/gmail";
import { supabase } from "../lib/supabase";

// ─── Invoice Status Colors ──────────────────────────────────
const INV_COLORS = {
  draft:          { bg: Z.sa, text: Z.tm },
  sent:           { bg: Z.ps, text: Z.pu },
  partially_paid: { bg: Z.ws, text: Z.wa },
  paid:           { bg: Z.ss, text: Z.su },
  overdue:        { bg: Z.ds, text: Z.da },
  void:           { bg: Z.sa, text: Z.td },
};

const INV_STATUSES = ["All", "draft", "sent", "partially_paid", "paid", "overdue", "void"];
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
const fmtCurrency = (n) => "$" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

const InvBadge = ({ status }) => {
  const c = INV_COLORS[status] || INV_COLORS.draft;
  const labels = { draft: "Draft", sent: "Sent", partially_paid: "Partial", paid: "Paid", overdue: "Overdue", void: "Void" };
  return <span style={{ display: "inline-flex", alignItems: "center", borderRadius: R, fontSize: FS.xs, fontWeight: FW.bold, background: c.bg, color: c.text, whiteSpace: "nowrap" }}>{labels[status] || status}</span>;
};

// ─── Billing Module ─────────────────────────────────────────
const Billing = ({ clients, sales, pubs, issues, proposals, invoices, setInvoices, payments, setPayments, bus, jurisdiction, team, subscribers, subscriptionPayments }) => {
  const [tab, setTab] = useState("Overview");
  const [sr, setSr] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [invModal, setInvModal] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [viewInvId, setViewInvId] = useState(null);
  const [sortCol, setSortCol] = useState("issue_date");
  const [sortDir, setSortDir] = useState("desc");
  const [uninvRange, setUninvRange] = useState("30days");
  const [reportView, setReportView] = useState("revenue");
  const [reportPeriod, setReportPeriod] = useState("mtd");
  const [reportPub, setReportPub] = useState("all");

  // New invoice form
  const [invForm, setInvForm] = useState({
    clientId: "", billingSchedule: "lump_sum", lines: [],
    dueDate: "", notes: "", monthlyAmount: 0, planMonths: 0,
  });

  // New payment form
  const [payForm, setPayForm] = useState({
    invoiceId: "", amount: 0, method: "card", lastFour: "", notes: "",
  });

  // ─── Listen for invoice.create events from other modules ──
  const openNewInvoiceRef = useRef(null);
  useEffect(() => {
    if (!bus) return;
    return bus.on("invoice.create", ({ clientId }) => {
      if (openNewInvoiceRef.current) openNewInvoiceRef.current(clientId);
    });
  }, [bus]);

  // ─── Helpers ────────────────────────────────────────────
  const cn = (cid) => clients.find(c => c.id === cid)?.name || "Unknown";
  const pn = (pid) => pubs.find(p => p.id === pid)?.name || "";

  // Auto-mark overdue
  const processedInvoices = (invoices || []).map(inv => {
    if (inv.status === "sent" && inv.dueDate && inv.dueDate < today) {
      return { ...inv, status: "overdue" };
    }
    return inv;
  });

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

  // Date-filtered uninvoiced sales for the Overview display
  const filteredUninvoiced = useMemo(() => {
    if (uninvRange === "all") return uninvoicedSales;
    const now = new Date();
    let cutoff;
    if (uninvRange === "30days") { cutoff = new Date(); cutoff.setDate(now.getDate() + 30); }
    else if (uninvRange === "60days") { cutoff = new Date(); cutoff.setDate(now.getDate() + 60); }
    else if (uninvRange === "90days") { cutoff = new Date(); cutoff.setDate(now.getDate() + 90); }
    else if (uninvRange === "quarter") { cutoff = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0); }
    else if (uninvRange === "year") { cutoff = new Date(now.getFullYear(), 11, 31); }
    const cut = cutoff.toISOString().slice(0, 10);
    return uninvoicedSales.filter(s => s.date && s.date <= cut);
  }, [uninvoicedSales, uninvRange]);

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

  // Aging buckets
  const agingBuckets = { current: 0, "30": 0, "60": 0, "90": 0, "90+": 0 };
  processedInvoices.filter(i => ["sent", "partially_paid", "overdue"].includes(i.status)).forEach(inv => {
    const days = daysBetween(inv.issueDate || today, today);
    const bal = inv.balanceDue || 0;
    if (days <= 30) agingBuckets.current += bal;
    else if (days <= 60) agingBuckets["30"] += bal;
    else if (days <= 90) agingBuckets["60"] += bal;
    else agingBuckets["90+"] += bal;
  });

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

  const saveInvoice = () => {
    if (!invForm.clientId || selectedLines.length === 0) return;
    const invNum = `INV-${String((invoices?.length || 0) + 1001).padStart(5, "0")}`;
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

  const sendInvoice = async (invId) => {
    const inv = processedInvoices.find(i => i.id === invId);
    if (!inv) return;
    setInvoices(prev => (prev || []).map(i => i.id === invId ? { ...i, status: "sent" } : i));
    if (bus) bus.emit("invoice.sent", { invoiceId: invId, clientId: inv.clientId });

    // Generate and send invoice email
    const client = (clients || []).find(c => c.id === inv.clientId);
    const clientEmail = client?.contacts?.[0]?.email;
    if (clientEmail) {
      const htmlBody = generateInvoiceHtml({
        invoice: inv,
        clientName: client?.name || "",
      });
      try {
        await sendGmailEmail({
          teamMemberId: null,
          to: [clientEmail],
          subject: `Invoice ${inv.invoiceNumber} — 13 Stars Media Group`,
          htmlBody,
          mode: "send",
        });
      } catch (err) { console.error("Invoice email error:", err); }
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
  if (statusFilter !== "All") filtered = filtered.filter(i => i.status === statusFilter);
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
            {(viewInv.lines || []).map((l, i) => <tr key={i} style={{ borderBottom: `1px solid ${Z.bd}` }}>
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
    <PageHeader title="My Billing">
      {tab === "Invoices" && <SB value={sr} onChange={setSr} placeholder="Search invoices..." />}
      <Btn sm onClick={() => openNewInvoice(null)}><Ic.plus size={13} /> New Invoice</Btn>
    </PageHeader>

    <TabRow><TB tabs={["Overview", "Invoices", "Receivables", "Reports"]} active={tab} onChange={setTab} />{tab === "Invoices" && <><TabPipe /><TB tabs={INV_STATUSES.map(s => s === "All" ? "All" : s === "partially_paid" ? "Partial" : s.charAt(0).toUpperCase() + s.slice(1))} active={statusFilter === "All" ? "All" : statusFilter === "partially_paid" ? "Partial" : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)} onChange={v => { const map = { All: "All", Draft: "draft", Sent: "sent", Partial: "partially_paid", Paid: "paid", Overdue: "overdue", Void: "void" }; setStatusFilter(map[v] || "All"); }} /></>}</TabRow>

    {/* ════════ OVERVIEW TAB ════════ */}
    {tab === "Overview" && <>
      {/* Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <GlassStat label="Outstanding" value={fmtCurrency(totalOutstanding)} sub={`${processedInvoices.filter(i => ["sent", "partially_paid", "overdue"].includes(i.status)).length} invoices`} />
        <GlassStat label="Overdue" value={fmtCurrency(totalOverdue)} sub={overdueCount > 0 ? `${overdueCount} invoice${overdueCount > 1 ? "s" : ""} past due` : "None"} color={Z.da} />
        <GlassStat label="Collected This Month" value={fmtCurrency(totalPaidThisMonth)} />
        <GlassStat label="Drafts" value={fmtCurrency(totalDraftValue)} sub="Pending send" />
      </div>

      {/* Uninvoiced Sales — primary action area */}
      {uninvoicedSales.length > 0 && <GlassCard style={{ borderLeft: `3px solid ${Z.wa}` }}>
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
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
          {[
            { value: "30days", label: "Next 30 Days", icon: Ic.clock },
            { value: "60days", label: "Next 60 Days", icon: Ic.clock },
            { value: "90days", label: "Next 90 Days", icon: Ic.clock },
            { value: "quarter", label: "This Quarter", icon: Ic.chart },
            { value: "year", label: "This Year", icon: Ic.cal },
            { value: "all", label: "All Time", icon: Ic.list },
          ].map(opt => <Pill key={opt.value} label={opt.label} icon={opt.icon} active={uninvRange === opt.value} onClick={() => setUninvRange(opt.value)} />)}
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
                  <td style={{ padding: "6px 10px", fontWeight: FW.semi, color: Z.tx }}>{cn(uc.clientId)}</td>
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {[
            { label: "Current", value: agingBuckets.current, color: Z.su },
            { label: "31-60 days", value: agingBuckets["30"], color: Z.wa },
            { label: "61-90 days", value: agingBuckets["60"], color: Z.or },
            { label: "90+ days", value: agingBuckets["90+"], color: Z.da },
          ].map(b => <div key={b.label} style={{ textAlign: "center", padding: 16, background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>{b.label}</div>
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
                <span style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx }}>{cn(inv.clientId)}</span>
                <span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx, textAlign: "right" }}>{fmtCurrency(inv.total)}</span>
                <span style={{ fontSize: FS.xs, color: Z.td, textAlign: "right" }}>{fmtDate(inv.dueDate)}</span>
                <span style={{ textAlign: "right" }}><InvBadge status={inv.status} /></span>
              </div>)}
            </div>}
      </GlassCard>
    </>}

    {/* ════════ INVOICES TAB ════════ */}
    {tab === "Invoices" && <>
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
              : filtered.map(inv => <tr key={inv.id} onClick={() => setViewInvId(inv.id)} style={{ cursor: "pointer" }}>
                <td style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.ac, fontFamily: COND }}>{inv.invoiceNumber}</td>
                <td style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx }}>{cn(inv.clientId)}</td>
                <td style={{ fontSize: FS.sm, color: Z.tm }}>{fmtDate(inv.issueDate)}</td>
                <td style={{ fontSize: FS.sm, color: inv.status === "overdue" ? Z.da : Z.tm, fontWeight: inv.status === "overdue" ? 700 : 400 }}>{fmtDate(inv.dueDate)}</td>
                <td style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx, textAlign: "right" }}>{fmtCurrency(inv.total)}</td>
                <td style={{ fontSize: FS.base, fontWeight: FW.bold, color: inv.balanceDue > 0 ? Z.da : Z.su, textAlign: "right" }}>{fmtCurrency(inv.balanceDue)}</td>
                <td style={{ padding: "10px 14px" }}><InvBadge status={inv.status} /></td>
                <td style={{ padding: "10px 14px" }}>
                  {inv.status === "draft" && <Btn sm v="secondary" onClick={e => { e.stopPropagation(); sendInvoice(inv.id); }}>Send</Btn>}
                  {["sent", "partially_paid", "overdue"].includes(inv.status) && <Btn sm v="secondary" onClick={e => { e.stopPropagation(); openPayment(inv.id); }}>Pay</Btn>}
                </td>
              </tr>)}
          </tbody>
        </DataTable>
      </GlassCard>
    </>}

    {/* ════════ RECEIVABLES TAB ════════ */}
    {tab === "Receivables" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <GlassStat label="Total Outstanding" value={fmtCurrency(totalOutstanding)} />
        <GlassStat label="Total Overdue" value={fmtCurrency(totalOverdue)} color={Z.da} />
        <GlassStat label="Avg Days to Pay" value={(() => {
          const paid = processedInvoices.filter(i => i.status === "paid" && i.issueDate);
          if (paid.length === 0) return "—";
          const avg = paid.reduce((s, i) => {
            const pDate = (payments || []).filter(p => p.invoiceId === i.id).sort((a, b) => (b.receivedAt || "").localeCompare(a.receivedAt || ""))[0]?.receivedAt?.slice(0, 10);
            return s + (pDate ? daysBetween(i.issueDate, pDate) : 0);
          }, 0) / paid.length;
          return Math.round(avg) + " days";
        })()} />
      </div>

      {/* Client-level receivables */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Outstanding by Client</div>
        {(() => {
          const clientBalances = {};
          processedInvoices.filter(i => ["sent", "partially_paid", "overdue"].includes(i.status)).forEach(inv => {
            if (!clientBalances[inv.clientId]) clientBalances[inv.clientId] = { balance: 0, overdue: 0, count: 0, oldest: inv.issueDate };
            clientBalances[inv.clientId].balance += inv.balanceDue || 0;
            clientBalances[inv.clientId].count++;
            if (inv.status === "overdue") clientBalances[inv.clientId].overdue += inv.balanceDue || 0;
            if (inv.issueDate < clientBalances[inv.clientId].oldest) clientBalances[inv.clientId].oldest = inv.issueDate;
          });
          const sorted = Object.entries(clientBalances).sort((a, b) => b[1].balance - a[1].balance);

          if (sorted.length === 0) return <div style={{ fontSize: FS.base, color: Z.td, textAlign: "center" }}>No outstanding receivables</div>;

          return <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {sorted.map(([cid, data]) => <div key={cid} style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 80px 60px", gap: 10, alignItems: "center", borderRadius: R, background: Z.bg }}>
              <div>
                <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>{cn(cid)}</div>
                <div style={{ fontSize: FS.xs, color: Z.td }}>{data.count} invoice{data.count > 1 ? "s" : ""}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{fmtCurrency(data.balance)}</div>
                <div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase" }}>Balance</div>
              </div>
              <div style={{ textAlign: "right" }}>
                {data.overdue > 0 && <>
                  <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.da }}>{fmtCurrency(data.overdue)}</div>
                  <div style={{ fontSize: FS.micro, color: Z.da, textTransform: "uppercase" }}>Overdue</div>
                </>}
              </div>
              <div style={{ fontSize: FS.xs, color: Z.td, textAlign: "right" }}>
                {daysBetween(data.oldest, today)} days
              </div>
              <Btn sm v="ghost" onClick={() => openPayment(processedInvoices.find(i => i.clientId === cid && ["sent", "partially_paid", "overdue"].includes(i.status))?.id)}>Pay</Btn>
            </div>)}
          </div>;
        })()}
      </GlassCard>
    </>}

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
          <div style={{ display: "flex", gap: 4 }}>
            {[{ k: "revenue", l: "Revenue Summary" }, { k: "aging", l: "AR Aging" }, { k: "uninvoiced", l: "Uninvoiced" }, { k: "performance", l: "Sales Performance" }].map(r => (
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

        {/* ── AR Aging Report (Sec 6.3.2) ── */}
        {reportView === "aging" && (() => {
          const openInv = processedInvoices.filter(i => ["sent", "partially_paid", "overdue"].includes(i.status) && (reportPub === "all" || i.lines?.some(l => l.publication === reportPub)));
          const buckets = { current: [], d30: [], d60: [], d90: [], over90: [] };
          openInv.forEach(inv => {
            const age = daysBetween(inv.issueDate || inv.dueDate || today, today);
            if (age <= 30) buckets.current.push(inv);
            else if (age <= 60) buckets.d30.push(inv);
            else if (age <= 90) buckets.d60.push(inv);
            else buckets.over90.push(inv);
          });
          const bucketSum = (arr) => arr.reduce((s, i) => s + (i.balanceDue || 0), 0);
          const BUCKET_CFG = [
            { key: "current", label: "Current (0-30d)", color: Z.go },
            { key: "d30", label: "31-60 days", color: Z.wa },
            { key: "d60", label: "61-90 days", color: Z.da },
            { key: "over90", label: "90+ days", color: Z.da },
          ];
          return <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
              {BUCKET_CFG.map(b => <GlassStat key={b.key} label={b.label} value={fmtCurrency(bucketSum(buckets[b.key]))} sub={`${buckets[b.key].length} invoice${buckets[b.key].length !== 1 ? "s" : ""}`} color={b.color} />)}
            </div>
            {BUCKET_CFG.map(b => {
              if (buckets[b.key].length === 0) return null;
              return <GlassCard key={b.key}>
                <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: b.color, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{b.label} — {fmtCurrency(bucketSum(buckets[b.key]))}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {buckets[b.key].sort((a2, b2) => (b2.balanceDue || 0) - (a2.balanceDue || 0)).map(inv => (
                    <div key={inv.id} onClick={() => setViewInvId(inv.id)} style={{ display: "grid", gridTemplateColumns: "1fr 100px 80px 60px", gap: 10, alignItems: "center", background: Z.bg, borderRadius: R, padding: "6px 10px", cursor: "pointer" }}>
                      <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{cn(inv.clientId)}</div>
                      <div style={{ textAlign: "right", fontSize: FS.sm, fontWeight: FW.heavy, color: Z.tx }}>{fmtCurrency(inv.balanceDue)}</div>
                      <div style={{ textAlign: "right", fontSize: FS.xs, color: Z.td }}>{fmtDate(inv.issueDate)}</div>
                      <InvBadge status={inv.status} />
                    </div>
                  ))}
                </div>
              </GlassCard>;
            })}
          </>;
        })()}

        {/* ── Uninvoiced Contracts (Sec 6.2) ── */}
        {reportView === "uninvoiced" && (() => {
          const invSaleIds = new Set();
          processedInvoices.forEach(inv => inv.lines?.forEach(l => { if (l.saleId) invSaleIds.add(l.saleId); }));
          const cutoff30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
          const uninv = _sales.filter(s => s.status === "Closed" && !invSaleIds.has(s.id) && (reportPub === "all" || s.publication === reportPub))
            .sort((a, b) => {
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
                  const pipeline = _sales.filter(s => !["Closed", "Follow-up"].includes(s.status) && myClients.has(s.clientId));
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
      </>;
    })()}

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
  </div>;
};

export default memo(Billing);
