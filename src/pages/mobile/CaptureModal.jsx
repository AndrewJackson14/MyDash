// CaptureModal — Spec 056 §6 anchor screen.
//
// MVP shape: pick a type (Call / Email / Meeting / Note), fuzzy
// search to pick a client, free-text note, save. Writes to
// client.comms via the existing setClients flow on useAppData.
//
// Not in MVP (deferred): voice recording + Whisper transcription,
// keyword auto-detection, templates, photo attachment, geo-aware
// nearest-client guess, offline queue. All of that is Spec 056
// Phase 4 — gets the green light once Phase 1 ships and Dana
// validates the IA.
import { useEffect, useRef, useState } from "react";
import { useAppData } from "../../hooks/useAppData";
import { TOKENS, SURFACE, INK, ACCENT, GOLD, fmtRelative, todayISO } from "./mobileTokens";

const TYPES = [
  { value: "Call",    icon: "📞", color: ACCENT },
  { value: "Email",   icon: "✉️", color: ACCENT },
  { value: "Meeting", icon: "🗓", color: GOLD },
  { value: "Note",    icon: "📝", color: TOKENS.muted },
];

export default function CaptureModal({ onClose }) {
  const appData = useAppData();
  const clients = appData.clients || [];
  const setClients = appData.setClients;
  const [type, setType] = useState("Call");
  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const noteRef = useRef(null);

  // Filtered client list — capped to top 6 hits to keep it scannable.
  const matches = !search.trim() ? [] : clients.filter(c => (c.name || "").toLowerCase().includes(search.toLowerCase().trim())).slice(0, 6);

  const selectedClient = clientId ? clients.find(c => c.id === clientId) : null;

  useEffect(() => {
    // Auto-focus the search on open since picking a client is
    // almost always step 1.
    const t = setTimeout(() => {
      const input = document.getElementById("capture-search");
      if (input) input.focus();
    }, 120);
    return () => clearTimeout(t);
  }, []);

  const canSave = !!clientId && !!type && (note.trim().length > 0 || type === "Call");

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const newComm = {
        id: "cm" + Date.now(),
        type,
        author: "Account Manager",
        date: todayISO(),
        note: note.trim() || (type === "Call" ? "Connected" : ""),
      };
      // Optimistic local update; useAppData persists on the next
      // setClients write via its own Supabase wiring.
      setClients(cl => cl.map(c => c.id === clientId ? { ...c, comms: [...(c.comms || []), newComm] } : c));
      onClose();
    } catch (e) {
      alert("Save failed: " + String(e?.message ?? e));
      setSaving(false);
    }
  };

  return <div style={{
    position: "fixed", inset: 0, zIndex: 100,
    display: "flex", flexDirection: "column",
    background: "rgba(0,0,0,0.55)",
  }}>
    <div onClick={onClose} style={{ flex: 1 }} />
    <div style={{
      background: SURFACE.elevated,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: "16px 16px calc(20px + env(safe-area-inset-bottom))",
      maxHeight: "92vh", overflowY: "auto",
      animation: "slideUp 0.2s ease-out",
    }}>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

      {/* Drag handle */}
      <div style={{ width: 40, height: 4, background: TOKENS.rule, borderRadius: 2, margin: "0 auto 12px" }} />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: INK }}>Log interaction</div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: TOKENS.muted, fontSize: 14, fontWeight: 600 }}>Cancel</button>
      </div>

      {/* Type picker */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 14 }}>
        {TYPES.map(t => {
          const isActive = type === t.value;
          return <button key={t.value} onClick={() => setType(t.value)} style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 4, padding: "10px 4px", minHeight: 64,
            background: isActive ? t.color + "12" : SURFACE.alt,
            color: isActive ? t.color : TOKENS.muted,
            border: `2px solid ${isActive ? t.color : "transparent"}`,
            borderRadius: 10,
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>{t.icon}</span>
            <span>{t.value}</span>
          </button>;
        })}
      </div>

      {/* Client picker */}
      {!selectedClient ? <>
        <input
          id="capture-search"
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search a client…"
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "12px 14px", minHeight: 48,
            fontSize: 16, color: INK,
            background: SURFACE.alt, border: `1px solid ${TOKENS.rule}`,
            borderRadius: 10, outline: "none",
            marginBottom: 8,
          }}
        />
        {matches.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
          {matches.map(c => <button key={c.id} onClick={() => setClientId(c.id)} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 14px", minHeight: 48,
            background: SURFACE.alt, border: "none", borderRadius: 10,
            cursor: "pointer", textAlign: "left",
            fontSize: 15, fontWeight: 600, color: INK,
          }}>
            <span>{c.name}</span>
            <span style={{ fontSize: 12, color: TOKENS.muted, fontWeight: 500 }}>{c.status}</span>
          </button>)}
        </div>}
      </> : <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 14px", marginBottom: 12,
        background: ACCENT + "10", borderRadius: 10,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: TOKENS.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>Client</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>{selectedClient.name}</div>
        </div>
        <button onClick={() => { setClientId(null); setSearch(""); }} style={{ background: "transparent", border: "none", cursor: "pointer", color: ACCENT, fontSize: 13, fontWeight: 600 }}>Change</button>
      </div>}

      {/* Note */}
      {selectedClient && <textarea
        ref={noteRef}
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder={type === "Call" ? "What happened? (optional — defaults to 'Connected')" : "Add a note…"}
        rows={4}
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "12px 14px", minHeight: 96,
          fontSize: 16, color: INK,
          background: SURFACE.alt, border: `1px solid ${TOKENS.rule}`,
          borderRadius: 10, outline: "none", resize: "vertical",
          fontFamily: "inherit",
          marginBottom: 14,
        }}
      />}

      {/* Save */}
      <button
        onClick={save}
        disabled={!canSave || saving}
        style={{
          width: "100%", padding: "14px", minHeight: 52,
          background: canSave && !saving ? ACCENT : TOKENS.rule,
          color: canSave && !saving ? "#FFFFFF" : TOKENS.muted,
          border: "none", borderRadius: 10,
          fontSize: 16, fontWeight: 700,
          cursor: canSave && !saving ? "pointer" : "not-allowed",
        }}
      >{saving ? "Saving…" : selectedClient ? "Save" : "Pick a client first"}</button>

      <div style={{ fontSize: 11, color: TOKENS.muted, textAlign: "center", marginTop: 10 }}>
        Voice + photo + offline queue coming next iteration.
      </div>
    </div>
  </div>;
}
