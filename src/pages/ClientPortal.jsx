// ============================================================
// ClientPortal.jsx — Client-facing portal (magic link auth)
// Clients view contracts, invoices, payments, upload assets
// ============================================================
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { fmtCurrency, fmtDate } from "../lib/formatters";

const NAVY = "#1A365D";
const RED = "#C53030";
const GREEN = "#16A34A";
const BLACK = "#111111";
const GRAY = "#6B7280";
const GRAY_LT = "#9CA3AF";
const BG = "#F7F8FA";
const WHITE = "#FFFFFF";
const BORDER = "#E5E7EB";
const ACCENT = "#2563EB";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const s = {
  page: { minHeight: "100vh", background: BG, fontFamily: SANS },
  container: { maxWidth: 900, margin: "0 auto", padding: "40px 24px" },
  header: { background: NAVY, padding: "24px 32px", marginBottom: 32, borderRadius: 8 },
  headerTitle: { fontFamily: SERIF, fontSize: 22, color: WHITE, fontWeight: "normal", margin: 0 },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4 },
  card: { background: WHITE, borderRadius: 8, border: `1px solid ${BORDER}`, padding: 24, marginBottom: 16 },
  cardTitle: { fontSize: 14, fontWeight: 700, color: NAVY, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  tab: (active) => ({ padding: "8px 16px", border: "none", background: active ? NAVY : "transparent", color: active ? WHITE : GRAY, fontWeight: 600, fontSize: 13, cursor: "pointer", borderRadius: 4, fontFamily: SANS }),
  badge: (color) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 3, fontSize: 11, fontWeight: 700, background: color + "15", color }),
  btn: { display: "inline-block", padding: "10px 24px", background: GREEN, color: WHITE, fontSize: 14, fontWeight: 700, border: "none", borderRadius: 4, cursor: "pointer", textDecoration: "none", fontFamily: SANS },
  btnSecondary: { display: "inline-block", padding: "8px 20px", background: WHITE, color: NAVY, fontSize: 13, fontWeight: 600, border: `1px solid ${BORDER}`, borderRadius: 4, cursor: "pointer", textDecoration: "none", fontFamily: SANS },
  loginCard: { maxWidth: 420, margin: "80px auto", background: WHITE, borderRadius: 12, padding: 40, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" },
};

// ─── Login Page ────────────────────────────────────────
function PortalLogin({ onAuth }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");

    // Send magic link — account validation happens after login on the dashboard
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + "/portal" },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  };

  if (sent) {
    return <div style={s.page}>
      <div style={s.loginCard}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>&#9993;</div>
        <h2 style={{ fontFamily: SERIF, color: NAVY, margin: "0 0 8px" }}>Check your email</h2>
        <p style={{ color: GRAY, fontSize: 14, lineHeight: 1.6 }}>
          We sent a login link to <strong>{email}</strong>. Click the link in the email to access your account.
        </p>
        <button onClick={() => setSent(false)} style={{ ...s.btnSecondary, marginTop: 16 }}>Use a different email</button>
      </div>
    </div>;
  }

  return <div style={s.page}>
    <div style={s.loginCard}>
      <div style={{ fontFamily: SERIF, fontSize: 22, color: NAVY, marginBottom: 4 }}>13 Stars Media Group</div>
      <div style={{ fontSize: 12, color: GRAY_LT, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 24 }}>Client Portal</div>
      <form onSubmit={handleSubmit}>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your email address" autoFocus style={{ width: "100%", padding: "12px 16px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: SANS, marginBottom: 12 }} />
        {error && <div style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <button type="submit" disabled={loading} style={{ ...s.btn, width: "100%", opacity: loading ? 0.7 : 1 }}>{loading ? "Sending..." : "Send Login Link"}</button>
      </form>
      <p style={{ color: GRAY_LT, fontSize: 12, marginTop: 20, lineHeight: 1.5 }}>
        A magic link will be sent to your email. No password needed.
      </p>
    </div>
  </div>;
}

