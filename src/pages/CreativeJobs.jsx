import { useState } from "react";
import { Z, COND, DISPLAY, FS, FW, CARD, R } from "../lib/theme";
import { Ic, Btn, Inp, Sel, TA, Card, SB, TB, Stat, Modal, FilterBar , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, DataTable, ListCard, ListDivider, ListGrid, glass } from "../components/ui";

// ─── Constants ──────────────────────────────────────────────
const JOB_TYPES = [
  { value: "design", label: "Graphic Design" },
  { value: "layout", label: "Layout" },
  { value: "printing", label: "Printing" },
  { value: "mixed", label: "Mixed / Package" },
];
const JOB_STATUSES = ["quoted", "approved", "in_progress", "proofing", "complete", "billed"];
const STATUS_LABELS = { quoted: "Quoted", approved: "Approved", in_progress: "In Progress", proofing: "Proofing", complete: "Complete", billed: "Billed" };
const STATUS_COLORS = {
  quoted: { bg: Z.sa, text: Z.tm },
  approved: { bg: Z.sa, text: Z.tx },
  in_progress: { bg: Z.sa, text: Z.tx },
  proofing: { bg: Z.sa, text: Z.tx },
  complete: { bg: Z.sa, text: Z.tx },
  billed: { bg: Z.sa, text: Z.td },
};
const TYPE_ICONS = { design: "🎨", layout: "📐", printing: "🖨", mixed: "📦" };

const today = new Date().toISOString().slice(0, 10);
const fmtDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const fmtCurrency = (n) => "$" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const daysUntil = (d) => d ? Math.ceil((new Date(d + "T12:00:00") - new Date()) / 86400000) : null;

const JobBadge = ({ status }) => {
  const c = STATUS_COLORS[status] || STATUS_COLORS.quoted;
  return <span style={{ display: "inline-flex", borderRadius: R, fontSize: FS.xs, fontWeight: FW.bold, background: c.bg, color: c.text, whiteSpace: "nowrap" }}>{STATUS_LABELS[status] || status}</span>;
};

const StepBar = ({ current }) => {
  const idx = JOB_STATUSES.indexOf(current);
  return <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
    {JOB_STATUSES.map((s, i) => {
      const done = i <= idx;
      const active = i === idx;
      return <div key={s} style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <div style={{
          width: active ? 22 : 16, height: active ? 22 : 16, borderRadius: R,
          background: done ? (STATUS_COLORS[s]?.text || Z.su) : Z.sa,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: FW.black, color: done ? "#fff" : Z.td,
          border: active ? `2px solid ${STATUS_COLORS[s]?.text || Z.su}` : "2px solid transparent",
        }}>{done ? "✓" : i + 1}</div>
        {i < JOB_STATUSES.length - 1 && <div style={{ width: 16, height: 2, background: done && i < idx ? Z.su : Z.bd }} />}
      </div>;
    })}
  </div>;
};

