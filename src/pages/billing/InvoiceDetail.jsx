import { Z, COND, DISPLAY, FS, FW, Ri } from "../../lib/theme";
import { Ic, Btn, Card , DataTable } from "../../components/ui";
import { InvBadge, PAYMENT_METHODS, fmtCurrency, fmtDate } from "./constants";

const InvoiceDetail = ({ invoice, payments, onBack, onSend, onRecordPayment, onVoid }) => {
  if (!invoice) return null;
  const invPayments = (payments || []).filter(p => p.invoiceId === invoice.id);

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: Z.ac, fontSize: FS.base, fontWeight: FW.bold, fontFamily: COND, textAlign: "left", padding: 0 }}>← Back to Invoices</button>

    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <h2 style={{ margin: "0 0 4px", fontSize: FS.title, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{invoice.invoiceNumber}</h2>
        <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tm }}>{invoice.clientName || "Client"}</div>
        <div style={{ fontSize: FS.sm, color: Z.td, marginTop: 2 }}>Issued {fmtDate(invoice.issueDate)} · Due {fmtDate(invoice.dueDate)}</div>
        {invoice.billingSchedule === "monthly_plan" && <div style={{ fontSize: FS.sm, color: Z.pu, marginTop: 2 }}>Monthly Plan: {fmtCurrency(invoice.monthlyAmount)}/mo × {invoice.planMonths} months</div>}
      </div>
      <div style={{ textAlign: "right" }}>
        <InvBadge status={invoice.status} />
        <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.tx, marginTop: 8, fontFamily: DISPLAY }}>{fmtCurrency(invoice.total)}</div>
        {invoice.balanceDue > 0 && invoice.balanceDue < invoice.total && <div style={{ fontSize: FS.md, color: Z.da, fontWeight: FW.bold, marginTop: 2 }}>Balance: {fmtCurrency(invoice.balanceDue)}</div>}
      </div>
    </div>

    <div style={{ display: "flex", gap: 8 }}>
      {invoice.status === "draft" && <Btn onClick={() => onSend(invoice.id)}><Ic.send size={13} /> Send Invoice</Btn>}
      {["sent", "partially_paid", "overdue"].includes(invoice.status) && <Btn onClick={() => onRecordPayment(invoice.id)}><Ic.check size={13} /> Record Payment</Btn>}
      {invoice.status !== "void" && invoice.status !== "paid" && <Btn v="ghost" onClick={() => onVoid(invoice.id)}>Void</Btn>}
    </div>

    <Card>
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
          {(invoice.lines || []).map((l, i) => <tr key={i} style={{ borderBottom: `1px solid ${Z.bd}` }}>
            <td style={{ fontSize: FS.base, color: Z.tx }}>{l.description}</td>
            <td style={{ fontSize: FS.base, color: Z.tm, textAlign: "right" }}>{l.quantity}</td>
            <td style={{ fontSize: FS.base, color: Z.tm, textAlign: "right" }}>{fmtCurrency(l.unitPrice)}</td>
            <td style={{ fontSize: FS.md, color: Z.tx, fontWeight: FW.bold, textAlign: "right" }}>{fmtCurrency(l.total)}</td>
          </tr>)}
        </tbody>
        <tfoot>
          <tr><td colSpan={3} style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, textAlign: "right" }}>Total</td><td style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.su, textAlign: "right" }}>{fmtCurrency(invoice.total)}</td></tr>
        </tfoot>
      </DataTable>
    </Card>

    <Card>
      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Payment History</div>
      {invPayments.length === 0
        ? <div style={{ fontSize: FS.base, color: Z.td, padding: "12px 0" }}>No payments recorded</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {invPayments.map(p => <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: Z.bg, borderRadius: Ri }}>
            <div>
              <div style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{fmtCurrency(p.amount)}</div>
              <div style={{ fontSize: FS.xs, color: Z.td }}>{PAYMENT_METHODS.find(m => m.value === p.method)?.label || p.method}{p.lastFour ? ` ···${p.lastFour}` : ""}</div>
            </div>
            <div style={{ fontSize: FS.sm, color: Z.tm }}>{fmtDate(p.receivedAt?.slice(0, 10))}</div>
          </div>)}
        </div>}
    </Card>

    {invoice.notes && <Card>
      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Notes</div>
      <div style={{ fontSize: FS.base, color: Z.tm }}>{invoice.notes}</div>
    </Card>}
  </div>;
};

export default InvoiceDetail;
