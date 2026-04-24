// ============================================================
// CashFlowSignalCard — AR aging, top overdue, 7-day net, and a
// single "biggest collection opportunity" callout so the publisher
// knows who to call first without scanning Billing.
// ============================================================
import { useMemo } from "react";
import { Z, FS, FW, COND, Ri } from "../../lib/theme";
import { Btn } from "../ui";
import { fmtCurrencyWhole as fmtCurrency } from "../../lib/formatters";
import DashboardModule from "./DashboardModule";

const DAY_MS = 86400000;

const BUCKET_DEFS = [
  { key: "current", label: "Current",  min: -Infinity, max: 0,   color: Z.go },
  { key: "d30",     label: "1–30 days", min: 1,        max: 30,  color: Z.wa },
  { key: "d60",     label: "31–60 days", min: 31,      max: 60,  color: "#F97316" },
  { key: "d90",     label: "60+ days",  min: 61,       max: Infinity, color: Z.da },
];

const OPEN_STATUSES = new Set(["sent", "partially_paid", "overdue"]);

export default function CashFlowSignalCard({
  invoices, payments, clients,
  uninvoicedContracts = 0,
  userId, onOpenInvoice, onOpenBilling,
}) {
  const data = useMemo(() => {
    const today = new Date();
    const open = (invoices || []).filter(i => OPEN_STATUSES.has(i.status));

    const bucketAmounts = Object.fromEntries(BUCKET_DEFS.map(b => [b.key, 0]));
    const overdueList = [];

    open.forEach(inv => {
      if (!inv.dueDate) return;
      const due = new Date(inv.dueDate + "T12:00:00");
      const daysLate = Math.floor((today - due) / DAY_MS);
      const bal = Number(inv.balanceDue) || 0;
      const bucket = BUCKET_DEFS.find(b => daysLate >= b.min && daysLate <= b.max);
      if (bucket) bucketAmounts[bucket.key] += bal;
      if (daysLate > 0 && bal > 0) overdueList.push({ inv, daysLate, bal });
    });

    overdueList.sort((a, b) => b.bal - a.bal);
    const topOverdue = overdueList.slice(0, 3);

    // 7-day net: payments in minus invoices issued out.
    const weekAgo = new Date(today.getTime() - 7 * DAY_MS);
    const paid7d = (payments || []).reduce((s, p) => {
      const d = new Date(p.receivedAt || p.received_at || p.createdAt || 0);
      return d >= weekAgo ? s + (Number(p.amount) || 0) : s;
    }, 0);
    const issued7d = (invoices || []).reduce((s, inv) => {
      const d = new Date(inv.createdAt || inv.created_at || inv.invoiceDate || 0);
      return d >= weekAgo ? s + (Number(inv.total) || 0) : s;
    }, 0);

    // Biggest opportunity: largest 60d+ overdue.
    const bigOverdue = overdueList.find(x => x.daysLate >= 31);

    return { bucketAmounts, topOverdue, paid7d, issued7d, bigOverdue };
  }, [invoices, payments]);

  const clientName = (inv) => {
    const id = inv.clientId || inv.client_id;
    return (clients || []).find(c => c.id === id)?.name || "—";
  };

  const totalOutstanding = BUCKET_DEFS.reduce((s, b) => s + data.bucketAmounts[b.key], 0);

  return (
    <DashboardModule
      id="cash-flow-signal"
      userId={userId}
      title="Cash Flow Signal"
      subtitle={`$${Math.round(totalOutstanding).toLocaleString()} outstanding`}
      action={onOpenBilling ? <Btn sm v="ghost" onClick={onOpenBilling}>Billing</Btn> : null}
    >
      {/* Aging buckets */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {BUCKET_DEFS.map(b => {
          const amt = data.bucketAmounts[b.key] || 0;
          const pct = totalOutstanding > 0 ? Math.max(6, (amt / totalOutstanding) * 100) : 25;
          return (
            <div key={b.key} style={{
              flex: `${pct} 1 0`, minWidth: 0,
              padding: "8px 10px",
              borderRadius: 8,
              background: b.color + "18",
              borderTop: `3px solid ${b.color}`,
            }}>
              <div style={{
                fontSize: FS.micro, fontWeight: FW.heavy,
                color: b.color, fontFamily: COND,
                textTransform: "uppercase", letterSpacing: 0.5,
              }}>{b.label}</div>
              <div style={{
                fontSize: FS.base, fontWeight: FW.black, color: Z.tx,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{fmtCurrency(amt)}</div>
            </div>
          );
        })}
      </div>

      {/* Biggest opportunity */}
      {data.bigOverdue && (
        <div
          onClick={() => onOpenInvoice?.(data.bigOverdue.inv.id)}
          style={{
            padding: "10px 12px", marginBottom: 12,
            borderRadius: Ri,
            background: Z.da + "12",
            border: `1px solid ${Z.da}33`,
            cursor: onOpenInvoice ? "pointer" : "default",
          }}>
          <div style={{
            fontSize: FS.micro, fontWeight: FW.heavy,
            color: Z.da, fontFamily: COND,
            textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2,
          }}>Biggest collection opportunity</div>
          <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx }}>
            {clientName(data.bigOverdue.inv)} · {fmtCurrency(data.bigOverdue.bal)} · {data.bigOverdue.daysLate} days
          </div>
        </div>
      )}

      {/* Top 3 overdue */}
      {data.topOverdue.length > 0 && (
        <div>
          <div style={{
            fontSize: FS.micro, fontWeight: FW.heavy, color: Z.tm,
            fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.5,
            marginBottom: 6,
          }}>Top overdue</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {data.topOverdue.map(({ inv, daysLate, bal }) => (
              <div
                key={inv.id}
                onClick={() => onOpenInvoice?.(inv.id)}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 10px", borderRadius: 6,
                  background: Z.sa,
                  fontSize: FS.sm, cursor: onOpenInvoice ? "pointer" : "default",
                  transition: "background 0.15s",
                }}
                onMouseOver={e => { if (onOpenInvoice) e.currentTarget.style.background = Z.bgHover || Z.sa; }}
                onMouseOut={e => { if (onOpenInvoice) e.currentTarget.style.background = Z.sa; }}
              >
                <span style={{ color: Z.tx, fontWeight: FW.semi, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {clientName(inv)}
                </span>
                <span style={{ color: Z.tm, fontFamily: COND, marginRight: 8 }}>{daysLate}d</span>
                <span style={{ color: Z.da, fontWeight: FW.bold, fontFamily: COND }}>{fmtCurrency(bal)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7-day net + uninvoiced. Uninvoiced = closed sales within ±30
          days whose invoices haven't been cut yet; amber when > 0 as
          a reminder to get them on the books. */}
      <div style={{
        marginTop: 12, paddingTop: 10,
        borderTop: `1px solid ${Z.bd}`,
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12,
        fontSize: FS.xs, color: Z.tm, fontFamily: COND,
      }}>
        <span>7-day collected: <b style={{ color: Z.go }}>{fmtCurrency(data.paid7d)}</b></span>
        <span>7-day issued: <b style={{ color: Z.tx }}>{fmtCurrency(data.issued7d)}</b></span>
        <span title="Closed sales within ±30 days that haven't been invoiced yet">
          Uninvoiced: <b style={{ color: uninvoicedContracts > 0 ? Z.wa : Z.tx }}>{fmtCurrency(uninvoicedContracts)}</b>
        </span>
      </div>
    </DashboardModule>
  );
}
