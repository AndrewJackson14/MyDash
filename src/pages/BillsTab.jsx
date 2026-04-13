// ============================================================
// BillsTab.jsx — Vendor bills / expense entry + QuickBooks push
// ============================================================
import { useState, useMemo, useEffect } from "react";
import { Z, COND, DISPLAY, FS, FW, R, Ri, INV } from "../lib/theme";
import { Ic, Btn, Inp, Sel, TA, Modal, Badge, GlassCard, PageHeader, DataTable, SB, Toggle } from "../components/ui";
import { fmtCurrencyWhole as fmtCurrency, fmtDateShort as fmtDate } from "../lib/formatters";
import { supabase } from "../lib/supabase";

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
  { value: "other", label: "Other" },
];

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));

// Category → canonical QB top-level account name (exact match, case-insensitive).
// Publications are NOT encoded here — publication tracking stays in MyDash.
const CATEGORY_QB_ACCOUNT = {
  freelance: "Freelance",
  commission: "Commissions",
  route_driver: "Route Drivers",
  shipping: "Shipping",
  printing: "Printing",
  postage: "Postage",
  payroll: "Payroll",
  rent: "Rent",
  utilities: "Utilities",
  software: "Software",
  insurance: "Insurance",
  marketing: "Marketing",
  other: "Other Expenses",
};

const STATUS_COLORS = {
  pending: Z.wa,
  approved: Z.ac,
  paid: Z.go,
  void: Z.td,
};

const today = () => new Date().toISOString().slice(0, 10);

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
            <Btn sm v="secondary" onClick={onClose} disabled={saving}>Cancel</Btn>
            <Btn sm onClick={save} disabled={saving}>{saving ? "Saving..." : isEdit ? "Save Changes" : "Add Bill"}</Btn>
          </div>
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
  const [syncingId, setSyncingId] = useState(null);

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

  // Metrics
  const metrics = useMemo(() => {
    const thisMonth = today().slice(0, 7);
    const monthBills = localBills.filter(b => (b.billDate || "").startsWith(thisMonth));
    const totalMonth = monthBills.reduce((s, b) => s + (b.amount || 0), 0);
    const pending = localBills.filter(b => b.status === "pending").reduce((s, b) => s + (b.amount || 0), 0);
    const paid = monthBills.filter(b => b.status === "paid").reduce((s, b) => s + (b.amount || 0), 0);
    const overdue = localBills.filter(b => b.dueDate && b.dueDate < today() && b.status !== "paid" && b.status !== "void");
    const overdueTotal = overdue.reduce((s, b) => s + (b.amount || 0), 0);
    return { totalMonth, pending, paid, overdueCount: overdue.length, overdueTotal };
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

  const markPaid = async (bill) => {
    const changes = { status: "paid", paidAt: new Date().toISOString() };
    await updateBill(bill.id, changes);
    setLocalBills(prev => prev.map(b => b.id === bill.id ? { ...b, ...changes } : b));
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
      } catch {}
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

      // 3. Look up the QB top-level expense account for this category
      const targetAccountName = CATEGORY_QB_ACCOUNT[bill.category];
      if (!targetAccountName) throw new Error(`No QB account mapping for category "${bill.category}"`);

      const acctRes = await supabase.functions.invoke("qb-api", {
        headers: { "x-action": "query" },
        body: { query: "SELECT Id, Name, AccountType FROM Account WHERE AccountType = 'Expense' MAXRESULTS 200" },
      });
      if (acctRes.error) {
        const msg = await fnError(acctRes, "Could not load QuickBooks expense accounts");
        throw new Error(msg);
      }
      const accounts = acctRes.data?.QueryResponse?.Account || [];
      if (accounts.length === 0) {
        throw new Error("No Expense accounts found in QuickBooks. Create one in QB first.");
      }

      // Exact match (case-insensitive)
      const match = accounts.find(a => (a.Name || "").toLowerCase() === targetAccountName.toLowerCase());
      if (!match) {
        const available = accounts.map(a => a.Name).join(", ");
        throw new Error(`QuickBooks has no expense account named "${targetAccountName}". Create it in QB, or rename one of: ${available}`);
      }
      const accountId = match.Id;
      const matchedName = match.Name;

      // 4. Create bill
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
            Description: bill.description || CATEGORY_LABEL[bill.category] || bill.category,
            AccountBasedExpenseLineDetail: {
              AccountRef: { value: accountId, name: matchedName },
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
      const msg = e.message || String(e);
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
          <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND }}>This Month</div>
          <div style={{ fontSize: 22, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginTop: 2 }}>{fmtCurrency(metrics.totalMonth)}</div>
        </GlassCard>
        <GlassCard>
          <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND }}>Paid MTD</div>
          <div style={{ fontSize: 22, fontWeight: FW.black, color: Z.go, fontFamily: DISPLAY, marginTop: 2 }}>{fmtCurrency(metrics.paid)}</div>
        </GlassCard>
        <GlassCard>
          <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND }}>Pending</div>
          <div style={{ fontSize: 22, fontWeight: FW.black, color: Z.wa, fontFamily: DISPLAY, marginTop: 2 }}>{fmtCurrency(metrics.pending)}</div>
        </GlassCard>
        <GlassCard>
          <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: COND }}>Overdue</div>
          <div style={{ fontSize: 22, fontWeight: FW.black, color: metrics.overdueCount > 0 ? Z.da : Z.tm, fontFamily: DISPLAY, marginTop: 2 }}>
            {fmtCurrency(metrics.overdueTotal)}
          </div>
          {metrics.overdueCount > 0 && <div style={{ fontSize: 10, color: Z.da, fontFamily: COND, marginTop: 2 }}>{metrics.overdueCount} bill{metrics.overdueCount !== 1 ? "s" : ""}</div>}
        </GlassCard>
      </div>

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
            return (
              <tr key={b.id} style={{ cursor: "pointer" }} onClick={() => openEdit(b)}>
                <td style={{ fontWeight: FW.bold, color: Z.tx }}>{b.vendorName}{b.description && <div style={{ fontSize: 11, fontWeight: FW.normal, color: Z.tm, fontFamily: COND }}>{b.description}</div>}</td>
                <td style={{ fontSize: FS.sm, color: Z.tm }}>{CATEGORY_LABEL[b.category] || b.category}</td>
                <td style={{ fontSize: FS.sm, color: Z.tm }}>{b.publicationId ? pubName(b.publicationId) : <span style={{ fontStyle: "italic", color: Z.td }}>Overhead</span>}</td>
                <td style={{ fontSize: FS.sm, color: Z.tm }}>{fmtDate(b.billDate)}</td>
                <td style={{ fontSize: FS.sm, color: overdue ? Z.da : Z.tm, fontWeight: overdue ? FW.bold : FW.normal }}>{b.dueDate ? fmtDate(b.dueDate) : "—"}</td>
                <td style={{ fontWeight: FW.bold, color: Z.tx }}>{fmtCurrency(b.amount)}</td>
                <td>
                  <span style={{
                    display: "inline-block", padding: "2px 8px", borderRadius: Ri,
                    background: (STATUS_COLORS[b.status] || Z.tm) + "1a",
                    color: STATUS_COLORS[b.status] || Z.tm,
                    fontSize: 10, fontWeight: FW.heavy, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: COND,
                  }}>{b.status}</span>
                </td>
                <td style={{ fontSize: 11, color: Z.tm, fontFamily: COND }}>
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

      {/* Modal */}
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
    </div>
  );
};

export default BillsTab;
