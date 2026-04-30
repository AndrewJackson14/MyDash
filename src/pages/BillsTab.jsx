// ============================================================
// BillsTab.jsx — Vendor bills / expense entry + QuickBooks push
// ============================================================
import { useState, useMemo, useEffect } from "react";
import { Z, COND, DISPLAY, FS, FW, R, Ri, INV } from "../lib/theme";
import { Ic, Btn, Inp, Sel, TA, Modal, Badge, GlassCard, PageHeader, DataTable, SB, Toggle } from "../components/ui";
import { fmtCurrencyWhole as fmtCurrency, fmtDateShort as fmtDate } from "../lib/formatters";
import { supabase, EDGE_FN_URL } from "../lib/supabase";
import { useQboResolver } from "../hooks/useQboResolver";
import { UnknownTransactionTypeError, MissingTokenError } from "../lib/qboMappingTypes";
import { QboAccountNotFoundError } from "../lib/qboAccountLookup";

const PAY_METHODS = [
  { value: "check", label: "Check" },
  { value: "credit_card", label: "Credit Card" },
  { value: "ach", label: "ACH / Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "wire", label: "Wire Transfer" },
  { value: "other", label: "Other" },
];

const CATEGORIES = [
  { value: "freelance", label: "Freelance" },
  { value: "commission", label: "Commission" },
  { value: "route_driver", label: "Route Driver" },
  { value: "shipping", label: "Shipping" },
  { value: "printing", label: "Printing" },
  { value: "postage", label: "Postage" },
  { value: "payroll", label: "Payroll" },
  { value: "rent", label: "Rent" },
  { value: "utilities", label: "Utilities" },
  { value: "software", label: "Software" },
  { value: "insurance", label: "Insurance" },
  { value: "marketing", label: "Marketing" },
  { value: "other_expense", label: "Other" },
];

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));

// Categories that map to QBO "Cost of Goods Sold" accounts (vs "Expense").
// Used to narrow the live Account.Id lookup done by the resolver.
const COGS_CATEGORIES = new Set([
  "printing", "postage", "shipping", "route_driver", "freelance", "commission",
]);

const STATUS_COLORS = {
  pending: Z.wa,
  approved: Z.ac,
  paid: Z.go,
  void: Z.td,
};

const today = () => new Date().toISOString().slice(0, 10);

const formatMonthLabel = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
};

// Map a bill row's fields to the tokens expected by the line_description_template
// for its category, per qbo_account_mapping seed rows. Missing tokens → MissingTokenError
// thrown by the resolver, caught in pushToQuickBooks and surfaced to the user.
const buildBillTokens = (bill, pubName) => {
  const title = bill.publicationId ? pubName(bill.publicationId) : "";
  const period = formatMonthLabel(bill.billDate);
  const common = { vendor: bill.vendorName || "", description: bill.description || "" };
  const titled = { title, issue_or_date: bill.issueLabel || bill.billDate || "", issue: bill.issueLabel || "", period };

  switch (bill.category) {
    case "printing":
    case "postage":
    case "route_driver":
    case "freelance":
      return { ...common, ...titled };
    case "commission":
      return { vendor: common.vendor, period };
    case "payroll":
      return { description: common.description || `Payroll ${bill.billDate || ""}` };
    case "shipping":
    case "rent":
    case "utilities":
    case "software":
    case "insurance":
    case "marketing":
    case "other_expense":
      return common;
    default:
      return common;
  }
};

