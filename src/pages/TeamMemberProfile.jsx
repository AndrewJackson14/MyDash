import { useState, useEffect } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, R, INV } from "../lib/theme";
import { Ic, Btn, Inp, Sel, GlassCard, PageHeader, Pill, BackBtn, TabRow, TB } from "../components/ui";
import { initials as ini } from "../lib/formatters";
import RoleDashboard from "../components/RoleDashboard";
import { MODULES, ROLE_DEFAULTS, ALERT_EVENTS, ALERT_OPTIONS, getAlertDefaults } from "./TeamModule";

const today = new Date().toISOString().slice(0, 10);

// ============================================================
// TeamMemberProfile — publisher-facing profile page for a team
// member. Top section is a Settings card with four subsections
// (Workload / Settings / Permissions / Alerts) all visible in
// one shot. Below that, a faithful render of what the member
// would see on their own dashboard via <RoleDashboard>.
//
// Read-only from the dashboard's perspective: publisher doesn't
// need to act as the member, just observe + manage admin fields.
// ============================================================

// ─── Workload panel ──────────────────────────────────────────
function WorkloadPanel({ member, clients, sales, stories, tickets }) {
  const isSales = ["Sales Manager", "Salesperson"].includes(member.role);
  const isEditor = ["Editor", "Managing Editor", "Editor-in-Chief", "Content Editor", "Copy Editor"].includes(member.role);
  const isAdmin = ["Office Manager", "Office Administrator"].includes(member.role);
  const myClients = new Set((clients || []).filter(c => c.repId === member.id).map(c => c.id));
  const overdue = isSales ? (sales || []).filter(s => myClients.has(s.clientId) && s.nextActionDate && s.nextActionDate < today && s.nextAction && !["Closed", "Follow-up"].includes(s.status)).length : 0;
  const pipeline = isSales ? (sales || []).filter(s => myClients.has(s.clientId) && !["Closed", "Follow-up"].includes(s.status)) : [];
  const editQueue = isEditor ? (stories || []).filter(s => ["Needs Editing", "Draft"].includes(s.status)).length : 0;
  const openTix = isAdmin ? (tickets || []).filter(t => ["open", "in_progress"].includes(t.status)).length : 0;

  const cards = [
    isSales && { label: "Pipeline", value: `$${pipeline.reduce((s, x) => s + (x.amount || 0), 0).toLocaleString()}`, sub: `${pipeline.length} deals` },
    isSales && { label: "Overdue Actions", value: overdue, color: overdue > 0 ? Z.da : Z.go },
    isEditor && { label: "Edit Queue", value: editQueue },
    isAdmin && { label: "Open Tickets", value: openTix },
    { label: "Active", value: member.isActive !== false ? "Yes" : "No", color: member.isActive !== false ? Z.go : Z.da },
  ].filter(Boolean);

  return <div>
    <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Workload</div>
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(cards.length, 1)}, 1fr)`, gap: 10 }}>
      {cards.map(m => (
        <div key={m.label} style={{ textAlign: "center", padding: 14, background: Z.sa, borderRadius: R, border: `1px solid ${Z.bd}` }}>
          <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: m.color || Z.tx, fontFamily: DISPLAY }}>{m.value}</div>
          <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>{m.label}</div>
          {m.sub && <div style={{ fontSize: FS.micro, color: Z.tm, marginTop: 2 }}>{m.sub}</div>}
        </div>
      ))}
    </div>
  </div>;
}

// ─── Settings panel (commission/rate/pub assignments) ───────
function SettingsPanel({ member, pubs, updateTeamMember }) {
  const isSales = ["Sales Manager", "Salesperson"].includes(member.role);

  return <div>
    <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Settings</div>

    {isSales && <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Commission</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ padding: 12, background: Z.sa, borderRadius: R }}>
          <div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Default Rate</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Inp type="number" value={member.commissionDefaultRate || 20} onChange={e => updateTeamMember?.(member.id, { commissionDefaultRate: Number(e.target.value) })} style={{ width: 60 }} />
            <span style={{ fontSize: FS.sm, color: Z.tm }}>%</span>
          </div>
        </div>
        <div style={{ padding: 12, background: Z.sa, borderRadius: R }}>
          <div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Earning Trigger</div>
          <Sel value={member.commissionTrigger || "both"} onChange={e => updateTeamMember?.(member.id, { commissionTrigger: e.target.value })} options={[
            { value: "both", label: "Both (Issue + Invoice)" },
            { value: "issue_published", label: "When Issue Publishes" },
            { value: "invoice_paid", label: "When Invoice Paid" },
          ]} />
        </div>
      </div>
    </div>}

    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Publication Assignments</div>
      {(member.pubs || []).includes("all")
        ? <span style={{ fontSize: FS.sm, color: Z.ac, fontWeight: FW.semi }}>All publications</span>
        : <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(pubs || []).map(p => {
              const isAssigned = (member.pubs || []).includes("all") || (member.pubs || []).includes(p.id);
              return <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: isAssigned ? Z.go + "08" : Z.sa, borderRadius: Ri, borderLeft: `2px solid ${isAssigned ? Z.go : Z.bd}` }}>
                <span style={{ flex: 1, fontSize: FS.sm, fontWeight: isAssigned ? FW.bold : FW.normal, color: isAssigned ? Z.tx : Z.td }}>{p.name}</span>
                <span style={{ fontSize: FS.xs, color: isAssigned ? Z.go : Z.td }}>{isAssigned ? "Assigned" : "—"}</span>
              </div>;
            })}
          </div>}
    </div>

    {member.isFreelance && <div>
      <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Freelancer</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <div style={{ padding: 10, background: Z.sa, borderRadius: R }}>
          <div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Rate Type</div>
          <Sel value={member.rateType || "per_piece"} onChange={e => updateTeamMember?.(member.id, { rateType: e.target.value })} options={[
            { value: "per_piece", label: "Per Piece" }, { value: "per_hour", label: "Per Hour" }, { value: "flat", label: "Flat" },
          ]} />
        </div>
        <div style={{ padding: 10, background: Z.sa, borderRadius: R }}>
          <div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Rate</div>
          <Inp type="number" value={member.rateAmount || 0} onChange={e => updateTeamMember?.(member.id, { rateAmount: Number(e.target.value) })} />
        </div>
        <div style={{ padding: 10, background: Z.sa, borderRadius: R }}>
          <div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Availability</div>
          <Sel value={member.availability || "available"} onChange={e => updateTeamMember?.(member.id, { availability: e.target.value })} options={[
            { value: "available", label: "Available" }, { value: "busy", label: "Busy" }, { value: "unavailable", label: "Unavailable" },
          ]} />
        </div>
      </div>
    </div>}
  </div>;
}

// ─── Permissions panel ──────────────────────────────────────
function PermissionsPanel({ member, updateTeamMember }) {
  const [localPerms, setLocalPerms] = useState(member.modulePermissions || member.module_permissions || []);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    setLocalPerms(member.modulePermissions || member.module_permissions || []);
  }, [member.id]);

  const toggleModule = async (moduleKey) => {
    const updated = localPerms.includes(moduleKey) ? localPerms.filter(k => k !== moduleKey) : [...localPerms, moduleKey];
    setLocalPerms(updated);
    setSaving("perm_" + moduleKey);
    if (updateTeamMember) await updateTeamMember(member.id, { modulePermissions: updated });
    setSaving(null);
  };
  const resetPermDefaults = async () => {
    const defaults = ROLE_DEFAULTS[member.role] || ["dashboard", "calendar"];
    setLocalPerms(defaults);
    setSaving("perm_reset");
    if (updateTeamMember) await updateTeamMember(member.id, { modulePermissions: defaults });
    setSaving(null);
  };

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1 }}>Permissions</div>
      <Btn sm v="ghost" onClick={resetPermDefaults} disabled={saving === "perm_reset"}>Reset to Role Defaults</Btn>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
      {MODULES.map(m => {
        const has = localPerms.includes(m.key);
        const isSaving = saving === "perm_" + m.key;
        return <button key={m.key} onClick={() => toggleModule(m.key)} style={{
          display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: Ri,
          border: `1px solid ${has ? Z.go + "40" : Z.bd}`, background: has ? Z.go + "10" : "transparent",
          cursor: "pointer", opacity: isSaving ? 0.5 : 1, transition: "all 0.15s",
        }}>
          <span style={{ fontSize: FS.sm, color: has ? Z.go : Z.td }}>●</span>
          <span style={{ fontSize: FS.sm, fontWeight: has ? FW.bold : FW.normal, color: has ? Z.tx : Z.tm, fontFamily: COND, flex: 1, textAlign: "left" }}>{m.label.split(" / ")[0]}</span>
          <span style={{ fontSize: FS.sm, color: has ? Z.go : "transparent" }}>{"\u2713"}</span>
        </button>;
      })}
    </div>
  </div>;
}

// ─── Alerts panel ───────────────────────────────────────────
function AlertsPanel({ member, updateTeamMember }) {
  const [saving, setSaving] = useState(null);
  const alertPrefs = member.alertPreferences || getAlertDefaults(member.role);

  const setAlertPref = async (eventKey, value) => {
    const updated = { ...alertPrefs, [eventKey]: value };
    setSaving(eventKey);
    if (updateTeamMember) await updateTeamMember(member.id, { alertPreferences: updated });
    setSaving(null);
  };
  const resetAlertDefaults = async () => {
    const defaults = getAlertDefaults(member.role);
    setSaving("_reset");
    if (updateTeamMember) await updateTeamMember(member.id, { alertPreferences: defaults });
    setSaving(null);
  };

  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1 }}>Alerts</div>
      <Btn sm v="ghost" onClick={resetAlertDefaults} disabled={saving === "_reset"}>Reset to Role Defaults</Btn>
    </div>
    {["Revenue", "Content", "Operations", "System"].map(cat => {
      const events = ALERT_EVENTS.filter(e => e.category === cat);
      return <div key={cat} style={{ marginBottom: 8 }}>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{cat}</div>
        {events.map(ev => {
          const val = alertPrefs[ev.key] || "off";
          return <div key={ev.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${Z.bd}20` }}>
            <span style={{ fontSize: FS.sm, color: Z.tx, fontFamily: COND }}>{ev.label}</span>
            <div style={{ display: "flex", gap: 2 }}>
              {ALERT_OPTIONS.map(opt => (
                <Pill key={opt.value} label={opt.label} icon={{ off: Ic.close, in_app: Ic.bell, email: Ic.mail, both: Ic.check }[opt.value]} active={val === opt.value} onClick={() => setAlertPref(ev.key, opt.value)} />
              ))}
            </div>
          </div>;
        })}
      </div>;
    })}
  </div>;
}

