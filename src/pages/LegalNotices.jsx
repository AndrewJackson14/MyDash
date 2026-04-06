import { useState } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R } from "../lib/theme";
import { Ic, Btn, Inp, Sel, TA, Card, SB, TB, Stat, Modal, FilterBar , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, ListCard, ListDivider, ListGrid } from "../components/ui";

// ─── Constants ──────────────────────────────────────────────
const NOTICE_TYPES = [
  { value: "fictitious_business", label: "Fictitious Business Name" },
  { value: "name_change", label: "Name Change" },
  { value: "probate", label: "Probate" },
  { value: "trustee_sale", label: "Trustee Sale" },
  { value: "government", label: "Government Notice" },
  { value: "other", label: "Other" },
];
const NOTICE_STATUSES = ["received", "proofing", "approved", "placed", "published", "billed"];
const STATUS_LABELS = { received: "Received", proofing: "Proofing", approved: "Approved", placed: "Placed", published: "Published", billed: "Billed" };
const STATUS_COLORS = {
  received: { bg: Z.sa, text: Z.tm },
  proofing: { bg: Z.sa, text: Z.tx },
  approved: { bg: Z.sa, text: Z.tx },
  placed: { bg: Z.sa, text: Z.tx },
  published: { bg: Z.sa, text: Z.tx },
  billed: { bg: Z.sa, text: Z.td },
};

const today = new Date().toISOString().slice(0, 10);
const fmtDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const fmtCurrency = (n) => "$" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const NoticeBadge = ({ status }) => {
  const c = STATUS_COLORS[status] || STATUS_COLORS.received;
  return <span style={{ display: "inline-flex", padding: "3px 10px", borderRadius: Ri, fontSize: FS.xs, fontWeight: FW.bold, background: c.bg, color: c.text, whiteSpace: "nowrap" }}>{STATUS_LABELS[status] || status}</span>;
};

// Step indicator for workflow
const StepBar = ({ current }) => {
  const idx = NOTICE_STATUSES.indexOf(current);
  return <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
    {NOTICE_STATUSES.map((s, i) => {
      const done = i <= idx;
      const active = i === idx;
      return <div key={s} style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <div style={{
          width: active ? 22 : 16, height: active ? 22 : 16, borderRadius: R,
          background: done ? (STATUS_COLORS[s]?.text || Z.su) : Z.sa,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: FW.black, color: done ? "#fff" : Z.td,
          transition: "all 0.2s",
          border: active ? `2px solid ${STATUS_COLORS[s]?.text || Z.su}` : "2px solid transparent",
        }}>{done ? "✓" : i + 1}</div>
        {i < NOTICE_STATUSES.length - 1 && <div style={{ width: 20, height: 2, background: done && i < idx ? Z.su : Z.bd }} />}
      </div>;
    })}
  </div>;
};

