// ============================================================
// ChatPanel.jsx — Reusable messaging component
// Used in Ad Projects, Sales, Stories, and global Messaging page
// ============================================================
import { useState, useEffect, useRef, memo } from "react";
import { Z, FS, FW, Ri, R, COND } from "../lib/theme";
import { Ic } from "./ui";
import { supabase } from "../lib/supabase";

import { fmtTimeRelative as fmtTime } from "../lib/formatters";
import { tokenizeMessage, activeMentionAtCaret, insertMention, parseMentions } from "../lib/mentions";

const ChatPanel = memo(({ threadId, currentUser, team, height = 400, placeholder = "Type a message...", onNewMessage, emailContext }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const didLoad = useRef(false);
  // @-mention picker state — { query, start, end } when user is typing
  // an @token, null otherwise. Rendered as an absolute-positioned
  // dropdown above the composer.
  const [mention, setMention] = useState(null);
  const [mentionIdx, setMentionIdx] = useState(0);

  const mentionMatches = (team || [])
    .filter(t => t.isActive !== false && !t.isHidden && !t.is_hidden && t.id !== currentUser?.id)
    .filter(t => !mention?.query || (t.name || "").toLowerCase().includes(mention.query.toLowerCase()))
    .slice(0, 6);

  const applyMention = (member) => {
    if (!mention || !member) return;
    const { text, nextCaret } = insertMention(input, mention, member);
    setInput(text);
    setMention(null);
    setMentionIdx(0);
    // Put the caret right after the inserted token + trailing space.
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(nextCaret, nextCaret);
      }
    }, 0);
  };

  // Load messages
  useEffect(() => {
    if (!threadId) return;
    didLoad.current = false;
    (async () => {
      // Cap at 200 most-recent messages, then reverse for ascending
      // render. Prevents unbounded fetches on long threads.
      const { data } = await supabase.from("messages").select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(200);
      setMessages((data || []).reverse());
      didLoad.current = true;
    })();
  }, [threadId]);

  // Realtime subscription
  useEffect(() => {
    if (!threadId) return;
    const channel = supabase.channel(`msgs-${threadId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          setMessages(prev => {
            if (prev.some(m => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [threadId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current && didLoad.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Send message — also fires a notification row per @-tagged user
  // so they see the bell badge without having to open the thread.
  const send = async () => {
    if (!input.trim() || sending || !threadId) return;
    setSending(true);
    const body = input.trim();
    setInput("");
    const { data: msg } = await supabase.from("messages").insert({
      thread_id: threadId, sender_id: currentUser?.id || null,
      sender_name: currentUser?.name || "Unknown", body,
    }).select().single();
    if (msg) {
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      onNewMessage?.(msg);
      // Fire-and-forget mention notifications. De-dup + skip self.
      const mentioned = Array.from(new Set(parseMentions(body).map(m => m.id)))
        .filter(id => id && id !== currentUser?.id);
      if (mentioned.length) {
        const preview = body.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1").slice(0, 120);
        const rows = mentioned.map(uid => ({
          user_id: uid,
          title: `${currentUser?.name || "Someone"} mentioned you`,
          detail: preview,
          type: "mention",
          link: emailContext?.contextUrl || "",
        }));
        supabase.from("notifications").insert(rows).then(() => {}).catch(() => {});

        // Email side — fire-and-forget. Silent failure if SES env is
        // missing (edge function returns 200 { skipped: true }); in-app
        // bell badge still works regardless.
        supabase.functions.invoke("notify-mention", {
          body: {
            mentionedUserIds: mentioned,
            senderName: currentUser?.name || "Someone",
            body,
            contextLabel: emailContext?.contextLabel || "a discussion",
            contextUrl: emailContext?.contextUrl || "",
          },
        }).then(() => {}).catch(() => {});
      }
    }
    setSending(false);
  };

  const handleKey = (e) => {
    // Mention picker navigation takes precedence when open.
    if (mention && mentionMatches.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx(i => (i + 1) % mentionMatches.length); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setMentionIdx(i => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applyMention(mentionMatches[mentionIdx]); return; }
      if (e.key === "Escape") { e.preventDefault(); setMention(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // Track input + caret so we can detect a pending @token.
  const onInputChange = (e) => {
    const next = e.target.value;
    setInput(next);
    const caret = e.target.selectionStart ?? next.length;
    const m = activeMentionAtCaret(next, caret);
    setMention(m);
    setMentionIdx(0);
  };

  if (!threadId) return <div style={{ padding: 20, color: Z.td, fontSize: FS.sm, textAlign: "center" }}>No conversation</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height, borderRadius: Ri, overflow: "hidden" }}>
      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        {messages.length === 0 && <div style={{ padding: 20, textAlign: "center", color: Z.td, fontSize: FS.sm }}>No messages yet</div>}
        {messages.map(m => {
          const isMe = m.sender_id === currentUser?.id;
          const isSys = m.is_system;
          return (
            <div key={m.id} style={{
              padding: "6px 10px", borderRadius: Ri, maxWidth: isSys ? "100%" : "85%",
              alignSelf: isSys ? "center" : isMe ? "flex-end" : "flex-start",
              background: isSys ? Z.sa : isMe ? Z.ac + "12" : Z.bg,
              border: isSys ? "none" : `1px solid ${isMe ? Z.ac + "25" : Z.bd}`,
            }}>
              {!isSys && !isMe && <div style={{ fontSize: 11, fontWeight: FW.bold, color: Z.ac, marginBottom: 2 }}>{m.sender_name}</div>}
              {isSys && <div style={{ fontSize: 10, fontWeight: FW.bold, color: Z.td, marginBottom: 2 }}>SYSTEM</div>}
              <div style={{ fontSize: FS.sm, color: isSys ? Z.tm : Z.tx, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
                {tokenizeMessage(m.body || "").map((seg, i) => seg.type === "mention"
                  ? <span key={i} style={{ display: "inline-block", padding: "0 5px", margin: "0 1px", borderRadius: 3, background: "rgba(59,130,246,0.18)", color: "#3b82f6", fontWeight: FW.bold }}>@{seg.name}</span>
                  : <span key={i}>{seg.value}</span>
                )}
              </div>
              <div style={{ fontSize: 10, color: Z.td, marginTop: 2, textAlign: isMe ? "right" : "left" }}>{fmtTime(m.created_at)}</div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div style={{ position: "relative", display: "flex", gap: 6, padding: "8px 10px", borderTop: `1px solid ${Z.bd}`, background: Z.sf }}>
        {/* Mention picker — shown when the user is typing an @token. */}
        {mention && mentionMatches.length > 0 && (
          <div style={{ position: "absolute", left: 10, right: 50, bottom: "100%", marginBottom: 4, background: Z.sf, border: `1px solid ${Z.bd}`, borderRadius: Ri, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", overflow: "hidden", zIndex: 40 }}>
            {mentionMatches.map((m, i) => {
              const active = i === mentionIdx;
              return (
                <div
                  key={m.id}
                  onMouseDown={(e) => { e.preventDefault(); applyMention(m); }}
                  onMouseEnter={() => setMentionIdx(i)}
                  style={{ padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: active ? Z.ac + "18" : "transparent" }}
                >
                  <span style={{ fontSize: 11, fontWeight: FW.black, color: Z.tx }}>{m.name}</span>
                  {m.role && <span style={{ fontSize: 10, color: Z.tm }}>{m.role}</span>}
                </div>
              );
            })}
          </div>
        )}
        <input
          ref={inputRef}
          value={input} onChange={onInputChange}
          onKeyUp={(e) => { const m = activeMentionAtCaret(e.target.value, e.target.selectionStart ?? 0); setMention(m); }}
          onKeyDown={handleKey}
          placeholder={placeholder}
          style={{ flex: 1, padding: "8px 12px", borderRadius: 20, border: `1px solid ${Z.bd}`, background: Z.bg, color: Z.tx, fontSize: FS.sm, outline: "none", fontFamily: "inherit" }}
        />
        <button onClick={send} disabled={!input.trim() || sending} style={{
          width: 34, height: 34, borderRadius: "50%", border: "none", cursor: input.trim() ? "pointer" : "default",
          background: input.trim() ? Z.ac : Z.sa, display: "flex", alignItems: "center", justifyContent: "center",
          opacity: input.trim() ? 1 : 0.4, transition: "background 0.15s",
        }}>
          <Ic.send size={14} color={input.trim() ? "#fff" : Z.td} />
        </button>
      </div>
    </div>
  );
});

ChatPanel.displayName = "ChatPanel";
export default ChatPanel;
