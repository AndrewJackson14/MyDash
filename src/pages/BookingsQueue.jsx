// ============================================================
// BookingsQueue.jsx — Rep approval queue for self-serve bookings.
//
// Left: filterable list (by status × pub).
// Right: detail panel for the selected booking — advertiser, line
// items, pricing breakdown, conflict warning, approve/reject actions.
// ============================================================
import { useState, useEffect, useCallback, useMemo } from "react";
import { Z, COND, FS, FW } from "../lib/theme";
import { Btn, Sel, TA, Modal, PageHeader, GlassCard, SolidTabs } from "../components/ui";
import { supabase } from "../lib/supabase";
import { useDialog } from "../hooks/useDialog";

const STATUSES = [
  { value: "submitted",  label: "Pending",   color: "#2563eb" },
  { value: "approved",   label: "Approved",  color: "#059669" },
  { value: "scheduled",  label: "Scheduled", color: "#059669" },
  { value: "live",       label: "Live",      color: "#10b981" },
  { value: "completed",  label: "Completed", color: "#6b7280" },
  { value: "rejected",   label: "Rejected",  color: "#dc2626" },
  { value: "cancelled",  label: "Cancelled", color: "#6b7280" },
];

const fmtMoney = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;
const fmtDate = (iso) => iso ? new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const fmtRelative = (iso) => {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
};

const statusBadge = (s) => {
  const meta = STATUSES.find(x => x.value === s) || STATUSES[0];
  return (
    <span style={{
      fontSize: 10, fontWeight: FW.heavy, color: meta.color, background: meta.color + "18",
      padding: "2px 8px", borderRadius: 3, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: COND,
    }}>{meta.label}</span>
  );
};

