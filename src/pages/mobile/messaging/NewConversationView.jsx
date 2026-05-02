// ============================================================
// NewConversationView — pick a teammate to start a DM with.
// Filters team to active, non-self, has display_name. Tapping a
// row calls getOrCreateDM and navigates into the new conversation.
// ============================================================
import { useMemo, useState } from "react";
import { TOKENS, SURFACE, ACCENT, INK, TYPE } from "../mobileTokens";
import { Ic } from "../../../components/ui";
import { getOrCreateDM } from "../../../lib/messaging";

export default function NewConversationView({ currentPersonId, team, onCancel, onCreated }) {
  const [query, setQuery]     = useState("");
  const [busyId, setBusyId]   = useState(null);
  const [error, setError]     = useState(null);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (team || [])
      .filter(t => t.id && t.id !== currentPersonId)
      .filter(t => (t.isActive ?? t.status === "active") !== false)
      .filter(t => !t.is_hidden && !t.isHidden)
      .filter(t => !q || (t.name || t.display_name || "").toLowerCase().includes(q) || (t.email || "").toLowerCase().includes(q))
      .sort((a, b) => (a.name || a.display_name || "").localeCompare(b.name || b.display_name || ""));
  }, [team, query, currentPersonId]);

  const start = async (other) => {
    setBusyId(other.id);
    setError(null);
    try {
      const convoId = await getOrCreateDM(currentPersonId, other.id);
      onCreated?.(convoId);
    } catch (e) {
      setError(e?.message || "Failed to start conversation");
      setBusyId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 56px - env(safe-area-inset-bottom))" }}>
      {/* Header */}
      <div style={{
        flex: "0 0 auto",
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 12px",
        borderBottom: `1px solid ${TOKENS.rule}`,
        background: SURFACE.elevated,
      }}>
        <button onClick={onCancel} aria-label="Back" style={{
          width: 40, height: 40, borderRadius: 20,
          background: "transparent", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: INK,
        }}><Ic.back size={20} /></button>
        <div style={{ ...TYPE.heading, color: INK }}>New conversation</div>
      </div>

      {/* Search */}
      <div style={{
        flex: "0 0 auto",
        padding: "10px 12px",
        background: SURFACE.elevated,
        borderBottom: `1px solid ${TOKENS.rule}`,
      }}>
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search team…"
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "10px 14px",
            border: `1px solid ${TOKENS.rule}`,
            borderRadius: 22,
            background: SURFACE.alt, color: INK,
            ...TYPE.body, fontFamily: "inherit",
            outline: "none",
          }}
        />
      </div>

      {error && (
        <div style={{ padding: "8px 16px", background: "#fff5f5", color: TOKENS.urgent, ...TYPE.small }}>
          {error}
        </div>
      )}

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", background: SURFACE.alt }}>
        {candidates.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", color: TOKENS.muted, ...TYPE.small }}>
            {query ? "No matches." : "No teammates available."}
          </div>
        )}
        {candidates.map(t => {
          const busy = busyId === t.id;
          return (
            <button
              key={t.id}
              onClick={() => start(t)}
              disabled={!!busyId}
              style={{
                width: "100%", textAlign: "left",
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 16px",
                background: SURFACE.primary, border: "none",
                borderTop: `1px solid ${TOKENS.rule}`,
                cursor: busyId ? "default" : "pointer",
                fontFamily: "inherit",
                opacity: busyId && !busy ? 0.4 : 1,
              }}
            >
              <Avatar people={t} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  ...TYPE.body, color: INK, fontWeight: 600,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{t.name || t.display_name || "(unnamed)"}</div>
                <div style={{
                  ...TYPE.small, color: TOKENS.muted,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{t.role || ""}</div>
              </div>
              {busy && <span style={{ ...TYPE.small, color: TOKENS.muted }}>…</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Avatar({ people }) {
  const url = people?.avatar_url;
  const name = people?.name || people?.display_name || "?";
  const parts = String(name).trim().split(/\s+/);
  const initials = ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 20,
      background: url ? `center/cover url(${url})` : TOKENS.rule,
      color: INK,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 13, fontWeight: 700,
      flexShrink: 0,
    }}>{!url && initials}</div>
  );
}