// ─── Main page ──────────────────────────────────────────────
const TeamMemberProfile = ({
  memberId, team, pubs, clients, sales, stories, issues, payments, subscribers,
  tickets, legalNotices, creativeJobs, invoices, setStories,
  updateTeamMember, deleteTeamMember, onNavigate, setIssueDetailId,
}) => {
  // Default to Dashboard view — publishers open this page to see the member's
  // realtime dashboard; Settings is a click away via the top tab.
  const [tab, setTab] = useState("Dashboard");
  const member = (team || []).find(t => t.id === memberId);

  if (!member) {
    return <div style={{ padding: 28 }}>
      <BackBtn onClick={() => onNavigate?.("team")} />
      <div style={{ padding: 40, textAlign: "center", color: Z.tm }}>Team member not found.</div>
    </div>;
  }

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <BackBtn onClick={() => onNavigate?.("team")} />
    <PageHeader title={member.name}>
      {deleteTeamMember && <Btn sm v="danger" onClick={async () => {
        if (!window.confirm(`Remove ${member.name} from the team? They'll be hidden from all team listings, dropdowns, and dashboards. Their commission history, sales attribution, and story bylines stay intact.`)) return;
        await deleteTeamMember(member.id);
        onNavigate?.("team");
      }}><Ic.trash size={12} /> Remove from Team</Btn>}
    </PageHeader>

    {/* Identity strip */}
    <GlassCard>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <div style={{ width: 52, height: 52, borderRadius: R, background: Z.bd, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: FW.black, color: INV.light, flexShrink: 0 }}>{ini(member.name)}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tx }}>{member.name}</div>
          <div style={{ fontSize: FS.sm, color: Z.ac, fontWeight: FW.semi }}>{member.role}</div>
          <div style={{ fontSize: FS.xs, color: Z.tm }}>{member.email}{member.phone ? ` · ${member.phone}` : ""}</div>
        </div>
        {member.authId
          ? <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.go, background: Z.go + "15", padding: "4px 10px", borderRadius: Ri }}>Active</span>
          : <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.tm, background: Z.bd + "40", padding: "4px 10px", borderRadius: Ri }}>Not Connected</span>}
      </div>
    </GlassCard>

    {/* View switcher — Dashboard (default) vs Settings */}
    <TabRow><TB tabs={["Dashboard", "Settings"]} active={tab} onChange={setTab} /></TabRow>

    {tab === "Dashboard" && <RoleDashboard
      role={member.role}
      currentUser={member}
      pubs={pubs}
      stories={stories}
      setStories={setStories}
      clients={clients}
      sales={sales}
      issues={issues}
      team={team}
      invoices={invoices}
      payments={payments}
      subscribers={subscribers}
      tickets={tickets}
      legalNotices={legalNotices}
      creativeJobs={creativeJobs}
      onNavigate={onNavigate}
      setIssueDetailId={setIssueDetailId}
    />}

    {tab === "Settings" && <GlassCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <WorkloadPanel member={member} clients={clients} sales={sales} stories={stories} tickets={tickets} />
        <div style={{ borderTop: `1px solid ${Z.bd}30` }} />
        <SettingsPanel member={member} pubs={pubs} updateTeamMember={updateTeamMember} />
        <div style={{ borderTop: `1px solid ${Z.bd}30` }} />
        <PermissionsPanel member={member} updateTeamMember={updateTeamMember} />
        <div style={{ borderTop: `1px solid ${Z.bd}30` }} />
        <AlertsPanel member={member} updateTeamMember={updateTeamMember} />
      </div>
    </GlassCard>}
  </div>;
};

export default TeamMemberProfile;
