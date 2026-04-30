// ============================================================
// RoleDashboard.jsx — Role-specific team member dashboards
// Renders personalized 2-column dashboard per role (Sec 12.1-12.6)
// ============================================================
import { useState, useEffect, useMemo, memo } from "react";
import { Z, DARK, COND, DISPLAY, R, Ri, SP, FS, FW, ACCENT, INV } from "../lib/theme";
import { Ic, Btn, Pill, GlassCard, GlassStat, glass as glassStyle } from "../components/ui";
import { supabase, isOnline } from "../lib/supabase";
import {
  IncomingPipelineCard, WebPublishingQueue, EditedStoryImpactCard, WriterPerformanceTable,
} from "./dashboard";

import { fmtCurrencyWhole as fmtCurrency, fmtDateShort as fmtDate, daysUntil, initials as ini } from "../lib/formatters";
import { useIsMobile } from "../hooks/useWindowWidth";
import { downloadStoryPackage } from "../lib/storyPackage";

const today = new Date().toISOString().slice(0, 10);
const thisMonth = today.slice(0, 7);

// ── DesignerWorkloadTile (P2.25) ─────────────────────────────
// Hayley's view of the design team. One card per Ad Designer with
// active count (load color), on-time rate, first-proof rate, and a
// click-through deep-link into AdProjects filtered to that designer.
function DesignerWorkloadTile({ team, _issues, onNavigate, glass }) {
  const designers = (team || []).filter(t => t.role === "Ad Designer" && t.isActive !== false);
  const [stats, setStats] = useState(null);
  const [sort, setSort] = useState("load"); // load | onTime | firstProof

  useEffect(() => {
    if (designers.length === 0) { setStats([]); return; }
    let cancelled = false;
    (async () => {
      const ids = designers.map(d => d.id);
      // One query for everyone's projects — cheaper than N round trips.
      const { data: rows } = await supabase
        .from("ad_projects")
        .select("designer_id, status, revision_count, approved_at, issue_id, updated_at")
        .in("designer_id", ids);
      if (cancelled || !rows) return;
      const byDesigner = new Map();
      for (const r of rows) {
        if (!byDesigner.has(r.designer_id)) byDesigner.set(r.designer_id, []);
        byDesigner.get(r.designer_id).push(r);
      }
      const monthStart = today.slice(0, 7);
      const out = designers.map(d => {
        const ps = byDesigner.get(d.id) || [];
        const active = ps.filter(p => !["signed_off", "placed"].includes(p.status)).length;
        const completed = ps
          .filter(p => p.approved_at && ["approved", "signed_off", "placed"].includes(p.status))
          .sort((a, b) => (b.approved_at || "").localeCompare(a.approved_at || ""))
          .slice(0, 30);
        const firstProofRate = completed.length > 0
          ? Math.round(completed.filter(p => (p.revision_count || 1) <= 1).length / completed.length * 100)
          : null;
        const onTimeCount = completed.filter(p => {
          const issue = _issues.find(i => i.id === p.issue_id);
          if (!issue) return false;
          const benchmark = issue.adDeadline || issue.date;
          return benchmark && p.approved_at.slice(0, 10) <= benchmark;
        }).length;
        const onTimeRate = completed.length > 0 ? Math.round(onTimeCount / completed.length * 100) : null;
        const revisionsMtd = ps.filter(p => (p.updated_at || "").startsWith(monthStart) && (p.revision_count || 0) > 1)
          .reduce((s, p) => s + ((p.revision_count || 1) - 1), 0);
        return { ...d, active, onTimeRate, firstProofRate, revisionsMtd };
      });
      setStats(out);
    })();
    return () => { cancelled = true; };
  }, [team, _issues]);

  const sorted = useMemo(() => {
    if (!stats) return [];
    const list = [...stats];
    if (sort === "load") list.sort((a, b) => (b.active || 0) - (a.active || 0));
    else if (sort === "onTime") list.sort((a, b) => (b.onTimeRate ?? -1) - (a.onTimeRate ?? -1));
    else if (sort === "firstProof") list.sort((a, b) => (b.firstProofRate ?? -1) - (a.firstProofRate ?? -1));
    return list;
  }, [stats, sort]);

  if (designers.length === 0) return null;

  const loadColor = (n) => n >= 15 ? Z.da : n >= 9 ? Z.wa : Z.go;

  return <div style={glass}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
      <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Designer Workload</span>
      <div style={{ display: "flex", gap: 4 }}>
        {[["load", "Load"], ["onTime", "On-time"], ["firstProof", "1st-proof"]].map(([k, label]) => <button
          key={k}
          onClick={() => setSort(k)}
          style={{
            padding: "3px 8px", fontSize: 10, fontWeight: FW.bold, fontFamily: COND,
            background: sort === k ? Z.ac + "18" : "transparent",
            color: sort === k ? Z.ac : Z.td,
            border: `1px solid ${sort === k ? Z.ac + "40" : Z.bd}`, borderRadius: Ri,
            cursor: "pointer",
          }}
        >{label}</button>)}
      </div>
    </div>
    {!stats ? <div style={{ padding: 14, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>Loading…</div>
    : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
      {sorted.map(d => <div
        key={d.id}
        onClick={() => onNavigate?.("adprojects", { designer: d.id })}
        style={{
          padding: "10px 12px", background: Z.bg, borderRadius: Ri,
          borderLeft: `3px solid ${loadColor(d.active)}`,
          cursor: "pointer",
        }}
      >
        <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>{d.name}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 6 }}>
          <span style={{ fontSize: 24, fontWeight: FW.black, color: loadColor(d.active), fontFamily: DISPLAY, lineHeight: 1 }}>{d.active}</span>
          <span style={{ fontSize: 10, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5 }}>active</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 11, color: Z.tm }}>
          <span><strong style={{ color: Z.tx }}>{d.onTimeRate ?? "—"}{d.onTimeRate != null && "%"}</strong> on-time</span>
          <span><strong style={{ color: Z.tx }}>{d.firstProofRate ?? "—"}{d.firstProofRate != null && "%"}</strong> 1st-proof</span>
        </div>
        {d.revisionsMtd > 0 && <div style={{ fontSize: 10, color: Z.tm, marginTop: 4 }}>{d.revisionsMtd} extra revision{d.revisionsMtd === 1 ? "" : "s"} MTD</div>}
      </div>)}
    </div>}
  </div>;
}

