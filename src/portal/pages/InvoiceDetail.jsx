// /c/<slug>/invoices/<id> — single invoice (read-only v1).
// Spec §5.8 detail page. Stripe payment integration is v2.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { usePortal } from "../lib/portalContext";
import { C } from "../lib/portalUi";
import { fmtCurrency, fmtDate } from "../lib/format";
import { InvoiceBadge } from "../components/StatusBadge";

export default function InvoiceDetail() {
  const { slug, id } = useParams();
  const { activeClient } = usePortal();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!activeClient?.clientId || !id) return;
    let cancelled = false;
    (async () => {
      const { data: inv, error: e } = await supabase
        .from("invoices")
        .select(`
          id, invoice_number, status, total, subtotal, tax_rate, tax_amount,
          balance_due, monthly_amount, plan_months,
          issue_date, due_date, created_at, notes
        `)
        .eq("id", id)
        .eq("client_id", activeClient.clientId)
        .maybeSingle();
      if (cancelled) return;
      if (e || !inv) { setError(e?.message || "Invoice not found."); return; }
      setData(inv);
    })();
    return () => { cancelled = true; };
  }, [activeClient?.clientId, id]);

  if (error) {
    return (
      <div>
        <Link to={`/c/${slug}/invoices`} style={{ color: C.muted, fontSize: 13, textDecoration: "none" }}>← Invoices</Link>
        <div style={{
          marginTop: 12, padding: 16, background: "#FEF2F2",
          border: "1px solid #FECACA", borderRadius: 8,
          color: C.err, fontSize: 13,
        }}>{error}</div>
      </div>
    );
  }
  if (!data) return <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>;
  const owed = Number(data.balance_due ?? data.total ?? 0);

  return (
    <div>
      <Link to={`/c/${slug}/invoices`} style={{ color: C.muted, fontSize: 13, textDecoration: "none" }}>
        ← Invoices
      </Link>

      <div style={{
        background: "#fff", border: `1px solid ${C.rule}`,
        borderRadius: 8, marginTop: 12, overflow: "hidden",
      }}>
        <div style={{ padding: 16, borderBottom: `1px solid ${C.rule}` }}>
          <InvoiceBadge value={data.status} />
          <h1 style={{ fontSize: 18, fontWeight: 800, marginTop: 8, marginBottom: 4 }}>
            {data.invoice_number || `Invoice #${data.id.slice(0, 8)}`}
          </h1>
          <div style={{ fontSize: 12, color: C.muted }}>
            Issued {fmtDate(data.issue_date)}
            {data.due_date && <> · Due {fmtDate(data.due_date)}</>}
          </div>
        </div>

        <div style={{ padding: 16 }}>
          <Row label="Subtotal" value={fmtCurrency(data.subtotal || 0)} />
          {Number(data.tax_amount) > 0 && (
            <Row label={`Tax${data.tax_rate ? ` (${data.tax_rate}%)` : ""}`} value={fmtCurrency(data.tax_amount)} />
          )}
          <div style={{ height: 1, background: C.rule, margin: "8px 0" }} />
          <Row label={<strong>Total</strong>} value={<strong>{fmtCurrency(data.total)}</strong>} />
          {owed >= 0 && Number(owed) !== Number(data.total) && (
            <Row label="Balance due" value={<span style={{ color: owed > 0 ? C.warn : C.ok }}>{fmtCurrency(owed)}</span>} />
          )}
          {data.monthly_amount && (
            <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
              Payment plan: {fmtCurrency(data.monthly_amount)}/mo × {data.plan_months || "—"} months
            </div>
          )}
        </div>

        {data.notes && (
          <div style={{ padding: 16, borderTop: `1px solid ${C.rule}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.cap, letterSpacing: 1, marginBottom: 8 }}>NOTES</div>
            <div style={{ fontSize: 13, color: C.ink, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{data.notes}</div>
          </div>
        )}

        <div style={{ padding: 16, borderTop: `1px solid ${C.rule}`, fontSize: 12, color: C.muted }}>
          To pay this invoice, reach out to your sales rep. Online payment lands in v2.
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ color: C.ink }}>{value}</span>
    </div>
  );
}
