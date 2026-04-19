import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R, INV, ACCENT } from "../lib/theme";
import { Ic, Btn, Inp, TA, Sel, Modal, Badge, PageHeader, GlassCard, TabRow, TB, TabPipe, DataTable, SB, Toggle, Pill } from "../components/ui";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { supabase, isOnline, EDGE_FN_URL } from "../lib/supabase";
import ChatPanel from "../components/ChatPanel";
import AssetPanel from "../components/AssetPanel";
import { fmtDateShort as fmtDate, fmtTime } from "../lib/formatters";
import { useDialog } from "../hooks/useDialog";
import { uploadMedia } from "../lib/media";
import { useAppData } from "../hooks/useAppData";

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

// Columns for the Active-tab issue × status grid. needs_brief is a
// synthetic column for closed sales that don't yet have an ad_project.
const STATUS_COLS = ["needs_brief", "brief", "designing", "proof_sent", "revising", "approved"];

// Non-display product types that Flatplan already excludes — these
// don't need design work in the same sense.
const EXCLUDED_SIZES = new Set([
  "Calendar Listing", "Church Listing", "Legal Notice", "Classified", "Obituary",
]);

const PROXY_URL = EDGE_FN_URL + "/bunny-storage";
const CDN_BASE = "https://cdn.13stars.media";


