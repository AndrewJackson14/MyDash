// ============================================================
// IssueLayoutConsole — Anthony Phase 3 (§6 of comprehensive spec)
// One-issue command center: story list (left), per-page progress
// (middle), issue header + Send-to-Press readiness checklist +
// EntityThread (right). Phase 3 ships the structural shell + the
// readiness checklist; the actual press handoff (PDF upload, printer
// delivery, confetti) lives in Phase 5.
//
// Activated via App.jsx page key "layout" with deepLink={ id: <issueId> }.
// Navigated to from the Layout Designer dashboard's Today's Issues
// cards — those are Anthony's primary entry point.
// ============================================================
import { useState, useEffect, useMemo } from "react";
import { Z, COND, DISPLAY, FS, FW, R, Ri, ACCENT } from "../lib/theme";
import { Btn, glass as glassStyle } from "../components/ui";
import EntityThread from "../components/EntityThread";
import IssueProofingTab from "../components/IssueProofingTab";
import SendToPressModal from "../components/SendToPressModal";
import { supabase, isOnline, EDGE_FN_URL } from "../lib/supabase";
import { fmtDateShort as fmtDate, daysUntil } from "../lib/formatters";
import { downloadStoryPackage } from "../lib/storyPackage";

const PRINT_FLOW = ["none", "ready", "on_page", "proofread", "approved"];
const NEXT_PRINT = {
  none: "ready",
  ready: "on_page",
  on_page: "proofread",
  proofread: "approved",
};
const PRINT_LABEL = {
  none: "Not started",
  ready: "Ready",
  on_page: "On Page",
  proofread: "Proofread",
  approved: "Approved",
};
const PRINT_COLOR = (status) => ({
  none: Z.tm,
  ready: ACCENT.indigo,
  on_page: ACCENT.blue,
  proofread: Z.wa,
  approved: Z.go,
}[status] || Z.tm);

