// ============================================================
// PayInvoice.jsx — Public invoice payment page
// Route: /pay/{invoice_number}
// Looks up invoice, shows summary, redirects to Stripe checkout
// ============================================================
import { useState, useEffect } from "react";
import { supabase, EDGE_FN_URL } from "../lib/supabase";

const NAVY = "#1A365D";
const RED = "#C53030";
const GREEN = "#16A34A";
const BLACK = "#111111";
const GRAY = "#6B7280";
const GRAY_LT = "#9CA3AF";
const BG = "#F7F8FA";
const WHITE = "#FFFFFF";
const BORDER = "#E5E7EB";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const fmtCurrency = (n) => "$" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";

export default function PayInvoice() {
  const [invoice, setInvoice] = useState(null);
  const [client, setClient] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);

  const invoiceNumber = window.location.pathname.split("/pay/")[1]?.replace(/\/$/, "") || "";

  useEffect(() => {
    if (!invoiceNumber) { setError("No invoice number provided"); setLoading(false); return; }
    (async () => {
      // Look up invoice by number
      const { data: inv } = await supabase.from("invoices").select("*").eq("invoice_number", invoiceNumber).single();
      if (!inv) { setError("Invoice not found"); setLoading(false); return; }

      setInvoice(inv);

      // Get client name
      const { data: cl } = await supabase.from("clients").select("name").eq("id", inv.client_id).single();
      setClient(cl);

      // Get line items
      const { data: li } = await supabase.from("invoice_lines").select("description, quantity, unit_price, total").eq("invoice_id", inv.id);
      setLines(li || []);

      setLoading(false);
    })();
  }, [invoiceNumber]);

  const handlePay = async () => {
    if (!invoice || paying) return;
    setPaying(true);

    try {
      const res = await fetch(`${EDGE_FN_URL}/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          amount: Number(invoice.balance_due || invoice.total),
          client_name: client?.name || "",
          client_id: invoice.client_id,
          mode: "invoice_payment",
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Failed to create payment session");
        setPaying(false);
      }
    } catch (err) {
      setError(err.message);
      setPaying(false);
    }
  };

  if (loading) return <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS }}><div style={{ color: GRAY }}>Loading invoice...</div></div>;

  if (error) return <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS }}>
    <div style={{ background: WHITE, borderRadius: 12, padding: 40, maxWidth: 420, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>&#128464;</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: BLACK, marginBottom: 8 }}>Invoice Not Found</div>
      <div style={{ fontSize: 14, color: GRAY }}>{error}</div>
    </div>
  </div>;

  const isPaid = invoice.status === "paid" || Number(invoice.balance_due) <= 0;
  const isVoid = invoice.status === "void";

  return <div style={{ minHeight: "100vh", background: BG, fontFamily: SANS }}>
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 20px" }}>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontFamily: SERIF, fontSize: 24, color: NAVY }}>13 Stars Media Group</div>
        <div style={{ fontSize: 11, color: GRAY_LT, textTransform: "uppercase", letterSpacing: 1.5, marginTop: 4 }}>Invoice Payment</div>
      </div>

      {/* Invoice Card */}
      <div style={{ background: WHITE, borderRadius: 12, border: `1px solid ${BORDER}`, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>

        {/* Invoice header */}
        <div style={{ padding: "24px 28px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 11, color: GRAY_LT, textTransform: "uppercase" }}>Invoice</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: BLACK, marginTop: 2 }}>{invoice.invoice_number}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              {isPaid && <span style={{ padding: "4px 12px", borderRadius: 4, background: GREEN + "15", color: GREEN, fontSize: 12, fontWeight: 700 }}>PAID</span>}
              {isVoid && <span style={{ padding: "4px 12px", borderRadius: 4, background: GRAY_LT + "20", color: GRAY, fontSize: 12, fontWeight: 700 }}>VOID</span>}
              {!isPaid && !isVoid && <span style={{ padding: "4px 12px", borderRadius: 4, background: RED + "10", color: RED, fontSize: 12, fontWeight: 700 }}>UNPAID</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 24, marginTop: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: GRAY_LT }}>Bill To</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: BLACK, marginTop: 2 }}>{client?.name || ""}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: GRAY_LT }}>Issue Date</div>
              <div style={{ fontSize: 13, color: BLACK, marginTop: 2 }}>{fmtDate(invoice.issue_date)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: GRAY_LT }}>Due Date</div>
              <div style={{ fontSize: 13, color: BLACK, marginTop: 2 }}>{fmtDate(invoice.due_date)}</div>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div style={{ padding: "0 28px" }}>
          {lines.map((l, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: i < lines.length - 1 ? `1px solid ${BORDER}15` : "none" }}>
            <span style={{ fontSize: 14, color: BLACK }}>{l.description || "Ad placement"}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: BLACK }}>{fmtCurrency(Number(l.total || l.unit_price))}</span>
          </div>)}
        </div>

        {/* Total */}
        <div style={{ padding: "16px 28px", borderTop: `2px solid ${NAVY}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: BLACK }}>Amount Due</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: isPaid ? GREEN : NAVY }}>{fmtCurrency(Number(invoice.balance_due || invoice.total))}</span>
        </div>

        {/* Pay Button */}
        {!isPaid && !isVoid && <div style={{ padding: "20px 28px", textAlign: "center" }}>
          <button onClick={handlePay} disabled={paying} style={{ width: "100%", padding: "14px 24px", background: GREEN, color: WHITE, fontSize: 16, fontWeight: 700, border: "none", borderRadius: 6, cursor: paying ? "wait" : "pointer", opacity: paying ? 0.7 : 1, fontFamily: SANS }}>{paying ? "Redirecting to payment..." : "Pay Now"}</button>
        </div>}

        {isPaid && <div style={{ padding: "20px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 14, color: GREEN, fontWeight: 600 }}>This invoice has been paid. Thank you!</div>
        </div>}
      </div>

      {/* Manual payment options */}
      {!isPaid && !isVoid && <div style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: GRAY_LT, lineHeight: 1.7 }}>
        <strong style={{ color: GRAY }}>Other payment options:</strong><br />
        Mail check to: 13 Stars Media Group, P.O. Box 427, Paso Robles, CA 93447<br />
        Phone: (805) 237-6060 · Email: <a href="mailto:billing@13stars.media" style={{ color: NAVY }}>billing@13stars.media</a>
      </div>}

      {/* Portal link */}
      <div style={{ textAlign: "center", marginTop: 24 }}>
        <a href="/portal" style={{ fontSize: 13, color: NAVY, textDecoration: "underline" }}>View all invoices & contracts →</a>
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", marginTop: 32, fontSize: 11, color: GRAY_LT }}>
        13 Stars Media Group · P.O. Box 427, Paso Robles, CA 93447 · (805) 237-6060
      </div>
    </div>
  </div>;
}
