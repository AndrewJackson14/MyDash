// ============================================================
// IssueProofingTab — Anthony Phase 4 (§9 of comprehensive spec)
// Tab inside the Issue Layout Console. Anthony uploads a proof PDF;
// reviewers (Camille, Hayley, EIC) click anywhere on a page to drop
// numbered pins with comments; Anthony resolves them as he fixes
// each in InDesign and uploads a new version; publisher hits Approve
// Proof which cascades all stories' print_status to 'approved' and
// stamps publisher_signoff_at on the issue (closing two readiness-
// checklist items at once).
// ============================================================
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Z, COND, DISPLAY, FS, FW, R, Ri } from "../lib/theme";
import { Btn, glass as glassStyle } from "../components/ui";
import { supabase, isOnline, EDGE_FN_URL } from "../lib/supabase";
import { fmtDateShort as fmtDate } from "../lib/formatters";
import { loadProofPdf, renderPageToCanvas } from "../lib/proofPdfRender";

const PROOF_STATUS_COLOR = (s) => ({
  review: Z.ac,
  revising: Z.wa,
  approved: Z.go,
  superseded: Z.tm,
}[s] || Z.tm);

export default function IssueProofingTab({ issueId, issue, currentUser, team, onApproved }) {
  const [proofs, setProofs] = useState([]);
  const [activeProof, setActiveProof] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [pendingPin, setPendingPin] = useState(null); // { pageNum, x_pct, y_pct }
  const [pendingComment, setPendingComment] = useState("");
  const [submittingPin, setSubmittingPin] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);
  const [approving, setApproving] = useState(false);

  // Permission checks based on role. Anthony (Layout Designer +
  // Production Manager + Graphic Designer) can upload and resolve.
  // Hayley/EIC can additionally approve. Anyone authenticated can
  // annotate.
  const role = currentUser?.role || "";
  const canUpload = ["Layout Designer", "Graphic Designer", "Production Manager", "Publisher", "Editor-in-Chief"].includes(role);
  const canResolve = canUpload;
  const canApprove = ["Publisher", "Editor-in-Chief"].includes(role);

  // ── Load proofs + auto-select latest under-review ────────────
  useEffect(() => {
    if (!issueId || !isOnline()) return;
    (async () => {
      const { data } = await supabase
        .from("issue_proofs")
        .select("*")
        .eq("issue_id", issueId)
        .order("version", { ascending: false });
      const list = data || [];
      setProofs(list);
      // Prefer the most recent under-review or revising; otherwise
      // fall back to the latest row so a closed-out issue still
      // surfaces its approved proof for reference.
      const latest = list.find(p => p.status === "review" || p.status === "revising") || list[0];
      setActiveProof(latest || null);
    })();
  }, [issueId]);

  // ── Realtime: new proofs land + new annotations land ─────────
  useEffect(() => {
    if (!issueId || !isOnline()) return;
    const ch = supabase
      .channel(`proof-${issueId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "issue_proofs", filter: `issue_id=eq.${issueId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setProofs(prev => [payload.new, ...prev]);
            // Auto-switch to the newest under-review version
            if (payload.new.status === "review") setActiveProof(payload.new);
          } else if (payload.eventType === "UPDATE") {
            setProofs(prev => prev.map(p => p.id === payload.new.id ? payload.new : p));
            if (activeProof?.id === payload.new.id) setActiveProof(payload.new);
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [issueId, activeProof?.id]);

  useEffect(() => {
    if (!activeProof?.id) return;
    if (!isOnline()) return;
    const ch = supabase
      .channel(`proof-ann-${activeProof.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "issue_proof_annotations", filter: `proof_id=eq.${activeProof.id}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setAnnotations(prev => prev.some(a => a.id === payload.new.id) ? prev : [...prev, payload.new]);
          } else if (payload.eventType === "UPDATE") {
            setAnnotations(prev => prev.map(a => a.id === payload.new.id ? payload.new : a));
          } else if (payload.eventType === "DELETE") {
            setAnnotations(prev => prev.filter(a => a.id !== payload.old.id));
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeProof?.id]);

  // ── Load annotations for the active proof ────────────────────
  useEffect(() => {
    if (!activeProof?.id) { setAnnotations([]); return; }
    (async () => {
      const { data } = await supabase
        .from("issue_proof_annotations")
        .select("*")
        .eq("proof_id", activeProof.id)
        .order("created_at", { ascending: true });
      setAnnotations(data || []);
    })();
  }, [activeProof?.id]);

  // ── Load the PDF document for the active proof ───────────────
  useEffect(() => {
    if (!activeProof?.pdf_url) { setPdfDoc(null); return; }
    setPdfLoading(true);
    setPdfError(null);
    setPdfDoc(null);
    (async () => {
      try {
        const doc = await loadProofPdf(activeProof.pdf_url);
        setPdfDoc(doc);
        // Backfill page_count if missing — saves clicks later
        if (!activeProof.page_count && doc.numPages) {
          await supabase.from("issue_proofs").update({ page_count: doc.numPages }).eq("id", activeProof.id);
        }
      } catch (err) {
        console.error("Proof PDF load failed:", err);
        setPdfError("Couldn't load this proof PDF. The file may have moved or you don't have access.");
      }
      setPdfLoading(false);
    })();
  }, [activeProof?.pdf_url, activeProof?.id]);

  // ── Upload new proof ─────────────────────────────────────────
  const fileInputRef = useRef(null);
  const onUploadClick = () => fileInputRef.current?.click();
  const onFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset for repeat-upload of same filename
    if (!file) return;
    if (uploading) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("not signed in");
      const form = new FormData();
      form.append("issue_id", issueId);
      form.append("file", file);
      const res = await fetch(`${EDGE_FN_URL}/issue-proof-upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out?.error || `upload failed: ${res.status}`);
      // Realtime INSERT will pick the new proof up; nothing to do here
    } catch (err) {
      console.error("Proof upload failed:", err);
      setUploadError(err.message || "upload failed");
    }
    setUploading(false);
  };

  // ── Add an annotation pin (click on a page) ──────────────────
  const onPageClick = (e, pageNum) => {
    if (pendingPin || !activeProof) return;
    if (activeProof.status === "approved" || activeProof.status === "superseded") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x_pct = ((e.clientX - rect.left) / rect.width) * 100;
    const y_pct = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingPin({ pageNum, x_pct, y_pct });
    setPendingComment("");
  };

  const submitPin = async () => {
    if (!pendingPin || !pendingComment.trim() || submittingPin) return;
    setSubmittingPin(true);
    try {
      await supabase.from("issue_proof_annotations").insert({
        proof_id: activeProof.id,
        page_number: pendingPin.pageNum,
        x_pct: pendingPin.x_pct,
        y_pct: pendingPin.y_pct,
        author_id: currentUser.id,
        author_name: currentUser.name || null,
        comment: pendingComment.trim(),
      });
      setPendingPin(null);
      setPendingComment("");
    } catch (err) {
      console.error("Annotation insert failed:", err);
    }
    setSubmittingPin(false);
  };

  const cancelPin = () => { setPendingPin(null); setPendingComment(""); };

  // ── Resolve / unresolve an annotation ────────────────────────
  const toggleResolve = async (ann) => {
    if (!canResolve || resolvingId === ann.id) return;
    setResolvingId(ann.id);
    try {
      const next = !ann.resolved;
      await supabase.from("issue_proof_annotations").update({
        resolved: next,
        resolved_at: next ? new Date().toISOString() : null,
        resolved_by: next ? currentUser.id : null,
      }).eq("id", ann.id);
    } catch (err) {
      console.error("Toggle resolve failed:", err);
    }
    setResolvingId(null);
  };

  // ── Approve proof — cascade to stories + issue signoff ───────
  const approveProof = async () => {
    if (!canApprove || approving || !activeProof) return;
    const unresolved = annotations.filter(a => !a.resolved).length;
    if (unresolved > 0) {
      const ok = window.confirm(`${unresolved} annotation${unresolved === 1 ? "" : "s"} still unresolved. Approve anyway?`);
      if (!ok) return;
    }
    setApproving(true);
    try {
      const now = new Date().toISOString();
      // 1. Flip the proof itself to approved
      await supabase.from("issue_proofs").update({
        status: "approved",
        approved_by: currentUser.id,
        approved_at: now,
      }).eq("id", activeProof.id);

      // 2. Cascade — every story committed to this issue that hasn't
      // already been approved gets bumped. on_page/proofread/ready/none
      // all roll forward. Stamps placed_by/laid_out_at if the story
      // never went through Mark On Page (defensive backfill).
      await supabase.from("stories")
        .update({ print_status: "approved" })
        .eq("print_issue_id", issueId)
        .neq("print_status", "approved");

      // 3. Stamp publisher signoff on the issue so the readiness
      // checklist closes the loop without a separate manual step.
      await supabase.from("issues").update({
        publisher_signoff_at: now,
        publisher_signoff_by: currentUser.id,
      }).eq("id", issueId);

      onApproved?.();
    } catch (err) {
      console.error("Approve proof failed:", err);
    }
    setApproving(false);
  };

  // ── Group annotations by page for the right rail ────────────
  const annotationsByPage = useMemo(() => {
    const m = new Map();
    annotations.forEach(a => {
      if (!m.has(a.page_number)) m.set(a.page_number, []);
      m.get(a.page_number).push(a);
    });
    return m;
  }, [annotations]);

  const unresolvedCount = annotations.filter(a => !a.resolved).length;
  const numPages = pdfDoc?.numPages || activeProof?.page_count || 0;

  const glass = { ...glassStyle(), borderRadius: R, padding: "18px 20px" };

  return (
    <div data-surface="paper" style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 14, alignItems: "flex-start" }}>
      {/* LEFT — PDF viewer */}
      <div style={glass}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12 }}>
          <div>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>
              Proof {activeProof ? `v${activeProof.version}` : ""}
              {activeProof && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: FW.heavy, color: PROOF_STATUS_COLOR(activeProof.status), padding: "2px 8px", background: PROOF_STATUS_COLOR(activeProof.status) + "15", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.4, fontFamily: COND, verticalAlign: "middle" }}>{activeProof.status}</span>}
            </div>
            {activeProof && <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, marginTop: 2 }}>
              Uploaded {fmtDate(activeProof.uploaded_at?.slice(0, 10))}{activeProof.byte_size ? ` · ${(activeProof.byte_size / 1048576).toFixed(1)} MB` : ""}{activeProof.notes ? ` — ${activeProof.notes}` : ""}
            </div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {canUpload && (
              <>
                <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={onFileSelected} style={{ display: "none" }} />
                <Btn sm v="secondary" onClick={onUploadClick} disabled={uploading}>
                  {uploading ? "Uploading…" : (proofs.length === 0 ? "Upload first proof" : "Upload new version")}
                </Btn>
              </>
            )}
            {canApprove && activeProof && activeProof.status === "review" && (
              <Btn sm onClick={approveProof} disabled={approving}>
                {approving ? "Approving…" : "✓ Approve Proof"}
              </Btn>
            )}
          </div>
        </div>
        {uploadError && <div style={{ fontSize: FS.xs, color: Z.da, marginBottom: 8 }}>{uploadError}</div>}

        {!activeProof ? (
          <div style={{ padding: 60, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>
            {canUpload
              ? "No proof uploaded yet. Drop a PDF when you're ready for review."
              : "No proof uploaded yet. Anthony will upload one when layout is ready."}
          </div>
        ) : pdfError ? (
          <div style={{ padding: 60, textAlign: "center", color: Z.da, fontSize: FS.sm }}>{pdfError}</div>
        ) : pdfLoading || !pdfDoc ? (
          <div style={{ padding: 60, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>Loading PDF…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxHeight: "calc(100vh - 280px)", overflowY: "auto" }}>
            {Array.from({ length: numPages }, (_, idx) => idx + 1).map(pageNum => {
              const pinsOnPage = annotationsByPage.get(pageNum) || [];
              return (
                <ProofPage
                  key={pageNum}
                  pdfDoc={pdfDoc}
                  pageNum={pageNum}
                  pins={pinsOnPage}
                  pendingPin={pendingPin?.pageNum === pageNum ? pendingPin : null}
                  onClick={(e) => onPageClick(e, pageNum)}
                  proofStatus={activeProof.status}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* RIGHT — Versions + Unresolved annotations + Pending pin */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Pending pin composer — only when reviewer just clicked */}
        {pendingPin && (
          <div style={{ ...glass, borderColor: Z.ac }}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.ac, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 6 }}>
              New annotation — page {pendingPin.pageNum}
            </div>
            <textarea
              value={pendingComment}
              onChange={e => setPendingComment(e.target.value)}
              placeholder="What needs to change here?"
              autoFocus
              rows={3}
              style={{ width: "100%", padding: 8, borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical", outline: "none", marginBottom: 8 }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
              <Btn sm v="secondary" onClick={cancelPin} disabled={submittingPin}>Cancel</Btn>
              <Btn sm onClick={submitPin} disabled={submittingPin || !pendingComment.trim()}>
                {submittingPin ? "Saving…" : "Save annotation"}
              </Btn>
            </div>
          </div>
        )}

        {/* Unresolved list — Anthony's actual work queue */}
        {activeProof && (
          <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Annotations</span>
              <span style={{ fontSize: FS.xs, color: unresolvedCount > 0 ? Z.wa : Z.go, fontWeight: FW.bold, fontFamily: COND }}>
                {unresolvedCount} unresolved
              </span>
            </div>
            {annotations.length === 0 ? (
              <div style={{ fontSize: FS.sm, color: Z.tm, fontStyle: "italic", padding: 8 }}>
                {activeProof.status === "approved" ? "Approved without notes." : "Click anywhere on a page to add the first annotation."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 380, overflowY: "auto" }}>
                {[...annotations].sort((a, b) => (a.page_number - b.page_number) || (new Date(a.created_at) - new Date(b.created_at))).map((a, idx) => (
                  <div key={a.id} style={{
                    padding: "8px 10px", background: Z.bg, borderRadius: Ri,
                    borderLeft: `2px solid ${a.resolved ? Z.go : Z.wa}`,
                    opacity: a.resolved ? 0.6 : 1,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: FW.bold, color: Z.tm, fontFamily: COND }}>
                        Page {a.page_number} · #{idx + 1}{a.author_name ? ` · ${a.author_name}` : ""}
                      </span>
                      {canResolve && (
                        <button
                          onClick={() => toggleResolve(a)}
                          disabled={resolvingId === a.id}
                          style={{ background: "transparent", border: "none", color: a.resolved ? Z.go : Z.ac, fontSize: 11, fontFamily: COND, fontWeight: FW.bold, cursor: "pointer" }}
                        >
                          {resolvingId === a.id ? "…" : a.resolved ? "↺ Reopen" : "✓ Resolve"}
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: FS.sm, color: Z.tx, whiteSpace: "pre-wrap", textDecoration: a.resolved ? "line-through" : "none" }}>{a.comment}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Version history */}
        {proofs.length > 0 && (
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 10 }}>Versions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {proofs.map(p => {
                const isActive = p.id === activeProof?.id;
                return (
                  <div key={p.id} onClick={() => setActiveProof(p)} style={{
                    padding: "6px 10px", background: isActive ? Z.ac + "10" : Z.bg, borderRadius: Ri,
                    cursor: "pointer", borderLeft: `2px solid ${isActive ? Z.ac : "transparent"}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>v{p.version}</span>
                      <span style={{ fontSize: 9, fontWeight: FW.heavy, color: PROOF_STATUS_COLOR(p.status), padding: "1px 6px", background: PROOF_STATUS_COLOR(p.status) + "15", borderRadius: Ri, textTransform: "uppercase", letterSpacing: 0.4, fontFamily: COND }}>{p.status}</span>
                    </div>
                    <div style={{ fontSize: 10, color: Z.td, fontFamily: COND, marginTop: 1 }}>
                      {fmtDate(p.uploaded_at?.slice(0, 10))}{p.notes ? ` — ${p.notes}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Single rendered PDF page with click overlay + pin pins ─────
function ProofPage({ pdfDoc, pageNum, pins, pendingPin, onClick, proofStatus }) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const [size, setSize] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!pdfDoc || !canvasRef.current || !wrapperRef.current) return;
    const wrapperWidth = wrapperRef.current.offsetWidth || 800;
    (async () => {
      try {
        const { width, height } = await renderPageToCanvas(pdfDoc, pageNum, canvasRef.current, wrapperWidth);
        if (!cancelled) setSize({ width, height });
      } catch (err) {
        console.error(`Render page ${pageNum} failed:`, err);
      }
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum]);

  const interactive = proofStatus === "review" || proofStatus === "revising";

  return (
    <div ref={wrapperRef} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: COND, marginBottom: 4 }}>Page {pageNum}</div>
      <div style={{ position: "relative", boxShadow: "0 2px 12px rgba(0,0,0,0.12)" }}>
        <canvas
          ref={canvasRef}
          onClick={interactive ? onClick : undefined}
          style={{ display: "block", cursor: interactive ? "crosshair" : "default", maxWidth: "100%" }}
        />
        {/* Existing pins */}
        {size && pins.map((a, idx) => (
          <div key={a.id} title={a.comment} style={{
            position: "absolute",
            left: `${a.x_pct}%`, top: `${a.y_pct}%`,
            transform: "translate(-50%, -50%)",
            width: 24, height: 24, borderRadius: "50%",
            background: a.resolved ? Z.go : Z.wa, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 800,
            border: "2px solid #fff",
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
            opacity: a.resolved ? 0.6 : 1,
            pointerEvents: "auto",
          }}>{idx + 1}</div>
        ))}
        {/* Pending pin */}
        {size && pendingPin && (
          <div style={{
            position: "absolute",
            left: `${pendingPin.x_pct}%`, top: `${pendingPin.y_pct}%`,
            transform: "translate(-50%, -50%)",
            width: 24, height: 24, borderRadius: "50%",
            background: Z.ac, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 800,
            border: "2px solid #fff",
            boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
            animation: "proof-pulse 1s infinite",
          }}>＋</div>
        )}
      </div>
      <style>{`
        @keyframes proof-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.6), 0 2px 6px rgba(0,0,0,0.4); }
          50%      { box-shadow: 0 0 0 10px rgba(37, 99, 235, 0), 0 2px 6px rgba(0,0,0,0.4); }
        }
      `}</style>
    </div>
  );
}
