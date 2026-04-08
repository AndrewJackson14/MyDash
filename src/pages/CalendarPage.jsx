import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../lib/theme";
import { Ic, Btn, Sel, Modal, Inp, TA, PageHeader, GlassCard, TabRow, TB } from "../components/ui";
import { supabase, isOnline } from "../lib/supabase";

const GCAL_URL = "https://hqywacyhpllapdwccmaw.supabase.co/functions/v1/gcal-api";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 7);

const EVENT_TYPES = {
  google: { label: "Google Calendar", icon: "\u{1F4C5}" },
  publish: { label: "Publish Date", icon: "\u{1F4F0}" },
  adDeadline: { label: "Ad Deadline", icon: "\u{1F534}" },
  edDeadline: { label: "Ed Deadline", icon: "\u{1F7E3}" },
  salesAction: { label: "Sales Action", icon: "\u{1F4B0}" },
  storyDue: { label: "Story Due", icon: "\u{1F4DD}" },
  custom: { label: "Custom", icon: "\u2B50" },
};

const ROLE_FILTERS = {
  Publisher: ["google", "publish", "adDeadline", "edDeadline", "salesAction", "storyDue", "custom"],
  "Editor-in-Chief": ["google", "publish", "edDeadline", "storyDue", "custom"],
  "Managing Editor": ["google", "publish", "edDeadline", "storyDue", "custom"],
  Editor: ["google", "edDeadline", "storyDue", "custom"],
  "Writer/Reporter": ["google", "storyDue", "custom"],
  "Sales Manager": ["google", "adDeadline", "salesAction", "custom"],
  Salesperson: ["google", "adDeadline", "salesAction", "custom"],
  "Office Manager": ["google", "publish", "adDeadline", "edDeadline", "custom"],
  "Production Manager": ["google", "publish", "adDeadline", "custom"],
  Finance: ["google", "adDeadline", "custom"],
};
const ALL_TYPES = Object.keys(EVENT_TYPES);
const getDefaultFilters = (role) => ROLE_FILTERS[role] || ALL_TYPES;

const toISO = (d) => d.toISOString().slice(0, 10);
const toDay = (s) => new Date(s + "T12:00:00");
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const startOfWeek = (d) => { const r = new Date(d); r.setDate(r.getDate() - r.getDay()); return r; };
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const isSameDay = (a, b) => toISO(a) === toISO(b);
const fmtTime = (h) => `${h % 12 || 12} ${h >= 12 ? "PM" : "AM"}`;
const fmtDateShort = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtDateFull = (d) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

const pn = (pubs, id) => pubs.find(p => p.id === id)?.name || "";
const pubColor = (pubs, id) => pubs.find(p => p.id === id)?.color || Z.tm;

const Dot = ({ color }) => <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />;

