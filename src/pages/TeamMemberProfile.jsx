import { useState, useEffect, useRef } from "react";
import { usePageHeader } from "../contexts/PageHeaderContext";
import { Z, COND, DISPLAY, FS, FW, Ri, R, INV } from "../lib/theme";
import { Ic, Btn, Inp, Sel, GlassCard, PageHeader, Pill, BackBtn, TabRow, TB, Toggle } from "../components/ui";
import { initials as ini } from "../lib/formatters";
import { supabase } from "../lib/supabase";
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
  const pipeline = isSales ? (sales || []).filter(s => myClients.has(s.clientId) && s.status !== "Closed") : [];
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

// ─── Settings panel (per-pub commission rows) ──────────────
// Every publication is always listed so every salesperson gets the same
// options (no hard-coding). Each row has: Assigned toggle, rate %, trigger.
// Rate goes to commission_rates (salesperson_id+publication_id+product_type=null).
// Trigger goes to salesperson_pub_assignments.commission_trigger.
function SettingsPanel({ member, pubs, updateTeamMember, salespersonPubAssignments, upsertPubAssignment, deletePubAssignment, commissionRates, upsertCommissionRate, currentUser }) {
  const viewerIsAdmin = !!currentUser?.permissions?.includes?.("admin");
  const isSales = ["Sales Manager", "Salesperson"].includes(member.role);
  const assignments = (salespersonPubAssignments || []).filter(a => a.salespersonId === member.id);
  const rates = (commissionRates || []).filter(r => r.salespersonId === member.id && (r.productType == null || r.productType === ""));

  const getAssignment = (pubId) => assignments.find(a => a.publicationId === pubId);
  const getRate = (pubId) => rates.find(r => r.publicationId === pubId);

  const toggleAssigned = (pubId, isAssigned) => {
    if (isAssigned) {
      deletePubAssignment?.(member.id, pubId);
    } else {
      upsertPubAssignment?.({ salespersonId: member.id, publicationId: pubId, percentage: 100, isActive: true });
    }
  };

  const updateTrigger = (pubId, trigger) => {
    upsertPubAssignment?.({ salespersonId: member.id, publicationId: pubId, percentage: getAssignment(pubId)?.percentage ?? 100, isActive: true, commissionTrigger: trigger });
  };

  const updateRate = (pubId, rateVal) => {
    const existing = getRate(pubId);
    upsertCommissionRate?.({ id: existing?.id, salespersonId: member.id, publicationId: pubId, productType: null, rate: Number(rateVal) || 0 });
  };

  return <div>
    <div style={{ fontSize: FS.sm, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Publication Assignments</div>

    {isSales && <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {(pubs || []).map(p => {
        const assignment = getAssignment(p.id);
        const isAssigned = !!assignment;
        const rate = getRate(p.id);
        return <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 120px", gap: 8, alignItems: "center", padding: "8px 10px", background: isAssigned ? Z.go + "08" : Z.sa, borderRadius: Ri, borderLeft: `2px solid ${isAssigned ? Z.go : Z.bd}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <input type="checkbox" checked={isAssigned} onChange={() => toggleAssigned(p.id, isAssigned)} style={{ cursor: "pointer", flexShrink: 0 }} />
            <span style={{ fontSize: FS.sm, fontWeight: isAssigned ? FW.bold : FW.normal, color: isAssigned ? Z.tx : Z.td, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <input type="number" disabled={!isAssigned} value={rate?.rate ?? ""} placeholder="—" onChange={e => updateRate(p.id, e.target.value)} style={{ width: 48, background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "4px 6px", color: Z.tx, fontSize: FS.sm, outline: "none", textAlign: "right" }} />
            <span style={{ fontSize: FS.xs, color: Z.tm }}>%</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <input type="number" disabled={!isAssigned} value={assignment?.percentage ?? ""} placeholder="100" onChange={e => upsertPubAssignment?.({ salespersonId: member.id, publicationId: p.id, percentage: Number(e.target.value) || 0, isActive: true, commissionTrigger: assignment?.commissionTrigger })} style={{ width: 48, background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri, padding: "4px 6px", color: Z.tx, fontSize: FS.sm, outline: "none", textAlign: "right" }} title="Territory share %" />
            <span style={{ fontSize: FS.xs, color: Z.tm }} title="Territory share">sh</span>
          </div>
          <Sel disabled={!isAssigned} value={assignment?.commissionTrigger || ""} onChange={e => updateTrigger(p.id, e.target.value || null)} options={[{ value: "", label: "Default" }, { value: "both", label: "Issue + Invoice" }, { value: "issue_published", label: "Issue" }, { value: "invoice_paid", label: "Invoice Paid" }]} style={{ padding: "4px 24px 4px 6px" }} />
        </div>;
      })}
      <div style={{ fontSize: FS.xs, color: Z.td, marginTop: 4 }}>Rate = commission %, sh = territory share %, Trigger controls when commission is earned.</div>
    </div>}

    {!isSales && <div style={{ fontSize: FS.sm, color: Z.tm }}>
      {(member.pubs || []).includes("all")
        ? "All publications"
        : (pubs || []).filter(p => (member.pubs || []).includes(p.id)).map(p => p.name).join(", ") || "—"}
    </div>}

    {/* Employment Type — admins only. Toggling ON marks the member as an
        Independent Contractor (1099); surfaces the rate fields below once
        those columns ship in a migration. Employees (W-2) leave it off. */}
    {viewerIsAdmin && <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${Z.bd}` }}>
      <div style={{ fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Employment Type</div>
      <Toggle
        checked={!!member.isFreelance}
        onChange={(next) => updateTeamMember?.(member.id, { isFreelance: next })}
        label={member.isFreelance ? "Independent Contractor (1099)" : "Employee (W-2)"}
      />
    </div>}

    {member.isFreelance && <div style={{ marginTop: 12 }}>
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

// ─── Messages panel ─────────────────────────────────────────
// Shows all team_notes to/from this member, newest first. Includes
// a quick-send input to reply or start a new thread.
function MessagesPanel({ member, team, currentUser }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    if (!member?.id) return;
    const { data, error } = await supabase.from("team_notes").select("*")
      .or(`to_user.eq.${member.id},from_user.eq.${member.id}`)
      .order("created_at", { ascending: false }).limit(100);
    if (error) { console.error("messages load:", error); return; }
    setNotes(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [member?.id]);

  // Realtime: subscribe to new team_notes touching this member
  useEffect(() => {
    if (!member?.id) return;
    const channel = supabase.channel(`team_notes_${member.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "team_notes" }, (payload) => {
        const n = payload.new;
        if (n.to_user === member.id || n.from_user === member.id) {
          setNotes(prev => [n, ...prev.filter(x => x.id !== n.id)]);
        }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [member?.id]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const fromId = currentUser?.id || currentUser?.authId || null;
    const { data, error } = await supabase.from("team_notes").insert({
      from_user: fromId,
      to_user: member.id,
      message: text,
      context_type: "general",
    }).select().single();
    if (error) console.error("messages send:", error);
    if (data) setNotes(prev => [data, ...prev]);
    setDraft("");
    setSending(false);
  };

  const markRead = async (noteId) => {
    await supabase.from("team_notes").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", noteId);
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n));
  };

  const nameFor = (uid) => (team || []).find(t => t.id === uid)?.name || "Unknown";
  const parseTask = (msg) => {
    const m = (msg || "").match(/^\[Task: ([^\]]+)\]\s*(.*)$/s);
    return m ? { task: m[1], body: m[2] } : { task: null, body: msg || "" };
  };
  const fmtWhen = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    {/* Compose */}
    <div style={{ display: "flex", gap: 8 }}>
      <Inp placeholder={`Message ${member.name}…`} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
      <Btn onClick={send} disabled={!draft.trim() || sending}>{sending ? "…" : "Send"}</Btn>
    </div>
    {/* Thread */}
    {loading ? <div style={{ padding: 24, textAlign: "center", color: Z.tm }}>Loading…</div>
    : notes.length === 0 ? <div style={{ padding: 24, textAlign: "center", color: Z.tm, fontSize: FS.sm }}>No messages yet. Send one above.</div>
    : <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 520, overflowY: "auto" }}>
      {notes.map(n => {
        const fromSelf = n.from_user !== member.id; // you sent this TO the member
        const { task, body } = parseTask(n.message);
        const unread = !n.is_read && !fromSelf;
        return <div key={n.id} onClick={() => unread && markRead(n.id)} style={{
          alignSelf: fromSelf ? "flex-end" : "flex-start",
          maxWidth: "75%",
          padding: "8px 12px",
          background: fromSelf ? Z.ac + "15" : Z.bg,
          borderLeft: unread ? `3px solid ${Z.ac}` : undefined,
          borderRadius: Ri,
          cursor: unread ? "pointer" : "default",
        }}>
          <div style={{ fontSize: FS.micro, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
            {fromSelf ? `→ ${member.name}` : `${nameFor(n.from_user)} →`} · {fmtWhen(n.created_at)}
          </div>
          {task && <div style={{ display: "inline-block", padding: "1px 8px", background: Z.wa + "20", color: Z.wa, borderRadius: Ri, fontSize: FS.micro, fontWeight: FW.heavy, marginRight: 6 }}>TASK: {task}</div>}
          <span style={{ fontSize: FS.sm, color: Z.tx, whiteSpace: "pre-wrap" }}>{body}</span>
        </div>;
      })}
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
  salespersonPubAssignments, upsertPubAssignment, deletePubAssignment,
  commissionRates, upsertCommissionRate, currentUser, isActive,
}) => {
  // Default to Dashboard view — publishers open this page to see the member's
  // realtime dashboard; Settings is a click away via the top tab.
  const [tab, setTab] = useState("Dashboard");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const member = (team || []).find(t => t.id === memberId);
  const memberName = member?.name;

  // Publish a clickable Home › Team › {member.name} breadcrumb into TopBar.
  // The "Team" crumb navigates back to the roster, replacing the inline
  // BackBtn we used to render. onNavigate is captured via a ref so the
  // effect doesn't have to re-run every parent render (handleNav in App.jsx
  // is recreated on each render and would otherwise thrash setHeader).
  const { setHeader, clearHeader } = usePageHeader();
  const onNavigateRef = useRef(onNavigate);
  useEffect(() => { onNavigateRef.current = onNavigate; });
  useEffect(() => {
    if (!isActive) { clearHeader(); return; }
    setHeader({
      breadcrumb: [
        { label: "Home" },
        { label: "Team", onClick: () => onNavigateRef.current?.("team") },
      ],
      title: memberName || "Member not found",
    });
  }, [isActive, memberName, setHeader, clearHeader]);

  if (!member) {
    return <div style={{ padding: 28 }}>
      <div style={{ padding: 40, textAlign: "center", color: Z.tm }}>Team member not found.</div>
    </div>;
  }

  const sendInvite = async () => {
    setInviting(true); setInviteResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { email: member.email, team_member_id: member.id },
      });
      if (error) setInviteResult({ error: error.message });
      else setInviteResult(data);
    } catch (err) { setInviteResult({ error: err.message }); }
    setInviting(false);
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {/* Action row — name + back nav moved to TopBar via usePageHeader. */}
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      {!member.authId && <Btn sm v="success" disabled={inviting} onClick={sendInvite}>
        <Ic.mail size={12} /> {inviting ? "Sending…" : "Connect Google"}
      </Btn>}
      {deleteTeamMember && <Btn sm v="danger" onClick={async () => {
        if (!window.confirm(`Remove ${member.name} from the team? They'll be hidden from all team listings, dropdowns, and dashboards. Their commission history, sales attribution, and story bylines stay intact.`)) return;
        await deleteTeamMember(member.id);
        onNavigate?.("team");
      }}><Ic.trash size={12} /> Remove from Team</Btn>}
    </div>

    {/* Role + contact strip — name lives in TopBar now */}
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <span style={{ fontSize: FS.sm, color: Z.ac, fontWeight: FW.semi, fontFamily: COND }}>{member.role}</span>
      <span style={{ color: Z.td }}>·</span>
      <span style={{ fontSize: FS.sm, color: Z.tm }}>{member.email}</span>
      {member.phone && <>
        <span style={{ color: Z.td }}>·</span>
        <span style={{ fontSize: FS.sm, color: Z.tm }}>{member.phone}</span>
      </>}
      {member.authId && <span style={{ fontSize: FS.micro, fontWeight: FW.bold, color: Z.go, background: Z.go + "15", padding: "3px 10px", borderRadius: 999, marginLeft: "auto" }}>Google Connected</span>}
    </div>

    {inviteResult && <div style={{ fontSize: FS.xs, padding: "6px 10px", borderRadius: Ri, background: inviteResult.success ? Z.go + "10" : Z.da + "10", color: inviteResult.success ? Z.go : Z.da }}>
      {inviteResult.success ? inviteResult.message : `Error: ${inviteResult.error}`}
    </div>}

    {/* View switcher — Dashboard (default) / Messages / Settings */}
    <TabRow><TB tabs={["Dashboard", "Messages", "Settings"]} active={tab} onChange={setTab} /></TabRow>

    {tab === "Dashboard" && <RoleDashboard
      role={member.role}
      currentUser={member}
      hideGreeting
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

    {tab === "Messages" && <GlassCard>
      <MessagesPanel member={member} team={team} currentUser={currentUser} />
    </GlassCard>}

    {tab === "Settings" && <GlassCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <WorkloadPanel member={member} clients={clients} sales={sales} stories={stories} tickets={tickets} />
        <div style={{ borderTop: `1px solid ${Z.bd}30` }} />
        {/* Two-column: Settings (Publication Assignment) + Permissions. Auto-fit
            keeps it 2-col on desktop and stacks to 1-col below ~640px viewport. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
          <SettingsPanel member={member} pubs={pubs} updateTeamMember={updateTeamMember} salespersonPubAssignments={salespersonPubAssignments} upsertPubAssignment={upsertPubAssignment} deletePubAssignment={deletePubAssignment} commissionRates={commissionRates} upsertCommissionRate={upsertCommissionRate} currentUser={currentUser} />
          <PermissionsPanel member={member} updateTeamMember={updateTeamMember} />
        </div>
        <div style={{ borderTop: `1px solid ${Z.bd}30` }} />
        <AlertsPanel member={member} updateTeamMember={updateTeamMember} />
        <div style={{ borderTop: `1px solid ${Z.bd}30` }} />
        <TransferWorkPanel member={member} team={team} currentUser={currentUser} />
      </div>
    </GlassCard>}
  </div>;
};

export default TeamMemberProfile;
