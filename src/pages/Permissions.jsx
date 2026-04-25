import { useState } from "react";
import { Z, COND, DISPLAY, R, Ri, FS, FW, ZI } from "../lib/theme";
import { Ic, Btn, Badge, GlassCard, PageHeader, DataTable } from "../components/ui";

const MODULES = [
  { key: "dashboard", label: "Dashboard", icon: "📊" },
  { key: "sales", label: "Sales Pipeline", icon: "💰" },
  { key: "clients", label: "Client Profiles", icon: "👤" },
  { key: "proposals", label: "Proposals", icon: "📋" },
  { key: "commissions", label: "Commissions", icon: "💵" },
  { key: "stories", label: "Stories / Editorial", icon: "✏️" },
  { key: "flatplan", label: "Flatplan / Layout", icon: "📐" },
  { key: "layout", label: "Layout Console", icon: "📰" },
  { key: "printers", label: "Printers", icon: "🖨" },
  { key: "publications", label: "Publications / Schedule", icon: "📰" },
  { key: "billing", label: "Billing / Invoices", icon: "🧾" },
  { key: "circulation", label: "Circulation / Subscribers", icon: "📬" },
  { key: "service_desk", label: "Service Desk", icon: "🎧" },
  { key: "legal_notices", label: "Legal Notices", icon: "⚖️" },
  // P2.27 — Creative Jobs retired in favor of AdProjects.
  { key: "classifieds", label: "Classified Ads", icon: "📰" },
  { key: "merch", label: "Merch", icon: "🏷" },
  { key: "calendar", label: "Calendar", icon: "📅" },
  { key: "analytics", label: "Analytics", icon: "📈" },
  { key: "team", label: "Team Management", icon: "👥" },
  { key: "permissions", label: "Permissions", icon: "🔒" },
  { key: "integrations", label: "Integrations / Settings", icon: "⚙️" },
];

const ROLE_DEFAULTS = {
  Publisher: MODULES.map(m => m.key),
  Salesperson: ["dashboard", "sales", "clients", "proposals", "commissions", "flatplan", "publications", "billing", "calendar"],
  "Content Editor": ["dashboard", "stories", "flatplan", "calendar"],
  "Layout Designer": ["dashboard", "stories", "flatplan", "layout", "printers", "publications", "legal_notices", "calendar"],
  "Ad Designer": ["dashboard", "calendar", "adprojects", "medialibrary", "stories", "flatplan", "performance"],
  "Office Administrator": ["dashboard", "billing", "circulation", "service_desk", "legal_notices", "calendar"],
};

const Permissions = ({ team, updateTeamMember }) => {
  const [saving, setSaving] = useState(null);
  const isDk = Z.bg === "#08090D";

  // Filter out hidden admin accounts
  const visibleTeam = (team || []).filter(t => !t.isHidden);

  const toggleModule = async (member, moduleKey) => {
    const current = member.modulePermissions || [];
    const updated = current.includes(moduleKey)
      ? current.filter(k => k !== moduleKey)
      : [...current, moduleKey];
    
    setSaving(member.id + moduleKey);
    if (updateTeamMember) {
      await updateTeamMember(member.id, { modulePermissions: updated });
    }
    setSaving(null);
  };

  const resetToRoleDefaults = async (member) => {
    const defaults = ROLE_DEFAULTS[member.role] || ["dashboard", "calendar"];
    setSaving(member.id + "_reset");
    if (updateTeamMember) {
      await updateTeamMember(member.id, { modulePermissions: defaults });
    }
    setSaving(null);
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="Permissions" />

    <GlassCard noPad style={{ overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: COND }}>
        <thead>
          <tr>
            <th style={{ position: "sticky", left: 0, zIndex: ZI.raised, background: isDk ? "rgba(18,20,28,0.92)" : "rgba(240,241,244,0.95)", padding: "10px 14px", textAlign: "left", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `1px solid ${Z.bd}`, minWidth: 160 }}>
              Team Member
            </th>
            {MODULES.map(m => (
              <th key={m.key} style={{ padding: "10px 6px", textAlign: "center", fontSize: 9, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", letterSpacing: 0.3, borderBottom: `1px solid ${Z.bd}`, whiteSpace: "nowrap", minWidth: 50 }}>
                <div style={{ fontSize: FS.sm, marginBottom: 2 }}>{m.icon}</div>
                {m.label.split(" / ")[0].split(" ")[0]}
              </th>
            ))}
            <th style={{ padding: "10px 14px", textAlign: "center", fontSize: FS.xs, fontWeight: FW.heavy, color: Z.td, textTransform: "uppercase", borderBottom: `1px solid ${Z.bd}` }}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleTeam.map(member => {
            const perms = member.modulePermissions || [];
            return <tr key={member.id}>
              <td style={{ position: "sticky", left: 0, zIndex: ZI.raised, background: isDk ? "rgba(18,20,28,0.92)" : "rgba(240,241,244,0.95)", padding: "10px 14px", borderBottom: `1px solid ${isDk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` }}>
                <div style={{ fontSize: FS.md, fontWeight: FW.semi, color: Z.tx }}>{member.name}</div>
                <div style={{ fontSize: FS.sm, color: Z.tm }}>{member.role}</div>
              </td>
              {MODULES.map(m => {
                const has = perms.includes(m.key);
                const isSaving = saving === member.id + m.key;
                return <td key={m.key} onClick={() => toggleModule(member, m.key)} style={{ padding: "10px 6px", textAlign: "center", borderBottom: `1px solid ${isDk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, cursor: "pointer" }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: Ri, margin: "0 auto",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: has ? Z.go + "20" : "transparent",
                    border: `1.5px solid ${has ? Z.go : isDk ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
                    color: has ? Z.go : "transparent",
                    fontSize: FS.sm, fontWeight: FW.black,
                    transition: "all 0.15s",
                    opacity: isSaving ? 0.4 : 1,
                  }}>
                    {has ? "✓" : ""}
                  </div>
                </td>;
              })}
              <td style={{ padding: "10px 14px", textAlign: "center", borderBottom: `1px solid ${isDk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` }}>
                <Btn sm v="ghost" onClick={() => resetToRoleDefaults(member)} disabled={saving === member.id + "_reset"}>
                  Reset
                </Btn>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </GlassCard>

    <GlassCard>
      <div style={{ fontSize: FS.sm, color: Z.tm, lineHeight: 1.6 }}>
        <span style={{ fontWeight: FW.bold, color: Z.tx }}>How permissions work:</span> Each checkmark grants access to that module in the sidebar navigation. Click any cell to toggle access. Use "Reset" to restore the default permissions for that team member's role. Changes are saved immediately.
      </div>
    </GlassCard>
  </div>;
};

export default Permissions;
