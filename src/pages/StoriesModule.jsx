import { useState, useRef } from "react";
import { Z, SC, COND, DISPLAY, FS, FW, Ri, CARD, R } from "../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Card, SB, TB, Stat, Modal, Bar, FilterBar, SortHeader, BackBtn, ThemeToggle , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, DataTable, ListCard, ListDivider, ListGrid, glass } from "../components/ui";
import { STORY_STATUSES, STORY_AUTHORS } from "../constants";

const StoriesModule = ({ stories, setStories, pubs, issues, globalPageStories, setGlobalPageStories }) => {
  const [storySort, setStorySort] = useState({ col: "Page", dir: "asc" });
  const [sr, setSr] = useState("");
  const [fPub, setFPub] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [fAuthor, setFAuthor] = useState("all");
  const [fIssue, setFIssue] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const pn = id => pubs.find(p => p.id === id)?.name || "—";
  const pubColor = id => pubs.find(p => p.id === id)?.color || Z.tm;
  const authors = [...new Set(stories.map(s => s.author).concat(STORY_AUTHORS))].sort();
  const pubIssues = fPub !== "all" ? issues.filter(i => i.pubId === fPub && i.date >= "2026-03-01").slice(0, 24) : [];
  const categories = ["News", "Business", "Lifestyle", "Food", "Wine", "Culture", "Sports", "Opinion", "Events", "Community", "Outdoors", "Environment", "Real Estate", "Agriculture", "Marine", "Government", "Schools", "Travel"];
  const fl = stories.filter(s =>
    (sr === "" || s.title.toLowerCase().includes(sr.toLowerCase()) || s.author.toLowerCase().includes(sr.toLowerCase())) &&
    (fPub === "all" ? true : fPub === "none" ? !s.publication : s.publication === fPub) &&
    (fStatus === "all" || s.status === fStatus) &&
    (fAuthor === "all" || s.author === fAuthor) &&
    (fIssue === "all" ? true : fIssue === "past" ? (s.issueId && issues.find(i => i.id === s.issueId)?.date < new Date().toISOString().slice(0,10)) : s.issueId === fIssue)
  ).sort((a, b) => {
    const col = storySort.col; const dir = storySort.dir === "asc" ? 1 : -1;
    const va = col === "Title" ? a.title : col === "Author" ? a.author : col === "Publication" ? (pubs.find(p => p.id === a.publication)?.name || "") : col === "Status" ? a.status : col === "Page" ? (parseInt(String(a.page || "").split(/[,-]/)[0]) || 9999) : col === "Due" ? (a.dueDate || "9999") : col === "Words" ? (a.wordCount || 0) : col === "Section" ? (a.category || "") : "";
    const vb = col === "Title" ? b.title : col === "Author" ? b.author : col === "Publication" ? (pubs.find(p => p.id === b.publication)?.name || "") : col === "Status" ? b.status : col === "Page" ? (parseInt(String(b.page || "").split(/[,-]/)[0]) || 9999) : col === "Due" ? (b.dueDate || "9999") : col === "Words" ? (b.wordCount || 0) : col === "Section" ? (b.category || "") : "";
    if (typeof va === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });

  const upd = (id, field, val) => setStories(st => st.map(s => s.id === id ? { ...s, [field]: val } : s));
  const addNew = () => {
    const id = "s" + Date.now();
    const pub = fPub !== "all" ? fPub : pubs[0]?.id || "";
    setStories(st => [...st, { id, title: "", author: STORY_AUTHORS[0] || "", status: "Draft", publication: pub, assignedTo: "", dueDate: "", images: 0, wordCount: 0, category: "News", issueId: "" }]);
    setEditingId(id);
  };
  const remove = (id) => setStories(st => st.filter(s => s.id !== id));
  const clearFilters = () => { setFPub("all"); setFStatus("all"); setFAuthor("all"); setFIssue("all"); setSr(""); };
  const hasFilters = fPub !== "all" || fStatus !== "all" || fAuthor !== "all" || fIssue !== "all" || sr !== "";

  const cellS = { verticalAlign: "middle" };
  const inpS = { background: "transparent", border: "none", color: Z.tx, fontSize: FS.md, fontFamily: COND, outline: "none", width: "100%", boxSizing: "border-box", padding: "2px 0" };
  const selS = { ...inpS, cursor: "pointer", WebkitAppearance: "none", MozAppearance: "none", appearance: "none" };
  const isDk = Z.bg === "#08090D";

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="My Stories" count={fl.length}>
      <SB value={sr} onChange={setSr} placeholder="Search..." />
    </PageHeader>

    <TabRow>
      <TB tabs={["All", ...pubs.map(p => p.name), "None"]} active={fPub === "all" ? "All" : fPub === "none" ? "None" : pubs.find(p => p.id === fPub)?.name || "All"} onChange={v => { if (v === "All") { setFPub("all"); } else if (v === "None") { setFPub("none"); } else { setFPub(pubs.find(p => p.name === v)?.id || "all"); } setFIssue("all"); }} />
      {fPub !== "all" && fPub !== "none" && <><TabPipe /><TB tabs={["All Issues", ...issues.filter(i => i.pubId === fPub && i.date >= new Date().toISOString().slice(0,10)).sort((a,b) => a.date.localeCompare(b.date)).slice(0, 3).map(i => i.label + " · " + i.date.slice(5)), "Past"]} active={fIssue === "all" ? "All Issues" : fIssue === "past" ? "Past" : (() => { const iss = issues.find(i => i.id === fIssue); return iss ? iss.label + " · " + iss.date.slice(5) : "All Issues"; })()} onChange={v => { if (v === "All Issues") setFIssue("all"); else if (v === "Past") setFIssue("past"); else { const match = issues.find(i => i.pubId === fPub && (i.label + " · " + i.date.slice(5)) === v); if (match) setFIssue(match.id); } }} /></>}
      <TabPipe />
      <TB tabs={["All Status", ...STORY_STATUSES]} active={fStatus === "all" ? "All Status" : fStatus} onChange={v => setFStatus(v === "All Status" ? "all" : v)} />
    </TabRow>
    {/* MINI FLATPLAN — shows when filtered to single issue */}
    {fPub !== "all" && fIssue !== "all" && (() => {
      const mfIssue = issues.find(i => i.id === fIssue);
      const mfPub = pubs.find(p => p.id === fPub);
      if (!mfIssue || !mfPub) return null;
      const mfPages = Array.from({ length: mfIssue.pageCount || 16 }, (_, i) => i + 1);
      const getStories = (pg) => fl.filter(s => { const pages = String(s.page || "").split(/[,-]/).map(Number).filter(Boolean); if (String(s.page || "").includes("-")) { const [a, b] = String(s.page).split("-").map(Number); return pg >= a && pg <= b; } return pages.includes(pg); });
      return <div style={{ ...glass(), borderRadius: R, padding: CARD.pad, marginBottom: 8 }}>
        <div style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx, fontFamily: COND, marginBottom: 6 }}>{mfPub.name} — {mfIssue.label} Flatplan</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
          {mfPages.map(pg => {
            const pgStories = getStories(pg);
            const hasContent = pgStories.length > 0;
            return <div key={pg} style={{ width: 48, height: 56, border: `1px solid ${Z.bg === "#08090D" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.5)"}`, borderRadius: Ri, background: hasContent ? Z.as : Z.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: 2, overflow: "hidden", position: "relative" }}>
              <div style={{ fontSize: 9, fontWeight: FW.heavy, color: Z.td, marginBottom: 1 }}>{pg}</div>
              {pgStories.slice(0, 2).map(s => <div key={s.id} style={{ fontSize: 7, fontWeight: FW.bold, color: Z.ac, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%", textAlign: "center" }}>{s.title.slice(0, 12)}</div>)}
            </div>;
          })}
        </div>
      </div>;
    })()}
    <DataTable>
        <thead><tr>{["Title", "Author", "Publication", "Issue", "Section", "Status", "Web", "Page", "Due", "Words", "Imgs", ""].map(h => <th key={h} onClick={() => { if (!h) return; setStorySort(s => s.col === h ? { col: h, dir: s.dir === "asc" ? "desc" : "asc" } : { col: h, dir: "asc" }); }}>{h}{storySort.col === h && <span style={{ marginLeft: 3, fontSize: 9 }}>{storySort.dir === "asc" ? "▲" : "▼"}</span>}</th>)}</tr></thead>
        <tbody>
          {fl.length === 0 && <tr><td colSpan={11} style={{ padding: 20, textAlign: "center", color: Z.td }}>No stories match filters</td></tr>}
          {fl.map(s => {
            const isEd = editingId === s.id;
            const sPubIssues = issues.filter(i => i.pubId === s.publication && i.date >= "2026-03-01").slice(0, 24);
            return <tr key={s.id} onClick={() => { if (!isEd) setEditingId(s.id); }} style={{ cursor: "pointer", ...(isEd ? { outline: `2px solid ${isDk ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)"}`, outlineOffset: -1, background: isDk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)" } : {}) }}>
              <td style={cellS}>{isEd ? <input value={s.title} onChange={e => upd(s.id, "title", e.target.value)} placeholder="Story title..." autoFocus style={{ ...inpS, fontWeight: FW.bold }} /> : <span style={{ fontWeight: FW.bold, color: Z.tx }}>{s.title || <i style={{ color: Z.td }}>Untitled</i>}</span>}</td>
              <td style={cellS}>{isEd ? <select value={s.author} onChange={e => upd(s.id, "author", e.target.value)} style={selS}>{authors.map(a => <option key={a}>{a}</option>)}</select> : <span style={{ color: Z.tm }}>{s.author}</span>}</td>
              <td style={cellS}>{isEd ? <select value={s.publication} onChange={e => upd(s.id, "publication", e.target.value)} style={selS}>{pubs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: Ri, background: pubColor(s.publication), flexShrink: 0 }} /><span style={{ color: Z.tm }}>{pn(s.publication)}</span></span>}</td>
              <td style={cellS}>{isEd ? <select value={s.issueId || ""} onChange={e => upd(s.id, "issueId", e.target.value)} style={selS}><option value="">—</option>{sPubIssues.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}</select> : <span style={{ color: Z.tm, fontSize: FS.xs }}>{s.issueId ? issues.find(i => i.id === s.issueId)?.label || "—" : "—"}</span>}</td>
              <td style={cellS}>{isEd ? <select value={s.category} onChange={e => upd(s.id, "category", e.target.value)} style={selS}>{categories.map(c => <option key={c}>{c}</option>)}</select> : <span style={{ color: Z.tm }}>{s.category}</span>}</td>
              <td style={cellS}>{isEd ? <select value={s.status} onChange={e => upd(s.id, "status", e.target.value)} style={selS}>{STORY_STATUSES.map(st => <option key={st}>{st}</option>)}</select> : <Badge status={s.status} small />}</td>
              <td style={cellS}>{s.sentToWeb ? <span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.ac, background: Z.ss, borderRadius: Ri }}>✓ Sent</span> : <span style={{ fontSize: FS.xs, color: Z.td }}>—</span>}</td>
              <td style={cellS}>{isEd ? <input value={s.page || ""} onChange={e => upd(s.id, "page", e.target.value)} placeholder="—" style={{ ...inpS, width: 40, textAlign: "center" }} /> : <span style={{ color: s.page ? Z.ac : Z.td, fontSize: FS.sm, fontWeight: s.page ? 700 : 400 }}>{s.page || "—"}</span>}</td>
              <td style={cellS}>{isEd ? <input type="date" value={s.dueDate} onChange={e => upd(s.id, "dueDate", e.target.value)} style={inpS} /> : <span style={{ color: !s.dueDate ? Z.td : s.dueDate < "2026-03-22" ? Z.da : (s.dueDate === "2026-03-22" || s.dueDate === "2026-03-21") ? Z.wa : s.dueDate <= "2026-03-29" ? Z.su : Z.tm, fontSize: FS.xs, fontWeight: s.dueDate && s.dueDate <= "2026-03-22" ? 800 : 500 }}>{s.dueDate || "—"}</span>}</td>
              <td style={cellS}>{isEd ? <input type="number" value={s.wordCount} onChange={e => upd(s.id, "wordCount", +e.target.value)} style={{ ...inpS, width: 60 }} /> : <span style={{ color: Z.tm }}>{s.wordCount}</span>}</td>
              <td style={cellS}>{isEd ? <div style={{ textAlign: "center", color: Z.tx, fontSize: FS.xs, cursor: "pointer" }} onClick={e => { e.stopPropagation(); upd(s.id, "images", (s.images || 0) + 1); }}>+{s.images || 0}</div> : <span style={{ color: Z.tm }}>{s.images}</span>}</td>
              <td style={cellS}>{isEd && <div style={{ display: "flex", gap: 4 }}><button onClick={e => { e.stopPropagation(); setEditingId(null); }} style={{ background: Z.go, border: "none", borderRadius: Ri, padding: "4px 10px", cursor: "pointer", color: "#fff", fontSize: FS.xs, fontWeight: FW.bold }}>✓</button><button onClick={e => { e.stopPropagation(); if (window.confirm("Are you sure you want to delete this story?")) remove(s.id); }} style={{ background: Z.da, border: "none", borderRadius: Ri, padding: "4px 10px", cursor: "pointer", color: "#fff", fontSize: FS.xs, fontWeight: FW.bold }}>✕</button></div>}</td>
            </tr>;
          })}
        </tbody>
      </DataTable>
    <button onClick={addNew} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: Ri, border: `2px dashed ${Z.bd}`, background: "transparent", cursor: "pointer", color: Z.ac, fontSize: FS.base, fontWeight: FW.bold }}><Ic.plus size={14} /> New Story</button>
  </div>;
};


export default StoriesModule;
