import { useState, useRef } from "react";
import { Z, SC, COND, DISPLAY, FS, FW, Ri, CARD, R, INV } from "../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Card, SB, TB, Stat, Modal, Bar, FilterBar, SortHeader, BackBtn, ThemeToggle , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, ListCard, ListDivider, ListGrid, glass } from "../components/ui";
import { STORY_STATUSES } from "../constants";

const PUB_CATEGORIES = {
  "pub-paso-robles-press": ["News", "Sports", "Business", "Opinion", "Events", "Obituaries", "Crime", "Community", "Education", "Best of North SLO County"],
  "pub-atascadero-news": ["News", "Sports", "Business", "Opinion", "Events", "Schools", "Community", "Lifestyle"],
  "pub-paso-robles-magazine": ["Wine", "Food", "Culture", "Business", "Lifestyle", "Travel", "Events"],
  "pub-atascadero-news-maga": ["Lifestyle", "Business", "Food", "Community", "Outdoors", "Events"],
  "pub-morro-bay-life": ["Community", "Outdoors", "Food", "Business", "Events", "Marine"],
  "pub-santa-ynez-valley-st": ["Wine", "Community", "Events", "Business", "Lifestyle", "Agriculture"],
  "pub-the-malibu-times": ["News", "Real Estate", "Environment", "Community", "Lifestyle", "Government"],
};
const RICH_CMDS = [
  { cmd: "formatBlock_P", icon: "¶", title: "Paragraph" },
  { cmd: "bold", icon: "B", title: "Bold" },
  { cmd: "italic", icon: "I", title: "Italic" },
  { cmd: "formatBlock_H2", icon: "H2", title: "Heading 2" },
  { cmd: "formatBlock_H3", icon: "H3", title: "Heading 3" },
  { cmd: "insertUnorderedList", icon: "•", title: "Bullet List" },
  { cmd: "insertOrderedList", icon: "1.", title: "Numbered List" },
  { cmd: "createLink", icon: "🔗", title: "Link" },
  { cmd: "formatBlock_BLOCKQUOTE", icon: "❝", title: "Block Quote" },
  { cmd: "insertHorizontalRule", icon: "—", title: "Horizontal Rule" },
];
const AI_ACTIONS = [
  { id: "improve", label: "Improve Clarity", prompt: "Rewrite the following text to be clearer and more concise while preserving the meaning and journalistic tone:" },
  { id: "shorten", label: "Shorten", prompt: "Shorten the following text by about 30% while keeping the key information and journalistic style:" },
  { id: "expand", label: "Expand", prompt: "Expand the following text with more detail, context, and supporting information while maintaining journalistic style:" },
  { id: "web", label: "Rewrite for Web", prompt: "Rewrite the following text optimized for web reading: shorter paragraphs, scannable structure, strong opening, SEO-friendly. Keep journalistic accuracy:" },
  { id: "headline", label: "Headline Options", prompt: "Generate 5 alternative headlines for the following article text. Return ONLY the headlines, one per line, numbered 1-5:" },
  { id: "lede", label: "Write a Lede", prompt: "Write a compelling opening paragraph (lede) for the following article. Make it hook the reader and summarize the key news:" },
];

// AI writing assist — requires backend proxy edge function (not yet deployed)
async function callClaude(_systemPrompt, _userText) {
  return "AI assist requires a backend proxy. Deploy an ai-proxy edge function to enable this feature.";
}

