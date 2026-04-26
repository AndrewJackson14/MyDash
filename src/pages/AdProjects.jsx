import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R, INV, ACCENT } from "../lib/theme";
import { Ic, Btn, Inp, TA, Sel, Modal, Badge, PageHeader, GlassCard, TabRow, TB, TabPipe, DataTable, SB, Toggle, Pill, EntityLink } from "../components/ui";
import FuzzyPicker from "../components/FuzzyPicker";
import { useNav } from "../hooks/useNav";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { supabase, isOnline, EDGE_FN_URL } from "../lib/supabase";
import ChatPanel from "../components/ChatPanel";
import EntityThread from "../components/EntityThread";
import AssetPanel from "../components/AssetPanel";
import ProofAnnotationOverlay from "../components/ProofAnnotationOverlay";
import { getOrCreateThread, postSystemMessage } from "../lib/threads";
import { fmtDateShort as fmtDate, fmtTime } from "../lib/formatters";
import { useDialog } from "../hooks/useDialog";
import { uploadMedia } from "../lib/media";
import { useAppData } from "../hooks/useAppData";
import { useIsMobile } from "../hooks/useWindowWidth";

// Forward-only allowed transitions — also used by the grid drag-drop
// (P3.30) to validate target columns before persisting a move.
// Backward moves are deliberately not allowed via drag — they require
// a deliberate path through the project detail page so we don't lose
// proof history by accident.
const NEXT_STAGES = {
  brief:        ["designing"],
  awaiting_art: ["designing", "approved"],
  designing:    ["proof_sent"],
  proof_sent:   ["revising", "approved"],
  revising:     ["proof_sent"],
  approved:     ["signed_off"],
  signed_off:   ["placed"],
};

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

