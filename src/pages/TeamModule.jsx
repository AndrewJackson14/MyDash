import { useState, useEffect, useMemo, memo } from "react";
import { Z, COND, DISPLAY, FS, FW, Ri, CARD, R, INV, ZI } from "../lib/theme";
import { Ic, Btn, Inp, Sel, SB, Modal, GlassCard, PageHeader, TB, TabRow, Pill } from "../components/ui";
import { supabase, isOnline } from "../lib/supabase";

const today = new Date().toISOString().slice(0, 10);

// ── Constants ────────────────────────────────────────────────
const DEPARTMENTS = [
  { key: "leadership", label: "Leadership", roles: ["Publisher", "Editor-in-Chief"] },
  { key: "sales", label: "Sales", roles: ["Sales Manager", "Salesperson"] },
  { key: "editorial", label: "Editorial", roles: ["Managing Editor", "Editor", "Content Editor", "Writer/Reporter", "Stringer", "Copy Editor", "Photo Editor"] },
  { key: "design", label: "Design / Production", roles: ["Graphic Designer", "Layout Designer", "Ad Designer", "Production Manager"] },
  { key: "admin", label: "Administration", roles: ["Office Manager", "Office Administrator", "Finance", "Distribution Manager", "Marketing Manager"] },
];
const getDept = (role) => DEPARTMENTS.find(d => d.roles.includes(role))?.label || "Other";
const TEAM_ROLES = ["Publisher", "Editor-in-Chief", "Managing Editor", "Editor", "Writer/Reporter", "Stringer", "Copy Editor", "Photo Editor", "Graphic Designer", "Sales Manager", "Salesperson", "Distribution Manager", "Marketing Manager", "Production Manager", "Finance", "Office Manager"];

const ini = (name) => name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "??";
const fmtCurrency = (n) => "$" + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ── Permission modules ───────────────────────────────────────
// Matches nav IDs exactly — each item independently toggleable
const MODULES = [
  { key: "dashboard", label: "My Dash", section: "Core" },
  { key: "calendar", label: "Calendar", section: "Core" },
  { key: "sales", label: "Sales", section: "Revenue" },
  { key: "contracts", label: "Contracts", section: "Revenue" },
  { key: "billing", label: "Billing", section: "Revenue" },
  { key: "stories", label: "Stories", section: "Content" },
  { key: "editorial", label: "Editorial", section: "Content" },
  { key: "flatplan", label: "Flatplan", section: "Content" },
  { key: "adprojects", label: "Ad Projects", section: "Content" },
  { key: "editions", label: "Editions", section: "Content" },
  { key: "newsletters", label: "Newsletters", section: "Content" },
  { key: "sitesettings", label: "MyWebsites", section: "Content" },
  { key: "medialibrary", label: "Media Library", section: "Content" },
  { key: "circulation", label: "Circulation", section: "Operations" },
  { key: "servicedesk", label: "Service Desk", section: "Operations" },
  { key: "legalnotices", label: "Legal Notices", section: "Operations" },
  { key: "creativejobs", label: "Creative Services", section: "Operations" },
  { key: "team", label: "Team", section: "System" },
  { key: "publications", label: "Publications", section: "System" },
  { key: "schedule", label: "Schedule", section: "System" },
  { key: "analytics", label: "Analytics", section: "System" },
  { key: "emailtemplates", label: "Email Templates", section: "System" },
  { key: "integrations", label: "Integrations", section: "System" },
  { key: "dataimport", label: "Data Import", section: "System" },
  { key: "permissions", label: "Permissions", section: "System" },
];

const ROLE_DEFAULTS = {
  Publisher: MODULES.map(m => m.key),
  "Editor-in-Chief": ["dashboard", "calendar", "stories", "editorial", "flatplan", "adprojects", "editions", "medialibrary", "publications", "schedule", "analytics", "team", "circulation"],
  "Sales Manager": ["dashboard", "calendar", "sales", "contracts", "billing", "flatplan", "adprojects", "publications", "schedule", "analytics"],
  Salesperson: ["dashboard", "calendar", "sales", "contracts", "billing", "flatplan", "adprojects"],
  "Content Editor": ["dashboard", "calendar", "stories", "editorial", "flatplan", "medialibrary"],
  "Managing Editor": ["dashboard", "calendar", "stories", "editorial", "flatplan", "editions", "medialibrary"],
  "Writer/Reporter": ["dashboard", "calendar", "stories"],
  "Stringer": ["dashboard", "calendar", "stories"],
  "Copy Editor": ["dashboard", "calendar", "stories", "editorial", "medialibrary"],
  "Layout Designer": ["dashboard", "calendar", "stories", "flatplan", "adprojects", "editions", "medialibrary", "creativejobs"],
  "Ad Designer": ["dashboard", "calendar", "stories", "flatplan", "adprojects", "editions", "medialibrary", "creativejobs"],
  "Graphic Designer": ["dashboard", "calendar", "stories", "flatplan", "adprojects", "editions", "medialibrary", "creativejobs"],
  "Office Manager": ["dashboard", "calendar", "billing", "circulation", "servicedesk", "legalnotices"],
  "Office Administrator": ["dashboard", "calendar", "billing", "circulation", "servicedesk", "legalnotices"],
};

