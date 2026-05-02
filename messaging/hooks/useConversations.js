// useConversations — list of conversations for a user, with last-message
// previews and unread counts derived from conversation_read_cursors.
//
// Swap-outs (search this file):
//   - `members(id, member_code, rank, first_name)` — the embedded select
//     against the user table. Replace `members` with your user table's
//     name and the projected fields with whatever your UI needs to render
//     a participant chip (e.g. id, display_name, avatar_url).

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase-client'
import { sq } from '../lib/query'

export function useConversations(memberId) {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (memberId) load() }, [memberId])

  async function load() {
    setLoading(true)
    const parts = await sq(() => supabase.from('conversation_participants')
      .select('conversation_id').eq('member_id', memberId))
    const convoIds = parts.map(p => p.conversation_id)
    if (convoIds.length === 0) { setConversations([]); setLoading(false); return }

    const [convos, allParts, lastMsgs, cursors] = await Promise.all([
      sq(() => supabase.from('conversations').select('*').in('id', convoIds).order('updated_at', { ascending: false })),
      sq(() => supabase.from('conversation_participants').select('conversation_id, member_id, role, member:members(id, member_code, rank, first_name)').in('conversation_id', convoIds)),
      sq(() => supabase.from('conversation_messages').select('id, conversation_id, sender_id, message, created_at').in('conversation_id', convoIds).order('created_at', { ascending: false }).limit(200)),
      sq(() => supabase.from('conversation_read_cursors').select('conversation_id, last_read_at').eq('member_id', memberId)),
    ])

    const cursorMap = {}
    cursors.forEach(c => { cursorMap[c.conversation_id] = c.last_read_at })

    const partsByConvo = {}
    allParts.forEach(p => {
      if (!partsByConvo[p.conversation_id]) partsByConvo[p.conversation_id] = []
      partsByConvo[p.conversation_id].push(p)
    })

    const lastMsgMap = {}
    lastMsgs.forEach(m => { if (!lastMsgMap[m.conversation_id]) lastMsgMap[m.conversation_id] = m })

    const unreadCounts = {}
    lastMsgs.forEach(m => {
      const cursor = cursorMap[m.conversation_id]
      if (!cursor || new Date(m.created_at) > new Date(cursor)) {
        if (m.sender_id !== memberId) {
          unreadCounts[m.conversation_id] = (unreadCounts[m.conversation_id] || 0) + 1
        }
      }
    })

    const result = convos.map(c => ({
      ...c,
      participants: (partsByConvo[c.id] || []).map(p => p.member).filter(Boolean),
      lastMessage: lastMsgMap[c.id] || null,
      unread: unreadCounts[c.id] || 0,
      displayName: c.name || (partsByConvo[c.id] || [])
        .filter(p => p.member_id !== memberId)
        .map(p => p.member?.first_name ? `${p.member.first_name}` : p.member?.member_code || '?')
        .join(', ') || 'New conversation',
    }))

    setConversations(result)
    setLoading(false)
  }

  return { conversations, loading, reload: load, setConversations }
}
