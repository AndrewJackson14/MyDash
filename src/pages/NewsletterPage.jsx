import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../lib/theme";
import { Ic, Btn, Inp, TA, Sel, Modal, Badge, PageHeader, GlassCard, TabRow, TB, TabPipe, Toggle, DataTable, SB } from "../components/ui";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { supabase, isOnline, EDGE_FN_URL } from "../lib/supabase";
import { useDialog } from "../hooks/useDialog";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { generateNewsletterHtml, getPubConfig } from "../utils/newsletterTemplate";
import { fmtDate, fmtTime } from "../lib/formatters";
import NewsletterTemplates from "./NewsletterTemplates";
import EblastComposer from "../components/EblastComposer";
import CampaignReport from "../components/CampaignReport";
import ScheduleModal from "../components/ScheduleModal";

const NEWSLETTER_PUBS = ["pub-paso-robles-press", "pub-atascadero-news", "pub-the-malibu-times"];
const STATUS_BADGE = { draft: "Draft", approved: "Approved", sent: "Sent", failed: "Failed" };

// ── Sortable Story Card ──────────────────────────────────
const SortableStory = ({ story, onUpdate, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: story.story_id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={{ ...style, display: "flex", gap: 10, padding: "10px 12px", background: story.included === false ? Z.sa : Z.sf, border: `1px solid ${Z.bd}`, borderRadius: R, marginBottom: 6, opacity: story.included === false ? 0.5 : 1 }}>
      <div {...attributes} {...listeners} style={{ cursor: "grab", display: "flex", alignItems: "center", color: Z.td, fontSize: FS.lg, padding: "0 4px" }}>{"\u2261"}</div>
      {story.featured_image_url && <img src={story.featured_image_url} alt="" style={{ width: 64, height: 64, borderRadius: Ri, objectFit: "cover", flexShrink: 0 }} />}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div>
            <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx, lineHeight: 1.3 }}>{story.title}</div>
            <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}>
              <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.tm, background: Z.sa, padding: "1px 6px", borderRadius: Ri, textTransform: "uppercase" }}>{story.category || "News"}</span>
              {story.is_regional && <span style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.wa, background: Z.wa + "15", padding: "1px 6px", borderRadius: Ri, textTransform: "uppercase" }}>Regional</span>}
              {story.author && <span style={{ fontSize: FS.xs, color: Z.td }}>{story.author}</span>}
            </div>
          </div>
          <Toggle checked={story.included !== false} onChange={v => onUpdate(story.story_id, "included", v)} />
        </div>
        <textarea value={story.blurb || ""} onChange={e => onUpdate(story.story_id, "blurb", e.target.value)}
          rows={2} style={{ width: "100%", background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "6px 8px", color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", resize: "vertical", outline: "none" }}
          placeholder="AI-generated blurb (editable)..." />
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// NEWSLETTER PAGE
// ════════════════════════════════════════════════════════════
const NewsletterPage = ({ pubs, currentUser, isActive }) => {
  const { setHeader, clearHeader } = usePageHeader();
  const dialog = useDialog();
  useEffect(() => {
    if (isActive) {
      setHeader({ breadcrumb: [{ label: "Home" }, { label: "Newsletters" }], title: "Newsletters" });
    } else {
      clearHeader();
    }
  }, [isActive, setHeader, clearHeader]);
  const [tab, setTab] = useState("Today");
  const [selPub, setSelPub] = useState(NEWSLETTER_PUBS[0]);
  const [draft, setDraft] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [addStoryOpen, setAddStoryOpen] = useState(false);
  const [addStorySr, setAddStorySr] = useState("");
  const [addStoryResults, setAddStoryResults] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyPub, setHistoryPub] = useState("all");
  // Selected campaign: when non-null, we render CampaignReport in place of
  // the tab content. Kept as a sibling of `tab` (not a real route) to
  // match MyDash's existing tab-state pattern.
  const [campaignId, setCampaignId] = useState(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [previewDraft, setPreviewDraft] = useState(null);
  const [subCounts, setSubCounts] = useState({});
  const previewRef = useRef(null);

  const pub = getPubConfig(selPub);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ── Load today's drafts ─────────────────────────────────
  useEffect(() => {
    if (!isOnline()) { setLoading(false); return; }
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    supabase.from("newsletter_drafts").select("*")
      .gte("generated_at", todayStart.toISOString())
      .order("generated_at", { ascending: false })
      .then(({ data }) => {
        setDrafts(data || []);
        const d = (data || []).find(d => d.publication_id === selPub);
        setDraft(d || null);
        setLoading(false);
      });
    // Subscriber counts — drive the Send Now confirmation dialog.
    NEWSLETTER_PUBS.forEach(pid => {
      supabase.from("newsletter_subscribers").select("id", { count: "exact", head: true })
        .eq("publication_id", pid).eq("status", "active")
        .then(({ count }) => setSubCounts(prev => ({ ...prev, [pid]: count || 0 })));
    });
  }, []);

  // ── Switch publication ──────────────────────────────────
  useEffect(() => {
    const d = drafts.find(d => d.publication_id === selPub);
    setDraft(d || null);
  }, [selPub, drafts]);

  // ── Generate preview HTML ───────────────────────────────
  const previewHtml = useMemo(() => {
    if (!draft) return "";
    return generateNewsletterHtml({
      stories: draft.stories || [],
      pubId: selPub,
      subject: draft.subject || "",
      introText: draft.intro_text || "",
    });
  }, [draft, selPub]);

  // ── Update preview iframe ───────────────────────────────
  useEffect(() => {
    if (previewRef.current && previewHtml) {
      previewRef.current.srcdoc = previewHtml;
    }
  }, [previewHtml]);

  // ── Update story field ──────────────────────────────────
  const updateStory = useCallback((storyId, field, value) => {
    setDraft(d => {
      if (!d) return d;
      const stories = (d.stories || []).map(s => s.story_id === storyId ? { ...s, [field]: value } : s);
      return { ...d, stories };
    });
  }, []);

  // ── Drag end handler ────────────────────────────────────
  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft(d => {
      if (!d) return d;
      const stories = [...(d.stories || [])];
      const oldIdx = stories.findIndex(s => s.story_id === active.id);
      const newIdx = stories.findIndex(s => s.story_id === over.id);
      const reordered = arrayMove(stories, oldIdx, newIdx).map((s, i) => ({ ...s, sort_order: i }));
      return { ...d, stories: reordered };
    });
  }, []);

  // ── Save draft ──────────────────────────────────────────
  const saveDraft = useCallback(async () => {
    if (!draft || !isOnline()) return;
    setSaving(true);
    const html = generateNewsletterHtml({ stories: draft.stories, pubId: selPub, subject: draft.subject, introText: draft.intro_text });
    await supabase.from("newsletter_drafts").update({
      subject: draft.subject, intro_text: draft.intro_text, stories: draft.stories,
      html_body: html, updated_at: new Date().toISOString(),
    }).eq("id", draft.id);
    setDraft(d => d ? { ...d, html_body: html } : d);
    setSaving(false);
  }, [draft, selPub]);

  // ── Approve ─────────────────────────────────────────────
  const approveDraft = useCallback(async () => {
    if (!draft || !isOnline()) return;
    setSaving(true);
    const html = generateNewsletterHtml({ stories: draft.stories, pubId: selPub, subject: draft.subject, introText: draft.intro_text });
    await supabase.from("newsletter_drafts").update({
      subject: draft.subject, intro_text: draft.intro_text, stories: draft.stories,
      html_body: html, status: "approved", approved_at: new Date().toISOString(),
      approved_by: currentUser?.authId || null, updated_at: new Date().toISOString(),
    }).eq("id", draft.id);
    setDraft(d => d ? { ...d, status: "approved", html_body: html } : d);
    setDrafts(prev => prev.map(d => d.id === draft.id ? { ...d, status: "approved" } : d));
    setSaving(false);
  }, [draft, selPub, currentUser]);

  // Render + persist the send-ready HTML (tracking pixel + click-
  // tracker + unsubscribe footer), then flip the draft to approved.
  // Returns the saved draft id so the send flow can hand it to the
  // edge function.
  const persistSendReady = useCallback(async () => {
    if (!draft) return null;
    const html = generateNewsletterHtml({
      stories: draft.stories, pubId: selPub, subject: draft.subject,
      introText: draft.intro_text, forSending: true,
    });
    await supabase.from("newsletter_drafts").update({
      subject: draft.subject, intro_text: draft.intro_text, stories: draft.stories,
      html_body: html, status: "approved", approved_at: new Date().toISOString(),
      approved_by: currentUser?.authId || null, updated_at: new Date().toISOString(),
    }).eq("id", draft.id);
    setDraft(d => d ? { ...d, status: "approved", html_body: html } : d);
    setDrafts(prev => prev.map(d => d.id === draft.id ? { ...d, status: "approved" } : d));
    return draft.id;
  }, [draft, selPub, currentUser]);

  // Invoke the send-newsletter edge function. Either test=address
  // (single send, subscribers untouched) or the full subscriber list
  // for the selected publication.
  const invokeSend = useCallback(async (draftId, testAddress) => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) throw new Error("Not signed in");
    // Supabase's edge gateway requires BOTH apikey (anon) AND Authorization
    // (user JWT). Omit either and the platform layer 401s before our code runs.
    const headers = {
      "Content-Type": "application/json",
      "apikey": supabase.supabaseKey || "",
      "Authorization": "Bearer " + token,
      "x-draft-id": draftId,
    };
    if (testAddress) headers["x-test-email"] = testAddress;
    const res = await fetch(EDGE_FN_URL + "/send-newsletter", { method: "POST", headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 207) throw new Error(data.error || `Send failed (${res.status})`);
    return data;
  }, []);

  // Progress tracker for bulk sends (set while polling, cleared after).
  const [sendProgress, setSendProgress] = useState(null);
  const pollDraftUntilDone = useCallback(async (id, total) => {
    setSendProgress({ sent: 0, total });
    for (let i = 0; i < 600; i++) { // 30 minutes at 3s ticks
      await new Promise(r => setTimeout(r, 3000));
      const { data } = await supabase.from("newsletter_drafts")
        .select("status, recipient_count, last_error")
        .eq("id", id).single();
      if (!data) break;
      setSendProgress({ sent: data.recipient_count || 0, total });
      if (data.status !== "sending") {
        setSendProgress(null);
        return data;
      }
    }
    setSendProgress(null);
    return null;
  }, []);

  // Auto-chain send invocations. Each Supabase edge function run caps
  // at ~150s wall clock which clears ~2,000 emails. Larger lists need
  // multiple back-to-back runs — we fire another when the previous
  // completes with status='approved' (incomplete).
  const runSendWithAutoResume = useCallback(async (draftId, totalExpected) => {
    const MAX_ROUNDS = 10;
    let lastFinal = null;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await invokeSend(draftId, null);
      if (!res.queued) {
        const { data } = await supabase.from("newsletter_drafts").select("*").eq("id", draftId).single();
        lastFinal = data;
        break;
      }
      const final = await pollDraftUntilDone(draftId, totalExpected);
      if (!final) return null;
      lastFinal = final;
      if (final.status === "sent" || final.status === "failed") break;
    }
    return lastFinal;
  }, [invokeSend, pollDraftUntilDone]);

  // ── Send Now (fires SES via edge function) ──────────────
  const sendNow = useCallback(async () => {
    if (!draft || !isOnline()) return;
    const count = subCounts[selPub] || 0;
    const ok = await dialog.confirm(
      `Send this newsletter to ${count.toLocaleString()} ${pub.name} subscribers now?`
    );
    if (!ok) return;
    setSending(true);
    try {
      const draftId = await persistSendReady();
      const final = await runSendWithAutoResume(draftId, count);
      if (final) {
        await dialog.alert(
          final.status === "failed"
            ? `Send failed: ${final.last_error || "unknown error"}`
            : `Sent to ${final.recipient_count || 0} of ${count} subscribers.`
        );
      } else {
        await dialog.alert("Send is still running in the background — check back in a few minutes.");
      }
      // Reload the draft so status shows through.
      const { data } = await supabase.from("newsletter_drafts").select("*").eq("id", draftId).single();
      if (data) {
        setDraft(data);
        setDrafts(prev => prev.map(d => d.id === data.id ? data : d));
      }
    } catch (err) {
      await dialog.alert("Send failed: " + err.message);
    }
    setSending(false);
  }, [draft, selPub, pub, subCounts, dialog, persistSendReady, runSendWithAutoResume]);

  // Scheduling — freezes the rendered HTML, flips status to 'scheduled'
  // with scheduled_at + recurrence. pg_cron tick (every 2 min) fires it.
  const scheduleSend = useCallback(async ({ scheduled_at, recurrence }) => {
    if (!draft) return;
    const html = generateNewsletterHtml({
      stories: draft.stories, pubId: selPub, subject: draft.subject,
      introText: draft.intro_text, forSending: true,
    });
    await supabase.from("newsletter_drafts").update({
      subject: draft.subject, intro_text: draft.intro_text, stories: draft.stories,
      html_body: html,
      status: "scheduled",
      scheduled_at, recurrence,
    }).eq("id", draft.id);
    const { data: fresh } = await supabase.from("newsletter_drafts").select("*").eq("id", draft.id).single();
    if (fresh) {
      setDraft(fresh);
      setDrafts(prev => prev.map(d => d.id === fresh.id ? fresh : d));
    }
  }, [draft, selPub]);

  const cancelSchedule = useCallback(async () => {
    if (!draft) return;
    const ok = await dialog.confirm("Cancel the scheduled send?");
    if (!ok) return;
    await supabase.from("newsletter_drafts").update({
      status: "approved", scheduled_at: null, recurrence: null,
    }).eq("id", draft.id);
    const { data: fresh } = await supabase.from("newsletter_drafts").select("*").eq("id", draft.id).single();
    if (fresh) {
      setDraft(fresh);
      setDrafts(prev => prev.map(d => d.id === fresh.id ? fresh : d));
    }
  }, [draft, dialog]);

  // Test send — goes to a single address the user types, doesn't
  // touch subscriber or email_sends bookkeeping.
  const sendTest = useCallback(async () => {
    if (!draft || !isOnline()) return;
    const address = await dialog.prompt("Send a test to which email?", currentUser?.email || "");
    if (!address) return;
    setSending(true);
    try {
      const draftId = await persistSendReady();
      const result = await invokeSend(draftId, address.trim());
      await dialog.alert(result.sent === 1 ? `Test sent to ${address}.` : `Test failed: ${result.errors?.[0] || "unknown"}`);
    } catch (err) {
      await dialog.alert("Test failed: " + err.message);
    }
    setSending(false);
  }, [draft, currentUser, dialog, persistSendReady, invokeSend]);

  // ── Preview in new tab ──────────────────────────────────
  const openPreview = () => {
    const w = window.open("", "_blank");
    if (w) { w.document.write(previewHtml); w.document.close(); }
  };

  // ── Add story search ───────────────────────────────────
  useEffect(() => {
    if (!addStoryOpen || !addStorySr || addStorySr.length < 2) { setAddStoryResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("stories").select("id, title, slug, excerpt, author, category, featured_image_url, publication_id")
        .eq("status", "Published").ilike("title", `%${addStorySr}%`).limit(10);
      setAddStoryResults(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [addStorySr, addStoryOpen]);

  const addStoryToDraft = (story) => {
    setDraft(d => {
      if (!d) return d;
      const existing = (d.stories || []).find(s => s.story_id === story.id);
      if (existing) return d;
      return { ...d, stories: [...(d.stories || []), {
        story_id: story.id, title: story.title, slug: story.slug,
        excerpt: story.excerpt || "", blurb: story.excerpt || "",
        category: story.category || "News", author: story.author || "",
        featured_image_url: story.featured_image_url || "",
        publication_id: story.publication_id || selPub,
        is_regional: story.publication_id !== selPub,
        included: true, sort_order: (d.stories || []).length,
      }] };
    });
    setAddStoryOpen(false); setAddStorySr("");
  };

  // ── Load history ────────────────────────────────────────
  // Order by updated_at since generated_at can be null on eBlasts —
  // sorting on a null-laden column was pushing old drafts to the top.
  useEffect(() => {
    if (tab !== "History" || !isOnline()) return;
    supabase.from("newsletter_drafts")
      .select("id, publication_id, subject, stories, status, draft_type, generated_at, sent_at, created_at, updated_at, recipient_count, open_count, click_count, html_body")
      .order("updated_at", { ascending: false }).limit(100)
      .then(({ data }) => setHistory(data || []));
  }, [tab]);

  const filteredHistory = historyPub === "all" ? history : history.filter(h => h.publication_id === historyPub);

  // ── Pub status for tabs ─────────────────────────────────
  const pubStatus = (pid) => {
    const d = drafts.find(d => d.publication_id === pid);
    if (!d) return "gray";
    if (d.status === "sent") return Z.go;
    if (d.status === "approved") return Z.ac;
    if ((d.stories || []).length === 0) return Z.td;
    return Z.wa;
  };

  // ════════════════════════════════════════════════════════
  // If a campaign is selected, show its full report in place of the tabs.
  // The report has its own header + Back button; we return early so the
  // rest of the page (tabs, today/eblast/templates/history) isn't rendered.
  if (campaignId) {
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <CampaignReport mode="internal" draftId={campaignId} onBack={() => setCampaignId(null)} />
    </div>;
  }

  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    {/* Action row — title moved to TopBar via usePageHeader. */}
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <Btn sm onClick={openPreview} disabled={!draft}><Ic.globe size={13} /> Preview</Btn>
    </div>

    <TabRow>
      <TB tabs={["Today", "eBlast", "Templates", "History"]} active={tab} onChange={setTab} />
    </TabRow>

    {/* ════════ eBLAST TAB ════════ */}
    {tab === "eBlast" && <EblastComposer pubs={pubs} currentUser={currentUser} />}

    {/* ════════ TEMPLATES TAB ════════ */}
    {tab === "Templates" && <NewsletterTemplates pubs={pubs} />}

    {/* ════════ TODAY TAB ════════ */}
    {tab === "Today" && <>
      {/* Publication selector — standard pill */}
      <TB tabs={NEWSLETTER_PUBS.map(pid => getPubConfig(pid).name)} active={getPubConfig(selPub).name} onChange={v => { const match = NEWSLETTER_PUBS.find(pid => getPubConfig(pid).name === v); if (match) setSelPub(match); }} />

      {loading ? <div style={{ padding: 40, textAlign: "center", color: Z.tm }}>Loading...</div>
      : !draft ? <GlassCard style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.td }}>No draft for today</div>
          <div style={{ fontSize: FS.sm, color: Z.td, marginTop: 4 }}>The Wednesday Agent Station generates drafts at 5:00 AM</div>
        </GlassCard>
      : <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16, alignItems: "start" }}>

        {/* LEFT: Preview */}
        <GlassCard style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${Z.bd}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", fontFamily: COND }}>Live Preview</span>
            <Badge status={STATUS_BADGE[draft.status] || "Draft"} small />
          </div>
          <iframe ref={previewRef} srcDoc={previewHtml} title="Newsletter Preview"
            style={{ width: "100%", height: 700, border: "none", background: "#f4f4f4" }} />
        </GlassCard>

        {/* RIGHT: Edit Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Stats */}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, padding: "8px 12px", background: Z.sa, borderRadius: Ri, textAlign: "center" }}>
              <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx }}>{subCounts[selPub] || 0}</div>
              <div style={{ fontSize: FS.micro, color: Z.td, fontFamily: COND, textTransform: "uppercase" }}>Subscribers</div>
            </div>
            {draft.status === "sent" && <>
              <div style={{ flex: 1, padding: "8px 12px", background: Z.sa, borderRadius: Ri, textAlign: "center" }}>
                <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx }}>{draft.recipient_count || 0}</div>
                <div style={{ fontSize: FS.micro, color: Z.td, fontFamily: COND, textTransform: "uppercase" }}>Sent</div>
              </div>
              <div style={{ flex: 1, padding: "8px 12px", background: Z.sa, borderRadius: Ri, textAlign: "center" }}>
                <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx }}>{draft.open_count || 0}</div>
                <div style={{ fontSize: FS.micro, color: Z.td, fontFamily: COND, textTransform: "uppercase" }}>Opens</div>
              </div>
            </>}
          </div>

          {/* Subject */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <label style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", fontFamily: COND }}>Subject Line</label>
              <span style={{ fontSize: FS.micro, color: Z.td }}>{(draft.subject || "").length} chars</span>
            </div>
            <input value={draft.subject || ""} onChange={e => setDraft(d => d ? { ...d, subject: e.target.value } : d)}
              style={{ width: "100%", background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "9px 12px", color: Z.tx, fontSize: FS.md, fontWeight: FW.semi, outline: "none", boxSizing: "border-box" }} />
          </div>

          {/* Intro */}
          <div>
            <label style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", fontFamily: COND, marginBottom: 4, display: "block" }}>Intro Text</label>
            <textarea value={draft.intro_text || ""} onChange={e => setDraft(d => d ? { ...d, intro_text: e.target.value } : d)}
              rows={2} placeholder="Add a personal note to today's newsletter..."
              style={{ width: "100%", background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "9px 12px", color: Z.tx, fontSize: FS.sm, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
          </div>

          {/* Story List */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", fontFamily: COND }}>Stories ({(draft.stories || []).filter(s => s.included !== false).length})</label>
              <Btn sm v="secondary" onClick={() => setAddStoryOpen(true)}><Ic.plus size={11} /> Add Story</Btn>
            </div>
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={(draft.stories || []).map(s => s.story_id)} strategy={verticalListSortingStrategy}>
                  {(draft.stories || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(s => (
                    <SortableStory key={s.story_id} story={s} onUpdate={updateStory} />
                  ))}
                </SortableContext>
              </DndContext>
              {(draft.stories || []).length === 0 && <div style={{ padding: 20, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No stories in this draft</div>}
            </div>
          </div>

          {/* Scheduled-send banner */}
          {draft.status === "scheduled" && draft.scheduled_at && (
            <div style={{ padding: "10px 14px", borderRadius: Ri, background: Z.ac + "18", border: `1px solid ${Z.ac}40`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: FS.sm, color: Z.ac, fontFamily: COND }}>
                <strong>Scheduled</strong> for {new Date(draft.scheduled_at).toLocaleString("en-US", {
                  weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                  timeZone: "America/Los_Angeles", timeZoneName: "short",
                })}
                {draft.recurrence?.type && <span style={{ marginLeft: 6, opacity: 0.75 }}>· repeats {draft.recurrence.type}</span>}
              </div>
              <Btn sm v="ghost" onClick={cancelSchedule} style={{ color: Z.da }}>Cancel schedule</Btn>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Btn sm v="secondary" onClick={saveDraft} disabled={saving || draft.status === "sent"}>{saving ? "Saving..." : "Save Draft"}</Btn>
            <Btn sm onClick={approveDraft} disabled={saving || draft.status === "sent"}><Ic.check size={12} /> Approve</Btn>
            <Btn sm v="ghost" onClick={sendTest} disabled={sending || draft.status === "sent"}>Send Test</Btn>
            <Btn sm v="ghost" onClick={() => setScheduleOpen(true)} disabled={sending || draft.status === "sent"}>
              {draft.status === "scheduled" ? "Reschedule" : "Schedule"}
            </Btn>
            <Btn sm v="warning" onClick={sendNow} disabled={sending || draft.status === "sent"}>
              <Ic.send size={12} />{" "}
              {sendProgress
                ? `${sendProgress.sent.toLocaleString()} / ${sendProgress.total.toLocaleString()}…`
                : sending ? "Sending..." : `Send to ${(subCounts[selPub] || 0).toLocaleString()}`}
            </Btn>
          </div>

          {/* Last saved */}
          {draft.updated_at && <div style={{ fontSize: FS.xs, color: Z.td, fontFamily: COND }}>
            Last saved: {fmtDate(draft.updated_at)} {fmtTime(draft.updated_at)}
            {draft.approved_at && <span> \u00B7 Approved {fmtTime(draft.approved_at)}</span>}
            {draft.sent_at && <span> \u00B7 Sent {fmtTime(draft.sent_at)}</span>}
          </div>}
        </div>
      </div>}
    </>}

    {/* ════════ HISTORY TAB ════════ */}
    {tab === "History" && <>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Sel value={historyPub} onChange={e => setHistoryPub(e.target.value)} options={[{ value: "all", label: "All Publications" }, ...NEWSLETTER_PUBS.map(pid => ({ value: pid, label: getPubConfig(pid).name }))]} />
      </div>
      <DataTable>
        <thead><tr>
          {["Date", "Type", "Publication", "Subject", "Recipients", "Opens", "Clicks", "Status"].map(h => <th key={h}>{h}</th>)}
        </tr></thead>
        <tbody>
          {filteredHistory.map(h => {
            // Prefer sent_at for sent campaigns; fall back to created_at.
            // generated_at was often null on eBlast rows which is why the
            // column read "Invalid Date".
            const dateSource = h.sent_at || h.created_at || h.generated_at || h.updated_at;
            const openRate  = h.recipient_count > 0 ? Math.round((h.open_count  || 0) * 100 / h.recipient_count) : 0;
            const clickRate = h.recipient_count > 0 ? Math.round((h.click_count || 0) * 100 / h.recipient_count) : 0;
            return (
              <tr key={h.id} onClick={() => setCampaignId(h.id)} style={{ cursor: "pointer" }}>
                <td style={{ color: Z.tm, fontSize: FS.sm }}>{dateSource ? fmtDate(dateSource) : "\u2014"}</td>
                <td style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: h.draft_type === "eblast" ? (Z.pu || Z.ac) : Z.tm, textTransform: "uppercase", fontFamily: COND }}>
                  {h.draft_type === "eblast" ? "eBlast" : "Newsletter"}
                </td>
                <td style={{ fontWeight: FW.semi, color: Z.tx }}>{getPubConfig(h.publication_id).name}</td>
                <td style={{ color: Z.tx, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.subject}</td>
                <td style={{ color: Z.tm }}>{h.recipient_count ? h.recipient_count.toLocaleString() : "\u2014"}</td>
                <td style={{ color: Z.tm }}>{h.status === "sent" && h.recipient_count ? `${(h.open_count || 0).toLocaleString()} \u00B7 ${openRate}%` : "\u2014"}</td>
                <td style={{ color: Z.tm }}>{h.status === "sent" && h.recipient_count ? `${(h.click_count || 0).toLocaleString()} \u00B7 ${clickRate}%` : "\u2014"}</td>
                <td><Badge status={STATUS_BADGE[h.status] || h.status} small /></td>
              </tr>
            );
          })}
          {filteredHistory.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", color: Z.td, padding: 20 }}>No newsletters sent yet</td></tr>}
        </tbody>
      </DataTable>
    </>}

    {/* Schedule Modal */}
    <ScheduleModal
      open={scheduleOpen}
      onClose={() => setScheduleOpen(false)}
      onSchedule={scheduleSend}
      currentScheduledAt={draft?.scheduled_at}
      currentRecurrence={draft?.recurrence}
      draftLabel={draft?.subject || "this newsletter"}
    />

    {/* Add Story Modal */}
    <Modal open={addStoryOpen} onClose={() => { setAddStoryOpen(false); setAddStorySr(""); }} title="Add Story" width={500}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Inp value={addStorySr} onChange={e => setAddStorySr(e.target.value)} placeholder="Search published stories..." />
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {addStoryResults.map(s => (
            <div key={s.id} onClick={() => addStoryToDraft(s)} style={{ display: "flex", gap: 10, padding: "8px 10px", cursor: "pointer", borderBottom: `1px solid ${Z.bd}15`, borderRadius: Ri }}
              onMouseEnter={e => e.currentTarget.style.background = Z.sa} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {s.featured_image_url && <img src={s.featured_image_url} alt="" style={{ width: 48, height: 32, borderRadius: Ri, objectFit: "cover" }} />}
              <div>
                <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx }}>{s.title}</div>
                <div style={{ fontSize: FS.xs, color: Z.td }}>{s.category} \u00B7 {s.author}</div>
              </div>
            </div>
          ))}
          {addStorySr.length >= 2 && addStoryResults.length === 0 && <div style={{ padding: 16, textAlign: "center", color: Z.td }}>No results</div>}
          {addStorySr.length < 2 && <div style={{ padding: 16, textAlign: "center", color: Z.td }}>Type to search...</div>}
        </div>
      </div>
    </Modal>

    {/* History Preview Modal */}
    <Modal open={!!previewDraft} onClose={() => setPreviewDraft(null)} title={previewDraft?.subject || "Newsletter"} width={700}>
      {previewDraft && <iframe srcDoc={previewDraft.html_body || generateNewsletterHtml({ stories: previewDraft.stories || [], pubId: previewDraft.publication_id, subject: previewDraft.subject, introText: "" })}
        title="Preview" style={{ width: "100%", height: 500, border: "none", borderRadius: Ri, background: "#f4f4f4" }} />}
    </Modal>
  </div>;
};

export default memo(NewsletterPage);
