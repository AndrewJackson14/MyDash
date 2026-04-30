// SalesCallForm — phone call quick-log for sales reps.
//
// Fields: client (autocomplete), outcome dropdown, optional notes,
// publication (auto-suggested from client's most recent active sale).
// Writes phone_call_logged event with effort category. Effort events
// don't surface in Hayley's stream — they roll up to the rep's own
// dashboard target progress.

import { useMemo, useState } from "react";
import { Z, COND, FS, FW, Ri } from "../../lib/theme";
import { Field, SubmitRow, inputStyle } from "./QuickLogModal";

const OUTCOMES = [
  { value: "connected",      label: "Connected" },
  { value: "left_voicemail", label: "Left voicemail" },
  { value: "no_answer",      label: "No answer" },
  { value: "not_interested", label: "Not interested" },
  { value: "interested",     label: "Interested" },
];

export default function SalesCallForm({ clients, onSubmit, submitting }) {
  const [clientQuery, setClientQuery] = useState("");
  const [clientId, setClientId] = useState(null);
  const [clientName, setClientName] = useState("");
  const [outcome, setOutcome] = useState("connected");
  const [notes, setNotes] = useState("");

  const matches = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q || clientId) return [];
    return clients
      .filter(c => (c.name || "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [clientQuery, clients, clientId]);

  const handle = () => {
    if (!clientId) return;
    const summary = `Called ${clientName}${notes.trim() ? ` — ${notes.trim()}` : ""}`;
    onSubmit({
      p_event_type:     "phone_call_logged",
      p_summary:        summary,
      p_event_category: "effort",
      p_event_source:   "manual",
      p_client_id:      clientId,
      p_client_name:    clientName,
      p_metadata:       { outcome, notes: notes.trim() || null },
      p_visibility:     "team",
    });
  };

  return (
    <>
      <Field label="Client">
        {clientId ? (
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 12px", background: Z.bg, border: `1px solid ${Z.bd}`,
            borderRadius: Ri,
          }}>
            <span style={{ fontSize: FS.sm, color: Z.tx, fontWeight: FW.semi, fontFamily: COND }}>{clientName}</span>
            <button
              onClick={() => { setClientId(null); setClientName(""); setClientQuery(""); }}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: Z.tm, fontSize: 11, fontFamily: COND }}
            >Change</button>
          </div>
        ) : (
          <>
            <input
              value={clientQuery}
              onChange={e => setClientQuery(e.target.value)}
              autoFocus
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

      <Field label="Outcome">
        <select value={outcome} onChange={e => setOutcome(e.target.value)} style={inputStyle}>
          {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      <Field label="Notes (optional)">
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="Anything from the call worth tracking?"
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </Field>

      <SubmitRow onClick={handle} disabled={!clientId || submitting}>
        {submitting ? "Logging…" : "Log call"}
      </SubmitRow>
    </>
  );
}
