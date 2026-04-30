// Subscribers tab — print/digital table, new-subscriber modal,
// detail modal, export mailing list, send renewals. No functional
// change from the pre-split Circulation.jsx.
import { useState, useEffect } from "react";
import { Z, COND, FS, FW, R, Ri } from "../../lib/theme";
import { Ic, Btn, Inp, Sel, TA, Modal, SB, TB, TabPipe, GlassCard, DataTable } from "../../components/ui";
import { fmtDate, fmtCurrency } from "../../lib/formatters";
import { useDialog } from "../../hooks/useDialog";
import { generateRenewalHtml, getRenewalSubject } from "../../lib/renewalTemplate";
import { sendGmailEmail } from "../../lib/gmail";
import { supabase } from "../../lib/supabase";
import { SUB_TYPES, SUB_STATUSES, SUB_STATUS_COLORS, EXPORT_COLUMNS, PRINTER_PRESET, pnFor, todayIso } from "./constants";

const StatusBadge = ({ status }) => {
  const c = SUB_STATUS_COLORS[status] || { bg: Z.sa, text: Z.tm };
  return <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: Ri, fontSize: FS.xs, fontWeight: FW.bold, background: c.bg, color: c.text, whiteSpace: "nowrap", textTransform: "capitalize" }}>{status}</span>;
};

