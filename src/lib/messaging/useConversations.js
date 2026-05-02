// useConversations — list of conversations for a user with last-message
// previews and unread counts. Ported from /messaging/hooks/useConversations.js
// with HALO's `members` table swapped for MyDash's `people` and the
// projected fields adjusted (display_name, slug, avatar_url instead of
// member_code / rank / first_name).

import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { sq } from "./sq";

const PARTICIPANT_PROJECTION =
  "conversation_id, member_id, role, " +
  "member:people!conversation_participants_member_id_fkey(id, display_name, slug, avatar_url, role)";

export function useConversations(personId) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (personId) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [personId]);

  async function load() {
    setLoading(true);
    const parts = await sq(() => supabase.from("conversation_participants")
      .select("conversation_id").eq("member_id", personId));
    const convoIds = parts.map(p => p.conversation_id);
    if (convoIds.length === 0) { setConversations([]); setLoading(false); return; }

    const [convos, allParts, lastMsgs, cursors] = await Promise.all([
      sq(() => supabase.from("conversations").select("*").in("id", convoIds).order("updated_at", { ascending: false })),
      sq(() => supabase.from("conversation_participants").select(PARTICIPANT_PROJECTION).in("conversation_id", convoIds)),
      sq(() => supabase.from("conversation_messages").select("id, conversation_id, sender_id, message, created_at").in("conversation_id", convoIds).order("created_at", { ascending: false }).limit(200)),
      sq(() => supabase.from("conversation_read_cursors").select("conversation_id, last_read_at").eq("member_id", personId)),
    ]);

    const cursorMap = {};
    cursors.forEach(c => { cursorMap[c.conversation_id] = c.last_read_at; });

    const partsByConvo = {};
    allParts.forEach(p => {
      if (!partsByConvo[p.conversation_id]) partsByConvo[p.conversation_id] = [];
      partsByConvo[p.conversation_id].push(p);
    });

    const lastMsgMap = {};
    lastMsgs.forEach(m => { if (!lastMsgMap[m.conversation_id]) lastMsgMap[m.conversation_id] = m; });

    const unreadCounts = {};
    lastMsgs.forEach(m => {
      const cursor = cursorMap[m.conversation_id];
      if (!cursor || new Date(m.created_at) > new Date(cursor)) {
        if (m.sender_id !== personId) {
          unreadCounts[m.conversation_id] = (unreadCounts[m.conversation_id] || 0) + 1;
        }
      }
    });

    const result = convos.map(c => ({
      ...c,
      participants: (partsByConvo[c.id] || []).map(p => p.member).filter(Boolean),
      lastMessage:  lastMsgMap[c.id] || null,
      unread:       unreadCounts[c.id] || 0,
      // For groups/rooms use the conversation's name; for dms join
      // the other participants' display_name.
      displayName: c.name || (partsByConvo[c.id] || [])
        .filter(p => p.member_id !== personId)
        .map(p => p.member?.display_name || "?")
        .join(", ") || "New conversation",
    }));

    setConversations(result);
    setLoading(false);
  }

  return { conversations, loading, reload: load, setConversations };
}