const CalendarPage = ({ clients, sales, issues, pubs, team, currentUser, stories, bus, onNavigate }) => {
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState("month");
  const [selectedDate, setSelectedDate] = useState(today);
  const [fPub, setFPub] = useState("all");
  const [activeTypes, setActiveTypes] = useState(() => getDefaultFilters(currentUser?.role));
  const [googleEvents, setGoogleEvents] = useState([]);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [customEvents, setCustomEvents] = useState([]);
  const [eventModal, setEventModal] = useState(false);
  const [eventForm, setEventForm] = useState({ title: "", date: toISO(today), time: "09:00", endTime: "10:00", notes: "" });
  const [detailEvent, setDetailEvent] = useState(null);

  const selMonth = selectedDate.getMonth();
  const selYear = selectedDate.getFullYear();

  // Fetch Google Calendar events
  const fetchGoogleEvents = useCallback(async (rangeStart, rangeEnd) => {
    if (!isOnline()) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      setGoogleLoading(true);
      const res = await fetch(GCAL_URL, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "x-action": "list-events",
          "x-time-min": rangeStart.toISOString(),
          "x-time-max": rangeEnd.toISOString(),
          "x-max-results": "500",
        },
      });
      if (res.ok) {
        const data = await res.json();
        setGoogleEvents((data.events || []).map(e => ({
          id: "g-" + e.id, googleId: e.id,
          title: e.summary || "(No title)",
          date: e.start?.date || e.start?.dateTime?.slice(0, 10) || "",
          time: e.start?.dateTime?.slice(11, 16) || "",
          endTime: e.end?.dateTime?.slice(11, 16) || "",
          allDay: !!e.start?.date, type: "google",
          notes: e.description || "", location: e.location || "", color: Z.ac,
        })));
        setGoogleConnected(true);
      }
    } catch (e) { console.warn("Google Calendar fetch:", e.message); }
    setGoogleLoading(false);
  }, []);

  useEffect(() => {
    fetchGoogleEvents(addDays(startOfMonth(selectedDate), -7), addDays(endOfMonth(selectedDate), 14));
  }, [selMonth, selYear]);

  useEffect(() => {
    if (!isOnline()) return;
    supabase.from("calendar_events").select("*").order("date").then(({ data }) => {
      if (data) setCustomEvents(data.map(e => ({
        id: "ce-" + e.id, dbId: e.id, title: e.title, date: e.date,
        time: e.start_time || "09:00", endTime: e.end_time || "10:00",
        type: "custom", notes: e.notes || "", color: Z.ac,
        googleEventId: e.google_event_id,
      })));
    });
  }, []);

  // Build all events
  const allEvents = useMemo(() => {
    const evts = [];
    if (activeTypes.includes("google")) evts.push(...googleEvents);
    if (activeTypes.includes("publish")) {
      (issues || []).forEach(iss => {
        if (!iss.date || (fPub !== "all" && iss.pubId !== fPub)) return;
        evts.push({ id: "pub-" + iss.id, title: `${pn(pubs, iss.pubId)} \u2014 ${iss.label}`, date: iss.date, time: "08:00", type: "publish", color: pubColor(pubs, iss.pubId) });
      });
    }
    if (activeTypes.includes("adDeadline")) {
      (issues || []).forEach(iss => {
        if (!iss.adDeadline || (fPub !== "all" && iss.pubId !== fPub)) return;
        evts.push({ id: "ad-" + iss.id, title: `Ad Deadline \u2014 ${pn(pubs, iss.pubId)} ${iss.label}`, date: iss.adDeadline, time: "17:00", type: "adDeadline", color: Z.da });
      });
    }
    if (activeTypes.includes("edDeadline")) {
      (issues || []).forEach(iss => {
        if (!iss.edDeadline || (fPub !== "all" && iss.pubId !== fPub)) return;
        evts.push({ id: "ed-" + iss.id, title: `Ed Deadline \u2014 ${pn(pubs, iss.pubId)} ${iss.label}`, date: iss.edDeadline, time: "17:00", type: "edDeadline", color: Z.pu });
      });
    }
    if (activeTypes.includes("salesAction")) {
      (sales || []).filter(s => s.nextActionDate && s.nextAction).forEach(s => {
        evts.push({ id: "sa-" + s.id, title: `${typeof s.nextAction === "object" ? s.nextAction.label : s.nextAction} \u2014 ${(clients || []).find(c => c.id === s.clientId)?.name || ""}`, date: s.nextActionDate, time: "09:00", type: "salesAction", color: Z.wa });
      });
    }
    if (activeTypes.includes("storyDue")) {
      (stories || []).filter(s => s.dueDate && s.status !== "Published").forEach(s => {
        evts.push({ id: "st-" + s.id, title: `Story Due \u2014 ${s.title}`, date: s.dueDate, time: "12:00", type: "storyDue", color: Z.pu });
      });
    }
    if (activeTypes.includes("custom")) evts.push(...customEvents);
    return evts;
  }, [googleEvents, customEvents, issues, sales, stories, clients, pubs, fPub, activeTypes]);

  const eventsForDate = useCallback((d) => {
    const ds = toISO(d);
    return allEvents.filter(e => e.date === ds).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  }, [allEvents]);

  const goToday = () => setSelectedDate(new Date());
  const goPrev = () => {
    if (view === "month") setSelectedDate(new Date(selYear, selMonth - 1, 1));
    else if (view === "week") setSelectedDate(addDays(selectedDate, -7));
    else setSelectedDate(addDays(selectedDate, -1));
  };
  const goNext = () => {
    if (view === "month") setSelectedDate(new Date(selYear, selMonth + 1, 1));
    else if (view === "week") setSelectedDate(addDays(selectedDate, 7));
    else setSelectedDate(addDays(selectedDate, 1));
  };
  const toggleType = (type) => setActiveTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);

  const saveEvent = async () => {
    if (!eventForm.title) return;
    const dbRow = { title: eventForm.title, date: eventForm.date, start_time: eventForm.time, end_time: eventForm.endTime, notes: eventForm.notes, type: "custom", created_by: currentUser?.id || null };
    if (isOnline()) {
      const { data } = await supabase.from("calendar_events").insert(dbRow).select().single();
      if (data) {
        setCustomEvents(prev => [...prev, { id: "ce-" + data.id, dbId: data.id, title: data.title, date: data.date, time: data.start_time || "09:00", endTime: data.end_time || "10:00", type: "custom", notes: data.notes || "", color: Z.ac }]);
        if (googleConnected) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(GCAL_URL, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json", "x-action": "push-event" }, body: JSON.stringify({ title: eventForm.title, date: eventForm.date, time: eventForm.time, endTime: eventForm.endTime, notes: eventForm.notes }) });
            if (res.ok) { const g = await res.json(); await supabase.from("calendar_events").update({ google_event_id: g.googleEventId }).eq("id", data.id); }
          } catch (e) { console.warn("Push to Google Calendar failed:", e.message); }
        }
      }
    }
    setEventModal(false);
    setEventForm({ title: "", date: toISO(today), time: "09:00", endTime: "10:00", notes: "" });
  };

  const deleteEvent = async (evt) => {
    if (!evt.dbId) return;
    if (isOnline()) {
      await supabase.from("calendar_events").delete().eq("id", evt.dbId);
      if (evt.googleEventId && googleConnected) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          await fetch(GCAL_URL, { method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}`, "x-action": "delete-event", "x-event-id": evt.googleEventId } });
        } catch (e) { console.warn("Delete from Google Calendar failed:", e.message); }
      }
    }
    setCustomEvents(prev => prev.filter(e => e.dbId !== evt.dbId));
    setDetailEvent(null);
  };

  const headerLabel = view === "month"
    ? selectedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : view === "week"
      ? `${fmtDateShort(startOfWeek(selectedDate))} \u2014 ${fmtDateShort(addDays(startOfWeek(selectedDate), 6))}`
      : fmtDateFull(selectedDate);

  const monthDays = useMemo(() => {
    const first = startOfMonth(selectedDate);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [selMonth, selYear]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [toISO(selectedDate)]);

  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <PageHeader title="Calendar">
      <Sel value={fPub} onChange={e => setFPub(e.target.value)} options={[{ value: "all", label: "All Publications" }, ...(pubs || []).map(p => ({ value: p.id, label: p.name }))]} />
      <Btn sm onClick={() => { setEventForm(f => ({ ...f, date: toISO(selectedDate) })); setEventModal(true); }}><Ic.plus size={13} /> New Event</Btn>
    </PageHeader>

    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <TabRow><TB tabs={["Month", "Week", "Day"]} active={view.charAt(0).toUpperCase() + view.slice(1)} onChange={v => setView(v.toLowerCase())} /></TabRow>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Btn sm v="secondary" onClick={goToday}>Today</Btn>
        <button onClick={goPrev} style={{ background: "none", border: `1px solid ${Z.bd}`, borderRadius: Ri, width: 28, height: 28, cursor: "pointer", color: Z.tx, fontSize: FS.md, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2039"}</button>
        <span style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tx, fontFamily: DISPLAY, minWidth: 200, textAlign: "center" }}>{headerLabel}</span>
        <button onClick={goNext} style={{ background: "none", border: `1px solid ${Z.bd}`, borderRadius: Ri, width: 28, height: 28, cursor: "pointer", color: Z.tx, fontSize: FS.md, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u203A"}</button>
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {ALL_TYPES.map(t => <button key={t} onClick={() => toggleType(t)} style={{ padding: "3px 8px", borderRadius: Ri, fontSize: FS.xs, fontWeight: FW.semi, fontFamily: COND, border: `1px solid ${activeTypes.includes(t) ? Z.ac : Z.bd}`, background: activeTypes.includes(t) ? Z.ac + "15" : "transparent", color: activeTypes.includes(t) ? Z.ac : Z.td, cursor: "pointer" }}>{EVENT_TYPES[t].icon} {EVENT_TYPES[t].label}</button>)}
        {googleLoading && <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>Syncing...</span>}
      </div>
    </div>

    {/* MONTH VIEW */}
    {view === "month" && <div style={{ border: `1px solid ${Z.bd}`, borderRadius: R, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${Z.bd}` }}>
        {DAYS.map(d => <div key={d} style={{ padding: "6px 8px", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textAlign: "center", fontFamily: COND, textTransform: "uppercase" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {monthDays.map((d, i) => {
          const isCur = d.getMonth() === selMonth;
          const isT = isSameDay(d, today);
          const de = eventsForDate(d);
          return <div key={i} onClick={() => { setSelectedDate(d); if (de.length > 3) setView("day"); }} style={{ minHeight: 90, padding: "4px 6px", borderRight: (i + 1) % 7 !== 0 ? `1px solid ${Z.bd}` : "none", borderBottom: i < 35 ? `1px solid ${Z.bd}` : "none", background: isT ? Z.ac + "08" : isCur ? "transparent" : Z.sa, cursor: "pointer" }}>
            <div style={{ fontSize: FS.sm, fontWeight: isT ? FW.black : FW.semi, color: isCur ? (isT ? Z.ac : Z.tx) : Z.td, marginBottom: 2 }}>{d.getDate()}</div>
            {de.slice(0, 3).map(e => <div key={e.id} onClick={ev => { ev.stopPropagation(); setDetailEvent(e); }} style={{ display: "flex", alignItems: "center", gap: 3, padding: "1px 4px", borderRadius: 2, fontSize: 10, fontWeight: FW.semi, color: Z.tx, fontFamily: COND, marginBottom: 1, cursor: "pointer", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}><Dot color={e.color || Z.ac} /><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</span></div>)}
            {de.length > 3 && <div style={{ fontSize: 9, color: Z.tm, fontFamily: COND, padding: "0 4px" }}>+{de.length - 3} more</div>}
          </div>;
        })}
      </div>
    </div>}

    {/* WEEK VIEW */}
    {view === "week" && <div style={{ border: `1px solid ${Z.bd}`, borderRadius: R, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "50px repeat(7, 1fr)", borderBottom: `1px solid ${Z.bd}` }}>
        <div />
        {weekDays.map(d => <div key={toISO(d)} onClick={() => { setSelectedDate(d); setView("day"); }} style={{ padding: "8px 6px", textAlign: "center", cursor: "pointer", background: isSameDay(d, today) ? Z.ac + "08" : "transparent" }}>
          <div style={{ fontSize: FS.xs, color: Z.td, fontFamily: COND, textTransform: "uppercase" }}>{DAYS[d.getDay()]}</div>
          <div style={{ fontSize: FS.lg, fontWeight: isSameDay(d, today) ? FW.black : FW.semi, color: isSameDay(d, today) ? Z.ac : Z.tx }}>{d.getDate()}</div>
        </div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "50px repeat(7, 1fr)", maxHeight: 600, overflowY: "auto" }}>
        {HOURS.map(h => <div key={h} style={{ display: "contents" }}>
          <div style={{ padding: "4px 6px", fontSize: FS.xs, color: Z.td, fontFamily: COND, textAlign: "right", borderBottom: `1px solid ${Z.bd}15`, height: 50 }}>{fmtTime(h)}</div>
          {weekDays.map(d => {
            const ds = toISO(d);
            const he = allEvents.filter(e => e.date === ds && e.time && parseInt(e.time) === h);
            return <div key={ds + h} style={{ borderLeft: `1px solid ${Z.bd}15`, borderBottom: `1px solid ${Z.bd}15`, padding: 2, height: 50 }}>
              {he.map(e => <div key={e.id} onClick={() => setDetailEvent(e)} style={{ padding: "2px 4px", borderRadius: 2, fontSize: 10, fontWeight: FW.semi, background: (e.color || Z.ac) + "20", borderLeft: `2px solid ${e.color || Z.ac}`, color: Z.tx, fontFamily: COND, cursor: "pointer", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{e.title}</div>)}
            </div>;
          })}
        </div>)}
      </div>
    </div>}

    {/* DAY VIEW */}
    {view === "day" && <GlassCard style={{ padding: 0 }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${Z.bd}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx, fontFamily: COND }}>{fmtDateFull(selectedDate)}</span>
        <span style={{ fontSize: FS.sm, color: Z.tm }}>{eventsForDate(selectedDate).length} events</span>
      </div>
      <div style={{ maxHeight: 600, overflowY: "auto" }}>
        {HOURS.map(h => {
          const he = eventsForDate(selectedDate).filter(e => e.time && parseInt(e.time) === h);
          return <div key={h} style={{ display: "flex", borderBottom: `1px solid ${Z.bd}10`, minHeight: 50 }}>
            <div style={{ width: 60, padding: "6px 8px", fontSize: FS.xs, color: Z.td, fontFamily: COND, textAlign: "right", flexShrink: 0 }}>{fmtTime(h)}</div>
            <div style={{ flex: 1, padding: "4px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
              {he.map(e => <div key={e.id} onClick={() => setDetailEvent(e)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: Ri, background: (e.color || Z.ac) + "12", borderLeft: `3px solid ${e.color || Z.ac}`, cursor: "pointer" }}>
                <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.tx }}>{e.title}</span>
                {e.time && <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>{e.time}{e.endTime ? ` \u2014 ${e.endTime}` : ""}</span>}
                <span style={{ fontSize: FS.xs, color: Z.td, fontFamily: COND, marginLeft: "auto" }}>{EVENT_TYPES[e.type]?.icon}</span>
              </div>)}
            </div>
          </div>;
        })}
      </div>
    </GlassCard>}

    {/* NEW EVENT MODAL */}
    <Modal open={eventModal} onClose={() => setEventModal(false)} title="New Event" width={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Inp label="Title" value={eventForm.title} onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))} placeholder="Meeting, deadline, reminder..." />
        <Inp label="Date" type="date" value={eventForm.date} onChange={e => setEventForm(f => ({ ...f, date: e.target.value }))} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Start" type="time" value={eventForm.time} onChange={e => setEventForm(f => ({ ...f, time: e.target.value }))} />
          <Inp label="End" type="time" value={eventForm.endTime} onChange={e => setEventForm(f => ({ ...f, endTime: e.target.value }))} />
        </div>
        <TA label="Notes" value={eventForm.notes} onChange={e => setEventForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
        {googleConnected && <div style={{ fontSize: FS.xs, color: Z.go, fontFamily: COND }}>Will sync to Google Calendar</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn v="secondary" sm onClick={() => setEventModal(false)}>Cancel</Btn>
          <Btn sm onClick={saveEvent} disabled={!eventForm.title}>Create Event</Btn>
        </div>
      </div>
    </Modal>

    {/* EVENT DETAIL */}
    <Modal open={!!detailEvent} onClose={() => setDetailEvent(null)} title={detailEvent?.title || "Event"} width={400}>
      {detailEvent && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Dot color={detailEvent.color || Z.ac} />
          <span style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND, textTransform: "uppercase" }}>{EVENT_TYPES[detailEvent.type]?.label || detailEvent.type}</span>
        </div>
        <div style={{ fontSize: FS.md, color: Z.tx }}>
          {fmtDateFull(toDay(detailEvent.date))}
          {detailEvent.time && <span style={{ color: Z.tm }}> at {detailEvent.time}{detailEvent.endTime ? ` \u2014 ${detailEvent.endTime}` : ""}</span>}
        </div>
        {detailEvent.location && <div style={{ fontSize: FS.sm, color: Z.tm }}>{"\u{1F4CD}"} {detailEvent.location}</div>}
        {detailEvent.notes && <div style={{ fontSize: FS.sm, color: Z.tm, whiteSpace: "pre-wrap" }}>{detailEvent.notes}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          {detailEvent.type === "custom" && detailEvent.dbId && <Btn v="danger" sm onClick={() => deleteEvent(detailEvent)}>Delete</Btn>}
          <Btn v="secondary" sm onClick={() => setDetailEvent(null)}>Close</Btn>
        </div>
      </div>}
    </Modal>
  </div>;
};

export default memo(CalendarPage);
