import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R, INV } from "../lib/theme";
import { Ic, Btn, Inp, TA, Sel, Modal, Badge, PageHeader, GlassCard, TabRow, TB, TabPipe, DataTable, SB, Toggle, Pill } from "../components/ui";
import { supabase, isOnline } from "../lib/supabase";
import ChatPanel from "../components/ChatPanel";

const STATUSES = {
  brief: { label: "Brief", color: Z.wa },
  designing: { label: "Designing", color: Z.ac },
  proof_sent: { label: "Proof Sent", color: Z.pu },
  revising: { label: "Revising", color: Z.wa },
  approved: { label: "Approved", color: Z.go },
  signed_off: { label: "Signed Off", color: Z.go },
  placed: { label: "Placed", color: Z.go },
};

const PROXY_URL = "https://hqywacyhpllapdwccmaw.supabase.co/functions/v1/bunny-storage";
const CDN_BASE = "https://cdn.13stars.media";

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "\u2014";
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";

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
  const filtered = useMemo(() => {
    let list = projects;
    if (tab === "Active") list = list.filter(p => !["signed_off", "placed"].includes(p.status));
    else if (tab === "Completed") list = list.filter(p => ["signed_off", "placed"].includes(p.status));
    if (fPub !== "all") list = list.filter(p => p.publication_id === fPub);
    if (sr) { const q = sr.toLowerCase(); list = list.filter(p => cn(p.client_id).toLowerCase().includes(q)); }
    return list;
  }, [projects, tab, fPub, sr, clients]);

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
          // Update project status
          await supabase.from("ad_projects").update({ status: "proof_sent", revision_count: version, updated_at: new Date().toISOString() }).eq("id", projectId);
          setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: "proof_sent", revision_count: version } : p));
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
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <PageHeader title={`${cn(viewProject.client_id)} \u2014 ${pn(viewProject.publication_id)}`}>
        <Btn sm v="ghost" onClick={() => setViewId(null)}>\u2190 Back</Btn>
        <Badge status={st.label} small />
      </PageHeader>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* LEFT: Project details + proofs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Brief */}
          <GlassCard>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Design Brief</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: FS.sm, marginBottom: 8 }}>
              <div><span style={{ color: Z.td }}>Ad Size:</span> <span style={{ color: Z.tx, fontWeight: FW.semi }}>{viewProject.ad_size || "\u2014"}</span></div>
              <div><span style={{ color: Z.td }}>Designer:</span> <span style={{ color: Z.tx, fontWeight: FW.semi }}>{tn(viewProject.designer_id)}</span></div>
              <div><span style={{ color: Z.td }}>Issue:</span> <span style={{ color: Z.tx, fontWeight: FW.semi }}>{viewProject.issue_id ? (issues || []).find(i => i.id === viewProject.issue_id)?.label || viewProject.issue_id : "\u2014"}</span></div>
              <div><span style={{ color: Z.td }}>Revisions:</span> <span style={{ color: viewProject.revision_count >= 3 ? Z.wa : Z.tx, fontWeight: FW.semi }}>{viewProject.revision_count || 0}{viewProject.revision_count >= 4 ? ` ($${(viewProject.revision_count - 3) * 25} charges)` : ""}</span></div>
            </div>
            {viewProject.design_notes && <div style={{ fontSize: FS.sm, color: Z.tx, padding: "8px 12px", background: Z.bg, borderRadius: Ri, whiteSpace: "pre-wrap" }}>{viewProject.design_notes}</div>}
            {viewProject.client_contact_name && <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 6 }}>Client contact: {viewProject.client_contact_name} {viewProject.client_contact_email && `\u2014 ${viewProject.client_contact_email}`}</div>}
          </GlassCard>

          {/* Proofs */}
          <GlassCard>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Proofs ({viewProofs.length})</span>
              <Btn sm onClick={() => setProofModal(true)} disabled={uploading}><Ic.up size={12} /> Upload Proof</Btn>
            </div>
            {viewProofs.map(proof => (
              <div key={proof.id} style={{ padding: "10px 12px", background: Z.bg, borderRadius: Ri, marginBottom: 6, borderLeft: `3px solid ${proof.client_status === "approved" ? Z.go : proof.client_status === "changes_requested" ? Z.wa : Z.tm}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>Version {proof.version}</span>
                    <span style={{ fontSize: FS.xs, color: Z.tm, marginLeft: 8 }}>{fmtDate(proof.created_at)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <Badge status={proof.client_status === "approved" ? "Approved" : proof.client_status === "changes_requested" ? "Changes" : "Pending"} small />
                    <Btn sm v="ghost" onClick={() => copyApprovalLink(proof)}>Copy Link</Btn>
                    <Btn sm v="ghost" onClick={() => window.open(proof.proof_url, "_blank")}>View</Btn>
                  </div>
                </div>
                {proof.designer_notes && <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 4 }}>Designer notes: {proof.designer_notes}</div>}
                {proof.client_notes && <div style={{ fontSize: FS.xs, color: Z.tx, marginTop: 4, padding: "4px 8px", background: Z.sa, borderRadius: Ri }}>Client: {proof.client_notes}</div>}
                {(proof.client_annotations || []).length > 0 && <div style={{ fontSize: FS.xs, color: Z.wa, marginTop: 2 }}>{proof.client_annotations.length} annotation{proof.client_annotations.length !== 1 ? "s" : ""} on proof</div>}
              </div>
            ))}
            {viewProofs.length === 0 && <div style={{ padding: 16, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No proofs uploaded yet</div>}
          </GlassCard>

          {/* Sign-off */}
          {viewProject.status === "approved" || viewProject.revision_count > 0 ? <GlassCard>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Sign-Off</div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1, padding: "10px 14px", background: Z.bg, borderRadius: Ri, textAlign: "center" }}>
                <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>Designer</div>
                {viewProject.designer_signoff ? <div style={{ color: Z.go, fontWeight: FW.bold, marginTop: 4 }}>\u2713 Signed off</div>
                  : <Btn sm style={{ marginTop: 4 }} onClick={() => signOff(viewProject.id, "designer")}>Sign Off</Btn>}
              </div>
              <div style={{ flex: 1, padding: "10px 14px", background: Z.bg, borderRadius: Ri, textAlign: "center" }}>
                <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>Salesperson</div>
                {viewProject.salesperson_signoff ? <div style={{ color: Z.go, fontWeight: FW.bold, marginTop: 4 }}>\u2713 Signed off</div>
                  : <Btn sm style={{ marginTop: 4 }} onClick={() => signOff(viewProject.id, "salesperson")}>Sign Off</Btn>}
              </div>
            </div>
          </GlassCard> : null}
        </div>

        {/* RIGHT: Messages */}
        <GlassCard style={{ display: "flex", flexDirection: "column", maxHeight: 600 }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Project Chat</div>
          <ChatPanel threadId={viewThread?.id} currentUser={currentUser} height={500} placeholder="Message about this project..." />
        </GlassCard>
      </div>

      {/* Proof upload modal */}
      <Modal open={proofModal} onClose={() => setProofModal(false)} title="Upload Proof" width={440}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <TA label="Notes to Client" value={proofForm.designerNotes} onChange={e => setProofForm(f => ({ ...f, designerNotes: e.target.value }))} placeholder="Any notes for the client about this version..." rows={3} />
          <Btn onClick={() => uploadProof(viewProject.id)} disabled={uploading}><Ic.up size={13} /> {uploading ? "Uploading..." : "Select & Upload Proof"}</Btn>
        </div>
      </Modal>
    </div>;
  }

  // ── LIST VIEW ──────────────────────────────────────────
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <PageHeader title="Ad Projects">
      <SB value={sr} onChange={setSr} placeholder="Search clients..." />
      <Sel value={fPub} onChange={e => setFPub(e.target.value)} options={[{ value: "all", label: "All Publications" }, ...(pubs || []).map(p => ({ value: p.id, label: p.name }))]} />
      <Btn sm onClick={() => setCreateModal(true)}><Ic.plus size={13} /> New Project</Btn>
    </PageHeader>

    <TabRow><TB tabs={["Active", "Completed", "All"]} active={tab} onChange={setTab} /></TabRow>

    {loading ? <div style={{ padding: 40, textAlign: "center", color: Z.tm }}>Loading...</div> :
    <DataTable>
      <thead><tr>
        {["Client", "Publication", "Issue", "Ad Size", "Designer", "Status", "Revisions", "Updated"].map(h => <th key={h}>{h}</th>)}
      </tr></thead>
      <tbody>
        {filtered.length === 0 ? <tr><td colSpan={8} style={{ textAlign: "center", color: Z.td, padding: 20 }}>No ad projects</td></tr>
        : filtered.map(p => {
          const st = STATUSES[p.status] || STATUSES.brief;
          return <tr key={p.id} onClick={() => setViewId(p.id)} style={{ cursor: "pointer" }}>
            <td style={{ fontWeight: FW.semi, color: Z.tx }}>{cn(p.client_id)}</td>
            <td style={{ color: Z.tm }}>{pn(p.publication_id)}</td>
            <td style={{ color: Z.tm, fontSize: FS.sm }}>{p.issue_id ? ((issues || []).find(i => i.id === p.issue_id)?.label || "\u2014") : "\u2014"}</td>
            <td style={{ color: Z.tm, fontSize: FS.sm }}>{p.ad_size || "\u2014"}</td>
            <td style={{ color: Z.tm, fontSize: FS.sm }}>{tn(p.designer_id)}</td>
            <td><Badge status={st.label} small /></td>
            <td style={{ color: p.revision_count >= 3 ? Z.wa : Z.tm }}>{p.revision_count || 0}</td>
            <td style={{ color: Z.td, fontSize: FS.sm }}>{fmtDate(p.updated_at)}</td>
          </tr>;
        })}
      </tbody>
    </DataTable>}

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