// ─── Portal Dashboard ──────────────────────────────────
function PortalDashboard({ user }) {
  const [tab, setTab] = useState("invoices");
  const [clientData, setClientData] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      // Find client(s) linked to this email
      const { data: contacts } = await supabase.from("client_contacts").select("client_id, name, role").eq("email", user.email);
      if (!contacts?.length) { setLoading(false); return; }

      const clientIds = [...new Set(contacts.map(c => c.client_id))];

      // Load client info (include card details)
      const { data: clients } = await supabase.from("clients").select("id, name, client_code, status, card_last4, card_brand, card_exp, stripe_customer_id").in("id", clientIds);
      setClientData(clients || []);

      // Load invoices
      const { data: invs } = await supabase.from("invoices").select("id, invoice_number, client_id, status, issue_date, due_date, total, balance_due, created_at").in("client_id", clientIds).order("created_at", { ascending: false });
      setInvoices(invs || []);

      // Load contracts
      const { data: cons } = await supabase.from("contracts").select("id, name, client_id, status, start_date, end_date, total_value, total_paid, payment_terms").in("client_id", clientIds).order("start_date", { ascending: false });
      setContracts(cons || []);

      // Load payments
      const { data: pays } = await supabase.from("payments").select("id, invoice_id, amount, payment_date, method, reference").in("invoice_id", (invs || []).map(i => i.id)).order("payment_date", { ascending: false });
      setPayments(pays || []);

      setLoading(false);
    })();
  }, [user?.email]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  if (loading) return <div style={s.page}><div style={s.container}><div style={{ textAlign: "center", padding: 60, color: GRAY }}>Loading your account...</div></div></div>;
  if (!clientData?.length) return <div style={s.page}><div style={s.container}><div style={{ textAlign: "center", padding: 60, color: GRAY }}>No account found for {user.email}. Contact your sales rep.</div></div></div>;

  const clientName = clientData[0]?.name || "";
  const statusColors = { draft: GRAY, sent: ACCENT, overdue: RED, paid: GREEN, void: GRAY_LT, partially_paid: "#D97706" };

  const unpaidTotal = invoices.filter(i => i.status !== "paid" && i.status !== "void").reduce((sum, i) => sum + Number(i.balance_due || 0), 0);
  const paidTotal = invoices.filter(i => i.status === "paid").reduce((sum, i) => sum + Number(i.total || 0), 0);
  const activeContracts = contracts.filter(c => c.status === "active").length;

  const unpaidInvoices = invoices.filter(i => i.status !== "paid" && i.status !== "void" && Number(i.balance_due) > 0);
  const paidInvoices = invoices.filter(i => i.status === "paid" || Number(i.balance_due) <= 0);

  return <div style={s.page}>
    <style>{`@media(max-width:640px){.portal-stats{grid-template-columns:1fr!important}.portal-inv-row{grid-template-columns:1fr auto!important}}`}</style>
    {/* HEADER */}
    <div style={s.header}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 900, margin: "0 auto", padding: "0 8px" }}>
        <div>
          <h1 style={s.headerTitle}>13 Stars Media Group</h1>
          <div style={s.headerSub}>Client Portal · {clientName}</div>
        </div>
        <button onClick={handleSignOut} style={{ ...s.btnSecondary, background: "transparent", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.3)", fontSize: 12, padding: "6px 14px" }}>Sign Out</button>
      </div>
    </div>

    <div style={s.container}>
      {/* STATS */}
      <div className="portal-stats" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        <div style={s.card}>
          <div style={{ fontSize: 11, color: GRAY_LT, textTransform: "uppercase", letterSpacing: 0.5 }}>Outstanding</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: unpaidTotal > 0 ? RED : GREEN, marginTop: 4 }}>{fmtCurrency(unpaidTotal)}</div>
        </div>
        <div style={s.card}>
          <div style={{ fontSize: 11, color: GRAY_LT, textTransform: "uppercase", letterSpacing: 0.5 }}>Paid</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: GREEN, marginTop: 4 }}>{fmtCurrency(paidTotal)}</div>
        </div>
        <div style={s.card}>
          <div style={{ fontSize: 11, color: GRAY_LT, textTransform: "uppercase", letterSpacing: 0.5 }}>Active Contracts</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: NAVY, marginTop: 4 }}>{activeContracts}</div>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {["invoices", "contracts", "payments", "payment method"].map(t => <button key={t} onClick={() => setTab(t)} style={s.tab(tab === t)}>{t.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}</button>)}
      </div>

      {/* INVOICES TAB — card-based for mobile */}
      {tab === "invoices" && <>
        {unpaidInvoices.length > 0 && <div style={s.card}>
          <div style={s.cardTitle}>Unpaid Invoices</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {unpaidInvoices.map(inv => <div key={inv.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: 14 }}>
              <div className="portal-inv-row" style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, color: BLACK, fontSize: 14 }}>{inv.invoice_number}</div>
                  <div style={{ fontSize: 12, color: GRAY, marginTop: 2 }}>Issued {fmtDate(inv.issue_date)} · Due {fmtDate(inv.due_date)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: RED }}>{fmtCurrency(Number(inv.balance_due))}</div>
                </div>
                <a href={`/pay/${inv.invoice_number}`} style={{ ...s.btn, padding: "8px 18px", fontSize: 13, textDecoration: "none", whiteSpace: "nowrap" }}>Pay Now</a>
              </div>
            </div>)}
          </div>
        </div>}

        {paidInvoices.length > 0 && <div style={{ ...s.card, marginTop: unpaidInvoices.length > 0 ? 0 : undefined }}>
          <div style={s.cardTitle}>Paid</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {paidInvoices.map(inv => <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${BORDER}15` }}>
              <div>
                <span style={{ fontWeight: 600, color: BLACK, fontSize: 13 }}>{inv.invoice_number}</span>
                <span style={{ color: GRAY, fontSize: 12, marginLeft: 8 }}>{fmtDate(inv.issue_date)}</span>
              </div>
              <div style={{ fontWeight: 600, color: GREEN, fontSize: 13 }}>{fmtCurrency(Number(inv.total))}</div>
            </div>)}
          </div>
        </div>}

        {invoices.length === 0 && <div style={s.card}><div style={{ color: GRAY, padding: 16, textAlign: "center" }}>No invoices yet</div></div>}

        {unpaidTotal > 0 && <div style={{ ...s.card, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: GRAY, marginBottom: 4 }}>Total outstanding: <strong style={{ color: RED }}>{fmtCurrency(unpaidTotal)}</strong></div>
          <div style={{ fontSize: 12, color: GRAY_LT, marginTop: 8, lineHeight: 1.7 }}>
            <strong>Mail check to:</strong> 13 Stars Media Group, P.O. Box 427, Paso Robles, CA 93447<br />
            <strong>Phone:</strong> (805) 237-6060 · <strong>Email:</strong> <a href="mailto:billing@13stars.media" style={{ color: NAVY }}>billing@13stars.media</a>
          </div>
        </div>}
      </>}

      {/* CONTRACTS TAB — card-based */}
      {tab === "contracts" && <div style={s.card}>
        <div style={s.cardTitle}>Contracts</div>
        {contracts.length === 0 ? <div style={{ color: GRAY, padding: 16, textAlign: "center" }}>No contracts yet</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {contracts.map(c => <div key={c.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 6, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, color: BLACK, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: GRAY, marginTop: 2 }}>{fmtDate(c.start_date)} \u2192 {fmtDate(c.end_date)} · {(c.payment_terms || "").replace("_", " ")}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: BLACK }}>{fmtCurrency(Number(c.total_value))}</div>
                <span style={s.badge(c.status === "active" ? GREEN : c.status === "cancelled" ? RED : GRAY)}>{c.status}</span>
              </div>
            </div>
          </div>)}
        </div>}
      </div>}

      {/* PAYMENTS TAB — card-based */}
      {tab === "payments" && <div style={s.card}>
        <div style={s.cardTitle}>Payment History</div>
        {payments.length === 0 ? <div style={{ color: GRAY, padding: 16, textAlign: "center" }}>No payments recorded</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {payments.map(p => {
            const inv = invoices.find(i => i.id === p.invoice_id);
            return <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${BORDER}15`, flexWrap: "wrap", gap: 4 }}>
              <div>
                <div style={{ fontWeight: 600, color: BLACK, fontSize: 13 }}>{fmtDate(p.payment_date)}</div>
                <div style={{ fontSize: 12, color: GRAY }}>{inv?.invoice_number || "\u2014"} · {p.method || "Payment"}{p.reference ? ` · ${p.reference}` : ""}</div>
              </div>
              <div style={{ fontWeight: 700, color: GREEN, fontSize: 15 }}>{fmtCurrency(Number(p.amount))}</div>
            </div>;
          })}
        </div>}
      </div>}

      {/* PAYMENT METHOD TAB */}
      {tab === "payment method" && <div style={s.card}>
        <div style={s.cardTitle}>Payment Method</div>
        {(() => {
          const cl = clientData?.[0];
          if (!cl) return null;
          const hasCard = cl.card_last4;
          return <div>
            {hasCard ? <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 0" }}>
              <div style={{ width: 56, height: 36, borderRadius: 4, background: BORDER, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: GRAY, textTransform: "uppercase" }}>{cl.card_brand || "Card"}</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: BLACK }}>•••• •••• •••• {cl.card_last4}</div>
                <div style={{ fontSize: 12, color: GRAY }}>Expires {cl.card_exp}</div>
              </div>
            </div> : <div style={{ padding: 16, color: GRAY, textAlign: "center" }}>No card on file</div>}
            <div style={{ marginTop: 16, fontSize: 12, color: GRAY_LT }}>
              To update your payment method, please contact <a href="mailto:billing@13stars.media" style={{ color: NAVY }}>billing@13stars.media</a> or call (805) 237-6060.
            </div>
          </div>;
        })()}
      </div>}

      {/* FOOTER */}
      <div style={{ textAlign: "center", padding: "24px 0", color: GRAY_LT, fontSize: 11, lineHeight: 1.6 }}>
        13 Stars Media Group · P.O. Box 427, Paso Robles, CA 93447<br />
        (805) 237-6060 · <a href="mailto:billing@13stars.media" style={{ color: GRAY_LT }}>billing@13stars.media</a>
      </div>
    </div>
  </div>;
}

// ─── Main Portal Component ─────────────────────────────
export default function ClientPortal() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      setLoading(false);
    });

    // Listen for auth changes (magic link callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setUser(session.user);
        setLoading(false);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div style={s.page}><div style={{ textAlign: "center", padding: 80, color: GRAY }}>Loading...</div></div>;
  if (!user) return <PortalLogin />;
  return <PortalDashboard user={user} />;
}
