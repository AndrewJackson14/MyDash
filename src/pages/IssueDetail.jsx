import { useState, useRef } from "react";
import { Z, SC, COND, DISPLAY, FS, FW, Ri } from "../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Card, SB, TB, Stat, Modal, Bar, FilterBar, SortHeader, BackBtn, ThemeToggle , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, ListCard, ListDivider, ListGrid, glass } from "../components/ui";

const IssueDetail = ({ issueId, pubs, issues, sales, stories, clients, onBack, onNavigate }) => {
  const serif = "'Playfair Display',Georgia,serif";
  const issue = issues.find(i => i.id === issueId);
  if (!issue) return <div style={{ padding: 20, color: Z.td }}>Issue not found. <button onClick={onBack} style={{ background: "none", border: "none", color: Z.ac, cursor: "pointer", fontWeight: FW.bold }}>← Back</button></div>;
  const pub = pubs.find(p => p.id === issue.pubId);
  const cn = id => clients.find(c => c.id === id)?.name || "—";
  const today = new Date().toISOString().slice(0, 10);
  const daysUntil = (d) => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null;

  const issSales = sales.filter(s => s.issueId === issueId);
  const closedAds = issSales.filter(s => s.status === "Closed");
  const pipelineAds = issSales.filter(s => !["Closed", "Follow-up"].includes(s.status));
  const totalSlots = Math.floor((pub?.pageCount || 24) * 0.4);
  const adRev = closedAds.reduce((s, x) => s + (x.amount || 0), 0);
  const adPct = totalSlots > 0 ? Math.round((closedAds.length / totalSlots) * 100) : 0;
  const openSlots = Math.max(0, totalSlots - closedAds.length);

  const issStories = stories.filter(s => s.publication === issue.pubId);
  const needsWork = issStories.filter(s => ["Assigned", "Draft", "Needs Editing"].includes(s.status));
  const inEditing = issStories.filter(s => ["Edited"].includes(s.status));
  const ready = issStories.filter(s => ["Approved", "On Page", "Sent to Web"].includes(s.status));
  const editPct = issStories.length > 0 ? Math.round((ready.length / issStories.length) * 100) : 0;

  // What needs to happen — blocking items
  const blockers = [];
  if (openSlots > 0) blockers.push({ text: `${openSlots} open ad slots — alert sales team`, color: Z.wa, action: "Go to sales", page: "sales" });
  needsWork.forEach(s => blockers.push({ text: `"${s.title}" — ${s.status}${s.dueDate ? ", due " + s.dueDate.slice(5) : ""}`, color: s.dueDate && s.dueDate <= today ? Z.da : Z.wa, action: "Open editorial", page: "editorial" }));
  if (issStories.length === 0) blockers.push({ text: "No stories assigned to this issue", color: Z.tm, action: "Assign stories", page: "stories" });

  return <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "calc(100vh - 100px)", overflow: "hidden" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: Z.ac, fontSize: FS.md, fontWeight: FW.bold, fontFamily: COND }}>← Back</button>
        <div>
          <h2 style={{ margin: 0, fontSize: FS.title, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>My Issue of <span style={{ color: pub?.color }}>{pub?.name}</span></h2>
          <div style={{ fontSize: FS.md, color: Z.tm, fontFamily: COND }}>{issue.label} — publishes {issue.date}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {[["Ad Close", issue.adDeadline, Z.da], ["Ed Close", issue.edDeadline, Z.pu], ["Publish", issue.date, Z.ac]].map(([l, d, c]) => d ? <div key={l} style={{ padding: "6px 12px", ...glass(), borderRadius: Ri, textAlign: "center" }}><div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: FS.lg, fontWeight: FW.black, color: daysUntil(d) <= 3 ? Z.da : c, fontFamily: serif }}>{daysUntil(d)}d</div></div> : null)}
        <Btn sm v="secondary" onClick={() => onNavigate("flatplan")}>View Flatplan</Btn>
      </div>
    </div>

    {/* PROGRESS STRIP */}
    <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
      {[["Ads", adPct, `${closedAds.length}/${totalSlots}`, Z.ac], ["Editorial", editPct, `${ready.length}/${issStories.length}`, Z.pu], ["Revenue", 100, "$" + adRev.toLocaleString(), Z.ac]].map(([l, p, sub, c]) => <div key={l} style={{ flex: 1, ...glass(), borderRadius: Ri, padding: "10px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}><span style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase" }}>{l}</span><span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: c }}>{sub}</span></div>
        {l !== "Revenue" && <div style={{ height: 5, background: Z.bg, borderRadius: Ri }}><div style={{ height: "100%", borderRadius: Ri, width: `${p}%`, background: p >= 80 ? Z.ac : p >= 50 ? Z.wa : Z.tm }} /></div>}
      </div>)}
    </div>

    {/* TWO COLUMNS */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, flex: 1, overflow: "hidden" }}>
      {/* LEFT: What Needs to Happen + Ad Sales */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
        {blockers.length > 0 && <div>
          <div style={{ fontSize: FS.md, fontWeight: FW.black, color: Z.tx, fontFamily: serif, marginBottom: 4 }}>What Needs to Happen</div>
          {blockers.slice(0, 5).map((b, i) => <div key={i} onClick={() => onNavigate(b.page)} style={{ padding: "10px 14px", ...glass(), borderRadius: Ri, cursor: "pointer", marginBottom: 3 }}>
            <div style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{b.text}</div>
          </div>)}
        </div>}
        <div>
          <div style={{ fontSize: FS.md, fontWeight: FW.black, color: Z.tx, fontFamily: serif, marginBottom: 4 }}>Ad Sales ({closedAds.length + pipelineAds.length})</div>
          {closedAds.map(s => <div key={s.id} style={{ padding: "10px 14px", background: Z.bg, borderRadius: Ri, marginBottom: 2 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx }}>{cn(s.clientId)}</span><span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.ac }}>${(s.amount||0).toLocaleString()}</span></div><div style={{ fontSize: FS.xs, color: Z.tm }}>{s.type} · Confirmed</div></div>)}
          {pipelineAds.map(s => <div key={s.id} style={{ padding: "10px 14px", background: Z.ws, borderRadius: Ri, marginBottom: 2 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{cn(s.clientId)}</span><span style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.wa }}>${(s.amount||0).toLocaleString()}</span></div><div style={{ fontSize: FS.xs, color: Z.tm }}>{s.type} · {s.status}</div></div>)}
          {openSlots > 0 && <div style={{ padding: "10px 14px", border: `1px dashed ${Z.bd}`, borderRadius: Ri, textAlign: "center", color: Z.td, fontSize: FS.sm }}>{openSlots} slots available</div>}
        </div>
      </div>

      {/* RIGHT: Editorial + Design */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
        <div>
          <div style={{ fontSize: FS.md, fontWeight: FW.black, color: Z.tx, fontFamily: serif, marginBottom: 4 }}>Editorial ({issStories.length})</div>
          {[{ label: "Ready", items: ready, color: Z.ac }, { label: "In Editing", items: inEditing, color: Z.wa }, { label: "Needs Work", items: needsWork, color: Z.da }].map(g => g.items.length === 0 ? null : <div key={g.label}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: g.color, letterSpacing: 0.8, textTransform: "uppercase", padding: "4px 0 2px" }}>{g.label} ({g.items.length})</div>
            {g.items.map(s => <div key={s.id} onClick={() => onNavigate("editorial")} style={{ padding: "5px 8px", background: Z.bg, borderRadius: Ri, marginBottom: 2, cursor: "pointer", borderLeft: `2px solid ${g.color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{s.title}</span><Badge status={s.status} small /></div>
              <div style={{ fontSize: FS.xs, color: Z.tm }}>{s.author}{s.dueDate ? ` · due ${s.dueDate.slice(5)}` : ""}</div>
            </div>)}
          </div>)}
          {issStories.length === 0 && <div style={{ padding: 10, color: Z.td, fontSize: FS.base, textAlign: "center" }}>No stories assigned</div>}
        </div>
        <div>
          <div style={{ fontSize: FS.md, fontWeight: FW.black, color: Z.tx, fontFamily: serif, marginBottom: 4 }}>Design & Production</div>
          <div style={{ padding: "10px 14px", background: Z.bg, borderRadius: Ri, fontSize: FS.base, color: Z.tm }}>{pub?.pageCount || 0} pages · {closedAds.length} ads placed</div>
          <button onClick={() => onNavigate("flatplan")} style={{ marginTop: 4, padding: "6px 12px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sa, color: Z.ac, cursor: "pointer", fontSize: FS.sm, fontWeight: FW.bold, fontFamily: COND, width: "100%" }}>Open Flatplan →</button>
        </div>
      </div>
    </div>
  </div>;
};


export default IssueDetail;
