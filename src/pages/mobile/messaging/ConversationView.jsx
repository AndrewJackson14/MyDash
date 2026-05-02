// ============================================================
// ConversationView — single-thread view. Header with back arrow +
// participant name(s); scrollable message list; sticky input at
// bottom above the mobile tab bar.
//
// The outer wrapper is sized to exactly the viewport space between
// the mobile TopBar (60px) and the bottom TabBar (72px + safe-area).
// Inside, header + input are flex:0 and the message list is flex:1
// with its own scroll, so the input never scrolls off-screen even
// when the message list is tall enough to need scrolling.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { TOKENS, SURFACE, ACCENT, INK, TYPE, fmtRelative } from "../mobileTokens";
import { Ic } from "../../../components/ui";
import { useConvoMessages } from "../../../lib/messaging";

// Total chrome above + below the messaging area: ~60px TopBar +
// 72px TabBar + safe-area inset at the bottom. Wrapped in a single
// height calc so ConversationView and NewConversationView stay in
// sync if the chrome heights ever change.
const MESSAGING_AREA_HEIGHT = "calc(100dvh - 60px - 72px - env(safe-area-inset-bottom))";

export default function ConversationView({ conversation, currentPersonId, onBack }) {
  const conversationId = conversation?.id || null;
  const { messages, loading, sendMessage } = useConvoMessages(conversationId, currentPersonId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    try { await sendMessage(draft); setDraft(""); }
    catch (e) { console.error("[messaging] send failed:", e); }
    finally { setSending(false); }
  };

  if (!conversation) {
    return <div style={{ padding: 24, ...TYPE.body, color: TOKENS.muted }}>Conversation not found.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: MESSAGING_AREA_HEIGHT }}>
      {/* Header */}
      <div style={{
        flex: "0 0 auto",
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 12px",
        borderBottom: `1px solid ${TOKENS.rule}`,
        background: SURFACE.elevated,
      }}>
        <button onClick={onBack} aria-label="Back" style={{
          width: 40, height: 40, borderRadius: 20,
          background: "transparent", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: INK,
        }}><Ic.back size={20} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            ...TYPE.body, color: INK, fontWeight: 700,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{conversation.displayName}</div>
          {conversation.type !== "dm" && (
            <div style={{ ...TYPE.caption, color: TOKENS.muted }}>
              {(conversation.participants || []).length} participants
            </div>
          )}
        </div>
      </div>

      {/* Messages — minHeight:0 is load-bearing here. Without it, the
          flex item refuses to shrink below its content size and the
          internal overflowY:auto never kicks in, so a tall thread
          pushes the input bar (and sometimes the header) off-screen
          instead of scrolling within the messages area. */}
      <div ref={scrollRef} style={{
        flex: "1 1 0",
        minHeight: 0,
        overflowY: "auto",
        padding: "12px 12px 8px",
        background: SURFACE.alt,
        WebkitOverflowScrolling: "touch",
      }}>
        {loading && messages.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: TOKENS.muted, ...TYPE.small }}>Loading…</div>
        )}
        {!loading && messages.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", color: TOKENS.muted, ...TYPE.small }}>
            No messages yet — say hi.
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.sender_id === currentPersonId;
          const prev = messages[i - 1];
          const showSender = !mine && (!prev || prev.sender_id !== m.sender_id);
          return <Bubble key={m.id} msg={m} mine={mine} showSender={showSender} />;
        })}
      </div>

      {/* Input */}
      <div style={{
        flex: "0 0 auto",
        padding: "8px 10px 10px",
        background: SURFACE.elevated,
        borderTop: `1px solid ${TOKENS.rule}`,
        display: "flex", alignItems: "flex-end", gap: 8,
      }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Message"
          rows={1}
          style={{
            flex: 1, resize: "none",
            padding: "10px 12px",
            border: `1px solid ${TOKENS.rule}`,
            borderRadius: 18,
            background: SURFACE.alt, color: INK,
            ...TYPE.body, fontFamily: "inherit",
            outline: "none", maxHeight: 96,
          }}
        />
        <button
          onClick={send}
          disabled={!draft.trim() || sending}
          aria-label="Send"
          style={{
            width: 40, height: 40, borderRadius: 20,
            background: ACCENT, color: "#FFFFFF",
            border: "none",
            cursor: !draft.trim() || sending ? "not-allowed" : "pointer",
            opacity: !draft.trim() || sending ? 0.5 : 1,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        ><Ic.send size={16} /></button>
      </div>
    </div>
  );
}

function Bubble({ msg, mine, showSender }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start", marginBottom: 6 }}>
      {showSender && (
        <div style={{ ...TYPE.caption, color: TOKENS.muted, marginBottom: 2, padding: "0 12px" }}>
          {msg.sender?.display_name || "Unknown"}
        </div>
      )}
      <div style={{
        maxWidth: "78%",
        padding: "8px 12px",
        borderRadius: 16,
        background: mine ? ACCENT : SURFACE.elevated,
        color: mine ? "#FFFFFF" : INK,
        border: mine ? "none" : `1px solid ${TOKENS.rule}`,
        ...TYPE.body, lineHeight: "20px",
        whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>{msg.message}</div>
      <div style={{ ...TYPE.caption, color: TOKENS.muted, marginTop: 2, padding: "0 12px" }}>
        {fmtRelative(msg.created_at)}{msg.edited_at ? " · edited" : ""}
      </div>
    </div>
  );
}
