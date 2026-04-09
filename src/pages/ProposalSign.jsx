// ============================================================
// ProposalSign.jsx — Public proposal signature page
// No auth required — accessed via /sign/:access_token
// ============================================================
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

const C = {
  bg: "#F6F7F9", sf: "#FFFFFF", tx: "#0D0F14", tm: "#525E72", td: "#8994A7",
  bd: "#E2E6ED", ac: "#2563EB", go: "#16A34A", da: "#DC2626", wa: "#D97706",
};
const fmtCurrency = (n) => "$" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";

export default function ProposalSign() {
  const token = window.location.pathname.split("/sign/")[1];
  const [sig, setSig] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    if (!token) { setError("Invalid signature link."); setLoading(false); return; }
    (async () => {
      const { data: sigData, error: sigErr } = await supabase
        .from("proposal_signatures").select("*").eq("access_token", token).single();
      if (sigErr || !sigData) { setError("This signature link is invalid or has expired."); setLoading(false); return; }
      if (sigData.signed) { setSig(sigData); setSigned(true); setLoading(false); return; }
      if (sigData.expires_at && new Date(sigData.expires_at) < new Date()) { setError("This signature link has expired."); setLoading(false); return; }
      setSig(sigData);
      setSignerName(sigData.signer_name || "");
      setSignerTitle(sigData.signer_title || "");

      // Record view
      await supabase.from("proposal_signatures").update({
        viewed_at: sigData.viewed_at || new Date().toISOString(),
        view_count: (sigData.view_count || 0) + 1,
      }).eq("id", sigData.id);

      // Load proposal
      const { data: propData } = await supabase.from("proposals").select("*").eq("id", sigData.proposal_id).single();
      if (propData) setProposal(propData);
      setLoading(false);
    })();
  }, [token]);

  const handleSign = async () => {
    if (!agreed || !signerName.trim() || submitting) return;
    setSubmitting(true);
    await supabase.from("proposal_signatures").update({
      signed: true, signed_at: new Date().toISOString(),
      signer_name: signerName.trim(), signer_title: signerTitle.trim(),
      signed_ip: "", signed_user_agent: navigator.userAgent,
    }).eq("id", sig.id);
    setSigned(true);
    setSubmitting(false);
  };

  if (loading) return <div style={styles.page}><div style={styles.card}><div style={{ textAlign: "center", padding: 60, color: C.tm }}>Loading proposal...</div></div></div>;
  if (error) return <div style={styles.page}><div style={{ ...styles.card, textAlign: "center", padding: 60 }}><div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div><div style={{ fontSize: 18, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Link Not Found</div><div style={{ fontSize: 14, color: C.tm }}>{error}</div></div></div>;

  const snapshot = sig.proposal_snapshot || proposal;
  const lines = snapshot?.lines || [];
  const total = snapshot?.total || lines.reduce((s, l) => s + (l.price || l.line_total || 0), 0);

  return <div style={styles.page}>
    {/* Header */}
    <div style={styles.header}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.tx }}>13 Stars Media Group</div>
          <div style={{ fontSize: 12, color: C.tm }}>P.O. Box 427, Paso Robles, CA 93447 · (805) 237-6060</div>
        </div>
        <div style={{ fontSize: 12, color: C.tm, textAlign: "right" }}>
          <div>Advertising Proposal</div>
          <div>{fmtDate(snapshot?.date || sig.created_at)}</div>
        </div>
      </div>
    </div>

    <div style={styles.body}>
      {signed ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.tx, marginBottom: 8 }}>Proposal Signed</div>
          <div style={{ fontSize: 14, color: C.tm, lineHeight: 1.6 }}>
            Thank you for signing this proposal. Your advertising order has been confirmed.<br />
            Our team will follow up with design and scheduling details.
          </div>
          {sig.signed_at && <div style={{ marginTop: 16, fontSize: 12, color: C.td }}>Signed on {fmtDate(sig.signed_at)} by {sig.signer_name}</div>}
        </div>
      ) : <>
        {/* Proposal details */}
        <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 4 }}>Prepared for: {snapshot?.clientName || sig.signer_name || "Client"}</div>
        {snapshot?.name && <div style={{ fontSize: 13, color: C.tm, marginBottom: 16 }}>{snapshot.name}</div>}

        {/* Line items table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
          <thead>
            <tr style={{ background: "#f5f5f5" }}>
              <th style={styles.th}>Publication</th>
              <th style={styles.th}>Ad Size</th>
              <th style={styles.th}>Issue</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Rate</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${C.bd}` }}>
                <td style={styles.td}>{l.pubName || l.publication || "—"}</td>
                <td style={styles.td}>{l.adSize || l.ad_size || "—"}</td>
                <td style={styles.td}>{l.issueLabel || l.issue_label || "—"}</td>
                <td style={{ ...styles.td, textAlign: "right", fontWeight: 700 }}>{fmtCurrency(l.price || l.line_total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ ...styles.td, fontWeight: 700, fontSize: 14 }}>Total</td>
              <td style={{ ...styles.td, textAlign: "right", fontWeight: 800, fontSize: 18, color: C.tx }}>{fmtCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>

        {snapshot?.payPlan && snapshot?.termMonths > 1 && (
          <div style={{ padding: "10px 14px", background: "#f0f4ff", borderRadius: 8, marginBottom: 24, fontSize: 13, color: C.tx }}>
            Payment Plan: {snapshot.termMonths} months × {fmtCurrency(snapshot.monthly)}/month
          </div>
        )}

        {/* Signature section */}
        <div style={{ border: `2px solid ${C.bd}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.tx, marginBottom: 16 }}>Sign This Proposal</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={styles.label}>Your Name *</label>
              <input value={signerName} onChange={e => setSignerName(e.target.value)} style={styles.input} placeholder="Full name" />
            </div>
            <div>
              <label style={styles.label}>Title</label>
              <input value={signerTitle} onChange={e => setSignerTitle(e.target.value)} style={styles.input} placeholder="e.g. Marketing Director" />
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", marginBottom: 16 }}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 3, accentColor: C.ac }} />
            <span style={{ fontSize: 13, color: C.tx, lineHeight: 1.5 }}>
              I agree to the advertising placement described above and authorize 13 Stars Media Group to proceed with this order.
            </span>
          </label>
          <button onClick={handleSign} disabled={!agreed || !signerName.trim() || submitting} style={{
            width: "100%", padding: "14px 24px", borderRadius: 8, border: "none",
            fontSize: 16, fontWeight: 800, cursor: agreed && signerName.trim() ? "pointer" : "not-allowed",
            background: agreed && signerName.trim() ? C.go : "#ccc",
            color: "#fff", transition: "background 0.15s",
            opacity: submitting ? 0.6 : 1,
          }}>
            {submitting ? "Signing..." : "✓ Sign & Confirm Order"}
          </button>
        </div>
      </>}
    </div>

    <div style={styles.footer}>
      <span>© {new Date().getFullYear()} 13 Stars Media Group</span>
      <span style={{ color: C.td }}>·</span>
      <span>Powered by MyDash</span>
    </div>
  </div>;
}

const styles = {
  page: { minHeight: "100vh", background: C.bg, fontFamily: "'Inter', -apple-system, sans-serif", display: "flex", flexDirection: "column" },
  header: { padding: "24px 32px", background: C.sf, borderBottom: `1px solid ${C.bd}` },
  body: { flex: 1, maxWidth: 800, width: "100%", margin: "0 auto", padding: "32px 24px" },
  card: { maxWidth: 500, margin: "80px auto", background: C.sf, borderRadius: 12, border: `1px solid ${C.bd}`, overflow: "hidden" },
  footer: { padding: "16px 28px", textAlign: "center", fontSize: 11, color: C.tm, borderTop: `1px solid ${C.bd}`, display: "flex", justifyContent: "center", gap: 8 },
  th: { padding: "8px 12px", textAlign: "left", fontSize: 11, textTransform: "uppercase", color: "#666", fontWeight: 700 },
  td: { padding: "8px 12px", fontSize: 13, color: C.tx },
  label: { display: "block", fontSize: 11, fontWeight: 700, color: C.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  input: { width: "100%", padding: "10px 12px", borderRadius: 6, border: `1px solid ${C.bd}`, fontSize: 14, color: C.tx, outline: "none", boxSizing: "border-box", fontFamily: "inherit" },
};
