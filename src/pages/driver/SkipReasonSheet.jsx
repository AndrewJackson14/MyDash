// SkipReasonSheet — bottom sheet that appears when driver taps Skip.
//
// Six fixed reasons + an optional note. Some reasons auto-create a
// Service Desk ticket assigned to Cami (refused / couldn't_find /
// unsafe / other). 'Closed' and 'rack_full' log only — they're
// expected operational states, not problems to escalate.
import { useState } from "react";

const TEXT = "#E8EAED";
const MUTED = "#94A3B8";
const RED = "#C53030";
const BG = "#1A1F2E";
const BD = "#2D3548";

const REASONS = [
  { value: "closed",        label: "Closed",          escalate: false, hint: "Store was closed when I arrived" },
  { value: "refused",       label: "Refused",         escalate: true,  hint: "They didn't want any" },
  { value: "rack_full",     label: "Rack full",       escalate: false, hint: "Old papers still there" },
  { value: "couldnt_find",  label: "Couldn't find",   escalate: true,  hint: "Address wrong / can't access" },
  { value: "unsafe",        label: "Unsafe",          escalate: true,  hint: "I felt unsafe stopping" },
  { value: "other",         label: "Other",           escalate: true,  hint: "Open note required" },
];

export default function SkipReasonSheet({ open, onSubmit, onCancel }) {
  const [reason, setReason] = useState(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;
  const reasonObj = REASONS.find(r => r.value === reason);
  const noteRequired = reason === "other";
  const canSubmit = !!reason && !submitting && (!noteRequired || notes.trim().length > 0);

  return <div
    onClick={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}
    style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}
  >
    <div style={{
      width: "100%", maxWidth: 480,
      background: BG, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: "20px 20px 32px",
      maxHeight: "80vh", overflowY: "auto",
      animation: "slideUp 0.2s ease-out",
    }}>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>

      <div style={{
        width: 40, height: 4, background: BD, borderRadius: 2,
        margin: "0 auto 16px",
      }} />

      <div style={{ fontSize: 18, fontWeight: 800, color: TEXT, marginBottom: 4 }}>Why are you skipping?</div>
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 18 }}>Tap one — Cami sees these and follows up if needed.</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {REASONS.map(r => {
          const selected = reason === r.value;
          return <button
            key={r.value}
            onClick={() => setReason(r.value)}
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "14px 16px", minHeight: 56,
              background: selected ? RED + "22" : "transparent",
              border: `2px solid ${selected ? RED : BD}`,
              borderRadius: 10,
              color: TEXT, fontSize: 16, fontWeight: 600,
              cursor: "pointer", textAlign: "left",
            }}
          >
            <span>{r.label}</span>
            {r.escalate && <span style={{ fontSize: 10, fontWeight: 800, color: RED, textTransform: "uppercase", letterSpacing: 0.5 }}>creates ticket</span>}
          </button>;
        })}
      </div>

      {reasonObj?.hint && <div style={{ fontSize: 12, color: MUTED, marginBottom: 8, fontStyle: "italic" }}>
        {reasonObj.hint}
      </div>}

      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder={noteRequired ? "Required: explain what happened" : "Optional note for Cami…"}
        rows={3}
        style={{
          width: "100%", padding: "10px 12px",
          background: "#0F1419", color: TEXT,
          border: `1px solid ${BD}`, borderRadius: 8,
          fontSize: 16, resize: "vertical", boxSizing: "border-box",
          fontFamily: "inherit",
        }}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button onClick={onCancel} style={{
          flex: 1, padding: "14px", minHeight: 56,
          background: "transparent", color: MUTED, border: `1px solid ${BD}`,
          borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: "pointer",
        }}>Back</button>
        <button
          onClick={async () => {
            if (!canSubmit) return;
            setSubmitting(true);
            await onSubmit?.({ reason, notes: notes.trim(), escalate: !!reasonObj?.escalate });
            setSubmitting(false);
          }}
          disabled={!canSubmit}
          style={{
            flex: 2, padding: "14px", minHeight: 56,
            background: canSubmit ? RED : BD, color: "#FFFFFF",
            border: "none", borderRadius: 10, fontSize: 16, fontWeight: 800,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >{submitting ? "Skipping…" : "Skip → next stop"}</button>
      </div>
    </div>
  </div>;
}
