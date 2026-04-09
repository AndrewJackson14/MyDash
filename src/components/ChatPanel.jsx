// ============================================================
// ChatPanel.jsx — Reusable messaging component
// Used in Ad Projects, Sales, Stories, and global Messaging page
// ============================================================
import { useState, useEffect, useRef, memo } from "react";
import { Z, FS, FW, Ri, R, COND } from "../lib/theme";
import { Ic } from "./ui";
import { supabase } from "../lib/supabase";

const fmtTime = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  const now = new Date();
  const diff = now - dt;
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000 && dt.getDate() === now.getDate()) return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (diff < 172800000) return "Yesterday " + dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

const ChatPanel = memo(({ threadId, currentUser, height = 400, placeholder = "Type a message...", onNewMessage }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const didLoad = useRef(false);

  // Load messages
  useEffect(() => {
    if (!threadId) return;
    didLoad.current = false;
    (async () => {
      const { data } = await supabase.from("messages").select("*")
        .eq("thread_id", threadId).order("created_at", { ascending: true });
      setMessages(data || []);
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

  // Send message
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
    }
    setSending(false);
  };

  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

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
              <div style={{ fontSize: FS.sm, color: isSys ? Z.tm : Z.tx, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{m.body}</div>
              <div style={{ fontSize: 10, color: Z.td, marginTop: 2, textAlign: isMe ? "right" : "left" }}>{fmtTime(m.created_at)}</div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 6, padding: "8px 10px", borderTop: `1px solid ${Z.bd}`, background: Z.sf }}>
        <input
          value={input} onChange={(e) => setInput(e.target.value)}
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