export default function IssueLayoutConsole({
  isActive, deepLink, currentUser, pubs, issues, team, sales, stories, clients, setStories, onNavigate,
}) {
  const issueId = deepLink?.id;
  const issue = (issues || []).find(i => i.id === issueId);
  const pub = (pubs || []).find(p => p.id === issue?.pubId);
  const totalPages = issue?.pageCount || 8;

  const [pageStatus, setPageStatus] = useState([]);
  const [adProjects, setAdProjects] = useState([]);
  const [layoutRefs, setLayoutRefs] = useState([]);
  const [savingPageNum, setSavingPageNum] = useState(null);
  const [advancingId, setAdvancingId] = useState(null);
  const [pkgDownloading, setPkgDownloading] = useState(null);
  const [tab, setTab] = useState("layout"); // layout | proofing
  const [proofCount, setProofCount] = useState({ total: 0, unresolved: 0, hasReview: false });
  const [pressModalOpen, setPressModalOpen] = useState(false);
  const [confettiVisible, setConfettiVisible] = useState(false);
  const [printRuns, setPrintRuns] = useState([]);

  // Stories scoped to this issue, sorted by page then priority
  const issueStories = useMemo(() => {
    if (!issueId) return [];
    return (stories || [])
      .filter(s => s.print_issue_id === issueId)
      .sort((a, b) => {
        const ap = a.page == null ? 9999 : a.page;
        const bp = b.page == null ? 9999 : b.page;
        if (ap !== bp) return ap - bp;
        return (a.priority || 9) - (b.priority || 9);
      });
  }, [stories, issueId]);

  // Sales scoped to this issue (for ad placement counts per page)
  const issueSales = useMemo(() => {
    if (!issueId) return [];
    return (sales || []).filter(s => s.issueId === issueId && s.status === "Closed");
  }, [sales, issueId]);

  // Load per-page completion state, ad projects, and layout refs
  useEffect(() => {
    if (!isActive || !issueId || !isOnline()) return;
    (async () => {
      const [psRes, apRes, lrRes] = await Promise.all([
        supabase.from("flatplan_page_status").select("*").eq("issue_id", issueId),
        supabase.from("ad_projects").select("id, issue_id, status, sale_id").eq("issue_id", issueId),
        supabase.from("flatplan_page_layouts").select("id, issue_id, page_number, cdn_url, uploaded_at").eq("issue_id", issueId),
      ]);
      setPageStatus(psRes.data || []);
      setAdProjects(apRes.data || []);
      setLayoutRefs(lrRes.data || []);
    })();
  }, [isActive, issueId]);

  // Print runs history for the right rail
  useEffect(() => {
    if (!isActive || !issueId || !isOnline()) return;
    (async () => {
      const { data } = await supabase
        .from("print_runs")
        .select("*")
        .eq("issue_id", issueId)
        .order("shipped_at", { ascending: false });
      setPrintRuns(data || []);
    })();
  }, [isActive, issueId]);

  // Quick proof count for the tab badge — not the full proof load,
  // just enough to know if there's a proof in review and how many
  // unresolved pins it has so the Proofing tab label is honest.
  useEffect(() => {
    if (!isActive || !issueId || !isOnline()) return;
    (async () => {
      const { data: prs } = await supabase
        .from("issue_proofs")
        .select("id, status")
        .eq("issue_id", issueId);
      const total = (prs || []).length;
      const reviewProof = (prs || []).find(p => p.status === "review");
      let unresolved = 0;
      if (reviewProof) {
        const { count } = await supabase
          .from("issue_proof_annotations")
          .select("id", { count: "exact", head: true })
          .eq("proof_id", reviewProof.id)
          .eq("resolved", false);
        unresolved = count || 0;
      }
      setProofCount({ total, unresolved, hasReview: !!reviewProof });
    })();
  }, [isActive, issueId]);

  // Realtime: own page-completion writes (so multiple browser tabs stay in sync)
  useEffect(() => {
    if (!isActive || !issueId || !isOnline()) return;
    const ch = supabase
      .channel(`layout-pagestatus-${issueId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "flatplan_page_status", filter: `issue_id=eq.${issueId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setPageStatus(prev => prev.filter(p => !(p.issue_id === payload.old.issue_id && p.page_number === payload.old.page_number)));
          } else {
            setPageStatus(prev => {
              const others = prev.filter(p => !(p.issue_id === payload.new.issue_id && p.page_number === payload.new.page_number));
              return [...others, payload.new];
            });
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isActive, issueId]);

  // ── Page completion toggle (writes flatplan_page_status) ────
  const togglePageComplete = async (pageNum) => {
    if (!currentUser?.id || savingPageNum === pageNum) return;
    setSavingPageNum(pageNum);
    const existing = pageStatus.find(p => p.page_number === pageNum);
    const isComplete = !!existing?.completed_at;
    try {
      if (isComplete) {
        await supabase.from("flatplan_page_status").upsert({
          issue_id: issueId,
          page_number: pageNum,
          completed_by: null,
          completed_at: null,
        }, { onConflict: "issue_id,page_number" });
        setPageStatus(prev => prev.map(p => p.issue_id === issueId && p.page_number === pageNum
          ? { ...p, completed_at: null, completed_by: null }
          : p));
      } else {
        const now = new Date().toISOString();
        await supabase.from("flatplan_page_status").upsert({
          issue_id: issueId,
          page_number: pageNum,
          completed_by: currentUser.id,
          completed_at: now,
        }, { onConflict: "issue_id,page_number" });
        setPageStatus(prev => {
          const others = prev.filter(p => !(p.issue_id === issueId && p.page_number === pageNum));
          return [...others, { issue_id: issueId, page_number: pageNum, completed_by: currentUser.id, completed_at: now }];
        });
      }
    } catch (err) {
      console.error("Page complete toggle failed:", err);
    }
    setSavingPageNum(null);
  };

  // ── Print status advance ────────────────────────────────────
  const advancePrintStatus = async (story) => {
    if (advancingId === story.id) return;
    const current = story.print_status || story.printStatus || "none";
    const next = NEXT_PRINT[current];
    if (!next) return;
    setAdvancingId(story.id);
    try {
      const updates = {
        print_status: next,
      };
      // First transition to on_page also stamps placed_by + laid_out_at
      // (mirrors the dashboard Mark On Page handler).
      if (next === "on_page" && !story.placedBy && !story.placed_by) {
        updates.placed_by = currentUser.id;
        updates.laid_out_at = new Date().toISOString();
      }
      const { error } = await supabase.from("stories").update(updates).eq("id", story.id);
      if (error) throw error;
      if (typeof setStories === "function") {
        setStories(prev => prev.map(s => s.id === story.id ? {
          ...s,
          print_status: next,
          printStatus: next,
          ...(updates.placed_by ? { placed_by: updates.placed_by, placedBy: updates.placed_by, laid_out_at: updates.laid_out_at, laidOutAt: updates.laid_out_at } : {}),
        } : s));
      }
    } catch (err) {
      console.error("Advance print status failed:", err);
    }
    setAdvancingId(null);
  };

  // ── Story package download (mirror of dashboard handler) ────
  const downloadPkg = async (story) => {
    if (pkgDownloading) return;
    setPkgDownloading(story.id);
    try {
      const [storyRes, imgRes] = await Promise.all([
        supabase.from("stories").select("id, title, slug, author, body, deck, photo_credit, word_count, word_limit, category, has_images, page, jump_to_page, print_issue_id, due_date, publication_id").eq("id", story.id).single(),
        supabase.from("media_assets").select("file_name, cdn_url, file_url, caption, photo_credit").eq("story_id", story.id).order("created_at", { ascending: true }),
      ]);
      if (storyRes.error || !storyRes.data) throw storyRes.error || new Error("Story not found");
      const images = (imgRes.data || []).map(r => ({
        url: r.cdn_url || r.file_url,
        file_name: r.file_name,
        caption: r.caption,
        photo_credit: r.photo_credit,
      })).filter(i => i.url);
      await downloadStoryPackage({
        story: storyRes.data,
        images,
        pubName: pub?.name || "",
        issueLabel: issue?.label || "",
      });
    } catch (err) {
      console.error("Package download failed:", err);
    }
    setPkgDownloading(null);
  };

  // ── Send-to-Press readiness checklist ────────────────────────
  const checklist = useMemo(() => {
    if (!issue) return [];
    const items = [];

    // 1. All editorial print_status === 'approved'
    const notApproved = issueStories.filter(s => (s.print_status || s.printStatus) !== "approved");
    items.push({
      id: "ed_approved",
      label: notApproved.length === 0
        ? "All editorial stories approved"
        : `${notApproved.length} stor${notApproved.length === 1 ? "y" : "ies"} not yet approved`,
      ok: notApproved.length === 0,
      hard: true,
    });

    // 2. Cover (is_featured) approved
    const cover = issueStories.find(s => s.is_featured || s.isFeatured);
    if (cover) {
      const coverApproved = (cover.print_status || cover.printStatus) === "approved";
      items.push({
        id: "cover",
        label: coverApproved ? "Cover approved" : `Cover "${cover.title || 'Untitled'}" not approved`,
        ok: coverApproved,
        hard: true,
      });
    }

    // 3. Closed sales without a page
    const adsMissingPage = issueSales.filter(s => !s.page);
    items.push({
      id: "ads_placed",
      label: adsMissingPage.length === 0
        ? "All ads placed on a page"
        : `${adsMissingPage.length} ad${adsMissingPage.length === 1 ? "" : "s"} need a page assignment`,
      ok: adsMissingPage.length === 0,
      hard: true,
    });

    // 4. Layout reference uploaded for every page that has ads
    const pagesWithAds = new Set(issueSales.filter(s => s.page).map(s => s.page));
    const refPages = new Set(layoutRefs.map(r => r.page_number));
    const refsMissing = [...pagesWithAds].filter(p => !refPages.has(p));
    if (pagesWithAds.size > 0) {
      items.push({
        id: "layout_refs",
        label: refsMissing.length === 0
          ? "Layout references uploaded for all ad pages"
          : `${refsMissing.length} ad page${refsMissing.length === 1 ? "" : "s"} missing layout ref`,
        ok: refsMissing.length === 0,
        hard: false,
      });
    }

    // 5. Publisher signoff
    items.push({
      id: "publisher_signoff",
      label: issue.publisherSignoffAt
        ? `Hayley signed off ${fmtDate(issue.publisherSignoffAt.slice(0, 10))}`
        : "Hayley hasn't signed off yet",
      ok: !!issue.publisherSignoffAt,
      hard: true,
    });

    // 6. Page completeness — all pages either have a page_status row or a story or an ad
    const pagesStarted = new Set();
    issueStories.forEach(s => { if (s.page) pagesStarted.add(s.page); });
    issueSales.forEach(s => { if (s.page) pagesStarted.add(s.page); });
    const emptyPages = [];
    for (let p = 1; p <= totalPages; p++) {
      if (!pagesStarted.has(p)) emptyPages.push(p);
    }
    if (emptyPages.length > 0) {
      items.push({
        id: "empty_pages",
        label: `${emptyPages.length} page${emptyPages.length === 1 ? "" : "s"} appear empty (${emptyPages.slice(0, 4).join(", ")}${emptyPages.length > 4 ? "…" : ""}) — confirm intentional`,
        ok: false,
        hard: false,
      });
    }

    return items;
  }, [issue, issueStories, issueSales, layoutRefs, totalPages]);

  const pageCompletionByNum = useMemo(() => {
    const m = new Map();
    pageStatus.forEach(p => m.set(p.page_number, p));
    return m;
  }, [pageStatus]);

  // ── Render ──────────────────────────────────────────────────
  if (!isActive) return null;
  if (!issueId) return (
    <div style={{ padding: 28, color: Z.tm, fontFamily: COND }}>
      No issue selected. Open Layout Console from your dashboard's Today's Issues card.
    </div>
  );
  if (!issue) return (
    <div style={{ padding: 28, color: Z.tm, fontFamily: COND }}>
      Issue not found, or it isn't loaded yet. <Btn sm v="secondary" onClick={() => onNavigate?.("dashboard")}>Back to dashboard</Btn>
    </div>
  );

  const d = daysUntil(issue.date);
  const deadlineColor = d <= 1 ? Z.da : d <= 3 ? Z.wa : Z.go;

  const glass = { ...glassStyle(), borderRadius: R, padding: "18px 20px" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 28 }}>
      {/* Header */}
      <div style={{ ...glassStyle(), borderRadius: R, padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <Btn sm v="secondary" onClick={() => onNavigate?.("dashboard")}>← Back</Btn>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 24, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {pub?.name || "—"} {issue.label || ""}
            </div>
            <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, marginTop: 2 }}>
              Press {fmtDate(issue.date)} · {issueStories.length} stories · {issueSales.length} ads · {totalPages} pages
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: deadlineColor, padding: "4px 12px", background: deadlineColor + "15", borderRadius: 999, fontFamily: COND, letterSpacing: 0.4 }}>
            PRESS: {d <= 0 ? "TODAY" : d === 1 ? "TOMORROW" : `${d}D`}
          </span>
          <Btn sm v="secondary" onClick={() => onNavigate?.("flatplan", { pub: issue.pubId, issue: issue.id })}>Open Flatplan</Btn>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, paddingLeft: 4 }}>
        {[
          ["layout", "Layout", null],
          ["proofing", "Proofing", proofCount.hasReview ? proofCount.unresolved : null],
        ].map(([k, label, badge]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              padding: "6px 14px", borderRadius: Ri, border: "none", cursor: "pointer",
              fontSize: FS.sm, fontWeight: tab === k ? FW.bold : 500,
              background: tab === k ? Z.tx + "12" : "transparent",
              color: tab === k ? Z.tx : Z.tm,
              fontFamily: COND, display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {label}
            {badge != null && badge > 0 && (
              <span style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.wa, background: Z.wa + "20", padding: "1px 6px", borderRadius: 999 }}>{badge}</span>
            )}
            {k === "proofing" && proofCount.total > 0 && proofCount.unresolved === 0 && proofCount.hasReview && (
              <span style={{ fontSize: 10, color: Z.go }}>✓</span>
            )}
          </button>
        ))}
      </div>

      {tab === "proofing" ? (
        <IssueProofingTab
          issueId={issueId}
          issue={issue}
          currentUser={currentUser}
          team={team}
          onApproved={() => {
            setProofCount(c => ({ ...c, hasReview: false, unresolved: 0 }));
            // Bounce back to Layout tab so Anthony sees the readiness
            // checklist clear in real time after approval.
            setTab("layout");
          }}
        />
      ) : (
      <>
      {/* Three-column body */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 3fr 1.2fr", gap: 14, alignItems: "flex-start" }}>

        {/* LEFT — Story List */}
        <div style={glass}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>Stories</div>
            <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{issueStories.length}</span>
          </div>
          {issueStories.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No stories assigned to this issue yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 720, overflowY: "auto" }}>
              {issueStories.map(s => {
                const status = s.print_status || s.printStatus || "none";
                const next = NEXT_PRINT[status];
                const color = PRINT_COLOR(status);
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: Z.bg, borderRadius: Ri, borderLeft: `2px solid ${color}` }}>
                    <span style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, fontFamily: COND, width: 26, flexShrink: 0, textAlign: "right" }}>
                      {s.page ? `p${s.page}` : "—"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div title={s.title || "Untitled"} style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {s.title || "Untitled"}{(s.is_featured || s.isFeatured) && <span style={{ marginLeft: 4, fontSize: 9, color: Z.wa }}>★</span>}
                      </div>
                      <div style={{ fontSize: 10, color: Z.td, fontFamily: COND }}>
                        {s.author || "—"}{s.wordCount || s.word_count ? ` · ${s.wordCount || s.word_count}w` : ""}
                      </div>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: FW.heavy, color, padding: "2px 6px", background: color + "15", borderRadius: Ri, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.4, flexShrink: 0 }}>
                      {PRINT_LABEL[status]}
                    </span>
                    <button
                      onClick={() => downloadPkg(s)}
                      disabled={pkgDownloading === s.id}
                      title="Download InDesign story package (.zip)"
                      style={{ background: "transparent", border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "2px 6px", cursor: "pointer", fontSize: 10, color: Z.tm, fontFamily: COND }}
                    >
                      {pkgDownloading === s.id ? "…" : "Pkg"}
                    </button>
                    {next && (
                      <Btn
                        sm
                        onClick={() => advancePrintStatus(s)}
                        disabled={advancingId === s.id}
                        style={{ flexShrink: 0 }}
                      >
                        {advancingId === s.id ? "…" : `→ ${PRINT_LABEL[next]}`}
                      </Btn>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* MIDDLE — Per-page progress */}
        <div style={glass}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>Pages</div>
            <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
              {pageStatus.filter(p => p.completed_at).length} of {totalPages} complete
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, maxHeight: 720, overflowY: "auto" }}>
            {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(pageNum => {
              const pageStories = issueStories.filter(s => s.page === pageNum);
              const pageAds = issueSales.filter(s => s.page === pageNum);
              const pageRef = layoutRefs.find(r => r.page_number === pageNum);
              const ps = pageCompletionByNum.get(pageNum);
              const isComplete = !!ps?.completed_at;
              const totalWords = pageStories.reduce((sum, s) => sum + (s.wordCount || s.word_count || 0), 0);
              const wordLimit = pageStories.reduce((sum, s) => sum + (s.word_limit || 0), 0);
              const overWords = wordLimit > 0 && totalWords > wordLimit;
              return (
                <div key={pageNum} style={{
                  padding: "10px 12px", background: Z.bg, borderRadius: Ri,
                  border: `1px solid ${isComplete ? Z.go : Z.bd}`,
                  opacity: isComplete ? 0.85 : 1,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>
                      Page {pageNum}{isComplete && <span style={{ marginLeft: 6, color: Z.go }}>✓</span>}
                    </span>
                    {pageRef && (
                      <a href={pageRef.cdn_url} target="_blank" rel="noopener noreferrer" title="Open Hayley's layout reference" style={{ fontSize: 10, color: Z.ac, textDecoration: "none", fontFamily: COND }}>
                        ref ↗
                      </a>
                    )}
                  </div>
                  {pageStories.length === 0 && pageAds.length === 0 ? (
                    <div style={{ fontSize: 11, color: Z.td, fontStyle: "italic", marginBottom: 8 }}>(empty)</div>
                  ) : (
                    <div style={{ fontSize: 11, color: Z.tm, fontFamily: COND, marginBottom: 8, lineHeight: 1.5 }}>
                      {pageStories.map((s, i) => (
                        <div key={s.id} title={s.title} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: Z.tx }}>
                          ▸ {s.title || "Untitled"}
                        </div>
                      ))}
                      {pageAds.length > 0 && <div style={{ color: Z.td, marginTop: 2 }}>{pageAds.length} ad{pageAds.length === 1 ? "" : "s"}</div>}
                    </div>
                  )}
                  {wordLimit > 0 && (
                    <div style={{ fontSize: 10, color: overWords ? Z.da : Z.tm, fontFamily: COND, marginBottom: 6 }}>
                      Word fit: {totalWords}/{wordLimit}{overWords ? ` ⚠ ${totalWords - wordLimit} over` : ""}
                    </div>
                  )}
                  <Btn
                    sm
                    v={isComplete ? "secondary" : "primary"}
                    onClick={() => togglePageComplete(pageNum)}
                    disabled={savingPageNum === pageNum}
                    style={{ width: "100%" }}
                  >
                    {savingPageNum === pageNum ? "…" : isComplete ? "Reopen page" : "Mark page complete"}
                  </Btn>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT — Readiness + Discussion */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 10 }}>Send-to-Press Readiness</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {checklist.map(item => (
                <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontSize: 14, color: item.ok ? Z.go : (item.hard ? Z.da : Z.wa), flexShrink: 0, marginTop: 1 }}>
                    {item.ok ? "✓" : item.hard ? "✗" : "!"}
                  </span>
                  <span style={{ fontSize: FS.xs, color: item.ok ? Z.tm : Z.tx, lineHeight: 1.4 }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${Z.bd}` }}>
              {(() => {
                const hardBlocked = checklist.some(c => !c.ok && c.hard);
                const alreadyShipped = !!issue.sentToPressAt;
                return (
                  <Btn
                    sm
                    onClick={() => setPressModalOpen(true)}
                    disabled={hardBlocked || alreadyShipped}
                    title={alreadyShipped ? "Already sent to press" : hardBlocked ? "Resolve checklist blockers first" : "Send to Press"}
                    style={{ width: "100%" }}
                  >
                    {alreadyShipped ? "✓ Sent to press" : "Send to Press →"}
                  </Btn>
                );
              })()}
            </div>
          </div>

          {/* Print runs history */}
          {printRuns.length > 0 && (
            <div style={glass}>
              <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 10 }}>Print Runs</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {printRuns.map(r => (
                  <PrintRunRow
                    key={r.id}
                    run={r}
                    currentUser={currentUser}
                    issueSales={issueSales}
                    clients={clients}
                    onUpdate={(updated) => setPrintRuns(prev => prev.map(x => x.id === updated.id ? updated : x))}
                  />
                ))}
              </div>
            </div>
          )}

          <div style={glass}>
            <EntityThread
              refType="issue"
              refId={issueId}
              title={`Issue: ${issue.label || "Untitled"}`}
              team={team}
              currentUser={currentUser}
              label="Issue discussion"
              height={300}
            />
          </div>
        </div>
      </div>
      </>
      )}

      {/* Send-to-Press modal */}
      {pressModalOpen && (
        <SendToPressModal
          issue={issue}
          pub={pub}
          currentUser={currentUser}
          onClose={() => setPressModalOpen(false)}
          onSent={(result) => {
            setPressModalOpen(false);
            setConfettiVisible(true);
            setTimeout(() => setConfettiVisible(false), 4000);
            // Append the new run optimistically
            if (result?.print_run_id) {
              supabase.from("print_runs").select("*").eq("id", result.print_run_id).single()
                .then(({ data }) => { if (data) setPrintRuns(prev => [data, ...prev]); });
            }
          }}
        />
      )}

      {/* Confetti DOSE moment */}
      {confettiVisible && <ConfettiBurst />}
    </div>
  );
}

// ── Print run row with Mark Received + Generate Tearsheets ────
function PrintRunRow({ run, currentUser, issueSales = [], clients = [], onUpdate }) {
  const [marking, setMarking] = useState(false);
  const [genStatus, setGenStatus] = useState(null); // null | "running" | "done" | "error"
  const [genError, setGenError] = useState(null);
  const [tearsheetsOpen, setTearsheetsOpen] = useState(false);
  const isConfirmed = !!run.confirmed_at;
  const tearsheets = Array.isArray(run.tearsheets) ? run.tearsheets : [];
  const hasTearsheets = tearsheets.length > 0;

  const markReceived = async () => {
    if (marking || isConfirmed) return;
    setMarking(true);
    try {
      const { data } = await supabase.from("print_runs").update({
        confirmed_at: new Date().toISOString(),
        confirmed_by_email: currentUser?.email || null,
        status: "confirmed",
      }).eq("id", run.id).select().single();
      if (data) onUpdate(data);
    } catch (err) {
      console.error("Mark received failed:", err);
    }
    setMarking(false);
  };

  const generateTearsheets = async (force = false) => {
    if (genStatus === "running") return;
    setGenStatus("running");
    setGenError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("not signed in");
      const res = await fetch(`${EDGE_FN_URL}/generate-tearsheets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ print_run_id: run.id, force }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out?.error || `gen failed: ${res.status}`);
      // Pull the updated row so we get the persisted tearsheets array
      const { data } = await supabase.from("print_runs").select("*").eq("id", run.id).single();
      if (data) onUpdate(data);
      setGenStatus("done");
      setTearsheetsOpen(true);
    } catch (err) {
      console.error("Generate tearsheets failed:", err);
      setGenError(err.message || "generation failed");
      setGenStatus("error");
    }
  };

  return (
    <div style={{
      padding: "8px 10px", background: Z.bg, borderRadius: Ri,
      borderLeft: `2px solid ${isConfirmed ? Z.go : Z.ac}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
        <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>
          📰 {fmtDate(run.shipped_at?.slice(0, 10))}{run.pdf_size_bytes ? ` · ${(run.pdf_size_bytes / 1048576).toFixed(1)} MB` : ""}
        </span>
        <span style={{ fontSize: 9, fontWeight: FW.heavy, color: isConfirmed ? Z.go : Z.ac, fontFamily: COND, textTransform: "uppercase", letterSpacing: 0.4 }}>
          {isConfirmed ? "✓ confirmed" : run.status || "shipped"}
        </span>
      </div>
      {run.pdf_url && (
        <div style={{ fontSize: 10, fontFamily: COND, marginBottom: 4 }}>
          <a href={run.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: Z.ac, textDecoration: "none" }}>
            Download PDF ↗
          </a>
        </div>
      )}
      {run.press_notes && (
        <div title={run.press_notes} style={{ fontSize: 10, color: Z.tm, fontFamily: COND, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 4 }}>
          {run.press_notes}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {!isConfirmed && (
          <Btn sm v="secondary" onClick={markReceived} disabled={marking} style={{ fontSize: 10, padding: "2px 8px" }}>
            {marking ? "…" : "Mark received"}
          </Btn>
        )}
        {!hasTearsheets && (
          <Btn
            sm v="secondary"
            onClick={() => generateTearsheets(false)}
            disabled={genStatus === "running"}
            title="Split master PDF into per-page tearsheets"
            style={{ fontSize: 10, padding: "2px 8px" }}
          >
            {genStatus === "running" ? "Generating…" : "Generate tearsheets"}
          </Btn>
        )}
        {hasTearsheets && (
          <button
            onClick={() => setTearsheetsOpen(o => !o)}
            style={{ background: "transparent", border: "none", color: Z.ac, fontSize: 10, fontFamily: COND, cursor: "pointer", padding: 0 }}
          >
            📑 {tearsheets.length} tearsheet{tearsheets.length === 1 ? "" : "s"} {tearsheetsOpen ? "▾" : "▸"}
          </button>
        )}
      </div>
      {genError && <div style={{ fontSize: 10, color: Z.da, fontFamily: COND, marginTop: 4 }}>{genError}</div>}
      {isConfirmed && run.confirmed_at && (
        <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND, marginTop: 4 }}>
          Received {fmtDate(run.confirmed_at.slice(0, 10))}
        </div>
      )}
      {tearsheetsOpen && hasTearsheets && (
        <div style={{ marginTop: 6, padding: 8, background: Z.sf, borderRadius: Ri, border: `1px solid ${Z.bd}` }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" }}>
            {tearsheets.map(t => {
              // Sales placed on this page that have a client + token —
              // these are the per-client share targets.
              const adsOnPage = (issueSales || []).filter(s => s.page === t.page && s.tearsheetToken);
              return (
                <div key={t.page} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", background: Z.bg, borderRadius: Ri, border: `1px solid ${Z.bd}` }}>
                  <a
                    href={t.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Page ${t.page} · ${(t.byte_size / 1048576).toFixed(1)} MB`}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "4px 8px", background: Z.sf, borderRadius: Ri,
                      textDecoration: "none", color: Z.tx, border: `1px solid ${Z.bd}`,
                      flexShrink: 0,
                    }}
                  >
                    <span>📄</span>
                    <span style={{ fontSize: 11, fontWeight: FW.bold, fontFamily: COND }}>p{t.page}</span>
                  </a>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {adsOnPage.length === 0 ? (
                      <span style={{ fontSize: 10, color: Z.td, fontFamily: COND, fontStyle: "italic" }}>(no client ads on this page)</span>
                    ) : adsOnPage.map(s => {
                      const client = (clients || []).find(c => c.id === s.clientId);
                      return (
                        <ClientShareChip key={s.id} client={client} sale={s} />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {currentUser?.role === "Publisher" && (
            <Btn
              sm v="ghost"
              onClick={() => generateTearsheets(true)}
              disabled={genStatus === "running"}
              style={{ fontSize: 10, marginTop: 6, color: Z.tm }}
            >
              {genStatus === "running" ? "Regenerating…" : "↻ Regenerate"}
            </Btn>
          )}
        </div>
      )}
    </div>
  );
}