export default function Subscribers({
  pubs, subscribers, setSubscribers, subscriptionPayments,
  externalOpenExport,   // parent-triggered (Overview buttons) — when true, open export modal on mount
  externalOpenRenewals, // parent-triggered — when true, open renewal modal on mount
  onExternalConsumed,   // called after consuming the parent trigger
}) {
  const pn = pnFor(pubs);
  const today = todayIso();
  const dialog = useDialog();
  const subs = subscribers || [];

  // ── Filters + search ───────────────────────────────────
  const [sr, setSr] = useState("");
  const [subType, setSubType] = useState("print");
  const [subFilter, setSubFilter] = useState("all");
  const [pubFilter, setPubFilter] = useState("all");

  // ── Modals ─────────────────────────────────────────────
  const [subModal, setSubModal] = useState(false);
  const [editSub, setEditSub] = useState(null);
  const [exportModal, setExportModal] = useState(false);
  const [renewalModal, setRenewalModal] = useState(false);
  const [subDetailId, setSubDetailId] = useState(null);

  // Parent-driven modal openers from Overview tab buttons.
  useEffect(() => {
    if (externalOpenExport) { setExportModal(true); onExternalConsumed?.(); }
  }, [externalOpenExport, onExternalConsumed]);
  useEffect(() => {
    if (externalOpenRenewals) { setRenewalModal(true); onExternalConsumed?.(); }
  }, [externalOpenRenewals, onExternalConsumed]);

  // ── Form + export state ────────────────────────────────
  const blankSub = { type: "print", status: "active", firstName: "", lastName: "", email: "", phone: "", addressLine1: "", addressLine2: "", city: "", state: "CA", zip: "", publicationId: pubs[0]?.id || "", startDate: today, expiryDate: "", renewalDate: "", amountPaid: 0, source: "", notes: "" };
  const [subForm, setSubForm] = useState(blankSub);
  const [exportCols, setExportCols] = useState(PRINTER_PRESET);
  const [exportPub, setExportPub] = useState("all");
  const [exportStatus, setExportStatus] = useState("active");
  const [exportFormat, setExportFormat] = useState("csv");
  const [exportSort, setExportSort] = useState("lastName");

  // ── CRUD ───────────────────────────────────────────────
  const openSubModal = (sub) => {
    if (sub) { setEditSub(sub); setSubForm({ ...sub }); }
    else     { setEditSub(null); setSubForm({ ...blankSub }); }
    setSubModal(true);
  };
  const saveSub = () => {
    if (!subForm.firstName || !subForm.lastName) return;
    if (editSub) {
      setSubscribers(prev => (prev || []).map(s => s.id === editSub.id ? { ...s, ...subForm } : s));
    } else {
      setSubscribers(prev => [...(prev || []), { ...subForm, id: "sub-" + Date.now(), createdAt: new Date().toISOString() }]);
    }
    setSubModal(false);
  };
  const cancelSub = (subId) => {
    setSubscribers(prev => (prev || []).map(s => s.id === subId ? { ...s, status: "cancelled" } : s));
  };

  // ── Filter pipeline ────────────────────────────────────
  let filteredSubs = subs.filter(s => subType === "print" ? (s.type === "print" || !s.type) : s.type === "digital");
  if (subFilter !== "all") filteredSubs = filteredSubs.filter(s => s.status === subFilter);
  if (pubFilter !== "all") filteredSubs = filteredSubs.filter(s => s.publicationId === pubFilter);
  if (sr) {
    const q = sr.toLowerCase();
    filteredSubs = filteredSubs.filter(s =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.city?.toLowerCase().includes(q) ||
      s.zip?.includes(q)
    );
  }

  return <>
    {/* Action row */}
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <SB value={sr} onChange={setSr} placeholder="Search subscribers..." />
      <Sel value={pubFilter} onChange={e => setPubFilter(e.target.value)} options={[{ value: "all", label: "All Publications" }, ...pubs.map(p => ({ value: p.id, label: pn(p.id) }))]} />
      <Btn sm v="secondary" onClick={() => setExportModal(true)}>Export List</Btn>
      <Btn sm v="secondary" onClick={() => setRenewalModal(true)}>Send Renewals</Btn>
      <Btn sm onClick={() => openSubModal(null)}><Ic.plus size={13} /> New Subscriber</Btn>
    </div>

    {/* Sub-tabs for type + status */}
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <TB tabs={["Print", "Digital"]} active={subType === "print" ? "Print" : "Digital"} onChange={v => setSubType(v === "Print" ? "print" : "digital")} />
      <TabPipe />
      <TB tabs={["All", ...SUB_STATUSES.map(s => s.label)]}
          active={subFilter === "all" ? "All" : (SUB_STATUSES.find(s => s.value === subFilter)?.label || "All")}
          onChange={v => setSubFilter(v === "All" ? "all" : (SUB_STATUSES.find(s => s.label === v)?.value || "all"))} />
    </div>

    <div style={{ fontSize: FS.sm, color: Z.td }}>{filteredSubs.length} subscriber{filteredSubs.length !== 1 ? "s" : ""}</div>

    {/* Subscribers table */}
    <GlassCard style={{ padding: 0, overflow: "hidden" }}>
      <DataTable>
        <thead>
          <tr>
            {["Name", "Publication", "City/Zip", "Start", "Renewal", "Status", ""].map(h =>
              <th key={h} style={{ textAlign: "left", fontWeight: FW.heavy, color: Z.tm, fontSize: FS.xs, textTransform: "uppercase" }}>{h}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {filteredSubs.length === 0
            ? <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: Z.td, fontSize: FS.base }}>No subscribers found</td></tr>
            : filteredSubs.slice().sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`)).map(s => <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => setSubDetailId(s.id)}>
              <td style={{ padding: "8px 10px" }}>
                <div style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{s.firstName} {s.lastName}</div>
                {s.email && <div style={{ fontSize: FS.xs, color: Z.td }}>{s.email}</div>}
              </td>
              <td style={{ padding: "8px 10px" }}><span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tm, fontFamily: COND }}>{pn(s.publicationId)}</span></td>
              <td style={{ fontSize: FS.sm, color: Z.tm }}>{s.city}{s.city && s.zip ? ", " : ""}{s.zip}</td>
              <td style={{ fontSize: FS.sm, color: Z.tm }}>{fmtDate(s.startDate)}</td>
              <td style={{ fontSize: FS.sm, color: s.renewalDate && s.renewalDate <= today ? Z.da : Z.tm }}>{fmtDate(s.renewalDate)}</td>
              <td style={{ padding: "8px 10px" }}><StatusBadge status={s.status} /></td>
              <td style={{ padding: "8px 10px" }}>
                {s.status === "active" && <Btn sm v="ghost" onClick={e => { e.stopPropagation(); cancelSub(s.id); }}>Cancel</Btn>}
              </td>
            </tr>)}
        </tbody>
      </DataTable>
    </GlassCard>

    {/* ═══ Subscriber modal ═══ */}
    <Modal open={subModal} onClose={() => setSubModal(false)} title={editSub ? "Edit Subscriber" : "New Subscriber"} width={560} onSubmit={saveSub}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Sel label="Type" value={subForm.type} onChange={e => setSubForm(f => ({ ...f, type: e.target.value }))} options={SUB_TYPES} />
          <Sel label="Publication" value={subForm.publicationId} onChange={e => setSubForm(f => ({ ...f, publicationId: e.target.value }))} options={pubs.map(p => ({ value: p.id, label: p.name }))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="First Name" value={subForm.firstName} onChange={e => setSubForm(f => ({ ...f, firstName: e.target.value }))} />
          <Inp label="Last Name" value={subForm.lastName} onChange={e => setSubForm(f => ({ ...f, lastName: e.target.value }))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Email" type="email" value={subForm.email} onChange={e => setSubForm(f => ({ ...f, email: e.target.value }))} />
          <Inp label="Phone" value={subForm.phone} onChange={e => setSubForm(f => ({ ...f, phone: e.target.value }))} />
        </div>
        {subForm.type === "print" && <>
          <Inp label="Address Line 1" value={subForm.addressLine1} onChange={e => setSubForm(f => ({ ...f, addressLine1: e.target.value }))} />
          <Inp label="Address Line 2" value={subForm.addressLine2} onChange={e => setSubForm(f => ({ ...f, addressLine2: e.target.value }))} />
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
            <Inp label="City" value={subForm.city} onChange={e => setSubForm(f => ({ ...f, city: e.target.value }))} />
            <Inp label="State" value={subForm.state} onChange={e => setSubForm(f => ({ ...f, state: e.target.value }))} />
            <Inp label="Zip" value={subForm.zip} onChange={e => setSubForm(f => ({ ...f, zip: e.target.value }))} />
          </div>
        </>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Inp label="Start Date" type="date" value={subForm.startDate} onChange={e => setSubForm(f => ({ ...f, startDate: e.target.value }))} />
          <Inp label="Expiry Date" type="date" value={subForm.expiryDate} onChange={e => setSubForm(f => ({ ...f, expiryDate: e.target.value }))} />
          <Inp label="Renewal Date" type="date" value={subForm.renewalDate} onChange={e => setSubForm(f => ({ ...f, renewalDate: e.target.value }))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Amount Paid" type="number" step="0.01" value={subForm.amountPaid || ""} onChange={e => setSubForm(f => ({ ...f, amountPaid: Number(e.target.value) || 0 }))} />
          <Inp label="Source" value={subForm.source} onChange={e => setSubForm(f => ({ ...f, source: e.target.value }))} placeholder="Website, phone, event..." />
        </div>
        <TA label="Notes" value={subForm.notes} onChange={e => setSubForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="cancel" onClick={() => setSubModal(false)}>Cancel</Btn>
          <Btn onClick={saveSub} disabled={!subForm.firstName || !subForm.lastName}>{editSub ? "Save Changes" : "Add Subscriber"}</Btn>
        </div>
      </div>
    </Modal>

    {/* ═══ Export mailing list modal ═══ */}
    <Modal open={exportModal} onClose={() => setExportModal(false)} title="Export Mailing List" width={640}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Publication</div>
            <Sel value={exportPub} onChange={e => setExportPub(e.target.value)} options={[{ value: "all", label: "All Publications" }, ...pubs.map(p => ({ value: p.id, label: p.name }))]} />
          </div>
          <div>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Status</div>
            <Sel value={exportStatus} onChange={e => setExportStatus(e.target.value)} options={[{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "expired", label: "Expired" }]} />
          </div>
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Columns</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setExportCols(EXPORT_COLUMNS.map(c => c.key))} style={{ fontSize: FS.xs, color: Z.ac, background: "none", border: "none", cursor: "pointer", fontWeight: FW.bold }}>Select All</button>
              <button onClick={() => setExportCols([])} style={{ fontSize: FS.xs, color: Z.tm, background: "none", border: "none", cursor: "pointer", fontWeight: FW.bold }}>Clear</button>
              <button onClick={() => setExportCols([...PRINTER_PRESET])} style={{ fontSize: FS.xs, color: Z.go, background: "none", border: "none", cursor: "pointer", fontWeight: FW.bold }}>Printer Preset</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            {EXPORT_COLUMNS.map(col => (
              <label key={col.key} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: Ri, background: exportCols.includes(col.key) ? Z.as : Z.bg, cursor: "pointer", fontSize: FS.sm }}>
                <input type="checkbox" checked={exportCols.includes(col.key)} onChange={() => setExportCols(prev => prev.includes(col.key) ? prev.filter(c => c !== col.key) : [...prev, col.key])} />
                <span style={{ color: Z.tx }}>{col.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Format</div>
            <div style={{ display: "flex", gap: 6 }}>
              {["csv", "xlsx"].map(f => <Btn key={f} sm v={exportFormat === f ? "primary" : "secondary"} onClick={() => setExportFormat(f)}>{f.toUpperCase()}</Btn>)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Sort By</div>
            <Sel value={exportSort} onChange={e => setExportSort(e.target.value)} options={[
              { value: "lastName", label: "Last Name" }, { value: "zip", label: "ZIP Code" },
              { value: "city", label: "City" }, { value: "expiryDate", label: "Expiry Date" },
              { value: "publicationId", label: "Publication" },
            ]} />
          </div>
        </div>
        {(() => {
          let rows = subs.filter(s => s.type === "print");
          if (exportPub !== "all") rows = rows.filter(s => s.publicationId === exportPub);
          if (exportStatus !== "all") rows = rows.filter(s => s.status === exportStatus);
          return <div style={{ padding: "8px 12px", background: Z.bg, borderRadius: Ri, fontSize: FS.sm, color: Z.tm }}>
            {rows.length} subscriber{rows.length !== 1 ? "s" : ""} · {exportCols.length} column{exportCols.length !== 1 ? "s" : ""} · {exportFormat.toUpperCase()}
          </div>;
        })()}
        <Btn onClick={() => {
          let rows = subs.filter(s => s.type === "print");
          if (exportPub !== "all") rows = rows.filter(s => s.publicationId === exportPub);
          if (exportStatus !== "all") rows = rows.filter(s => s.status === exportStatus);
          rows.sort((a, b) => (a[exportSort] || "").localeCompare(b[exportSort] || ""));
          const header = exportCols.map(k => EXPORT_COLUMNS.find(c => c.key === k)?.label || k);
          const csvRows = rows.map(s => exportCols.map(k => k === "publicationId" ? pn(s[k]) : (s[k] ?? "")).map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
          const csv = [header.join(","), ...csvRows].join("\n");
          const blob = new Blob([csv], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href = url; a.download = `mailing-list-${exportPub === "all" ? "all" : exportPub}-${today}.csv`; a.click();
          URL.revokeObjectURL(url);
          setExportModal(false);
        }}>Download {exportFormat.toUpperCase()}</Btn>
      </div>
    </Modal>

    {/* ═══ Renewal notices modal — Cami P2 ═══
        Per-row checkboxes, computed touch (first/second/third) based
        on what's already been sent + days-to-expiry, lapse-rescue
        tab for already-lapsed subs. Sends via Gmail OAuth + flips
        the *_notice_sent column so the same touch never re-fires.   */}
    <RenewalModal
      open={renewalModal}
      onClose={() => setRenewalModal(false)}
      subs={subs}
      pn={pn}
      setSubscribers={setSubscribers}
      dialog={dialog}
    />

    {/* ═══ Subscriber detail modal ═══ */}
    {subDetailId && (() => {
      const sub = subs.find(s => s.id === subDetailId);
      if (!sub) return null;
      const subPayments = (subscriptionPayments || []).filter(p => p.subscriberId === sub.id).sort((a, b) => (b.paymentDate || "").localeCompare(a.paymentDate || ""));
      return <Modal open={!!subDetailId} onClose={() => setSubDetailId(null)} title={`${sub.firstName} ${sub.lastName}`} width={520}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ padding: "10px 14px", background: Z.bg, borderRadius: Ri }}>
              <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Publication</div>
              <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>{pn(sub.publicationId)}</div>
            </div>
            <div style={{ padding: "10px 14px", background: Z.bg, borderRadius: Ri }}>
              <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Status</div>
              <StatusBadge status={sub.status} />
            </div>
          </div>
          {sub.addressLine1 && <div style={{ padding: "10px 14px", background: Z.bg, borderRadius: Ri }}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Mailing Address</div>
            <div style={{ fontSize: FS.sm, color: Z.tx, lineHeight: 1.5 }}>
              {sub.addressLine1}<br />{sub.addressLine2 && <>{sub.addressLine2}<br /></>}{sub.city}, {sub.state} {sub.zip}
            </div>
          </div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {sub.email && <div><div style={{ fontSize: FS.xs, color: Z.td }}>Email</div><div style={{ fontSize: FS.sm, color: Z.tx }}>{sub.email}</div></div>}
            {sub.phone && <div><div style={{ fontSize: FS.xs, color: Z.td }}>Phone</div><div style={{ fontSize: FS.sm, color: Z.tx }}>{sub.phone}</div></div>}
            <div><div style={{ fontSize: FS.xs, color: Z.td }}>Type</div><div style={{ fontSize: FS.sm, color: Z.tx }}>{sub.type}</div></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div><div style={{ fontSize: FS.xs, color: Z.td }}>Start</div><div style={{ fontSize: FS.sm, color: Z.tx }}>{fmtDate(sub.startDate)}</div></div>
            <div><div style={{ fontSize: FS.xs, color: Z.td }}>Expiry</div><div style={{ fontSize: FS.sm, color: Z.tx }}>{fmtDate(sub.expiryDate)}</div></div>
            <div><div style={{ fontSize: FS.xs, color: Z.td }}>Renewal</div><div style={{ fontSize: FS.sm, color: sub.renewalDate && sub.renewalDate < today ? Z.da : Z.tx }}>{fmtDate(sub.renewalDate)}</div></div>
          </div>
          <div>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 6 }}>Payment History</div>
            {subPayments.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No payments recorded</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 200, overflowY: "auto" }}>
              {subPayments.map(p => <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: Z.bg, borderRadius: Ri, fontSize: FS.sm }}>
                <span style={{ color: Z.tx }}>{fmtDate(p.paymentDate)}</span>
                <span style={{ color: Z.tm }}>{p.method || "—"}</span>
                <span style={{ fontWeight: FW.bold, color: Z.go }}>{fmtCurrency(p.amount)}</span>
              </div>)}
            </div>}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn sm v="secondary" onClick={() => { setSubDetailId(null); openSubModal(sub); }}>Edit</Btn>
            <Btn sm onClick={() => setSubDetailId(null)}>Close</Btn>
          </div>
        </div>
      </Modal>;
    })()}
  </>;
}

// ── Touch detection — picks the next renewal notice that should
// fire for a subscriber given what's already been sent + how close
// they are to their renewal date. Returns null if no notice should
// fire (already at third, or too far out). Cami's escalation cadence:
//   30+d out: first
//   8-14d:    second
//   ≤7d:      third
// Subs whose renewal date passed without a third sent get a final
// (auto-escalated) third even after expiry, so Cami can still rescue.
function computeRenewalTouch(sub, today) {
  if (!sub.renewalDate) return null;
  const daysToRenewal = Math.ceil((new Date(sub.renewalDate + "T12:00:00") - new Date(today + "T12:00:00")) / 86400000);
  if (sub.firstNoticeSent && sub.secondNoticeSent && sub.thirdNoticeSent) return null;
  if (!sub.firstNoticeSent && daysToRenewal <= 30) return "first";
  if (!sub.secondNoticeSent && daysToRenewal <= 14) return "second";
  if (!sub.thirdNoticeSent && daysToRenewal <= 7) return "third";
  return null;
}

function RenewalModal({ open, onClose, subs, pn, setSubscribers, dialog }) {
  const today = todayIso();
  const [mode, setMode] = useState("renewals"); // renewals | rescue
  const [selected, setSelected] = useState(() => new Set());
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [sentTotal, setSentTotal] = useState(0);

  // Renewal candidates — active prints with a due touch.
  const renewalRows = (subs || [])
    .filter(s => s.status === "active" && s.type === "print" && s.email)
    .map(s => ({ sub: s, touch: computeRenewalTouch(s, today) }))
    .filter(r => r.touch);

  // Rescue candidates — recently lapsed/cancelled (last 60d), still
  // has email, hasn't yet received a "third" notice (so we can give
  // them one final win-back swing).
  const cutoff60 = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const rescueRows = (subs || [])
    .filter(s => ["lapsed", "expired", "cancelled"].includes(s.status) && s.email && s.type === "print")
    .filter(s => (s.updatedAt || s.renewalDate || "") >= cutoff60)
    .filter(s => !s.thirdNoticeSent)
    .map(s => ({ sub: s, touch: "third" }));

  const rows = mode === "renewals" ? renewalRows : rescueRows;

  // Reset selection on tab switch / open
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(rows.map(r => r.sub.id)));
    setSentCount(0); setSentTotal(0);
  }, [open, mode, rows.length]);

  // Group by pub for visual chunking
  const byPub = {};
  for (const r of rows) {
    const pk = r.sub.publicationId || "_other";
    if (!byPub[pk]) byPub[pk] = [];
    byPub[pk].push(r);
  }

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.sub.id)));
  };
  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const send = async () => {
    if (sending) return;
    const queue = rows.filter(r => selected.has(r.sub.id));
    if (queue.length === 0) return;
    setSending(true);
    setSentCount(0);
    setSentTotal(queue.length);
    let ok = 0;
    for (const { sub, touch } of queue) {
      try {
        const pubName = pn(sub.publicationId) || "your publication";
        const htmlBody = generateRenewalHtml({
          subscriberName: `${sub.firstName} ${sub.lastName}`.trim(),
          publicationName: pubName,
          expiryDate: sub.renewalDate,
          renewalAmount: sub.amountPaid || 0,
          renewLink: "",
          touch,
        });
        await sendGmailEmail({
          teamMemberId: null, to: [sub.email],
          subject: getRenewalSubject(pubName, touch),
          htmlBody, mode: "send", emailType: "renewal",
          refId: sub.id, refType: "subscriber",
        });
        // Flip the appropriate notice flag so the same touch doesn't
        // re-fire next week. Skip flag-flip for rescue mode since
        // those are already-lapsed and the email_log carries the
        // record.
        if (mode === "renewals") {
          const col = touch === "first" ? "first_notice_sent" : touch === "second" ? "second_notice_sent" : "third_notice_sent";
          await supabase.from("subscribers").update({ [col]: true, updated_at: new Date().toISOString() }).eq("id", sub.id);
          if (typeof setSubscribers === "function") {
            const camel = touch === "first" ? "firstNoticeSent" : touch === "second" ? "secondNoticeSent" : "thirdNoticeSent";
            setSubscribers(prev => prev.map(x => x.id === sub.id ? { ...x, [camel]: true } : x));
          }
        } else {
          // Rescue mode: stamp third so we don't pile on
          await supabase.from("subscribers").update({ third_notice_sent: true, updated_at: new Date().toISOString() }).eq("id", sub.id);
          if (typeof setSubscribers === "function") {
            setSubscribers(prev => prev.map(x => x.id === sub.id ? { ...x, thirdNoticeSent: true } : x));
          }
        }
        ok++;
        setSentCount(ok);
      } catch (err) {
        console.error("Renewal email error:", err);
      }
    }
    setSending(false);
    await dialog.alert(`${ok} of ${queue.length} ${mode === "renewals" ? "renewal" : "rescue"} notice${ok !== 1 ? "s" : ""} sent.`);
    onClose();
  };

  const touchColor = (t) => t === "third" ? Z.da : t === "second" ? Z.wa : Z.ac;
  const touchLabel = (t) => t === "first" ? "1st" : t === "second" ? "2nd" : "3rd";

  return (
    <Modal open={open} onClose={() => !sending && onClose()} title={mode === "renewals" ? "Send Renewal Notices" : "Lapse Rescue Notices"} width={620}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${Z.bd}`, paddingBottom: 8 }}>
          {[
            ["renewals", "Renewals", renewalRows.length],
            ["rescue", "Lapse Rescue", rescueRows.length],
          ].map(([k, l, n]) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              disabled={sending}
              style={{
                padding: "6px 14px", borderRadius: Ri, border: "none", cursor: "pointer",
                fontSize: FS.xs, fontWeight: mode === k ? FW.bold : 500,
                background: mode === k ? Z.tx + "12" : "transparent",
                color: mode === k ? Z.tx : Z.tm,
                fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.4,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {l}
              {n > 0 && <span style={{ fontSize: FS.micro, color: mode === k ? Z.tx : Z.td }}>{n}</span>}
            </button>
          ))}
        </div>

        {/* Banner */}
        <div style={{ padding: "10px 14px", background: Z.bg, borderRadius: Ri, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: FS.sm, color: Z.tx }}>
            {mode === "renewals"
              ? <>Active subscribers due for the next notice based on their renewal date and what's already been sent.</>
              : <>Recently lapsed subscribers eligible for a final win-back email.</>}
          </div>
          {rows.length > 0 && (
            <button onClick={toggleAll} style={{ background: "transparent", border: "none", color: Z.ac, fontSize: FS.xs, fontWeight: FW.bold, cursor: "pointer", fontFamily: COND, whiteSpace: "nowrap" }}>
              {selected.size === rows.length ? "Deselect all" : "Select all"}
            </button>
          )}
        </div>

        {/* Per-pub groups with row checkboxes */}
        {rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>
            {mode === "renewals" ? "✨ No renewal notices due right now." : "No recently lapsed subscribers."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto" }}>
            {Object.entries(byPub).map(([pubId, list]) => (
              <div key={pubId}>
                <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>{pn(pubId) || "Other"} ({list.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {list.map(({ sub, touch }) => {
                    const isSelected = selected.has(sub.id);
                    return (
                      <label key={sub.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: Z.bg, borderRadius: Ri, cursor: "pointer" }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleOne(sub.id)} disabled={sending} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {sub.firstName} {sub.lastName}
                          </div>
                          <div style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {sub.email}
                            {sub.firstNoticeSent && " · ✓ 1st"}
                            {sub.secondNoticeSent && " · ✓ 2nd"}
                            {sub.thirdNoticeSent && " · ✓ 3rd"}
                          </div>
                        </div>
                        <span style={{ fontSize: 9, fontWeight: FW.heavy, color: touchColor(touch), background: touchColor(touch) + "15", padding: "2px 6px", borderRadius: Ri, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.4, flexShrink: 0 }}>
                          Send {touchLabel(touch)}
                        </span>
                        <span style={{ fontSize: FS.micro, color: Z.wa, fontFamily: COND, flexShrink: 0, minWidth: 60, textAlign: "right" }}>{fmtDate(sub.renewalDate)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action bar */}
        {sending && (
          <div style={{ padding: "8px 14px", background: Z.ac + "10", borderRadius: Ri, fontSize: FS.xs, color: Z.ac, fontFamily: COND, fontWeight: FW.bold }}>
            Sending… {sentCount} of {sentTotal}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="cancel" onClick={onClose} disabled={sending}>Cancel</Btn>
          <Btn onClick={send} disabled={sending || selected.size === 0}>
            {sending ? `Sending… (${sentCount}/${sentTotal})` : `Send ${selected.size} Notice${selected.size !== 1 ? "s" : ""}`}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
