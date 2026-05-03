import { useState, useEffect } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri } from "../../../../lib/theme";
import { Btn, Card, Modal } from "../../../../components/ui";
import { supabase } from "../../../../lib/supabase";
import CadenceModal from "../components/CadenceModal";

// Financial card — AR at-a-glance + invoices/payments/reports tabs.
// Reports tab lazy-loads delivery_reports + delivery_report_schedules
// because they're empty for most clients; not worth boot-fetching.
//
// Wave 2: extracted from ClientProfile monolith. Owns its own tab state
// + reports lazy-loading + cadence modal lifecycle since none of those
// values are read elsewhere in the profile.
export default function FinancialCard({
  clientId, clientInvoices, clientPayments,
  currentBalance, overdueBalance, lifetimeBilled, lifetimePaid,
  clientDso, lastPayment, oldestOpenInvoice,
  digitalSales,
  clients,
  today, fmtD,
}) {
  const [finTab, setFinTab] = useState("invoices"); // invoices | payments | reports
  const [deliveryReports, setDeliveryReports] = useState([]);
  const [deliverySchedules, setDeliverySchedules] = useState([]);
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [viewReportId, setViewReportId] = useState(null);
  const [cadenceModalSchedule, setCadenceModalSchedule] = useState(null);

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

  if (clientInvoices.length === 0 && clientPayments.length === 0) return null;

  return (
    <>
      <Card style={{ borderLeft: `3px solid ${Z.pu}`, marginBottom: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Financial</span>
          <span style={{ fontSize: FS.xs, color: Z.td }}>{clientInvoices.length} invoice{clientInvoices.length === 1 ? "" : "s"} · {clientPayments.length} payment{clientPayments.length === 1 ? "" : "s"}</span>
        </div>

        {/* At-a-glance */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 12 }}>
          <div style={{ background: Z.bg, borderRadius: Ri, padding: "10px 12px" }}>
            <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>Current Balance</div>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: currentBalance > 0 ? (overdueBalance > 0 ? Z.da : Z.wa) : Z.su, fontFamily: DISPLAY }}>${currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
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

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {[["invoices", `Invoices (${clientInvoices.length})`], ["payments", `Payments (${clientPayments.length})`]].map(([key, label]) => (
            <button key={key} onClick={() => setFinTab(key)} style={{ padding: "4px 12px", borderRadius: Ri, border: `1px solid ${finTab === key ? Z.ac : Z.bd}`, background: finTab === key ? Z.ac + "15" : "transparent", color: finTab === key ? Z.ac : Z.tm, cursor: "pointer", fontSize: FS.xs, fontWeight: FW.heavy, fontFamily: COND, textTransform: "uppercase" }}>{label}</button>
          ))}
          {digitalSales.length > 0 && (
            <button onClick={() => setFinTab("reports")} style={{ padding: "4px 12px", borderRadius: Ri, border: `1px solid ${finTab === "reports" ? Z.ac : Z.bd}`, background: finTab === "reports" ? Z.ac + "15" : "transparent", color: finTab === "reports" ? Z.ac : Z.tm, cursor: "pointer", fontSize: FS.xs, fontWeight: FW.heavy, fontFamily: COND, textTransform: "uppercase" }}>Reports{reportsLoaded ? ` (${deliveryReports.length})` : ""}</button>
          )}
        </div>

        {/* Invoices list */}
        {finTab === "invoices" && (
          <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${Z.bd}`, borderRadius: Ri }}>
            <div style={{ display: "grid", gridTemplateColumns: "140px 100px 100px 100px 100px 80px", gap: 10, alignItems: "center", padding: "8px 10px", background: Z.sa, borderBottom: `1px solid ${Z.bd}`, fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, position: "sticky", top: 0, zIndex: 1 }}>
              <span>Invoice #</span><span>Issued</span><span>Due</span>
              <span style={{ textAlign: "right" }}>Total</span>
              <span style={{ textAlign: "right" }}>Paid</span>
              <span style={{ textAlign: "right" }}>Status</span>
            </div>
            {clientInvoices.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No invoices</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: 4 }}>
                {[...clientInvoices].sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || "")).slice(0, 100).map(inv => {
                  const total = Number(inv.total || 0);
                  const balance = Number(inv.balanceDue || 0);
                  const invPaid = Math.max(0, total - balance);
                  const isOverdue = inv.dueDate && inv.dueDate < today && balance > 0;
                  return (
                    <div key={inv.id} style={{ display: "grid", gridTemplateColumns: "140px 100px 100px 100px 100px 80px", gap: 10, alignItems: "center", padding: "5px 10px", background: Z.bg, borderRadius: Ri, fontSize: FS.sm }}>
                      <span style={{ fontWeight: FW.bold, color: Z.ac, fontFamily: COND }}>{inv.invoiceNumber}</span>
                      <span style={{ color: Z.tm, fontSize: FS.xs }}>{fmtD(inv.issueDate)}</span>
                      <span style={{ color: isOverdue ? Z.da : Z.tm, fontWeight: isOverdue ? FW.bold : FW.regular, fontSize: FS.xs }}>{fmtD(inv.dueDate)}</span>
                      <span style={{ textAlign: "right", fontWeight: FW.heavy, color: Z.tx }}>${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span style={{ textAlign: "right", color: invPaid > 0 ? Z.go : Z.td, fontWeight: FW.bold }}>{invPaid > 0 ? `$${invPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</span>
                      <span style={{ textAlign: "right" }}>
                        <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: Ri, fontSize: FS.micro, fontWeight: FW.heavy, background: inv.status === "paid" ? Z.go + "20" : inv.status === "overdue" ? Z.da + "20" : inv.status === "partially_paid" ? Z.wa + "20" : Z.ac + "20", color: inv.status === "paid" ? Z.go : inv.status === "overdue" ? Z.da : inv.status === "partially_paid" ? Z.wa : Z.ac, textTransform: "uppercase" }}>
                          {inv.status === "partially_paid" ? "Partial" : inv.status}
                        </span>
                      </span>
                    </div>
                  );
                })}
                {clientInvoices.length > 100 && <div style={{ padding: 6, textAlign: "center", fontSize: FS.micro, color: Z.td }}>Showing 100 of {clientInvoices.length}</div>}
              </div>}
          </div>
        )}

        {/* Payments list */}
        {finTab === "payments" && (
          <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${Z.bd}`, borderRadius: Ri }}>
            <div style={{ display: "grid", gridTemplateColumns: "100px 100px 120px 140px 1fr 100px", gap: 10, alignItems: "center", padding: "8px 10px", background: Z.sa, borderBottom: `1px solid ${Z.bd}`, fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, position: "sticky", top: 0, zIndex: 1 }}>
              <span>Date</span><span>Amount</span><span>Method</span><span>Invoice #</span><span>Memo</span>
              <span style={{ textAlign: "right" }}>Ref</span>
            </div>
            {clientPayments.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No payments recorded</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: 4 }}>
                {[...clientPayments].sort((a, b) => (b.receivedAt || "").localeCompare(a.receivedAt || "")).slice(0, 100).map(p => {
                  const inv = clientInvoices.find(i => i.id === p.invoiceId);
                  const nmMatch = /^NM:\s*([^|]+)/.exec(p.notes || "");
                  const methodLabel = nmMatch ? nmMatch[1].trim() : (p.method || "other");
                  const memoMatch = /Memo:\s*([^|]+)/.exec(p.notes || "");
                  return (
                    <div key={p.id} style={{ display: "grid", gridTemplateColumns: "100px 100px 120px 140px 1fr 100px", gap: 10, alignItems: "center", padding: "5px 10px", background: Z.bg, borderRadius: Ri, fontSize: FS.sm }}>
                      <span style={{ color: Z.tm, fontSize: FS.xs }}>{fmtD(p.receivedAt?.slice(0, 10))}</span>
                      <span style={{ fontWeight: FW.heavy, color: Z.go }}>${(p.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span style={{ fontSize: FS.xs, color: Z.tm }}>{methodLabel}</span>
                      <span style={{ fontSize: FS.xs, color: Z.ac, fontFamily: COND }}>{inv?.invoiceNumber || "—"}</span>
                      <span style={{ fontSize: FS.xs, color: Z.td, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{memoMatch ? memoMatch[1].trim() : ""}</span>
                      <span style={{ textAlign: "right", fontSize: FS.micro, color: Z.td }}>{p.referenceNumber || ""}</span>
                    </div>
                  );
                })}
                {clientPayments.length > 100 && <div style={{ padding: 6, textAlign: "center", fontSize: FS.micro, color: Z.td }}>Showing 100 of {clientPayments.length}</div>}
              </div>}
          </div>
        )}

        {/* Reports */}
        {finTab === "reports" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {reportsLoading ? <div style={{ padding: 16, textAlign: "center", color: Z.td, fontSize: FS.sm }}>Loading reports...</div>
              : <>
                {digitalSales.length > 0 && (
                  <div style={{ border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: 8 }}>
                    <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontFamily: COND }}>Digital Campaigns</div>
                    {digitalSales.map(s => {
                      const sched = deliverySchedules.find(d => d.sale_id === s.id);
                      return (
                        <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px auto", gap: 8, alignItems: "center", padding: "5px 6px", background: Z.bg, borderRadius: Ri, fontSize: FS.sm }}>
                          <span style={{ fontWeight: FW.bold, color: Z.tx }}>{s.size || "Digital"}{s.flightStartDate ? ` — ${fmtD(s.flightStartDate)} → ${fmtD(s.flightEndDate)}` : ""}</span>
                          <span style={{ fontSize: FS.xs, color: sched?.is_active ? Z.go : Z.tm, fontWeight: FW.heavy, textTransform: "uppercase" }}>{sched ? (sched.is_active ? sched.cadence : "paused") : "no schedule"}</span>
                          <span style={{ fontSize: FS.xs, color: Z.tm }}>{sched?.next_run_at ? `Next ${fmtD(sched.next_run_at.slice(0, 10))}` : "—"}</span>
                          <Btn sm v="ghost" onClick={() => setCadenceModalSchedule(sched ? { ...sched, _saleLabel: s.size || "Digital" } : { _newForSale: s, sale_id: s.id, cadence: "monthly", is_active: true, _saleLabel: s.size || "Digital" })}>Manage</Btn>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${Z.bd}`, borderRadius: Ri }}>
                  <div style={{ display: "grid", gridTemplateColumns: "120px 70px 70px 60px 80px 70px", gap: 10, alignItems: "center", padding: "8px 10px", background: Z.sa, borderBottom: `1px solid ${Z.bd}`, fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, position: "sticky", top: 0, zIndex: 1 }}>
                    <span>Period</span><span style={{ textAlign: "right" }}>Imp</span><span style={{ textAlign: "right" }}>Clicks</span><span style={{ textAlign: "right" }}>CTR</span><span>Status</span><span style={{ textAlign: "right" }}>Action</span>
                  </div>
                  {deliveryReports.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No reports yet — they generate on the campaign cadence.</div>
                    : <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: 4 }}>
                      {deliveryReports.map(r => (
                        <div key={r.id} style={{ display: "grid", gridTemplateColumns: "120px 70px 70px 60px 80px 70px", gap: 10, alignItems: "center", padding: "5px 10px", background: Z.bg, borderRadius: Ri, fontSize: FS.sm }}>
                          <span style={{ color: Z.tm, fontSize: FS.xs }}>{fmtD(r.period_start)} → {fmtD(r.period_end)}</span>
                          <span style={{ textAlign: "right", fontWeight: FW.heavy, color: Z.tx }}>{(Number(r.impressions) || 0).toLocaleString()}</span>
                          <span style={{ textAlign: "right", color: Z.tx }}>{(Number(r.clicks) || 0).toLocaleString()}</span>
                          <span style={{ textAlign: "right", color: Z.tm, fontSize: FS.xs }}>{Number(r.ctr || 0).toFixed(2)}%</span>
                          <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: r.status === "sent" ? Z.go : r.status === "failed" ? Z.da : Z.tm, textTransform: "uppercase" }}>{r.status}</span>
                          <span style={{ textAlign: "right" }}><Btn sm v="ghost" onClick={() => setViewReportId(r.id)}>View</Btn></span>
                        </div>
                      ))}
                    </div>}
                </div>
              </>}
          </div>
        )}
      </Card>

      {/* View report modal */}
      {viewReportId && (() => {
        const r = deliveryReports.find(x => x.id === viewReportId);
        if (!r) return null;
        return (
          <Modal open={true} onClose={() => setViewReportId(null)} title={`Delivery Report — ${fmtD(r.period_start)} → ${fmtD(r.period_end)}`} width={800}>
            {r.html_snapshot
              ? <iframe srcDoc={r.html_snapshot} title="Report" style={{ width: "100%", height: "70vh", border: "none", background: "#fff", borderRadius: 4 }} />
              : <div style={{ padding: 24, color: Z.td, fontSize: FS.sm }}>No HTML snapshot saved on this report.</div>}
          </Modal>
        );
      })()}

      {/* Cadence modal */}
      {cadenceModalSchedule && (
        <CadenceModal
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
        />
      )}
    </>
  );
}