// ─── Module ─────────────────────────────────────────────────
const LegalNotices = ({ legalNotices, setLegalNotices, legalNoticeIssues, setLegalNoticeIssues, pubs, issues, team, bus }) => {
  const [tab, setTab] = useState("Active");
  const [sr, setSr] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [noticeModal, setNoticeModal] = useState(false);
  const [viewId, setViewId] = useState(null);
  const [editId, setEditId] = useState(null);

  const all = legalNotices || [];
  const allIssueLinks = legalNoticeIssues || [];
  const newspapers = pubs.filter(p => p.type === "Newspaper");

  const pn = (pid) => pubs.find(p => p.id === pid)?.name || "";
  const tn = (tid) => team?.find(t => t.id === tid)?.name || "";

  // ─── Form ───────────────────────────────────────────────
  const blank = {
    contactName: "", contactEmail: "", contactPhone: "", organization: "",
    noticeType: "fictitious_business", status: "received",
    content: "", publicationId: newspapers[0]?.id || "",
    issuesRequested: 1, ratePerLine: 0, lineCount: 0, flatRate: 0, totalAmount: 0,
    notes: "",
  };
  const [form, setForm] = useState(blank);

  // Auto-calculate total from line count or flat rate
  const calcTotal = (f) => {
    if (f.flatRate > 0) return f.flatRate * (f.issuesRequested || 1);
    return (f.ratePerLine || 0) * (f.lineCount || 0) * (f.issuesRequested || 1);
  };

  const updateForm = (updates) => {
    setForm(f => {
      const next = { ...f, ...updates };
      next.totalAmount = calcTotal(next);
      return next;
    });
  };

  // ─── Stats ──────────────────────────────────────────────
  const active = all.filter(n => !["published", "billed"].includes(n.status));
  const pendingProof = all.filter(n => n.status === "proofing").length;
  const awaitingPlacement = all.filter(n => n.status === "approved").length;
  const revenueThisMonth = all.filter(n => n.createdAt?.startsWith(today.slice(0, 7))).reduce((s, n) => s + (n.totalAmount || 0), 0);
  const unbilledAmount = all.filter(n => n.status === "published").reduce((s, n) => s + (n.totalAmount || 0), 0);

  // ─── CRUD ───────────────────────────────────────────────
  const openNew = () => {
    setEditId(null);
    setForm({ ...blank });
    setNoticeModal(true);
  };

  const openEdit = (notice) => {
    setEditId(notice.id);
    setForm({ ...notice });
    setNoticeModal(true);
  };

  const saveNotice = () => {
    if (!form.contactName || !form.content) return;
    const total = calcTotal(form);
    if (editId) {
      setLegalNotices(prev => (prev || []).map(n => n.id === editId ? { ...n, ...form, totalAmount: total, updatedAt: new Date().toISOString() } : n));
    } else {
      setLegalNotices(prev => [...(prev || []), { ...form, id: "ln-" + Date.now(), totalAmount: total, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
    }
    setNoticeModal(false);
  };

  const advanceStatus = (noticeId) => {
    const notice = all.find(n => n.id === noticeId);
    setLegalNotices(prev => (prev || []).map(n => {
      if (n.id !== noticeId) return n;
      const idx = NOTICE_STATUSES.indexOf(n.status);
      if (idx >= NOTICE_STATUSES.length - 1) return n;
      const next = NOTICE_STATUSES[idx + 1];
      const updates = { status: next, updatedAt: new Date().toISOString() };
      if (next === "approved") updates.proofApprovedAt = new Date().toISOString();
      if (next === "placed") updates.placedBy = team?.[0]?.id || "";
      if (next === "published") { updates.verifiedBy = team?.[0]?.id || ""; updates.verifiedAt = new Date().toISOString(); }
      if (next === "published" && bus) bus.emit("legal.published", { noticeId, contactName: n.contactName || n.organization, totalAmount: n.totalAmount });
      return { ...n, ...updates };
    }));
  };

  const revertStatus = (noticeId) => {
    setLegalNotices(prev => (prev || []).map(n => {
      if (n.id !== noticeId) return n;
      const idx = NOTICE_STATUSES.indexOf(n.status);
      if (idx <= 0) return n;
      return { ...n, status: NOTICE_STATUSES[idx - 1], updatedAt: new Date().toISOString() };
    }));
  };

  const assignIssue = (noticeId, issueId) => {
    const exists = allIssueLinks.some(li => li.legalNoticeId === noticeId && li.issueId === issueId);
    if (exists) return;
    setLegalNoticeIssues(prev => [...(prev || []), { id: "lni-" + Date.now(), legalNoticeId: noticeId, issueId, pageNumber: null }]);
  };

  const removeIssueLink = (linkId) => {
    setLegalNoticeIssues(prev => (prev || []).filter(li => li.id !== linkId));
  };

  // ─── Filtering ──────────────────────────────────────────
  const isActive = tab === "Active";
  let filtered = isActive ? active : all;
  if (statusFilter !== "all") filtered = filtered.filter(n => n.status === statusFilter);
  if (sr) {
    const q = sr.toLowerCase();
    filtered = filtered.filter(n => n.contactName?.toLowerCase().includes(q) || n.organization?.toLowerCase().includes(q) || n.content?.toLowerCase().includes(q));
  }
  filtered = filtered.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  // ─── Detail View ────────────────────────────────────────
  const viewNotice = all.find(n => n.id === viewId);
  const viewIssueLinks = allIssueLinks.filter(li => li.legalNoticeId === viewId);

  if (viewNotice) {
    const nextStatus = NOTICE_STATUSES[NOTICE_STATUSES.indexOf(viewNotice.status) + 1];
    const availableIssues = issues.filter(i => i.pubId === viewNotice.publicationId && i.date >= today).slice(0, 12);

    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button onClick={() => setViewId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.ac, fontSize: FS.base, fontWeight: FW.bold, fontFamily: COND, textAlign: "left", padding: 0 }}>← Back to Legal Notices</button>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>{NOTICE_TYPES.find(t => t.value === viewNotice.noticeType)?.label}</div>
          <h2 style={{ margin: "0 0 4px", fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{viewNotice.organization || viewNotice.contactName}</h2>
          <div style={{ fontSize: FS.sm, color: Z.tm }}>
            {viewNotice.contactName}{viewNotice.contactEmail ? ` · ${viewNotice.contactEmail}` : ""}{viewNotice.contactPhone ? ` · ${viewNotice.contactPhone}` : ""}
          </div>
          <div style={{ fontSize: FS.sm, color: Z.ac, marginTop: 2 }}>{pn(viewNotice.publicationId)} · {viewNotice.issuesRequested} issue{viewNotice.issuesRequested > 1 ? "s" : ""}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: FW.black, color: Z.su, fontFamily: DISPLAY }}>{fmtCurrency(viewNotice.totalAmount)}</div>
          <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 2 }}>
            {viewNotice.flatRate > 0 ? "Flat rate" : `${viewNotice.lineCount} lines × ${fmtCurrency(viewNotice.ratePerLine)}/line × ${viewNotice.issuesRequested} issues`}
          </div>
        </div>
      </div>

      {/* Workflow stepper */}
      <GlassCard style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <StepBar current={viewNotice.status} />
        <div style={{ display: "flex", gap: 6 }}>
          {NOTICE_STATUSES.indexOf(viewNotice.status) > 0 && <Btn sm v="ghost" onClick={() => revertStatus(viewNotice.id)}>← Back</Btn>}
          {nextStatus && <Btn sm onClick={() => advanceStatus(viewNotice.id)}>
            {nextStatus === "proofing" ? "Send to Proofing" :
             nextStatus === "approved" ? "Mark Approved" :
             nextStatus === "placed" ? "Mark Placed" :
             nextStatus === "published" ? "Mark Published" :
             nextStatus === "billed" ? "Mark Billed" : "Advance"} →
          </Btn>}
          <Btn sm v="ghost" onClick={() => openEdit(viewNotice)}>Edit</Btn>
        </div>
      </GlassCard>

      {/* Notice Content */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Notice Text</div>
        <div style={{ fontSize: FS.base, color: Z.tx, whiteSpace: "pre-wrap", lineHeight: 1.6, padding: 16, background: Z.bg, borderRadius: R, border: `1px solid ${Z.bd}`, fontFamily: "'Source Sans 3', serif" }}>{viewNotice.content}</div>
        <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 6 }}>{viewNotice.content?.split("\n").length || 0} lines · {viewNotice.content?.split(/\s+/).length || 0} words</div>
      </GlassCard>

      {/* Issue Assignments */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Issue Placements</div>
        {viewIssueLinks.length === 0 && <div style={{ fontSize: FS.base, color: Z.td, padding: "4px 0" }}>No issues assigned yet</div>}
        {viewIssueLinks.map(li => {
          const iss = issues.find(i => i.id === li.issueId);
          return <div key={li.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: Z.bg, borderRadius: Ri, marginBottom: 4 }}>
            <div>
              <span style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{iss?.label || li.issueId}</span>
              <span style={{ fontSize: FS.xs, color: Z.td, marginLeft: 8 }}>{iss?.date ? fmtDate(iss.date) : ""}</span>
              {li.pageNumber && <span style={{ fontSize: FS.xs, color: Z.ac, marginLeft: 8 }}>Page {li.pageNumber}</span>}
            </div>
            <button onClick={() => removeIssueLink(li.id)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.da, fontSize: FS.xs, fontWeight: FW.bold }}>Remove</button>
          </div>;
        })}
        {viewIssueLinks.length < viewNotice.issuesRequested && <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: FS.xs, color: Z.wa, fontWeight: FW.semi, marginBottom: 4 }}>{viewNotice.issuesRequested - viewIssueLinks.length} more issue{viewNotice.issuesRequested - viewIssueLinks.length > 1 ? "s" : ""} needed</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {availableIssues.filter(i => !viewIssueLinks.some(li => li.issueId === i.id)).slice(0, 8).map(iss =>
              <button key={iss.id} onClick={() => assignIssue(viewNotice.id, iss.id)} style={{ padding: "6px 12px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.bg, cursor: "pointer", fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx }}>
                + {iss.label}
              </button>
            )}
          </div>
        </div>}
      </GlassCard>

      {/* Workflow details */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Workflow Details</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
          <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Received</div><div style={{ fontSize: FS.base, color: Z.tx }}>{fmtDate(viewNotice.createdAt?.slice(0, 10))}</div></div>
          {viewNotice.proofApprovedAt && <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Proof Approved</div><div style={{ fontSize: FS.base, color: Z.su }}>{fmtDate(viewNotice.proofApprovedAt.slice(0, 10))}</div></div>}
          {viewNotice.placedBy && <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Placed By</div><div style={{ fontSize: FS.base, color: Z.tx }}>{tn(viewNotice.placedBy)}</div></div>}
          {viewNotice.verifiedBy && <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Verified By</div><div style={{ fontSize: FS.base, color: Z.su }}>{tn(viewNotice.verifiedBy)}</div></div>}
          {viewNotice.verifiedAt && <div><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Verified At</div><div style={{ fontSize: FS.base, color: Z.tx }}>{fmtDate(viewNotice.verifiedAt.slice(0, 10))}</div></div>}
        </div>
        {viewNotice.notes && <div style={{ marginTop: 10 }}><div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>Notes</div><div style={{ fontSize: FS.base, color: Z.tm, marginTop: 2 }}>{viewNotice.notes}</div></div>}
      </GlassCard>
    </div>;
  }

  // ─── Main Render ────────────────────────────────────────
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="My Legal Notices">
      {(tab === "Active" || tab === "All") && <SB value={sr} onChange={setSr} placeholder="Search notices..." />}
      <Btn sm onClick={openNew}><Ic.plus size={13} /> New Legal Notice</Btn>
    </PageHeader>

    <TabRow><TB tabs={["Active", "All", "Revenue"]} active={tab} onChange={setTab} />{(tab === "Active" || tab === "All") && <><TabPipe /><TB tabs={["All", ...NOTICE_STATUSES.map(s => STATUS_LABELS[s])]} active={statusFilter === "all" ? "All" : STATUS_LABELS[statusFilter] || "All"} onChange={v => { if (v === "All") setStatusFilter("all"); else { const match = Object.entries(STATUS_LABELS).find(([k, l]) => l === v); setStatusFilter(match ? match[0] : "all"); } }} /></>}</TabRow>

    {/* ════════ STATS ════════ */}
    {(tab === "Active" || tab === "All") && <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
      <Stat label="Active Notices" value={active.length} />
      <Stat label="Pending Proof" value={pendingProof} color={pendingProof > 0 ? Z.pu : Z.su} />
      <Stat label="Awaiting Placement" value={awaitingPlacement} color={awaitingPlacement > 0 ? Z.wa : Z.su} />
      <Stat label="Unbilled" value={fmtCurrency(unbilledAmount)} color={unbilledAmount > 0 ? Z.wa : Z.su} />
    </div>}

    {/* ════════ ACTIVE / ALL TABS ════════ */}
    {(tab === "Active" || tab === "All") && <>
      <div style={{ fontSize: FS.sm, color: Z.td }}>{filtered.length} notice{filtered.length !== 1 ? "s" : ""}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 && <GlassCard><div style={{ padding: 16, textAlign: "center", color: Z.td, fontSize: FS.base }}>No legal notices found</div></GlassCard>}
        {filtered.map(n => {
          const linkedIssues = allIssueLinks.filter(li => li.legalNoticeId === n.id);
          return <GlassCard key={n.id} style={{ padding: 16, cursor: "pointer" }} onClick={() => setViewId(n.id)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <NoticeBadge status={n.status} />
                  <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>{NOTICE_TYPES.find(t => t.value === n.noticeType)?.label}</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: FW.heavy, color: Z.tx }}>{n.organization || n.contactName}</div>
                <div style={{ fontSize: FS.sm, color: Z.tm, marginTop: 2 }}>
                  {n.contactName}{n.organization ? ` · ${n.organization}` : ""} · {pn(n.publicationId)}
                </div>
                <div style={{ fontSize: FS.sm, color: Z.td, marginTop: 3 }}>
                  {n.issuesRequested} issue{n.issuesRequested > 1 ? "s" : ""} · {linkedIssues.length}/{n.issuesRequested} assigned · {n.lineCount > 0 ? `${n.lineCount} lines` : "Flat rate"}
                </div>
              </div>
              <div style={{ textAlign: "right", minWidth: 100 }}>
                <div style={{ fontSize: 18, fontWeight: FW.black, color: Z.su }}>{fmtCurrency(n.totalAmount)}</div>
                <div style={{ fontSize: FS.xs, color: Z.td }}>{fmtDate(n.createdAt?.slice(0, 10))}</div>
              </div>
            </div>
            {/* Mini step bar */}
            <div style={{ marginTop: 8 }}><StepBar current={n.status} /></div>
          </GlassCard>;
        })}
      </div>
    </>}

    {/* ════════ REVENUE TAB ════════ */}
    {tab === "Revenue" && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <Stat label="This Month" value={fmtCurrency(revenueThisMonth)} />
        <Stat label="Total Billed" value={fmtCurrency(all.filter(n => n.status === "billed").reduce((s, n) => s + (n.totalAmount || 0), 0))} />
        <Stat label="Unbilled (Published)" value={fmtCurrency(unbilledAmount)} color={unbilledAmount > 0 ? Z.wa : Z.su} />
      </div>

      {/* By notice type */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Revenue by Notice Type</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {NOTICE_TYPES.map(nt => {
            const typeNotices = all.filter(n => n.noticeType === nt.value);
            const typeRev = typeNotices.reduce((s, n) => s + (n.totalAmount || 0), 0);
            if (typeNotices.length === 0) return null;
            return <div key={nt.value} style={{ display: "grid", gridTemplateColumns: "180px 1fr 80px 80px", gap: 10, alignItems: "center", padding: "10px 14px", background: Z.bg, borderRadius: R }}>
              <span style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{nt.label}</span>
              <div style={{ height: 12, background: Z.sa, borderRadius: R, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, (typeRev / Math.max(revenueThisMonth || 1, 1)) * 100)}%`, background: Z.ac, borderRadius: R }} />
              </div>
              <span style={{ fontSize: FS.sm, color: Z.td, textAlign: "right" }}>{typeNotices.length}</span>
              <span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.su, textAlign: "right" }}>{fmtCurrency(typeRev)}</span>
            </div>;
          }).filter(Boolean)}
          {all.length === 0 && <div style={{ fontSize: FS.base, color: Z.td, padding: "8px 0", textAlign: "center" }}>No legal notice revenue data</div>}
        </div>
      </GlassCard>

      {/* By publication */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Revenue by Publication</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {newspapers.map(pub => {
            const pubNotices = all.filter(n => n.publicationId === pub.id);
            const pubRev = pubNotices.reduce((s, n) => s + (n.totalAmount || 0), 0);
            return <div key={pub.id} style={{ display: "grid", gridTemplateColumns: "12px 1fr 80px 80px", gap: 10, alignItems: "center", padding: "10px 14px", background: Z.bg, borderRadius: R }}>
              <div style={{ width: 10, height: 10, borderRadius: R, background: pub.color }} />
              <span style={{ fontSize: FS.base, fontWeight: FW.bold, color: Z.tx }}>{pub.name}</span>
              <span style={{ fontSize: FS.sm, color: Z.td, textAlign: "right" }}>{pubNotices.length} notices</span>
              <span style={{ fontSize: FS.base, fontWeight: FW.heavy, color: Z.su, textAlign: "right" }}>{fmtCurrency(pubRev)}</span>
            </div>;
          })}
        </div>
      </GlassCard>
    </>}

    {/* ════════ CREATE/EDIT MODAL ════════ */}
    <Modal open={noticeModal} onClose={() => setNoticeModal(false)} title={editId ? "Edit Legal Notice" : "New Legal Notice"} width={640} onSubmit={saveNotice}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Sel label="Notice Type" value={form.noticeType} onChange={e => updateForm({ noticeType: e.target.value })} options={NOTICE_TYPES} />
          <Sel label="Publication" value={form.publicationId} onChange={e => updateForm({ publicationId: e.target.value })} options={newspapers.map(p => ({ value: p.id, label: p.name }))} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Contact Name" value={form.contactName} onChange={e => updateForm({ contactName: e.target.value })} placeholder="John Smith" />
          <Inp label="Organization" value={form.organization} onChange={e => updateForm({ organization: e.target.value })} placeholder="Law firm, agency, etc." />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Email" type="email" value={form.contactEmail} onChange={e => updateForm({ contactEmail: e.target.value })} />
          <Inp label="Phone" value={form.contactPhone} onChange={e => updateForm({ contactPhone: e.target.value })} />
        </div>

        <TA label="Notice Text" value={form.content} onChange={e => {
          const lines = e.target.value.split("\n").length;
          updateForm({ content: e.target.value, lineCount: lines });
        }} rows={8} placeholder="Paste or type the full legal notice text..." />

        <div style={{ fontSize: FS.xs, color: Z.td }}>{form.content?.split("\n").length || 0} lines · {form.content?.split(/\s+/).filter(Boolean).length || 0} words</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
          <Inp label="Issues to Run" type="number" min="1" value={form.issuesRequested} onChange={e => updateForm({ issuesRequested: Number(e.target.value) || 1 })} />
          <Inp label="Lines" type="number" value={form.lineCount} onChange={e => updateForm({ lineCount: Number(e.target.value) || 0 })} />
          <Inp label="Rate/Line" type="number" step="0.01" value={form.ratePerLine || ""} onChange={e => updateForm({ ratePerLine: Number(e.target.value) || 0 })} placeholder="0.00" />
          <Inp label="Flat Rate" type="number" step="0.01" value={form.flatRate || ""} onChange={e => updateForm({ flatRate: Number(e.target.value) || 0 })} placeholder="Override" />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: Z.sa, borderRadius: R }}>
          <span style={{ fontSize: FS.md, fontWeight: FW.heavy, color: Z.tx }}>Total</span>
          <span style={{ fontSize: 22, fontWeight: FW.black, color: Z.su, fontFamily: DISPLAY }}>{fmtCurrency(calcTotal(form))}</span>
        </div>

        <TA label="Notes" value={form.notes} onChange={e => updateForm({ notes: e.target.value })} rows={2} />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn v="secondary" onClick={() => setNoticeModal(false)}>Cancel</Btn>
          <Btn onClick={saveNotice} disabled={!form.contactName || !form.content}>{editId ? "Save Changes" : "Create Notice"}</Btn>
        </div>
      </div>
    </Modal>
  </div>;
};

export default LegalNotices;
