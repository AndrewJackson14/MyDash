import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R, INV, ACCENT } from "../lib/theme";
import { Ic, Btn, Inp, TA, Sel, Modal, Badge, PageHeader, GlassCard, TabRow, TB, TabPipe, DataTable, SB, Toggle, Pill } from "../components/ui";
import { supabase, isOnline, EDGE_FN_URL } from "../lib/supabase";
import ChatPanel from "../components/ChatPanel";
import AssetPanel from "../components/AssetPanel";
import { fmtDateShort as fmtDate, fmtTime } from "../lib/formatters";

const STATUSES = {
  brief: { label: "Brief", color: Z.wa },
  awaiting_art: { label: "Awaiting Art", color: Z.wa },
  designing: { label: "Designing", color: Z.ac },
  proof_sent: { label: "Proof Sent", color: Z.pu },
  revising: { label: "Revising", color: Z.wa },
  approved: { label: "Approved", color: Z.go },
  signed_off: { label: "Signed Off", color: Z.go },
  placed: { label: "Placed", color: Z.go },
};

const KANBAN_COLS = ["brief", "designing", "proof_sent", "revising", "approved"];

const PROXY_URL = EDGE_FN_URL + "/bunny-storage";
const CDN_BASE = "https://cdn.13stars.media";


const AdProjects = ({ pubs, clients, sales, issues, team, currentUser }) => {
  const [tab, setTab] = useState("Active");
  const [projects, setProjects] = useState([]);
  const [proofs, setProofs] = useState([]);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sr, setSr] = useState("");
  const [fPub, setFPub] = useState("all");
  const [viewId, setViewId] = useState(null);
  const [createModal, setCreateModal] = useState(false);
  const [proofModal, setProofModal] = useState(false);
  const [view, setView] = useState("board"); // board | list
  const [heatmapFilter, setHeatmapFilter] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Create form
  const [form, setForm] = useState({
    clientId: "", publicationId: "", issueId: "", adSize: "",
    designNotes: "", designerId: "", clientContactName: "", clientContactEmail: "",
    referenceAds: [],
  });

  // Proof upload form
  const [proofForm, setProofForm] = useState({ designerNotes: "" });

  const cn = (id) => (clients || []).find(c => c.id === id)?.name || "\u2014";
  const pn = (id) => (pubs || []).find(p => p.id === id)?.name || "\u2014";
  const tn = (id) => (team || []).find(t => t.id === id)?.name || "\u2014";
  const designers = (team || []).filter(t => ["Graphic Designer", "Production Manager"].includes(t.role) && t.isActive !== false);

  // ── Load data ──────────────────────────────────────────
  useEffect(() => {
    if (!isOnline()) { setLoading(false); return; }
    Promise.all([
      supabase.from("ad_projects").select("*").order("created_at", { ascending: false }),
      supabase.from("ad_proofs").select("*").order("version", { ascending: false }),
      supabase.from("message_threads").select("*").eq("type", "ad_project"),
    ]).then(([projRes, proofRes, threadRes]) => {
      if (projRes.data) setProjects(projRes.data);
      if (proofRes.data) setProofs(proofRes.data);
      if (threadRes.data) setThreads(threadRes.data);
      setLoading(false);
    });
  }, []);

  // ── Filtered list ──────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const cutoff30d = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    let list = projects;
    if (tab === "Active") {
      list = list.filter(p => {
        if (["signed_off", "placed"].includes(p.status)) return false;
        const iss = (issues || []).find(i => i.id === p.issue_id);
        // Show if: issue within 30 days, OR overdue (past deadline and not complete), OR no issue linked
        if (!iss) return true;
        if (iss.date <= cutoff30d) return true;
        // Past press but incomplete — flag these
        if (iss.date < today && !["approved", "signed_off", "placed"].includes(p.status)) return true;
        return false;
      });
    } else if (tab === "Completed") {
      list = list.filter(p => ["signed_off", "placed"].includes(p.status));
    }
    if (fPub !== "all") list = list.filter(p => p.publication_id === fPub);
    if (sr) { const q = sr.toLowerCase(); list = list.filter(p => cn(p.client_id).toLowerCase().includes(q)); }
    return list;
  }, [projects, tab, fPub, sr, clients, issues, today, cutoff30d]);

  // ── Create project ─────────────────────────────────────
  const createProject = async () => {
    if (!form.clientId || !form.publicationId) return;
    const clientSlug = cn(form.clientId).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const assetPath = `clients/${clientSlug}/assets`;

    // Create thread first
    const { data: thread } = await supabase.from("message_threads").insert({
      type: "ad_project", title: `Ad: ${cn(form.clientId)} \u2014 ${pn(form.publicationId)}`,
      participants: [currentUser?.id, form.designerId].filter(Boolean),
    }).select().single();

    const { data: proj } = await supabase.from("ad_projects").insert({
      client_id: form.clientId, publication_id: form.publicationId,
      issue_id: form.issueId || null, ad_size: form.adSize,
      design_notes: form.designNotes, designer_id: form.designerId || null,
      salesperson_id: currentUser?.id || null,
      reference_ads: form.referenceAds, client_assets_path: assetPath,
      client_contact_name: form.clientContactName, client_contact_email: form.clientContactEmail,
      thread_id: thread?.id || null, status: "brief",
    }).select().single();

    if (proj) {
      setProjects(prev => [proj, ...prev]);
      if (thread) {
        setThreads(prev => [thread, ...prev]);
        // System message
        const { data: msg } = await supabase.from("messages").insert({
          thread_id: thread.id, sender_name: "System", body: `Ad project created by ${currentUser?.name || "Unknown"}. Assigned to ${tn(form.designerId)}.`,
          is_system: true,
        }).select().single();
        if (msg) setMessages(prev => [...prev, msg]);
      }
      setViewId(proj.id);
    }
    setCreateModal(false);
    setForm({ clientId: "", publicationId: "", issueId: "", adSize: "", designNotes: "", designerId: "", clientContactName: "", clientContactEmail: "", referenceAds: [] });
  };

  // ── Upload proof ───────────────────────────────────────
  const uploadProof = async (projectId) => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*,application/pdf";
    inp.onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      setUploading(true);
      const proj = projects.find(p => p.id === projectId);
      const clientSlug = cn(proj?.client_id).toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const version = (proofs.filter(p => p.project_id === projectId).length || 0) + 1;
      const ext = f.name.split(".").pop() || "pdf";
      const filename = `proof-v${version}.${ext}`;
      const path = `clients/${clientSlug}/ads/${projectId}`;

      try {
        const res = await fetch(PROXY_URL, {
          method: "POST",
          headers: { "Content-Type": f.type, "x-action": "upload", "x-path": path, "x-filename": encodeURIComponent(filename) },
          body: f,
        });
        if (!res.ok) throw new Error("Upload failed");
        const cdnUrl = `${CDN_BASE}/${path}/${filename}`;

        const { data: proof } = await supabase.from("ad_proofs").insert({
          project_id: projectId, version, proof_url: cdnUrl, proof_filename: filename,
          designer_notes: proofForm.designerNotes,
        }).select().single();

        if (proof) {
          setProofs(prev => [proof, ...prev]);
          // Update project status + revision billing
          const billableCount = version > 4 ? version - 4 : 0;
          const revCharges = billableCount * 25;
          await supabase.from("ad_projects").update({
            status: "proof_sent", revision_count: version,
            revision_billable_count: billableCount, revision_charges: revCharges,
            updated_at: new Date().toISOString(),
          }).eq("id", projectId);
          setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: "proof_sent", revision_count: version, revision_billable_count: billableCount, revision_charges: revCharges } : p));
          // Revision charge warning in thread
          if (version === 4 && proj?.thread_id) {
            await supabase.from("messages").insert({ thread_id: proj.thread_id, sender_name: "System", body: "⚠ This is the last free revision. Additional revisions will be charged at $25 each.", is_system: true });
          }
          if (version > 4 && proj?.thread_id) {
            await supabase.from("messages").insert({ thread_id: proj.thread_id, sender_name: "System", body: `💰 Revision ${version} — $25 charge applied. Total revision charges: $${revCharges}`, is_system: true });
          }
          // System message
          if (proj?.thread_id) {
            const { data: msg } = await supabase.from("messages").insert({
              thread_id: proj.thread_id, sender_name: currentUser?.name || "Designer",
              body: `Proof v${version} uploaded. ${proofForm.designerNotes ? "Notes: " + proofForm.designerNotes : ""}`,
              is_system: true,
            }).select().single();
            if (msg) setMessages(prev => [...prev, msg]);
          }
        }
      } catch (err) { alert("Upload failed: " + err.message); }
      setUploading(false);
      setProofForm({ designerNotes: "" });
      setProofModal(false);
    };
    inp.click();
  };

  // ── Inline field edit (brief fields) ────────────────────
  const saveBriefField = async (projectId, field, value) => {
    await supabase.from("ad_projects").update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", projectId);
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, [field]: value } : p));
  };

  // ── Sign off ───────────────────────────────────────────
  const signOff = async (projectId, role) => {
    const updates = role === "designer"
      ? { designer_signoff: true, designer_signoff_at: new Date().toISOString(), status: "approved" }
      : { salesperson_signoff: true, salesperson_signoff_at: new Date().toISOString(), status: "signed_off" };
    await supabase.from("ad_projects").update(updates).eq("id", projectId);
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, ...updates } : p));
  };

  // ── Get approval link ──────────────────────────────────
  const getApprovalLink = (proof) => {
    return `${window.location.origin}/approve/${proof.access_token}`;
  };
  const copyApprovalLink = (proof) => {
    navigator.clipboard?.writeText(getApprovalLink(proof));
  };

  // ── View project detail ────────────────────────────────
  const viewProject = projects.find(p => p.id === viewId);
  const viewProofs = proofs.filter(p => p.project_id === viewId).sort((a, b) => b.version - a.version);
  const viewThread = viewProject?.thread_id ? threads.find(t => t.id === viewProject.thread_id) : null;

  if (viewProject) {
    const st = STATUSES[viewProject.status] || STATUSES.brief;
    const latestProof = viewProofs[0];
    const STAGES = ["brief", "designing", "proof_sent", "revising", "approved", "signed_off", "placed"];
    const currentIdx = STAGES.indexOf(viewProject.status);
    const spName = (team || []).find(t => t.id === viewProject.salesperson_id)?.name;

    // Status advance helper
    const advanceStatus = async (newStatus) => {
      await supabase.from("ad_projects").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", viewProject.id);
      setProjects(prev => prev.map(p => p.id === viewProject.id ? { ...p, status: newStatus } : p));
    };

    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 24, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{cn(viewProject.client_id)} — {pn(viewProject.publication_id)}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {viewProject.status === "brief" && <Btn sm onClick={() => advanceStatus("designing")}>Start Designing</Btn>}
          <Btn sm v="ghost" onClick={() => setViewId(null)}>← Back</Btn>
        </div>
      </div>

      {/* Status pipeline */}
      <div style={{ display: "flex", gap: 2 }}>
        {STAGES.map((s, i) => {
          const isCurrent = viewProject.status === s;
          const isPast = currentIdx > i;
          return <div key={s} style={{ flex: 1, padding: "6px 0", textAlign: "center", fontSize: 10, fontWeight: FW.heavy, textTransform: "uppercase", letterSpacing: 0.5, color: isCurrent ? "#fff" : isPast ? Z.go : Z.td, background: isCurrent ? st.color : isPast ? Z.go + "20" : Z.sa, borderRadius: Ri }}>{STATUSES[s]?.label || s}</div>;
        })}
      </div>

      {/* Deadline context */}
      {(() => {
        const issue = (issues || []).find(i => i.id === viewProject.issue_id);
        if (!issue) return null;
        const daysToPublish = issue.date ? Math.ceil((new Date(issue.date + "T12:00:00") - new Date()) / 86400000) : null;
        const daysToAdDl = issue.adDeadline ? Math.ceil((new Date(issue.adDeadline + "T12:00:00") - new Date()) / 86400000) : null;
        return <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {daysToAdDl !== null && <div style={{ flex: 1, padding: "8px 14px", background: (daysToAdDl < 0 ? Z.da : daysToAdDl <= 3 ? Z.wa : Z.go) + "10", borderRadius: Ri, borderLeft: `3px solid ${daysToAdDl < 0 ? Z.da : daysToAdDl <= 3 ? Z.wa : Z.go}` }}>
            <div style={{ fontSize: 10, color: Z.td, textTransform: "uppercase" }}>Ad Materials Due</div>
            <div style={{ fontSize: FS.md, fontWeight: FW.black, color: daysToAdDl < 0 ? Z.da : daysToAdDl <= 3 ? Z.wa : Z.tx }}>{daysToAdDl < 0 ? `${Math.abs(daysToAdDl)}d overdue` : daysToAdDl === 0 ? "Today" : `${daysToAdDl}d`}</div>
          </div>}
          {daysToPublish !== null && <div style={{ flex: 1, padding: "8px 14px", background: Z.bg, borderRadius: Ri }}>
            <div style={{ fontSize: 10, color: Z.td, textTransform: "uppercase" }}>Publishes</div>
            <div style={{ fontSize: FS.md, fontWeight: FW.black, color: Z.tx }}>{fmtDate(issue.date)} ({daysToPublish}d)</div>
          </div>}
          <div style={{ flex: 1, padding: "8px 14px", background: Z.bg, borderRadius: Ri }}>
            <div style={{ fontSize: 10, color: Z.td, textTransform: "uppercase" }}>Placement</div>
            <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tm }}>Not yet placed</div>
          </div>
        </div>;
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16 }}>
        {/* LEFT: Brief with hero proof + history */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Design Brief — left 2/3 brief, right 1/3 proof */}
          <GlassCard style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", minHeight: 400 }}>
              {/* LEFT 2/3: Brief content */}
              <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Design Brief</span>
                  {viewProject.client_contact_name && <span style={{ fontSize: FS.xs, color: Z.tm }}>{viewProject.client_contact_name}{viewProject.client_contact_email ? ` · ${viewProject.client_contact_email}` : ""}</span>}
                </div>

                {/* Team + specs row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: FS.sm }}>
                  <div style={{ padding: "6px 10px", background: Z.bg, borderRadius: Ri }}><div style={{ fontSize: 10, color: Z.td, textTransform: "uppercase" }}>Salesperson</div><div style={{ fontWeight: FW.bold, color: Z.tx }}>{spName || "—"}</div></div>
                  <div style={{ padding: "6px 10px", background: Z.bg, borderRadius: Ri }}><div style={{ fontSize: 10, color: Z.td, textTransform: "uppercase" }}>Designer</div><div style={{ fontWeight: FW.bold, color: Z.tx }}>{tn(viewProject.designer_id)}</div></div>
                  <div style={{ padding: "6px 10px", background: Z.bg, borderRadius: Ri }}><div style={{ fontSize: 10, color: Z.td, textTransform: "uppercase" }}>Revisions</div><div style={{ fontWeight: FW.bold, color: viewProject.revision_count >= 3 ? Z.wa : Z.tx }}>{viewProject.revision_count || 0}{viewProject.revision_count >= 4 ? ` ($${(viewProject.revision_count - 3) * 25})` : ""}</div></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: FS.sm }}>
                  <div style={{ padding: "6px 10px", background: Z.bg, borderRadius: Ri }}><div style={{ fontSize: 10, color: Z.td, textTransform: "uppercase" }}>Ad Size</div><div style={{ fontWeight: FW.bold, color: Z.tx }}>{viewProject.ad_size || "—"}</div></div>
                  <div style={{ padding: "6px 10px", background: Z.bg, borderRadius: Ri }}><div style={{ fontSize: 10, color: Z.td, textTransform: "uppercase" }}>Issue</div><div style={{ fontWeight: FW.bold, color: Z.tx }}>{viewProject.issue_id ? (issues || []).find(i => i.id === viewProject.issue_id)?.label || "—" : "—"}</div></div>
                  <div style={{ padding: "6px 10px", background: Z.bg, borderRadius: Ri }}><div style={{ fontSize: 10, color: Z.td, textTransform: "uppercase" }}>Publication</div><div style={{ fontWeight: FW.bold, color: Z.tx }}>{pn(viewProject.publication_id)}</div></div>
                </div>

                {/* Editable brief fields — click to edit, save on blur */}
                {[
                  ["brief_headline", "Key Message / Headline", false],
                  ["brief_style", "Style Direction", true],
                ].map(([field, label, tall]) => <div key={field} style={tall ? { flex: 1 } : {}}>
                  <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
                  <textarea defaultValue={viewProject[field] || ""} onBlur={e => { if (e.target.value !== (viewProject[field] || "")) saveBriefField(viewProject.id, field, e.target.value); }} placeholder="Click to add..." rows={tall ? 4 : 2} style={{ width: "100%", fontSize: FS.sm, color: Z.tx, padding: "8px 10px", background: Z.bg, borderRadius: Ri, border: `1px solid ${Z.bd}`, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box" }} />
                </div>)}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    ["brief_colors", "Colors to Use / Avoid"],
                    ["brief_instructions", "Special Instructions"],
                  ].map(([field, label]) => <div key={field}>
                    <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
                    <textarea defaultValue={viewProject[field] || ""} onBlur={e => { if (e.target.value !== (viewProject[field] || "")) saveBriefField(viewProject.id, field, e.target.value); }} placeholder="Click to add..." rows={2} style={{ width: "100%", fontSize: FS.sm, color: Z.tx, padding: "8px 10px", background: Z.bg, borderRadius: Ri, border: `1px solid ${Z.bd}`, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }} />
                  </div>)}
                </div>

                {viewProject.design_notes && !viewProject.design_notes.startsWith("Auto-created") && <div>
                  <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Additional Notes</div>
                  <textarea defaultValue={viewProject.design_notes} onBlur={e => { if (e.target.value !== viewProject.design_notes) saveBriefField(viewProject.id, "design_notes", e.target.value); }} rows={2} style={{ width: "100%", fontSize: FS.sm, color: Z.tx, padding: "8px 10px", background: Z.bg, borderRadius: Ri, border: `1px solid ${Z.bd}`, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }} />
                </div>}
              </div>

              {/* RIGHT 1/3: Current proof — vertical hero */}
              <div style={{ borderLeft: `1px solid ${Z.bd}`, background: Z.bg, display: "flex", flexDirection: "column" }}>
                {latestProof ? <>
                  <div style={{ padding: "12px 14px", borderBottom: `1px solid ${Z.bd}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: FS.sm, fontWeight: FW.black, color: Z.tx }}>v{latestProof.version}</span>
                      {(() => { const is = latestProof.internal_status || "uploaded"; const lbl = { uploaded: "Uploaded", ready: "Ready", edit: "Needs Edit", approved: "Approved", sent_to_client: "Sent" }[is] || is; const clr = { uploaded: Z.tm, ready: Z.ac, edit: Z.wa, approved: Z.go, sent_to_client: Z.go }[is] || Z.tm; return <span style={{ fontSize: 10, fontWeight: FW.bold, color: clr, background: clr + "15", padding: "2px 6px", borderRadius: Ri }}>{lbl}</span>; })()}
                    </div>
                    <div style={{ fontSize: FS.xs, color: Z.td }}>{fmtDate(latestProof.created_at)}</div>
                  </div>
                  {/* Image preview */}
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 12, overflow: "hidden" }}>
                    {latestProof.proof_url?.match(/\.(jpg|jpeg|png|gif|webp)$/i)
                      ? <img src={latestProof.proof_url} alt={`Proof v${latestProof.version}`} loading="lazy" style={{ maxWidth: "100%", maxHeight: 320, borderRadius: Ri, objectFit: "contain" }} />
                      : <div style={{ textAlign: "center", color: Z.tm, fontSize: FS.sm }}>PDF · <a href={latestProof.proof_url} target="_blank" rel="noopener" style={{ color: Z.ac }}>Open</a></div>
                    }
                  </div>
                  {latestProof.client_feedback && <div style={{ padding: "8px 14px", borderTop: `1px solid ${Z.bd}`, fontSize: FS.xs, color: Z.tx, background: Z.wa + "08", borderLeft: `2px solid ${Z.wa}` }}>Client: {latestProof.client_feedback}</div>}
                  {/* Actions */}
                  <div style={{ padding: "10px 14px", borderTop: `1px solid ${Z.bd}`, display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <Btn sm v="ghost" onClick={() => window.open(latestProof.proof_url, "_blank")} style={{ flex: 1 }}>View Full</Btn>
                    {(latestProof.internal_status || "uploaded") === "uploaded" && <Btn sm v="secondary" onClick={async () => { await supabase.from("ad_proofs").update({ internal_status: "ready" }).eq("id", latestProof.id); setProofs(prev => prev.map(p => p.id === latestProof.id ? { ...p, internal_status: "ready" } : p)); }} style={{ flex: 1 }}>Mark Ready</Btn>}
                    {latestProof.internal_status === "ready" && <Btn sm v="secondary" onClick={async () => { await supabase.from("ad_proofs").update({ internal_status: "edit" }).eq("id", latestProof.id); setProofs(prev => prev.map(p => p.id === latestProof.id ? { ...p, internal_status: "edit" } : p)); }} style={{ flex: 1 }}>Request Edit</Btn>}
                    {(latestProof.internal_status === "ready" || latestProof.internal_status === "approved") && <Btn sm onClick={() => copyApprovalLink(latestProof)} style={{ flex: 1 }}>Send to Client</Btn>}
                    <Btn sm v="secondary" onClick={() => setProofModal(true)} disabled={uploading} style={{ flex: 1 }}><Ic.up size={11} /> New Version</Btn>
                  </div>
                </> : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, padding: 24 }}>
                  <div style={{ fontSize: FS.sm, color: Z.td }}>No proof yet</div>
                  <Btn sm onClick={() => setProofModal(true)} disabled={uploading}><Ic.up size={12} /> Upload Proof</Btn>
                </div>}
              </div>
            </div>
          </GlassCard>

          {/* Assets — project-specific + global client library */}
          {(() => {
            const client = (clients || []).find(c => c.id === viewProject.client_id);
            const clientCode = client?.clientCode || client?.client_code;
            if (!clientCode) return null;
            return <GlassCard>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <AssetPanel path={`clients/${clientCode}/projects/${viewProject.id}`} title="Project Assets" compact />
                <AssetPanel path={`clients/${clientCode}/assets`} title="Client Library" compact />
              </div>
            </GlassCard>;
          })()}

          {/* Proof Version History (previous versions) */}
          {viewProofs.length > 1 && <GlassCard>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Version History</div>
            {viewProofs.slice(1).map(proof => {
              const is = proof.internal_status || "uploaded";
              const clr = { uploaded: Z.tm, ready: Z.ac, edit: Z.wa, approved: Z.go, sent_to_client: Z.go }[is] || Z.tm;
              return <div key={proof.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: Z.bg, borderRadius: Ri, marginBottom: 2, borderLeft: `2px solid ${clr}` }}>
                <div>
                  <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>v{proof.version}</span>
                  <span style={{ fontSize: FS.xs, color: Z.tm, marginLeft: 6 }}>{fmtDate(proof.created_at)}</span>
                </div>
                <Btn sm v="ghost" onClick={() => window.open(proof.proof_url, "_blank")}>View</Btn>
              </div>;
            })}
          </GlassCard>}

          {/* Ad History */}
          {(() => {
            const clientAds = (sales || []).filter(s => s.clientId === viewProject.client_id && s.status === "Closed" && s.id !== viewProject.sale_id).slice(0, 5);
            if (clientAds.length === 0) return null;
            return <GlassCard>
              <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Client Ad History</div>
              {clientAds.map(s => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: Z.bg, borderRadius: Ri, marginBottom: 2, fontSize: FS.sm }}>
                  <span style={{ color: Z.tx }}>{pn(s.publication)} {(issues || []).find(i => i.id === s.issueId)?.label || ""}</span>
                  <span style={{ color: Z.tm }}>{s.size || s.adSize || s.type || "Ad"} · {s.page ? `Page ${s.page}` : "—"}</span>
                </div>
              ))}
            </GlassCard>;
          })()}

          {/* Sign-off */}
          {(viewProject.status === "approved" || viewProject.revision_count > 0) && <GlassCard>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Sign-Off</div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1, padding: "10px 14px", background: Z.bg, borderRadius: Ri, textAlign: "center" }}>
                <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>Designer</div>
                {viewProject.designer_signoff ? <div style={{ color: Z.go, fontWeight: FW.bold, marginTop: 4 }}>✓ Signed off</div>
                  : <Btn sm style={{ marginTop: 4 }} onClick={() => signOff(viewProject.id, "designer")}>Sign Off</Btn>}
              </div>
              <div style={{ flex: 1, padding: "10px 14px", background: Z.bg, borderRadius: Ri, textAlign: "center" }}>
                <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>Salesperson</div>
                {viewProject.salesperson_signoff ? <div style={{ color: Z.go, fontWeight: FW.bold, marginTop: 4 }}>✓ Signed off</div>
                  : <Btn sm style={{ marginTop: 4 }} onClick={() => signOff(viewProject.id, "salesperson")}>Sign Off</Btn>}
              </div>
            </div>
          </GlassCard>}
        </div>

        {/* RIGHT: Chat */}
        <GlassCard style={{ display: "flex", flexDirection: "column", maxHeight: 700 }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Project Chat</div>
          <ChatPanel threadId={viewThread?.id} currentUser={currentUser} height={600} placeholder="Message about this project..." />
        </GlassCard>
      </div>

      {/* Proof upload modal */}
      <Modal open={proofModal} onClose={() => setProofModal(false)} title="Upload Proof" width={440}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <TA label="Designer Notes" value={proofForm.designerNotes} onChange={e => setProofForm(f => ({ ...f, designerNotes: e.target.value }))} placeholder="Any notes about this version..." rows={3} />
          <Btn onClick={() => uploadProof(viewProject.id)} disabled={uploading}><Ic.up size={13} /> {uploading ? "Uploading..." : "Select & Upload Proof"}</Btn>
        </div>
      </Modal>
    </div>;
  }

  // ── LIST VIEW ──────────────────────────────────────────
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <PageHeader title="Design Studio">
      <SB value={sr} onChange={setSr} placeholder="Search clients..." />
      <Sel value={fPub} onChange={e => setFPub(e.target.value)} options={[{ value: "all", label: "All Publications" }, ...(pubs || []).map(p => ({ value: p.id, label: p.name }))]} />
      <Btn sm onClick={() => setCreateModal(true)}><Ic.plus size={13} /> New Project</Btn>
    </PageHeader>

    {/* View toggle + tabs */}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <TabRow><TB tabs={["Active", "Completed", "All"]} active={tab} onChange={setTab} /></TabRow>
      <div style={{ display: "flex", gap: 4 }}>
        {[["board", "Board"], ["list", "List"]].map(([v, l]) => (
          <button key={v} onClick={() => setView(v)} style={{ padding: "4px 12px", borderRadius: Ri, border: "none", cursor: "pointer", fontSize: 11, fontWeight: view === v ? FW.bold : 500, background: view === v ? Z.tx + "12" : "transparent", color: view === v ? Z.tx : Z.td }}>{l}</button>
        ))}
      </div>
    </div>

    {loading ? <div style={{ padding: 40, textAlign: "center", color: Z.tm }}>Loading...</div> :

    /* ═══ STATS BAR ═══ */
    <><div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 14 }}>
      {[
        { label: "In Queue", value: filtered.filter(p => p.status === "brief" || p.status === "awaiting_art").length, color: Z.tm },
        { label: "In Progress", value: filtered.filter(p => p.status === "designing").length, color: ACCENT.blue },
        { label: "Proofs Out", value: filtered.filter(p => p.status === "proof_sent" || p.status === "revising").length, color: Z.wa },
        { label: "Approved", value: filtered.filter(p => p.status === "approved").length, color: Z.go },
        { label: "At Risk", value: filtered.filter(p => { const iss = (issues || []).find(i => i.id === p.issue_id); return iss?.adDeadline && Math.ceil((new Date(iss.adDeadline + "T12:00:00") - new Date()) / 86400000) <= 3 && !["approved", "signed_off", "placed"].includes(p.status); }).length, color: Z.da },
      ].map(s => (
        <div key={s.label} style={{ padding: "8px 12px", background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: Ri, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</span>
          <span style={{ fontSize: 16, fontWeight: FW.black, color: s.value > 0 && s.label === "At Risk" ? Z.da : s.color }}>{s.value}</span>
        </div>
      ))}
    </div>

    {/* ═══ HEATMAP ═══ */}
    {view === "board" && (() => {
      const activePubs = (pubs || []).filter(p => p.isActive !== false);
      const today = new Date().toISOString().slice(0, 10);
      return <div style={{ marginBottom: 14, padding: "12px 16px", background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: Ri }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: COND }}>Deadline Heatmap</span>
          <span style={{ fontSize: 9, color: Z.td }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#DC2626", marginRight: 3 }}></span>≤3d
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#D97706", marginLeft: 8, marginRight: 3 }}></span>4-7d
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#16A34A", marginLeft: 8, marginRight: 3 }}></span>8+d
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {activePubs.map(pub => {
            const pubIssues = (issues || []).filter(i => i.pubId === pub.id && i.date >= today && i.date <= cutoff30d).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
            if (pubIssues.length === 0) return null;
            return <div key={pub.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: FW.semi, color: Z.tm, width: 160, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pub.name}</span>
              <div style={{ display: "flex", gap: 6 }}>
                {pubIssues.map(iss => {
                  const adDl = iss.adDeadline ? Math.ceil((new Date(iss.adDeadline + "T12:00:00") - new Date()) / 86400000) : 99;
                  const count = filtered.filter(p => p.publication_id === pub.id && p.issue_id === iss.id && !["approved", "signed_off", "placed"].includes(p.status)).length;
                  const dotColor = count === 0 ? Z.bd : adDl <= 3 ? "#DC2626" : adDl <= 7 ? "#D97706" : "#16A34A";
                  const isActive = heatmapFilter?.pubId === pub.id && heatmapFilter?.issueId === iss.id;
                  return <div key={iss.id} onClick={() => setHeatmapFilter(isActive ? null : { pubId: pub.id, issueId: iss.id, label: `${pub.name} ${iss.label}` })} title={`${iss.label} — ${count} ads, ${adDl}d to deadline`} style={{ width: 26, height: 26, borderRadius: "50%", background: count > 0 ? dotColor : Z.sa, border: `2px solid ${isActive ? Z.tx : "transparent"}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: count > 0 ? "#fff" : Z.td, transition: "all 0.15s" }}>{count > 0 ? count : "·"}</div>;
                })}
              </div>
            </div>;
          })}
        </div>
        {heatmapFilter && <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, padding: "4px 10px", background: Z.ac + "10", borderRadius: Ri }}>
          <span style={{ fontSize: FS.xs, color: Z.ac, fontWeight: FW.bold }}>Filtered: {heatmapFilter.label}</span>
          <button onClick={() => setHeatmapFilter(null)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.ac, fontSize: 14, fontWeight: 900 }}>×</button>
        </div>}
      </div>;
    })()}

    {/* ═══ KANBAN BOARD ═══ */}
    {view === "board" ? <div style={{ display: "grid", gridTemplateColumns: `repeat(${KANBAN_COLS.length}, 1fr)`, gap: 10, minHeight: 400 }}>
      {KANBAN_COLS.map(col => {
        const colProjects = filtered
          .filter(p => (p.status === col || (col === "brief" && p.status === "awaiting_art")))
          .filter(p => !heatmapFilter || (p.publication_id === heatmapFilter.pubId && p.issue_id === heatmapFilter.issueId));
        const colSt = STATUSES[col];
        return <div key={col} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: colSt.color + "12", borderRadius: Ri }}>
            <span style={{ fontSize: 11, fontWeight: FW.heavy, color: colSt.color, textTransform: "uppercase", letterSpacing: 0.5 }}>{colSt.label}</span>
            <span style={{ fontSize: 12, fontWeight: FW.black, color: colSt.color }}>{colProjects.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, overflowY: "auto", maxHeight: 500 }}>
            {colProjects.map(p => {
              const iss = (issues || []).find(i => i.id === p.issue_id);
              const adDl = iss?.adDeadline ? Math.ceil((new Date(iss.adDeadline + "T12:00:00") - new Date()) / 86400000) : 99;
              const urgColor = adDl <= 3 ? Z.da : adDl <= 7 ? Z.wa : Z.go;
              const isUnassigned = !p.designer_id;
              const latestProof = proofs.filter(pr => pr.project_id === p.id).sort((a, b) => (b.version || 0) - (a.version || 0))[0];
              const isCameraReady = p.art_source === "camera_ready";
              const daysAgo = p.updated_at ? Math.round((new Date() - new Date(p.updated_at)) / 86400000) : 0;
              const approvedOpacity = col === "approved" ? Math.max(0.6, 1 - daysAgo * 0.15) : 1;

              return <div key={p.id} onClick={() => setViewId(p.id)} style={{
                padding: "10px 12px", background: Z.bg, borderRadius: Ri, cursor: "pointer",
                borderLeft: isUnassigned ? "none" : `3px solid ${urgColor}`,
                border: isUnassigned ? `1.5px dashed #E24B4A50` : undefined,
                opacity: approvedOpacity, transition: "opacity 0.2s",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cn(p.client_id)}</div>
                    <div style={{ fontSize: FS.xs, color: Z.tm }}>{pn(p.publication_id)} · {iss?.label || ""} · {p.ad_size || "Ad"}</div>
                  </div>
                  {latestProof?.proof_url?.match(/\.(jpg|jpeg|png|gif|webp)$/i) && <img src={latestProof.proof_url} alt="" loading="lazy" style={{ width: 32, height: 32, borderRadius: 3, objectFit: "cover", flexShrink: 0 }} />}
                </div>
                {/* Overdue / incomplete-after-press flags */}
                {iss && iss.date < today && !["approved", "signed_off", "placed"].includes(p.status) && <div style={{ fontSize: 9, fontWeight: FW.bold, color: "#fff", background: Z.da, padding: "2px 6px", borderRadius: Ri, marginTop: 4, display: "inline-block" }}>INCOMPLETE — PAST PRESS</div>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {adDl < 99 && adDl > 0 && <span style={{ fontSize: 10, fontWeight: FW.bold, color: urgColor }}>{adDl}d</span>}
                    {adDl <= 0 && !(iss && iss.date < today) && <span style={{ fontSize: 9, fontWeight: FW.bold, color: "#fff", background: Z.da, padding: "1px 5px", borderRadius: Ri }}>OVERDUE</span>}
                    <span style={{ fontSize: 9, fontWeight: FW.bold, color: isCameraReady ? Z.wa : Z.ac, background: (isCameraReady ? Z.wa : Z.ac) + "15", padding: "1px 5px", borderRadius: Ri }}>{isCameraReady ? "CR" : "Design"}</span>
                  </div>
                  {isUnassigned
                    ? <span style={{ fontSize: 10, fontWeight: FW.bold, color: Z.da }}>Unassigned</span>
                    : <span style={{ fontSize: 10, color: Z.tm }}>{tn(p.designer_id)?.split(" ")[0]}</span>
                  }
                </div>
                {col === "brief" && isCameraReady && <div style={{ fontSize: 10, fontWeight: FW.bold, color: Z.wa, marginTop: 4 }}>Awaiting client artwork</div>}
              </div>;
            })}
            {colProjects.length === 0 && <div style={{ padding: 16, textAlign: "center", color: Z.td, fontSize: FS.xs }}>Empty</div>}
          </div>
        </div>;
      })}
    </div>

    : /* ═══ LIST VIEW ═══ */
    <DataTable>
      <thead><tr>
        {["Client", "Publication", "Issue", "Ad Size", "Art Source", "Designer", "Status", "Revisions", "Updated"].map(h => <th key={h}>{h}</th>)}
      </tr></thead>
      <tbody>
        {filtered.length === 0 ? <tr><td colSpan={9} style={{ textAlign: "center", color: Z.td, padding: 20 }}>No ad projects</td></tr>
        : filtered.map(p => {
          const st = STATUSES[p.status] || STATUSES.brief;
          return <tr key={p.id} onClick={() => setViewId(p.id)} style={{ cursor: "pointer" }}>
            <td style={{ fontWeight: FW.semi, color: Z.tx }}>{cn(p.client_id)}</td>
            <td style={{ color: Z.tm }}>{pn(p.publication_id)}</td>
            <td style={{ color: Z.tm, fontSize: FS.sm }}>{p.issue_id ? ((issues || []).find(i => i.id === p.issue_id)?.label || "—") : "—"}</td>
            <td style={{ color: Z.tm, fontSize: FS.sm }}>{p.ad_size || "—"}</td>
            <td><span style={{ fontSize: 10, fontWeight: FW.bold, color: p.art_source === "camera_ready" ? Z.wa : Z.ac, background: (p.art_source === "camera_ready" ? Z.wa : Z.ac) + "15", padding: "2px 6px", borderRadius: Ri }}>{p.art_source === "camera_ready" ? "Camera Ready" : "We Design"}</span></td>
            <td style={{ color: Z.tm, fontSize: FS.sm }}>{tn(p.designer_id)}</td>
            <td><Badge status={st.label} small /></td>
            <td style={{ color: p.revision_count >= 3 ? Z.wa : Z.tm }}>{p.revision_count || 0}</td>
            <td style={{ color: Z.td, fontSize: FS.sm }}>{fmtDate(p.updated_at)}</td>
          </tr>;
        })}
      </tbody>
    </DataTable>}
    </>}

    {/* CREATE PROJECT MODAL */}
    <Modal open={createModal} onClose={() => setCreateModal(false)} title="New Ad Project" width={600}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Sel label="Client" value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))} options={[{ value: "", label: "Select client..." }, ...(clients || []).map(c => ({ value: c.id, label: c.name }))]} />
          <Sel label="Publication" value={form.publicationId} onChange={e => setForm(f => ({ ...f, publicationId: e.target.value }))} options={[{ value: "", label: "Select publication..." }, ...(pubs || []).map(p => ({ value: p.id, label: p.name }))]} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Sel label="Issue" value={form.issueId} onChange={e => setForm(f => ({ ...f, issueId: e.target.value }))} options={[{ value: "", label: "Select issue..." }, ...(issues || []).filter(i => i.pubId === form.publicationId && i.date >= new Date().toISOString().slice(0, 10)).map(i => ({ value: i.id, label: i.label }))]} />
          <Inp label="Ad Size" value={form.adSize} onChange={e => setForm(f => ({ ...f, adSize: e.target.value }))} placeholder="e.g. Full Page, 1/2 Page H" />
        </div>
        <Sel label="Assign Designer" value={form.designerId} onChange={e => setForm(f => ({ ...f, designerId: e.target.value }))} options={[{ value: "", label: "Select designer..." }, ...designers.map(d => ({ value: d.id, label: d.name }))]} />
        <TA label="Design Instructions" value={form.designNotes} onChange={e => setForm(f => ({ ...f, designNotes: e.target.value }))} rows={4} placeholder="Describe the ad design direction, reference previous ads, include any client preferences..." />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Client Contact Name" value={form.clientContactName} onChange={e => setForm(f => ({ ...f, clientContactName: e.target.value }))} placeholder="Optional" />
          <Inp label="Client Contact Email" value={form.clientContactEmail} onChange={e => setForm(f => ({ ...f, clientContactEmail: e.target.value }))} placeholder="Optional" />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="secondary" sm onClick={() => setCreateModal(false)}>Cancel</Btn>
          <Btn sm onClick={createProject} disabled={!form.clientId || !form.publicationId}>Create Project</Btn>
        </div>
      </div>
    </Modal>
  </div>;
};

export default memo(AdProjects);