// ─── Module ─────────────────────────────────────────────────
const CreativeJobs = ({ creativeJobs, setCreativeJobs, clients, team, bus, jurisdiction }) => {
  const [tab, setTab] = useState("Board");
  const [sr, setSr] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [jobModal, setJobModal] = useState(false);
  const [viewId, setViewId] = useState(null);
  const [editId, setEditId] = useState(null);

  const all = creativeJobs || [];
  const cn = (cid) => clients?.find(c => c.id === cid)?.name || "—";
  const tn = (tid) => team?.find(t => t.id === tid)?.name || "Unassigned";
  const designers = (team || []).filter(t => ["Graphic Designer", "Production Manager", "Publisher"].includes(t.role));

  // ─── Form ───────────────────────────────────────────────
  const blank = {
    clientId: clients?.[0]?.id || "", title: "", description: "",
    jobType: "design", status: "quoted", assignedTo: "",
    quotedAmount: 0, finalAmount: 0, dueDate: "", notes: "",
  };
  const [form, setForm] = useState(blank);

  // ─── Stats ──────────────────────────────────────────────
  const active = all.filter(j => !["complete", "billed"].includes(j.status));
  const inProgress = all.filter(j => j.status === "in_progress").length;
  const overdue = active.filter(j => j.dueDate && j.dueDate < today).length;
  const pipelineValue = active.reduce((s, j) => s + (j.quotedAmount || 0), 0);
  const completedThisMonth = all.filter(j => j.completedAt && j.completedAt.startsWith(today.slice(0, 7))).length;
  const billedThisMonth = all.filter(j => j.status === "billed" && j.completedAt?.startsWith(today.slice(0, 7))).reduce((s, j) => s + (j.finalAmount || j.quotedAmount || 0), 0);
  const unbilledComplete = all.filter(j => j.status === "complete").reduce((s, j) => s + (j.finalAmount || j.quotedAmount || 0), 0);

  // Per-designer workload
  const designerWorkload = designers.map(d => ({
    ...d,
    jobs: active.filter(j => j.assignedTo === d.id).length,
    value: active.filter(j => j.assignedTo === d.id).reduce((s, j) => s + (j.quotedAmount || 0), 0),
  }));

  // ─── CRUD ───────────────────────────────────────────────
  const openNew = () => {
    setEditId(null);
    setForm({ ...blank });
    setJobModal(true);
  };

  const openEdit = (job) => {
    setEditId(job.id);
    setForm({ ...job });
    setJobModal(true);
  };

  const saveJob = () => {
    if (!form.title || !form.clientId) return;
    if (editId) {
      setCreativeJobs(prev => (prev || []).map(j => j.id === editId ? { ...j, ...form, updatedAt: new Date().toISOString() } : j));
    } else {
      setCreativeJobs(prev => [...(prev || []), { ...form, id: "cj-" + Date.now(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
    }
    setJobModal(false);
  };

  const advanceStatus = (jobId) => {
    setCreativeJobs(prev => (prev || []).map(j => {
      if (j.id !== jobId) return j;
      const idx = JOB_STATUSES.indexOf(j.status);
      if (idx >= JOB_STATUSES.length - 1) return j;
      const next = JOB_STATUSES[idx + 1];
      const updates = { status: next, updatedAt: new Date().toISOString() };
      if (next === "complete") {
        updates.completedAt = new Date().toISOString();
        if (bus) bus.emit("job.complete", { jobId, clientId: j.clientId, clientName: cn(j.clientId), title: j.title, amount: j.finalAmount || j.quotedAmount });
      }
      if (next === "billed" && !j.finalAmount) updates.finalAmount = j.quotedAmount;
      return { ...j, ...updates };
    }));
  };

  const revertStatus = (jobId) => {
    setCreativeJobs(prev => (prev || []).map(j => {
      if (j.id !== jobId) return j;
      const idx = JOB_STATUSES.indexOf(j.status);
      if (idx <= 0) return j;
      return { ...j, status: JOB_STATUSES[idx - 1], updatedAt: new Date().toISOString() };
    }));
  };

  // ─── Filtering ──────────────────────────────────────────
  let filtered = all;
  if (statusFilter === "active") filtered = active;
  else if (statusFilter !== "all") filtered = filtered.filter(j => j.status === statusFilter);
  if (sr) {
    const q = sr.toLowerCase();
    filtered = filtered.filter(j => j.title?.toLowerCase().includes(q) || cn(j.clientId).toLowerCase().includes(q) || j.description?.toLowerCase().includes(q));
  }
  filtered = filtered.sort((a, b) => {
    // Overdue first, then by due date
    const aOver = a.dueDate && a.dueDate < today && !["complete", "billed"].includes(a.status) ? 0 : 1;
    const bOver = b.dueDate && b.dueDate < today && !["complete", "billed"].includes(b.status) ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });

  // ─── Detail View ────────────────────────────────────────
  const viewJob = all.find(j => j.id === viewId);

  if (viewJob) {
    const nextStatus = JOB_STATUSES[JOB_STATUSES.indexOf(viewJob.status) + 1];
    const due = daysUntil(viewJob.dueDate);
    const isOverdue = due !== null && due < 0 && !["complete", "billed"].includes(viewJob.status);

    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button onClick={() => setViewId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.ac, fontSize: FS.base, fontWeight: FW.bold, fontFamily: COND, textAlign: "left", padding: 0 }}>← Back to Jobs</button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 18 }}>{TYPE_ICONS[viewJob.jobType] || "📦"}</span>
            <JobBadge status={viewJob.status} />
            <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>{JOB_TYPES.find(t => t.value === viewJob.jobType)?.label}</span>
          </div>
          <h2 style={{ margin: "4px 0", fontSize: 22, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{viewJob.title}</h2>
          <div style={{ fontSize: FS.md, fontWeight: FW.semi, color: Z.ac }}>{cn(viewJob.clientId)}</div>
          <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 2 }}>
            Assigned to {tn(viewJob.assignedTo)}
            {viewJob.dueDate && <span> · Due {fmtDate(viewJob.dueDate)}
              {isOverdue && <span style={{ color: Z.da, fontWeight: FW.bold }}> ({Math.abs(due)} days overdue)</span>}
              {!isOverdue && due !== null && due <= 7 && due >= 0 && <span style={{ color: Z.wa, fontWeight: FW.semi }}> ({due} days left)</span>}
            </span>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Quoted</div>
          <div style={{ fontSize: 24, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{fmtCurrency(viewJob.quotedAmount)}</div>
          {viewJob.finalAmount > 0 && viewJob.finalAmount !== viewJob.quotedAmount && <div>
            <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginTop: 4 }}>Final</div>
            <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.su }}>{fmtCurrency(viewJob.finalAmount)}</div>
          </div>}
        </div>
      </div>

      {/* Workflow stepper */}
      <GlassCard style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <StepBar current={viewJob.status} />
        <div style={{ display: "flex", gap: 6 }}>
          {JOB_STATUSES.indexOf(viewJob.status) > 0 && <Btn sm v="ghost" onClick={() => revertStatus(viewJob.id)}>← Back</Btn>}
          {nextStatus && <Btn sm onClick={() => advanceStatus(viewJob.id)}>
            {nextStatus === "approved" ? "Client Approved" :
             nextStatus === "in_progress" ? "Start Work" :
             nextStatus === "proofing" ? "Send Proof" :
             nextStatus === "complete" ? "Mark Complete" :
             nextStatus === "billed" ? "Mark Billed" : "Advance"} →
          </Btn>}
          <Btn sm v="ghost" onClick={() => openEdit(viewJob)}>Edit</Btn>
        </div>
      </GlassCard>

      {/* Description */}
      {viewJob.description && <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Scope of Work</div>
        <div style={{ fontSize: FS.base, color: Z.tx, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{viewJob.description}</div>
      </GlassCard>}

      {/* Details */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Job Details</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
          <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Type</div><div style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx }}>{TYPE_ICONS[viewJob.jobType]} {JOB_TYPES.find(t => t.value === viewJob.jobType)?.label}</div></div>
          <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Client</div><div style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.ac }}>{cn(viewJob.clientId)}</div></div>
          <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Assigned To</div><div style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.tx }}>{tn(viewJob.assignedTo)}</div></div>
          <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Created</div><div style={{ fontSize: FS.base, color: Z.tx }}>{fmtDate(viewJob.createdAt?.slice(0, 10))}</div></div>
          {viewJob.completedAt && <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Completed</div><div style={{ fontSize: FS.base, color: Z.su }}>{fmtDate(viewJob.completedAt.slice(0, 10))}</div></div>}
        </div>
        {viewJob.notes && <div style={{ marginTop: 10 }}><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Notes</div><div style={{ fontSize: FS.base, color: Z.tm, marginTop: 2, whiteSpace: "pre-wrap" }}>{viewJob.notes}</div></div>}
      </GlassCard>
    </div>;
  }

  // ─── Main Render ────────────────────────────────────────
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="My Creative Services">
      {tab === "List" && <SB value={sr} onChange={setSr} placeholder="Search jobs..." />}
      <Btn sm onClick={openNew}><Ic.plus size={13} /> New Job</Btn>
    </PageHeader>

    <TabRow><TB tabs={["Board", "List", "Revenue"]} active={tab} onChange={setTab} />{tab === "List" && <><TabPipe /><TB tabs={["Active", "All", ...JOB_STATUSES.map(s => STATUS_LABELS[s])]} active={statusFilter === "active" ? "Active" : statusFilter === "all" ? "All" : STATUS_LABELS[statusFilter] || statusFilter} onChange={v => { if (v === "Active") setStatusFilter("active"); else if (v === "All") setStatusFilter("all"); else { const match = Object.entries(STATUS_LABELS).find(([k, l]) => l === v); setStatusFilter(match ? match[0] : v); } }} /></>}</TabRow>

    {/* ════════ BOARD (Kanban) ════════ */}
    {tab === "Board" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <GlassStat label="Active Jobs" value={active.length} />
        <GlassStat label="Pipeline Value" value={fmtCurrency(pipelineValue)} />
        <GlassStat label="In Progress" value={inProgress} />
        <GlassStat label="Overdue" value={overdue} color={overdue > 0 ? Z.da : Z.su} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, alignItems: "start" }}>
        {[
          { status: "quoted", label: "Quoted", color: Z.tm },
          { status: "approved", label: "Approved", color: Z.tx },
          { status: "in_progress", label: "In Progress", color: Z.tx },
          { status: "proofing", label: "Proofing", color: Z.tx },
        ].map(col => {
          const colJobs = all.filter(j => j.status === col.status).sort((a, b) => {
            if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
            return (b.createdAt || "").localeCompare(a.createdAt || "");
          });
          return <div key={col.status} style={{ background: Z.bg, borderRadius: R, padding: 16, border: `1px solid ${Z.bd}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: R, background: col.color }} />
                <span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.tx }}>{col.label}</span>
              </div>
              <span style={{ fontSize: FS.sm, fontWeight: FW.bold, color: Z.td, background: Z.sa, borderRadius: R, padding: "1px 6px" }}>{colJobs.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {colJobs.length === 0 && <div style={{ padding: 16, textAlign: "center", fontSize: FS.sm, color: Z.td }}>No jobs</div>}
              {colJobs.map(j => {
                const due = daysUntil(j.dueDate);
                const isOverdue = due !== null && due < 0;
                return <div key={j.id} onClick={() => setViewId(j.id)} style={{ ...glass(), borderRadius: R, padding: CARD.pad, cursor: "pointer", border: `1px solid ${isOverdue ? Z.da : Z.bd}`, transition: "border-color 0.1s" }} onMouseOver={e => e.currentTarget.style.borderColor = col.color} onMouseOut={e => e.currentTarget.style.borderColor = isOverdue ? Z.da : Z.bd}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: FS.md }}>{TYPE_ICONS[j.jobType] || "📦"}</span>
                    <span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.su }}>{fmtCurrency(j.quotedAmount)}</span>
                  </div>
                  <div style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx, marginBottom: 2 }}>{j.title}</div>
                  <div style={{ fontSize: FS.xs, color: Z.ac }}>{cn(j.clientId)}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                    <span style={{ fontSize: FS.xs, color: Z.td }}>{tn(j.assignedTo)}</span>
                    {j.dueDate && <span style={{ fontSize: FS.xs, fontWeight: FW.semi, color: isOverdue ? Z.da : due <= 7 ? Z.wa : Z.td }}>
                      {isOverdue ? `${Math.abs(due)}d late` : due === 0 ? "Due today" : `${due}d`}
                    </span>}
                  </div>
                </div>;
              })}
            </div>
          </div>;
        })}
      </div>
    </>}

    {/* ════════ LIST ════════ */}
    {tab === "List" && <>
      <div style={{ fontSize: FS.sm, color: Z.td }}>{filtered.length} job{filtered.length !== 1 ? "s" : ""}</div>

      <GlassCard style={{ padding: 0, overflow: "hidden" }}>
        <DataTable>
          <thead>
            <tr>
              {["Type", "Job", "Client", "Assigned", "Due", "Quoted", "Status", ""].map(h =>
                <th key={h} style={{ textAlign: h === "Quoted" ? "right" : "left", fontWeight: FW.heavy, color: Z.tm, fontSize: FS.xs, textTransform: "uppercase" }}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0
              ? <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: Z.td, fontSize: FS.base }}>No jobs found</td></tr>
              : filtered.map(j => {
                const due = daysUntil(j.dueDate);
                const isOverdue = due !== null && due < 0 && !["complete", "billed"].includes(j.status);
                return <tr key={j.id} onClick={() => setViewId(j.id)} style={{ cursor: "pointer" }}>
                  <td style={{ fontSize: FS.lg }}>{TYPE_ICONS[j.jobType]}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{j.title}</div>
                    {j.description && <div style={{ fontSize: FS.xs, color: Z.td, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.description}</div>}
                  </td>
                  <td style={{ fontSize: FS.base, fontWeight: FW.semi, color: Z.ac }}>{cn(j.clientId)}</td>
                  <td style={{ fontSize: FS.sm, color: Z.tm }}>{tn(j.assignedTo)}</td>
                  <td style={{ fontSize: FS.sm, color: isOverdue ? Z.da : Z.tm, fontWeight: isOverdue ? 700 : 400 }}>{j.dueDate ? fmtDate(j.dueDate) : "—"}{isOverdue && <div style={{ fontSize: FS.micro, color: Z.da }}>{Math.abs(due)}d overdue</div>}</td>
                  <td style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.su, textAlign: "right" }}>{fmtCurrency(j.quotedAmount)}</td>
                  <td style={{ padding: "10px 14px" }}><JobBadge status={j.status} /></td>
                  <td style={{ padding: "10px 14px" }}>
                    {j.status !== "billed" && j.status !== "complete" && <Btn sm v="ghost" onClick={e => { e.stopPropagation(); advanceStatus(j.id); }}>→</Btn>}
                  </td>
                </tr>;
              })}
          </tbody>
        </DataTable>
      </GlassCard>
    </>}

    {/* ════════ REVENUE ════════ */}
    {tab === "Revenue" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <GlassStat label="Pipeline Value" value={fmtCurrency(pipelineValue)} sub={`${active.length} active jobs`} />
        <GlassStat label="Completed This Month" value={completedThisMonth} />
        <GlassStat label="Billed This Month" value={fmtCurrency(billedThisMonth)} />
        <GlassStat label="Unbilled (Complete)" value={fmtCurrency(unbilledComplete)} color={unbilledComplete > 0 ? Z.wa : Z.su} />
      </div>

      {/* By job type */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Revenue by Service Type</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {JOB_TYPES.map(jt => {
            const typeJobs = all.filter(j => j.jobType === jt.value);
            const totalRev = typeJobs.reduce((s, j) => s + (j.finalAmount || j.quotedAmount || 0), 0);
            return <div key={jt.value} style={{ textAlign: "center", padding: 16, background: Z.bg, borderRadius: R }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{TYPE_ICONS[jt.value]}</div>
              <div style={{ fontSize: 18, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{fmtCurrency(totalRev)}</div>
              <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginTop: 2 }}>{jt.label}</div>
              <div style={{ fontSize: FS.xs, color: Z.tm, marginTop: 2 }}>{typeJobs.length} jobs</div>
            </div>;
          })}
        </div>
      </GlassCard>

      {/* Designer workload */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Designer Workload</div>
        {designerWorkload.length === 0
          ? <div style={{ fontSize: FS.base, color: Z.td, textAlign: "center" }}>No designers assigned to jobs</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {designerWorkload.sort((a, b) => b.jobs - a.jobs).map(d => <div key={d.id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px", gap: 10, alignItems: "center", background: Z.bg, borderRadius: R }}>
                <div>
                  <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>{d.name}</div>
                  <div style={{ fontSize: FS.xs, color: Z.td }}>{d.role}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: FS.lg, fontWeight: FW.heavy, color: d.jobs > 3 ? Z.wa : Z.tx }}>{d.jobs}</div>
                  <div style={{ fontSize: FS.micro, color: Z.td }}>ACTIVE</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.su }}>{fmtCurrency(d.value)}</div>
                  <div style={{ fontSize: FS.micro, color: Z.td }}>VALUE</div>
                </div>
              </div>)}
            </div>}
      </GlassCard>

      {/* Top clients */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Top Clients by Creative Services Revenue</div>
        {(() => {
          const clientRevs = {};
          all.forEach(j => {
            if (!j.clientId) return;
            if (!clientRevs[j.clientId]) clientRevs[j.clientId] = { amount: 0, count: 0 };
            clientRevs[j.clientId].amount += j.finalAmount || j.quotedAmount || 0;
            clientRevs[j.clientId].count++;
          });
          const sorted = Object.entries(clientRevs).sort((a, b) => b[1].amount - a[1].amount);
          if (sorted.length === 0) return <div style={{ fontSize: FS.base, color: Z.td, textAlign: "center" }}>No client revenue data</div>;
          return <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {sorted.slice(0, 10).map(([cid, data]) => <div key={cid} style={{ display: "grid", gridTemplateColumns: "1fr 60px 100px", gap: 10, alignItems: "center", background: Z.bg, borderRadius: R }}>
              <span style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{cn(cid)}</span>
              <span style={{ fontSize: FS.sm, color: Z.td, textAlign: "right" }}>{data.count} jobs</span>
              <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.su, textAlign: "right" }}>{fmtCurrency(data.amount)}</span>
            </div>)}
          </div>;
        })()}
      </GlassCard>
    </>}

    {/* ════════ JOB MODAL ════════ */}
    <Modal open={jobModal} onClose={() => setJobModal(false)} title={editId ? "Edit Job" : "New Creative Services Job"} width={560} onSubmit={saveJob}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Inp label="Job Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Business card design, event program, etc." />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Sel label="Client" value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}
            options={[{ value: "", label: "Select client..." }, ...(clients || []).map(c => ({ value: c.id, label: c.name }))]} />
          <Sel label="Job Type" value={form.jobType} onChange={e => setForm(f => ({ ...f, jobType: e.target.value }))} options={JOB_TYPES} />
        </div>

        <TA label="Scope / Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4} placeholder="Describe the deliverables, specs, and requirements..." />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Sel label="Assign To" value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}
            options={[{ value: "", label: "Unassigned" }, ...(team || []).map(t => ({ value: t.id, label: `${t.name} (${t.role})` }))]} />
          <Inp label="Due Date" type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
          <Inp label="Quoted Amount" type="number" step="0.01" value={form.quotedAmount || ""} onChange={e => setForm(f => ({ ...f, quotedAmount: Number(e.target.value) || 0 }))} />
        </div>

        {editId && <Inp label="Final Amount" type="number" step="0.01" value={form.finalAmount || ""} onChange={e => setForm(f => ({ ...f, finalAmount: Number(e.target.value) || 0 }))} />}

        <TA label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn v="secondary" onClick={() => setJobModal(false)}>Cancel</Btn>
          <Btn onClick={saveJob} disabled={!form.title || !form.clientId}>{editId ? "Save Changes" : "Create Job"}</Btn>
        </div>
      </div>
    </Modal>
  </div>;
};

export default CreativeJobs;
