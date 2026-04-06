import { useState, useRef } from "react";
import { Z, SC, COND, DISPLAY, FS, FW, Ri, CARD, R } from "../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Card, SB, TB, Stat, Modal, Bar, FilterBar, SortHeader, BackBtn, ThemeToggle , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, ListCard, ListDivider, ListGrid, glass } from "../components/ui";
import { ACTION_TYPES, MILESTONES } from "../constants";

const CalendarPage = ({ clients, sales, issues, pubs, onNavigate }) => {
  const [view, setView] = useState("week");
  const [selDate, setSelDate] = useState("2026-03-22");
  const [events, setEvents] = useState([]);
  const [schMo, setSchMo] = useState(false);
  const [schEvent, setSchEvent] = useState({ title: "", date: "2026-03-23", time: "10:00", duration: 30, clientId: "", type: "call", notes: "" });
  const [editEvId, setEditEvId] = useState(null);
  const [dayPopover, setDayPopover] = useState(null);
  const [calFilter, setCalFilter] = useState("all"); // "all", pub id, or event type
  const isDk = Z.bg === "#08090D";
  const cn = id => clients.find(c => c.id === id)?.name || "";
  const today = "2026-03-22";
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const workHours = hours.filter(h => h >= 7 && h <= 19);

  const allEvents = [
    ...sales.filter(s => s.nextAction && s.nextActionDate).map(s => {
      const at = typeof s.nextAction === "string" ? "task" : s.nextAction?.type || "task";
      return { id: "sa-" + s.id, date: s.nextActionDate, time: "09:00", duration: 30, type: "action", label: typeof s.nextAction === "string" ? s.nextAction : s.nextAction?.label || "", icon: ACTION_TYPES[at]?.icon || "✓", clientId: s.clientId, client: cn(s.clientId), color: ACTION_TYPES[at]?.color || Z.ac, saleId: s.id };
    }),
    ...issues.filter(i => i.date >= "2026-03-01" && i.date <= "2026-05-31").map(i => {
      const pub = pubs.find(p => p.id === i.pubId);
      return { id: "iss-" + i.id, date: i.date, time: "08:00", duration: 60, type: "issue", label: `${pub?.name} — ${i.label}`, icon: "📰", clientId: "", client: "", color: pub?.color || Z.pu };
    }),
    ...issues.filter(i => i.adDeadline && i.adDeadline >= "2026-03-01" && i.adDeadline <= "2026-05-31").map(i => {
      const pub = pubs.find(p => p.id === i.pubId);
      return { id: "ad-" + i.id, date: i.adDeadline, time: "17:00", duration: 30, type: "deadline", label: `${pub?.name} ${i.label} — Ad Deadline`, icon: "🔴", clientId: "", client: "", color: Z.da };
    }),
    ...issues.filter(i => i.edDeadline && i.edDeadline >= "2026-03-01" && i.edDeadline <= "2026-05-31").map(i => {
      const pub = pubs.find(p => p.id === i.pubId);
      return { id: "ed-" + i.id, date: i.edDeadline, time: "17:00", duration: 30, type: "deadline", label: `${pub?.name} ${i.label} — Ed Deadline`, icon: "🟣", clientId: "", client: "", color: Z.pu };
    }),
    ...events
  ];

  const selD = new Date(selDate + "T12:00:00");
  const monthLabel = selD.toLocaleString("en-US", { month: "long", year: "numeric" });
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const monday = new Date(selD); monday.setDate(selD.getDate() - ((selD.getDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d.toISOString().slice(0, 10); });

  const monthStart = new Date(selD.getFullYear(), selD.getMonth(), 1);
  const daysInMonth = new Date(selD.getFullYear(), selD.getMonth() + 1, 0).getDate();
  const firstDay = (monthStart.getDay() + 6) % 7;
  const monthDays = [];
  for (let i = 0; i < firstDay; i++) { const d = new Date(monthStart); d.setDate(d.getDate() - (firstDay - i)); monthDays.push(d.toISOString().slice(0, 10)); }
  for (let i = 1; i <= daysInMonth; i++) { const d = new Date(selD.getFullYear(), selD.getMonth(), i); monthDays.push(d.toISOString().slice(0, 10)); }
  while (monthDays.length < 42) { const d = new Date(monthStart); d.setDate(daysInMonth + (monthDays.length - firstDay - daysInMonth + 1)); monthDays.push(d.toISOString().slice(0, 10)); }

  const eventsForDate = (d) => allEvents.filter(e => {
    if (e.date !== d) return false;
    if (calFilter === "all") return true;
    if (calFilter === "deadlines") return e.type === "deadline";
    if (calFilter === "issues") return e.type === "issue";
    if (calFilter === "actions") return e.type === "action";
    if (calFilter === "custom") return !e.id.startsWith("sa-") && !e.id.startsWith("iss-") && !e.id.startsWith("ad-") && !e.id.startsWith("ed-");
    // Filter by pub id
    return e.id.includes(calFilter);
  });
  const nav = (delta) => { const d = new Date(selDate); d.setDate(d.getDate() + (view === "day" ? delta : view === "week" ? delta * 7 : delta * 30)); setSelDate(d.toISOString().slice(0, 10)); };

  const openNew = (date, time) => { setEditEvId(null); setSchEvent({ title: "", date: date || selDate, time: time || "10:00", duration: 30, clientId: "", type: "call", notes: "" }); setSchMo(true); setDayPopover(null); };
  const openEdit = (ev) => { if (ev.id.startsWith("sa-") || ev.id.startsWith("iss-")) return; setEditEvId(ev.id); setSchEvent({ title: ev.label, date: ev.date, time: ev.time || "10:00", duration: ev.duration || 30, clientId: ev.clientId || "", type: ev.type || "call", notes: ev.notes || "" }); setSchMo(true); };
  const saveEvent = () => {
    if (!schEvent.title.trim()) return;
    if (editEvId) { setEvents(ev => ev.map(e => e.id === editEvId ? { ...e, label: schEvent.title, date: schEvent.date, time: schEvent.time, duration: schEvent.duration, clientId: schEvent.clientId, type: schEvent.type, notes: schEvent.notes, icon: ACTION_TYPES[schEvent.type]?.icon || "📅", color: ACTION_TYPES[schEvent.type]?.color || Z.ac, client: cn(schEvent.clientId) } : e)); }
    else { setEvents(ev => [...ev, { id: "ev" + Date.now(), date: schEvent.date, time: schEvent.time, duration: schEvent.duration, type: schEvent.type, label: schEvent.title, icon: ACTION_TYPES[schEvent.type]?.icon || "📅", clientId: schEvent.clientId, client: cn(schEvent.clientId), color: ACTION_TYPES[schEvent.type]?.color || Z.ac, notes: schEvent.notes }]); }
    setSchMo(false);
  };
  const deleteEvent = () => { if (editEvId) setEvents(ev => ev.filter(e => e.id !== editEvId)); setSchMo(false); };

  const weekEvents = allEvents.filter(e => weekDays.includes(e.date)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

  return <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "calc(100vh - 60px)" }}>
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <PageHeader title="My Calendar">
        <Sel value={calFilter} onChange={e => setCalFilter(e.target.value)} options={[{ value: "all", label: "All Events" }, { value: "deadlines", label: "Deadlines" }, { value: "issues", label: "Publish Dates" }, { value: "actions", label: "Sales Actions" }, { value: "custom", label: "My Events" }, ...pubs.map(p => ({ value: p.id, label: p.name }))]} />
        <Btn sm onClick={() => openNew()}>+ Event</Btn>
      </PageHeader>
      <TabRow>
        <Btn sm v="secondary" onClick={() => nav(-1)}>‹</Btn>
        <span style={{ fontSize: 15, fontWeight: FW.heavy, color: Z.tx, minWidth: 160, textAlign: "center", margin: "0 4px" }}>{monthLabel}</span>
        <Btn sm v="secondary" onClick={() => nav(1)}>›</Btn>
        <TabPipe />
        <TB tabs={["Day", "Week", "Month"]} active={view === "day" ? "Day" : view === "week" ? "Week" : "Month"} onChange={v => { setView(v.toLowerCase()); setDayPopover(null); }} />
      </TabRow>
    </div>

    {/* DAY VIEW */}
    {view === "day" && <GlassCard style={{ flex: 1, display: "flex", gap: 12, overflow: "hidden", padding: CARD.pad }}>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx, marginBottom: 8 }}>{new Date(selDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
        <div style={{ position: "relative", minHeight: workHours.length * 60 }}>
          {workHours.map(h => <div key={h} style={{ position: "absolute", top: (h - 7) * 60, left: 0, right: 0, height: 60, borderTop: `1px solid ${Z.bd}`, display: "flex" }}>
            <div style={{ width: 50, fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm, paddingTop: 2 }}>{h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}</div>
            <div onClick={() => openNew(selDate, `${String(h).padStart(2,"0")}:00`)} onDragOver={e => e.preventDefault()} onDrop={e => { const eid = e.dataTransfer.getData("text/plain"); if (eid) { setEvents(ev => ev.map(x => x.id === eid ? { ...x, date: selDate, time: `${String(h).padStart(2,"0")}:00` } : x)); } }} style={{ flex: 1, position: "relative", cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(75,139,245,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div onClick={e => { e.stopPropagation(); openNew(selDate, `${String(h).padStart(2,"0")}:30`); }} style={{ position: "absolute", top: 30, left: 0, right: 0, height: 30, borderTop: `1px dashed ${Z.bd}30`, cursor: "pointer" }} />
            </div>
          </div>)}
          {eventsForDate(selDate).map(ev => {
            const [eh, em] = (ev.time || "09:00").split(":").map(Number);
            const top = (eh - 7) * 60 + em;
            return <div key={ev.id} draggable onDragStart={e => e.dataTransfer.setData("text/plain", ev.id)} onClick={() => openEdit(ev)} style={{ position: "absolute", top: Math.max(0, top), left: 56, right: 8, height: Math.max(24, (ev.duration || 30)), background: `${ev.color}20`, border: `1px solid ${ev.color}50`, borderRadius: Ri, padding: "3px 8px", cursor: "grab", zIndex: 2 }}>
              <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: ev.color }}>{ev.icon} {ev.label}</div>
              {ev.client && <div style={{ fontSize: FS.sm, color: Z.tm }}>{ev.client}</div>}
            </div>;
          })}
        </div>
      </div>
    </GlassCard>}

    {/* WEEK VIEW — time grid */}
    {view === "week" && <GlassCard style={{ flex: 1, display: "flex", gap: 0, overflow: "hidden", padding: 0 }}>
      {/* Time axis */}
      <div style={{ width: 50, flexShrink: 0, overflowY: "auto", borderRight: `1px solid ${Z.bd}` }}>
        <div style={{ height: 36 }} />
        {workHours.map(h => <div key={h} style={{ height: 60, display: "flex", alignItems: "flex-start", paddingTop: 2 }}><span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.tm }}>{h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h-12}p`}</span></div>)}
      </div>
      {/* Day columns */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", overflow: "auto" }}>
        {weekDays.map((d, i) => { const isToday = d === today; const dayEvts = eventsForDate(d);
          return <div key={d} style={{ borderRight: `1px solid ${Z.bd}`, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "6px 4px", textAlign: "center", borderBottom: `1px solid ${Z.bd}`, position: "sticky", top: 0, ...glass(), zIndex: 3 }}>
              <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.tm }}>{dayNames[i]}</div>
              <div style={{ fontSize: FS.lg, fontWeight: FW.heavy, color: isToday ? Z.ac : Z.tx }}>{d.slice(8)}</div>
            </div>
            <div style={{ position: "relative", flex: 1, minHeight: workHours.length * 60 }}>
              {workHours.map(h => <div key={h} onClick={() => openNew(d, `${String(h).padStart(2,"0")}:00`)} onDragOver={e => e.preventDefault()} onDrop={e => { const eid = e.dataTransfer.getData("text/plain"); if (eid) { setEvents(ev => ev.map(x => x.id === eid ? { ...x, date: d, time: `${String(h).padStart(2,"0")}:00` } : x)); } }} style={{ position: "absolute", top: (h - 7) * 60, left: 0, right: 0, height: 60, borderTop: `1px solid ${Z.bd}15`, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(75,139,245,0.04)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><div onClick={e => { e.stopPropagation(); openNew(d, `${String(h).padStart(2,"0")}:30`); }} style={{ position: "absolute", top: 30, left: 0, right: 0, height: 30, borderTop: `1px dashed ${Z.bd}10`, cursor: "pointer" }} />
                </div>)}
              {dayEvts.map(ev => {
                const [eh, em] = (ev.time || "09:00").split(":").map(Number);
                const top = (eh - 7) * 60 + em;
                return <div key={ev.id} draggable onDragStart={e => e.dataTransfer.setData("text/plain", ev.id)} onClick={() => openEdit(ev)} style={{ position: "absolute", top: Math.max(0, top), left: 2, right: 2, height: Math.max(20, (ev.duration || 30) * 0.8), background: `${ev.color}25`, border: `1px solid ${ev.color}50`, borderRadius: Ri, padding: "2px 4px", cursor: "grab", zIndex: 2, overflow: "hidden" }}>
                  <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: ev.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.icon} {ev.label}</div>
                </div>;
              })}
            </div>
          </div>; })}
      </div>
    </GlassCard>}

    {/* MONTH VIEW */}
    {view === "month" && <GlassCard noPad style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0, position: "sticky", top: 0, ...glass(), zIndex: 2 }}>{dayNames.map(d => <div key={d} style={{ textAlign: "center", fontSize: FS.sm, fontWeight: FW.bold, color: Z.tm, padding: "6px 4px", borderBottom: `1px solid ${Z.bd}` }}>{d}</div>)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridTemplateRows: "repeat(6, 1fr)", flex: 1, overflow: "hidden" }}>{monthDays.map(d => { const dayEvts = eventsForDate(d); const isToday = d === today; const isCurrentMonth = d.slice(5, 7) === selDate.slice(5, 7);
        return <div key={d} onClick={() => setDayPopover(dayPopover === d ? null : d)} style={{ background: isCurrentMonth ? "transparent" : isDk ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.03)", borderRight: `1px solid ${isDk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, borderBottom: `1px solid ${isDk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, padding: 4, position: "relative", cursor: "pointer", overflow: "hidden" }}>
          <div style={{ fontSize: FS.sm, fontWeight: FW.bold, color: isToday ? Z.ac : isCurrentMonth ? Z.tx : Z.td, marginBottom: 2 }}>{parseInt(d.slice(8))}</div>
          {dayEvts.slice(0, 3).map(e => <div key={e.id} onClick={ev => { ev.stopPropagation(); openEdit(e); }} style={{ fontSize: FS.xs, padding: "1px 3px", background: `${e.color}15`, borderRadius: R, marginBottom: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: e.color, cursor: "pointer" }}>{e.icon} {e.label}</div>)}
          {dayEvts.length > 3 && <div style={{ fontSize: FS.xs, color: Z.td }}>+{dayEvts.length - 3}</div>}
          {/* Day click popover */}
          {dayPopover === d && <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: "100%", left: 0, zIndex: 10, ...glass(), borderRadius: R, padding: CARD.pad, boxShadow: "0 4px 12px rgba(0,0,0,0.3)", minWidth: 120 }}>
            <button onClick={() => openNew(d)} style={{ display: "block", width: "100%", padding: "6px 10px", background: "none", border: "none", cursor: "pointer", fontSize: FS.sm, fontWeight: FW.bold, color: Z.ac, textAlign: "left", borderRadius: Ri }} onMouseEnter={e => e.currentTarget.style.background = Z.sa} onMouseLeave={e => e.currentTarget.style.background = "none"}>+ Add Event</button>
            <button onClick={() => { setSelDate(d); setView("day"); setDayPopover(null); }} style={{ display: "block", width: "100%", padding: "6px 10px", background: "none", border: "none", cursor: "pointer", fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, textAlign: "left", borderRadius: Ri }} onMouseEnter={e => e.currentTarget.style.background = Z.sa} onMouseLeave={e => e.currentTarget.style.background = "none"}>View Day</button>
            <button onClick={() => { setSelDate(d); setView("week"); setDayPopover(null); }} style={{ display: "block", width: "100%", padding: "6px 10px", background: "none", border: "none", cursor: "pointer", fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx, textAlign: "left", borderRadius: Ri }} onMouseEnter={e => e.currentTarget.style.background = Z.sa} onMouseLeave={e => e.currentTarget.style.background = "none"}>View Week</button>
          </div>}
        </div>; })}</div>
    </GlassCard>}
    {view !== "month" && <div style={{ flexShrink: 0, maxHeight: "35vh", overflowY: "auto", display: "flex", gap: 10 }}>
      {/* MY DAY */}
      <div style={{ flex: 1, ...glass(), borderRadius: R, border: `1px solid ${Z.bd}`, padding: 10 }}>
        <div style={{ fontSize: FS.xs, fontWeight: FW.black, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>My Day</div>
        {eventsForDate(today).length === 0 ? <div style={{ fontSize: FS.sm, color: Z.td, padding: 4 }}>Nothing scheduled</div>
        : eventsForDate(today).sort((a,b) => (a.time||"").localeCompare(b.time||"")).map(e => <div key={e.id} onClick={() => openEdit(e)} style={{ padding: "5px 8px", borderRadius: Ri, cursor: "pointer", marginBottom: 3, background: Z.bg }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{e.label}</span><span style={{ fontSize: FS.xs, color: Z.tm }}>{e.time}</span></div>
          {e.client && <div style={{ fontSize: FS.xs, color: Z.ac }}>{e.client}</div>}
        </div>)}
      </div>
      {/* PREP TOMORROW */}
      <div style={{ flex: 1, ...glass(), borderRadius: R, border: `1px solid ${Z.bd}`, padding: 10 }}>
        <div style={{ fontSize: FS.xs, fontWeight: FW.black, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Prep for Tomorrow</div>
        {(() => { const tom = new Date(); tom.setDate(tom.getDate() + 1); const ts = tom.toISOString().slice(0,10); const tevs = eventsForDate(ts).sort((a,b) => (a.time||"").localeCompare(b.time||"")); return tevs.length === 0 ? <div style={{ fontSize: FS.sm, color: Z.td, padding: 4 }}>Clear schedule</div> : tevs.map(e => <div key={e.id} style={{ padding: "6px 10px", borderRadius: Ri, marginBottom: 2, background: Z.bg }}><span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{e.label}</span>{e.client && <span style={{ fontSize: FS.xs, color: Z.tm, marginLeft: 4 }}>{e.client}</span>}<span style={{ fontSize: FS.xs, color: Z.td, display: "block" }}>{e.time}</span></div>); })()}
      </div>
      {/* THIS WEEK MILESTONES */}
      <div style={{ flex: 1, ...glass(), borderRadius: R, border: `1px solid ${Z.bd}`, padding: 10 }}>
        <div style={{ fontSize: FS.xs, fontWeight: FW.black, color: Z.td, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>This Week</div>
        {(() => { const ms = issues.filter(i => weekDays.includes(i.adDeadline) || weekDays.includes(i.edDeadline) || weekDays.includes(i.date)); return ms.length === 0 ? <div style={{ fontSize: FS.sm, color: Z.td, padding: 4 }}>No milestones</div> : ms.map(i => { const pub = pubs.find(p => p.id === i.pubId); return <div key={i.id} onClick={() => onNavigate && onNavigate("flatplan")} style={{ padding: "6px 10px", borderRadius: Ri, cursor: "pointer", marginBottom: 2, background: Z.bg }}><span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, fontFamily: COND }}>{pub?.name} {i.label}</span>{weekDays.includes(i.adDeadline) && <div style={{ fontSize: FS.xs, color: Z.da }}>Ad close {i.adDeadline?.slice(5)}</div>}{weekDays.includes(i.date) && <div style={{ fontSize: FS.xs, color: Z.ac }}>Publishes {i.date.slice(5)}</div>}</div>; }); })()}
      </div>
    </div>}

    {/* Scheduler modal */}
    <Modal open={schMo} onClose={() => setSchMo(false)} title={editEvId ? "Edit Event" : "New Event"} width={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Inp label="Title" value={schEvent.title} onChange={e => setSchEvent(x => ({ ...x, title: e.target.value }))} placeholder="e.g. Follow-up call" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <Inp label="Date" type="date" value={schEvent.date} onChange={e => setSchEvent(x => ({ ...x, date: e.target.value }))} />
          <Inp label="Time" type="time" value={schEvent.time} onChange={e => setSchEvent(x => ({ ...x, time: e.target.value }))} />
          <Sel label="Duration" value={schEvent.duration} onChange={e => setSchEvent(x => ({ ...x, duration: +e.target.value }))} options={[{value:15,label:"15 min"},{value:30,label:"30 min"},{value:45,label:"45 min"},{value:60,label:"1 hour"},{value:90,label:"1.5 hrs"}]} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Sel label="Type" value={schEvent.type} onChange={e => setSchEvent(x => ({ ...x, type: e.target.value }))} options={Object.entries(ACTION_TYPES).map(([k, v]) => ({ value: k, label: `${v.icon} ${v.label}` }))} />
          <Sel label="Client" value={schEvent.clientId} onChange={e => setSchEvent(x => ({ ...x, clientId: e.target.value }))} options={[{ value: "", label: "None" }, ...clients.map(c => ({ value: c.id, label: c.name }))]} />
        </div>
        <TA label="Notes" value={schEvent.notes} onChange={e => setSchEvent(x => ({ ...x, notes: e.target.value }))} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {editEvId && <Btn v="secondary" onClick={deleteEvent} style={{ marginRight: "auto", color: Z.da }}>Delete</Btn>}
          <Btn v="secondary" onClick={() => setSchMo(false)}>Cancel</Btn>
          <Btn onClick={saveEvent}>{editEvId ? "Save Changes" : "Create Event"}</Btn>
        </div>
      </div>
    </Modal>
  </div>;
};

export default CalendarPage;
