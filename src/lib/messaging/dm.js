// findDM / getOrCreateDM — 1:1 conversation lookup with lazy creation.
// Ported from /messaging/lib/dm.js. Both ids are people.id (not auth
// user ids); the caller is responsible for resolving auth.uid() →
// people.id (typically via currentUser.id from useAuth's teamMember).

import { supabase } from "../supabase";

export async function findDM(currentPersonId, otherPersonId) {
  if (!currentPersonId || !otherPersonId || currentPersonId === otherPersonId) return null;
  const { data: mine } = await supabase
    .from("conversation_participants")
    .select("conversation_id, conversation:conversations!inner(type)")
    .eq("member_id", currentPersonId);
  const dmIds = (mine || []).filter(p => p.conversation?.type === "dm").map(p => p.conversation_id);
  if (dmIds.length === 0) return null;
  const { data: theirs } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("member_id", otherPersonId)
    .in("conversation_id", dmIds);
  return theirs?.[0]?.conversation_id || null;
}

export async function getOrCreateDM(currentPersonId, otherPersonId) {
  const existing = await findDM(currentPersonId, otherPersonId);
  if (existing) return existing;
  const { data: convo, error: cErr } = await supabase
    .from("conversations")
    .insert({ type: "dm", created_by: currentPersonId })
    .select("id")
    .single();
  if (cErr || !convo) throw cErr || new Error("Failed to create conversation");
  const { error: pErr } = await supabase
    .from("conversation_participants")
    .insert([
      { conversation_id: convo.id, member_id: currentPersonId, role: "member" },
      { conversation_id: convo.id, member_id: otherPersonId,   role: "member" },
    ]);
  if (pErr) throw pErr;
  return convo.id;
}