// ── Alert definitions ────────────────────────────────────────
const ALERT_EVENTS = [
  { key: "ad_inquiry", label: "New ad inquiry", category: "Revenue" },
  { key: "invoice_overdue", label: "Invoice overdue", category: "Revenue" },
  { key: "payment_received", label: "Payment received", category: "Revenue" },
  { key: "contract_expiring", label: "Contract expiring (30d)", category: "Revenue" },
  { key: "story_assigned", label: "Story assigned to you", category: "Content" },
  { key: "story_status_changed", label: "Story status changed", category: "Content" },
  { key: "story_published", label: "Story published to web", category: "Content" },
  { key: "edition_uploaded", label: "Edition uploaded", category: "Content" },
  { key: "new_ticket", label: "New service desk ticket", category: "Operations" },
  { key: "ticket_assigned", label: "Ticket assigned to you", category: "Operations" },
  { key: "subscriber_expiring", label: "Subscriber expiring (7d)", category: "Operations" },
  { key: "legal_deadline", label: "Legal notice deadline", category: "Operations" },
  { key: "team_member_added", label: "New team member added", category: "System" },
  { key: "permission_change", label: "Permission changes", category: "System" },
];

// off / in_app / email / both
const ALERT_ROLE_DEFAULTS = {
  Publisher:             { ad_inquiry: "both", invoice_overdue: "both", payment_received: "in_app", contract_expiring: "in_app", story_assigned: "off", story_status_changed: "in_app", story_published: "in_app", edition_uploaded: "in_app", new_ticket: "both", ticket_assigned: "both", subscriber_expiring: "in_app", legal_deadline: "both", team_member_added: "both", permission_change: "both" },
  "Editor-in-Chief":    { ad_inquiry: "off", invoice_overdue: "off", payment_received: "off", contract_expiring: "off", story_assigned: "both", story_status_changed: "both", story_published: "both", edition_uploaded: "in_app", new_ticket: "in_app", ticket_assigned: "both", subscriber_expiring: "off", legal_deadline: "both", team_member_added: "in_app", permission_change: "off" },
  "Writer/Reporter":    { ad_inquiry: "off", invoice_overdue: "off", payment_received: "off", contract_expiring: "off", story_assigned: "both", story_status_changed: "in_app", story_published: "in_app", edition_uploaded: "off", new_ticket: "off", ticket_assigned: "both", subscriber_expiring: "off", legal_deadline: "off", team_member_added: "off", permission_change: "off" },
  Salesperson:          { ad_inquiry: "both", invoice_overdue: "email", payment_received: "in_app", contract_expiring: "both", story_assigned: "off", story_status_changed: "off", story_published: "off", edition_uploaded: "off", new_ticket: "off", ticket_assigned: "both", subscriber_expiring: "off", legal_deadline: "off", team_member_added: "off", permission_change: "off" },
  "Office Manager":     { ad_inquiry: "in_app", invoice_overdue: "both", payment_received: "both", contract_expiring: "in_app", story_assigned: "off", story_status_changed: "off", story_published: "off", edition_uploaded: "off", new_ticket: "in_app", ticket_assigned: "both", subscriber_expiring: "both", legal_deadline: "in_app", team_member_added: "off", permission_change: "off" },
};

const getAlertDefaults = (role) => {
  return ALERT_ROLE_DEFAULTS[role] || ALERT_ROLE_DEFAULTS["Writer/Reporter"] || {};
};

const ALERT_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "in_app", label: "In-App" },
  { value: "email", label: "Email" },
  { value: "both", label: "Both" },
];