const AdProjects = ({ pubs, clients, sales, issues, team, currentUser, isActive, deepLink }) => {
  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({ breadcrumb: [{ label: "Home" }, { label: "Design Studio" }], title: "Design Studio" });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);
  const dialog = useDialog();
  // useAppData is now the source of truth for ad_projects. Local aliases
  // keep the rest of this file readable — `projects` and `setProjects`
  // still work as before but mutate shared state.
  const { adProjects, setAdProjects, loadAdProjects, adProjectBySaleId, linkAdProject, unlinkAdProject, findLinkCandidates } = useAppData();
  const projects = adProjects;
  const setProjects = setAdProjects;
  const [tab, setTab] = useState("Active");
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

  // Create form — _saleId is seeded when the user clicks a Needs Brief card
  const [form, setForm] = useState({
    clientId: "", publicationId: "", issueId: "", adSize: "",
    designNotes: "", designerId: "", clientContactName: "", clientContactEmail: "",
    referenceAds: [], _saleId: null,
  });

  // Deep-link receivers: honor navigation from other pages. Fires only while
  // this page is active. Depends on `projects` being loaded — the effect
  // reruns when that list changes so "?saleId=X" can resolve after load.
  useEffect(() => {
    if (!isActive || !deepLink) return;
    if (deepLink.projectId) {
      setViewId(deepLink.projectId);
      return;
    }
    if (deepLink.saleId) {
      const match = adProjectBySaleId?.get?.(deepLink.saleId);
      if (match) {
        setViewId(match.id);
      } else {
        // No project yet for this sale — seed the Create Brief modal.
        const sale = (sales || []).find(s => s.id === deepLink.saleId);
        if (sale) {
          setForm(f => ({
            ...f,
            clientId: sale.clientId || "",
            publicationId: sale.publication || "",
            issueId: sale.issueId || "",
            adSize: sale.size || "",
            _saleId: sale.id,
          }));
          setCreateModal(true);
        }
      }
      return;
    }
    if (deepLink.pubId) {
      setFPub(deepLink.pubId);
      if (deepLink.issueId) {
        const pub = (pubs || []).find(p => p.id === deepLink.pubId);
        const iss = (issues || []).find(i => i.id === deepLink.issueId);
        setHeatmapFilter({
          pubId: deepLink.pubId,
          issueId: deepLink.issueId,
          label: `${pub?.name || ""} ${iss?.label || ""}`.trim(),
        });
      }
    }
  }, [deepLink, isActive, adProjectBySaleId, sales, pubs, issues]);

  // Proof upload form
  const [proofForm, setProofForm] = useState({ designerNotes: "" });

  const cn = (id) => (clients || []).find(c => c.id === id)?.name || "\u2014";
  const pn = (id) => (pubs || []).find(p => p.id === id)?.name || "\u2014";
  const tn = (id) => (team || []).find(t => t.id === id)?.name || "\u2014";
  const designers = (team || []).filter(t => ["Graphic Designer", "Production Manager"].includes(t.role) && t.isActive !== false);

  // ── Load data ──────────────────────────────────────────
  // ad_projects is loaded via useAppData (shared cache). Proofs + threads
  // still live locally in this page for now — they're not yet shared state.
  useEffect(() => {
    if (!isOnline()) { setLoading(false); return; }
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    supabase.from("ad_proofs").delete().is("saved_at", null).lt("created_at", cutoff).then(() => {
      Promise.all([
        loadAdProjects(),
        supabase.from("ad_proofs").select("*").order("version", { ascending: false }),
        supabase.from("message_threads").select("*").eq("type", "ad_project"),
      ]).then(([_proj, proofRes, threadRes]) => {
        if (proofRes.data) setProofs(proofRes.data);
        if (threadRes.data) setThreads(threadRes.data);
        setLoading(false);
      });
    });
  }, [loadAdProjects]);

  // Save a proof (stamps saved_at so it's retained past the 7-day expiration).
  const saveProof = async (proofId) => {
    const nowIso = new Date().toISOString();
    const { data } = await supabase.from("ad_proofs")
      .update({ saved_at: nowIso, saved_by: currentUser?.id || null })
      .eq("id", proofId).select().single();
    if (data) setProofs(prev => prev.map(p => p.id === proofId ? { ...p, saved_at: data.saved_at, saved_by: data.saved_by } : p));
  };

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

  // ── Issue × Status grid (Active tab, board view) ───────
  // Source of truth is SALES, not ad_projects. Every closed/follow-up sale
  // for an upcoming issue becomes a card; its design state is an overlay
  // pulled from adProjectBySaleId (or a synthetic 'needs_brief' state if
  // no ad_project exists yet). Rows are issues, columns are statuses.
  const gridData = useMemo(() => {
    if (tab !== "Active") return [];
    const pastCutoff = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const futureCutoff = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);

    const upcomingIssues = (issues || [])
      .filter(i => i.date && i.date >= pastCutoff && i.date <= futureCutoff)
      .filter(i => fPub === "all" || i.pubId === fPub)
      .sort((a, b) => a.date.localeCompare(b.date));
    const issueIndex = new Map(upcomingIssues.map(i => [i.id, i]));

    const rows = upcomingIssues.map(iss => ({
      issue: iss,
      cells: Object.fromEntries(STATUS_COLS.map(c => [c, []])),
    }));
    const rowByIssueId = new Map(rows.map(r => [r.issue.id, r]));

    const q = sr.trim().toLowerCase();
    for (const s of (sales || [])) {
      if (!s.issueId || !issueIndex.has(s.issueId)) continue;
      if (!["Closed", "Follow-up"].includes(s.status)) continue;
      if (EXCLUDED_SIZES.has(s.size)) continue;
      if (q && !cn(s.clientId).toLowerCase().includes(q)) continue;

      const project = adProjectBySaleId.get(s.id) || null;
      let col;
      if (!project) col = "needs_brief";
      else if (project.status === "awaiting_art") col = "brief";
      else if (STATUS_COLS.includes(project.status)) col = project.status;
      else continue; // signed_off / placed fall out of Active view

      const row = rowByIssueId.get(s.issueId);
      if (row) row.cells[col].push({ sale: s, project });
    }

    // Drop empty rows so the grid only shows issues with real work.
    return rows.filter(r => STATUS_COLS.some(c => r.cells[c].length > 0));
  }, [tab, sales, issues, adProjectBySaleId, fPub, sr, clients]);

  // Aggregates derived from the grid: stats bar counts + per-issue counts
  // for the deadline heatmap. Kept close to gridData so they stay in sync.
  const gridStats = useMemo(() => {
    let inQueue = 0, inProgress = 0, proofsOut = 0, approved = 0, atRisk = 0;
    const countByIssueId = new Map();
    for (const row of gridData) {
      const adDl = row.issue.adDeadline
        ? Math.ceil((new Date(row.issue.adDeadline + "T12:00:00") - new Date()) / 86400000)
        : 99;
      const isUrgent = adDl <= 3;
      let issueCount = 0;
      for (const col of STATUS_COLS) {
        const n = row.cells[col].length;
        if (col === "needs_brief" || col === "brief") inQueue += n;
        else if (col === "designing") inProgress += n;
        else if (col === "proof_sent" || col === "revising") proofsOut += n;
        else if (col === "approved") approved += n;
        if (isUrgent && col !== "approved") atRisk += n;
        if (col !== "approved") issueCount += n;
      }
      countByIssueId.set(row.issue.id, issueCount);
    }
    return { inQueue, inProgress, proofsOut, approved, atRisk, countByIssueId };
  }, [gridData]);

  // Flat list of { sale, project, issue, status } for the Active-tab list
  // view. Same source data as gridData, just ungrouped.
  const gridRows = useMemo(() => {
    const rows = [];
    for (const row of gridData) {
      for (const col of STATUS_COLS) {
        for (const entry of row.cells[col]) {
          rows.push({ sale: entry.sale, project: entry.project, issue: row.issue, status: col });
        }
      }
    }
    return rows;
  }, [gridData]);

  // ── Create project ─────────────────────────────────────
  // Every ad_project must belong to a sale (migration 027 enforces this).
  // The form carries _saleId, set when the user clicks a "Needs Brief"
  // card. Block submission if it's missing.
  const createProject = async () => {
    if (!form._saleId) {
      await dialog.alert("This form needs a linked sale. Click a 'Needs Brief' card on the grid to start a project.");
      return;
    }
    if (!form.clientId || !form.publicationId) return;
    const clientSlug = cn(form.clientId).toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const assetPath = `clients/${clientSlug}/assets`;

    // Create thread first
    const { data: thread } = await supabase.from("message_threads").insert({
      type: "ad_project", title: `Ad: ${cn(form.clientId)} \u2014 ${pn(form.publicationId)}`,
      participants: [currentUser?.id, form.designerId].filter(Boolean),
    }).select().single();

    const { data: proj } = await supabase.from("ad_projects").insert({
      sale_id: form._saleId,
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
    setForm({ clientId: "", publicationId: "", issueId: "", adSize: "", designNotes: "", designerId: "", clientContactName: "", clientContactEmail: "", referenceAds: [], _saleId: null });
  };

  // ── Upload proof ───────────────────────────────────────
  // Cap each project at 5 proofs total. If there are already 5, the oldest
  // unsaved proof gets deleted to make room (saved proofs are preserved).
  // If all 5 are saved, the upload is rejected with a dialog.
  const uploadProof = async (projectId) => {
    const existing = proofs.filter(p => p.project_id === projectId);
    if (existing.length >= 5) {
      const oldestUnsaved = existing.filter(p => !p.saved_at).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
      if (!oldestUnsaved) {
        await dialog.alert("This project has 5 saved proofs already. Delete one before uploading a new version.");
        return;
      }
      // Drop the oldest unsaved to free a slot
      await supabase.from("ad_proofs").delete().eq("id", oldestUnsaved.id);
      setProofs(prev => prev.filter(p => p.id !== oldestUnsaved.id));
    }
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*,application/pdf";
    inp.onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      setUploading(true);
      const proj = projects.find(p => p.id === projectId);
      const version = (proofs.filter(p => p.project_id === projectId).length || 0) + 1;

      try {
        // Land the file on Bunny + write a tagged media_assets row so the
        // Media Library can surface it by ad_project_id/client filter.
        const mediaRow = await uploadMedia(f, {
          category: "ad_proof",
          adProjectId: projectId,
          clientId: proj?.client_id || null,
          publicationId: proj?.publication_id || null,
          caption: `Proof v${version}`,
        });
        const cdnUrl = mediaRow.cdn_url;
        const filename = mediaRow.file_name;

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
      } catch (err) { await dialog.alert("Upload failed: " + err.message); }
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

      {/* Linked project banner — shown if this project is linked (secondary) */}
      {viewProject.status === "linked" && viewProject.linked_to_project_id && (() => {
        const primary = projects.find(p => p.id === viewProject.linked_to_project_id);
        return (
          <div style={{ padding: "10px 14px", background: Z.ac + "10", border: `1px solid ${Z.ac}30`, borderRadius: Ri, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.ac }}>Linked to </span>
              <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
                onClick={() => primary && setViewId(primary.id)}
              >{primary ? `${cn(primary.client_id)} — ${pn(primary.publication_id)}` : "another project"}</span>
              <span style={{ fontSize: FS.xs, color: Z.tm, marginLeft: 8 }}>Design work happens on the primary project.</span>
            </div>
            <Btn sm v="secondary" onClick={async () => { await unlinkAdProject(viewProject.id); }}>Unlink</Btn>
          </div>
        );
      })()}

      {/* Linked projects badge — shown if other projects are linked TO this one (primary) */}
      {(() => {
        const linkedTo = projects.filter(p => p.linked_to_project_id === viewProject.id);
        if (linkedTo.length === 0) return null;
        return (
          <div style={{ padding: "10px 14px", background: Z.go + "10", border: `1px solid ${Z.go}30`, borderRadius: Ri }}>
            <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.go }}>Also running in: </span>
            {linkedTo.map((lp, i) => (
              <span key={lp.id}>
                {i > 0 && ", "}
                <span style={{ fontWeight: FW.bold, color: Z.tx }}>{pn(lp.publication_id)}</span>
              </span>
            ))}
          </div>
        );
      })()}

      {/* Link to another project button — shown when not already linked and candidates exist */}
      {viewProject.status !== "linked" && !viewProject.linked_to_project_id && (() => {
        const candidates = findLinkCandidates(viewProject.id);
        if (candidates.length === 0) return null;
        return (
          <div style={{ padding: "10px 14px", background: Z.wa + "10", border: `1px solid ${Z.wa}30`, borderRadius: Ri, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.wa }}>Shared content match found — </span>
              <span style={{ fontSize: FS.sm, color: Z.tx }}>
                {candidates.map((c, i) => (
                  <span key={c.id}>{i > 0 && ", "}{cn(c.client_id)} in {pn(c.publication_id)}</span>
                ))}
              </span>
            </div>
            <Btn sm onClick={async () => {
              // Link the candidate as secondary (this project becomes primary)
              await linkAdProject(candidates[0].id, viewProject.id);
            }}>Link Ad Project</Btn>
          </div>
        );
      })()}

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
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: FS.sm, fontWeight: FW.black, color: Z.tx }}>v{latestProof.version}</span>
                        {(() => {
                          if (latestProof.saved_at) return <span style={{ fontSize: 9, fontWeight: FW.bold, color: Z.go, background: Z.go + "15", padding: "1px 6px", borderRadius: Ri, textTransform: "uppercase", letterSpacing: 0.3 }}>Saved</span>;
                          const daysOld = Math.floor((Date.now() - new Date(latestProof.created_at)) / 86400000);
                          const expiresIn = Math.max(0, 7 - daysOld);
                          return <span style={{ fontSize: 9, fontWeight: FW.bold, color: Z.wa, background: Z.wa + "15", padding: "1px 6px", borderRadius: Ri, textTransform: "uppercase", letterSpacing: 0.3 }}>Expires {expiresIn}d</span>;
                        })()}
                      </div>
                      {(() => { const is = latestProof.internal_status || "uploaded"; const lbl = { uploaded: "Uploaded", ready: "Ready", edit: "Needs Edit", approved: "Approved", sent_to_client: "Sent" }[is] || is; const clr = { uploaded: Z.tm, ready: Z.ac, edit: Z.wa, approved: Z.go, sent_to_client: Z.go }[is] || Z.tm; return <span style={{ fontSize: 10, fontWeight: FW.bold, color: clr, background: clr + "15", padding: "2px 6px", borderRadius: Ri }}>{lbl}</span>; })()}
                    </div>
                    <div style={{ fontSize: FS.xs, color: Z.td }}>{fmtDate(latestProof.created_at)} · {viewProofs.length}/5 proofs</div>
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
                    {!latestProof.saved_at && <Btn sm v="success" onClick={() => saveProof(latestProof.id)} style={{ flex: 1 }} title="Save permanently — unsaved proofs expire in 7 days"><Ic.check size={11} /> Save</Btn>}
                    {(latestProof.internal_status || "uploaded") === "uploaded" && <Btn sm v="secondary" onClick={async () => { await supabase.from("ad_proofs").update({ internal_status: "ready" }).eq("id", latestProof.id); setProofs(prev => prev.map(p => p.id === latestProof.id ? { ...p, internal_status: "ready" } : p)); }} style={{ flex: 1 }}>Mark Ready</Btn>}
                    {latestProof.internal_status === "ready" && <Btn sm v="secondary" onClick={async () => { await supabase.from("ad_proofs").update({ internal_status: "edit" }).eq("id", latestProof.id); setProofs(prev => prev.map(p => p.id === latestProof.id ? { ...p, internal_status: "edit" } : p)); }} style={{ flex: 1 }}>Request Edit</Btn>}
                    {(latestProof.internal_status === "ready" || latestProof.internal_status === "approved") && <Btn sm onClick={() => copyApprovalLink(latestProof)} style={{ flex: 1 }}>Send to Client</Btn>}
                    <Btn sm v="secondary" onClick={() => setProofModal(true)} disabled={uploading || viewProofs.length >= 5} title={viewProofs.length >= 5 ? "Proof cap reached (5)" : undefined} style={{ flex: 1 }}><Ic.up size={11} /> New Version</Btn>
                  </div>
                </> : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, padding: 24 }}>
                  <div style={{ fontSize: FS.sm, color: Z.td }}>No proof yet</div>
                  <Btn sm onClick={() => setProofModal(true)} disabled={uploading}><Ic.up size={12} /> Upload Proof</Btn>
                  <Btn sm v="secondary" onClick={() => {
                    const inp = document.createElement("input"); inp.type = "file"; inp.multiple = true;
                    inp.accept = "image/*,application/pdf,.ai,.eps,.psd,.indd";
                    inp.onchange = async (e) => {
                      const files = Array.from(e.target.files); if (!files.length) return;
                      setUploading(true);
                      for (const f of files) {
                        try { await uploadMedia(f, { category: "ad_creative", adProjectId: viewProject.id, clientId: viewProject.client_id, publicationId: viewProject.publication_id }); } catch (err) { console.error("Asset upload error:", err); }
                      }
                      setUploading(false);
                    }; inp.click();
                  }} disabled={uploading}><Ic.up size={12} /> Upload Assets</Btn>
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
                <AssetPanel path={`clients/${clientCode}/projects/${viewProject.id}`} title="Project Assets" compact adProjectId={viewProject.id} clientId={viewProject.client_id} publicationId={viewProject.publication_id} category="ad_creative" bunnyFallbackFolder={viewProject.client_assets_path || `client-assets/${viewProject.id}`} />
                <AssetPanel path={`clients/${clientCode}/assets`} title="Client Library" compact clientId={viewProject.client_id} category="client_logo" />
              </div>
            </GlassCard>;
          })()}

          {/* Proof Version History (previous versions, up to 4 prior) */}
          {viewProofs.length > 1 && <GlassCard>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Version History</div>
              <div style={{ fontSize: FS.xs, color: Z.td, fontStyle: "italic" }}>Unsaved proofs auto-delete after 7 days</div>
            </div>
            {viewProofs.slice(1, 5).map(proof => {
              const is = proof.internal_status || "uploaded";
              const clr = { uploaded: Z.tm, ready: Z.ac, edit: Z.wa, approved: Z.go, sent_to_client: Z.go }[is] || Z.tm;
              const daysOld = Math.floor((Date.now() - new Date(proof.created_at)) / 86400000);
              const expiresIn = Math.max(0, 7 - daysOld);
              return <div key={proof.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: Z.bg, borderRadius: Ri, marginBottom: 2, borderLeft: `2px solid ${clr}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>v{proof.version}</span>
                  <span style={{ fontSize: FS.xs, color: Z.tm }}>{fmtDate(proof.created_at)}</span>
                  {proof.saved_at
                    ? <span style={{ fontSize: 9, fontWeight: FW.bold, color: Z.go, background: Z.go + "15", padding: "1px 6px", borderRadius: Ri, textTransform: "uppercase", letterSpacing: 0.3 }}>Saved</span>
                    : <span style={{ fontSize: 9, fontWeight: FW.bold, color: Z.wa, background: Z.wa + "15", padding: "1px 6px", borderRadius: Ri, textTransform: "uppercase", letterSpacing: 0.3 }}>Expires {expiresIn}d</span>}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {!proof.saved_at && <Btn sm v="success" onClick={() => saveProof(proof.id)} title="Save permanently"><Ic.check size={10} /> Save</Btn>}
                  <Btn sm v="ghost" onClick={() => window.open(proof.proof_url, "_blank")}>View</Btn>
                </div>
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
    {/* Action row — title moved to TopBar via usePageHeader. */}
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <SB value={sr} onChange={setSr} placeholder="Search clients..." />
      <Sel value={fPub} onChange={e => setFPub(e.target.value)} options={[{ value: "all", label: "All Publications" }, ...(pubs || []).map(p => ({ value: p.id, label: p.name }))]} />
    </div>

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
      {(tab === "Active" ? [
        { label: "In Queue", value: gridStats.inQueue, color: Z.tm },
        { label: "In Progress", value: gridStats.inProgress, color: ACCENT.blue },
        { label: "Proofs Out", value: gridStats.proofsOut, color: Z.wa },
        { label: "Approved", value: gridStats.approved, color: Z.go },
        { label: "At Risk", value: gridStats.atRisk, color: Z.da },
      ] : [
        { label: "In Queue", value: filtered.filter(p => p.status === "brief" || p.status === "awaiting_art").length, color: Z.tm },
        { label: "In Progress", value: filtered.filter(p => p.status === "designing").length, color: ACCENT.blue },
        { label: "Proofs Out", value: filtered.filter(p => p.status === "proof_sent" || p.status === "revising").length, color: Z.wa },
        { label: "Approved", value: filtered.filter(p => p.status === "approved").length, color: Z.go },
        { label: "At Risk", value: filtered.filter(p => { const iss = (issues || []).find(i => i.id === p.issue_id); return iss?.adDeadline && Math.ceil((new Date(iss.adDeadline + "T12:00:00") - new Date()) / 86400000) <= 3 && !["approved", "signed_off", "placed"].includes(p.status); }).length, color: Z.da },
      ]).map(s => (
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
                  const count = tab === "Active"
                    ? (gridStats.countByIssueId.get(iss.id) || 0)
                    : filtered.filter(p => p.publication_id === pub.id && p.issue_id === iss.id && !["approved", "signed_off", "placed"].includes(p.status)).length;
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

    {/* ═══ ISSUE × STATUS GRID (Active tab, board view) ═══ */}
    {view === "board" && tab === "Active" ? <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Column header row */}
      <div style={{ display: "grid", gridTemplateColumns: `200px repeat(${STATUS_COLS.length}, 1fr)`, gap: 8 }}>
        <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, padding: "8px 10px" }}>Issue</div>
        {STATUS_COLS.map(col => {
          const st = col === "needs_brief" ? { label: "Needs Brief", color: Z.tm } : STATUSES[col];
          return (
            <div key={col} style={{ padding: "6px 10px", background: st.color + "12", borderRadius: Ri, textAlign: "center" }}>
              <span style={{ fontSize: 10, fontWeight: FW.heavy, color: st.color, textTransform: "uppercase", letterSpacing: 0.5 }}>{st.label}</span>
            </div>
          );
        })}
      </div>

      {/* Issue rows */}
      {gridData.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No upcoming issues with eligible ads</div>
      ) : gridData.map(row => {
        const iss = row.issue;
        const pub = (pubs || []).find(p => p.id === iss.pubId);
        const adDl = iss.adDeadline ? Math.ceil((new Date(iss.adDeadline + "T12:00:00") - new Date()) / 86400000) : 99;
        const urgColor = adDl <= 3 ? Z.da : adDl <= 7 ? Z.wa : Z.go;
        return (
          <div key={iss.id} style={{ display: "grid", gridTemplateColumns: `200px repeat(${STATUS_COLS.length}, 1fr)`, gap: 8, alignItems: "flex-start" }}>
            {/* Issue label cell */}
            <div style={{ padding: "8px 10px", background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: Ri, borderLeft: `3px solid ${urgColor}` }}>
              <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pub?.name || "\u2014"}</div>
              <div style={{ fontSize: FS.xs, color: Z.tm }}>{iss.label || fmtDate(iss.date)}</div>
              {adDl < 99 && <div style={{ fontSize: 10, fontWeight: FW.bold, color: urgColor, marginTop: 3 }}>
                {adDl < 0 ? `${Math.abs(adDl)}d overdue` : adDl === 0 ? "Due today" : `${adDl}d left`}
              </div>}
            </div>
            {/* Status cells */}
            {STATUS_COLS.map(col => {
              const cards = row.cells[col];
              return (
                <div key={col} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  {cards.length === 0 ? (
                    <div style={{ padding: "4px 0", textAlign: "center", color: Z.bd, fontSize: 11 }}>·</div>
                  ) : cards.map(({ sale, project }) => {
                    const isNeedsBrief = !project;
                    const isUnassigned = project && !project.designer_id;
                    return (
                      <div
                        key={sale.id}
                        onClick={() => {
                          if (isNeedsBrief) {
                            setForm(f => ({
                              ...f,
                              clientId: sale.clientId || "",
                              publicationId: sale.publication || "",
                              issueId: sale.issueId || "",
                              adSize: sale.size || "",
                              _saleId: sale.id,
                            }));
                            setCreateModal(true);
                          } else {
                            setViewId(project.id);
                          }
                        }}
                        style={{
                          padding: "8px 10px",
                          background: isNeedsBrief ? "transparent" : Z.bg,
                          borderRadius: Ri,
                          cursor: "pointer",
                          border: isNeedsBrief
                            ? `1.5px dashed ${Z.bd}`
                            : isUnassigned
                              ? `1.5px dashed #E24B4A80`
                              : `1px solid ${Z.bd}`,
                        }}
                        title={isNeedsBrief ? "Click to start a design brief" : "Open project"}
                      >
                        <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cn(sale.clientId)}</div>
                        <div style={{ fontSize: FS.xs, color: Z.tm }}>{sale.size || "Ad"}</div>
                        {project?.designer_id && <div style={{ fontSize: 10, color: Z.td, marginTop: 2 }}>{tn(project.designer_id)?.split(" ")[0]}</div>}
                        {isUnassigned && <div style={{ fontSize: 10, fontWeight: FW.bold, color: Z.da, marginTop: 2 }}>Unassigned</div>}
                        {isNeedsBrief && <div style={{ fontSize: 10, fontWeight: FW.bold, color: Z.tm, marginTop: 2 }}>Start brief →</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>

    : view === "board" ? <div style={{ display: "grid", gridTemplateColumns: `repeat(${KANBAN_COLS.length}, 1fr)`, gap: 10, minHeight: 400 }}>
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
    tab === "Active" ? (
      // Sale-centric list: one row per closed sale in an upcoming issue,
      // with design state as an overlay. Mirrors the grid data.
      <DataTable>
        <thead><tr>
          {["Client", "Publication", "Issue", "Ad Size", "Art Source", "Designer", "Status", "Revisions", "Updated"].map(h => <th key={h}>{h}</th>)}
        </tr></thead>
        <tbody>
          {gridRows.length === 0 ? <tr><td colSpan={9} style={{ textAlign: "center", color: Z.td, padding: 20 }}>No eligible sales in upcoming issues</td></tr>
          : gridRows.map(({ sale, project, issue, status }) => {
            const st = status === "needs_brief" ? { label: "Needs Brief" } : (STATUSES[status] || STATUSES.brief);
            const rowKey = project?.id || `sale-${sale.id}`;
            const onClick = () => {
              if (project) setViewId(project.id);
              else {
                setForm(f => ({
                  ...f,
                  clientId: sale.clientId || "",
                  publicationId: sale.publication || "",
                  issueId: sale.issueId || "",
                  adSize: sale.size || "",
                  _saleId: sale.id,
                }));
                setCreateModal(true);
              }
            };
            return <tr key={rowKey} onClick={onClick} style={{ cursor: "pointer" }}>
              <td style={{ fontWeight: FW.semi, color: Z.tx }}>{cn(sale.clientId)}</td>
              <td style={{ color: Z.tm }}>{pn(sale.publication)}</td>
              <td style={{ color: Z.tm, fontSize: FS.sm }}>{issue.label || "—"}</td>
              <td style={{ color: Z.tm, fontSize: FS.sm }}>{sale.size || "—"}</td>
              <td>{project
                ? <span style={{ fontSize: 10, fontWeight: FW.bold, color: project.art_source === "camera_ready" ? Z.wa : Z.ac, background: (project.art_source === "camera_ready" ? Z.wa : Z.ac) + "15", padding: "2px 6px", borderRadius: Ri }}>{project.art_source === "camera_ready" ? "Camera Ready" : "We Design"}</span>
                : <span style={{ color: Z.td, fontSize: FS.sm }}>—</span>}</td>
              <td style={{ color: Z.tm, fontSize: FS.sm }}>{project?.designer_id ? tn(project.designer_id) : "—"}</td>
              <td><Badge status={st.label} small /></td>
              <td style={{ color: (project?.revision_count || 0) >= 3 ? Z.wa : Z.tm }}>{project?.revision_count || 0}</td>
              <td style={{ color: Z.td, fontSize: FS.sm }}>{project?.updated_at ? fmtDate(project.updated_at) : "—"}</td>
            </tr>;
          })}
        </tbody>
      </DataTable>
    ) : (
      // Completed / All tabs — keep the legacy project-row list
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
      </DataTable>
    )}
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
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
          {form.clientId ? (() => {
            const prevAd = projects.filter(p => p.client_id === form.clientId && ["approved", "signed_off", "placed"].includes(p.status)).sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))[0];
            return prevAd ? <Btn sm v="ghost" onClick={() => setForm(f => ({ ...f, publicationId: prevAd.publication_id || f.publicationId, adSize: prevAd.ad_size || f.adSize, designNotes: `Repeat of previous ad (${prevAd.ad_size || "ad"}). ${prevAd.design_notes || ""}`.trim(), designerId: prevAd.designer_id || f.designerId, clientContactName: prevAd.client_contact_name || f.clientContactName, clientContactEmail: prevAd.client_contact_email || f.clientContactEmail }))}>Clone from last ad</Btn> : <span />;
          })() : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn v="cancel" sm onClick={() => setCreateModal(false)}>Cancel</Btn>
            <Btn sm onClick={createProject} disabled={!form.clientId || !form.publicationId}>Create Project</Btn>
          </div>
        </div>
      </div>
    </Modal>
  </div>;
};

export default memo(AdProjects);
