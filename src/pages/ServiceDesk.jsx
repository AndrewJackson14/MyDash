import { useState, memo } from "react";
import { Z, COND, DISPLAY, FS, FW, CARD, R, INV } from "../lib/theme";
import { Ic, Btn, Inp, Sel, TA, Card, SB, TB, Stat, Modal, FilterBar , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, DataTable, ListCard, ListDivider, ListGrid, glass } from "../components/ui";

// ─── Constants ──────────────────────────────────────────────
const CHANNELS = [
  { value: "phone", label: "Phone", icon: "📞" },
  { value: "email", label: "Email", icon: "✉️" },
  { value: "web_form", label: "Web Form", icon: "🌐" },
  { value: "walk_in", label: "Walk-In", icon: "🚶" },
  { value: "other", label: "Other", icon: "💬" },
];
const CATEGORIES = [
  { value: "subscription", label: "Subscription" },
  { value: "billing", label: "Billing" },
  { value: "ad_question", label: "Ad Question" },
  { value: "complaint", label: "Complaint" },
  { value: "delivery", label: "Delivery" },
  { value: "legal_notice", label: "Legal Notice" },
  { value: "general", label: "General" },
];
const STATUSES = ["open", "in_progress", "escalated", "resolved", "closed"];
const STATUS_COLORS = {
  open: { bg: Z.ws, text: Z.wa },
  in_progress: { bg: Z.ps, text: Z.pu },
  escalated: { bg: Z.ds, text: Z.da },
  resolved: { bg: Z.ss, text: Z.su },
  closed: { bg: Z.sa, text: Z.td },
};
const PRIORITIES = [
  { value: 0, label: "Normal", color: Z.tm },
  { value: 1, label: "High", color: Z.wa },
  { value: 2, label: "Urgent", color: Z.da },
];
const STATUS_LABELS = { open: "Open", in_progress: "In Progress", escalated: "Escalated", resolved: "Resolved", closed: "Closed" };

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
const fmtAgo = (d) => {
  if (!d) return "";
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const TicketBadge = ({ status }) => {
  const c = STATUS_COLORS[status] || STATUS_COLORS.open;
  return <span style={{ display: "inline-flex", borderRadius: R, fontSize: FS.xs, fontWeight: FW.bold, background: c.bg, color: c.text, whiteSpace: "nowrap" }}>{STATUS_LABELS[status] || status}</span>;
};

const PriorityDot = ({ priority }) => {
  const p = PRIORITIES[priority] || PRIORITIES[0];
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: FS.xs, fontWeight: FW.bold, color: p.color }}>
    <span style={{ width: 8, height: 8, borderRadius: R, background: p.color }} />
    {p.label}
  </span>;
};

