// ============================================================
// BillsTab.jsx — Vendor bills / expense entry + QuickBooks push
// ============================================================
import { useState, useMemo } from "react";
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

  const pubName = (id) => pubs.find(p => p.id === id)?.name || (id ? id : "Overhead");

  const filtered = useMemo(() => {
    return bills.filter(b => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (categoryFilter !== "all" && b.category !== categoryFilter) return false;
      if (pubFilter !== "all" && (pubFilter === "overhead" ? b.publicationId : b.publicationId !== pubFilter)) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!(b.vendorName?.toLowerCase().includes(s) || b.description?.toLowerCase().includes(s))) return false;
      }
      return true;
    });
  }, [bills, statusFilter, categoryFilter, pubFilter, search]);

  // Metrics
  const metrics = useMemo(() => {
    const thisMonth = today().slice(0, 7);
    const monthBills = bills.filter(b => (b.billDate || "").startsWith(thisMonth));
    const totalMonth = monthBills.reduce((s, b) => s + (b.amount || 0), 0);
    const pending = bills.filter(b => b.status === "pending").reduce((s, b) => s + (b.amount || 0), 0);
    const paid = monthBills.filter(b => b.status === "paid").reduce((s, b) => s + (b.amount || 0), 0);
    const overdue = bills.filter(b => b.dueDate && b.dueDate < today() && b.status !== "paid" && b.status !== "void");
    const overdueTotal = overdue.reduce((s, b) => s + (b.amount || 0), 0);
    return { totalMonth, pending, paid, overdueCount: overdue.length, overdueTotal };
  }, [bills]);

  const openNew = () => { setEditBill(null); setModalOpen(true); };
  const openEdit = (b) => { setEditBill(b); setModalOpen(true); };

  const handleSave = async (id, form) => {
    if (id) await updateBill(id, form);
    else await insertBill(form);
  };

  const markPaid = async (bill) => {
    await updateBill(bill.id, { status: "paid", paidAt: new Date().toISOString() });
  };

  const pushToQuickBooks = async (bill) => {
    if (!supabase) return alert("Not connected");
    setSyncingId(bill.id);
    try {
      // 1. Find or create vendor
      const findRes = await supabase.functions.invoke("qb-api", {
        headers: { "x-action": "find-vendor" },
        body: { name: bill.vendorName },
      });
      let vendorId = findRes.data?.vendors?.[0]?.Id;
      if (!vendorId) {
        const createRes = await supabase.functions.invoke("qb-api", {
          headers: { "x-action": "create-vendor" },
          body: {
            DisplayName: bill.vendorName,
            ...(bill.vendorEmail ? { PrimaryEmailAddr: { Address: bill.vendorEmail } } : {}),
          },
        });
        vendorId = createRes.data?.Vendor?.Id;
        if (!vendorId) throw new Error(createRes.data?.error || "Could not create vendor in QuickBooks");
      }

      // 2. Create bill
      const billRes = await supabase.functions.invoke("qb-api", {
        headers: { "x-action": "create-bill" },
        body: {
          VendorRef: { value: vendorId },
          TxnDate: bill.billDate,
          DueDate: bill.dueDate || bill.billDate,
          PrivateNote: `${CATEGORY_LABEL[bill.category] || bill.category}${bill.description ? " — " + bill.description : ""}${bill.publicationId ? " · " + pubName(bill.publicationId) : ""}`,
          Line: [{
            Amount: bill.amount,
            DetailType: "AccountBasedExpenseLineDetail",
            Description: bill.description || CATEGORY_LABEL[bill.category] || bill.category,
            // AccountRef omitted — QuickBooks will error if default account isn't set; user can remap in QB
          }],
        },
      });
      const qbId = billRes.data?.Bill?.Id;
      if (!qbId) throw new Error(billRes.data?.error || billRes.data?.Fault?.Error?.[0]?.Detail || "QB bill create failed");

      await updateBill(bill.id, {
        quickbooksId: qbId,
        quickbooksSyncedAt: new Date().toISOString(),
        quickbooksSyncError: null,
      });
      alert("Pushed to QuickBooks");
    } catch (e) {
      await updateBill(bill.id, { quickbooksSyncError: e.message || String(e) });
      alert("QuickBooks push failed: " + (e.message || e));
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
          onDelete={deleteBill}
        />
      )}
    </div>
  );
};

export default BillsTab;
