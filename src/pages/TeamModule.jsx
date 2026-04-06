import { useState } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, CARD, R } from "../lib/theme";
import { Ic, Btn, Inp, Sel, Card, SB, Modal , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, ListCard, ListDivider, ListGrid } from "../components/ui";

const DEPARTMENTS = [
  { key: "leadership", label: "Leadership", roles: ["Publisher", "Editor-in-Chief"] },
  { key: "sales", label: "Sales", roles: ["Sales Manager", "Salesperson"] },
  { key: "editorial", label: "Editorial", roles: ["Managing Editor", "Editor", "Content Editor", "Writer/Reporter", "Stringer", "Copy Editor", "Photo Editor"] },
  { key: "design", label: "Design / Production", roles: ["Graphic Designer", "Layout Designer", "Ad Designer", "Production Manager"] },
  { key: "admin", label: "Administration", roles: ["Office Manager", "Office Administrator", "Finance", "Distribution Manager", "Marketing Manager"] },
];
const getDept = (role) => DEPARTMENTS.find(d => d.roles.includes(role))?.label || "Other";
const TEAM_ROLES = ["Publisher", "Editor-in-Chief", "Managing Editor", "Editor", "Writer/Reporter", "Stringer", "Copy Editor", "Photo Editor", "Graphic Designer", "Sales Manager", "Salesperson", "Distribution Manager", "Marketing Manager", "Production Manager", "Finance", "Office Manager"];
const ALERT_TYPES = ["Story status change", "Sale confirmed", "Issue published", "New comment", "Proposal signed", "Flatplan updated"];
const ini = (name) => name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "??";
const iniColor = () => Z.bd;
const fmtCurrency = (n) => "$" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const TeamModule = ({ team, setTeam, sales, stories, tickets, subscribers, legalNotices, creativeJobs, pubs, clients }) => {
  const [sr, setSr] = useState("");
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [viewId, setViewId] = useState(null);
  const [form, setForm] = useState({ name: "", role: "Writer/Reporter", email: "", phone: "", alerts: [], assignedPubs: ["all"], permissions: [] });

  const _sales = sales || [];
  const _stories = stories || [];
  const _tickets = tickets || [];
  const _subs = subscribers || [];
  const _legal = legalNotices || [];
  const _jobs = creativeJobs || [];
  const cn = id => (clients || []).find(c => c.id === id)?.name || "—";
  const pn = id => (pubs || []).find(p => p.id === id)?.name || "";
  const today = new Date().toISOString().slice(0, 10);

  const openNew = () => { setEditId(null); setForm({ name: "", role: "Writer/Reporter", email: "", phone: "", alerts: [], assignedPubs: ["all"], permissions: [] }); setModal(true); };
  const openEdit = (t) => { setEditId(t.id); setForm({ name: t.name, role: t.role, email: t.email, phone: t.phone || "", alerts: t.alerts || [], assignedPubs: t.pubs || ["all"], permissions: t.permissions || [] }); setModal(true); };

  const save = () => {
    if (!form.name || !form.email) return;
    if (editId) {
      setTeam(prev => (prev || []).map(t => t.id === editId ? { ...t, ...form, pubs: form.assignedPubs } : t));
    } else {
      setTeam(prev => [...(prev || []), { ...form, id: "tm-" + Date.now(), pubs: form.assignedPubs }]);
    }
    setModal(false);
  };

  const toggleAlert = (alert) => setForm(f => ({ ...f, alerts: f.alerts.includes(alert) ? f.alerts.filter(a => a !== alert) : [...f.alerts, alert] }));

  const filtered = (team || []).filter(t => {
    if (t.isHidden || t.is_hidden) return false;
    if (!sr) return true;
    const q = sr.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.role.toLowerCase().includes(q) || t.email.toLowerCase().includes(q);
  });

  const byDept = {};
  filtered.forEach(t => { const dept = getDept(t.role); if (!byDept[dept]) byDept[dept] = []; byDept[dept].push(t); });

  // ─── Performance metrics per member ─────────────────────
  const getMetrics = (t) => {
    const role = t.role;
    if (["Sales Manager", "Salesperson"].includes(role)) {
      const myDeals = _sales.filter(s => s.clientId && !["Follow-up"].includes(s.status));
      const closed = _sales.filter(s => s.status === "Closed");
      const revenue = closed.reduce((s, x) => s + (x.amount || 0), 0);
      const active = _sales.filter(s => !["Closed", "Follow-up"].includes(s.status)).length;
      const avgDeal = closed.length > 0 ? Math.round(revenue / closed.length) : 0;
      return [
        { label: "Closed Deals", value: closed.length },
        { label: "Revenue", value: fmtCurrency(revenue) },
        { label: "Active Pipeline", value: active },
        { label: "Avg Deal", value: fmtCurrency(avgDeal) },
      ];
    }
    if (["Writer/Reporter", "Stringer"].includes(role)) {
      const myStories = _stories.filter(s => s.author === t.name);
      const completed = myStories.filter(s => ["Approved", "On Page", "Sent to Web"].includes(s.status)).length;
      const onTime = myStories.filter(s => s.dueDate && s.status !== "Draft" && (["Approved", "On Page", "Sent to Web", "Edited"].includes(s.status))).length;
      const total = myStories.length;
      return [
        { label: "Stories Assigned", value: total },
        { label: "Completed", value: completed },
        { label: "In Progress", value: total - completed },
        { label: "Avg Words", value: total > 0 ? Math.round(myStories.reduce((s, x) => s + (x.wordCount || 0), 0) / total) : 0 },
      ];
    }
    if (["Editor", "Managing Editor", "Copy Editor", "Editor-in-Chief"].includes(role)) {
      const edited = _stories.filter(s => ["Edited", "Approved", "On Page", "Sent to Web"].includes(s.status)).length;
      const needsEdit = _stories.filter(s => s.status === "Needs Editing").length;
      return [
        { label: "Stories Edited", value: edited },
        { label: "Awaiting Edit", value: needsEdit },
        { label: "Total Stories", value: _stories.length },
      ];
    }
    if (["Graphic Designer", "Photo Editor"].includes(role)) {
      const ads = _sales.filter(s => s.status === "Closed").length;
      const jobs = _jobs.filter(j => j.assignedTo === t.id);
      const completed = jobs.filter(j => ["complete", "billed"].includes(j.status)).length;
      return [
        { label: "Ads in System", value: ads },
        { label: "Creative Jobs", value: jobs.length },
        { label: "Jobs Completed", value: completed },
      ];
    }
    if (role === "Office Manager") {
      const resolved = _tickets.filter(tk => tk.status === "resolved").length;
      const open = _tickets.filter(tk => ["open", "in_progress"].includes(tk.status)).length;
      const activeSubs = _subs.filter(s => s.status === "active").length;
      const legalActive = _legal.filter(n => !["published", "billed"].includes(n.status)).length;
      return [
        { label: "Tickets Resolved", value: resolved },
        { label: "Open Tickets", value: open },
        { label: "Active Subscribers", value: activeSubs },
        { label: "Legal Notices Active", value: legalActive },
      ];
    }
    return [];
  };

  // ─── Profile View ───────────────────────────────────────
  const viewMember = (team || []).find(t => t.id === viewId);
  if (viewMember) {
    const metrics = getMetrics(viewMember);
    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button onClick={() => setViewId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: Z.ac, fontSize: FS.base, fontWeight: FW.bold, textAlign: "left", fontFamily: COND, padding: 0 }}>← Back to Team</button>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ width: 64, height: 64, borderRadius: R, background: iniColor(viewMember.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: FW.black, color: "#fff", flexShrink: 0 }}>{ini(viewMember.name)}</div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{viewMember.name}</h2>
          <div style={{ fontSize: FS.md, color: Z.ac, fontWeight: FW.semi, marginTop: 2 }}>{viewMember.role}</div>
          <div style={{ fontSize: FS.base, color: Z.tm, marginTop: 4 }}>{viewMember.email}{viewMember.phone ? ` · ${viewMember.phone}` : ""}</div>
        </div>
        <Btn sm onClick={() => openEdit(viewMember)}>Edit Profile</Btn>
      </div>

      {/* Performance metrics */}
      {metrics.length > 0 && <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(metrics.length, 4)}, 1fr)`, gap: 14 }}>
        {metrics.map(m => <GlassCard key={m.label} style={{ textAlign: "center", padding: 16 }}>
          <div style={{ fontSize: 24, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{m.value}</div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>{m.label}</div>
        </GlassCard>)}
      </div>}

      {/* Publications */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Assigned Publications</div>
        {(viewMember.pubs || []).includes("all")
          ? <div style={{ fontSize: FS.base, color: Z.ac, fontWeight: FW.semi }}>All publications</div>
          : <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(viewMember.pubs || []).map(pid => {
              const pub = (pubs || []).find(p => p.id === pid);
              return pub ? <span key={pid} style={{ fontSize: FS.sm, fontWeight: FW.semi, color: pub.color, background: pub.color + "18", padding: "3px 8px", borderRadius: Ri }}>{pub.name}</span> : null;
            })}
          </div>}
      </GlassCard>

      {/* Permissions */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Permissions</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {(viewMember.permissions || []).map(p => <span key={p} style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.ac, background: Z.as, padding: "3px 8px", borderRadius: Ri, textTransform: "uppercase" }}>{p}</span>)}
          {(viewMember.permissions || []).length === 0 && <span style={{ fontSize: FS.sm, color: Z.td }}>No permissions assigned</span>}
        </div>
      </GlassCard>

      {/* Alert preferences */}
      <GlassCard>
        <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Alert Preferences</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {(viewMember.alerts || []).map(a => <span key={a} style={{ fontSize: FS.xs, fontWeight: FW.semi, color: Z.tm, background: Z.sa, padding: "3px 8px", borderRadius: Ri }}>{a}</span>)}
          {(viewMember.alerts || []).length === 0 && <span style={{ fontSize: FS.sm, color: Z.td }}>No alerts configured</span>}
        </div>
      </GlassCard>
    </div>;
  }

  // ─── Grid View ──────────────────────────────────────────
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <PageHeader title="My Team" />
      <div style={{ display: "flex", gap: 8 }}>
        <SB value={sr} onChange={setSr} placeholder="Search team..." />
        <Btn sm onClick={openNew}><Ic.plus size={13} /> Add Member</Btn>
      </div>
    </div>

    <div style={{ fontSize: FS.sm, color: Z.td }}>{filtered.length} team member{filtered.length !== 1 ? "s" : ""}</div>

    {DEPARTMENTS.filter(d => byDept[d.label]?.length > 0).map(dept => <div key={dept.key} style={{ marginBottom: 16 }}>
      <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", padding: "4px 0 8px" }}>{dept.label} ({byDept[dept.label].length})</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
        {byDept[dept.label].map(t => {
          const metrics = getMetrics(t);
          return <GlassCard key={t.id} style={{ padding: CARD.pad, cursor: "pointer", transition: "border-color 0.15s" }} onClick={() => setViewId(t.id)}
            onMouseOver={e => e.currentTarget.style.borderColor = Z.ac}
            onMouseOut={e => e.currentTarget.style.borderColor = Z.bd}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: R, background: iniColor(t.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.base, fontWeight: FW.black, color: "#fff", flexShrink: 0 }}>{ini(t.name)}</div>
              <div>
                <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>{t.name}</div>
                <div style={{ fontSize: FS.xs, color: Z.ac, fontWeight: FW.semi }}>{t.role}</div>
                <div style={{ fontSize: FS.xs, color: Z.tm }}>{t.email}</div>
              </div>
            </div>
            {metrics.length > 0 && <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(metrics.length, 2)}, 1fr)`, gap: 6 }}>
              {metrics.slice(0, 2).map(m => <div key={m.label}>
                <div style={{ fontSize: FS.lg, fontWeight: FW.heavy, color: Z.tx }}>{m.value}</div>
                <div style={{ fontSize: 9, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5 }}>{m.label}</div>
              </div>)}
            </div>}
            {(t.permissions || []).length > 0 && <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 8 }}>
              {(t.permissions || []).slice(0, 3).map(p => <span key={p} style={{ fontSize: 8, fontWeight: FW.bold, color: Z.ac, background: Z.as, padding: "1px 5px", borderRadius: R, textTransform: "uppercase" }}>{p}</span>)}
            </div>}
          </GlassCard>;
        })}
      </div>
    </div>)}

    {filtered.length === 0 && <GlassCard><div style={{ padding: 16, textAlign: "center", color: Z.td, fontSize: FS.base }}>No team members found</div></GlassCard>}

    {/* Edit/Add Modal */}
    <Modal open={modal} onClose={() => setModal(false)} title={editId ? "Edit Team Member" : "Add Team Member"} width={500}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Sel label="Role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} options={TEAM_ROLES.map(r => ({ value: r, label: r }))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <Inp label="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        </div>
        <div>
          <label style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase" }}>Alert Preferences</label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
            {ALERT_TYPES.map(a => <button key={a} onClick={() => toggleAlert(a)} style={{ padding: "6px 12px", borderRadius: Ri, border: `1px solid ${Z.bg === "#08090D" ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.5)"}`, background: "transparent", cursor: "pointer", fontSize: FS.sm, fontWeight: form.alerts.includes(a) ? 700 : 400, color: Z.tx }}>{a}</button>)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn v="secondary" onClick={() => setModal(false)}>Cancel</Btn>
          <Btn onClick={save} disabled={!form.name || !form.email}>{editId ? "Save" : "Add"}</Btn>
        </div>
      </div>
    </Modal>
  </div>;
};

export default TeamModule;