// ─── Module ─────────────────────────────────────────────────
const ServiceDesk = ({ tickets, setTickets, ticketComments, setTicketComments, clients, subscribers, pubs, issues, team, bus }) => {
  const [tab, setTab] = useState("Board");
  const [sr, setSr] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [catFilter, setCatFilter] = useState("all");
  const [ticketModal, setTicketModal] = useState(false);
  const [viewTicketId, setViewTicketId] = useState(null);
  const [commentText, setCommentText] = useState("");
  const [commentInternal, setCommentInternal] = useState(false);

  const allTickets = tickets || [];
  const allComments = ticketComments || [];

  // ─── Form state ─────────────────────────────────────────
  const blank = {
    channel: "phone", category: "general", status: "open", priority: 0,
    contactName: "", contactEmail: "", contactPhone: "",
    subject: "", description: "",
    clientId: "", subscriberId: "", publicationId: "", issueId: "",
    assignedTo: "", escalatedTo: "", resolutionNotes: "",
  };
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState(null);

  const cn = (cid) => clients?.find(c => c.id === cid)?.name || "";
  const tn = (tid) => team?.find(t => t.id === tid)?.name || "";
  const pn = (pid) => pubs?.find(p => p.id === pid)?.name || "";

  // ─── Stats ──────────────────────────────────────────────
  const openCount = allTickets.filter(t => t.status === "open").length;
  const inProgressCount = allTickets.filter(t => t.status === "in_progress").length;
  const escalatedCount = allTickets.filter(t => t.status === "escalated").length;
  const resolvedToday = allTickets.filter(t => t.status === "resolved" && t.resolvedAt && new Date(t.resolvedAt).toDateString() === new Date().toDateString()).length;

  // Average resolution time
  const resolved = allTickets.filter(t => t.resolvedAt && t.createdAt);
  const avgResolution = resolved.length > 0
    ? Math.round(resolved.reduce((s, t) => s + (new Date(t.resolvedAt) - new Date(t.createdAt)) / 3600000, 0) / resolved.length)
    : 0;

  // Category breakdown
  const catCounts = {};
  allTickets.filter(t => ["open", "in_progress", "escalated"].includes(t.status)).forEach(t => {
    catCounts[t.category] = (catCounts[t.category] || 0) + 1;
  });

  // ─── CRUD ───────────────────────────────────────────────
  const openNewTicket = () => {
    setEditId(null);
    setForm({ ...blank });
    setTicketModal(true);
  };

  const openEditTicket = (ticket) => {
    setEditId(ticket.id);
    setForm({ ...ticket });
    setTicketModal(true);
  };

  const saveTicket = () => {
    if (!form.subject) return;
    if (editId) {
      setTickets(prev => (prev || []).map(t => t.id === editId ? { ...t, ...form, updatedAt: new Date().toISOString() } : t));
    } else {
      const newId = "tk-" + Date.now();
      setTickets(prev => [...(prev || []), { ...form, id: newId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
      if (bus) bus.emit("ticket.created", { ticketId: newId, subject: form.subject, category: form.category, priority: form.priority });
    }
    setTicketModal(false);
  };

  const updateStatus = (ticketId, newStatus) => {
    setTickets(prev => (prev || []).map(t => {
      if (t.id !== ticketId) return t;
      const updates = { status: newStatus, updatedAt: new Date().toISOString() };
      if (newStatus === "resolved") updates.resolvedAt = new Date().toISOString();
      return { ...t, ...updates };
    }));
  };

  const escalateTicket = (ticketId, toId) => {
    const ticket = allTickets.find(t => t.id === ticketId);
    setTickets(prev => (prev || []).map(t =>
      t.id === ticketId ? { ...t, status: "escalated", escalatedTo: toId, updatedAt: new Date().toISOString() } : t
    ));
    if (bus && ticket) bus.emit("ticket.escalated", { ticketId, subject: ticket.subject, escalatedTo: toId });
  };

  const addComment = (ticketId) => {
    if (!commentText.trim()) return;
    setTicketComments(prev => [...(prev || []), {
      id: "tc-" + Date.now(),
      ticketId,
      authorId: team?.[0]?.id || "",
      authorName: team?.[0]?.name || "Staff",
      note: commentText,
      isInternal: commentInternal,
      createdAt: new Date().toISOString(),
    }]);
    setCommentText("");
    setCommentInternal(false);
  };

  // ─── Filtering ──────────────────────────────────────────
  let filtered = allTickets;
  if (statusFilter === "active") filtered = filtered.filter(t => ["open", "in_progress", "escalated"].includes(t.status));
  else if (statusFilter !== "all") filtered = filtered.filter(t => t.status === statusFilter);
  if (catFilter !== "all") filtered = filtered.filter(t => t.category === catFilter);
  if (sr) {
    const q = sr.toLowerCase();
    filtered = filtered.filter(t => t.subject?.toLowerCase().includes(q) || t.contactName?.toLowerCase().includes(q) || cn(t.clientId).toLowerCase().includes(q));
  }
  filtered = filtered.sort((a, b) => {
    // Priority desc, then created desc
    if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });

  // ─── Ticket Detail View ─────────────────────────────────
  const viewTicket = allTickets.find(t => t.id === viewTicketId);
  const viewComments = allComments.filter(c => c.ticketId === viewTicketId).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

  if (viewTicket) {
    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button onClick={() => setViewTicketId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.ac, fontSize: FS.base, fontWeight: FW.bold, fontFamily: COND, textAlign: "left", padding: 0 }}>← Back to Tickets</button>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <PriorityDot priority={viewTicket.priority} />
            <TicketBadge status={viewTicket.status} />
            <span style={{ fontSize: FS.xs, color: Z.td }}>{CHANNELS.find(c => c.value === viewTicket.channel)?.icon} {CHANNELS.find(c => c.value === viewTicket.channel)?.label}</span>
          </div>
          <h2 style={{ margin: "4px 0", fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{viewTicket.subject}</h2>
          <div style={{ fontSize: FS.sm, color: Z.tm }}>
            {viewTicket.contactName && <span style={{ fontWeight: FW.semi }}>{viewTicket.contactName}</span>}
            {viewTicket.contactEmail && <span> · {viewTicket.contactEmail}</span>}
            {viewTicket.contactPhone && <span> · {viewTicket.contactPhone}</span>}
          </div>
          <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 4 }}>
            Opened {fmtDate(viewTicket.createdAt)} at {fmtTime(viewTicket.createdAt)}
            {viewTicket.clientId && <span> · Client: <span style={{ color: Z.ac, fontWeight: FW.semi }}>{cn(viewTicket.clientId)}</span></span>}
            {viewTicket.publicationId && <span> · {pn(viewTicket.publicationId)}</span>}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {viewTicket.status === "open" && <Btn sm onClick={() => updateStatus(viewTicket.id, "in_progress")}>Start Working</Btn>}
        {["open", "in_progress"].includes(viewTicket.status) && <Btn sm v="secondary" onClick={() => {
          const pub = team?.find(t => t.role === "Publisher");
          if (pub) escalateTicket(viewTicket.id, pub.id);
        }}>Escalate to Publisher</Btn>}
        {["open", "in_progress", "escalated"].includes(viewTicket.status) && <Btn sm style={{ background: Z.su, color: INV.light }} onClick={() => updateStatus(viewTicket.id, "resolved")}>Resolve</Btn>}
        {viewTicket.status === "resolved" && <Btn sm v="ghost" onClick={() => updateStatus(viewTicket.id, "closed")}>Close</Btn>}
        {viewTicket.status === "resolved" && <Btn sm v="ghost" onClick={() => updateStatus(viewTicket.id, "open")}>Reopen</Btn>}
        <Btn sm v="ghost" onClick={() => openEditTicket(viewTicket)}>Edit</Btn>
      </div>

      {/* Description */}
      {viewTicket.description && <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Description</div>
        <div style={{ fontSize: FS.base, color: Z.tx, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{viewTicket.description}</div>
      </GlassCard>}

      {/* Linked entities */}
      {(viewTicket.clientId || viewTicket.publicationId || viewTicket.assignedTo) && <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Details</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
          {viewTicket.category && <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Category</div><div style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx }}>{CATEGORIES.find(c => c.value === viewTicket.category)?.label}</div></div>}
          {viewTicket.assignedTo && <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Assigned To</div><div style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx }}>{tn(viewTicket.assignedTo)}</div></div>}
          {viewTicket.escalatedTo && <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Escalated To</div><div style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.da }}>{tn(viewTicket.escalatedTo)}</div></div>}
          {viewTicket.clientId && <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Client</div><div style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.ac }}>{cn(viewTicket.clientId)}</div></div>}
          {viewTicket.publicationId && <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Publication</div><div style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx }}>{pn(viewTicket.publicationId)}</div></div>}
          {viewTicket.resolvedAt && <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Resolved</div><div style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.su }}>{fmtDate(viewTicket.resolvedAt)}</div></div>}
        </div>
        {viewTicket.resolutionNotes && <div style={{ marginTop: 10 }}><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Resolution Notes</div><div style={{ fontSize: FS.base, color: Z.tx, marginTop: 2 }}>{viewTicket.resolutionNotes}</div></div>}
      </GlassCard>}

      {/* Comment Thread */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Activity</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {viewComments.length === 0 && <div style={{ fontSize: FS.base, color: Z.td, padding: "4px 0" }}>No activity yet</div>}
          {viewComments.map(c => <div key={c.id} style={{ background: c.isInternal ? Z.ws + "40" : Z.bg, borderRadius: R }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{c.authorName}</span>
                {c.isInternal && <span style={{ fontSize: 9, fontWeight: FW.heavy, color: Z.wa, background: Z.ws, borderRadius: R, textTransform: "uppercase" }}>Internal</span>}
              </div>
              <span style={{ fontSize: FS.xs, color: Z.td }}>{fmtAgo(c.createdAt)}</span>
            </div>
            <div style={{ fontSize: FS.base, color: Z.tx, whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{c.note}</div>
          </div>)}
        </div>

        {/* Add comment */}
        {["open", "in_progress", "escalated"].includes(viewTicket.status) && <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Add a note..." rows={3} style={{ background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: R, color: Z.tx, fontSize: FS.base, outline: "none", resize: "vertical", fontFamily: "inherit" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: FS.sm, color: Z.tm, cursor: "pointer" }}>
              <input type="checkbox" checked={commentInternal} onChange={e => setCommentInternal(e.target.checked)} />
              Internal note (not visible to customer)
            </label>
            <Btn sm onClick={() => addComment(viewTicket.id)} disabled={!commentText.trim()}>Add Note</Btn>
          </div>
        </div>}
      </GlassCard>
    </div>;
  }

  // ─── Main Render ────────────────────────────────────────
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="My Service Desk">
      {tab === "List" && <><SB value={sr} onChange={setSr} placeholder="Search tickets..." /><Sel value={catFilter} onChange={e => setCatFilter(e.target.value)} options={[{ value: "all", label: "All Categories" }, ...CATEGORIES]} /></>}
      <Btn sm onClick={openNewTicket}><Ic.plus size={13} /> New Ticket</Btn>
    </PageHeader>

    <TabRow><TB tabs={["Board", "List", "Analytics"]} active={tab} onChange={setTab} />{tab === "List" && <><TabPipe /><TB tabs={["Active", "All", ...STATUSES.map(s => STATUS_LABELS[s])]} active={statusFilter === "active" ? "Active" : statusFilter === "all" ? "All" : STATUS_LABELS[statusFilter] || statusFilter} onChange={v => { if (v === "Active") setStatusFilter("active"); else if (v === "All") setStatusFilter("all"); else { const match = Object.entries(STATUS_LABELS).find(([k, l]) => l === v); setStatusFilter(match ? match[0] : v); } }} /></>}</TabRow>

    {/* ════════ BOARD VIEW (Kanban-style) ════════ */}
    {tab === "Board" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <GlassStat label="Open" value={openCount} color={Z.wa} />
        <GlassStat label="In Progress" value={inProgressCount} color={Z.pu} />
        <GlassStat label="Escalated" value={escalatedCount} color={Z.da} />
        <GlassStat label="Resolved Today" value={resolvedToday} color={Z.su} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, alignItems: "start" }}>
        {[
          { status: "open", label: "Open", color: Z.wa },
          { status: "in_progress", label: "In Progress", color: Z.pu },
          { status: "escalated", label: "Escalated", color: Z.da },
        ].map(col => {
          const colTickets = allTickets.filter(t => t.status === col.status).sort((a, b) => (b.priority || 0) - (a.priority || 0) || (b.createdAt || "").localeCompare(a.createdAt || ""));
          return <div key={col.status} style={{ background: Z.bg, borderRadius: R, padding: 16, border: `1px solid ${Z.bd}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: R, background: col.color }} />
                <span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx }}>{col.label}</span>
              </div>
              <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.td, background: Z.sa, borderRadius: R, padding: "1px 6px" }}>{colTickets.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {colTickets.length === 0 && <div style={{ padding: 16, textAlign: "center", fontSize: FS.sm, color: Z.td }}>No tickets</div>}
              {colTickets.map(t => <div key={t.id} onClick={() => setViewTicketId(t.id)} style={{ ...glass(), borderRadius: R, padding: CARD.pad, cursor: "pointer", border: `1px solid ${Z.bd}`, transition: "border-color 0.1s" }} onMouseOver={e => e.currentTarget.style.borderColor = col.color} onMouseOut={e => e.currentTarget.style.borderColor = Z.bd}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <PriorityDot priority={t.priority} />
                  <span style={{ fontSize: FS.micro, color: Z.td }}>{fmtAgo(t.createdAt)}</span>
                </div>
                <div style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx, marginBottom: 3 }}>{t.subject}</div>
                <div style={{ fontSize: FS.xs, color: Z.tm }}>
                  {t.contactName && <span>{t.contactName}</span>}
                  {t.clientId && <span> · {cn(t.clientId)}</span>}
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, background: Z.sa, borderRadius: R }}>{CATEGORIES.find(c => c.value === t.category)?.label}</span>
                  <span style={{ fontSize: FS.micro, color: Z.td }}>{CHANNELS.find(c => c.value === t.channel)?.icon}</span>
                  {t.assignedTo && <span style={{ fontSize: FS.micro, color: Z.ac }}>{tn(t.assignedTo)}</span>}
                </div>
              </div>)}
            </div>
          </div>;
        })}
      </div>
    </>}

    {/* ════════ LIST VIEW ════════ */}
    {tab === "List" && <>
      <div style={{ fontSize: FS.sm, color: Z.td }}>{filtered.length} ticket{filtered.length !== 1 ? "s" : ""}</div>

      <GlassCard style={{ padding: 0, overflow: "hidden" }}>
        <DataTable>
          <thead>
            <tr>
              {["Priority", "Subject", "Contact", "Category", "Channel", "Assigned", "Age", "Status"].map(h =>
                <th key={h} style={{ textAlign: "left", fontWeight: FW.heavy, color: Z.tm, fontSize: FS.xs, textTransform: "uppercase" }}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0
              ? <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: Z.td, fontSize: FS.base }}>No tickets match your filters</td></tr>
              : filtered.map(t => <tr key={t.id} onClick={() => setViewTicketId(t.id)} style={{ cursor: "pointer" }}>
                <td style={{ padding: "10px 14px" }}><PriorityDot priority={t.priority} /></td>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{t.subject}</div>
                  {t.clientId && <div style={{ fontSize: FS.xs, color: Z.ac }}>{cn(t.clientId)}</div>}
                </td>
                <td style={{ fontSize: FS.sm, color: Z.tm }}>{t.contactName || "—"}</td>
                <td style={{ fontSize: FS.xs, color: Z.tm }}>{CATEGORIES.find(c => c.value === t.category)?.label}</td>
                <td style={{ fontSize: FS.sm }}>{CHANNELS.find(c => c.value === t.channel)?.icon}</td>
                <td style={{ fontSize: FS.sm, color: Z.tm }}>{t.assignedTo ? tn(t.assignedTo) : "—"}</td>
                <td style={{ fontSize: FS.xs, color: Z.td }}>{fmtAgo(t.createdAt)}</td>
                <td style={{ padding: "10px 14px" }}><TicketBadge status={t.status} /></td>
              </tr>)}
          </tbody>
        </DataTable>
      </GlassCard>
    </>}

    {/* ════════ ANALYTICS TAB ════════ */}
    {tab === "Analytics" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <GlassStat label="Total Tickets" value={allTickets.length} />
        <GlassStat label="Open / Active" value={allTickets.filter(t => ["open", "in_progress", "escalated"].includes(t.status)).length} />
        <GlassStat label="Avg Resolution" value={avgResolution > 0 ? `${avgResolution}h` : "—"} sub="hours to resolve" />
        <GlassStat label="Resolved This Week" value={allTickets.filter(t => {
          if (!t.resolvedAt) return false;
          const d = new Date(t.resolvedAt);
          const now = new Date();
          return (now - d) < 7 * 24 * 3600000;
        }).length} />
      </div>

      {/* Category breakdown */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Active Tickets by Category</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {Object.entries(catCounts).sort((a, b) => b[1] - a[1]).map(([cat, count]) => {
            const maxCount = Math.max(...Object.values(catCounts), 1);
            return <div key={cat} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx, width: 110 }}>{CATEGORIES.find(c => c.value === cat)?.label || cat}</span>
              <div style={{ flex: 1, height: 20, background: Z.bg, borderRadius: R, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(count / maxCount) * 100}%`, background: Z.ac, borderRadius: R, transition: "width 0.3s" }} />
              </div>
              <span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx, width: 30, textAlign: "right" }}>{count}</span>
            </div>;
          })}
          {Object.keys(catCounts).length === 0 && <div style={{ fontSize: FS.base, color: Z.td, textAlign: "center" }}>No active tickets</div>}
        </div>
      </GlassCard>

      {/* Channel breakdown */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Tickets by Channel</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {CHANNELS.map(ch => {
            const count = allTickets.filter(t => t.channel === ch.value).length;
            return <div key={ch.value} style={{ textAlign: "center", padding: 16, background: Z.bg, borderRadius: R }}>
              <div style={{ fontSize: FS.xl, marginBottom: 4 }}>{ch.icon}</div>
              <div style={{ fontSize: 18, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{count}</div>
              <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>{ch.label}</div>
            </div>;
          })}
        </div>
      </GlassCard>
    </>}

    {/* ════════ TICKET MODAL ════════ */}
    <Modal open={ticketModal} onClose={() => setTicketModal(false)} title={editId ? "Edit Ticket" : "New Ticket"} width={600} onSubmit={saveTicket}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Inp label="Subject" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Brief description of the issue..." />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Sel label="Channel" value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))} options={CHANNELS} />
          <Sel label="Category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} options={CATEGORIES} />
          <Sel label="Priority" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))} options={PRIORITIES.map(p => ({ value: p.value, label: p.label }))} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Inp label="Contact Name" value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} />
          <Inp label="Contact Email" value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} />
          <Inp label="Contact Phone" value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} />
        </div>

        <TA label="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4} placeholder="Full details of the issue..." />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Sel label="Linked Client" value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}
            options={[{ value: "", label: "None" }, ...(clients || []).map(c => ({ value: c.id, label: c.name }))]} />
          <Sel label="Publication" value={form.publicationId} onChange={e => setForm(f => ({ ...f, publicationId: e.target.value }))}
            options={[{ value: "", label: "None" }, ...(pubs || []).map(p => ({ value: p.id, label: p.name }))]} />
        </div>

        <Sel label="Assign To" value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}
          options={[{ value: "", label: "Unassigned" }, ...(team || []).map(t => ({ value: t.id, label: `${t.name} (${t.role})` }))]} />

        {editId && <TA label="Resolution Notes" value={form.resolutionNotes} onChange={e => setForm(f => ({ ...f, resolutionNotes: e.target.value }))} rows={2} />}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn v="secondary" onClick={() => setTicketModal(false)}>Cancel</Btn>
          <Btn onClick={saveTicket} disabled={!form.subject}>{editId ? "Save Changes" : "Create Ticket"}</Btn>
        </div>
      </div>
    </Modal>
  </div>;
};

export default memo(ServiceDesk);