// ── Client share chip — copy or open the tearsheet portal URL ─
function ClientShareChip({ client, sale }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/tearsheet/${sale.tearsheetToken}`;
  const copy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onAuxClick={copy}
      onClick={copy}
      title={`Click to copy client tearsheet link · middle-click opens in new tab`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        padding: "2px 8px",
        background: copied ? Z.go + "20" : Z.sf,
        border: `1px solid ${copied ? Z.go : Z.bd}`,
        borderRadius: 999,
        fontSize: 10, fontFamily: COND, fontWeight: FW.semi,
        color: copied ? Z.go : Z.ac,
        textDecoration: "none",
        cursor: "pointer",
      }}
    >
      {copied ? "✓ copied" : `🔗 ${(client?.name || "Client").slice(0, 18)}`}
    </a>
  );
}

// ── Confetti burst — full-screen DOSE moment on send-to-press ─
function ConfettiBurst() {
  // 60 colored squares falling. CSS-only animation, no library.
  const colors = ["#16A34A", "#0C447C", "#D97706", "#7C3AED", "#DC2626", "#F59E0B"];
  const pieces = Array.from({ length: 60 }, (_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.6;
    const dur = 2.4 + Math.random() * 1.6;
    const color = colors[i % colors.length];
    const rotate = Math.random() * 360;
    const size = 6 + Math.random() * 6;
    return { left, delay, dur, color, rotate, size, key: i };
  });
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1000, overflow: "hidden" }}>
      {pieces.map(p => (
        <div key={p.key} style={{
          position: "absolute",
          top: -20,
          left: `${p.left}%`,
          width: p.size, height: p.size,
          background: p.color,
          transform: `rotate(${p.rotate}deg)`,
          animation: `confetti-fall ${p.dur}s ${p.delay}s linear forwards`,
        }} />
      ))}
      <div style={{
        position: "absolute", top: "30%", left: 0, right: 0,
        textAlign: "center", color: "#fff",
        textShadow: "0 2px 12px rgba(0,0,0,0.6)",
        animation: "confetti-msg 2.2s ease-out forwards",
      }}>
        <div style={{ fontSize: 48, fontWeight: 900 }}>🎉 Sent to press!</div>
      </div>
      <style>{`
        @keyframes confetti-fall {
          to {
            transform: translateY(110vh) rotate(720deg);
            opacity: 0;
          }
        }
        @keyframes confetti-msg {
          0%   { opacity: 0; transform: translateY(20px) scale(0.85); }
          15%  { opacity: 1; transform: translateY(0) scale(1); }
          80%  { opacity: 1; }
          100% { opacity: 0; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
