// useConvoMessages — load + send + edit messages for one conversation
// with realtime subscription on conversation_messages keyed by
// conversation_id, plus automatic read-cursor updates. Ported from
// /messaging/hooks/useConvoMessages.js with `members` swapped for
// `people` (display_name / slug / avatar_url) and the CustomEvent
// renamed from `halo:dm-read` to `mydash:dm-read`.

import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { sq } from "./sq";

const SENDER_PROJECTION =
  "*, sender:people!conversation_messages_sender_id_fkey(id, display_name, slug, avatar_url, role)";

const SENDER_FIELDS = "id, display_name, slug, avatar_url, role";

export function useConvoMessages(conversationId, personId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    load();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [conversationId]);

  async function load() {
    setLoading(true);
    const data = await sq(() => supabase.from("conversation_messages")
      .select(SENDER_PROJECTION)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200));
    setMessages(data);
    setLoading(false);

    // Update read cursor and notify any sidebar/badge listeners.
    if (personId) {
      const cursorRes = await sq(() => supabase.from("conversation_read_cursors")
        .select("last_read_at").eq("conversation_id", conversationId).eq("member_id", personId));
      const oldCursor = cursorRes[0]?.last_read_at;
      const unreadCount = data.filter(m => m.sender_id !== personId && (!oldCursor || new Date(m.created_at) > new Date(oldCursor))).length;

      await supabase.from("conversation_read_cursors").upsert({
        conversation_id: conversationId, member_id: personId, last_read_at: new Date().toISOString(),
      }, { onConflict: "conversation_id,member_id" });

      if (unreadCount > 0) {
        window.dispatchEvent(new CustomEvent("mydash:dm-read", { detail: { count: unreadCount } }));
      }
    }
  }

  // Realtime subscription: INSERT/UPDATE/DELETE on conversation_messages
  // filtered by this conversation_id.
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`convo-${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "conversation_messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, async (payload) => {
        if (payload.new.sender_id !== personId) {
          const { data: sender } = await supabase.from("people")
            .select(SENDER_FIELDS)
            .eq("id", payload.new.sender_id).single();
          setMessages(prev => [...prev, { ...payload.new, sender }]);
        }
        if (personId) {
          await supabase.from("conversation_read_cursors").upsert({
            conversation_id: conversationId, member_id: personId, last_read_at: new Date().toISOString(),
          }, { onConflict: "conversation_id,member_id" });
          if (payload.new.sender_id !== personId) {
            window.dispatchEvent(new CustomEvent("mydash:dm-read", { detail: { count: 1 } }));
          }
        }
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "conversation_messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, message: payload.new.message, edited_at: payload.new.edited_at } : m));
      })
      .on("postgres_changes", {
        event: "DELETE", schema: "public", table: "conversation_messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        setMessages(prev => prev.filter(m => m.id !== payload.old.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, personId]);

  async function sendMessage(text, expiresAt = null) {
    const trimmed = text?.trim();
    if (!trimmed) return null;
    const { data, error } = await supabase.from("conversation_messages").insert({
      conversation_id: conversationId, sender_id: personId, message: trimmed, expires_at: expiresAt,
    }).select(SENDER_PROJECTION).single();
    if (error) throw new Error(error.message || "Failed to send message");
    if (data) setMessages(prev => [...prev, data]);
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
    return data;
  }

  async function sendFileMessage(fileUrl, fileName, fileSize, mimeType, caption = "", expiresAt = null) {
    const { data, error } = await supabase.from("conversation_messages").insert({
      conversation_id: conversationId, sender_id: personId,
      message: caption || fileName,
      file_url: fileUrl, file_name: fileName, file_size: fileSize, mime_type: mimeType,
      expires_at: expiresAt,
    }).select(SENDER_PROJECTION).single();
    if (error) throw new Error(error.message || "Failed to send file");
    if (data) setMessages(prev => [...prev, data]);
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
    return data;
  }

  async function editMessage(msgId, newText) {
    const trimmed = newText?.trim();
    if (!trimmed) return;
    const { error } = await supabase.from("conversation_messages")
      .update({ message: trimmed, edited_at: new Date().toISOString() })
      .eq("id", msgId).eq("sender_id", personId);
    if (error) throw new Error(error.message || "Failed to edit message");
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, message: trimmed, edited_at: new Date().toISOString() } : m));
  }

  return { messages, loading, sendMessage, sendFileMessage, editMessage, setMessages };
}