const RoleDashboard = memo(({
  role, currentUser, pubs, stories, setStories, clients, sales, issues,
  team, invoices, payments, subscribers, tickets, legalNotices, creativeJobs,
  adInquiries, loadInquiries, loadClientDetails, updateInquiry,
  onNavigate, setIssueDetailId, hideGreeting,
}) => {
  const isDark = Z.bg === DARK.bg;
  const glass = { ...glassStyle(), borderRadius: R, padding: "22px 24px" };
  // P3.35 — viewport-driven layout switches. Below 768px the dashboard
  // collapses its 2-column layout to a single stack so the right rail
  // (DirectionCard, Quick Stats, etc.) doesn't get squeezed off-screen.
  const isMobile = useIsMobile();
  const dashCols = isMobile ? "1fr" : "1fr 340px";
  const dashColsWide = isMobile ? "1fr" : "1fr 360px";
  const firstName = (currentUser?.name || "").split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? `Good morning, ${firstName}` : hour < 17 ? `Good afternoon, ${firstName}` : `Good evening, ${firstName}`;

  const _stories = stories || [];
  const _sales = sales || [];
  const _clients = clients || [];
  const _tickets = tickets || [];
  const _subs = subscribers || [];
  const _legal = legalNotices || [];
  const _jobs = creativeJobs || [];
  const _issues = issues || [];

  const pn = (pid) => (pubs || []).find(p => p.id === pid)?.name || "";
  const cn = (cid) => _clients.find(c => c.id === cid)?.name || "—";

  // ─── Ad Designer state (must be top-level, not inside if block) ──
  const [adProjects, setAdProjects] = useState([]);
  const [adFilter, setAdFilter] = useState("all");
  const [upcomingRange, setUpcomingRange] = useState("30d");
  const [pinging, setPinging] = useState(null);

  // ─── Publisher dashboard state (Hayley P1) ──────────────────────
  // Pulled at the top so the hooks run every render regardless of role.
  // Branch-internal code reads these; other roles render with empty.
  const [pubProofsInReview, setPubProofsInReview] = useState([]);
  const [pubRecentPress, setPubRecentPress] = useState([]);
  const [pubLayoutRefGaps, setPubLayoutRefGaps] = useState([]);
  const [signingOffIssueId, setSigningOffIssueId] = useState(null);

  // ─── Content Editor dashboard state (Camille P2) ────────────────
  // "From Layout" inbox: team_notes Anthony fires from his Flag-back
  // modal land here, scoped to the current user. Surfaced on Camille's
  // dashboard as a focused actionable tile instead of buried in
  // DirectionCard alongside generic publisher notes.
  const [editorialPings, setEditorialPings] = useState([]);

  // ─── Salesperson dashboard load triggers (Sales P2) ─────────────
  // Inquiries + client details (comms, contacts, summaries) are normally
  // loaded only on /sales — but the dashboard's lead inbox + stale-client
  // tiles depend on both. Trigger the same loaders here when a salesperson
  // lands on Home; useAppData de-dupes by *Loaded flags.
  const isSalespersonRole = role === "Salesperson" || role === "Sales Manager";
  useEffect(() => {
    if (!isSalespersonRole) return;
    if (loadInquiries) loadInquiries();
    if (loadClientDetails) loadClientDetails();
  }, [isSalespersonRole, loadInquiries, loadClientDetails]);

  // ─── Layout Designer state (Anthony) ─────────────────────
  // Same hoist-to-top-of-component rule: hooks must run every render.
  // The Anthony branch reads these; non-Anthony renders ignore them.
  const [layoutActiveIssues, setLayoutActiveIssues] = useState([]);
  const [layoutPipeline, setLayoutPipeline] = useState([]);
  const [layoutReady, setLayoutReady] = useState([]);
  const [layoutPings, setLayoutPings] = useState([]);
  const [layoutRefs, setLayoutRefs] = useState([]);
  const [layoutRecentPress, setLayoutRecentPress] = useState([]);
  const [layoutFilter, setLayoutFilter] = useState("all"); // all | newspapers | magazines
  const [layoutStats, setLayoutStats] = useState({
    pagesThisMonth: 0,
    issuesThisMonth: 0,
    onTimeRate: 100,
    activeDeadlines: 0,
    streakDays: 0,
  });

  // ─── Direction from Publisher (Sec 12.0.3) ─────────────
  const [directionNotes, setDirectionNotes] = useState([]);
  const [replyText, setReplyText] = useState("");
  // P1.17: track which note the reply input is responding to. Was
  // hard-coded to directionNotes[0] (the most recent note), so a
  // reply to an older message would silently land on the wrong
  // recipient.
  const [activeNoteId, setActiveNoteId] = useState(null);

  useEffect(() => {
    if (!currentUser?.authId || !isOnline()) return;
    supabase.from("team_notes").select("*")
      .eq("to_user", currentUser.authId)
      .order("created_at", { ascending: false }).limit(10)
      .then(({ data }) => setDirectionNotes(data || []));
  }, [currentUser?.authId]);

  // P1.18: realtime so a publisher's note shows up in seconds
  // without the designer needing to refresh. Both INSERT (new
  // note) and UPDATE (read-receipt flip) are handled.
  useEffect(() => {
    if (!currentUser?.authId || !isOnline()) return;
    const ch = supabase
      .channel(`direction-notes-${currentUser.authId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "team_notes", filter: `to_user=eq.${currentUser.authId}` },
        (payload) => setDirectionNotes(prev => [payload.new, ...prev].slice(0, 10)))
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "team_notes", filter: `to_user=eq.${currentUser.authId}` },
        (payload) => setDirectionNotes(prev => prev.map(n => n.id === payload.new.id ? payload.new : n)))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentUser?.authId]);

  const markNoteRead = async (noteId) => {
    await supabase.from("team_notes").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", noteId);
    setDirectionNotes(prev => prev.map(n => n.id === noteId ? { ...n, is_read: true } : n));
  };

  const replyToNote = async (note) => {
    if (!replyText.trim() || !note) return;
    const { data } = await supabase.from("team_notes").insert({
      from_user: currentUser.authId, to_user: note.from_user,
      message: replyText.trim(), context_type: "general",
    }).select().single();
    if (data) setDirectionNotes(prev => [data, ...prev]);
    setReplyText("");
  };

  const DirectionCard = () => {
    const unread = directionNotes.filter(n => !n.is_read && n.from_user !== currentUser?.authId);
    const inbound = directionNotes.filter(n => n.from_user !== currentUser?.authId).slice(0, 5);
    const activeNote = inbound.find(n => n.id === activeNoteId);
    const senderName = activeNote
      ? ((team || []).find(t => t.authId === activeNote.from_user)?.name || "note")
      : null;
    return <div style={glass}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Direction from Publisher</span>
        {unread.length > 0 && <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.ac, background: Z.ac + "15", padding: "2px 8px", borderRadius: Ri }}>{unread.length} new</span>}
      </div>
      {directionNotes.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No notes from publisher</div>
      : <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
        {inbound.map(n => {
          const isActive = n.id === activeNoteId;
          return <div key={n.id} onClick={() => {
            setActiveNoteId(n.id);
            if (!n.is_read) markNoteRead(n.id);
          }} style={{
            padding: "8px 10px", borderRadius: Ri, background: Z.bg,
            borderLeft: `2px solid ${n.is_read ? Z.bd : Z.ac}`,
            outline: isActive ? `2px solid ${Z.ac}` : "none",
            cursor: "pointer",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ fontSize: FS.xs, color: n.is_read ? Z.td : Z.ac, fontWeight: FW.bold }}>{n.context_type === "task" ? "Task" : "Note"}</span>
              <span style={{ fontSize: FS.micro, color: Z.td }}>{fmtDate(n.created_at?.slice(0, 10))}</span>
            </div>
            <div style={{ fontSize: FS.sm, color: Z.tx, whiteSpace: "pre-wrap" }}>{n.message}</div>
          </div>;
        })}
      </div>}
      {/* Reply input — P1.17: targets activeNote, not the freshest one */}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input value={replyText} onChange={e => setReplyText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && replyText.trim() && activeNote) replyToNote(activeNote); }}
          placeholder={activeNote ? `Reply to ${senderName}…` : "Click a note above to reply…"}
          disabled={!activeNote}
          style={{ flex: 1, padding: "6px 10px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, outline: "none", fontFamily: "inherit", opacity: activeNote ? 1 : 0.6 }} />
        <Btn sm onClick={() => { if (activeNote) replyToNote(activeNote); }} disabled={!replyText.trim() || !activeNote}>Reply</Btn>
      </div>
    </div>;
  };

  // ─── Layout Designer (Anthony) — top-level effects ───────
  // Detection lives here so the data-fetch + realtime hooks below
  // are defined before any role branches do an early return. Inside
  // each effect we guard with `if (!isLayoutDesigner) return;` so
  // non-Anthony users pay no work cost.
  const isLayoutDesigner = role === "Layout Designer" || role === "Production Manager";

  useEffect(() => {
    if (!isLayoutDesigner) return;
    if (!currentUser?.id || !isOnline()) return;

    const myPubs = (currentUser?.pubs || []).includes("all")
      ? (pubs || []).map(p => p.id)
      : (currentUser?.pubs || []);
    if (myPubs.length === 0) return;

    (async () => {
      // 1. Active issues (next 21d, my pubs, not yet shipped). Pulled
      // straight from in-memory _issues so we don't re-fetch.
      const cutoff = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
      const myActive = (_issues || []).filter(i =>
        myPubs.includes(i.pubId)
        && i.date >= today
        && i.date <= cutoff
        && !i.sentToPressAt
      ).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      const issueIds = myActive.map(i => i.id);

      if (issueIds.length === 0) {
        setLayoutActiveIssues([]);
        setLayoutPipeline([]);
        setLayoutReady([]);
        setLayoutPings([]);
        setLayoutRefs([]);
      } else {
        // Batched per-issue progress queries
        const [storyRes, saleRes, projRes, pageStatusRes] = await Promise.all([
          supabase.from("stories").select("id, status, print_status, print_issue_id, page").in("print_issue_id", issueIds),
          supabase.from("sales").select("id, issue_id, status, page").in("issue_id", issueIds),
          supabase.from("ad_projects").select("id, issue_id, status").in("issue_id", issueIds),
          supabase.from("flatplan_page_status").select("issue_id, page_number, completed_at").in("issue_id", issueIds).not("completed_at", "is", null),
        ]);
        const storyRows = storyRes.data || [];
        const saleRows = saleRes.data || [];
        const projRows = projRes.data || [];
        const pageStatusRows = pageStatusRes.data || [];

        const enriched = myActive.map(iss => {
          const ss = storyRows.filter(s => s.print_issue_id === iss.id);
          const xs = saleRows.filter(s => s.issue_id === iss.id);
          const ps = projRows.filter(p => p.issue_id === iss.id);
          const cs = pageStatusRows.filter(p => p.issue_id === iss.id);

          const edReady = ss.filter(s => s.status === "Ready").length;
          const edInEdit = ss.filter(s => s.status === "Edit").length;
          const edDraft = ss.filter(s => s.status === "Draft").length;

          const layOnPage = ss.filter(s => s.print_status === "on_page").length;
          const layProofread = ss.filter(s => s.print_status === "proofread").length;
          const layApproved = ss.filter(s => s.print_status === "approved").length;

          const adsPlaced = xs.filter(s => s.status === "Closed" && s.page).length;
          const adsAwaitingProof = ps.filter(p => ["proof_sent", "revising", "designing"].includes(p.status)).length;
          const adsMissing = xs.filter(s => s.status === "Closed" && !s.page).length;

          const pagesWithStory = new Set(ss.map(s => s.page).filter(Boolean));
          const pagesWithAd = new Set(xs.filter(s => s.status === "Closed" && s.page).map(s => s.page));
          const pagesStarted = new Set([...pagesWithStory, ...pagesWithAd]).size;
          const pagesComplete = cs.length;

          const dEd = edReady > 0 && edInEdit + edDraft <= 2 ? "green" : (edInEdit + edDraft > 5 ? "red" : "amber");
          const dLay = layApproved >= (iss.pageCount || 8) ? "green" : (layOnPage + layProofread + layApproved === 0 ? "red" : "amber");
          const dAd = adsMissing === 0 ? "green" : (adsMissing > 3 ? "red" : "amber");

          return {
            ...iss,
            edReady, edInEdit, edDraft,
            layOnPage, layProofread, layApproved,
            adsPlaced, adsAwaitingProof, adsMissing,
            pagesStarted, pagesComplete,
            dEd, dLay, dAd,
          };
        });
        setLayoutActiveIssues(enriched);

        // 2. Pipeline lookahead — Camille still has these in Edit
        const { data: lookahead } = await supabase
          .from("stories")
          .select("id, title, author, due_date, print_issue_id, publication_id, assigned_to")
          .in("print_issue_id", issueIds)
          .eq("status", "Edit")
          .order("due_date", { ascending: true })
          .limit(20);
        setLayoutPipeline(lookahead || []);

        // 3. Ready for Layout — Anthony's actual queue
        const { data: ready } = await supabase
          .from("stories")
          .select("id, title, author, page, print_issue_id, publication_id, status, print_status, word_count, has_images")
          .in("print_issue_id", issueIds)
          .in("status", ["Ready", "Approved"])
          .in("print_status", ["none", "ready"])
          .order("page", { ascending: true });
        setLayoutReady(ready || []);

        // 4. Issue Pings — last 48h, posted by someone other than me.
        // team_notes.from_user references team_members.id, so we filter
        // against currentUser.id (NOT authId — different ref).
        const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
        const { data: pings } = await supabase
          .from("team_notes")
          .select("id, message, context_type, context_id, from_user, created_at, is_read")
          .eq("context_type", "issue")
          .in("context_id", issueIds)
          .neq("from_user", currentUser.id)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(10);
        setLayoutPings(pings || []);

        // 5. Hayley's Layout Refs — last 7d
        const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data: refs } = await supabase
          .from("flatplan_page_layouts")
          .select("id, issue_id, page_number, cdn_url, uploaded_at, uploaded_by")
          .in("issue_id", issueIds)
          .gte("uploaded_at", since7)
          .order("uploaded_at", { ascending: false })
          .limit(10);
        setLayoutRefs(refs || []);
      }

      // 6. Recent press — last 48h, my pubs only
      const since48 = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
      const recent = (_issues || []).filter(i =>
        myPubs.includes(i.pubId) && i.sentToPressAt && i.sentToPressAt >= since48
      ).sort((a, b) => (b.sentToPressAt || "").localeCompare(a.sentToPressAt || ""));
      setLayoutRecentPress(recent);

      // 7. Layout stats
      const monthStart = today.slice(0, 7) + "-01";
      const last30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

      const { data: pagesMonth } = await supabase
        .from("stories")
        .select("print_issue_id, page")
        .eq("placed_by", currentUser.id)
        .gte("laid_out_at", monthStart);
      const pageSet = new Set((pagesMonth || []).map(r => `${r.print_issue_id}::${r.page}`));

      const { data: issuesMonth } = await supabase
        .from("issues")
        .select("id, sent_to_press_at, ad_deadline")
        .eq("sent_to_press_by", currentUser.id)
        .gte("sent_to_press_at", monthStart);

      const { data: last30Issues } = await supabase
        .from("issues")
        .select("sent_to_press_at, ad_deadline")
        .eq("sent_to_press_by", currentUser.id)
        .gte("sent_to_press_at", last30);
      const ontime = (last30Issues || []).filter(i =>
        i.ad_deadline && i.sent_to_press_at && i.sent_to_press_at.slice(0, 10) <= i.ad_deadline
      ).length;
      const onTimeRate = (last30Issues || []).length > 0
        ? Math.round(ontime / last30Issues.length * 100)
        : 100;

      const cutoff7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const activeDeadlines = (_issues || []).filter(i =>
        myPubs.includes(i.pubId) && i.date >= today && i.date <= cutoff7 && !i.sentToPressAt
      ).length;

      const streakDays = new Set(
        (last30Issues || [])
          .map(i => (i.sent_to_press_at || "").slice(0, 10))
          .filter(Boolean)
      ).size;

      setLayoutStats({
        pagesThisMonth: pageSet.size,
        issuesThisMonth: (issuesMonth || []).length,
        onTimeRate,
        activeDeadlines,
        streakDays,
      });
    })();
  }, [isLayoutDesigner, currentUser?.id, _issues?.length, pubs?.length]);

  // Realtime: Issue Pings — INSERT on team_notes scoped to my active
  // issues. Filtered server-side on context_type, payload-side on
  // context_id since postgres_changes only takes one filter clause.
  useEffect(() => {
    if (!isLayoutDesigner) return;
    if (!currentUser?.id || !isOnline()) return;
    if (layoutActiveIssues.length === 0) return;
    const issueIds = layoutActiveIssues.map(i => i.id);
    const ch = supabase
      .channel(`layout-pings-${currentUser.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "team_notes", filter: `context_type=eq.issue` },
        (payload) => {
          if (issueIds.includes(payload.new.context_id) && payload.new.from_user !== currentUser.id) {
            setLayoutPings(prev => [payload.new, ...prev].slice(0, 10));
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isLayoutDesigner, currentUser?.id, layoutActiveIssues.length]);

  // Realtime: Hayley's layout reference uploads
  useEffect(() => {
    if (!isLayoutDesigner) return;
    if (!currentUser?.id || !isOnline()) return;
    if (layoutActiveIssues.length === 0) return;
    const issueIds = layoutActiveIssues.map(i => i.id);
    const ch = supabase
      .channel(`layout-refs-${currentUser.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "flatplan_page_layouts" },
        (payload) => {
          if (issueIds.includes(payload.new.issue_id)) {
            setLayoutRefs(prev => [payload.new, ...prev].slice(0, 10));
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isLayoutDesigner, currentUser?.id, layoutActiveIssues.length]);

  // Realtime: own send-to-press — DOSE moment + immediate stat refresh
  useEffect(() => {
    if (!isLayoutDesigner) return;
    if (!currentUser?.id || !isOnline()) return;
    const ch = supabase
      .channel(`layout-press-${currentUser.id}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "issues", filter: `sent_to_press_by=eq.${currentUser.id}` },
        (payload) => {
          if (payload.new.sent_to_press_at && !payload.old.sent_to_press_at) {
            setLayoutRecentPress(prev => [{
              ...payload.new,
              pubId: payload.new.pub_id,
              sentToPressAt: payload.new.sent_to_press_at,
            }, ...prev]);
            setLayoutStats(prev => ({
              ...prev,
              issuesThisMonth: prev.issuesThisMonth + 1,
              activeDeadlines: Math.max(0, prev.activeDeadlines - 1),
            }));
            setLayoutActiveIssues(prev => prev.filter(i => i.id !== payload.new.id));
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isLayoutDesigner, currentUser?.id]);

  // P2 — Flag back to editor: drops story to Edit + pings the
  // assigned editor with a reason. Modal state + handlers live here
  // so the dashboard row can fire it inline.
  const [flagBackStory, setFlagBackStory] = useState(null);
  const [flagBackReason, setFlagBackReason] = useState("");
  const [flagBackOther, setFlagBackOther] = useState("");
  const [flagBackSubmitting, setFlagBackSubmitting] = useState(false);
  const [pkgDownloading, setPkgDownloading] = useState(null); // story.id while in flight

  const submitFlagBack = async () => {
    if (!flagBackStory || flagBackSubmitting) return;
    const reason = flagBackReason === "other" ? flagBackOther.trim() : flagBackReason;
    if (!reason) return;
    setFlagBackSubmitting(true);
    try {
      // 1. Story drops back to Edit + print_status to none
      await supabase.from("stories").update({
        status: "Edit",
        print_status: "none",
      }).eq("id", flagBackStory.id);

      // 2. Ping the editor — assigned_to or editor_id, falling back
      // to anyone with editor-ish role on the story's pub. team_notes
      // FKs reference team_members(id), not auth.users(id).
      const editorId = flagBackStory.editor_id
        || flagBackStory.editorId
        || flagBackStory.assigned_to
        || flagBackStory.assignedTo
        || (team || []).find(t => t.role === "Content Editor" && t.isActive !== false)?.id
        || (team || []).find(t => ["Editor", "Managing Editor"].includes(t.role) && t.isActive !== false)?.id;

      if (editorId) {
        await supabase.from("team_notes").insert({
          from_user: currentUser?.id || null,
          to_user: editorId,
          message: `Flagging "${flagBackStory.title || 'Untitled'}" back from layout — ${reason}`,
          context_type: "story",
          context_id: flagBackStory.id,
        });
      }

      // 3. Optimistic UI: remove from Ready list + sync parent stories
      setLayoutReady(prev => prev.filter(s => s.id !== flagBackStory.id));
      if (typeof setStories === "function") {
        setStories(prev => prev.map(s => s.id === flagBackStory.id ? { ...s, status: "Edit", print_status: "none", printStatus: "none" } : s));
      }

      setFlagBackStory(null);
      setFlagBackReason("");
      setFlagBackOther("");
    } catch (err) {
      console.error("Flag back failed:", err);
    }
    setFlagBackSubmitting(false);
  };

  // P2 — InDesign story package download. Pulls fresh body + images
  // (the dashboard row only carries summary fields — body lives in
  // stories.body, images in media_assets WHERE story_id=$).
  const handleDownloadPackage = async (s) => {
    if (pkgDownloading) return;
    setPkgDownloading(s.id);
    try {
      const [storyRes, imgRes] = await Promise.all([
        supabase.from("stories").select("id, title, slug, author, body, deck, photo_credit, word_count, word_limit, category, has_images, page, jump_to_page, print_issue_id, due_date, publication_id").eq("id", s.id).single(),
        supabase.from("media_assets").select("file_name, cdn_url, file_url, caption, photo_credit").eq("story_id", s.id).order("created_at", { ascending: true }),
      ]);
      if (storyRes.error || !storyRes.data) throw storyRes.error || new Error("Story not found");
      const fullStory = storyRes.data;
      const images = (imgRes.data || []).map(r => ({
        url: r.cdn_url || r.file_url,
        file_name: r.file_name,
        caption: r.caption,
        photo_credit: r.photo_credit,
      })).filter(i => i.url);
      const iss = layoutActiveIssues.find(i => i.id === fullStory.print_issue_id);
      await downloadStoryPackage({
        story: fullStory,
        images,
        pubName: pn(fullStory.publication_id),
        issueLabel: iss?.label || "",
      });
    } catch (err) {
      console.error("Package download failed:", err);
    }
    setPkgDownloading(null);
  };

  // Mark a story on-page (advances print_status + stamps placed_by/laid_out_at)
  const handleMarkOnPage = async (storyId) => {
    const updates = {
      print_status: "on_page",
      placed_by: currentUser.id,
      laid_out_at: new Date().toISOString(),
    };
    setLayoutReady(prev => prev.filter(s => s.id !== storyId));
    const { error } = await supabase.from("stories").update(updates).eq("id", storyId);
    if (error) {
      console.error("Mark On Page failed:", error.message);
      return;
    }
    if (typeof setStories === "function") {
      setStories(prev => prev.map(s => s.id === storyId ? {
        ...s,
        print_status: "on_page",
        printStatus: "on_page",
        placedBy: currentUser.id,
        laidOutAt: updates.laid_out_at,
      } : s));
    }
  };

  // ─── Content Editor data load (Camille P2) ──────────────────────
  // team_notes inbox scoped to story-context pings the current user
  // received in the last 14 days. Anthony's Flag-back modal writes
  // these with context_type='story', so this list IS the actionable
  // rebound queue from layout.
  const isContentEditorRole = ["Editor", "Managing Editor", "Copy Editor", "Content Editor", "Editor-in-Chief", "Photo Editor"].includes(role);
  useEffect(() => {
    if (!isContentEditorRole) return;
    if (!currentUser?.id || !isOnline()) return;
    const since = new Date(Date.now() - 14 * 86400000).toISOString();
    (async () => {
      const { data } = await supabase
        .from("team_notes")
        .select("id, message, context_id, from_user, created_at, is_read")
        .eq("to_user", currentUser.id)
        .eq("context_type", "story")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20);
      setEditorialPings(data || []);
    })();
  }, [isContentEditorRole, currentUser?.id]);

  // Realtime — new pings appear within seconds without a refresh.
  useEffect(() => {
    if (!isContentEditorRole) return;
    if (!currentUser?.id || !isOnline()) return;
    const ch = supabase
      .channel(`editorial-pings-${currentUser.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "team_notes", filter: `to_user=eq.${currentUser.id}` },
        (payload) => {
          if (payload.new.context_type === "story") {
            setEditorialPings(prev => [payload.new, ...prev].slice(0, 20));
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isContentEditorRole, currentUser?.id]);

  // ─── Publisher data load (Hayley P1) ────────────────────────────
  // Same top-level effect pattern as Layout Designer — guard inside,
  // not around the hook, so call order stays stable across role
  // switches. Pulls in-review proofs, recently-shipped issues, and
  // ad pages missing layout reference uploads.
  const isPublisherRole = role === "Publisher" || role === "Editor-in-Chief";
  useEffect(() => {
    if (!isPublisherRole) return;
    if (!isOnline()) return;
    (async () => {
      // Proofs awaiting review
      const { data: proofs } = await supabase
        .from("issue_proofs")
        .select("id, issue_id, version, uploaded_at, page_count, status")
        .eq("status", "review")
        .order("uploaded_at", { ascending: false })
        .limit(20);
      setPubProofsInReview(proofs || []);

      // Recently shipped issues — last 7 days
      const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
      const recent = (_issues || []).filter(i => i.sentToPressAt && i.sentToPressAt >= since7)
        .sort((a, b) => (b.sentToPressAt || "").localeCompare(a.sentToPressAt || ""));
      setPubRecentPress(recent);

      // Layout reference gaps: issues approaching press (next 14d)
      // where pages have ad placements but no flatplan_page_layouts
      // row. Bounded by issueIds-in-window so the join stays cheap.
      const cutoff14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      const upcomingIds = (_issues || []).filter(i => i.date >= today && i.date <= cutoff14 && !i.sentToPressAt).map(i => i.id);
      if (upcomingIds.length === 0) {
        setPubLayoutRefGaps([]);
      } else {
        const [salesRes, refsRes] = await Promise.all([
          supabase.from("sales").select("issue_id, page").in("issue_id", upcomingIds).eq("status", "Closed").not("page", "is", null),
          supabase.from("flatplan_page_layouts").select("issue_id, page_number").in("issue_id", upcomingIds),
        ]);
        const refSet = new Set((refsRes.data || []).map(r => `${r.issue_id}::${r.page_number}`));
        const adPages = new Map(); // issueId → Set of pages
        for (const s of (salesRes.data || [])) {
          if (!adPages.has(s.issue_id)) adPages.set(s.issue_id, new Set());
          adPages.get(s.issue_id).add(s.page);
        }
        const gaps = [];
        for (const [iid, pages] of adPages) {
          const missing = [...pages].filter(p => !refSet.has(`${iid}::${p}`));
          if (missing.length > 0) {
            const iss = (_issues || []).find(i => i.id === iid);
            if (iss) gaps.push({ issue: iss, missingPages: missing.sort((a, b) => a - b) });
          }
        }
        gaps.sort((a, b) => (a.issue.date || "").localeCompare(b.issue.date || ""));
        setPubLayoutRefGaps(gaps);
      }
    })();
  }, [isPublisherRole, _issues?.length]);

  // Publisher signoff handler — flips publisher_signoff_at on the
  // issue. Same call as the Layout Console button.
  const handlePublisherSignoff = async (issueId) => {
    if (!currentUser?.id || signingOffIssueId === issueId) return;
    setSigningOffIssueId(issueId);
    try {
      await supabase.from("issues").update({
        publisher_signoff_at: new Date().toISOString(),
        publisher_signoff_by: currentUser.id,
      }).eq("id", issueId);
      // Activity log: issue_signed_off (outcome). Hayley's own action;
      // surfaces in the publisher stream as a celebration.
      const iss = (_issues || []).find(i => i.id === issueId);
      const pubName = iss ? pn(iss.pubId) : "issue";
      await supabase.rpc('log_activity', {
        p_event_type:     'issue_signed_off',
        p_summary:        `signed off ${pubName} ${iss?.label || ''}`.trim(),
        p_event_category: 'outcome',
        p_event_source:   'mydash',
        p_entity_table:   'issues',
        p_entity_id:      null,
        p_entity_summary: `${pubName} ${iss?.label || ''}`.trim(),
        p_publication_id: iss?.pubId || null,
        p_metadata:       { issue_id: issueId, press_date: iss?.date || null },
        p_visibility:     'team',
      });
    } catch (err) {
      console.error("Publisher signoff failed:", err);
    }
    setSigningOffIssueId(null);
  };

  // ─── Content Editor Dashboard (Camille) — Sec 12.2 ────
  // Editor-in-Chief and Photo Editor fold in here — both work against the
  // same editorial queue / issue deadlines / edit volume metrics.
  if (["Editor", "Managing Editor", "Copy Editor", "Content Editor", "Editor-in-Chief", "Photo Editor"].includes(role)) {
    const myQueue = _stories.filter(s => ["Needs Editing", "Draft"].includes(s.status)).sort((a, b) => (a.dueDate || "9").localeCompare(b.dueDate || "9"));
    const editedToday = _stories.filter(s => s.status === "Edited" && s.updatedAt?.startsWith(today));
    const stuckCount = myQueue.filter(s => s.updatedAt && Math.round((new Date(today) - new Date(s.updatedAt.slice(0, 10))) / 86400000) > 3).length;
    const issuesThisWeek = _issues.filter(i => i.edDeadline && daysUntil(i.edDeadline) <= 7 && daysUntil(i.edDeadline) >= 0);

    // DOSE metrics
    const thisMonthStr = today.slice(0, 7);
    const editedThisMonth = _stories.filter(s => s.status !== "Draft" && s.updatedAt?.startsWith(thisMonthStr)).length;
    const recentEdited = _stories.filter(s => ["Edited", "Approved", "On Page", "Published"].includes(s.status)).slice(0, 30);
    const firstPassRate = recentEdited.length > 0 ? Math.round(recentEdited.filter(s => s.status !== "Needs Editing").length / recentEdited.length * 100) : 100;
    const publishedRecent = _stories.filter(s => s.status === "Published" && s.publishedAt).sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""))[0];
    const d7ago = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const last7d = _stories.filter(s => s.status === "Edited" && s.updatedAt && s.updatedAt.slice(0, 10) >= d7ago);
    const byDay = {}; last7d.forEach(s => { const d = s.updatedAt.slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; });
    const hwm = Math.max(0, ...Object.values(byDay));
    const queueEmpty = myQueue.length === 0;

    return <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 28 }}>
      {/* DOSE Eye Candy */}
      <div style={{ ...glassStyle(), borderRadius: R, padding: "28px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          {!hideGreeting && <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{greeting}</div>}
          {hwm > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: Z.ac + "12", borderRadius: 20 }}>
            <span style={{ fontSize: 16 }}>📝</span>
            <div><div style={{ fontSize: 14, fontWeight: FW.black, color: Z.ac }}>{hwm} in a day</div><div style={{ fontSize: 10, color: Z.tm }}>7-day best</div></div>
          </div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.go, fontFamily: DISPLAY }}>{editedThisMonth}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Edited This Month</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: firstPassRate >= 80 ? Z.go : Z.wa, fontFamily: DISPLAY }}>{firstPassRate}%</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>First-Pass Rate</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: editedToday.length > 0 ? Z.go : Z.tm, fontFamily: DISPLAY }}>{editedToday.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Edited Today</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: myQueue.length > 5 ? Z.wa : Z.tx, fontFamily: DISPLAY }}>{myQueue.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>In Queue</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {publishedRecent && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: Z.bg, borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>📰</span>
            <span style={{ fontSize: FS.sm, color: Z.tx }}><span style={{ fontWeight: FW.bold }}>Your edit of "{publishedRecent.title?.slice(0, 40)}"</span> <span style={{ color: Z.tm }}>published</span></span>
          </div>}
          {queueEmpty && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: Z.go + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>✨</span>
            <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.go }}>Queue cleared — nice work!</span>
          </div>}
          {!queueEmpty && myQueue.length <= 3 && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: ACCENT.blue + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>🎯</span>
            <span style={{ fontSize: FS.sm, color: ACCENT.blue, fontWeight: FW.bold }}>{myQueue.length} to go — you've got this</span>
          </div>}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: dashCols, gap: 16 }}>
        {/* LEFT: Queue */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Camille P2 — From Layout: Anthony's flag-back pings + any
              other story-context team_notes addressed to the current
              editor in the last 14 days. Top of the column when
              non-empty so rebounds get fixed before new edits start. */}
          {editorialPings.length > 0 && (
            <div style={glass}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>↩ From Layout</span>
                <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{editorialPings.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto" }}>
                {editorialPings.map(p => {
                  const sender = (team || []).find(t => t.id === p.from_user)?.name || "Layout";
                  const isFlagback = /flagging|back from layout/i.test(p.message || "");
                  return (
                    <div
                      key={p.id}
                      onClick={() => onNavigate?.("stories", { storyId: p.context_id })}
                      style={{
                        padding: "8px 10px", background: Z.bg, borderRadius: Ri,
                        cursor: "pointer",
                        borderLeft: `2px solid ${isFlagback ? Z.wa : Z.ac}`,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: isFlagback ? Z.wa : Z.ac, fontFamily: COND }}>
                          {isFlagback ? "Flag back" : sender}
                        </span>
                        <span style={{ fontSize: 10, color: Z.td, fontFamily: COND }}>
                          {p.created_at ? fmtDate(p.created_at.slice(0, 10)) : ""}
                        </span>
                      </div>
                      <div title={p.message} style={{ fontSize: FS.xs, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.message}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <IncomingPipelineCard
            stories={_stories}
            team={team}
            userId={currentUser?.id}
            onOpenStory={() => onNavigate?.("stories")}
          />
          <div style={glass}>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 12 }}>My Editing Queue</div>
            {myQueue.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: Z.tm }}>Queue empty — nice work!</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 400, overflowY: "auto" }}>
              {myQueue.map(s => {
                const age = s.updatedAt ? Math.round((new Date(today) - new Date(s.updatedAt.slice(0, 10))) / 86400000) : 0;
                const urgency = age > 3 ? Z.da : s.dueDate && daysUntil(s.dueDate) <= 2 ? Z.wa : Z.tm;
                return <div key={s.id} onClick={() => onNavigate?.("stories")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: Z.bg, borderRadius: Ri, borderLeft: `3px solid ${urgency}`, cursor: "pointer" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{s.title}</div>
                    <div style={{ fontSize: FS.xs, color: Z.tm }}>{s.author || "—"} · {pn(s.publication)} · {age}d in queue</div>
                  </div>
                  <Btn sm v="secondary" onClick={(e) => { e.stopPropagation(); onNavigate?.("editorial"); }}>Edit</Btn>
                </div>;
              })}
            </div>}
          </div>
          <WebPublishingQueue
            stories={_stories}
            pubs={pubs}
            userId={currentUser?.id}
            onOpenStory={() => onNavigate?.("stories")}
            onOpenWebQueue={() => onNavigate?.("editorial")}
          />
          {/* Issue Story Assignments */}
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 10 }}>Issue Assignments</div>
            {issuesThisWeek.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No editorial deadlines this week</div>
            : issuesThisWeek.map(iss => {
              const issStories = _stories.filter(s => s.issueId === iss.id || s.publication === iss.pubId);
              const edited = issStories.filter(s => !["Draft", "Needs Editing"].includes(s.status)).length;
              const pct = issStories.length > 0 ? Math.round((edited / issStories.length) * 100) : 0;
              return <div key={iss.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${Z.bd}15` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{pn(iss.pubId)} {iss.label}</div>
                  <div style={{ fontSize: FS.xs, color: Z.tm }}>{edited}/{issStories.length} edited · {daysUntil(iss.edDeadline)}d to deadline</div>
                </div>
                <div style={{ width: 60, height: 6, background: Z.bd, borderRadius: 3 }}>
                  <div style={{ height: 6, borderRadius: 3, background: pct >= 80 ? Z.go : pct >= 50 ? Z.wa : Z.da, width: `${pct}%` }} />
                </div>
              </div>;
            })}
          </div>
          <WriterPerformanceTable
            stories={_stories}
            team={team}
            userId={currentUser?.id}
            onOpenMember={(memberId) => onNavigate?.(`/team-member?memberId=${memberId}`)}
          />
        </div>
        {/* RIGHT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <DirectionCard />
          <EditedStoryImpactCard
            stories={_stories}
            currentUserId={currentUser?.id}
            userId={currentUser?.id}
            onOpenStory={() => onNavigate?.("stories")}
          />
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Today's Completed</div>
            {editedToday.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No stories submitted yet today</div>
            : editedToday.map(s => <div key={s.id} style={{ fontSize: FS.sm, color: Z.tx, padding: "4px 0" }}>{s.title}</div>)}
          </div>
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Quick Links</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Btn sm v="secondary" onClick={() => onNavigate?.("stories")} style={{ justifyContent: "flex-start" }}>Story Editor</Btn>
              <Btn sm v="secondary" onClick={() => onNavigate?.("editorial")} style={{ justifyContent: "flex-start" }}>Editorial Dashboard</Btn>
            </div>
          </div>
        </div>
      </div>
    </div>;
  }

  // ─── Layout Designer Dashboard (Anthony) — Sec 12.3 ────
  if (isLayoutDesigner) {
    // Filter active issues by newspaper/magazine if filter chip is set.
    // Pubs categorize via their `type` (newspaper | magazine | annual).
    const filteredActive = layoutFilter === "all"
      ? layoutActiveIssues
      : layoutActiveIssues.filter(iss => {
          const pub = (pubs || []).find(p => p.id === iss.pubId);
          const pubType = (pub?.type || "").toLowerCase();
          if (layoutFilter === "newspapers") return pubType.includes("newspaper") || !pubType;
          if (layoutFilter === "magazines") return pubType.includes("magazine") || pubType.includes("annual");
          return true;
        });

    // Pipeline + Ready grouped by issue for tile rendering
    const pipelineByIssue = layoutPipeline.reduce((acc, s) => {
      const key = s.print_issue_id || "_unassigned";
      (acc[key] = acc[key] || []).push(s);
      return acc;
    }, {});
    const readyByIssue = layoutReady.reduce((acc, s) => {
      const key = s.print_issue_id || "_unassigned";
      (acc[key] = acc[key] || []).push(s);
      return acc;
    }, {});

    const onTimeColor = layoutStats.onTimeRate >= 90 ? Z.go : layoutStats.onTimeRate >= 70 ? Z.wa : Z.da;
    const queueEmpty = layoutReady.length === 0 && layoutPipeline.length === 0;
    const justShipped = layoutRecentPress[0];

    return <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 28 }}>
      {/* DOSE Hero */}
      <div style={{ ...glassStyle(), borderRadius: R, padding: "28px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          {!hideGreeting && <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{greeting}</div>}
          {layoutStats.streakDays >= 3 && <div title={`${layoutStats.streakDays} distinct days shipping in the last 30`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: Z.wa + "12", borderRadius: 20 }}>
            <span style={{ fontSize: 16 }}>🔥</span>
            <div><div style={{ fontSize: 14, fontWeight: FW.black, color: Z.wa }}>{layoutStats.streakDays} days</div><div style={{ fontSize: 10, color: Z.tm }}>shipping</div></div>
          </div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.go, fontFamily: DISPLAY }}>{layoutStats.pagesThisMonth}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Pages laid out</div>
            <div style={{ fontSize: 9, color: Z.td, marginTop: 1 }}>this month</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.go, fontFamily: DISPLAY }}>{layoutStats.issuesThisMonth}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Issues to press</div>
            <div style={{ fontSize: 9, color: Z.td, marginTop: 1 }}>this month</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: onTimeColor, fontFamily: DISPLAY }}>{layoutStats.onTimeRate}%</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>On-time rate</div>
            <div style={{ fontSize: 9, color: Z.td, marginTop: 1 }}>last 30 days</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: layoutStats.activeDeadlines > 0 ? Z.da : Z.go, fontFamily: DISPLAY }}>{layoutStats.activeDeadlines}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Active deadlines</div>
            <div style={{ fontSize: 9, color: Z.td, marginTop: 1 }}>next 7 days</div>
          </div>
        </div>
        {/* Beat strip — conditional badges based on current state */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {justShipped && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: Z.go + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>📰</span>
            <span style={{ fontSize: FS.sm, color: Z.tx }}><span style={{ fontWeight: FW.bold }}>{pn(justShipped.pubId)} {justShipped.label}</span> <span style={{ color: Z.tm }}>went to press</span></span>
          </div>}
          {queueEmpty && !justShipped && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: Z.go + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>✨</span>
            <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.go }}>All caught up — no pages waiting</span>
          </div>}
          {!queueEmpty && layoutReady.length > 0 && layoutReady.length <= 3 && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: ACCENT.indigo + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>🎯</span>
            <span style={{ fontSize: FS.sm, color: ACCENT.indigo, fontWeight: FW.bold }}>{layoutReady.length} to layout — you've got this</span>
          </div>}
          {layoutPipeline.filter(s => s.due_date && s.due_date < today).length > 0 && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: Z.wa + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <span style={{ fontSize: FS.sm, color: Z.wa, fontWeight: FW.bold }}>{layoutPipeline.filter(s => s.due_date && s.due_date < today).length} stories past ed deadline — Camille's working on it</span>
          </div>}
        </div>
      </div>

      {/* Two-column body */}
      <div style={{ display: "grid", gridTemplateColumns: dashCols, gap: 16 }}>
        {/* LEFT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Today's Issues */}
          <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>Today's Issues</div>
              <div style={{ display: "flex", gap: 4 }}>
                {[["all", "All"], ["newspapers", "Newspapers"], ["magazines", "Magazines"]].map(([v, l]) => (
                  <button key={v} onClick={() => setLayoutFilter(v)} style={{ padding: "3px 10px", borderRadius: Ri, border: "none", cursor: "pointer", fontSize: 10, fontWeight: layoutFilter === v ? FW.bold : 500, background: layoutFilter === v ? Z.tx + "12" : "transparent", color: layoutFilter === v ? Z.tx : Z.td, textTransform: "uppercase", letterSpacing: 0.4 }}>{l}</button>
                ))}
              </div>
            </div>
            {filteredActive.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: Z.tm }}>No active issues in the next 21 days</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 580, overflowY: "auto" }}>
              {filteredActive.map(iss => {
                const d = daysUntil(iss.date);
                const borderColor = d <= 1 ? Z.da : d <= 3 ? Z.wa : Z.go;
                const totalPages = iss.pageCount || 8;
                const pct = Math.min(100, Math.round((iss.pagesStarted / totalPages) * 100));
                const dotColor = (s) => s === "green" ? Z.go : s === "amber" ? Z.wa : Z.da;
                return (
                  <div key={iss.id} style={{
                    padding: "14px 16px", background: Z.bg, borderRadius: R,
                    borderLeft: `3px solid ${borderColor}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ display: "inline-flex", gap: 3 }}>
                          <span title="Editorial pipeline" style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor(iss.dEd), display: "inline-block" }} />
                          <span title="Layout progress" style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor(iss.dLay), display: "inline-block" }} />
                          <span title="Ad placement" style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor(iss.dAd), display: "inline-block" }} />
                        </span>
                        <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>
                          {pn(iss.pubId)} {iss.label}
                        </span>
                      </div>
                      <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: borderColor, padding: "2px 8px", background: borderColor + "15", borderRadius: Ri, fontFamily: COND, letterSpacing: 0.4 }}>
                        PRESS: {d <= 0 ? "TODAY" : d === 1 ? "TOMORROW" : `${d}D`}
                      </span>
                    </div>

                    <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, lineHeight: 1.7, marginBottom: 8 }}>
                      <div>EDITORIAL: <strong style={{ color: Z.tx }}>{iss.edReady} ready</strong> · {iss.edInEdit} in edit · {iss.edDraft} draft</div>
                      <div>LAYOUT: <strong style={{ color: Z.tx }}>{iss.layOnPage} on-page</strong> · {iss.layProofread} proofread · {iss.layApproved} approved</div>
                      <div>ADS: <strong style={{ color: Z.tx }}>{iss.adsPlaced} placed</strong> · {iss.adsAwaitingProof} awaiting proof · {iss.adsMissing} missing</div>
                    </div>

                    <div style={{ height: 4, background: Z.bd, borderRadius: 2, marginBottom: 6 }}>
                      <div style={{ height: 4, borderRadius: 2, background: pct >= 80 ? Z.go : pct >= 40 ? Z.wa : Z.da, width: `${pct}%`, transition: "width 0.3s" }} />
                    </div>
                    <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND, marginBottom: 10 }}>
                      {iss.pagesStarted} of {totalPages} pages started{iss.pagesComplete > 0 ? ` · ${iss.pagesComplete} complete` : ""}
                    </div>

                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn sm onClick={() => onNavigate?.(`/layout?id=${iss.id}`)}>Open Layout Console</Btn>
                      <Btn sm v="secondary" onClick={() => onNavigate?.("flatplan", { pub: iss.pubId, issue: iss.id })}>Open Flatplan</Btn>
                    </div>
                  </div>
                );
              })}
            </div>}
          </div>

          {/* Incoming from Editorial */}
          <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Incoming from Editorial</span>
              <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{layoutPipeline.length} in flight</span>
            </div>
            {layoutPipeline.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>Nothing in editorial pipeline</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
              {layoutPipeline.slice(0, 12).map(s => {
                const overdue = s.due_date && s.due_date < today;
                return <div key={s.id} onClick={() => onNavigate?.("stories", { storyId: s.id })} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: Z.bg, borderRadius: Ri, cursor: "pointer", borderLeft: `2px solid ${overdue ? Z.da : Z.bd}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div title={s.title || "Untitled"} style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title || "Untitled"}</div>
                    <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{s.author || "—"} · {pn(s.publication_id)} · Camille has it</div>
                  </div>
                  {s.due_date && <span style={{ fontSize: FS.xs, color: overdue ? Z.da : Z.tm, fontWeight: FW.bold, fontFamily: COND }}>{overdue ? `${Math.abs(daysUntil(s.due_date))}d over` : `${daysUntil(s.due_date)}d`}</span>}
                </div>;
              })}
            </div>}
          </div>

          {/* Ready for Layout — grouped by issue */}
          <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Ready for Layout</span>
              <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{layoutReady.length} stor{layoutReady.length === 1 ? "y" : "ies"}</span>
            </div>
            {layoutReady.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>Nothing waiting for you</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto" }}>
              {Object.entries(readyByIssue).map(([iid, items]) => {
                const iss = filteredActive.find(i => i.id === iid) || layoutActiveIssues.find(i => i.id === iid);
                if (!iss && iid !== "_unassigned") return null;
                return <div key={iid} style={{ background: Z.bg, borderRadius: Ri, padding: "8px 10px" }}>
                  <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.tm, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: COND, marginBottom: 6 }}>
                    {iss ? `${pn(iss.pubId)} ${iss.label}` : "Unassigned issue"} · {items.length}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {items.map(s => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 4px", borderTop: `1px solid ${Z.bd}15` }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div title={s.title || "Untitled"} style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title || "Untitled"}</div>
                          <div style={{ fontSize: 10, color: Z.td, fontFamily: COND }}>{s.author || "—"}{s.word_count ? ` · ${s.word_count}w` : ""}{s.has_images ? " · 📷" : ""}{s.page ? ` · p${s.page}` : ""}</div>
                        </div>
                        <button
                          onClick={() => handleDownloadPackage(s)}
                          disabled={pkgDownloading === s.id}
                          title="Download InDesign story package (.zip)"
                          style={{ background: "transparent", border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "3px 6px", cursor: "pointer", fontSize: 11, color: Z.tm, fontFamily: COND }}
                        >
                          {pkgDownloading === s.id ? "…" : "Pkg"}
                        </button>
                        <button
                          onClick={() => setFlagBackStory(s)}
                          title="Flag back to editor"
                          style={{ background: "transparent", border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "3px 6px", cursor: "pointer", fontSize: 11, color: Z.tm, fontFamily: COND }}
                        >
                          ↩
                        </button>
                        <Btn sm onClick={() => handleMarkOnPage(s.id)}>Mark On Page</Btn>
                      </div>
                    ))}
                  </div>
                </div>;
              })}
            </div>}
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <DirectionCard />

          {/* Issue Pings */}
          {layoutPings.length > 0 && <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 10 }}>Issue Pings</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
              {layoutPings.map(p => {
                const sender = (team || []).find(t => t.id === p.from_user)?.name || "Someone";
                const iss = layoutActiveIssues.find(i => i.id === p.context_id);
                return <div key={p.id} onClick={() => iss && onNavigate?.("flatplan", { pub: iss.pubId, issue: iss.id })} style={{ padding: "8px 10px", background: Z.bg, borderRadius: Ri, cursor: iss ? "pointer" : "default" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.ac, fontFamily: COND }}>{sender}</span>
                    <span style={{ fontSize: 10, color: Z.td, fontFamily: COND }}>{iss ? `${pn(iss.pubId)} ${iss.label}` : ""}</span>
                  </div>
                  <div title={p.message} style={{ fontSize: FS.xs, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.message}</div>
                </div>;
              })}
            </div>
          </div>}

          {/* Hayley's Layout Refs */}
          {layoutRefs.length > 0 && <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 10 }}>Hayley's Layout Refs</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
              {layoutRefs.map(r => {
                const iss = layoutActiveIssues.find(i => i.id === r.issue_id);
                return <div key={r.id} onClick={() => iss && onNavigate?.("flatplan", { pub: iss.pubId, issue: iss.id, page: r.page_number })} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: Z.bg, borderRadius: Ri, cursor: iss ? "pointer" : "default" }}>
                  {r.cdn_url && <img src={r.cdn_url} alt="" loading="lazy" style={{ width: 32, height: 32, borderRadius: 3, objectFit: "cover", flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: FS.xs, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>Page {r.page_number}{iss ? ` · ${pn(iss.pubId)} ${iss.label}` : ""}</div>
                    <div style={{ fontSize: 10, color: Z.td }}>{r.uploaded_at ? fmtDate(r.uploaded_at.slice(0, 10)) : ""}</div>
                  </div>
                </div>;
              })}
            </div>
          </div>}

          {/* From Press */}
          {layoutRecentPress.length > 0 && <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 10 }}>From Press</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {layoutRecentPress.slice(0, 5).map(p => (
                <div key={p.id} style={{ padding: "6px 8px", background: Z.go + "08", borderRadius: Ri, borderLeft: `2px solid ${Z.go}` }}>
                  <div style={{ fontSize: FS.xs, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>📰 {pn(p.pubId)} {p.label}</div>
                  <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND }}>sent {p.sentToPressAt ? fmtDate(p.sentToPressAt.slice(0, 10)) : "—"} · awaiting confirmation</div>
                </div>
              ))}
            </div>
          </div>}

          {/* Quick Links */}
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Quick Links</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Btn sm v="secondary" onClick={() => onNavigate?.("stories")} style={{ justifyContent: "flex-start" }}>Stories / Editorial</Btn>
              <Btn sm v="secondary" onClick={() => onNavigate?.("flatplan")} style={{ justifyContent: "flex-start" }}>Flatplan</Btn>
              <Btn sm v="secondary" onClick={() => onNavigate?.("publications")} style={{ justifyContent: "flex-start" }}>Publications</Btn>
              <Btn sm v="secondary" onClick={() => onNavigate?.("calendar")} style={{ justifyContent: "flex-start" }}>Calendar</Btn>
            </div>
          </div>
        </div>
      </div>

      {/* Flag-back modal — Anthony's "send back to editor" affordance.
          Shown when flagBackStory is set; closes by setting null. */}
      {flagBackStory && (
        <div onClick={() => !flagBackSubmitting && setFlagBackStory(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: Z.sf, borderRadius: R, padding: 24, width: 440, maxWidth: "92vw",
            border: `1px solid ${Z.bd}`,
          }}>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 6 }}>Flag back to editor</div>
            <div title={flagBackStory.title} style={{ fontSize: FS.sm, color: Z.tm, marginBottom: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{flagBackStory.title || "Untitled"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {[
                ["too_long", "Story too long for slot — needs cut"],
                ["bad_photo", "Need a better photo"],
                ["bad_headline", "Headline doesn't fit"],
                ["other", "Other (describe)"],
              ].map(([k, l]) => (
                <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: FS.sm, color: Z.tx, cursor: "pointer" }}>
                  <input type="radio" name="flagback" checked={flagBackReason === k} onChange={() => setFlagBackReason(k)} />
                  {l}
                </label>
              ))}
            </div>
            {flagBackReason === "other" && (
              <textarea
                value={flagBackOther}
                onChange={e => setFlagBackOther(e.target.value)}
                placeholder="What's the issue?"
                rows={3}
                style={{ width: "100%", padding: 8, borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical", outline: "none", marginBottom: 12 }}
              />
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn sm v="secondary" onClick={() => setFlagBackStory(null)} disabled={flagBackSubmitting}>Cancel</Btn>
              <Btn sm onClick={submitFlagBack} disabled={flagBackSubmitting || !flagBackReason || (flagBackReason === "other" && !flagBackOther.trim())}>
                {flagBackSubmitting ? "Sending…" : "Send to editor"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>;
  }

  // ─── Office Admin Dashboard (Cami) — Sec 12.5 ────
  if (["Office Manager", "Office Administrator"].includes(role)) {
    // ── Tickets / subs / legal (existing signals) ──
    const openTix = _tickets.filter(t => ["open", "in_progress"].includes(t.status));
    const escalatedTix = openTix.filter(t => t.status === "escalated" || t.priority === "urgent");
    // Tickets in any active state with no first-response stamp yet — Cami's
    // SLA exposure. Auto-stamped by ServiceDesk when she acts.
    const needsFirstResp = _tickets.filter(t =>
      ["open", "in_progress", "escalated"].includes(t.status) && !t.firstResponseAt
    );
    const d30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const d14ago = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const d7ago = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    const renewalsDue = _subs.filter(s => s.status === "active" && s.renewalDate && s.renewalDate >= today && s.renewalDate <= d30);
    const activeSubs = _subs.filter(s => s.status === "active").length;
    const newSubsMonth = _subs.filter(s => s.status === "active" && s.startDate?.startsWith(today.slice(0, 7))).length;
    // Recently lapsed — subs whose status is lapsed/expired AND
    // updatedAt or lapsedAt fell in the last 14 days. Cami's rescue
    // window — call them before they go cold.
    const recentLapsed = _subs.filter(s =>
      ["lapsed", "expired", "cancelled"].includes(s.status)
      && (s.lapsedAt || s.updatedAt || s.endDate || "") >= d14ago
    ).slice(0, 8);
    const activeLegal = _legal.filter(n => !["published", "billed"].includes(n.status));
    const publishedUnbilled = _legal.filter(n => n.status === "published");

    // ── A/R aging from invoices ──
    const _invoices = invoices || [];
    const overdueInv = _invoices.filter(i =>
      i.balanceDue > 0 && i.dueDate && i.dueDate < today && !["paid", "void", "cancelled"].includes(i.status)
    );
    const overdueTotal = overdueInv.reduce((s, i) => s + (i.balanceDue || 0), 0);
    const overdue30Plus = overdueInv.filter(i => i.dueDate <= d7ago).length; // technically 7+ but visible bucket

    // ── Tearsheet curation queue (P5j tie-in) ──
    // Closed sales with a page assignment whose issue has shipped
    // (sentToPressAt set) but no tearsheet uploaded yet. This is the
    // exact scope the Tearsheet Center surfaces; we just show the
    // count + a click-through.
    const issuesShipped = new Set(_issues.filter(i => i.sentToPressAt).map(i => i.id));
    const tearsheetMissing = _sales.filter(s =>
      s.status === "Closed" && s.page && s.issueId && issuesShipped.has(s.issueId) && !s.tearsheetUrl
    );
    // Group by issueId → which issues are most behind
    const tearsheetByIssue = (() => {
      const map = new Map();
      for (const s of tearsheetMissing) {
        if (!map.has(s.issueId)) map.set(s.issueId, []);
        map.get(s.issueId).push(s);
      }
      const arr = Array.from(map.entries()).map(([iid, items]) => {
        const iss = _issues.find(i => i.id === iid);
        return { iid, iss, count: items.length };
      });
      arr.sort((a, b) => (b.iss?.date || "").localeCompare(a.iss?.date || ""));
      return arr.slice(0, 6);
    })();

    // ── Recent payments + DOSE signals ──
    const recentPayments = (payments || []).filter(p => p.receivedAt && p.receivedAt >= d7ago).slice(0, 5);
    const paymentsThisWeek = (payments || []).filter(p => p.receivedAt && p.receivedAt >= d7ago);
    const paymentsTotalWeek = paymentsThisWeek.reduce((s, p) => s + (p.amount || 0), 0);

    const resolvedThisWeek = _tickets.filter(t => t.status === "resolved" && t.resolvedAt && t.resolvedAt.slice(0, 10) >= d7ago).length;

    // ── Auto-generated checklist (priority-sorted) ──
    const checklist = [];
    if (escalatedTix.length > 0) checklist.push({ id: "esc", title: `${escalatedTix.length} escalated ticket${escalatedTix.length > 1 ? "s" : ""}`, dept: "Tickets", page: "servicedesk", priority: 0 });
    if (needsFirstResp.length > 0) checklist.push({ id: "first-reply", title: `${needsFirstResp.length} ticket${needsFirstResp.length > 1 ? "s need" : " needs"} a first response`, dept: "Tickets", page: "servicedesk", priority: 1 });
    if (overdueInv.length > 0) checklist.push({ id: "overdue", title: `${overdueInv.length} overdue invoice${overdueInv.length > 1 ? "s" : ""} · ${fmtCurrency(overdueTotal)}`, dept: "A/R", page: "billing", priority: overdueInv.length > 5 ? 1 : 2 });
    if (tearsheetMissing.length > 0) checklist.push({ id: "tearsheets", title: `${tearsheetMissing.length} tearsheets to upload`, dept: "Tearsheets", page: "tearsheets", priority: tearsheetMissing.length > 10 ? 1 : 2 });
    if (publishedUnbilled.length > 0) checklist.push({ id: "legalbill", title: `${publishedUnbilled.length} legal notice${publishedUnbilled.length > 1 ? "s" : ""} ready to bill`, dept: "Legal", page: "legalnotices", priority: 2 });
    if (renewalsDue.length > 0) checklist.push({ id: "renewals", title: `${renewalsDue.length} renewal notice${renewalsDue.length > 1 ? "s" : ""} to send`, dept: "Subs", page: "circulation", priority: renewalsDue.length > 10 ? 1 : 2 });
    if (recentLapsed.length > 0) checklist.push({ id: "lapsed", title: `${recentLapsed.length} subscriber${recentLapsed.length > 1 ? "s" : ""} lapsed in last 14d`, dept: "Subs", page: "circulation", priority: 2 });
    if (openTix.length > 0 && escalatedTix.length === 0) checklist.push({ id: "tickets", title: `${openTix.length} open service desk ticket${openTix.length > 1 ? "s" : ""}`, dept: "Tickets", page: "servicedesk", priority: 2 });
    if (activeLegal.length > 0) checklist.push({ id: "legal", title: `${activeLegal.length} legal notice${activeLegal.length > 1 ? "s" : ""} pending publish`, dept: "Legal", page: "legalnotices", priority: 3 });
    checklist.sort((a, b) => a.priority - b.priority);

    const allClear = checklist.length === 0;

    const cn = (id) => _clients.find(c => c.id === id)?.name || "—";

    return <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 28 }}>
      {/* Hero */}
      <div style={{ ...glassStyle(), borderRadius: R, padding: "28px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          {!hideGreeting && <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{greeting}</div>}
          {resolvedThisWeek > 0 && <div title={`${resolvedThisWeek} tickets resolved this week`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: Z.go + "12", borderRadius: 20 }}>
            <span style={{ fontSize: 16 }}>✅</span>
            <div><div style={{ fontSize: 14, fontWeight: FW.black, color: Z.go }}>{resolvedThisWeek} resolved</div><div style={{ fontSize: 10, color: Z.tm }}>this week</div></div>
          </div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: escalatedTix.length > 0 ? Z.da : openTix.length > 0 ? Z.wa : Z.go, fontFamily: DISPLAY }}>{openTix.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Open Tickets</div>
            {escalatedTix.length > 0 && <div style={{ fontSize: 9, color: Z.da, marginTop: 1 }}>{escalatedTix.length} escalated</div>}
            {escalatedTix.length === 0 && needsFirstResp.length > 0 && <div style={{ fontSize: 9, color: Z.wa, marginTop: 1 }}>{needsFirstResp.length} need first reply</div>}
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: tearsheetMissing.length > 0 ? Z.wa : Z.go, fontFamily: DISPLAY }}>{tearsheetMissing.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Tearsheets to Upload</div>
            <div style={{ fontSize: 9, color: Z.td, marginTop: 1 }}>shipped issues</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: overdueInv.length > 0 ? Z.da : Z.go, fontFamily: DISPLAY }}>{fmtCurrency(overdueTotal)}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Overdue A/R</div>
            <div style={{ fontSize: 9, color: Z.td, marginTop: 1 }}>{overdueInv.length} invoice{overdueInv.length === 1 ? "" : "s"}</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: renewalsDue.length > 5 ? Z.wa : Z.tx, fontFamily: DISPLAY }}>{renewalsDue.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Renewals 30d</div>
            <div style={{ fontSize: 9, color: Z.td, marginTop: 1 }}>{activeSubs} active · {newSubsMonth} new</div>
          </div>
        </div>
        {/* Beat strip */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {allClear && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: Z.go + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>✨</span>
            <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.go }}>All caught up — every queue is clear</span>
          </div>}
          {!allClear && checklist.length <= 3 && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: ACCENT.blue + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>🎯</span>
            <span style={{ fontSize: FS.sm, color: ACCENT.blue, fontWeight: FW.bold }}>{checklist.length} item{checklist.length !== 1 ? "s" : ""} on today's list</span>
          </div>}
          {paymentsThisWeek.length > 0 && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: Z.go + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>💵</span>
            <span style={{ fontSize: FS.sm, color: Z.go, fontWeight: FW.bold }}>{fmtCurrency(paymentsTotalWeek)} collected this week</span>
          </div>}
          {escalatedTix.length > 0 && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: Z.da + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>🚨</span>
            <span style={{ fontSize: FS.sm, color: Z.da, fontWeight: FW.bold }}>{escalatedTix.length} escalated ticket{escalatedTix.length === 1 ? "" : "s"} — needs attention</span>
          </div>}
        </div>
      </div>

      {/* Two-column body */}
      <div style={{ display: "grid", gridTemplateColumns: dashCols, gap: 16 }}>
        {/* LEFT — work queues */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={glass}>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 12 }}>Today's Checklist</div>
            {checklist.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: Z.tm }}>All clear!</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {checklist.map(item => (
                <div key={item.id} onClick={() => onNavigate?.(item.page)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: Z.bg, borderRadius: Ri, cursor: "pointer", borderLeft: `3px solid ${item.priority === 0 ? Z.da : item.priority === 1 ? Z.wa : Z.ac}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx }}>{item.title}</div>
                  </div>
                  <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, background: Z.sa, padding: "2px 6px", borderRadius: Ri, fontFamily: COND }}>{item.dept}</span>
                </div>
              ))}
            </div>}
          </div>

          {/* Tearsheets queue — issues most behind */}
          {tearsheetByIssue.length > 0 && <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Tearsheets to Upload</span>
              <Btn sm v="secondary" onClick={() => onNavigate?.("tearsheets")}>Open Tearsheet Center →</Btn>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {tearsheetByIssue.map(g => (
                <div key={g.iid} onClick={() => onNavigate?.("tearsheets")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: Z.bg, borderRadius: Ri, cursor: "pointer", borderLeft: `2px solid ${Z.wa}` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>{pn(g.iss?.pubId)} {g.iss?.label || (g.iss?.date ? fmtDate(g.iss.date) : "Issue")}</div>
                    <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND }}>{g.iss?.sentToPressAt ? `pressed ${fmtDate(g.iss.sentToPressAt.slice(0, 10))}` : ""}</div>
                  </div>
                  <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.wa }}>{g.count} missing</span>
                </div>
              ))}
            </div>
          </div>}

          {/* Open tickets */}
          {openTix.length > 0 && <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 10 }}>Open Tickets ({openTix.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
              {openTix.slice(0, 8).map(t => (
                <div key={t.id} onClick={() => onNavigate?.("servicedesk")} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", background: Z.bg, borderRadius: Ri, cursor: "pointer", borderLeft: `2px solid ${t.status === "escalated" ? Z.da : Z.bd}` }}>
                  <div title={t.subject || t.description || "Ticket"} style={{ fontSize: FS.sm, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.subject || t.description?.slice(0, 50) || "Ticket"}</div>
                  <span style={{ fontSize: FS.xs, color: t.status === "escalated" ? Z.da : Z.tm, fontFamily: COND, fontWeight: FW.bold, flexShrink: 0, marginLeft: 8 }}>{t.status}</span>
                </div>
              ))}
            </div>
          </div>}

          {/* Recently lapsed subscribers — rescue list */}
          {recentLapsed.length > 0 && <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 10 }}>Recent Lapses (rescue)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
              {recentLapsed.map(s => (
                <div key={s.id} onClick={() => onNavigate?.("circulation")} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: Z.bg, borderRadius: Ri, cursor: "pointer" }}>
                  <div style={{ minWidth: 0 }}>
                    <div title={s.name || s.email} style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name || s.email || "—"}</div>
                    {s.email && s.name && <div style={{ fontSize: 10, color: Z.td, fontFamily: COND }}>{s.email}</div>}
                  </div>
                  <span style={{ fontSize: 10, color: Z.tm, fontFamily: COND, flexShrink: 0, marginLeft: 8 }}>{s.status}</span>
                </div>
              ))}
            </div>
          </div>}
        </div>

        {/* RIGHT — intake + reference */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <DirectionCard />

          {/* Overdue invoices */}
          {overdueInv.length > 0 && <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Overdue Invoices</span>
              <span style={{ fontSize: 10, fontWeight: FW.bold, color: Z.da, fontFamily: COND }}>{fmtCurrency(overdueTotal)}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 220, overflowY: "auto" }}>
              {overdueInv.slice(0, 8).map(inv => {
                const overdueDays = inv.dueDate ? Math.max(0, Math.round((new Date(today) - new Date(inv.dueDate)) / 86400000)) : 0;
                const tier = overdueDays > 60 ? Z.da : overdueDays > 30 ? Z.wa : Z.tm;
                return (
                  <div key={inv.id} onClick={() => onNavigate?.("billing")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", background: Z.bg, borderRadius: Ri, cursor: "pointer", borderLeft: `2px solid ${tier}` }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div title={cn(inv.clientId)} style={{ fontSize: FS.xs, fontWeight: FW.semi, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cn(inv.clientId)}</div>
                      <div style={{ fontSize: 9, color: Z.td, fontFamily: COND }}>#{inv.invoiceNumber || inv.id.slice(-6)} · {overdueDays}d overdue</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: FW.bold, color: tier, fontFamily: COND, flexShrink: 0 }}>{fmtCurrency(inv.balanceDue)}</span>
                  </div>
                );
              })}
            </div>
            {overdueInv.length > 8 && <div style={{ fontSize: 10, color: Z.tm, marginTop: 4, fontFamily: COND, textAlign: "center" }}>+{overdueInv.length - 8} more</div>}
          </div>}

          {/* Quick Links */}
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Quick Links</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Btn sm v="secondary" onClick={() => onNavigate?.("tearsheets")} style={{ justifyContent: "flex-start" }}>Tearsheet Center</Btn>
              <Btn sm v="secondary" onClick={() => onNavigate?.("billing")} style={{ justifyContent: "flex-start" }}>Billing</Btn>
              <Btn sm v="secondary" onClick={() => onNavigate?.("circulation")} style={{ justifyContent: "flex-start" }}>Subscriptions</Btn>
              <Btn sm v="secondary" onClick={() => onNavigate?.("servicedesk")} style={{ justifyContent: "flex-start" }}>Service Desk</Btn>
              <Btn sm v="secondary" onClick={() => onNavigate?.("legalnotices")} style={{ justifyContent: "flex-start" }}>Legal Notices</Btn>
            </div>
          </div>

          {/* Recent Payments */}
          {recentPayments.length > 0 && <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Recent Payments</div>
            {recentPayments.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: FS.sm, borderBottom: `1px solid ${Z.bd}15` }}>
                <span style={{ color: Z.tx }}>{fmtDate(p.receivedAt)}</span>
                <span style={{ color: Z.go, fontWeight: FW.bold }}>{fmtCurrency(p.amount)}</span>
              </div>
            ))}
          </div>}
        </div>
      </div>
    </div>;
  }

  // ─── Ad Designer Dashboard (Jen) — Sec 12.4 ────
  // Load ad projects for designer (runs for all roles but only acts for designers)
  const isAdDesigner = role === "Ad Designer" || (role === "Graphic Designer" && currentUser?.title === "Ad Designer");
  useEffect(() => {
    if (!isAdDesigner) return;
      if (!currentUser?.id || !isOnline()) return;
      (async () => {
        // Cap at 500 most-recent ad_projects. Designer dashboards only
        // need an active-window slice, not full history.
        const { data: projects } = await supabase.from("ad_projects").select("*")
          .order("created_at", { ascending: false })
          .limit(500);
        const myProjects = (projects || []).filter(p => p.designer_id === currentUser.id || !p.designer_id);
        setAdProjects(myProjects);

        // Auto-create ad projects for closed sales within 30d that have no project
        const cutoff30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
        const upcomingIssueIds = new Set((_issues || []).filter(i => i.date >= today && i.date <= cutoff30).map(i => i.id));
        const existingKeys = new Set(myProjects.map(p => `${p.client_id}|${p.issue_id}`));
        const jobKeys = new Set((_jobs || []).map(j => `${j.clientId}|${j.issueId}`));

        const needsProject = (_sales || [])
          .filter(s => s.status === "Closed" && s.issueId && upcomingIssueIds.has(s.issueId))
          .filter(s => !existingKeys.has(`${s.clientId}|${s.issueId}`) && !jobKeys.has(`${s.clientId}|${s.issueId}`));

        if (needsProject.length > 0) {
          const newProjects = needsProject.map(s => ({
            client_id: s.clientId,
            publication_id: s.publication,
            issue_id: s.issueId,
            ad_size: s.size || s.adSize || s.type || null,
            designer_id: currentUser.id,
            salesperson_id: (_clients || []).find(c => c.id === s.clientId)?.repId || null,
            status: "brief",
            design_notes: `Auto-created from sale. Ad size: ${s.size || s.adSize || s.type || "TBD"}`,
          }));
          const { data: created } = await supabase.from("ad_projects").insert(newProjects).select();
          if (created) setAdProjects(prev => [...created, ...prev]);
        }
      })();
  }, [isAdDesigner, currentUser?.id, _sales?.length, _issues?.length]);

  // P1.14 — realtime on ad_projects so the designer dashboard
  // reflects pickups, status flips, and approvals from anywhere
  // (other designers' actions, public proof approvals, etc).
  useEffect(() => {
    if (!isAdDesigner || !isOnline()) return;
    const ch = supabase
      .channel("dashboard-adprojects-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "ad_projects" }, (payload) => {
        const row = payload.new || payload.old;
        if (!row?.id) return;
        if (payload.eventType === "INSERT") {
          // Only ingest unassigned or own projects (mirrors the load filter).
          if (row.designer_id && row.designer_id !== currentUser?.id) return;
          setAdProjects(prev => prev.some(p => p.id === row.id) ? prev : [row, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          // If an unassigned row got picked up by someone else, drop it.
          if (row.designer_id && row.designer_id !== currentUser?.id) {
            setAdProjects(prev => prev.filter(p => p.id !== row.id));
            return;
          }
          setAdProjects(prev => prev.map(p => p.id === row.id ? { ...p, ...row } : p));
        } else if (payload.eventType === "DELETE") {
          setAdProjects(prev => prev.filter(p => p.id !== row.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isAdDesigner, currentUser?.id]);

  if (isAdDesigner) {
    // Active projects (not placed/signed off)
    const activeProjects = adProjects.filter(p => !["signed_off", "placed"].includes(p.status));
    const revisionProjects = activeProjects.filter(p => p.status === "revising");
    const approvedProjects = adProjects.filter(p => p.status === "approved" || p.status === "signed_off");
    const approvedThisWeek = approvedProjects.filter(p => p.updated_at && daysUntil(p.updated_at.slice(0, 10)) >= -7);

    // Also pull from creativeJobs as fallback
    const myJobs = _jobs.filter(j => !["complete", "billed"].includes(j.status)).sort((a, b) => (a.dueDate || "9").localeCompare(b.dueDate || "9"));

    // Combined queue: ad_projects + creativeJobs (deduplicated)
    const projectClientIds = new Set(activeProjects.map(p => p.client_id));
    const combinedQueue = [
      ...activeProjects.map(p => ({ id: p.id, type: "project", clientId: p.client_id, adSize: p.ad_size, status: p.status, issueId: p.issue_id, dueDate: null, artSource: p.art_source || "we_design" })),
      ...myJobs.filter(j => !projectClientIds.has(j.clientId)).map(j => ({ id: j.id, type: "job", clientId: j.clientId, adSize: j.adSize, status: j.status, issueId: j.issueId, dueDate: j.dueDate, artSource: "we_design" })),
    ];

    // Filter
    const filteredQueue = adFilter === "all" ? combinedQueue
      : adFilter === "revision" ? combinedQueue.filter(q => q.status === "revising" || q.status === "revision_requested")
      : combinedQueue.filter(q => q.status === adFilter);

    // Upcoming ads: closed sales for issues publishing within 30d (or 7d) that may not have design briefs yet
    const rangeDays = upcomingRange === "7d" ? 7 : 30;
    const upcomingAds = useMemo(() => {
      const cutoff = new Date(Date.now() + rangeDays * 86400000).toISOString().slice(0, 10);
      const closedSales = (_sales || []).filter(s => s.status === "Closed" && s.issueId);
      const upcomingIssueIds = new Set((_issues || []).filter(i => i.date >= today && i.date <= cutoff).map(i => i.id));
      return closedSales
        .filter(s => upcomingIssueIds.has(s.issueId))
        .map(s => {
          const issue = _issues.find(i => i.id === s.issueId);
          const hasProject = adProjects.some(p => p.client_id === s.clientId && p.issue_id === s.issueId);
          const hasJob = _jobs.some(j => j.clientId === s.clientId && j.issueId === s.issueId);
          return { ...s, issue, hasBrief: hasProject || hasJob, projectId: adProjects.find(p => p.client_id === s.clientId && p.issue_id === s.issueId)?.id };
        })
        .sort((a, b) => (a.issue?.date || "9").localeCompare(b.issue?.date || "9"));
    }, [_sales, _issues, adProjects, _jobs, rangeDays, today]);
    const noBriefCount = upcomingAds.filter(a => !a.hasBrief).length;

    // Ping salesperson
    const pingSalesperson = async (sale) => {
      setPinging(sale.id);
      const sp = (_clients || []).find(c => c.id === sale.clientId);
      const spId = sp?.repId;
      const spMember = (team || []).find(t => t.id === spId);
      if (spMember?.authId) {
        await supabase.from("team_notes").insert({
          from_user: currentUser?.authId || null,
          to_user: spMember.authId,
          message: `Design brief needed: ${cn(sale.clientId)} has a ${sale.size || sale.adSize || "ad"} in ${pn(sale.publication)} ${sale.issue?.label || ""} — can you send me the details?`,
          context_type: "task",
        });
      }
      setPinging(null);
    };

    // Stats + DOSE computations
    const statusColors = { brief: Z.wa, designing: ACCENT.blue, proof_sent: Z.wa, revising: Z.da, approved: Z.go, signed_off: Z.go, placed: Z.go, not_started: Z.td, in_progress: ACCENT.blue, revision_requested: Z.da, complete: Z.go };

    // DOSE metrics
    const thisMonthStr = today.slice(0, 7);
    const allCompleted = adProjects.filter(p => ["approved", "signed_off", "placed"].includes(p.status));
    const completedThisMonth = allCompleted.filter(p => p.updated_at?.startsWith(thisMonthStr));
    // P3.36 — de-dupe legacy creative_jobs that were also migrated into ad_projects
    // by sale_id. Without this we double-count any sale that has both rows.
    const adProjectSaleIds = new Set(allCompleted.map(p => p.sale_id).filter(Boolean));
    const uniqueLegacyJobs = _jobs.filter(j => j.status === "complete" && !adProjectSaleIds.has(j.sale_id));
    const totalDesignsCareer = allCompleted.length + uniqueLegacyJobs.length;

    // P1.15 — first-proof rate scoped to MY work, sorted by approved_at
    // (or fall back to updated_at when historical rows don't have it).
    // The previous slice(0,30) was array-order, not time, and pulled in
    // unassigned projects by mistake.
    const myCompleted = allCompleted
      .filter(p => p.designer_id === currentUser?.id)
      .sort((a, b) => (b.approved_at || b.updated_at || "").localeCompare(a.approved_at || a.updated_at || ""))
      .slice(0, 30);
    const firstProofRate = myCompleted.length > 0
      ? Math.round(myCompleted.filter(p => (p.revision_count || 1) <= 1).length / myCompleted.length * 100)
      : 100;

    // P1.16 — on-time uses approved_at + adDeadline (was updated_at +
    // issue.date, both wrong: updated_at moves on every status change,
    // issue.date is publish day not the deadline the designer was hitting).
    const onTimeCount = myCompleted.filter(p => {
      const issue = _issues.find(i => i.id === p.issue_id);
      if (!issue || !p.approved_at) return false;
      const benchmark = issue.adDeadline || issue.date;
      return benchmark && p.approved_at.slice(0, 10) <= benchmark;
    }).length;
    const onTimeRate = myCompleted.length > 0 ? Math.round(onTimeCount / myCompleted.length * 100) : 100;

    // 7-day high water mark: most ads approved in a single day over the past 7 days
    const d7ago = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const last7dApproved = allCompleted.filter(p => p.updated_at && p.updated_at.slice(0, 10) >= d7ago);
    const byDay = {};
    last7dApproved.forEach(p => { const d = p.updated_at.slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; });
    const highWaterMark = Math.max(0, ...Object.values(byDay));

    // P3.32 — consecutive-days approval streak: walk back from today counting
    // each day with ≥1 approval until we hit a zero-day. Uses approved_at when
    // available (more accurate) and falls back to updated_at for legacy rows.
    const approvalDates = new Set(allCompleted.map(p => (p.approved_at || p.updated_at || "").slice(0, 10)).filter(Boolean));
    let streakDays = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      if (approvalDates.has(d)) streakDays++;
      else break;
    }

    // Recent placed ads (your work in print)
    const placedAds = _sales.filter(s => s.status === "Closed" && s.page).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 3);

    // Queue clear state
    const queueEmpty = activeProjects.length === 0 && myJobs.length === 0;

    return <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 28 }}>

      {/* ═══ DOSE EYE CANDY ═══ */}
      <div style={{ ...glassStyle(), borderRadius: R, padding: "28px 32px" }}>
        {/* Greeting + streak */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          {!hideGreeting && <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{greeting}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            {streakDays > 0 && <div title={`${streakDays} consecutive day${streakDays === 1 ? "" : "s"} with at least one approval`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: Z.go + "12", borderRadius: 20 }}>
              <span style={{ fontSize: 16 }}>⚡</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: FW.black, color: Z.go }}>{streakDays} day{streakDays === 1 ? "" : "s"}</div>
                <div style={{ fontSize: 10, color: Z.tm }}>current streak</div>
              </div>
            </div>}
            {highWaterMark > 0 && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: Z.wa + "12", borderRadius: 20 }}>
              <span style={{ fontSize: 16 }}>🔥</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: FW.black, color: Z.wa }}>{highWaterMark} in a day</div>
                <div style={{ fontSize: 10, color: Z.tm }}>7-day best</div>
              </div>
            </div>}
          </div>
        </div>

        {/* Pride metrics — 4 cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.go, fontFamily: DISPLAY }}>{completedThisMonth.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Designs This Month</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: firstProofRate >= 80 ? Z.go : firstProofRate >= 50 ? Z.wa : Z.da, fontFamily: DISPLAY }}>{firstProofRate}%</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>First-Proof Approval</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: onTimeRate >= 90 ? Z.go : onTimeRate >= 70 ? Z.wa : Z.da, fontFamily: DISPLAY }}>{onTimeRate}%</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>On-Time Delivery</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: ACCENT.indigo, fontFamily: DISPLAY }}>{totalDesignsCareer}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Total Designs</div>
          </div>
        </div>

        {/* Oxytocin/Endorphin row — your work in print + queue status */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {placedAds.length > 0 && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: Z.bg, borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>📰</span>
            <div style={{ fontSize: FS.sm, color: Z.tx }}>
              <span style={{ fontWeight: FW.bold }}>Your {cn(placedAds[0].clientId)} ad</span>
              <span style={{ color: Z.tm }}> · Page {placedAds[0].page} of {pn(placedAds[0].publication)} {_issues.find(i => i.id === placedAds[0].issueId)?.label || ""}</span>
            </div>
          </div>}
          {queueEmpty && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: Z.go + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>✨</span>
            <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.go }}>Queue cleared — nice work!</span>
          </div>}
          {!queueEmpty && activeProjects.length + myJobs.length <= 3 && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: ACCENT.blue + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>🎯</span>
            <span style={{ fontSize: FS.sm, color: ACCENT.blue, fontWeight: FW.bold }}>{activeProjects.length + myJobs.length} to go today — you've got this</span>
          </div>}
        </div>
      </div>

      {/* ═══ OPERATIONAL STATS (smaller, below eye candy) ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        {[
          { label: "Active", value: activeProjects.length + myJobs.length, color: ACCENT.blue },
          { label: "Revisions", value: revisionProjects.length, color: revisionProjects.length > 0 ? Z.da : Z.go },
          { label: "Proofs Out", value: activeProjects.filter(p => p.status === "proof_sent").length, color: Z.wa },
          { label: "Approved (7d)", value: approvedThisWeek.length, color: Z.go },
          { label: "Pick Up", value: adProjects.filter(p => !p.designer_id && !["approved", "signed_off", "placed"].includes(p.status)).length, color: adProjects.filter(p => !p.designer_id).length > 0 ? Z.wa : Z.go },
        ].map(s => (
          <div key={s.label} style={{ padding: "8px 12px", background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: Ri, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</span>
            <span style={{ fontSize: 16, fontWeight: FW.black, color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: dashColsWide, gap: 16 }}>
        {/* ═══ LEFT COLUMN ═══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, overflow: "auto" }}>

          {/* Design Queue with filter pills */}
          <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>My Design Queue</span>
              <span style={{ fontSize: FS.xs, color: Z.tm }}>{filteredQueue.length} item{filteredQueue.length !== 1 ? "s" : ""}</span>
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
              {[["all", "All"], ["brief", "Brief"], ["designing", "Designing"], ["proof_sent", "Proof Sent"], ["revision", "Revisions"], ["approved", "Approved"]].map(([k, l]) => (
                <button key={k} onClick={() => setAdFilter(k)} style={{ padding: "3px 10px", borderRadius: 14, border: "none", cursor: "pointer", fontSize: 11, fontWeight: adFilter === k ? FW.bold : 500, background: adFilter === k ? Z.tx + "12" : "transparent", color: adFilter === k ? Z.tx : Z.td }}>{l}</button>
              ))}
            </div>
            {filteredQueue.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No items match this filter</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 300, overflowY: "auto" }}>
              {filteredQueue.map(q => {
                const c = statusColors[q.status] || Z.tm;
                return <div key={q.id} onClick={() => onNavigate?.("adprojects", q.type === "project" ? { projectId: q.id } : undefined)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: Z.bg, borderRadius: Ri, borderLeft: `3px solid ${c}`, cursor: "pointer" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{cn(q.clientId)} — {q.adSize || "Ad"}</div>
                    <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}>
                      <span style={{ fontSize: FS.xs, color: Z.tm }}>{q.dueDate ? `Due ${fmtDate(q.dueDate)}` : pn((_issues || []).find(i => i.id === q.issueId)?.pubId)}</span>
                      <span style={{ fontSize: 9, fontWeight: FW.bold, color: q.artSource === "camera_ready" ? Z.wa : Z.ac, background: (q.artSource === "camera_ready" ? Z.wa : Z.ac) + "15", padding: "1px 5px", borderRadius: Ri }}>{q.artSource === "camera_ready" ? "CR" : "Design"}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: c, background: c + "15", padding: "2px 8px", borderRadius: Ri }}>{(q.status || "").replace(/_/g, " ")}</span>
                </div>;
              })}
            </div>}
          </div>

          {/* Revisions — separated for priority visibility */}
          {revisionProjects.length > 0 && <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.da, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Revisions Requested</span>
              <span style={{ fontSize: FS.xs, color: Z.da, fontWeight: FW.bold }}>{revisionProjects.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {revisionProjects.map(p => (
                <div key={p.id} onClick={() => onNavigate?.("adprojects", { projectId: p.id })} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: Z.da + "08", borderRadius: Ri, borderLeft: `3px solid ${Z.da}`, cursor: "pointer" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{cn(p.client_id)}</div>
                    <div style={{ fontSize: FS.xs, color: Z.tm }}>v{p.revision_count || 1} · {p.updated_at ? `${Math.round((new Date() - new Date(p.updated_at)) / 86400000)}d ago` : ""}</div>
                  </div>
                  <Btn sm v="secondary" onClick={(e) => { e.stopPropagation(); onNavigate?.("adprojects", { projectId: p.id }); }}>Revise</Btn>
                </div>
              ))}
            </div>
          </div>}

          {/* Pickup Queue — unassigned projects */}
          {(() => {
            const pickupProjects = adProjects.filter(p => !p.designer_id && !["approved", "signed_off", "placed"].includes(p.status));
            if (pickupProjects.length === 0) return null;
            return <div style={glass}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.wa, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Available to Pick Up</span>
                <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.wa }}>{pickupProjects.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflowY: "auto" }}>
                {pickupProjects.map(p => {
                  const iss = _issues.find(i => i.id === p.issue_id);
                  const d = iss?.adDeadline ? daysUntil(iss.adDeadline) : 999;
                  const isCR = p.art_source === "camera_ready";
                  return <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: Z.bg, borderRadius: Ri, border: `1.5px dashed ${Z.da}50` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{cn(p.client_id)}</div>
                      <div style={{ fontSize: FS.xs, color: Z.tm }}>{pn(p.publication_id)} · {p.ad_size || "Ad"} · {d < 99 ? `${d}d` : ""}</div>
                      <span style={{ fontSize: 9, fontWeight: FW.bold, color: isCR ? Z.wa : Z.ac, background: (isCR ? Z.wa : Z.ac) + "15", padding: "1px 5px", borderRadius: Ri }}>{isCR ? "Camera Ready" : "We Design"}</span>
                    </div>
                    <Btn sm onClick={async () => {
                      // P1.5: race guard — only succeeds if designer_id is still NULL
                      // at write time. Two designers tapping Pick Up at the same moment
                      // can no longer both win silently.
                      const newStatus = isCR ? "awaiting_art" : "designing";
                      const { data: updated, error } = await supabase
                        .from("ad_projects")
                        .update({ designer_id: currentUser.id, status: newStatus, updated_at: new Date().toISOString() })
                        .eq("id", p.id)
                        .is("designer_id", null)
                        .select();
                      if (error) { console.error("pickup failed:", error); return; }
                      if (!updated || updated.length === 0) {
                        // Lost the race — refresh local row so the UI reflects reality.
                        const { data: latest } = await supabase.from("ad_projects").select("*").eq("id", p.id).single();
                        if (latest) setAdProjects(prev => prev.map(ap => ap.id === p.id ? latest : ap));
                        if (typeof addNotif === "function") addNotif(`${cn(p.client_id)} was just picked up by another designer`);
                        else alert(`${cn(p.client_id)} was just picked up by another designer`);
                        return;
                      }
                      setAdProjects(prev => prev.map(ap => ap.id === p.id ? { ...ap, designer_id: currentUser.id, status: newStatus } : ap));
                    }}>Pick Up →</Btn>
                  </div>;
                })}
              </div>
            </div>;
          })()}
        </div>

        {/* ═══ RIGHT COLUMN ═══ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <DirectionCard />

          {/* Recently Approved */}
          {approvedProjects.length > 0 && <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Recently Approved</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}>
              {approvedProjects.slice(0, 6).map(p => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${Z.bd}15` }}>
                  <div>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx }}>{cn(p.client_id)}</div>
                    <div style={{ fontSize: FS.xs, color: Z.tm }}>{p.ad_size || "Ad"}</div>
                  </div>
                  <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: p.status === "placed" ? ACCENT.indigo : Z.go, background: (p.status === "placed" ? ACCENT.indigo : Z.go) + "15", padding: "2px 8px", borderRadius: Ri }}>{p.status === "placed" ? "Placed" : "Ready"}</span>
                </div>
              ))}
            </div>
          </div>}

          {/* Deadline Calendar */}
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Deadline Calendar</div>
            {_issues.filter(i => i.adDeadline && daysUntil(i.adDeadline) >= 0 && daysUntil(i.adDeadline) <= 30).slice(0, 8).map(iss => {
              const d = daysUntil(iss.adDeadline);
              const myCount = upcomingAds.filter(a => a.issueId === iss.id).length;
              return <div key={iss.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${Z.bd}15` }}>
                <span style={{ fontSize: FS.sm, color: Z.tx }}>{pn(iss.pubId)} {iss.label}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {myCount > 0 && <span style={{ fontSize: FS.xs, color: Z.tm }}>{myCount} ads</span>}
                  <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: d <= 3 ? Z.da : d <= 7 ? Z.wa : Z.td }}>{d}d</span>
                </div>
              </div>;
            })}
          </div>

          {/* Quick Stats */}
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Quick Stats</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS.sm }}>
                <span style={{ color: Z.tm }}>Completed this month</span>
                <span style={{ fontWeight: FW.bold, color: Z.tx }}>{(() => {
                  const monthStr = today.slice(0, 7);
                  const adProjMonthly = adProjects.filter(p => ["approved", "signed_off", "placed"].includes(p.status) && p.updated_at?.startsWith(monthStr));
                  const adProjSaleIds = new Set(adProjMonthly.map(p => p.sale_id).filter(Boolean));
                  const legacyMonthly = _jobs.filter(j => j.status === "complete" && j.completedAt?.startsWith(monthStr) && !adProjSaleIds.has(j.sale_id));
                  return adProjMonthly.length + legacyMonthly.length;
                })()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS.sm }}>
                <span style={{ color: Z.tm }}>Revision rate</span>
                <span style={{ fontWeight: FW.bold, color: Z.tx }}>{adProjects.length > 0 ? Math.round(adProjects.filter(p => (p.revision_count || 0) > 1).length / adProjects.length * 100) : 0}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>;
  }

  // ─── Author Dashboard (Writer/Reporter, Stringer) ─────
  // Matches by author name string since stories.author is how bylines
  // are attributed app-wide. assignedTo (team id) is used as a second
  // key if the story was routed through the assignment flow.
  if (["Writer/Reporter", "Stringer"].includes(role)) {
    const authorName = currentUser?.name || "";
    const myStories = _stories.filter(s =>
      (authorName && s.author === authorName) ||
      (currentUser?.id && s.assignedTo === currentUser.id)
    );
    const published = myStories.filter(s => ["Published", "On Page", "Sent to Web", "Approved"].includes(s.status));
    const publishedMtd = published.filter(s => (s.publishedAt || s.updatedAt || "").startsWith(thisMonth));
    const inProgress = myStories.filter(s => ["Pitched", "Draft", "Edit", "Needs Editing", "Editing"].includes(s.status));
    const drafts = inProgress.filter(s => ["Pitched", "Draft"].includes(s.status));
    const pitches = inProgress.filter(s => s.status === "Pitched");
    const inEdit = inProgress.filter(s => ["Edit", "Needs Editing", "Editing"].includes(s.status));
    const overdue = inProgress.filter(s => s.dueDate && s.dueDate < today);
    const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const dueThisWeek = inProgress.filter(s => s.dueDate && s.dueDate >= today && s.dueDate <= weekAhead);
    const recentBylines = [...published]
      .sort((a, b) => (b.publishedAt || b.updatedAt || "").localeCompare(a.publishedAt || a.updatedAt || ""))
      .slice(0, 5);
    // Issues that have at least one story of mine scheduled
    const myIssueIds = new Set(myStories.map(s => s.issueId).filter(Boolean));
    const myUpcomingIssues = _issues
      .filter(i => myIssueIds.has(i.id) && i.date >= today)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .slice(0, 5);

    // Writer P2 — 8-week productivity sparkline. Bin published stories
    // into ISO-week buckets ending today; bar height = stories that
    // week. Helps the writer see velocity without leaving the dashboard.
    const weekBins = Array.from({ length: 8 }, (_, i) => {
      const start = new Date(); start.setDate(start.getDate() - (7 - i) * 7);
      const end = new Date(start); end.setDate(end.getDate() + 7);
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), count: 0 };
    });
    published.forEach(s => {
      const d = (s.publishedAt || s.updatedAt || "").slice(0, 10);
      if (!d) return;
      const bin = weekBins.find(b => d >= b.start && d < b.end);
      if (bin) bin.count++;
    });
    const thisWeekCount = weekBins[weekBins.length - 1].count;
    const maxWeekCount = Math.max(1, ...weekBins.map(b => b.count));
    const last4wAvg = weekBins.slice(-4).reduce((s, b) => s + b.count, 0) / 4;
    const prior4wAvg = weekBins.slice(0, 4).reduce((s, b) => s + b.count, 0) / 4;
    const velocityDelta = prior4wAvg > 0 ? Math.round(((last4wAvg - prior4wAvg) / prior4wAvg) * 100) : null;

    // Writer P2 — Beat radar. Top categories from stories published in
    // the last 90 days. Counts only — surfaces what beats are getting
    // attention vs neglected so the writer can balance coverage.
    const d90ago = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const beatCounts = {};
    published.filter(s => (s.publishedAt || s.updatedAt || "").slice(0, 10) >= d90ago).forEach(s => {
      const cat = s.category || "Uncategorized";
      beatCounts[cat] = (beatCounts[cat] || 0) + 1;
    });
    const topBeats = Object.entries(beatCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    const beatTotal = Object.values(beatCounts).reduce((s, n) => s + n, 0);

    return <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 28 }}>
      {/* Hero */}
      <div style={{ ...glassStyle(), borderRadius: R, padding: "28px 32px" }}>
        {!hideGreeting && <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 20 }}>{greeting}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.go, fontFamily: DISPLAY }}>{publishedMtd.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Published MTD</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: drafts.length > 0 ? Z.ac : Z.tm, fontFamily: DISPLAY }}>{drafts.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Drafts</div>
            {pitches.length > 0 && <div style={{ fontSize: 9, color: Z.tm, marginTop: 1 }}>{pitches.length} pitch{pitches.length === 1 ? "" : "es"}</div>}
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: inEdit.length > 0 ? Z.wa : Z.tm, fontFamily: DISPLAY }}>{inEdit.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>With Editor</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: overdue.length > 0 ? Z.da : Z.go, fontFamily: DISPLAY }}>{overdue.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Overdue</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: dashCols, gap: 16 }}>
        {/* LEFT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Writer P2 — Pitch tracker. Idea backlog (status=Pitched).
              Surfaced separately so pitches don't get drowned in the
              In-Progress list with active drafts. */}
          {pitches.length > 0 && <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>💡 Pitch Backlog</div>
              <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{pitches.length} idea{pitches.length === 1 ? "" : "s"}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
              {pitches.map(s => {
                const age = s.createdAt ? Math.floor((Date.now() - new Date(s.createdAt).getTime()) / 86400000) : null;
                return <div key={s.id} onClick={() => onNavigate?.("stories")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: Z.bg, borderRadius: Ri, borderLeft: `3px solid ${ACCENT.indigo}`, cursor: "pointer" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={s.title || "Untitled pitch"}>{s.title || "Untitled pitch"}</div>
                    <div style={{ fontSize: FS.xs, color: Z.tm }}>
                      {pn(s.publication) || "—"}
                      {age != null && ` · ${age}d sitting`}
                    </div>
                  </div>
                </div>;
              })}
            </div>
          </div>}

          <div style={glass}>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 12 }}>My Stories — In Progress</div>
            {inProgress.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: Z.tm }}>Nothing in progress — pitch something new</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 400, overflowY: "auto" }}>
              {inProgress.map(s => {
                const isOverdue = s.dueDate && s.dueDate < today;
                const isSoon = s.dueDate && s.dueDate >= today && s.dueDate <= weekAhead;
                const urgency = isOverdue ? Z.da : isSoon ? Z.wa : Z.tm;
                return <div key={s.id} onClick={() => onNavigate?.("stories")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: Z.bg, borderRadius: Ri, borderLeft: `3px solid ${urgency}`, cursor: "pointer" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={s.title || "Untitled"}>{s.title || "Untitled"}</div>
                    <div style={{ fontSize: FS.xs, color: Z.tm }}>{s.status} · {pn(s.publication)}{s.dueDate ? ` · due ${s.dueDate}` : ""}</div>
                  </div>
                  <Btn sm v="secondary" onClick={(e) => { e.stopPropagation(); onNavigate?.("stories"); }}>Open</Btn>
                </div>;
              })}
            </div>}
          </div>
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 10 }}>Due This Week ({dueThisWeek.length})</div>
            {dueThisWeek.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No stories due in the next 7 days</div>
            : dueThisWeek.map(s => <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${Z.bd}15` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={s.title || "Untitled"}>{s.title || "Untitled"}</div>
                <div style={{ fontSize: FS.xs, color: Z.tm }}>{s.status} · {pn(s.publication)}</div>
              </div>
              <div style={{ fontSize: FS.xs, color: daysUntil(s.dueDate) <= 1 ? Z.wa : Z.tm, fontWeight: FW.bold }}>{daysUntil(s.dueDate)}d</div>
            </div>)}
          </div>
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 10 }}>My Upcoming Issues</div>
            {myUpcomingIssues.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No stories scheduled for upcoming issues yet</div>
            : myUpcomingIssues.map(iss => {
              const mineInIssue = myStories.filter(s => s.issueId === iss.id).length;
              return <div key={iss.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${Z.bd}15` }}>
                <div>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{pn(iss.pubId)} {iss.label}</div>
                  <div style={{ fontSize: FS.xs, color: Z.tm }}>{mineInIssue} stor{mineInIssue === 1 ? "y" : "ies"} of mine · publishes {fmtDate(iss.date)}</div>
                </div>
                <div style={{ fontSize: FS.xs, color: daysUntil(iss.date) <= 2 ? Z.wa : Z.tm, fontWeight: FW.bold }}>{daysUntil(iss.date)}d</div>
              </div>;
            })}
          </div>
        </div>
        {/* RIGHT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <DirectionCard />

          {/* Writer P2 — 8-week productivity sparkline. Each bar = one
              ISO-week of published stories. Velocity delta compares last
              4 weeks to prior 4. */}
          <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Velocity · 8 weeks</div>
              <span style={{ fontSize: FS.xs, color: thisWeekCount > 0 ? Z.go : Z.tm, fontWeight: FW.bold }}>{thisWeekCount} this wk</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 48, padding: "0 2px" }}>
              {weekBins.map((b, i) => {
                const h = (b.count / maxWeekCount) * 100;
                const isCurrent = i === weekBins.length - 1;
                return <div key={i} title={`${b.start} — ${b.count}`} style={{ flex: 1, height: `${Math.max(h, 4)}%`, background: isCurrent ? Z.go : ACCENT.indigo + "80", borderRadius: 2, minHeight: 2 }} />;
              })}
            </div>
            {velocityDelta != null && <div style={{ fontSize: 10, color: velocityDelta >= 0 ? Z.go : Z.wa, marginTop: 6, fontWeight: FW.bold }}>
              {velocityDelta >= 0 ? "▲" : "▼"} {Math.abs(velocityDelta)}% last 4wk vs prior 4wk
            </div>}
          </div>

          {/* Writer P2 — Beat radar. Top categories from last 90 days
              of published stories. Surfaces over/under-coverage. */}
          {topBeats.length > 0 && <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Beat Radar · Last 90d</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {topBeats.map(([beat, count]) => (
                <div key={beat} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: FS.xs, color: Z.tx, fontWeight: FW.semi, width: 90, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={beat}>{beat}</span>
                  <div style={{ flex: 1, height: 8, background: Z.bg, borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(count / topBeats[0][1]) * 100}%`, background: ACCENT.indigo, borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.tm, width: 22, textAlign: "right" }}>{count}</span>
                </div>
              ))}
            </div>
          </div>}

          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Recent Bylines</div>
            {recentBylines.length === 0 ? <div style={{ padding: 8, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No published stories yet</div>
            : recentBylines.map(s => <div key={s.id} style={{ padding: "6px 0", borderBottom: `1px solid ${Z.bd}15` }}>
              <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={s.title || "Untitled"}>{s.title || "Untitled"}</div>
              <div style={{ fontSize: FS.xs, color: Z.tm }}>{pn(s.publication)} · {fmtDate((s.publishedAt || s.updatedAt || "").slice(0, 10))}</div>
            </div>)}
          </div>
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Quick Links</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Btn sm v="secondary" onClick={() => onNavigate?.("stories")} style={{ justifyContent: "flex-start" }}>Stories</Btn>
              <Btn sm v="secondary" onClick={() => onNavigate?.("editorial")} style={{ justifyContent: "flex-start" }}>Production</Btn>
              <Btn sm v="secondary" onClick={() => onNavigate?.("schedule")} style={{ justifyContent: "flex-start" }}>Issue Schedule</Btn>
            </div>
          </div>
        </div>
      </div>
    </div>;
  }

  // ─── Sales Dashboard (Dana, Salespeople) ─────────────
  // "My" = sales where the member is the assigned rep, OR sales on
  // clients where the member is the client's primary rep (legacy
  // attribution fallback). Every computation stays scoped to the member
  // viewed; nothing shows org-wide numbers from this branch.
  if (["Salesperson", "Sales Manager"].includes(role)) {
    const myClientIds = new Set(_clients.filter(c => c.repId === currentUser?.id).map(c => c.id));
    const mySales = _sales.filter(s => (s.assignedTo && s.assignedTo === currentUser?.id) || myClientIds.has(s.clientId));
    const closed = mySales.filter(s => s.status === "Closed");
    const active = mySales.filter(s => !["Closed", "Follow-up"].includes(s.status));
    const pipelineValue = active.reduce((s, x) => s + (x.amount || 0), 0);
    const mtdClosed = closed.filter(s => s.date?.startsWith(thisMonth));
    const mtdRev = mtdClosed.reduce((s, x) => s + (x.amount || 0), 0);
    const todayActions = mySales.filter(s => s.nextActionDate === today && s.nextAction && s.status !== "Closed");
    const overdue = mySales.filter(s => s.nextActionDate && s.nextActionDate < today && s.nextAction && s.status !== "Closed");
    const d7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const weekActions = mySales.filter(s => s.nextActionDate && s.nextActionDate >= today && s.nextActionDate <= d7 && s.nextAction && s.status !== "Closed");
    const recentWins = [...closed].sort((a, b) => (b.closedAt || b.date || "").localeCompare(a.closedAt || a.date || "")).slice(0, 3);
    const adDeadlines = _issues.filter(i => i.adDeadline && daysUntil(i.adDeadline) >= 0 && daysUntil(i.adDeadline) <= 14);

    // Sales P2 — Inquiry inbox. Inbound StellarPress leads where the
    // matched client is mine, OR client_id is null (unmatched lead, free
    // for grabs). Unmatched leads show only to Sales Managers so reps
    // don't fight over them. SLA tier mirrors ServiceDesk: 1h target.
    const _inquiries = adInquiries || [];
    const inqAssignedToMe = _inquiries.filter(i =>
      ["new", "contacted"].includes(i.status)
      && i.client_id && myClientIds.has(i.client_id)
    );
    const inqUnmatched = role === "Sales Manager"
      ? _inquiries.filter(i => i.status === "new" && !i.client_id)
      : [];
    const myInquiries = [...inqAssignedToMe, ...inqUnmatched]
      .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
    const inqOverdueCount = myInquiries.filter(i =>
      i.status === "new"
      && i.created_at
      && (Date.now() - new Date(i.created_at).getTime()) / 3600000 >= 1
    ).length;

    // Sales P2 — Stale clients. My clients with a closed sale on record
    // whose latest signal (sale.closedAt OR latest comm OR client.updatedAt)
    // is older than 60 days. Sorted by lifetime spend so the rep calls the
    // biggest accounts first. Skips clients with an active deal already.
    const d60ago = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const myClientsWithCloseds = _clients.filter(c =>
      c.repId === currentUser?.id
      && closed.some(s => s.clientId === c.id)
    );
    const activeClientIds = new Set(active.map(s => s.clientId));
    const staleClients = myClientsWithCloseds
      .filter(c => !activeClientIds.has(c.id))
      .map(c => {
        const latestSale = closed
          .filter(s => s.clientId === c.id)
          .reduce((m, s) => {
            const d = (s.closedAt || s.date || "").slice(0, 10);
            return d > m ? d : m;
          }, "");
        const latestComm = (c.comms || []).reduce((m, x) => (x.date || "") > m ? (x.date || "") : m, "");
        const updated = (c.updatedAt || "").slice(0, 10);
        const lastTouch = [latestSale, latestComm, updated].sort().pop() || "";
        return { client: c, lastTouch, spend: Number(c.totalSpend || 0) };
      })
      .filter(x => x.lastTouch && x.lastTouch < d60ago)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 8);

    // Sales P2 — Renewal candidates. Closed sales that ran 11-12 months ago
    // for clients with no newer closed sale. These are the anniversary
    // renewal pitch list — recurring publishers re-up annually.
    const d11mo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const d12mo = new Date(Date.now() - 335 * 86400000).toISOString().slice(0, 10);
    const renewalCandidates = closed
      .filter(s => {
        const d = (s.closedAt || s.date || "").slice(0, 10);
        if (!d || d < d11mo || d > d12mo) return false;
        // No newer closed sale for this client
        const hasNewer = closed.some(x =>
          x.clientId === s.clientId
          && x.id !== s.id
          && (x.closedAt || x.date || "").slice(0, 10) > d
        );
        return !hasNewer;
      })
      .sort((a, b) => (b.amount || 0) - (a.amount || 0))
      .slice(0, 6);

    return <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 28 }}>
      {/* Hero */}
      <div style={{ ...glassStyle(), borderRadius: R, padding: "28px 32px" }}>
        {!hideGreeting && <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 20 }}>{greeting}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.ac, fontFamily: DISPLAY }}>{fmtCurrency(pipelineValue)}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Pipeline · {active.length}</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.go, fontFamily: DISPLAY }}>{fmtCurrency(mtdRev)}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>MTD Revenue · {mtdClosed.length} closed</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: todayActions.length > 0 ? Z.ac : Z.tm, fontFamily: DISPLAY }}>{todayActions.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Today's Actions</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: overdue.length > 0 ? Z.da : Z.go, fontFamily: DISPLAY }}>{overdue.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Overdue</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: dashCols, gap: 16 }}>
        {/* LEFT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Sales P2 — Lead Inbox (inbound inquiries). Sales Manager
              also sees unmatched leads queued for triage. SLA: 1h to
              first response (status flips new → contacted). */}
          {myInquiries.length > 0 && <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>Lead Inbox</div>
              <span style={{ fontSize: FS.xs, color: inqOverdueCount > 0 ? Z.da : Z.tm, fontWeight: inqOverdueCount > 0 ? FW.bold : FW.semi }}>
                {myInquiries.length} lead{myInquiries.length === 1 ? "" : "s"}{inqOverdueCount > 0 ? ` · ${inqOverdueCount} overdue` : ""}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" }}>
              {myInquiries.slice(0, 10).map(i => {
                const ageHrs = i.created_at ? (Date.now() - new Date(i.created_at).getTime()) / 3600000 : 0;
                const slaTone = i.status === "contacted" ? "ok" : ageHrs >= 4 ? "over" : ageHrs >= 1 ? "warn" : "due";
                const slaPalette = slaTone === "over" ? { bg: Z.ds, color: Z.da }
                  : slaTone === "warn" ? { bg: Z.ws, color: Z.wa }
                  : slaTone === "ok" ? { bg: Z.ss, color: Z.su }
                  : { bg: Z.bg, color: Z.tm };
                const slaLabel = i.status === "contacted" ? "Replied"
                  : ageHrs >= 24 ? `${Math.floor(ageHrs / 24)}d overdue`
                  : ageHrs >= 1 ? `${Math.round(ageHrs)}h old`
                  : `${Math.round(ageHrs * 60)}m old`;
                return <div key={i.id} onClick={() => onNavigate?.("sales")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: Z.bg, borderRadius: Ri, borderLeft: `3px solid ${slaPalette.color}`, cursor: "pointer" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {i.business_name || i.name}
                      {!i.client_id && <span style={{ marginLeft: 6, fontSize: FS.micro, fontWeight: FW.heavy, color: Z.wa, background: Z.ws, borderRadius: R, padding: "1px 5px", textTransform: "uppercase" }}>Unmatched</span>}
                    </div>
                    <div style={{ fontSize: FS.xs, color: Z.tm }}>{i.email}{i.budget_range ? ` · ${i.budget_range}` : ""}</div>
                  </div>
                  <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: slaPalette.color, background: slaPalette.bg, borderRadius: R, padding: "2px 6px", whiteSpace: "nowrap" }}>{slaLabel}</span>
                </div>;
              })}
            </div>
          </div>}

          <div style={glass}>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 12 }}>Active Pipeline</div>
            {active.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: Z.tm }}>No active deals</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 400, overflowY: "auto" }}>
              {active.slice(0, 20).map(s => {
                const c = cn(s.clientId);
                return <div key={s.id} onClick={() => onNavigate?.("sales")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: Z.bg, borderRadius: Ri, borderLeft: `3px solid ${Z.ac}`, cursor: "pointer" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{c}</div>
                    <div style={{ fontSize: FS.xs, color: Z.tm }}>{s.status || "—"} · {pn(s.publication)}{s.nextActionDate ? ` · action ${s.nextActionDate}` : ""}</div>
                  </div>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.ac, fontFamily: DISPLAY }}>{fmtCurrency(s.amount || 0)}</div>
                </div>;
              })}
            </div>}
          </div>
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 10 }}>Actions This Week ({weekActions.length})</div>
            {weekActions.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No scheduled follow-ups this week</div>
            : weekActions.slice(0, 10).map(s => <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${Z.bd}15` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{cn(s.clientId)}</div>
                <div style={{ fontSize: FS.xs, color: Z.tm }}>{typeof s.nextAction === "string" ? s.nextAction : (s.nextAction?.label || "Follow up")}</div>
              </div>
              <div style={{ fontSize: FS.xs, color: s.nextActionDate === today ? Z.ac : Z.tm, fontWeight: s.nextActionDate === today ? FW.bold : FW.semi }}>{fmtDate(s.nextActionDate)}</div>
            </div>)}
          </div>
        </div>
        {/* RIGHT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <DirectionCard />

          {/* Sales P2 — Stale clients (no touch in 60d+, by spend desc) */}
          {staleClients.length > 0 && <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Stale Clients · 60d+</div>
              <span style={{ fontSize: FS.micro, color: Z.tm, fontFamily: COND }}>top {staleClients.length} by spend</span>
            </div>
            {staleClients.map(({ client, lastTouch, spend }) => {
              const days = lastTouch ? Math.floor((Date.now() - new Date(lastTouch).getTime()) / 86400000) : null;
              return <div key={client.id} onClick={() => onNavigate?.("sales")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${Z.bd}15`, cursor: "pointer" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={client.name}>{client.name}</div>
                  <div style={{ fontSize: FS.xs, color: days >= 180 ? Z.da : Z.tm }}>{days != null ? `${days}d quiet` : "no recent touch"} · {fmtCurrency(spend)} lifetime</div>
                </div>
              </div>;
            })}
          </div>}

          {/* Sales P2 — Renewal candidates (anniversary pitch list) */}
          {renewalCandidates.length > 0 && <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Renewals · 11–12mo Anniversaries</div>
            {renewalCandidates.map(s => {
              const months = s.closedAt || s.date ? Math.floor((Date.now() - new Date(s.closedAt || s.date).getTime()) / (30 * 86400000)) : 0;
              return <div key={s.id} onClick={() => onNavigate?.("sales")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${Z.bd}15`, cursor: "pointer" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={cn(s.clientId)}>{cn(s.clientId)}</div>
                  <div style={{ fontSize: FS.xs, color: Z.tm }}>{months}mo ago · {pn(s.publication)}</div>
                </div>
                <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.ac }}>{fmtCurrency(s.amount || 0)}</div>
              </div>;
            })}
          </div>}

          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Recent Wins</div>
            {recentWins.length === 0 ? <div style={{ padding: 8, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No closed deals yet</div>
            : recentWins.map(s => <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${Z.bd}15` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={cn(s.clientId)}>{cn(s.clientId)}</div>
                <div style={{ fontSize: FS.xs, color: Z.tm }}>{fmtDate(s.closedAt?.slice(0, 10) || s.date)}</div>
              </div>
              <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.go }}>{fmtCurrency(s.amount || 0)}</div>
            </div>)}
          </div>
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Ad Deadlines</div>
            {adDeadlines.length === 0 ? <div style={{ padding: 8, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No upcoming deadlines</div>
            : adDeadlines.slice(0, 5).map(i => <div key={i.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: FS.sm }}>
              <span style={{ color: Z.tx, fontFamily: COND }}>{pn(i.pubId)} {i.label}</span>
              <span style={{ color: daysUntil(i.adDeadline) <= 3 ? Z.da : Z.tm, fontWeight: FW.bold }}>{daysUntil(i.adDeadline)}d</span>
            </div>)}
          </div>
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Quick Links</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Btn sm v="secondary" onClick={() => onNavigate?.("sales")} style={{ justifyContent: "flex-start" }}>Sales CRM</Btn>
              <Btn sm v="secondary" onClick={() => onNavigate?.("calendar")} style={{ justifyContent: "flex-start" }}>Calendar</Btn>
            </div>
          </div>
        </div>
      </div>
    </div>;
  }

  // ─── Publisher Dashboard (Hayley) ─────────────────────
  // Org-wide view — not scoped to `currentUser` the way role dashboards
  // usually are, because the publisher wants a read on the whole
  // operation, not just their own row.
  if (role === "Publisher") {
    const activeSales = _sales.filter(s => !["Closed", "Follow-up"].includes(s.status));
    const pipelineValue = activeSales.reduce((s, x) => s + (x.amount || 0), 0);
    const mtdClosed = _sales.filter(s => s.status === "Closed" && s.date?.startsWith(thisMonth));
    const mtdRev = mtdClosed.reduce((s, x) => s + (x.amount || 0), 0);
    const teamSize = (team || []).filter(t => !t.isHidden && t.isActive !== false).length;
    const openInvoices = (invoices || []).filter(inv => ["sent", "overdue", "partially_paid"].includes(inv.status));
    const overdueInvoices = openInvoices.filter(inv => inv.dueDate && inv.dueDate < today);
    const overdueBalance = overdueInvoices.reduce((s, inv) => s + Number(inv.balanceDue || 0), 0);
    const d7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const d14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const upcomingIssues = _issues.filter(i => i.date >= today && i.date <= d7);

    // Hayley P2 — MTD pacing vs same-day-last-month. The number alone
    // doesn't tell her if she's ahead or behind; this answers "are we on
    // track?" at a glance. Projected = MTD × (days-in-month / day-of-month).
    const dayOfMonth = new Date().getDate();
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const lastMonth = (() => {
      const d = new Date(); d.setMonth(d.getMonth() - 1);
      return d.toISOString().slice(0, 7);
    })();
    const lastMonthSameDay = _sales
      .filter(s => s.status === "Closed" && s.date?.startsWith(lastMonth))
      .filter(s => Number(s.date.slice(8, 10)) <= dayOfMonth)
      .reduce((s, x) => s + (x.amount || 0), 0);
    const lastMonthFull = _sales
      .filter(s => s.status === "Closed" && s.date?.startsWith(lastMonth))
      .reduce((s, x) => s + (x.amount || 0), 0);
    const pacingDelta = lastMonthSameDay > 0 ? Math.round(((mtdRev - lastMonthSameDay) / lastMonthSameDay) * 100) : null;
    const projectedMonth = dayOfMonth > 0 ? Math.round(mtdRev * (daysInMonth / dayOfMonth)) : mtdRev;

    // Hayley P2 — A/R aging buckets. Same definitions as CollectionsCenter:
    // Current = not-yet-due, 1–30 = 1–30d past due, 31–60, 61–90, 90+.
    const buckets = { current: 0, b1_30: 0, b31_60: 0, b61_90: 0, b90: 0 };
    let arTotal = 0;
    openInvoices.forEach(inv => {
      const bal = Number(inv.balanceDue || 0);
      if (bal <= 0) return;
      arTotal += bal;
      if (!inv.dueDate || inv.dueDate >= today) { buckets.current += bal; return; }
      const daysPast = Math.floor((new Date(today) - new Date(inv.dueDate)) / 86400000);
      if (daysPast <= 30) buckets.b1_30 += bal;
      else if (daysPast <= 60) buckets.b31_60 += bal;
      else if (daysPast <= 90) buckets.b61_90 += bal;
      else buckets.b90 += bal;
    });
    // DSO ≈ A/R balance ÷ avg daily revenue last 30d. Rough but useful.
    const d30ago = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const last30Rev = _sales
      .filter(s => s.status === "Closed" && (s.closedAt?.slice(0, 10) || s.date) >= d30ago)
      .reduce((s, x) => s + (x.amount || 0), 0);
    const dso = last30Rev > 0 ? Math.round((arTotal / last30Rev) * 30) : null;

    // Hayley P2 — Issue revenue forecast. Next 4 publishing issues with
    // their sold-ad revenue + estimated fill rate. Closed sales tied to
    // each issue. Flags weak issues 14d+ out so we can push.
    const upcomingForecastIssues = _issues
      .filter(i => i.date >= today)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .slice(0, 4)
      .map(iss => {
        const sold = _sales
          .filter(s => s.issueId === iss.id && s.status === "Closed")
          .reduce((sum, s) => sum + (s.amount || 0), 0);
        const pending = _sales
          .filter(s => s.issueId === iss.id && !["Closed", "Follow-up"].includes(s.status))
          .reduce((sum, s) => sum + (s.amount || 0), 0);
        const days = daysUntil(iss.date);
        return { iss, sold, pending, days };
      });

    // Hayley P1 — issues approaching press (next 14d) that haven't
    // received her signoff yet. These are press-day blockers for
    // Anthony's readiness checklist.
    const awaitingSignoff = _issues.filter(i =>
      i.date >= today && i.date <= d14
      && !i.sentToPressAt
      && !i.publisherSignoffAt
    ).sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    // Top closers MTD by rep
    const repRevenue = {};
    mtdClosed.forEach(s => {
      const repId = s.assignedTo;
      if (repId) repRevenue[repId] = (repRevenue[repId] || 0) + (s.amount || 0);
    });
    const topReps = Object.entries(repRevenue)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, rev]) => ({ id, name: (team || []).find(t => t.id === id)?.name || "Unassigned", revenue: rev }));

    // Stories needing editorial attention (queue + in-edit)
    const storyQueue = _stories.filter(s => ["Draft", "Needs Editing"].includes(s.status)).length;

    // Beat-strip signals
    const justShipped = pubRecentPress[0];
    const allClear = awaitingSignoff.length === 0 && pubProofsInReview.length === 0 && pubLayoutRefGaps.length === 0;

    return <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 28 }}>
      <div style={{ ...glassStyle(), borderRadius: R, padding: "28px 32px" }}>
        {!hideGreeting && <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 20 }}>{greeting}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.go, fontFamily: DISPLAY }}>{fmtCurrency(mtdRev)}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>MTD Revenue · {mtdClosed.length} deals</div>
            {pacingDelta != null && <div style={{ fontSize: 10, color: pacingDelta >= 0 ? Z.go : Z.da, marginTop: 2, fontWeight: FW.bold }}>
              {pacingDelta >= 0 ? "▲" : "▼"} {Math.abs(pacingDelta)}% vs last month · proj {fmtCurrency(projectedMonth)}
            </div>}
            {pacingDelta == null && lastMonthFull > 0 && <div style={{ fontSize: 10, color: Z.tm, marginTop: 2 }}>proj {fmtCurrency(projectedMonth)} · last mo {fmtCurrency(lastMonthFull)}</div>}
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.ac, fontFamily: DISPLAY }}>{fmtCurrency(pipelineValue)}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Pipeline · {activeSales.length} open</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: awaitingSignoff.length > 0 ? Z.wa : Z.go, fontFamily: DISPLAY }}>{awaitingSignoff.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Awaiting Your Signoff</div>
            <div style={{ fontSize: 9, color: Z.td, marginTop: 1 }}>next 14 days</div>
          </div>
          <div style={{ textAlign: "center", padding: "14px 8px", background: Z.bg, borderRadius: R }}>
            <div style={{ fontSize: 28, fontWeight: FW.black, color: overdueInvoices.length > 0 ? Z.da : Z.go, fontFamily: DISPLAY }}>{overdueInvoices.length}</div>
            <div style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Overdue Invoices</div>
            <div style={{ fontSize: 9, color: Z.td, marginTop: 1 }}>{fmtCurrency(overdueBalance)}</div>
          </div>
        </div>
        {/* Beat strip */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {justShipped && <div style={{ flex: "1 1 240px", display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: Z.go + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>📰</span>
            <span style={{ fontSize: FS.sm, color: Z.tx }}><span style={{ fontWeight: FW.bold }}>{pn(justShipped.pubId)} {justShipped.label}</span> <span style={{ color: Z.tm }}>shipped</span></span>
          </div>}
          {allClear && !justShipped && <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: Z.go + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>✨</span>
            <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.go }}>All clear — no signoffs or proofs waiting</span>
          </div>}
          {pubProofsInReview.length > 0 && <div style={{ flex: "1 1 220px", display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: ACCENT.indigo + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>📑</span>
            <span style={{ fontSize: FS.sm, color: ACCENT.indigo, fontWeight: FW.bold }}>{pubProofsInReview.length} proof{pubProofsInReview.length === 1 ? "" : "s"} in review</span>
          </div>}
          {pubLayoutRefGaps.length > 0 && <div style={{ flex: "1 1 220px", display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: Z.wa + "10", borderRadius: Ri }}>
            <span style={{ fontSize: 14 }}>🖼️</span>
            <span style={{ fontSize: FS.sm, color: Z.wa, fontWeight: FW.bold }}>{pubLayoutRefGaps.length} issue{pubLayoutRefGaps.length === 1 ? "" : "s"} need layout refs</span>
          </div>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: dashCols, gap: 16 }}>
        {/* LEFT — production oversight queues */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Awaiting your signoff — Hayley P1 */}
          <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>Awaiting Your Signoff</div>
              <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{awaitingSignoff.length} issue{awaitingSignoff.length === 1 ? "" : "s"}</span>
            </div>
            {awaitingSignoff.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>✨ No issues waiting on you</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {awaitingSignoff.slice(0, 8).map(iss => {
                  const d = daysUntil(iss.date);
                  const urg = d <= 1 ? Z.da : d <= 3 ? Z.wa : Z.go;
                  return (
                    <div key={iss.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: Z.bg, borderRadius: Ri, borderLeft: `3px solid ${urg}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>{pn(iss.pubId)} {iss.label}</div>
                        <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND }}>Press {fmtDate(iss.date)} · {d <= 0 ? "today" : d === 1 ? "tomorrow" : `${d}d`}</div>
                      </div>
                      <Btn sm v="secondary" onClick={() => onNavigate?.(`/layout?id=${iss.id}`)} style={{ flexShrink: 0 }}>Open</Btn>
                      <Btn sm onClick={() => handlePublisherSignoff(iss.id)} disabled={signingOffIssueId === iss.id} style={{ flexShrink: 0 }}>
                        {signingOffIssueId === iss.id ? "…" : "✍ Sign off"}
                      </Btn>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Proofs in review — Hayley P1 */}
          {pubProofsInReview.length > 0 && (
            <div style={glass}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Proofs Awaiting Approval</span>
                <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{pubProofsInReview.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {pubProofsInReview.map(p => {
                  const iss = _issues.find(i => i.id === p.issue_id);
                  return (
                    <div key={p.id} onClick={() => iss && onNavigate?.(`/layout?id=${iss.id}`)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: Z.bg, borderRadius: Ri, cursor: iss ? "pointer" : "default" }}>
                      <div>
                        <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{iss ? `${pn(iss.pubId)} ${iss.label}` : "Issue"} · v{p.version}</div>
                        <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND }}>{p.page_count ? `${p.page_count} pages · ` : ""}uploaded {p.uploaded_at ? fmtDate(p.uploaded_at.slice(0, 10)) : "—"}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: FW.heavy, color: Z.ac, padding: "2px 8px", background: Z.ac + "15", borderRadius: 999, fontFamily: COND, textTransform: "uppercase" }}>review</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Layout reference gaps — Hayley P1 */}
          {pubLayoutRefGaps.length > 0 && (
            <div style={glass}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND }}>Pages Need Layout Reference</span>
                <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{pubLayoutRefGaps.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {pubLayoutRefGaps.slice(0, 6).map(g => (
                  <div key={g.issue.id} onClick={() => onNavigate?.("flatplan", { pub: g.issue.pubId, issue: g.issue.id })} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: Z.bg, borderRadius: Ri, cursor: "pointer", borderLeft: `2px solid ${Z.wa}` }}>
                    <div>
                      <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{pn(g.issue.pubId)} {g.issue.label}</div>
                      <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND }}>Pages: {g.missingPages.slice(0, 8).join(", ")}{g.missingPages.length > 8 ? `… +${g.missingPages.length - 8}` : ""}</div>
                    </div>
                    <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.wa, fontFamily: COND }}>{g.missingPages.length}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hayley P2 — A/R aging + DSO. Color-coded stacked bar with
              per-bucket values; click → Collections for action. */}
          {arTotal > 0 && <div style={glass}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>A/R Aging</div>
              <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
                {fmtCurrency(arTotal)} outstanding{dso != null ? ` · DSO ${dso}d` : ""}
              </span>
            </div>
            <div onClick={() => onNavigate?.("collections")} style={{ display: "flex", height: 26, borderRadius: R, overflow: "hidden", cursor: "pointer" }}>
              {[
                { key: "current", val: buckets.current, color: Z.go, label: "Current" },
                { key: "b1_30", val: buckets.b1_30, color: Z.ac, label: "1–30" },
                { key: "b31_60", val: buckets.b31_60, color: Z.wa, label: "31–60" },
                { key: "b61_90", val: buckets.b61_90, color: ACCENT.indigo, label: "61–90" },
                { key: "b90", val: buckets.b90, color: Z.da, label: "90+" },
              ].filter(b => b.val > 0).map(b => (
                <div key={b.key} title={`${b.label}: ${fmtCurrency(b.val)}`} style={{ flex: b.val, background: b.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: FW.heavy, fontFamily: COND }}>
                  {(b.val / arTotal) >= 0.10 ? `${Math.round((b.val / arTotal) * 100)}%` : ""}
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginTop: 10 }}>
              {[
                { val: buckets.current, color: Z.go, label: "Current" },
                { val: buckets.b1_30, color: Z.ac, label: "1–30d" },
                { val: buckets.b31_60, color: Z.wa, label: "31–60d" },
                { val: buckets.b61_90, color: ACCENT.indigo, label: "61–90d" },
                { val: buckets.b90, color: Z.da, label: "90+d" },
              ].map((b, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: b.color, fontFamily: DISPLAY }}>{fmtCurrency(b.val)}</div>
                  <div style={{ fontSize: 9, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>{b.label}</div>
                </div>
              ))}
            </div>
          </div>}

          {/* Hayley P2 — Issue revenue forecast. Next 4 issues with sold +
              pending ad revenue. Flags weak issues (low sold, days-out
              shrinking) so we know which issues to push reps on. */}
          {upcomingForecastIssues.length > 0 && <div style={glass}>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 12 }}>Issue Revenue Forecast</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {upcomingForecastIssues.map(({ iss, sold, pending, days }) => {
                // Soft "weak" flag: less than $1k sold and inside 14 days.
                const weak = days <= 14 && sold < 1000;
                const tone = weak ? Z.wa : Z.go;
                return (
                  <div key={iss.id} onClick={() => onNavigate?.(`/layout?id=${iss.id}`)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: Z.bg, borderRadius: Ri, borderLeft: `3px solid ${tone}`, cursor: "pointer" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{pn(iss.pubId)} {iss.label}</div>
                      <div style={{ fontSize: FS.xs, color: Z.tm }}>
                        Press {fmtDate(iss.date)} · {days <= 0 ? "today" : `${days}d out`}
                        {weak && <span style={{ color: Z.wa, fontWeight: FW.bold }}> · ⚠ weak</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.go, fontFamily: DISPLAY }}>{fmtCurrency(sold)}</div>
                      {pending > 0 && <div style={{ fontSize: 10, color: Z.ac }}>+ {fmtCurrency(pending)} pending</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>}

          <div style={glass}>
            <div style={{ fontSize: FS.lg, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY, marginBottom: 12 }}>Top Closers — This Month</div>
            {topReps.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: Z.tm }}>No closed deals this month</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {topReps.map((rep, idx) => <div key={rep.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: Z.bg, borderRadius: Ri }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: idx === 0 ? Z.go + "25" : Z.sa, color: idx === 0 ? Z.go : Z.tm, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: FW.black }}>{idx + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{rep.name}</div>
                </div>
                <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.go, fontFamily: DISPLAY }}>{fmtCurrency(rep.revenue)}</div>
              </div>)}
            </div>}
          </div>
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 10 }}>Upcoming Issues (7 days)</div>
            {upcomingIssues.length === 0 ? <div style={{ padding: 12, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No issues publishing this week</div>
            : upcomingIssues.slice(0, 8).map(i => <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${Z.bd}15` }}>
              <div><div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{pn(i.pubId)} {i.label}</div><div style={{ fontSize: FS.xs, color: Z.tm }}>Publishes {fmtDate(i.date)}{i.publisherSignoffAt ? " · ✓ signed off" : ""}</div></div>
              <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: daysUntil(i.date) <= 2 ? Z.wa : Z.tm }}>{daysUntil(i.date)}d</div>
            </div>)}
          </div>
        </div>
        {/* RIGHT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <DirectionCard />

          {/* From Press — recent celebration tile */}
          {pubRecentPress.length > 0 && (
            <div style={glass}>
              <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 10 }}>From Press (last 7 days)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {pubRecentPress.slice(0, 5).map(p => (
                  <div key={p.id} style={{ padding: "6px 10px", background: Z.go + "08", borderRadius: Ri, borderLeft: `2px solid ${Z.go}` }}>
                    <div style={{ fontSize: FS.xs, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>📰 {pn(p.pubId)} {p.label}</div>
                    <div style={{ fontSize: 10, color: Z.tm, fontFamily: COND }}>shipped {p.sentToPressAt ? fmtDate(p.sentToPressAt.slice(0, 10)) : "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Signals</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: FS.sm }}>
              {storyQueue > 0 && <div style={{ color: Z.wa }}>• {storyQueue} stor{storyQueue === 1 ? "y" : "ies"} in editorial queue</div>}
              {overdueInvoices.length > 0 && <div style={{ color: Z.da }}>• {overdueInvoices.length} overdue invoice{overdueInvoices.length === 1 ? "" : "s"} ({fmtCurrency(overdueBalance)})</div>}
              {upcomingIssues.length > 0 && <div style={{ color: Z.ac }}>• {upcomingIssues.length} issue{upcomingIssues.length === 1 ? "" : "s"} publishing this week</div>}
              {activeSales.length > 0 && <div style={{ color: Z.tx }}>• {activeSales.length} active deal{activeSales.length === 1 ? "" : "s"} in pipeline</div>}
              {storyQueue === 0 && overdueInvoices.length === 0 && upcomingIssues.length === 0 && <div style={{ color: Z.go }}>All clear ✓</div>}
            </div>
          </div>
          <div style={glass}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 8 }}>Quick Links</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Btn sm v="secondary" onClick={() => onNavigate?.("analytics")} style={{ justifyContent: "flex-start" }}>Reports</Btn>
              <Btn sm v="secondary" onClick={() => onNavigate?.("performance")} style={{ justifyContent: "flex-start" }}>Performance</Btn>
              <Btn sm v="secondary" onClick={() => onNavigate?.("team")} style={{ justifyContent: "flex-start" }}>Team</Btn>
              <Btn sm v="secondary" onClick={() => onNavigate?.("collections")} style={{ justifyContent: "flex-start" }}>Collections</Btn>
            </div>
          </div>
        </div>
      </div>

      {/* P2.25 — Designer Workload tile. Per-designer card with
          load (active project count, color-coded), on-time + first-
          proof rates this period, and a click-through into
          AdProjects filtered to that designer (uses P1.20 deep-link). */}
      <DesignerWorkloadTile team={team} _issues={_issues} onNavigate={onNavigate} glass={glass} />
    </div>;
  }

  // ─── Fallback: smarter generic dashboard for long-tail roles ────
  // Distribution Manager, Marketing Manager, Finance, Writer/Reporter,
  // Stringer, etc. land here. Show the member's basic context
  // (assigned pubs, employment type, unread direction) instead of
  // the placeholder message.
  const assignedPubNames = (currentUser?.pubs || []).includes("all")
    ? ["All publications"]
    : (pubs || []).filter(p => (currentUser?.pubs || []).includes(p.id)).map(p => p.name);
  const unreadDirection = directionNotes.filter(n => !n.is_read).length;

  return <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 28 }}>
    {!hideGreeting && <div style={{ fontSize: 28, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{greeting}</div>}
    <div style={{ display: "grid", gridTemplateColumns: dashCols, gap: 16 }}>
      <div style={glass}>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, fontFamily: COND, marginBottom: 10 }}>At a Glance</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", minWidth: 90 }}>Role</span>
            <span style={{ fontSize: FS.sm, color: Z.tx, fontWeight: FW.semi }}>{role || "—"}</span>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", minWidth: 90 }}>Employment</span>
            <span style={{ fontSize: FS.sm, color: Z.tx }}>{currentUser?.isFreelance ? "Independent Contractor (1099)" : "Employee (W-2)"}</span>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", minWidth: 90 }}>Publications</span>
            <span style={{ fontSize: FS.sm, color: Z.tx }}>{assignedPubNames.length > 0 ? assignedPubNames.join(", ") : "None assigned"}</span>
          </div>
          {unreadDirection > 0 && <div style={{ display: "flex", gap: 12 }}>
            <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", minWidth: 90 }}>Messages</span>
            <span style={{ fontSize: FS.sm, color: Z.wa, fontWeight: FW.bold }}>{unreadDirection} unread from publisher</span>
          </div>}
        </div>
        <div style={{ marginTop: 16, fontSize: FS.sm, color: Z.tm }}>A role-specific dashboard for <strong>{role}</strong> isn't built yet. Use the sidebar to get to your modules.</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <DirectionCard />
      </div>
    </div>
  </div>;
});

RoleDashboard.displayName = "RoleDashboard";
export default RoleDashboard;
