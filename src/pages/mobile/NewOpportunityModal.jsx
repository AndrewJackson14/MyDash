// NewOpportunityModal — capture a Discovery sale on the spot.
//
// Per Spec 056 §1.2 the desktop owns the formal proposal authoring;
// mobile gives Dana a way to LOG the deal exists ("met with Bella
// Fonti — interested in 6-issue full page, ~$5K") so it lands in
// Pipeline immediately and her desktop session can flesh it out
// later. Saves the trip back to the laptop just to remember.
import { useState } from "react";
import { TOKENS, SURFACE, INK, ACCENT, GOLD, fmtMoneyFull, todayISO } from "./mobileTokens";

export default function NewOpportunityModal({ client, pubs, onClose, onSave }) {
  const [name, setName] = useState("");
  const [pubId, setPubId] = useState("");
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState("Discovery");
  const [notes, setNotes] = useState("");
  const [nextActionDate, setNextActionDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        clientId: client.id,
        publication: pubId || null,
        name: name.trim() || `Opportunity — ${client.name}`,
        amount: parseFloat(amount) || 0,
        status: stage,
        date: todayISO(),
        nextAction: { type: "follow_up", label: "Follow up" },
        nextActionDate,
        oppNotes: notes.trim() ? [{ id: "n" + Date.now(), text: notes.trim(), date: todayISO(), source: "mobile" }] : [],
      });
      onClose();
    } catch (e) {
      setError(String(e?.message ?? e));
      setSaving(false);
    }
  };

  return <div style={{ position: "fixed", inset: 0, zIndex: 110, display: "flex", flexDirection: "column", background: "rgba(0,0,0,0.55)" }}>
    <div onClick={onClose} style={{ flex: 1 }} />
    <div style={{
      background: SURFACE.elevated,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingBottom: "env(safe-area-inset-bottom)",
      maxHeight: "92vh", overflowY: "auto",
    }}>
      <div style={{ width: 40, height: 4, background: TOKENS.rule, borderRadius: 2, margin: "12px auto 4px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 18px 4px" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: INK }}>New opportunity</div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: TOKENS.muted, fontSize: 14, fontWeight: 600, padding: 4 }}>Cancel</button>
      </div>

      <div style={{ padding: "8px 18px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ padding: "10px 14px", background: SURFACE.alt, borderRadius: 10, fontSize: 13, color: TOKENS.muted, lineHeight: 1.4 }}>
          Logging a quick deal for <strong style={{ color: INK }}>{client.name}</strong>. Build the formal proposal on desktop later.
        </div>

        <Field label="What's the deal?">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Half-page, Nov–Apr issues" style={inputStyle} autoFocus />
        </Field>

        <Field label="Publication (optional)">
          <select value={pubId} onChange={e => setPubId(e.target.value)} style={inputStyle}>
            <option value="">—</option>
            {(pubs || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Estimated $">
            <input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" style={inputStyle} />
          </Field>
          <Field label="Stage">
            <select value={stage} onChange={e => setStage(e.target.value)} style={inputStyle}>
              {["Discovery", "Presentation", "Proposal", "Negotiation"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Follow up by">
          <input type="date" value={nextActionDate} onChange={e => setNextActionDate(e.target.value)} style={inputStyle} />
        </Field>

        <Field label="Notes (optional)">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Anything you want to remember when you build the proposal…" style={{ ...inputStyle, resize: "vertical", minHeight: 80 }} />
        </Field>

        {error && <div style={{ padding: "10px 12px", background: TOKENS.urgent + "12", borderRadius: 8, color: TOKENS.urgent, fontSize: 13 }}>{error}</div>}

        <button
          onClick={submit}
          disabled={saving}
          style={{
            width: "100%", padding: "14px", minHeight: 52,
            background: saving ? TOKENS.rule : ACCENT,
            color: saving ? TOKENS.muted : "#FFFFFF",
            border: "none", borderRadius: 10,
            fontSize: 16, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
            marginTop: 4,
          }}
        >{saving ? "Saving…" : `Save${amount ? ` · ${fmtMoneyFull(parseFloat(amount) || 0)}` : ""}`}</button>
      </div>
    </div>
  </div>;
}

function Field({ label, children }) {
  return <div>
    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: TOKENS.muted, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>{label}</label>
    {children}
  </div>;
}

const inputStyle = {
  width: "100%", boxSizing: "border-box",
  padding: "12px 14px", minHeight: 48,
  fontSize: 16, color: INK,
  background: SURFACE.alt, border: `1px solid ${TOKENS.rule}`,
  borderRadius: 10, outline: "none",
  fontFamily: "inherit",
};