// P2.22 — Linked Emails panel. Reads gmail_message_links for the
// current project, renders sender + subject + excerpt + a click-out
// to Gmail's web client (#inbox/{messageId} resolves the same way
// the Mail tab's "open in Gmail" does). Quiet when there are no
// linked emails so the project chat stays the focus.
function LinkedEmailsPanel({ projectId }) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    supabase.from("gmail_message_links")
      .select("gmail_message_id, from_email, subject, excerpt, linked_at, linked_by")
      .eq("ad_project_id", projectId)
      .order("linked_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (cancelled) return;
        setItems(data || []);
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [projectId]);
  if (!loaded || items.length === 0) return null;
  return <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${Z.bd}` }}>
    <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 6 }}>
      Linked Emails ({items.length})
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
      {items.map(it => <a
        key={it.gmail_message_id}
        href={`https://mail.google.com/mail/u/0/#inbox/${it.gmail_message_id}`}
        target="_blank"
        rel="noreferrer"
        style={{
          display: "block", padding: "6px 8px", borderRadius: Ri,
          background: Z.bg, color: Z.tx, textDecoration: "none",
          borderLeft: `2px solid ${Z.ac}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.subject || "(no subject)"}>{it.subject || "(no subject)"}</span>
          <span style={{ fontSize: 9, color: Z.td, fontFamily: COND, flexShrink: 0 }}>{it.linked_at ? new Date(it.linked_at).toLocaleDateString() : ""}</span>
        </div>
        {it.from_email && <div style={{ fontSize: 11, color: Z.tm, marginTop: 1 }}>{it.from_email}</div>}
        {it.excerpt && <div style={{ fontSize: 11, color: Z.td, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.excerpt}>{it.excerpt}</div>}
      </a>)}
    </div>
  </div>;
}

const AdProjects = ({ pubs, clients, sales, issues, team, currentUser, isActive, deepLink, onNavigate, digitalAdProducts, loadDigitalAdProducts }) => {
  const nav = useNav(onNavigate);

  const { setHeader, clearHeader } = usePageHeader();
  useEffect(() => {
    if (isActive) {
      setHeader({ breadcrumb: [{ label: "Home" }, { label: "Design Studio" }], title: "Design Studio" });
      // Lazy-load digital ad products so the digital project specs panel can
      // resolve product name + zone for sales that came in via Phase 4.
      if (loadDigitalAdProducts) loadDigitalAdProducts();
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader, loadDigitalAdProducts]);
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
  const [fDesigner, setFDesigner] = useState("all"); // P1.20
  const [viewId, setViewId] = useState(null);
  const [createModal, setCreateModal] = useState(false);
  const [proofModal, setProofModal] = useState(false);
  const [view, setView] = useState("board"); // board | list
  const [heatmapFilter, setHeatmapFilter] = useState(null);
  const [uploading, setUploading] = useState(false);
  // P3.29 — selected ids for bulk sign-off on the Issue × Status grid
  const [selectedSignoff, setSelectedSignoff] = useState(() => new Set());
  const [bulkSigning, setBulkSigning] = useState(false);
  // P3.30 — drag-drop state. dragInfo holds the project being moved
  // so drop targets can validate against NEXT_STAGES[dragInfo.status].
  // dragOverCell is the cell currently hovered (for visual feedback).
  const [dragInfo, setDragInfo] = useState(null);
  const [dragOverCell, setDragOverCell] = useState(null);
  // P3.35 — viewport-driven layout switches
  const isMobile = useIsMobile();
  // P3.35 — Issue × Status grid expansion state on mobile (accordion)
  const [expandedIssue, setExpandedIssue] = useState(null);

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
    // P1.20: Performance per-designer click → filter the list to
    // that designer + clear any heatmap/issue filter that might
    // be obscuring the result.
    if (deepLink.designer) {
      setHeatmapFilter(null);
      setFDesigner(deepLink.designer);
      setView("list");
      setViewId(null);
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

  // P1.9 — unread chat counts per project thread. Loaded as a
  // single bulk RPC call against unread_counts_for_threads
  // whenever the project list changes. Map keyed by thread_id;
  // queue cards render a 💬 N badge when count > 0.
  const [unreadByThread, setUnreadByThread] = useState(new Map());
  useEffect(() => {
    if (!currentUser?.id || !projects.length) { setUnreadByThread(new Map()); return; }
    const threadIds = projects.map(p => p.thread_id).filter(Boolean);
    if (threadIds.length === 0) { setUnreadByThread(new Map()); return; }
    let cancelled = false;
    supabase.rpc("unread_counts_for_threads", { p_thread_ids: threadIds, p_user_id: currentUser.id })
      .then(({ data }) => {
        if (cancelled || !data) return;
        const m = new Map();
        for (const r of data) m.set(r.thread_id, r.unread_count);
        setUnreadByThread(m);
      });
    return () => { cancelled = true; };
  }, [projects, currentUser?.id]);

  // P1.14 — realtime subscriptions on ad_projects + ad_proofs.
  // When a client signs off via the public approval page, when
  // another designer claims an unassigned project, when a new proof
  // lands… we want every open AdProjects view to flip without a
  // manual refresh. Two channel handlers, scoped to this component.
  useEffect(() => {
    if (!isOnline()) return;
    const ch = supabase
      .channel("adprojects-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "ad_projects" }, (payload) => {
        const row = payload.new || payload.old;
        if (!row?.id) return;
        if (payload.eventType === "INSERT") {
          setProjects(prev => prev.some(p => p.id === row.id) ? prev : [row, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setProjects(prev => prev.map(p => p.id === row.id ? { ...p, ...row } : p));
        } else if (payload.eventType === "DELETE") {
          setProjects(prev => prev.filter(p => p.id !== row.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ad_proofs" }, (payload) => {
        const row = payload.new || payload.old;
        if (!row?.id) return;
        if (payload.eventType === "INSERT") {
          setProofs(prev => prev.some(p => p.id === row.id) ? prev : [row, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setProofs(prev => prev.map(p => p.id === row.id ? { ...p, ...row } : p));
        } else if (payload.eventType === "DELETE") {
          setProofs(prev => prev.filter(p => p.id !== row.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [setProjects]);

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
    if (fDesigner !== "all") list = list.filter(p => p.designer_id === fDesigner);
    // May Sim P2.13 — multi-token + multi-field search. Old behavior was
    // single-substring against client name only, so "joe sushi" couldn't
    // find "Joe's Sushi" and an ad-size like "1/4 page" couldn't be looked
    // up at all. Now: tokenize on whitespace, require every token to land
    // in client name OR ad size OR notes — Jen's most common needles.
    if (sr) {
      const tokens = sr.toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter(p => {
        const hay = [
          cn(p.client_id),
          p.ad_size || "",
          p.design_notes || "",
        ].join(" ").toLowerCase();
        return tokens.every(t => hay.includes(t));
      });
    }
    return list;
  }, [projects, tab, fPub, fDesigner, sr, clients, issues, today, cutoff30d]);

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

    // Create the project first so we have an id to scope the thread by.
    // Thread gets the polymorphic (ref_type, ref_id) pair via
    // getOrCreateThread so EntityThread / a future entity-threads view
    // can find it without depending on ad_projects.thread_id.
    const { data: proj } = await supabase.from("ad_projects").insert({
      sale_id: form._saleId,
      client_id: form.clientId, publication_id: form.publicationId,
      issue_id: form.issueId || null, ad_size: form.adSize,
      design_notes: form.designNotes, designer_id: form.designerId || null,
      salesperson_id: currentUser?.id || null,
      reference_ads: form.referenceAds, client_assets_path: assetPath,
      client_contact_name: form.clientContactName, client_contact_email: form.clientContactEmail,
      status: "brief",
    }).select().single();

    if (proj) {
      let thread = null;
      try {
        thread = await getOrCreateThread({
          refType: "ad_project",
          refId: proj.id,
          title: `Ad: ${cn(form.clientId)} \u2014 ${pn(form.publicationId)}`,
          participants: [currentUser?.id, form.designerId].filter(Boolean),
        });
      } catch (e) { console.error("Thread create failed:", e); }
      if (thread) {
        // Backfill legacy thread_id on the project for any consumer
        // still reading that column.
        await supabase.from("ad_projects").update({ thread_id: thread.id }).eq("id", proj.id);
        proj.thread_id = thread.id;
        setThreads(prev => [thread, ...prev]);
        const msg = await postSystemMessage(
          thread.id,
          `Ad project created by ${currentUser?.name || "Unknown"}. Assigned to ${tn(form.designerId)}.`,
        ).catch(() => null);
        if (msg) setMessages(prev => [...prev, msg]);
      }
      setProjects(prev => [proj, ...prev]);
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
    // Accepts both print (PDF, AI/EPS/INDD via image/*) and digital (animated GIF,
    // HTML5, MP4) formats. The trigger that creates ad_placements on sign-off
    // doesn't care about format — the operator sees whatever was last uploaded.
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*,application/pdf,text/html,video/mp4";
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
  // P1.19: per-field save-status indicator. Was fire-and-forget so a
  // failed write left no trace; now we surface saving / saved / failed
  // next to the field label.
  const [savingField, setSavingField] = useState(null); // { field, status }
  const saveBriefField = async (projectId, field, value) => {
    setSavingField({ field, status: "saving" });
    const { error } = await supabase
      .from("ad_projects")
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq("id", projectId);
    if (error) {
      setSavingField({ field, status: "error" });
      return;
    }
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, [field]: value } : p));
    setSavingField({ field, status: "saved" });
    // Auto-clear the "Saved" pill after 2s, but only if no other
    // field has taken over the indicator in the meantime.
    setTimeout(() => setSavingField(s => s?.field === field ? null : s), 2000);
  };
  const SaveIndicator = ({ field }) => {
    if (savingField?.field !== field) return null;
    const text = savingField.status === "saving" ? "Saving…" : savingField.status === "error" ? "Failed" : "Saved";
    const color = savingField.status === "saving" ? Z.tm : savingField.status === "error" ? Z.da : Z.go;
    return <span style={{ marginLeft: 6, fontSize: 9, color, fontWeight: FW.bold, textTransform: "uppercase", letterSpacing: 0.5 }}>{text}</span>;
  };

  // ── Sign off ───────────────────────────────────────────
  const signOff = async (projectId, role) => {
    // P1.15: stamp approved_at on the designer-signoff path so the
    // first-proof-rate + on-time-rate metrics have a stable, role-
    // specific timestamp (separate from updated_at, which moves on
    // every brief edit / status flip).
    const now = new Date().toISOString();
    const updates = role === "designer"
      ? { designer_signoff: true, designer_signoff_at: now, status: "approved", approved_at: now }
      : { salesperson_signoff: true, salesperson_signoff_at: now, status: "signed_off" };
    await supabase.from("ad_projects").update(updates).eq("id", projectId);
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, ...updates } : p));
  };

  // P3.29 — bulk sign-off. Power-action used on the Issue × Status
  // grid: select N approved cards, click "Sign off N selected" → all
  // get both signoffs flipped + status="signed_off" in a single
  // round-trip. Optimistic update so the cards animate out without
  // waiting on the server.
  const bulkSignOff = async () => {
    if (selectedSignoff.size === 0 || bulkSigning) return;
    const ids = [...selectedSignoff];
    setBulkSigning(true);
    const now = new Date().toISOString();
    const updates = {
      designer_signoff: true, designer_signoff_at: now,
      salesperson_signoff: true, salesperson_signoff_at: now,
      status: "signed_off", updated_at: now,
    };
    const { error } = await supabase.from("ad_projects").update(updates).in("id", ids);
    if (!error) {
      setProjects(prev => prev.map(p => ids.includes(p.id) ? { ...p, ...updates } : p));
      setSelectedSignoff(new Set());
    } else {
      console.error("Bulk sign-off error:", error);
    }
    setBulkSigning(false);
  };

  // P3.30 — drag-drop status change on the grid. Validates target
  // column against NEXT_STAGES[card.status] so reverse moves and
  // skipping stages are blocked at the gate.
  const dropToStatus = async (project, targetCol) => {
    if (!project) return;
    const allowed = NEXT_STAGES[project.status] || [];
    if (!allowed.includes(targetCol)) return;
    const now = new Date().toISOString();
    const updates = { status: targetCol, updated_at: now };
    // Stamp approved_at on the proof_sent → approved path for metric
    // accuracy (mirrors the project-detail advanceStatus flow).
    if (targetCol === "approved") updates.approved_at = now;
    const { error } = await supabase.from("ad_projects").update(updates).eq("id", project.id);
    if (!error) {
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, ...updates } : p));
    } else {
      console.error("Drag drop status update error:", error);
    }
  };

  // ── Get approval link ──────────────────────────────────
  const getApprovalLink = (proof) => {
    return `${window.location.origin}/approve/${proof.access_token}`;
  };

  // Jen P0.2: real email send (was a silent clipboard copy that
  // left no DB stamp, no toast, no thread message). Calls the
  // send-proof Edge Function which pulls a Gmail token from any
  // connected admin and sends a branded HTML email with the
  // approval CTA. On success we stamp ad_proofs server-side and
  // post a system message to the project thread.
  const [sendingProof, setSendingProof] = useState(null); // proof.id while sending

  // Jen P0.4: send the public client_upload_token URL to the client
  // so they can drop logos/copy/reference assets directly into the
  // project. Generates a token if missing, stores it, prompts for
  // email if missing, then calls send-asset-request Edge Function.
  const [requestingAssets, setRequestingAssets] = useState(false);
  const requestClientAssets = async (project) => {
    if (!project?.id || requestingAssets) return;
    setRequestingAssets(true);
    try {
      let token = project.client_upload_token;
      if (!token) {
        token = crypto.randomUUID().replace(/-/g, "");
        await supabase.from("ad_projects").update({ client_upload_token: token }).eq("id", project.id);
        setProjects(prev => prev.map(p => p.id === project.id ? { ...p, client_upload_token: token } : p));
      }
      let recipient = project.client_contact_email;
      if (!recipient) {
        recipient = await dialog.prompt("Client email address for upload link", "");
        if (!recipient) { setRequestingAssets(false); return; }
        await supabase.from("ad_projects").update({ client_contact_email: recipient }).eq("id", project.id);
        setProjects(prev => prev.map(p => p.id === project.id ? { ...p, client_contact_email: recipient } : p));
      }
      const uploadUrl = `${window.location.origin}/upload/${token}`;
      const pubNameLocal = pubs.find(p => p.id === project.publication_id)?.name || "13 Stars Media";
      const { data, error } = await supabase.functions.invoke("send-asset-request", {
        body: {
          projectId: project.id,
          recipientEmail: recipient,
          recipientName: project.client_contact_name || "",
          uploadUrl,
          adSize: project.ad_size,
          pubName: pubNameLocal,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.detail || data?.error || "Send failed");
      // Post system message to project thread mirroring the proof-send pattern.
      if (project.thread_id) {
        await supabase.from("messages").insert({
          thread_id: project.thread_id,
          sender_name: "System",
          body: `📎 Asset upload request sent to ${project.client_contact_name || recipient}`,
          is_system: true,
        });
      }
      await dialog.alert(`Upload link sent to ${recipient}`);
    } catch (e) {
      await dialog.alert(`Send failed: ${String(e?.message ?? e)}`);
    } finally {
      setRequestingAssets(false);
    }
  };

  const sendProofToClient = async (proof) => {
    if (!proof?.id) return;
    if (sendingProof) return;
    const project = projects.find(p => p.id === proof.project_id);
    let recipient = project?.client_contact_email;
    if (!recipient) {
      recipient = await dialog.prompt(`Send proof to which email address?`, "");
      if (!recipient) return;
      // Persist so the next send doesn't re-prompt.
      await supabase.from("ad_projects").update({ client_contact_email: recipient }).eq("id", project.id);
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, client_contact_email: recipient } : p));
    }
    setSendingProof(proof.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-proof", {
        body: { proofId: proof.id, recipientEmail: recipient },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.detail || data?.error || "Send failed");
      // Optimistic local update of the proof row so the button flips
      // immediately to "Resend to Client" without a refetch.
      setProofs(prev => prev.map(p => p.id === proof.id ? { ...p, sent_to_client_at: data.sent_at, internal_status: "sent_to_client" } : p));
      await dialog.alert(`Proof v${proof.version || 1} sent to ${recipient}`);
    } catch (e) {
      await dialog.alert(`Send failed: ${String(e?.message ?? e)}`);
    } finally {
      setSendingProof(null);
    }
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

    // Status advance helper. P1.15: stamp approved_at when crossing
    // into approved so the first-proof / on-time metrics use a
    // stable timestamp.
    const advanceStatus = async (newStatus) => {
      const now = new Date().toISOString();
      const patch = { status: newStatus, updated_at: now };
      if (newStatus === "approved" && !viewProject.approved_at) patch.approved_at = now;
      await supabase.from("ad_projects").update(patch).eq("id", viewProject.id);
      setProjects(prev => prev.map(p => p.id === viewProject.id ? { ...p, ...patch } : p));
    };

    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 24, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>
          <EntityLink onClick={nav.toClient(viewProject.client_id)}>{cn(viewProject.client_id)}</EntityLink>
          {" — "}
          <EntityLink onClick={nav.toPublication(viewProject.publication_id)}>{pn(viewProject.publication_id)}</EntityLink>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!viewProject.designer_id && currentUser?.id && <Btn sm onClick={async () => {
            // P1.7: claim an unassigned project. Same race guard as the
            // dashboard pickup — only writes if designer_id is still null.
            const isCR = viewProject.art_source === "camera_ready";
            const newStatus = viewProject.status === "brief"
              ? (isCR ? "awaiting_art" : "designing")
              : viewProject.status;
            const { data: updated, error } = await supabase.from("ad_projects")
              .update({ designer_id: currentUser.id, status: newStatus, updated_at: new Date().toISOString() })
              .eq("id", viewProject.id)
              .is("designer_id", null)
              .select();
            if (error) { console.error("assign failed:", error); return; }
            if (!updated || updated.length === 0) {
              await dialog.alert("Someone else just took this one — refreshing.");
              const { data: latest } = await supabase.from("ad_projects").select("*").eq("id", viewProject.id).single();
              if (latest) setProjects(prev => prev.map(p => p.id === viewProject.id ? latest : p));
              return;
            }
            setProjects(prev => prev.map(p => p.id === viewProject.id ? { ...p, designer_id: currentUser.id, status: newStatus } : p));
          }}>Assign to me</Btn>}
          {viewProject.status === "brief" && viewProject.designer_id && <Btn sm onClick={() => advanceStatus("designing")}>Start Designing</Btn>}
          <Btn sm v="secondary" onClick={() => requestClientAssets(viewProject)} disabled={requestingAssets} title={viewProject.asset_request_sent_at ? `Last sent ${new Date(viewProject.asset_request_sent_at).toLocaleString()}` : "Email the client a link to drop their assets"}>
            <Ic.attach size={11} /> {requestingAssets ? "Sending…" : (viewProject.asset_request_sent_at ? "Resend Asset Link" : "Request Assets from Client")}
          </Btn>
          {/* P2.23 — quick-notify Cami/Hayley/Anthony. Pings via
              team_notes with context_type='ad_project' so the
              recipient's NotificationPopover can deep-link back. */}
          {(() => {
            const notify = async (memberRole) => {
              const recipient = (team || []).find(t => t.role === memberRole && t.isActive !== false);
              if (!recipient?.authId) {
                await dialog.alert(`No ${memberRole} on the team to notify.`);
                return;
              }
              await supabase.from("team_notes").insert({
                from_user: currentUser.authId,
                to_user: recipient.authId,
                message: `Re: ${cn(viewProject.client_id)} — ${pn(viewProject.publication_id)} ad — please take a look`,
                context_type: "ad_project",
                context_id: viewProject.id,
              });
              await dialog.alert(`Notified ${recipient.name}`);
            };
            return <>
              <Btn sm v="secondary" onClick={() => notify("Office Administrator")} title="Send Cami a note about this project"><Ic.bell size={11} /> Cami</Btn>
              <Btn sm v="secondary" onClick={() => notify("Publisher")} title="Send Hayley a note about this project"><Ic.bell size={11} /> Hayley</Btn>
              <Btn sm v="secondary" onClick={() => notify("Layout Designer")} title="Send Anthony a note about this project"><Ic.bell size={11} /> Anthony</Btn>
            </>;
          })()}
          <Btn sm v="ghost" onClick={() => setViewId(null)}>← Back</Btn>
        </div>
      </div>

      {/* Status pipeline — P1.12: each "next-stage" segment is now
          clickable, advancing the project one step. Hover ring +
          pointer cursor signal which segments are interactive. */}
      {(() => {
        const allowedNext = NEXT_STAGES[viewProject.status] || [];
        const isCR = viewProject.art_source === "camera_ready";
        const showMarkArtReceived = isCR && viewProject.status === "awaiting_art";
        return <>
          <div style={{ display: "flex", gap: 2 }}>
            {STAGES.map((s, i) => {
              const isCurrent = viewProject.status === s;
              const isPast = currentIdx > i;
              const isClickable = allowedNext.includes(s);
              return <div
                key={s}
                onClick={isClickable ? () => advanceStatus(s) : undefined}
                title={isClickable ? `Advance to ${STATUSES[s]?.label || s}` : undefined}
                style={{
                  flex: 1, padding: "6px 0", textAlign: "center",
                  fontSize: 10, fontWeight: FW.heavy, textTransform: "uppercase", letterSpacing: 0.5,
                  color: isCurrent ? "#fff" : isPast ? Z.go : (isClickable ? Z.tx : Z.td),
                  background: isCurrent ? st.color : isPast ? Z.go + "20" : (isClickable ? (STATUSES[s]?.color || Z.ac) + "12" : Z.sa),
                  borderRadius: Ri,
                  cursor: isClickable ? "pointer" : "default",
                  outline: isClickable ? `2px solid ${(STATUSES[s]?.color || Z.ac)}40` : "none",
                }}
              >{STATUSES[s]?.label || s}</div>;
            })}
          </div>
          {showMarkArtReceived && <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <Btn sm onClick={() => advanceStatus("approved")}><Ic.check size={12} /> Mark Art Received</Btn>
          </div>}
        </>;
      })()}

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

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 380px", gap: 16 }}>
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
                  <div style={{ padding: "6px 10px", background: Z.bg, borderRadius: Ri }}><div style={{ fontSize: 10, color: Z.td, textTransform: "uppercase" }}>Salesperson</div><div style={{ fontWeight: FW.bold, color: Z.tx }}>
                    {viewProject.salesperson_id
                      ? <EntityLink onClick={nav.toTeamMember(viewProject.salesperson_id)}>{spName || "—"}</EntityLink>
                      : (spName || "—")}
                  </div></div>
                  <div style={{ padding: "6px 10px", background: Z.bg, borderRadius: Ri }}><div style={{ fontSize: 10, color: Z.td, textTransform: "uppercase" }}>Designer</div><div style={{ fontWeight: FW.bold, color: Z.tx }}>
                    {viewProject.designer_id
                      ? <EntityLink onClick={nav.toTeamMember(viewProject.designer_id)}>{tn(viewProject.designer_id)}</EntityLink>
                      : tn(viewProject.designer_id)}
                  </div></div>
                  <div style={{ padding: "6px 10px", background: Z.bg, borderRadius: Ri }}><div style={{ fontSize: 10, color: Z.td, textTransform: "uppercase" }}>Revisions</div><div style={{ fontWeight: FW.bold, color: viewProject.revision_count >= 3 ? Z.wa : Z.tx }}>{viewProject.revision_count || 0}{viewProject.revision_count >= 4 ? ` ($${(viewProject.revision_count - 3) * 25})` : ""}</div></div>
                </div>
                {(() => {
                  // Branch: digital projects show Product + Flight + Publication;
                  // print projects show Ad Size + Issue + Publication. The sale
                  // is the source of truth for digital_product_id + flight dates.
                  const viewSale = (sales || []).find(s => s.id === viewProject.sale_id);
                  const isDigital = !!viewSale?.digitalProductId;
                  if (isDigital) {
                    const product = (digitalAdProducts || []).find(p => p.id === viewSale.digitalProductId);
                    const fmt = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
                    return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: FS.sm }}>
                      <div style={{ padding: "6px 10px", background: Z.bg, borderRadius: Ri }}><div style={{ fontSize: 10, color: Z.td, textTransform: "uppercase" }}>Digital Product</div><div style={{ fontWeight: FW.bold, color: Z.tx }}>{product?.name || "—"}{product?.width && product?.height ? ` · ${product.width}×${product.height}` : ""}</div></div>
                      <div style={{ padding: "6px 10px", background: Z.bg, borderRadius: Ri }}><div style={{ fontSize: 10, color: Z.td, textTransform: "uppercase" }}>Flight</div><div style={{ fontWeight: FW.bold, color: Z.tx }}>{fmt(viewSale.flightStartDate)} – {fmt(viewSale.flightEndDate)}</div></div>
                      <div style={{ padding: "6px 10px", background: Z.bg, borderRadius: Ri }}><div style={{ fontSize: 10, color: Z.td, textTransform: "uppercase" }}>Publication</div><div style={{ fontWeight: FW.bold, color: Z.tx }}>
                        {viewProject.publication_id
                          ? <EntityLink onClick={nav.toPublication(viewProject.publication_id)}>{pn(viewProject.publication_id)}</EntityLink>
                          : pn(viewProject.publication_id)}
                      </div></div>
                    </div>;
                  }
                  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: FS.sm }}>
                    <div style={{ padding: "6px 10px", background: Z.bg, borderRadius: Ri }}><div style={{ fontSize: 10, color: Z.td, textTransform: "uppercase" }}>Ad Size</div><div style={{ fontWeight: FW.bold, color: Z.tx }}>{viewProject.ad_size || "—"}</div></div>
                    <div style={{ padding: "6px 10px", background: Z.bg, borderRadius: Ri }}><div style={{ fontSize: 10, color: Z.td, textTransform: "uppercase" }}>Issue</div><div style={{ fontWeight: FW.bold, color: Z.tx }}>
                      {viewProject.issue_id
                        ? <EntityLink onClick={nav.toFlatplan(viewProject.publication_id, viewProject.issue_id)}>{(issues || []).find(i => i.id === viewProject.issue_id)?.label || "—"}</EntityLink>
                        : "—"}
                    </div></div>
                    <div style={{ padding: "6px 10px", background: Z.bg, borderRadius: Ri }}><div style={{ fontSize: 10, color: Z.td, textTransform: "uppercase" }}>Publication</div><div style={{ fontWeight: FW.bold, color: Z.tx }}>
                      {viewProject.publication_id
                        ? <EntityLink onClick={nav.toPublication(viewProject.publication_id)}>{pn(viewProject.publication_id)}</EntityLink>
                        : pn(viewProject.publication_id)}
                    </div></div>
                  </div>;
                })()}

                {/* Editable brief fields — click to edit, save on blur */}
                {[
                  ["brief_headline", "Key Message / Headline", false],
                  ["brief_style", "Style Direction", true],
                ].map(([field, label, tall]) => <div key={field} style={tall ? { flex: 1 } : {}}>
                  <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>{label}<SaveIndicator field={field} /></div>
                  <textarea defaultValue={viewProject[field] || ""} onBlur={e => { if (e.target.value !== (viewProject[field] || "")) saveBriefField(viewProject.id, field, e.target.value); }} placeholder="Click to add..." rows={tall ? 4 : 2} style={{ width: "100%", fontSize: FS.sm, color: Z.tx, padding: "8px 10px", background: Z.bg, borderRadius: Ri, border: `1px solid ${Z.bd}`, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box" }} />
                </div>)}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    ["brief_colors", "Colors to Use / Avoid"],
                    ["brief_instructions", "Special Instructions"],
                  ].map(([field, label]) => <div key={field}>
                    <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>{label}<SaveIndicator field={field} /></div>
                    <textarea defaultValue={viewProject[field] || ""} onBlur={e => { if (e.target.value !== (viewProject[field] || "")) saveBriefField(viewProject.id, field, e.target.value); }} placeholder="Click to add..." rows={2} style={{ width: "100%", fontSize: FS.sm, color: Z.tx, padding: "8px 10px", background: Z.bg, borderRadius: Ri, border: `1px solid ${Z.bd}`, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }} />
                  </div>)}
                </div>

                {viewProject.design_notes && !viewProject.design_notes.startsWith("Auto-created") && <div>
                  <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Additional Notes<SaveIndicator field="design_notes" /></div>
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
                      ? <ProofAnnotationOverlay proofUrl={latestProof.proof_url} annotationsJson={latestProof.annotations} maxHeight={320} />
                      : <div style={{ textAlign: "center", color: Z.tm, fontSize: FS.sm }}>PDF · <a href={latestProof.proof_url} target="_blank" rel="noopener" style={{ color: Z.ac }}>Open</a></div>}
                  </div>
                  {latestProof.client_feedback && <div style={{ padding: "8px 14px", borderTop: `1px solid ${Z.bd}`, fontSize: FS.xs, color: Z.tx, background: Z.wa + "08", borderLeft: `2px solid ${Z.wa}` }}>Client: {latestProof.client_feedback}</div>}
                  {/* Actions */}
                  <div style={{ padding: "10px 14px", borderTop: `1px solid ${Z.bd}`, display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <Btn sm v="ghost" onClick={() => window.open(latestProof.proof_url, "_blank")} style={{ flex: 1 }}>View Full</Btn>
                    {!latestProof.saved_at && <Btn sm v="success" onClick={() => saveProof(latestProof.id)} style={{ flex: 1 }} title="Save permanently — unsaved proofs expire in 7 days"><Ic.check size={11} /> Save</Btn>}
                    {(latestProof.internal_status || "uploaded") === "uploaded" && <Btn sm v="secondary" onClick={async () => { await supabase.from("ad_proofs").update({ internal_status: "ready" }).eq("id", latestProof.id); setProofs(prev => prev.map(p => p.id === latestProof.id ? { ...p, internal_status: "ready" } : p)); }} style={{ flex: 1 }}>Mark Ready</Btn>}
                    {latestProof.internal_status === "ready" && <Btn sm v="secondary" onClick={async () => { await supabase.from("ad_proofs").update({ internal_status: "edit" }).eq("id", latestProof.id); setProofs(prev => prev.map(p => p.id === latestProof.id ? { ...p, internal_status: "edit" } : p)); }} style={{ flex: 1 }}>Request Edit</Btn>}
                    {(latestProof.internal_status === "ready" || latestProof.internal_status === "approved" || latestProof.internal_status === "sent_to_client") && <Btn sm onClick={() => sendProofToClient(latestProof)} disabled={sendingProof === latestProof.id} style={{ flex: 1 }} title={latestProof.sent_to_client_at ? `Last sent ${new Date(latestProof.sent_to_client_at).toLocaleString()}` : undefined}>{sendingProof === latestProof.id ? "Sending…" : (latestProof.sent_to_client_at ? "Resend to Client" : "Send to Client")}</Btn>}
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

        {/* RIGHT: Chat — EntityThread handles get-or-create by (ref_type, ref_id) */}
        <GlassCard style={{ display: "flex", flexDirection: "column", maxHeight: 700 }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Project Chat</div>
          <EntityThread
            refType="ad_project"
            refId={viewProject?.id}
            title={`Ad: ${cn(viewProject?.client_id)} — ${pn(viewProject?.publication_id)}`}
            participants={[viewProject?.designer_id, viewProject?.salesperson_id].filter(Boolean)}
            currentUser={currentUser}
            defaultOpen
            label="Project Chat"
            height={560}
          />
          {/* P2.22 — Linked emails (sender + subject + excerpt + open
              in Gmail). Loads only the rows for this project. */}
          <LinkedEmailsPanel projectId={viewProject?.id} />
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
      <Sel value={fDesigner} onChange={e => setFDesigner(e.target.value)} options={[{ value: "all", label: "All Designers" }, ...((team || []).filter(t => ["Ad Designer", "Layout Designer", "Graphic Designer"].includes(t.role)).map(t => ({ value: t.id, label: t.name })))]} />
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
            // P3.28 — render "All clear" placeholder instead of hiding pubs with no upcoming issues
            if (pubIssues.length === 0) {
              return <div key={pub.id} style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.55 }}>
                <span style={{ fontSize: 11, fontWeight: FW.semi, color: Z.tm, width: 160, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={pub.name}>{pub.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: Z.sa, border: `1px dashed ${Z.bd}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: Z.td }}>·</div>
                  <span style={{ fontSize: 10, color: Z.td, fontStyle: "italic" }}>All clear</span>
                </div>
              </div>;
            }
            return <div key={pub.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: FW.semi, color: Z.tm, width: isMobile ? 110 : 160, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={pub.name}>{pub.name}</span>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, flex: 1 }}>
                {pubIssues.map(iss => {
                  const adDl = iss.adDeadline ? Math.ceil((new Date(iss.adDeadline + "T12:00:00") - new Date()) / 86400000) : 99;
                  const count = tab === "Active"
                    ? (gridStats.countByIssueId.get(iss.id) || 0)
                    : filtered.filter(p => p.publication_id === pub.id && p.issue_id === iss.id && !["approved", "signed_off", "placed"].includes(p.status)).length;
                  const dotColor = count === 0 ? Z.bd : adDl <= 3 ? "#DC2626" : adDl <= 7 ? "#D97706" : "#16A34A";
                  const isActive = heatmapFilter?.pubId === pub.id && heatmapFilter?.issueId === iss.id;
                  // P3.28 — scale dots: 9+ for 10-99, 99+ for 100+; bump size to 32 for 99+
                  const isJumbo = count >= 100;
                  const display = count === 0 ? "·" : count >= 100 ? "99+" : count >= 10 ? "9+" : count;
                  const size = isJumbo ? 32 : 26;
                  return <div key={iss.id} onClick={() => setHeatmapFilter(isActive ? null : { pubId: pub.id, issueId: iss.id, label: `${pub.name} ${iss.label}` })} title={`${iss.label} — ${count} ads, ${adDl}d to deadline`} style={{ width: size, height: size, borderRadius: "50%", background: count > 0 ? dotColor : Z.sa, border: `2px solid ${isActive ? Z.tx : "transparent"}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: isJumbo ? 11 : 10, fontWeight: 800, color: count > 0 ? "#fff" : Z.td, transition: "all 0.15s" }}>{display}</div>;
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
    {view === "board" && tab === "Active" ? <div style={{ display: "flex", flexDirection: "column", gap: 8, position: "relative" }}>
      {/* P3.35 — outer wrapper handles horizontal scroll on narrow
          screens; the grid itself keeps a min-width so columns don't
          collapse to unreadable widths. */}
      <div style={{ overflowX: isMobile ? "auto" : "visible", paddingBottom: isMobile ? 4 : 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: isMobile ? 920 : "auto" }}>
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
              <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={pub?.name || ""}>{pub?.name || "\u2014"}</div>
              <div style={{ fontSize: FS.xs, color: Z.tm }}>{iss.label || fmtDate(iss.date)}</div>
              {adDl < 99 && <div style={{ fontSize: 10, fontWeight: FW.bold, color: urgColor, marginTop: 3 }}>
                {adDl < 0 ? `${Math.abs(adDl)}d overdue` : adDl === 0 ? "Due today" : `${adDl}d left`}
              </div>}
            </div>
            {/* Status cells */}
            {STATUS_COLS.map(col => {
              const cards = row.cells[col];
              // P3.30 — drop target validity check + visual highlight
              const dragValid = dragInfo && (NEXT_STAGES[dragInfo.status] || []).includes(col);
              const isDragOver = dragOverCell?.row === iss.id && dragOverCell?.col === col;
              return (
                <div
                  key={col}
                  onDragOver={(e) => {
                    if (dragValid) {
                      e.preventDefault();
                      if (!isDragOver) setDragOverCell({ row: iss.id, col });
                    }
                  }}
                  onDragLeave={() => { if (isDragOver) setDragOverCell(null); }}
                  onDrop={(e) => {
                    if (!dragValid) return;
                    e.preventDefault();
                    const moved = projects.find(p => p.id === dragInfo.id);
                    if (moved) dropToStatus(moved, col);
                    setDragOverCell(null);
                    setDragInfo(null);
                  }}
                  style={{
                    display: "flex", flexDirection: "column", gap: 4, minWidth: 0,
                    padding: 2, borderRadius: Ri,
                    background: isDragOver && dragValid ? Z.go + "15" : "transparent",
                    outline: isDragOver && dragValid ? `2px dashed ${Z.go}` : "none",
                    transition: "background 0.1s",
                  }}
                >
                  {cards.length === 0 ? (
                    <div style={{ padding: "4px 0", textAlign: "center", color: Z.bd, fontSize: 11 }}>·</div>
                  ) : cards.map(({ sale, project }) => {
                    const isNeedsBrief = !project;
                    const isUnassigned = project && !project.designer_id;
                    // P3.29 — only approved cards can be bulk-signed-off
                    const canSignoff = project && project.status === "approved";
                    const isSelected = canSignoff && selectedSignoff.has(project.id);
                    return (
                      <div
                        key={sale.id}
                        draggable={!isNeedsBrief}
                        onDragStart={(e) => {
                          if (isNeedsBrief) return;
                          e.dataTransfer.effectAllowed = "move";
                          setDragInfo({ id: project.id, status: project.status });
                        }}
                        onDragEnd={() => { setDragInfo(null); setDragOverCell(null); }}
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
                          position: "relative",
                          padding: "8px 10px",
                          paddingLeft: canSignoff ? 26 : 10,
                          background: isSelected ? Z.go + "12" : (isNeedsBrief ? "transparent" : Z.bg),
                          borderRadius: Ri,
                          cursor: !isNeedsBrief ? "grab" : "pointer",
                          opacity: dragInfo?.id === project?.id ? 0.4 : 1,
                          border: isSelected
                            ? `1.5px solid ${Z.go}`
                            : isNeedsBrief
                              ? `1.5px dashed ${Z.bd}`
                              : isUnassigned
                                ? `1.5px dashed #E24B4A80`
                                : `1px solid ${Z.bd}`,
                        }}
                        title={isNeedsBrief ? "Click to start a design brief" : "Drag to advance status, or click to open"}
                      >
                        {/* P3.29 — multi-select checkbox for bulk sign-off
                            (only approved cards). Stops propagation so
                            click doesn't open the project detail. */}
                        {canSignoff && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => {
                              setSelectedSignoff(prev => {
                                const next = new Set(prev);
                                if (next.has(project.id)) next.delete(project.id);
                                else next.add(project.id);
                                return next;
                              });
                            }}
                            style={{ position: "absolute", top: 8, left: 8, cursor: "pointer", margin: 0 }}
                          />
                        )}
                        <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={cn(sale.clientId) || ""}>
                          {sale.clientId
                            ? <EntityLink onClick={nav.toClient(sale.clientId)}>{cn(sale.clientId)}</EntityLink>
                            : cn(sale.clientId)}
                        </div>
                        <div style={{ fontSize: FS.xs, color: Z.tm }} title={sale.size || "Ad"}>{sale.size || "Ad"}</div>
                        {project?.designer_id && <div style={{ fontSize: 10, color: Z.td, marginTop: 2 }}>
                          <EntityLink onClick={nav.toTeamMember(project.designer_id)} muted noUnderline>{tn(project.designer_id)?.split(" ")[0]}</EntityLink>
                        </div>}
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
      </div>{/* end inner min-width grid */}
      </div>{/* end horizontal-scroll wrapper */}

      {/* P3.29 — bulk sign-off action bar. Sticky at the bottom of the
          grid section while a selection is active; click to flip all
          selected approved cards to signed_off in one round-trip. */}
      {selectedSignoff.size > 0 && (
        <div style={{
          position: "sticky", bottom: 12, alignSelf: "center",
          marginTop: 4, padding: "10px 16px",
          background: Z.sf, border: `1px solid ${Z.bd}`,
          borderRadius: 999, boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
          display: "flex", gap: 12, alignItems: "center", zIndex: 5,
        }}>
          <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>
            {selectedSignoff.size} selected
          </span>
          <Btn sm v="ghost" onClick={() => setSelectedSignoff(new Set())}>Clear</Btn>
          <Btn sm onClick={bulkSignOff} disabled={bulkSigning} style={{ background: Z.go, color: "#fff" }}>
            {bulkSigning ? "Signing off…" : `✓ Sign off ${selectedSignoff.size}`}
          </Btn>
        </div>
      )}
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
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={cn(p.client_id) || ""}>
                      {p.client_id
                        ? <EntityLink onClick={nav.toClient(p.client_id)}>{cn(p.client_id)}</EntityLink>
                        : cn(p.client_id)}
                    </div>
                    <div style={{ fontSize: FS.xs, color: Z.tm }} title={`${pn(p.publication_id)} · ${iss?.label || ""} · ${p.ad_size || "Ad"}`}>{pn(p.publication_id)} · {iss?.label || ""} · {p.ad_size || "Ad"}</div>
                  </div>
                  {/* P1.9 — unread chat badge: hidden when 0, visible when >0 */}
                  {p.thread_id && unreadByThread.get(p.thread_id) > 0 && <span title={`${unreadByThread.get(p.thread_id)} unread message${unreadByThread.get(p.thread_id) === 1 ? "" : "s"}`} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 999, background: Z.ac + "22", color: Z.ac, fontSize: 10, fontWeight: FW.heavy, fontFamily: COND }}>💬 {unreadByThread.get(p.thread_id)}</span>}
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
              <td style={{ fontWeight: FW.semi, color: Z.tx }}>
                {sale.clientId
                  ? <EntityLink onClick={nav.toClient(sale.clientId)}>{cn(sale.clientId)}</EntityLink>
                  : cn(sale.clientId)}
              </td>
              <td style={{ color: Z.tm }}>
                {sale.publication
                  ? <EntityLink onClick={nav.toPublication(sale.publication)} muted>{pn(sale.publication)}</EntityLink>
                  : pn(sale.publication)}
              </td>
              <td style={{ color: Z.tm, fontSize: FS.sm }}>
                {sale.issueId
                  ? <EntityLink onClick={nav.toFlatplan(sale.publication, sale.issueId)} muted>{issue.label || "—"}</EntityLink>
                  : (issue.label || "—")}
              </td>
              <td style={{ color: Z.tm, fontSize: FS.sm }}>{sale.size || "—"}</td>
              <td>{project
                ? <span style={{ fontSize: 10, fontWeight: FW.bold, color: project.art_source === "camera_ready" ? Z.wa : Z.ac, background: (project.art_source === "camera_ready" ? Z.wa : Z.ac) + "15", padding: "2px 6px", borderRadius: Ri }}>{project.art_source === "camera_ready" ? "Camera Ready" : "We Design"}</span>
                : <span style={{ color: Z.td, fontSize: FS.sm }}>—</span>}</td>
              <td style={{ color: Z.tm, fontSize: FS.sm }}>
                {project?.designer_id
                  ? <EntityLink onClick={nav.toTeamMember(project.designer_id)} muted>{tn(project.designer_id)}</EntityLink>
                  : "—"}
              </td>
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
            const unread = p.thread_id ? unreadByThread.get(p.thread_id) || 0 : 0;
            return <tr key={p.id} onClick={() => setViewId(p.id)} style={{ cursor: "pointer" }}>
              <td style={{ fontWeight: FW.semi, color: Z.tx }}>
                {p.client_id
                  ? <EntityLink onClick={nav.toClient(p.client_id)}>{cn(p.client_id)}</EntityLink>
                  : cn(p.client_id)}
                {unread > 0 && <span title={`${unread} unread`} style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 999, background: Z.ac + "22", color: Z.ac, fontSize: 10, fontWeight: FW.heavy, fontFamily: COND, verticalAlign: "middle" }}>💬 {unread}</span>}
              </td>
              <td style={{ color: Z.tm }}>
                {p.publication_id
                  ? <EntityLink onClick={nav.toPublication(p.publication_id)} muted>{pn(p.publication_id)}</EntityLink>
                  : pn(p.publication_id)}
              </td>
              <td style={{ color: Z.tm, fontSize: FS.sm }}>
                {p.issue_id
                  ? <EntityLink onClick={nav.toFlatplan(p.publication_id, p.issue_id)} muted>{(issues || []).find(i => i.id === p.issue_id)?.label || "—"}</EntityLink>
                  : "—"}
              </td>
              <td style={{ color: Z.tm, fontSize: FS.sm }}>{p.ad_size || "—"}</td>
              <td><span style={{ fontSize: 10, fontWeight: FW.bold, color: p.art_source === "camera_ready" ? Z.wa : Z.ac, background: (p.art_source === "camera_ready" ? Z.wa : Z.ac) + "15", padding: "2px 6px", borderRadius: Ri }}>{p.art_source === "camera_ready" ? "Camera Ready" : "We Design"}</span></td>
              <td style={{ color: Z.tm, fontSize: FS.sm }}>
                {p.designer_id
                  ? <EntityLink onClick={nav.toTeamMember(p.designer_id)} muted>{tn(p.designer_id)}</EntityLink>
                  : tn(p.designer_id)}
              </td>
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
          <FuzzyPicker label="Client" value={form.clientId} onChange={(v) => setForm(f => ({ ...f, clientId: v }))} options={(clients || []).map(c => ({ value: c.id, label: c.name }))} placeholder="Search clients…" />
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
