// useConvoMessages — load + send + edit messages for one conversation,
// with realtime subscription on conversation_messages keyed by
// conversation_id, and automatic read-cursor updates.
//
// Swap-outs:
//   - `members!conversation_messages_sender_id_fkey(id, member_code, rank, first_name)`
//     — the embedded select projects the sender's display fields. Replace
//     `members` with your user table and adjust the fields.
//   - `'halo:dm-read'` — the CustomEvent name dispatched when read state
//     changes, used by the host's sidebar badge. Rename if you want a
//     non-HALO event name.

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase-client';
import { sq } from '../lib/query';

export function useConvoMessages(conversationId, memberId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    load();
  }, [conversationId]);

  async function load() {
    setLoading(true);
    const data = await sq(() => supabase.from('conversation_messages')
      .select('*, sender:members!conversation_messages_sender_id_fkey(id, member_code, rank, first_name)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(200));
    setMessages(data);
    setLoading(false);

    // Update read cursor and notify sidebar badge
    if (memberId) {
      // Count unread (messages from others after current cursor)
      const cursorRes = await sq(() => supabase.from('conversation_read_cursors')
        .select('last_read_at').eq('conversation_id', conversationId).eq('member_id', memberId));
      const oldCursor = cursorRes[0]?.last_read_at;
      const unreadCount = data.filter(m => m.sender_id !== memberId && (!oldCursor || new Date(m.created_at) > new Date(oldCursor))).length;

      await supabase.from('conversation_read_cursors').upsert({
        conversation_id: conversationId, member_id: memberId, last_read_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id,member_id' });

      if (unreadCount > 0) {
        window.dispatchEvent(new CustomEvent('halo:dm-read', { detail: { count: unreadCount } }));
      }
    }
  }

  // Real-time subscription
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`convo-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'conversation_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, async (payload) => {
        if (payload.new.sender_id !== memberId) {
          const { data: sender } = await supabase.from('members')
            .select('id, member_code, rank, first_name')
            .eq('id', payload.new.sender_id).single();
          setMessages(prev => [...prev, { ...payload.new, sender }]);
        }
        // Update cursor on new message viewed — tell sidebar badge
        if (memberId) {
          await supabase.from('conversation_read_cursors').upsert({
            conversation_id: conversationId, member_id: memberId, last_read_at: new Date().toISOString(),
          }, { onConflict: 'conversation_id,member_id' });
          if (payload.new.sender_id !== memberId) {
            window.dispatchEvent(new CustomEvent('halo:dm-read', { detail: { count: 1 } }));
          }
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'conversation_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, message: payload.new.message, edited_at: payload.new.edited_at } : m));
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'conversation_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        setMessages(prev => prev.filter(m => m.id !== payload.old.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, memberId]);

  async function sendMessage(text, expiresAt = null) {
    const { data, error } = await supabase.from('conversation_messages').insert({
      conversation_id: conversationId, sender_id: memberId, message: text.trim(),
      expires_at: expiresAt,
    }).select('*, sender:members!conversation_messages_sender_id_fkey(id, member_code, rank, first_name)').single();
    if (error) throw new Error(error.message || 'Failed to send message');
    if (data) setMessages(prev => [...prev, data]);
    // Update conversation timestamp
    await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
    return data;
  }

  async function sendFileMessage(fileUrl, fileName, fileSize, mimeType, caption = '', expiresAt = null) {
    const { data, error } = await supabase.from('conversation_messages').insert({
      conversation_id: conversationId, sender_id: memberId,
      message: caption || fileName,
      file_url: fileUrl, file_name: fileName, file_size: fileSize, mime_type: mimeType,
      expires_at: expiresAt,
    }).select('*, sender:members!conversation_messages_sender_id_fkey(id, member_code, rank, first_name)').single();
    if (error) throw new Error(error.message || 'Failed to send file');
    if (data) setMessages(prev => [...prev, data]);
    await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
    return data;
  }

  async function editMessage(msgId, newText) {
    const { error } = await supabase.from('conversation_messages')
      .update({ message: newText.trim(), edited_at: new Date().toISOString() })
      .eq('id', msgId).eq('sender_id', memberId);
    if (error) throw new Error(error.message || 'Failed to edit message');
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, message: newText.trim(), edited_at: new Date().toISOString() } : m));
  }

  return { messages, loading, sendMessage, sendFileMessage, editMessage, setMessages };
}