// ─── Bill modal (create / edit) ──────────────────────────────
const BillModal = ({ open, onClose, bill, pubs, onSave, onDelete }) => {
  const isEdit = !!bill?.id;
  const [form, setForm] = useState({
    publicationId: bill?.publicationId || "",
    vendorName: bill?.vendorName || "",
    vendorEmail: bill?.vendorEmail || "",
    category: bill?.category || "freelance",
    description: bill?.description || "",
    amount: bill?.amount || "",
    billDate: bill?.billDate || today(),
    dueDate: bill?.dueDate || "",
    notes: bill?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const save = async () => {
    if (!form.vendorName || !form.amount) {
      setError("Vendor name and amount are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(isEdit ? bill.id : null, form);
      onClose();
    } catch (e) {
      setError(e.message || "Save failed");
    }
    setSaving(false);
  };

  const del = async () => {
    if (!window.confirm("Delete this bill?")) return;
    setSaving(true);
    try {
      await onDelete(bill.id);
      onClose();
    } catch (e) {
      setError(e.message || "Delete failed");
      setSaving(false);
    }
  };

  const pubOptions = [
    { value: "", label: "— Overhead (no publication) —" },
    ...pubs.map(p => ({ value: p.id, label: p.name })),
  ];

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit Bill" : "New Bill"} width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Vendor Name *" value={form.vendorName} onChange={e => update("vendorName", e.target.value)} placeholder="Who are you paying?" />
          <Inp label="Vendor Email" value={form.vendorEmail} onChange={e => update("vendorEmail", e.target.value)} placeholder="optional" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Sel label="Category *" value={form.category} onChange={e => update("category", e.target.value)} options={CATEGORIES} />
          <Sel label="Publication" value={form.publicationId} onChange={e => update("publicationId", e.target.value)} options={pubOptions} />
        </div>
        <Inp label="Description" value={form.description} onChange={e => update("description", e.target.value)} placeholder="What's this bill for?" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Inp label="Amount *" type="number" step="0.01" value={form.amount} onChange={e => update("amount", e.target.value)} placeholder="0.00" />
          <Inp label="Bill Date" type="date" value={form.billDate} onChange={e => update("billDate", e.target.value)} />
          <Inp label="Due Date" type="date" value={form.dueDate} onChange={e => update("dueDate", e.target.value)} />
        </div>
        <TA label="Notes" value={form.notes} onChange={e => update("notes", e.target.value)} rows={2} placeholder="Internal notes (optional)" />

        {error && (
          <div style={{ padding: "10px 14px", borderRadius: Ri, background: Z.da + "18", color: Z.da, fontSize: FS.sm, fontWeight: FW.bold }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 4 }}>
          <div>
            {isEdit && <Btn sm v="ghost" onClick={del} disabled={saving}>Delete</Btn>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn sm v="cancel" onClick={onClose} disabled={saving}>Cancel</Btn>
            <Btn sm onClick={save} disabled={saving}>{saving ? "Saving..." : isEdit ? "Save Changes" : "Add Bill"}</Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
};

// ─── Mark Paid modal ─────────────────────────────────────────
const MarkPaidModal = ({ open, onClose, bill, onConfirm }) => {
  const [paidMethod, setPaidMethod] = useState(bill?.paidMethod || "check");
  const [checkNumber, setCheckNumber] = useState(bill?.checkNumber || "");
  const [ccLastFour, setCcLastFour] = useState(bill?.ccLastFour || "");
  const [paidDate, setPaidDate] = useState(today());
  const [receiptUrl, setReceiptUrl] = useState(bill?.attachmentUrl || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const uploadReceipt = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const filename = `bill-${bill.id}-${Date.now()}.${ext}`;
      const path = "bills/receipts";
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(EDGE_FN_URL + "/bunny-storage", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + (session?.access_token || ""),
          "apikey": (await supabase.auth.getSession()).data.session?.access_token || "",
          "Content-Type": file.type || "application/octet-stream",
          "x-action": "upload",
          "x-path": path,
          "x-filename": filename,
        },
        body: file,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed: " + res.status);
      }
      const json = await res.json();
      setReceiptUrl(json.cdnUrl || "");
    } catch (e) {
      setError("Upload failed: " + (e.message || e));
    }
    setUploading(false);
  };

  const confirm = async () => {
    setSaving(true);
    setError("");
    try {
      await onConfirm({
        status: "paid",
        paidAt: new Date(paidDate + "T12:00:00").toISOString(),
        paidMethod,
        checkNumber: paidMethod === "check" ? checkNumber : "",
        ccLastFour: paidMethod === "credit_card" ? ccLastFour : "",
        attachmentUrl: receiptUrl || "",
      });
      onClose();
    } catch (e) {
      setError(e.message || "Save failed");
    }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={`Mark Paid — ${bill?.vendorName || ""}`} width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ padding: "10px 14px", background: Z.sa, borderRadius: R, border: `1px solid ${Z.bd}`, fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>
          Amount: <b style={{ color: Z.tx }}>{fmtCurrency(bill?.amount || 0)}</b>
          {bill?.category && <> · Category: <b style={{ color: Z.tx }}>{CATEGORY_LABEL[bill.category] || bill.category}</b></>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Sel label="Payment Method" value={paidMethod} onChange={e => setPaidMethod(e.target.value)} options={PAY_METHODS} />
          <Inp label="Paid Date" type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} />
        </div>

        {paidMethod === "check" && (
          <Inp label="Check Number" value={checkNumber} onChange={e => setCheckNumber(e.target.value)} placeholder="e.g. 1042" />
        )}

        {paidMethod === "credit_card" && (
          <Inp label="Last 4 of Card" value={ccLastFour} onChange={e => setCcLastFour(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="e.g. 1234" maxLength={4} />
        )}

        {/* Receipt upload */}
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5, fontFamily: COND }}>Receipt (optional)</div>
          {receiptUrl ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: Z.sa, borderRadius: R, border: `1px solid ${Z.bd}` }}>
              <a href={receiptUrl} target="_blank" rel="noopener noreferrer" style={{ color: Z.ac, fontSize: FS.sm, fontFamily: COND, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                📎 {receiptUrl.split("/").pop()}
              </a>
              <button onClick={() => setReceiptUrl("")} style={{ background: "none", border: "none", cursor: "pointer", color: Z.da, fontSize: FS.sm, fontWeight: FW.bold, fontFamily: COND }}>Remove</button>
            </div>
          ) : (
            <label style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "16px 14px", background: Z.sa, borderRadius: R, border: `1px dashed ${Z.bd}`,
              cursor: uploading ? "default" : "pointer", fontSize: FS.sm, color: Z.tm, fontFamily: COND,
            }}>
              <input
                type="file"
                accept="image/*,application/pdf"
                style={{ display: "none" }}
                onChange={e => e.target.files[0] && uploadReceipt(e.target.files[0])}
                disabled={uploading}
              />
              {uploading ? "Uploading..." : "📎 Upload receipt (image or PDF)"}
            </label>
          )}
        </div>

        {error && (
          <div style={{ padding: "10px 14px", borderRadius: Ri, background: Z.da + "18", color: Z.da, fontSize: FS.sm, fontWeight: FW.bold }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <Btn sm v="cancel" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn sm onClick={confirm} disabled={saving || uploading || (paidMethod === "check" && !checkNumber) || (paidMethod === "credit_card" && !ccLastFour)}>
            {saving ? "Saving..." : "Mark Paid"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
};

// ════════════════════════════════════════════════════════════
// BILLS TAB
// ════════════════════════════════════════════════════════════
const BillsTab = ({ bills = [], pubs = [], insertBill, updateBill, deleteBill }) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [pubFilter, setPubFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editBill, setEditBill] = useState(null);
  const [paidModalBill, setPaidModalBill] = useState(null);
  const [syncingId, setSyncingId] = useState(null);
  const { resolveForPush } = useQboResolver();

  // Local mirror of bills to guarantee instant UI updates
  const [localBills, setLocalBills] = useState(bills);
  useEffect(() => { setLocalBills(bills); }, [bills]);

  const pubName = (id) => pubs.find(p => p.id === id)?.name || (id ? id : "Overhead");

  const filtered = useMemo(() => {
    return localBills.filter(b => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (categoryFilter !== "all" && b.category !== categoryFilter) return false;
      if (pubFilter !== "all" && (pubFilter === "overhead" ? b.publicationId : b.publicationId !== pubFilter)) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!(b.vendorName?.toLowerCase().includes(s) || b.description?.toLowerCase().includes(s))) return false;
      }
      return true;
    });
  }, [localBills, statusFilter, categoryFilter, pubFilter, search]);

  // May Sim P1.6 — variance flagging. For each bill, compute the rolling
  // average of the prior 3 bills from the same vendor + category. If the
  // current bill diverges by both > 3% AND > $100, flag yellow. The 5/15
  // simulation: PRM May invoice landed with a $340 paper-upcharge line
  // that wasn't in the original contract; Hayley caught it manually.
  // Now BillsTab catches it for her.
  const varianceMap = useMemo(() => {
    const map = new Map();
    // Sort once asc by date so we can walk vendor+category history.
    const sorted = [...localBills].sort((a, b) => (a.billDate || "").localeCompare(b.billDate || ""));
    const history = new Map(); // vendor|cat -> [amounts]
    for (const b of sorted) {
      const key = `${(b.vendorName || "").toLowerCase()}|${b.category || ""}`;
      const prior = history.get(key) || [];
      if (prior.length >= 3) {
        const avg = prior.slice(-3).reduce((s, x) => s + x, 0) / 3;
        const delta = (b.amount || 0) - avg;
        const pct = avg > 0 ? Math.abs(delta) / avg : 0;
        if (Math.abs(delta) > 100 && pct > 0.03) {
          map.set(b.id, { avg, delta, pct, direction: delta > 0 ? "over" : "under" });
        }
      }
      history.set(key, [...prior, b.amount || 0]);
    }
    return map;
  }, [localBills]);

  // Metrics
  const metrics = useMemo(() => {
    const thisMonth = today().slice(0, 7);
    const monthBills = localBills.filter(b => (b.billDate || "").startsWith(thisMonth));
    const totalMonth = monthBills.reduce((s, b) => s + (b.amount || 0), 0);
    const pending = localBills.filter(b => b.status === "pending").reduce((s, b) => s + (b.amount || 0), 0);
    const paid = monthBills.filter(b => b.status === "paid").reduce((s, b) => s + (b.amount || 0), 0);
    const overdue = localBills.filter(b => b.dueDate && b.dueDate < today() && b.status !== "paid" && b.status !== "void");
    const overdueTotal = overdue.reduce((s, b) => s + (b.amount || 0), 0);
    // AP aging buckets
    const apAging = { current: 0, d30: 0, d60: 0, d90: 0 };
    localBills.filter(b => b.status !== "paid" && b.status !== "void" && b.dueDate).forEach(b => {
      const daysLate = Math.round((Date.now() - new Date(b.dueDate + "T12:00:00").getTime()) / 86400000);
      if (daysLate <= 0) apAging.current += b.amount || 0;
      else if (daysLate <= 30) apAging.d30 += b.amount || 0;
      else if (daysLate <= 60) apAging.d60 += b.amount || 0;
      else apAging.d90 += b.amount || 0;
    });
    const apTotal = apAging.current + apAging.d30 + apAging.d60 + apAging.d90;

    return { totalMonth, pending, paid, overdueCount: overdue.length, overdueTotal, apAging, apTotal };
  }, [localBills]);

  const openNew = () => { setEditBill(null); setModalOpen(true); };
  const openEdit = (b) => { setEditBill(b); setModalOpen(true); };

  const handleSave = async (id, form) => {
    if (id) {
      await updateBill(id, form);
      setLocalBills(prev => prev.map(b => b.id === id ? { ...b, ...form } : b));
    } else {
      const created = await insertBill(form);
      if (created) setLocalBills(prev => [created, ...prev]);
    }
  };

  const handleDelete = async (id) => {
    await deleteBill(id);
    setLocalBills(prev => prev.filter(b => b.id !== id));
  };

  const markPaid = (bill) => { setPaidModalBill(bill); };

  const confirmPaid = async (changes) => {
    await updateBill(paidModalBill.id, changes);
    setLocalBills(prev => prev.map(b => b.id === paidModalBill.id ? { ...b, ...changes } : b));
  };

  // Surface the actual error from a Supabase function invoke
  const fnError = async (res, fallback) => {
    if (res.error) {
      // FunctionsHttpError — the edge function returned non-2xx
      try {
        const ctx = res.error.context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json();
          return body.error || body.Fault?.Error?.[0]?.Detail || body.Fault?.Error?.[0]?.Message || fallback;
        }
      } catch (e) { console.warn('[BillsTab] failed to parse error context', e); }
      return res.error.message || fallback;
    }
    return res.data?.error || res.data?.Fault?.Error?.[0]?.Detail || res.data?.Fault?.Error?.[0]?.Message || fallback;
  };

  const pushToQuickBooks = async (bill) => {
    if (!supabase) return alert("Not connected");
    setSyncingId(bill.id);
    try {
      // 1. Find vendor
      const findRes = await supabase.functions.invoke("qb-api", {
        headers: { "x-action": "find-vendor" },
        body: { name: bill.vendorName },
      });
      if (findRes.error) {
        const msg = await fnError(findRes, "Vendor lookup failed");
        throw new Error(msg);
      }
      let vendorId = findRes.data?.vendors?.[0]?.Id;

      // 2. Create if missing
      if (!vendorId) {
        const createPayload = { DisplayName: bill.vendorName };
        if (bill.vendorEmail) createPayload.PrimaryEmailAddr = { Address: bill.vendorEmail };

        const createRes = await supabase.functions.invoke("qb-api", {
          headers: { "x-action": "create-vendor" },
          body: createPayload,
        });
        if (createRes.error) {
          const msg = await fnError(createRes, "Could not create vendor in QuickBooks");
          throw new Error(msg);
        }
        vendorId = createRes.data?.Vendor?.Id;
        if (!vendorId) throw new Error("Vendor created but no ID returned: " + JSON.stringify(createRes.data));
      }

      // 3. Resolve QBO account via mapping table + live Account.Id lookup.
      //    Replaces the old CATEGORY_QB_ACCOUNT literal + inline fuzzy match.
      const tokens = buildBillTokens(bill, pubName);
      const resolved = await resolveForPush({
        transactionType: bill.category,
        tokens,
        qboAccountTypeFilter: COGS_CATEGORIES.has(bill.category) ? "Cost of Goods Sold" : "Expense",
      });

      // 4. Create bill — AccountRef Id + name come from the resolver; the
      //    line Description comes from the templated line_description.
      const billRes = await supabase.functions.invoke("qb-api", {
        headers: { "x-action": "create-bill" },
        body: {
          VendorRef: { value: vendorId },
          TxnDate: bill.billDate,
          DueDate: bill.dueDate || bill.billDate,
          PrivateNote: `${CATEGORY_LABEL[bill.category] || bill.category}${bill.description ? " — " + bill.description : ""}${bill.publicationId ? " · " + pubName(bill.publicationId) : ""}`,
          Line: [{
            Amount: Number(bill.amount),
            DetailType: "AccountBasedExpenseLineDetail",
            Description: resolved.line_description,
            AccountBasedExpenseLineDetail: {
              AccountRef: { value: resolved.qbo_account_id, name: resolved.qbo_account_name },
            },
          }],
        },
      });
      if (billRes.error) {
        const msg = await fnError(billRes, "QB bill create failed");
        throw new Error(msg);
      }
      const qbId = billRes.data?.Bill?.Id;
      if (!qbId) throw new Error("Bill created but no ID returned: " + JSON.stringify(billRes.data));

      const syncChanges = {
        quickbooksId: qbId,
        quickbooksSyncedAt: new Date().toISOString(),
        quickbooksSyncError: null,
      };
      await updateBill(bill.id, syncChanges);
      setLocalBills(prev => prev.map(b => b.id === bill.id ? { ...b, ...syncChanges } : b));
      alert("Pushed to QuickBooks ✓");
    } catch (e) {
      // Specific error classes from the resolver surface actionable messages.
      let msg;
      if (e instanceof UnknownTransactionTypeError) {
        msg = `No QBO mapping for bill category "${e.transactionType}". Add a row to qbo_account_mapping.`;
      } else if (e instanceof MissingTokenError) {
        msg = `Bill is missing required fields for the QBO line description: ${e.missing.join(", ")}`;
      } else if (e instanceof QboAccountNotFoundError) {
        const sample = e.availableNames.slice(0, 10).join(", ") + (e.availableNames.length > 10 ? "…" : "");
        msg = `QBO account "${e.wantedName}" doesn't exist. Create it in QBO, or update qbo_account_mapping. Available: ${sample}`;
      } else {
        msg = e.message || String(e);
      }
      await updateBill(bill.id, { quickbooksSyncError: msg });
      setLocalBills(prev => prev.map(b => b.id === bill.id ? { ...b, quickbooksSyncError: msg } : b));
      alert("QuickBooks push failed:\n\n" + msg);
    }
    setSyncingId(null);
  };

  const pubFilterOptions = [
    { value: "all", label: "All (incl. overhead)" },
    { value: "overhead", label: "Overhead only" },
    ...pubs.map(p => ({ value: p.id, label: p.name })),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Metrics bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <GlassCard>
          <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND }}>This Month</div>
          <div style={{ fontSize: FS.title, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginTop: 2 }}>{fmtCurrency(metrics.totalMonth)}</div>
        </GlassCard>
        <GlassCard>
          <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND }}>Paid MTD</div>
          <div style={{ fontSize: FS.title, fontWeight: FW.black, color: Z.go, fontFamily: DISPLAY, marginTop: 2 }}>{fmtCurrency(metrics.paid)}</div>
        </GlassCard>
        <GlassCard>
          <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND }}>Pending</div>
          <div style={{ fontSize: FS.title, fontWeight: FW.black, color: Z.wa, fontFamily: DISPLAY, marginTop: 2 }}>{fmtCurrency(metrics.pending)}</div>
        </GlassCard>
        <GlassCard>
          <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND }}>Overdue</div>
          <div style={{ fontSize: FS.title, fontWeight: FW.black, color: metrics.overdueCount > 0 ? Z.da : Z.tm, fontFamily: DISPLAY, marginTop: 2 }}>
            {fmtCurrency(metrics.overdueTotal)}
          </div>
          {metrics.overdueCount > 0 && <div style={{ fontSize: FS.micro, color: Z.da, fontFamily: COND, marginTop: 2 }}>{metrics.overdueCount} bill{metrics.overdueCount !== 1 ? "s" : ""}</div>}
        </GlassCard>
      </div>

      {/* AP Aging */}
      {metrics.apTotal > 0 && (
        <div style={{ display: "flex", gap: 2, alignItems: "center", height: 24, borderRadius: Ri, overflow: "hidden", background: Z.sa }}>
          {[
            { label: "Current", value: metrics.apAging.current, color: Z.go || "#22c55e" },
            { label: "30 days", value: metrics.apAging.d30, color: Z.wa || "#d97706" },
            { label: "60 days", value: metrics.apAging.d60, color: "#ea580c" },
            { label: "90+ days", value: metrics.apAging.d90, color: Z.da || "#dc2626" },
          ].filter(b => b.value > 0).map(b => (
            <div key={b.label} title={`${b.label}: ${fmtCurrency(b.value)}`} style={{ height: "100%", width: `${(b.value / metrics.apTotal) * 100}%`, background: b.color, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 40, transition: "width 0.3s" }}>
              <span style={{ fontSize: 9, fontWeight: FW.black, color: "#fff", fontFamily: COND, whiteSpace: "nowrap" }}>{b.label} {fmtCurrency(b.value)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters + Add */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <SB value={search} onChange={setSearch} placeholder="Search vendor or description..." />
        <Sel value={statusFilter} onChange={e => setStatusFilter(e.target.value)} options={[
          { value: "all", label: "All Statuses" }, { value: "pending", label: "Pending" },
          { value: "approved", label: "Approved" }, { value: "paid", label: "Paid" }, { value: "void", label: "Void" },
        ]} />
        <Sel value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} options={[{ value: "all", label: "All Categories" }, ...CATEGORIES]} />
        <Sel value={pubFilter} onChange={e => setPubFilter(e.target.value)} options={pubFilterOptions} />
        <div style={{ marginLeft: "auto" }}>
          <Btn sm onClick={openNew}><Ic.plus size={13} /> New Bill</Btn>
        </div>
      </div>

      {/* Table */}
      <DataTable>
        <thead>
          <tr>
            <th>Vendor</th>
            <th>Category</th>
            <th>Publication</th>
            <th>Bill Date</th>
            <th>Due</th>
            <th>Amount</th>
            <th>Status</th>
            <th>QB</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={9} style={{ textAlign: "center", padding: 30, color: Z.tm, fontFamily: COND }}>No bills match your filters. <span onClick={openNew} style={{ color: Z.ac, cursor: "pointer", textDecoration: "underline" }}>Add one →</span></td></tr>
          )}
          {filtered.map(b => {
            const overdue = b.dueDate && b.dueDate < today() && b.status !== "paid" && b.status !== "void";
            const variance = varianceMap.get(b.id);
            return (
              <tr key={b.id} style={{ cursor: "pointer" }} onClick={() => openEdit(b)}>
                <td style={{ fontWeight: FW.bold, color: Z.tx }}>{b.vendorName}{b.description && <div style={{ fontSize: FS.xs, fontWeight: FW.normal, color: Z.tm, fontFamily: COND }}>{b.description}</div>}</td>
                <td style={{ fontSize: FS.sm, color: Z.tm }}>{CATEGORY_LABEL[b.category] || b.category}</td>
                <td style={{ fontSize: FS.sm, color: Z.tm }}>{b.publicationId ? pubName(b.publicationId) : <span style={{ fontStyle: "italic", color: Z.td }}>Overhead</span>}</td>
                <td style={{ fontSize: FS.sm, color: Z.tm }}>{fmtDate(b.billDate)}</td>
                <td style={{ fontSize: FS.sm, color: overdue ? Z.da : Z.tm, fontWeight: overdue ? FW.bold : FW.normal }}>{b.dueDate ? fmtDate(b.dueDate) : "—"}</td>
                <td style={{ fontWeight: FW.bold, color: Z.tx }}>
                  {fmtCurrency(b.amount)}
                  {variance && (
                    <span title={`Avg of last 3: ${fmtCurrency(variance.avg)} · ${variance.direction === "over" ? "+" : "−"}${fmtCurrency(Math.abs(variance.delta))} (${Math.round(variance.pct * 100)}%)`} style={{ display: "inline-block", marginLeft: 6, padding: "1px 5px", background: Z.wa + "26", color: Z.wa, borderRadius: 3, fontSize: 9, fontWeight: FW.heavy, letterSpacing: 0.4, fontFamily: COND, textTransform: "uppercase" }}>
                      ⚠ {variance.direction === "over" ? "+" : "−"}{Math.round(variance.pct * 100)}%
                    </span>
                  )}
                </td>
                <td>
                  <span style={{
                    display: "inline-block", padding: "2px 8px", borderRadius: Ri,
                    background: (STATUS_COLORS[b.status] || Z.tm) + "1a",
                    color: STATUS_COLORS[b.status] || Z.tm,
                    fontSize: FS.micro, fontWeight: FW.heavy, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: COND,
                  }}>{b.status}</span>
                  {b.status === "paid" && (
                    <div style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND, marginTop: 2 }}>
                      {b.paidMethod === "check" && b.checkNumber ? `Check #${b.checkNumber}`
                        : b.paidMethod === "credit_card" && b.ccLastFour ? `Card •${b.ccLastFour}`
                        : b.paidMethod ? PAY_METHODS.find(m => m.value === b.paidMethod)?.label || b.paidMethod
                        : ""}
                      {b.attachmentUrl && <> · <a href={b.attachmentUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: Z.ac, textDecoration: "underline" }}>📎</a></>}
                    </div>
                  )}
                </td>
                <td style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
                  {b.quickbooksId ? <span title={"QB ID: " + b.quickbooksId} style={{ color: Z.go, fontWeight: FW.bold }}>✓ Synced</span>
                    : b.quickbooksSyncError ? <span title={b.quickbooksSyncError} style={{ color: Z.da }}>Error</span>
                    : <span style={{ color: Z.td }}>—</span>}
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: 4 }}>
                    {b.status !== "paid" && b.status !== "void" && (
                      <Btn sm v="ghost" onClick={() => markPaid(b)}>Mark Paid</Btn>
                    )}
                    {!b.quickbooksId && (
                      <Btn sm v="ghost" onClick={() => pushToQuickBooks(b)} disabled={syncingId === b.id}>
                        {syncingId === b.id ? "Pushing..." : "Push to QB"}
                      </Btn>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>

      {/* Modals */}
      {modalOpen && (
        <BillModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          bill={editBill}
          pubs={pubs}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
      {paidModalBill && (
        <MarkPaidModal
          open={!!paidModalBill}
          onClose={() => setPaidModalBill(null)}
          bill={paidModalBill}
          onConfirm={confirmPaid}
        />
      )}
    </div>
  );
};

export default BillsTab;
