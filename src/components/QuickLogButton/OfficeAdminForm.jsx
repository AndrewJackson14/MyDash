// OfficeAdminForm — manual quick-log for ad-hoc admin tasks.
//
// Fields: description (required), team member tagged (optional —
// for "helped Dana with X" entries), business/client (optional),
// publication (optional). Writes:
//   - helped_team_member if a team member is tagged
//   - manual_task_logged otherwise
// Both land with manual_log category so they DO surface in Hayley's
// stream (per spec — admin's narrative is part of the team texture).

import { useMemo, useState } from "react";
import { Z, COND, FS, FW, Ri } from "../../lib/theme";
import { Field, SubmitRow, inputStyle } from "./QuickLogModal";

export default function OfficeAdminForm({ clients, team, onSubmit, submitting }) {
  const [description, setDescription] = useState("");
  const [teamMemberId, setTeamMemberId] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [clientId, setClientId] = useState(null);
  const [clientName, setClientName] = useState("");

  const teamMembers = useMemo(() =>
    (team || []).filter(t => t.isActive !== false && !t.isHidden),
    [team]
  );

  const matches = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q || clientId) return [];
    return clients.filter(c => (c.name || "").toLowerCase().includes(q)).slice(0, 6);
  }, [clientQuery, clients, clientId]);

  const handle = () => {
    if (!description.trim()) return;
    const eventType = teamMemberId ? "helped_team_member" : "manual_task_logged";
    onSubmit({
      p_event_type:     eventType,
      p_summary:        description.trim(),
      p_event_category: "manual_log",
      p_event_source:   "manual",
      p_client_id:      clientId || null,
      p_client_name:    clientName || null,
      p_related_user_id: teamMemberId || null,
      p_visibility:     "team",
    });
  };

  return (
    <>
      <Field label="What did you do?">
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          autoFocus
          placeholder="e.g. Helped Dana fix Templeton billing address"
          style={inputStyle}
        />
      </Field>

      <Field label="Team member (optional)">
        <select
          value={teamMemberId}
          onChange={e => setTeamMemberId(e.target.value)}
          style={inputStyle}
        >
          <option value="">— none —</option>
          {teamMembers.map(t => (
            <option key={t.id} value={t.id}>{t.name} · {t.role}</option>
          ))}
        </select>
      </Field>

      <Field label="Business / client (optional)">
        {clientId ? (
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 12px", background: Z.bg, border: `1px solid ${Z.bd}`,
            borderRadius: Ri,
          }}>
            <span style={{ fontSize: FS.sm, color: Z.tx, fontWeight: FW.semi, fontFamily: COND }}>{clientName}</span>
            <button
              onClick={() => { setClientId(null); setClientName(""); setClientQuery(""); }}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: Z.tm, fontSize: FS.xs, fontFamily: COND }}
            >Change</button>
          </div>
        ) : (
          <>
            <input
              value={clientQuery}
              onChange={e => setClientQuery(e.target.value)}
              placeholder="Type to search…"
              style={inputStyle}
            />
            {matches.length > 0 && (
              <div style={{
                marginTop: 4,
                background: Z.bg, border: `1px solid ${Z.bd}`, borderRadius: Ri,
                maxHeight: 180, overflowY: "auto",
              }}>
                {matches.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setClientId(c.id); setClientName(c.name); setClientQuery(""); }}
                    style={{
                      display: "block", width: "100%",
                      padding: "8px 12px", textAlign: "left",
                      background: "transparent", border: "none",
                      color: Z.tx, fontSize: FS.sm, fontFamily: COND,
                      cursor: "pointer",
                    }}
                  >{c.name}</button>
                ))}
              </div>
            )}
          </>
        )}
      </Field>

      <SubmitRow onClick={handle} disabled={!description.trim() || submitting}>
        {submitting ? "Logging…" : "Log entry"}
      </SubmitRow>
    </>
  );
}
