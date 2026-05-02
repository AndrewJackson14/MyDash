// ============================================================
// ConversationList — mobile inbox view. Rendered by MessagingView
// when no conversation is active. Tap a row to open it; tap the +
// button (top right of the list header) to start a new DM.
// ============================================================
import { TOKENS, SURFACE, ACCENT, INK, TYPE, fmtRelative } from "../mobileTokens";
import { Ic } from "../../../components/ui";

export default function ConversationList({ conversations, loading, currentPersonId, onPick, onNew, onClose }) {
  return (
    <div style={{ padding: "12px 0 80px", minHeight: "100%", overflowY: "auto" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 8, padding: "8px 12px 12px",
      }}>
        {onClose ? (
          <button
            onClick={onClose}
            aria-label="Close messages"
            style={{
              width: 36, height: 36, borderRadius: 18,
              background: "transparent", color: INK,
              border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, lineHeight: 1, fontWeight: 400,
              fontFamily: "inherit",
            }}
          >×</button>
        ) : <div style={{ width: 36 }} />}
        <div style={{ ...TYPE.heading, color: INK, flex: 1, textAlign: "center" }}>Messages</div>
        <button
          onClick={onNew}
          aria-label="New conversation"
          style={{
            width: 36, height: 36, borderRadius: 18,
            background: ACCENT, color: "#FFFFFF",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        ><Ic.plus size={18} /></button>
      </div>

      {loading && (
        <div style={{ padding: 24, textAlign: "center", color: TOKENS.muted, ...TYPE.small }}>
          Loading…
        </div>
      )}

      {!loading && conversations.length === 0 && (
        <div style={{ padding: "40px 24px", textAlign: "center" }}>
          <div style={{ ...TYPE.body, color: INK, marginBottom: 6 }}>No messages yet.</div>
          <div style={{ ...TYPE.small, color: TOKENS.muted, marginBottom: 16 }}>
            Tap the + button to start a conversation.
          </div>
        </div>
      )}

      {!loading && conversations.map(c => (
        <Row key={c.id} convo={c} currentPersonId={currentPersonId} onClick={() => onPick(c)} />
      ))}
    </div>
  );
}

function Row({ convo, currentPersonId, onClick }) {
  const last     = convo.lastMessage;
  const unread   = convo.unread > 0;
  const preview  = last
    ? (last.sender_id === currentPersonId ? "You: " : "") + (last.message || "").slice(0, 80)
    : "No messages yet";
  const stamp    = last ? fmtRelative(last.created_at) : "";

  return (
    <button onClick={onClick} style={{
      width: "100%", textAlign: "left",
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 16px",
      background: SURFACE.primary, border: "none",
      borderTop: `1px solid ${TOKENS.rule}`,
      cursor: "pointer", fontFamily: "inherit",
    }}>
      <Avatar people={convo.participants?.[0]} fallback={convo.displayName} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <div style={{
            ...TYPE.body, color: INK,
            fontWeight: unread ? 700 : 600,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            flex: 1,
          }}>{convo.displayName}</div>
          <div style={{ ...TYPE.caption, color: TOKENS.muted, flexShrink: 0 }}>{stamp}</div>
        </div>
        <div style={{
          ...TYPE.small, color: unread ? INK : TOKENS.muted,
          fontWeight: unread ? 600 : 400,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          marginTop: 2,
        }}>{preview}</div>
      </div>
      {unread && (
        <div style={{
          minWidth: 22, height: 22, padding: "0 7px",
          borderRadius: 11,
          background: ACCENT, color: "#FFFFFF",
          fontSize: 11, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>{convo.unread > 99 ? "99+" : convo.unread}</div>
      )}
    </button>
  );
}

function Avatar({ people, fallback }) {
  const url = people?.avatar_url;
  const initials = (() => {
    const name = people?.display_name || fallback || "?";
    const parts = String(name).trim().split(/\s+/);
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
  })();
  return (
    <div style={{
      width: 44, height: 44, borderRadius: 22,
      background: url ? `center/cover url(${url})` : TOKENS.rule,
      color: INK,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 14, fontWeight: 700,
      flexShrink: 0,
    }}>
      {!url && initials}
    </div>
  );
}
