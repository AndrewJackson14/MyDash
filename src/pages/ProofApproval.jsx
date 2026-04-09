// ============================================================
// ProofApproval.jsx — Public client proof review page
// No auth required — accessed via /approve/:access_token
// ============================================================
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";

const CDN_BASE = "https://cdn.13stars.media";
const PROXY_URL = "https://hqywacyhpllapdwccmaw.supabase.co/functions/v1/bunny-storage";

// ─── Minimal standalone theme (no auth dependency) ──────────
const C = {
  bg: "#F6F7F9", sf: "#FFFFFF", tx: "#0D0F14", tm: "#525E72", td: "#8994A7",
  bd: "#E2E6ED", ac: "#2563EB", go: "#16A34A", da: "#DC2626", wa: "#D97706",
  sa: "#F1F3F6", pu: "#7C3AED",
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";

export default function ProofApproval() {
  const token = window.location.pathname.split("/approve/")[1];

  const [proof, setProof] = useState(null);
  const [project, setProject] = useState(null);
  const [allProofs, setAllProofs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [activeAnnotation, setActiveAnnotation] = useState(null);
  const [annotationText, setAnnotationText] = useState("");
  const [feedback, setFeedback] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  const imgRef = useRef(null);
  const containerRef = useRef(null);

  // ─── Load proof by token ──────────────────────────────
  useEffect(() => {
    if (!token) { setError("Invalid approval link."); setLoading(false); return; }

    (async () => {
      const { data: proofData, error: proofErr } = await supabase
        .from("ad_proofs").select("*").eq("access_token", token).single();

      if (proofErr || !proofData) {
        setError("This approval link is invalid or has expired.");
        setLoading(false);
        return;
      }

      // Check if already approved
      if (proofData.client_approved) {
        setProof(proofData);
        setSubmitted(true);
      } else {
        setProof(proofData);
      }

      // Load project info
      const { data: projData } = await supabase
        .from("ad_projects").select("*").eq("id", proofData.project_id).single();
      if (projData) setProject(projData);

      // Load all proofs for this project (version history)
      const { data: proofsList } = await supabase
        .from("ad_proofs").select("*").eq("project_id", proofData.project_id).order("version", { ascending: false });
      if (proofsList) setAllProofs(proofsList);

      // Load existing annotations
      if (proofData.annotations) {
        try { setAnnotations(JSON.parse(proofData.annotations)); } catch (e) {}
      }

      setLoading(false);
    })();
  }, [token]);

  // ─── Image click → add annotation pin ─────────────────
  const handleImageClick = useCallback((e) => {
    if (submitted) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const id = Date.now();
    setActiveAnnotation({ id, x, y });
    setAnnotationText("");
  }, [submitted]);

  // ─── Save annotation ──────────────────────────────────
  const saveAnnotation = () => {
    if (!annotationText.trim() || !activeAnnotation) return;
    const ann = { ...activeAnnotation, text: annotationText.trim() };
    setAnnotations(prev => [...prev, ann]);
    setActiveAnnotation(null);
    setAnnotationText("");
  };

  const removeAnnotation = (id) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
  };

  // ─── Submit: Approve ──────────────────────────────────
  const handleApprove = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const annJson = annotations.length > 0 ? JSON.stringify(annotations) : null;
      await supabase.from("ad_proofs").update({
        client_approved: true, client_approved_at: new Date().toISOString(),
        client_feedback: feedback || null, annotations: annJson,
      }).eq("id", proof.id);

      // Update project status
      await supabase.from("ad_projects").update({
        status: "approved", updated_at: new Date().toISOString(),
      }).eq("id", proof.project_id);

      // Post system message to thread
      if (project?.thread_id) {
        await supabase.from("messages").insert({
          thread_id: project.thread_id,
          sender_name: project.client_contact_name || "Client",
          body: `✓ Proof v${proof.version} APPROVED by client.${feedback ? `\n\nNote: ${feedback}` : ""}${annotations.length > 0 ? `\n\n${annotations.length} annotation(s) attached.` : ""}`,
          is_system: true,
        });
      }

      setSubmitted(true);
    } catch (err) {
      console.error("Approve error:", err);
    }
    setSubmitting(false);
  };

  // ─── Submit: Request Changes ──────────────────────────
  const handleRequestChanges = async () => {
    if (submitting || (!feedback.trim() && annotations.length === 0)) return;
    setSubmitting(true);
    try {
      const annJson = annotations.length > 0 ? JSON.stringify(annotations) : null;
      await supabase.from("ad_proofs").update({
        client_approved: false,
        client_feedback: feedback || null, annotations: annJson,
      }).eq("id", proof.id);

      // Update project status to revising
      await supabase.from("ad_projects").update({
        status: "revising", updated_at: new Date().toISOString(),
      }).eq("id", proof.project_id);

      // Post feedback to thread
      if (project?.thread_id) {
        const annSummary = annotations.map((a, i) => `  ${i + 1}. [${Math.round(a.x)}%, ${Math.round(a.y)}%] ${a.text}`).join("\n");
        await supabase.from("messages").insert({
          thread_id: project.thread_id,
          sender_name: project.client_contact_name || "Client",
          body: `✗ Proof v${proof.version} — changes requested.\n\n${feedback || "(no general feedback)"}${annotations.length > 0 ? `\n\nAnnotations:\n${annSummary}` : ""}`,
          is_system: false,
        });
      }

      // Check revision count for charge warning
      const revCount = project?.revision_count || proof.version;
      if (revCount >= 3 && project?.thread_id) {
        const chargeMsg = revCount === 3
          ? "⚠ This is revision 3 of 4 free revisions. The next revision will incur a $25 charge."
          : `⚠ Revision ${revCount + 1} requested. Client will be charged $25 for this revision.`;
        await supabase.from("messages").insert({
          thread_id: project.thread_id, sender_name: "System",
          body: chargeMsg, is_system: true,
        });
      }

      setSubmitted(true);
    } catch (err) {
      console.error("Request changes error:", err);
    }
    setSubmitting(false);
  };

  // ─── Render: Loading / Error ──────────────────────────
  if (loading) return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ textAlign: "center", padding: 60, color: C.tm }}>Loading proof...</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={styles.page}>
      <div style={{ ...styles.card, textAlign: "center", padding: 60 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Link Not Found</div>
        <div style={{ fontSize: 14, color: C.tm }}>{error}</div>
      </div>
    </div>
  );

  const isPdf = proof?.proof_url?.toLowerCase().endsWith(".pdf");
  const revCount = project?.revision_count || proof?.version || 1;

  // ─── Render: Main ─────────────────────────────────────
  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 4, background: C.tx, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 15, color: C.bg, flexShrink: 0 }}>13</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>13 Stars Media Group</div>
            <div style={{ fontSize: 12, color: C.tm }}>Ad Proof Review</div>
          </div>
        </div>
      </div>

      {/* Project Info Bar */}
      <div style={styles.infoBar}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center" }}>
          {project?.ad_size && <InfoChip label="Ad Size" value={project.ad_size} />}
          <InfoChip label="Version" value={`v${proof.version}`} />
          <InfoChip label="Sent" value={fmtDate(proof.created_at)} />
          {revCount > 1 && <InfoChip label="Revision" value={`${revCount} of 4 free`} warn={revCount >= 3} />}
        </div>
        {submitted && proof.client_approved && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, background: C.go + "15", color: C.go, fontWeight: 700, fontSize: 13 }}>
            ✓ Approved
          </div>
        )}
        {submitted && proof.client_approved === false && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, background: C.wa + "15", color: C.wa, fontWeight: 700, fontSize: 13 }}>
            Changes Requested
          </div>
        )}
      </div>

      <div style={styles.content}>
        {/* Left: Proof Viewer */}
        <div style={styles.proofPanel}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Proof {!submitted && "— Click image to add annotations"}
          </div>
          <div ref={containerRef} style={styles.proofContainer} onClick={!isPdf ? handleImageClick : undefined}>
            {isPdf ? (
              <iframe
                src={`${PROXY_URL}?action=get&path=${encodeURIComponent(proof.proof_url.replace(CDN_BASE + "/", ""))}`}
                style={{ width: "100%", height: 700, border: "none", borderRadius: 6 }}
                title="Proof PDF"
              />
            ) : (
              <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
                <img
                  ref={imgRef}
                  src={proof.proof_url}
                  alt={`Proof v${proof.version}`}
                  style={{ maxWidth: "100%", maxHeight: 700, borderRadius: 6, display: "block", cursor: submitted ? "default" : "crosshair" }}
                  onLoad={(e) => setImgSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
                  draggable={false}
                />
                {/* Annotation pins */}
                {annotations.map((ann, i) => (
                  <div key={ann.id} style={{
                    position: "absolute", left: `${ann.x}%`, top: `${ann.y}%`, transform: "translate(-50%, -50%)",
                    width: 24, height: 24, borderRadius: "50%", background: C.da, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                    border: "2px solid #fff", zIndex: 2,
                  }} title={ann.text} onClick={(e) => { e.stopPropagation(); }}>
                    {i + 1}
                  </div>
                ))}
                {/* Active annotation placement */}
                {activeAnnotation && (
                  <div style={{
                    position: "absolute", left: `${activeAnnotation.x}%`, top: `${activeAnnotation.y}%`, transform: "translate(-50%, -50%)",
                    width: 24, height: 24, borderRadius: "50%", background: C.ac, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800, boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                    border: "2px solid #fff", zIndex: 3, animation: "pulse 1s infinite",
                  }}>
                    {annotations.length + 1}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Version History */}
          {allProofs.length > 1 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Version History</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {allProofs.map(p => (
                  <a key={p.id} href={`/approve/${p.access_token}`} style={{
                    padding: "4px 12px", borderRadius: 14, fontSize: 12, fontWeight: 600, textDecoration: "none",
                    background: p.id === proof.id ? C.ac + "15" : C.sa,
                    color: p.id === proof.id ? C.ac : C.tm,
                    border: `1px solid ${p.id === proof.id ? C.ac + "40" : C.bd}`,
                  }}>
                    v{p.version} {p.client_approved === true && "✓"} {p.client_approved === false && "✗"}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Feedback Panel */}
        <div style={styles.feedbackPanel}>
          {submitted ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{proof.client_approved ? "✅" : "📝"}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.tx, marginBottom: 8 }}>
                {proof.client_approved ? "Proof Approved!" : "Changes Submitted"}
              </div>
              <div style={{ fontSize: 14, color: C.tm, lineHeight: 1.6 }}>
                {proof.client_approved
                  ? "Thank you for approving this proof. Your ad will now move to final production."
                  : "Your feedback has been sent to the design team. You'll receive a new proof link once the revisions are ready."
                }
              </div>
              {feedback && (
                <div style={{ marginTop: 20, padding: 16, background: C.sa, borderRadius: 8, textAlign: "left" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.td, textTransform: "uppercase", marginBottom: 4 }}>Your Feedback</div>
                  <div style={{ fontSize: 13, color: C.tx, whiteSpace: "pre-wrap" }}>{feedback}</div>
                </div>
              )}
              {annotations.length > 0 && (
                <div style={{ marginTop: 12, padding: 16, background: C.sa, borderRadius: 8, textAlign: "left" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.td, textTransform: "uppercase", marginBottom: 8 }}>Annotations</div>
                  {annotations.map((a, i) => (
                    <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                      <span style={{ width: 20, height: 20, borderRadius: "50%", background: C.da, color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontSize: 13, color: C.tx }}>{a.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Annotation Input */}
              {activeAnnotation && (
                <div style={{ marginBottom: 16, padding: 14, background: C.ac + "08", borderRadius: 8, border: `1px solid ${C.ac}30` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.ac, marginBottom: 6 }}>Add Annotation #{annotations.length + 1}</div>
                  <textarea
                    value={annotationText}
                    onChange={(e) => setAnnotationText(e.target.value)}
                    placeholder="Describe what needs to change here..."
                    style={styles.textarea}
                    rows={3}
                    autoFocus
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={saveAnnotation} style={{ ...styles.btnSmall, background: C.ac, color: "#fff" }}>Save</button>
                    <button onClick={() => setActiveAnnotation(null)} style={{ ...styles.btnSmall, background: C.sa, color: C.tm }}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Existing Annotations List */}
              {annotations.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                    Annotations ({annotations.length})
                  </div>
                  {annotations.map((a, i) => (
                    <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8, padding: 10, background: C.sa, borderRadius: 6 }}>
                      <span style={{ width: 22, height: 22, borderRadius: "50%", background: C.da, color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
                      <div style={{ flex: 1, fontSize: 13, color: C.tx }}>{a.text}</div>
                      <button onClick={() => removeAnnotation(a.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.td, fontSize: 14, padding: 2 }} title="Remove">×</button>
                    </div>
                  ))}
                </div>
              )}

              {/* General Feedback */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>General Feedback</div>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Any overall comments about the proof..."
                  style={styles.textarea}
                  rows={4}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button onClick={handleApprove} disabled={submitting} style={styles.btnApprove}>
                  {submitting ? "Submitting..." : "✓ Approve This Proof"}
                </button>
                <button
                  onClick={handleRequestChanges}
                  disabled={submitting || (!feedback.trim() && annotations.length === 0)}
                  style={{
                    ...styles.btnRevise,
                    opacity: (!feedback.trim() && annotations.length === 0) ? 0.4 : 1,
                  }}
                >
                  Request Changes
                </button>
                <div style={{ fontSize: 11, color: C.td, textAlign: "center", marginTop: 4 }}>
                  {revCount >= 4
                    ? `Additional revisions incur a $25 charge each.`
                    : revCount === 3
                      ? `1 free revision remaining. Additional revisions will be $25 each.`
                      : `${4 - revCount} free revision${4 - revCount !== 1 ? "s" : ""} remaining.`
                  }
                </div>
              </div>
            </>
          )}

          {/* Designer Notes */}
          {proof?.designer_notes && (
            <div style={{ marginTop: 20, padding: 14, background: C.pu + "08", borderRadius: 8, border: `1px solid ${C.pu}20` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.pu, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Designer Notes</div>
              <div style={{ fontSize: 13, color: C.tx, whiteSpace: "pre-wrap" }}>{proof.designer_notes}</div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <span>© {new Date().getFullYear()} 13 Stars Media Group</span>
        <span style={{ color: C.td }}>·</span>
        <span>Powered by MyDash</span>
      </div>

      {/* Pulse animation for active annotation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4); }
          50% { box-shadow: 0 0 0 8px rgba(37, 99, 235, 0); }
        }
      `}</style>
    </div>
  );
}

function InfoChip({ label, value, warn }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.td, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: warn ? C.wa : C.tx }}>{value}</div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh", background: C.bg,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    display: "flex", flexDirection: "column",
  },
  header: {
    padding: "16px 28px", background: C.sf, borderBottom: `1px solid ${C.bd}`,
  },
  infoBar: {
    padding: "12px 28px", background: C.sf, borderBottom: `1px solid ${C.bd}`,
    display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12,
  },
  content: {
    flex: 1, display: "flex", gap: 0, maxWidth: 1400, width: "100%", margin: "0 auto",
  },
  proofPanel: {
    flex: 1, padding: 28, minWidth: 0, overflow: "auto",
  },
  proofContainer: {
    background: C.sf, borderRadius: 8, border: `1px solid ${C.bd}`,
    padding: 16, display: "flex", justifyContent: "center", alignItems: "flex-start",
    minHeight: 400, position: "relative",
  },
  feedbackPanel: {
    width: 360, flexShrink: 0, padding: 28, borderLeft: `1px solid ${C.bd}`,
    background: C.sf, overflowY: "auto",
  },
  textarea: {
    width: "100%", padding: 10, borderRadius: 6, border: `1px solid ${C.bd}`,
    fontSize: 13, fontFamily: "inherit", resize: "vertical",
    background: C.bg, color: C.tx, outline: "none",
    boxSizing: "border-box",
  },
  btnSmall: {
    padding: "6px 14px", borderRadius: 6, border: "none",
    fontSize: 12, fontWeight: 700, cursor: "pointer",
  },
  btnApprove: {
    padding: "14px 24px", borderRadius: 8, border: "none",
    fontSize: 15, fontWeight: 800, cursor: "pointer",
    background: C.go, color: "#fff",
    transition: "transform 0.1s",
  },
  btnRevise: {
    padding: "12px 24px", borderRadius: 8,
    border: `2px solid ${C.wa}`, background: "transparent",
    fontSize: 14, fontWeight: 700, cursor: "pointer", color: C.wa,
  },
  footer: {
    padding: "16px 28px", textAlign: "center", fontSize: 11, color: C.tm,
    borderTop: `1px solid ${C.bd}`, display: "flex", justifyContent: "center", gap: 8,
  },
  card: {
    maxWidth: 500, margin: "80px auto", background: C.sf,
    borderRadius: 12, border: `1px solid ${C.bd}`, overflow: "hidden",
  },
};
