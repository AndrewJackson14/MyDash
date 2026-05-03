// /c/<slug>/invoices — list. Spec §5.8.
//
// Filter chips: Open / Overdue / Paid (12-month window) / All.
// Pagination: 25 per page; production has 39k invoices total so any
// individual client could plausibly have hundreds.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { usePortal } from "../lib/portalContext";
import { C } from "../lib/portalUi";
import { fmtCurrency, fmtDate } from "../lib/format";
import { InvoiceBadge } from "../components/StatusBadge";

const PAGE = 25;

const FILTERS = [
  { key: "open",     label: "Open",     statuses: ["sent", "partially_paid", "overdue"] },
  { key: "overdue",  label: "Overdue",  statuses: ["overdue"] },
  { key: "paid",     label: "Paid (12mo)", statuses: ["paid"], paidWindow: true },
  { key: "all",      label: "All",      statuses: null },
];

export default function InvoicesList() {
  const { slug } = useParams();
  const { activeClient } = usePortal();
  const [filter, setFilter] = useState("open");
  const [items, setItems] = useState(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ open: 0, overdue: 0 });

  useEffect(() => {
    if (!activeClient?.clientId) return;
    let cancelled = false;
    setItems(null);
    (async () => {
      const cid = activeClient.clientId;
      let q = supabase
        .from("invoices")
        .select("id, invoice_number, status, total, balance_due, issue_date, due_date", { count: "exact" })
        .eq("client_id", cid)
        .order("issue_date", { ascending: false, nullsFirst: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      const f = FILTERS.find((x) => x.key === filter);
      if (f?.statuses) q = q.in("status", f.statuses);
      if (f?.paidWindow) {
        const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 12);
        q = q.gte("issue_date", cutoff.toISOString().slice(0, 10));
      }
      const { data, error, count } = await q;
      if (cancelled) return;
      if (!error) {
        setItems(data || []);
        setTotal(count || 0);
      }
    })();
    return () => { cancelled = true; };
  }, [activeClient?.clientId, filter, page]);

  // Summary totals (open + overdue) — single round-trip alongside the page
  useEffect(() => {
    if (!activeClient?.clientId) return;
    let cancelled = false;
    (async () => {
      const cid = activeClient.clientId;
      const { data } = await supabase
        .from("invoices")
        .select("status, balance_due, total")
        .eq("client_id", cid)
        .in("status", ["sent", "partially_paid", "overdue"]);
      if (cancelled || !data) return;
      let open = 0, overdue = 0;
      data.forEach((i) => {
        const owed = Number(i.balance_due ?? i.total ?? 0);
        open += owed;
        if (i.status === "overdue") overdue += owed;
      });
      setSummary({ open, overdue });
    })();
    return () => { cancelled = true; };
  }, [activeClient?.clientId]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Your invoices</h1>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <SummaryTile label="Open balance" value={fmtCurrency(summary.open)} accent={summary.open > 0 ? C.warn : C.muted} />
        <SummaryTile label="Overdue"      value={fmtCurrency(summary.overdue)} accent={summary.overdue > 0 ? C.err : C.muted} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button key={f.key}
            onClick={() => { setFilter(f.key); setPage(0); }}
            style={chipStyle(filter === f.key)}
          >{f.label}</button>
        ))}
      </div>

      {items === null ? (
        <div style={{ color: C.muted, fontSize: 13, padding: 16 }}>Loading…</div>
      ) : items.length === 0 ? (
        <Empty hint="No invoices match this filter." />
      ) : (
        <>
          <div style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 8, overflow: "hidden" }}>
            {items.map((inv, i) => (
              <Link to={`/c/${slug}/invoices/${inv.id}`} key={inv.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 14px",
                borderTop: i === 0 ? "none" : `1px solid ${C.rule}`,
                textDecoration: "none", color: "inherit",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 2 }}>
                    {inv.invoice_number || `#${inv.id.slice(0, 8)}`}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    {fmtDate(inv.issue_date)}{inv.due_date ? ` · due ${fmtDate(inv.due_date)}` : ""}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  <InvoiceBadge value={inv.status} />
                </div>
                <div style={{ width: 90, textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{fmtCurrency(inv.total)}</div>
                  {inv.balance_due > 0 && Number(inv.balance_due) !== Number(inv.total) && (
                    <div style={{ fontSize: 11, color: C.warn, marginTop: 2 }}>
                      Owed {fmtCurrency(inv.balance_due)}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 16, fontSize: 13 }}>
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                style={pagerBtn(page === 0)}>← Prev</button>
              <span style={{ color: C.muted }}>Page {page + 1} of {totalPages} · {total} invoices</span>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page + 1 >= totalPages}
                style={pagerBtn(page + 1 >= totalPages)}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value, accent }) {
  return (
    <div style={{
      flex: "1 1 180px",
      background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 8,
      padding: 12,
    }}>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent }}>{value}</div>
    </div>
  );
}

function Empty({ hint }) {
  return (
    <div style={{
      padding: "32px 16px", textAlign: "center",
      background: "#fff", border: `1px dashed ${C.rule}`,
      borderRadius: 8, color: C.muted, fontSize: 13,
    }}>{hint}</div>
  );
}

const chipStyle = (active) => ({
  fontSize: 12, fontWeight: 600,
  padding: "6px 12px", borderRadius: 999,
  border: `1px solid ${active ? C.ac : C.rule}`,
  background: active ? C.ac : "#fff",
  color: active ? "#fff" : C.muted,
  cursor: "pointer", fontFamily: "inherit",
});
const pagerBtn = (disabled) => ({
  fontSize: 12, fontWeight: 600,
  padding: "6px 12px", borderRadius: 6,
  border: `1px solid ${C.rule}`,
  background: "#fff", color: disabled ? C.cap : C.ink,
  cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit",
});