// ══════════════════════════════════════════════════════════════
// TEAM MEMBER MODAL
// ══════════════════════════════════════════════════════════════
const MemberModal = ({ open, onClose, member, pubs, updateTeamMember, metrics, onEdit, clients, sales, stories, tickets, save, form, setForm }) => {
  const [tab, setTab] = useState("Details");
  const [saving, setSaving] = useState(null);
  const [localPerms, setLocalPerms] = useState([]);
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);

  // Sync localPerms when member changes
  const memberPermsKey = member?.id || "";
  useEffect(() => {
    if (member) setLocalPerms(member.modulePermissions || member.module_permissions || []);
  }, [memberPermsKey]);

  if (!open || !member) return null;
  const isDk = Z.bg === "#08090D";

  // Alert preferences (stored as JSONB on team_members)
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

  // Module permissions — uses localPerms for optimistic toggle
  const perms = localPerms;
  const toggleModule = async (moduleKey) => {
    const updated = perms.includes(moduleKey) ? perms.filter(k => k !== moduleKey) : [...perms, moduleKey];
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

  return <Modal open={open} onClose={onClose} title={member.name} width={640}>
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: 560 }}>
      {/* Header */}
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <div style={{ width: 52, height: 52, borderRadius: R, background: Z.bd, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: FW.black, color: INV.light, flexShrink: 0 }}>{ini(member.name)}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: Z.tx }}>{member.name}</div>
          <div style={{ fontSize: FS.sm, color: Z.ac, fontWeight: FW.semi }}>{member.role}</div>
          <div style={{ fontSize: FS.xs, color: Z.tm }}>{member.email}{member.phone ? ` · ${member.phone}` : ""}</div>
        </div>
        {member.auth_id
          ? <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: Z.go, background: Z.go + "15", padding: "4px 10px", borderRadius: Ri }}>Active</span>
          : <Btn sm v="secondary" disabled={inviting} onClick={async () => {
              setInviting(true); setInviteResult(null);
              try {
                const { data: { session } } = await supabase.auth.getSession();
                const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxeXdhY3locGxsYXBkd2NjbWF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NzIwNjEsImV4cCI6MjA5MDI0ODA2MX0.ODwap_OFuMmFCYkDwhA1RI-F7dlrfi4qqSe64O6k2-Q";
                const res = await fetch("https://hqywacyhpllapdwccmaw.supabase.co/functions/v1/invite-user", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token || ""}`, "apikey": anonKey },
                  body: JSON.stringify({ email: member.email, team_member_id: member.id }),
                });
                const result = await res.json();
                setInviteResult(result);
              } catch (err) { setInviteResult({ error: err.message }); }
              setInviting(false);
            }}>{inviting ? "Sending..." : "Invite to MyDash"}</Btn>
        }
      </div>
      {inviteResult && <div style={{ fontSize: FS.xs, padding: "6px 10px", borderRadius: Ri, background: inviteResult.success ? Z.go + "10" : Z.da + "10", color: inviteResult.success ? Z.go : Z.da }}>
        {inviteResult.success ? inviteResult.message : `Error: ${inviteResult.error}`}
      </div>}

      {/* Tabs */}
      <TabRow><TB tabs={["Details", "Workload", "Settings", "Permissions", "Alerts"]} active={tab} onChange={setTab} /></TabRow>

      {/* Scrollable tab content */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Details tab — edit form + metrics + Google status */}
      {tab === "Details" && (<>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <Inp label="Name" value={form?.name ?? member.name} onChange={e => setForm?.(f => ({ ...f, name: e.target.value }))} />
          <Sel label="Role" value={form?.role ?? member.role} onChange={e => setForm?.(f => ({ ...f, role: e.target.value }))} options={(TEAM_ROLES || []).map(r => ({ value: r, label: r }))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <Inp label="Email" type="email" value={form?.email ?? member.email} onChange={e => setForm?.(f => ({ ...f, email: e.target.value }))} />
          <Inp label="Phone" value={form?.phone ?? (member.phone || "")} onChange={e => setForm?.(f => ({ ...f, phone: e.target.value }))} />
        </div>
        {metrics.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(metrics.length, 4)}, 1fr)`, gap: 10 }}>
            {metrics.map(m => (
              <div key={m.label} style={{ textAlign: "center", padding: 12, background: Z.sa, borderRadius: R, border: `1px solid ${Z.bd}` }}>
                <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: Z.tx, fontFamily: DISPLAY }}>{m.value}</div>
                <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>{m.label}</div>
              </div>
            ))}
          </div>
        )}
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Assigned Publications</div>
          {(member.pubs || []).includes("all")
            ? <span style={{ fontSize: FS.sm, color: Z.ac, fontWeight: FW.semi }}>All publications</span>
            : <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {(member.pubs || []).map(pid => { const pub = pubs.find(p => p.id === pid); return pub ? <span key={pid} style={{ fontSize: FS.xs, fontWeight: FW.semi, color: Z.tx, background: Z.sa, padding: "2px 8px", borderRadius: Ri }}>{pub.name}</span> : null; })}
            </div>}
        </div>
        {/* Google Account Status */}
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Google Account</div>
          <span style={{ fontSize: FS.sm, color: member.authId ? Z.go : Z.tm, fontFamily: COND }}>{member.authId ? "Connected" : "Not connected"}</span>
        </div>
        {/* Freelancer info */}
        {member.isFreelance && <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Freelancer Details</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div style={{ padding: 10, background: Z.sa, borderRadius: R }}>
              <div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase" }}>Rate</div>
              <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx }}>${member.rateAmount || 0}{member.rateType === "per_hour" ? "/hr" : member.rateType === "per_piece" ? "/piece" : ""}</div>
            </div>
            <div style={{ padding: 10, background: Z.sa, borderRadius: R }}>
              <div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase" }}>Type</div>
              <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: Z.tx }}>{(member.rateType || "flat").replace(/_/g, " ")}</div>
            </div>
            <div style={{ padding: 10, background: Z.sa, borderRadius: R }}>
              <div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase" }}>Availability</div>
              <div style={{ fontSize: FS.sm, fontWeight: FW.semi, color: member.availability === "available" ? Z.go : member.availability === "busy" ? Z.wa : Z.da }}>{member.availability || "—"}</div>
            </div>
          </div>
          {member.specialties?.length > 0 && <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
            {member.specialties.map(s => <span key={s} style={{ fontSize: FS.xs, color: Z.ac, background: Z.ac + "12", padding: "2px 8px", borderRadius: Ri }}>{s}</span>)}
          </div>}
        </div>}
      </>)}

      {/* Workload tab — open tasks, overdue, activity feed */}
      {tab === "Workload" && (<>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {(() => {
            const isSales = ["Sales Manager", "Salesperson"].includes(member.role);
            const isEditor = ["Editor", "Managing Editor", "Editor-in-Chief", "Content Editor", "Copy Editor"].includes(member.role);
            const isAdmin = ["Office Manager", "Office Administrator"].includes(member.role);
            const myClients = new Set((clients || []).filter(c => c.repId === member.id).map(c => c.id));
            const overdue = isSales ? (sales || []).filter(s => myClients.has(s.clientId) && s.nextActionDate && s.nextActionDate < today && s.nextAction && !["Closed", "Follow-up"].includes(s.status)).length : 0;
            const pipeline = isSales ? (sales || []).filter(s => myClients.has(s.clientId) && !["Closed", "Follow-up"].includes(s.status)) : [];
            const editQueue = isEditor ? (stories || []).filter(s => ["Needs Editing", "Draft"].includes(s.status)).length : 0;
            const openTix = isAdmin ? (tickets || []).filter(t => ["open", "in_progress"].includes(t.status)).length : 0;
            return [
              isSales && { label: "Pipeline", value: `$${pipeline.reduce((s, x) => s + (x.amount || 0), 0).toLocaleString()}`, sub: `${pipeline.length} deals` },
              isSales && { label: "Overdue Actions", value: overdue, color: overdue > 0 ? Z.da : Z.go },
              isEditor && { label: "Edit Queue", value: editQueue },
              isAdmin && { label: "Open Tickets", value: openTix },
              { label: "Active", value: member.isActive !== false ? "Yes" : "No", color: member.isActive !== false ? Z.go : Z.da },
            ].filter(Boolean).map(m => (
              <div key={m.label} style={{ textAlign: "center", padding: 12, background: Z.sa, borderRadius: R }}>
                <div style={{ fontSize: FS.xl, fontWeight: FW.black, color: m.color || Z.tx, fontFamily: DISPLAY }}>{m.value}</div>
                <div style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.td, textTransform: "uppercase" }}>{m.label}</div>
                {m.sub && <div style={{ fontSize: FS.micro, color: Z.tm }}>{m.sub}</div>}
              </div>
            ));
          })()}
        </div>
        <div>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Recent Activity</div>
          <div style={{ fontSize: FS.sm, color: Z.tm, padding: 12, textAlign: "center", background: Z.sa, borderRadius: R }}>Activity tracking coming soon — will show recent actions in MyDash</div>
        </div>
      </>)}

      {/* Settings tab — commission, pub assignments */}
      {tab === "Settings" && (<>
        {/* Commission settings (sales roles) */}
        {["Sales Manager", "Salesperson"].includes(member.role) && <>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Commission Settings</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ padding: 12, background: Z.sa, borderRadius: R }}>
              <div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Default Rate</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Inp type="number" value={member.commissionDefaultRate || 20} onChange={e => { if (updateTeamMember) updateTeamMember(member.id, { commissionDefaultRate: Number(e.target.value) }); }} style={{ width: 60 }} />
                <span style={{ fontSize: FS.sm, color: Z.tm }}>%</span>
              </div>
            </div>
            <div style={{ padding: 12, background: Z.sa, borderRadius: R }}>
              <div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Earning Trigger</div>
              <Sel value={member.commissionTrigger || "both"} onChange={e => { if (updateTeamMember) updateTeamMember(member.id, { commissionTrigger: e.target.value }); }} options={[
                { value: "both", label: "Both (Issue + Invoice)" },
                { value: "issue_published", label: "When Issue Publishes" },
                { value: "invoice_paid", label: "When Invoice Paid" },
              ]} />
            </div>
          </div>
        </>}
        {/* Publication assignments with % */}
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Publication Assignments</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {pubs.map(p => {
              const isAssigned = (member.pubs || []).includes("all") || (member.pubs || []).includes(p.id);
              return <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: isAssigned ? Z.go + "08" : Z.sa, borderRadius: Ri, borderLeft: `2px solid ${isAssigned ? Z.go : Z.bd}` }}>
                <span style={{ flex: 1, fontSize: FS.sm, fontWeight: isAssigned ? FW.bold : FW.normal, color: isAssigned ? Z.tx : Z.td }}>{p.name}</span>
                <span style={{ fontSize: FS.xs, color: isAssigned ? Z.go : Z.td }}>{isAssigned ? "Assigned" : "—"}</span>
              </div>;
            })}
          </div>
        </div>
        {/* Freelancer settings */}
        {member.isFreelance && <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Freelancer Settings</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div style={{ padding: 10, background: Z.sa, borderRadius: R }}>
              <div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Rate Type</div>
              <Sel value={member.rateType || "per_piece"} onChange={e => { if (updateTeamMember) updateTeamMember(member.id, { rateType: e.target.value }); }} options={[
                { value: "per_piece", label: "Per Piece" }, { value: "per_hour", label: "Per Hour" }, { value: "flat", label: "Flat" },
              ]} />
            </div>
            <div style={{ padding: 10, background: Z.sa, borderRadius: R }}>
              <div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Rate</div>
              <Inp type="number" value={member.rateAmount || 0} onChange={e => { if (updateTeamMember) updateTeamMember(member.id, { rateAmount: Number(e.target.value) }); }} />
            </div>
            <div style={{ padding: 10, background: Z.sa, borderRadius: R }}>
              <div style={{ fontSize: FS.micro, color: Z.td, textTransform: "uppercase", marginBottom: 4 }}>Availability</div>
              <Sel value={member.availability || "available"} onChange={e => { if (updateTeamMember) updateTeamMember(member.id, { availability: e.target.value }); }} options={[
                { value: "available", label: "Available" }, { value: "busy", label: "Busy" }, { value: "unavailable", label: "Unavailable" },
              ]} />
            </div>
          </div>
        </div>}
      </>)}

      {/* Permissions tab */}
      {tab === "Permissions" && (<>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>Toggle modules this member can access</div>
          <Btn sm v="ghost" onClick={resetPermDefaults} disabled={saving === "perm_reset"}>Reset to Role Defaults</Btn>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          {MODULES.map(m => {
            const has = perms.includes(m.key);
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
      </>)}

      {/* Alerts tab */}
      {tab === "Alerts" && (<>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>Configure how this member receives notifications</div>
          <Btn sm v="ghost" onClick={resetAlertDefaults} disabled={saving === "_reset"}>Reset to Role Defaults</Btn>
        </div>
        {["Revenue", "Content", "Operations", "System"].map(cat => {
          const events = ALERT_EVENTS.filter(e => e.category === cat);
          return <div key={cat}>
            <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 4 }}>{cat}</div>
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
      </>)}
      </div>{/* end scrollable tab content */}

      {/* Persistent Save footer */}
      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 12, borderTop: `1px solid ${Z.bd}`, flexShrink: 0 }}>
        <Btn onClick={() => { if (save) save(); }}>Save Changes</Btn>
      </div>
    </div>
  </Modal>;
};

// ══════════════════════════════════════════════════════════════
// TEAM PAGE
// ══════════════════════════════════════════════════════════════
const TeamModule = ({ team, setTeam, sales, stories, tickets, subscribers, legalNotices, creativeJobs, pubs, clients, updateTeamMember }) => {
  const [sr, setSr] = useState("");
  const [tab, setTab] = useState("Team");
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [memberModal, setMemberModal] = useState(null); // clicked member
  const [form, setForm] = useState({ name: "", role: "Writer/Reporter", email: "", phone: "", assignedPubs: ["all"] });
  const [saving, setSaving] = useState(null);

  const _sales = sales || []; const _stories = stories || []; const _tickets = tickets || [];
  const _subs = subscribers || []; const _legal = legalNotices || []; const _jobs = creativeJobs || [];
  const isDk = Z.bg === "#08090D";

  const openNew = () => { setEditId(null); setForm({ name: "", role: "Writer/Reporter", email: "", phone: "", assignedPubs: ["all"] }); setModal(true); };
  const openEdit = (t) => { setEditId(t.id); setForm({ name: t.name, role: t.role, email: t.email, phone: t.phone || "", assignedPubs: t.pubs || ["all"] }); setModal(true); };

  const save = async () => {
    if (!form.name || !form.email) return;
    if (editId) {
      if (updateTeamMember) {
        await updateTeamMember(editId, { name: form.name, role: form.role, email: form.email, phone: form.phone, assignedPubs: form.assignedPubs });
      } else {
        setTeam(prev => (prev || []).map(t => t.id === editId ? { ...t, ...form, pubs: form.assignedPubs } : t));
      }
    } else {
      const newMember = { name: form.name, role: form.role, email: form.email, phone: form.phone || "", assigned_pubs: form.assignedPubs, module_permissions: ROLE_DEFAULTS[form.role] || ["dashboard", "calendar"], alert_preferences: getAlertDefaults(form.role) };
      if (isOnline()) {
        const { data } = await supabase.from("team_members").insert(newMember).select().single();
        if (data) setTeam(prev => [...(prev || []), { ...data, id: data.id, pubs: data.assigned_pubs, modulePermissions: data.module_permissions, alertPreferences: data.alert_preferences }]);
      } else {
        setTeam(prev => [...(prev || []), { ...form, id: "tm-" + Date.now(), pubs: form.assignedPubs }]);
      }
    }
    setModal(false);
  };

  const filtered = (team || []).filter(t => {
    if (t.isHidden || t.is_hidden) return false;
    if (!sr) return true;
    const q = sr.toLowerCase();
    return (t.name || "").toLowerCase().includes(q) || (t.role || "").toLowerCase().includes(q) || (t.email || "").toLowerCase().includes(q);
  });

  const byDept = {};
  filtered.forEach(t => { const dept = getDept(t.role); if (!byDept[dept]) byDept[dept] = []; byDept[dept].push(t); });

  const getMetrics = (t) => {
    const role = t.role;
    if (["Sales Manager", "Salesperson"].includes(role)) {
      const closed = _sales.filter(s => s.status === "Closed");
      const revenue = closed.reduce((s, x) => s + (x.amount || 0), 0);
      const active = _sales.filter(s => !["Closed", "Follow-up"].includes(s.status)).length;
      return [{ label: "Closed Deals", value: closed.length }, { label: "Revenue", value: fmtCurrency(revenue) }, { label: "Active Pipeline", value: active }];
    }
    if (["Writer/Reporter", "Stringer"].includes(role)) {
      const my = _stories.filter(s => s.author === t.name);
      const done = my.filter(s => ["Approved", "On Page", "Sent to Web"].includes(s.status)).length;
      return [{ label: "Stories", value: my.length }, { label: "Completed", value: done }, { label: "In Progress", value: my.length - done }];
    }
    if (["Editor", "Managing Editor", "Copy Editor", "Editor-in-Chief"].includes(role)) {
      const edited = _stories.filter(s => ["Edited", "Approved", "On Page", "Sent to Web"].includes(s.status)).length;
      const needs = _stories.filter(s => s.status === "Needs Editing").length;
      return [{ label: "Edited", value: edited }, { label: "Awaiting Edit", value: needs }];
    }
    if (["Graphic Designer", "Photo Editor", "Ad Designer", "Layout Designer"].includes(role)) {
      const jobs = _jobs.filter(j => j.assignedTo === t.id);
      return [{ label: "Creative Jobs", value: jobs.length }, { label: "Completed", value: jobs.filter(j => ["complete", "billed"].includes(j.status)).length }];
    }
    if (["Office Manager", "Office Administrator"].includes(role)) {
      const resolved = _tickets.filter(tk => tk.status === "resolved").length;
      const open = _tickets.filter(tk => ["open", "in_progress"].includes(tk.status)).length;
      return [{ label: "Tickets Resolved", value: resolved }, { label: "Open", value: open }, { label: "Subscribers", value: _subs.filter(s => s.status === "active").length }];
    }
    return [];
  };

  const visibleTeam = (team || []).filter(t => !t.isHidden && !t.is_hidden);

  // ── Permissions tab helpers ─────────────────────────────
  const togglePerm = async (member, moduleKey) => {
    const current = member.modulePermissions || [];
    const updated = current.includes(moduleKey) ? current.filter(k => k !== moduleKey) : [...current, moduleKey];
    setSaving(member.id + moduleKey);
    if (updateTeamMember) await updateTeamMember(member.id, { modulePermissions: updated });
    setSaving(null);
  };
  const resetPerms = async (member) => {
    const defaults = ROLE_DEFAULTS[member.role] || ["dashboard", "calendar"];
    setSaving(member.id + "_reset");
    if (updateTeamMember) await updateTeamMember(member.id, { modulePermissions: defaults });
    setSaving(null);
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <PageHeader title="My Team" count={filtered.length} />
      <div style={{ display: "flex", gap: 8 }}>
        <SB value={sr} onChange={setSr} placeholder="Search team..." />
        <Btn sm onClick={openNew}><Ic.plus size={13} /> Add Member</Btn>
      </div>
    </div>

    <TabRow><TB tabs={["Team", "Permissions", "Alerts"]} active={tab} onChange={setTab} /></TabRow>

    {/* ═══ TEAM TAB ════════════════════════════════════════ */}
    {tab === "Team" && (<>
      {DEPARTMENTS.filter(d => byDept[d.label]?.length > 0).map(dept => <div key={dept.key} style={{ marginBottom: 16 }}>
        <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, letterSpacing: 1, textTransform: "uppercase", padding: "4px 0 8px" }}>{dept.label} ({byDept[dept.label].length})</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
          {byDept[dept.label].map(t => {
            const metrics = getMetrics(t);
            return <GlassCard key={t.id} style={{ padding: CARD.pad, cursor: "pointer", transition: "border-color 0.15s" }}
              onClick={() => { setMemberModal(t); setEditId(t.id); setForm({ name: t.name, role: t.role, email: t.email, phone: t.phone || "", assignedPubs: t.pubs || ["all"] }); }}
              onMouseOver={e => e.currentTarget.style.borderColor = Z.ac}
              onMouseOut={e => e.currentTarget.style.borderColor = Z.bd}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: R, background: Z.bd, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.base, fontWeight: FW.black, color: INV.light, flexShrink: 0 }}>{ini(t.name)}</div>
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
            </GlassCard>;
          })}
        </div>
      </div>)}
      {filtered.length === 0 && <GlassCard><div style={{ padding: 16, textAlign: "center", color: Z.td }}>No team members found</div></GlassCard>}
    </>)}

    {/* ═══ PERMISSIONS TAB ═════════════════════════════════ */}
    {tab === "Permissions" && (
      <GlassCard noPad style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: COND }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", left: 0, zIndex: ZI.raised, background: isDk ? "rgba(14,16,24,0.95)" : "rgba(240,241,244,0.95)", padding: "10px 14px", textAlign: "left", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `1px solid ${Z.bd}`, minWidth: 160 }}>Team Member</th>
              {MODULES.map(m => <th key={m.key} style={{ padding: "10px 6px", textAlign: "center", fontSize: 9, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.3, borderBottom: `1px solid ${Z.bd}`, whiteSpace: "nowrap", minWidth: 50 }}>{m.label.split(" ")[0]}</th>)}
              <th style={{ padding: "10px 14px", textAlign: "center", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", borderBottom: `1px solid ${Z.bd}` }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleTeam.map(member => {
              const perms = member.modulePermissions || [];
              return <tr key={member.id}>
                <td style={{ position: "sticky", left: 0, zIndex: ZI.raised, background: isDk ? "rgba(14,16,24,0.95)" : "rgba(240,241,244,0.95)", padding: "10px 14px", borderBottom: `1px solid ${isDk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` }}>
                  <div style={{ fontSize: FS.md, fontWeight: FW.semi, color: Z.tx }}>{member.name}</div>
                  <div style={{ fontSize: FS.sm, color: Z.tm }}>{member.role}</div>
                </td>
                {MODULES.map(m => {
                  const has = perms.includes(m.key);
                  const isSaving = saving === member.id + m.key;
                  return <td key={m.key} onClick={() => togglePerm(member, m.key)} style={{ padding: "10px 6px", textAlign: "center", borderBottom: `1px solid ${isDk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, cursor: "pointer" }}>
                    <div style={{ width: 24, height: 24, borderRadius: Ri, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", background: has ? Z.go + "20" : "transparent", border: `1.5px solid ${has ? Z.go : isDk ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, color: has ? Z.go : "transparent", fontSize: FS.sm, fontWeight: FW.black, transition: "all 0.15s", opacity: isSaving ? 0.4 : 1 }}>{has ? "\u2713" : ""}</div>
                  </td>;
                })}
                <td style={{ padding: "10px 14px", textAlign: "center", borderBottom: `1px solid ${isDk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` }}>
                  <Btn sm v="ghost" onClick={() => resetPerms(member)} disabled={saving === member.id + "_reset"}>Reset</Btn>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </GlassCard>
    )}

    {/* ═══ ALERTS TAB ══════════════════════════════════════ */}
    {tab === "Alerts" && (
      <GlassCard noPad style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: COND }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", left: 0, zIndex: ZI.raised, background: isDk ? "rgba(14,16,24,0.95)" : "rgba(240,241,244,0.95)", padding: "10px 14px", textAlign: "left", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `1px solid ${Z.bd}`, minWidth: 160 }}>Team Member</th>
              {ALERT_EVENTS.map(ev => <th key={ev.key} style={{ padding: "10px 6px", textAlign: "center", fontSize: 8, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.3, borderBottom: `1px solid ${Z.bd}`, whiteSpace: "nowrap", minWidth: 65 }}>{ev.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleTeam.map(member => {
              const prefs = member.alertPreferences || getAlertDefaults(member.role);
              return <tr key={member.id}>
                <td style={{ position: "sticky", left: 0, zIndex: ZI.raised, background: isDk ? "rgba(14,16,24,0.95)" : "rgba(240,241,244,0.95)", padding: "10px 14px", borderBottom: `1px solid ${isDk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` }}>
                  <div style={{ fontSize: FS.md, fontWeight: FW.semi, color: Z.tx }}>{member.name}</div>
                  <div style={{ fontSize: FS.sm, color: Z.tm }}>{member.role}</div>
                </td>
                {ALERT_EVENTS.map(ev => {
                  const val = prefs[ev.key] || "off";
                  const colors = { off: Z.td, in_app: Z.ac, email: Z.wa, both: Z.go };
                  const labels = { off: "\u2014", in_app: "App", email: "\u2709", both: "\u2713" };
                  return <td key={ev.key} style={{ padding: "6px 4px", textAlign: "center", borderBottom: `1px solid ${isDk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, cursor: "pointer" }}
                    onClick={async () => {
                      const order = ["off", "in_app", "email", "both"];
                      const next = order[(order.indexOf(val) + 1) % order.length];
                      const updated = { ...prefs, [ev.key]: next };
                      if (updateTeamMember) await updateTeamMember(member.id, { alertPreferences: updated });
                    }}>
                    <span style={{ fontSize: FS.xs, fontWeight: FW.bold, color: colors[val], fontFamily: COND }}>{labels[val]}</span>
                  </td>;
                })}
              </tr>;
            })}
          </tbody>
        </table>
        <div style={{ padding: "8px 14px", fontSize: FS.xs, color: Z.tm, fontFamily: COND }}>
          Click to cycle: Off → In-App → Email → Both
        </div>
      </GlassCard>
    )}

    {/* Add New Member Modal (separate, simple) */}
    <Modal open={modal && !editId} onClose={() => setModal(false)} title="Add Team Member" width={500}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Sel label="Role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} options={TEAM_ROLES.map(r => ({ value: r, label: r }))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Inp label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <Inp label="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn v="secondary" onClick={() => setModal(false)}>Cancel</Btn>
          <Btn onClick={save} disabled={!form.name || !form.email}>Add</Btn>
        </div>
      </div>
    </Modal>

    {/* Member Detail + Edit Modal (merged) */}
    <MemberModal
      open={!!memberModal}
      onClose={() => setMemberModal(null)}
      member={memberModal}
      pubs={pubs}
      updateTeamMember={updateTeamMember}
      metrics={memberModal ? getMetrics(memberModal) : []}
      onEdit={openEdit}
      form={form}
      setForm={setForm}
      save={save}
      clients={clients}
      sales={sales}
      stories={stories}
      tickets={tickets}
    />
  </div>;
};

export default memo(TeamModule);
