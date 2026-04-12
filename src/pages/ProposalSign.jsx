// ============================================================
// ProposalSign.jsx — Public proposal signature page
// No auth required — accessed via /sign/:access_token
// ============================================================
import { useState, useEffect } from "react";
import { supabase, EDGE_FN_URL } from "../lib/supabase";
import { generateProposalHtml, DEFAULT_PROPOSAL_CONFIG } from "../lib/proposalTemplate";
import { generateContractHtml } from "../lib/contractTemplate";
import DOMPurify from "dompurify";
import { fmtCurrencyWhole as fmtCurrency, fmtDateLong as fmtDate } from "../lib/formatters";

const C = {
  bg: "#F6F7F9", sf: "#FFFFFF", tx: "#0D0F14", tm: "#525E72", td: "#8994A7",
  bd: "#E2E6ED", ac: "#2563EB", go: "#16A34A", da: "#DC2626", wa: "#D97706",
};

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
  const [templateConfig, setTemplateConfig] = useState(null);

  // Load template config on mount
  useEffect(() => {
    supabase.from("email_templates").select("config")
      .eq("category", "proposal").eq("is_default", true).limit(1)
      .then(({ data }) => setTemplateConfig(data?.[0]?.config || DEFAULT_PROPOSAL_CONFIG));
  }, []);

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

      // Record view (anon can update proposal_signatures)
      supabase.from("proposal_signatures").update({
        viewed_at: sigData.viewed_at || new Date().toISOString(),
        view_count: (sigData.view_count || 0) + 1,
      }).eq("id", sigData.id).then(() => {});

      // Proposal data comes from the snapshot — no need to query proposals table
      setLoading(false);
    })();
  }, [token]);

  const handleSign = async () => {
    if (!agreed || !signerName.trim() || submitting) return;
    setSubmitting(true);

    // 1. Record the signature
    await supabase.from("proposal_signatures").update({
      signed: true, signed_at: new Date().toISOString(),
      signer_name: signerName.trim(), signer_title: signerTitle.trim(),
      signed_ip: "", signed_user_agent: navigator.userAgent,
    }).eq("id", sig.id);

    // 2. Mark proposal signed_at (status will be set by the RPC)
    await supabase.from("proposals").update({
      signed_at: new Date().toISOString(),
    }).eq("id", sig.proposal_id);

    // 3. Auto-convert to contract + create sales orders
    const { data: convResult, error: convError } = await supabase.rpc("convert_proposal_to_contract", {
      p_proposal_id: sig.proposal_id,
    });
    if (convError) console.error("RPC error:", convError);
    if (convResult?.error) console.warn("Conversion skipped:", convResult.error);

    // 4. Create a notification for the salesperson
    const snapshot = sig.proposal_snapshot || {};
    await supabase.from("notifications").insert({
      title: `${signerName.trim()} signed "${snapshot.name || "Proposal"}"${convResult?.success ? " — contract created" : ""}`,
      type: "system",
      link: "/sales?tab=Closed",
    });

    // 5. Send contract confirmation email via edge function (no JWT needed — function uses service role)
    try {
      const contractHtml = generateContractHtml({
        proposal: snapshot,
        signature: { signerName: signerName.trim(), signerTitle: signerTitle.trim(), signedAt: new Date().toISOString() },
        salesperson: {},
        pubs: [],
      });
      await fetch(`${EDGE_FN_URL}/contract-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature_id: sig.id,
          html_body: contractHtml,
          subject: `Contract Confirmed — ${snapshot.name || snapshot.clientName || ""}`,
          to_email: sig.signer_email || "",
        }),
      });
    } catch (emailErr) {
      console.error("Contract email error:", emailErr);
    }

    setSigned(true);
    setSubmitting(false);
  };

  if (loading) return <div style={styles.page}><div style={styles.card}><div style={{ textAlign: "center", padding: 60, color: C.tm }}>Loading proposal...</div></div></div>;
  if (error) return <div style={styles.page}><div style={{ ...styles.card, textAlign: "center", padding: 60 }}><div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div><div style={{ fontSize: 18, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Link Not Found</div><div style={{ fontSize: 14, color: C.tm }}>{error}</div></div></div>;

  const snapshot = sig?.proposal_snapshot || proposal;

  // Generate proposal HTML (without sign button — we render our own form below)
  const dealPayTiming = snapshot?.payTiming || "per_issue";
  const proposalHtml = templateConfig ? generateProposalHtml({
    config: { ...(templateConfig || DEFAULT_PROPOSAL_CONFIG), signButtonText: "", paymentTiming: dealPayTiming },
    proposal: snapshot || {},
    client: { name: snapshot?.clientName, contacts: [{ name: sig.signer_name, email: sig.signer_email }] },
    salesperson: {},
    pubs: [],
    forPdf: false,
    signLink: "", // No sign button in the rendered HTML — we show our own form
  }) : "";

  return <div style={styles.page}>
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
          <button onClick={() => {
            const contractHtml = generateContractHtml({
              proposal: snapshot || {}, signature: { signerName: sig.signer_name, signerTitle: sig.signer_title, signedAt: sig.signed_at },
              salesperson: {}, pubs: [], config: templateConfig,
            });
            const w = window.open("", "_blank");
            w.document.write(contractHtml);
            w.document.close();
            setTimeout(() => w.print(), 500);
          }} style={{ marginTop: 20, padding: "10px 24px", border: `1px solid ${C.bd}`, borderRadius: 6, background: C.sf, cursor: "pointer", fontSize: 13, fontWeight: 700, color: C.tx, fontFamily: "inherit" }}>
            Download Contract PDF
          </button>
        </div>
      ) : <>
        {/* Rendered proposal from template */}
        <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(proposalHtml) }} style={{ marginBottom: 32 }} />

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