const Editorial = ({ stories, setStories, pubs, notifications, setNotifications, jurisdiction, publishStory, unpublishStory }) => {
  const edPubs = jurisdiction?.myPubs || pubs;
  const _isDk = Z.bg === "#08090D";
  const [edPub, setEdPub] = useState("");
  const [edStatus, setEdStatus] = useState("");
  const [edSearch, setEdSearch] = useState("");
  const [edCollapse, setEdCollapse] = useState({ action: false, progress: false, complete: true });
  const [sel, setSel] = useState(null);
  const [wm, setWm] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [editorContents, setEditorContents] = useState({});
  const [files, setFiles] = useState({});
  const [aiPanel, setAiPanel] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [aiIssues, setAiIssues] = useState([]);
  const [pubCategory, setPubCategory] = useState("");
  const [pubExcerpt, setPubExcerpt] = useState("");
  const [pubSeoTitle, setPubSeoTitle] = useState("");
  const [pubSeoDesc, setPubSeoDesc] = useState("");
  const [pubSchedule, setPubSchedule] = useState("");
  const [pubStatus, setPubStatus] = useState("Published");

  const getEditorText = () => sel ? (editorContents[sel.id] || `Draft content for "${sel.title}".\n\nThe City of Paso Robles anounced Tuesday that the new downtown pavillion project will begin construction on April 15th. The $2.3 million dollar project will include a outdoor amphitheater and public art installations.\n\n"We are very excited," said Mayor Steve Martin. "It will truely transform our downtown."\n\nThe pavillion is expected to be completed by december 2026.`) : "";
  const setEditorText = (v) => { if (sel) setEditorContents(ec => ({ ...ec, [sel.id]: v })); };
  const editorText = getEditorText();
  const pn = id => pubs.find(p => p.id === id)?.name || "";
  const upd = (id, st) => { setStories(s => s.map(x => x.id === id ? { ...x, status: st } : x)); if (sel?.id === id) setSel(x => ({ ...x, status: st })); };
  const wordCount = editorText.trim() ? editorText.trim().split(/\s+/).length : 0;
  const storyFiles = sel ? (files[sel.id] || []) : [];
  const addFile = () => { if (!sel) return; setFiles(f => ({ ...f, [sel.id]: [...(f[sel.id] || []), { id: "f" + Date.now(), name: `file-${Date.now().toString(36)}.jpg`, type: "img", thumb: true }] })); };

  const runAi = async (action) => {
    if (!editorText.trim()) return;
    setAiPanel("assistant"); setAiLoading(true); setAiResult("");
    const prompts = { improve: "Rewrite for clarity:", shorten: "Shorten by 30%:", expand: "Expand with detail:", web: "Rewrite for web:", headline: "Generate 5 headlines:", lede: "Write a compelling lede:" };
    const r = await callClaude("You are an expert newspaper editor. Be concise.", (prompts[action] || "Improve:") + "\n\n" + editorText);
    setAiResult(r); setAiLoading(false);
  };
  const runSpellCheck = async () => {
    setAiPanel("spelling"); setAiLoading(true); setAiIssues([]);
    const r = await callClaude("Return ONLY a JSON array of {original, fix, type} for spelling/grammar errors. No markdown.", editorText);
    try { setAiIssues(JSON.parse(r.replace(/```json|```/g, "").trim()).map((x, i) => ({ ...x, id: i, applied: false }))); } catch { setAiIssues([]); }
    setAiLoading(false);
  };
  const runApCheck = async () => {
    setAiPanel("ap"); setAiLoading(true); setAiIssues([]);
    const r = await callClaude("Check AP Style. Return ONLY JSON array of {original, fix, rule}. No markdown.", editorText);
    try { setAiIssues(JSON.parse(r.replace(/```json|```/g, "").trim()).map((x, i) => ({ ...x, id: i, applied: false }))); } catch { setAiIssues([]); }
    setAiLoading(false);
  };
  const applyFix = (iss) => { if (iss.applied) return; setEditorText(editorText.replace(iss.original, iss.fix)); setAiIssues(a => a.map(x => x.id === iss.id ? { ...x, applied: true } : x)); };
  const applyAll = () => { let t = editorText; aiIssues.filter(x => !x.applied).forEach(x => { t = t.replace(x.original, x.fix); }); setEditorText(t); setAiIssues(a => a.map(x => ({ ...x, applied: true }))); };

  const pubCats = PUB_CATEGORIES[sel?.publication] || ["News"];
  const pubName = pn(sel?.publication);
  const openPublish = () => { if (!sel) return; setPubCategory(sel.category || pubCats[0]); setPubExcerpt(""); setPubSeoTitle(sel.title); setPubSeoDesc(""); setPubSchedule(""); setPubStatus("Published"); setWm(true); };
  const doPublish = async () => {
    if (!sel || !publishStory) return;
    setPublishing(true);
    await publishStory(sel.id, {
      title: sel.title, body: editorText, excerpt: pubExcerpt,
      category: pubCategory, siteId: sel.publication,
      featuredImageUrl: storyFiles[0]?.url || null,
      seoTitle: pubSeoTitle, seoDescription: pubSeoDesc,
      scheduledAt: pubStatus === "Scheduled" ? pubSchedule : null,
    });
    setSel(x => ({ ...x, sentToWeb: true, status: pubStatus === "Scheduled" ? "Scheduled" : "Published" }));
    setPublishing(false); setWm(false);
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="Editorial">
      <SB value={edSearch} onChange={setEdSearch} placeholder="Search stories..." />
      {sel && (sel.sentToWeb ? <Btn v="secondary" disabled style={{ opacity: 0.5 }}><Ic.pub size={12} /> Published</Btn> : <Btn onClick={openPublish}><Ic.pub size={12} /> Publish to Web</Btn>)}
    </PageHeader>

    <TabRow>
      <TB tabs={["All", ...edPubs.map(p => p.name)]} active={edPub === "" ? "All" : edPubs.find(p => p.id === edPub)?.name || "All"} onChange={v => setEdPub(v === "All" ? "" : edPubs.find(p => p.name === v)?.id || "")} />
      <TabPipe />
      <TB tabs={["All Status", ...STORY_STATUSES]} active={edStatus === "" ? "All Status" : edStatus} onChange={v => setEdStatus(v === "All Status" ? "" : v)} />
    </TabRow>

    <div style={{ display: "flex", gap: 14, height: "calc(100vh - 190px)", overflow: "hidden" }}>
      {/* LEFT SIDEBAR — story list */}
      <div style={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column", gap: 5, overflowY: "auto" }}>
        {(() => {
          const fStories = stories.filter(s => {
            if (edPub !== '' && s.publication !== edPub) return false;
            if (edStatus !== '' && s.status !== edStatus) return false;
            if (edSearch) { const q = edSearch.toLowerCase(); if (!s.title.toLowerCase().includes(q) && !s.author.toLowerCase().includes(q)) return false; }
            return true;
          });
          const needsAct = fStories.filter(s => ["Assigned", "Draft", "Needs Editing"].includes(s.status)).sort((a,b) => (a.dueDate||"9").localeCompare(b.dueDate||"9"));
          const inProg = fStories.filter(s => ["Edited", "Approved"].includes(s.status));
          const done = fStories.filter(s => ["On Page", "Sent to Web"].includes(s.status));
          return <>
            <div style={{ display: "flex", gap: 8, padding: "4px 0 6px", fontSize: FS.xs, fontWeight: FW.bold }}>
              <span style={{ color: Z.da }}>{needsAct.length} action</span>
              <span style={{ color: Z.tm }}>·</span>
              <span style={{ color: Z.wa }}>{inProg.length} progress</span>
              <span style={{ color: Z.tm }}>·</span>
              <span style={{ color: Z.ac }}>{done.length} done</span>
            </div>
            {[{ label: "Needs Action", items: needsAct, color: Z.da }, { label: "In Progress", items: inProg, color: Z.wa }, { label: "Complete", items: done, color: Z.ac }].map(g => g.items.length === 0 ? null : <div key={g.label}>
              <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: g.color, letterSpacing: 1, textTransform: "uppercase", padding: "6px 0 3px", borderBottom: `1px solid ${Z.bd}` }}>{g.label}</div>
              {g.items.map(s => <div key={s.id} onClick={() => { setSel(s); setAiPanel(null); setAiResult(""); setAiIssues([]); }}
                style={{ background: sel?.id === s.id ? (_isDk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)") : (_isDk ? "rgba(14,16,24,0.45)" : "rgba(255,255,255,0.35)"), backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: `1px solid ${_isDk ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.5)"}`, borderRadius: R, padding: CARD.pad, cursor: "pointer", marginTop: 8, transition: "background 0.1s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                  <span style={{ fontSize: FS.md, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{s.title}</span>
                  <Badge status={s.status} small />
                </div>
                <div style={{ fontSize: FS.sm, color: Z.tm }}>{s.author} · {pn(s.publication)}{s.dueDate ? ` · ${s.dueDate.slice(5)}` : ""}</div>
              </div>)}
            </div>)}
          </>;
        })()}
      </div>

      {/* CENTER — editor */}
      {sel ? <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Title + author — vertically aligned with sidebar story count line */}
        <div>
          <h4 style={{ margin: "0 0 4px", fontSize: FS.lg, fontWeight: FW.heavy, color: Z.tx }}>{sel.title}</h4>
          <div style={{ fontSize: FS.base, color: Z.tm }}>By {sel.author} · {pn(sel.publication)}</div>
        </div>
        {/* Status buttons */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {STORY_STATUSES.map(st => <Btn key={st} sm v={sel.status === st ? "primary" : "secondary"} onClick={() => upd(sel.id, st)}>{st}</Btn>)}
        </div>
        {/* Editor with AI tools inside */}
        <div style={{ flex: 1, display: "flex", gap: 10 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}`, overflow: "hidden" }}>
            {/* AI tools bar inside editor */}
            <div style={{ display: "flex", gap: 3, padding: "8px 12px", borderBottom: `1px solid ${Z.bd}`, background: Z.sa }}>
              <button onClick={() => setAiPanel(aiPanel === "assistant" ? null : "assistant")}
                style={{ padding: "5px 10px", borderRadius: Ri, border: `1px solid ${_isDk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`, background: aiPanel === "assistant" ? Z.go : "transparent", cursor: "pointer", fontSize: FS.sm, fontWeight: FW.bold, color: aiPanel === "assistant" ? INV.light : Z.tm, fontFamily: COND }}>AI Assist</button>
              <button onClick={runSpellCheck}
                style={{ padding: "5px 10px", borderRadius: Ri, border: `1px solid ${_isDk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`, background: aiPanel === "spelling" ? Z.da : "transparent", cursor: "pointer", fontSize: FS.sm, fontWeight: FW.bold, color: aiPanel === "spelling" ? INV.light : Z.tm, fontFamily: COND }}>Spelling</button>
              <button onClick={runApCheck}
                style={{ padding: "5px 10px", borderRadius: Ri, border: `1px solid ${_isDk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`, background: aiPanel === "ap" ? Z.wa : "transparent", cursor: "pointer", fontSize: FS.sm, fontWeight: FW.bold, color: aiPanel === "ap" ? INV.light : Z.tm, fontFamily: COND }}>AP Style</button>
            </div>
            <textarea value={editorText} onChange={e => setEditorText(e.target.value)}
              style={{ flex: 1, background: "transparent", border: "none", padding: 16, color: Z.tx, fontSize: FS.md, lineHeight: 1.8, outline: "none", resize: "none", fontFamily: "inherit", minHeight: 0 }} />
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", borderTop: `1px solid ${Z.bd}`, background: Z.sa }}>
              <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm }}>Words: <b style={{ color: Z.ac }}>{wordCount}</b></span>
              <span style={{ fontSize: FS.sm, color: Z.tm }}>Target: {sel.wordCount}</span>
            </div>
          </div>
          {aiPanel && <div style={{ width: 260, flexShrink: 0, ...glass(), borderRadius: R, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${Z.bd}`, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>{aiPanel === "assistant" ? "AI Assistant" : aiPanel === "spelling" ? "Spelling" : "AP Style"}</span>
              <Btn sm v="ghost" onClick={() => setAiPanel(null)}>✕</Btn>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
              {aiPanel === "assistant" && <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                  {["improve","shorten","expand","web","headline","lede"].map(a =>
                    <button key={a} onClick={() => runAi(a)} disabled={aiLoading}
                      style={{ padding: "5px 10px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, cursor: "pointer", fontSize: FS.sm, fontWeight: FW.bold, color: Z.ac, textTransform: "capitalize" }}>{a}</button>)}
                </div>
                {aiLoading && <div style={{ padding: 16, textAlign: "center", color: Z.ac }}>Analyzing...</div>}
                {aiResult && <div style={{ background: Z.bg, borderRadius: R, padding: CARD.pad, fontSize: FS.base, color: Z.tx, lineHeight: 1.6, whiteSpace: "pre-wrap", border: `1px solid ${Z.bd}` }}>
                  {aiResult}
                  <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                    <Btn sm onClick={() => { setEditorText(aiResult); setAiResult(""); }}>Replace</Btn>
                    <Btn sm v="secondary" onClick={() => navigator.clipboard?.writeText(aiResult)}>Copy</Btn>
                  </div>
                </div>}
              </>}
              {(aiPanel === "spelling" || aiPanel === "ap") && <>
                {aiLoading && <div style={{ padding: 16, textAlign: "center", color: Z.wa }}>Checking...</div>}
                {!aiLoading && aiIssues.length === 0 && <div style={{ padding: 16, textAlign: "center", color: Z.su }}>No issues found</div>}
                {!aiLoading && aiIssues.length > 0 && <>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx }}>{aiIssues.filter(x => !x.applied).length} issues</span>
                    <Btn sm v="ghost" onClick={applyAll}>Fix All</Btn>
                  </div>
                  {aiIssues.map(iss => <div key={iss.id} style={{ padding: "10px 14px", background: iss.applied ? Z.ss : Z.bg, border: `1px solid ${Z.bd}`, borderRadius: R, marginBottom: 4 }}>
                    <div style={{ fontSize: FS.sm, color: Z.da, textDecoration: iss.applied ? "line-through" : "none" }}>{iss.original}</div>
                    <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: iss.applied ? Z.su : Z.tx }}>→ {iss.fix}</div>
                    {iss.rule && <div style={{ fontSize: FS.xs, color: Z.wa, fontStyle: "italic" }}>{iss.rule}</div>}
                    {!iss.applied && <button onClick={() => applyFix(iss)} style={{ background: Z.ac, border: "none", borderRadius: Ri, padding: "2px 6px", cursor: "pointer", fontSize: FS.xs, color: INV.light, marginTop: 3 }}>Fix</button>}
                  </div>)}
                </>}
              </>}
            </div>
          </div>}
        </div>
      </div> : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", ...glass(), borderRadius: R, color: Z.td }}>Select a story to edit</div>}
      {sel && <div style={{ width: 160, flexShrink: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 6 }}>
        <div style={{ border: `2px dashed ${Z.bd}`, borderRadius: R, padding: 16, textAlign: "center", color: Z.tm, fontSize: FS.base, cursor: "pointer" }} onClick={addFile}>
          <Ic.up size={18} color={Z.td} /><div style={{ marginTop: 3, fontWeight: FW.bold }}>Upload</div>
        </div>
        {storyFiles.map((f, idx) => <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: 5, background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: R }}>
          <div style={{ width: 28, height: 28, borderRadius: R, background: Z.sa, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.micro, fontWeight: FW.heavy, color: Z.tm }}>IMG</div>
          <div style={{ flex: 1, fontSize: FS.xs, color: Z.tx, overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}{idx === 0 && <div style={{ fontSize: FS.micro, color: Z.ac }}>Featured</div>}</div>
        </div>)}
      </div>}
    </div>
    <Modal open={wm} onClose={() => setWm(false)} title="Publish to StellarPress" width={600}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Publication" value={pubName} readOnly style={{ opacity: 0.6 }} />
          <Sel label="Category" value={pubCategory} onChange={e => setPubCategory(e.target.value)} options={pubCats} />
        </div>
        <Inp label="Title" value={sel?.title || ""} readOnly style={{ opacity: 0.6 }} />
        <Inp label="Slug" value={(sel?.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")} readOnly style={{ opacity: 0.6 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Author" value={sel?.author || ""} readOnly style={{ opacity: 0.6 }} />
          <Sel label="Status" value={pubStatus} onChange={e => setPubStatus(e.target.value)} options={["Published", "Scheduled"]} />
        </div>
        <TA label="Excerpt" value={pubExcerpt} onChange={e => setPubExcerpt(e.target.value)} placeholder="Brief summary — auto-generated from body if left empty" style={{ minHeight: 50 }} />
        <div style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: R, padding: CARD.pad }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>SEO</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Inp label="SEO Title" value={pubSeoTitle} onChange={e => setPubSeoTitle(e.target.value)} placeholder={sel?.title} />
            <TA label="Meta Description" value={pubSeoDesc} onChange={e => setPubSeoDesc(e.target.value)} placeholder="155 characters max — appears in search results" style={{ minHeight: 40 }} />
          </div>
        </div>
        {pubStatus === "Scheduled" && <Inp label="Scheduled Date" type="datetime-local" value={pubSchedule} onChange={e => setPubSchedule(e.target.value)} />}
        <div style={{ padding: 12, background: Z.sa, borderRadius: R, border: `1px solid ${Z.bd}` }}>
          <div style={{ fontSize: FS.sm, color: Z.tm }}>Content preview: <b style={{ color: Z.tx }}>{editorText.trim().split(/\s+/).length} words</b></div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="secondary" onClick={() => setWm(false)}>Cancel</Btn>
          <Btn onClick={doPublish} disabled={publishing}>
            <Ic.send size={12} /> {publishing ? "Publishing..." : pubStatus === "Scheduled" ? "Schedule" : "Publish"} to {pubName}
          </Btn>
        </div>
      </div>
    </Modal>
  </div>;
};


export default Editorial;
