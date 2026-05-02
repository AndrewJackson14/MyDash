// findDM / getOrCreateDM — 1:1 conversation lookup with lazy creation.
// Generic; no swap-outs needed beyond the supabase client import.

import { supabase } from './supabase-client';

// Find an existing 1:1 dm conversation between two members. Returns the
// conversation id or null. Does NOT create a conversation.
export async function findDM(currentUserId, otherMemberId) {
  if (!currentUserId || !otherMemberId || currentUserId === otherMemberId) return null;
  const { data: mine } = await supabase
    .from('conversation_participants')
    .select('conversation_id, conversation:conversations!inner(type)')
    .eq('member_id', currentUserId);
  const dmIds = (mine || []).filter(p => p.conversation?.type === 'dm').map(p => p.conversation_id);
  if (dmIds.length === 0) return null;
  const { data: theirs } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('member_id', otherMemberId)
    .in('conversation_id', dmIds);
  return theirs?.[0]?.conversation_id || null;
}

// Get or create a 1:1 dm conversation. Returns conversation id.
export async function getOrCreateDM(currentUserId, otherMemberId) {
  const existing = await findDM(currentUserId, otherMemberId);
  if (existing) return existing;
  const { data: convo, error: cErr } = await supabase
    .from('conversations')
    .insert({ type: 'dm', created_by: currentUserId })
    .select('id')
    .single();
  if (cErr || !convo) throw cErr || new Error('Failed to create conversation');
  const { error: pErr } = await supabase
    .from('conversation_participants')
    .insert([
      { conversation_id: convo.id, member_id: currentUserId, role: 'member' },
      { conversation_id: convo.id, member_id: otherMemberId, role: 'member' },
    ]);
  if (pErr) throw pErr;
  return convo.id;
}