export default function BookingsQueue({ pubs = [] }) {
  const [statusFilter, setStatusFilter] = useState("submitted");
  const [pubFilter, setPubFilter] = useState("all");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const pubOptions = useMemo(() => [{ value: "all", label: "All Publications" }, ...pubs.map(p => ({ value: p.id, label: p.name }))], [pubs]);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("ad_bookings")
      .select(`
        id, site_id, status, creative_status, run_start_date, run_end_date,
        booked_by_email, booking_source, total_cents, created_at,
        markup_applied, discount_applied,
        advertiser:advertisers(id, business_name, primary_email, phone),
        publication:publications(id, name)
      `)
      .order("created_at", { ascending: false })
      .limit(100);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (pubFilter !== "all") q = q.eq("site_id", pubFilter);
    const { data, error } = await q;
    if (error) console.error("BookingsQueue load:", error);
    setBookings(data || []);
    setLoading(false);
  }, [statusFilter, pubFilter]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    // Kept fast: derived from current page only. For real counts a separate
    // count-by-status query would be needed.
    return STATUSES.reduce((acc, s) => ({ ...acc, [s.value]: bookings.filter(b => b.status === s.value).length }), {});
  }, [bookings]);

  return (
    <div>
      <PageHeader title="Booking Queue" />

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <SolidTabs
          active={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "submitted", label: `Pending${counts.submitted ? ` · ${counts.submitted}` : ""}` },
            { value: "approved", label: "Approved" },
            { value: "scheduled", label: "Scheduled" },
            { value: "live", label: "Live" },
            { value: "completed", label: "Completed" },
            { value: "rejected", label: "Rejected" },
            { value: "all", label: "All" },
          ]}
        />
        <div style={{ marginLeft: "auto", minWidth: 220 }}>
          <Sel value={pubFilter} onChange={e => setPubFilter(e.target.value)} options={pubOptions} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 1.4fr" : "1fr", gap: 12 }}>
        <GlassCard noPad>
          {loading ? <div style={{ padding: 20, color: Z.tm }}>Loading…</div> :
            bookings.length === 0 ? <div style={{ padding: 20, color: Z.td, fontFamily: COND }}>No bookings match these filters.</div> :
            <div style={{ maxHeight: 720, overflowY: "auto" }}>
              {bookings.map(b => (
                <div
                  key={b.id}
                  onClick={() => setSelected(b)}
                  style={{
                    padding: "10px 14px", borderBottom: `1px solid ${Z.bd}`, cursor: "pointer",
                    background: selected?.id === b.id ? Z.ac + "10" : "transparent",
                    borderLeft: `3px solid ${selected?.id === b.id ? Z.ac : "transparent"}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>
                      {b.advertiser?.business_name || "—"}
                    </div>
                    {statusBadge(b.status)}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
                    <span>{b.publication?.name || b.site_id} · {b.booking_source === "self_serve" ? "Self-serve" : "Rep-mediated"}</span>
                    <span>{fmtMoney(b.total_cents)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: Z.td, marginTop: 2, fontFamily: COND }}>
                    {fmtRelative(b.created_at)} · {b.run_start_date ? `${fmtDate(b.run_start_date)} – ${fmtDate(b.run_end_date)}` : "no dates"}
                  </div>
                </div>
              ))}
            </div>
          }
        </GlassCard>

        {selected && <BookingDetail booking={selected} onClose={() => setSelected(null)} onChange={() => { load(); setSelected(null); }} />}
      </div>
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────
function BookingDetail({ booking, onClose, onChange }) {
  const dialog = useDialog();
  const [full, setFull] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [repNotes, setRepNotes] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    setFull(null); setConflicts([]); setLoading(true);
    setRepNotes(""); setRejecting(false); setRejectReason("");
    (async () => {
      const [{ data: lines }, { data: cf }] = await Promise.all([
        supabase.from("ad_booking_line_items")
          .select("id, quantity, unit_price_cents, line_total_cents, run_start_date, run_end_date, product:ad_products(id, name, product_type, ad_zone_id)")
          .eq("booking_id", booking.id)
          .order("created_at"),
        supabase.rpc("get_booking_conflicts", { p_booking_id: booking.id }),
      ]);
      setFull({ ...booking, line_items: lines || [] });
      setConflicts(cf || []);
      setLoading(false);
    })();
  }, [booking.id]);

  const approve = async () => {
    setWorking(true);
    const { data, error } = await supabase.rpc("approve_booking", { p_booking_id: booking.id, p_rep_notes: repNotes || null });
    setWorking(false);
    if (error) { await dialog.alert("Approve failed: " + error.message); return; }
    await dialog.alert(`Booking approved → status now: ${data.new_status}`);
    onChange();
  };

  const reject = async () => {
    if (!rejectReason.trim()) { await dialog.alert("Rejection reason is required."); return; }
    setWorking(true);
    const { error } = await supabase.rpc("reject_booking", { p_booking_id: booking.id, p_rejection_reason: rejectReason });
    setWorking(false);
    if (error) { await dialog.alert("Reject failed: " + error.message); return; }
    onChange();
  };

  return (
    <GlassCard>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>
            {booking.advertiser?.business_name}
          </div>
          <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, marginTop: 2 }}>
            {booking.advertiser?.primary_email}
            {booking.advertiser?.phone && ` · ${booking.advertiser.phone}`}
          </div>
          <div style={{ marginTop: 6 }}>{statusBadge(booking.status)}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: Z.tm, cursor: "pointer", fontSize: 18 }}>×</button>
      </div>

      {loading ? <div style={{ padding: 20, color: Z.tm }}>Loading…</div> : (
        <>
          {conflicts.length > 0 && (
            <div style={{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 6, padding: 10, marginBottom: 12 }}>
              <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: "#92400e", fontFamily: COND, marginBottom: 4 }}>
                ⚠ {conflicts.length} conflicting {conflicts.length === 1 ? "booking" : "bookings"}
              </div>
              {conflicts.map((c, i) => (
                <div key={i} style={{ fontSize: FS.xs, color: "#78350f", fontFamily: COND, marginTop: 2 }}>
                  {c.business_name} on {c.zone_name}: {fmtDate(c.run_start_date)} – {fmtDate(c.run_end_date)} ({c.status})
                </div>
              ))}
            </div>
          )}

          <Section title="Run dates">
            <span style={{ fontSize: FS.sm, color: Z.tx, fontFamily: COND }}>
              {full.run_start_date ? `${fmtDate(full.run_start_date)} – ${fmtDate(full.run_end_date)}` : "Not specified"}
            </span>
          </Section>

          <Section title="Line items">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={th}>Product</th>
                <th style={{ ...th, textAlign: "right" }}>Qty</th>
                <th style={{ ...th, textAlign: "right" }}>Unit</th>
                <th style={{ ...th, textAlign: "right" }}>Total</th>
              </tr></thead>
              <tbody>
                {full.line_items.map(li => (
                  <tr key={li.id}>
                    <td style={td}>{li.product?.name}</td>
                    <td style={{ ...td, textAlign: "right" }}>{li.quantity}</td>
                    <td style={{ ...td, textAlign: "right", color: Z.tm }}>{fmtMoney(li.unit_price_cents)}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: FW.bold }}>{fmtMoney(li.line_total_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="Pricing">
            <PriceRow label="Subtotal" value={fmtMoney(booking.subtotal_cents || full.subtotal_cents)} />
            {(booking.markup_applied || full.markup_applied) && (
              <PriceRow label={`Industry adjustment (+${Number(full.markup_percent).toFixed(0)}%)`}
                value={`+${fmtMoney(full.markup_amount_cents)}`} />
            )}
            {(booking.discount_applied || full.discount_applied) && (
              <PriceRow label={`Local discount (−${Number(full.discount_percent).toFixed(0)}%)`}
                value={`−${fmtMoney(full.discount_amount_cents)}`} c="#059669" />
            )}
            <div style={{ borderTop: `1px solid ${Z.bd}`, marginTop: 6, paddingTop: 6 }}>
              <PriceRow label="Total" value={fmtMoney(booking.total_cents)} bold />
            </div>
          </Section>

          {full.creative_notes && (
            <Section title="Creative notes from advertiser">
              <p style={{ fontSize: FS.sm, color: Z.tx, fontFamily: COND, whiteSpace: "pre-wrap" }}>{full.creative_notes}</p>
            </Section>
          )}

          {full.rejection_reason && booking.status === "rejected" && (
            <Section title="Rejection reason">
              <p style={{ fontSize: FS.sm, color: "#7f1d1d", fontFamily: COND }}>{full.rejection_reason}</p>
            </Section>
          )}

          {(booking.status === "submitted" || booking.status === "approved") && !rejecting && (
            <Section title="Actions">
              <TA label="Internal notes (optional)" value={repNotes} onChange={e => setRepNotes(e.target.value)} rows={2} placeholder="Visible to other reps; not shown to the advertiser." />
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <Btn onClick={approve} disabled={working}>{booking.status === "submitted" ? "Approve" : "Re-approve"}</Btn>
                <Btn v="ghost" onClick={() => setRejecting(true)} disabled={working} style={{ color: "#dc2626" }}>Reject</Btn>
              </div>
            </Section>
          )}

          {rejecting && (
            <Section title="Reject this booking">
              <TA label="Reason (sent to advertiser)" value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} required />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <Btn onClick={reject} disabled={working || !rejectReason.trim()} style={{ background: "#dc2626" }}>Confirm Reject</Btn>
                <Btn v="ghost" onClick={() => setRejecting(false)} disabled={working}>Cancel</Btn>
              </div>
            </Section>
          )}

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${Z.bd}`, fontSize: 10, color: Z.td, fontFamily: COND }}>
            Booking ID: {booking.id} · Source: {booking.booking_source}
          </div>
        </>
      )}
    </GlassCard>
  );
}

const th = { padding: "6px 8px", textAlign: "left", fontSize: 9, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.6, borderBottom: `1px solid ${Z.bd}`, fontFamily: COND };
const td = { padding: "6px 8px", color: Z.tx, fontSize: FS.sm, fontFamily: COND, borderBottom: `1px solid ${Z.bd}30` };

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.tm, textTransform: "uppercase", letterSpacing: 0.6, fontFamily: COND, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function PriceRow({ label, value, bold, c }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: FS.sm, fontFamily: COND }}>
      <span style={{ color: c || Z.tm, fontWeight: bold ? FW.bold : FW.normal }}>{label}</span>
      <span style={{ color: c || Z.tx, fontWeight: bold ? FW.bold : FW.semi }}>{value}</span>
    </div>
  );
}
